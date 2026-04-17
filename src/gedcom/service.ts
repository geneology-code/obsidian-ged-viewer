import { App, TFile } from 'obsidian';
import { GedcomData, GedcomIndividual, GedcomFamily, GedcomEvent } from './types';
import { Logger, GEDCOMDataError, GEDCOMPluginError } from '../utils/logger';

// Registry for renderers to allow re-rendering when data is loaded
export type RendererRegistry = {
    renderers: Set<{ rerender: () => Promise<void> }>;
    register: (renderer: { rerender: () => Promise<void> }) => void;
    unregister: (renderer: { rerender: () => Promise<void> }) => void;
    rerenderAll: () => Promise<void>;
};

export class GedcomService {
    private app: App;
    private gedcomData: GedcomData[] = [];
    private parsedDataCache: Record<string, any> = {};
    private rendererRegistry: RendererRegistry;
    private isDataLoaded: boolean = false;

    constructor(app: App) {
        this.app = app;
        this.rendererRegistry = {
            renderers: new Set(),
            register: (renderer) => this.rendererRegistry.renderers.add(renderer),
            unregister: (renderer) => this.rendererRegistry.renderers.delete(renderer),
            rerenderAll: async () => {
                for (const renderer of this.rendererRegistry.renderers) {
                    await renderer.rerender();
                }
            }
        };
    }

    /**
     * Get the renderer registry for managing re-renders
     */
    getRendererRegistry(): RendererRegistry {
        return this.rendererRegistry;
    }

    /**
     * Check if GEDCOM data is loaded
     */
    getIsDataLoaded(): boolean {
        return this.isDataLoaded;
    }

    /**
     * Get the app instance (for internal use by renderers)
     * TODO: Consider proper dependency injection instead of this approach
     */
    getApp(): App {
        return this.app;
    }

    /**
     * Load a single GEDCOM file
     * @param filePath Path to the GEDCOM file
     */
    async loadGEDCOMFile(filePath: string): Promise<void> {
        // Clear existing data
        this.gedcomData = [];

        await this.loadGEDCOMFileInternal(filePath);

        // Mark data as loaded and re-render all blocks
        this.isDataLoaded = true;
        await this.rendererRegistry.rerenderAll();
    }

    private async loadGEDCOMFileInternal(filePath: string): Promise<void> {
        Logger.debug(`Loading GEDCOM file: ${filePath}`);

        try {
            // Get the file from vault
            const file = this.app.vault.getAbstractFileByPath(filePath);

            Logger.debug(`Looking for file: ${filePath}`);
            Logger.debug(`Found file: ${file ? file.path : 'null'}`);

            if (!file || !(file.path && 'basename' in file)) {
                throw new GEDCOMDataError(`GEDCOM file not found: ${filePath}`, { filePath });
            }

            // Read the file content
            Logger.debug('Reading file content...');
            const content = await this.app.vault.read(file as TFile);

            if (!content || content.trim().length === 0) {
                throw new GEDCOMDataError(`GEDCOM file is empty: ${filePath}`, { filePath });
            }

            // Parse the GEDCOM content using read-gedcom library
            Logger.debug('Parsing GEDCOM content...');
            const readGedcom = require('read-gedcom');

            let parsedData;
            try {
                parsedData = readGedcom.readGedcom(content);
            } catch (parseError: any) {
                Logger.warn(`Parse error with string, trying buffer: ${parseError.message}`);
                // Try with buffer
                try {
                    parsedData = readGedcom.readGedcom(Buffer.from(content, 'utf-8'));
                } catch (bufferError: any) {
                    Logger.error(`Failed to parse GEDCOM file: ${bufferError.message}`, {
                        filePath,
                        originalError: parseError.message,
                        bufferError: bufferError.message
                    });
                    return; // Stop processing this file but don't crash the whole plugin
                }
            }

            if (!parsedData) {
                throw new GEDCOMDataError('Parsed data is null or undefined', { filePath });
            }

            Logger.debug('Extracting records from parsed data...');

            // Validate that we have records
            const individualsSelection = parsedData.getIndividualRecord();
            if (!individualsSelection || individualsSelection.length === 0) {
                Logger.warn('No individual records found in GEDCOM file');
            } else {
                Logger.debug(`Found ${individualsSelection.length} individual records`);
            }

            // Process the parsed data into our internal format
            Logger.debug('Processing GEDCOM data into internal format...');
            const processedData = this.processGEDCOMData(parsedData, filePath);

            // Add to our collection
            this.gedcomData.push(processedData);

            // Cache the raw parsed data
            this.parsedDataCache[filePath] = parsedData;

            Logger.debug(`Successfully loaded GEDCOM file: ${filePath}`);
            Logger.debug(`Processed ${Object.keys(processedData.individuals).length} individuals`);

        } catch (error) {
            if (error instanceof GEDCOMDataError) {
                Logger.error(`GEDCOM data error for file ${filePath}:`, error);
                throw error;
            } else {
                Logger.error(`Unexpected error loading GEDCOM file ${filePath}:`, error);
                throw new GEDCOMPluginError(`Failed to load GEDCOM file: ${error.message}`, {
                    filePath,
                    originalError: error
                });
            }
        }
    }

    private processGEDCOMData(rawData: any, fileName: string): GedcomData {
        const individuals: Record<string, GedcomIndividual> = {};
        const families: Record<string, GedcomFamily> = {};

        Logger.debug('[GedcomService] Processing GEDCOM data...');

        // Get all individuals using the API
        const individualsSelection = rawData.getIndividualRecord();

        if (individualsSelection && individualsSelection.length > 0) {
            Logger.debug('[GedcomService] Found individuals:', individualsSelection.length);

            // Use arraySelect to get all records
            const allIndividuals = individualsSelection.arraySelect();

            for (const individual of allIndividuals) {
                try {
                    const processedIndividual = this.processIndividual(individual);
                    if (processedIndividual.id) {
                        // Store with @ prefix (standard GEDCOM format)
                        const storeId = processedIndividual.id.startsWith('@') ? processedIndividual.id : `@${processedIndividual.id}@`;
                        individuals[storeId] = processedIndividual;
                    }
                } catch (e) {
                    Logger.error('[GedcomService] Error processing individual:', e);
                }
            }
        }

        // Get all families
        const familiesSelection = rawData.getFamilyRecord();

        if (familiesSelection && familiesSelection.length > 0) {
            Logger.debug('[GedcomService] Found families:', familiesSelection.length);

            const allFamilies = familiesSelection.arraySelect();

            for (const family of allFamilies) {
                try {
                    const processedFamily = this.processFamily(family, rawData);
                    if (processedFamily.id) {
                        // Store with @ prefix (standard GEDCOM format)
                        const storeId = processedFamily.id.startsWith('@') ? processedFamily.id : `@${processedFamily.id}@`;
                        families[storeId] = processedFamily;
                    }
                } catch (e) {
                    Logger.error('[GedcomService] Error processing family:', e);
                }
            }
        }

        return {
            individuals,
            families,
            fileName
        };
    }

    private processIndividual(individual: any): GedcomIndividual {
        let id = '';
        let name = '';
        let firstName = '';
        let surname = '';
        let birthDate: string | undefined;
        let birthPlace: string | undefined;
        let deathDate: string | undefined;
        let deathPlace: string | undefined;
        let sex: string | undefined;
        const familiesAsSpouse: string[] = [];
        const familiesAsChild: string[] = [];
        const events: GedcomEvent[] = [];

        try {
            // Get ID using pointer() method
            const pointer = individual.pointer();
            id = pointer && pointer.length > 0 ? pointer[0] : '';
        } catch (e) {
            Logger.error('[GedcomService] Error getting pointer:', e);
        }

        try {
            // Get name using getName()
            const nameSelection = individual.getName();
            if (nameSelection && nameSelection.length > 0) {
                // valueAsParts() returns an array of arrays: [[firstName, surname, suffix, ...], ...]
                const nameParts = nameSelection.valueAsParts();
                if (nameParts && nameParts.length > 0) {
                    const namePartsArray = nameParts[0];
                    if (namePartsArray && namePartsArray.length > 0) {
                        // First element is given name, second is surname
                        firstName = namePartsArray[0] || '';
                        surname = namePartsArray[1] || '';
                        name = `${firstName} ${surname}`.trim();
                    }
                }
            }
        } catch (e) {
            Logger.error('[GedcomService] Error getting name:', e);
        }

        try {
            // Get sex using getSex()
            const sexSelection = individual.getSex();
            if (sexSelection && sexSelection.length > 0) {
                const sexValue = sexSelection.value();
                sex = Array.isArray(sexValue) ? sexValue[0] : sexValue;
            }
        } catch (e) {}

        try {
            // Get birth event - use arraySelect() to get actual events
            const birthSelection = individual.getEventBirth();
            if (birthSelection && birthSelection.length > 0) {
                const birthEvents = birthSelection.arraySelect();
                if (birthEvents && birthEvents.length > 0) {
                    const birthEvent = birthEvents[0];
                    const dateSelection = birthEvent.getDate();
                    if (dateSelection && dateSelection.length > 0 && typeof dateSelection.value === 'function') {
                        // Use value() to get the date string
                        const dateValue = dateSelection.value();
                        birthDate = Array.isArray(dateValue) ? dateValue[0] : dateValue;
                    }
                    const placeSelection = birthEvent.getPlace();
                    if (placeSelection && placeSelection.length > 0 && typeof placeSelection.value === 'function') {
                        const placeValue = placeSelection.value();
                        birthPlace = Array.isArray(placeValue) ? placeValue[0] : placeValue;
                    }
                }
            }
        } catch (e) {
            Logger.error('[GedcomService] Error getting birth:', e);
        }

        try {
            // Get death event - use arraySelect() to get actual events
            const deathSelection = individual.getEventDeath();
            if (deathSelection && deathSelection.length > 0) {
                const deathEvents = deathSelection.arraySelect();
                if (deathEvents && deathEvents.length > 0) {
                    const deathEvent = deathEvents[0];
                    const dateSelection = deathEvent.getDate();
                    if (dateSelection && dateSelection.length > 0 && typeof dateSelection.value === 'function') {
                        const dateValue = dateSelection.value();
                        deathDate = Array.isArray(dateValue) ? dateValue[0] : dateValue;
                    }
                    const placeSelection = deathEvent.getPlace();
                    if (placeSelection && placeSelection.length > 0 && typeof placeSelection.value === 'function') {
                        const placeValue = placeSelection.value();
                        deathPlace = Array.isArray(placeValue) ? placeValue[0] : placeValue;
                    }
                }
            }
        } catch (e) {
            Logger.error('[GedcomService] Error getting death:', e);
        }

        // Get all events for the individual (birth, death, burial, etc.)
        // Use the specialized methods from read-gedcom library
        // Note: Birth and death are already handled above, so we get other events here
        try {
            const eventMethods: Array<{ method: string; type: string }> = [
                { method: 'getEventChristening', type: 'Christening' },
                { method: 'getEventBurial', type: 'Burial' },
                { method: 'getEventCremation', type: 'Cremation' },
                { method: 'getEventAdoption', type: 'Adoption' },
                { method: 'getEventBaptism', type: 'Baptism' },
                { method: 'getEventBarMitzvah', type: 'Bar Mitzvah' },
                { method: 'getEventBatMitzvah', type: 'Bat Mitzvah' },
                { method: 'getEventAdultChristening', type: 'Adult Christening' },
                { method: 'getEventConfirmation', type: 'Confirmation' },
                { method: 'getEventFirstCommunion', type: 'First Communion' },
                { method: 'getEventNaturalization', type: 'Naturalization' },
                { method: 'getEventEmigration', type: 'Emigration' },
                { method: 'getEventImmigration', type: 'Immigration' },
                { method: 'getEventCensus', type: 'Census' },
                { method: 'getEventProbate', type: 'Probate' },
                { method: 'getEventWill', type: 'Will' },
                { method: 'getEventGraduation', type: 'Graduation' },
                { method: 'getEventRetirement', type: 'Retirement' },
                { method: 'getEventOther', type: 'Event' },
            ];

            for (const { method, type } of eventMethods) {
                try {
                    const eventSelection = (individual as any)[method]();
                    if (eventSelection && eventSelection.length > 0) {
                        const eventArray = eventSelection.arraySelect();
                        for (const evt of eventArray) {
                            let date: string | undefined;
                            let place: string | undefined;
                            let eventType = type;

                            // For getEventOther, try to get the custom type (TYPE subtag)
                            if (method === 'getEventOther') {
                                try {
                                    const typeSel = evt.getType();
                                    if (typeSel && typeSel.length > 0 && typeof typeSel.value === 'function') {
                                        const typeValue = typeSel.value();
                                        const customType = Array.isArray(typeValue) ? typeValue[0] : typeValue;
                                        if (customType) {
                                            eventType = customType;
                                        }
                                    }
                                } catch (e) {}
                            }

                            // Try to get date
                            try {
                                const dateSel = evt.getDate();
                                if (dateSel && dateSel.length > 0 && typeof dateSel.value === 'function') {
                                    const dateValue = dateSel.value();
                                    date = Array.isArray(dateValue) ? dateValue[0] : dateValue;
                                }
                            } catch (e) {}

                            // Try to get place
                            try {
                                const placeSel = evt.getPlace();
                                if (placeSel && placeSel.length > 0 && typeof placeSel.value === 'function') {
                                    const placeValue = placeSel.value();
                                    place = Array.isArray(placeValue) ? placeValue[0] : placeValue;
                                }
                            } catch (e) {}

                            if (date || place) {
                                events.push({ type: eventType, date, place });
                            }
                        }
                    }
                } catch (e) {
                    // Skip methods that don't exist or fail
                }
            }
        } catch (e) {
            Logger.error('[GedcomService] Error getting events:', e);
        }

        try {
            // Get families as spouse
            const spouseSelection = individual.getFamilyAsSpouse();
            if (spouseSelection != null && spouseSelection.length > 0) {
                for (const familyRef of spouseSelection.arraySelect()) {
                    const famPointer = familyRef.pointer();
                    let famId = famPointer && famPointer.length > 0 ? famPointer[0] : '';
                    if (famId) {
                        // Normalize to have @ prefix
                        if (!famId.startsWith('@')) famId = `@${famId}@`;
                        familiesAsSpouse.push(famId);
                    }
                }
            }
        } catch (e) {
            Logger.warn(`[GedcomService] Error getting families as spouse for ${id}:`, e);
        }

        try {
            // Get families as child
            const childSelection = individual.getFamilyAsChild();
            if (childSelection != null && childSelection.length > 0) {
                for (const familyRef of childSelection.arraySelect()) {
                    const famPointer = familyRef.pointer();
                    let famId = famPointer && famPointer.length > 0 ? famPointer[0] : '';
                    if (famId) {
                        // Normalize to have @ prefix
                        if (!famId.startsWith('@')) famId = `@${famId}@`;
                        familiesAsChild.push(famId);
                    }
                }
            }
        } catch (e) {
            Logger.warn(`[GedcomService] Error getting families as child for ${id}:`, e);
        }

        return {
            id,
            name: name || `${firstName} ${surname}`.trim(),
            firstName,
            surname,
            birthDate,
            birthPlace,
            deathDate,
            deathPlace,
            sex,
            familiesAsSpouse,
            familiesAsChild,
            events
        };
    }

    private processFamily(rawFamily: any, rawData: any): GedcomFamily {
        Logger.debug('[GedcomService] processFamily: rawFamily=', rawFamily);
        let id = '';
        let husbandId: string | undefined;
        let wifeId: string | undefined;
        const childrenIds: string[] = [];
        let marriageDate: string | undefined;
        let marriagePlace: string | undefined;
        const events: GedcomEvent[] = [];

        // Get ID
        try {
            const pointer = rawFamily.pointer();
            id = pointer && pointer.length > 0 ? pointer[0] : '';
            // Normalize to have @ prefix
            if (id && !id.startsWith('@')) id = `@${id}@`;
        } catch (e) {}

        // Get husband - use value() to get the pointer string from SelectionIndividualReference
        try {
            const husbandRef = rawFamily.getHusband();
            if (husbandRef && husbandRef.length > 0) {
                // Use value() to get the pointer string from SelectionIndividualReference
                const husbandValue = husbandRef.value();
                husbandId = husbandValue && husbandValue.length > 0 ? husbandValue[0] : '';
                // Normalize to have @ prefix
                if (husbandId && !husbandId.startsWith('@')) husbandId = `@${husbandId}@`;
            }
        } catch (e) {}

        // Get wife - use value() to get the pointer string from SelectionIndividualReference
        try {
            const wifeRef = rawFamily.getWife();
            if (wifeRef && wifeRef.length > 0) {
                // Use value() to get the pointer string from SelectionIndividualReference
                const wifeValue = wifeRef.value();
                wifeId = wifeValue && wifeValue.length > 0 ? wifeValue[0] : '';
                // Normalize to have @ prefix
                if (wifeId && !wifeId.startsWith('@')) wifeId = `@${wifeId}@`;
            }
        } catch (e) {}

        // Get children - use value() to get the pointer string from SelectionIndividualReference
        try {
            const childRef = rawFamily.getChild();
            if (childRef && childRef.length > 0) {
                const children = childRef.arraySelect();
                for (const childRecord of children) {
                    // Use value() to get the pointer string from SelectionIndividualReference
                    const childValue = childRecord.value();
                    let childId = childValue && childValue.length > 0 ? childValue[0] : '';
                    if (childId) {
                        // Normalize to have @ prefix
                        if (!childId.startsWith('@')) childId = `@${childId}@`;
                        childrenIds.push(childId);
                    }
                }
            }
        } catch (e) {}

        // Get marriage event - use arraySelect() to get actual events
        try {
            const marriageRef = rawFamily.getEventMarriage();
            if (marriageRef && marriageRef.length > 0) {
                const marriageEvents = marriageRef.arraySelect();
                if (marriageEvents && marriageEvents.length > 0) {
                    const marriageEvent = marriageEvents[0];
                    const dateSelection = marriageEvent.getDate();
                    if (dateSelection && dateSelection.length > 0 && typeof dateSelection.value === 'function') {
                        const dateValue = dateSelection.value();
                        marriageDate = Array.isArray(dateValue) ? dateValue[0] : dateValue;
                    }
                    const placeSelection = marriageEvent.getPlace();
                    if (placeSelection && placeSelection.length > 0 && typeof placeSelection.value === 'function') {
                        const placeValue = placeSelection.value();
                        marriagePlace = Array.isArray(placeValue) ? placeValue[0] : placeValue;
                    }
                }
            }
        } catch (e) {
            Logger.error('[GedcomService] Error getting marriage:', e);
        }

        // Get divorce event
        let divorceDate: string | undefined;
        let divorcePlace: string | undefined;
        try {
            const divorceSelection = rawFamily.getEventDivorce();
            if (divorceSelection && divorceSelection.length > 0) {
                const divorceEvents = divorceSelection.arraySelect();
                if (divorceEvents && divorceEvents.length > 0) {
                    const divorceEvent = divorceEvents[0];
                    const dateSelection = divorceEvent.getDate();
                    if (dateSelection && dateSelection.length > 0 && typeof dateSelection.value === 'function') {
                        const dateValue = dateSelection.value();
                        divorceDate = Array.isArray(dateValue) ? dateValue[0] : dateValue;
                    }
                    const placeSelection = divorceEvent.getPlace();
                    if (placeSelection && placeSelection.length > 0 && typeof placeSelection.value === 'function') {
                        const placeValue = placeSelection.value();
                        divorcePlace = Array.isArray(placeValue) ? placeValue[0] : placeValue;
                    }
                }
            }
        } catch (e) {
            Logger.error('[GedcomService] Error getting divorce:', e);
        }

        // Get other family events (engagement, annulment, etc.)
        try {
            const eventTypes = [
                { tag: 'DIVF', type: 'Divorce Filed' },
                { tag: 'ENGA', type: 'Engagement' },
                { tag: 'MARB', type: 'Marriage Bann' },
                { tag: 'MARC', type: 'Marriage Contract' },
                { tag: 'MARL', type: 'Marriage License' },
                { tag: 'MARS', type: 'Marriage Settlement' },
                { tag: 'ANUL', type: 'Annulment' }
            ];

            for (const { tag, type } of eventTypes) {
                const eventSelection = rawFamily.get(tag);
                if (eventSelection && eventSelection.length > 0) {
                    const eventArray = eventSelection.arraySelect();
                    for (const evt of eventArray) {
                        if (typeof evt.getDate !== 'function') {
                            continue;
                        }
                        const dateSel = evt.getDate();
                        const placeSel = evt.getPlace();
                        let dateValue: string | undefined;
                        if (dateSel && dateSel.length > 0 && typeof dateSel.value === 'function') {
                            const val = dateSel.value();
                            dateValue = Array.isArray(val) ? val[0] : val;
                        }
                        let placeValue: string | undefined;
                        if (placeSel && placeSel.length > 0 && typeof placeSel.value === 'function') {
                            const val = placeSel.value();
                            placeValue = Array.isArray(val) ? val[0] : val;
                        }
                        events.push({
                            type,
                            date: dateValue,
                            place: placeValue
                        });
                    }
                }
            }
        } catch (e) {
            Logger.error('[GedcomService] Error getting family events:', e);
        }

        return {
            id,
            husbandId,
            wifeId,
            childrenIds,
            marriageDate,
            marriagePlace,
            divorceDate,
            divorcePlace,
            events
        };
    }

    /**
     * Get an individual by ID
     */
    getIndividual(id: string): GedcomIndividual | null {
        // Normalize ID to have @ prefix
        const normalizedId = id.startsWith('@') ? id : `@${id}@`;

        for (const data of this.gedcomData) {
            if (data.individuals[normalizedId]) {
                return data.individuals[normalizedId];
            }
        }

        return null;
    }

    /**
     * Get all individuals
     */
    getAllIndividuals(): GedcomIndividual[] {
        const allIndividuals: GedcomIndividual[] = [];
        for (const data of this.gedcomData) {
            allIndividuals.push(...Object.values(data.individuals));
        }
        return allIndividuals;
    }

    /**
     * Get a family by ID
     */
    getFamily(id: string): GedcomFamily | null {
        const normalizedId = id.startsWith('@') ? id : `@${id}@`;

        for (const data of this.gedcomData) {
            if (data.families[normalizedId]) {
                return data.families[normalizedId];
            }
        }
        return null;
    }

    /**
     * Get all families
     */
    getAllFamilies(): GedcomFamily[] {
        const allFamilies: GedcomFamily[] = [];
        for (const data of this.gedcomData) {
            allFamilies.push(...Object.values(data.families));
        }
        return allFamilies;
    }

    /**
     * Get all individuals with basic info for the person list
     */
    getIndividualsForList(): {
        id: string;
        name: string;
        birthDate?: string;
        deathDate?: string;
        birthPlace?: string;
        deathPlace?: string;
    }[] {
        const result: {
            id: string;
            name: string;
            birthDate?: string;
            deathDate?: string;
            birthPlace?: string;
            deathPlace?: string;
        }[] = [];
        const seenIds = new Set<string>();

        for (const data of this.gedcomData) {
            for (const individual of Object.values(data.individuals)) {
                // Normalize ID and skip duplicates
                const normalizedId = individual.id.startsWith('@') ? individual.id : `@${individual.id}@`;
                if (seenIds.has(normalizedId)) {
                    continue;
                }
                seenIds.add(normalizedId);

                const cleanId = individual.id ? individual.id.replace(/@/g, '') : '';
                result.push({
                    id: cleanId,
                    name: individual.name || `${individual.firstName || ''} ${individual.surname || ''}`.trim(),
                    birthDate: individual.birthDate,
                    deathDate: individual.deathDate,
                    birthPlace: individual.birthPlace,
                    deathPlace: individual.deathPlace
                });
            }
        }

        return result;
    }

    /**
     * Get all families with basic info for the family list
     */
    getFamiliesForList(): {
        id: string;
        husbandName?: string;
        wifeName?: string;
        marriageDate?: string;
        marriagePlace?: string;
        childrenCount: number;
    }[] {
        const result: {
            id: string;
            husbandName?: string;
            wifeName?: string;
            marriageDate?: string;
            marriagePlace?: string;
            childrenCount: number;
        }[] = [];
        const seenIds = new Set<string>();

        for (const data of this.gedcomData) {
            for (const family of Object.values(data.families)) {
                // Normalize ID and skip duplicates
                const normalizedId = family.id.startsWith('@') ? family.id : `@${family.id}@`;
                if (seenIds.has(normalizedId)) {
                    continue;
                }
                seenIds.add(normalizedId);

                const cleanId = family.id ? family.id.replace(/@/g, '') : '';

                // Get spouse names
                let husbandName: string | undefined;
                let wifeName: string | undefined;

                if (family.husbandId) {
                    const husband = this.getIndividual(family.husbandId);
                    if (husband) {
                        husbandName = husband.name || `${husband.firstName || ''} ${husband.surname || ''}`.trim();
                    }
                }

                if (family.wifeId) {
                    const wife = this.getIndividual(family.wifeId);
                    if (wife) {
                        wifeName = wife.name || `${wife.firstName || ''} ${wife.surname || ''}`.trim();
                    }
                }

                result.push({
                    id: cleanId,
                    husbandName,
                    wifeName,
                    marriageDate: family.marriageDate,
                    marriagePlace: family.marriagePlace,
                    childrenCount: family.childrenIds?.length || 0
                });
            }
        }

        return result;
    }

    /**
     * Get family members for a given individual
     */
    getFamilyMembers(individualId: string): {
        father: GedcomIndividual | null;
        mother: GedcomIndividual | null;
        siblings: GedcomIndividual[];
        spouses: GedcomIndividual[];
        children: GedcomIndividual[];
    } {
        // Normalize individualId to have @ prefix
        const normalizedIndividualId = individualId.startsWith('@') ? individualId : `@${individualId}@`;
        
        const individual = this.getIndividual(normalizedIndividualId);
        if (!individual) {
            return { father: null, mother: null, siblings: [], spouses: [], children: [] };
        }

        const result = {
            father: null as GedcomIndividual | null,
            mother: null as GedcomIndividual | null,
            siblings: [] as GedcomIndividual[],
            spouses: [] as GedcomIndividual[],
            children: [] as GedcomIndividual[]
        };

        // Find families where this person is a child
        for (const familyId of individual.familiesAsChild || []) {
            const family = this.getFamily(familyId);
            if (family) {
                if (family.husbandId) {
                    result.father = this.getIndividual(family.husbandId);
                }
                if (family.wifeId) {
                    result.mother = this.getIndividual(family.wifeId);
                }

                // Find siblings
                if (family.childrenIds) {
                    for (const childId of family.childrenIds) {
                        const normalizedChildId = childId.startsWith('@') ? childId : `@${childId}@`;
                        if (normalizedChildId !== normalizedIndividualId) {
                            const sibling = this.getIndividual(childId);
                            if (sibling) {
                                result.siblings.push(sibling);
                            }
                        }
                    }
                }
            }
        }

        // Find families where this person is a spouse
        for (const familyId of individual.familiesAsSpouse || []) {
            const family = this.getFamily(familyId);
            if (family) {
                // Add spouse - find the other person in the family
                if (family.husbandId) {
                    const normalizedHusbandId = family.husbandId.startsWith('@') ? family.husbandId : `@${family.husbandId}@`;
                    if (normalizedHusbandId !== normalizedIndividualId) {
                        const spouse = this.getIndividual(family.husbandId);
                        if (spouse) {
                            result.spouses.push(spouse);
                        }
                    }
                }
                if (family.wifeId) {
                    const normalizedWifeId = family.wifeId.startsWith('@') ? family.wifeId : `@${family.wifeId}@`;
                    if (normalizedWifeId !== normalizedIndividualId) {
                        const spouse = this.getIndividual(family.wifeId);
                        if (spouse) {
                            result.spouses.push(spouse);
                        }
                    }
                }

                // Add children
                if (family.childrenIds) {
                    for (const childId of family.childrenIds) {
                        const child = this.getIndividual(childId);
                        if (child) {
                            result.children.push(child);
                        }
                    }
                }
            }
        }

        return result;
    }

    /**
     * Get note text from a raw GEDCOM event using read-gedcom API
     * @param rawEvent Raw event object from read-gedcom
     * @returns Note text or empty string
     */
    getNoteFromEvent(rawEvent: any): string {
        try {
            if (!rawEvent) return '';
            
            // Try to get NOTE using read-gedcom API
            const noteSelection = rawEvent.getNote?.();
            if (noteSelection && noteSelection.length > 0) {
                const noteValue = noteSelection.value();
                return Array.isArray(noteValue) ? noteValue[0] || '' : noteValue || '';
            }
        } catch (e) {
            Logger.error('[GedcomService] Error getting note from event:', e);
        }
        return '';
    }

    /**
     * Get raw individual record from cache by ID
     */
    getRawIndividual(id: string): any {
        const normalizedId = id.startsWith('@') ? id : `@${id}@`;
        
        for (const filePath of Object.keys(this.parsedDataCache)) {
            const rawData = this.parsedDataCache[filePath];
            try {
                const individuals = rawData.getIndividualRecord();
                const allIndividuals = individuals.arraySelect();
                const individual = allIndividuals.find((ind: any) => {
                    const pointer = ind.pointer();
                    const indId = pointer && pointer.length > 0 ? pointer[0] : '';
                    const storeId = indId.startsWith('@') ? indId : `@${indId}@`;
                    return storeId === normalizedId;
                });
                if (individual) return individual;
            } catch (e) {
                // Skip this file
            }
        }
        return null;
    }

    /**
     * Get raw family record from cache by ID
     */
    getRawFamily(id: string): any {
        const normalizedId = id.startsWith('@') ? id : `@${id}@`;

        for (const filePath of Object.keys(this.parsedDataCache)) {
            const rawData = this.parsedDataCache[filePath];
            try {
                const families = rawData.getFamilyRecord();
                const allFamilies = families.arraySelect();
                const family = allFamilies.find((fam: any) => {
                    const pointer = fam.pointer();
                    const famId = pointer && pointer.length > 0 ? pointer[0] : '';
                    const storeId = famId.startsWith('@') ? famId : `@${famId}@`;
                    return storeId === normalizedId;
                });
                if (family) return family;
            } catch (e) {
                // Skip this file
            }
        }
        return null;
    }

    /**
     * Нормализовать дату из GEDCOM формата в YYYY-MM-DD
     * Преобразует форматы GEDCOM (1 JAN 1950) в YYYY-MM-DD или YYYY
     */
    normalizeDate(date: string): string {
        if (!date) return '';

        // Удаляем лишние пробелы
        let normalized = date.trim();

        // Если это диапазон с тильдой, нормализуем обе части
        if (normalized.includes('~')) {
            const parts = normalized.split('~');
            return parts.map(p => this.normalizeDatePart(p.trim())).join('~');
        }

        // Если это диапазон с дефисом
        if (normalized.match(/^\d{1,2}\s+\w{3}\s+\d{4}\s*[-–—]\s*\d{1,2}\s+\w{3}\s+\d{4}$/)) {
            const parts = normalized.split(/[-–—]/);
            return parts.map(p => this.normalizeDatePart(p.trim())).join('~');
        }

        return this.normalizeDatePart(normalized);
    }

    /**
     * Нормализовать часть даты (без диапазонов)
     */
    private normalizeDatePart(date: string): string {
        if (!date) return '';

        const monthMap: Record<string, string> = {
            'JAN': '01', 'FEB': '02', 'MAR': '03', 'APR': '04',
            'MAY': '05', 'JUN': '06', 'JUL': '07', 'AUG': '08',
            'SEP': '09', 'OCT': '10', 'NOV': '11', 'DEC': '12'
        };

        // Формат: 1 JAN 1950 → 1950-01-01
        const match = date.match(/^(\d{1,2})\s+(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s+(\d{4})$/i);
        if (match) {
            const day = match[1].padStart(2, '0');
            const month = monthMap[match[2].toUpperCase()];
            const year = match[3];
            return `${year}-${month}-${day}`;
        }

        // Формат: JAN 1950 → 1950-01
        const match2 = date.match(/^(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s+(\d{4})$/i);
        if (match2) {
            const month = monthMap[match2[1].toUpperCase()];
            const year = match2[2];
            return `${year}-${month}`;
        }

        // Формат: 1950 → 1950
        if (/^\d{4}$/.test(date)) {
            return date;
        }

        // Формат: 1950-01-01 → оставляем как есть
        if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            return date;
        }

        // Пытаемся извлечь год
        const yearMatch = date.match(/\b(\d{4})\b/);
        if (yearMatch) {
            return yearMatch[1];
        }

        return date;
    }

    /**
     * Get grandparents for an individual
     */
    getGrandparents(individualId: string): {
        paternalGrandfather: GedcomIndividual | null;
        paternalGrandmother: GedcomIndividual | null;
        maternalGrandfather: GedcomIndividual | null;
        maternalGrandmother: GedcomIndividual | null;
    } {
        const result = {
            paternalGrandfather: null as GedcomIndividual | null,
            paternalGrandmother: null as GedcomIndividual | null,
            maternalGrandfather: null as GedcomIndividual | null,
            maternalGrandmother: null as GedcomIndividual | null,
        };

        const individual = this.getIndividual(individualId);
        if (!individual) return result;

        // Get parents
        const familyMembers = this.getFamilyMembers(individualId);

        // Get paternal grandparents
        if (familyMembers.father) {
            const fatherFamilyMembers = this.getFamilyMembers(familyMembers.father.id);
            result.paternalGrandfather = fatherFamilyMembers.father;
            result.paternalGrandmother = fatherFamilyMembers.mother;
        }

        // Get maternal grandparents
        if (familyMembers.mother) {
            const motherFamilyMembers = this.getFamilyMembers(familyMembers.mother.id);
            result.maternalGrandfather = motherFamilyMembers.father;
            result.maternalGrandmother = motherFamilyMembers.mother;
        }

        return result;
    }

    /**
     * Get ancestors up to n generations for an individual
     */
    getAncestors(individualId: string, generations: number): GedcomIndividual[] {
        const ancestors: GedcomIndividual[] = [];
        let currentIds = [individualId];

        for (let gen = 0; gen < generations; gen++) {
            const generationAncestors: GedcomIndividual[] = [];

            for (const id of currentIds) {
                const familyMembers = this.getFamilyMembers(id);
                if (familyMembers.father) generationAncestors.push(familyMembers.father);
                if (familyMembers.mother) generationAncestors.push(familyMembers.mother);
            }

            if (generationAncestors.length === 0) break;

            ancestors.push(...generationAncestors);
            currentIds = generationAncestors.map(a => a.id);
        }

        return ancestors;
    }

    /**
     * Get family with all details for diagram rendering
     */
    getFamilyDiagramData(familyId: string): {
        id: string;
        husband: GedcomIndividual | null;
        wife: GedcomIndividual | null;
        children: GedcomIndividual[];
        marriageDate: string;
        marriagePlace: string;
        divorceDate: string;
        divorcePlace: string;
    } | null {
        const family = this.getFamily(familyId);
        if (!family) return null;

        const husband = family.husbandId ? this.getIndividual(family.husbandId) : null;
        const wife = family.wifeId ? this.getIndividual(family.wifeId) : null;

        const children: GedcomIndividual[] = [];
        if (family.childrenIds) {
            for (const childId of family.childrenIds) {
                const child = this.getIndividual(childId);
                if (child) children.push(child);
            }
        }

        // Extract marriage and divorce info from family events
        let marriageDate = '';
        let marriagePlace = '';
        let divorceDate = '';
        let divorcePlace = '';

        if (family.events) {
            for (const event of family.events) {
                if (event.type === 'MARR') {
                    marriageDate = event.date || '';
                    marriagePlace = event.place || '';
                } else if (event.type === 'DIV') {
                    divorceDate = event.date || '';
                    divorcePlace = event.place || '';
                }
            }
        }

        return {
            id: family.id,
            husband,
            wife,
            children,
            marriageDate,
            marriagePlace,
            divorceDate,
            divorcePlace,
        };
    }

    /**
     * Get individual with ancestors for diagram rendering
     */
    getIndividualDiagramData(individualId: string): {
        person: GedcomIndividual;
        grandparents: {
            paternalGrandfather: GedcomIndividual | null;
            paternalGrandmother: GedcomIndividual | null;
            maternalGrandfather: GedcomIndividual | null;
            maternalGrandmother: GedcomIndividual | null;
        };
        parents: {
            father: GedcomIndividual | null;
            mother: GedcomIndividual | null;
        };
        parentsFamily: {
            id: string;
            marriageDate: string;
            marriagePlace: string;
            divorceDate: string;
            divorcePlace: string;
        } | null;
    } | null {
        const person = this.getIndividual(individualId);
        if (!person) return null;

        const grandparents = this.getGrandparents(individualId);
        const familyMembers = this.getFamilyMembers(individualId);

        // Get parents' family data
        let parentsFamily = null;
        if (person.familiesAsChild && person.familiesAsChild.length > 0) {
            parentsFamily = this.getFamilyDiagramData(person.familiesAsChild[0]);
        }

        return {
            person,
            grandparents,
            parents: {
                father: familyMembers.father,
                mother: familyMembers.mother,
            },
            parentsFamily: parentsFamily ? {
                id: parentsFamily.id,
                marriageDate: parentsFamily.marriageDate,
                marriagePlace: parentsFamily.marriagePlace,
                divorceDate: parentsFamily.divorceDate,
                divorcePlace: parentsFamily.divorcePlace,
            } : null,
        };
    }

    /**
     * Get families where an individual is a spouse
     */
    getFamiliesAsSpouse(individualId: string): string[] {
        const individual = this.getIndividual(individualId);
        return individual?.familiesAsSpouse || [];
    }

    /**
     * Get spouse names for an individual (re-export from renderers)
     */
    getSpouseNames(individual: GedcomIndividual, gedcomService: GedcomService): string[] {
        const spouseNames: string[] = [];

        if (!individual.familiesAsSpouse || individual.familiesAsSpouse.length === 0) {
            return spouseNames;
        }

        for (const familyId of individual.familiesAsSpouse) {
            const family = gedcomService.getFamily(familyId);
            if (family) {
                // Find the other spouse (not the current individual)
                const otherSpouseId = family.husbandId === individual.id ? family.wifeId : family.husbandId;
                if (otherSpouseId) {
                    const spouse = gedcomService.getIndividual(otherSpouseId);
                    if (spouse) {
                        spouseNames.push(`${spouse.firstName || ''} ${spouse.surname || ''}`.trim());
                    }
                }
            }
        }

        return spouseNames;
    }
}
