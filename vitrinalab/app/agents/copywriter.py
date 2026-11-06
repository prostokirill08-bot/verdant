"""Копирайтер (часть Production Agent): тексты слайдов, SEO-название и описание.

Жёсткое правило: используем только факты клиента. Никаких выдуманных цифр,
превосходных степеней («лучший», «№1»), медицинских обещаний, цен и контактов.
QC-агент проверяет это автоматически.
"""
from __future__ import annotations

import re

from sqlalchemy.orm import Session

from ..imaging.render import palette_for
from .base import Run, ask_llm

TITLE_LIMIT = {"wb": 60, "ozon": 120, "ym": 120}

AUDIENCE = {
    "beauty": ["Для ежедневного ухода", "В косметичку и в поездки", "Хороший вариант для подарка"],
    "kids": ["Для детей и родителей", "Для дома и прогулок", "Хороший вариант для подарка"],
    "tech": ["Для дома и офиса", "В поездки и командировки", "Хороший вариант для подарка"],
    "home": ["Для дома и дачи", "Для ежедневного использования", "Хороший вариант для подарка"],
    "sport": ["Для тренировок и активного отдыха", "Для зала и улицы", "Хороший вариант для подарка"],
    "fresh": ["Для тех, кто выбирает натуральное", "Для дома и дачи", "Хороший вариант для подарка"],
    "premium": ["Для тех, кто ценит детали", "Для особых случаев", "Хороший вариант для подарка"],
    "warm": ["Для ежедневного использования", "Для дома и поездок", "Хороший вариант для подарка"],
}

SYSTEM = """Ты — копирайтер карточек товаров для маркетплейсов Wildberries и Ozon.
Пиши по-русски, коротко и конкретно. Используй ТОЛЬКО факты из описания клиента.
Запрещено: придумывать цифры и характеристики; слова «лучший», «самый», «№1», «уникальный»;
медицинские и лечебные обещания; цены, скидки, ссылки, телефоны, e-mail.
Верни только JSON без пояснений."""

USER_TMPL = """Товар: {name}
Маркетплейс: {mp}
Факты от продавца:
{features}

Верни JSON строго такой структуры:
{{
 "category": одно из [beauty, kids, tech, home, sport, fresh, premium, warm],
 "title_seo": "название для карточки, не длиннее {limit} символов",
 "description": "SEO-описание 700–1500 символов, абзацы через \\n\\n",
 "keywords": ["5–10 поисковых фраз"],
 "cover": {{"eyebrow": "2–3 слова", "headline": "до 40 символов", "subline": "до 60 символов", "badges": ["3 коротких факта до 24 символов"]}},
 "benefits": [{{"title": "до 26 символов", "text": "до 70 символов"}}] (4 шт.),
 "features": [{{"number": "число с единицей из фактов или пусто", "title": "до 30 символов", "text": "до 110 символов"}}] (2–3 шт.),
 "specs": [["характеристика", "значение"]] (только из фактов),
 "audience": ["3–4 пункта: кому подойдёт"],
 "package": ["комплектация, только если указана в фактах, иначе пустой список"]
}}"""


def split_facts(features: str) -> list[str]:
    text = (features or "").replace("\r", "")
    parts = re.split(r"[\n;•·]", text)
    parts = [p.strip(" .,-–—\t") for p in parts if p and p.strip(" .,-–—\t")]
    if len(parts) <= 1 and "," in text:
        parts = [p.strip(" .") for p in text.split(",") if p.strip(" .")]
    seen, out = set(), []
    for p in parts:
        k = p.lower()
        if k not in seen:
            seen.add(k)
            out.append(p[0].upper() + p[1:] if p else p)
    return out


NUM_UNIT = re.compile(
    r"(\d+(?:[.,]\d+)?\s?(?:мл|л|г|кг|см|мм|м|ч|часов|час|мин|шт|%|°C|°|Вт|мАч|В|дн|дней|лет|мес)\.?)(?=\s|$|[,.;)])",
    re.I,
)


DANGLING = {"и", "с", "со", "для", "в", "во", "на", "по", "до", "от", "из", "к", "о", "об", "а", "но", "или", "при", "без"}


def shorten(text: str, limit: int) -> str:
    """Обрезать по словам, не оставляя «висящих» предлогов в конце."""
    text = re.sub(r"\s+", " ", text or "").strip()
    if len(text) <= limit:
        return text
    words = text[: limit + 1].rsplit(" ", 1)[0].rstrip(",.;:—- ").split(" ")
    while len(words) > 1 and words[-1].lower() in DANGLING:
        words.pop()
    return " ".join(words) or text[:limit]


def _split_title(fact: str) -> tuple[str, str]:
    """«Не протекает — крышка с замком» → («Не протекает», «Крышка с замком»)."""
    for sep in (" — ", " - ", " – ", ": "):
        if sep in fact:
            a, b = fact.split(sep, 1)
            if a.strip() and b.strip():
                return a.strip(), b.strip()[0].upper() + b.strip()[1:]
    return fact, ""


def fallback_content(name: str, features: str, marketplace: str) -> dict:
    """Детерминированный копирайтинг без LLM: только перестановка фактов клиента."""
    facts = split_facts(features)
    specs, plain = [], []
    for f in facts:
        if ":" in f:
            k, v = f.split(":", 1)
            if k.strip() and v.strip() and len(k) <= 30:
                specs.append([k.strip()[0].upper() + k.strip()[1:], v.strip()])
                continue
        plain.append(f)
    category = palette_for("", name, features)
    with_num = [f for f in plain if NUM_UNIT.search(f)]
    # бейджи — только факты, которые помещаются целиком (обрезанный факт хуже отсутствующего)
    short = [_split_title(f)[0] for f in plain]
    short += [f"{k} {v}" for k, v in specs]
    short = [f for f in short if len(f) <= 30]
    badges = sorted(dict.fromkeys(short), key=lambda f: (0 if NUM_UNIT.search(f) else 1, len(f)))[:3]

    benefits = []
    for f in plain[:4]:
        t, d = _split_title(f)
        benefits.append({"title": t if len(t) <= 48 else shorten(t, 48), "text": shorten(d, 90)})

    feats = []
    for f in (with_num + [p for p in plain if p not in with_num])[:3]:
        m = NUM_UNIT.search(f)
        number = m.group(1).strip() if m else ""
        title, text = _split_title(f)
        feats.append({"number": number, "title": shorten(title, 60), "text": shorten(text, 140)})

    package = [p for p in plain if re.search(r"комплект|в наборе|в комплекте", p, re.I)]

    title = shorten(name, TITLE_LIMIT.get(marketplace, 60))
    desc_parts = [f"{name}."]
    if plain:
        desc_parts.append("Ключевые особенности:\n" + "\n".join(f"— {p}" for p in plain))
    if specs:
        desc_parts.append("Характеристики:\n" + "\n".join(f"— {k}: {v}" for k, v in specs))
    words = [w for w in re.findall(r"[а-яёa-z]{4,}", name.lower())]
    keywords = list(dict.fromkeys([name.lower()] + words))[:8]

    return {
        "category": category,
        "title_seo": title,
        "description": "\n\n".join(desc_parts),
        "keywords": keywords,
        "cover": {
            "eyebrow": "",
            "headline": shorten(name, 40),
            "subline": plain[0] if plain and len(plain[0]) <= 70 else "",
            "badges": badges,
        },
        "benefits": benefits,
        "features": feats,
        "specs": specs,
        "audience": AUDIENCE.get(category, AUDIENCE["warm"]),
        "package": package,
        "_source": "fallback",
    }


def _valid(d) -> bool:
    try:
        return (
            isinstance(d, dict)
            and d["title_seo"]
            and d["cover"]["headline"]
            and isinstance(d["benefits"], list)
            and isinstance(d.get("specs", []), list)
        )
    except (KeyError, TypeError):
        return False


def write_content(s: Session, run: Run, name: str, features: str, marketplace: str, note: str = "") -> dict:
    user = USER_TMPL.format(name=name, mp=marketplace.upper(), features=features, limit=TITLE_LIMIT.get(marketplace, 60))
    if note:
        user += f"\n\nПравки клиента к прошлой версии: {note}"
    out = ask_llm(
        s, run, SYSTEM, user, as_json=True, validate=_valid, fallback=lambda: fallback_content(name, features, marketplace)
    )
    out.setdefault("_source", "llm")
    # нормализация длины на случай, если модель превысила лимиты
    out["title_seo"] = shorten(out["title_seo"], TITLE_LIMIT.get(marketplace, 60))
    c = out["cover"]
    c["headline"] = shorten(c.get("headline", name), 44)
    c["subline"] = shorten(c.get("subline", ""), 70)
    c["badges"] = [shorten(b, 26) for b in c.get("badges", [])][:3]
    c.setdefault("eyebrow", "")
    out.setdefault("audience", AUDIENCE["warm"])
    out.setdefault("package", [])
    out.setdefault("features", [])
    return out


def plan_slides(content: dict, n: int) -> list[dict]:
    """Порядок слайдов под количество из тарифа; пропускаем типы без данных."""
    cv = content["cover"]
    pool: list[dict] = [
        {"type": "cover", "layout": "a", **cv},
    ]
    if content.get("benefits"):
        pool.append({"type": "benefits", "eyebrow": "Преимущества", "title": "Почему выбирают", "cards": content["benefits"][:4]})
    feats = content.get("features") or []
    if feats:
        f = feats[0]
        pool.append({"type": "feature", "eyebrow": "Главное", **f})
    if content.get("specs"):
        pool.append({"type": "specs", "eyebrow": "Характеристики", "title": "Подробно о товаре", "rows": content["specs"][:8]})
    pool.append({"type": "list", "eyebrow": "Кому подойдёт", "title": "Для кого этот товар", "points": content.get("audience", [])[:5], "icon": "users"})
    if content.get("package"):
        pool.append({"type": "list", "eyebrow": "Комплектация", "title": "Что в комплекте", "points": content["package"][:6], "icon": "box"})
    for f in feats[1:]:
        pool.append({"type": "feature", "eyebrow": "Особенность", **f})
    # не хватает данных — повторно используем факты отдельными слайдами, но без выдумок
    extra = [b for b in content.get("benefits", [])[4:]] + [b for b in content.get("benefits", [])[:4]]
    i = 0
    while len(pool) < n and i < len(extra):
        b = extra[i]
        pool.append({"type": "feature", "eyebrow": "Особенность", "number": "", "title": b["title"], "text": b.get("text", "")})
        i += 1
    return pool[:n]


def cover_variants(content: dict, k: int) -> list[dict]:
    cv = content["cover"]
    return [{"type": "cover", "layout": layout, **cv} for layout in ["a", "b", "c"][:k]]
