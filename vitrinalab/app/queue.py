"""Очередь фоновых задач в БД: повторы с экспоненциальной задержкой, идемпотентность, блокировки.

Задача с одинаковым idempotency_key ставится только один раз — так заказ
или платёж не будет обработан дважды, даже если вебхук пришёл повторно.
"""
from __future__ import annotations

import logging
import traceback
from datetime import timedelta
from typing import Callable

from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .db import session_scope
from .models import Task, utcnow

log = logging.getLogger("vitrinalab.queue")

HANDLERS: dict[str, Callable[[Session, dict, Task], None]] = {}
LOCK_TIMEOUT = timedelta(minutes=20)


def handler(kind: str):
    def deco(fn):
        HANDLERS[kind] = fn
        return fn

    return deco


class RetryLater(Exception):
    """Временная ошибка: повторить позже без траты попытки на «мёртвую» задачу."""


class PermanentError(Exception):
    """Повтор бессмысленен — сразу в dead и эскалация."""


def enqueue(
    s: Session,
    kind: str,
    payload: dict | None = None,
    *,
    idempotency_key: str | None = None,
    delay_seconds: int = 0,
    max_attempts: int = 4,
) -> Task | None:
    """Поставить задачу. Возвращает None, если задача с таким ключом уже есть."""
    if idempotency_key:
        existing = s.scalar(select(Task).where(Task.idempotency_key == idempotency_key))
        if existing:
            return None
    t = Task(
        kind=kind,
        payload=payload or {},
        idempotency_key=idempotency_key,
        run_after=utcnow() + timedelta(seconds=delay_seconds),
        max_attempts=max_attempts,
    )
    try:
        with s.begin_nested():
            s.add(t)
            s.flush()
    except IntegrityError:
        return None
    return t


def claim_next(worker_id: str) -> int | None:
    """Атомарно забрать одну готовую задачу. Работает и в SQLite, и в Postgres."""
    now = utcnow()
    with session_scope() as s:
        # освобождаем зависшие блокировки (воркер упал во время выполнения)
        s.execute(
            update(Task)
            .where(Task.status == "running", Task.locked_at < now - LOCK_TIMEOUT)
            .values(status="failed", locked_by="", last_error="lock timeout")
        )
        candidates = s.scalars(
            select(Task.id)
            .where(Task.status.in_(["queued", "failed"]), Task.run_after <= now)
            .order_by(Task.run_after, Task.id)
            .limit(5)
        ).all()
        for tid in candidates:
            res = s.execute(
                update(Task)
                .where(Task.id == tid, Task.status.in_(["queued", "failed"]))
                .values(status="running", locked_by=worker_id, locked_at=now, attempts=Task.attempts + 1)
            )
            if res.rowcount == 1:
                return tid
    return None


def run_task(task_id: int) -> str:
    """Выполнить задачу. Возвращает итоговый статус."""
    from .events import escalate

    with session_scope() as s:
        task = s.get(Task, task_id)
        assert task is not None
        fn = HANDLERS.get(task.kind)
        kind, payload, attempts, max_attempts = task.kind, dict(task.payload), task.attempts, task.max_attempts

    if fn is None:
        status, err = "dead", f"нет обработчика для {kind}"
    else:
        try:
            with session_scope() as s:
                task = s.get(Task, task_id)
                fn(s, payload, task)
            status, err = "done", ""
        except RetryLater as e:
            status, err = "failed", f"retry: {e}"
        except PermanentError as e:
            status, err = "dead", str(e)
        except Exception as e:  # noqa: BLE001
            err = f"{type(e).__name__}: {e}\n{traceback.format_exc(limit=5)}"
            status = "dead" if attempts >= max_attempts else "failed"
            log.exception("task %s (%s) failed, attempt %s", task_id, kind, attempts)

    with session_scope() as s:
        task = s.get(Task, task_id)
        task.status = status
        task.locked_by = ""
        task.last_error = err[:4000]
        if status == "failed":
            backoff = min(30 * 2 ** max(attempts - 1, 0), 3600)
            task.run_after = utcnow() + timedelta(seconds=backoff)
        if status == "dead" and kind != "notify_owner":
            escalate(
                s,
                "queue",
                f"Задача {kind} #{task_id} не выполнена после {attempts} попыток",
                err[:1500],
                severity="critical",
                entity="task",
                entity_id=task_id,
            )
    return status


def run_pending(worker_id: str = "inline", limit: int = 100) -> int:
    """Выполнить все готовые задачи (используется в тестах и в однопроцессном режиме)."""
    n = 0
    while n < limit:
        tid = claim_next(worker_id)
        if tid is None:
            break
        run_task(tid)
        n += 1
    return n
