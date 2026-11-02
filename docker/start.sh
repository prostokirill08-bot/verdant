#!/bin/sh
# Запуск в контейнере: миграции → начальные данные (игры, админ) → сервер.
set -e
npx prisma migrate deploy
npx tsx prisma/seed.ts
exec npx tsx server.ts
