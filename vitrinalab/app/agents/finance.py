"""Finance: детерминированный учёт. Здесь намеренно нет LLM — цифры не должны «галлюцинировать».

Выручка — только подтверждённые платежи. Неоплаченная сделка не считается заработком.
"""
from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..models import Client, Expense, Order, Payment, utcnow


@dataclass
class Period:
    start: datetime
    end: datetime


@dataclass
class FinanceSummary:
    revenue_kop: int = 0
    fees_kop: int = 0
    ai_kop: int = 0
    infra_kop: int = 0
    ads_kop: int = 0
    other_kop: int = 0
    tax_kop: int = 0
    paid_orders: int = 0
    by_channel: dict = field(default_factory=dict)

    @property
    def expenses_kop(self) -> int:
        return self.fees_kop + self.ai_kop + self.infra_kop + self.ads_kop + self.other_kop

    @property
    def net_kop(self) -> int:
        return self.revenue_kop - self.expenses_kop - self.tax_kop

    @property
    def avg_check_kop(self) -> int:
        return self.revenue_kop // self.paid_orders if self.paid_orders else 0

    @property
    def margin(self) -> float:
        """Маржинальность по переменным затратам (эквайринг + AI + налог)."""
        if not self.revenue_kop:
            return 0.0
        return (self.revenue_kop - self.fees_kop - self.ai_kop - self.tax_kop) / self.revenue_kop


def day_bounds(day: datetime | None = None) -> Period:
    """Сутки по Москве (UTC+3) в UTC-времени БД."""
    msk = (day or utcnow()) + timedelta(hours=3)
    start_msk = msk.replace(hour=0, minute=0, second=0, microsecond=0)
    return Period(start_msk - timedelta(hours=3), start_msk + timedelta(days=1) - timedelta(hours=3))


def all_time() -> Period:
    return Period(datetime(2000, 1, 1), utcnow() + timedelta(days=1))


def summarize(s: Session, p: Period) -> FinanceSummary:
    cfg = get_settings()
    fs = FinanceSummary()
    rows = s.execute(
        select(Payment.amount_kop, Payment.fee_kop, Client.is_legal, Client.source)
        .join(Order, Order.id == Payment.order_id)
        .join(Client, Client.id == Order.client_id)
        .where(Payment.status == "succeeded", Payment.confirmed_at >= p.start, Payment.confirmed_at < p.end)
    ).all()
    channels: dict[str, dict] = defaultdict(lambda: {"orders": 0, "revenue_kop": 0, "ads_kop": 0})
    for amount, fee, is_legal, source in rows:
        fs.revenue_kop += amount
        fs.paid_orders += 1
        fs.tax_kop += round(amount * (cfg.npd_tax_rate_legal if is_legal else cfg.npd_tax_rate_person))
        ch = channels[source or "unknown"]
        ch["orders"] += 1
        ch["revenue_kop"] += amount
    exp = s.execute(
        select(Expense.category, Expense.channel, func.sum(Expense.amount_kop))
        .where(Expense.ts >= p.start, Expense.ts < p.end)
        .group_by(Expense.category, Expense.channel)
    ).all()
    for cat, channel, total in exp:
        total = int(total or 0)
        if cat == "fees":
            fs.fees_kop += total
        elif cat == "ai_api":
            fs.ai_kop += total
        elif cat == "infra":
            fs.infra_kop += total
        elif cat == "ads":
            fs.ads_kop += total
            channels[channel or "unknown"]["ads_kop"] += total
        else:
            fs.other_kop += total
    for ch in channels.values():
        ch["cac_kop"] = ch["ads_kop"] // ch["orders"] if ch["orders"] else None
    fs.by_channel = dict(channels)
    return fs


def unit_economics(s: Session) -> dict:
    """Точка безубыточности и окупаемость по фактическим данным последних 30 дней."""
    month = summarize(s, Period(utcnow() - timedelta(days=30), utcnow() + timedelta(minutes=1)))
    total = summarize(s, all_time())
    fixed = month.infra_kop + month.other_kop + month.ads_kop
    contrib = (month.revenue_kop - month.fees_kop - month.ai_kop - month.tax_kop) // month.paid_orders if month.paid_orders else None
    breakeven = -(-fixed // contrib) if contrib and contrib > 0 else None
    ytd_start = utcnow().replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
    ytd = summarize(s, Period(ytd_start, utcnow() + timedelta(minutes=1)))
    invested = total.expenses_kop
    return {
        "month": month,
        "total": total,
        "fixed_month_kop": fixed,
        "contribution_per_order_kop": contrib,
        "breakeven_orders_month": breakeven,
        "payback_reached": total.net_kop >= 0 and total.revenue_kop > 0,
        "invested_kop": invested,
        "ytd_revenue_kop": ytd.revenue_kop,
        "npd_limit_used": ytd.revenue_kop / (get_settings().npd_year_limit_rub * 100),
    }


def unregistered_receipts(s: Session) -> list[Payment]:
    """Платежи, по которым нужно пробить чек в «Мой налог» (самозанятый обязан это сделать)."""
    return list(
        s.scalars(select(Payment).where(Payment.status == "succeeded", Payment.receipt_registered.is_(False)).order_by(Payment.confirmed_at))
    )
