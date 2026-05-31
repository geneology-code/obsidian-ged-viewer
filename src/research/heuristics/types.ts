import { GedcomIndividual } from '../../gedcom/types';
import { LifeRange, ResearchSource } from '../types';

// --- Leaf conditions ---

export type Always = { always: boolean };
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
export type OccuIncludes = { occu_include: string };
export type HasOccu = { has_occu: boolean };
export type TitleIncludes = { title_include: string };
export type HasTitle = { has_title: boolean };
export type AliveAtInRange = { alive_at_in_range: [number, number, string] };
export type PlaceRegex = { place_regex: string };
export type BirthPlaceRegex = { birth_place_regex: string };
export type DeathPlaceRegex = { death_place_regex: string };
export type OccuRegex = { occu_regex: string };
export type TitleRegex = { title_regex: string };

export type LeafCondition =
    | Always
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
    | HasBirthPlace
    | OccuIncludes
    | HasOccu
    | TitleIncludes
    | HasTitle
    | AliveAtInRange
    | PlaceRegex
    | BirthPlaceRegex
    | DeathPlaceRegex
    | OccuRegex
    | TitleRegex;

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

export interface DatedEvent {
    yearFrom: number;
    yearTo: number;
    place: string; // lowercased
}

export interface EvalContext {
    person: GedcomIndividual;
    lifeRange: LifeRange;
    allPlaces: string;          // all place fields joined, lowercased
    allOccupations: string;     // all OCCU values joined, lowercased
    allTitles: string;          // all TITL values joined, lowercased
    datedEvents: DatedEvent[];  // events with both year and place extracted
}
