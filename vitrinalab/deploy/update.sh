#!/usr/bin/env bash
# Обновление до последней версии кода: sudo bash /opt/verdant/vitrinalab/deploy/update.sh
set -euo pipefail
cd "$(dirname "$0")/.."
git pull -q
docker compose up -d --build
sleep 5
docker compose exec -T worker python -m app.check --offline
