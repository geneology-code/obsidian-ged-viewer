/**
 * Shared settings interfaces for the GEDCOM plugin
 */

export interface GEDCOMPluginSettings {
	gedcomFilePath: string;
	maxLifespanYears: number;
	enableDebugLogging: boolean;
	defaultDiagramGenerations: number;
	enableGedJS: boolean;
}

export const DEFAULT_SETTINGS: GEDCOMPluginSettings = {
	gedcomFilePath: '',
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