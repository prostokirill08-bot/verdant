@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo === Verdant: локальный запуск через Docker ===
where docker >nul 2>nul || (echo Нужен Docker Desktop: https://www.docker.com/products/docker-desktop/ & pause & exit /b 1)
if not exist .env (
  echo POSTGRES_PASSWORD=verdant_local> .env
  echo ADMIN_EMAIL=admin@verdant.local>> .env
  echo ADMIN_PASSWORD=Admin12345>> .env
  echo APP_URL=http://localhost:3000>> .env
  echo PORT=3000>> .env
)
echo Сборка и запуск (первый раз 3-7 минут)...
docker compose up -d --build || (echo Ошибка. Docker Desktop запущен? & pause & exit /b 1)
echo Ждём, пока сайт поднимется...
:wait
timeout /t 3 >nul
curl -s http://localhost:3000/api/health | find "\"ok\":true" >nul || goto wait
echo.
echo Готово: http://localhost:3000
echo Админ: admin@verdant.local / пароль из файла .env (ADMIN_PASSWORD)
echo Остановить: docker compose down
start http://localhost:3000
pause
