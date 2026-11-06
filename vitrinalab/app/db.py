from __future__ import annotations

from contextlib import contextmanager
from typing import Iterator

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .config import get_settings


class Base(DeclarativeBase):
    pass


_engine: Engine | None = None
_SessionLocal: sessionmaker | None = None


def _sqlite_pragmas(dbapi_conn, _record):  # pragma: no cover - простая настройка
    cur = dbapi_conn.cursor()
    cur.execute("PRAGMA journal_mode=WAL")
    cur.execute("PRAGMA busy_timeout=10000")
    cur.execute("PRAGMA foreign_keys=ON")
    cur.close()


def get_engine() -> Engine:
    global _engine, _SessionLocal
    if _engine is None:
        url = get_settings().db_url
        kwargs: dict = {"pool_pre_ping": True}
        if url.startswith("sqlite"):
            kwargs["connect_args"] = {"check_same_thread": False, "timeout": 30}
        _engine = create_engine(url, **kwargs)
        if url.startswith("sqlite"):
            event.listen(_engine, "connect", _sqlite_pragmas)
        _SessionLocal = sessionmaker(bind=_engine, expire_on_commit=False)
    return _engine


def reset_engine() -> None:
    global _engine, _SessionLocal
    if _engine is not None:
        _engine.dispose()
    _engine = None
    _SessionLocal = None


def init_db(retries: int = 30, delay: float = 2.0) -> None:
    """Создать таблицы. Ждёт, пока БД начнёт принимать подключения (старт контейнеров)."""
    import logging
    import time

    from sqlalchemy.exc import IntegrityError, OperationalError, ProgrammingError

    from . import models  # noqa: F401  регистрирует таблицы

    for attempt in range(1, retries + 1):
        try:
            Base.metadata.create_all(get_engine())
            return
        except (OperationalError, IntegrityError, ProgrammingError) as e:
            # OperationalError — БД ещё стартует; Integrity/Programming — веб и воркер
            # одновременно создают таблицы в Postgres: повтор увидит уже созданные
            if attempt == retries:
                raise
            logging.getLogger("vitrinalab.db").warning("БД недоступна (%s/%s): %s", attempt, retries, str(e).splitlines()[0])
            time.sleep(delay + (attempt % 3) * 0.3)


@contextmanager
def session_scope() -> Iterator[Session]:
    get_engine()
    assert _SessionLocal is not None
    s: Session = _SessionLocal()
    try:
        yield s
        s.commit()
    except Exception:
        s.rollback()
        raise
    finally:
        s.close()
