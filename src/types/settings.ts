/**
 * Shared settings interfaces for the GEDCOM plugin
 */

export interface ReproductiveAge {
    maleMin: number;
    maleMax: number;
    femaleMin: number;
    femaleMax: number;
}

export const DEFAULT_REPRODUCTIVE_AGE: ReproductiveAge = {
    maleMin: 15,
    maleMax: 60,
    femaleMin: 15,
    femaleMax: 49,
};

export interface GEDCOMPluginSettings {
	gedcomFilePath: string;
	heuristicsFilePath: string;
	sourceStatusEmojis: string[]; // 6 items, '' = use default
	reproductiveAge: ReproductiveAge;
	maxLifespanYears: number;
	enableDebugLogging: boolean;
	defaultDiagramGenerations: number;
	enableGedJS: boolean;
}

export const DEFAULT_SETTINGS: GEDCOMPluginSettings = {
	gedcomFilePath: '',
	heuristicsFilePath: '',
	sourceStatusEmojis: ['', '', '', '', '', ''],
	reproductiveAge: { ...DEFAULT_REPRODUCTIVE_AGE },
	maxLifespanYears: 100,
	enableDebugLogging: false,
	defaultDiagramGenerations: 3,
	enableGedJS: false
};

/**
 * Settings that can be accessed by services
 */
export interface ServiceSettings {
	maxLifespanYears: number;
}
