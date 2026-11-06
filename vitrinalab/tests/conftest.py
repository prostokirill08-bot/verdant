import os
import shutil
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))


@pytest.fixture(autouse=True)
def env(tmp_path, monkeypatch):
    """Отдельная БД и папка данных на каждый тест; внешние сервисы выключены."""
    data = tmp_path / "data"
    (data / "models").mkdir(parents=True)
    model = ROOT / "data" / "models" / "u2netp.onnx"
    if model.exists():
        shutil.copy(model, data / "models" / "u2netp.onnx")
    for k in list(os.environ):
        if k.startswith(("TELEGRAM_", "YOOKASSA_", "SMTP_", "YANDEX_", "GIGACHAT_")):
            monkeypatch.delenv(k, raising=False)
    monkeypatch.setenv("DATA_DIR", str(data))
    monkeypatch.setenv("DATABASE_URL", "")
    monkeypatch.setenv("LLM_PROVIDER", "mock")
    monkeypatch.setenv("IMAGE_PROVIDER", "none")
    monkeypatch.setenv("PAYMENT_PROVIDER", "manual")
    monkeypatch.setenv("ADMIN_PASSWORD", "test-pass")
    monkeypatch.setenv("APP_SECRET", "test-secret")
    monkeypatch.setenv("PUBLIC_URL", "http://test")
    monkeypatch.setenv("TELEGRAM_POLLING", "false")

    from app import config, db
    import app.worker  # noqa: F401  регистрирует обработчики задач

    config.reset_settings_cache()
    db.reset_engine()
    db.init_db()
    yield data
    db.reset_engine()
    config.reset_settings_cache()


@pytest.fixture
def product_photo(tmp_path):
    from tests.fixtures import make_product_photo

    return make_product_photo(tmp_path / "product.jpg")


@pytest.fixture
def tg(monkeypatch, product_photo):
    """Подменяем Telegram Bot API, складываем исходящие сообщения в список."""
    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", "123:test")
    import shutil

    from app import config
    from app.integrations import telegram

    config.reset_settings_cache()
    sent = []
    monkeypatch.setattr(telegram, "send_message", lambda chat, text, markup=None: sent.append(("msg", text, markup)) or {})
    monkeypatch.setattr(telegram, "send_photo", lambda chat, path, caption="", markup=None: sent.append(("photo", caption, markup)) or {})
    monkeypatch.setattr(telegram, "send_document", lambda chat, path, caption="": sent.append(("doc", str(path), None)) or {})
    monkeypatch.setattr(telegram, "answer_callback", lambda *a, **k: None)
    monkeypatch.setattr(telegram, "set_owner_commands", lambda *a, **k: None)
    monkeypatch.setattr(telegram, "download_file", lambda fid, dest: (dest.parent.mkdir(parents=True, exist_ok=True), shutil.copy(product_photo, dest))[1])
    return sent


FEATURES = """Объём: 450 мл
Держит тепло до 8 часов
Не протекает — герметичная крышка с замком
Материал: нержавеющая сталь 304
В комплекте чехол и щёточка"""
