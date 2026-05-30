import { GedcomIndividual } from '../gedcom/types';
import { GedcomService } from '../gedcom/service';
import { LifeRange } from './types';
import { ReproductiveAge, DEFAULT_REPRODUCTIVE_AGE } from '../types/settings';

export function parseYear(dateStr: string | undefined | null): number | null {
    if (!dateStr) return null;
    const match = dateStr.match(/\b(\d{4})\b/);
    return match ? parseInt(match[1], 10) : null;
}

export function estimateLifeRange(
    person: GedcomIndividual,
    gedcomService: GedcomService,
    maxLifespan: number,
    reproductiveAge: ReproductiveAge = DEFAULT_REPRODUCTIVE_AGE
): LifeRange {
    const currentYear = new Date().getFullYear();

    const birthYear = parseYear(person.birthDate);
    const deathYear = parseYear(person.deathDate);

    // --- Exact cases (unchanged) ---

    if (birthYear !== null && deathYear !== null) {
        return { from: birthYear, to: deathYear, confidence: 'exact' };
    }
    if (birthYear !== null) {
        return { from: birthYear, to: Math.min(birthYear + maxLifespan, currentYear), confidence: 'estimated' };
    }
    if (deathYear !== null) {
        return { from: deathYear - maxLifespan, to: deathYear, confidence: 'estimated' };
    }

    // --- Gather all reference points ---

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

    // Latest moment we know the person was definitely alive
    const knownAlive = [lastEvent, lastChild].filter((y): y is number => y !== null);
    const lastKnownAlive = knownAlive.length > 0 ? Math.max(...knownAlive) : null;

    // --- Birth year (from) ---
    //
    // Upper bounds: born no later than
    const birthUppers: number[] = [];
    if (firstEvent !== null) birthUppers.push(firstEvent);
    if (firstChild !== null) birthUppers.push(firstChild - minRepro);

    if (birthUppers.length === 0) {
        return { from: null, to: null, confidence: 'estimated' };
    }

    const birthUpper = Math.min(...birthUppers);

    // Lower bound: born no earlier than (person wasn't older than maxLifespan when last known alive)
    const birthLower = lastKnownAlive !== null
        ? lastKnownAlive - maxLifespan
        : birthUpper - maxLifespan;

    const from = birthLower <= birthUpper ? birthLower : birthUpper;

    // --- Death year (to) ---
    //
    // Upper bound: from + maxLifespan, capped at currentYear
    const deathUpper = Math.min(from + maxLifespan, currentYear);

    // Floor: person can't die before they were last known alive
    const to = lastKnownAlive !== null
        ? Math.max(deathUpper, Math.min(lastKnownAlive, currentYear))
        : deathUpper;

    return { from, to, confidence: 'estimated' };
}
