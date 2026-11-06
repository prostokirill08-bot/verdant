@echo off
chcp 65001 >nul
cd /d "%~dp0"
docker compose -f docker-compose.local.yml down
echo Остановлено. Данные сохранены, запуск снова: start-local.bat
pause
