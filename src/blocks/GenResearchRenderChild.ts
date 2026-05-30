import { App, MarkdownPostProcessorContext, TFile } from 'obsidian';
import { GedcomService } from '../gedcom/service';
import { GedcomRenderChild } from './GedcomRenderChild';
import { parseOverlay, serializeOverlay } from '../research/overlayParser';
import { OverlayState, SourceStatus } from '../research/types';
import { ReproductiveAge, DEFAULT_REPRODUCTIVE_AGE } from '../types/settings';
import { GenResearchPanel } from '../research/GenResearchPanel';

export class GenResearchRenderChild extends GedcomRenderChild {
    private maxLifespanYears: number;
    private heuristicsFilePath: string;
    private getStatus: (personId: string, sourceName: string) => SourceStatus;
    private setStatus: (personId: string, sourceName: string, status: SourceStatus) => Promise<void>;
    private getEmoji: (status: SourceStatus) => string;
    private reproductiveAge: ReproductiveAge;
    private panel: GenResearchPanel | null = null;

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
        reproductiveAge: ReproductiveAge = DEFAULT_REPRODUCTIVE_AGE,
    ) {
        super(container, source, gedcomService, ctx, app);
        this.maxLifespanYears = maxLifespanYears;
        this.heuristicsFilePath = heuristicsFilePath;
        this.getStatus = getStatus;
        this.setStatus = setStatus;
        this.getEmoji = getEmoji;
        this.reproductiveAge = reproductiveAge;
    }

    async render(): Promise<void> {
        this.containerEl.empty();
        const overlay = parseOverlay(this.source);
        this.panel = new GenResearchPanel({
            container: this.containerEl,
            gedcomService: this.gedcomService,
            maxLifespanYears: this.maxLifespanYears,
            heuristicsFilePath: this.heuristicsFilePath,
            app: this.app,
            getSourceStatus: this.getStatus,
            setSourceStatus: this.setStatus,
            getStatusEmoji: this.getEmoji,
            reproductiveAge: this.reproductiveAge,
            onSave: (o) => this.saveOverlay(o),
            sourcePath: this.ctx.sourcePath,
        });
        this.panel.render(overlay);
    }

    // Override rerender to preserve in-memory sort/filter state
    async rerender(): Promise<void> {
        const overlay = parseOverlay(this.source);
        if (this.panel) {
            this.containerEl.empty();
            this.panel.rerender(overlay);
        } else {
            await this.render();
        }
    }

    private async saveOverlay(newOverlay: OverlayState): Promise<void> {
        const sectionInfo = this.ctx.getSectionInfo(this.containerEl);
        if (!sectionInfo) return;
        const lines = sectionInfo.text.split('\n');
        const newLines = [
            ...lines.slice(0, sectionInfo.lineStart + 1),
            serializeOverlay(newOverlay),
            ...lines.slice(sectionInfo.lineEnd)
        ];
        const file = this.app.vault.getAbstractFileByPath(this.ctx.sourcePath);
        if (!file || !('stat' in file)) return;
        await this.app.vault.modify(file as TFile, newLines.join('\n'));
    }
}
