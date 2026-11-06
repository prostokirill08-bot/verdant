"""Ежедневный отчёт владельцу: только факты из БД. Нет продаж — пишем ноль."""
from __future__ import annotations

from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from .agents.finance import all_time, day_bounds, summarize, unit_economics, unregistered_receipts
from .models import AgentRun, Client, ContentPost, Escalation, Event, Lead, Message, Order, Task
from .pricing import rub


def _events(s: Session, kind: str, p) -> int:
    return s.scalar(select(func.count(Event.id)).where(Event.kind == kind, Event.ts >= p.start, Event.ts < p.end)) or 0


def collect(s: Session, day=None) -> dict:
    p = day_bounds(day)
    fin = summarize(s, p)
    total = summarize(s, all_time())
    agents = s.execute(
        select(
            AgentRun.agent,
            func.count(AgentRun.id),
            func.sum(case((AgentRun.status == "error", 1), else_=0)),
            func.avg(AgentRun.duration_ms),
            func.coalesce(func.sum(AgentRun.cost_kop), 0),
        )
        .where(AgentRun.started_at >= p.start, AgentRun.started_at < p.end)
        .group_by(AgentRun.agent)
    ).all()
    return {
        "period": p,
        "new_leads": s.scalar(select(func.count(Lead.id)).where(Lead.created_at >= p.start, Lead.created_at < p.end)) or 0,
        "analyzed_leads": _events(s, "lead_analyzed", p),
        "messages_sent": s.scalar(
            select(func.count(Message.id)).where(Message.direction == "out", Message.status == "sent", Message.kind != "report", Message.sent_at >= p.start, Message.sent_at < p.end)
        )
        or 0,
        "replies": s.scalar(select(func.count(Message.id)).where(Message.direction == "in", Message.created_at >= p.start, Message.created_at < p.end)) or 0,
        "active_negotiations": (s.scalar(select(func.count(Lead.id)).where(Lead.status.in_(["replied", "negotiating"]))) or 0)
        + (s.scalar(select(func.count(Order.id)).where(Order.status.in_(["preview_ready", "awaiting_payment"]))) or 0),
        "offers": _events(s, "preview_ready", p) + _events(s, "payment_link_sent", p),
        "audits": _events(s, "audit_done", p),
        "new_clients_by_source": dict(
            s.execute(select(Client.source, func.count(Client.id)).where(Client.created_at >= p.start, Client.created_at < p.end).group_by(Client.source)).all()
        ),
        "deals": _events(s, "payment_succeeded", p),
        "paid_orders": fin.paid_orders,
        "products_created": _events(s, "product_created", p),
        "results_sent": _events(s, "result_sent", p),
        "fin": fin,
        "total": total,
        "agents": [
            {"agent": a, "runs": n, "errors": int(e or 0), "avg_ms": int(ms or 0), "cost_kop": int(c or 0)} for a, n, e, ms, c in agents
        ],
        "dead_tasks": s.scalar(select(func.count(Task.id)).where(Task.status == "dead", Task.updated_at >= p.start)) or 0,
        "qc_failed": _events(s, "qc_failed", p),
        "open_escalations": list(s.scalars(select(Escalation).where(Escalation.resolved.is_(False)).order_by(Escalation.id.desc()).limit(5))),
        "pending_approvals": (s.scalar(select(func.count(Message.id)).where(Message.status == "pending_approval")) or 0)
        + (s.scalar(select(func.count(ContentPost.id)).where(ContentPost.status == "pending_approval")) or 0),
        "receipts_todo": len(unregistered_receipts(s)),
        "ue": unit_economics(s),
    }


def render_text(d: dict, plan: list[str]) -> str:
    f, t = d["fin"], d["total"]
    date = (d["period"].start).strftime("%d.%m.%Y")
    lines = [
        f"📊 Отчёт за {date} (МСК)",
        "",
        "ПРОДАЖИ",
        f"1. Новых лидов найдено: {d['new_leads']}; новых клиентов в боте/на сайте: {sum(d['new_clients_by_source'].values())}"
        + (" (" + ", ".join(f"{k or '—'}: {v}" for k, v in d["new_clients_by_source"].items()) + ")" if d["new_clients_by_source"] else ""),
        f"2. Лидов проанализировано: {d['analyzed_leads']}",
        f"3. Сообщений отправлено: {d['messages_sent']}",
        f"4. Ответов получено: {d['replies']}",
        f"5. Активных переговоров: {d['active_negotiations']}",
        f"6. Коммерческих предложений (превью + ссылки на оплату): {d['offers']}; бесплатных разборов карточек: {d['audits']}",
        f"7. Сделок заключено: {d['deals']}",
        f"8. Оплаченных заказов: {d['paid_orders']}",
        "",
        "ПРОИЗВОДСТВО",
        f"9. Создано продуктов: {d['products_created']}",
        f"10. Отправлено результатов: {d['results_sent']}",
        "",
        "ФИНАНСЫ (только подтверждённые оплаты)",
        f"11. Выручка за день: {rub(f.revenue_kop)}",
        f"12. Расходы за день: {rub(f.expenses_kop)} (эквайринг {rub(f.fees_kop)}, AI {rub(f.ai_kop)}, прочее {rub(f.infra_kop + f.ads_kop + f.other_kop)}) + резерв НПД {rub(f.tax_kop)}",
        f"13. Чистая прибыль за день: {rub(f.net_kop)}",
        f"14. Чистая прибыль за всё время: {rub(t.net_kop)} (выручка {rub(t.revenue_kop)}, расходы {rub(t.expenses_kop)}, НПД {rub(t.tax_kop)})",
        "",
        "15. Каналы (за всё время):",
    ]
    if t.by_channel:
        for ch, v in sorted(t.by_channel.items(), key=lambda kv: -kv[1]["revenue_kop"]):
            cac = f", CAC {rub(v['cac_kop'])}" if v.get("cac_kop") else ""
            lines.append(f"   • {ch}: заказов {v['orders']}, выручка {rub(v['revenue_kop'])}{cac}")
    else:
        lines.append("   • оплат пока нет")
    lines.append("")
    lines.append("16. AI-агенты за день:")
    if d["agents"]:
        for a in d["agents"]:
            lines.append(f"   • {a['agent']}: запусков {a['runs']}, ошибок {a['errors']}, ср. время {a['avg_ms'] / 1000:.1f} с, затраты {rub(a['cost_kop'])}")
    else:
        lines.append("   • запусков не было")
    lines += ["", "17. Ошибки и проблемы:"]
    problems = []
    if d["dead_tasks"]:
        problems.append(f"   • задач не выполнено после всех повторов: {d['dead_tasks']}")
    if d["qc_failed"]:
        problems.append(f"   • не прошли контроль качества: {d['qc_failed']}")
    for e in d["open_escalations"]:
        problems.append(f"   • [{e.severity}] {e.title}")
    if d["pending_approvals"]:
        problems.append(f"   • ждут вашего одобрения: {d['pending_approvals']} (сообщения/посты)")
    if d["receipts_todo"]:
        problems.append(f"   • чеков к регистрации в «Мой налог»: {d['receipts_todo']}")
    ue = d["ue"]
    if ue["npd_limit_used"] >= 0.8:
        problems.append(f"   • использовано {ue['npd_limit_used']:.0%} годового лимита НПД (2,4 млн ₽)")
    lines += problems or ["   • нет"]
    lines += ["", "18. План на завтра:"] + [f"   • {p}" for p in plan]
    return "\n".join(lines)
