@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo === ВитринаЛаб: запуск на этом компьютере, без сервера ===
where docker >nul 2>nul || (echo Нужен Docker Desktop: https://www.docker.com/products/docker-desktop/ & pause & exit /b 1)
if not exist .env (
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\init-env.ps1
  echo.
  echo Сейчас откроется файл настроек .env. Заполните и сохраните:
  echo   TELEGRAM_BOT_TOKEN - токен бота от @BotFather
  echo   MANUAL_PAYMENT_DETAILS - реквизиты для перевода по СБП
  echo   OWNER_FULL_NAME, OWNER_INN, OWNER_EMAIL - ваши данные для оферты
  echo Затем закройте Блокнот.
  notepad .env
)
findstr /r /c:"^TELEGRAM_BOT_TOKEN=..*" .env >nul || (echo В .env пустой TELEGRAM_BOT_TOKEN - впишите токен бота & notepad .env)
echo Сборка и запуск, первый раз 5-10 минут...
docker compose -f docker-compose.local.yml up -d --build || (echo Ошибка. Docker Desktop запущен? & pause & exit /b 1)
echo Ждём запуска...
:wait
timeout /t 3 >nul
curl -s http://localhost:8000/healthz | find "\"ok\":true" >nul || goto wait
echo.
docker compose -f docker-compose.local.yml exec -T worker python -m app.check
echo.
echo Готово. Бот работает, пока включён компьютер и запущен Docker Desktop.
echo Админка: http://localhost:8000/admin  логин admin, пароль:
findstr /b "ADMIN_PASSWORD=" .env
echo В Настройках админки есть команда /owner - отправьте её боту, чтобы получать отчёты.
echo Остановить: stop-local.bat
start http://localhost:8000/admin/settings
pause
