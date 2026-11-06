"""Режим «ChatGPT»: картинки делает владелец в ChatGPT по готовым промптам, всё остальное — система.

Цикл: система пишет промпты (только факты клиента + пожелания) → бот присылает владельцу фото товара и промпты →
владелец присылает картинки из ChatGPT → система приводит их к 3:4 1440×1920 → владелец сверяет товар с оригиналом
и жмёт «Отправить клиенту» → превью с водяным знаком или финальный архив + SEO уходят клиенту.
"""
from __future__ import annotations

import io
import re
import shutil
import zipfile
from pathlib import Path

from PIL import Image, ImageFilter, ImageOps
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..events import escalate, get_setting, owner_chat_id, record
from ..integrations import telegram
from ..models import ManualJob, OrderItem, utcnow
from ..pricing import TARIFFS
from ..queue import enqueue

W, H = 1440, 1920
FORBIDDEN = "цены, скидки, телефоны, ссылки, слова «лучший», «самый», «№1», «качественный», «премиальный» и любые факты, которых нет в списке"

ATMOSPHERE = [
    (r"ёлоч|елоч|новогод|рождеств|гирлянд|снеж", "новогодняя атмосфера: тёплые огоньки гирлянды в боке, еловые ветки, шишки, немного снега, праздничный свет"),
    (r"крем|сыворот|космет|уход|маск|шампун|парфюм|помад", "нежная бьюти-атмосфера: мрамор или шёлк, мягкий рассеянный свет, лепестки, пастельные тона"),
    (r"детск|игрушк|ребен|малыш|конструктор", "яркая дружелюбная атмосфера: светлые пастельные цвета, мягкие формы, игривые детали"),
    (r"кухн|посуд|кружк|термо|чай|кофе|тарел|сковород", "уютная кухня: светлое дерево, утренний свет, размытый интерьер на фоне"),
    (r"спорт|фитнес|трениров|йог|гантел|бег", "динамичная спортивная атмосфера: светлый фон, энергичные акценты, ощущение движения"),
    (r"usb|кабел|заряд|наушник|колонк|гаджет|смарт|электрон", "технологичная атмосфера: тёмный фон, неоновые акценты, глубина и блики"),
    (r"дом|интерьер|текстил|плед|подушк|свеч|хранен", "уютный интерьер: светлые натуральные материалы, мягкий дневной свет"),
]
DEFAULT_ATMOSPHERE = "чистый современный студийный фон с мягкими тенями и аккуратным подиумом, светлые тона"


def mode(s: Session) -> str:
    return get_setting(s, "production_mode") or "auto"


def _atmosphere(item: OrderItem) -> str:
    text = f"{item.product_name} {item.features}".lower()
    for pat, desc in ATMOSPHERE:
        if re.search(pat, text):
            return desc
    return DEFAULT_ATMOSPHERE


def _rules(item: OrderItem) -> str:
    mp = {"wb": "Wildberries", "ozon": "Ozon", "ym": "Яндекс Маркет"}.get(item.marketplace, "Wildberries")
    wishes = (item.design or {}).get("wishes", "")
    lines = [
        f"Маркетплейс: {mp}. Формат — вертикальный 3:4.",
        "ВАЖНО: товар — строго как на прикреплённом фото: та же форма, цвета, узоры, детали, количество и упаковка. "
        "Ничего в самом товаре не перерисовывай, не меняй и не добавляй.",
        f"Фон и атмосфера: {_atmosphere(item)}.",
    ]
    if wishes:
        lines.append(f"Пожелания клиента к стилю: {wishes}.")
    if (item.design or {}).get("ref_path"):
        lines.append("Второй прикреплённый файл — референс клиента: возьми из него цвета и настроение, макет не копируй.")
    lines.append("Стиль: современная продающая инфографика для маркетплейса, крупный читаемый шрифт, товар занимает 50–60% кадра.")
    lines.append(f"Не пиши на картинке: {FORBIDDEN}. Весь текст — по-русски, без ошибок, ровно как указано.")
    return "\n".join(lines)


def build_prompts(item: OrderItem, stage: str) -> list[str]:
    """Промпты для ChatGPT. preview — одна обложка; final — по слайду на сообщение."""
    from .copywriter import cover_variants, plan_slides

    c = item.content
    rules = _rules(item)
    cv = c["cover"]
    badges = "\n".join(f"— «{b}»" for b in cv.get("badges", [])) or "— без плашек"
    cover = (
        "Я прикрепил фото товара. Сделай ОБЛОЖКУ карточки товара.\n"
        f"{rules}\n\nТекст на обложке (только этот):\n— заголовок: «{cv['headline']}»\n"
        + (f"— подзаголовок: «{cv['subline']}»\n" if cv.get("subline") else "")
        + f"— плашки с иконками:\n{badges}"
    )
    if stage == "preview":
        return [cover]
    t = TARIFFS[item.order.tariff]
    bodies = []
    for sl in plan_slides(c, t.slides)[1:]:
        if sl["type"] == "benefits":
            bodies.append("Слайд «Преимущества»: заголовок «" + sl["title"] + "», блоки с иконками:\n" + "\n".join(
                f"— «{b['title']}»" + (f": {b['text']}" if b.get("text") else "") for b in sl["cards"]))
        elif sl["type"] == "specs":
            bodies.append("Слайд «Характеристики»: заголовок «" + sl["title"] + "», аккуратная таблица:\n" + "\n".join(f"— {k}: {v}" for k, v in sl["rows"]))
        elif sl["type"] == "list":
            bodies.append(f"Слайд «{sl['eyebrow']}»: заголовок «{sl['title']}», список с иконками:\n" + "\n".join(f"— {p}" for p in sl["points"]))
        else:
            bodies.append("Слайд с одной главной особенностью: " + (f"крупно «{sl['number']}», " if sl.get("number") else "")
                          + f"заголовок «{sl['title']}»" + (f", пояснение «{sl['text']}»" if sl.get("text") else ""))
    # фактов мало — добиваем слайдами, которые не требуют новых фактов
    extra = [
        f"Слайд-атмосфера: товар в реальной обстановке использования ({_atmosphere(item)}). Текст — только заголовок «{cv['headline']}» или без текста.",
        "Слайд крупного плана: увеличенный фрагмент товара с того же фото — детали, фактура, рисунок. Без нового текста.",
        "Слайд «Товар целиком»: товар полностью, на чистом фоне в стиле карточки, аккуратная композиция. Без нового текста.",
        f"Слайд-настроение: товар в композиции с тематическим декором ({_atmosphere(item)}), без текста.",
    ]
    i = 0
    while len(bodies) < t.slides - 1:
        bodies.append(extra[i % len(extra)])
        i += 1
    prompts = [f"СЛАЙД 1 из {t.slides} (обложка). {cover}"]
    for n, body in enumerate(bodies[: t.slides - 1], start=2):
        prompts.append(f"СЛАЙД {n} из {t.slides}. Продолжаем ту же карточку в едином стиле с обложкой. Товар — тот же, с того же фото.\n{body}\n\nПравила: не меняй товар; не пиши {FORBIDDEN}.")
    for j, _ in enumerate(cover_variants(c, t.cover_variants)[1:], start=2):
        prompts.append(f"ВАРИАНТ ОБЛОЖКИ {j} (для A/B-теста): тот же текст, что на слайде 1, но другая композиция и другой фон. Товар не меняй.")
    return prompts


# ---------------- создание задания и уведомление владельца ----------------


def create_job(s: Session, item: OrderItem, stage: str) -> ManualJob:
    for old in s.scalars(select(ManualJob).where(ManualJob.item_id == item.id, ManualJob.stage == stage, ManualJob.status.in_(["waiting", "review"]))):
        old.status = "cancelled"
    job = ManualJob(item_id=item.id, stage=stage, prompts=build_prompts(item, stage))
    s.add(job)
    s.flush()
    item.status = "manual_" + stage
    record(s, "manual_job_created", "order_item", item.id, job_id=job.id, stage=stage)
    enqueue(s, "send_manual_job", {"job_id": job.id}, idempotency_key=f"manual_job:{job.id}")
    return job


def send_job_to_owner(s: Session, job: ManualJob) -> None:
    chat = owner_chat_id(s)
    if not (chat and telegram.enabled()):
        escalate(s, "production", f"Задание для ChatGPT №{job.id}: не привязан чат владельца", "Отправьте боту /owner <код>", "critical", notify=False)
        return
    item = job.item
    what = "ПРЕВЬЮ обложки" if job.stage == "preview" else f"КОМПЛЕКТ ({len(job.prompts)} картинок)"
    telegram.send_message(
        chat,
        f"🎨 Задание №{job.id}: {what} для заказа №{item.order_id}\nТовар: {item.product_name}\n\n"
        "1) Сохраните фото товара ниже и загрузите его в ChatGPT.\n"
        "2) По очереди отправляйте ChatGPT промпты из следующих сообщений (каждое — копируется целиком).\n"
        "3) Нажмите «📥 Прислать картинки» и отправьте сюда результаты — лучше файлом, без сжатия.\n"
        "4) Сверьте товар с оригиналом и нажмите «Отправить клиенту».",
    )
    telegram.send_document(chat, item.photo_path, caption="Фото товара — загрузите в ChatGPT")
    ref = (item.design or {}).get("ref_path")
    if ref and Path(ref).exists():
        telegram.send_document(chat, ref, caption="Референс клиента — тоже загрузите в ChatGPT")
    for p in job.prompts:
        telegram.send_message(chat, p)
    telegram.send_message(chat, f"Когда картинки готовы:", telegram.keyboard([[("📥 Прислать картинки", f"mjob:{job.id}")]]))


# ---------------- приём картинок ----------------


def to_marketplace(src: Path, dst: Path) -> tuple[int, int]:
    """Любую картинку → 1440×1920 (3:4). Ничего не обрезаем: недостающие поля — размытым продолжением краёв."""
    im = ImageOps.exif_transpose(Image.open(src)).convert("RGB")
    w, h = im.size
    target = 3 / 4
    if abs(w / h - target) > 0.01:
        if w / h < target:  # слишком узкая (например 2:3) — расширяем по бокам
            cw, ch = round(h * target), h
        else:  # слишком широкая — расширяем сверху и снизу
            cw, ch = w, round(w / target)
        bg = im.resize((cw, ch), Image.LANCZOS).filter(ImageFilter.GaussianBlur(40))
        bg.paste(im, ((cw - w) // 2, (ch - h) // 2))
        im = bg
    im = im.resize((W, H), Image.LANCZOS)
    dst.parent.mkdir(parents=True, exist_ok=True)
    im.save(dst, "JPEG", quality=92, optimize=True, progressive=True)
    return w, h


def add_image(s: Session, job: ManualJob, src: Path) -> int:
    from .production import item_dir

    n = len(job.images) + 1
    dst = item_dir(job.item) / f"manual_{job.id}" / f"{n:02d}.jpg"
    orig = to_marketplace(src, dst)
    job.images = [*job.images, {"path": str(dst), "orig": list(orig)}]
    return n


def finish_upload(s: Session, job: ManualJob) -> str:
    """Проверка комплекта перед показом владельцу. Возвращает текст для владельца."""
    need = len(job.prompts)
    got = len(job.images)
    small = [i + 1 for i, im in enumerate(job.images) if max(im["orig"]) < 1000]
    job.status = "review"
    lines = [f"Получено картинок: {got} из {need}."]
    if got < need:
        lines.append(f"⚠️ Не хватает {need - got} — можно дослать или отправить как есть.")
    if small:
        lines.append(f"⚠️ Картинки {', '.join(map(str, small))} пришли сжатыми (меньше 1000 px) — лучше отправлять файлом.")
    lines.append("Все приведены к формату маркетплейса 3:4, 1440×1920.")
    lines.append("\nПеред отправкой сверьте с оригиналом:\n— товар не перерисован (форма, цвета, узоры, количество)?\n— текст без ошибок и без выдуманных фактов?")
    return "\n".join(lines)


def _watermark(src: Path, dst: Path) -> None:
    from ..imaging.render import _env, renderer, to_data_uri

    html_tpl = _env.get_template("overlay.html")
    img = Image.open(src)
    img.thumbnail((1440, 1920))
    page = renderer._page()
    try:
        page.set_content(html_tpl.render(image=to_data_uri(img, "JPEG"), brand=get_settings().brand_name), wait_until="load")
        png = page.screenshot(type="png")
    finally:
        page.close()
    Image.open(io.BytesIO(png)).convert("RGB").save(dst, "JPEG", quality=88, optimize=True)


def approve(s: Session, job: ManualJob) -> str:
    """Владелец проверил — отправляем клиенту."""
    from .production import _package, item_dir

    if not job.images:
        raise ValueError("нет картинок")
    item = job.item
    order = item.order
    job.status = "done"
    if job.stage == "preview":
        out = item_dir(item) / "preview.jpg"
        _watermark(Path(job.images[0]["path"]), out)
        item.preview_path = str(out)
        item.status = "preview_ready"
        if order.status in ("draft", "preview_queued"):
            order.status = "preview_ready"
        record(s, "preview_ready", "order", order.id, item_id=item.id, manual=True)
        enqueue(s, "notify_client", {"order_id": order.id, "event": "preview_ready"}, idempotency_key=f"notify:preview:{item.id}:m{job.id}")
        return f"✅ Превью отправлено клиенту по заказу №{order.id}."
    out = item_dir(item) / f"r{item.revision}"
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)
    for i, im in enumerate(job.images, start=1):
        name = f"{i:02d}_slide.jpg" if i <= TARIFFS[order.tariff].slides else f"cover_variant_{i - TARIFFS[order.tariff].slides + 1}.jpg"
        shutil.copy(im["path"], out / name)
    item.zip_path = str(_package(item, item.content, out))
    item.result_dir = str(out)
    item.status = "done"
    item.qc_report = {"passed": True, "errors": [], "warnings": [], "manual": True}
    record(s, "product_created", "order_item", item.id, order_id=order.id, slides=len(job.images), manual=True)
    enqueue(s, "finalize_order", {"order_id": order.id}, idempotency_key=f"finalize:{order.id}:{item.id}:m{job.id}")
    return f"✅ Заказ №{order.id}: комплект собран ({len(job.images)} картинок + SEO), отправляю клиенту."


def redo(s: Session, job: ManualJob) -> None:
    job.images = []
    job.status = "waiting"


def waiting_jobs(s: Session) -> list[ManualJob]:
    return list(s.scalars(select(ManualJob).where(ManualJob.status.in_(["waiting", "review"])).order_by(ManualJob.id)))


def zip_check(path: str) -> list[str]:
    with zipfile.ZipFile(path) as z:
        return z.namelist()


# ---------------- задачи очереди ----------------

from ..queue import RetryLater, handler  # noqa: E402


@handler("send_manual_job")
def send_manual_job(s: Session, payload: dict, task) -> None:
    job = s.get(ManualJob, payload["job_id"])
    if job is None or job.status != "waiting":
        return
    try:
        send_job_to_owner(s, job)
    except telegram.TelegramError as e:
        raise RetryLater(str(e)) from e
