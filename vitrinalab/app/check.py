"""Самопроверка запуска: python -m app.check

Проверяет БД, рендер, вырезку, AI, Telegram, платежи, почту и доступность сайта.
Каждый пункт: ✅ работает / ⚠️ не настроено (необязательно) / ❌ ошибка + подсказка.
Реальные внешние вызовы минимальны (1 короткий запрос к LLM ≈ копейки).
"""
from __future__ import annotations

import sys
import tempfile
from pathlib import Path

import httpx

from .config import get_settings

OK, WARN, FAIL = "✅", "⚠️ ", "❌"
results: list[tuple[str, str, str]] = []


def add(status: str, name: str, note: str = "") -> None:
    results.append((status, name, note))


def check_core() -> None:
    from sqlalchemy import text

    from .db import get_engine, init_db

    cfg = get_settings()
    try:
        init_db()
        with get_engine().connect() as c:
            c.execute(text("select 1"))
        add(OK, "База данных", cfg.db_url.split("@")[-1])
    except Exception as e:  # noqa: BLE001
        add(FAIL, "База данных", str(e)[:200])
    if cfg.app_secret in ("", "dev-secret-change-me") or len(cfg.app_secret) < 24:
        add(FAIL, "APP_SECRET", "задайте длинную случайную строку (bootstrap.sh делает это сам)")
    else:
        add(OK, "APP_SECRET")
    add(OK if len(cfg.admin_password) >= 10 else FAIL, "Пароль админки", "" if len(cfg.admin_password) >= 10 else "ADMIN_PASSWORD — минимум 10 символов")
    for key, label in (("owner_full_name", "ФИО"), ("owner_inn", "ИНН"), ("owner_email", "e-mail")):
        if not getattr(cfg, key):
            add(WARN, f"Реквизиты: {label}", f"{key.upper()} — нужно для оферты и политики ПД до приёма оплат")


def check_production() -> None:
    from .imaging.cutout import _load_model
    from .imaging.render import renderer

    cfg = get_settings()
    add(OK if _load_model() is not None else WARN, "Модель вырезки U²-Net", "" if Path(cfg.cutout_model).exists() else f"нет файла {cfg.cutout_model} — будет работать только вырезка белого фона")
    try:
        with tempfile.TemporaryDirectory() as d:
            from PIL import Image

            from .imaging.render import to_data_uri

            img = Image.new("RGBA", (200, 300), (30, 120, 90, 255))
            r = renderer.render({"type": "cover", "layout": "a", "headline": "Проверка", "subline": "", "badges": ["Тест"], "eyebrow": ""}, "warm", to_data_uri(img), Path(d) / "t.jpg")
            add(OK if (r.width, r.height) == (1440, 1920) else FAIL, "Рендер слайдов (Chromium)", f"{r.width}×{r.height}")
    except Exception as e:  # noqa: BLE001
        add(FAIL, "Рендер слайдов (Chromium)", str(e)[:200])


def check_ai() -> None:
    from .llm.providers import MockLLM, get_image_gen, get_llm

    cfg = get_settings()
    llm = get_llm(cfg)
    if isinstance(llm, MockLLM):
        add(WARN, "LLM", f"LLM_PROVIDER={cfg.llm_provider}: ключи не заданы — тексты делает запасной алгоритм")
    else:
        try:
            res = llm.complete("Отвечай одним словом.", "Скажи: работает", max_tokens=10)
            add(OK, f"LLM ({llm.name})", f"ответ: {res.text.strip()[:30]!r}, токенов {res.tokens_in}+{res.tokens_out}")
        except Exception as e:  # noqa: BLE001
            add(FAIL, f"LLM ({llm.name})", f"{e}"[:200] + " — проверьте API-ключ, folder id и роль сервисного аккаунта")
    if cfg.image_provider == "none":
        add(WARN, "Генерация фонов", "IMAGE_PROVIDER=none — используются фирменные CSS-фоны (это нормально для старта)")
    else:
        add(OK if get_image_gen(cfg) else FAIL, "Генерация фонов (YandexART)", "ключи найдены; реальная генерация проверится на первом заказе")


def check_telegram() -> None:
    from .db import session_scope
    from .events import owner_chat_id, owner_code
    from .integrations import telegram

    cfg = get_settings()
    if not cfg.telegram_bot_token:
        add(FAIL, "Telegram-бот", "TELEGRAM_BOT_TOKEN не задан — создайте бота в @BotFather")
        return
    try:
        me = telegram.get_me()
        add(OK, "Telegram-бот", f"@{me.get('username')} — ссылка для клиентов: https://t.me/{me.get('username')}")
    except Exception as e:  # noqa: BLE001
        add(FAIL, "Telegram-бот", str(e)[:200])
        return
    with session_scope() as s:
        chat = owner_chat_id(s)
    if chat:
        try:
            telegram.send_message(chat, "✅ Проверка связи: отчёты и эскалации будут приходить сюда.")
            add(OK, "Чат владельца", f"тестовое сообщение отправлено в {chat}")
        except Exception as e:  # noqa: BLE001
            add(FAIL, "Чат владельца", str(e)[:200])
    else:
        add(FAIL, "Чат владельца", f"напишите боту: /owner {owner_code()}")
    if cfg.telegram_channel_id:
        try:
            m = telegram._call("getChatMember", {"chat_id": cfg.telegram_channel_id, "user_id": me["id"]})
            ok = m.get("status") in ("administrator", "creator") and m.get("can_post_messages", True)
            add(OK if ok else FAIL, "Канал для постов", "" if ok else "сделайте бота администратором канала с правом публикации")
        except Exception as e:  # noqa: BLE001
            add(FAIL, "Канал для постов", str(e)[:200])
    else:
        add(WARN, "Канал для постов", "TELEGRAM_CHANNEL_ID не задан — Marketing будет готовить посты, но не публиковать")


def check_payments() -> None:
    cfg = get_settings()
    if cfg.payment_provider == "yookassa":
        try:
            r = httpx.get("https://api.yookassa.ru/v3/me", auth=(cfg.yookassa_shop_id, cfg.yookassa_secret_key), timeout=20)
            if r.status_code == 200:
                d = r.json()
                add(OK, "ЮKassa", f"магазин {d.get('account_id')}, тестовый режим: {d.get('test')}")
                add(WARN, "Вебхук ЮKassa", f"проверьте в ЛК ЮKassa: {cfg.public_url}/webhooks/yookassa, событие payment.succeeded")
            else:
                add(FAIL, "ЮKassa", f"HTTP {r.status_code}: проверьте shopId и секретный ключ")
        except Exception as e:  # noqa: BLE001
            add(FAIL, "ЮKassa", str(e)[:200])
    else:
        bad = "реквизиты пришлёт менеджер" in cfg.manual_payment_details or "XXXX" in cfg.manual_payment_details
        add(
            FAIL if bad else OK,
            "Ручная оплата (СБП)",
            "впишите в MANUAL_PAYMENT_DETAILS свои реквизиты для перевода" if bad else "клиент жмёт «Я оплатил(а)», вы подтверждаете кнопкой в Telegram",
        )


def check_email() -> None:
    import smtplib
    import ssl

    cfg = get_settings()
    if not cfg.smtp_host:
        add(WARN, "E-mail (SMTP)", "не настроен — клиенты с сайта увидят результат в личном кабинете по ссылке")
        return
    try:
        if cfg.smtp_port == 465:
            with smtplib.SMTP_SSL(cfg.smtp_host, cfg.smtp_port, context=ssl.create_default_context(), timeout=20) as s:
                s.login(cfg.smtp_user, cfg.smtp_password)
        else:
            with smtplib.SMTP(cfg.smtp_host, cfg.smtp_port, timeout=20) as s:
                s.starttls(context=ssl.create_default_context())
                s.login(cfg.smtp_user, cfg.smtp_password)
        add(OK, "E-mail (SMTP)", cfg.smtp_user)
    except Exception as e:  # noqa: BLE001
        add(FAIL, "E-mail (SMTP)", str(e)[:200])


def check_public() -> None:
    cfg = get_settings()
    if not cfg.has_public_site:
        add(WARN, "Сайт", "не опубликован — режим «только Telegram-бот» (нормально для старта без вложений; ЮKassa требует сайт)")
        if cfg.payment_provider == "yookassa":
            add(FAIL, "ЮKassa без сайта", "для ЮKassa нужен публичный https-адрес; на старте используйте PAYMENT_PROVIDER=manual")
        return
    try:
        r = httpx.get(cfg.public_url + "/healthz", timeout=20)
        add(OK if r.status_code == 200 else FAIL, "Сайт и воркер", f"{cfg.public_url}/healthz → {r.status_code} {r.text[:80]}")
    except Exception as e:  # noqa: BLE001
        add(FAIL, "Сайт", f"{cfg.public_url} недоступен: {e}"[:200])


def main(offline: bool = False) -> int:
    check_core()
    check_production()
    if not offline:
        check_ai()
        check_telegram()
        check_payments()
        check_email()
        check_public()
    width = max(len(n) for _, n, _ in results)
    for st, name, note in results:
        print(f"{st} {name.ljust(width)}  {note}")
    fails = sum(1 for st, *_ in results if st == FAIL)
    print(f"\nИтого: {sum(1 for st, *_ in results if st == OK)} ок, {sum(1 for st, *_ in results if st == WARN)} предупреждений, {fails} ошибок")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main(offline="--offline" in sys.argv))
