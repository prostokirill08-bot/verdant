"""Доставка результата и уведомления клиенту/владельцу."""
from __future__ import annotations

import logging

from sqlalchemy.orm import Session

from ..config import get_settings
from ..events import owner_chat_id, record
from ..integrations import mailer, telegram
from ..models import Escalation, Message, Order, Task, utcnow
from ..pricing import TARIFFS, TURNAROUND
from ..queue import RetryLater, handler

log = logging.getLogger("vitrinalab.delivery")


def order_url(order: Order) -> str:
    """Ссылка на личный кабинет — только если сайт опубликован."""
    cfg = get_settings()
    return f"{cfg.public_url}/o/{order.token}" if cfg.has_public_site else ""


def tariff_keyboard(order: Order) -> dict:
    rows = [[(f"{t.name} — {t.price_rub:,} ₽".replace(",", " "), f"tariff:{order.id}:{t.code}")] for t in TARIFFS.values() if t.items == 1]
    rows.append([("🎨 Пожелания к дизайну / референс", f"design:{order.id}")])
    rows.append([("Каталог / пакет на месяц", f"more:{order.id}")])
    rows.append([("Задать вопрос", f"ask:{order.id}")])
    return telegram.keyboard(rows)


def _log_out(s: Session, order: Order, text: str, channel: str, agent: str, kind: str = "chat") -> None:
    s.add(Message(client_id=order.client_id, channel=channel, direction="out", text=text, status="sent", agent=agent, kind=kind, sent_at=utcnow()))


@handler("notify_client")
def notify_client(s: Session, payload: dict, task: Task) -> None:
    order = s.get(Order, payload["order_id"])
    client = order.client
    event = payload["event"]
    url = order_url(order)
    texts = {
        "preview_ready": (
            "Готово бесплатное превью обложки для вашего товара 👆\n\n"
            "Полный комплект: слайды инфографики, SEO-название и описание, варианты обложки для A/B-теста. "
            f"Срок — {TURNAROUND}.\n\n"
            "Хотите другой стиль или цвета? Нажмите «🎨 Пожелания» — пришлите референс или опишите словами, превью обновлю бесплатно. "
            "Или сразу выберите тариф:"
        ),
        "paid": f"Оплата получена, спасибо! Заказ №{order.id} передан в производство. Срок — {TURNAROUND}." + (f" Статус: {url}" if url else ""),
        "revision_started": f"Приняли правки по заказу №{order.id}, обновлённая версия придёт сюда же.",
    }
    text = texts.get(event, payload.get("text", ""))
    if not text:
        return
    if client.telegram_chat_id and telegram.enabled():
        try:
            if event == "preview_ready":
                item = next((i for i in order.items if i.preview_path), None)
                telegram.send_photo(client.telegram_chat_id, item.preview_path, caption=text, markup=tariff_keyboard(order))
            else:
                telegram.send_message(client.telegram_chat_id, text)
        except telegram.TelegramError as e:
            raise RetryLater(str(e)) from e
        _log_out(s, order, text, "telegram", "sales" if event == "preview_ready" else "support")
    elif client.email and mailer.enabled():
        mailer.send(client.email, f"{get_settings().brand_name}: заказ №{order.id}", text + (f"\n\nСтраница заказа: {url}" if url else ""))
        _log_out(s, order, text, "email", "support")


@handler("deliver_order")
def deliver_order(s: Session, payload: dict, task: Task) -> None:
    order = s.get(Order, payload["order_id"])
    client = order.client
    url = order_url(order)
    done = [i for i in order.items if i.status == "done" and i.zip_path]
    warnings = [w for i in done for w in i.qc_report.get("warnings", [])]
    text = (
        f"Заказ №{order.id} готов ✅\n\n"
        f"Внутри архива: слайды 1440×1920 (по порядку загрузки), варианты обложки и файл SEO.txt с названием и описанием.\n"
        + (f"Скачать в личном кабинете: {url}\n\n" if url else "Архивы — следующими сообщениями.\n\n")
        + "Нужны правки? Напишите, что изменить — один раунд правок входит в стоимость."
    )
    if warnings:
        text += "\n\nКомментарий контроля качества: " + "; ".join(dict.fromkeys(warnings))
    sent_via = []
    if client.telegram_chat_id and telegram.enabled():
        try:
            telegram.send_message(client.telegram_chat_id, text)
            for it in done:
                telegram.send_document(client.telegram_chat_id, it.zip_path, caption=it.product_name[:200])
            sent_via.append("telegram")
        except telegram.TelegramError as e:
            raise RetryLater(str(e)) from e
    if client.email and mailer.enabled():
        try:
            mailer.send(client.email, f"Заказ №{order.id} готов — {get_settings().brand_name}", text)
            sent_via.append("email")
        except Exception as e:  # noqa: BLE001
            log.warning("email delivery failed: %s", e)
    sent_via.append("cabinet")  # результат всегда доступен в личном кабинете
    order.status = "delivered"
    order.delivered_at = utcnow()
    s.add(Message(client_id=client.id, channel=sent_via[0], direction="out", text=text, status="sent", agent="support", kind="delivery", sent_at=utcnow()))
    record(s, "result_sent", "order", order.id, via=sent_via, items=len(done))
    enqueue_owner_text(s, f"✅ Заказ №{order.id} доставлен клиенту ({', '.join(sent_via)}). Товаров: {len(done)}.")


def enqueue_owner_text(s: Session, text: str) -> None:
    from ..queue import enqueue

    enqueue(s, "notify_owner", {"text": text})


@handler("notify_owner")
def notify_owner(s: Session, payload: dict, task: Task) -> None:
    cfg = get_settings()
    if "escalation_id" in payload:
        esc = s.get(Escalation, payload["escalation_id"])
        icon = {"critical": "🔴", "warn": "🟠"}.get(esc.severity, "🔵")
        text = f"{icon} {esc.title}\n\n{esc.details[:1500]}\n\nАдминка: {cfg.public_url}/admin/escalations"
    else:
        text = payload.get("text", "")
    markup = payload.get("markup")
    chat = owner_chat_id(s)
    if not (chat and telegram.enabled()):
        log.info("owner notification (Telegram не настроен): %s", text[:200])
        return
    try:
        telegram.send_message(chat, text, markup)
    except telegram.TelegramError as e:
        raise RetryLater(str(e)) from e
