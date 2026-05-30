import { GedcomIndividual } from '../gedcom/types';
import { GedcomService } from '../gedcom/service';

function bfsAncestors(service: GedcomService, rootId: string): GedcomIndividual[] {
    const visited = new Set<string>([rootId]);
    const result: GedcomIndividual[] = [];
    const queue = [rootId];

    while (queue.length > 0) {
        const id = queue.shift()!;
        try {
            const fm = service.getFamilyMembers(id);
            for (const parent of [fm.father, fm.mother]) {
                if (!parent || visited.has(parent.id)) continue;
                visited.add(parent.id);
                result.push(parent);
                queue.push(parent.id);
            }
        } catch { /* skip broken records */ }
    }
    return result;
}

const noParents = (p: GedcomIndividual): boolean =>
    !p.familiesAsChild || p.familiesAsChild.length === 0;

export function detectFrontierAncestors(
    service: GedcomService,
    rootId?: string
): GedcomIndividual[] {
    if (rootId) {
        const root = service.getIndividual(rootId);
        if (!root) return [];
        return bfsAncestors(service, root.id).filter(noParents);
    }
    // Fallback: persons who ARE parents/spouses in some family but have no parents themselves
    return service.getAllIndividuals().filter(
        p => noParents(p) && (p.familiesAsSpouse?.length ?? 0) > 0
    );
}
