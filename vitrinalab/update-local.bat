@echo off
chcp 65001 >nul
rem Скрипт копирует себя во временную папку: файл в папке проекта будет заменён при обновлении
if not "%~1"=="--run" (
  copy /y "%~f0" "%TEMP%\vitrinalab-update.bat" >nul
  call "%TEMP%\vitrinalab-update.bat" --run "%~dp0."
  exit /b
)
set "DEST=%~2"
cd /d "%DEST%"
echo === Обновление ВитринаЛаб. Настройки .env и данные сохраняются ===
set "ZIP=%TEMP%\vitrinalab-update.zip"
set "TMPD=%TEMP%\vitrinalab-update"
curl -L -s -o "%ZIP%" https://github.com/prostokirill08-bot/verdant/archive/refs/heads/claude/autonomous-ai-business-8t9and.zip || (echo Не удалось скачать обновление & pause & exit /b 1)
if exist "%TMPD%" rmdir /s /q "%TMPD%"
mkdir "%TMPD%"
tar -xf "%ZIP%" -C "%TMPD%" || (echo Не удалось распаковать & pause & exit /b 1)
robocopy "%TMPD%\verdant-claude-autonomous-ai-business-8t9and\vitrinalab" "%DEST%" /E /XF .env /XD data /NFL /NDL /NJH /NJS /NP >nul
if errorlevel 8 (echo Ошибка копирования файлов & pause & exit /b 1)
echo Код обновлён. Пересборка, обычно 1-3 минуты...
docker compose -f docker-compose.local.yml up -d --build || (echo Ошибка. Docker Desktop запущен? & pause & exit /b 1)
echo.
echo Готово: система обновлена и запущена.
pause
