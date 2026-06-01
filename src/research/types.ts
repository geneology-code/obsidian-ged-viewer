import { GedcomIndividual, GedcomEvent } from '../gedcom/types';

export type SortField = 'sources' | 'name' | 'lifeRange';
export type SortDir = 'asc' | 'desc';
export type PlaceFilter = 'all' | 'no-place' | 'has-place';
export type PeriodFilter = 'all' | 'no-period' | 'estimated' | 'has-exact';
export type SourceFilter = 'all' | 'has-sources' | 'no-sources';

export interface UIState {
    sortField: SortField;
    sortDir: SortDir;
    hideIgnored: boolean;
    pinnedOnly: boolean;
    placeFilter: PlaceFilter;
    periodFilter: PeriodFilter;
    sourceFilter: SourceFilter;
    expandedIds: string[]; // raw IDs without @, e.g. "I123"
    rootId?: string; // raw ID without @, e.g. "I1"
}

export const DEFAULT_UI_STATE: UIState = {
    sortField: 'sources',
    sortDir: 'desc',
    hideIgnored: true,
    pinnedOnly: false,
    placeFilter: 'all',
    periodFilter: 'all',
    sourceFilter: 'all',
    expandedIds: [],
    // rootId intentionally absent
};

export interface LifeRange {
    from: number | null;
    to: number | null;
    confidence: 'exact' | 'estimated';
    fromEstimated?: boolean;
    toEstimated?: boolean;
}

export interface ResearchSource {
    name: string;
    reason: string;
}

export type DifficultyCategory = 'green' | 'yellow' | 'red';

export interface Difficulty {
    score: number;
    category: DifficultyCategory;
}

export type PersonFlag = 'pinned' | 'ignored';

export type SourceStatus = 0 | 1 | 2 | 3 | 4 | 5;

export const SOURCE_STATUSES: Record<SourceStatus, { emoji: string; labelKey: string }> = {
    0: { emoji: '💡', labelKey: 'source.status.0' },
    1: { emoji: '📂', labelKey: 'source.status.1' },
    2: { emoji: '🔍', labelKey: 'source.status.2' },
    3: { emoji: '✅', labelKey: 'source.status.3' },
    4: { emoji: '➖', labelKey: 'source.status.4' },
    5: { emoji: '⛔', labelKey: 'source.status.5' },
};

export interface PersonOverride {
    flags: Set<PersonFlag>;
    difficultyOverride?: DifficultyCategory;
}

export interface OverlayState {
    ui: UIState;
}

export interface FrontierPerson {
    individual: GedcomIndividual;
    lifeRange: LifeRange;
    hasPlace: boolean;
    firstEvent: GedcomEvent | null; // earliest dated event
    sources: ResearchSource[];
    activeSourceCount: number; // sources in status 0, 1, or 2
    spouses: GedcomIndividual[];
    bloodDescendant: GedcomIndividual | null; // direct child who is ancestor of root
    difficulty: Difficulty;
    override?: PersonOverride;
}
