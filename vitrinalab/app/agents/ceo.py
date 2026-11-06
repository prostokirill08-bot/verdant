"""CEO Agent: следит за операционкой, распределяет повторные попытки, эскалирует, пишет отчёт.

Решения о деньгах, возвратах, ценах и доступах CEO-агент не принимает — только владелец.
"""
from __future__ import annotations

from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..events import escalate, record
from ..integrations import telegram
from ..models import Escalation, Message, Order, Task, utcnow
from ..queue import enqueue, handler
from ..reports import collect, render_text
from .base import agent_run, ai_spent_today_kop, ask_llm


def _open_escalation(s: Session, entity: str, entity_id: int, title_prefix: str) -> bool:
    return bool(
        s.scalar(
            select(Escalation.id).where(
                Escalation.entity == entity, Escalation.entity_id == entity_id, Escalation.resolved.is_(False), Escalation.title.startswith(title_prefix)
            )
        )
    )


@handler("ops_review")
def ops_review(s: Session, payload: dict, task: Task) -> None:
    now = utcnow()
    cfg = get_settings()
    actions = []
    with agent_run(s, "ceo", "ops_review", task.id) as run:
        # 1. оплачен, но производство не стартовало за 30 минут → перезапуск
        for o in s.scalars(select(Order).where(Order.status == "paid", Order.paid_at < now - timedelta(minutes=30))):
            enqueue(s, "produce_order", {"order_id": o.id}, idempotency_key=f"produce_order:{o.id}:retry:{now:%Y%m%d%H}")
            actions.append(f"перезапуск производства #{o.id}")
        # 2. в производстве дольше 6 часов → человеку
        for o in s.scalars(select(Order).where(Order.status.in_(["in_production", "revision"]), Order.updated_at < now - timedelta(hours=6))):
            if not _open_escalation(s, "order", o.id, "Заказ завис"):
                escalate(s, "ceo", f"Заказ завис в производстве: #{o.id}", "Больше 6 часов без результата", "critical", "order", o.id)
                actions.append(f"эскалация #{o.id}")
        # 3. дедлайн 24 часа под угрозой
        for o in s.scalars(select(Order).where(Order.status.in_(["paid", "in_production", "revision", "needs_human"]), Order.paid_at < now - timedelta(hours=18))):
            if not _open_escalation(s, "order", o.id, "Риск срыва срока"):
                escalate(s, "ceo", f"Риск срыва срока 24 ч: заказ #{o.id}", f"Статус: {o.status}", "critical", "order", o.id)
        # 4. одно напоминание тем, кто получил превью/ссылку и молчит сутки (диалог начал сам клиент)
        for o in s.scalars(select(Order).where(Order.status.in_(["preview_ready", "awaiting_payment"]), Order.updated_at < now - timedelta(hours=24))):
            c = o.client
            if c.telegram_chat_id and not (c.state or {}).get(f"reminded_{o.id}") and telegram.enabled():
                text = "Напоминаю про превью вашей карточки 🙂 Если остались вопросы по тарифам или срокам — напишите, отвечу. Если неактуально — просто проигнорируйте это сообщение."
                try:
                    telegram.send_message(c.telegram_chat_id, text)
                    s.add(Message(client_id=c.id, channel="telegram", direction="out", text=text, status="sent", agent="sales", kind="followup", sent_at=now))
                    c.state = {**(c.state or {}), f"reminded_{o.id}": True}
                    actions.append(f"напоминание клиенту #{c.id}")
                except telegram.TelegramError:
                    pass
        # 5. бюджет AI
        spent = ai_spent_today_kop(s)
        if spent >= cfg.daily_ai_budget_rub * 80:
            if not _open_escalation(s, "budget", 0, "Расход AI"):
                escalate(s, "ceo", f"Расход AI за день — {spent / 100:.0f} ₽ из {cfg.daily_ai_budget_rub} ₽", "При превышении агенты переходят на запасные алгоритмы.", "warn", "budget", 0)
        run.row.summary = "; ".join(actions) or "без замечаний"
    if actions:
        record(s, "ops_actions", "ceo", None, actions=actions)


def plan_for_tomorrow(s: Session, run, d: dict) -> list[str]:
    def rule_based() -> list[str]:
        plan = []
        if d["pending_approvals"]:
            plan.append(f"Владельцу: одобрить {d['pending_approvals']} сообщений/постов в админке")
        if d["receipts_todo"]:
            plan.append(f"Владельцу: пробить {d['receipts_todo']} чек(ов) в «Мой налог»")
        if d["open_escalations"]:
            plan.append(f"Разобрать {len(d['open_escalations'])} открытых эскалаций")
        if d["new_leads"] == 0:
            plan.append("Research: пополнить базу лидов (импорт из открытых каталогов, 20+ магазинов)")
        if d["paid_orders"] == 0:
            plan.append("Sales/Marketing: больше бесплатных превью — опубликовать пост, ответить на заявки на биржах")
        plan.append("Production: выполнить все оплаченные заказы в срок 24 ч")
        return plan

    facts = (
        f"Лиды {d['new_leads']}, сообщений {d['messages_sent']}, ответов {d['replies']}, превью/офферы {d['offers']}, "
        f"оплат {d['paid_orders']}, выручка {d['fin'].revenue_kop / 100:.0f} ₽, ждут одобрения {d['pending_approvals']}, "
        f"эскалаций {len(d['open_escalations'])}, чеков к регистрации {d['receipts_todo']}."
    )
    out = ask_llm(
        s,
        run,
        "Ты — операционный директор небольшой AI-студии. По фактам дня составь план на завтра: 3–5 коротких пунктов, "
        "каждый с исполнителем (Research/Sales/Marketing/Production/Владелец). Не выдумывай цифр. Верни JSON-массив строк.",
        facts,
        as_json=True,
        fallback=rule_based,
        validate=lambda x: isinstance(x, list) and 1 <= len(x) <= 7 and all(isinstance(i, str) for i in x),
    )
    return out


@handler("daily_report")
def daily_report(s: Session, payload: dict, task: Task) -> None:
    cfg = get_settings()
    with agent_run(s, "ceo", "daily_report", task.id) as run:
        d = collect(s)
        text = render_text(d, plan_for_tomorrow(s, run, d))
        run.row.summary = text[:500]
    s.add(Message(channel="telegram", direction="out", text=text, status="sent", agent="ceo", kind="report", sent_at=utcnow()))
    record(s, "daily_report", "ceo", None)
    if cfg.telegram_owner_chat_id and telegram.enabled():
        telegram.send_message(cfg.telegram_owner_chat_id, text)
    if cfg.owner_email:
        from ..integrations import mailer

        if mailer.enabled():
            mailer.send(cfg.owner_email, f"{cfg.brand_name}: ежедневный отчёт", text)
