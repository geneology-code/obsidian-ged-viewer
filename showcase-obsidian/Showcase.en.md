# GEDCOM Genealogy Plugin — Showcase

> An Obsidian plugin for displaying genealogical data from **GEDCOM files** directly in your vault. Load a `.ged` file — and get person cards, comparison tables, interactive ancestor/descendant diagrams, timelines, and even the ability to write custom JavaScript to access the data.

## Plugin Overview

### Features

| Feature                  | Block                            | Description                                                                                                                    |
| ------------------------ | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Person card              | `ged-person`                     | Key-value: name, dates, places                                                                                                 |
| Full person card         | `ged-person-full`                | Card + family tree                                                                     |
| Person comparison        | `ged-person-compare`, `ged-comp` | Table comparing multiple persons                                                       |
| Events by date           | `ged-person-events`              | Chronological table of all events                                                      |
| Relatives                | `ged-relatives`                  | Parents, spouses, children, siblings                                                   |
| Ancestors diagram        | `ged-diagram-ancestors`          | Interactive ascending family tree                                                      |
| Descendants diagram      | `ged-diagram-descendants`        | Interactive descending family tree                                                     |
| Hourglass                | `ged-diagram-hourglass`          | Ancestors + descendants simultaneously                                                 |
| All relatives            | `ged-diagram-relatives`          | Full connection network                                                                |
| Timeline                 | `ged-chronos`                    | Chronos plugin integration — standard chronos events + GEDCOM person/family events     |
| User scripts             | `ged-js`                         | JavaScript with access to GEDCOM data                                                  |
| Research dashboard       | `ged-research`                   | Frontier ancestors: life range, source suggestions, segmented filters, research statuses |
| Source suggestions       | `ged-heur`                       | Heuristic source suggestions for a single person with clickable research statuses      |

### GEDCOM ID Format

All blocks use GEDCOM identifiers in the **standard format** wrapped with `@` symbols:

```
@I37@    — person identifier
@F4@     — family identifier
```

To find a person or family, use the "[[#GEDCOM Search View|Open GEDCOM Search]]" icon in the right sidebar — double-click a result to copy its ID.

### What if data is not loaded

If the GEDCOM file is not loaded (no path set or parse error), blocks will show a message:
- Cards: "GEDCOM data not loaded" or "GEDCOM file not found"
- Diagrams: "No data for diagram"
- Event blocks: empty table or error message

Make sure the file path is set correctly in [[#Plugin Settings]].

---

## Plugin Settings

Settings location: **Settings → Community plugins → GEDCOM Genealogy → ⚙️**

### GEDCOM File Path

**Key:** `gedcomFilePath`

Path to your `.ged` file **relative to the vault root**.

```
Examples:
royal92.ged                    — file in vault root
data/family.ged                — file in data/ folder
ancestors/romanov/royal92.ged    — nested structure
```

> **Important:** the file must be inside the vault (Obsidian folder), not outside. The plugin reads the file via the Obsidian Vault API.

**Restart Obsidian** after changing the path.

---

### Maximum Lifespan (without death)

**Key:** `maxLifespanYears`
**Default:** `100`

Maximum assumed age for persons **without a death event**. Used for date calculations in diagrams and timelines.

```
Example:
- If a person was born in 1800 and there is no death date:
  - At value 100 → assumed death: 1900
  - At value 120 → assumed death: 1920
- If a person died in 1900 and there is no birth date:
  - At value 100 → assumed birth: 1800
  - At value 80 → assumed birth: 1820
```

> Increase this value if your database includes long-lived individuals.

---

### Default Diagram Generations

**Key:** `defaultDiagramGenerations`
**Default:** `3`

Default number of generations for diagrams when `LVL:N` is not specified in the code block.

```
Examples:
- LVL:1 → 1 generation (only parents/children)
- LVL:2 → 2 generations (grandparents, grandchildren)
- LVL:3 → 3 generations (default)
- No LVL → uses this setting value
```

> **Recommendation:** for large databases, keep it at 2-3. For `ged-diagram-hourglass` and `ged-diagram-relatives`, don't set it higher than 2 — see warnings below.

---

### Debug Logging

**Key:** `enableDebugLogging`
**Default:** `Off`

Enables detailed debug logs for Topola diagrams and other plugin features.

- Outputs information about SVG sizes, element positions, scale
- Useful for debugging diagram rendering issues
- **Requires Obsidian restart** after changing

> Enable only when troubleshooting. For regular use — leave it off.

---

### ged-js Blocks

**Key:** `enableGedJS`
**Default:** `Off`

Allows execution of **user JavaScript** in `ged-js` blocks.

> ⚠️ **Security warning:** the code runs with **full access** to Node.js APIs (`require`, `process`, `fs`). Use **only with trusted code** that you wrote or verified yourself.

After enabling:
- `ged-js` blocks start executing
- The `ged` object provides access to `ged.service`, `ged.app`, `ged.renderMarkdown()`, etc.
- When disabled — blocks show a "disabled" message

Full documentation for `ged-js` — in the [[#Scripts (ged-js)]] section below.

---

### Heuristics & Research

**Key:** `heuristicsFilePath`

Path to a YAML file with source suggestion rules for `ged-research` and `ged-heur`. Leave empty to disable.

Next to the input field is a **Create template** button — generates a pre-filled Russia rules file at the specified path.

---

#### Reproductive Age

*(Collapsible)*

Used when estimating the life range from children's birth dates.

| Setting | Default | Description |
|---------|---------|-------------|
| Min father age | 15 | Earliest age a man can father a child |
| Min mother age | 14 | Earliest age a woman can bear a child |
| Max father age | 70 | Latest age a man can father a child |
| Max mother age | 50 | Latest age a woman can bear a child |

---

#### Status Emojis

*(Collapsible)*

Customize the emoji for each of the 6 research source statuses. **Reset** button restores defaults: 💡 📂 🔍 ✅ ➖ ⛔

---

## GEDCOM Search View

Interactive search through GEDCOM data in the right sidebar.

### How to Open

- **Ribbon icon** (left panel) — 🔍 "GEDCOM Search"
- **Command** (`Ctrl/Cmd + P`) → "GEDCOM Search: Open GEDCOM Search"

### Features

| Feature | Description |
|---------|-------------|
| **"Persons" tab** | Search by name, ID, life dates |
| **"Families" tab** | Search by family ID, marriage dates, number of children |
| **Search** | Text search + Regex support (checkbox) |
| **Sorting** | Click column header — sort A-Z / Z-A |
| **Insert block** | `+` button — inserts a code block for person/family into the active note |
| **Copy ID** | Click on ID — copies to clipboard |

### Inserting Blocks from Search

Click `+` on a person or family row → select a block type → code is inserted into the current note at the cursor position.

Available types: `ged-person`, `ged-person-full`, `ged-person-compare`, `ged-person-events`, `ged-relatives`, `ged-chronos`, `ged-diagram-ancestors`, `ged-diagram-descendants`, `ged-diagram-hourglass`, `ged-diagram-relatives`, `ged-js`.

For families: `ged-chronos` (via `gcf: @F@`).

---

## Plugin Commands

All commands are invoked via **Ctrl+P** (or **Cmd+P** on Mac) → type the command name.

### "Select a Person"

Opens a modal with a list of **all persons and families** from the loaded GEDCOM. Allows quickly finding a person, copying their ID, or inserting a block into a note.

### Insert Empty Blocks

An empty code block can be inserted via the "GEDCOM: Insert block …" command:

| Command | Inserted block |
|---------|----------------|
| Insert ged-person block | `ged-person` |
| Insert ged-person-full block | `ged-person-full` |
| Insert ged-person-compare block | `ged-person-compare` |
| Insert ged-relatives block | `ged-relatives` |
| Insert ged-person-events block | `ged-person-events` |
| Insert ged-chronos block | `ged-chronos` |
| Insert ged-js block | `ged-js` |
| Insert ged-diagram-ancestors block | `ged-diagram-ancestors` |
| Insert ged-diagram-descendants block | `ged-diagram-descendants` |
| Insert ged-diagram-hourglass block | `ged-diagram-hourglass` |
| Insert ged-diagram-relatives block | `ged-diagram-relatives` |

> After inserting, you'll need to fill in the `@ID@` — see syntax details in the sections below.

---

## Person Cards

### ged-person

> Displays information in `*key*: value` format for the **first** person from the ID list. Even if multiple `@ID@` are specified, only the first is shown.

**When to use:** quick reference for one person. If you need a full picture with relatives — use `ged-person-full`.

**Syntax:** `@ID@ [@ID@ ...]` — but only the first ID is used.

*An empty block can also be inserted via the "GEDCOM: Insert ged-person block" command (Ctrl+P)*

#### Nicholas II

```ged-person
@I37@
```

#### Alexander III — first from the list

```ged-person
@I40@ @I41@ @I37@
```

> Despite three IDs, only @I40@ (Alexander III) is shown.

### ged-person-compare (ged-comp)

> Always outputs a **comparison table**, regardless of the number of persons. The `ged-comp` alias is the short form.

**When to use:** comparing multiple persons (spouses, generations, siblings). `ged-comp` is a convenient short form.

**Syntax:** `@ID@ [@ID@ ...]` — all specified persons.

*An empty block can also be inserted via the "GEDCOM: Insert ged-person-compare block" command (Ctrl+P)*

#### Comparison: Nicholas II, Alexandra Feodorovna, Alexander III

```ged-comp
@I37@ @I39@ @I40@
```

#### Full table: four generations of Romanovs

```ged-person-compare
@I42@ @I44@ @I40@ @I37@
```

> Nicholas I → Alexander II → Alexander III → Nicholas II — four generations of tsars.

#### Couple: spouses

```ged-comp
@I37@ @I39@
```

### ged-person-events

> **Events by date** table — births, marriages, deaths, additional events. Chronologically sorted.

**When to use:** viewing a person's life path or comparing key dates across multiple people. Supports **all GEDCOM event types** — standard (BIRT, DEAT, MARR) and custom (Occupation, Residence, Education, etc.).

**Syntax:** `@ID@ [@ID@ ...]` — all specified persons.

*An empty block can also be inserted via the "GEDCOM: Insert ged-person-events block" command (Ctrl+P)*

#### Nicholas II — life events

```ged-person-events
@I37@
```

> Includes: birth, coronation (EVENT with type "Coronation" — untranslated), emigration, death.

#### Four generations — event comparison

```ged-person-events
@I42@ @I44@ @I40@ @I37@
```

> Shows how life dates shift across each generation.

#### Nicholas II's family — all events

```ged-person-events
@I37@ @I39@ @I46@ @I47@ @I48@ @I49@ @I50@
```

### ged-person-full

> Displays **all information** about a person: first key:value details (like `ged-person`), then a markdown family tree (like `ged-relatives`).

**When to use:** full person reference with family overview. Differs from `ged-person` by including the relatives tree. Differs from `ged-relatives` by having key:value details at the top.

**Syntax:** `@ID@ [@ID@ ...]` — only the first ID is used.

*An empty block can also be inserted via the "GEDCOM: Insert ged-person-full block" command (Ctrl+P)*

#### Nicholas II — full information

```ged-person-full
@I37@
```

> Keys → parents → spouse → 5 children.

#### Alexandra Feodorovna — full information

```ged-person-full
@I39@
```

> Shows parents, spouse, and children in one block.

#### Alexander II — two marriages

```ged-person-full
@I44@
```

> Two marriages in the relatives tree: @F11@ (Marie of Hesse-Darmstadt) + @F593@.

## Relatives

### ged-relatives

> Shows a person's **relatives**: parents, siblings, spouse(s), children.
> For multiple `@ID@` — a family comparison table.

**When to use:** overview of closest relatives. For a visual diagram, use `ged-diagram-relatives`.

**Syntax:** `@ID@ [@ID@ ...]`

*An empty block can also be inserted via the "GEDCOM: Insert ged-relatives block" command (Ctrl+P)*

#### Nicholas II — family with five children

```ged-relatives
@I37@
```

> Shows parents (Alexander III and Dagmar), spouse (Alexandra), and five children.

#### Alexander II — two marriages

```ged-relatives
@I44@
```

> Alexander II has two marriages: @F11@ (with Marie of Hesse-Darmstadt) and @F593@ — both are shown.

#### Family comparison: three generations

```ged-relatives
@I44@ @I40@ @I37@
```

> Table: who has how many children, spouses, siblings.

## Diagrams

All diagrams are interactive: **drag**, **zoom**, **Expand to full width** button, **Zoom in/out**, **Fit to view**.

### LVL Parameter (generations)

Optional. Written **before** `@ID@` on a separate line:

```
LVL:1    — 1 generation
LVL:3    — 3 generations
@I37@    — person ID
```

If `LVL` is not specified — uses the value from [[#Default Diagram Generations]] settings (default 3).

### ged-diagram-ancestors

> **Ancestors** diagram — ascending family tree (parents, grandparents, etc.).

**Syntax:** `LVL:N` (optional) + `@ID@`

*An empty block can also be inserted via the "GEDCOM: Insert ged-diagram-ancestors block" command (Ctrl+P)*

#### Nicholas II's ancestors

```ged-diagram-ancestors
LVL:5
@I37@
```

### ged-diagram-descendants

> **Descendants** diagram — descending family tree (children, grandchildren, etc.).

**Syntax:** `LVL:N` (optional) + `@ID@`

*An empty block can also be inserted via the "GEDCOM: Insert ged-diagram-descendants block" command (Ctrl+P)*

#### Alexander III's descendants

With `LVL:1` parameter

```ged-diagram-descendants
LVL:1
@I40@
```

#### Nicholas I's descendants

```ged-diagram-descendants
LVL:2
@I42@
```

### ged-diagram-hourglass

> **Hourglass** — ancestors and descendants simultaneously.

> ⚠️ **WARNING: performance**
>
> This diagram builds **both directions** (ancestors ↑ + descendants ↓). For persons with many relatives, rendering can take **significant time** and consume a lot of memory.
>
> **Recommendation:** always use `LVL:1` or `LVL:2` to be safe. `LVL:3+` — only if you're confident about the tree size.

**Syntax:** `LVL:N` (optional, recommended 1-2) + `@ID@`

*An empty block can also be inserted via the "GEDCOM: Insert ged-diagram-hourglass block" command (Ctrl+P)*

#### Nicholas II — hourglass

```ged-diagram-hourglass
LVL:3
@I37@
```

#### Alexander II — hourglass

```ged-diagram-hourglass
LVL:2
@I44@
```

### ged-diagram-relatives

> **All relatives** — full connection network for a person (parents, spouses, children, siblings, their families, etc.).

> ⚠️ **WARNING: performance**
>
> This diagram builds **all related family members**. For large families, rendering can take **significant time** and create a very large diagram.
>
> **Recommendation:** always use `LVL:1` or `LVL:2` to be safe. `LVL:3+` — only if you're confident about the tree size.

**Syntax:** `LVL:N` (optional, recommended 1-2) + `@ID@`

*An empty block can also be inserted via the "GEDCOM: Insert ged-diagram-relatives block" command (Ctrl+P)*

#### Alexander II — relatives

```ged-diagram-relatives
LVL:2
@I44@
```

#### Nicholas II — relatives

```ged-diagram-relatives
LVL:1
@I37@
```

#### Alexei — Tsarevich

```ged-diagram-relatives
LVL:1
@I50@
```

## Timelines (ged-chronos)

### ged-chronos

> Interactive **timeline** based on the [Chronos](https://github.com/clairefro/obsidian-plugin-chronos) plugin. Supports `gci:` (individual), `gcf:` (family) directives, and standard Chronos DSL.

**Requirements:** [Chronos Timeline](https://github.com/clairefro/obsidian-plugin-chronos) plugin installed.

**Syntax:**
- `gci: @ID@` — person events (all GEDCOM events)
- `gcf: @ID@` — family events (marriage/divorce, events of all members including children)
- `- [date] description` — custom event
- `# comment` — comment
- Grouping: `{Group} Label | Place | Note`

More details: [Chronos cheatsheet](https://github.com/clairefro/obsidian-plugin-chronos/blob/main/docs/chronos-cheatsheet.md)

*An empty block can also be inserted via the "GEDCOM: Insert ged-chronos block" command (Ctrl+P)*

#### Nicholas II and Alexandra

```ged-chronos
gci: @I37@
gci: @I39@
```

#### Full family: parents + children via family

```ged-chronos
gci: @I37@
gci: @I39@
gcf: @F4@
```

> @F4@ — Nicholas II's family, includes all five children.

#### Multi-generational timeline

```ged-chronos
gci: @I42@
gci: @I44@
gci: @I40@
gci: @I37@
gcf: @F10@
gcf: @F9@
gcf: @F4@
```

> Nicholas I → Alexander II → Alexander III → Nicholas II — four generations on one timeline.

#### Custom events + GEDCOM

```ged-chronos
# Romanov Dynasty Timeline

gci: @I37@
gci: @I40@

- [1917-07-17] Russian Revolution
- [1918-07-18] Execution of the Romanovs
```

> You can mix automatic GEDCOM events with custom events.

## Scripts (ged-js)

### ged-js

> Executes **user JavaScript** with access to GEDCOM data via the `ged` object.

> ⚠️ **Note:** `ged-js` is disabled by default. Enable in [[#ged-js Blocks]].

*An empty block can also be inserted via the "GEDCOM: Insert ged-js block" command (Ctrl+P)*

#### `ged` Context

| Field | Description |
|-------|-------------|
| `ged.service` | GedcomService — access to all GEDCOM data |
| `ged.app` | Obsidian App — vault, workspace, metadataCache |
| `ged.container` | HTMLElement — rendering container |
| `ged.component` | MarkdownRenderChild — lifecycle management |
| `ged.sourcePath` | Path to the current note file |

#### Rendering Methods

| Method | Description | Example |
|--------|-------------|---------|
| `ged.el(tag, attrs, parent?)` | Create DOM element | `ged.el('div', { cls: 'my-class' })` |
| `ged.header(level, text)` | Heading h1-h6 | `ged.header(2, 'Title')` |
| `ged.paragraph(text)` | Paragraph (plain text) | `ged.paragraph('Hello')` |
| `ged.span(text)` | Span (plain text) | `ged.span('text')` |
| `ged.renderMarkdown(md, el?)` | **Render markdown via Obsidian** — `**bold**`, `*italic*`, links, tables | `await ged.renderMarkdown('**Bold**', ged.container)` |
| `ged.list(items[])` | Bulleted list | `ged.list(['a', 'b'])` |
| `ged.table(headers[], rows[][])` | HTML table | `ged.table(['Name'], [['John']])` |
| `ged.formatDate(date)` | GEDCOM date → human-readable | `ged.formatDate('1 JAN 1950')` → `'January 1, 1950'` |

#### GedcomService Core Methods

**Persons:**
- `ged.service.getIndividual('@ID@')` — get person by ID (`GedcomIndividual | null`)
- `ged.service.getAllIndividuals()` — array of all persons

**Families:**
- `ged.service.getFamily('@ID@')` — get family by ID (`GedcomFamily | null`)
- `ged.service.getAllFamilies()` — array of all families

**Relatives:**
- `ged.service.getFamilyMembers('@ID@')` — object:
  - `.father` / `.mother` — parents
  - `.siblings[]` — siblings
  - `.spouses[]` — spouses
  - `.children[]` — children

#### GedcomIndividual Properties

```javascript
{
    id,              // "@I42@"
    name,            // "Nicholas I Romanov"
    firstName,       // "Nicholas I"
    surname,         // "Romanov"
    birthDate,       // "1796" (raw GEDCOM format)
    birthPlace,      // "Tsarskoe Selo"
    deathDate,       // "1855"
    deathPlace,      // "St. Petersburg"
    sex,             // "M" or "F"
    occupations,     // ["Farmer"] — all OCCU values (may have multiple)
    nobilityTitles,  // ["Duke"] — all TITL values
    familiesAsSpouse, // ["@F4@"] — families where person is a spouse
    familiesAsChild,  // ["@F469@"] — family where person is a child
    events           // [{type, date, place}, ...] — all events including RESI (residence)
}
```

#### GedcomFamily Properties

```javascript
{
    id,              // "@F4@"
    husbandId,       // "@I37@"
    wifeId,          // "@I39@"
    childrenIds,     // ["@I46@", "@I47@", ...]
    marriageDate,    // "26 NOV 1894"
    marriagePlace,   // "Winter Palace"
    divorceDate,     // (may be undefined)
    divorcePlace,
    events           // [{type: 'MARR', date, place}, ...] — all family events
}
```

#### Navigation — usage patterns

```javascript
// Get a person
const person = ged.service.getIndividual('@I42@');

// Parents and siblings
const fm = ged.service.getFamilyMembers(person.id);
const father = fm.father;
const mother = fm.mother;
const siblings = fm.siblings;

// Spouse(s) and children
const spouses = fm.spouses;
const children = fm.children;

// Birth family (parents)
const birthFamId = person.familiesAsChild?.[0];
const birthFam = ged.service.getFamily(birthFamId);

// Spouse family
const spouseFamId = person.familiesAsSpouse?.[0];
const spouseFam = ged.service.getFamily(spouseFamId);

// Person events
for (const event of person.events) {
    console.log(event.type, ged.formatDate(event.date), event.place);
}

// Formatting dates
const birthDate = ged.formatDate(person.birthDate);  // "January 1, 1895"
const deathDate = ged.formatDate(person.deathDate);  // "July 17, 1918"
const lifespan = `${birthDate} — ${deathDate}`;

// Markdown rendering (bold, italic, links, tables)
ged.renderMarkdown(`## ${person.name}
Born **${birthDate}**, died **${deathDate}**.`, ged.container);
```

#### Nicholas I's account about his parents

```ged-js
const person = ged.service.getIndividual('@I42@');
const fm = ged.service.getFamilyMembers(person.id);

const pName = person.name;
const pBirth = ged.formatDate(person.birthDate);

ged.renderMarkdown(`## My Parents

I am **${pName}**, born in **${pBirth}**.

My father — **${fm.father?.name || 'unknown'}** (${ged.formatDate(fm.father?.birthDate)}).
My mother — **${fm.mother?.name || 'unknown'}** (${ged.formatDate(fm.mother?.birthDate)}).`, ged.container);
```

#### Nicholas II's children — table

```ged-js
const tsar = ged.service.getIndividual('@I37@');
const fm = ged.service.getFamilyMembers(tsar.id);

ged.header(2, `Children of ${tsar.name}`);

const headers = ['#', 'Name', 'Birth Date', 'Sex'];
const rows = [];

let i = 1;
for (const child of fm.children) {
    const sexLabel = child.sex === 'M' ? 'M' : 'F';
    rows.push([
        String(i++),
        child.name,
        ged.formatDate(child.birthDate) || '—',
        sexLabel
    ]);
}

ged.table(headers, rows);
ged.paragraph(`\nTotal children: ${rows.length}`);
```

## Research Dashboard (ged-research)

### ged-research

> A **research dashboard** that automatically detects frontier ancestors — persons at the edge of your known family tree (no parents recorded). For each frontier person it estimates their life period, suggests relevant historical sources, and calculates research difficulty.

> ⚠️ **Note:** only persons without recorded parents are shown — regardless of whether they are direct ancestors or not.

*An empty block can also be inserted via the "GEDCOM: Insert ged-research block" command (Ctrl+P)*

**Syntax:** the block requires no arguments — it scans the entire GEDCOM automatically.

````markdown
```ged-research
```
````

#### Minimal — show all frontier ancestors

```ged-research
```

---

### How it works

**Frontier detection:** any person whose `familiesAsChild` is empty (no parents in the GEDCOM file).

**Life range estimation** — the plugin combines all available data simultaneously:
1. Direct `birthDate` / `deathDate` fields → exact
2. Dated events → constrain birth/death as upper/lower bounds
3. Children's birth dates + **reproductive age settings** → birth no later than `firstChild − minReproAge`; birth no earlier than `lastKnownAlive − maxLifespan`

**Source suggestions** — driven by a configurable **YAML rules file** (set in *Heuristics & Research* settings). Each rule specifies a condition and a suggested source name. Conditions support: place matching, date ranges, sex, logical combinators. See [[#ged-heur]] for the YAML format.

**Research statuses** — each suggested source has a clickable status badge:

| Status | Emoji | Meaning |
|--------|-------|---------|
| Idea | 💡 | Default — not checked yet |
| Archive case found | 📂 | Found the archival reference |
| In progress | 🔍 | Actively researching |
| Researched — found | ✅ | Relevant data found |
| Researched — not found | ➖ | Checked, nothing relevant |
| Document lost | ⛔ | Source is destroyed/unavailable |

**Left-click** a source to advance the status, **right-click** to go back. Statuses are stored globally in `data.json` — the same person's sources show the same status in both `ged-research` and `ged-heur`.

---

### UI Features

| Feature | Description |
|---------|-------------|
| **Root person** | Set a starting ancestor — only their direct line is shown |
| **"Sources" column** | Count of suggested sources in active statuses 💡📂🔍 |
| **Sort** | By source count (default), Name, or Life Range |
| **Filters (row 1)** | 📌 Pinned only · ⛔ Hide ignored |
| **Filters (row 2)** | Sources: All / Has / None |
| **Filters (row 3)** | Place: All / No place / Has place |
| **Filters (row 4)** | Period: All / No period / Estimated ~ / Has exact |
| **Click row** | Expand research card with details |
| **📌 button** | Pin/unpin a person (stays at top) |

### Expandable Research Card

Clicking a row opens a panel showing:
- Person summary (name, life range, first event, ID)
- **Spouse(s)** (name, life years)
- **Blood descendant** — direct child linking this person to the ROOT
- Suggested historical sources with clickable status badges (LMB / RMB to cycle)
- Flags: **Pinned**, **Ignored**
- Research note link (with vault autocomplete)

### Persistent State

The block stores only **view UI state** (sort, filters, root, expanded cards):

```ged-research
[ui]
sort=sources:desc
root=I1
```

Available keys:

| Key | Values | Default |
|-----|--------|---------|
| `sort=field:dir` | `sources`, `name`, `lifeRange` · `asc`/`desc` | `sources:desc` |
| `root=I1` | raw ID without @ | — |
| `hide_ignored=false` | `true`/`false` | `true` |
| `pinned_only=true` | `true`/`false` | `false` |
| `place_filter=no-place` | `all` / `no-place` / `has-place` | `all` |
| `period_filter=estimated` | `all` / `no-period` / `estimated` / `has-exact` | `all` |
| `source_filter=has-sources` | `all` / `has-sources` / `no-sources` | `all` |
| `expanded=I23,I45` | comma-separated raw IDs | — |

**Flags and research note links** are stored **globally** in the plugin's `data.json` — the same data is shared across all `ged-research` blocks and the sidebar panel. All state is keyed to GEDCOM IDs — renaming a person does not break saved data.

---

## Source Suggestions (ged-heur)

### ged-heur

> Displays **heuristic source suggestions** for a single person. Evaluates all configured YAML rules against that person's place, dates, and sex — and shows a list of relevant sources with clickable research statuses.

> ⚠️ **Note:** requires a heuristics rules file configured in *Settings → Heuristics & Research*.

*An empty block can also be inserted via the "GEDCOM: Insert ged-heur block" command (Ctrl+P), or via the **+** button in [[#GEDCOM Search View]]*

**Syntax:** single person ID (same format as other blocks).

```ged-heur
@I37@
```

**Status cycling:** left-click a source → advance (💡→📂→🔍→✅→➖→⛔→💡), right-click → retreat. Statuses are shared with `ged-research` — the same person's source shows the same status everywhere.

---

### YAML Rules Format

The rules file is a YAML document with a top-level `rules` list. Each rule has a `when` condition and either a `source` (leaf) or nested `rules` (subtree evaluated only if parent condition is true).

```yaml
rules:
  - when:
      place_includes_any: ['Россия', 'Russia', 'СССР']
    rules:
      - when:
          alive_in: 1858
        source: "10-я ревизия (1858)"
      - when:
          born_before: 1897
        source: "I Всероссийская перепись (1897)"
      - when:
          all:
            - sex: M
            - born_before: 1917
        source: "Рекрутские наборы"
  - when:
      place_includes: 'Germany'
    rules:
      - when:
          alive_in: 1867
        source: "Prussian census 1867"
```

**Available conditions:**

| Condition | Value | Meaning |
|-----------|-------|---------|
| `always` | `true/false` | Always matches (or never) — use `true` for unconditional rules inside a parent block |
| `place_includes` | `'string'` | Any place field contains substring (case-insensitive) |
| `place_includes_any` | `['a','b']` | Any place contains any of the strings |
| `birth_place_includes` | `'string'` | Birth place specifically |
| `death_place_includes` | `'string'` | Death place specifically |
| `born_before` | `1900` | Estimated birth year < value |
| `born_after` | `1700` | Estimated birth year > value |
| `born_between` | `[1800,1900]` | Birth year in range |
| `died_before` | `1950` | Estimated death year < value |
| `died_after` | `1800` | Estimated death year > value |
| `alive_in` | `1858` | Life range overlaps this year |
| `alive_in_range` | `[1914,1918]` | Life range overlaps this period |
| `sex` | `M` or `F` | Person's sex |
| `has_dates` | `true/false` | Has at least one estimated date |
| `has_birth_place` | `true/false` | Birth place is set |
| `occu_include` | `'string'` | Any OCCU value contains substring (case-insensitive) |
| `has_occu` | `true/false` | OCCU (occupation) field is populated |
| `title_include` | `'string'` | Any TITL value contains substring (case-insensitive) |
| `has_title` | `true/false` | TITL (nobility title) field is populated |
| `alive_at_in_range` | `[start,end,'string']` | An event exists with date in [start,end] AND place containing substring |
| `place_regex` | `'/pattern/i'` | Any place matches regex |
| `birth_place_regex` | `'/pattern/i'` | Birth place only |
| `death_place_regex` | `'/pattern/i'` | Death place only |
| `occu_regex` | `'/pattern/i'` | Any OCCU value matches regex |
| `title_regex` | `'/pattern/i'` | Any TITL value matches regex |
| `all` | `[condition,...]` | All conditions (AND) |
| `any` | `[condition,...]` | Any condition (OR) |
| `not` | `condition` | Negate |

> **Regex in YAML:** `/pattern/` and `/pattern/i` work unquoted, single-quoted, or double-quoted. Quotes are only required if the pattern contains `: ` or `#`.

**Create default template:** *Settings → Heuristics & Research → Heuristics rules file → Create template* — generates a pre-filled Russia rules file with an estate-based branching (nobility / clergy / merchants / townspeople / Cossacks / peasants by OCCU/TITL).

---

## Debugging

> **Tip:** Enable [[#Debug Logging]] in plugin settings and open **View → Toggle Developer Tools** — plugin logs are output to the Console tab. This is useful for tracking down parse errors, diagram issues, or incorrect block rendering.

## Troubleshooting

### Block doesn't render / shows "GEDCOM data not loaded"

**Cause:** GEDCOM file is not loaded.

**Solution:**
1. Open **Settings → GEDCOM Genealogy**
2. Check **GEDCOM file path** — must be relative to the vault root
3. Make sure the `.ged` file is inside the vault (not outside)
4. Restart Obsidian

### Diagram is slow / freezes

**Cause:** too many persons for the given `LVL`.

**Solution:**
1. Reduce `LVL` to `1` or `2`:
   ```
   LVL:1
   @I37@
   ```
2. Especially critical for [[#ged-diagram-hourglass]] and [[#ged-diagram-relatives]]
3. Reduce [[#Default Diagram Generations]] in settings

### ged-js blocks don't work

**Cause:** the feature is disabled in settings (default).

**Solution:**
1. Open **Settings → GEDCOM Genealogy**
2. Enable [[#ged-js Blocks]]
3. Restart Obsidian

### "Chronos plugin not found" error in ged-chronos

**Cause:** Chronos Timeline plugin is not installed.

**Solution:**
1. Install the [Chronos](https://github.com/clairefro/obsidian-plugin-chronos) plugin via Community plugins
2. Enable it in settings
3. Restart Obsidian

### File won't parse / "Probably not a Gedcom file"

**Cause:** file is corrupted or in the wrong encoding.

**Solution:**
1. Make sure the file is in GEDCOM 5.5 / 5.5.1 format
2. Check encoding — **UTF-8** is recommended
3. Try re-exporting from your genealogy program

