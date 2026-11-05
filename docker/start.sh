#!/bin/sh
# Запуск в контейнере: миграции → начальные данные (игры, админ) → сервер.
set -e
npx prisma migrate deploy
npx tsx prisma/seed.ts
# Один процесс node (без обёрток npx/tsx: −130 МБ), кучу ограничиваем под 512 МБ бесплатного тарифа
exec node --max-old-space-size=300 --import tsx server.ts
