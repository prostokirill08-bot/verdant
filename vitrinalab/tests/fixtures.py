"""Синтетический «товар» на белом фоне для тестов (термокружка)."""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter


def make_product_photo(path: Path, bg=(250, 250, 250)) -> Path:
    W, H = 1200, 1500
    img = Image.new("RGB", (W, H), bg)
    d = ImageDraw.Draw(img)
    # тень
    sh = Image.new("L", (W, H), 0)
    ImageDraw.Draw(sh).ellipse((380, 1280, 820, 1350), fill=90)
    img.paste((205, 205, 205), mask=sh.filter(ImageFilter.GaussianBlur(18)))
    # корпус
    d.rounded_rectangle((420, 330, 780, 1300), radius=70, fill=(38, 110, 92))
    d.rectangle((420, 520, 780, 900), fill=(24, 86, 70))
    d.rounded_rectangle((400, 250, 800, 380), radius=40, fill=(30, 30, 34))
    d.rounded_rectangle((540, 200, 660, 270), radius=20, fill=(55, 55, 60))
    # блик
    d.rounded_rectangle((460, 420, 500, 1220), radius=20, fill=(90, 160, 140))
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, "JPEG", quality=92)
    return path
