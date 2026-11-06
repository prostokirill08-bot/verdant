"""Вырезка товара с фото клиента.

Принцип: товар НИКОГДА не генерируется нейросетью — берём реальный снимок клиента,
отделяем его от фона и компонуем. Так исключено «додумывание» деталей товара.

1. PNG с прозрачностью → используем как есть.
2. Модель сегментации U²-Net (ONNX, лицензия Apache-2.0) → маска.
3. Запасной путь: удаление однотонного светлого фона заливкой от краёв.
4. Если маска сомнительная → режим «фото в рамке» (без вырезки).
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageOps

from ..config import get_settings

log = logging.getLogger("vitrinalab.cutout")
_session = None


@dataclass
class Cutout:
    image: Image.Image  # RGBA, обрезано по товару
    method: str  # alpha | u2net | whitekey | frame
    coverage: float  # доля кадра, занятая товаром в исходнике


def _load_model():
    global _session
    if _session is None:
        path = get_settings().cutout_model
        if not Path(path).exists():
            return None
        import onnxruntime as ort

        _session = ort.InferenceSession(str(path), providers=["CPUExecutionProvider"])
    return _session


def _u2net_mask(img: Image.Image) -> np.ndarray | None:
    sess = _load_model()
    if sess is None:
        return None
    small = img.convert("RGB").resize((320, 320), Image.LANCZOS)
    x = np.asarray(small).astype(np.float32)
    x = x / max(float(x.max()), 1e-6)
    mean, std = np.array([0.485, 0.456, 0.406]), np.array([0.229, 0.224, 0.225])
    x = ((x - mean) / std).transpose(2, 0, 1)[None].astype(np.float32)
    out = sess.run(None, {sess.get_inputs()[0].name: x})[0][0, 0]
    out = (out - out.min()) / max(float(out.max() - out.min()), 1e-6)
    mask = Image.fromarray((out * 255).astype(np.uint8)).resize(img.size, Image.LANCZOS)
    return np.asarray(mask)


def _whitekey_mask(img: Image.Image, threshold: int = 232) -> np.ndarray | None:
    rgb = np.asarray(img.convert("RGB")).astype(np.int16)
    h, w, _ = rgb.shape
    border = np.concatenate([rgb[0], rgb[-1], rgb[:, 0], rgb[:, -1]])
    if (border.min(axis=1) >= threshold).mean() < 0.85:
        return None  # фон не светлый и не однотонный
    light = (rgb.min(axis=2) >= threshold).astype(np.uint8) * 255
    m = Image.fromarray(light, "L").copy()  # copy: иначе floodfill не меняет буфер numpy
    step = max(1, min(w, h) // 40)
    seeds = [(x, 0) for x in range(0, w, step)] + [(x, h - 1) for x in range(0, w, step)]
    seeds += [(0, y) for y in range(0, h, step)] + [(w - 1, y) for y in range(0, h, step)]
    for sx, sy in seeds:
        if m.getpixel((sx, sy)) == 255:
            ImageDraw.floodfill(m, (sx, sy), 128)
    bg = np.asarray(m) == 128
    alpha = np.where(bg, 0, 255).astype(np.uint8)
    a = Image.fromarray(alpha).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(1.2))
    return np.asarray(a)


def _apply(img: Image.Image, mask: np.ndarray, method: str) -> Cutout | None:
    alpha = Image.fromarray(mask.astype(np.uint8), "L")
    binary = mask > 40
    coverage = float(binary.mean())
    if not (0.03 <= coverage <= 0.96):
        return None
    ys, xs = np.where(binary)
    pad = int(max(img.size) * 0.01)
    box = (max(xs.min() - pad, 0), max(ys.min() - pad, 0), min(xs.max() + pad, img.width), min(ys.max() + pad, img.height))
    rgba = img.convert("RGBA")
    rgba.putalpha(alpha)
    return Cutout(rgba.crop(box), method, coverage)


def cut_product(path: str | Path) -> Cutout:
    img = ImageOps.exif_transpose(Image.open(path))
    img.thumbnail((2000, 2000), Image.LANCZOS)

    if img.mode in ("RGBA", "LA") and np.asarray(img.convert("RGBA"))[..., 3].min() < 250:
        res = _apply(img, np.asarray(img.convert("RGBA"))[..., 3], "alpha")
        if res:
            return res

    for method, fn in (("whitekey", _whitekey_mask), ("u2net", _u2net_mask)):
        try:
            mask = fn(img)
        except Exception as e:  # noqa: BLE001
            log.warning("cutout %s failed: %s", method, e)
            mask = None
        if mask is not None:
            res = _apply(img, mask, method)
            if res:
                return res

    return Cutout(img.convert("RGBA"), "frame", 1.0)


def dominant_color(img: Image.Image) -> tuple[int, int, int]:
    """Средний цвет непрозрачных пикселей товара — для подбора палитры."""
    a = np.asarray(img.convert("RGBA").resize((64, 64)))
    px = a[a[..., 3] > 128][:, :3]
    if len(px) == 0:
        return (128, 128, 128)
    return tuple(int(v) for v in np.median(px, axis=0))
