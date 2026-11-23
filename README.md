# WarStrat_web — менеджер стратагем Warhammer 40,000 (10-я редакция)

Веб-приложение для настольного Warhammer 40,000 10th edition: помогает быстро находить стратагемы выбранного детачмента, фильтровать их по фазам и следить за командными очками (CP) прямо во время игры.

Проект полностью статический — HTML, CSS и vanilla JavaScript без сборки, фреймворков и зависимостей. Все игровые данные хранятся в JSON, поэтому контент можно править, не трогая код.

**Живая версия:** <https://canuphilmahar.github.io/WarStrat_web/>

## Возможности

- Выбор фракции и детачмента. Одновременно можно выбрать только один детачмент.
- 11 базовых стратагем 10-й редакции + 6 стратагем выбранного детачмента — всего 17 на выбор.
- Разделение на «Ваш ход» и «Ход противника», внутри — фазы: командование, движение, стрельба, заряд, бой.
- Стратагемы с фазой «любая» (`always`) показываются в каждой фазе, стратагемы «любой ход» (`who: "a"`) — в обеих категориях.
- Фазовые группы при загрузке свёрнуты; заголовки категорий и фаз кликабельны.
- Счётчик CP: `+1` за нажатие, режим `+2 CP`, сброс. Кнопка «Использовать» блокируется, если CP не хватает.
- Глоссарий на 92 термина: поиск, карточка термина и автоматические ссылки из описаний стратагем.
- Локализация EN/RU с переключателем. Выбранный язык запоминается в `localStorage` (`warstrat_lang`), при первом входе берётся из языка браузера.
- Тёмная тема и адаптивная вёрстка для телефона.
- Загрузка JSON с обходом кэша (`?v=<timestamp>` + `cache: "no-store"`), чтобы правки данных появлялись сразу после обновления страницы.

## Контент

Проект рассчитан на **10-ю редакцию**. В нём нет выбора размера игры, Detachment Points и контента 11-й редакции.

| Фракция | Детачментов | Стратагем на детачмент |
| --- | ---: | ---: |
| Blood Angels | 18 | 6 |
| Orks | 11 | 6 |

Базовый набор — 11 стратагем: Command Re-roll, Counter-offensive, Epic Challenge, Insane Bravery, Grenade, Tank Shock, Rapid Ingress, Fire Overwatch, Go to Ground, Smokescreen, Heroic Intervention.

<details>
<summary>Все детачменты Blood Angels</summary>

1st Company Task Force, Angelic Inheritors, Anvil Siege Force, Armoured Speartip, Bastion Task Force, Ceramite Sentinels, Firestorm Assault Force, Gladius Task Force, Headhunter Task Force, Ironstorm Spearhead, Liberator Assault Group, Librarius Conclave, Orbital Assault Force, Rage-cursed Onslaught, Stormlance Task Force, The Angelic Host, The Lost Brethren, Vanguard Spearhead.

</details>

<details>
<summary>Все детачменты Orks</summary>

War Horde, Da Big Hunt, Kult of Speed, Dread Mob, Green Tide, Bully Boyz, Taktikal Brigade, More Dakka!, Freebooter Krew, Speedwaaagh!, Blitz Brigade.

</details>

## Дисклеймер

Неофициальный фанатский проект. Warhammer 40,000 и связанные названия, правила и термины принадлежат Games Workshop. Проект не связан с Games Workshop и не предназначен для коммерческого использования.
