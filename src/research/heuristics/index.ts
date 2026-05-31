import { GedcomIndividual } from '../../gedcom/types';
import { LifeRange, ResearchSource } from '../types';
import { Rule } from './types';
import { buildContext, collectSources } from './evaluator';

export { loadRules, invalidateRulesCache } from './loader';
export { DEFAULT_RULES_YAML } from './template';

export function matchSources(
    person: GedcomIndividual,
    lifeRange: LifeRange,
    rules: Rule[],
    service?: import('../../gedcom/service').GedcomService,
): ResearchSource[] {
    if (rules.length === 0) return [];
    const ctx = buildContext(person, lifeRange, service);
    return collectSources(rules, ctx);
}
