import { MarkdownRenderChild, MarkdownPostProcessorContext } from 'obsidian';
import { GedcomService } from '../gedcom/service';
import { createChart, DetailedRenderer, ChartColors, ChartHandle, ChartInfo } from 'topola';
import { AncestorChart, DescendantChart, HourglassChart, RelativesChart } from 'topola';
import { t } from '../i18n';
import { zoom, zoomIdentity } from 'd3-zoom';
import { select } from 'd3-selection';
import type { ZoomBehavior, ZoomTransform } from 'd3-zoom';

export type TopolaChartType = 'ancestors' | 'descendants' | 'hourglass' | 'relatives';

/**
 * Extract LVL:N directive from source and return { id, generations }
 */
function parseSource(source: string, defaultGenerations: number): { id: string; generations: number } {
    const trimmed = source.trim();
    const lvlMatch = trimmed.match(/LVL:(\d+)/);
    const generations = lvlMatch ? parseInt(lvlMatch[1], 10) : defaultGenerations;
    const idMatch = trimmed.match(/@([^@]+)@/);
    const id = idMatch ? idMatch[1] : trimmed.replace(/LVL:\d+/g, '').trim();
    return { id, generations };
}

// ─────────────────────────────────────────────────────────────
// Unified graph traversal engine — iterative BFS
// ─────────────────────────────────────────────────────────────

interface TraversalConfig {
    goUpward: boolean;
    goDownward: boolean;
    includeSiblings: boolean;
    includeSiblingFamilies: boolean; // For relatives: traverse siblings' families recursively
    clearSpouseFamc: boolean;
}

type QueueTask =
    | { type: 'indi'; id: string; depth: number; clearFamc: boolean; skipUpward?: boolean }
    | { type: 'fam_up'; id: string; depth: number }     // family where person is a child
    | { type: 'fam_down'; id: string; depth: number };   // family where person is a spouse

/**
 * Iterative BFS graph traversal.
 * No recursion — safe from stack overflow.
 *
 * Depth convention:
 *   0   root person
 *  -1   parents
 *  -2   grandparents
 *  +1   children
 *  +2   grandchildren
 */
function traverseGraph(
    rootId: string,
    generationLimit: number,
    config: TraversalConfig,
    getIndividual: (id: string) => any,
    getFamily: (id: string) => any,
    buildIndiObject: (individual: any, clearFamc: boolean, depth: number) => any,
    parseDate: (dateStr: string) => any
): { indis: any[]; fams: any[] } {
    const indis: any[] = [];
    const fams: any[] = [];
    const processedIndis = new Set<string>();
    const processedFams = new Set<string>();
    const inQueueSet = new Set<string>(); // Prevent duplicate queue entries

    // Local cache to avoid repeated service calls
    const indiRawCache = new Map<string, any>();
    const famRawCache = new Map<string, any>();
    const cleanIdCache = new Map<string, string>(); // Cache cleaned IDs

    const cachedGetIndividual = (id: string): any => {
        if (!indiRawCache.has(id)) indiRawCache.set(id, getIndividual(id));
        return indiRawCache.get(id);
    };
    const cachedGetFamily = (id: string): any => {
        if (!famRawCache.has(id)) famRawCache.set(id, getFamily(id));
        return famRawCache.get(id);
    };

    // Helper to clean IDs with caching
    const cleanId = (id: string): string => {
        if (!cleanIdCache.has(id)) {
            cleanIdCache.set(id, id.replace(/@/g, ''));
        }
        return cleanIdCache.get(id)!;
    };

    const buildFamilyObj = (family: any): any => {
        const marriageDate = family.marriageDate ? parseDate(family.marriageDate) : undefined;
        const divorceDate = family.divorceDate ? parseDate(family.divorceDate) : undefined;
        const husbId = cleanId(family.husbandId || '');
        const wifeId = cleanId(family.wifeId || '');
        const childrenIds = family.childrenIds?.map((id: string) => cleanId(id)) || [];
        return {
            id: cleanId(family.id),
            husb: husbId || undefined,
            wife: wifeId || undefined,
            children: childrenIds,
            marriage: marriageDate ? { date: marriageDate, place: family.marriagePlace || '' } : undefined,
            divorce: divorceDate ? { date: divorceDate, place: family.divorcePlace || '' } : undefined,
        };
    };

    const inBounds = (depth: number): boolean => {
        return Math.abs(depth) <= generationLimit;
    };

    // BFS queue with index (avoid O(n) shift)
    const queue: QueueTask[] = [{ type: 'indi', id: rootId, depth: 0, clearFamc: false }];
    inQueueSet.add(`indi:${rootId}:0`);
    let queueIndex = 0;

    while (queueIndex < queue.length) {
        const task = queue[queueIndex++];

        if (task.type === 'indi') {
            if (processedIndis.has(task.id)) continue;
            if (!inBounds(task.depth)) continue;
            processedIndis.add(task.id);

            const individual = cachedGetIndividual(task.id);
            if (!individual) continue;
            indis.push(buildIndiObject(individual, task.clearFamc, task.depth));

            // Go upward only if not skipped (siblings shouldn't traverse their parents again)
            if (config.goUpward && !task.skipUpward && individual.familiesAsChild && individual.familiesAsChild.length > 0) {
                const famUpId = individual.familiesAsChild[0];
                const queueKey = `fam_up:${famUpId}:${task.depth - 1}`;
                if (!inQueueSet.has(queueKey)) {
                    inQueueSet.add(queueKey);
                    queue.push({ type: 'fam_up', id: famUpId, depth: task.depth - 1 });
                }
            }
            if (config.goDownward && individual.familiesAsSpouse) {
                for (const famId of individual.familiesAsSpouse) {
                    const queueKey = `fam_down:${famId}:${task.depth}`;
                    if (!inQueueSet.has(queueKey)) {
                        inQueueSet.add(queueKey);
                        queue.push({ type: 'fam_down', id: famId, depth: task.depth });
                    }
                }
            }

        } else if (task.type === 'fam_up') {
            if (processedFams.has(task.id)) continue;
            if (!inBounds(task.depth)) continue;
            processedFams.add(task.id);

            const family = cachedGetFamily(task.id);
            if (!family || (!family.husbandId && !family.wifeId)) continue;

            fams.push(buildFamilyObj(family));
            const husbId = cleanId(family.husbandId || '');
            const wifeId = cleanId(family.wifeId || '');
            const childrenIds = family.childrenIds?.map((id: string) => cleanId(id)) || [];

            if (husbId) {
                const queueKey = `indi:${husbId}:${task.depth}`;
                if (!inQueueSet.has(queueKey)) {
                    inQueueSet.add(queueKey);
                    queue.push({ type: 'indi', id: husbId, depth: task.depth, clearFamc: false });
                }
            }
            if (wifeId) {
                const queueKey = `indi:${wifeId}:${task.depth}`;
                if (!inQueueSet.has(queueKey)) {
                    inQueueSet.add(queueKey);
                    queue.push({ type: 'indi', id: wifeId, depth: task.depth, clearFamc: false });
                }
            }

            // FIX: Siblings logic depends on chart type
            // - hourglass: only root siblings (from depth -1)
            // - relatives: ALL siblings from ALL fam_up + their families (but skip upward to avoid duplicates)
            if (config.includeSiblings) {
                const shouldIncludeAllSiblings = config.includeSiblingFamilies || task.depth === -1;
                if (shouldIncludeAllSiblings) {
                    for (const childId of childrenIds) {
                        if (childId !== cleanId(rootId) && !processedIndis.has(childId)) {
                            const siblingDepth = task.depth + 1; // Siblings are at same generation as parents + 1
                            if (inBounds(siblingDepth)) {
                                const queueKey = `indi:${childId}:${siblingDepth}`;
                                if (!inQueueSet.has(queueKey)) {
                                    inQueueSet.add(queueKey);
                                    // For relatives: skip upward traversal for siblings (their parents are already processed)
                                    queue.push({ type: 'indi', id: childId, depth: siblingDepth, clearFamc: false, skipUpward: config.includeSiblingFamilies });
                                }
                                
                                // For relatives: also add sibling's families to traverse their spouse/children
                                if (config.includeSiblingFamilies) {
                                    const sibling = cachedGetIndividual(childId);
                                    if (sibling && sibling.familiesAsSpouse) {
                                        for (const famId of sibling.familiesAsSpouse) {
                                            const famQueueKey = `fam_down:${famId}:${siblingDepth}`;
                                            if (!inQueueSet.has(famQueueKey)) {
                                                inQueueSet.add(famQueueKey);
                                                queue.push({ type: 'fam_down', id: famId, depth: siblingDepth });
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }

        } else if (task.type === 'fam_down') {
            if (processedFams.has(task.id)) continue;
            if (!inBounds(task.depth)) continue;
            processedFams.add(task.id);

            const family = cachedGetFamily(task.id);
            if (!family || (!family.husbandId && !family.wifeId)) continue;

            fams.push(buildFamilyObj(family));
            const husbId = cleanId(family.husbandId || '');
            const wifeId = cleanId(family.wifeId || '');
            const childrenIds = family.childrenIds?.map((id: string) => cleanId(id)) || [];

            if (husbId && !processedIndis.has(husbId)) {
                const queueKey = `indi:${husbId}:${task.depth}`;
                if (!inQueueSet.has(queueKey)) {
                    inQueueSet.add(queueKey);
                    queue.push({ type: 'indi', id: husbId, depth: task.depth, clearFamc: config.clearSpouseFamc });
                }
            }
            if (wifeId && !processedIndis.has(wifeId)) {
                const queueKey = `indi:${wifeId}:${task.depth}`;
                if (!inQueueSet.has(queueKey)) {
                    inQueueSet.add(queueKey);
                    queue.push({ type: 'indi', id: wifeId, depth: task.depth, clearFamc: config.clearSpouseFamc });
                }
            }

            if (config.goDownward) {
                for (const childId of childrenIds) {
                    if (!processedIndis.has(childId)) {
                        const childDepth = task.depth + 1;
                        if (inBounds(childDepth)) {
                            const queueKey = `indi:${childId}:${childDepth}`;
                            if (!inQueueSet.has(queueKey)) {
                                inQueueSet.add(queueKey);
                                queue.push({ type: 'indi', id: childId, depth: childDepth, clearFamc: false });
                            }
                        }
                    }
                }
            }
        }
    }

    // ── Post-processing: ensure data consistency ──
    const indisIds = new Set(indis.map((i: any) => i.id));
    const indisMap = new Map(indis.map((i: any) => [i.id, i]));
    const famsIds = new Set(fams.map((f: any) => f.id));

    // Remove broken references in families
    for (const fam of fams) {
        if (fam.husb && !indisIds.has(fam.husb)) fam.husb = undefined;
        if (fam.wife && !indisIds.has(fam.wife)) fam.wife = undefined;
        if (fam.children) {
            fam.children = fam.children.filter((childId: string) => indisIds.has(childId));
        }
    }

    // Remove families with no parents
    const cleanedFams = fams.filter((fam: any) => fam.husb || fam.wife);

    // Fix indi references and clean boundary links to prevent Topola from over-traversing
    for (const indi of indis) {
        const indiDepth = indi._depth ?? 0;
        
        // Clean famc/fams for boundary individuals to prevent Topola from traversing beyond limits
        // This applies to ALL chart types including relatives
        if (config.goUpward && indiDepth <= -generationLimit) {
            // At max upward depth, remove famc (don't go further up)
            indi.famc = undefined;
            indi.getFamilyAsChild = () => null;
        }
        if (config.goDownward && indiDepth >= generationLimit) {
            // At max downward depth, remove fams (don't go further down)
            indi.fams = [];
            indi.getFamiliesAsSpouse = () => [];
        }
        
        // Regular reference validation
        if (indi.famc && !famsIds.has(indi.famc)) {
            indi.famc = undefined;
        }
        if (indi.fams) {
            indi.fams = indi.fams.filter((f: string) => famsIds.has(f));
        }

        // Fix getFamilyAsChild to return proper family object
        if (!indi.famc) {
            indi.getFamilyAsChild = () => null;
        } else {
            const fam = cleanedFams.find((f: any) => f.id === indi.famc);
            if (fam && (fam.husb || fam.wife)) {
                const fatherId = fam.husb;
                const motherId = fam.wife;
                indi.getFamilyAsChild = () => ({
                    getId: () => indi.famc,
                    getFather: () => (fatherId && indisMap.has(fatherId) ? indisMap.get(fatherId) : null),
                    getMother: () => (motherId && indisMap.has(motherId) ? indisMap.get(motherId) : null),
                    arraySelect: () => [], length: 0, value: () => []
                });
            } else {
                indi.famc = undefined;
                indi.getFamilyAsChild = () => null;
            }
        }
        
        // Remove temporary _depth field
        delete indi._depth;
    }

    return { indis, fams: cleanedFams };
}

/** Chart type → traversal config */
const CHART_CONFIGS: Record<TopolaChartType, TraversalConfig> = {
    ancestors:    { goUpward: true,  goDownward: false, includeSiblings: false, includeSiblingFamilies: false, clearSpouseFamc: false },
    descendants:  { goUpward: false, goDownward: true,  includeSiblings: false, includeSiblingFamilies: false, clearSpouseFamc: true  },
    hourglass:    { goUpward: true,  goDownward: true,  includeSiblings: true,  includeSiblingFamilies: false, clearSpouseFamc: true  },
    relatives:    { goUpward: true,  goDownward: true,  includeSiblings: true,  includeSiblingFamilies: true,  clearSpouseFamc: false },
};

/**
 * Renderer for GEDCOM diagrams using Topola library
 */
export class TopolaDiagramRenderer extends MarkdownRenderChild {
    // Shared cache across all renderer instances — avoids repeated service calls
    // when multiple diagrams render on the same page
    private static _rawIndiCache = new Map<string, any>();
    private static _rawFamCache = new Map<string, any>();
    private static _fontLoaded = false; // Track font loading status

    private gedcomService: GedcomService;
    private source: string;
    private ctx: MarkdownPostProcessorContext;
    private chartType: TopolaChartType;
    private defaultGenerations: number;
    private uniqueId: string;
    private chart: ChartHandle | null = null;
    private chartInfo: ChartInfo | null = null; // Saved after render for coordinate calculations
    private svgElement: SVGSVGElement | null = null;
    private isExpanded = false;
    private resizeObserver: ResizeObserver | null = null;

    // Zoom state
    private zoomBehavior: ZoomBehavior<HTMLElement, unknown> | null = null;
    private currentTransform: ZoomTransform = zoomIdentity;
    private fitScale = 1;
    private maxScale = 5;
    private rootIndividualId = '';
    private chartWrapper: HTMLElement | null = null;
    private toolbarContainer: HTMLElement | null = null;
    private zoomSlider: HTMLInputElement | null = null;
    private toggleBtn: HTMLButtonElement | null = null;
    private zoomInBtn: HTMLButtonElement | null = null;
    private zoomOutBtn: HTMLButtonElement | null = null;
    private fitToViewBtn: HTMLButtonElement | null = null;
    private focusOnRootBtn: HTMLButtonElement | null = null;

    constructor(
        container: HTMLElement,
        source: string,
        gedcomService: GedcomService,
        ctx: MarkdownPostProcessorContext,
        chartType: TopolaChartType,
        defaultGenerations: number = 3
    ) {
        super(container);
        this.gedcomService = gedcomService;
        this.source = source;
        this.ctx = ctx;
        this.chartType = chartType;
        this.defaultGenerations = defaultGenerations;
        const sourceHash = source.trim().replace(/@/g, '').replace(/\s+/g, '-').replace(/LVL:/g, '');
        this.uniqueId = `topola-${chartType}-${sourceHash}`;
    }

    async onload(): Promise<void> {
        super.onload();
        
        // Wait for element to be in DOM before rendering
        requestAnimationFrame(() => {
            this.render();
        });
    }

    async onunload(): Promise<void> {
        // Clean up the chart reference
        if (this.chart) {
            this.chart = null;
        }

        // Clean up SVG element
        if (this.svgElement) {
            while (this.svgElement.firstChild) {
                this.svgElement.removeChild(this.svgElement.firstChild);
            }
            this.svgElement = null;
        }

        // Clean up ResizeObserver
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
            this.resizeObserver = null;
        }

        // Clean up zoom behavior
        if (this.zoomBehavior && this.chartWrapper) {
            const wrapperEl = this.chartWrapper.querySelector('.topola-chart-wrapper');
            if (wrapperEl) {
                select(wrapperEl as HTMLElement).on('.zoom', null);
            }
        }
        this.zoomBehavior = null;

        super.onunload();
    }

    async render(): Promise<void> {
        // Clear container completely on each render
        this.containerEl.innerHTML = '';

        if (!this.gedcomService.getIsDataLoaded()) {
            this.containerEl.createEl('p', { text: t('diagram.noData') });
            return;
        }

        const { id: individualId, generations } = parseSource(this.source, this.defaultGenerations);

        if (!individualId) {
            this.containerEl.createEl('p', { text: t('diagram.noId') });
            return;
        }

        // Check if individual exists
        const individual = this.gedcomService.getIndividual(individualId);

        if (!individual) {
            this.containerEl.createEl('p', {
                text: t('diagram.personNotFound', { id: individualId }),
                cls: 'gedcom-diagram-error'
            });
            return;
        }

        // Convert GEDCOM data to Topola JSON format using unified traversal
        const jsonData = this.collectGraph(individualId, generations);

        // Store root individual ID for focus functionality
        this.rootIndividualId = individualId.replace(/@/g, '');

        // Validate data
        if (jsonData.indis.length === 0) {
            this.containerEl.createEl('p', {
                text: t('diagram.noDataFound', { id: individualId }),
                cls: 'gedcom-diagram-error'
            });
            return;
        }

        // Check for specific chart requirements
        const chartRequirements: Record<TopolaChartType, string> = {
            'ancestors': 'ancestors (parents, grandparents)',
            'descendants': 'descendants (children, grandchildren)',
            'hourglass': 'both ancestors and descendants',
            'relatives': 'relatives (any family connections)',
        };

        if (jsonData.fams.length === 0) {
            this.containerEl.createEl('p', {
                text: t('diagram.noFamilyData', { type: chartRequirements[this.chartType] }),
                cls: 'gedcom-diagram-warning'
            });
        }

        // Create container with unique ID
        const svgContainer = this.containerEl.createDiv({ cls: 'topola-diagram-container' });
        svgContainer.setAttribute('data-topola-id', this.uniqueId);

        // Create toolbar with toggle button and zoom controls
        this.toolbarContainer = svgContainer.createDiv({ cls: 'topola-toolbar' });

        // Toggle width button
        this.toggleBtn = this.toolbarContainer.createEl('button', {
            cls: 'topola-toggle-width-btn',
            text: '<>',
            attr: { 'aria-label': t('diagram.toggleWidth') }
        });

        // Zoom controls container
        const zoomControls = this.toolbarContainer.createDiv({ cls: 'topola-zoom-controls' });

        // Zoom in/out buttons
        this.zoomOutBtn = zoomControls.createEl('button', {
            cls: 'topola-zoom-btn',
            text: '−',
            attr: { 'aria-label': t('diagram.zoomOut') }
        });
        this.zoomInBtn = zoomControls.createEl('button', {
            cls: 'topola-zoom-btn',
            text: '+',
            attr: { 'aria-label': t('diagram.zoomIn') }
        });

        // Zoom slider
        this.zoomSlider = zoomControls.createEl('input', {
            cls: 'topola-zoom-slider',
            attr: {
                type: 'range',
                min: '0',
                max: '100',
                value: '50',
                'aria-label': t('diagram.zoomLevel')
            }
        });

        // Fit to view and focus on root buttons
        this.fitToViewBtn = zoomControls.createEl('button', {
            cls: 'topola-zoom-btn',
            text: '⊞',
            attr: { 'aria-label': t('diagram.fitToView') }
        });
        this.focusOnRootBtn = zoomControls.createEl('button', {
            cls: 'topola-zoom-btn',
            text: '👤',
            attr: { 'aria-label': t('diagram.focusOnRoot') }
        });

        // Store reference for later access
        this.chartWrapper = svgContainer;

        // Setup ResizeObserver to track editor size changes (like Chronos)
        this._setupEditorResizeObserver(svgContainer);

        // Toggle width handler
        const toggleWidth = () => {
            if (!this.isExpanded) {
                this.isExpanded = this._expandTimeline(svgContainer, this.toggleBtn!);
            } else {
                this._collapseTimeline(svgContainer, this.toggleBtn!);
                this.isExpanded = false;
            }

            // Refit chart after width change
            this._refitChart();
        };

        this.toggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.stopImmediatePropagation();
            e.preventDefault();
            toggleWidth();
        }, true);

        // Zoom button handlers
        this.zoomInBtn!.addEventListener('click', (e) => {
            e.stopPropagation();
            this._zoomIn();
        });

        this.zoomOutBtn!.addEventListener('click', (e) => {
            e.stopPropagation();
            this._zoomOut();
        });

        this.fitToViewBtn!.addEventListener('click', (e) => {
            e.stopPropagation();
            this._fitToView();
        });

        this.focusOnRootBtn!.addEventListener('click', (e) => {
            e.stopPropagation();
            this._focusOnRoot();
        });

        // Zoom slider handler
        this.zoomSlider!.addEventListener('input', (e) => {
            const sliderValue = parseInt((e.target as HTMLInputElement).value, 10);
            this._applyZoomFromSlider(sliderValue);
        });

        // Close on Escape key
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && this.isExpanded) {
                this._collapseTimeline(svgContainer, this.toggleBtn!);
                this.isExpanded = false;
                this._refitChart();
            }
        };
        document.addEventListener('keydown', handleEscape);

        // Check if SVG already exists in DOM with this selector (from previous render)
        const existingSvgInDom = document.querySelector(`[data-topola-id="${this.uniqueId}"] .topola-chart-wrapper .topola-svg`);
        if (existingSvgInDom) {
            existingSvgInDom.remove();
        }

        // Create SVG element properly using DOM API (not innerHTML)
        // Wrap SVG in a container with overflow:auto to preserve scrolling when expanded
        const chartWrapper = document.createElement('div');
        chartWrapper.className = 'topola-chart-wrapper';
        svgContainer.appendChild(chartWrapper);

        this.svgElement = document.createElementNS('http://www.w3.org/2000/svg', 'svg') as SVGSVGElement;
        this.svgElement.setAttribute('class', 'topola-svg');
        chartWrapper.appendChild(this.svgElement);

        // CRITICAL: If container is not in DOM, skip rendering
        if (!document.contains(this.containerEl)) {
            return;
        }
        
        if (!document.contains(this.svgElement)) {
            return;
        }

        // Select chart type and renderer
        let ChartClass: any;
        switch (this.chartType) {
            case 'ancestors':
                ChartClass = AncestorChart;
                break;
            case 'descendants':
                ChartClass = DescendantChart;
                break;
            case 'hourglass':
                ChartClass = HourglassChart;
                break;
            case 'relatives':
                ChartClass = RelativesChart;
                break;
        }

        const RendererClass = DetailedRenderer;

        // Create and render chart
        try {
            const selector = `[data-topola-id="${this.uniqueId}"] .topola-svg`;

            // Ensure Montserrat font is loaded only once
            await TopolaDiagramRenderer.ensureFontLoaded();

            // Validate jsonData before passing to Topola
            if (!jsonData.indis || jsonData.indis.length === 0) {
                throw new Error('No individuals data available for chart');
            }

            this.chart = createChart({
                json: jsonData,
                svgSelector: selector,
                chartType: ChartClass,
                renderer: RendererClass,
                animate: true,
                updateSvgSize: true,
                horizontal: false,
                colors: ChartColors.COLOR_BY_GENERATION,
            });

            this.chartInfo = this.chart.render({ startIndi: individualId });

            // Set dynamic container height based on diagram size
            this._setContainerHeight();

            // Initialize zoom after chart is rendered
            this._initZoomControls();
        } catch (error: any) {
            let errorMessage = `Error rendering ${this.chartType} diagram for @${individualId}@: ${error?.message || 'Unknown error'}`;
            if (error.message?.includes('getFamilyAsChild') || error.message?.includes('getFather')) {
                errorMessage += '\n\nFamily tree data structure issue.';
            } else if (error.message?.includes('getFamiliesAsSpouse')) {
                errorMessage += '\n\nSpouse data structure issue.';
            }
            this.containerEl.createEl('p', { text: errorMessage, cls: 'gedcom-diagram-error' });
        }
    }

    // ─────────────────────────────────────────────────────────────
    //  Data collection using unified traversal engine
    // ─────────────────────────────────────────────────────────────

    /**
     * Parse GEDCOM date to Topola date format.
     */
    private parseDate(dateStr: string): any {
        if (!dateStr) return undefined;
        const match = dateStr.match(/(\d{1,2})?\s*(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)?\s*(\d{4})/i);
        if (match) {
            const monthMap: Record<string, number> = {
                'JAN': 1, 'FEB': 2, 'MAR': 3, 'APR': 4, 'MAY': 5, 'JUN': 6,
                'JUL': 7, 'AUG': 8, 'SEP': 9, 'OCT': 10, 'NOV': 11, 'DEC': 12
            };

            return {
                day: match[1] ? parseInt(match[1], 10) : undefined,
                month: match[2] ? monthMap[match[2].toUpperCase()] : undefined,
                year: match[3] ? parseInt(match[3], 10) : undefined,
            };
        }
        const yearMatch = dateStr.match(/^(\d{4})$/);
        if (yearMatch) {
            return { year: parseInt(yearMatch[1], 10) };
        }
        return undefined;
    }

    /**
     * Build a Topola-compatible individual object.
     */
    private buildIndiObject(individual: any, clearFamc: boolean = false, depth: number = 0): any {
        const birthDate = individual.birthDate ? this.parseDate(individual.birthDate) : undefined;
        const deathDate = individual.deathDate ? this.parseDate(individual.deathDate) : undefined;
        const famcValue = clearFamc
            ? undefined
            : (individual.familiesAsChild && individual.familiesAsChild.length > 0
                ? individual.familiesAsChild[0].replace(/@/g, '')
                : undefined);
        const famsValue = individual.familiesAsSpouse?.map((fid: string) => fid.replace(/@/g, '')) || [];

        // Simplified family stubs - only essential properties
        const familyStubs: any[] = [];
        for (const famId of famsValue) {
            familyStubs.push({
                getId: () => famId,
                getFamiliesAsSpouse: () => familyStubs,
                length: familyStubs.length,
                value: () => [famId]
            });
        }

        return {
            id: individual.id.replace(/@/g, ''),
            firstName: individual.firstName || '',
            lastName: individual.surname || '',
            maidenName: individual.surname || '',
            birth: (birthDate || individual.birthPlace) ? { date: birthDate, place: individual.birthPlace || undefined } : undefined,
            death: (deathDate || individual.deathPlace) ? { date: deathDate, place: individual.deathPlace || undefined } : undefined,
            sex: this.getSex(individual),
            famc: famcValue,
            fams: famsValue,
            _depth: depth, // Temporary depth for boundary cleaning
            getFamilyAsChild: () => famcValue ? {
                getId: () => famcValue, getFather: () => null, getMother: () => null,
                arraySelect: () => [], length: 1, value: () => [famcValue]
            } : null,
            getFamiliesAsSpouse: () => familyStubs,
            getId: () => individual.id.replace(/@/g, ''),
        };
    }

    /**
     * Ensure Montserrat font is loaded only once across all renders.
     */
    private static async ensureFontLoaded(): Promise<void> {
        if (TopolaDiagramRenderer._fontLoaded) return;
        try {
            await document.fonts.load('12px Montserrat');
            await document.fonts.ready;
            TopolaDiagramRenderer._fontLoaded = true;
        } catch (e) {
            console.warn('[Topola] Failed to load Montserrat font:', e);
            TopolaDiagramRenderer._fontLoaded = true; // Mark as loaded to avoid retrying
        }
    }

    /**
     * Determine sex from individual data.
     */
    private getSex(individual: any): string {
        if (individual.sex) return individual.sex;
        const firstName = individual.firstName || '';
        if (firstName.toLowerCase() === firstName) return 'M';
        return 'F';
    }

    /**
     * Get current editor width.
     */
    private _getCurrentEditorWidth(container: HTMLElement): number {
        const editorEl = container.closest('.markdown-source-view') as HTMLElement;
        if (editorEl) {
            return editorEl.offsetWidth;
        }
        return 0;
    }

    /**
     * Update CSS custom property for editor width (like Chronos does).
     */
    private _updateChronosWidth(container: HTMLElement, newWidth: number): void {
        const editorEl = container.closest('.markdown-source-view') as HTMLElement;
        if (editorEl) {
            editorEl.style.setProperty('--topola-editor-width', `${newWidth}px`);
        }
    }

    /**
     * Setup ResizeObserver to track editor size changes (like Chronos).
     */
    private _setupEditorResizeObserver(container: HTMLElement): void {
        const attemptSetup = (attempt = 1) => {
            const editorEl = container.closest('.markdown-source-view') as HTMLElement;

            if (!editorEl && attempt <= 5) {
                setTimeout(() => attemptSetup(attempt + 1), attempt * 100);
                return;
            }

            if (!editorEl) {
                console.debug('[Topola] Could not find .markdown-source-view element after 5 attempts');
                return;
            }

            let lastWidth = editorEl.offsetWidth;

            this.resizeObserver = new ResizeObserver((entries) => {
                for (const entry of entries) {
                    const currentWidth = entry.contentRect.width;

                    if (currentWidth !== lastWidth) {
                        lastWidth = currentWidth;

                        // Only update if there are expanded topola blocks in this editor
                        const hasExpanded = editorEl.querySelector('.topola-width-expanded');

                        if (hasExpanded && currentWidth > 0) {
                            editorEl.style.setProperty('--topola-editor-width', `${currentWidth}px`);
                        }
                    }
                }
            });

            try {
                this.resizeObserver.observe(editorEl);
            } catch (error) {
                console.error('[Topola] Failed to observe editor element:', error);
            }
        };

        attemptSetup();
    }

    /**
     * Expand timeline to full editor width (like Chronos).
     */
    private _expandTimeline(container: HTMLElement, toggleBtn: HTMLButtonElement): boolean {
        const grandparent = this._getTimelineGrandparent(container);
        if (!grandparent) return false;

        const editorWidth = this._getCurrentEditorWidth(container);
        if (editorWidth <= 0) return false;

        this._updateChronosWidth(container, editorWidth);
        container.classList.add('topola-width-expanded');
        grandparent.classList.add('topola-width-expanded');
        toggleBtn.textContent = '><';
        toggleBtn.setAttribute('aria-label', t('diagram.toggleNormal'));

        return true;
    }

    /**
     * Collapse timeline to normal width (like Chronos).
     */
    private _collapseTimeline(container: HTMLElement, toggleBtn: HTMLButtonElement): void {
        const grandparent = this._getTimelineGrandparent(container);
        if (!grandparent) return;

        container.classList.remove('topola-width-expanded');
        grandparent.classList.remove('topola-width-expanded');
        toggleBtn.textContent = '<>';
        toggleBtn.setAttribute('aria-label', t('diagram.toggleWidth'));
    }

    /**
     * Get the timeline's grandparent element for width manipulation (like Chronos).
     */
    private _getTimelineGrandparent(container: HTMLElement): HTMLElement | null {
        // Try multiple possible selectors for different code block types
        const selectors = [
            '.cm-lang-ged-diagram-ancestors.cm-preview-code-block',
            '.cm-lang-ged-diagram-descendants.cm-preview-code-block',
            '.cm-lang-ged-diagram-hourglass.cm-preview-code-block',
            '.cm-lang-ged-diagram-relatives.cm-preview-code-block',
            '.cm-preview-code-block',
            '.cm-embed-block',
        ];
        
        for (const selector of selectors) {
            const grandparent = container.closest(selector) as HTMLElement;
            if (grandparent) return grandparent;
        }
        return null;
    }

    /**
     * Trigger chart refit after width changes (like Chronos).
     */
    private _refitChart(): void {
        setTimeout(() => {
            if (this.chart) {
                this.chartInfo = this.chart.render({ startIndi: this.source.trim().replace(/LVL:\d+/g, '').replace(/@/g, '').trim() });
                // Recalculate container height and fit scale after re-render
                this._setContainerHeight();
                this._calculateFitScale();
            }
        }, 300);
    }

    // ─────────────────────────────────────────────────────────────
    //  Zoom controls
    // ─────────────────────────────────────────────────────────────

    /**
     * Set container height dynamically based on diagram size.
     * - Small diagrams: show full height (no scroll)
     * - Large diagrams: cap at 80vh for compact viewport
     * - Minimum: 400px
     */
    private _setContainerHeight(): void {
        if (!this.chartInfo) return;

        const svgHeight = this.chartInfo.size[1];
        const maxVpHeight = window.innerHeight * 0.8;
        const minHeight = 400;

        const height = Math.max(minHeight, Math.min(svgHeight, maxVpHeight));
        this.containerEl.style.height = `${height}px`;
    }

    /**
     * Initialize d3-zoom behavior and set initial scale.
     */
    private _initZoomControls(): void {
        if (!this.svgElement || !this.chartWrapper) return;

        // Calculate fit scale
        this._calculateFitScale();

        // Initialize d3-zoom on the chart wrapper
        const wrapperEl = this.chartWrapper.querySelector('.topola-chart-wrapper');
        if (!wrapperEl) return;

        this.zoomBehavior = zoom<HTMLElement, unknown>()
            .scaleExtent([this.fitScale * 0.8, this.maxScale])
            .on('zoom', (event: any) => {
                this.currentTransform = event.transform;
                this._applyTransform(event.transform);
                this._updateSliderFromZoom();
            });

        select(wrapperEl as HTMLElement)
            .call(this.zoomBehavior);

        // Set initial transform to fit view
        this._fitToView();
    }

    /**
     * Calculate the scale needed to fit the entire chart in the viewport.
     */
    private _calculateFitScale(): void {
        if (!this.svgElement || !this.chartWrapper || !this.chartInfo) return;

        const wrapperEl = this.chartWrapper.querySelector('.topola-chart-wrapper');
        if (!wrapperEl) return;

        // Use container height (fixed), not wrapper height (expands to content)
        const containerWidth = this.containerEl.clientWidth;
        const containerHeight = this.containerEl.clientHeight;
        const toolbarHeight = 40;

        const availableWidth = containerWidth - 20; // 20px padding
        const availableHeight = containerHeight - toolbarHeight; // toolbar takes ~40px

        if (availableWidth <= 0 || availableHeight <= 0) return;

        const diagramWidth = this.chartInfo.size[0];
        const diagramHeight = this.chartInfo.size[1];

        this.fitScale = Math.min(
            availableWidth / diagramWidth,
            availableHeight / diagramHeight,
            1 // Don't scale up beyond 1x if diagram is small
        );

        // Update slider max value based on maxScale
        if (this.zoomSlider) {
            this.zoomSlider.max = '100';
        }
    }

    /**
     * Zoom in by 25%.
     */
    private _zoomIn(): void {
        if (!this.zoomBehavior || !this.chartWrapper) return;

        const wrapperEl = this.chartWrapper.querySelector('.topola-chart-wrapper');
        if (!wrapperEl) return;

        const newScale = this.currentTransform.k * 1.25;
        const clampedScale = Math.min(newScale, this.maxScale);

        const newTransform = this.currentTransform.scale(clampedScale / this.currentTransform.k);

        select(wrapperEl as HTMLElement)
            .transition()
            .duration(200)
            .call(this.zoomBehavior.transform, newTransform);
    }

    /**
     * Zoom out by 25%.
     */
    private _zoomOut(): void {
        if (!this.zoomBehavior || !this.chartWrapper) return;

        const wrapperEl = this.chartWrapper.querySelector('.topola-chart-wrapper');
        if (!wrapperEl) return;

        const newScale = this.currentTransform.k * 0.8;
        const clampedScale = Math.max(newScale, this.fitScale * 0.8);

        const newTransform = this.currentTransform.scale(clampedScale / this.currentTransform.k);

        select(wrapperEl as HTMLElement)
            .transition()
            .duration(200)
            .call(this.zoomBehavior.transform, newTransform);
    }

    /**
     * Fit the entire chart in the viewport.
     */
    private _fitToView(): void {
        if (!this.zoomBehavior || !this.chartWrapper || !this.svgElement || !this.chartInfo) return;

        const wrapperEl = this.chartWrapper.querySelector('.topola-chart-wrapper');
        if (!wrapperEl) return;

        this._calculateFitScale();

        const wrapperWidth = wrapperEl.clientWidth;
        const wrapperHeight = wrapperEl.getBoundingClientRect().height; // Visible height of wrapper
        const containerHeight = this.containerEl.clientHeight;

        const diagramWidth = this.chartInfo.size[0];
        const diagramHeight = this.chartInfo.size[1];

        // Center the diagram
        const translateX = (wrapperWidth - diagramWidth * this.fitScale) / 2;
        const translateY = (containerHeight - diagramHeight * this.fitScale) / 2;

        console.log('[Topola] _fitToView debug:');
        console.log('[Topola] containerEl clientHeight:', containerHeight);
        console.log('[Topola] wrapperEl clientWidth:', wrapperWidth, 'getBoundingClientRect height:', wrapperHeight);
        console.log('[Topola] diagram size:', diagramWidth, 'x', diagramHeight);
        console.log('[Topola] fitScale:', this.fitScale);
        console.log('[Topola] scaled diagram:', diagramWidth * this.fitScale, 'x', diagramHeight * this.fitScale);
        console.log('[Topola] translateX:', translateX, 'translateY:', translateY);

        const fitTransform = zoomIdentity
            .translate(translateX, translateY)
            .scale(this.fitScale);

        select(wrapperEl as HTMLElement)
            .transition()
            .duration(300)
            .call(this.zoomBehavior.transform, fitTransform);
    }

    /**
     * Focus on the root individual (center on them).
     */
    private _focusOnRoot(): void {
        console.log('[Topola] _focusOnRoot called, rootIndividualId:', this.rootIndividualId);
        console.log('[Topola] chartInfo:', this.chartInfo);

        if (!this.zoomBehavior || !this.chartWrapper || !this.svgElement || !this.chartInfo) {
            console.warn('[Topola] Missing required objects');
            return;
        }

        const wrapperEl = this.chartWrapper.querySelector('.topola-chart-wrapper');
        if (!wrapperEl) {
            console.warn('[Topola] Cannot find .topola-chart-wrapper');
            return;
        }

        // Find root individual via clipPath id="clip-I44" → parent g.indi
        let relCenterX: number | null = null;
        let relCenterY: number | null = null;

        const clipPathSelector = `clipPath[id="clip-${this.rootIndividualId}"]`;
        console.log('[Topola] Searching for clipPath:', clipPathSelector);

        const clipPath = this.svgElement.querySelector(clipPathSelector);
        console.log('[Topola] clipPath found:', clipPath);

        if (clipPath) {
            const parentIndi = clipPath.closest('g.indi');
            console.log('[Topola] parentIndi:', parentIndi);

            if (parentIndi) {
                // Parse transform to get position relative to root group
                const transform = parentIndi.getAttribute('transform');
                console.log('[Topola] transform attribute:', transform);

                if (transform) {
                    const match = transform.match(/translate\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)/);
                    if (match) {
                        const tx = parseFloat(match[1]);
                        const ty = parseFloat(match[2]);
                        console.log('[Topola] tx:', tx, 'ty:', ty);

                        // Get card dimensions from background rect
                        const bgRect = parentIndi.querySelector('rect.background');
                        if (bgRect) {
                            const width = parseFloat(bgRect.getAttribute('width') || '100');
                            const height = parseFloat(bgRect.getAttribute('height') || '60');
                            relCenterX = tx + width / 2;
                            relCenterY = ty + height / 2;
                            console.log('[Topola] card width:', width, 'height:', height);
                            console.log('[Topola] relCenterX:', relCenterX, 'relCenterY:', relCenterY);
                        }
                    }
                }
            }
        }

        if (relCenterX === null || relCenterY === null) {
            console.warn('[Topola] Using fallback center');
            // Fallback: center of the chart
            relCenterX = this.chartInfo.size[0] / 2;
            relCenterY = this.chartInfo.size[1] / 2;
        }

        // Topola applies origin to the root <g> group: translate(origin[0], origin[1])
        // g.indi coordinates are RELATIVE to this origin
        // Real position in SVG coordinates = origin + relative position
        const realCenterX = this.chartInfo.origin[0] + relCenterX;
        const realCenterY = this.chartInfo.origin[1] + relCenterY;

        console.log('[Topola] origin:', this.chartInfo.origin);
        console.log('[Topola] realCenterX:', realCenterX, 'realCenterY:', realCenterY);

        const wrapperWidth = wrapperEl.clientWidth;
        const containerHeight = this.containerEl.clientHeight;

        // Calculate scale - use a comfortable zoom level (1.5x fit scale or 1.0)
        const focusScale = Math.max(this.fitScale * 1.5, 0.8);

        console.log('[Topola] wrapperWidth:', wrapperWidth, 'containerHeight:', containerHeight);
        console.log('[Topola] fitScale:', this.fitScale, 'focusScale:', focusScale);

        // Center the viewport on root individual position at the given scale
        const translateX = wrapperWidth / 2 - realCenterX * focusScale;
        const translateY = containerHeight / 2 - realCenterY * focusScale;

        console.log('[Topola] translateX:', translateX, 'translateY:', translateY);

        const focusTransform = zoomIdentity
            .translate(translateX, translateY)
            .scale(focusScale);

        console.log('[Topola] focusTransform:', focusTransform);

        select(wrapperEl as HTMLElement)
            .transition()
            .duration(300)
            .call(this.zoomBehavior.transform, focusTransform);
    }

    /**
     * Apply zoom transform to SVG element.
     */
    private _applyTransform(transform: ZoomTransform): void {
        if (!this.svgElement) return;

        this.svgElement.style.transform = `translate(${transform.x}px, ${transform.y}px) scale(${transform.k})`;
        this.svgElement.style.transformOrigin = '0 0';
    }

    /**
     * Apply zoom from slider position (0-100).
     */
    private _applyZoomFromSlider(sliderValue: number): void {
        if (!this.zoomBehavior || !this.chartWrapper) return;

        const wrapperEl = this.chartWrapper.querySelector('.topola-chart-wrapper');
        if (!wrapperEl) return;

        // Map slider value (0-100) to scale (fitScale to maxScale)
        const minScale = this.fitScale * 0.8;
        const scale = minScale + (this.maxScale - minScale) * (sliderValue / 100);

        // Keep current center position
        const centerX = wrapperEl.clientWidth / 2;
        const centerY = this.containerEl.clientHeight / 2;

        const newTransform = zoomIdentity
            .translate(centerX - (centerX - this.currentTransform.x) * (scale / this.currentTransform.k),
                       centerY - (centerY - this.currentTransform.y) * (scale / this.currentTransform.k))
            .scale(scale);

        select(wrapperEl as HTMLElement)
            .call(this.zoomBehavior.transform, newTransform);
    }

    /**
     * Update slider position to reflect current zoom level.
     */
    private _updateSliderFromZoom(): void {
        if (!this.zoomSlider) return;

        const minScale = this.fitScale * 0.8;
        const sliderValue = Math.round(
            ((this.currentTransform.k - minScale) / (this.maxScale - minScale)) * 100
        );

        this.zoomSlider.value = String(Math.max(0, Math.min(100, sliderValue)));
    }

    /**
     * Collect graph data using the unified traversal engine.
     * Post-processing is now done in traverseGraph for efficiency.
     */
    private collectGraph(rootId: string, maxGenerations: number): { indis: any[]; fams: any[] } {
        const config = CHART_CONFIGS[this.chartType];
        const generationLimit = maxGenerations > 0 ? maxGenerations : 3;

        // Use shared static cache so multiple diagrams on same page don't repeat service calls
        const result = traverseGraph(
            rootId,
            generationLimit,
            config,
            (id: string) => {
                if (!TopolaDiagramRenderer._rawIndiCache.has(id)) {
                    TopolaDiagramRenderer._rawIndiCache.set(id, this.gedcomService.getIndividual(id));
                }
                return TopolaDiagramRenderer._rawIndiCache.get(id);
            },
            (id: string) => {
                if (!TopolaDiagramRenderer._rawFamCache.has(id)) {
                    TopolaDiagramRenderer._rawFamCache.set(id, this.gedcomService.getFamily(id));
                }
                return TopolaDiagramRenderer._rawFamCache.get(id);
            },
            (individual: any, clearFamc: boolean, depth: number) => this.buildIndiObject(individual, clearFamc, depth),
            (dateStr: string) => this.parseDate(dateStr)
        );

        // Post-processing is now done in traverseGraph
        return result;
    }
}

/**
 * Factory function to create Topola diagram renderers
 */
export function createTopolaRenderer(
    source: string,
    el: HTMLElement,
    ctx: MarkdownPostProcessorContext,
    gedcomService: GedcomService,
    chartType: TopolaChartType,
    defaultGenerations: number = 3
): void {
    const renderer = new TopolaDiagramRenderer(el, source, gedcomService, ctx, chartType, defaultGenerations);

    // Register in registry to get notified when GEDCOM is loaded
    gedcomService.getRendererRegistry().register({
        rerender: async () => {
            if (gedcomService.getIsDataLoaded()) {
                await renderer.render();
            }
        }
    });

    // Use ctx.addChild() to let Obsidian manage the lifecycle
    ctx.addChild(renderer);
}
