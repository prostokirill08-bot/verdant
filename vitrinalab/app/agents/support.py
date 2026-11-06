"""Customer Support Agent: вопросы после оплаты, статусы, правки. Возвраты и конфликты — только владельцу."""
from __future__ import annotations

from sqlalchemy.orm import Session

from ..config import get_settings
from ..events import escalate, record
from ..models import Client, Order
from ..pricing import TARIFFS, TURNAROUND
from ..queue import enqueue
from .base import agent_run, ask_llm
from .knowledge import REFUND_RE, REVISION_RE, STATUS_RE, faq_answer, safe_reply, sales_system

STATUS_TEXT = {
    "paid": "оплачен, ставится в производство",
    "in_production": "в производстве",
    "revision": "вносим правки",
    "ready": "готов, отправляем",
    "delivered": "готов и отправлен",
    "needs_human": "на ручной проверке у руководителя",
}


def request_revision(s: Session, order: Order, note: str) -> bool:
    """Запустить бесплатный раунд правок, если он ещё доступен."""
    t = TARIFFS[order.tariff]
    if order.revisions_used >= t.revisions:
        return False
    order.revisions_used += 1
    order.status = "revision"
    for it in order.items:
        if it.photo_path:
            it.revision += 1
            it.revision_note = note[:2000]
            it.status = "producing"
    record(s, "revision_requested", "order", order.id, note=note[:300])
    enqueue(s, "produce_order", {"order_id": order.id, "revision": True}, idempotency_key=f"produce_order:{order.id}:rev{order.revisions_used}")
    return True


def handle(s: Session, bot, client: Client, order: Order, text: str) -> None:
    from .delivery import order_url

    url = order_url(order)
    if REFUND_RE.search(text):
        escalate(s, "support", f"Возврат/претензия по заказу #{order.id}", text, "critical", "order", order.id)
        bot.say("Понимаю. Вопросы возврата решает руководитель — я передал ему ваше сообщение, он свяжется с вами в ближайшее время.", agent="support")
        return
    if order.status == "delivered" and REVISION_RE.search(text):
        if request_revision(s, order, text):
            bot.say(f"Принял правки ✍️ Обновлённая версия придёт сюда же, срок — {TURNAROUND}.", agent="support")
        else:
            escalate(s, "support", f"Клиент просит дополнительные правки по заказу #{order.id}", text, "warn", "order", order.id)
            bot.say("Бесплатный раунд правок уже использован. Я передал запрос руководителю — он предложит вариант.", agent="support")
        return
    if STATUS_RE.search(text) or not text:
        bot.say(f"Заказ №{order.id}: {STATUS_TEXT.get(order.status, order.status)}." + (f" Подробности: {url}" if url else ""), agent="support")
        return
    with agent_run(s, "support", "answer") as run:
        ans = ask_llm(
            s,
            run,
            sales_system() + f"\nКлиент уже оплатил заказ №{order.id}, статус: {STATUS_TEXT.get(order.status, order.status)}.",
            text,
            fallback=lambda: faq_answer(text)
            or f"Заказ №{order.id}: {STATUS_TEXT.get(order.status, order.status)}. Если нужен руководитель — напишите «оператор».",
            validate=safe_reply,
        )
    bot.say(ans, agent="support")
