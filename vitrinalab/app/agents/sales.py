"""Sales Agent: ведёт клиента в Telegram от первого сообщения до оплаты.

Сценарий: приветствие → фото товара → факты → бесплатное превью → тариф → ссылка на оплату.
Цены — только из pricing.py, скидок нет. Сложные вопросы → владельцу.
"""
from __future__ import annotations

import logging
import re

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..events import escalate, owner_code, record, set_setting
from ..integrations import telegram
from ..models import Client, Message, Order, OrderItem, utcnow
from ..payments.service import PaymentError, create_payment, set_tariff
from ..pricing import TARIFFS, rub
from ..queue import enqueue
from . import support
from .base import agent_run, ask_llm
from .copywriter import split_facts
from .knowledge import HUMAN_RE, faq_answer, safe_reply, sales_system

log = logging.getLogger("vitrinalab.sales")
MAX_FREE_PREVIEWS = 3

GREETING = (
    "Здравствуйте! Я — AI-ассистент студии {brand} 🤖\n\n"
    "Делаем продающую инфографику и SEO-тексты для карточек Wildberries и Ozon за 24 часа. "
    "Товар не перерисовываем — работаем с вашим реальным фото.\n\n"
    "Пришлите фото товара — через пару минут покажу бесплатное превью обложки.\n\n"
    "Продолжая диалог, вы соглашаетесь с политикой обработки данных: {url}/privacy"
)
ASK_DETAILS = (
    "Фото получил 👍 Теперь одним сообщением:\n"
    "1) название товара (первой строкой);\n"
    "2) 3–8 фактов о товаре с новой строки — характеристики, материалы, размеры, комплектация;\n"
    "3) маркетплейс: WB или Ozon.\n\n"
    "Пример:\nТермокружка с крышкой\nОбъём: 450 мл\nДержит тепло до 8 часов\nНе протекает — крышка с замком\nWB"
)


def detect_marketplace(text: str) -> str:
    t = text.lower()
    if re.search(r"ozon|озон", t):
        return "ozon"
    if re.search(r"яндекс|маркет|\bym\b", t):
        return "ym"
    return "wb"


def parse_details(text: str) -> tuple[str, str, str]:
    lines = [ln.strip() for ln in text.strip().splitlines() if ln.strip()]
    mp = detect_marketplace(text)
    lines = [ln for ln in lines if not re.fullmatch(r"(wb|вб|wildberries|вайлдберриз|ozon|озон|яндекс маркет|ym)\.?", ln, re.I)]
    if not lines:
        return "", "", mp
    name = lines[0].rstrip(".")
    features = "\n".join(lines[1:])
    if not features and ("," in name or ";" in name):
        parts = split_facts(name)
        name, features = parts[0], "\n".join(parts[1:])
    return name[:200], features[:3000], mp


class Bot:
    """Отправка с записью в CRM."""

    def __init__(self, s: Session, client: Client):
        self.s, self.client = s, client

    def say(self, text: str, markup: dict | None = None, agent: str = "sales", kind: str = "chat") -> None:
        telegram.send_message(self.client.telegram_chat_id, text, markup)
        self.s.add(Message(client_id=self.client.id, channel="telegram", direction="out", text=text, status="sent", agent=agent, kind=kind, sent_at=utcnow()))


def get_or_create_client(s: Session, chat: dict, user: dict) -> Client:
    chat_id = str(chat["id"])
    c = s.scalar(select(Client).where(Client.telegram_chat_id == chat_id))
    if c is None:
        name = " ".join(x for x in [user.get("first_name"), user.get("last_name")] if x)
        c = Client(telegram_chat_id=chat_id, telegram_username=user.get("username", "") or "", name=name, source="telegram", state={"step": "start"})
        s.add(c)
        s.flush()
        record(s, "client_new", "client", c.id, source="telegram")
    return c


def active_order(s: Session, client: Client) -> Order | None:
    return s.scalar(select(Order).where(Order.client_id == client.id).order_by(Order.id.desc()).limit(1))


def handle_update(s: Session, upd: dict) -> None:
    if "callback_query" in upd:
        return handle_callback(s, upd["callback_query"])
    msg = upd.get("message")
    if not msg or msg.get("chat", {}).get("type") != "private":
        return
    client = get_or_create_client(s, msg["chat"], msg.get("from", {}))
    text = (msg.get("text") or msg.get("caption") or "").strip()
    s.add(Message(client_id=client.id, channel="telegram", direction="in", text=text or "[фото]", status="received", agent="sales"))
    record(s, "message_in", "client", client.id)
    bot = Bot(s, client)
    cfg = get_settings()
    state = dict(client.state or {"step": "start"})

    if text.startswith("/owner"):
        code = text.split(maxsplit=1)[1].strip() if " " in text else ""
        if code and code == owner_code():
            set_setting(s, "owner_chat_id", client.telegram_chat_id)
            client.notes = "ВЛАДЕЛЕЦ"
            record(s, "owner_registered", "client", client.id)
            bot.say("Готово: этот чат привязан как чат владельца. Сюда будут приходить ежедневные отчёты и эскалации.", agent="ceo")
        else:
            bot.say("Неверный код.", agent="ceo")
        return

    if text.startswith("/start"):
        payload = text.split(maxsplit=1)[1] if " " in text else ""
        if payload.startswith("src_") and client.source == "telegram":
            client.source = payload[4:40]  # deep-link для учёта эффективности каналов
        state["step"] = "await_photo"
        client.state = state
        bot.say(GREETING.format(brand=cfg.brand_name, url=cfg.public_url))
        return

    if HUMAN_RE.search(text):
        escalate(s, "sales", f"Клиент #{client.id} просит человека", f"@{client.telegram_username}: {text}", severity="warn", entity="client", entity_id=client.id)
        bot.say("Передал ваш вопрос руководителю — он ответит здесь в ближайшее время.")
        return

    order = active_order(s, client)
    if order and order.status in ("paid", "in_production", "ready", "delivered", "revision", "needs_human"):
        if not (msg.get("photo") or msg.get("document")):
            return support.handle(s, bot, client, order, text)

    photo_id = None
    if msg.get("photo"):
        photo_id = msg["photo"][-1]["file_id"]
    elif msg.get("document", {}).get("mime_type", "").startswith("image/"):
        photo_id = msg["document"]["file_id"]

    if photo_id:
        dest = cfg.files_dir / "uploads" / str(client.id) / f"{msg['message_id']}.jpg"
        telegram.download_file(photo_id, dest)
        state.update(step="await_details", photo=str(dest))
        client.consent_at = client.consent_at or utcnow()
        client.state = state
        if text and len(split_facts(text)) >= 2:  # факты пришли подписью к фото
            return _start_preview(s, bot, client, state, text)
        bot.say(ASK_DETAILS)
        return

    if state.get("step") == "await_details" and text:
        return _start_preview(s, bot, client, state, text)

    # свободный вопрос: FAQ → LLM с проверкой ответа → предложение следующего шага
    _answer_question(s, bot, text, state)


def _answer_question(s: Session, bot: Bot, text: str, state: dict) -> None:
    nxt = "\n\nПришлите фото товара — сделаю бесплатное превью обложки." if state.get("step") in ("start", "await_photo", None) else ""
    with agent_run(s, "sales", "answer") as run:
        ans = ask_llm(
            s,
            run,
            sales_system(),
            text or "Привет",
            fallback=lambda: (faq_answer(text) or "Я помогаю с инфографикой и SEO для карточек WB и Ozon.") + nxt,
            validate=safe_reply,
        )
    bot.say(ans)


def _start_preview(s: Session, bot: Bot, client: Client, state: dict, text: str) -> None:
    name, features, mp = parse_details(text)
    if not name or len(split_facts(features)) < 2:
        if not state.get("asked_more"):
            state["asked_more"] = True
            client.state = state
            bot.say("Чтобы инфографика получилась содержательной, нужно название и хотя бы 2–3 факта о товаре, каждый с новой строки. Мы используем только ваши факты — ничего не выдумываем.")
            return
    previews = int(state.get("previews", 0))
    order = Order(client_id=client.id, channel="telegram", source=client.source, status="preview_queued")
    s.add(order)
    s.flush()
    item = OrderItem(order_id=order.id, product_name=name or "Товар", features=features, marketplace=mp, photo_path=state["photo"])
    s.add(item)
    s.flush()
    state.update(step="preview_pending", order_id=order.id, previews=previews + 1, asked_more=False)
    client.state = state
    record(s, "order_created", "order", order.id, channel="telegram")
    if previews >= MAX_FREE_PREVIEWS:
        order.status = "preview_ready"
        bot.say("Лимит бесплатных превью исчерпан, но вы можете сразу выбрать тариф — результат придёт в течение 24 часов.", _tariff_markup(order))
        return
    client.free_preview_used = True
    enqueue(s, "make_preview", {"item_id": item.id}, idempotency_key=f"preview:{item.id}")
    bot.say("Принято! Готовлю бесплатное превью обложки — это займёт 1–3 минуты ⏳")


def _tariff_markup(order: Order) -> dict:
    from .delivery import tariff_keyboard

    return tariff_keyboard(order)


def handle_callback(s: Session, cq: dict) -> None:
    data = cq.get("data", "")
    chat_id = str(cq["message"]["chat"]["id"])
    client = s.scalar(select(Client).where(Client.telegram_chat_id == chat_id))
    telegram.answer_callback(cq["id"])
    if client is None:
        return
    bot = Bot(s, client)
    parts = data.split(":")
    order = s.get(Order, int(parts[1])) if len(parts) > 1 and parts[1].isdigit() else None
    if order is None or order.client_id != client.id:
        return
    if parts[0] == "tariff" and len(parts) == 3:
        try:
            set_tariff(order, parts[2])
            p = create_payment(s, order)
        except (PaymentError, KeyError) as e:
            bot.say(f"Не получилось создать оплату: {e}. Я передал вопрос руководителю.")
            escalate(s, "sales", f"Ошибка оплаты по заказу #{order.id}", str(e), "critical", "order", order.id)
            return
        t = TARIFFS[order.tariff]
        extra = ""
        if t.items > 1:
            extra = f"\nТовары для пакета можно будет добавить в личном кабинете: {get_settings().public_url}/o/{order.token}"
        bot.say(
            f"Тариф «{t.name}» — {rub(t.price_kop)}.\n{t.description}.{extra}\n\nОплатить можно по кнопке ниже. После оплаты заказ сразу уходит в работу.",
            telegram.keyboard([[("Оплатить " + rub(t.price_kop), p.confirmation_url)]]),
            kind="offer",
        )
        client.state = {**(client.state or {}), "step": "awaiting_payment"}
    elif parts[0] == "more":
        rows = [[(f"{t.name} — {rub(t.price_kop)}", f"tariff:{order.id}:{t.code}")] for t in TARIFFS.values() if t.items > 1]
        text = "\n".join(f"• {t.name} — {rub(t.price_kop)}: {t.description}" for t in TARIFFS.values() if t.items > 1)
        bot.say(text, telegram.keyboard(rows))
    elif parts[0] == "ask":
        bot.say("Напишите ваш вопрос — отвечу здесь.")
