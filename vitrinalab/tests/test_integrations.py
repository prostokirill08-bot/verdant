"""Telegram-диалог Sales-агента и вебхук ЮKassa (внешние API подменены)."""
import shutil

import pytest
from sqlalchemy import select

from app.db import session_scope
from app.models import Client, Order, Payment
from app.queue import run_pending
from tests.conftest import FEATURES


@pytest.fixture
def tg(monkeypatch, product_photo):
    """Подменяем Telegram Bot API, складываем исходящие сообщения в список."""
    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", "123:test")
    from app import config
    from app.integrations import telegram

    config.reset_settings_cache()
    sent = []
    monkeypatch.setattr(telegram, "send_message", lambda chat, text, markup=None: sent.append(("msg", text, markup)) or {})
    monkeypatch.setattr(telegram, "send_photo", lambda chat, path, caption="", markup=None: sent.append(("photo", caption, markup)) or {})
    monkeypatch.setattr(telegram, "send_document", lambda chat, path, caption="": sent.append(("doc", str(path), None)) or {})
    monkeypatch.setattr(telegram, "answer_callback", lambda *a, **k: None)
    monkeypatch.setattr(telegram, "download_file", lambda fid, dest: (dest.parent.mkdir(parents=True, exist_ok=True), shutil.copy(product_photo, dest))[1])
    return sent


def _upd(text=None, photo=False, uid=1):
    m = {"message_id": 10, "chat": {"id": 777, "type": "private"}, "from": {"id": 777, "first_name": "Анна", "username": "anna"}}
    if text is not None:
        m["text" if not photo else "caption"] = text
    if photo:
        m["photo"] = [{"file_id": "small"}, {"file_id": "big"}]
    return {"update_id": uid, "message": m}


def test_telegram_sales_to_delivery(tg):
    from app.agents import sales
    from app.agents import ceo, delivery, production  # noqa: F401  регистрация задач

    with session_scope() as s:
        sales.handle_update(s, _upd("/start src_kwork"))
    assert "AI-ассистент" in tg[-1][1]
    with session_scope() as s:
        sales.handle_update(s, _upd(photo=True))
    assert "одним сообщением" in tg[-1][1]
    with session_scope() as s:
        sales.handle_update(s, _upd("Термокружка с крышкой\n" + FEATURES + "\nWB"))
    run_pending()
    kind, caption, markup = tg[-1]
    assert kind == "photo" and "превью" in caption
    cb = markup["inline_keyboard"][0][0]["callback_data"]  # тариф «Старт»
    with session_scope() as s:
        sales.handle_callback(s, {"id": "q", "data": cb, "message": {"chat": {"id": 777}}})
    assert "Оплатить" in str(tg[-1][2])

    with session_scope() as s:
        c = s.scalar(select(Client))
        assert c.source == "kwork"
        order = s.scalar(select(Order))
        assert order.status == "awaiting_payment" and order.tariff == "start"
        from app.payments.service import mark_paid

        mark_paid(s, order.payments[0])
    run_pending()
    with session_scope() as s:
        assert s.scalar(select(Order)).status == "delivered"
    assert any(k == "doc" for k, *_ in tg)

    # клиент пишет после доставки — отвечает Support, правки запускаются
    with session_scope() as s:
        sales.handle_update(s, _upd("Можно исправить заголовок, сделать короче?", uid=9))
    assert "правки" in tg[-1][1].lower()


def test_telegram_human_escalation(tg):
    from app.agents import sales
    from app.models import Escalation

    with session_scope() as s:
        sales.handle_update(s, _upd("Позовите оператора"))
    with session_scope() as s:
        assert s.scalar(select(Escalation)).title.startswith("Клиент")


def test_yookassa_webhook_verifies_and_is_idempotent(monkeypatch):
    monkeypatch.setenv("PAYMENT_PROVIDER", "yookassa")
    monkeypatch.setenv("YOOKASSA_SHOP_ID", "1")
    monkeypatch.setenv("YOOKASSA_SECRET_KEY", "k")
    from app import config
    from app.payments import service

    config.reset_settings_cache()

    class R:
        def __init__(self, d, code=200):
            self._d, self.status_code, self.text = d, code, ""

        def json(self):
            return self._d

        def raise_for_status(self):
            pass

    monkeypatch.setattr(service.httpx, "post", lambda *a, **k: R({"id": "pay_1", "confirmation": {"confirmation_url": "https://yookassa/pay"}}))
    remote = {"id": "pay_1", "status": "succeeded", "paid": True, "amount": {"value": "2490.00"}, "income_amount": {"value": "2402.85"}}
    monkeypatch.setattr(service.httpx, "get", lambda *a, **k: R(remote))

    with session_scope() as s:
        c = Client(email="a@b.ru")
        s.add(c)
        s.flush()
        o = Order(client_id=c.id, status="preview_ready")
        s.add(o)
        s.flush()
        service.set_tariff(o, "start")
        p = service.create_payment(s, o)
        assert p.confirmation_url == "https://yookassa/pay"
    body = {"event": "payment.succeeded", "object": {"id": "pay_1", "status": "succeeded"}}
    with session_scope() as s:
        assert service.handle_yookassa_notification(s, body) == "paid"
    with session_scope() as s:
        assert service.handle_yookassa_notification(s, body) == "paid"  # повтор вебхука
        p = s.scalar(select(Payment))
        assert p.status == "succeeded" and p.fee_kop == 8715
        from app.models import Task

        assert len(s.scalars(select(Task).where(Task.kind == "produce_order")).all()) == 1
    # поддельная сумма не принимается
    remote["amount"]["value"] = "1.00"
    with session_scope() as s:
        p = s.scalar(select(Payment))
        p.status = "pending"
        assert service.handle_yookassa_notification(s, body) == "mismatch"


def test_owner_registration_via_bot(tg):
    from app.agents import sales
    from app.events import owner_chat_id, owner_code

    with session_scope() as s:
        sales.handle_update(s, _upd("/owner wrong"))
        assert owner_chat_id(s) == ""
        sales.handle_update(s, _upd(f"/owner {owner_code()}", uid=2))
    with session_scope() as s:
        assert owner_chat_id(s) == "777"
    assert "владельца" in tg[-1][1]


def test_check_offline_runs(capsys):
    from app import check

    check.results.clear()
    check.main(offline=True)
    out = capsys.readouterr().out
    assert "База данных" in out and "Рендер слайдов" in out and "1440×1920" in out
