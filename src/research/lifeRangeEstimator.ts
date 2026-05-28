import { GedcomIndividual } from '../gedcom/types';
import { GedcomService } from '../gedcom/service';
import { LifeRange } from './types';

export function parseYear(dateStr: string | undefined | null): number | null {
    if (!dateStr) return null;
    const match = dateStr.match(/\b(\d{4})\b/);
    return match ? parseInt(match[1], 10) : null;
}

export function estimateLifeRange(
    person: GedcomIndividual,
    gedcomService: GedcomService,
    maxLifespan: number
): LifeRange {
    const currentYear = new Date().getFullYear();

    const birthYear = parseYear(person.birthDate);
    const deathYear = parseYear(person.deathDate);

    if (birthYear !== null && deathYear !== null) {
        return { from: birthYear, to: deathYear, confidence: 'exact' };
    }

    if (birthYear !== null) {
        return {
            from: birthYear,
            to: Math.min(birthYear + maxLifespan, currentYear),
            confidence: 'estimated'
        };
    }

    if (deathYear !== null) {
        return { from: deathYear - maxLifespan, to: deathYear, confidence: 'estimated' };
    }

    // Try events
    const eventYears = (person.events || [])
        .map(e => parseYear(e.date))
        .filter((y): y is number => y !== null);

    if (eventYears.length > 0) {
        const minYear = Math.min(...eventYears);
        const maxYear = Math.max(...eventYears);
        return {
            from: minYear - Math.floor(maxLifespan / 2),
            to: Math.min(maxYear + Math.floor(maxLifespan / 2), currentYear),
            confidence: 'estimated'
        };
    }

    // Try children's births
    try {
        const fm = gedcomService.getFamilyMembers(person.id);
        const childBirthYears = (fm?.children || [])
            .map(c => parseYear(c.birthDate))
            .filter((y): y is number => y !== null);

        if (childBirthYears.length > 0) {
            const firstChild = Math.min(...childBirthYears);
            const lastChild = Math.max(...childBirthYears);
            return {
                from: firstChild - 18,
                to: Math.min(lastChild + Math.floor(maxLifespan / 4), currentYear),
                confidence: 'estimated'
            };
        }
    } catch {
        // getFamilyMembers may throw if no family data
    }

    return { from: null, to: null, confidence: 'estimated' };
}
