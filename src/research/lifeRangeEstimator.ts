import { GedcomIndividual } from '../gedcom/types';
import { GedcomService } from '../gedcom/service';
import { LifeRange } from './types';
import { ReproductiveAge, DEFAULT_REPRODUCTIVE_AGE } from '../types/settings';
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
    reproductiveAge: ReproductiveAge = DEFAULT_REPRODUCTIVE_AGE
): LifeRange {
    const currentYear = new Date().getFullYear();
    const pid = person.id;
    const pname = person.name || pid;

    const birthYear = parseYear(person.birthDate);
    const deathYear = parseYear(person.deathDate);

    Logger.debug(`[lifeRange] ${pname} | birthDate="${person.birthDate}" → ${birthYear} | deathDate="${person.deathDate}" → ${deathYear} | sex=${person.sex}`);

    // --- Exact case (both dates known) ---

    if (birthYear !== null && deathYear !== null) {
        const r = { from: birthYear, to: deathYear, confidence: 'exact' as const, fromEstimated: false, toEstimated: false };
        Logger.debug(`[lifeRange] ${pname} → EXACT ${r.from}–${r.to}`);
        return r;
    }

    // --- Birth year known: pin from, estimate to (children can't improve death estimate) ---

    if (birthYear !== null) {
        const r = { from: birthYear, to: Math.min(birthYear + maxLifespan, currentYear), confidence: 'estimated' as const, fromEstimated: false, toEstimated: true };
        Logger.debug(`[lifeRange] ${pname} → birth-only ${r.from}–${r.to}`);
        return r;
    }

    // --- Constraint-based: no birth year; deathYear (if any) + events + children ---

    const eventYears = (person.events ?? [])
        .map(e => parseYear(e.date))
        .filter((y): y is number => y !== null);

    const firstEvent = eventYears.length > 0 ? Math.min(...eventYears) : null;
    const lastEvent  = eventYears.length > 0 ? Math.max(...eventYears) : null;

    let firstChild: number | null = null;
    let lastChild: number | null = null;
    try {
        const fm = gedcomService.getFamilyMembers(person.id);
        const childYears = (fm?.children ?? [])
            .map(c => parseYear(c.birthDate))
            .filter((y): y is number => y !== null);
        if (childYears.length > 0) {
            firstChild = Math.min(...childYears);
            lastChild  = Math.max(...childYears);
        }
    } catch { /* no family data */ }

    const isFemale = person.sex === 'F';
    const minRepro = isFemale ? reproductiveAge.femaleMin : reproductiveAge.maleMin;
    const maxRepro = isFemale ? reproductiveAge.femaleMax : reproductiveAge.maleMax;

    Logger.debug(`[lifeRange] ${pname} | events=${eventYears.join(',')||'—'} firstEvent=${firstEvent} lastEvent=${lastEvent}`);
    Logger.debug(`[lifeRange] ${pname} | firstChild=${firstChild} lastChild=${lastChild} | deathYear=${deathYear} | repro min=${minRepro} max=${maxRepro} maxLifespan=${maxLifespan}`);

    // Latest moment we know the person was definitely alive
    const knownAlive = [lastEvent, lastChild].filter((y): y is number => y !== null);
    const lastKnownAlive = knownAlive.length > 0 ? Math.max(...knownAlive) : null;

    // --- Birth year upper bounds: born no later than... ---
    const birthUppers: number[] = [];
    if (deathYear !== null) birthUppers.push(deathYear);        // must be born before death
    if (firstEvent !== null) birthUppers.push(firstEvent);      // must be born before first event
    if (firstChild !== null) birthUppers.push(firstChild - minRepro); // born before first child minus minRepro

    if (birthUppers.length === 0) {
        Logger.debug(`[lifeRange] ${pname} → NO DATA, null`);
        return { from: null, to: null, confidence: 'estimated', fromEstimated: true, toEstimated: true };
    }

    const birthUpper = Math.min(...birthUppers);

    // --- Birth year lower bounds: born no earlier than... ---
    const birthLowers: number[] = [];
    if (deathYear !== null) birthLowers.push(deathYear - maxLifespan);    // couldn't outlive maxLifespan past death
    if (lastKnownAlive !== null) birthLowers.push(lastKnownAlive - maxLifespan);
    if (lastChild !== null) birthLowers.push(lastChild - maxRepro);

    const birthLower = birthLowers.length > 0
        ? Math.max(...birthLowers)
        : birthUpper - maxLifespan;

    // from = earliest plausible birth; clamp if constraints contradict
    const from = Math.min(birthLower, birthUpper);

    // --- Death year ---
    // If actual death year known, use it directly; otherwise estimate from birth upper
    const deathUpper = Math.min(birthUpper + maxLifespan, currentYear);
    const toEstimated = lastKnownAlive !== null
        ? Math.max(deathUpper, Math.min(lastKnownAlive, currentYear))
        : deathUpper;
    const to = deathYear !== null ? deathYear : toEstimated;

    Logger.debug(`[lifeRange] ${pname} | birthUpper=${birthUpper} birthLower=${birthLower} → from=${from}`);
    Logger.debug(`[lifeRange] ${pname} | lastKnownAlive=${lastKnownAlive} deathUpper=${deathUpper} → to=${to}${deathYear !== null ? ' (pinned by deathYear)' : ''}`);
    Logger.debug(`[lifeRange] ${pname} → ESTIMATED ${from}–${to}`);

    return { from, to, confidence: 'estimated', fromEstimated: true, toEstimated: deathYear === null };
}
