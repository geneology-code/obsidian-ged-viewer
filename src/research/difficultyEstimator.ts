import { LifeRange, ResearchSource, Difficulty, DifficultyCategory, PersonOverride } from './types';

export function estimateDifficulty(
    lifeRange: LifeRange,
    sources: ResearchSource[],
    hasPlace: boolean,
    override?: PersonOverride
): Difficulty {
    if (override?.difficultyOverride) {
        const cat = override.difficultyOverride;
        return { score: cat === 'green' ? 2 : cat === 'yellow' ? 6 : 10, category: cat };
    }

    let score = 5;

    if (hasPlace) score -= 2;
    score -= Math.min(sources.length, 3);
    if (sources.length === 0) score += 3;
    if (!hasPlace && lifeRange.from === null && lifeRange.to === null) score += 2;

    const category: DifficultyCategory = score <= 3 ? 'green' : score <= 7 ? 'yellow' : 'red';
    return { score, category };
}
