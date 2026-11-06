"""Минимальный клиент Telegram Bot API (официальный HTTP API, без сторонних SDK)."""
from __future__ import annotations

import json
import logging
from pathlib import Path

import httpx

from ..config import get_settings

log = logging.getLogger("vitrinalab.telegram")


class TelegramError(Exception):
    pass


def enabled() -> bool:
    return bool(get_settings().telegram_bot_token)


def _call(method: str, data: dict | None = None, files: dict | None = None, timeout: float = 30) -> dict:
    token = get_settings().telegram_bot_token
    if not token:
        raise TelegramError("TELEGRAM_BOT_TOKEN не задан")
    url = f"https://api.telegram.org/bot{token}/{method}"
    payload = {k: (json.dumps(v, ensure_ascii=False) if isinstance(v, (dict, list)) else v) for k, v in (data or {}).items() if v is not None}
    r = httpx.post(url, data=payload, files=files, timeout=timeout)
    d = r.json()
    if not d.get("ok"):
        raise TelegramError(d.get("description", f"HTTP {r.status_code}"))
    return d["result"]


def keyboard(rows: list[list[tuple[str, str]]]) -> dict:
    """[[(текст, callback_data | url)]] → inline keyboard."""
    return {
        "inline_keyboard": [
            [{"text": t, "url": v} if v.startswith("http") else {"text": t, "callback_data": v} for t, v in row] for row in rows
        ]
    }


def send_message(chat_id: str | int, text: str, markup: dict | None = None) -> dict:
    return _call("sendMessage", {"chat_id": chat_id, "text": text[:4096], "reply_markup": markup, "disable_web_page_preview": True})


def send_photo(chat_id: str | int, path: str | Path, caption: str = "", markup: dict | None = None) -> dict:
    with open(path, "rb") as f:
        return _call("sendPhoto", {"chat_id": chat_id, "caption": caption[:1024], "reply_markup": markup}, files={"photo": f}, timeout=120)


def send_document(chat_id: str | int, path: str | Path, caption: str = "") -> dict:
    with open(path, "rb") as f:
        return _call("sendDocument", {"chat_id": chat_id, "caption": caption[:1024]}, files={"document": (Path(path).name, f)}, timeout=300)


def answer_callback(callback_id: str, text: str = "") -> None:
    try:
        _call("answerCallbackQuery", {"callback_query_id": callback_id, "text": text})
    except TelegramError as e:
        log.warning("answerCallbackQuery: %s", e)


def get_updates(offset: int, timeout: int = 25) -> list[dict]:
    return _call("getUpdates", {"offset": offset, "timeout": timeout, "allowed_updates": ["message", "callback_query"]}, timeout=timeout + 10)


def download_file(file_id: str, dest: Path) -> Path:
    info = _call("getFile", {"file_id": file_id})
    token = get_settings().telegram_bot_token
    r = httpx.get(f"https://api.telegram.org/file/bot{token}/{info['file_path']}", timeout=120)
    r.raise_for_status()
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(r.content)
    return dest


def setup_bot(brand: str) -> None:
    """Описание и команды бота через официальный Bot API (идемпотентно)."""
    _call("setMyCommands", {"commands": [
        {"command": "start", "description": "Начать: бесплатное превью карточки"},
        {"command": "human", "description": "Связаться с руководителем"},
    ]})
    _call("setMyShortDescription", {"short_description": f"{brand}: инфографика и SEO для карточек WB и Ozon за 24 часа. AI-ассистент."[:120]})
    _call("setMyDescription", {"description": (
        f"Я — AI-ассистент студии {brand}. Пришлите фото товара и факты о нём — "
        "через пару минут покажу бесплатное превью обложки для Wildberries или Ozon. "
        "Полный комплект: слайды 1440×1920, SEO-название и описание, варианты обложки. Срок — до 24 часов."
    )[:512]})


def set_owner_commands(chat_id: str, commands: dict[str, str]) -> None:
    """Меню команд владельца — видно только в его чате."""
    _call("setMyCommands", {
        "commands": [{"command": c.lstrip("/"), "description": d[:256]} for c, d in commands.items()],
        "scope": {"type": "chat", "chat_id": int(chat_id)},
    })


def get_me() -> dict:
    return _call("getMe")
