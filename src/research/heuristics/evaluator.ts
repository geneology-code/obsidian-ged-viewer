import { ResearchSource } from '../types';
import { Condition, DatedEvent, EvalContext, Rule } from './types';

function allPlacesOf(ctx: EvalContext): string {
    return ctx.allPlaces;
}

// Parses YAML regex strings: /pattern/flags or bare pattern (defaults to case-insensitive).
// Use single-quoted YAML strings to preserve backslashes: occu_regex: '/\bкрестьян\b/i'
function parseRegexCondition(pattern: string): RegExp {
    try {
        const m = pattern.match(/^\/(.+)\/([a-z]*)$/s);
        if (m) return new RegExp(m[1], m[2]);
        return new RegExp(pattern);
    } catch {
        return /(?!)/; // never matches — invalid regex
    }
}

function allEventPlaces(ctx: EvalContext): string[] {
    return [
        ctx.person.birthPlace,
        ctx.person.deathPlace,
        ...(ctx.person.events ?? []).map(e => e.place),
    ].filter((p): p is string => !!p);
}

// Returns [yearFrom, yearTo] using read-gedcom's full GEDCOM date parser.
// Handles punctual ("1917", "15 MAR 1856", "ABT 1800"),
// period ("FROM 1850 TO 1917") and range ("BET 1850 AND 1917", "BEF 1900", "AFT 1800").
function gedcomYearRange(dateStr: string): [number, number] | null {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const parsed = require('read-gedcom').parseDate(dateStr) as any;
    if (!parsed?.hasDate) return null;
    if (parsed.isDatePunctual) {
        const y: number | undefined = parsed.date?.year?.value;
        return y != null ? [y, y] : null;
    }
    if (parsed.isDatePeriod) {
        const from: number | undefined = parsed.dateFrom?.year?.value;
        const to: number | undefined = parsed.dateTo?.year?.value;
        if (from != null && to != null) return [from, to];
        if (from != null) return [from, from];
        if (to != null) return [to, to];
        return null;
    }
    if (parsed.isDateRange) {
        const after: number | undefined = parsed.dateAfter?.year?.value;
        const before: number | undefined = parsed.dateBefore?.year?.value;
        if (after != null && before != null) return [after, before];
        if (after != null) return [after, after];
        if (before != null) return [before, before];
        return null;
    }
    return null;
}

function evalCondition(cond: Condition, ctx: EvalContext): boolean {
    if ('always' in cond) return cond.always;
    // --- Combinators ---
    if ('all' in cond) return cond.all.every(c => evalCondition(c, ctx));
    if ('any' in cond) return cond.any.some(c => evalCondition(c, ctx));
    if ('not' in cond) return !evalCondition(cond.not, ctx);

    // --- Place ---
    if ('place_includes' in cond) {
        return allPlacesOf(ctx).includes(cond.place_includes.toLowerCase());
    }
    if ('place_includes_any' in cond) {
        const places = allPlacesOf(ctx);
        return cond.place_includes_any.some(s => places.includes(s.toLowerCase()));
    }
    if ('birth_place_includes' in cond) {
        return (ctx.person.birthPlace ?? '').toLowerCase().includes(cond.birth_place_includes.toLowerCase());
    }
    if ('death_place_includes' in cond) {
        return (ctx.person.deathPlace ?? '').toLowerCase().includes(cond.death_place_includes.toLowerCase());
    }

    // --- Dates (via lifeRange) ---
    const { from, to } = ctx.lifeRange;

    if ('born_before' in cond) return from !== null && from < cond.born_before;
    if ('born_after' in cond) return from !== null && from > cond.born_after;
    if ('born_between' in cond) {
        const [a, b] = cond.born_between;
        return from !== null && from >= a && from <= b;
    }
    if ('died_before' in cond) return to !== null && to < cond.died_before;
    if ('died_after' in cond) return to !== null && to > cond.died_after;
    if ('alive_in' in cond) {
        const year = cond.alive_in;
        return from !== null && to !== null && from <= year && year <= to;
    }
    if ('alive_in_range' in cond) {
        const [a, b] = cond.alive_in_range;
        return from !== null && to !== null && from <= b && to >= a;
    }

    // --- Gender ---
    if ('sex' in cond) return ctx.person.sex === cond.sex;

    // --- Data quality ---
    if ('has_dates' in cond) {
        const has = from !== null || to !== null;
        return cond.has_dates ? has : !has;
    }
    if ('has_birth_place' in cond) {
        const has = !!ctx.person.birthPlace;
        return cond.has_birth_place ? has : !has;
    }

    // --- Occupation ---
    if ('occu_include' in cond) {
        return ctx.allOccupations.includes(cond.occu_include.toLowerCase());
    }
    if ('has_occu' in cond) {
        const has = ctx.allOccupations.length > 0;
        return cond.has_occu ? has : !has;
    }

    // --- Nobility title ---
    if ('title_include' in cond) {
        return ctx.allTitles.includes(cond.title_include.toLowerCase());
    }
    if ('has_title' in cond) {
        const has = ctx.allTitles.length > 0;
        return cond.has_title ? has : !has;
    }

    // --- Dated place ---
    if ('alive_at_in_range' in cond) {
        const [start, end, placeSubstr] = cond.alive_at_in_range;
        const needle = placeSubstr.toLowerCase();
        return ctx.datedEvents.some(e => e.yearFrom <= end && e.yearTo >= start && e.place.includes(needle));
    }

    // --- Regex conditions (test original-case data; add /i flag for case-insensitive) ---
    if ('place_regex' in cond) {
        const rx = parseRegexCondition(cond.place_regex);
        return allEventPlaces(ctx).some(p => rx.test(p));
    }
    if ('birth_place_regex' in cond) {
        return !!ctx.person.birthPlace && parseRegexCondition(cond.birth_place_regex).test(ctx.person.birthPlace);
    }
    if ('death_place_regex' in cond) {
        return !!ctx.person.deathPlace && parseRegexCondition(cond.death_place_regex).test(ctx.person.deathPlace);
    }
    if ('occu_regex' in cond) {
        const rx = parseRegexCondition(cond.occu_regex);
        return (ctx.person.occupations ?? []).some(o => rx.test(o));
    }
    if ('title_regex' in cond) {
        const rx = parseRegexCondition(cond.title_regex);
        return (ctx.person.nobilityTitles ?? []).some(t => rx.test(t));
    }

    return false;
}

export function collectSources(rules: Rule[], ctx: EvalContext): ResearchSource[] {
    const results: ResearchSource[] = [];
    for (const rule of rules) {
        if (!evalCondition(rule.when, ctx)) continue;
        if (rule.source) results.push({ name: rule.source, reason: 'rule' });
        if (rule.rules) results.push(...collectSources(rule.rules, ctx));
    }
    return results;
}

export function buildContext(person: import('../../gedcom/types').GedcomIndividual, lifeRange: import('../types').LifeRange): EvalContext {
    const places = [
        person.birthPlace,
        person.deathPlace,
        ...(person.events ?? []).map(e => e.place),
    ].filter(Boolean).join(' ').toLowerCase();

    const allOccupations = (person.occupations ?? []).join(' ').toLowerCase();
    const allTitles = (person.nobilityTitles ?? []).join(' ').toLowerCase();

    const datedEvents: DatedEvent[] = [];
    const pushIfDated = (dateStr: string | undefined, placeStr: string | undefined) => {
        if (!dateStr || !placeStr) return;
        const range = gedcomYearRange(dateStr);
        if (range !== null) datedEvents.push({ yearFrom: range[0], yearTo: range[1], place: placeStr.toLowerCase() });
    };
    pushIfDated(person.birthDate, person.birthPlace);
    pushIfDated(person.deathDate, person.deathPlace);
    for (const evt of person.events ?? []) pushIfDated(evt.date, evt.place);

    return { person, lifeRange, allPlaces: places, allOccupations, allTitles, datedEvents };
}
