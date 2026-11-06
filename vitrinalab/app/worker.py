"""Фоновый воркер: очередь задач + планировщик + Telegram-опрос + резервные копии.

Запуск: python -m app.worker
Работает круглосуточно на сервере, не зависит от чата с Claude.
"""
from __future__ import annotations

import logging
import os
import signal
import socket
import sqlite3
import threading
from datetime import datetime, timedelta

from .config import get_settings
from .db import init_db, session_scope
from .events import get_setting, set_setting
from .models import utcnow
from .queue import claim_next, enqueue, run_task

# регистрация обработчиков задач
from .agents import ceo, delivery, marketing, production, research  # noqa: F401

log = logging.getLogger("vitrinalab.worker")
STOP = threading.Event()


def msk_now() -> datetime:
    return utcnow() + timedelta(hours=3)


# (имя, условие запуска по московскому времени, задача)
SCHEDULE = [
    ("ops_review", lambda t: t.minute % 15 == 0, "ops_review"),
    ("publish_posts", lambda t: t.minute % 10 == 0, "publish_posts"),
    ("daily_report", lambda t: t.hour == get_settings().daily_report_hour and t.minute == 0, "daily_report"),
    ("content_plan", lambda t: t.weekday() == 0 and t.hour == 9 and t.minute == 0, "content_plan"),
    ("funnel_digest", lambda t: t.weekday() == 0 and t.hour == 9 and t.minute == 5, "funnel_digest"),
    ("backup", lambda t: t.hour == 4 and t.minute == 0, "backup"),
]


def scheduler_tick() -> None:
    t = msk_now()
    slot = t.strftime("%Y%m%d%H%M")
    with session_scope() as s:
        for name, due, kind in SCHEDULE:
            if due(t):
                # ключ идемпотентности на минуту — задача не продублируется при нескольких воркерах
                enqueue(s, kind, {}, idempotency_key=f"sched:{name}:{slot}")
        set_setting(s, "worker_heartbeat", utcnow().isoformat())


from .queue import handler  # noqa: E402


@handler("backup")
def backup(s, payload, task) -> None:
    """Резервная копия SQLite (онлайн, без остановки). Для Postgres — pg_dump по cron (см. DEPLOY)."""
    cfg = get_settings()
    if not cfg.db_url.startswith("sqlite"):
        return
    src = cfg.db_url.replace("sqlite:///", "")
    bdir = cfg.data_dir / "backups"
    bdir.mkdir(parents=True, exist_ok=True)
    dst = bdir / f"vitrinalab-{msk_now():%Y%m%d-%H%M}.db"
    with sqlite3.connect(src) as a, sqlite3.connect(dst) as b:
        a.backup(b)
    for old in sorted(bdir.glob("vitrinalab-*.db"))[:-14]:  # храним 14 копий
        old.unlink()


def telegram_poller() -> None:
    from .agents import sales
    from .integrations import telegram

    cfg = get_settings()
    if not (cfg.telegram_bot_token and cfg.telegram_polling):
        log.info("Telegram polling выключен")
        return
    try:
        telegram.setup_bot(cfg.brand_name)
        from .agents.owner import COMMANDS
        from .events import owner_chat_id

        with session_scope() as s:
            chat = owner_chat_id(s)
        if chat:
            telegram.set_owner_commands(chat, COMMANDS)
    except Exception as e:  # noqa: BLE001 — не критично
        log.warning("setup_bot: %s", e)
    with session_scope() as s:
        offset = int(get_setting(s, "tg_offset") or 0)
    while not STOP.is_set():
        try:
            updates = telegram.get_updates(offset)
        except Exception as e:  # noqa: BLE001
            log.warning("getUpdates: %s", e)
            STOP.wait(5)
            continue
        for upd in updates:
            offset = upd["update_id"] + 1
            try:
                with session_scope() as s:
                    sales.handle_update(s, upd)
                    set_setting(s, "tg_offset", str(offset))
            except Exception:  # noqa: BLE001
                log.exception("update %s failed", upd.get("update_id"))
                with session_scope() as s:
                    set_setting(s, "tg_offset", str(offset))
                    from .events import escalate

                    escalate(s, "sales", "Ошибка обработки сообщения в Telegram", f"update_id={upd.get('update_id')}", "warn")


def main() -> None:
    logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO"), format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    init_db()
    worker_id = f"{socket.gethostname()}:{os.getpid()}"
    signal.signal(signal.SIGTERM, lambda *_: STOP.set())
    signal.signal(signal.SIGINT, lambda *_: STOP.set())
    threading.Thread(target=telegram_poller, daemon=True, name="tg").start()
    last_tick = ""
    log.info("worker %s started", worker_id)
    while not STOP.is_set():
        minute = msk_now().strftime("%H%M")
        if minute != last_tick:
            last_tick = minute
            try:
                scheduler_tick()
            except Exception:  # noqa: BLE001
                log.exception("scheduler tick failed")
        try:
            tid = claim_next(worker_id)
            if tid is None:
                STOP.wait(1.0)
                continue
            run_task(tid)
        except Exception:  # noqa: BLE001 — например, «database is locked»: подождать и продолжить
            log.exception("worker loop error, retrying in 3s")
            STOP.wait(3.0)
    from .imaging.render import Renderer

    Renderer.shutdown()
    log.info("worker stopped")


if __name__ == "__main__":
    main()
