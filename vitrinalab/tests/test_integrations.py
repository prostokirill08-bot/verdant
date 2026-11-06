"""Telegram-диалог Sales-агента и вебхук ЮKassa (внешние API подменены)."""
import shutil

import pytest
from sqlalchemy import select

from app.db import session_scope
from app.models import Client, Message, Order, Payment
from app.queue import run_pending
from tests.conftest import FEATURES


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
    kind, text, markup = tg[-1]
    assert "Перевод по СБП" in text or "Оплата:" in text
    assert markup["inline_keyboard"][0][0]["callback_data"].startswith("paid:")

    # владелец привязывает чат (другой chat id), клиент жмёт «Я оплатил(а)»
    from app.events import owner_code

    owner = {"update_id": 50, "message": {"message_id": 1, "chat": {"id": 999, "type": "private"}, "from": {"id": 999, "first_name": "Владелец"}, "text": f"/owner {owner_code()}"}}
    with session_scope() as s:
        sales.handle_update(s, owner)
    with session_scope() as s:
        sales.handle_callback(s, {"id": "q2", "data": markup["inline_keyboard"][0][0]["callback_data"], "message": {"chat": {"id": 777}}})
        sales.handle_callback(s, {"id": "q3", "data": markup["inline_keyboard"][0][0]["callback_data"], "message": {"chat": {"id": 777}}})
    assert "Уже проверяем" in tg[-1][1]
    run_pending()  # уведомление владельцу с кнопками
    owner_msg = next(m for m in reversed(tg) if m[2] and "okpay" in str(m[2]))
    okpay = owner_msg[2]["inline_keyboard"][0][0]["callback_data"]

    # чужой чат не может подтвердить оплату
    with session_scope() as s:
        sales.handle_callback(s, {"id": "x", "data": okpay, "message": {"chat": {"id": 777}}})
        assert s.scalar(select(Order)).status == "awaiting_payment"
        c = s.scalar(select(Client).where(Client.telegram_chat_id == "777"))
        assert c.source == "kwork"
    with session_scope() as s:
        sales.handle_callback(s, {"id": "y", "data": okpay, "message": {"chat": {"id": 999}}})
        assert s.scalar(select(Order)).status == "paid"
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


def test_bot_legal_and_package(tg):
    from app.agents import sales
    from app.models import OrderItem
    from app.payments.service import mark_paid, set_tariff, create_payment

    with session_scope() as s:
        sales.handle_update(s, _upd("/offer"))
    assert "Публичная оферта" in tg[-1][1] and "<p>" not in tg[-1][1]
    with session_scope() as s:
        sales.handle_update(s, _upd("/start", uid=2))
        c = s.scalar(select(Client))
        o = Order(client_id=c.id, status="preview_ready")
        s.add(o)
        s.flush()
        set_tariff(o, "catalog")
        mark_paid(s, create_payment(s, o))
    # товары пакета присылают прямо в чат
    with session_scope() as s:
        sales.handle_update(s, _upd("Кружка\nОбъём: 300 мл\nКерамика", photo=True, uid=3))
    assert "Осталось мест в пакете: 9" in tg[-1][1]
    with session_scope() as s:
        sales.handle_update(s, _upd(photo=True, uid=4))
        sales.handle_update(s, _upd("Тарелка\nДиаметр: 20 см\nФарфор", uid=5))
        assert len(s.scalars(select(OrderItem)).all()) == 2
    assert "Осталось мест в пакете: 8" in tg[-1][1]


def _owner_msg(text, uid=100, chat=999):
    return {"update_id": uid, "message": {"message_id": uid, "chat": {"id": chat, "type": "private"}, "from": {"id": chat, "first_name": "Владелец"}, "text": text}}


def _cb(data, chat=999):
    return {"id": "cb", "data": data, "message": {"chat": {"id": chat}}}


def test_owner_controls_business_from_telegram(tg):
    from app.agents import sales
    from app.agents.finance import all_time, summarize
    from app.events import owner_code
    from app.models import ContentPost, Lead

    with session_scope() as s:
        sales.handle_update(s, _owner_msg(f"/owner {owner_code()}"))
    assert "/stats" in tg[-1][1]

    # два неоплаченных заказа от клиента 777
    with session_scope() as s:
        c = Client(telegram_chat_id="777", name="Анна", is_legal=True)
        s.add(c)
        s.flush()
        for _ in range(2):
            s.add(Order(client_id=c.id, status="preview_ready"))
        s.add(Lead(name="Магазин", contact="@shop"))
        s.flush()
        lead_id = s.scalar(select(Lead.id))
        s.add(Message(lead_id=lead_id, direction="out", text="Здравствуйте! Это AI-ассистент…", status="pending_approval", kind="outreach"))
        s.add(ContentPost(topic="t", text="Пост", status="pending_approval"))
        o1, o2 = [o.id for o in s.scalars(select(Order).order_by(Order.id))]

    with session_scope() as s:
        sales.handle_update(s, _owner_msg("/stats", uid=101))
    assert "Сегодня" in tg[-1][1] and "За всё время" in tg[-1][1]

    with session_scope() as s:
        sales.handle_update(s, _owner_msg("/orders", uid=102))
    assert any(f"opilot:{o1}" in str(m[2]) for m in tg)

    # чужой чат нажимает кнопку владельца — ничего не происходит
    with session_scope() as s:
        sales.handle_callback(s, _cb(f"opilot:{o1}:start", chat=777))
        assert s.get(Order, o1).status == "preview_ready"

    # пилот кнопками: выбор тарифа → запуск
    with session_scope() as s:
        sales.handle_callback(s, _cb(f"opilot:{o1}"))
        sales.handle_callback(s, _cb(f"opilot:{o1}:start"))
        assert s.get(Order, o1).status == "paid" and s.get(Order, o1).price_kop == 0

    # оплата с биржи: тариф кнопкой → сумма и комиссия текстом
    with session_scope() as s:
        sales.handle_callback(s, _cb(f"oext:{o2}:standard"))
        sales.handle_update(s, _owner_msg("3990 798 kwork", uid=103))
    with session_scope() as s:
        fs = summarize(s, all_time())
        assert fs.revenue_kop == 399000 and fs.fees_kop == 79800 and "kwork" in fs.by_channel

    # одобрения
    with session_scope() as s:
        sales.handle_update(s, _owner_msg("/approvals", uid=104))
        mid = s.scalar(select(Message.id).where(Message.kind == "outreach"))
        pid = s.scalar(select(ContentPost.id))
        sales.handle_callback(s, _cb(f"oapp:m:{mid}"))
        sales.handle_callback(s, _cb(f"osent:m:{mid}"))
        sales.handle_callback(s, _cb(f"oapp:p:{pid}"))
    with session_scope() as s:
        assert s.get(Message, mid).status == "sent" and s.get(Lead, lead_id).status == "contacted"
        assert s.get(ContentPost, pid).status == "approved"

    # чеки
    with session_scope() as s:
        sales.handle_update(s, _owner_msg("/receipts", uid=105))
        pay_id = s.scalar(select(Payment.id).where(Payment.status == "succeeded"))
    assert f"orcpt:{pay_id}" in str(tg[-1][2])
    with session_scope() as s:
        sales.handle_callback(s, _cb(f"orcpt:{pay_id}"))
        assert s.get(Payment, pay_id).receipt_registered

    # клиент не может вызвать команды владельца
    n = len(tg)
    with session_scope() as s:
        sales.handle_update(s, _upd("/stats", uid=106))
    assert "За всё время" not in tg[-1][1]


def test_new_product_after_delivered_order_creates_new_order(tg):
    """Регрессия: описание нового товара после доставленного заказа уходило в поддержку, и заказ не создавался."""
    from app.agents import sales

    with session_scope() as s:
        c = Client(telegram_chat_id="777", name="Анна")
        s.add(c)
        s.flush()
        s.add(Order(client_id=c.id, status="delivered", tariff="start"))
    with session_scope() as s:
        sales.handle_update(s, _upd(photo=True, uid=2))
        sales.handle_update(s, _upd("Набор ёлочных игрушек\nВ наборе: 12 шт\nМатериал: дерево\nWB", uid=3))
    with session_scope() as s:
        assert len(s.scalars(select(Order)).all()) == 2
    assert "превью" in tg[-1][1].lower()


def test_bot_token_not_logged():
    import logging

    import app.integrations.telegram  # noqa: F401

    assert logging.getLogger("httpx").getEffectiveLevel() >= logging.WARNING


def test_owner_reset_clears_business_data_keeps_settings(tg, env):
    from app.agents import sales
    from app.agents.finance import all_time, summarize
    from app.events import get_setting, owner_chat_id, owner_code, set_setting
    from app.models import Event, Task
    from app.payments.service import create_payment, mark_paid, set_tariff

    with session_scope() as s:
        sales.handle_update(s, _owner_msg(f"/owner {owner_code()}"))
        set_setting(s, "production_mode", "chatgpt")
        c = Client(telegram_chat_id="777")
        s.add(c)
        s.flush()
        o = Order(client_id=c.id, status="preview_ready")
        s.add(o)
        s.flush()
        set_tariff(o, "start")
        mark_paid(s, create_payment(s, o))
    with session_scope() as s:
        sales.handle_update(s, _owner_msg("/reset", uid=101))
        sales.handle_callback(s, _cb("oreset:no"))
        assert summarize(s, all_time()).paid_orders == 1  # «Отмена» ничего не трогает
        sales.handle_callback(s, _cb("oreset:yes"))
    with session_scope() as s:
        assert summarize(s, all_time()).revenue_kop == 0
        assert not s.scalars(select(Order)).all() and not s.scalars(select(Client)).all()
        assert not s.scalars(select(Event)).all() and not s.scalars(select(Task)).all()
        assert owner_chat_id(s) == "999" and get_setting(s, "production_mode") == "chatgpt"
    assert list((env / "backups").glob("before-reset-*.db"))
    assert "удалены" in tg[-1][1]


def test_each_telegram_update_processed_once(monkeypatch):
    """Два «слушателя» получили одни и те же сообщения — каждое обработано ровно один раз."""
    from app import worker
    from app.agents import sales

    seen = []
    monkeypatch.setattr(sales, "handle_update", lambda s, upd: seen.append(upd["update_id"]))
    batch = [{"update_id": 10}, {"update_id": 11}, {"update_id": 12}]
    assert worker.process_updates(batch) == 3
    assert worker.process_updates(batch) == 0  # второй процесс / повторная доставка
    assert worker.process_updates([{"update_id": 12}, {"update_id": 13}]) == 1
    assert seen == [10, 11, 12, 13]


def test_only_one_poller_holds_lease():
    from app import worker

    assert worker.acquire_poller_lease("A") is True
    assert worker.acquire_poller_lease("B") is False  # A ещё держит аренду
    assert worker.acquire_poller_lease("A") is True   # продление своей аренды
