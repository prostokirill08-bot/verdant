"""Журнал событий, эскалации и настройки времени выполнения."""
from __future__ import annotations

import logging

from sqlalchemy.orm import Session

from .models import Escalation, Event, Setting

log = logging.getLogger("vitrinalab")


def record(s: Session, kind: str, entity: str = "", entity_id: int | None = None, **data) -> Event:
    ev = Event(kind=kind, entity=entity, entity_id=entity_id, data=data)
    s.add(ev)
    log.info("event %s %s#%s %s", kind, entity, entity_id, data or "")
    return ev


def escalate(
    s: Session,
    source: str,
    title: str,
    details: str = "",
    severity: str = "warn",
    entity: str = "",
    entity_id: int | None = None,
) -> Escalation:
    """Передать вопрос владельцу. Уведомление уходит в Telegram через очередь."""
    from .queue import enqueue

    esc = Escalation(source=source, title=title, details=details, severity=severity, entity=entity, entity_id=entity_id)
    s.add(esc)
    s.flush()
    record(s, "escalation", "escalation", esc.id, title=title, severity=severity)
    enqueue(s, "notify_owner", {"escalation_id": esc.id}, idempotency_key=f"notify_esc:{esc.id}")
    return esc


DEFAULTS = {
    "auto_publish_posts": "0",  # посты в канал — только после одобрения
    "agents_paused": "0",
    "accept_orders": "1",
}


def get_setting(s: Session, key: str) -> str:
    row = s.get(Setting, key)
    return row.value if row else DEFAULTS.get(key, "")


def set_setting(s: Session, key: str, value: str) -> None:
    row = s.get(Setting, key)
    if row:
        row.value = value
    else:
        s.add(Setting(key=key, value=value))


def flag(s: Session, key: str) -> bool:
    return get_setting(s, key) == "1"


def owner_code() -> str:
    """Код для команды /owner в боте: так владелец привязывает свой Telegram без поиска chat id."""
    import hashlib
    import hmac

    from .config import get_settings

    return hmac.new(get_settings().app_secret.encode(), b"owner", hashlib.sha256).hexdigest()[:8]


def owner_chat_id(s: Session) -> str:
    from .config import get_settings

    return get_settings().telegram_owner_chat_id or get_setting(s, "owner_chat_id")
