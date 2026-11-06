"""Рендер слайдов инфографики: HTML-шаблон → Chromium (Playwright) → JPG 1440×1920 (3:4).

Текст рисуется шаблоном, а не нейросетью — кириллица всегда без ошибок.
"""
from __future__ import annotations

import base64
import io
import threading
from dataclasses import dataclass, field
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape
from markupsafe import Markup
from PIL import Image

from ..config import get_settings

TEMPLATES = Path(__file__).parent / "templates"
_env = Environment(loader=FileSystemLoader(TEMPLATES), autoescape=select_autoescape(["html"]))

WIDTH, HEIGHT, SCALE = 720, 960, 2  # итог 1440×1920

PALETTES: dict[str, dict[str, str]] = {
    "fresh": dict(bg="#EAF4EE", soft="#D3EBDD", soft2="#BFE3CF", card="#FFFFFF", accent="#1E7A55", on_accent="#FFFFFF", ink="#0E2A1F"),
    "warm": dict(bg="#FFF1E6", soft="#FFE0C7", soft2="#FFD0A8", card="#FFFFFF", accent="#E2622B", on_accent="#FFFFFF", ink="#36190B"),
    "tech": dict(bg="#0E1525", soft="#18233B", soft2="#1F2E4D", card="#17213A", accent="#38D3F2", on_accent="#04202A", ink="#F2F6FF"),
    "beauty": dict(bg="#FBEAF0", soft="#F6D3E0", soft2="#F0BFD2", card="#FFFFFF", accent="#B83C72", on_accent="#FFFFFF", ink="#3A1226"),
    "kids": dict(bg="#FFF6D8", soft="#FFE9A3", soft2="#BFE4FF", card="#FFFFFF", accent="#FF7A00", on_accent="#FFFFFF", ink="#2A2140"),
    "premium": dict(bg="#141414", soft="#222019", soft2="#2C2A22", card="#1E1D1A", accent="#C9A45C", on_accent="#141414", ink="#F4EEE2"),
    "home": dict(bg="#F1ECE4", soft="#E4DACB", soft2="#D8CAB4", card="#FFFFFF", accent="#7A5634", on_accent="#FFFFFF", ink="#2A1F15"),
    "sport": dict(bg="#EEF1F6", soft="#DCE3EE", soft2="#C9D5E8", card="#FFFFFF", accent="#2B59FF", on_accent="#FFFFFF", ink="#0F1A33"),
}

CATEGORY_KEYWORDS = {
    "beauty": "крем сыворот косметик уход маск шампун бальзам помад тушь парфюм кож волос ногт",
    "kids": "детск ребен малыш игрушк конструктор развива школ",
    "tech": "usb кабел заряд наушник bluetooth гаджет смарт колонк блок питан power электрон",
    "home": "кухн посуд дом интерьер текстил полотен плед подушк хранен органайзер свеч",
    "sport": "спорт фитнес трениров бег йог гантел велосипед бутылк шейкер",
    "fresh": "эко натурал растен сад огород чай витамин здоров",
    "premium": "кож подар премиум часы ювелир золот серебр",
    "warm": "",
}

ICONS = {
    "check": '<path d="M5 12.5l4.2 4.2L19 7"/>',
    "clock": '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    "shield": '<path d="M12 3l7.5 3v5.5c0 4.5-3.2 8.2-7.5 9.5-4.3-1.3-7.5-5-7.5-9.5V6z"/><path d="M8.8 12l2.3 2.3 4.2-4.6"/>',
    "drop": '<path d="M12 3.5s6 6.4 6 10.6a6 6 0 01-12 0c0-4.2 6-10.6 6-10.6z"/>',
    "leaf": '<path d="M5 19c0-8 5-13 14-14 0 9-5 14-13 14z"/><path d="M5 19l7-7"/>',
    "bolt": '<path d="M13 3L5 13.5h6L10 21l8-10.5h-6z"/>',
    "ruler": '<path d="M4 16.5L16.5 4l3.5 3.5L7.5 20z"/><path d="M8 13l1.5 1.5M10.5 10.5L12 12M13 8l1.5 1.5"/>',
    "box": '<path d="M3.5 7.5L12 3.5l8.5 4v9L12 20.5l-8.5-4z"/><path d="M3.5 7.5L12 11.5l8.5-4M12 11.5v9"/>',
    "heart": '<path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0112 7.3a4.3 4.3 0 017.5 2.5C19.5 15.4 12 20 12 20z"/>',
    "star": '<path d="M12 3.8l2.5 5.2 5.7.8-4.1 4 1 5.6L12 16.8l-5.1 2.6 1-5.6-4.1-4 5.7-.8z"/>',
    "temp": '<path d="M10 14.5V5a2 2 0 014 0v9.5a4 4 0 11-4 0z"/>',
    "users": '<circle cx="9" cy="8.5" r="3.2"/><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5"/><circle cx="17" cy="9.5" r="2.4"/><path d="M15.8 14.2c2.4.1 4 1.7 4.6 4.3"/>',
}

ICON_RULES = [
    ("clock", "час минут дн долго срок служб быстр"),
    ("shield", "гарант защит прочн надёж надеж безопас сертифик"),
    ("drop", "вод влаг протек герметич жидк увлаж"),
    ("leaf", "эко натурал органич растит безвред состав"),
    ("bolt", "мощн заряд энерг ватт скорост"),
    ("ruler", "размер см мм объём объем мл литр вес кг грамм"),
    ("box", "комплект упаков короб в наборе"),
    ("heart", "уход мягк комфорт нежн любим"),
    ("temp", "тепл холод температур °"),
    ("users", "семь дет взросл мужчин женщин подарок"),
    ("star", "качеств премиум лучш"),
]


def icon_for(text: str) -> str:
    t = (text or "").lower()
    name = text if text in ICONS else "check"
    if text not in ICONS:
        for key, words in ICON_RULES:
            if any(w in t for w in words.split()):
                name = key
                break
    return Markup(
        '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
        + ICONS[name]
        + "</svg>"
    )


def palette_for(category: str, product_name: str = "", features: str = "") -> str:
    if category in PALETTES:
        return category
    text = f"{product_name} {features}".lower()
    for cat, words in CATEGORY_KEYWORDS.items():
        if words and any(w in text for w in words.split()):
            return cat
    return "warm"


def to_data_uri(img: Image.Image, fmt: str = "PNG") -> str:
    buf = io.BytesIO()
    img.save(buf, fmt)
    return f"data:image/{fmt.lower()};base64," + base64.b64encode(buf.getvalue()).decode()


@dataclass
class RenderResult:
    path: Path
    overflow: list[str] = field(default_factory=list)
    width: int = 0
    height: int = 0


class Renderer:
    """Один браузер на поток; Playwright sync API не потокобезопасен."""

    _local = threading.local()

    def _page(self):
        loc = self._local
        if getattr(loc, "browser", None) is None:
            from playwright.sync_api import sync_playwright

            loc.pw = sync_playwright().start()
            exe = get_settings().chromium_path or None
            if exe is None:
                import glob

                found = sorted(glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome"))
                exe = found[-1] if found else None
            loc.browser = loc.pw.chromium.launch(executable_path=exe, args=["--no-sandbox"])
        return loc.browser.new_page(viewport={"width": WIDTH, "height": HEIGHT}, device_scale_factor=SCALE)

    def render(
        self,
        slide: dict,
        palette: str,
        product_uri: str,
        out_path: Path,
        *,
        frame: bool = False,
        bg_uri: str | None = None,
        watermark: bool = False,
    ) -> RenderResult:
        html = _env.get_template("slide.html").render(
            s=slide,
            p=PALETTES.get(palette, PALETTES["warm"]),
            product=product_uri,
            frame=frame,
            bg=bg_uri,
            watermark=watermark,
            brand=get_settings().brand_name,
            icon=icon_for,
        )
        page = self._page()
        try:
            page.set_content(html, wait_until="load")
            page.evaluate("document.fonts.ready")
            overflow = page.evaluate("window.__overflow || []")
            png = page.screenshot(type="png", full_page=False)
        finally:
            page.close()
        img = Image.open(io.BytesIO(png)).convert("RGB")
        out_path.parent.mkdir(parents=True, exist_ok=True)
        img.save(out_path, "JPEG", quality=90, optimize=True, progressive=True)
        return RenderResult(out_path, list(overflow), img.width, img.height)

    @classmethod
    def shutdown(cls) -> None:
        loc = cls._local
        if getattr(loc, "browser", None) is not None:
            loc.browser.close()
            loc.pw.stop()
            loc.browser = None


renderer = Renderer()
