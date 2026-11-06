"""Утверждённые тарифы — единственный источник цен для агентов.

Агенты не могут назвать цену, которой здесь нет, и не дают скидок.
Изменение цен — только решением владельца (правка этого файла или настройки).
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Tariff:
    code: str
    name: str
    price_rub: int
    items: int  # сколько товаров входит
    slides: int  # слайдов на товар
    cover_variants: int  # вариантов обложки для A/B
    revisions: int  # бесплатных раундов правок
    description: str

    @property
    def price_kop(self) -> int:
        return self.price_rub * 100


TARIFFS: dict[str, Tariff] = {
    t.code: t
    for t in [
        Tariff("start", "Старт", 2490, 1, 5, 1, 1, "1 товар: 5 слайдов инфографики + SEO-название и описание"),
        Tariff("standard", "Стандарт", 3990, 1, 8, 3, 1, "1 товар: 8 слайдов + SEO + 3 варианта обложки для A/B-теста"),
        Tariff("catalog", "Каталог", 19900, 10, 6, 2, 1, "10 товаров: по 6 слайдов + SEO + 2 варианта обложки"),
        Tariff("monthly", "Пакет на месяц", 9900, 8, 6, 2, 1, "до 8 новинок в течение 30 дней, по 6 слайдов + SEO"),
    ]
}

ALLOWED_PRICES_RUB = {t.price_rub for t in TARIFFS.values()}

TURNAROUND = "до 24 часов после оплаты (обычно быстрее)"


def tariff(code: str) -> Tariff:
    if code not in TARIFFS:
        raise KeyError(f"Неизвестный тариф: {code}")
    return TARIFFS[code]


def price_list_text() -> str:
    lines = [f"• {t.name} — {t.price_rub:,} ₽: {t.description}".replace(",", " ") for t in TARIFFS.values()]
    return "\n".join(lines)


def rub(kop: int) -> str:
    return f"{kop / 100:,.0f} ₽".replace(",", " ")
