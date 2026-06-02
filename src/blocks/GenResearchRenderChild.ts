import { App, MarkdownPostProcessorContext, TFile } from 'obsidian';
import { GedcomService } from '../gedcom/service';
import { GedcomRenderChild } from './GedcomRenderChild';
import { parseOverlay, serializeOverlay } from '../research/overlayParser';
import { OverlayState, SourceStatus } from '../research/types';
import { ReproductiveAge, DEFAULT_REPRODUCTIVE_AGE, LifeRangeMode } from '../types/settings';
import { GenResearchPanel } from '../research/GenResearchPanel';

export class GenResearchRenderChild extends GedcomRenderChild {
    private maxLifespanYears: number;
    private heuristicsFilePath: string;
    private getStatus: (personId: string, sourceName: string) => SourceStatus;
    private setStatus: (personId: string, sourceName: string, status: SourceStatus) => Promise<void>;
    private getEmoji: (status: SourceStatus) => string;
    private getNote: (personId: string) => string;
    private saveNote: (personId: string, link: string) => Promise<void>;
    private getFlags: (personId: string) => Set<import('../research/types').PersonFlag>;
    private saveFlags: (personId: string, flags: Set<import('../research/types').PersonFlag>) => Promise<void>;
    private getDiffOverride: (personId: string) => import('../research/types').DifficultyCategory | undefined;
    private saveDiffOverride: (personId: string, override: import('../research/types').DifficultyCategory | undefined) => Promise<void>;
    private reproductiveAge: ReproductiveAge;
    private lifeRangeMode: LifeRangeMode;
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
        getNoteLink: (personId: string) => string,
        saveNoteLink: (personId: string, link: string) => Promise<void>,
        getPersonFlags: (personId: string) => Set<import('../research/types').PersonFlag>,
        savePersonFlags: (personId: string, flags: Set<import('../research/types').PersonFlag>) => Promise<void>,
        getDifficultyOverride: (personId: string) => import('../research/types').DifficultyCategory | undefined,
        saveDifficultyOverride: (personId: string, override: import('../research/types').DifficultyCategory | undefined) => Promise<void>,
        reproductiveAge: ReproductiveAge = DEFAULT_REPRODUCTIVE_AGE,
        lifeRangeMode: LifeRangeMode = 'maximize',
    ) {
        super(container, source, gedcomService, ctx, app);
        this.maxLifespanYears = maxLifespanYears;
        this.heuristicsFilePath = heuristicsFilePath;
        this.getStatus = getStatus;
        this.setStatus = setStatus;
        this.getEmoji = getEmoji;
        this.getNote = getNoteLink;
        this.saveNote = saveNoteLink;
        this.getFlags = getPersonFlags;
        this.saveFlags = savePersonFlags;
        this.getDiffOverride = getDifficultyOverride;
        this.saveDiffOverride = saveDifficultyOverride;
        this.reproductiveAge = reproductiveAge;
        this.lifeRangeMode = lifeRangeMode;
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
            getNoteLink: this.getNote,
            saveNoteLink: this.saveNote,
            getPersonFlags: this.getFlags,
            savePersonFlags: this.saveFlags,
            getDifficultyOverride: this.getDiffOverride,
            saveDifficultyOverride: this.saveDiffOverride,
            reproductiveAge: this.reproductiveAge,
            lifeRangeMode: this.lifeRangeMode,
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
