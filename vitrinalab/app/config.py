"""Настройки из переменных окружения. Секреты никогда не хранятся в коде."""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BASE_DIR / ".env", env_file_encoding="utf-8", extra="ignore")

    # --- Общие ---
    brand_name: str = "ВитринаЛаб"
    public_url: str = "http://localhost:8000"  # внешний адрес сайта, нужен для ссылок и вебхуков
    app_secret: str = "dev-secret-change-me"  # подпись ссылок на файлы
    data_dir: Path = BASE_DIR / "data"
    database_url: str = ""  # пусто → SQLite в data_dir
    timezone: str = "Europe/Moscow"
    admin_user: str = "admin"
    admin_password: str = ""  # пусто → админка закрыта

    # --- Реквизиты самозанятого (для оферты и чеков) ---
    owner_full_name: str = ""
    owner_inn: str = ""
    owner_email: str = ""

    # --- AI-провайдеры ---
    llm_provider: str = "mock"  # mock | yandex | gigachat
    image_provider: str = "none"  # none | yandexart
    yandex_api_key: str = ""
    yandex_folder_id: str = ""
    yandex_model: str = "yandexgpt-lite/latest"
    gigachat_auth_key: str = ""
    gigachat_scope: str = "GIGACHAT_API_PERS"
    gigachat_model: str = "GigaChat"
    gigachat_ca_bundle: str = ""  # путь к сертификату НУЦ Минцифры
    # цены за 1000 токенов / за картинку, в копейках (сверить с тарифами провайдера)
    llm_price_in_per_1k_kop: int = 20
    llm_price_out_per_1k_kop: int = 20
    image_price_kop: int = 200
    daily_ai_budget_rub: int = 500  # дневной лимит расходов на AI, сверх — агенты на паузе

    # --- Вырезка фона ---
    cutout_model_path: str = ""  # путь к u2net*.onnx; пусто → data_dir/models/u2netp.onnx

    # --- Рендер ---
    chromium_path: str = ""  # пусто → браузер Playwright по умолчанию

    # --- Платежи ---
    payment_provider: str = "manual"  # manual | yookassa
    yookassa_shop_id: str = ""
    yookassa_secret_key: str = ""
    manual_payment_details: str = "Оплата по СБП: реквизиты пришлёт менеджер"
    npd_tax_rate_legal: float = 0.06  # НПД с ИП/юрлиц
    npd_tax_rate_person: float = 0.04  # НПД с физлиц
    npd_year_limit_rub: int = 2_400_000

    # --- Telegram ---
    telegram_bot_token: str = ""
    telegram_owner_chat_id: str = ""  # куда слать отчёты и эскалации
    telegram_channel_id: str = ""  # канал для публикаций (@name или -100…)
    telegram_polling: bool = True

    # --- Email (необязательно) ---
    smtp_host: str = ""
    smtp_port: int = 465
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = ""

    # --- Отчёты ---
    daily_report_hour: int = 21

    @property
    def db_url(self) -> str:
        if self.database_url:
            return self.database_url
        self.data_dir.mkdir(parents=True, exist_ok=True)
        return f"sqlite:///{self.data_dir / 'vitrinalab.db'}"

    @property
    def has_public_site(self) -> bool:
        """Сайт опубликован по HTTPS. Иначе — режим «только Telegram-бот» (запуск с компьютера, без вложений)."""
        return self.public_url.startswith("https://")

    @property
    def files_dir(self) -> Path:
        p = self.data_dir / "files"
        p.mkdir(parents=True, exist_ok=True)
        return p

    @property
    def cutout_model(self) -> Path:
        return Path(self.cutout_model_path) if self.cutout_model_path else self.data_dir / "models" / "u2netp.onnx"


@lru_cache
def get_settings() -> Settings:
    return Settings()


def reset_settings_cache() -> None:
    get_settings.cache_clear()
