"""Палитра по пожеланиям клиента: из референса (цвета картинки) или из слов («чёрно-золотой», «нежный»).

Берём только цвета и настроение — макет чужой карточки не копируем.
Все палитры проверяются на контраст текста (WCAG): ink/bg ≥ 7, текст на акценте ≥ 4.5.
"""
from __future__ import annotations

import colorsys
import re
from pathlib import Path

from PIL import Image, ImageOps

RGB = tuple[int, int, int]

COLOR_WORDS: list[tuple[str, str]] = [
    (r"золот", "#C9A45C"), (r"серебр", "#8E98A3"), (r"красн|алый", "#D63A2F"), (r"бордов|винн", "#8C1D3A"),
    (r"оранж|рыж", "#F07A1E"), (r"жёлт|желт|лимон", "#E8B400"), (r"зелён|зелен|мятн|изумруд", "#1E8A5A"),
    (r"бирюз|аквамарин", "#14A3A8"), (r"голуб", "#2E9BEA"), (r"син", "#2B59FF"), (r"фиолет|лаванд|сирен", "#7A4FD6"),
    (r"розов|пудров", "#D9487E"), (r"коричн|шоколад|кофейн", "#7A5634"), (r"бежев|песочн|крем", "#B08A5B"),
    (r"черн|чёрн", "#1A1A1A"), (r"сер(ый|ом|ая|ые|о-)", "#5F6670"),
]

STYLE_WORDS = {
    "dark": r"т[её]мн|ч[её]рн|премиум|люкс|дорог|строг|элегант|ночн",
    "light": r"светл|бел|минимал|чист|воздуш|скандинав",
    "pastel": r"нежн|пастел|мягк|пудров",
    "bright": r"ярк|сочн|насыщ|детск|весел|весёл|контраст",
}


def _hex(c: RGB) -> str:
    return "#{:02X}{:02X}{:02X}".format(*c)


def _rgb(h: str) -> RGB:
    h = h.lstrip("#")
    return tuple(int(h[i : i + 2], 16) for i in (0, 2, 4))  # type: ignore[return-value]


def _mix(a: RGB, b: RGB, t: float) -> RGB:
    """t=0 → a, t=1 → b."""
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))  # type: ignore[return-value]


def _lum(c: RGB) -> float:
    def ch(v):
        v = v / 255
        return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4

    r, g, b = (ch(v) for v in c)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(a: RGB, b: RGB) -> float:
    la, lb = sorted((_lum(a), _lum(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)


def _sat(c: RGB) -> float:
    h, s, v = colorsys.rgb_to_hsv(*(x / 255 for x in c))
    return s * v


def build(accent: RGB, dark: bool = False, pastel: bool = False) -> dict[str, str]:
    """Полная палитра шаблона из одного акцентного цвета."""
    white, black = (255, 255, 255), (0, 0, 0)
    if dark:
        bg = _mix(accent, (12, 12, 14), 0.9)
        card = _mix(bg, white, 0.07)
        ink = (244, 240, 232)
        # акцент на тёмном фоне должен быть достаточно светлым
        while contrast(accent, bg) < 3 and _lum(accent) < 0.9:
            accent = _mix(accent, white, 0.15)
    else:
        bg = _mix(accent, white, 0.93 if pastel else 0.88)
        card = white
        ink = _mix(accent, black, 0.85)
        while contrast(accent, bg) < 3 and _lum(accent) > 0.02:
            accent = _mix(accent, black, 0.15)
    while contrast(ink, bg) < 7:
        ink = _mix(ink, white if dark else black, 0.3)
    dark_text = (20, 20, 20)

    def best_on(a: RGB) -> RGB:
        return white if contrast(white, a) >= contrast(dark_text, a) else dark_text

    # текст на акцентных плашках должен читаться (WCAG AA ≥ 4.5): сдвигаем акцент от середины яркости
    for _ in range(12):
        if contrast(best_on(accent), accent) >= 4.5:
            break
        accent = _mix(accent, black, 0.12) if best_on(accent) == white else _mix(accent, white, 0.12)
    on_accent = best_on(accent)
    soft = _mix(accent, bg, 0.82 if not dark else 0.75)
    soft2 = _mix(accent, bg, 0.68 if not dark else 0.6)
    return {k: _hex(v) for k, v in dict(bg=bg, soft=soft, soft2=soft2, card=card, accent=accent, on_accent=on_accent, ink=ink).items()}


def from_wishes(text: str) -> dict[str, str] | None:
    """«в чёрно-золотом стиле» → тёмная палитра с золотым акцентом. None — если в тексте нет цвета/стиля."""
    t = (text or "").lower()
    colors = [hexv for pat, hexv in COLOR_WORDS if re.search(pat, t)]
    style = {k for k, pat in STYLE_WORDS.items() if re.search(pat, t)}
    if not colors and not style:
        return None
    dark = "dark" in style and "light" not in style
    # «чёрно-золотой»: чёрный — фон, акцент — второй цвет
    chromatic = [c for c in colors if c not in ("#1A1A1A", "#5F6670")]
    if colors and colors[0] == "#1A1A1A" and chromatic:
        dark = True
    accent_hex = chromatic[0] if chromatic else (colors[0] if colors else {"dark": "#C9A45C", "pastel": "#D9487E", "bright": "#FF7A00"}.get(next(iter(style - {"light"}), ""), "#2B2B2B"))
    return build(_rgb(accent_hex), dark=dark, pastel="pastel" in style)


def from_image(path: str | Path) -> dict[str, str]:
    """Цвета референса: доминирующий насыщенный цвет → акцент; общая яркость → светлая/тёмная тема."""
    img = ImageOps.exif_transpose(Image.open(path)).convert("RGB")
    img.thumbnail((160, 160))
    q = img.quantize(colors=8, method=Image.Quantize.MEDIANCUT)
    pal = q.getpalette()[: 8 * 3]
    counts = sorted(q.getcolors(), reverse=True)  # [(count, index)]
    total = sum(c for c, _ in counts)
    swatches = [((pal[i * 3], pal[i * 3 + 1], pal[i * 3 + 2]), c / total) for c, i in counts]
    mean_lum = sum(_lum(col) * share for col, share in swatches)
    candidates = [(col, share) for col, share in swatches if share >= 0.03]
    accent = max(candidates, key=lambda cs: _sat(cs[0]) * (0.4 + cs[1]))[0] if candidates else (43, 89, 255)
    if _sat(accent) < 0.12:  # референс почти бесцветный — нейтральный графит
        accent = (43, 43, 43) if mean_lum > 0.3 else (201, 164, 92)
    return build(accent, dark=mean_lum < 0.18)
