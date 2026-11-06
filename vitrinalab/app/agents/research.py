"""Research & Leads Agent: оценка лидов, персональные черновики сообщений, аналитика воронки.

Источники лидов — только законные: входящие заявки, ручной ввод/CSV из открытых каталогов,
публичные деловые контакты. Закрытые персональные данные не собираем.

Первое сообщение лиду НЕ отправляется автоматически: по ч.1 ст.18 закона «О рекламе»
реклама по сетям электросвязи требует предварительного согласия адресата. Черновик
уходит владельцу на одобрение и отправляется вручную (или автоматически — только тем,
кто сам оставил контакт и согласие).
"""
from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..events import record
from ..models import Client, Lead, Message, Order, OrderItem, Payment, Task
from ..queue import handler
from .base import agent_run, ask_llm, since


def score_lead(data: dict, contact: str) -> tuple[int, str, list[str]]:
    """Прозрачная формула приоритета (0–100) — объяснимая владельцу."""
    score, why = 0, []

    def num(key):
        try:
            return float(str(data.get(key, "")).replace(",", "."))
        except ValueError:
            return None

    if str(data.get("has_infographics", "")).lower() in ("0", "false", "нет", "no"):
        score += 30
        why.append("нет инфографики (+30)")
    photos = num("photos")
    if photos is not None and photos < 5:
        score += 15
        why.append(f"мало фото: {int(photos)} (+15)")
    sku = num("sku")
    if sku is not None and sku >= 10:
        score += 20
        why.append(f"{int(sku)} SKU — потенциал пакета (+20)")
    reviews = num("reviews")
    if reviews is not None and reviews >= 50:
        score += 10
        why.append("активный продавец, есть отзывы (+10)")
    rating = num("rating")
    if rating is not None and rating < 4.6:
        score += 5
        why.append("рейтинг ниже 4.6 (+5)")
    if contact:
        score += 20
        why.append("есть публичный деловой контакт (+20)")
    segment = "catalog" if sku is not None and sku >= 10 else "single"
    return min(score, 100), segment, why


OUTREACH_SYSTEM = """Ты пишешь первое деловое сообщение продавцу маркетплейса от имени студии {brand}.
Честно укажи, что пишет AI-ассистент студии. Тон — уважительный, без давления, до 500 символов.
Опирайся только на данные о продавце. Не обещай рост продаж в цифрах. Не называй скидок.
Предложи бесплатное превью обложки для одного товара. Добавь фразу: «Если неинтересно — просто ответьте "нет", больше не напишу»."""


def fallback_outreach(lead: Lead, why: list[str]) -> str:
    brand = get_settings().brand_name
    hook = "заметил, что в карточках пока нет инфографики" if any("инфограф" in w for w in why) else "посмотрел ваши карточки"
    return (
        f"Здравствуйте! Это AI-ассистент студии {brand}. {hook.capitalize()} в магазине «{lead.name}».\n\n"
        "Мы делаем инфографику и SEO-тексты для карточек WB и Ozon за 24 часа на основе ваших реальных фото. "
        "Могу бесплатно сделать превью обложки для одного товара — вы оцените, подходит ли.\n\n"
        "Если неинтересно — просто ответьте «нет», больше не напишу."
    )


@handler("analyze_lead")
def analyze_lead(s: Session, payload: dict, task: Task) -> None:
    lead = s.get(Lead, payload["lead_id"])
    score, segment, why = score_lead(lead.data or {}, lead.contact)
    lead.score, lead.segment = score, segment
    lead.analysis = {"why": why}
    with agent_run(s, "research", "analyze_lead", task.id) as run:
        user = f"Магазин: {lead.name}\nМаркетплейс: {lead.marketplace}\nДанные: {lead.data}\nНаблюдения: {'; '.join(why)}"
        draft = ask_llm(
            s,
            run,
            OUTREACH_SYSTEM.format(brand=get_settings().brand_name),
            user,
            fallback=lambda: fallback_outreach(lead, why),
            validate=lambda t: isinstance(t, str) and 80 < len(t) < 900 and "нет" in t,
        )
        run.row.summary = f"lead {lead.id}: score {score}"
    msg = Message(lead_id=lead.id, channel=lead.contact_channel or "manual", direction="out", text=draft, status="pending_approval", agent="sales", kind="outreach")
    s.add(msg)
    s.flush()
    lead.status = "draft_ready"
    if lead.source == "manual":  # пачки из CSV-импорта не шлём по одной — они ждут в /approvals
        from .owner import notify_pending_message

        notify_pending_message(s, msg)
    record(s, "lead_analyzed", "lead", lead.id, score=score, segment=segment)


@handler("funnel_digest")
def funnel_digest(s: Session, payload: dict, task: Task) -> None:
    """Еженедельная аналитика воронки: где теряем клиентов, какие категории и площадки покупают."""
    from .delivery import enqueue_owner_text

    week = since(24 * 7)
    orders = s.scalar(select(func.count(Order.id)).where(Order.created_at >= week)) or 0
    previews = s.scalar(select(func.count(OrderItem.id)).where(OrderItem.created_at >= week, OrderItem.preview_path != "")) or 0
    paid = s.scalar(select(func.count(Payment.id)).where(Payment.status == "succeeded", Payment.confirmed_at >= week)) or 0
    mp = s.execute(
        select(OrderItem.marketplace, func.count(OrderItem.id)).join(Order).where(Order.paid_at.is_not(None), Order.paid_at >= week).group_by(OrderItem.marketplace)
    ).all()
    sources = s.execute(select(Client.source, func.count(Client.id)).where(Client.created_at >= week).group_by(Client.source)).all()
    conv = f"{paid / orders:.0%}" if orders else "—"
    text = (
        "🔎 Аналитика воронки за 7 дней\n"
        f"Заявок (заказов-черновиков): {orders}\nПревью сделано: {previews}\nОплат: {paid}\nКонверсия заявка→оплата: {conv}\n"
        f"Площадки оплаченных товаров: {', '.join(f'{m}: {n}' for m, n in mp) or 'нет'}\n"
        f"Новые клиенты по источникам: {', '.join(f'{src or 'неизв.'}: {n}' for src, n in sources) or 'нет'}"
    )
    if orders >= 10 and paid == 0:
        text += "\n\n⚠️ Превью делаем, но не покупают — гипотезы: цена, качество превью, доверие. Предлагаю показать 5 последних превью и проверить их вручную."
    enqueue_owner_text(s, text)
