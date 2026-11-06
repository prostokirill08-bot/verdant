"""Платежи: ЮKassa (для самозанятых) и ручной режим (СБП/перевод + подтверждение владельцем).

Защита от повторной обработки:
* уникальная пара (provider, provider_payment_id);
* статус платежа проверяется запросом к API ЮKassa, а не по телу вебхука;
* переход в «оплачен» выполняется один раз, производство ставится с ключом идемпотентности.
"""
from __future__ import annotations

import uuid

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..events import record
from ..models import Expense, Order, Payment, utcnow
from ..pricing import tariff
from ..queue import enqueue

YK_API = "https://api.yookassa.ru/v3/payments"


class PaymentError(Exception):
    pass


def _yk_auth():
    c = get_settings()
    if not (c.yookassa_shop_id and c.yookassa_secret_key):
        raise PaymentError("ЮKassa не настроена")
    return (c.yookassa_shop_id, c.yookassa_secret_key)


def set_tariff(order: Order, code: str) -> None:
    t = tariff(code)
    if order.status in ("paid", "in_production", "ready", "delivered", "revision"):
        raise PaymentError("Заказ уже оплачен")
    order.tariff = t.code
    order.price_kop = t.price_kop


def create_payment(s: Session, order: Order) -> Payment:
    """Создать платёж на сумму утверждённого тарифа. Возвращает существующий, если он ещё ждёт оплаты."""
    if not order.tariff:
        raise PaymentError("Не выбран тариф")
    t = tariff(order.tariff)
    for p in order.payments:
        if p.status == "pending" and p.amount_kop == t.price_kop:
            return p
    cfg = get_settings()
    if cfg.payment_provider == "yookassa":
        body = {
            "amount": {"value": f"{t.price_rub}.00", "currency": "RUB"},
            "capture": True,
            "confirmation": {"type": "redirect", "return_url": f"{cfg.public_url}/o/{order.token}"},
            "description": f"Заказ №{order.id}: {t.name} — дизайн карточек товара"[:128],
            "metadata": {"order_id": str(order.id)},
        }
        r = httpx.post(YK_API, json=body, auth=_yk_auth(), headers={"Idempotence-Key": f"order-{order.id}-{t.code}-{len(order.payments)}"}, timeout=30)
        if r.status_code >= 300:
            raise PaymentError(f"ЮKassa: {r.status_code} {r.text[:300]}")
        d = r.json()
        p = Payment(
            order_id=order.id,
            provider="yookassa",
            provider_payment_id=d["id"],
            amount_kop=t.price_kop,
            status="pending",
            confirmation_url=d.get("confirmation", {}).get("confirmation_url", ""),
            raw=d,
        )
    else:
        p = Payment(
            order_id=order.id,
            provider="manual",
            provider_payment_id=f"manual-{order.id}-{uuid.uuid4().hex[:8]}",
            amount_kop=t.price_kop,
            status="pending",
            confirmation_url=f"{cfg.public_url}/o/{order.token}/pay-manual",
        )
    s.add(p)
    order.status = "awaiting_payment"
    s.flush()
    record(s, "payment_link_sent", "order", order.id, amount_kop=t.price_kop, provider=p.provider)
    return p


def mark_paid(s: Session, payment: Payment, fee_kop: int = 0, raw: dict | None = None) -> bool:
    """Идемпотентно отметить оплату. Возвращает True, если состояние изменилось."""
    if payment.status == "succeeded":
        return False
    payment.status = "succeeded"
    payment.confirmed_at = utcnow()
    payment.fee_kop = fee_kop
    if raw:
        payment.raw = raw
    order = payment.order
    order.status = "paid"
    order.paid_at = utcnow()
    if fee_kop:
        s.add(Expense(category="fees", amount_kop=fee_kop, description=f"эквайринг заказ {order.id}"))
    record(s, "payment_succeeded", "order", order.id, amount_kop=payment.amount_kop, fee_kop=fee_kop, provider=payment.provider)
    enqueue(s, "produce_order", {"order_id": order.id}, idempotency_key=f"produce_order:{order.id}")
    enqueue(s, "notify_client", {"order_id": order.id, "event": "paid"}, idempotency_key=f"notify:paid:{order.id}")
    return True


def handle_yookassa_notification(s: Session, body: dict) -> str:
    """Вебхук ЮKassa. Тело не доверяем — перепроверяем статус через API."""
    obj = body.get("object", {})
    pid = obj.get("id")
    if not pid:
        return "ignored"
    payment = s.scalar(select(Payment).where(Payment.provider == "yookassa", Payment.provider_payment_id == pid))
    if payment is None:
        return "unknown"
    r = httpx.get(f"{YK_API}/{pid}", auth=_yk_auth(), timeout=30)
    r.raise_for_status()
    d = r.json()
    if d.get("status") == "succeeded" and d.get("paid"):
        if int(round(float(d["amount"]["value"]) * 100)) != payment.amount_kop:
            record(s, "payment_amount_mismatch", "payment", payment.id, got=d["amount"]["value"])
            return "mismatch"
        income = d.get("income_amount", {}).get("value")
        fee = payment.amount_kop - int(round(float(income) * 100)) if income else 0
        mark_paid(s, payment, fee_kop=max(fee, 0), raw=d)
        return "paid"
    if d.get("status") == "canceled":
        payment.status = "canceled"
        record(s, "payment_canceled", "order", payment.order_id)
        return "canceled"
    return d.get("status", "pending")
