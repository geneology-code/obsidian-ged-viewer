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
            reproductiveAge: this.reproductiveAgeFn(),
            onSave: async (overlay) => {
                await this.saveOverlayFn(overlay);
                // No extra rerender needed — panel already did rerenderCurrent() before calling onSave
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
