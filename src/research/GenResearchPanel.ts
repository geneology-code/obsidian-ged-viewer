import { App, AbstractInputSuggest, TFile } from 'obsidian';
import { GedcomService } from '../gedcom/service';
import { GedcomEvent, GedcomIndividual } from '../gedcom/types';
import { detectFrontierAncestors } from './frontierDetector';
import { estimateLifeRange, parseYear } from './lifeRangeEstimator';
import { matchSources, loadRules } from './heuristics';
import { Rule } from './heuristics/types';
import { SOURCE_STATUSES, SourceStatus } from './types';
import { ReproductiveAge, DEFAULT_REPRODUCTIVE_AGE } from '../types/settings';
import { estimateDifficulty } from './difficultyEstimator';
import { serializeOverlay } from './overlayParser';
import {
    FrontierPerson, OverlayState, PersonFlag, LifeRange,
    SortField, SortDir, DEFAULT_UI_STATE, DifficultyCategory
} from './types';
import { t } from '../i18n';

const STYLES_ID = 'gen-research-styles';

const CSS = `
.gen-research-controls { display: flex; gap: 8px; margin-bottom: 6px; align-items: center; flex-wrap: wrap; font-size: 0.85em; }
.gen-research-filter-label { cursor: pointer; user-select: none; }
.gen-research-summary { font-size: 0.82em; color: var(--text-muted); margin: 0 0 6px 0; }
.gen-research-table { width: 100%; border-collapse: collapse; font-size: 0.9em; }
.gen-research-table td { padding: 4px 8px; border-bottom: 1px solid var(--background-modifier-border-hover); }
.gen-research-th { padding: 4px 8px; border-bottom: 1px solid var(--background-modifier-border); font-size: 0.85em; color: var(--text-muted); text-align: left; }
.gen-research-th-sort { cursor: pointer; user-select: none; white-space: nowrap; }
.gen-research-th-sort:hover { color: var(--text-normal); }
.gen-research-th-active { color: var(--interactive-accent); }
.gen-research-row { cursor: pointer; }
.gen-research-row:hover td { background: var(--background-modifier-hover); }
.gen-research-pinned td:first-child::before { content: "📌 "; }
.gen-research-diff { padding: 1px 6px; border-radius: 3px; font-size: 0.8em; font-weight: bold; }
.gen-research-diff-green { background: #2d6a4f; color: #fff; }
.gen-research-diff-yellow { background: #b58900; color: #fff; }
.gen-research-diff-red { background: #c62828; color: #fff; }
.gen-research-card-row td { padding: 0; }
.gen-research-card { padding: 10px 14px; background: var(--background-secondary); border-radius: 4px; margin: 2px 0 6px; }
.gen-research-card-summary { margin-bottom: 8px; font-size: 0.9em; }
.gen-research-card-section { margin: 6px 0; font-size: 0.88em; }
.gen-research-card-section ul { margin: 4px 0 0 16px; padding: 0; }
.gen-research-card-section li { margin: 2px 0; }
.gen-research-flag-label { margin-right: 10px; cursor: pointer; }
.gen-research-note-row { display: flex; gap: 4px; align-items: center; margin-top: 4px; }
.gen-research-note-input { flex: 1; padding: 3px 6px; background: var(--background-primary); border: 1px solid var(--background-modifier-border); border-radius: 3px; color: var(--text-normal); font-size: 0.85em; min-width: 0; }
.gen-research-note-open { padding: 2px 8px; cursor: pointer; white-space: nowrap; font-size: 0.85em; }
.gen-research-note-open:disabled { opacity: 0.35; cursor: default; }
.gen-research-suggest-name { font-size: 0.9em; line-height: 1.3; }
.gen-research-suggest-path { display: block; font-size: 0.75em; color: var(--text-muted); }
.gen-research-pin-btn { opacity: 0.35; background: none; border: none; cursor: pointer; padding: 0; font-size: 1em; line-height: 1; }
.gen-research-pin-btn.pinned { opacity: 1; }
.gen-research-assess-select { margin-left: 6px; font-size: 0.85em; padding: 2px 4px; background: var(--background-primary); border: 1px solid var(--background-modifier-border); border-radius: 3px; color: var(--text-normal); }
.gen-research-root-row { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; font-size: 0.85em; }
.gen-research-root-label { white-space: nowrap; color: var(--text-muted); }
.gen-research-root-input { flex: 1; max-width: 260px; padding: 3px 6px; background: var(--background-primary); border: 1px solid var(--background-modifier-border); border-radius: 3px; color: var(--text-normal); font-size: 0.85em; }
.gen-research-warning { color: var(--text-warning, #e8a600); font-size: 0.82em; margin: 0 0 6px 0; }
.gen-research-root-error { color: var(--color-red, #c62828); font-size: 0.8em; }
`;

class NoteSuggest extends AbstractInputSuggest<TFile> {
    private readonly el: HTMLInputElement;

    constructor(app: App, inputEl: HTMLInputElement) {
        super(app, inputEl);
        this.el = inputEl;
    }

    getSuggestions(query: string): TFile[] {
        const lq = query.toLowerCase();
        if (!lq) return [];
        return this.app.vault.getMarkdownFiles()
            .filter(f => f.basename.toLowerCase().includes(lq) || f.path.toLowerCase().includes(lq))
            .sort((a, b) => {
                const aName = a.basename.toLowerCase().includes(lq);
                const bName = b.basename.toLowerCase().includes(lq);
                if (aName && !bName) return -1;
                if (!aName && bName) return 1;
                return a.path.localeCompare(b.path);
            })
            .slice(0, 15);
    }

    renderSuggestion(file: TFile, el: HTMLElement): void {
        el.createEl('div', { text: file.basename, cls: 'gen-research-suggest-name' });
        if (file.parent && file.parent.path !== '/') {
            el.createEl('small', { text: file.parent.path, cls: 'gen-research-suggest-path' });
        }
    }

    selectSuggestion(file: TFile, _evt: MouseEvent | KeyboardEvent): void {
        this.el.value = file.path;
        this.el.dispatchEvent(new Event('input'));
        this.close();
    }
}

class PersonSuggest extends AbstractInputSuggest<GedcomIndividual> {
    private readonly el: HTMLInputElement;
    private readonly service: GedcomService;

    constructor(app: App, inputEl: HTMLInputElement, service: GedcomService) {
        super(app, inputEl);
        this.el = inputEl;
        this.service = service;
    }

    getSuggestions(query: string): GedcomIndividual[] {
        const lq = query.toLowerCase();
        if (!lq) return [];
        return this.service.getAllIndividuals()
            .filter(p => (p.name || '').toLowerCase().includes(lq) || p.id.toLowerCase().includes(lq))
            .slice(0, 20);
    }

    renderSuggestion(p: GedcomIndividual, el: HTMLElement): void {
        el.createEl('div', { text: p.name || p.id, cls: 'gen-research-suggest-name' });
        el.createEl('small', { text: p.id, cls: 'gen-research-suggest-path' });
    }

    selectSuggestion(p: GedcomIndividual, _evt: MouseEvent | KeyboardEvent): void {
        this.el.value = p.name || p.id;
        this.el.dispatchEvent(new Event('input'));
        // Store raw ID as data attribute so blur handler can read it
        this.el.dataset.selectedId = p.id.replace(/@/g, '');
        this.close();
    }
}

export interface GenResearchPanelOptions {
    container: HTMLElement;
    gedcomService: GedcomService;
    maxLifespanYears: number;
    heuristicsFilePath: string;
    reproductiveAge?: ReproductiveAge;
    app: App;
    getSourceStatus: (personId: string, sourceName: string) => SourceStatus;
    setSourceStatus: (personId: string, sourceName: string, status: SourceStatus) => Promise<void>;
    getStatusEmoji: (status: SourceStatus) => string;
    /** Called when persistent state (flags, note links) changes. */
    onSave: (overlay: OverlayState) => Promise<void>;
    sourcePath?: string;
}

export class GenResearchPanel {
    private readonly container: HTMLElement;
    private readonly gedcomService: GedcomService;
    private readonly maxLifespanYears: number;
    private readonly heuristicsFilePath: string;
    private readonly reproductiveAge: ReproductiveAge;
    private readonly app: App;
    private readonly getSourceStatus: (personId: string, sourceName: string) => SourceStatus;
    private readonly setSourceStatus: (personId: string, sourceName: string, status: SourceStatus) => Promise<void>;
    private readonly getStatusEmoji: (status: SourceStatus) => string;
    private readonly onSave: (overlay: OverlayState) => Promise<void>;
    private readonly sourcePath: string;

    private sortField: SortField = DEFAULT_UI_STATE.sortField;
    private sortDir: SortDir = DEFAULT_UI_STATE.sortDir;
    private filterHideIgnored = DEFAULT_UI_STATE.hideIgnored;
    private filterPinned = DEFAULT_UI_STATE.pinnedOnly;
    private filterNoPlace = DEFAULT_UI_STATE.noPlaceOnly;
    private expandedIds = new Set<string>();
    private rootId: string = '';
    private uiInitialized = false;
    private lastOverlay: OverlayState = { ui: { ...DEFAULT_UI_STATE, expandedIds: [] }, persons: {} };
    private rules: Rule[] | null = null;

    constructor(options: GenResearchPanelOptions) {
        this.container = options.container;
        this.gedcomService = options.gedcomService;
        this.maxLifespanYears = options.maxLifespanYears;
        this.heuristicsFilePath = options.heuristicsFilePath;
        this.reproductiveAge = options.reproductiveAge ?? DEFAULT_REPRODUCTIVE_AGE;
        this.app = options.app;
        this.getSourceStatus = options.getSourceStatus;
        this.setSourceStatus = options.setSourceStatus;
        this.getStatusEmoji = options.getStatusEmoji;
        this.onSave = options.onSave;
        this.sourcePath = options.sourcePath ?? '';
    }

    /** Fresh render — reads UI state from overlay (first time only). */
    render(overlay: OverlayState): void {
        if (!this.uiInitialized) {
            this.sortField = overlay.ui.sortField;
            this.sortDir = overlay.ui.sortDir;
            this.filterHideIgnored = overlay.ui.hideIgnored;
            this.filterPinned = overlay.ui.pinnedOnly;
            this.filterNoPlace = overlay.ui.noPlaceOnly;
            this.expandedIds = new Set(overlay.ui.expandedIds.map(id => `@${id}@`));
            // Use saved rootId; auto-detect from GEDCOM is done lazily in renderContent()
            this.rootId = overlay.ui.rootId ?? '';
            this.uiInitialized = true;
        }
        this.lastOverlay = overlay;
        this.container.empty();
        this.renderContent(overlay);
    }

    /** Re-render preserving current in-memory UI state (e.g. on GEDCOM reload). */
    rerender(overlay: OverlayState): void {
        this.rules = null; // force reload from vault on next render
        this.lastOverlay = overlay;
        this.container.empty();
        this.renderContent(overlay);
    }

    private rerenderCurrent(): void {
        this.container.empty();
        this.renderContent(this.lastOverlay);
    }

    /** Update lastOverlay, rerender immediately, then persist. Use for ALL state-mutating actions. */
    private async saveAndRerender(persons: OverlayState['persons']): Promise<void> {
        const newOverlay = this.buildCurrentOverlay(persons);
        this.lastOverlay = newOverlay;   // must happen before rerenderCurrent
        this.rerenderCurrent();
        await this.onSave(newOverlay);
    }

    private async rerenderAndSave(): Promise<void> {
        await this.saveAndRerender(this.lastOverlay.persons);
    }

    private buildCurrentOverlay(persons: OverlayState['persons']): OverlayState {
        return {
            ui: {
                sortField: this.sortField,
                sortDir: this.sortDir,
                hideIgnored: this.filterHideIgnored,
                pinnedOnly: this.filterPinned,
                noPlaceOnly: this.filterNoPlace,
                expandedIds: [...this.expandedIds].map(id => id.replace(/@/g, '')),
                rootId: this.rootId || undefined,
            },
            persons,
        };
    }

    private buildPersonData(overlay: OverlayState, rules: Rule[]): FrontierPerson[] {
        const frontierIndividuals = detectFrontierAncestors(this.gedcomService, this.rootId || undefined)
            .filter((p): p is NonNullable<typeof p> => p != null);

        return frontierIndividuals.map(individual => {
            const lifeRange = estimateLifeRange(individual, this.gedcomService, this.maxLifespanYears, this.reproductiveAge);

            const hasPlace = !!(
                individual.birthPlace ||
                individual.deathPlace ||
                (individual.events || []).some(e => e.place)
            );

            const allDatedEvents: GedcomEvent[] = [];
            if (individual.birthDate) allDatedEvents.push({ type: 'BIRT', date: individual.birthDate, place: individual.birthPlace });
            if (individual.deathDate) allDatedEvents.push({ type: 'DEAT', date: individual.deathDate, place: individual.deathPlace });
            for (const ev of individual.events || []) {
                if (ev.date) allDatedEvents.push(ev);
            }
            const firstEvent = allDatedEvents.length > 0
                ? allDatedEvents.reduce((earliest, ev) =>
                    (parseYear(ev.date) ?? Infinity) < (parseYear(earliest.date) ?? Infinity) ? ev : earliest
                  )
                : null;

            const sources = matchSources(individual, lifeRange, rules);
            const rawId = individual.id.replace(/@/g, '');
            const override = overlay.persons[rawId];
            const difficulty = estimateDifficulty(lifeRange, sources, hasPlace, override);

            return { individual, lifeRange, hasPlace, firstEvent, sources, difficulty, override };
        });
    }

    private renderContent(overlay: OverlayState): void {
        this.ensureStyles();

        if (!this.gedcomService.getIsDataLoaded()) {
            this.container.createEl('p', { text: t('research.noData') });
            return;
        }

        // Lazy load heuristics rules; rerender when ready
        if (this.rules === null) {
            this.rules = []; // prevent re-triggering while loading
            if (this.heuristicsFilePath) {
                void loadRules(this.app, this.heuristicsFilePath).then(r => {
                    this.rules = r;
                    this.rerenderCurrent();
                });
            }
        }

        // Lazy auto-detect: if no root saved yet, pick first person in file and persist
        if (!this.rootId) {
            const first = this.gedcomService.getAllIndividuals()[0];
            if (first) {
                this.rootId = first.id.replace(/@/g, '');
                void this.rerenderAndSave();
                return;
            }
        }

        // Root person selector
        const rootRow = this.container.createDiv({ cls: 'gen-research-root-row' });
        rootRow.createEl('span', { text: t('research.rootLabel'), cls: 'gen-research-root-label' });
        const rootInput = rootRow.createEl('input', { cls: 'gen-research-root-input' });
        rootInput.type = 'text';
        rootInput.placeholder = t('research.rootPlaceholder');

        // Show name at render time; mark invalid if ID not found
        const currentRoot = this.rootId ? this.gedcomService.getIndividual(this.rootId) : null;
        if (this.rootId && !currentRoot) {
            rootInput.value = this.rootId;
            rootInput.style.borderColor = 'var(--color-red, #c62828)';
            rootRow.createEl('span', { text: t('research.rootNotFound'), cls: 'gen-research-root-error' });
        } else {
            rootInput.value = currentRoot?.name || this.rootId;
        }

        new PersonSuggest(this.app, rootInput, this.gedcomService);
        rootInput.addEventListener('blur', async () => {
            // If suggest just set a data-selected-id, use that
            const selectedId = rootInput.dataset.selectedId;
            if (selectedId) {
                delete rootInput.dataset.selectedId;
                if (selectedId !== this.rootId) {
                    this.rootId = selectedId;
                    await this.rerenderAndSave();
                }
                return;
            }
            // Manual input: try as ID first, then exact name match
            const val = rootInput.value.trim();
            if (!val) {
                if (this.rootId) { this.rootId = ''; await this.rerenderAndSave(); }
                return;
            }
            const byId = this.gedcomService.getIndividual(val.replace(/@/g, ''));
            if (byId) {
                const newId = byId.id.replace(/@/g, '');
                if (newId !== this.rootId) { this.rootId = newId; await this.rerenderAndSave(); }
                return;
            }
            const byName = this.gedcomService.getAllIndividuals()
                .find(p => (p.name || '').toLowerCase() === val.toLowerCase());
            if (byName) {
                const newId = byName.id.replace(/@/g, '');
                if (newId !== this.rootId) { this.rootId = newId; await this.rerenderAndSave(); }
                return;
            }
            // Not found — store as-is so error state renders
            this.rootId = val.replace(/@/g, '');
            await this.rerenderAndSave();
        });

        if (!this.rootId) {
            this.container.createEl('p', { text: t('research.noRootWarning'), cls: 'gen-research-warning' });
        }

        const persons = this.buildPersonData(overlay, this.rules ?? []);

        const controls = this.container.createDiv({ cls: 'gen-research-controls' });
        this.addFilterCheckbox(controls, t('research.filterPinned'), this.filterPinned, v => {
            this.filterPinned = v;
            this.rerenderAndSave();
        });
        this.addFilterCheckbox(controls, t('research.filterNoPlace'), this.filterNoPlace, v => {
            this.filterNoPlace = v;
            this.rerenderAndSave();
        });
        this.addFilterCheckbox(controls, t('research.filterHideIgnored'), this.filterHideIgnored, v => {
            this.filterHideIgnored = v;
            this.rerenderAndSave();
        });

        const sorted = this.sortAndFilter(persons);

        this.container.createEl('p', {
            cls: 'gen-research-summary',
            text: t('research.summary', { total: persons.length, shown: sorted.length })
        });

        if (sorted.length === 0) {
            this.container.createEl('p', { text: t('research.noResults') });
            return;
        }

        const table = this.container.createEl('table', { cls: 'gen-research-table' });
        const headerRow = table.createEl('thead').createEl('tr');

        const cols: Array<{ label: string; field: SortField | null }> = [
            { label: t('research.colPerson'), field: 'name' },
            { label: t('research.colLifeRange'), field: 'lifeRange' },
            { label: t('research.colFirstEvent'), field: null },
            { label: t('research.colPlace'), field: null },
            { label: t('research.colDifficulty'), field: 'difficulty' },
            { label: '', field: null },
        ];

        for (const col of cols) {
            const th = headerRow.createEl('th', { cls: 'gen-research-th' });
            if (col.field) {
                th.addClass('gen-research-th-sort');
                if (this.sortField === col.field) th.addClass('gen-research-th-active');
                th.setText(col.label + (this.sortField === col.field ? (this.sortDir === 'desc' ? ' ▼' : ' ▲') : ' ↕'));
                th.addEventListener('click', () => {
                    if (this.sortField === col.field) {
                        this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
                    } else {
                        this.sortField = col.field!;
                        this.sortDir = 'desc';
                    }
                    this.rerenderAndSave();
                });
            } else {
                th.setText(col.label);
            }
        }

        const tbody = table.createEl('tbody');
        for (const fp of sorted) {
            this.renderRow(tbody, fp, overlay);
            if (this.expandedIds.has(fp.individual.id)) {
                this.renderExpandedCard(tbody, fp, overlay);
            }
        }
    }

    private renderRow(tbody: HTMLElement, fp: FrontierPerson, overlay: OverlayState): void {
        const rawId = fp.individual.id.replace(/@/g, '');
        const isPinned = fp.override?.flags?.has('pinned') ?? false;

        const row = tbody.createEl('tr', { cls: 'gen-research-row' + (isPinned ? ' gen-research-pinned' : '') });

        row.createEl('td', { text: fp.individual.name || fp.individual.id });
        row.createEl('td', { text: this.formatLifeRange(fp.lifeRange) });
        row.createEl('td', {
            text: fp.firstEvent
                ? `${fp.firstEvent.type}${fp.firstEvent.date ? ' ' + fp.firstEvent.date : ''}`
                : '—'
        });
        row.createEl('td', {
            text: fp.firstEvent?.place
                || fp.individual.birthPlace
                || fp.individual.deathPlace
                || (fp.individual.events || []).find(e => e.place)?.place
                || '—'
        });

        const diffCell = row.createEl('td');
        diffCell.createEl('span', {
            cls: `gen-research-diff gen-research-diff-${fp.difficulty.category}`,
            text: t(`research.diff${fp.difficulty.category === 'green' ? 'Low' : fp.difficulty.category === 'yellow' ? 'Med' : 'High'}`)
        });

        const pinBtn = row.createEl('td').createEl('button', {
            cls: 'gen-research-pin-btn' + (isPinned ? ' pinned' : ''),
            text: '📌',
            attr: { title: isPinned ? t('research.unpin') : t('research.pin') }
        });
        pinBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const newOverlay = this.cloneOverlay(this.lastOverlay);
            if (!newOverlay.persons[rawId]) newOverlay.persons[rawId] = { flags: new Set<PersonFlag>() };
            const flags = newOverlay.persons[rawId].flags;
            if (flags.has('pinned')) flags.delete('pinned'); else flags.add('pinned');
            await this.saveAndRerender(newOverlay.persons);
        });

        row.addEventListener('click', () => {
            if (this.expandedIds.has(fp.individual.id)) this.expandedIds.delete(fp.individual.id);
            else this.expandedIds.add(fp.individual.id);
            this.rerenderCurrent();
        });
    }

    private renderExpandedCard(tbody: HTMLElement, fp: FrontierPerson, overlay: OverlayState): void {
        const rawId = fp.individual.id.replace(/@/g, '');
        const cardCell = tbody.createEl('tr', { cls: 'gen-research-card-row' }).createEl('td');
        cardCell.setAttribute('colspan', '6');
        const card = cardCell.createDiv({ cls: 'gen-research-card' });

        const summary = card.createDiv({ cls: 'gen-research-card-summary' });
        summary.createEl('strong', { text: fp.individual.name || fp.individual.id });
        summary.appendText(` · ${this.formatLifeRange(fp.lifeRange)}`);
        if (fp.firstEvent) summary.appendText(` · ${fp.firstEvent.type}${fp.firstEvent.date ? ' ' + fp.firstEvent.date : ''}`);
        summary.appendText(` · ${fp.individual.id}`);

        const srcDiv = card.createDiv({ cls: 'gen-research-card-section' });
        if (fp.sources.length > 0) {
            srcDiv.createEl('strong', { text: t('research.cardSources') });
            const ul = srcDiv.createEl('ul');
            for (const src of fp.sources) {
                const status = this.getSourceStatus(rawId, src.name);
                const { labelKey } = SOURCE_STATUSES[status];
                const emoji = this.getStatusEmoji(status);
                const li = ul.createEl('li', { cls: 'gen-research-source-item' });
                li.createSpan({ text: emoji + ' ', cls: 'gen-research-source-emoji' });
                li.appendText(src.name);
                li.title = t(labelKey);
                li.style.cursor = 'pointer';
                li.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    await this.setSourceStatus(rawId, src.name, ((status + 1) % 6) as SourceStatus);
                    this.rerenderCurrent();
                });
                li.addEventListener('contextmenu', async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    await this.setSourceStatus(rawId, src.name, ((status + 5) % 6) as SourceStatus);
                    this.rerenderCurrent();
                });
            }
        } else {
            srcDiv.createEl('strong', { text: t('research.cardSources') + ' ' });
            srcDiv.appendText(t('research.cardNoSources'));
        }

        // Assessment dropdown — user's own difficulty override
        const assessDiv = card.createDiv({ cls: 'gen-research-card-section' });
        assessDiv.createEl('strong', { text: t('research.cardAssessment') });
        const assessSelect = assessDiv.createEl('select', { cls: 'gen-research-assess-select' });
        const assessOptions: Array<{ value: string; label: string }> = [
            { value: '',       label: t('research.assessmentAuto') },
            { value: 'green',  label: t('research.assessmentLow') },
            { value: 'yellow', label: t('research.assessmentMed') },
            { value: 'red',    label: t('research.assessmentHigh') },
        ];
        for (const opt of assessOptions) {
            const optEl = assessSelect.createEl('option', { value: opt.value, text: opt.label });
            if ((fp.override?.difficultyOverride ?? '') === opt.value) optEl.selected = true;
        }
        assessSelect.addEventListener('change', async () => {
            const newOverlay = this.cloneOverlay(this.lastOverlay);
            if (!newOverlay.persons[rawId]) {
                newOverlay.persons[rawId] = { flags: new Set<PersonFlag>() };
            }
            const val = assessSelect.value as DifficultyCategory | '';
            newOverlay.persons[rawId].difficultyOverride = val || undefined;
            await this.saveAndRerender(newOverlay.persons);
        });

        const flagsDiv = card.createDiv({ cls: 'gen-research-card-section' });
        flagsDiv.createEl('strong', { text: t('research.cardFlags') });
        const flagDefs: Array<{ flag: PersonFlag; label: string }> = [
            { flag: 'pinned', label: t('research.flagPinned') },
            { flag: 'ignored', label: t('research.flagIgnored') },
        ];
        for (const { flag, label } of flagDefs) {
            const lbl = flagsDiv.createEl('label', { cls: 'gen-research-flag-label' });
            const cb = lbl.createEl('input');
            cb.type = 'checkbox';
            cb.checked = fp.override?.flags?.has(flag) ?? false;
            lbl.appendText(' ' + label);
            cb.addEventListener('change', async () => {
                const newOverlay = this.cloneOverlay(this.lastOverlay);
                if (!newOverlay.persons[rawId]) {
                    newOverlay.persons[rawId] = { flags: new Set<PersonFlag>() };
                } else {
                    newOverlay.persons[rawId] = { ...newOverlay.persons[rawId], flags: new Set(newOverlay.persons[rawId].flags) };
                }
                if (cb.checked) newOverlay.persons[rawId].flags.add(flag);
                else newOverlay.persons[rawId].flags.delete(flag);
                await this.saveAndRerender(newOverlay.persons);
            });
        }

        const noteLinkDiv = card.createDiv({ cls: 'gen-research-card-section' });
        noteLinkDiv.createEl('strong', { text: t('research.cardNoteLink') });
        const noteRow = noteLinkDiv.createDiv({ cls: 'gen-research-note-row' });
        const noteInput = noteRow.createEl('input', { cls: 'gen-research-note-input' });
        noteInput.type = 'text';
        noteInput.value = fp.override?.noteLink || '';
        noteInput.placeholder = t('research.cardNoteLinkPlaceholder');

        new NoteSuggest(this.app, noteInput);

        const openBtn = noteRow.createEl('button', {
            cls: 'gen-research-note-open',
            text: t('research.cardOpenNote'),
            attr: { title: t('research.cardOpenNote') }
        });
        openBtn.disabled = !noteInput.value.trim();

        noteInput.addEventListener('input', () => { openBtn.disabled = !noteInput.value.trim(); });
        openBtn.addEventListener('click', () => {
            const path = noteInput.value.trim();
            if (path) this.app.workspace.openLinkText(path, this.sourcePath);
        });
        noteInput.addEventListener('blur', async () => {
            const current = this.lastOverlay.persons[rawId]?.noteLink || '';
            const next = noteInput.value.trim();
            if (next === current) return;
            const newOverlay = this.cloneOverlay(this.lastOverlay);
            if (!newOverlay.persons[rawId]) {
                newOverlay.persons[rawId] = { flags: new Set<PersonFlag>() };
            } else {
                newOverlay.persons[rawId] = { ...newOverlay.persons[rawId], flags: new Set(newOverlay.persons[rawId].flags) };
            }
            newOverlay.persons[rawId].noteLink = next || undefined;
            await this.saveAndRerender(newOverlay.persons);
        });
    }

    private addFilterCheckbox(parent: HTMLElement, label: string, checked: boolean, onChange: (v: boolean) => void): void {
        const lbl = parent.createEl('label', { cls: 'gen-research-filter-label' });
        const cb = lbl.createEl('input');
        cb.type = 'checkbox';
        cb.checked = checked;
        lbl.appendText(' ' + label);
        cb.addEventListener('change', () => onChange(cb.checked));
    }

    private sortAndFilter(persons: FrontierPerson[]): FrontierPerson[] {
        let result = persons;
        if (this.filterHideIgnored) result = result.filter(fp => !fp.override?.flags?.has('ignored'));
        if (this.filterPinned) result = result.filter(fp => fp.override?.flags?.has('pinned'));
        if (this.filterNoPlace) result = result.filter(fp => !fp.hasPlace);
        const pinned = result.filter(fp => fp.override?.flags?.has('pinned'));
        const rest = result.filter(fp => !fp.override?.flags?.has('pinned'));
        const cmp = this.getComparator();
        pinned.sort(cmp);
        rest.sort(cmp);
        return [...pinned, ...rest];
    }

    private getComparator(): (a: FrontierPerson, b: FrontierPerson) => number {
        const dir = this.sortDir === 'asc' ? 1 : -1;
        switch (this.sortField) {
            case 'difficulty': return (a, b) => dir * (a.difficulty.score - b.difficulty.score);
            case 'name': return (a, b) => dir * (a.individual.surname || a.individual.name || '').localeCompare(b.individual.surname || b.individual.name || '');
            case 'lifeRange': return (a, b) => dir * ((a.lifeRange.from ?? 9999) - (b.lifeRange.from ?? 9999));
        }
    }

    private formatLifeRange(lr: LifeRange): string {
        if (lr.from === null && lr.to === null) return '—';
        const from = lr.from !== null ? String(lr.from) : '?';
        const to = lr.to !== null ? String(lr.to) : '?';
        return lr.confidence === 'estimated' ? `~${from}–${to}` : `${from}–${to}`;
    }

    private cloneOverlay(overlay: OverlayState): OverlayState {
        const persons: OverlayState['persons'] = {};
        for (const [id, ov] of Object.entries(overlay.persons)) {
            persons[id] = { ...ov, flags: new Set(ov.flags) };
        }
        return { ui: { ...overlay.ui, expandedIds: [...overlay.ui.expandedIds] }, persons };
    }

    private ensureStyles(): void {
        if (!document.getElementById(STYLES_ID)) {
            const style = document.head.createEl('style');
            style.id = STYLES_ID;
            style.textContent = CSS;
        }
    }
}

