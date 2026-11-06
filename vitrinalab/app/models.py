"""Схема данных: CRM, заказы, платежи, очередь задач, журнал агентов, финансы."""
from __future__ import annotations

import secrets
from datetime import datetime, timezone

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def new_token() -> str:
    return secrets.token_urlsafe(18)


class Setting(Base):
    __tablename__ = "settings"
    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[str] = mapped_column(Text, default="")


class Client(Base):
    __tablename__ = "clients"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200), default="")
    email: Mapped[str] = mapped_column(String(200), default="", index=True)
    telegram_chat_id: Mapped[str] = mapped_column(String(64), default="", index=True)
    telegram_username: Mapped[str] = mapped_column(String(100), default="")
    is_legal: Mapped[bool] = mapped_column(Boolean, default=True)  # ИП/юрлицо → НПД 6%
    inn: Mapped[str] = mapped_column(String(20), default="")
    source: Mapped[str] = mapped_column(String(50), default="")
    free_preview_used: Mapped[bool] = mapped_column(Boolean, default=False)
    consent_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)  # согласие на обработку ПД
    marketing_consent: Mapped[bool] = mapped_column(Boolean, default=False)  # согласие на рассылки
    notes: Mapped[str] = mapped_column(Text, default="")
    state: Mapped[dict] = mapped_column(JSON, default=dict)  # состояние диалога с Sales-агентом
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    orders: Mapped[list["Order"]] = relationship(back_populates="client")


class Lead(Base):
    __tablename__ = "leads"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    marketplace: Mapped[str] = mapped_column(String(30), default="wb")
    shop_url: Mapped[str] = mapped_column(String(500), default="")
    contact: Mapped[str] = mapped_column(String(300), default="")  # только публичный деловой контакт
    contact_channel: Mapped[str] = mapped_column(String(30), default="")  # telegram | email | kwork | other
    source: Mapped[str] = mapped_column(String(50), default="manual")
    segment: Mapped[str] = mapped_column(String(50), default="")
    score: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(30), default="new", index=True)
    # new → analyzed → draft_ready → contacted → replied → negotiating → won | lost | rejected
    data: Mapped[dict] = mapped_column(JSON, default=dict)  # входные метрики (SKU, рейтинг, фото…)
    analysis: Mapped[dict] = mapped_column(JSON, default=dict)
    client_id: Mapped[int | None] = mapped_column(ForeignKey("clients.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)


class Message(Base):
    __tablename__ = "messages"
    id: Mapped[int] = mapped_column(primary_key=True)
    client_id: Mapped[int | None] = mapped_column(ForeignKey("clients.id"), nullable=True, index=True)
    lead_id: Mapped[int | None] = mapped_column(ForeignKey("leads.id"), nullable=True, index=True)
    channel: Mapped[str] = mapped_column(String(20), default="telegram")
    direction: Mapped[str] = mapped_column(String(5))  # in | out
    text: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="sent")
    # pending_approval | approved | sent | failed | received | rejected
    agent: Mapped[str] = mapped_column(String(30), default="")
    kind: Mapped[str] = mapped_column(String(30), default="chat")  # chat | outreach | followup | offer | report
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class Order(Base):
    __tablename__ = "orders"
    id: Mapped[int] = mapped_column(primary_key=True)
    token: Mapped[str] = mapped_column(String(40), unique=True, default=new_token)
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id"), index=True)
    tariff: Mapped[str] = mapped_column(String(20), default="")
    price_kop: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(20), default="draft", index=True)
    # draft → preview_queued → preview_ready → awaiting_payment → paid → in_production
    #  → ready → delivered ; ответвления: revision, needs_human, cancelled
    channel: Mapped[str] = mapped_column(String(20), default="web")  # web | telegram
    source: Mapped[str] = mapped_column(String(50), default="")
    revisions_used: Mapped[int] = mapped_column(Integer, default=0)
    notes: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)

    client: Mapped[Client] = relationship(back_populates="orders")
    items: Mapped[list["OrderItem"]] = relationship(back_populates="order", order_by="OrderItem.id")
    payments: Mapped[list["Payment"]] = relationship(back_populates="order")


class OrderItem(Base):
    """Один товар внутри заказа: исходник, бриф, результат."""

    __tablename__ = "order_items"
    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id"), index=True)
    product_name: Mapped[str] = mapped_column(String(300))
    marketplace: Mapped[str] = mapped_column(String(20), default="wb")
    features: Mapped[str] = mapped_column(Text, default="")  # что написал клиент
    photo_path: Mapped[str] = mapped_column(String(500), default="")
    status: Mapped[str] = mapped_column(String(20), default="new")
    # new → preview_ready → producing → qc → done | needs_human
    content: Mapped[dict] = mapped_column(JSON, default=dict)  # тексты от копирайтера
    qc_report: Mapped[dict] = mapped_column(JSON, default=dict)
    preview_path: Mapped[str] = mapped_column(String(500), default="")
    result_dir: Mapped[str] = mapped_column(String(500), default="")
    zip_path: Mapped[str] = mapped_column(String(500), default="")
    revision_note: Mapped[str] = mapped_column(Text, default="")
    revision: Mapped[int] = mapped_column(Integer, default=0)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)

    order: Mapped[Order] = relationship(back_populates="items")

    @property
    def result_files(self) -> list[str]:
        from pathlib import Path

        d = Path(self.result_dir) if self.result_dir else None
        return sorted(p.name for p in d.glob("*.jpg")) if d and d.exists() else []


class Payment(Base):
    __tablename__ = "payments"
    __table_args__ = (UniqueConstraint("provider", "provider_payment_id"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id"), index=True)
    provider: Mapped[str] = mapped_column(String(20))
    provider_payment_id: Mapped[str] = mapped_column(String(100))
    amount_kop: Mapped[int] = mapped_column(Integer)
    fee_kop: Mapped[int] = mapped_column(Integer, default=0)  # комиссия эквайринга
    status: Mapped[str] = mapped_column(String(20), default="pending")  # pending | succeeded | canceled | refunded
    confirmation_url: Mapped[str] = mapped_column(String(1000), default="")
    raw: Mapped[dict] = mapped_column(JSON, default=dict)
    receipt_registered: Mapped[bool] = mapped_column(Boolean, default=False)  # чек в «Мой налог»
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    order: Mapped[Order] = relationship(back_populates="payments")


class Expense(Base):
    __tablename__ = "expenses"
    id: Mapped[int] = mapped_column(primary_key=True)
    ts: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
    category: Mapped[str] = mapped_column(String(20))  # ai_api | infra | ads | fees | tax | other
    amount_kop: Mapped[int] = mapped_column(Integer)
    description: Mapped[str] = mapped_column(String(300), default="")
    channel: Mapped[str] = mapped_column(String(30), default="")  # для расчёта CAC по каналам


class Task(Base):
    __tablename__ = "tasks"
    id: Mapped[int] = mapped_column(primary_key=True)
    kind: Mapped[str] = mapped_column(String(50), index=True)
    payload: Mapped[dict] = mapped_column(JSON, default=dict)
    status: Mapped[str] = mapped_column(String(20), default="queued", index=True)
    # queued | running | done | failed (ждёт повтора) | dead (исчерпаны попытки)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    max_attempts: Mapped[int] = mapped_column(Integer, default=4)
    run_after: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
    idempotency_key: Mapped[str | None] = mapped_column(String(200), unique=True, nullable=True)
    last_error: Mapped[str] = mapped_column(Text, default="")
    locked_by: Mapped[str] = mapped_column(String(64), default="")
    locked_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)


class AgentRun(Base):
    __tablename__ = "agent_runs"
    id: Mapped[int] = mapped_column(primary_key=True)
    agent: Mapped[str] = mapped_column(String(30), index=True)
    action: Mapped[str] = mapped_column(String(60))
    task_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    status: Mapped[str] = mapped_column(String(10), default="ok")  # ok | error
    started_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
    duration_ms: Mapped[int] = mapped_column(Integer, default=0)
    tokens_in: Mapped[int] = mapped_column(Integer, default=0)
    tokens_out: Mapped[int] = mapped_column(Integer, default=0)
    images: Mapped[int] = mapped_column(Integer, default=0)
    cost_kop: Mapped[int] = mapped_column(Integer, default=0)
    summary: Mapped[str] = mapped_column(Text, default="")
    error: Mapped[str] = mapped_column(Text, default="")


class Event(Base):
    """Журнал всех значимых событий: из него считаются отчёты."""

    __tablename__ = "events"
    id: Mapped[int] = mapped_column(primary_key=True)
    ts: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
    kind: Mapped[str] = mapped_column(String(50), index=True)
    entity: Mapped[str] = mapped_column(String(30), default="")
    entity_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    data: Mapped[dict] = mapped_column(JSON, default=dict)


class ContentPost(Base):
    __tablename__ = "content_posts"
    id: Mapped[int] = mapped_column(primary_key=True)
    channel: Mapped[str] = mapped_column(String(30), default="telegram")
    topic: Mapped[str] = mapped_column(String(300), default="")
    text: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="pending_approval")
    # pending_approval | approved | published | rejected | failed
    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    published_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Escalation(Base):
    """Вопросы, которые агенты передают владельцу."""

    __tablename__ = "escalations"
    id: Mapped[int] = mapped_column(primary_key=True)
    ts: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    source: Mapped[str] = mapped_column(String(30))
    severity: Mapped[str] = mapped_column(String(10), default="info")  # info | warn | critical
    title: Mapped[str] = mapped_column(String(300))
    details: Mapped[str] = mapped_column(Text, default="")
    entity: Mapped[str] = mapped_column(String(30), default="")
    entity_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    resolved: Mapped[bool] = mapped_column(Boolean, default=False)
