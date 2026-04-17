import { MarkdownPostProcessorContext, App } from 'obsidian';
import { GedcomService } from '../gedcom/service';
import { GedcomPersonRenderer, GedcomFamilyRenderer, GedcomPersonEventsRenderer, GedcomPersonFullRenderer, GedcomPersonCompareRenderer } from './GedcomRenderChild';
import { GedChronosRenderer } from './ChronosRenderChild';
import { GedcomJSRenderer } from './GedcomJSRenderer';
import { createTopolaRenderer } from './TopolaRenderer';

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
    defaultGenerations: number = 3
): Promise<void> {
    createTopolaRenderer(source, el, ctx, gedcomService, 'ancestors', defaultGenerations);
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
    defaultGenerations: number = 3
): Promise<void> {
    createTopolaRenderer(source, el, ctx, gedcomService, 'descendants', defaultGenerations);
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
    defaultGenerations: number = 3
): Promise<void> {
    createTopolaRenderer(source, el, ctx, gedcomService, 'hourglass', defaultGenerations);
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
    defaultGenerations: number = 3
): Promise<void> {
    createTopolaRenderer(source, el, ctx, gedcomService, 'relatives', defaultGenerations);
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
