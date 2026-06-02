import { GedcomIndividual } from '../gedcom/types';
import { GedcomService } from '../gedcom/service';
import { LifeRange } from './types';
import { ReproductiveAge, DEFAULT_REPRODUCTIVE_AGE, LifeRangeMode } from '../types/settings';
import { Logger } from '../utils/logger';

export function parseYear(dateStr: string | undefined | null): number | null {
    if (!dateStr) return null;
    const match = dateStr.match(/\b(\d{3,4})\b/);
    return match ? parseInt(match[1], 10) : null;
}

export function estimateLifeRange(
    person: GedcomIndividual,
    gedcomService: GedcomService,
    maxLifespan: number,
    reproductiveAge: ReproductiveAge = DEFAULT_REPRODUCTIVE_AGE,
    mode: LifeRangeMode = 'maximize'
): LifeRange {
    const currentYear = new Date().getFullYear();
    const pid = person.id;
    const pname = person.name || pid;

    const birthYear = parseYear(person.birthDate);
    const deathYear = parseYear(person.deathDate);

    Logger.debug(`[lifeRange] ${pname} | birthDate="${person.birthDate}" → ${birthYear} | deathDate="${person.deathDate}" → ${deathYear} | sex=${person.sex} | mode=${mode}`);

    // --- Exact case (both dates known) ---

    if (birthYear !== null && deathYear !== null) {
        const r = { from: birthYear, to: deathYear, confidence: 'exact' as const, fromEstimated: false, toEstimated: false };
        Logger.debug(`[lifeRange] ${pname} → EXACT ${r.from}–${r.to}`);
        return r;
    }

    // --- Birth year known: pin from, estimate to ---

    if (birthYear !== null) {
        // maximize: extend to maximum possible lifespan
        // minimize: no events to anchor death date — to = birthYear (unknown)
        const to = mode === 'minimize'
            ? birthYear
            : Math.min(birthYear + maxLifespan, currentYear);
        const r = { from: birthYear, to, confidence: 'estimated' as const, fromEstimated: false, toEstimated: true };
        Logger.debug(`[lifeRange] ${pname} → birth-only (${mode}) ${r.from}–${r.to}`);
        return r;
    }

    // --- Constraint-based: no birth year; deathYear (if any) + events + children + marriages ---

    const eventYears = (person.events ?? [])
        .map(e => parseYear(e.date))
        .filter((y): y is number => y !== null);

    const firstEvent = eventYears.length > 0 ? Math.min(...eventYears) : null;
    const lastEvent  = eventYears.length > 0 ? Math.max(...eventYears) : null;

    let firstChild: number | null = null;
    let lastChild: number | null = null;
    let hasChildren = false;
    let firstMarriage: number | null = null;
    let lastMarriage: number | null = null;
    try {
        const fm = gedcomService.getFamilyMembers(person.id);
        hasChildren = (fm?.children ?? []).length > 0;
        const childYears = (fm?.children ?? [])
            .map(c => parseYear(c.birthDate))
            .filter((y): y is number => y !== null);
        if (childYears.length > 0) {
            firstChild = Math.min(...childYears);
            lastChild  = Math.max(...childYears);
        }
    } catch { /* no family data */ }

    try {
        for (const familyId of (person.familiesAsSpouse ?? [])) {
            const fam = gedcomService.getFamily(familyId);
            if (!fam?.marriageDate) continue;
            const my = parseYear(fam.marriageDate);
            if (my === null) continue;
            if (firstMarriage === null || my < firstMarriage) firstMarriage = my;
            if (lastMarriage === null || my > lastMarriage) lastMarriage = my;
        }
    } catch { /* no family data */ }

    const isFemale = person.sex === 'F';
    const minRepro = isFemale ? reproductiveAge.femaleMin : reproductiveAge.maleMin;
    const maxRepro = isFemale ? reproductiveAge.femaleMax : reproductiveAge.maleMax;

    Logger.debug(`[lifeRange] ${pname} | events=${eventYears.join(',')||'—'} firstEvent=${firstEvent} lastEvent=${lastEvent}`);
    Logger.debug(`[lifeRange] ${pname} | firstChild=${firstChild} lastChild=${lastChild} | firstMarriage=${firstMarriage} lastMarriage=${lastMarriage} | deathYear=${deathYear} | repro min=${minRepro} max=${maxRepro} maxLifespan=${maxLifespan}`);

    // Latest moment we know the person was definitely alive
    const knownAlivePoints = [lastEvent, lastChild, lastMarriage].filter((y): y is number => y !== null);
    const lastKnownAlive = knownAlivePoints.length > 0 ? Math.max(...knownAlivePoints) : null;

    // --- Birth year upper bounds: born no later than... ---
    const birthUppers: number[] = [];
    if (deathYear !== null) birthUppers.push(deathYear);                       // born before death
    if (firstEvent !== null) birthUppers.push(firstEvent);                     // born before first event
    if (firstChild !== null) birthUppers.push(firstChild - minRepro);          // born before first child - minRepro
    if (firstMarriage !== null) birthUppers.push(firstMarriage - minRepro);    // born before first marriage - minRepro

    if (birthUppers.length === 0) {
        Logger.debug(`[lifeRange] ${pname} → NO DATA, null`);
        return { from: null, to: null, confidence: 'estimated', fromEstimated: true, toEstimated: true };
    }

    const birthUpper = Math.min(...birthUppers);

    // --- Birth year lower bounds: born no earlier than... ---
    const birthLowers: number[] = [];
    if (deathYear !== null) birthLowers.push(deathYear - maxLifespan);
    if (lastKnownAlive !== null) birthLowers.push(lastKnownAlive - maxLifespan);
    if (lastChild !== null) birthLowers.push(lastChild - maxRepro);

    const birthLower = birthLowers.length > 0
        ? Math.max(...birthLowers)
        : birthUpper - maxLifespan;

    // --- Resolve from/to by mode ---
    let from: number;
    let to: number;

    if (mode === 'minimize') {
        // Tightest range: latest possible birth, earliest possible death
        from = birthUpper;
        // Earliest plausible death = last known alive (person was definitely alive then)
        // Guarantee to >= from
        to = deathYear !== null ? deathYear : Math.max(lastKnownAlive ?? birthUpper, birthUpper);
        // If person has children but their birth dates are unknown, from may equal to.
        // A parent must have been born at least minRepro years before their death / last known alive.
        if (hasChildren) from = Math.min(from, to - minRepro);
    } else {
        // maximize (default): widest range — earliest birth, latest death
        from = Math.min(birthLower, birthUpper); // birthLower is normally ≤ birthUpper
        const deathUpper = Math.min(birthUpper + maxLifespan, currentYear);
        const toEstimated = lastKnownAlive !== null
            ? Math.max(deathUpper, Math.min(lastKnownAlive, currentYear))
            : deathUpper;
        to = deathYear !== null ? deathYear : toEstimated;
    }

    Logger.debug(`[lifeRange] ${pname} | birthUpper=${birthUpper} birthLower=${birthLower} → from=${from}`);
    Logger.debug(`[lifeRange] ${pname} | lastKnownAlive=${lastKnownAlive} → to=${to}${deathYear !== null ? ' (pinned by deathYear)' : ''}`);
    Logger.debug(`[lifeRange] ${pname} → ESTIMATED ${from}–${to} (${mode})`);

    return { from, to, confidence: 'estimated', fromEstimated: true, toEstimated: deathYear === null };
}
