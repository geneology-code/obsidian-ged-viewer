import { MarkdownRenderChild, MarkdownPostProcessorContext, App } from 'obsidian';
import { GedcomService } from '../gedcom/service';
import { GedcomIndividual } from '../gedcom/types';
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
