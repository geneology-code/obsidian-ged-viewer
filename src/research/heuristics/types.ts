import { GedcomIndividual } from '../../gedcom/types';
import { LifeRange, ResearchSource } from '../types';

// --- Leaf conditions ---

export type PlaceIncludes = { place_includes: string };
export type PlaceIncludesAny = { place_includes_any: string[] };
export type BirthPlaceIncludes = { birth_place_includes: string };
export type DeathPlaceIncludes = { death_place_includes: string };
export type BornBefore = { born_before: number };
export type BornAfter = { born_after: number };
export type BornBetween = { born_between: [number, number] };
export type DiedBefore = { died_before: number };
export type DiedAfter = { died_after: number };
export type AliveIn = { alive_in: number };
export type AliveInRange = { alive_in_range: [number, number] };
export type Sex = { sex: 'M' | 'F' };
export type HasDates = { has_dates: boolean };
export type HasBirthPlace = { has_birth_place: boolean };

export type LeafCondition =
    | PlaceIncludes
    | PlaceIncludesAny
    | BirthPlaceIncludes
    | DeathPlaceIncludes
    | BornBefore
    | BornAfter
    | BornBetween
    | DiedBefore
    | DiedAfter
    | AliveIn
    | AliveInRange
    | Sex
    | HasDates
    | HasBirthPlace;

// --- Combinator conditions ---

export type All = { all: Condition[] };
export type Any = { any: Condition[] };
export type Not = { not: Condition };

export type Condition = LeafCondition | All | Any | Not;

// --- Rule tree ---

export interface Rule {
    when: Condition;
    source?: string;
    rules?: Rule[];
}

export interface RulesFile {
    rules: Rule[];
}

// --- Evaluation context ---

export interface EvalContext {
    person: GedcomIndividual;
    lifeRange: LifeRange;
    allPlaces: string; // all place fields joined, lowercased
}
