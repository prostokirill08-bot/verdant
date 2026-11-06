"""Сквозные сценарии: сайт → превью → оплата → производство → QC → доставка → финансы → отчёт."""
import re
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.agents.finance import all_time, summarize
from app.db import session_scope
from app.models import Event, Message, Order, Payment
from app.queue import run_pending
from tests.conftest import FEATURES

AUTH = ("admin", "test-pass")


@pytest.fixture
def client():
    from app.web.main import app

    with TestClient(app) as c:
        yield c


def _csrf(client):
    html = client.get("/admin/settings", auth=AUTH).text
    return re.search(r'name="csrf" value="([0-9a-f]+)"', html).group(1)


def test_full_web_flow(client, product_photo):
    r = client.get("/")
    assert r.status_code == 200 and "Бесплатное превью" in r.text

    with open(product_photo, "rb") as f:
        r = client.post(
            "/order",
            data={"product_name": "Термокружка с крышкой", "features": FEATURES, "marketplace": "wb", "email": "seller@example.com", "consent": "1"},
            files={"photo": ("p.jpg", f, "image/jpeg")},
            follow_redirects=False,
        )
    assert r.status_code == 303
    token = r.headers["location"].split("/o/")[1]

    run_pending()  # превью
    with session_scope() as s:
        order = s.scalar(select(Order).where(Order.token == token))
        assert order.status == "preview_ready"
        item = order.items[0]
        assert Path(item.preview_path).exists()
        item_id = item.id
    assert client.get(f"/o/{token}/file/{item_id}/preview.jpg").status_code == 200
    # до оплаты результат недоступен
    assert client.get(f"/o/{token}/file/{item_id}/result.zip").status_code == 404

    r = client.post(f"/o/{token}/pay", data={"tariff_code": "standard"}, follow_redirects=False)
    assert r.status_code == 303 and r.headers["location"].endswith("/pay-manual")
    client.post(f"/o/{token}/claim-paid")

    # владелец подтверждает оплату в админке
    with session_scope() as s:
        oid = s.scalar(select(Order.id).where(Order.token == token))
    csrf = _csrf(client)
    r = client.post(f"/admin/orders/{oid}/action", data={"action": "confirm_manual_payment", "csrf": csrf}, auth=AUTH, follow_redirects=False)
    assert r.status_code == 303
    # повторное подтверждение не создаёт второй оплаты
    client.post(f"/admin/orders/{oid}/action", data={"action": "confirm_manual_payment", "csrf": csrf}, auth=AUTH)

    run_pending()  # производство → QC → доставка
    with session_scope() as s:
        order = s.get(Order, oid)
        assert order.status == "delivered", [i.qc_report for i in order.items]
        it = order.items[0]
        assert it.qc_report["passed"]
        files = it.result_files
        assert len([f for f in files if f[0].isdigit()]) == 8  # Стандарт: 8 слайдов
        assert len([f for f in files if f.startswith("cover_variant")]) == 2  # + 2 доп. обложки
        assert Path(it.zip_path).exists()
        assert s.scalar(select(Event).where(Event.kind == "result_sent", Event.entity_id == oid))
        fs = summarize(s, all_time())
        assert fs.revenue_kop == 399000 and fs.paid_orders == 1
        assert fs.tax_kop == round(399000 * 0.06)
        assert len(s.scalars(select(Payment).where(Payment.status == "succeeded")).all()) == 1

    assert client.get(f"/o/{token}/file/{item_id}/result.zip").status_code == 200
    page = client.get(f"/o/{token}").text
    assert "Скачать архив" in page

    # правки: один раунд бесплатно
    client.post(f"/o/{token}/revision", data={"note": "Сделайте акцент на объёме"})
    run_pending()
    with session_scope() as s:
        order = s.get(Order, oid)
        assert order.status == "delivered" and order.revisions_used == 1 and order.items[0].revision == 1

    # отчёт и админка
    from app.agents.ceo import daily_report  # noqa: F401

    for path in ["/admin", "/admin/leads", "/admin/approvals", "/admin/clients", "/admin/orders", f"/admin/orders/{oid}", "/admin/agents", "/admin/finance", "/admin/escalations", "/admin/settings"]:
        assert client.get(path, auth=AUTH).status_code == 200, path
    client.post("/admin/run/daily_report", data={"csrf": csrf}, auth=AUTH)
    run_pending()
    with session_scope() as s:
        report = s.scalar(select(Message).where(Message.kind == "report"))
        assert "Выручка за день: 3 990 ₽" in report.text
        assert "Оплаченных заказов: 1" in report.text


def test_admin_requires_auth_and_csrf(client):
    assert client.get("/admin").status_code == 401
    assert client.get("/admin", auth=("admin", "wrong")).status_code == 401
    r = client.post("/admin/settings", data={"csrf": "bad"}, auth=AUTH)
    assert r.status_code == 403


def test_order_requires_consent(client, product_photo):
    with open(product_photo, "rb") as f:
        r = client.post("/order", data={"product_name": "X", "features": "a\nb", "email": "a@b.ru"}, files={"photo": ("p.jpg", f, "image/jpeg")})
    assert r.status_code == 400


def test_lead_analysis_creates_draft_for_approval(client):
    csrf = _csrf(client)
    client.post("/admin/leads", data={"name": "Магазин посуды", "sku": "40", "photos": "3", "has_infographics": "нет", "contact": "@shop", "contact_channel": "telegram", "csrf": csrf}, auth=AUTH)
    run_pending()
    from app.models import Lead

    with session_scope() as s:
        lead = s.scalar(select(Lead))
        assert lead.score == 85 and lead.segment == "catalog" and lead.status == "draft_ready"
        msg = s.scalar(select(Message).where(Message.lead_id == lead.id))
        assert msg.status == "pending_approval" and "AI-ассистент" in msg.text


def test_healthz_reports_missing_worker(client):
    assert client.get("/healthz").status_code == 503
