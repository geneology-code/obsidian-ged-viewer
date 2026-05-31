import { ItemView, WorkspaceLeaf } from 'obsidian';
import { GedcomService } from '../gedcom/service';
import { GenResearchPanel } from '../research/GenResearchPanel';
import { parseOverlay } from '../research/overlayParser';
import { OverlayState, DEFAULT_UI_STATE, SourceStatus } from '../research/types';
import { ReproductiveAge, DEFAULT_REPRODUCTIVE_AGE } from '../types/settings';
import { t } from '../i18n';

export const GEN_RESEARCH_VIEW = 'ged-research-view';

export class GenResearchView extends ItemView {
    private readonly gedcomService: GedcomService;
    private readonly maxLifespanYears: () => number;
    private readonly heuristicsFilePath: () => string;
    private readonly loadOverlay: () => OverlayState;
    private readonly saveOverlayFn: (state: OverlayState) => Promise<void>;
    private readonly getStatusFn: (personId: string, sourceName: string) => SourceStatus;
    private readonly setStatusFn: (personId: string, sourceName: string, status: SourceStatus) => Promise<void>;
    private readonly getEmojiFn: (status: SourceStatus) => string;
    private readonly getNoteLinkFn: (personId: string) => string;
    private readonly saveNoteLinkFn: (personId: string, link: string) => Promise<void>;
    private readonly getPersonFlagsFn: (personId: string) => Set<import('../research/types').PersonFlag>;
    private readonly savePersonFlagsFn: (personId: string, flags: Set<import('../research/types').PersonFlag>) => Promise<void>;
    private readonly getDifficultyOverrideFn: (personId: string) => import('../research/types').DifficultyCategory | undefined;
    private readonly saveDifficultyOverrideFn: (personId: string, override: import('../research/types').DifficultyCategory | undefined) => Promise<void>;
    private readonly reproductiveAgeFn: () => ReproductiveAge;
    private panel: GenResearchPanel | null = null;

    constructor(
        leaf: WorkspaceLeaf,
        gedcomService: GedcomService,
        maxLifespanYears: () => number,
        heuristicsFilePath: () => string,
        loadOverlay: () => OverlayState,
        saveOverlay: (state: OverlayState) => Promise<void>,
        getStatus: (personId: string, sourceName: string) => SourceStatus,
        setStatus: (personId: string, sourceName: string, status: SourceStatus) => Promise<void>,
        getEmoji: (status: SourceStatus) => string,
        getNoteLink: (personId: string) => string,
        saveNoteLink: (personId: string, link: string) => Promise<void>,
        getPersonFlags: (personId: string) => Set<import('../research/types').PersonFlag>,
        savePersonFlags: (personId: string, flags: Set<import('../research/types').PersonFlag>) => Promise<void>,
        getDifficultyOverride: (personId: string) => import('../research/types').DifficultyCategory | undefined,
        saveDifficultyOverride: (personId: string, override: import('../research/types').DifficultyCategory | undefined) => Promise<void>,
        reproductiveAge: () => ReproductiveAge = () => DEFAULT_REPRODUCTIVE_AGE,
    ) {
        super(leaf);
        this.gedcomService = gedcomService;
        this.maxLifespanYears = maxLifespanYears;
        this.heuristicsFilePath = heuristicsFilePath;
        this.loadOverlay = loadOverlay;
        this.saveOverlayFn = saveOverlay;
        this.getStatusFn = getStatus;
        this.setStatusFn = setStatus;
        this.getEmojiFn = getEmoji;
        this.getNoteLinkFn = getNoteLink;
        this.saveNoteLinkFn = saveNoteLink;
        this.getPersonFlagsFn = getPersonFlags;
        this.savePersonFlagsFn = savePersonFlags;
        this.getDifficultyOverrideFn = getDifficultyOverride;
        this.saveDifficultyOverrideFn = saveDifficultyOverride;
        this.reproductiveAgeFn = reproductiveAge;
    }

    getViewType(): string { return GEN_RESEARCH_VIEW; }
    getDisplayText(): string { return t('research.viewTitle'); }
    getIcon(): string { return 'telescope'; }

    async onOpen(): Promise<void> {
        this.gedcomService.getRendererRegistry().register(this);
        this.panel = new GenResearchPanel({
            container: this.contentEl,
            gedcomService: this.gedcomService,
            maxLifespanYears: this.maxLifespanYears(),
            heuristicsFilePath: this.heuristicsFilePath(),
            app: this.app,
            getSourceStatus: this.getStatusFn,
            setSourceStatus: this.setStatusFn,
            getStatusEmoji: this.getEmojiFn,
            getNoteLink: this.getNoteLinkFn,
            saveNoteLink: this.saveNoteLinkFn,
            getPersonFlags: this.getPersonFlagsFn,
            savePersonFlags: this.savePersonFlagsFn,
            getDifficultyOverride: this.getDifficultyOverrideFn,
            saveDifficultyOverride: this.saveDifficultyOverrideFn,
            reproductiveAge: this.reproductiveAgeFn(),
            onSave: async (overlay) => {
                await this.saveOverlayFn(overlay);
            },
        });
        this.panel.render(this.loadOverlay());
    }

    async onClose(): Promise<void> {
        this.gedcomService.getRendererRegistry().unregister(this);
    }

    // Called by renderer registry when GEDCOM data (re)loads
    async rerender(): Promise<void> {
        if (this.panel) {
            this.contentEl.empty();
            this.panel.rerender(this.loadOverlay());
        }
    }
}
