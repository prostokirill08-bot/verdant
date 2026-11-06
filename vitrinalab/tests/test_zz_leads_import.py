import re
from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.db import session_scope
from app.models import Lead, Message
from app.queue import run_pending

AUTH = ("admin", "test-pass")


def test_marketing_leads_csv_imports_into_crm():
    from app.web.main import app

    csv_path = Path(__file__).resolve().parent.parent / "marketing" / "LEADS.csv"
    with TestClient(app) as c:
        csrf = re.search(r'name="csrf" value="([0-9a-f]+)"', c.get("/admin/settings", auth=AUTH).text).group(1)
        with open(csv_path, "rb") as f:
            r = c.post("/admin/leads/import", data={"csrf": csrf}, files={"file": ("LEADS.csv", f, "text/csv")}, auth=AUTH, follow_redirects=False)
        assert r.status_code == 303 and "imported=47" in r.headers["location"]
    run_pending()
    with session_scope() as s:
        assert s.scalar(select(func.count(Lead.id))) == 47
        assert s.scalar(select(func.count(Message.id)).where(Message.status == "pending_approval")) == 47
        from app.models import Task

        assert s.scalar(select(func.count(Task.id)).where(Task.kind == "notify_owner")) == 0  # импорт не спамит владельца
