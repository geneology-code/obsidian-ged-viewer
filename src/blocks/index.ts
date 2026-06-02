import { MarkdownPostProcessorContext, App } from 'obsidian';
import { GedcomService } from '../gedcom/service';
import { GedcomPersonRenderer, GedcomFamilyRenderer, GedcomPersonEventsRenderer, GedcomPersonFullRenderer, GedcomPersonCompareRenderer, GedHeurRenderer } from './GedcomRenderChild';
import { GedChronosRenderer } from './ChronosRenderChild';
import { GedcomJSRenderer } from './GedcomJSRenderer';
import { createTopolaRenderer } from './TopolaRenderer';
import { GenResearchRenderChild } from './GenResearchRenderChild';
import { SourceStatus } from '../research/types';
import { ReproductiveAge, DEFAULT_REPRODUCTIVE_AGE, LifeRangeMode } from '../types/settings';

type GetStatus = (personId: string, sourceName: string) => SourceStatus;
type SetStatus = (personId: string, sourceName: string, status: SourceStatus) => Promise<void>;
type GetEmoji = (status: SourceStatus) => string;
type GetNoteLink = (personId: string) => string;
type SaveNoteLink = (personId: string, link: string) => Promise<void>;
type GetPersonFlags = (personId: string) => Set<import('../research/types').PersonFlag>;
type SavePersonFlags = (personId: string, flags: Set<import('../research/types').PersonFlag>) => Promise<void>;
type GetDifficultyOverride = (personId: string) => import('../research/types').DifficultyCategory | undefined;
type SaveDifficultyOverride = (personId: string, override: import('../research/types').DifficultyCategory | undefined) => Promise<void>;

/**
 * Render the ged-person block
 * Always shows key:value info for the first person from the list
 */
export async function renderPersonBlock(
    source: string,
    el: HTMLElement,
    ctx: MarkdownPostProcessorContext,
    gedcomService: GedcomService,
    app: App
): Promise<void> {
    const renderer = new GedcomPersonRenderer(el, source, gedcomService, ctx, app);
    ctx.addChild(renderer);
    await renderer.render();
}

/**
 * Render the ged-person-full block
 * Combines ged-person (key:value) + ged-relatives (markdown family tree) for the first person
 */
export async function renderPersonFullBlock(
    source: string,
    el: HTMLElement,
    ctx: MarkdownPostProcessorContext,
    gedcomService: GedcomService,
    app: App
): Promise<void> {
    const renderer = new GedcomPersonFullRenderer(el, source, gedcomService, ctx, app);
    ctx.addChild(renderer);
    await renderer.render();
}

/**
 * Render the ged-person-compare block (aliased as ged-comp)
 * Always renders comparison table regardless of number of persons
 */
export async function renderPersonCompareBlock(
    source: string,
    el: HTMLElement,
    ctx: MarkdownPostProcessorContext,
    gedcomService: GedcomService,
    app: App
): Promise<void> {
    const renderer = new GedcomPersonCompareRenderer(el, source, gedcomService, ctx, app);
    ctx.addChild(renderer);
    await renderer.render();
}

/**
 * Render the ged-relatives block
 * Supports single ID: @I1@ or multiple IDs: @I1@ @I2@ for comparison
 */
export async function renderFamilyBlock(
    source: string,
    el: HTMLElement,
    ctx: MarkdownPostProcessorContext,
    gedcomService: GedcomService,
    app: App
): Promise<void> {
    const renderer = new GedcomFamilyRenderer(el, source, gedcomService, ctx, app);
    ctx.addChild(renderer);
    await renderer.render();
}

/**
 * Render the ged-person-events block
 * Supports single ID: @I1@ or multiple IDs: @I1@ @I2@ for comparison table
 */
export async function renderPersonEventsBlock(
    source: string,
    el: HTMLElement,
    ctx: MarkdownPostProcessorContext,
    gedcomService: GedcomService,
    app: App
): Promise<void> {
    const renderer = new GedcomPersonEventsRenderer(el, source, gedcomService, ctx, app);
    ctx.addChild(renderer);
    await renderer.render();
}

/**
 * Render the ged-chronos block
 * Expands gci/gcf directives and renders timeline using Chronos plugin
 */
export async function renderGedChronosBlock(
    source: string,
    el: HTMLElement,
    ctx: MarkdownPostProcessorContext,
    gedcomService: GedcomService
): Promise<void> {
    const renderer = new GedChronosRenderer(el, source, gedcomService, ctx);
    ctx.addChild(renderer);
    await renderer.render();
}

/**
 * Render the ged-diagram-ancestors block (Topola)
 * Shows ancestors of an individual
 */
export async function renderDiagramAncestorsBlock(
    source: string,
    el: HTMLElement,
    ctx: MarkdownPostProcessorContext,
    gedcomService: GedcomService,
    defaultGenerations: number = 3,
    app?: App
): Promise<void> {
    createTopolaRenderer(source, el, ctx, gedcomService, 'ancestors', defaultGenerations, app);
}

/**
 * Render the ged-diagram-descendants block (Topola)
 * Shows descendants of an individual
 */
export async function renderDiagramDescendantsBlock(
    source: string,
    el: HTMLElement,
    ctx: MarkdownPostProcessorContext,
    gedcomService: GedcomService,
    defaultGenerations: number = 3,
    app?: App
): Promise<void> {
    createTopolaRenderer(source, el, ctx, gedcomService, 'descendants', defaultGenerations, app);
}

/**
 * Render the ged-diagram-hourglass block (Topola)
 * Shows both ancestors and descendants
 */
export async function renderDiagramHourglassBlock(
    source: string,
    el: HTMLElement,
    ctx: MarkdownPostProcessorContext,
    gedcomService: GedcomService,
    defaultGenerations: number = 3,
    app?: App
): Promise<void> {
    createTopolaRenderer(source, el, ctx, gedcomService, 'hourglass', defaultGenerations, app);
}

/**
 * Render the ged-diagram-relatives block (Topola)
 * Shows all relatives
 */
export async function renderDiagramRelativesBlock(
    source: string,
    el: HTMLElement,
    ctx: MarkdownPostProcessorContext,
    gedcomService: GedcomService,
    defaultGenerations: number = 3,
    app?: App
): Promise<void> {
    createTopolaRenderer(source, el, ctx, gedcomService, 'relatives', defaultGenerations, app);
}

/**
 * Render the ged-research block — research dashboard for frontier ancestors
 */
export async function renderGenResearchBlock(
    source: string,
    el: HTMLElement,
    ctx: MarkdownPostProcessorContext,
    gedcomService: GedcomService,
    app: App,
    maxLifespanYears: number,
    heuristicsFilePath: string,
    getStatus: GetStatus,
    setStatus: SetStatus,
    getEmoji: GetEmoji,
    getNoteLink: GetNoteLink,
    saveNoteLink: SaveNoteLink,
    getPersonFlags: GetPersonFlags,
    savePersonFlags: SavePersonFlags,
    getDifficultyOverride: GetDifficultyOverride,
    saveDifficultyOverride: SaveDifficultyOverride,
    reproductiveAge: ReproductiveAge = DEFAULT_REPRODUCTIVE_AGE,
    lifeRangeMode: LifeRangeMode = 'maximize',
): Promise<void> {
    const renderer = new GenResearchRenderChild(el, source, gedcomService, ctx, app, maxLifespanYears, heuristicsFilePath, getStatus, setStatus, getEmoji, getNoteLink, saveNoteLink, getPersonFlags, savePersonFlags, getDifficultyOverride, saveDifficultyOverride, reproductiveAge, lifeRangeMode);
    ctx.addChild(renderer);
    await renderer.render();
}

/**
 * Render the ged-heur block — shows a person card with spouses, note link, and heuristic sources
 */
export async function renderGedHeurBlock(
    source: string,
    el: HTMLElement,
    ctx: MarkdownPostProcessorContext,
    gedcomService: GedcomService,
    app: App,
    maxLifespanYears: number,
    heuristicsFilePath: string,
    getStatus: GetStatus,
    setStatus: SetStatus,
    getEmoji: GetEmoji,
    getNoteLink: GetNoteLink,
    saveNoteLink: SaveNoteLink,
    reproductiveAge: ReproductiveAge = DEFAULT_REPRODUCTIVE_AGE,
    lifeRangeMode: LifeRangeMode = 'maximize',
): Promise<void> {
    const renderer = new GedHeurRenderer(el, source, gedcomService, ctx, app, maxLifespanYears, heuristicsFilePath, getStatus, setStatus, getEmoji, getNoteLink, saveNoteLink, reproductiveAge, lifeRangeMode);
    ctx.addChild(renderer);
    await renderer.render();
}

/**
 * Render the ged-js block — executes user JavaScript with GEDCOM context
 */
export async function renderGedJSBlock(
    source: string,
    el: HTMLElement,
    ctx: MarkdownPostProcessorContext,
    gedcomService: GedcomService,
    app: App
): Promise<void> {
    const renderer = new GedcomJSRenderer(el, source, gedcomService, ctx, app);
    ctx.addChild(renderer);
}
