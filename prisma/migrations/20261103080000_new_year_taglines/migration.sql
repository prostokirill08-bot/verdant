-- Новогодние подписи игр (только если описание не меняли в админке)
UPDATE "Game" SET "tagline" = 'Звёздная книга Деда Мороза: символ раскрывается на весь барабан' WHERE "slug" = 'atlas' AND "tagline" = 'Книжный слот: особый символ на весь барабан';
UPDATE "Game" SET "tagline" = 'Звезда или снежинка: серия до 10 бросков' WHERE "slug" = 'coinflip' AND "tagline" = 'Орёл или решка: серия до 10 бросков';
UPDATE "Game" SET "tagline" = 'Санта взлетает на санях — забери, пока он не упал в сугроб' WHERE "slug" = 'crash' AND "tagline" = 'Множитель растёт — забери до обвала';
UPDATE "Game" SET "tagline" = 'Ледяные кости: выбери шанс и порог броска' WHERE "slug" = 'dice' AND "tagline" = 'Выбери шанс и порог броска';
UPDATE "Game" SET "tagline" = 'Новогодние карты: следующая выше или ниже?' WHERE "slug" = 'hilo' AND "tagline" = 'Угадай: следующая карта выше или ниже';
UPDATE "Game" SET "tagline" = 'Ёлочные шары: выбери до 10 чисел из 40' WHERE "slug" = 'keno' AND "tagline" = 'Выбери до 10 чисел — выпадет 10 из 40';
UPDATE "Game" SET "tagline" = 'Рождественская звезда: как высоко она взлетит?' WHERE "slug" = 'limbo' AND "tagline" = 'Задай цель — множитель решит';
UPDATE "Game" SET "tagline" = 'Собирай подарки и обходи бомбы в сугробах' WHERE "slug" = 'mines' AND "tagline" = 'Открывай клетки и обходи мины';
UPDATE "Game" SET "tagline" = 'Ёлочная игрушка скачет по гирлянде' WHERE "slug" = 'plinko' AND "tagline" = 'Шарик падает через ряды штырьков';
UPDATE "Game" SET "tagline" = 'Праздничная европейская рулетка на 37 секторов' WHERE "slug" = 'roulette' AND "tagline" = 'Европейская рулетка на 37 секторов';
UPDATE "Game" SET "tagline" = 'Ледяная башня: поднимись к подарку на вершине' WHERE "slug" = 'tower' AND "tagline" = 'Поднимайся по этажам, обходя ловушки';
UPDATE "Game" SET "tagline" = 'Колесо-леденец: 20 секторов, три уровня риска' WHERE "slug" = 'wheel' AND "tagline" = '20 секторов, три уровня риска';
