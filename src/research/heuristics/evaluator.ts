import { ResearchSource } from '../types';
import { Condition, EvalContext, Rule } from './types';

function allPlacesOf(ctx: EvalContext): string {
    return ctx.allPlaces;
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

    return { person, lifeRange, allPlaces: places };
}
