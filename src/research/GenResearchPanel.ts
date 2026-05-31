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
    FrontierPerson, OverlayState, PersonFlag, PersonOverride, LifeRange,
    SortField, SortDir, PlaceFilter, PeriodFilter, SourceFilter, DEFAULT_UI_STATE, DifficultyCategory
} from './types';
import { t } from '../i18n';

const STYLES_ID = 'gen-research-styles';

const CSS = `
.gen-research-controls-wrap { display: flex; flex-direction: column; gap: 4px; margin-bottom: 6px; }
.gen-research-controls { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; font-size: 0.85em; }
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
.gen-research-filter-group { display: inline-flex; align-items: center; gap: 4px; }
.gen-research-filter-label-text { color: var(--text-muted); white-space: nowrap; font-size: 0.9em; }
.gen-research-seg-group { display: inline-flex; border-radius: 4px; overflow: hidden; border: 1px solid var(--background-modifier-border); }
.gen-research-seg-btn { padding: 2px 8px; cursor: pointer; border: none; border-right: 1px solid var(--background-modifier-border); background: var(--background-primary); color: var(--text-normal); font-size: 0.82em; line-height: 1.6; }
.gen-research-seg-btn:last-child { border-right: none; }
.gen-research-seg-btn.active { background: var(--interactive-accent); color: var(--text-on-accent); }
.gen-research-seg-btn:hover:not(.active) { background: var(--background-modifier-hover); }
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
    getNoteLink: (personId: string) => string;
    saveNoteLink: (personId: string, link: string) => Promise<void>;
    getPersonFlags: (personId: string) => Set<PersonFlag>;
    savePersonFlags: (personId: string, flags: Set<PersonFlag>) => Promise<void>;
    getDifficultyOverride: (personId: string) => DifficultyCategory | undefined;
    saveDifficultyOverride: (personId: string, override: DifficultyCategory | undefined) => Promise<void>;
    /** Called when UI state (sort, filter, root, expanded) changes. */
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
    private readonly getNoteLink: (personId: string) => string;
    private readonly saveNoteLink: (personId: string, link: string) => Promise<void>;
    private readonly getPersonFlags: (personId: string) => Set<PersonFlag>;
    private readonly savePersonFlags: (personId: string, flags: Set<PersonFlag>) => Promise<void>;
    private readonly getDifficultyOverride: (personId: string) => DifficultyCategory | undefined;
    private readonly saveDifficultyOverride: (personId: string, override: DifficultyCategory | undefined) => Promise<void>;
    private readonly onSave: (overlay: OverlayState) => Promise<void>;
    private readonly sourcePath: string;

    private sortField: SortField = DEFAULT_UI_STATE.sortField;
    private sortDir: SortDir = DEFAULT_UI_STATE.sortDir;
    private filterHideIgnored = DEFAULT_UI_STATE.hideIgnored;
    private filterPinned = DEFAULT_UI_STATE.pinnedOnly;
    private filterPlaceFilter: PlaceFilter = DEFAULT_UI_STATE.placeFilter;
    private filterPeriodFilter: PeriodFilter = DEFAULT_UI_STATE.periodFilter;
    private filterSourceFilter: SourceFilter = DEFAULT_UI_STATE.sourceFilter;
    private expandedIds = new Set<string>();
    private rootId: string = '';
    private uiInitialized = false;
    private lastOverlay: OverlayState = { ui: { ...DEFAULT_UI_STATE, expandedIds: [] } };
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
        this.getNoteLink = options.getNoteLink;
        this.saveNoteLink = options.saveNoteLink;
        this.getPersonFlags = options.getPersonFlags;
        this.savePersonFlags = options.savePersonFlags;
        this.getDifficultyOverride = options.getDifficultyOverride;
        this.saveDifficultyOverride = options.saveDifficultyOverride;
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
            this.filterPlaceFilter = overlay.ui.placeFilter;
            this.filterPeriodFilter = overlay.ui.periodFilter;
            this.filterSourceFilter = overlay.ui.sourceFilter;
            this.expandedIds = new Set(overlay.ui.expandedIds.map(id => `@${id}@`));
            // Use saved rootId; auto-detect from GEDCOM is done lazily in renderContent()
            this.rootId = overlay.ui.rootId ?? '';
            this.uiInitialized = true;
        }
        this.lastOverlay = overlay;
        this.container.empty();
        this.renderContent();
    }

    /** Re-render preserving current in-memory UI state (e.g. on GEDCOM reload). */
    rerender(overlay: OverlayState): void {
        this.rules = null; // force reload from vault on next render
        this.lastOverlay = overlay;
        this.container.empty();
        this.renderContent();
    }

    private rerenderCurrent(): void {
        this.container.empty();
        this.renderContent();
    }

    /** Persist UI state, then rerender. Use for sort/filter/root changes. */
    private async rerenderAndSave(): Promise<void> {
        const newOverlay = this.buildCurrentOverlay();
        this.lastOverlay = newOverlay;
        this.rerenderCurrent();
        await this.onSave(newOverlay);
    }

    private buildCurrentOverlay(): OverlayState {
        return {
            ui: {
                sortField: this.sortField,
                sortDir: this.sortDir,
                hideIgnored: this.filterHideIgnored,
                pinnedOnly: this.filterPinned,
                placeFilter: this.filterPlaceFilter,
                periodFilter: this.filterPeriodFilter,
                sourceFilter: this.filterSourceFilter,
                expandedIds: [...this.expandedIds].map(id => id.replace(/@/g, '')),
                rootId: this.rootId || undefined,
            },
        };
    }

    private buildPersonData(rules: Rule[]): FrontierPerson[] {
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

            const sources = matchSources(individual, lifeRange, rules, this.gedcomService);
            const rawId = individual.id.replace(/@/g, '');
            const override: PersonOverride = {
                flags: this.getPersonFlags(rawId),
                difficultyOverride: this.getDifficultyOverride(rawId),
            };
            const difficulty = estimateDifficulty(lifeRange, sources, hasPlace, override);
            const activeSourceCount = sources.filter(s => {
                const st = this.getSourceStatus(rawId, s.name);
                return st === 0 || st === 1 || st === 2;
            }).length;
            const spouses = this.getSpousesOf(individual);
            const bloodDescendant = this.findBloodDescendant(rawId);

            return { individual, lifeRange, hasPlace, firstEvent, sources, activeSourceCount, spouses, bloodDescendant, difficulty, override };
        });
    }

    private renderContent(): void {
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

        const persons = this.buildPersonData(this.rules ?? []);

        const controlsWrap = this.container.createDiv({ cls: 'gen-research-controls-wrap' });

        const row1 = controlsWrap.createDiv({ cls: 'gen-research-controls' });
        this.addFilterCheckbox(row1, t('research.filterPinned'), this.filterPinned, v => {
            this.filterPinned = v;
            this.rerenderAndSave();
        });
        this.addFilterCheckbox(row1, t('research.filterHideIgnored'), this.filterHideIgnored, v => {
            this.filterHideIgnored = v;
            this.rerenderAndSave();
        });

        const row2 = controlsWrap.createDiv({ cls: 'gen-research-controls' });
        row2.createSpan({ text: t('research.sourceLabel'), cls: 'gen-research-filter-label-text' });
        this.addSegmentedGroup<SourceFilter>(row2, [
            { value: 'all',         label: t('research.sourceAll') },
            { value: 'has-sources', label: t('research.sourceHas') },
            { value: 'no-sources',  label: t('research.sourceNo') },
        ], this.filterSourceFilter, v => {
            this.filterSourceFilter = v;
            this.rerenderAndSave();
        });

        const row3 = controlsWrap.createDiv({ cls: 'gen-research-controls' });
        row3.createSpan({ text: t('research.placeLabel'), cls: 'gen-research-filter-label-text' });
        this.addSegmentedGroup<PlaceFilter>(row3, [
            { value: 'all',       label: t('research.placeAll') },
            { value: 'no-place',  label: t('research.placeNo') },
            { value: 'has-place', label: t('research.placeYes') },
        ], this.filterPlaceFilter, v => {
            this.filterPlaceFilter = v;
            this.rerenderAndSave();
        });

        const row4 = controlsWrap.createDiv({ cls: 'gen-research-controls' });
        row4.createSpan({ text: t('research.periodLabel'), cls: 'gen-research-filter-label-text' });
        this.addSegmentedGroup<PeriodFilter>(row4, [
            { value: 'all',       label: t('research.periodAll') },
            { value: 'no-period', label: t('research.periodNone') },
            { value: 'estimated', label: t('research.periodEst') },
            { value: 'has-exact', label: t('research.periodExact') },
        ], this.filterPeriodFilter, v => {
            this.filterPeriodFilter = v;
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
            { label: t('research.colSources'), field: 'sources' },
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
            this.renderRow(tbody, fp);
            if (this.expandedIds.has(fp.individual.id)) {
                this.renderExpandedCard(tbody, fp);
            }
        }
    }

    private renderRow(tbody: HTMLElement, fp: FrontierPerson): void {
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

        row.createEl('td', { text: fp.activeSourceCount > 0 ? String(fp.activeSourceCount) : '—' });

        const pinBtn = row.createEl('td').createEl('button', {
            cls: 'gen-research-pin-btn' + (isPinned ? ' pinned' : ''),
            text: '📌',
            attr: { title: isPinned ? t('research.unpin') : t('research.pin') }
        });
        pinBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const flags = new Set(fp.override?.flags ?? []);
            if (flags.has('pinned')) flags.delete('pinned'); else flags.add('pinned');
            await this.savePersonFlags(rawId, flags);
            this.rerenderCurrent();
        });

        row.addEventListener('click', () => {
            if (this.expandedIds.has(fp.individual.id)) this.expandedIds.delete(fp.individual.id);
            else this.expandedIds.add(fp.individual.id);
            this.rerenderCurrent();
        });
    }

    private renderExpandedCard(tbody: HTMLElement, fp: FrontierPerson): void {
        const rawId = fp.individual.id.replace(/@/g, '');
        const cardCell = tbody.createEl('tr', { cls: 'gen-research-card-row' }).createEl('td');
        cardCell.setAttribute('colspan', '6');
        const card = cardCell.createDiv({ cls: 'gen-research-card' });

        const summary = card.createDiv({ cls: 'gen-research-card-summary' });
        summary.createEl('strong', { text: fp.individual.name || fp.individual.id });
        summary.appendText(` · ${this.formatLifeRange(fp.lifeRange)}`);
        if (fp.firstEvent) summary.appendText(` · ${fp.firstEvent.type}${fp.firstEvent.date ? ' ' + fp.firstEvent.date : ''}`);
        summary.appendText(` · ${fp.individual.id}`);

        if (fp.spouses.length > 0) {
            const spouseDiv = card.createDiv({ cls: 'gen-research-card-section' });
            spouseDiv.createEl('strong', { text: t('research.cardSpouses') });
            const ul = spouseDiv.createEl('ul');
            for (const spouse of fp.spouses) {
                ul.createEl('li', { text: this.formatPersonBrief(spouse) });
            }
        }

        if (fp.bloodDescendant) {
            const descDiv = card.createDiv({ cls: 'gen-research-card-section' });
            descDiv.createEl('strong', { text: t('research.cardBloodDescendant') });
            descDiv.appendText(' ' + this.formatPersonBrief(fp.bloodDescendant));
        }

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
                const flags = new Set(fp.override?.flags ?? []);
                if (cb.checked) flags.add(flag);
                else flags.delete(flag);
                await this.savePersonFlags(rawId, flags);
                this.rerenderCurrent();
            });
        }

        const noteLinkDiv = card.createDiv({ cls: 'gen-research-card-section' });
        noteLinkDiv.createEl('strong', { text: t('research.cardNoteLink') });
        const noteRow = noteLinkDiv.createDiv({ cls: 'gen-research-note-row' });
        const noteInput = noteRow.createEl('input', { cls: 'gen-research-note-input' });
        noteInput.type = 'text';
        noteInput.value = this.getNoteLink(rawId);
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
            const current = this.getNoteLink(rawId);
            const next = noteInput.value.trim();
            if (next === current) return;
            await this.saveNoteLink(rawId, next);
            this.rerenderCurrent();
        });
    }

    private getSpousesOf(individual: import('../gedcom/types').GedcomIndividual): import('../gedcom/types').GedcomIndividual[] {
        const spouses: import('../gedcom/types').GedcomIndividual[] = [];
        for (const familyId of individual.familiesAsSpouse || []) {
            const family = this.gedcomService.getFamily(familyId);
            if (!family) continue;
            const otherSpouseId = family.husbandId === individual.id ? family.wifeId : family.husbandId;
            if (otherSpouseId) {
                const spouse = this.gedcomService.getIndividual(otherSpouseId);
                if (spouse) spouses.push(spouse);
            }
        }
        return spouses;
    }

    private findBloodDescendant(frontierRawId: string): import('../gedcom/types').GedcomIndividual | null {
        if (!this.rootId) return null;
        const visited = new Set<string>();
        const queue: string[] = [this.rootId];
        while (queue.length > 0) {
            const currentRawId = queue.shift()!;
            if (visited.has(currentRawId)) continue;
            visited.add(currentRawId);
            const individual = this.gedcomService.getIndividual(currentRawId);
            if (!individual) continue;
            for (const familyId of individual.familiesAsChild || []) {
                const family = this.gedcomService.getFamily(familyId);
                if (!family) continue;
                for (const parentId of [family.husbandId, family.wifeId]) {
                    if (!parentId) continue;
                    const rawParentId = parentId.replace(/@/g, '');
                    if (rawParentId === frontierRawId) return individual;
                    if (!visited.has(rawParentId)) queue.push(rawParentId);
                }
            }
        }
        return null;
    }

    private formatPersonBrief(individual: import('../gedcom/types').GedcomIndividual): string {
        const name = individual.name || individual.id;
        const from = parseYear(individual.birthDate);
        const to = parseYear(individual.deathDate);
        if (from === null && to === null) return name;
        return `${name} (${from ?? '?'}–${to ?? '?'})`;
    }

    private addFilterCheckbox(parent: HTMLElement, label: string, checked: boolean, onChange: (v: boolean) => void): void {
        const lbl = parent.createEl('label', { cls: 'gen-research-filter-label' });
        const cb = lbl.createEl('input');
        cb.type = 'checkbox';
        cb.checked = checked;
        lbl.appendText(' ' + label);
        cb.addEventListener('change', () => onChange(cb.checked));
    }

    private addSegmentedGroup<T extends string>(
        parent: HTMLElement,
        options: Array<{ value: T; label: string; title?: string }>,
        current: T,
        onChange: (v: T) => void
    ): void {
        const group = parent.createDiv({ cls: 'gen-research-seg-group' });
        for (const opt of options) {
            const btn = group.createEl('button', {
                cls: 'gen-research-seg-btn' + (current === opt.value ? ' active' : ''),
                text: opt.label,
            });
            if (opt.title) btn.title = opt.title;
            btn.addEventListener('click', () => onChange(opt.value));
        }
    }

    private sortAndFilter(persons: FrontierPerson[]): FrontierPerson[] {
        let result = persons;
        if (this.filterHideIgnored) result = result.filter(fp => !fp.override?.flags?.has('ignored'));
        if (this.filterPinned) result = result.filter(fp => fp.override?.flags?.has('pinned'));

        if (this.filterPlaceFilter === 'no-place') result = result.filter(fp => !fp.hasPlace);
        else if (this.filterPlaceFilter === 'has-place') result = result.filter(fp => fp.hasPlace);

        if (this.filterPeriodFilter === 'no-period') {
            result = result.filter(fp => fp.lifeRange.from === null && fp.lifeRange.to === null);
        } else if (this.filterPeriodFilter === 'estimated') {
            result = result.filter(fp => fp.lifeRange.confidence === 'estimated' && (fp.lifeRange.from !== null || fp.lifeRange.to !== null));
        } else if (this.filterPeriodFilter === 'has-exact') {
            result = result.filter(fp => fp.lifeRange.confidence === 'exact');
        }

        if (this.filterSourceFilter === 'has-sources') result = result.filter(fp => fp.activeSourceCount > 0);
        else if (this.filterSourceFilter === 'no-sources') result = result.filter(fp => fp.activeSourceCount === 0);

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
            case 'sources': return (a, b) => dir * (a.activeSourceCount - b.activeSourceCount);
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

    private ensureStyles(): void {
        if (!document.getElementById(STYLES_ID)) {
            const style = document.head.createEl('style');
            style.id = STYLES_ID;
            style.textContent = CSS;
        }
    }
}

