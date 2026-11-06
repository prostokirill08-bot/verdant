"""Пожелания клиента к дизайну: палитры, референс, бот, сайт, миграция БД."""
from pathlib import Path

from PIL import Image
from sqlalchemy import select

from app.db import session_scope
from app.imaging import palette as pal
from app.models import Client, Order, OrderItem
from app.queue import run_pending
from tests.conftest import FEATURES


def _ok(p: dict) -> bool:
    c = lambda a, b: pal.contrast(pal._rgb(p[a]), pal._rgb(p[b]))  # noqa: E731
    return c("ink", "bg") >= 7 and c("on_accent", "accent") >= 4.5 and c("accent", "bg") >= 3


def test_palette_from_words():
    p = pal.from_wishes("хочу в чёрно-золотом стиле, премиально")
    assert p and _ok(p) and pal._lum(pal._rgb(p["bg"])) < 0.05  # тёмный фон
    p2 = pal.from_wishes("нежные пастельные тона, розовый")
    assert p2 and _ok(p2) and pal._lum(pal._rgb(p2["bg"])) > 0.8
    assert pal.from_wishes("подчеркнуть объём") is None  # нет цвета/стиля — не выдумываем


def test_palette_from_reference(tmp_path):
    img = Image.new("RGB", (300, 300), (245, 245, 240))
    img.paste((30, 140, 90), (0, 0, 300, 120))  # заметный зелёный
    path = tmp_path / "ref.jpg"
    img.save(path)
    p = pal.from_image(path)
    r, g, b = pal._rgb(p["accent"])
    assert g > r and g > b and _ok(p)


def test_bot_design_wishes_reference_flow(tg, tmp_path):
    from app.agents import sales
    from tests.test_integrations import _upd

    with session_scope() as s:
        sales.handle_update(s, _upd("/start"))
        sales.handle_update(s, _upd(photo=True, uid=2))
        sales.handle_update(s, _upd("Термокружка\n" + FEATURES + "\nПожелания: строгий чёрный стиль", uid=3))
    run_pending()
    with session_scope() as s:
        item = s.scalar(select(OrderItem))
        assert "строгий" in item.design["wishes"] and item.design["source"] == "words"
        assert "Пожелания" not in item.features  # пожелания не попадают в факты и на слайды
        oid = item.order_id
    kind, caption, markup = tg[-1]
    assert any(btn[0]["callback_data"] == f"design:{oid}" for btn in markup["inline_keyboard"])

    with session_scope() as s:
        sales.handle_callback(s, {"id": "q", "data": f"design:{oid}", "message": {"chat": {"id": 777}}})
    assert "референс" in tg[-1][1].lower()
    with session_scope() as s:  # референс картинкой
        sales.handle_update(s, _upd(photo=True, uid=4))
    assert "референсу" in tg[-1][1] and "Обновлённое превью" in tg[-1][1]
    with session_scope() as s:  # вопрос в режиме пожеланий не тратит превью
        sales.handle_update(s, _upd("А сколько стоит?", uid=5))
        assert s.scalar(select(OrderItem)).design["previews"] == 1
    run_pending()
    assert tg[-1][0] == "photo"  # новое превью пришло
    with session_scope() as s:
        item = s.scalar(select(OrderItem))
        assert item.design["source"] == "image" and Path(item.design["ref_path"]).exists()


def test_web_form_with_wishes_and_reference(product_photo, tmp_path):
    from fastapi.testclient import TestClient

    from app.web.main import app

    ref = tmp_path / "ref.png"
    Image.new("RGB", (200, 200), (200, 30, 60)).save(ref)
    with TestClient(app) as c, open(product_photo, "rb") as f, open(ref, "rb") as r:
        resp = c.post(
            "/order",
            data={"product_name": "Кружка", "features": FEATURES, "email": "w@example.com", "consent": "1", "wishes": "яркий стиль"},
            files={"photo": ("p.jpg", f, "image/jpeg"), "reference": ("r.png", r, "image/png")},
            follow_redirects=False,
        )
        assert resp.status_code == 303
        run_pending()
        token = resp.headers["location"].split("/o/")[1]
        with session_scope() as s:
            item = s.scalar(select(OrderItem))
            assert item.design["source"] == "image" and item.preview_path
            assert c.get(f"/o/{token}/file/{item.id}/reference.jpg").status_code == 200


def test_auto_migration_adds_column_without_losing_data():
    from sqlalchemy import text

    from app.db import get_engine, init_db

    with session_scope() as s:
        c = Client(email="old@example.com")
        s.add(c)
        s.flush()
        o = Order(client_id=c.id)
        s.add(o)
        s.flush()
        s.add(OrderItem(order_id=o.id, product_name="Старый товар"))
    with get_engine().begin() as conn:  # имитируем старую базу без колонки design
        conn.execute(text("ALTER TABLE order_items DROP COLUMN design"))
    init_db()
    with session_scope() as s:
        item = s.scalar(select(OrderItem))
        assert item.product_name == "Старый товар" and not item.design
