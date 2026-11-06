"""Бесплатный экспресс-разбор карточки (лид-магнит).

Честно проверяем только то, что измеряется автоматически: формат и разрешение главного фото,
«голое фото без инфографики», блёклость, SEO-название. Вкус и «продаёт ли картинка» автоматически
не оцениваем — каждый разбор уходит владельцу, чтобы он мог дописать живой совет.
"""
from __future__ import annotations

import re

import numpy as np
from PIL import Image, ImageFilter, ImageOps

from .copywriter import TITLE_LIMIT

WB_RE = re.compile(r"wildberries\.ru/catalog/(\d+)|wb\.ru/\S*?(\d{6,})", re.I)
OZON_RE = re.compile(r"ozon\.ru/(?:product|t)/\S+", re.I)
URL_RE = re.compile(r"https?://\S+")


def parse_caption(text: str) -> dict:
    text = (text or "").strip()
    out = {"link": "", "marketplace": "", "article": "", "title": ""}
    m = URL_RE.search(text)
    if m:
        out["link"] = m.group(0)
        if "wildberries" in out["link"] or "wb.ru" in out["link"]:
            out["marketplace"] = "wb"
            w = WB_RE.search(out["link"])
            out["article"] = next((g for g in (w.groups() if w else []) if g), "")
        elif "ozon" in out["link"]:
            out["marketplace"] = "ozon"
    rest = URL_RE.sub("", text).strip(" \n-—:")
    out["title"] = rest.splitlines()[0].strip() if rest else ""
    return out


def analyze_image(path: str) -> tuple[list[str], list[str]]:
    good, warn = [], []
    im = ImageOps.exif_transpose(Image.open(path)).convert("RGB")
    w, h = im.size
    ratio = w / h
    if ratio < 0.6:
        warn.append("Похоже на скриншот экрана — формат и разрешение по нему не оценить. Для точной проверки пришлите саму картинку обложки.")
    else:
        if abs(ratio - 0.75) < 0.02:
            good.append("Формат 3:4 — подходит для Wildberries и Ozon.")
        elif abs(ratio - 1) < 0.02:
            warn.append("Формат 1:1 (квадрат): для Ozon допустим, но на Wildberries карточка будет обрезана — лучше вертикальный 3:4.")
        else:
            warn.append(f"Нестандартные пропорции ({w}×{h}). Для WB и Ozon безопаснее вертикальный формат 3:4.")
        if min(w, h) < 900:
            warn.append(f"Низкое разрешение ({w}×{h}): на телефоне при увеличении будет мыльно. Рекомендуем не меньше 900×1200, лучше 1440×1920.")
        else:
            good.append(f"Разрешение достаточное ({w}×{h}).")
    sm = im.copy()
    sm.thumbnail((512, 512))
    g = sm.convert("L")
    edges = np.asarray(g.filter(ImageFilter.FIND_EDGES)).astype(float) / 255
    a = np.asarray(sm).astype(float)
    rg, yb = a[..., 0] - a[..., 1], 0.5 * (a[..., 0] + a[..., 1]) - a[..., 2]
    colorful = float(np.sqrt(rg.std() ** 2 + yb.std() ** 2) + 0.3 * np.sqrt(rg.mean() ** 2 + yb.mean() ** 2))
    lum = np.asarray(g).astype(float) / 255
    if ratio >= 0.6 and edges.mean() < 0.03 and lum.mean() > 0.7:
        warn.append("Похоже на фото товара на однотонном фоне без инфографики. В выдаче рядом с карточками, где видны ключевые преимущества, такое фото часто проигрывает в кликах.")
    if colorful < 20 and lum.std() < 0.18:
        warn.append("Картинка блёклая и малоконтрастная — в ленте она может теряться среди соседних карточек.")
    elif colorful >= 20:
        good.append("Цвета достаточно контрастные, чтобы выделяться в ленте.")
    return good, warn


BANNED = re.compile(r"\bлучш\w*|\bсам(ый|ая|ое|ые)\b|№\s?1|\bуникальн\w*", re.I)


def analyze_title(title: str, marketplace: str) -> tuple[list[str], list[str]]:
    good, warn = [], []
    if not title:
        return good, ["Название не прислали — его тоже можно проверить: пришлите в подписи к фото."]
    limit = TITLE_LIMIT.get(marketplace or "wb", 60)
    n = len(title)
    if n > limit:
        warn.append(f"Название длиннее {limit} символов ({n}) — площадка может его обрезать.")
    elif n < 20:
        warn.append(f"Название короткое ({n} симв.): мало ключевых слов для поиска. Формула: что это + ключевая характеристика + для кого/для чего.")
    else:
        good.append(f"Длина названия в норме ({n} симв.).")
    words = [w.lower() for w in re.findall(r"[а-яёa-z]{3,}", title, re.I)]
    dups = sorted({w for w in words if words.count(w) > 1})
    if dups:
        warn.append(f"Повторы слов в названии ({', '.join(dups[:3])}) — площадки не любят переспам.")
    if sum(1 for c in title if c.isupper()) > 0.5 * max(1, sum(1 for c in title if c.isalpha())):
        warn.append("Много заглавных букв — выглядит как крик и хуже читается.")
    if BANNED.search(title):
        warn.append("Есть «лучший/самый/№1/уникальный» — без подтверждения это нарушает закон о рекламе и правила площадок.")
    if not re.search(r"\d", title):
        warn.append("В названии нет ни одной характеристики с цифрой (объём, размер, количество) — по таким запросам часто ищут.")
    return good, warn


def build_report(image_path: str, caption: str) -> tuple[str, dict]:
    info = parse_caption(caption)
    g1, w1 = analyze_image(image_path)
    g2, w2 = analyze_title(info["title"], info["marketplace"])
    good, warn = g1 + g2, w1 + w2
    lines = ["🔎 Экспресс-разбор вашей карточки (автоматическая проверка)\n"]
    if info["link"]:
        lines.append(f"Товар: {info['link']}\n")
    if good:
        lines.append("✅ Что хорошо:\n" + "\n".join(f"— {x}" for x in good))
    if warn:
        lines.append("\n⚠️ Что можно улучшить:\n" + "\n".join(f"— {x}" for x in warn))
    lines.append(
        "\nАвтоматика проверяет формат, читаемость и название; вкус и «продаёт ли картинка» оценит дизайнер — "
        "если хотите живой комментарий, напишите «хочу разбор от дизайнера».\n\n"
        "👉 Хотите увидеть, как может выглядеть новая обложка? Пришлите фото самого товара (лучше на светлом фоне) "
        "и 3–5 фактов о нём — покажу бесплатное превью."
    )
    return "\n".join(lines), {**info, "warnings": len(warn)}
