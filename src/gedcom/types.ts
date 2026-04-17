// Type definitions for GEDCOM data structures

export interface GedcomIndividual {
    id: string;
    name: string;
    firstName?: string;
    surname?: string;
    birthDate?: string;
    birthPlace?: string;
    deathDate?: string;
    deathPlace?: string;
    sex?: string;
    familiesAsSpouse?: string[]; // IDs of families where this person is a spouse
    familiesAsChild?: string[]; // IDs of families where this person is a child
    events?: GedcomEvent[];
}

export interface GedcomFamily {
    id: string;
    husbandId?: string;
    wifeId?: string;
    childrenIds?: string[];
    marriageDate?: string;
    marriagePlace?: string;
    divorceDate?: string;
    divorcePlace?: string;
    events?: GedcomEvent[];
}

export interface GedcomEvent {
    type: string; // BIRT, DEAT, MARR, etc.
    date?: string;
    place?: string;
    description?: string;
}

export interface GedcomData {
    individuals: Record<string, GedcomIndividual>;
    families: Record<string, GedcomFamily>;
    fileName: string;
}

// Diagram-specific types for D3 rendering
export interface DiagramPerson {
    id: string;
    name: string;
    birthDate?: string;
    birthPlace?: string;
    deathDate?: string;
    deathPlace?: string;
    sex?: string;
    spouse?: DiagramPerson;
    spouseId?: string; // For linking
}

export interface DiagramFamily {
    id: string;
    husband?: DiagramPerson;
    wife?: DiagramPerson;
    husbandId?: string;
    wifeId?: string;
    children: DiagramPerson[];
    totalChildrenCount?: number; // Total children in the family from GEDCOM
    marriageDate?: string;
    marriagePlace?: string;
    divorceDate?: string;
    divorcePlace?: string;
}

export interface DiagramNode {
    id: string;
    type: 'person' | 'family';
    data: DiagramPerson | DiagramFamily;
    x?: number;
    y?: number;
    fx?: number | null; // Fixed x position for dragging
    fy?: number | null; // Fixed y position for dragging
    generation?: number; // For layout purposes
    order?: number; // For sorting within generation
}

export interface DiagramLink {
    source: string;
    target: string;
    type: 'parent-child' | 'spouse' | 'marriage';
    generation?: number; // For styling
}