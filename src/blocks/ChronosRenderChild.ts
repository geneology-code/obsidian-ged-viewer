import { MarkdownRenderChild, MarkdownPostProcessorContext } from 'obsidian';
import { GedcomService } from '../gedcom/service';
import { ChronosService } from '../chronos/service';
import { t } from '../i18n';
import { Logger, GEDCOMRenderError } from '../utils/logger';

/**
 * Base class for Chronos renderers with proper lifecycle management
 */
export abstract class ChronosRenderChild extends MarkdownRenderChild {
    protected gedcomService: GedcomService;
    protected source: string;
    protected ctx: MarkdownPostProcessorContext;

    constructor(
        container: HTMLElement,
        source: string,
        gedcomService: GedcomService,
        ctx: MarkdownPostProcessorContext
    ) {
        super(container);
        this.gedcomService = gedcomService;
        this.source = source;
        this.ctx = ctx;
    }

    /**
     * Called when the renderer is loaded
     */
    async onload(): Promise<void> {
        super.onload();
        Logger.debug(`[ChronosRenderChild] onload: ${this.constructor.name}`);
        
        // Register this renderer for re-rendering when data is loaded
        this.gedcomService.getRendererRegistry().register(this);

        // If data is already loaded, render immediately
        if (this.gedcomService.getIsDataLoaded()) {
            Logger.debug(`[ChronosRenderChild] GEDCOM already loaded, rendering ${this.constructor.name}`);
            await this.render();
        }
    }

    /**
     * Called when the renderer is unloaded
     */
    async onunload(): Promise<void> {
        Logger.debug(`[ChronosRenderChild] onunload: ${this.constructor.name}`);
        super.onunload();
        // Unregister this renderer
        this.gedcomService.getRendererRegistry().unregister(this);
    }

    /**
     * Call this method when GEDCOM data is loaded to re-render
     */
    async rerender(): Promise<void> {
        Logger.debug(`[ChronosRenderChild] rerender: ${this.constructor.name}`);
        this.containerEl.empty();
        await this.render();
    }

    abstract render(): Promise<void>;
}

/**
 * Renderer for ged-chronos blocks
 * Expands gci/gcf directives and calls Chronos processor directly
 */
export class GedChronosRenderer extends ChronosRenderChild {

    async render(): Promise<void> {
        // Clear container before rendering
        this.containerEl.empty();

        // Check if data is loaded
        if (!this.gedcomService.getIsDataLoaded()) {
            this.containerEl.createEl('p', { text: t('chronos.noData') || 'No GEDCOM data loaded' });
            return;
        }

        // Get settings from gedcomService (we'll need to pass this through)
        const chronosService = new ChronosService(this.gedcomService, {
            maxLifespanYears: 100 // TODO: Pass actual settings through proper interface
        });

        // Expand DSL to chronos lines
        const result = chronosService.expandDSLToLines(this.source);

        // Display errors if any
        if (result.errors.length > 0) {
            const errorDiv = this.containerEl.createDiv({ cls: 'chronos-ged-errors' });
            errorDiv.createEl('p', { text: (t('chronos.errors') || 'Errors') + ':' });
            const errorList = errorDiv.createEl('ul');
            for (const error of result.errors) {
                errorList.createEl('li', { text: error });
            }
        }

        // Check if we have any lines to render
        if (result.lines.length === 0) {
            this.containerEl.createEl('p', { text: t('chronos.noEvents') || 'No events to display' });
            return;
        }

        const chronosDSL = result.lines.join('\n');

        // Try to render using Chronos plugin
        await this.renderWithChronosPlugin(chronosDSL);
    }

    /**
     * Attempt to render using the Chronos plugin
     */
    private async renderWithChronosPlugin(chronosDSL: string): Promise<void> {
        try {
            Logger.debug('Attempting to render with Chronos plugin');

            // Get app instance from gedcomService
            const app = this.getApp();

            // Try to find Chronos plugin
            const chronosPlugin = this.findChronosPlugin(app);

            if (chronosPlugin && typeof chronosPlugin._renderChronosBlock === 'function') {
                Logger.debug('Found Chronos plugin with _renderChronosBlock method');
                await chronosPlugin._renderChronosBlock(chronosDSL, this.containerEl);
                this.addChronosClasses();
                Logger.debug('Successfully rendered with Chronos plugin');
                return;
            }

            Logger.warn('Chronos plugin not found or incompatible, trying alternatives');
            // Try alternative rendering methods
            await this.tryAlternativeRendering(app, chronosDSL);

        } catch (error) {
            Logger.error('Chronos rendering error:', error);
            this.renderFallback(chronosDSL, error);
        }
    }

    /**
     * Get app instance from gedcomService
     */
    private getApp(): any {
        return this.gedcomService.getApp();
    }

    /**
     * Find Chronos plugin in the plugin system
     */
    private findChronosPlugin(app: any): any {
        return app.plugins?.plugins?.['chronos'];
    }

    /**
     * Try alternative rendering methods if direct plugin access fails
     */
    private async tryAlternativeRendering(app: any, chronosDSL: string): Promise<void> {
        // Try to find chronos processor in markdown preview renderers
        const processors = app.markdownPreviewRenderer?.codeBlockPostProcessors;
        const chronosProcessor = processors?.find((p: any) => p.lang === 'chronos');

        if (chronosProcessor) {
            await chronosProcessor.processor(chronosDSL, this.containerEl, this.ctx);
            this.addChronosClasses();
        } else {
            throw new Error('Chronos plugin not found or not compatible');
        }
    }

    /**
     * Add appropriate CSS classes for Chronos styling
     */
    private addChronosClasses(): void {
        setTimeout(() => {
            const outerBlock = this.containerEl.closest('.cm-preview-code-block.cm-lang-ged-chronos') as HTMLElement;
            if (outerBlock) {
                outerBlock.addClass('cm-lang-chronos');
            }
        }, 100);
    }

    /**
     * Fallback rendering when Chronos plugin is not available
     */
    private renderFallback(chronosDSL: string, error?: any): void {
        const errorMessage = error ? `Chronos plugin error: ${error.message}` : 'Chronos plugin not available';
        this.containerEl.createEl('div', { cls: 'chronos-ged-fallback' })
            .createEl('p', { text: errorMessage });
        this.containerEl.createEl('pre', { text: chronosDSL });
    }
}

