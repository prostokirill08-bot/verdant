"""Production Agent: из фото и фактов клиента — готовый комплект слайдов + SEO.

Конвейер: копирайтинг → вырезка товара → (фон AI) → рендер → QC → доработка → упаковка.
Если после доработок QC не пройден — заказ уходит человеку, клиент не получает брак.
"""
from __future__ import annotations

import io
import logging
import shutil
import zipfile
from pathlib import Path

from PIL import Image
from sqlalchemy.orm import Session

from ..config import get_settings
from ..events import escalate, record
from ..imaging.cutout import cut_product
from ..imaging.render import palette_for, renderer, to_data_uri
from ..llm.providers import get_image_gen
from ..models import Order, OrderItem, Task, utcnow
from ..pricing import TARIFFS
from ..queue import PermanentError, enqueue, handler
from . import qc
from .base import agent_run
from .copywriter import fallback_content, plan_slides, write_content, cover_variants

log = logging.getLogger("vitrinalab.production")

ALT_PALETTES = ["warm", "fresh", "sport", "beauty", "home", "tech", "premium", "kids"]

BG_PROMPTS = {
    "beauty": "мягкий студийный фон, розовые шёлковые складки, лепестки, рассеянный свет, без предметов в центре",
    "kids": "яркий весёлый студийный фон, пастельные геометрические фигуры, конфетти, без предметов в центре",
    "tech": "тёмный технологичный фон, неоновые голубые линии, глубина, без предметов в центре",
    "home": "уютный интерьерный фон, светлое дерево, лён, мягкий дневной свет, размытый, без предметов в центре",
    "sport": "динамичный спортивный фон, светлый, синие акценты, размытие движения, без предметов в центре",
    "fresh": "свежий натуральный фон, зелёные листья, капли воды, мягкий свет, без предметов в центре",
    "premium": "премиальный тёмный фон, золотые блики, мрамор, без предметов в центре",
    "warm": "тёплый студийный фон, бежевые тона, мягкие тени, подиум, без предметов в центре",
}


def item_dir(item: OrderItem) -> Path:
    d = get_settings().files_dir / "orders" / str(item.order_id) / f"item_{item.id}"
    d.mkdir(parents=True, exist_ok=True)
    return d


def item_palette(item: OrderItem, content: dict) -> str | dict:
    """Пожелания клиента важнее автоматического выбора по категории."""
    d = item.design or {}
    if d.get("palette"):
        return d["palette"]
    return palette_for(content.get("category", ""), item.product_name, item.features)


def design_note(item: OrderItem) -> str:
    w = (item.design or {}).get("wishes", "")
    return f"Пожелания клиента к стилю и акцентам (учитывай в тоне и порядке фактов, но не добавляй новых фактов): {w}" if w else ""


def _source_text(item: OrderItem) -> str:
    return f"{item.product_name}\n{item.features}\n{item.revision_note}"


def _product_assets(item: OrderItem):
    cut = cut_product(item.photo_path)
    img = cut.image
    img.thumbnail((1400, 1400), Image.LANCZOS)
    return cut.method, to_data_uri(img)


def _background(s: Session, run, category: str, seed: int) -> str | None:
    gen = get_image_gen()
    if gen is None:
        return None
    try:
        raw = gen.generate(BG_PROMPTS.get(category, BG_PROMPTS["warm"]), seed=seed)
        run.add_usage(images=1)
        img = Image.open(io.BytesIO(raw)).convert("RGB")
        img.thumbnail((900, 1200))
        return to_data_uri(img, "JPEG")
    except Exception as e:  # noqa: BLE001 — фон необязателен, есть CSS-фон
        log.warning("bg generation failed: %s", e)
        return None


# ---------------- превью (бесплатный лид-магнит) ----------------


@handler("make_preview")
def make_preview(s: Session, payload: dict, task: Task) -> None:
    item = s.get(OrderItem, payload["item_id"])
    if item is None:
        raise PermanentError("нет товара")
    order = item.order
    with agent_run(s, "production", "preview", task.id) as run:
        if not item.content:
            item.content = write_content(s, run, item.product_name, item.features, item.marketplace, note=design_note(item))
        method, product_uri = _product_assets(item)
        palette = item_palette(item, item.content)
        slide = plan_slides(item.content, 1)[0]
        out = item_dir(item) / "preview.jpg"
        res = renderer.render(slide, palette, product_uri, out, frame=(method == "frame"), watermark=True)
        if res.overflow:  # текст не влез — берём безопасный детерминированный вариант
            item.content = fallback_content(item.product_name, item.features, item.marketplace)
            slide = plan_slides(item.content, 1)[0]
            res = renderer.render(slide, palette, product_uri, out, frame=(method == "frame"), watermark=True)
        item.preview_path = str(out)
        item.status = "preview_ready"
        run.row.summary = f"preview item {item.id} cutout={method}"
    if order.status in ("draft", "preview_queued"):
        order.status = "preview_ready"
    record(s, "preview_ready", "order", order.id, item_id=item.id, cutout=method)
    n = int((item.design or {}).get("previews", 0))
    enqueue(s, "notify_client", {"order_id": order.id, "event": "preview_ready"}, idempotency_key=f"notify:preview:{item.id}:d{n}")


# ---------------- полное производство ----------------


@handler("produce_order")
def produce_order(s: Session, payload: dict, task: Task) -> None:
    order = s.get(Order, payload["order_id"])
    if order.status not in ("paid", "in_production", "revision"):
        return
    order.status = "in_production"
    for it in order.items:
        if it.status not in ("done",) or payload.get("revision"):
            if it.photo_path:
                enqueue(s, "produce_item", {"item_id": it.id}, idempotency_key=f"produce:{it.id}:r{it.revision}")
    record(s, "production_started", "order", order.id)


def _render_all(item: OrderItem, content: dict, slides_n: int, covers_n: int, product_uri: str, frame: bool, bg: str | None, out: Path):
    palette = item_palette(item, content)
    renders = []
    for i, slide in enumerate(plan_slides(content, slides_n), start=1):
        renders.append(renderer.render(slide, palette, product_uri, out / f"{i:02d}_{slide['type']}.jpg", frame=frame, bg_uri=bg if slide["type"] == "cover" else None))
    alt = [palette] + [p for p in ALT_PALETTES if p != palette]  # варианты обложки: ваша палитра + альтернативы для A/B
    for j, slide in enumerate(cover_variants(content, covers_n)[1:], start=2):
        renders.append(renderer.render(slide, alt[j - 1], product_uri, out / f"cover_variant_{j}.jpg", frame=frame))
    return renders


def _package(item: OrderItem, content: dict, out: Path) -> Path:
    (out / "SEO.txt").write_text(
        f"НАЗВАНИЕ:\n{content['title_seo']}\n\nОПИСАНИЕ:\n{content['description']}\n\n"
        f"КЛЮЧЕВЫЕ ФРАЗЫ:\n" + "\n".join(content.get("keywords", [])),
        encoding="utf-8",
    )
    (out / "README.txt").write_text(
        "Слайды 01, 02… — в порядке загрузки в карточку (первый — обложка).\n"
        "cover_variant_* — альтернативные обложки для A/B-теста.\n"
        "Формат 1440×1920 (3:4) подходит для Wildberries и Ozon.\n",
        encoding="utf-8",
    )
    zpath = out.parent / f"{out.name}.zip"
    with zipfile.ZipFile(zpath, "w", zipfile.ZIP_DEFLATED) as z:
        for f in sorted(out.iterdir()):
            z.write(f, f.name)
    return zpath


@handler("produce_item")
def produce_item(s: Session, payload: dict, task: Task) -> None:
    item = s.get(OrderItem, payload["item_id"])
    order = item.order
    t = TARIFFS[order.tariff]
    out = item_dir(item) / f"r{item.revision}"
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)
    item.status = "producing"
    item.attempts += 1

    with agent_run(s, "production", "produce_item", task.id) as run:
        content = item.content if (item.content and not item.revision_note) else None
        if content is None or item.revision_note:
            note = "\n".join(x for x in (design_note(item), item.revision_note) if x)
            content = write_content(s, run, item.product_name, item.features, item.marketplace, note=note)
        method, product_uri = _product_assets(item)
        bg = _background(s, run, content.get("category", "warm"), seed=item.id * 10 + item.revision)
        renders = _render_all(item, content, t.slides, t.cover_variants, product_uri, method == "frame", bg, out)
        run.row.summary = f"item {item.id} rev {item.revision}: {len(renders)} изображений, тексты={content.get('_source')}"

    # --- QC с одной автоматической доработкой ---
    with agent_run(s, "qc", "review", task.id) as qrun:
        report = qc.review(content, _source_text(item), item.marketplace, renders, method)
        if not report["passed"] and content.get("_source") != "fallback":
            record(s, "qc_rework", "order_item", item.id, errors=report["errors"][:5])
            content = fallback_content(item.product_name, item.features, item.marketplace)
            shutil.rmtree(out)
            out.mkdir(parents=True)
            renders = _render_all(item, content, t.slides, t.cover_variants, product_uri, method == "frame", bg, out)
            report = qc.review(content, _source_text(item), item.marketplace, renders, method)
            report["reworked"] = True
        qrun.row.summary = f"item {item.id}: {'OK' if report['passed'] else 'FAIL'} {report['errors'][:3]}"

    item.content = content
    item.qc_report = report
    record(s, "qc_passed" if report["passed"] else "qc_failed", "order_item", item.id, errors=report["errors"][:5])
    if report["passed"]:
        item.zip_path = str(_package(item, content, out))
        item.result_dir = str(out)
        item.status = "done"
        record(s, "product_created", "order_item", item.id, order_id=order.id, slides=len(renders))
    else:
        item.status = "needs_human"
        escalate(
            s,
            "qc",
            f"Заказ #{order.id}: товар «{item.product_name}» не прошёл контроль качества",
            "\n".join(report["errors"]),
            severity="warn",
            entity="order",
            entity_id=order.id,
        )
    enqueue(s, "finalize_order", {"order_id": order.id}, idempotency_key=f"finalize:{order.id}:{item.id}:r{item.revision}:a{item.attempts}")


@handler("finalize_order")
def finalize_order(s: Session, payload: dict, task: Task) -> None:
    order = s.get(Order, payload["order_id"])
    items = [i for i in order.items if i.photo_path]
    if not items or any(i.status in ("new", "preview_ready", "producing") for i in items):
        return  # ждём остальные товары
    if any(i.status == "needs_human" for i in items):
        order.status = "needs_human"
        return
    order.status = "ready"
    order.updated_at = utcnow()
    version = "-".join(f"{i.id}r{i.revision}" for i in items)  # новая версия → новая доставка
    enqueue(s, "deliver_order", {"order_id": order.id}, idempotency_key=f"deliver:{order.id}:{version}")


# ---------------- пожелания клиента к дизайну ----------------

MAX_DESIGN_PREVIEWS = 3


def apply_design(s: Session, item: OrderItem, wishes: str = "", ref_path: str | None = None) -> str:
    """Сохранить пожелания и референс, пересчитать палитру. Возвращает понятное клиенту описание, что учтено."""
    from ..imaging import palette as pal

    d = dict(item.design or {})
    if wishes.strip():
        d["wishes"] = (d.get("wishes", "") + "\n" + wishes.strip()).strip()[:1500]
    if ref_path:
        d["ref_path"] = ref_path
    applied = []
    if ref_path:
        d["palette"], d["source"] = pal.from_image(ref_path), "image"
        applied.append("цвета и настроение — по вашему референсу")
    elif wishes.strip():
        by_words = pal.from_wishes(d.get("wishes", ""))
        if by_words:
            d["palette"], d["source"] = by_words, "words"
            applied.append("цветовая гамма — по вашему описанию")
        elif not d.get("palette"):
            applied.append("цвет не распознал — гамму подберу по категории товара")
    if d.get("wishes"):
        applied.append("акценты и тон текста — с учётом пожеланий")
    item.design = d
    item.content = {}  # тексты пересоберутся с учётом пожеланий
    record(s, "design_wishes", "order_item", item.id, has_ref=bool(ref_path), source=d.get("source", ""))
    return "; ".join(applied) or "пожелания сохранены"


def request_design_preview(s: Session, item: OrderItem) -> bool:
    """Перерисовать бесплатное превью с учётом пожеланий (не больше MAX_DESIGN_PREVIEWS раз)."""
    d = dict(item.design or {})
    n = int(d.get("previews", 0))
    if n >= MAX_DESIGN_PREVIEWS:
        return False
    d["previews"] = n + 1
    item.design = d
    enqueue(s, "make_preview", {"item_id": item.id}, idempotency_key=f"preview:{item.id}:d{n + 1}")
    return True
