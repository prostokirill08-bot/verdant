"""Административная панель (CRM): продажи, клиенты, агенты, производство, финансы, одобрения."""
from __future__ import annotations

import csv
import hashlib
import hmac
import io
import secrets
from datetime import timedelta

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from sqlalchemy import func, select

from ..agents.finance import all_time, day_bounds, summarize, unit_economics, unregistered_receipts
from ..config import get_settings
from ..db import session_scope
from ..events import DEFAULTS, get_setting, record, set_setting
from ..models import (
    AgentRun,
    Client,
    ContentPost,
    Escalation,
    Expense,
    Lead,
    Message,
    Order,
    Payment,
    Task,
    utcnow,
)
from ..payments.service import mark_paid
from ..queue import enqueue

security = HTTPBasic()
templates = None  # устанавливается в main.py


def require_admin(creds: HTTPBasicCredentials = Depends(security)) -> str:
    cfg = get_settings()
    ok = bool(cfg.admin_password) and secrets.compare_digest(creds.username, cfg.admin_user) and secrets.compare_digest(creds.password, cfg.admin_password)
    if not ok:
        raise HTTPException(401, "Нужна авторизация", headers={"WWW-Authenticate": "Basic"})
    return creds.username


def csrf_token() -> str:
    cfg = get_settings()
    day = utcnow().strftime("%Y%m%d")
    return hmac.new(cfg.app_secret.encode(), f"{cfg.admin_password}:{day}".encode(), hashlib.sha256).hexdigest()[:32]


def check_csrf(token: str) -> None:
    cfg = get_settings()
    valid = {csrf_token()}
    yday = (utcnow() - timedelta(days=1)).strftime("%Y%m%d")
    valid.add(hmac.new(cfg.app_secret.encode(), f"{cfg.admin_password}:{yday}".encode(), hashlib.sha256).hexdigest()[:32])
    if token not in valid:
        raise HTTPException(403, "CSRF")


router = APIRouter(prefix="/admin", dependencies=[Depends(require_admin)])


def render(request: Request, name: str, **ctx):
    ctx.setdefault("csrf", csrf_token())
    return templates.TemplateResponse(request, f"admin/{name}", ctx)


def back(url: str) -> RedirectResponse:
    return RedirectResponse(url, status_code=303)


@router.get("", response_class=HTMLResponse)
def dashboard(request: Request):
    from ..reports import collect

    with session_scope() as s:
        d = collect(s)
        funnel = {
            "Лиды": s.scalar(select(func.count(Lead.id))) or 0,
            "Сообщения лидам": s.scalar(select(func.count(Message.id)).where(Message.kind == "outreach", Message.status == "sent")) or 0,
            "Ответы": s.scalar(select(func.count(Message.id)).where(Message.direction == "in")) or 0,
            "Заявки (заказы)": s.scalar(select(func.count(Order.id))) or 0,
            "Превью": s.scalar(select(func.count(Order.id)).where(Order.status != "preview_queued")) or 0,
            "Ссылки на оплату": s.scalar(select(func.count(Payment.id))) or 0,
            "Оплачено": s.scalar(select(func.count(Payment.id)).where(Payment.status == "succeeded")) or 0,
            "Доставлено": s.scalar(select(func.count(Order.id)).where(Order.status == "delivered")) or 0,
        }
        hb = get_setting(s, "worker_heartbeat")
        return render(request, "dashboard.html", d=d, funnel=funnel, hb=hb, ue=d["ue"])


# ---------------- лиды ----------------


@router.get("/leads", response_class=HTMLResponse)
def leads(request: Request, status: str = ""):
    with session_scope() as s:
        q = select(Lead).order_by(Lead.score.desc(), Lead.id.desc()).limit(500)
        if status:
            q = q.where(Lead.status == status)
        return render(request, "leads.html", leads=list(s.scalars(q)), status=status)


@router.post("/leads")
def lead_add(
    name: str = Form(...),
    marketplace: str = Form("wb"),
    shop_url: str = Form(""),
    contact: str = Form(""),
    contact_channel: str = Form("manual"),
    sku: str = Form(""),
    photos: str = Form(""),
    has_infographics: str = Form(""),
    reviews: str = Form(""),
    rating: str = Form(""),
    notes: str = Form(""),
    csrf: str = Form(...),
):
    check_csrf(csrf)
    with session_scope() as s:
        lead = Lead(
            name=name[:200],
            marketplace=marketplace,
            shop_url=shop_url[:500],
            contact=contact[:300],
            contact_channel=contact_channel,
            source="manual",
            data={"sku": sku, "photos": photos, "has_infographics": has_infographics, "reviews": reviews, "rating": rating, "notes": notes},
        )
        s.add(lead)
        s.flush()
        record(s, "lead_new", "lead", lead.id, source="manual")
        enqueue(s, "analyze_lead", {"lead_id": lead.id}, idempotency_key=f"analyze:{lead.id}")
    return back("/admin/leads")


@router.post("/leads/import")
async def lead_import(file: UploadFile = File(...), csrf: str = Form(...)):
    """CSV с колонками: name, marketplace, shop_url, contact, contact_channel, sku, photos, has_infographics, reviews, rating, notes."""
    check_csrf(csrf)
    raw = (await file.read(2_000_000)).decode("utf-8-sig", errors="replace")
    n = 0
    with session_scope() as s:
        for row in csv.DictReader(io.StringIO(raw)):
            if not row.get("name"):
                continue
            lead = Lead(
                name=row["name"][:200],
                marketplace=row.get("marketplace") or "wb",
                shop_url=(row.get("shop_url") or "")[:500],
                contact=(row.get("contact") or "")[:300],
                contact_channel=row.get("contact_channel") or "manual",
                source=row.get("source") or "import",
                data={k: row.get(k, "") for k in ("sku", "photos", "has_infographics", "reviews", "rating", "notes")},
            )
            s.add(lead)
            s.flush()
            record(s, "lead_new", "lead", lead.id, source=lead.source)
            enqueue(s, "analyze_lead", {"lead_id": lead.id}, idempotency_key=f"analyze:{lead.id}")
            n += 1
    return back(f"/admin/leads?imported={n}")


@router.post("/leads/{lead_id}/status")
def lead_status(lead_id: int, status: str = Form(...), csrf: str = Form(...)):
    check_csrf(csrf)
    with session_scope() as s:
        lead = s.get(Lead, lead_id)
        lead.status = status
        record(s, f"lead_{status}", "lead", lead_id)
    return back("/admin/leads")


# ---------------- одобрения ----------------


@router.get("/approvals", response_class=HTMLResponse)
def approvals(request: Request):
    with session_scope() as s:
        msgs = list(s.scalars(select(Message).where(Message.status.in_(["pending_approval", "approved"])).order_by(Message.id)))
        posts = list(s.scalars(select(ContentPost).where(ContentPost.status == "pending_approval").order_by(ContentPost.scheduled_at)))
        leads = {m.lead_id: s.get(Lead, m.lead_id) for m in msgs if m.lead_id}
        return render(request, "approvals.html", msgs=msgs, posts=posts, leads=leads)


@router.post("/messages/{mid}")
def message_action(mid: int, action: str = Form(...), text: str = Form(""), csrf: str = Form(...)):
    check_csrf(csrf)
    with session_scope() as s:
        m = s.get(Message, mid)
        if text.strip():
            m.text = text.strip()
        if action == "approve":
            m.status = "approved"
        elif action == "reject":
            m.status = "rejected"
            if m.lead_id:
                s.get(Lead, m.lead_id).status = "rejected"
        elif action == "sent":  # владелец отправил вручную
            m.status = "sent"
            m.sent_at = utcnow()
            if m.lead_id:
                s.get(Lead, m.lead_id).status = "contacted"
            record(s, "outreach_sent", "lead", m.lead_id, channel=m.channel)
    return back("/admin/approvals")


@router.post("/leads/{lead_id}/reply")
def lead_reply(lead_id: int, text: str = Form(...), csrf: str = Form(...)):
    """Зафиксировать ответ лида (пришёл в канал, где писали вручную)."""
    check_csrf(csrf)
    with session_scope() as s:
        s.add(Message(lead_id=lead_id, channel="manual", direction="in", text=text, status="received"))
        lead = s.get(Lead, lead_id)
        lead.status = "replied"
        record(s, "lead_replied", "lead", lead_id)
    return back("/admin/leads")


@router.post("/posts/{pid}")
def post_action(pid: int, action: str = Form(...), text: str = Form(""), csrf: str = Form(...)):
    check_csrf(csrf)
    with session_scope() as s:
        p = s.get(ContentPost, pid)
        if text.strip():
            p.text = text.strip()
        p.status = {"approve": "approved", "reject": "rejected"}.get(action, p.status)
    return back("/admin/approvals")


# ---------------- клиенты и заказы ----------------


@router.get("/clients", response_class=HTMLResponse)
def clients(request: Request):
    with session_scope() as s:
        rows = list(s.scalars(select(Client).order_by(Client.id.desc()).limit(500)))
        return render(request, "clients.html", clients=rows)


@router.get("/clients/{cid}", response_class=HTMLResponse)
def client_detail(request: Request, cid: int):
    with session_scope() as s:
        c = s.get(Client, cid)
        msgs = list(s.scalars(select(Message).where(Message.client_id == cid).order_by(Message.id)))
        paid = sum(p.amount_kop for o in c.orders for p in o.payments if p.status == "succeeded")
        return render(request, "client.html", c=c, msgs=msgs, orders=list(c.orders), paid=paid)


@router.get("/orders", response_class=HTMLResponse)
def orders(request: Request, status: str = ""):
    with session_scope() as s:
        q = select(Order).order_by(Order.id.desc()).limit(500)
        if status:
            q = q.where(Order.status == status)
        return render(request, "orders.html", orders=list(s.scalars(q)), status=status)


@router.get("/orders/{oid}", response_class=HTMLResponse)
def order_detail(request: Request, oid: int):
    with session_scope() as s:
        o = s.get(Order, oid)
        return render(request, "order.html", o=o, items=list(o.items), payments=list(o.payments), client=o.client)


@router.post("/orders/{oid}/action")
def order_action(oid: int, action: str = Form(...), csrf: str = Form(...)):
    check_csrf(csrf)
    with session_scope() as s:
        o = s.get(Order, oid)
        if action == "confirm_manual_payment":
            p = next((p for p in o.payments if p.status == "pending" and p.provider == "manual"), None)
            if p is None:
                raise HTTPException(400, "Нет ожидающего ручного платежа")
            mark_paid(s, p)
        elif action == "rerun":
            for it in o.items:
                it.attempts = 0
                if it.status in ("needs_human", "done"):
                    it.status = "producing"
                enqueue(s, "produce_item", {"item_id": it.id}, idempotency_key=f"produce:{it.id}:manual:{utcnow():%Y%m%d%H%M%S}")
            o.status = "in_production"
        elif action == "redeliver":
            enqueue(s, "deliver_order", {"order_id": o.id}, idempotency_key=f"deliver:{o.id}:manual:{utcnow():%Y%m%d%H%M%S}")
        elif action == "cancel":
            o.status = "cancelled"
        record(s, f"admin_{action}", "order", oid)
    return back(f"/admin/orders/{oid}")


# ---------------- агенты и очередь ----------------


@router.get("/agents", response_class=HTMLResponse)
def agents(request: Request):
    with session_scope() as s:
        since = utcnow() - timedelta(days=7)
        stats = s.execute(
            select(
                AgentRun.agent,
                func.count(AgentRun.id),
                func.sum(func.coalesce(AgentRun.cost_kop, 0)),
                func.avg(AgentRun.duration_ms),
                func.max(AgentRun.started_at),
            )
            .where(AgentRun.started_at >= since)
            .group_by(AgentRun.agent)
        ).all()
        errors = dict(
            s.execute(select(AgentRun.agent, func.count(AgentRun.id)).where(AgentRun.started_at >= since, AgentRun.status == "error").group_by(AgentRun.agent)).all()
        )
        runs = list(s.scalars(select(AgentRun).order_by(AgentRun.id.desc()).limit(100)))
        tasks = list(s.scalars(select(Task).where(Task.status.in_(["queued", "running", "failed", "dead"])).order_by(Task.id.desc()).limit(100)))
        return render(request, "agents.html", stats=stats, errors=errors, runs=runs, tasks=tasks)


@router.post("/tasks/{tid}/retry")
def task_retry(tid: int, csrf: str = Form(...)):
    check_csrf(csrf)
    with session_scope() as s:
        t = s.get(Task, tid)
        t.status, t.attempts, t.run_after = "queued", 0, utcnow()
    return back("/admin/agents")


# ---------------- финансы ----------------


@router.get("/finance", response_class=HTMLResponse)
def finance(request: Request):
    with session_scope() as s:
        today = summarize(s, day_bounds())
        total = summarize(s, all_time())
        ue = unit_economics(s)
        receipts = [(p, p.order.client) for p in unregistered_receipts(s)]
        expenses = list(s.scalars(select(Expense).where(Expense.category != "ai_api").order_by(Expense.id.desc()).limit(50)))
        return render(request, "finance.html", today=today, total=total, ue=ue, receipts=receipts, expenses=expenses)


@router.post("/finance/expense")
def add_expense(category: str = Form(...), amount_rub: float = Form(...), description: str = Form(""), channel: str = Form(""), csrf: str = Form(...)):
    check_csrf(csrf)
    with session_scope() as s:
        s.add(Expense(category=category, amount_kop=int(round(amount_rub * 100)), description=description[:300], channel=channel[:30]))
    return back("/admin/finance")


@router.post("/finance/receipt/{pid}")
def receipt_done(pid: int, csrf: str = Form(...)):
    check_csrf(csrf)
    with session_scope() as s:
        s.get(Payment, pid).receipt_registered = True
    return back("/admin/finance")


# ---------------- эскалации и настройки ----------------


@router.get("/escalations", response_class=HTMLResponse)
def escalations(request: Request):
    with session_scope() as s:
        rows = list(s.scalars(select(Escalation).order_by(Escalation.resolved, Escalation.id.desc()).limit(200)))
        return render(request, "escalations.html", rows=rows)


@router.post("/escalations/{eid}/resolve")
def escalation_resolve(eid: int, csrf: str = Form(...)):
    check_csrf(csrf)
    with session_scope() as s:
        s.get(Escalation, eid).resolved = True
    return back("/admin/escalations")


@router.get("/settings", response_class=HTMLResponse)
def settings_page(request: Request):
    from ..reports import collect, render_text

    with session_scope() as s:
        vals = {k: get_setting(s, k) for k in DEFAULTS}
        preview = render_text(collect(s), ["(план формирует CEO-агент при отправке)"])
        return render(request, "settings.html", vals=vals, preview=preview, conf=get_settings())


@router.post("/settings")
def settings_save(csrf: str = Form(...), auto_publish_posts: str = Form("0"), agents_paused: str = Form("0"), accept_orders: str = Form("0")):
    check_csrf(csrf)
    with session_scope() as s:
        for k, v in dict(auto_publish_posts=auto_publish_posts, agents_paused=agents_paused, accept_orders=accept_orders).items():
            set_setting(s, k, "1" if v == "1" else "0")
    return back("/admin/settings")


@router.post("/run/{kind}")
def run_now(kind: str, csrf: str = Form(...)):
    check_csrf(csrf)
    if kind not in ("daily_report", "content_plan", "funnel_digest", "ops_review", "backup"):
        raise HTTPException(400)
    with session_scope() as s:
        enqueue(s, kind, {}, idempotency_key=f"manual:{kind}:{utcnow():%Y%m%d%H%M%S}")
    return back("/admin/settings")
