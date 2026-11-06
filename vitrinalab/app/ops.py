"""Действия владельца — общие для админки и Telegram-бота (одна логика, два интерфейса)."""
from __future__ import annotations

from sqlalchemy.orm import Session

from .events import record
from .models import ContentPost, Lead, Message, Order, Payment, utcnow
from .payments.service import mark_paid, set_tariff
from .queue import enqueue


class OpError(Exception):
    pass


def _ensure_unpaid(o: Order) -> None:
    if o.paid_at or o.status in ("in_production", "delivered", "cancelled"):
        raise OpError("Заказ уже оплачен, в работе или отменён")


def start_pilot(s: Session, o: Order, tariff_code: str = "standard") -> None:
    """Бесплатный пилот: производство без оплаты, выручка не меняется."""
    _ensure_unpaid(o)
    set_tariff(o, tariff_code)
    o.price_kop = 0
    o.notes = (o.notes + " пилот").strip()
    o.status, o.paid_at = "paid", utcnow()
    enqueue(s, "produce_order", {"order_id": o.id}, idempotency_key=f"produce_order:{o.id}")
    record(s, "admin_pilot", "order", o.id, tariff=tariff_code)


def external_paid(s: Session, o: Order, tariff_code: str, amount_rub: float = 0, fee_rub: float = 0, source: str = "") -> Payment:
    """Оплата прошла на бирже (Kwork/FL): выручка = полученная сумма, комиссия площадки — в расходах."""
    _ensure_unpaid(o)
    set_tariff(o, tariff_code)
    amount = int(round((amount_rub or o.price_kop / 100) * 100))
    p = Payment(order_id=o.id, provider="external", provider_payment_id=f"ext-{o.id}-{utcnow():%Y%m%d%H%M%S%f}", amount_kop=amount, status="pending")
    s.add(p)
    s.flush()
    if source:
        o.client.source = source[:40]
    mark_paid(s, p, fee_kop=int(round(fee_rub * 100)))
    record(s, "admin_external_paid", "order", o.id, amount_kop=amount, source=source)
    return p


def confirm_manual_payment(s: Session, o: Order) -> bool:
    p = next((p for p in o.payments if p.status == "pending" and p.provider == "manual"), None)
    if p is None:
        raise OpError("Нет ожидающего ручного платежа")
    return mark_paid(s, p)


def rerun(s: Session, o: Order) -> None:
    stamp = utcnow().strftime("%Y%m%d%H%M%S%f")
    for it in o.items:
        it.attempts = 0
        if it.status in ("needs_human", "done"):
            it.status = "producing"
        enqueue(s, "produce_item", {"item_id": it.id}, idempotency_key=f"produce:{it.id}:manual:{stamp}")
    o.status = "in_production"
    record(s, "admin_rerun", "order", o.id)


def redeliver(s: Session, o: Order) -> None:
    enqueue(s, "deliver_order", {"order_id": o.id}, idempotency_key=f"deliver:{o.id}:manual:{utcnow():%Y%m%d%H%M%S%f}")
    record(s, "admin_redeliver", "order", o.id)


def cancel(s: Session, o: Order) -> None:
    o.status = "cancelled"
    record(s, "admin_cancel", "order", o.id)


def message_action(s: Session, m: Message, action: str, text: str = "") -> None:
    if text.strip():
        m.text = text.strip()
    if action == "approve":
        m.status = "approved"
    elif action == "reject":
        m.status = "rejected"
        if m.lead_id:
            s.get(Lead, m.lead_id).status = "rejected"
    elif action == "sent":  # владелец отправил вручную
        m.status = "sent"
        m.sent_at = utcnow()
        if m.lead_id:
            s.get(Lead, m.lead_id).status = "contacted"
        record(s, "outreach_sent", "lead", m.lead_id, channel=m.channel)


def post_action(s: Session, p: ContentPost, action: str, text: str = "") -> None:
    if text.strip():
        p.text = text.strip()
    p.status = {"approve": "approved", "reject": "rejected"}.get(action, p.status)


def receipt_done(s: Session, p: Payment) -> None:
    p.receipt_registered = True
