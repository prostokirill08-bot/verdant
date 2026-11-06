"""Очередь, копирайтинг, QC, финансы — без браузера."""
from sqlalchemy import select

from app.agents import qc
from app.agents.copywriter import fallback_content, plan_slides, shorten, split_facts
from app.agents.knowledge import safe_reply
from app.db import session_scope
from app.models import Escalation, Task
from app.queue import handler, enqueue, run_pending
from tests.conftest import FEATURES


def test_enqueue_is_idempotent():
    with session_scope() as s:
        assert enqueue(s, "noop", {}, idempotency_key="k1") is not None
        assert enqueue(s, "noop", {}, idempotency_key="k1") is None
        assert len(s.scalars(select(Task)).all()) == 1


def test_retry_then_dead_escalates(monkeypatch):
    calls = {"n": 0}

    @handler("always_fails")
    def _fail(s, payload, task):
        calls["n"] += 1
        raise RuntimeError("boom")

    with session_scope() as s:
        enqueue(s, "always_fails", {}, max_attempts=2)
    run_pending()
    with session_scope() as s:
        t = s.scalar(select(Task).where(Task.kind == "always_fails"))
        assert t.status == "failed" and t.attempts == 1
        t.run_after = t.created_at  # ускоряем повтор
    run_pending()
    with session_scope() as s:
        t = s.scalar(select(Task).where(Task.kind == "always_fails"))
        assert t.status == "dead" and calls["n"] == 2
        esc = s.scalars(select(Escalation)).all()
        assert any("always_fails" in e.title for e in esc)


def test_split_and_shorten():
    assert split_facts("а; б\n• в") == ["А", "Б", "В"]
    assert shorten("Подходит для автомобильного подстаканника", 14) == "Подходит"


def test_fallback_content_uses_only_client_facts():
    c = fallback_content("Термокружка 450 мл", FEATURES, "wb")
    errors, _ = qc.check_content(c, "Термокружка 450 мл\n" + FEATURES, "wb")
    assert errors == []
    assert ["Объём", "450 мл"] in c["specs"]
    assert len(c["title_seo"]) <= 60
    slides = plan_slides(c, 8)
    assert slides[0]["type"] == "cover" and len(slides) == 8


def test_qc_catches_banned_and_invented():
    c = fallback_content("Кружка", "Объём: 450 мл\nДержит тепло", "wb")
    c["cover"]["headline"] = "Лучшая кружка №1 за 990 ₽"
    c["benefits"][0]["text"] = "Держит тепло 12 часов"
    errors, _ = qc.check_content(c, "Кружка\nОбъём: 450 мл\nДержит тепло", "wb")
    text = " | ".join(errors)
    assert "лучш" in text.lower() and "№1" in text and "12" in text and "цены" in text


def test_sales_reply_guard():
    assert safe_reply("Тариф Старт стоит 2490 ₽")
    assert not safe_reply("Для вас 1990 ₽")
    assert not safe_reply("Дам скидку 10%")
