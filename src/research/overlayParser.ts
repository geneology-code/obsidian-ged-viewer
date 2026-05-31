import { OverlayState, UIState, SortField, SortDir, PlaceFilter, PeriodFilter, SourceFilter, DEFAULT_UI_STATE } from './types';

export function parseOverlay(source: string): OverlayState {
    const state: OverlayState = {
        ui: { ...DEFAULT_UI_STATE, expandedIds: [] },
    };

    const lines = source.split('\n');
    let inUI = false;

    for (const line of lines) {
        if (line.match(/^\[ui\]$/)) {
            inUI = true;
            continue;
        }
        if (line.match(/^\[/)) {
            inUI = false;
            continue;
        }
        if (!inUI) continue;

        const kv = line.match(/^(\w+)=(.*)$/);
        if (!kv) continue;
        const [, key, value] = kv;
        applyUIField(state.ui, key, value);
    }

    return state;
}

function applyUIField(ui: UIState, key: string, value: string): void {
    switch (key) {
        case 'sort': {
            const [field, dir] = value.split(':');
            if (field === 'name' || field === 'lifeRange' || field === 'sources') {
                ui.sortField = field as SortField;
            } else if (field === 'difficulty') {
                ui.sortField = 'sources'; // backward compat
            }
            if (dir === 'asc' || dir === 'desc') {
                ui.sortDir = dir as SortDir;
            }
            break;
        }
        case 'hide_ignored':
            ui.hideIgnored = value !== 'false';
            break;
        case 'pinned_only':
            ui.pinnedOnly = value === 'true';
            break;
        case 'no_place_only':
            // backward compat: old boolean → new enum
            if (value === 'true') ui.placeFilter = 'no-place';
            break;
        case 'place_filter':
            if (value === 'no-place' || value === 'has-place' || value === 'all') {
                ui.placeFilter = value as PlaceFilter;
            }
            break;
        case 'period_filter':
            if (value === 'no-period' || value === 'estimated' || value === 'has-exact' || value === 'all') {
                ui.periodFilter = value as PeriodFilter;
            }
            break;
        case 'source_filter':
            if (value === 'has-sources' || value === 'no-sources' || value === 'all') {
                ui.sourceFilter = value as SourceFilter;
            }
            break;
        case 'expanded':
            ui.expandedIds = value ? value.split(',').map(s => s.trim()).filter(Boolean) : [];
            break;
        case 'root':
            ui.rootId = value.trim() || undefined;
            break;
    }
}

export function serializeOverlay(state: OverlayState): string {
    const ui = state.ui;
    const lines = ['[ui]', `sort=${ui.sortField}:${ui.sortDir}`];
    if (ui.rootId) lines.push(`root=${ui.rootId}`);
    if (!ui.hideIgnored) lines.push('hide_ignored=false');
    if (ui.pinnedOnly) lines.push('pinned_only=true');
    if (ui.placeFilter !== 'all') lines.push(`place_filter=${ui.placeFilter}`);
    if (ui.periodFilter !== 'all') lines.push(`period_filter=${ui.periodFilter}`);
    if (ui.sourceFilter !== 'all') lines.push(`source_filter=${ui.sourceFilter}`);
    if (ui.expandedIds.length > 0) lines.push(`expanded=${ui.expandedIds.join(',')}`);
    return lines.join('\n');
}
