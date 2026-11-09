"""Scout: публичная лента заказов → лиды в CRM → карточка владельцу с откликом и кнопками."""
from datetime import timedelta

from sqlalchemy import select

from app.db import session_scope
from app.models import Lead, utcnow
from app.queue import enqueue, run_pending
from tests.test_integrations import _owner_msg


def _post(n, text, dt):
    return (
        f'<div class="tgme_widget_message" data-post="ordersfeed/{n}">'
        f'<div class="tgme_widget_message_text js-message_text" dir="auto">{text}</div>'
        f'<time datetime="{dt.isoformat()}+00:00" class="time">x</time></div>'
    )


def _page(now):
    return "".join([
        _post(10, "Дизайн карточки товара<br/>Нужен редизайн 4 карточек для ОЗОН и ВБ с использованием ai<br/><br/>✅ Сводки заказов: @mprabotabot", now),
        _post(11, "🗂 Анкета дизайнера инфографики<br/>Делаю карточки для WB", now),
        _post(12, "Добрый день! Порекомендуйте курсы по продвижению ВБ", now),
        _post(13, "Нужна инфографика для юбок, фотографии готовы.", now),
        _post(14, "Нужна инфографика для юбок, фотографии готовы.", now),  # дубль в ленте
        _post(9, "Нужна инфографика для WB, старый заказ", now - timedelta(days=10)),
    ])


def test_scout_finds_orders_and_notifies_owner(tg, monkeypatch):
    from app.agents import sales, scout
    from app.events import owner_code

    monkeypatch.setenv("SCOUT_CHANNELS", "ordersfeed")
    from app import config

    config.reset_settings_cache()
    page = _page(utcnow())
    monkeypatch.setattr(scout, "fetch", lambda ch: scout.parse(ch, page))

    with session_scope() as s:
        sales.handle_update(s, _owner_msg(f"/owner {owner_code()}"))
        enqueue(s, "scout_orders", {}, idempotency_key="t1")
    tg.clear()
    run_pending()

    with session_scope() as s:
        leads = s.scalars(select(Lead).where(Lead.source == "tg_orders").order_by(Lead.id)).all()
        assert [l.shop_url for l in leads] == ["https://t.me/ordersfeed/10", "https://t.me/ordersfeed/13"]
        ai, skirt = leads
        assert ai.marketplace == "wb+ozon" and "AI" in ai.analysis["draft"]
        assert "mprabotabot" not in ai.data["post_text"]
        assert "одежды" in skirt.analysis["draft"] and "фото готовы" in skirt.analysis["draft"]
        for l in leads:
            assert "гарант" not in l.analysis["draft"].lower() and "₽" not in l.analysis["draft"]
        lead_id = ai.id

    cards = [m for m in tg if m[0] == "msg" and m[1].startswith("🆕 Заказ")]
    assert len(cards) == 2
    assert cards[0][2]["inline_keyboard"][0][0]["callback_data"] == f"oscout:sent:{lead_id}"

    # повторный запуск — без дублей
    with session_scope() as s:
        enqueue(s, "scout_orders", {}, idempotency_key="t2")
    run_pending()
    assert len([m for m in tg if m[0] == "msg" and m[1].startswith("🆕 Заказ")]) == 2

    # кнопка «Откликнулся» → статус в CRM
    from tests.test_integrations import _cb

    with session_scope() as s:
        sales.handle_callback(s, _cb(f"oscout:sent:{lead_id}"))
    with session_scope() as s:
        assert s.get(Lead, lead_id).status == "contacted"
    assert "отклик отправлен" in tg[-1][1]
