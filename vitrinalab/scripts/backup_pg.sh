#!/usr/bin/env bash
# Резервная копия Postgres + файлов заказов. Добавить в cron хоста: 0 4 * * * /opt/vitrinalab/scripts/backup_pg.sh
set -euo pipefail
cd "$(dirname "$0")/.."
DEST=${BACKUP_DIR:-/var/backups/vitrinalab}
mkdir -p "$DEST"
STAMP=$(date +%Y%m%d-%H%M)
docker compose exec -T db pg_dump -U vitrina vitrina | gzip > "$DEST/db-$STAMP.sql.gz"
docker run --rm -v vitrinalab_data:/data -v "$DEST":/backup alpine tar czf "/backup/files-$STAMP.tgz" -C /data files
find "$DEST" -type f -mtime +14 -delete
