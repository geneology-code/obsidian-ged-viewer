import { GedcomIndividual } from '../gedcom/types';
import { LifeRange, ResearchSource } from './types';
import { t } from '../i18n';

function liveIn(lr: LifeRange, year: number): boolean {
    return lr.from !== null && lr.to !== null && lr.from <= year && year <= lr.to;
}

function liveBefore(lr: LifeRange, year: number): boolean {
    return lr.from !== null && lr.from < year;
}

function isRussia(person: GedcomIndividual): boolean {
    const places = [
        person.birthPlace,
        person.deathPlace,
        ...(person.events || []).map(e => e.place)
    ].filter(Boolean).join(' ');

    return /росс|russia|russie|россия|empire|СССР|RSFSR|RF\b/i.test(places);
}

export function matchSources(person: GedcomIndividual, lifeRange: LifeRange): ResearchSource[] {
    const sources: ResearchSource[] = [];

    if (lifeRange.from === null && lifeRange.to === null) return sources;

    if (isRussia(person)) {
        if (liveIn(lifeRange, 1858)) {
            sources.push({ name: t('research.source.rev10'), reason: 'liveIn:1858' });
        }
        if (liveIn(lifeRange, 1834)) {
            sources.push({ name: t('research.source.rev9'), reason: 'liveIn:1834' });
        }
        if (liveIn(lifeRange, 1816)) {
            sources.push({ name: t('research.source.rev8'), reason: 'liveIn:1816' });
        }
        if (liveIn(lifeRange, 1795)) {
            sources.push({ name: t('research.source.rev5'), reason: 'liveIn:1795' });
        }
        if (liveBefore(lifeRange, 1917)) {
            sources.push({ name: t('research.source.confessions'), reason: 'liveBefore:1917' });
            sources.push({ name: t('research.source.metrical'), reason: 'liveBefore:1917' });
        }
        if (person.sex === 'M' && liveBefore(lifeRange, 1917)) {
            sources.push({ name: t('research.source.recruit'), reason: 'male+liveBefore:1917' });
        }
    }

    return sources;
}
