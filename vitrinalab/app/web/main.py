"""Сайт, личный кабинет заказа, вебхуки платежей и административная панель."""
from __future__ import annotations

import io
from contextlib import asynccontextmanager
import logging
import time
from collections import defaultdict, deque
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from PIL import Image, UnidentifiedImageError
from sqlalchemy import select

from ..config import get_settings
from ..db import init_db, session_scope
from ..events import escalate, get_setting, record
from ..models import Client, Order, OrderItem, Payment, utcnow
from ..payments.service import PaymentError, create_payment, handle_yookassa_notification, set_tariff
from ..pricing import TARIFFS, TURNAROUND, rub
from ..queue import enqueue
from . import admin

log = logging.getLogger("vitrinalab.web")
HERE = Path(__file__).parent
templates = Jinja2Templates(directory=HERE / "templates")
templates.env.globals.update(rub=rub, TARIFFS=TARIFFS, TURNAROUND=TURNAROUND, cfg=get_settings)

@asynccontextmanager
async def lifespan(_app):
    init_db()
    yield


app = FastAPI(title="ВитринаЛаб", docs_url=None, redoc_url=None, openapi_url=None, lifespan=lifespan)
app.mount("/static", StaticFiles(directory=HERE / "static"), name="static")
app.include_router(admin.router)
admin.templates = templates

MAX_UPLOAD = 15 * 1024 * 1024
_hits: dict[str, deque] = defaultdict(deque)


def rate_limit(request: Request, key: str, limit: int, window: int = 3600) -> None:
    ip = request.headers.get("x-forwarded-for", request.client.host if request.client else "?").split(",")[0].strip()
    q = _hits[f"{key}:{ip}"]
    now = time.time()
    while q and q[0] < now - window:
        q.popleft()
    if len(q) >= limit:
        raise HTTPException(429, "Слишком много запросов, попробуйте позже")
    q.append(now)


async def save_image(upload: UploadFile, dest_dir: Path) -> Path:
    data = await upload.read(MAX_UPLOAD + 1)
    if len(data) > MAX_UPLOAD:
        raise HTTPException(400, "Файл больше 15 МБ")
    try:
        img = Image.open(io.BytesIO(data))
        img.verify()
        img = Image.open(io.BytesIO(data))
    except (UnidentifiedImageError, OSError):
        raise HTTPException(400, "Это не изображение")
    dest_dir.mkdir(parents=True, exist_ok=True)
    fmt = "PNG" if img.mode in ("RGBA", "LA", "P") else "JPEG"
    path = dest_dir / f"{int(time.time() * 1000)}.{fmt.lower().replace('jpeg', 'jpg')}"
    (img.convert("RGBA") if fmt == "PNG" else img.convert("RGB")).save(path, fmt, quality=95)
    return path


# ---------------- публичные страницы ----------------


@app.get("/", response_class=HTMLResponse)
def landing(request: Request):
    return templates.TemplateResponse(request, "landing.html", {})


@app.get("/offer", response_class=HTMLResponse)
def offer(request: Request):
    return templates.TemplateResponse(request, "offer.html", {})


@app.get("/privacy", response_class=HTMLResponse)
def privacy(request: Request):
    return templates.TemplateResponse(request, "privacy.html", {})


@app.get("/order", response_class=HTMLResponse)
def order_form(request: Request, src: str = ""):
    return templates.TemplateResponse(request, "order.html", {"src": src[:40]})


@app.post("/order")
async def order_create(
    request: Request,
    photo: UploadFile = File(...),
    product_name: str = Form(...),
    features: str = Form(...),
    marketplace: str = Form("wb"),
    email: str = Form(...),
    contact_name: str = Form(""),
    is_legal: str = Form("1"),
    consent: str = Form(""),
    marketing: str = Form(""),
    src: str = Form(""),
    website: str = Form(""),  # ловушка для ботов
):
    if website:
        raise HTTPException(400, "bad request")
    if consent != "1":
        raise HTTPException(400, "Нужно согласие на обработку персональных данных")
    rate_limit(request, "order", 10)
    email = email.strip().lower()[:200]
    if "@" not in email:
        raise HTTPException(400, "Укажите e-mail")
    with session_scope() as s:
        if get_setting(s, "accept_orders") != "1":
            raise HTTPException(503, "Приём заказов временно приостановлен")
        client = s.scalar(select(Client).where(Client.email == email))
        if client is None:
            client = Client(email=email, name=contact_name[:200], source=src or "site", is_legal=is_legal == "1")
            s.add(client)
            s.flush()
            record(s, "client_new", "client", client.id, source=client.source)
        client.consent_at = utcnow()
        client.marketing_consent = marketing == "1"
        path = await save_image(photo, get_settings().files_dir / "uploads" / str(client.id))
        order = Order(client_id=client.id, channel="web", source=client.source, status="preview_queued")
        s.add(order)
        s.flush()
        item = OrderItem(
            order_id=order.id,
            product_name=product_name.strip()[:200],
            features=features.strip()[:3000],
            marketplace=marketplace if marketplace in ("wb", "ozon", "ym") else "wb",
            photo_path=str(path),
        )
        s.add(item)
        s.flush()
        previews = sum(1 for o in client.orders if any(i.preview_path for i in o.items))
        record(s, "order_created", "order", order.id, channel="web")
        if previews < 3:
            enqueue(s, "make_preview", {"item_id": item.id}, idempotency_key=f"preview:{item.id}")
        else:
            order.status = "preview_ready"
        token = order.token
    return RedirectResponse(f"/o/{token}", status_code=303)


def _order_by_token(s, token: str) -> Order:
    order = s.scalar(select(Order).where(Order.token == token))
    if order is None:
        raise HTTPException(404, "Заказ не найден")
    return order


@app.get("/o/{token}", response_class=HTMLResponse)
def cabinet(request: Request, token: str):
    with session_scope() as s:
        order = _order_by_token(s, token)
        ctx = {
            "order": order,
            "items": list(order.items),
            "client": order.client,
            "tariff": TARIFFS.get(order.tariff),
            "pending_payment": next((p for p in order.payments if p.status == "pending"), None),
        }
        return templates.TemplateResponse(request, "cabinet.html", ctx)


@app.get("/o/{token}/status.json")
def order_status(token: str):
    with session_scope() as s:
        order = _order_by_token(s, token)
        return {"status": order.status, "items": [{"id": i.id, "status": i.status, "preview": bool(i.preview_path)} for i in order.items]}


@app.post("/o/{token}/pay")
def order_pay(request: Request, token: str, tariff_code: str = Form(...)):
    rate_limit(request, "pay", 30)
    with session_scope() as s:
        order = _order_by_token(s, token)
        try:
            set_tariff(order, tariff_code)
            p = create_payment(s, order)
        except KeyError:
            raise HTTPException(400, "Неизвестный тариф")
        except PaymentError as e:
            escalate(s, "sales", f"Ошибка создания оплаты #{order.id}", str(e), "critical", "order", order.id)
            raise HTTPException(502, "Платёжный сервис недоступен, мы уже разбираемся. Попробуйте позже.")
        url = p.confirmation_url
    return RedirectResponse(url, status_code=303)


@app.get("/o/{token}/pay-manual", response_class=HTMLResponse)
def manual_pay(request: Request, token: str):
    with session_scope() as s:
        order = _order_by_token(s, token)
        return templates.TemplateResponse(request, "manual_pay.html", {"order": order, "tariff": TARIFFS.get(order.tariff)})


@app.post("/o/{token}/claim-paid")
def claim_paid(token: str):
    with session_scope() as s:
        order = _order_by_token(s, token)
        if order.status == "awaiting_payment":
            escalate(
                s,
                "sales",
                f"Клиент сообщил об оплате заказа #{order.id} ({rub(order.price_kop)})",
                "Проверьте поступление и подтвердите оплату в админке → Заказы.",
                "critical",
                "order",
                order.id,
            )
            record(s, "payment_claimed", "order", order.id)
    return RedirectResponse(f"/o/{token}?claimed=1", status_code=303)


@app.post("/o/{token}/revision")
def revision(token: str, note: str = Form(...)):
    from ..agents.support import request_revision

    with session_scope() as s:
        order = _order_by_token(s, token)
        if order.status != "delivered":
            raise HTTPException(400, "Правки доступны после получения результата")
        if not request_revision(s, order, note.strip()[:2000]):
            escalate(s, "support", f"Клиент просит дополнительные правки по заказу #{order.id}", note[:1500], "warn", "order", order.id)
    return RedirectResponse(f"/o/{token}?revision=1", status_code=303)


@app.post("/o/{token}/items")
async def add_item(
    token: str,
    photo: UploadFile = File(...),
    product_name: str = Form(...),
    features: str = Form(...),
    marketplace: str = Form("wb"),
):
    with session_scope() as s:
        order = _order_by_token(s, token)
        t = TARIFFS.get(order.tariff)
        if not t or order.status not in ("paid", "in_production", "ready", "delivered") or order.paid_at is None:
            raise HTTPException(400, "Добавлять товары можно после оплаты пакета")
        if len(order.items) >= t.items:
            raise HTTPException(400, f"В тарифе не больше {t.items} товаров")
        path = await save_image(photo, get_settings().files_dir / "uploads" / str(order.client_id))
        item = OrderItem(order_id=order.id, product_name=product_name.strip()[:200], features=features.strip()[:3000], marketplace=marketplace, photo_path=str(path))
        s.add(item)
        s.flush()
        order.status = "in_production"
        enqueue(s, "produce_item", {"item_id": item.id}, idempotency_key=f"produce:{item.id}:r0")
    return RedirectResponse(f"/o/{token}", status_code=303)


@app.get("/o/{token}/file/{item_id}/{name}")
def order_file(token: str, item_id: int, name: str):
    with session_scope() as s:
        order = _order_by_token(s, token)
        item = s.get(OrderItem, item_id)
        if item is None or item.order_id != order.id:
            raise HTTPException(404)
        if name == "preview.jpg" and item.preview_path:
            path = Path(item.preview_path)
        elif name == "result.zip" and item.zip_path and order.paid_at:
            path = Path(item.zip_path)
        elif item.result_dir and order.paid_at and "/" not in name and ".." not in name:
            path = Path(item.result_dir) / name
        else:
            raise HTTPException(404)
    if not path.exists():
        raise HTTPException(404)
    filename = f"vitrinalab-{order.id}-{item_id}.zip" if name == "result.zip" else name
    return FileResponse(path, filename=filename if name == "result.zip" else None)


# ---------------- вебхуки и служебное ----------------


@app.post("/webhooks/yookassa")
async def yookassa_webhook(request: Request):
    body = await request.json()
    with session_scope() as s:
        result = handle_yookassa_notification(s, body)
    return JSONResponse({"result": result})


@app.post("/webhooks/telegram/{secret}")
async def telegram_webhook(secret: str, request: Request):
    """Альтернатива long polling: установить через setWebhook c путём /webhooks/telegram/<APP_SECRET>."""
    if secret != get_settings().app_secret:
        raise HTTPException(404)
    from ..agents import sales

    upd = await request.json()
    with session_scope() as s:
        sales.handle_update(s, upd)
    return {"ok": True}


@app.get("/healthz")
def healthz():
    from datetime import datetime

    with session_scope() as s:
        hb = get_setting(s, "worker_heartbeat")
    age = (utcnow() - datetime.fromisoformat(hb)).total_seconds() if hb else None
    ok = age is not None and age < 180
    return JSONResponse({"ok": ok, "worker_heartbeat_age_s": age}, status_code=200 if ok else 503)
