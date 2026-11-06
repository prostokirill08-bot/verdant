"""Оферта и политика ПД в виде текста — для отправки в Telegram (режим без сайта)."""
from __future__ import annotations

import html
import re
from pathlib import Path

from jinja2 import Environment, FileSystemLoader

from .config import get_settings
from .pricing import TURNAROUND

_env = Environment(loader=FileSystemLoader(Path(__file__).parent / "web" / "templates"), autoescape=True)


def legal_text(kind: str) -> str:
    body = _env.get_template(f"_{kind}_body.html").render(cfg=get_settings, TURNAROUND=TURNAROUND)
    body = re.sub(r"<h1>(.*?)</h1>", r"\1\n", body, flags=re.S)
    body = re.sub(r"<h3>(.*?)</h3>", r"\n\1", body, flags=re.S)
    body = re.sub(r"<p[^>]*>(.*?)</p>", r"\1\n", body, flags=re.S)
    body = re.sub(r"<[^>]+>", "", body)
    body = re.sub(r"\n{3,}", "\n\n", html.unescape(body))
    return body.strip()


def chunks(text: str, size: int = 3800) -> list[str]:
    out, cur = [], ""
    for para in text.split("\n"):
        if len(cur) + len(para) + 1 > size:
            out.append(cur)
            cur = ""
        cur += para + "\n"
    if cur.strip():
        out.append(cur)
    return out
