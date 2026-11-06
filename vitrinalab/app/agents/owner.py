"""Управление бизнесом из Telegram — только для чата владельца.

Команды: /stats /orders /approvals /receipts /report /help /cancel
Кнопки: пилот, оплата с биржи, подтверждение СБП, перезапуск, повторная доставка,
одобрение сообщений лидам и постов, отметка о пробитом чеке.
"""
from __future__ import annotations

import re

from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import ops
from ..agents.finance import unregistered_receipts
from ..events import get_setting, owner_chat_id, set_setting
from ..integrations import telegram
from ..models import ContentPost, Lead, Message, Order, Payment
from ..pricing import TARIFFS, rub
from ..queue import enqueue

COMMANDS = {
    "/stats": "Цифры за сегодня и за всё время",
    "/orders": "Последние заказы и действия с ними",
    "/approvals": "Сообщения лидам и посты на одобрение",
    "/receipts": "Оплаты, по которым нужен чек в «Мой налог»",
    "/report": "Прислать ежедневный отчёт сейчас",
    "/help": "Список команд владельца",
}
STATUS = {
    "preview_queued": "⏳ превью готовится", "preview_ready": "👀 превью отправлено", "awaiting_payment": "💳 ждёт оплаты",
    "paid": "✅ оплачен", "in_production": "⚙️ в работе", "revision": "✍️ правки", "ready": "📦 готов",
    "delivered": "🎉 доставлен", "needs_human": "🔴 нужна проверка", "cancelled": "✖️ отменён", "draft": "черновик",
}
UNPAID = ("preview_queued", "preview_ready", "awaiting_payment")
kb = telegram.keyboard


def is_owner(s: Session, chat_id: str) -> bool:
    return bool(chat_id) and chat_id == owner_chat_id(s)


def _say(chat_id: str, text: str, markup: dict | None = None) -> None:
    telegram.send_message(chat_id, text, markup)


# ---------------- уведомления о новых делах на одобрение ----------------


def notify_pending_message(s: Session, m: Message) -> None:
    lead = s.get(Lead, m.lead_id) if m.lead_id else None
    head = f"✉️ Черновик сообщения лиду «{lead.name}» (скор {lead.score})\nКонтакт: {lead.contact or 'не указан'}\n\n" if lead else "✉️ Черновик сообщения\n\n"
    enqueue(s, "notify_owner", {"text": head + m.text, "markup": kb([[("✅ Одобрить", f"oapp:m:{m.id}"), ("❌ Отклонить", f"orej:m:{m.id}")]])})


def notify_pending_post(s: Session, p: ContentPost) -> None:
    enqueue(s, "notify_owner", {"text": f"📝 Пост в канал ({p.topic})\n\n{p.text}", "markup": kb([[("✅ Одобрить", f"oapp:p:{p.id}"), ("❌ Отклонить", f"orej:p:{p.id}")]])})


# ---------------- команды ----------------


def handle_command(s: Session, chat_id: str, text: str) -> bool:
    """True — сообщение обработано как команда/ввод владельца."""
    pending = get_setting(s, "owner_pending")
    cmd = text.split()[0].lower() if text else ""
    if cmd == "/cancel":
        set_setting(s, "owner_pending", "")
        _say(chat_id, "Ок, отменено.")
        return True
    if pending and not cmd.startswith("/"):
        return _pending_input(s, chat_id, pending, text)
    if cmd not in COMMANDS:
        return False
    if cmd == "/help":
        _say(chat_id, "Команды владельца:\n" + "\n".join(f"{c} — {d}" for c, d in COMMANDS.items()) + "\n\nКлиентам эти команды не видны.")
    elif cmd == "/stats":
        _stats(s, chat_id)
    elif cmd == "/orders":
        _orders(s, chat_id)
    elif cmd == "/approvals":
        _approvals(s, chat_id)
    elif cmd == "/receipts":
        _receipts(s, chat_id)
    elif cmd == "/report":
        from ..models import utcnow

        enqueue(s, "daily_report", {}, idempotency_key=f"manual:daily_report:{utcnow():%Y%m%d%H%M%S%f}")
        _say(chat_id, "Готовлю отчёт — придёт через несколько секунд.")
    return True


def _stats(s: Session, chat_id: str) -> None:
    from ..reports import collect

    d = collect(s)
    f, t = d["fin"], d["total"]
    _say(
        chat_id,
        "📊 Сегодня (МСК)\n"
        f"Новых клиентов/лидов: {d['new_leads']} · входящих сообщений: {d['replies']}\n"
        f"Превью и ссылок на оплату: {d['offers']} · оплат: {d['paid_orders']}\n"
        f"Создано комплектов: {d['products_created']} · доставлено: {d['results_sent']}\n"
        f"Выручка: {rub(f.revenue_kop)} · расходы: {rub(f.expenses_kop)} · прибыль: {rub(f.net_kop)}\n\n"
        "📈 За всё время\n"
        f"Оплат: {t.paid_orders} · выручка: {rub(t.revenue_kop)} · чистая прибыль: {rub(t.net_kop)}\n\n"
        f"Ждут одобрения: {d['pending_approvals']} · чеков к пробитию: {d['receipts_todo']} · открытых проблем: {len(d['open_escalations'])}",
    )


def _order_line(o: Order) -> str:
    who = o.client.name or (f"@{o.client.telegram_username}" if o.client.telegram_username else o.client.email) or f"клиент {o.client_id}"
    items = ", ".join(i.product_name for i in o.items)[:60] or "—"
    if any((i.design or {}).get("wishes") or (i.design or {}).get("ref_path") for i in o.items):
        items += " 🎨"
    price = f" · {TARIFFS[o.tariff].name} {rub(o.price_kop)}" if o.tariff in TARIFFS else ""
    return f"№{o.id} {STATUS.get(o.status, o.status)}{price}\n   {who}: {items}"


def _order_buttons(o: Order) -> list[list[tuple[str, str]]]:
    rows: list[list[tuple[str, str]]] = []
    if o.status in UNPAID:
        if any(p.status == "pending" and p.provider == "manual" for p in o.payments):
            rows.append([("✅ СБП-оплата пришла", f"opay:{o.id}")])
        rows.append([("🎁 Пилот бесплатно", f"opilot:{o.id}"), ("💳 Оплачено на бирже", f"oext:{o.id}")])
    if o.status in ("needs_human", "in_production", "revision", "paid"):
        rows.append([("🔁 Перезапустить производство", f"orerun:{o.id}")])
    if o.status == "delivered":
        rows.append([("📦 Отправить результат снова", f"oredeliver:{o.id}")])
    return rows


def _orders(s: Session, chat_id: str) -> None:
    orders = list(s.scalars(select(Order).order_by(Order.id.desc()).limit(10)))
    if not orders:
        _say(chat_id, "Заказов пока нет.")
        return
    _say(chat_id, "🧾 Последние заказы\n\n" + "\n".join(_order_line(o) for o in orders))
    shown = 0
    for o in orders:
        rows = _order_buttons(o)
        if rows and shown < 5:
            _say(chat_id, _order_line(o), kb(rows))
            shown += 1


def _approvals(s: Session, chat_id: str) -> None:
    msgs = list(s.scalars(select(Message).where(Message.status.in_(["pending_approval", "approved"]), Message.kind == "outreach").limit(10)))
    posts = list(s.scalars(select(ContentPost).where(ContentPost.status == "pending_approval").limit(10)))
    if not msgs and not posts:
        _say(chat_id, "Ничего не ждёт одобрения 👍")
        return
    for m in msgs:
        lead = s.get(Lead, m.lead_id) if m.lead_id else None
        name = lead.name if lead else "лид"
        if m.status == "pending_approval":
            _say(chat_id, f"✉️ Лиду «{name}»\n\n{m.text}", kb([[("✅ Одобрить", f"oapp:m:{m.id}"), ("❌ Отклонить", f"orej:m:{m.id}")]]))
        else:
            _say(chat_id, f"📤 Одобрено, отправьте вручную «{name}» ({lead.contact if lead else ''}):\n\n{m.text}", kb([[("📤 Отправил(а)", f"osent:m:{m.id}"), ("❌ Не отправлять", f"orej:m:{m.id}")]]))
    for p in posts:
        _say(chat_id, f"📝 Пост ({p.topic})\n\n{p.text}", kb([[("✅ Одобрить", f"oapp:p:{p.id}"), ("❌ Отклонить", f"orej:p:{p.id}")]]))


def _receipts(s: Session, chat_id: str) -> None:
    pays = unregistered_receipts(s)
    if not pays:
        _say(chat_id, "Все чеки пробиты 👍")
        return
    for p in pays[:10]:
        c = p.order.client
        who = f"{c.name or c.email or c.telegram_username} ({'ИП/юрлицо, укажите ИНН' if c.is_legal else 'физлицо'}{', ИНН ' + c.inn if c.inn else ''})"
        _say(chat_id, f"🧾 {p.confirmed_at:%d.%m %H:%M} UTC · заказ №{p.order_id} · {rub(p.amount_kop)}\n{who}\nУслуга: дизайн карточек товара", kb([[("🧾 Чек пробит", f"orcpt:{p.id}")]]))


# ---------------- ввод суммы для оплаты с биржи ----------------


def _pending_input(s: Session, chat_id: str, pending: str, text: str) -> bool:
    kind, oid, code = (pending.split(":") + ["", ""])[:3]
    if kind != "ext":
        set_setting(s, "owner_pending", "")
        return False
    nums = [float(x.replace(",", ".")) for x in re.findall(r"\d+(?:[.,]\d+)?", text)]
    source = next((w for w in ("kwork", "fl", "profi", "avito") if w in text.lower()), "kwork")
    if not nums:
        _say(chat_id, "Пришлите сумму и комиссию числами, например: 2490 498 kwork. Отмена — /cancel")
        return True
    o = s.get(Order, int(oid))
    try:
        ops.external_paid(s, o, code, nums[0], nums[1] if len(nums) > 1 else 0, source)
    except ops.OpError as e:
        _say(chat_id, f"Не получилось: {e}")
    else:
        _say(chat_id, f"✅ Заказ №{o.id}: оплата с {source} {rub(int(nums[0] * 100))} учтена, комиссия {rub(int((nums[1] if len(nums) > 1 else 0) * 100))}. Запускаю производство.")
    set_setting(s, "owner_pending", "")
    return True


# ---------------- кнопки ----------------

OWNER_PREFIXES = ("opay", "opilot", "oext", "orerun", "oredeliver", "oapp", "orej", "osent", "orcpt")


def handle_callback(s: Session, chat_id: str, data: str) -> None:
    parts = data.split(":")
    act = parts[0]
    try:
        if act in ("opilot", "oext") and len(parts) == 2:
            o = s.get(Order, int(parts[1]))
            rows = [[(f"{t.name} — {rub(t.price_kop)}", f"{act}:{o.id}:{t.code}")] for t in TARIFFS.values()]
            _say(chat_id, f"Заказ №{o.id}: какой тариф {'делаем бесплатно' if act == 'opilot' else 'оплачен на бирже'}?", kb(rows))
        elif act == "opilot":
            o = s.get(Order, int(parts[1]))
            ops.start_pilot(s, o, parts[2])
            _say(chat_id, f"🎁 Заказ №{o.id}: пилот «{TARIFFS[parts[2]].name}» запущен, выручка не меняется. Результат уйдёт клиенту автоматически.")
        elif act == "oext":
            set_setting(s, "owner_pending", f"ext:{parts[1]}:{parts[2]}")
            _say(chat_id, f"Заказ №{parts[1]}: пришлите сколько получили и комиссию площадки, например:\n2490 498 kwork\n(отмена — /cancel)")
        elif act == "opay":
            o = s.get(Order, int(parts[1]))
            ops.confirm_manual_payment(s, o)
            _say(chat_id, f"✅ Заказ №{o.id}: оплата подтверждена, запускаю производство. Не забудьте чек в «Мой налог».")
        elif act == "orerun":
            ops.rerun(s, s.get(Order, int(parts[1])))
            _say(chat_id, f"🔁 Заказ №{parts[1]}: производство перезапущено.")
        elif act == "oredeliver":
            ops.redeliver(s, s.get(Order, int(parts[1])))
            _say(chat_id, f"📦 Заказ №{parts[1]}: результат отправляется снова.")
        elif act in ("oapp", "orej", "osent") and len(parts) == 3:
            action = {"oapp": "approve", "orej": "reject", "osent": "sent"}[act]
            if parts[1] == "m":
                m = s.get(Message, int(parts[2]))
                ops.message_action(s, m, action)
                if action == "approve":
                    lead = s.get(Lead, m.lead_id) if m.lead_id else None
                    _say(
                        chat_id,
                        f"✅ Одобрено. Отправьте это сообщение вручную ({lead.contact if lead and lead.contact else 'контакт лида'}) и нажмите кнопку:\n\n{m.text}",
                        kb([[("📤 Отправил(а)", f"osent:m:{m.id}")]]),
                    )
                else:
                    _say(chat_id, "📤 Отмечено как отправленное." if action == "sent" else "❌ Отклонено.")
            elif parts[1] == "p":
                ops.post_action(s, s.get(ContentPost, int(parts[2])), action)
                _say(chat_id, "✅ Пост одобрен — опубликуется по расписанию." if action == "approve" else "❌ Пост отклонён.")
        elif act == "orcpt":
            ops.receipt_done(s, s.get(Payment, int(parts[1])))
            _say(chat_id, "🧾 Отмечено: чек пробит.")
    except ops.OpError as e:
        _say(chat_id, f"Не получилось: {e}")
    except (ValueError, KeyError, AttributeError, IndexError):
        _say(chat_id, "Кнопка устарела — запросите список заново (/orders, /approvals).")
