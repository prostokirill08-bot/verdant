#!/usr/bin/env bash
# Установка ВитринаЛаб на чистый сервер Ubuntu 22.04/24.04 одной командой:
#   curl -fsSL https://raw.githubusercontent.com/prostokirill08-bot/verdant/claude/autonomous-ai-business-8t9and/vitrinalab/deploy/bootstrap.sh -o bootstrap.sh
#   sudo bash bootstrap.sh vitrinalab.ru
# Скрипт идемпотентный: повторный запуск ничего не ломает и не перезаписывает .env.
set -euo pipefail

DOMAIN="${1:-}"
REPO="${REPO:-prostokirill08-bot/verdant}"
BRANCH="${BRANCH:-claude/autonomous-ai-business-8t9and}"
DIR=/opt/verdant
[ -n "$DOMAIN" ] || { echo "Использование: sudo bash bootstrap.sh <домен>"; exit 1; }
[ "$(id -u)" = 0 ] || { echo "Запустите через sudo"; exit 1; }

echo "==> 1/6 Пакеты (Docker из репозитория Ubuntu)"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq git curl ufw openssl docker.io docker-compose-v2 >/dev/null
# Docker Hub ограничивает доступ из РФ — используем зеркало
if [ ! -f /etc/docker/daemon.json ]; then
  mkdir -p /etc/docker
  echo '{ "registry-mirrors": ["https://mirror.gcr.io"] }' > /etc/docker/daemon.json
fi
systemctl enable --now docker >/dev/null
systemctl restart docker

echo "==> 2/6 Файрвол: открыты только 22, 80, 443"
ufw allow 22/tcp >/dev/null; ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null
ufw --force enable >/dev/null

echo "==> 3/6 Код"
if [ ! -d "$DIR/.git" ]; then
  if ! git clone -q -b "$BRANCH" "https://github.com/$REPO.git" "$DIR" 2>/dev/null; then
    # приватный репозиторий: ключ развёртывания только на чтение и только для этого репозитория
    KEY=/root/.ssh/vitrinalab_deploy
    [ -f "$KEY" ] || ssh-keygen -q -t ed25519 -N "" -f "$KEY" -C "vitrinalab-deploy"
    echo; echo "Репозиторий приватный. Добавьте ключ на GitHub:"
    echo "  github.com/$REPO → Settings → Deploy keys → Add deploy key (без права записи)"
    echo; cat "$KEY.pub"; echo
    read -r -p "Добавили? Нажмите Enter… " _
    GIT_SSH_COMMAND="ssh -i $KEY -o StrictHostKeyChecking=accept-new" git clone -q -b "$BRANCH" "git@github.com:$REPO.git" "$DIR"
    git -C "$DIR" config core.sshCommand "ssh -i $KEY"
  fi
else
  git -C "$DIR" pull -q
fi
cd "$DIR/vitrinalab"

echo "==> 4/6 Настройки (.env)"
set_kv() { if grep -q "^$1=" .env; then sed -i "s|^$1=.*|$1=$2|" .env; else echo "$1=$2" >> .env; fi; }
if [ ! -f .env ]; then
  cp .env.example .env
  ADMIN_PASS=$(openssl rand -base64 18 | tr -d '/+=' | head -c 20)
  set_kv APP_SECRET "$(openssl rand -hex 32)"
  set_kv ADMIN_PASSWORD "$ADMIN_PASS"
  set_kv POSTGRES_PASSWORD "$(openssl rand -hex 16)"
  set_kv PUBLIC_URL "https://$DOMAIN"
  set_kv DOMAIN "$DOMAIN"
  set_kv LLM_PROVIDER mock
  chmod 600 .env
  echo "    Пароль админки (сохраните в менеджере паролей): $ADMIN_PASS"
else
  echo "    .env уже есть — не трогаю"
fi

echo "==> 5/6 Сборка и запуск (первый раз 5–10 минут)"
docker compose up -d --build

echo "==> 6/6 Ежедневный бэкап (04:30)"
chmod +x scripts/backup_pg.sh deploy/update.sh
( crontab -l 2>/dev/null | grep -v backup_pg.sh; echo "30 4 * * * $DIR/vitrinalab/scripts/backup_pg.sh >> /var/log/vitrinalab-backup.log 2>&1" ) | crontab -

sleep 8
echo
docker compose exec -T worker python -m app.check || true
echo
echo "Готово. Сайт: https://$DOMAIN  ·  админка: https://$DOMAIN/admin (логин admin)"
echo "Дальше: впишите ключи в $DIR/vitrinalab/.env (nano .env), затем: docker compose up -d && docker compose exec worker python -m app.check"
