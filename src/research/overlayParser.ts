import { OverlayState, PersonOverride, PersonFlag, DifficultyCategory, UIState, SortField, SortDir, DEFAULT_UI_STATE } from './types';

type CurrentSection =
    | { type: 'ui' }
    | { type: 'person'; id: string }
    | null;

export function parseOverlay(source: string): OverlayState {
    const state: OverlayState = {
        ui: { ...DEFAULT_UI_STATE, expandedIds: [] },
        persons: {},
    };

    const lines = source.split('\n');
    let section: CurrentSection = null;

    for (const line of lines) {
        if (line.match(/^\[ui\]$/)) {
            section = { type: 'ui' };
            continue;
        }

        const personMatch = line.match(/^\[person:([^\]]+)\]$/);
        if (personMatch) {
            const id = personMatch[1].trim();
            section = { type: 'person', id };
            state.persons[id] = { flags: new Set<PersonFlag>() };
            continue;
        }

        if (!section) continue;

        const kv = line.match(/^(\w+)=(.*)$/);
        if (!kv) continue;
        const [, key, value] = kv;

        if (section.type === 'ui') {
            applyUIField(state.ui, key, value);
        } else {
            applyPersonField(state.persons[section.id], key, value);
        }
    }

    return state;
}

function applyUIField(ui: UIState, key: string, value: string): void {
    switch (key) {
        case 'sort': {
            const [field, dir] = value.split(':');
            if (field === 'difficulty' || field === 'name' || field === 'lifeRange') {
                ui.sortField = field as SortField;
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
            ui.noPlaceOnly = value === 'true';
            break;
        case 'expanded':
            ui.expandedIds = value ? value.split(',').map(s => s.trim()).filter(Boolean) : [];
            break;
        case 'root':
            ui.rootId = value.trim() || undefined;
            break;
    }
}

function applyPersonField(person: PersonOverride, key: string, value: string): void {
    if (key === 'flags') {
        for (const flag of value.split(',').map(s => s.trim())) {
            if (flag === 'pinned' || flag === 'ignored') {
                person.flags.add(flag as PersonFlag);
            }
        }
    } else if (key === 'noteLink') {
        person.noteLink = value;
    } else if (key === 'difficulty_override') {
        if (value === 'green' || value === 'yellow' || value === 'red') {
            person.difficultyOverride = value as DifficultyCategory;
        }
    }
}

export function serializeOverlay(state: OverlayState): string {
    const sections: string[] = [];

    // [ui] section — always emit so sort/filter/expanded state persists
    const ui = state.ui;
    const uiLines = ['[ui]', `sort=${ui.sortField}:${ui.sortDir}`];
    if (ui.rootId) uiLines.push(`root=${ui.rootId}`);
    if (!ui.hideIgnored) uiLines.push('hide_ignored=false');
    if (ui.pinnedOnly) uiLines.push('pinned_only=true');
    if (ui.noPlaceOnly) uiLines.push('no_place_only=true');
    if (ui.expandedIds.length > 0) uiLines.push(`expanded=${ui.expandedIds.join(',')}`);
    sections.push(uiLines.join('\n'));

    // [person:ID] sections
    for (const [id, override] of Object.entries(state.persons)) {
        const hasFlags = override.flags.size > 0;
        const hasNoteLink = override.noteLink && override.noteLink.trim();
        const hasOverride = override.difficultyOverride;
        if (!hasFlags && !hasNoteLink && !hasOverride) continue;

        const lines = [`[person:${id}]`];
        if (hasFlags) lines.push(`flags=${[...override.flags].join(',')}`);
        if (hasNoteLink) lines.push(`noteLink=${override.noteLink!.trim()}`);
        if (hasOverride) lines.push(`difficulty_override=${override.difficultyOverride}`);
        sections.push(lines.join('\n'));
    }

    return sections.join('\n\n');
}
