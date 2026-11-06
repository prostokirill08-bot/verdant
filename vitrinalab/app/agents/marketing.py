"""Marketing Agent: контент-план и посты для Telegram-канала. Публикация — после одобрения владельца."""
from __future__ import annotations

from datetime import timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..events import flag, record
from ..integrations import telegram
from ..models import ContentPost, Task, utcnow
from ..queue import RetryLater, handler
from .base import agent_run, ask_llm

TOPICS = [
    "5 ошибок в главном фото карточки, из-за которых по ней не кликают",
    "Что нельзя размещать на фото товара на Wildberries и Ozon: цены, контакты, ссылки",
    "Почему формат 3:4 и 1440×1920 — безопасный выбор для обеих площадок",
    "Как написать SEO-название карточки: структура и типичные ошибки",
    "Зачем тестировать несколько вариантов обложки и как это делать",
    "Инфографика без «воды»: какие факты о товаре действительно важны покупателю",
    "Как сфотографировать товар на телефон, чтобы из фото получилась хорошая карточка",
    "Почему мы не перерисовываем товар нейросетью и используем ваше реальное фото",
]

FALLBACK_POSTS = {
    TOPICS[0]: "5 ошибок главного фото карточки:\n\n1. Товар занимает меньше половины кадра.\n2. Мелкий текст, который не читается в ленте с телефона.\n3. Больше 3–4 тезисов на обложке.\n4. Фон сливается с товаром.\n5. Нет главного отличия — покупатель не понимает, чем этот товар лучше соседнего.\n\nПришлите фото товара боту — покажем бесплатное превью обложки.",
    TOPICS[1]: "Что не стоит размещать на изображениях карточки:\n\n— цены и скидки;\n— телефоны, ссылки, e-mail;\n— «лучший», «№1» без подтверждения (это ещё и закон о рекламе);\n— обещания лечебного эффекта.\n\nМы проверяем каждый слайд на эти пункты автоматически, до отправки клиенту.",
    TOPICS[2]: "Почему 1440×1920 (3:4)?\n\nЭто вертикальный формат, который корректно отображается и на Wildberries, и на Ozon, и не теряет качество на экранах с высокой плотностью. Все наши слайды делаются именно в нём.",
    TOPICS[3]: "Формула SEO-названия: что это + ключевая характеристика + для кого/для чего.\n\nПример: «Термокружка 450 мл с крышкой, для кофе и чая».\n\nНе перегружайте название повторами слов — площадки это не любят.",
    TOPICS[4]: "Один товар — несколько обложек. Обложка влияет на то, кликнут ли по карточке в ленте. В тарифе «Стандарт» вы получаете 3 варианта обложки, чтобы сравнить их и оставить лучший.",
    TOPICS[5]: "Хорошая инфографика — это факты, а не эпитеты. «Держит тепло 8 часов» работает лучше, чем «невероятное качество». Мы используем только факты, которые прислал продавец.",
    TOPICS[6]: "Как снять товар на телефон для карточки:\n\n1. Светлый однотонный фон (лист ватмана подойдёт).\n2. Дневной свет из окна, без вспышки.\n3. Товар целиком в кадре, немного места по краям.\n4. Камера на уровне товара.\n\nДальше фон отделим и оформим сами.",
    TOPICS[7]: "Почему мы не генерируем сам товар нейросетью?\n\nНейросеть может «додумать» детали, и покупатель получит не то, что видел. Мы берём ваше реальное фото и оформляем вокруг него — так честнее и для покупателя, и для рейтинга.",
}

SYSTEM = """Ты — маркетолог студии {brand} (инфографика и SEO для карточек WB/Ozon). Пиши пост для Telegram-канала селлеров:
до 900 символов, конкретные советы, без выдуманной статистики и кейсов, без «лучший/№1», без скидок.
В конце — мягкий призыв прислать фото товара боту для бесплатного превью. Только текст поста."""


@handler("content_plan")
def content_plan(s: Session, payload: dict, task: Task) -> None:
    """Готовит посты на неделю (по одному в день, 3 поста)."""
    done = s.scalar(select(func.count(ContentPost.id))) or 0
    cfg = get_settings()
    start = utcnow().replace(hour=7, minute=0, second=0, microsecond=0) + timedelta(days=1)  # 10:00 МСК
    auto = flag(s, "auto_publish_posts")
    with agent_run(s, "marketing", "content_plan", task.id) as run:
        for i in range(3):
            topic = TOPICS[(done + i) % len(TOPICS)]
            text = ask_llm(
                s,
                run,
                SYSTEM.format(brand=cfg.brand_name),
                f"Тема: {topic}",
                fallback=lambda t=topic: FALLBACK_POSTS[t],
                validate=lambda t: isinstance(t, str) and 100 < len(t) < 1200 and "лучш" not in t.lower(),
                temperature=0.7,
            )
            s.add(ContentPost(topic=topic, text=text, status="approved" if auto else "pending_approval", scheduled_at=start + timedelta(days=i * 2)))
        run.row.summary = "3 поста в контент-план"
    record(s, "content_planned", "content", None, count=3)


@handler("publish_posts")
def publish_posts(s: Session, payload: dict, task: Task) -> None:
    cfg = get_settings()
    if not (cfg.telegram_channel_id and telegram.enabled()):
        return
    due = s.scalars(select(ContentPost).where(ContentPost.status == "approved", ContentPost.scheduled_at <= utcnow())).all()
    for post in due:
        try:
            telegram.send_message(cfg.telegram_channel_id, post.text)
        except telegram.TelegramError as e:
            post.status = "failed"
            raise RetryLater(str(e)) from e
        post.status = "published"
        post.published_at = utcnow()
        record(s, "post_published", "content", post.id)

