# GED Viewer Plugin for Obsidian

This plugin allows you to integrate genealogical data from GEDCOM files directly into your Obsidian notes. Display personal information, family relationships, and life events from your genealogy research in a structured format.

## Features

- Load and parse GEDCOM (.ged) files from your vault
- Display personal information in tables using `gedcom-person` code blocks
- Show family relationships with `gedcom-family` code blocks
- List life events with `gedcom-events` code blocks
- Compare multiple individuals side-by-side in comparison tables
- Access all persons from your GEDCOM files through a searchable command

## Installation

### Option 1: BRAT (Beta Reviewers)
1. Install the [BRAT](https://github.com/TfTHacker/obsidian42-brat) plugin
2. In BRAT settings, click "Add Beta plugin"
3. Enter the repository URL: `https://github.com/geneology-code/obsidian-ged-viewer`
4. Enable "GED Viewer" in Obsidian community plugins

### Option 2: Manual Installation
1. Download the plugin files to your Obsidian vault's `.obsidian/plugins/` directory
2. Enable the plugin in Obsidian settings
3. Configure the path to your .ged file(s) in the plugin settings

## Configuration

In the plugin settings, specify the path to your GEDCOM file(s):

- For a single file: `path/to/my-family.ged`
- For multiple files: `path/to/file1.ged, path/to/file2.ged` or `path/to/file1.ged path/to/file2.ged`
- You can also assign aliases: `path/to/file1.ged::My Family Tree`

Enable "Reload on startup" to automatically load your GEDCOM data when Obsidian starts.

### Settings

| Setting | Description | Default |
|---------|-------------|---------|
| GEDCOM file path | Path to your .ged file(s) | (empty) |
| Максимальный предположительный период жизни (лет) | Maximum age for persons without death event. Limits the timeline period to prevent showing persons as alive indefinitely. | 100 |

**Why the lifespan setting matters:**

When a person has a birth date but no death date, the plugin limits their timeline to the configured maximum lifespan. For example:
- Born in 1920, no death date, max lifespan 100 → timeline shows `1920–2020`
- Born in 2020, no death date, max lifespan 100 → timeline shows `2020–2026` (current year)
- Born in 1920, died in 1990 → timeline shows `1920–1990` (actual dates)

## Usage

### Commands

- **Show all persons from GEDCOM**: Opens a searchable modal with all individuals from your loaded GEDCOM files
- **Reload GEDCOM data**: Manually reloads the GEDCOM data from the configured file(s)

### GEDCOM Search View

Click the search icon in the left ribbon to open the GEDCOM Search panel in the right sidebar.

**Features:**
- **Case-insensitive search** by default
- **Regex support** - check the "Regex" box to use regular expressions
- **Search across all fields** - name, ID, birth/death dates and places
- **Double-click to copy** - double-click any person to copy their `@ID@` to clipboard
- **Sortable columns** - click on column headers (ID, Name, Life Dates) to sort
- **Normalized date display** - dates shown in readable `DD.MM.YYYY` format
- **Tooltips on hover** - hover over life dates to see full birth/death information with places

**How to use:**
1. Click the search icon (🔍) in the left ribbon
2. The search panel opens in the right sidebar
3. Type your search query
4. Toggle "Regex" for regular expression search
5. Click column headers to sort results
6. Hover over dates to see detailed information (birth/death dates and places)
7. Double-click a person to copy their ID

### Code Blocks

#### Personal Information (`gedcom-person`)

Display personal details for one or more individuals:

````markdown
```gedcom-person
@I1@
```
````

For comparison between multiple individuals:

````markdown
```gedcom-person
@I1@ @I2@
```
````

#### Family Relationships (`gedcom-family`)

Show family information for one or more individuals:

````markdown
```gedcom-family
@I1@
```
````

For comparison between multiple individuals:

````markdown
```gedcom-family
@I1@ @I2@
```
````

#### Life Events (`gedcom-events`)

Display life events for one or more individuals:

````markdown
```gedcom-events
@I1@
```
````

For comparison between multiple individuals:

````markdown
```gedcom-events
@I1@ @I2@
```
````

#### Timeline Integration (`ged-chronos`)

Create interactive timelines using the [Chronos Timeline](https://github.com/obsidian-plugin-chronos/obsidian-plugin-chronos) plugin. This block expands GEDCOM person/family references into timeline events.

**Syntax:**

- `gci: @IX@` — expand events for individual X
- `gcf: @FX@` — expand events for family X
- Direct timeline events in Chronos format

````markdown
```ged-chronos
gci: @I1@
gcf: @F1@
- [1900~1970] French Revolution
```
````

**How it works:**

1. The `ged-chronos` block parses GEDCOM directives (`gci:`/`gcf:`)
2. Extracts birth, death, marriage, and other life events from your GEDCOM data
3. Calls the Chronos Timeline plugin's internal `_renderChronosBlock` method directly
4. The timeline is rendered with full Chronos features (zoom, pan, width toggle)

**Requirements:**

- Chronos Timeline plugin must be installed and enabled
- GEDCOM data must be loaded (configured in plugin settings)

**Architecture:**

```
ged-chronos block
    ↓ expandDSLToLines()
Chronos DSL (gci/gcf → events)
    ↓ chronosPlugin._renderChronosBlock()
Chronos Timeline UI
```

This direct integration ensures the timeline button (toggle width) and all Chronos features work correctly.

## How It Works

The plugin uses the [read-gedcom](https://github.com/arbre-app/read-gedcom) library to parse GEDCOM files and extract genealogical information. All data processing happens locally in your Obsidian vault - no external services are used.

## Development

To build the plugin:

```bash
npm run build
```

To develop in watch mode:

```bash
npm run dev
```

## License

MIT