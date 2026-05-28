import { ItemView, WorkspaceLeaf } from 'obsidian';
import { GedcomService } from '../gedcom/service';
import { GenResearchPanel } from '../research/GenResearchPanel';
import { parseOverlay } from '../research/overlayParser';
import { OverlayState, DEFAULT_UI_STATE } from '../research/types';
import { t } from '../i18n';

export const GEN_RESEARCH_VIEW = 'gen-research-view';

export class GenResearchView extends ItemView {
    private readonly gedcomService: GedcomService;
    private readonly maxLifespanYears: () => number;
    private readonly loadOverlay: () => OverlayState;
    private readonly saveOverlayFn: (state: OverlayState) => Promise<void>;
    private panel: GenResearchPanel | null = null;

    constructor(
        leaf: WorkspaceLeaf,
        gedcomService: GedcomService,
        maxLifespanYears: () => number,
        loadOverlay: () => OverlayState,
        saveOverlay: (state: OverlayState) => Promise<void>
    ) {
        super(leaf);
        this.gedcomService = gedcomService;
        this.maxLifespanYears = maxLifespanYears;
        this.loadOverlay = loadOverlay;
        this.saveOverlayFn = saveOverlay;
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
            app: this.app,
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
