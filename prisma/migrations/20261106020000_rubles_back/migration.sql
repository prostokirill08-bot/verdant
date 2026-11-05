-- Валюта снова «демо-рубли»: тексты заданий в базе
UPDATE "QuestDef" SET "description" = replace("description", 'от 1 кредита', 'от 1 ₽') WHERE "description" LIKE '%кредит%';
