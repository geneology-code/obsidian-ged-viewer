import { MarkdownRenderChild, MarkdownPostProcessorContext, MarkdownRenderer, App } from 'obsidian';
import { GedcomService } from '../gedcom/service';
import { GedcomJSApi } from './GedcomJSApi';
import { Logger } from '../utils/logger';

/**
 * Format a single GEDCOM date string for display
 * - "1 JAN 1950" → "1 января 1950" / "1 Jan 1950"
 * - "JAN 1950" → "январь 1950" / "Jan 1950"
 * - "1950-01-01" → "1 января 1950"
 * - "1950" → "1950"
 */
function formatSingleDate(date: string, gedcomService: GedcomService): string {
    if (!date) return '';

    // First normalize to YYYY-MM-DD or YYYY using existing service method
    const normalized = gedcomService.normalizeDate(date);
    if (!normalized) return date;

    // Extract year, month, day from normalized date
    const isoMatch = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const yearMonthMatch = normalized.match(/^(\d{4})-(\d{2})$/);
    const yearMatch = normalized.match(/^(\d{4})$/);

    const monthNamesRu = ['', 'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
                          'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
    const monthNamesGenRu = ['', 'январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
                             'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
    const monthNamesEn = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                          'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    if (isoMatch) {
        const [, year, month, day] = isoMatch;
        const monthNum = parseInt(month, 10);
        const monthName = monthNamesRu[monthNum] || month;
        // Remove leading zero from day
        const dayNum = parseInt(day, 10).toString();
        return `${dayNum} ${monthName} ${year}`;
    }

    if (yearMonthMatch) {
        const [, year, month] = yearMonthMatch;
        const monthNum = parseInt(month, 10);
        const monthName = monthNamesGenRu[monthNum] || month;
        return `${monthName} ${year}`;
    }

    if (yearMatch) {
        return yearMatch[1];
    }

    // Fallback: return original or normalized
    return normalized || date;
}

/**
 * Renderer for ged-js blocks — executes user JavaScript with GEDCOM context
 * Inspired by dataviewjs architecture from the Obsidian Dataview plugin.
 */
export class GedcomJSRenderer extends MarkdownRenderChild {
    private gedcomService: GedcomService;
    private source: string;
    private ctx: MarkdownPostProcessorContext;
    private app: App;

    constructor(
        container: HTMLElement,
        source: string,
        gedcomService: GedcomService,
        ctx: MarkdownPostProcessorContext,
        app: App
    ) {
        super(container);
        this.gedcomService = gedcomService;
        this.source = source;
        this.ctx = ctx;
        this.app = app;
    }

    async onload(): Promise<void> {
        super.onload();
        Logger.debug(`[GedcomJSRenderer] onload`);

        // Register for re-rendering when data is loaded
        this.gedcomService.getRendererRegistry().register(this);

        if (this.gedcomService.getIsDataLoaded()) {
            await this.execute();
        }
    }

    async onunload(): Promise<void> {
        Logger.debug(`[GedcomJSRenderer] onunload`);
        super.onunload();
        this.gedcomService.getRendererRegistry().unregister(this);
    }

    async rerender(): Promise<void> {
        Logger.debug(`[GedcomJSRenderer] rerender`);
        this.containerEl.empty();
        await this.execute();
    }

    private async execute(): Promise<void> {
        this.containerEl.empty();

        // Create wrapper div
        const wrapper = this.containerEl.createDiv({ cls: 'gedcom-js-wrapper' });

        try {
            // Build the API context
            const api = this.buildApi(wrapper);

            // Execute user script
            const userFunc = new Function('ged', this.source);
            await userFunc(api);

        } catch (error) {
            this.renderError(error);
        }
    }

    /**
     * Build the ged API object exposed to user scripts
     */
    private buildApi(container: HTMLElement): GedcomJSApi {
        const self = this;

        return {
            app: this.app,
            service: this.gedcomService,
            container,
            component: this,
            sourcePath: this.ctx.sourcePath,

            el(tag: string, attrs?: Record<string, any>, parent?: HTMLElement): HTMLElement {
                const target = parent || container;
                const el = target.createEl(tag as keyof HTMLElementTagNameMap, attrs || {});
                return el;
            },

            header(level: number, text: string): HTMLElement {
                const tag = `h${level}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
                return container.createEl(tag, { text });
            },

            paragraph(text: string): HTMLElement {
                return container.createEl('p', { text });
            },

            span(text: string): HTMLElement {
                return container.createSpan({ text });
            },

            async renderMarkdown(markdown: string, targetEl?: HTMLElement): Promise<void> {
                const el = targetEl || container;
                await MarkdownRenderer.renderMarkdown(markdown, el, self.ctx.sourcePath, self);
            },

            list(items: string[]): HTMLElement {
                const ul = container.createEl('ul');
                for (const item of items) {
                    ul.createEl('li', { text: item });
                }
                return ul;
            },

            table(headers: string[], rows: string[][]): HTMLElement {
                const tableEl = container.createEl('table');
                const thead = tableEl.createEl('thead');
                const headerRow = thead.createEl('tr');
                for (const h of headers) {
                    headerRow.createEl('th', { text: h });
                }
                const tbody = tableEl.createEl('tbody');
                for (const row of rows) {
                    const tr = tbody.createEl('tr');
                    for (const cell of row) {
                        tr.createEl('td', { text: cell });
                    }
                }
                return tableEl;
            },

            formatDate(date: string): string {
                if (!date) return '';

                // Handle ranges with tilde
                if (date.includes('~')) {
                    const parts = date.split('~');
                    return parts.map(p => formatSingleDate(p.trim(), self.gedcomService)).join(' ~ ');
                }

                return formatSingleDate(date.trim(), self.gedcomService);
            }
        };
    }

    /**
     * Render error in a user-friendly way
     */
    private renderError(error: any): void {
        const errorDiv = this.containerEl.createDiv({ cls: 'gedcom-js-error' });
        errorDiv.createEl('h4', { text: 'GED-JS Error' });

        const pre = errorDiv.createEl('pre', { cls: 'gedcom-js-error-details' });
        const message = error instanceof Error ? error.message : String(error);
        pre.createEl('code', { text: message });

        if (error instanceof Error && error.stack) {
            const stackPre = errorDiv.createEl('pre', { cls: 'gedcom-js-error-stack' });
            stackPre.createEl('code', { text: error.stack });
        }

        Logger.error('[GedcomJSRenderer] Script execution error:', error);
    }
}
