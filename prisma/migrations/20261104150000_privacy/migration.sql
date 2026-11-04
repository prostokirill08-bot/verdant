-- Анонимный режим для игроков
ALTER TABLE "User" ADD COLUMN "hidden" BOOLEAN NOT NULL DEFAULT false;

-- Минимизация данных: стираем ранее сохранённые настоящие IP-адреса и полные строки браузера.
-- Дальше сервер хранит только метку IP (HMAC) и тип устройства.
UPDATE "Session" SET "ip" = 'old', "userAgent" = NULL;
UPDATE "AuditLog" SET "ip" = NULL;
