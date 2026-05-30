import { App, parseYaml } from 'obsidian';
import { Rule, RulesFile } from './types';

let cachedPath: string | null = null;
let cachedRules: Rule[] | null = null;

export function invalidateRulesCache(): void {
    cachedRules = null;
    cachedPath = null;
}

export async function loadRules(app: App, filePath: string): Promise<Rule[]> {
    if (!filePath) return [];

    if (cachedPath === filePath && cachedRules !== null) return cachedRules;

    const file = app.vault.getFileByPath(filePath);
    if (!file) {
        console.warn(`[ged-viewer] Heuristics file not found: ${filePath}`);
        return [];
    }

    let raw: string;
    try {
        raw = await app.vault.read(file);
    } catch (e) {
        console.warn('[ged-viewer] Failed to read heuristics file:', e);
        return [];
    }

    let parsed: unknown;
    try {
        parsed = parseYaml(raw);
    } catch (e) {
        console.warn('[ged-viewer] Failed to parse heuristics YAML:', e);
        return [];
    }

    const rulesFile = parsed as RulesFile;
    if (!rulesFile?.rules || !Array.isArray(rulesFile.rules)) {
        console.warn('[ged-viewer] Heuristics file has no top-level "rules" array');
        return [];
    }

    cachedPath = filePath;
    cachedRules = rulesFile.rules;
    return cachedRules;
}
