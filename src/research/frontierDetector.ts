import { GedcomIndividual } from '../gedcom/types';
import { GedcomService } from '../gedcom/service';

export function detectFrontierAncestors(gedcomService: GedcomService): GedcomIndividual[] {
    return gedcomService.getAllIndividuals().filter(
        p => !p.familiesAsChild || p.familiesAsChild.length === 0
    );
}
