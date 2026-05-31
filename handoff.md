# GED Viewer Plugin — Handoff Document

## Что это за плагин

Obsidian-плагин для работы с `.ged` (GEDCOM) файлами генеалогии. Показывает данные о персонах, семьях, событиях, строит диаграммы и хронологии прямо в заметках Obsidian через code-блоки.

**Версия:** 1.1.0 (+ незакоммиченные изменения в heuristics)  
**Сборка:** `npm run build` → `main.js`  
**Деплой в тест-vault:** `cp main.js showcase-obsidian/.obsidian/plugins/ged-viewer/main.js`

---

## Архитектура

### Точка входа
`src/main.ts` — регистрирует все блоки, виды, команды, ribbon-кнопки, настройки.

### Дерево файлов

```
src/
├── main.ts                          — регистрация всего
├── gedcom/
│   ├── service.ts                   — GedcomService: загрузка .ged, парсинг, getIndividual(), getFamilyMembers(), getAncestors()
│   └── types.ts                     — GedcomIndividual, GedcomFamily, GedcomEvent
├── blocks/
│   ├── GedcomRenderChild.ts         — базовый класс для всех блоков
│   ├── GenResearchRenderChild.ts    — блок ged-research
│   └── index.ts                     — регистрация всех блоков + renderGenResearchBlock(), renderGedHeurBlock()
├── views/
│   ├── GedcomSearchView.ts          — боковая панель поиска персон/семей
│   └── GenResearchView.ts           — боковая панель дашборда (GEN_RESEARCH_VIEW = 'ged-research-view')
├── research/
│   ├── GenResearchPanel.ts          — основной UI дашборда ged-research (блок + панель)
│   ├── types.ts                     — UIState, OverlayState, FrontierPerson, SourceStatus и др.
│   ├── overlayParser.ts             — parse/serialize состояния блока ged-research
│   ├── frontierDetector.ts          — BFS по предкам от корня, возвращает FrontierPerson[]
│   ├── lifeRangeEstimator.ts        — оценка периода жизни (constraint-based)
│   ├── difficultyEstimator.ts       — подсчёт сложности (score → green/yellow/red)
│   └── heuristics/                  — YAML-движок правил подбора источников
│       ├── types.ts                 — Condition, Rule, RulesFile, EvalContext
│       ├── evaluator.ts             — evalCondition(), collectSources(), buildContext()
│       ├── loader.ts                — loadRules(): читает YAML из vault, кэширует по пути
│       ├── template.ts              — DEFAULT_RULES_YAML (Россия, генерируется по кнопке)
│       └── index.ts                 — реэкспорт
├── i18n/
│   ├── ru.ts / en.ts                — все строки интерфейса
│   └── index.ts                     — t(key, vars?) функция
├── commands/
│   └── insertBlocks.ts              — команды палитры: Insert ged-research block, Insert ged-heur block
├── utils/
│   └── blockTemplates.ts            — BlockType, getPersonBlockTypes(), createBlockForPerson()
└── types/
    └── settings.ts                  — GEDCOMPluginSettings, DEFAULT_SETTINGS
```

### Renderer Registry
`GedcomService` держит список объектов с методом `rerender()`. При перезагрузке `.ged` вызывает `rerender()` у всех зарегистрированных объектов. Боковые панели регистрируются при открытии, удаляются при закрытии.

---

## Изменения с версии 1.0

### v1.1.0 — Блок gen-research (commit 4e9e1fb)

Добавлен блок `gen-research` (сейчас переименован в `ged-research`) и боковая панель 🔭.

Функциональность:
- Авто-обнаружение предков-тупиков (BFS от корня)
- Оценка жизненного диапазона по датам событий и рождению детей
- Рекомендация источников (тогда hardcoded для России)
- Сложность (LOW/MED/HIGH) с цветовыми бейджами
- Ручное переопределение сложности
- Раскрываемые карточки: источники, флаги, ссылка на заметку-расследование
- Поле заметки с автодополнением по vault
- Сортировка по колонкам, фильтры
- Персистентность: блок хранит overlay в своём тексте, панель — в plugin data.json
- i18n ru/en

### v1.1.0 — Переименование + YAML-движок (commit 7486c55)

**Переименование:**
- Блок `gen-research` → `ged-research` (регистрация, команды, i18n, view type)
- CSS классы `.gen-research-*` оставлены как есть (внутренние, не breaking)
- TypeScript имена классов (`GenResearchPanel`, `GenResearchView` и т.д.) оставлены как есть

**Новый блок `ged-heur`:**
- Подбор источников для одной персоны по YAML-правилам
- Синтаксис: `@I37@`
- Вставляется командой или кнопкой **+** в Search View
- `getPersonBlockTypes()` включает `ged-heur`, но не `ged-research`

**YAML-движок правил (`src/research/heuristics/`):**
- Заменил hardcoded `heuristicMatcher.ts`
- Файл правил хранится в vault, путь в настройках (`heuristicsFilePath`)
- Кэш в `loader.ts` по пути файла (`invalidateRulesCache()` при смене пути)
- Поддерживаемые условия — см. таблицу ниже
- Кнопка "Создать шаблон" генерирует `DEFAULT_RULES_YAML` (Россия, ревизии + церковные книги)

**Система статусов источников:**
- 6 статусов: 💡📂🔍✅➖⛔ (индексы 0–5)
- ЛКМ — вперёд, ПКМ — назад; хранятся в `data.json` глобально
- `sourceStatuses: Record<personId, Record<sourceName, SourceStatus>>` в plugin data
- `noteLinks: Record<personId, string>` в plugin data
- `personFlags: Record<personId, string[]>` в plugin data — `['pinned']`, `['ignored']` и т.д.
- `difficultyOverrides: Record<personId, string>` в plugin data — `'green'|'yellow'|'red'`
- Всё per-person состояние разделяется между всеми блоками и панелью
- Эмодзи настраиваются в настройках (`sourceStatusEmojis: string[6]`, '' = дефолт)

**Улучшенный lifeRangeEstimator:**
- Constraint-based алгоритм: события + даты рождения детей объединяются одновременно
- Репродуктивный возраст из настроек (`reproductiveAge: ReproductiveAge`) вместо hardcoded 18
- Работает с любой комбинацией: только события / только дети / оба / с датой смерти / без

**Новые настройки (`GEDCOMPluginSettings`):**
- `heuristicsFilePath` — путь к YAML-файлу правил в vault
- `reproductiveAge: { maleMin, maleMax, femaleMin, femaleMax }` — для оценки жизненного диапазона
- `sourceStatusEmojis: string[6]` — кастомные эмодзи статусов

### После v1.1.0 — `always: true` условие (незакоммичено)

- `types.ts`: добавлен тип `Always = { always: boolean }`
- `evaluator.ts`: первая проверка `if ('always' in cond) return cond.always;`
- `template.ts`: шаблон использует `always: true` для безусловных правил (Метрические книги и т.д.)
- Нужен для правил типа "при совпадении родителя — показать этот источник всегда"

---

## Блок ged-research — детали

### Формат состояния (overlay)

Текст внутри блока содержит **только UI-состояние вида**:

```
[ui]
sort=sources:desc
root=I1
hide_ignored=false        (по умолчанию true, пишется только если false)
pinned_only=true          (по умолчанию false)
place_filter=no-place     (по умолчанию опускается — 'all'; значения: all|no-place|has-place)
period_filter=estimated   (по умолчанию опускается — 'all'; значения: all|no-period|estimated|has-exact)
source_filter=has-sources (по умолчанию опускается — 'all'; значения: all|has-sources|no-sources)
expanded=I23,I45          (развёрнутые карточки)
```

Всё per-person состояние (флаги, сложность, ссылки) хранится в `data.json` глобально.

### Архитектура UI

`GenResearchPanel` — единый класс, используется двумя потребителями:
- `GenResearchRenderChild` (блок) — `onSave` пишет overlay в текст заметки через `ctx.getSectionInfo` + `app.vault.modify`
- `GenResearchView` (панель) — `onSave` пишет overlay в `plugin.data.json` через `saveOverlayFn`

**Критические паттерны:**
- `uiInitialized` флаг — состояние UI читается из overlay только **один раз** при первом `render()`. `rerender()` сохраняет in-memory состояние.
- `rerenderAndSave()` — **сначала** обновляет `lastOverlay`, **потом** `rerenderCurrent()`, потом `onSave()`. Порядок критичен при изменении фильтров/сортировки.
- Все обработчики мутации используют `this.lastOverlay`, не захваченный `overlay`.
- `rootId` auto-detect: происходит в `renderContent()`, не в `render()` — только когда GEDCOM уже загружен.

### Детектор тупиков (`frontierDetector.ts`)

```ts
detectFrontierAncestors(service, rootId?, settings?)
```
- `rootId` задан → BFS вверх от корня, только прямые предки без родителей
- `rootId` не задан → все персоны, которые сами являются родителями, но не имеют родителей
- `rootId` — raw ID без `@`, например `I1`

### Оценка сложности (`difficultyEstimator.ts`)

Базовый score = 5:
- hasPlace → −2
- каждый источник → −1 (макс −3)
- нет источников → +3
- нет места И нет дат → +2

Порог: ≤3 = green, ≤7 = yellow, >7 = red.  
`difficultyOverride` полностью игнорирует score.

---

## YAML-движок правил

### Структура файла

```yaml
rules:
  - when: <условие>
    source: "Название источника"   # опционально
    rules: [...]                   # вложенные правила, опционально
```

Алгоритм (`collectSources`): обходит `rules` последовательно. Если `when` выполнено — добавляет `source` (если есть) **и** рекурсивно обходит `rules` (если есть).

### Поддерживаемые условия

| Условие | Значение |
|---------|----------|
| `always` | `true/false` — безусловно |
| `place_includes` | `'строка'` — любое поле места (все события объединены) |
| `place_includes_any` | `['а','б']` |
| `birth_place_includes` | `'строка'` — только место рождения |
| `death_place_includes` | `'строка'` — только место смерти |
| `born_before` | год — `lifeRange.from < N` |
| `born_after` | год — `lifeRange.from > N` |
| `born_between` | `[a, b]` |
| `died_before` | год — `lifeRange.to < N` |
| `died_after` | год — `lifeRange.to > N` |
| `alive_in` | год — `from <= N <= to` |
| `alive_in_range` | `[a, b]` — пересечение диапазонов |
| `sex` | `M` или `F` |
| `has_dates` | `true/false` |
| `has_birth_place` | `true/false` |
| `all` | `[условие, ...]` — AND |
| `any` | `[условие, ...]` — OR |
| `not` | условие |

**Важно:** `alive_in_range: [a, b]` — проверяет **пересечение** диапазонов, не вхождение. Младенец 1900–1902 пересекает [862, 1917] → match. Человек 1915–1999 пересекает [862, 1917] → match. Оба правильно получат церковные документы.

**Неизвестное условие** тихо возвращает `false` — баг найти сложно. При написании правил проверяй по таблице выше.

### Кэш правил

`loader.ts` кэширует по `filePath`. При смене пути в настройках вызывается `invalidateRulesCache()`. Изменение содержимого файла **не** инвалидирует кэш автоматически — нужно перезагрузить Obsidian или поменять путь туда-обратно.

---

## Настройки плагина (`src/types/settings.ts`)

```ts
interface GEDCOMPluginSettings {
    gedcomFilePath: string;           // путь к .ged файлу в vault
    heuristicsFilePath: string;       // путь к YAML-файлу правил
    sourceStatusEmojis: string[];     // [6] кастомные эмодзи, '' = дефолт
    reproductiveAge: ReproductiveAge; // { maleMin, maleMax, femaleMin, femaleMax }
    maxLifespanYears: number;         // default 100
    enableDebugLogging: boolean;
    defaultDiagramGenerations: number; // default 3
    enableGedJS: boolean;
}

// Репродуктивный возраст по умолчанию:
// maleMin: 15, maleMax: 60, femaleMin: 15, femaleMax: 49
```

---

## Ключевые ID и типы

```ts
// GedcomIndividual.id — всегда "@I123@"
// Overlay / хранение — rawId без @, например "I123"
// getIndividual("I123") — нормализует сам (добавляет @)

type SourceStatus = 0 | 1 | 2 | 3 | 4 | 5
// 0=💡 1=📂 2=🔍 3=✅ 4=➖ 5=⛔

type PersonFlag = 'pinned' | 'ignored'
type DifficultyCategory = 'green' | 'yellow' | 'red'
type SortField = 'sources' | 'name' | 'lifeRange'
// 'difficulty' в overlay парсится как backward compat → маппится на 'sources'

type PlaceFilter = 'all' | 'no-place' | 'has-place'
type PeriodFilter = 'all' | 'no-period' | 'estimated' | 'has-exact'
// 'estimated': confidence='estimated' && (from!=null || to!=null)
// 'has-exact': confidence='exact'
// 'no-period': from===null && to===null
type SourceFilter = 'all' | 'has-sources' | 'no-sources'
// 'has-sources': activeSourceCount > 0 (статусы 0–2)
```

---

## Релиз

```bash
node scripts/version-bump.mjs   # обновляет manifest.json, versions.json, package.json
git add manifest.json versions.json package.json
git commit -m "chore: bump version to X.Y.Z"
git tag vX.Y.Z
git push && git push --tags
# → GitHub Actions создаёт Release draft

# Удалить тег (пересоздать релиз):
git tag -d vX.Y.Z
git push origin --delete vX.Y.Z
```

---

## Текущее состояние (незакоммиченное)

Изменения в `src/research/heuristics/` (always: true), showcase-файлах не закоммичены. Также untracked: `showcase-obsidian/rules.yaml` (файл правил для демо-vault).

**Последние изменения (незакоммичены):**
- Всё per-person состояние вынесено из overlay в `data.json`: `noteLinks`, `personFlags`, `difficultyOverrides`
- Overlay хранит только `[ui]`; секции `[person:ID]` удалены; исправлен баг `saveSettings()` (теперь через `buildSavePayload()`)
- `GenResearchPanel` получил 6 callbacks для per-person данных
- **Фильтры**: булев `noPlaceOnly` → три независимых сегментных фильтра (Место / Период / Источники); чекбоксы получили эмодзи 📌 ⛔; каждый фильтр на отдельной строке
- **Таблица**: колонка «Сложность» заменена на «Источники» (кол-во активных, статус 0–2); сортировка по умолчанию `sources:desc`; backward compat: `sort=difficulty` → `sources`
- **Карточка персоны**: добавлены секции «Супруг(и)» и «Кровный потомок»; убрана «Оценка» (difficulty override)
- `FrontierPerson` получил поля: `activeSourceCount`, `spouses`, `bloodDescendant`
- `GenResearchPanel`: методы `getSpousesOf()`, `findBloodDescendant()` (BFS вверх от root), `formatPersonBrief()`
