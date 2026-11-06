#!/usr/bin/env bash
# Запуск на своём компьютере (macOS/Linux), без сервера: ./start-local.sh
set -euo pipefail
cd "$(dirname "$0")"
command -v docker >/dev/null || { echo "Нужен Docker Desktop: https://www.docker.com/products/docker-desktop/"; exit 1; }
if [ ! -f .env ]; then
  cp .env.example .env
  sed -i.bak "s|^APP_SECRET=.*|APP_SECRET=$(openssl rand -hex 32)|; s|^ADMIN_PASSWORD=.*|ADMIN_PASSWORD=$(openssl rand -hex 10)|; s|^PUBLIC_URL=.*|PUBLIC_URL=http://localhost:8000|; s|^DOMAIN=.*|DOMAIN=localhost|" .env && rm -f .env.bak
  echo "Заполните в .env: TELEGRAM_BOT_TOKEN, MANUAL_PAYMENT_DETAILS, OWNER_FULL_NAME, OWNER_INN, OWNER_EMAIL"
  ${EDITOR:-nano} .env
fi
docker compose -f docker-compose.local.yml up -d --build
until curl -s http://localhost:8000/healthz | grep -q '"ok":true'; do sleep 3; done
docker compose -f docker-compose.local.yml exec -T worker python -m app.check || true
echo "Админка: http://localhost:8000/admin (admin / $(grep ^ADMIN_PASSWORD= .env | cut -d= -f2))"
