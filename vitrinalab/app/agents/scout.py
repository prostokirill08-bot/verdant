"""Scout: поиск свежих заказов на инфографику в публичных Telegram-лентах.

Читает только публичную веб-версию канала (t.me/s/<канал>), без входа в аккаунт.
Каждый подходящий заказ → лид в CRM (source=tg_orders) + сообщение владельцу с готовым откликом.
Отклик отправляет владелец сам, со своего аккаунта на бирже: автоматически никому не пишем.
"""
from __future__ import annotations

import html
import logging
import re
from datetime import datetime, timedelta, timezone

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..events import get_setting, owner_chat_id, record, set_setting
from ..integrations import telegram
from ..db import release
from ..models import Lead, Task, utcnow
from ..queue import handler

log = logging.getLogger("vitrinalab.scout")

MAX_PER_RUN = 10
FIRST_RUN_HOURS = 72

ABOUT = re.compile(r"инфограф|карточ|слайд|маркетплейс|wildberries|вайлдбер|\bвб\b|\bwb\b|ozon|озон|яндекс\s*маркет", re.I)
ASK = re.compile(r"нужн|ищу|ищем|требуе|необходим|создать|сделать|оформ|редизайн|разработ", re.I)
SKIP = re.compile(r"анкет|сводк|подборк|переклич|\bкурс|аналитик|вакансии|публикуем|стать доном", re.I)
# то, что ВитринаЛаб не делает: такие заказы владельцу не присылаем
CANT = [
    (r"видео|монтаж|reels|shorts|ugc|анимац|моушн", "видео/анимация"),
    (r"\b3d\b|3д", "3D"),
    (r"логотип|брендбук|разработ\w* фирменн", "логотип/фирстиль"),
    (r"\bui\b|\bux\b|дизайн сайта|сайт под ключ|лендинг|вёрстк|верстк|figma", "сайты/UI"),
    (r"упаковк|этикетк", "упаковка"),
    (r"[сc]трого с опытом|с опытом в нише|опыт в нише", "нужен опыт в узкой нише"),
    (r"в штат|на постоянную работу|полный день|оформление по тк", "работа в штат"),
    (r"для стать|статьи|презентаций|презентацию|powerpoint", "не карточки товаров"),
]

NICHES = [
    (r"юбк|юбок|плать|брюк|одежд|футболк|куртк|костюм", "Для одежды покажу посадку, детали, ткань и состав, размерную сетку."),
    (r"мебел|стол|шкаф|диван|кресл|стул", "Для мебели сделаю акцент на размерах, материалах и виде в интерьере."),
    (r"бассейн", "Для бассейнов покажу размеры и объём, материал, комплектацию и монтаж."),
    (r"канц|ручк|тетрад|блокнот", "Для канцтоваров покажу комплектацию, размеры и детали крупным планом."),
    (r"бытов\w* хими|моющ|чистящ|порошок", "Для бытовой химии покажу назначение, объём, способ применения и состав."),
    (r"космет|крем|сыворот|шампун", "Для косметики покажу эффект, состав, способ применения и объём."),
    (r"игрушк|детск", "Для детских товаров покажу возраст, безопасность и комплектацию."),
]


def fetch(channel: str) -> list[dict]:
    r = httpx.get(f"https://t.me/s/{channel}", timeout=20, follow_redirects=True)
    r.raise_for_status()
    return parse(channel, r.text)


def parse(channel: str, page: str) -> list[dict]:
    posts = []
    for block in page.split('data-post="')[1:]:
        m = re.match(re.escape(channel) + r"/(\d+)\"", block, re.I)
        if not m:
            continue
        text_m = re.search(r'tgme_widget_message_text[^>]*>(.*?)</div>', block, re.S)
        if not text_m:
            continue
        txt = re.sub(r"<br\s*/?>", "\n", text_m.group(1))
        txt = html.unescape(re.sub(r"<[^>]+>", "", txt)).strip()
        dt_m = re.search(r'datetime="([^"]+)"', block)
        dt = datetime.fromisoformat(dt_m.group(1)).astimezone(timezone.utc).replace(tzinfo=None) if dt_m else None
        posts.append({"id": int(m.group(1)), "text": txt, "date": dt, "url": f"https://t.me/{channel}/{m.group(1)}"})
    return posts


def clean(text: str) -> str:
    """Убрать служебные строки ленты (реклама бота, каталог анкет)."""
    lines = [ln for ln in text.splitlines() if not re.search(r"^✅|@mprabotabot|vk\.com/wall", ln.strip())]
    return "\n".join(lines).strip()


def is_order(text: str) -> bool:
    body = clean(text)
    return bool(ABOUT.search(body) and ASK.search(body) and not SKIP.search(body))


def fit(text: str) -> tuple[bool, str]:
    """Можем ли выполнить заказ своими силами (инфографика, обложки, SEO-тексты для карточек)."""
    low = clean(text).lower()
    for rx, why in CANT:
        if re.search(rx, low):
            return False, why
    return True, ""


def marketplace(text: str) -> str:
    wb = bool(re.search(r"wildberries|вайлдбер|\bвб\b|\bwb\b", text, re.I))
    oz = bool(re.search(r"ozon|озон", text, re.I))
    return "wb+ozon" if wb and oz else "ozon" if oz else "wb" if wb else "any"


def draft(text: str) -> str:
    """Персональный отклик по тексту заказа. Без обещаний роста продаж и без неутверждённых цен."""
    body = clean(text).replace("\n", " ")
    low = body.lower()
    parts = ["Здравствуйте!"]
    niche = next((d for rx, d in NICHES if re.search(rx, low)), "")
    if re.search(r"\bai\b|\bии\b|нейросет", low):
        parts.append("Работаю как раз с AI: товар оставляю таким, как на вашем фото, а фон, сцену и подачу генерирую.")
    if re.search(r"однотипн|отличаются только", low):
        parts.append("Для однотипных товаров сделаю один стиль и шаблон, затем адаптирую под каждый вариант — единая линейка и короче сроки.")
    if re.search(r"главн\w* (слайд|карточ|изображ)|обложк", low):
        parts.append("Главный слайд сделаю так, чтобы товар и 2–3 преимущества читались с телефона; покажу 2 варианта на выбор.")
    if niche:
        parts.append(niche)
    if re.search(r"фото (уже )?готов|фотографии готов", low):
        parts.append("Раз фото готовы — можно начать сразу.")
    if re.search(r"портфолио|без опыта", low):
        parts.append("Примеры работ — в моём портфолио.")
    if len(parts) == 1 or (niche and len(parts) == 2):
        parts.insert(1, "Сделаю инфографику для карточки: обложка, преимущества, характеристики, детали.")
    if not re.search(r"\bai\b|\bии\b|нейросет", low):
        parts.append("Товар остаётся таким, как на ваших фото, — меняю только фон и подачу.")
    parts.append("Могу бесплатно сделать обложку одного товара, чтобы вы оценили стиль до заказа.")
    q = "Сколько товаров и слайдов на каждый нужно?" if not re.search(r"\d+\s*(товар|карточ|слайд|изображ)", low) else "Пришлите фото и ключевые характеристики — начну."
    parts.append(q)
    return " ".join(parts)


def _title(text: str) -> str:
    first = next((ln.strip() for ln in clean(text).splitlines() if ln.strip()), "Заказ")
    return first[:120]


@handler("scout_orders")
def scout_orders(s: Session, payload: dict, task: Task) -> None:
    channels = [c.strip().lstrip("@") for c in get_settings().scout_channels.split(",") if c.strip()]
    owner = owner_chat_id(s)
    sent = 0
    for ch in channels:
        release(s)
        try:
            posts = fetch(ch)
        except Exception as e:  # noqa: BLE001 — сеть/формат страницы; попробуем в следующий раз
            log.warning("scout %s: %s", ch, e)
            continue
        found = scan(s, ch, posts)
        for lead in found:
            if sent >= MAX_PER_RUN:
                break
            if owner and telegram.enabled():
                try:
                    notify(owner, lead)
                    sent += 1
                except Exception as e:  # noqa: BLE001 — лид уже в CRM, виден в /admin
                    log.warning("scout notify %s: %s", lead.id, e)


def scan(s: Session, channel: str, posts: list[dict]) -> list[Lead]:
    """Новые заказы → лиды. Последний просмотренный пост запоминается, повторов не будет."""
    key = f"scout_last:{channel}"
    last = int(get_setting(s, key) or 0)
    since = utcnow() - timedelta(hours=FIRST_RUN_HOURS)
    out = []
    for p in sorted(posts, key=lambda x: x["id"]):
        if p["id"] <= last:
            continue
        if not last and p["date"] and p["date"] < since:
            continue
        if not is_order(p["text"]):
            continue
        ok, why = fit(p["text"])
        if not ok:
            log.info("scout skip %s: %s", p["url"], why)
            continue
        title = _title(p["text"])
        # тот же заказ иногда публикуют дважды подряд
        if s.scalar(select(Lead.id).where(Lead.shop_url == p["url"])) or s.scalar(
            select(Lead.id).where(Lead.source == "tg_orders", Lead.name == title, Lead.created_at >= utcnow() - timedelta(days=3))
        ):
            continue
        lead = Lead(
            name=title,
            marketplace=marketplace(p["text"]),
            shop_url=p["url"],
            contact_channel="exchange",
            source="tg_orders",
            status="draft_ready",
            score=70,
            data={"post_text": clean(p["text"])[:2000], "channel": channel, "posted": p["date"].isoformat() if p["date"] else ""},
            analysis={"draft": draft(p["text"])},
        )
        s.add(lead)
        s.flush()
        record(s, "lead_found", "lead", lead.id, source="tg_orders", url=p["url"])
        out.append(lead)
    if posts:
        set_setting(s, key, str(max(last, *(p["id"] for p in posts))))
    return out


def notify(chat_id: str, lead: Lead) -> None:
    from urllib.parse import quote

    reply = lead.analysis.get("draft", "")
    telegram.send_message(
        chat_id,
        f"🆕 Заказ: {lead.name}\n{lead.shop_url}\n\n{lead.data.get('post_text', '')[:900]}\n\n"
        "✅ Подходит: инфографика для карточек — это мы делаем.\n"
        "👇 Ниже отклик: нажмите на текст — он скопируется. Затем «Найти на Kwork», вставьте и отправьте.\n"
        "Ссылки на бота и Telegram в отклике на бирже не давайте.",
    )
    n = len(reply.encode("utf-16-le")) // 2
    telegram.send_message(
        chat_id, reply,
        telegram.keyboard([
            [("🔎 Найти на Kwork", "https://kwork.ru/projects?keyword=" + quote(lead.name[:60]))],
            [("📤 Откликнулся", f"oscout:sent:{lead.id}"), ("🚫 Не подходит", f"oscout:skip:{lead.id}")],
        ]),
        entities=[{"type": "code", "offset": 0, "length": n}],
    )


def mark(s: Session, lead_id: int, action: str) -> str:
    lead = s.get(Lead, lead_id)
    if lead is None:
        return "Заказ не найден."
    if action == "sent":
        lead.status = "contacted"
        record(s, "lead_contacted", "lead", lead.id, source=lead.source)
        return "📤 Отмечено: отклик отправлен. Если заказчик ответит — нажмите /stats, чтобы следить за воронкой."
    lead.status = "rejected"
    return "🚫 Пропускаем этот заказ."
