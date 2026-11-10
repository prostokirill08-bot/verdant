"""Демо-работы для кворка «Дизайн гайда / чек-листа в PDF»: 5 разворотов (обложка + страница), PNG 1320×880.

Запуск: python scripts/make_portfolio_guides.py → marketing/portfolio/guides/*.png
Это собственные примеры (пометка «пример»), не работы для клиентов.
"""
from __future__ import annotations

import html
from pathlib import Path

from playwright.sync_api import sync_playwright

OUT = Path(__file__).resolve().parent.parent / "marketing" / "portfolio" / "guides"

GUIDES = [
    {
        "slug": "01-wb-main-slide",
        "bg": "#E9EFE9", "accent": "#1F6F5C", "soft": "#D5E6DE", "ink": "#16302A",
        "tag": "Чек-лист для селлеров",
        "title": "Главный слайд карточки WB",
        "subtitle": "8 пунктов, которые стоит проверить перед загрузкой",
        "kind": "check",
        "head": "Проверьте перед загрузкой",
        "items": [
            "Товар занимает 60–70% кадра",
            "Одно главное преимущество — крупно",
            "Текст читается в превью на телефоне",
            "Не больше 3–4 элементов на слайде",
            "Фон контрастирует с товаром",
            "Формат 3:4, от 900×1200 px",
            "Нет опечаток и мелкого шрифта",
            "Сравнили с топ-5 конкурентов в выдаче",
        ],
        "note": "Совет: смотрите на слайд с расстояния вытянутой руки — так его видит покупатель в ленте.",
    },
    {
        "slug": "02-phone-product-photo",
        "bg": "#F4ECE2", "accent": "#D9692B", "soft": "#F6D9C3", "ink": "#3A2414",
        "tag": "Гайд · 6 шагов",
        "title": "Снимаем товар на телефон",
        "subtitle": "Фото для карточки без студии и дорогой техники",
        "kind": "steps",
        "head": "Пошагово",
        "items": [
            "Свет — у окна днём, без вспышки",
            "Однотонный фон: лист ватмана или ткань",
            "Протрите товар и линзу камеры",
            "Снимайте на уровне товара, не сверху",
            "3 ракурса + детали + товар в руке",
            "Не используйте зум — подойдите ближе",
        ],
        "note": "Сохраните оригиналы в полном размере: сжатые фото из мессенджеров теряют детали.",
    },
    {
        "slug": "03-marketplace-launch",
        "bg": "#E6ECF5", "accent": "#2B4C8C", "soft": "#D3DEEF", "ink": "#14223D",
        "tag": "Чек-лист запуска",
        "title": "Новый товар на маркетплейсе",
        "subtitle": "От идеи до первой поставки — ничего не забыть",
        "kind": "check",
        "head": "Этапы запуска",
        "items": [
            "Анализ ниши и цен конкурентов",
            "Себестоимость и юнит-экономика",
            "Сертификаты и декларации",
            "Фото, инфографика, главный слайд",
            "SEO-название и описание",
            "Все характеристики заполнены",
            "Цена, скидка и участие в акциях",
            "Поставка на склад",
        ],
        "note": "Отзывы — только от реальных покупателей: накрутка ведёт к блокировке карточки.",
    },
    {
        "slug": "04-coffee-post-ideas",
        "bg": "#EFE6DC", "accent": "#6B4430", "soft": "#E3D2C1", "ink": "#2E1D14",
        "tag": "Лид-магнит · соцсети",
        "title": "10 идей постов для кофейни",
        "subtitle": "Контент-план на две недели без мук выбора",
        "kind": "steps",
        "head": "Идеи",
        "items": [
            "Знакомство с бариста",
            "Как мы выбираем зерно",
            "Новинка недели",
            "Закулисье: утро до открытия",
            "Опрос: какой сироп добавить",
            "Рецепт напитка для дома",
            "Отзыв гостя (с его согласия)",
            "Факт о кофе",
            "Подборка «с собой в дорогу»",
            "Анонс события или дегустации",
        ],
        "note": "Чередуйте: польза → атмосфера → вовлечение. Так лента не превращается в прайс.",
    },
    {
        "slug": "05-skincare-routine",
        "bg": "#F6E8EA", "accent": "#B4466A", "soft": "#F0D2DA", "ink": "#3B1623",
        "tag": "Чек-лист · уход",
        "title": "Уход за кожей: утро и вечер",
        "subtitle": "Базовая схема, которую легко повторять каждый день",
        "kind": "two",
        "head": "Утро",
        "items": ["Мягкое очищение", "Тоник или увлажняющий спрей", "Сыворотка по типу кожи", "Крем", "SPF — каждый день"],
        "head2": "Вечер",
        "items2": ["Снять макияж", "Очищение", "Актив — по рекомендации специалиста", "Крем"],
        "note": "Материал носит информационный характер и не заменяет консультацию дерматолога.",
    },
]

CSS = """
*{box-sizing:border-box;margin:0;padding:0}
body{width:1320px;height:880px;font-family:Inter,sans-serif;background:var(--bg);overflow:hidden;position:relative;color:var(--ink)}
.blob{position:absolute;border-radius:50%;background:var(--soft)}
.b1{width:620px;height:620px;left:-180px;top:-220px}
.b2{width:520px;height:520px;right:-160px;bottom:-240px}
.mark{position:absolute;left:56px;bottom:40px;font-size:15px;letter-spacing:.08em;text-transform:uppercase;opacity:.55;font-weight:600}
.page{position:absolute;top:80px;width:500px;height:707px;background:#fff;border-radius:10px;
  box-shadow:0 30px 60px rgba(0,0,0,.16),0 6px 16px rgba(0,0,0,.08);overflow:hidden}
.cover{left:150px;transform:rotate(-3deg);background:var(--accent);color:#fff;padding:54px 46px}
.inner{left:640px;transform:rotate(2deg);padding:46px 44px}
.tag{display:inline-block;background:rgba(255,255,255,.18);border-radius:40px;padding:8px 16px;font-size:15px;font-weight:600;letter-spacing:.02em}
.cover h1{font-family:'Inter Display',Inter,sans-serif;font-size:50px;line-height:1.05;font-weight:800;margin-top:150px;letter-spacing:-.01em}
.cover p{font-size:20px;line-height:1.35;margin-top:22px;opacity:.9;font-weight:500}
.ring{position:absolute;right:-70px;top:-70px;width:260px;height:260px;border-radius:50%;border:34px solid rgba(255,255,255,.14)}
.dots{position:absolute;left:46px;bottom:46px;display:flex;gap:10px}
.dots i{width:12px;height:12px;border-radius:50%;background:rgba(255,255,255,.45)}
.dots i:first-child{background:#fff}
.inner h2{font-size:26px;font-weight:800;color:var(--accent);margin-bottom:18px}
.list{list-style:none}
.list li{display:flex;align-items:center;gap:14px;font-size:18px;font-weight:500;line-height:1.3;padding:11px 0;border-bottom:1px solid #eee}
.list li:last-child{border-bottom:0}
.box{flex:0 0 26px;height:26px;border-radius:7px;border:2.5px solid var(--accent);display:flex;align-items:center;justify-content:center}
.box.on{background:var(--accent)}
.box.on:after{content:'';width:10px;height:6px;border-left:3px solid #fff;border-bottom:3px solid #fff;transform:rotate(-45deg) translate(1px,-1px)}
.num{flex:0 0 32px;height:32px;border-radius:50%;background:var(--soft);color:var(--accent);font-weight:800;font-size:16px;display:flex;align-items:center;justify-content:center}
.compact li{padding:7px 0;font-size:16.5px}
.compact .num{flex-basis:28px;height:28px;font-size:14px}
.note{position:absolute;left:44px;right:44px;bottom:40px;background:var(--soft);border-radius:12px;padding:16px 18px;font-size:15px;line-height:1.4;font-weight:500}
.two h2{margin-top:8px}
.two h2+ul{margin-bottom:14px}
.foot{position:absolute;right:44px;top:22px;font-size:13px;opacity:.45;font-weight:600}
"""


def render_items(g: dict, items: list[str], kind: str, compact: bool) -> str:
    rows = []
    for i, t in enumerate(items, 1):
        mark = f'<span class="num">{i}</span>' if kind == "steps" else f'<span class="box{" on" if i <= 3 else ""}"></span>'
        rows.append(f"<li>{mark}<span>{html.escape(t)}</span></li>")
    return f'<ul class="list{" compact" if compact else ""}">' + "".join(rows) + "</ul>"


def page_html(g: dict) -> str:
    if g["kind"] == "two":
        body = (
            f"<h2>{html.escape(g['head'])}</h2>" + render_items(g, g["items"], "check", True)
            + f"<h2>{html.escape(g['head2'])}</h2>" + render_items(g, g["items2"], "check", True)
        )
        cls = "inner two"
    else:
        body = f"<h2>{html.escape(g['head'])}</h2>" + render_items(g, g["items"], g["kind"], len(g["items"]) > 8)
        cls = "inner"
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>
:root{{--bg:{g['bg']};--accent:{g['accent']};--soft:{g['soft']};--ink:{g['ink']}}}{CSS}</style></head><body>
<div class="blob b1"></div><div class="blob b2"></div>
<div class="page cover"><div class="ring"></div><span class="tag">{html.escape(g['tag'])}</span>
<h1>{html.escape(g['title'])}</h1><p>{html.escape(g['subtitle'])}</p><div class="dots"><i></i><i></i><i></i></div></div>
<div class="page {cls}"><span class="foot">стр. 2</span>{body}<div class="note">{html.escape(g['note'])}</div></div>
<div class="mark">Пример работы · дизайн PDF-гайда</div>
</body></html>"""


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        import os
        exe = os.environ.get("CHROMIUM_PATH")
        browser = p.chromium.launch(executable_path=exe) if exe else p.chromium.launch()
        page = browser.new_page(viewport={"width": 1320, "height": 880}, device_scale_factor=1)
        for g in GUIDES:
            page.set_content(page_html(g))
            page.wait_for_timeout(150)
            out = OUT / f"{g['slug']}.png"
            page.screenshot(path=str(out))
            print(out)
        browser.close()


if __name__ == "__main__":
    main()
