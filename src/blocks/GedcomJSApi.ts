import { App, MarkdownRenderChild, MarkdownPostProcessorContext } from 'obsidian';
import { GedcomService } from '../gedcom/service';
import { GedcomIndividual, GedcomFamily, GedcomEvent } from '../gedcom/types';
import { Logger } from '../utils/logger';

/**
 * API object exposed to user scripts in ged-js blocks.
 *
 * ## Quick Start
 *
 * ```javascript
 * // Get a person by ID
 * const person = ged.service.getIndividual('@I42@');
 *
 * // Get their family (where they were born)
 * const familyId = person.familiesAsChild?.[0];
 * const birthFamily = ged.service.getFamily(familyId);
 *
 * // Get family members (parents, siblings, spouse, children)
 * const fm = ged.service.getFamilyMembers('@I42@');
 * // fm.father, fm.mother, fm.siblings[], fm.spouses[], fm.children[]
 *
 * // Format dates for display
 * const birthDate = ged.formatDate(person.birthDate);  // "1 января 1895"
 *
 * // Render markdown with Obsidian formatting
 * await ged.renderMarkdown('**Bold text** and *italic*', container);
 * ```
 *
 * ## Key Service Methods
 *
 * ### Individuals
 * - `ged.service.getIndividual('@ID@')` — get person by ID (returns `GedcomIndividual | null`)
 * - `ged.service.getAllIndividuals()` — get all persons as array
 *
 * ### Families
 * - `ged.service.getFamily('@ID@')` — get family by ID (returns `GedcomFamily | null`)
 * - `ged.service.getAllFamilies()` — get all families as array
 *
 * ### Relatives
 * - `ged.service.getFamilyMembers('@ID@')` — get all relatives:
 *   - `.father` / `.mother` — parents (GedcomIndividual | null)
 *   - `.siblings[]` — brothers/sisters
 *   - `.spouses[]` — spouse(s)
 *   - `.children[]` — children
 *
 * ## GedcomIndividual properties
 * - `id` — GEDCOM ID (e.g. `@I42@`)
 * - `name`, `firstName`, `surname`
 * - `birthDate`, `birthPlace`, `deathDate`, `deathPlace`
 * - `sex` — `'M'` or `'F'`
 * - `familiesAsSpouse[]` — family IDs where this person is a spouse
 * - `familiesAsChild[]` — family ID where this person is a child
 * - `events[]` — array of `{type, date, place}` (BIRT, DEAT, BURI, etc.)
 *
 * ## GedcomFamily properties
 * - `id` — family ID (e.g. `@F4@`)
 * - `husbandId`, `wifeId` — spouse IDs
 * - `childrenIds[]` — children IDs
 * - `marriageDate`, `marriagePlace`, `divorceDate`, `divorcePlace`
 * - `events[]` — array of `{type, date, place}` (MARR, DIV, ENGA, etc.)
 *
 * ## Navigation patterns
 *
 * ```javascript
 * // Get parents
 * const fm = ged.service.getFamilyMembers(person.id);
 * const father = fm.father;
 * const mother = fm.mother;
 *
 * // Get spouse
 * const spouses = fm.spouses;  // array (could be multiple if remarried)
 *
 * // Get children
 * const children = fm.children;  // array of GedcomIndividual
 *
 * // Get birth family details
 * const birthFamId = person.familiesAsChild?.[0];
 * const birthFam = ged.service.getFamily(birthFamId);
 * // birthFam.husbandId = father, birthFam.wifeId = mother
 *
 * // Get spouse's family
 * const spouseFamId = person.familiesAsSpouse?.[0];
 * const spouseFam = ged.service.getFamily(spouseFamId);
 * // spouseFam.childrenIds = their children together
 *
 * // Get all events
 * for (const event of person.events) {
 *     console.log(event.type, ged.formatDate(event.date), event.place);
 * }
 * ```
 */
export interface GedcomJSApi {
    /** Obsidian App instance — full access to Obsidian API */
    app: App;

    /** GEDCOM Service — access to all genealogy data */
    service: GedcomService;

    /** DOM container for rendering */
    container: HTMLElement;

    /** Component (lifecycle management) */
    component: MarkdownRenderChild;

    /** Path to the current note file */
    sourcePath: string;

    /**
     * Create a DOM element
     * @param tag HTML tag name
     * @param attrs Attributes object (cls, text, etc.)
     * @param parent Parent element (defaults to container)
     * @example
     * ged.el('div', { cls: 'my-class' })
     * ged.el('span', { text: 'Hello' }, parentEl)
     */
    el(tag: string, attrs?: Record<string, any>, parent?: HTMLElement): HTMLElement;

    /**
     * Create a heading
     * @param level 1-6
     */
    header(level: number, text: string): HTMLElement;

    /**
     * Create a paragraph (plain text, no markdown)
     */
    paragraph(text: string): HTMLElement;

    /**
     * Create a span (plain text, no markdown)
     */
    span(text: string): HTMLElement;

    /**
     * Render markdown text using Obsidian's built-in renderer.
     * Supports **bold**, *italic*, `code`, links, tables, etc.
     *
     * @param markdown Markdown string to render
     * @param el Target DOM element (defaults to container)
     * @example
     * // Render bold/italic text
     * await ged.renderMarkdown('**John** was born in *1895*', ged.container);
     *
     * // Render a table
     * await ged.renderMarkdown('| Name | Date |\\n|------|------|\\n| John | 1895 |', el);
     */
    renderMarkdown(markdown: string, el?: HTMLElement): Promise<void>;

    /**
     * Create a bulleted list from an array of strings
     */
    list(items: string[]): HTMLElement;

    /**
     * Create an HTML table
     * @param headers Column headers
     * @param rows Table rows (array of arrays)
     * @example
     * ged.table(
     *     ['Name', 'Birth'],
     *     [['John', '1895'], ['Jane', '1900']]
     * );
     */
    table(headers: string[], rows: string[][]): HTMLElement;

    /**
     * Format a GEDCOM date for human-readable display.
     *
     * Converts GEDCOM date formats to localized display format:
     * - `"1 JAN 1950"` → `"1 января 1950"`
     * - `"JAN 1950"` → `"январь 1950"`
     * - `"1950-01-01"` → `"1 января 1950"`
     * - `"1950"` → `"1950"`
     * - `"1950~1960"` → `"1950 ~ 1960"`
     * - Unknown formats returned as-is
     *
     * @param date Raw GEDCOM date string
     * @example
     * const birthDate = ged.formatDate(person.birthDate);  // "1 января 1895"
     * const deathDate = ged.formatDate(person.deathDate);  // "17 июля 1918"
     */
    formatDate(date: string): string;
}
