-- Возврат новогоднего оформления: названия и описания игр как до ребрендинга
UPDATE "Game" SET "title" = 'Мастерская Санты', "tagline" = 'Монеты летят в сундуки — каждый сундук открывает свой бонус' WHERE "slug" = 'workshop';
UPDATE "Game" SET "title" = 'Блэкджек у камина', "tagline" = 'Набери 21 раньше дилера: удвоение, сплит, блэкджек 3:2' WHERE "slug" = 'blackjack';
UPDATE "Game" SET "title" = 'Снежный покер', "tagline" = 'Видеопокер «валеты и выше»: оставь нужные карты — до ×800' WHERE "slug" = 'videopoker';
UPDATE "Game" SET "title" = 'Баккара', "tagline" = 'Игрок, Банкир или Ничья — у кого ближе к 9' WHERE "slug" = 'baccarat';
UPDATE "Game" SET "title" = 'Гонка на санях', "tagline" = 'Пять саночников мчатся с горы — угадай победителя' WHERE "slug" = 'sledrace';
UPDATE "Game" SET "title" = 'Башня', "tagline" = 'Ледяная башня: поднимись к подарку на вершине' WHERE "slug" = 'tower';
UPDATE "Game" SET "title" = 'Hi-Lo', "tagline" = 'Новогодние карты: следующая выше или ниже?' WHERE "slug" = 'hilo';
UPDATE "Game" SET "title" = 'Колесо фортуны', "tagline" = 'Колесо-леденец: 20 секторов, три уровня риска' WHERE "slug" = 'wheel';
UPDATE "Game" SET "title" = 'Кено', "tagline" = 'Ёлочные шары: выбери до 10 чисел из 40' WHERE "slug" = 'keno';
UPDATE "Game" SET "title" = 'Монетка', "tagline" = 'Звезда или снежинка: серия до 10 бросков' WHERE "slug" = 'coinflip';
UPDATE "Game" SET "title" = 'Снежная лавина', "tagline" = 'Ледяные символы раскалываются, сверху падают новые; в бонусе растёт множитель' WHERE "slug" = 'avalanche';
UPDATE "Game" SET "title" = 'Новогодний салют', "tagline" = '1024 способа и ракеты с множителями; в бонусе они шагают вверх и взрываются салютом' WHERE "slug" = 'salute';
UPDATE "Game" SET "title" = 'Хрустальный шар', "tagline" = 'Шары-загадки раскрываются в один символ; в бонусе прилипают и улучшаются' WHERE "slug" = 'crystal';
UPDATE "Game" SET "title" = 'Атлас звёзд', "tagline" = 'Звёздная книга Деда Мороза: символ раскрывается на весь барабан' WHERE "slug" = 'atlas';
UPDATE "Game" SET "title" = 'Зимний сад', "tagline" = 'Морозные фрукты, эльф и подарки BONUS' WHERE "slug" = 'neon-garden';
UPDATE "Game" SET "title" = 'Crash', "tagline" = 'Санта взлетает на санях — забери, пока он не упал в сугроб' WHERE "slug" = 'crash';
UPDATE "Game" SET "title" = 'Mines', "tagline" = 'Собирай подарки и обходи бомбы в сугробах' WHERE "slug" = 'mines';
UPDATE "Game" SET "title" = 'Dice', "tagline" = 'Ледяные кости: выбери шанс и порог броска' WHERE "slug" = 'dice';
UPDATE "Game" SET "title" = 'Plinko', "tagline" = 'Ёлочная игрушка скачет по гирлянде' WHERE "slug" = 'plinko';
UPDATE "Game" SET "title" = 'Limbo', "tagline" = 'Рождественская звезда: как высоко она взлетит?' WHERE "slug" = 'limbo';
UPDATE "Game" SET "title" = 'Roulette', "tagline" = 'Праздничная европейская рулетка на 37 секторов' WHERE "slug" = 'roulette';

-- Турнир недели снова «Ледяная гонка» (только если название не меняли в админке)
UPDATE "Tournament" SET "title" = 'Ледяная гонка' WHERE "title" = 'Турнир недели';
