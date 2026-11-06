# ВитринаЛаб

AI-студия инфографики и SEO для карточек Wildberries и Ozon: сайт, Telegram-бот, AI-агенты, оплата, автоматическое производство и доставка, CRM, отчёты.

Документы: [PROJECT_STATE](PROJECT_STATE.md) · [TODO](TODO.md) · [ARCHITECTURE](ARCHITECTURE.md) · [BUSINESS_MODEL](BUSINESS_MODEL.md) · [AI_AGENTS](AI_AGENTS.md) · [SALES_STRATEGY](SALES_STRATEGY.md) · [CHANGELOG](CHANGELOG.md)

## Локальный запуск
```bash
cd vitrinalab
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt && playwright install chromium
mkdir -p data/models && curl -L -o data/models/u2netp.onnx https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2netp.onnx
cp .env.example .env   # минимум: ADMIN_PASSWORD, APP_SECRET; LLM_PROVIDER=mock работает без ключей
uvicorn app.web.main:app --port 8000   # сайт и админка: http://localhost:8000, /admin
python -m app.worker                    # во втором терминале: агенты, очередь, расписание, бот
python -m pytest -q                     # тесты
```

## Продакшн (сервер в РФ)
```bash
git clone … && cd vitrinalab
cp .env.example .env && nano .env      # секреты только здесь
docker compose up -d --build
```
Перед сайтом поставить Caddy/nginx с HTTPS на `127.0.0.1:8000`. В ЮKassa указать вебхук `https://<домен>/webhooks/yookassa` (событие `payment.succeeded`).
Мониторинг: внешняя проверка `https://<домен>/healthz` (503 = воркер не работает). Бэкапы: `scripts/backup_pg.sh` в cron.

## Подключение сервисов
| Сервис | Что сделать | Переменные |
|---|---|---|
| Yandex Cloud | каталог → сервисный аккаунт (роли `ai.languageModels.user`, `ai.imageGeneration.user`) → API-ключ | `LLM_PROVIDER=yandex`, `YANDEX_API_KEY`, `YANDEX_FOLDER_ID`, `IMAGE_PROVIDER=yandexart` |
| Telegram | @BotFather → токен; написать боту `/start`, chat id взять из админки (клиенты) или @userinfobot | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_OWNER_CHAT_ID`, `TELEGRAM_CHANNEL_ID` (бот — админ канала) |
| ЮKassa | подключение как самозанятый → shopId и секретный ключ | `PAYMENT_PROVIDER=yookassa`, `YOOKASSA_SHOP_ID`, `YOOKASSA_SECRET_KEY` |
| Ручная оплата | реквизиты СБП; подтверждение оплаты в админке → Заказы | `PAYMENT_PROVIDER=manual`, `MANUAL_PAYMENT_DETAILS` |
| Почта | SMTP домена (Яндекс 360 и др.) | `SMTP_*` |
