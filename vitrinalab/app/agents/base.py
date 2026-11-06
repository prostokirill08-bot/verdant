"""Общая инфраструктура агентов: учёт запусков, стоимости и дневной бюджет на AI."""
from __future__ import annotations

import logging
import time
from contextlib import contextmanager
from datetime import datetime, timedelta
from typing import Any, Callable, Iterator

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..events import flag
from ..llm.providers import LLMUnavailable, extract_json, get_llm
from ..models import AgentRun, Expense, utcnow

log = logging.getLogger("vitrinalab.agents")


class BudgetExceeded(Exception):
    pass


def ai_spent_today_kop(s: Session) -> int:
    start = utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    return int(s.scalar(select(func.coalesce(func.sum(AgentRun.cost_kop), 0)).where(AgentRun.started_at >= start)) or 0)


class Run:
    def __init__(self, row: AgentRun):
        self.row = row

    def add_usage(self, tokens_in: int = 0, tokens_out: int = 0, images: int = 0) -> None:
        cfg = get_settings()
        self.row.tokens_in += tokens_in
        self.row.tokens_out += tokens_out
        self.row.images += images
        self.row.cost_kop += round(
            tokens_in / 1000 * cfg.llm_price_in_per_1k_kop
            + tokens_out / 1000 * cfg.llm_price_out_per_1k_kop
            + images * cfg.image_price_kop
        )


@contextmanager
def agent_run(s: Session, agent: str, action: str, task_id: int | None = None) -> Iterator[Run]:
    row = AgentRun(agent=agent, action=action, task_id=task_id, started_at=utcnow())
    s.add(row)
    s.flush()
    run = Run(row)
    t0 = time.monotonic()
    try:
        yield run
        row.status = "ok"
    except Exception as e:
        row.status = "error"
        row.error = f"{type(e).__name__}: {e}"[:2000]
        raise
    finally:
        row.duration_ms = int((time.monotonic() - t0) * 1000)
        if row.cost_kop:
            s.add(Expense(category="ai_api", amount_kop=row.cost_kop, description=f"{agent}:{action}"))


def ask_llm(
    s: Session,
    run: Run,
    system: str,
    user: str,
    *,
    fallback: Callable[[], Any],
    as_json: bool = False,
    validate: Callable[[Any], bool] | None = None,
    temperature: float = 0.4,
) -> Any:
    """Спросить модель; при недоступности, превышении бюджета или невалидном ответе — запасной алгоритм.

    Агенты всегда имеют детерминированный запасной путь, поэтому бизнес работает
    даже без ключей AI (качество текстов ниже, но процессы не останавливаются).
    """
    cfg = get_settings()
    if flag(s, "agents_paused"):
        return fallback()
    if ai_spent_today_kop(s) >= cfg.daily_ai_budget_rub * 100:
        log.warning("AI budget exceeded, using fallback")
        return fallback()
    llm = get_llm(cfg)
    try:
        res = llm.complete(system, user, temperature=temperature)
    except LLMUnavailable:
        return fallback()
    except Exception as e:  # noqa: BLE001 — сеть/лимиты провайдера
        log.warning("LLM error: %s", e)
        run.row.summary = (run.row.summary + f" llm_error={e}")[:1000]
        return fallback()
    run.add_usage(res.tokens_in, res.tokens_out)
    out: Any = res.text.strip()
    if as_json:
        try:
            out = extract_json(out)
        except Exception:  # noqa: BLE001
            return fallback()
    if validate and not validate(out):
        return fallback()
    return out


def since(hours: int = 24) -> datetime:
    return utcnow() - timedelta(hours=hours)
