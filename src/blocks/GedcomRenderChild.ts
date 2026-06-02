import { MarkdownRenderChild, MarkdownPostProcessorContext, App, Notice } from 'obsidian';
import { GedcomService } from '../gedcom/service';
import { GedcomIndividual, GedcomEvent } from '../gedcom/types';
import { Logger } from '../utils/logger';
import { t } from '../i18n';
import {
    renderSinglePerson,
    renderPersonComparisonTable,
    renderSingleFamily,
    renderFamilyComparisonTable,
    renderPersonEventsTable,
    renderPersonFull
} from './renderers';
import { loadRules, matchSources } from '../research/heuristics';
import { estimateLifeRange, parseYear } from '../research/lifeRangeEstimator';
import { SOURCE_STATUSES, SourceStatus, LifeRange } from '../research/types';
import { ReproductiveAge, DEFAULT_REPRODUCTIVE_AGE, LifeRangeMode } from '../types/settings';
import { NoteSuggest, GEN_RESEARCH_STYLES_ID, GEN_RESEARCH_CSS } from '../research/GenResearchPanel';

/**
 * Base class for GEDCOM renderers with proper lifecycle management
 */
export abstract class GedcomRenderChild extends MarkdownRenderChild {
    protected gedcomService: GedcomService;
    protected source: string;
    protected ctx: MarkdownPostProcessorContext;
    protected app: App;

    constructor(container: HTMLElement, source: string, gedcomService: GedcomService, ctx: MarkdownPostProcessorContext, app: App) {
        super(container);
        this.gedcomService = gedcomService;
        this.source = source;
        this.ctx = ctx;
        this.app = app;
    }

    /**
     * Called when the renderer is loaded
     */
    async onload(): Promise<void> {
        super.onload();
        Logger.debug(`[GedcomRenderChild] onload: ${this.constructor.name}`);
        
        // Register this renderer for re-rendering when data is loaded
        this.gedcomService.getRendererRegistry().register(this);

        // If data is already loaded, render immediately
        if (this.gedcomService.getIsDataLoaded()) {
            Logger.debug(`[GedcomRenderChild] GEDCOM already loaded, rendering ${this.constructor.name}`);
            await this.render();
        }
    }

    /**
     * Called when the renderer is unloaded
     */
    async onunload(): Promise<void> {
        Logger.debug(`[GedcomRenderChild] onunload: ${this.constructor.name}`);
        super.onunload();
        // Unregister this renderer
        this.gedcomService.getRendererRegistry().unregister(this);
    }

    /**
     * Call this method when GEDCOM data is loaded to re-render
     */
    async rerender(): Promise<void> {
        Logger.debug(`[GedcomRenderChild] rerender: ${this.constructor.name}`);
        this.containerEl.empty();
        await this.render();
    }

    abstract render(): Promise<void>;
}

/**
 * Renderer for ged-person blocks
 * Always shows key:value info for the first person from the list
 */
export class GedcomPersonRenderer extends GedcomRenderChild {
    async render(): Promise<void> {
        // Clear container before rendering
        this.containerEl.empty();

        // Parse the source to extract GEDCOM IDs
        const ids = this.source.trim().split(/\s+/).filter(id => id.startsWith('@'));

        if (ids.length === 0) {
            this.containerEl.createEl('p', { text: t('error.noGedcomIds') });
            return;
        }

        // Always show only the first person in key:value format
        const individual = this.gedcomService.getIndividual(ids[0]);
        if (!individual) {
            this.containerEl.createEl('p', { text: t('error.personNotFound', { id: ids[0] }) });
            return;
        }

        renderSinglePerson(this.containerEl, individual, this.gedcomService);
    }
}

/**
 * Renderer for ged-relatives blocks
 */
export class GedcomFamilyRenderer extends GedcomRenderChild {
    async render(): Promise<void> {
        // Clear container before rendering
        this.containerEl.empty();

        // Parse the source to extract GEDCOM IDs
        const ids = this.source.trim().split(/\s+/).filter(id => id.startsWith('@') && id.endsWith('@'));

        if (ids.length === 0) {
            this.containerEl.createEl('p', { text: t('error.noGedcomIds') });
            return;
        }

        if (ids.length === 1) {
            // Single family view - key-value format
            const individual = this.gedcomService.getIndividual(ids[0]);
            const familyMembers = individual ? this.gedcomService.getFamilyMembers(ids[0]) : null;

            if (!individual) {
                this.containerEl.createEl('p', { text: t('error.personNotFound', { id: ids[0] }) });
                return;
            }

            renderSingleFamily(this.containerEl, individual, familyMembers, this.gedcomService, this.app, this);
        } else {
            // Multiple family comparison view - table format
            const individuals = ids.map(id => this.gedcomService.getIndividual(id)).filter(Boolean) as GedcomIndividual[];
            const families = individuals.map(individual => this.gedcomService.getFamilyMembers(individual.id));

            if (individuals.length === 0) {
                this.containerEl.createEl('p', { text: t('error.noPersonsFound') });
                return;
            }

            renderFamilyComparisonTable(this.containerEl, individuals, families, this.gedcomService);
        }
    }
}

/**
 * Renderer for ged-person-full blocks
 * Combines ged-person (key:value) + ged-relatives (markdown family tree)
 */
export class GedcomPersonFullRenderer extends GedcomRenderChild {
    async render(): Promise<void> {
        // Clear container before rendering
        this.containerEl.empty();

        // Parse the source to extract GEDCOM IDs
        const ids = this.source.trim().split(/\s+/).filter(id => id.startsWith('@'));

        if (ids.length === 0) {
            this.containerEl.createEl('p', { text: t('error.noGedcomIds') });
            return;
        }

        // Always use only the first person
        const individual = this.gedcomService.getIndividual(ids[0]);
        if (!individual) {
            this.containerEl.createEl('p', { text: t('error.personNotFound', { id: ids[0] }) });
            return;
        }

        renderPersonFull(this.containerEl, individual, this.gedcomService, this.app, this);
    }
}

/**
 * Renderer for ged-person-compare blocks (aliased as ged-comp)
 * Always renders comparison table regardless of number of persons
 */
export class GedcomPersonCompareRenderer extends GedcomRenderChild {
    async render(): Promise<void> {
        // Clear container before rendering
        this.containerEl.empty();

        // Parse the source to extract GEDCOM IDs
        const ids = this.source.trim().split(/\s+/).filter(id => id.startsWith('@'));

        if (ids.length === 0) {
            this.containerEl.createEl('p', { text: t('error.noGedcomIds') });
            return;
        }

        const individuals = ids.map(id => this.gedcomService.getIndividual(id)).filter(Boolean) as GedcomIndividual[];

        if (individuals.length === 0) {
            this.containerEl.createEl('p', { text: t('error.noPersonsFound') });
            return;
        }

        renderPersonComparisonTable(this.containerEl, individuals, this.gedcomService);
    }
}

/**
 * Renderer for ged-person-events blocks
 */
export class GedcomPersonEventsRenderer extends GedcomRenderChild {
    async render(): Promise<void> {
        // Clear container before rendering
        this.containerEl.empty();

        // Parse the source to extract GEDCOM IDs
        const ids = this.source.trim().split(/\s+/).filter(id => id.startsWith('@'));

        if (ids.length === 0) {
            this.containerEl.createEl('p', { text: t('error.noGedcomIds') });
            return;
        }

        const individuals = ids.map(id => this.gedcomService.getIndividual(id)).filter(Boolean) as GedcomIndividual[];

        if (individuals.length === 0) {
            this.containerEl.createEl('p', { text: t('error.noPersonsFound') });
            return;
        }

        renderPersonEventsTable(this.containerEl, individuals, this.gedcomService);
    }
}

/**
 * Renderer for ged-heur blocks
 * Shows a person card with spouses, note link, and heuristic source suggestions.
 */
export class GedHeurRenderer extends GedcomRenderChild {
    private readonly maxLifespanYears: number;
    private readonly heuristicsFilePath: string;
    private readonly reproductiveAge: ReproductiveAge;
    private readonly lifeRangeMode: LifeRangeMode;
    private readonly getSourceStatus: (personId: string, sourceName: string) => SourceStatus;
    private readonly setSourceStatus: (personId: string, sourceName: string, status: SourceStatus) => Promise<void>;
    private readonly getStatusEmoji: (status: SourceStatus) => string;
    private readonly getNoteLink: (personId: string) => string;
    private readonly saveNoteLink: (personId: string, link: string) => Promise<void>;

    constructor(
        container: HTMLElement,
        source: string,
        gedcomService: GedcomService,
        ctx: MarkdownPostProcessorContext,
        app: App,
        maxLifespanYears: number,
        heuristicsFilePath: string,
        getStatus: (personId: string, sourceName: string) => SourceStatus,
        setStatus: (personId: string, sourceName: string, status: SourceStatus) => Promise<void>,
        getEmoji: (status: SourceStatus) => string,
        getNoteLink: (personId: string) => string,
        saveNoteLink: (personId: string, link: string) => Promise<void>,
        reproductiveAge: ReproductiveAge = DEFAULT_REPRODUCTIVE_AGE,
        lifeRangeMode: LifeRangeMode = 'maximize',
    ) {
        super(container, source, gedcomService, ctx, app);
        this.maxLifespanYears = maxLifespanYears;
        this.heuristicsFilePath = heuristicsFilePath;
        this.reproductiveAge = reproductiveAge;
        this.lifeRangeMode = lifeRangeMode;
        this.getSourceStatus = getStatus;
        this.setSourceStatus = setStatus;
        this.getStatusEmoji = getEmoji;
        this.getNoteLink = getNoteLink;
        this.saveNoteLink = saveNoteLink;
    }

    async render(): Promise<void> {
        // Resolve async data before touching the DOM to avoid double-render race
        const token = this.source.trim().split(/\s+/).find(s => s.length > 0);
        const individual = token ? this.gedcomService.getIndividual(token) : null;
        const rules = this.heuristicsFilePath ? await loadRules(this.app, this.heuristicsFilePath) : [];
        const lifeRange = individual ? estimateLifeRange(individual, this.gedcomService, this.maxLifespanYears, this.reproductiveAge, this.lifeRangeMode) : null;
        const sources = individual && lifeRange ? matchSources(individual, lifeRange, rules, this.gedcomService) : [];

        this.containerEl.empty();

        if (!token) {
            this.containerEl.createEl('p', { text: t('error.noGedcomIds') });
            return;
        }
        if (!individual) {
            this.containerEl.createEl('p', { text: t('error.personNotFound', { id: token }) });
            return;
        }
        if (!this.heuristicsFilePath) {
            this.containerEl.createEl('p', { text: t('heur.noRules') });
            return;
        }

        if (!document.getElementById(GEN_RESEARCH_STYLES_ID)) {
            const style = document.head.createEl('style');
            style.id = GEN_RESEARCH_STYLES_ID;
            style.textContent = GEN_RESEARCH_CSS;
        }

        const rawId = individual.id.replace(/@/g, '');
        const card = this.containerEl.createDiv({ cls: 'gen-research-card' });

        // Summary line with dblclick-to-copy ID
        const summaryLine = card.createDiv({ cls: 'gen-research-card-summary-line' });
        summaryLine.title = t('research.dblclickCopyId');
        summaryLine.createEl('strong', { text: individual.name || individual.id });
        if (lifeRange && (lifeRange.from !== null || lifeRange.to !== null)) {
            summaryLine.appendText(' · ');
            this.renderLifeRangeInto(summaryLine, lifeRange);
        }
        const allDatedEvents: GedcomEvent[] = [];
        if (individual.birthDate) allDatedEvents.push({ type: 'BIRT', date: individual.birthDate, place: individual.birthPlace });
        if (individual.deathDate) allDatedEvents.push({ type: 'DEAT', date: individual.deathDate, place: individual.deathPlace });
        for (const ev of individual.events || []) {
            if (ev.date) allDatedEvents.push(ev);
        }
        const firstEvent = allDatedEvents.length > 0
            ? allDatedEvents.reduce((earliest, ev) =>
                (parseYear(ev.date) ?? Infinity) < (parseYear(earliest.date) ?? Infinity) ? ev : earliest)
            : null;
        if (firstEvent) summaryLine.appendText(` · ${firstEvent.type}${firstEvent.date ? ' ' + firstEvent.date : ''}`);
        summaryLine.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            navigator.clipboard.writeText(individual.id);
            new Notice(`📋 ID: ${individual.id}`);
        });

        // Spouses
        const spouses = this.getSpousesOf(individual);
        if (spouses.length > 0) {
            const spouseDiv = card.createDiv({ cls: 'gen-research-card-section' });
            spouseDiv.createEl('strong', { text: t('research.cardSpouses') });
            const ul = spouseDiv.createEl('ul');
            for (const spouse of spouses) {
                const li = ul.createEl('li', { cls: 'gen-research-card-person-link' });
                li.appendText(this.formatPersonBrief(spouse));
                li.title = t('research.dblclickCopyId');
                li.addEventListener('dblclick', (e) => {
                    e.stopPropagation();
                    navigator.clipboard.writeText(spouse.id);
                    new Notice(`📋 ID: ${spouse.id}`);
                });
            }
        }

        // Note link
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
            if (path) this.app.workspace.openLinkText(path, this.ctx.sourcePath);
        });
        noteInput.addEventListener('blur', async () => {
            const current = this.getNoteLink(rawId);
            const next = noteInput.value.trim();
            if (next === current) return;
            await this.saveNoteLink(rawId, next);
        });

        // Sources (at bottom)
        const srcDiv = card.createDiv({ cls: 'gen-research-card-section' });
        if (sources.length > 0) {
            srcDiv.createEl('strong', { text: t('research.cardSources') });
            const ul = srcDiv.createEl('ul');
            for (const src of sources) {
                const status = this.getSourceStatus(rawId, src.name);
                const { labelKey } = SOURCE_STATUSES[status];
                const emoji = this.getStatusEmoji(status);
                const li = ul.createEl('li', { cls: 'gen-research-source-item' });
                li.createSpan({ text: emoji + ' ', cls: 'gen-research-source-emoji' });
                li.appendText(src.name);
                li.title = t(labelKey);
                li.style.cursor = 'pointer';
                li.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    await this.setSourceStatus(rawId, src.name, ((status + 1) % 6) as SourceStatus);
                    await this.render();
                });
                li.addEventListener('contextmenu', async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    await this.setSourceStatus(rawId, src.name, ((status + 5) % 6) as SourceStatus);
                    await this.render();
                });
            }
        } else {
            srcDiv.createEl('strong', { text: t('research.cardSources') + ' ' });
            srcDiv.appendText(t('research.cardNoSources'));
        }
    }

    private getSpousesOf(individual: GedcomIndividual): GedcomIndividual[] {
        const spouses: GedcomIndividual[] = [];
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

    private formatPersonBrief(individual: GedcomIndividual): string {
        const name = individual.name || individual.id;
        const from = parseYear(individual.birthDate);
        const to = parseYear(individual.deathDate);
        if (from === null && to === null) return name;
        return `${name} (${from ?? '?'}–${to ?? '?'})`;
    }

    private renderLifeRangeInto(container: HTMLElement, lr: LifeRange): void {
        if (lr.from === null && lr.to === null) { container.appendText('—'); return; }
        const fromStr = lr.from !== null ? String(lr.from) : '?';
        const toStr = lr.to !== null ? String(lr.to) : '?';
        const fromEst = lr.confidence === 'estimated' && (lr.fromEstimated ?? true) && lr.from !== null;
        const toEst = lr.confidence === 'estimated' && (lr.toEstimated ?? true) && lr.to !== null;
        if (fromEst) container.createEl('em', { text: `~${fromStr}` });
        else container.appendText(fromStr);
        container.appendText('–');
        if (toEst) container.createEl('em', { text: `~${toStr}` });
        else container.appendText(toStr);
    }
}

