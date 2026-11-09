"""Фоновый воркер: очередь задач + планировщик + Telegram-опрос + резервные копии.

Запуск: python -m app.worker
Работает круглосуточно на сервере, не зависит от чата с Claude.
"""
from __future__ import annotations

import logging
import os
import re
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
from .agents import ceo, delivery, marketing, production, research, scout  # noqa: F401

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
    ("scout_orders", lambda t: t.minute % 30 == 7, "scout_orders"),
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


POLLER_LEASE = timedelta(seconds=90)


def acquire_poller_lease(worker_id: str) -> bool:
    """Слушать Telegram может только один процесс: аренда в БД, продлевается каждый цикл."""
    with session_scope() as s:
        cur = get_setting(s, "tg_poller")
        if cur and "|" in cur:
            owner, ts = cur.split("|", 1)
            try:
                fresh = utcnow() - datetime.fromisoformat(ts) < POLLER_LEASE
            except ValueError:
                fresh = False
            if owner != worker_id and fresh:
                return False
        set_setting(s, "tg_poller", f"{worker_id}|{utcnow().isoformat()}")
    return True


def claim_update(update_id: int) -> bool:
    """Атомарно «забронировать» сообщение: обработать его может только один процесс и только один раз."""
    from sqlalchemy import update as sql_update

    from .models import Setting

    with session_scope() as s:
        cur = s.get(Setting, "tg_offset")
        if cur is None:
            s.add(Setting(key="tg_offset", value="0"))
            s.flush()
            cur_val = "0"
        else:
            cur_val = cur.value or "0"
        if update_id < int(cur_val):
            return False  # уже обработано
        res = s.execute(
            sql_update(Setting).where(Setting.key == "tg_offset", Setting.value == cur_val).values(value=str(update_id + 1))
        )
        return res.rowcount == 1


def claim_message(chat_id: int, message_id: int) -> bool:
    """Вторая защита от дублей: одно и то же сообщение чата (по message_id) обрабатывается один раз."""
    from sqlalchemy import update as sql_update

    from .models import Setting

    key = f"tgm:{chat_id}"
    with session_scope() as s:
        row = s.get(Setting, key)
        if row is None:
            try:
                with s.begin_nested():
                    s.add(Setting(key=key, value=str(message_id)))
                return True
            except Exception:  # noqa: BLE001 — строку создал параллельный процесс
                row = s.get(Setting, key)
        last = int(row.value or 0)
        if message_id <= last:
            return False
        res = s.execute(sql_update(Setting).where(Setting.key == key, Setting.value == row.value).values(value=str(message_id)))
        return res.rowcount == 1


def process_updates(updates: list[dict]) -> int:
    """Обработать пачку сообщений. Возвращает, сколько обработано этим процессом."""
    from .agents import sales

    done = 0
    for upd in updates:
        msg = upd.get("message") or {}
        chat_id, message_id = (msg.get("chat") or {}).get("id"), msg.get("message_id")
        log.info("tg update %s chat=%s message=%s", upd.get("update_id"), chat_id, message_id)
        if not claim_update(upd["update_id"]):
            log.info("tg update %s пропущено: уже обработано", upd.get("update_id"))
            continue
        if chat_id is not None and message_id is not None and not claim_message(chat_id, message_id):
            log.info("tg message %s/%s пропущено: это сообщение уже обработано", chat_id, message_id)
            continue
        done += 1
        try:
            with session_scope() as s:
                sales.handle_update(s, upd)
        except Exception as e:  # noqa: BLE001 — сообщение не повторяем (иначе клиент получит дубли), сообщаем владельцу
            log.exception("update %s failed", upd.get("update_id"))
            reason = re.sub(r"bot\d+:[\w-]+", "bot***", f"{type(e).__name__}: {e}")[:300]  # токен бота не светим
            try:
                with session_scope() as s:
                    from .events import escalate

                    escalate(s, "sales", "Ошибка обработки сообщения в Telegram", f"update_id={upd.get('update_id')}\nПричина: {reason}", "warn")
            except Exception:  # noqa: BLE001
                log.exception("escalation failed")
    return done


def telegram_poller(worker_id: str = "poller") -> None:
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
    while not STOP.is_set():
        try:
            if not acquire_poller_lease(worker_id):
                log.info("Telegram слушает другой процесс — жду")
                STOP.wait(30)
                continue
            with session_scope() as s:
                offset = int(get_setting(s, "tg_offset") or 0)
            updates = telegram.get_updates(offset)
            process_updates(updates)
        except Exception as e:  # noqa: BLE001 — сеть, «database is locked», 409 Conflict
            log.warning("telegram poller: %s", e)
            STOP.wait(5)


def main() -> None:
    logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO"), format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    init_db()
    worker_id = f"{socket.gethostname()}:{os.getpid()}"
    signal.signal(signal.SIGTERM, lambda *_: STOP.set())
    signal.signal(signal.SIGINT, lambda *_: STOP.set())
    threading.Thread(target=telegram_poller, args=(worker_id,), daemon=True, name="tg").start()
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
    try:  # при остановке сразу освобождаем бота для нового процесса
        with session_scope() as s:
            if get_setting(s, "tg_poller").startswith(f"{worker_id}|"):
                set_setting(s, "tg_poller", "")
    except Exception:  # noqa: BLE001
        pass
    from .imaging.render import Renderer

    Renderer.shutdown()
    log.info("worker stopped")


if __name__ == "__main__":
    main()
