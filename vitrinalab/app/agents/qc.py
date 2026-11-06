"""Quality Control Agent: не пропускает к клиенту брак.

Проверки детерминированные (их нельзя «уговорить»):
* формат файлов: 1440×1920, 3:4, JPG < 10 МБ, изображение не пустое;
* текст влез в макет (нет переполнений);
* нет запрещённых формулировок (закон о рекламе, правила маркетплейсов): «лучший», «№1», цены, ссылки, контакты;
* нет выдуманных чисел: каждое число в текстах есть в данных клиента;
* длина SEO-названия и описания.
"""
from __future__ import annotations

import re
from pathlib import Path

import numpy as np
from PIL import Image

from .copywriter import TITLE_LIMIT

BANNED = [
    (r"\bлучш\w*", "превосходная степень «лучший» (ст. 5 закона о рекламе)"),
    (r"\bсам(ый|ая|ое|ые)\b", "превосходная степень «самый»"),
    (r"№\s?1\b|номер\s+один|\bтоп-?1\b", "«№1» без подтверждения"),
    (r"\bуникальн\w*", "неподтверждаемое «уникальный»"),
    (r"\bлеч(ит|ение|ебн)\w*|\bизлеч\w*", "медицинские обещания"),
    (r"\d\s?(₽|руб)|\bскидк\w*|\bакци\w*", "цены и скидки запрещены на фото"),
    (r"https?://|www\.|\.ru\b|\.com\b", "ссылки запрещены"),
    (r"[\w.+-]+@[\w-]+\.\w+", "e-mail запрещён"),
    (r"(\+7|8)[\s(-]*\d{3}[\s)-]*\d{3}[\s-]*\d{2}[\s-]*\d{2}", "телефон запрещён"),
    (r"100\s?%\s?гарант", "«100% гарантия»"),
]

NUM = re.compile(r"\d+(?:[.,]\d+)?")


def _texts(content: dict) -> list[str]:
    c = content.get("cover", {})
    out = [c.get("headline", ""), c.get("subline", ""), c.get("eyebrow", ""), *c.get("badges", [])]
    for b in content.get("benefits", []):
        out += [b.get("title", ""), b.get("text", "")]
    for f in content.get("features", []):
        out += [f.get("number", ""), f.get("title", ""), f.get("text", "")]
    for k, v in content.get("specs", []):
        out += [k, v]
    out += content.get("audience", []) + content.get("package", [])
    out += [content.get("title_seo", ""), content.get("description", "")]
    return [t for t in out if t]


def check_content(content: dict, source_text: str, marketplace: str) -> tuple[list[str], list[str]]:
    errors, warnings = [], []
    joined = "\n".join(_texts(content))
    for pattern, why in BANNED:
        m = re.search(pattern, joined, re.I)
        if m:
            errors.append(f"Запрещённая формулировка «{m.group(0)}»: {why}")
    allowed = {n.replace(",", ".") for n in NUM.findall(source_text)}
    invented = sorted({n for n in (x.replace(",", ".") for x in NUM.findall(joined)) if n not in allowed})
    if invented:
        errors.append(f"Числа, которых нет в данных клиента: {', '.join(invented[:10])}")
    limit = TITLE_LIMIT.get(marketplace, 60)
    if len(content.get("title_seo", "")) > limit:
        errors.append(f"SEO-название длиннее {limit} символов")
    if not content.get("title_seo"):
        errors.append("Нет SEO-названия")
    dlen = len(content.get("description", ""))
    if dlen < 150:
        warnings.append(f"Короткое описание ({dlen} симв.) — мало фактов от клиента")
    if dlen > 5000:
        errors.append("Описание длиннее 5000 символов")
    return errors, warnings


def check_image(path: Path) -> list[str]:
    errs = []
    if not path.exists():
        return [f"{path.name}: файл не создан"]
    if path.stat().st_size > 10 * 1024 * 1024:
        errs.append(f"{path.name}: больше 10 МБ")
    with Image.open(path) as im:
        w, h = im.size
        if (w, h) != (1440, 1920):
            errs.append(f"{path.name}: размер {w}×{h}, нужен 1440×1920")
        arr = np.asarray(im.convert("L").resize((90, 120)))
        if arr.std() < 6:
            errs.append(f"{path.name}: изображение почти однотонное (пустое?)")
    return errs


def review(content: dict, source_text: str, marketplace: str, renders: list, cutout_method: str) -> dict:
    errors, warnings = check_content(content, source_text, marketplace)
    for r in renders:
        errors += check_image(r.path)
        if r.overflow:
            errors.append(f"{r.path.name}: текст не влез — {'; '.join(r.overflow)[:120]}")
    if cutout_method == "frame":
        warnings.append("Фон не удалось отделить — товар показан в рамке. Лучше прислать фото на светлом фоне.")
    return {"passed": not errors, "errors": errors, "warnings": warnings}
