import { Plugin, PluginSettingTab, Setting, Notice, App, addIcon } from 'obsidian';
import { Logger, GEDCOMPluginError } from './utils/logger';
import { GedcomService } from './gedcom/service';
import {
    renderPersonBlock,
    renderPersonFullBlock,
    renderPersonCompareBlock,
    renderFamilyBlock,
    renderPersonEventsBlock,
    renderGedChronosBlock,
    renderGedJSBlock,
    renderDiagramAncestorsBlock,
    renderDiagramDescendantsBlock,
    renderDiagramHourglassBlock,
    renderDiagramRelativesBlock,
    renderGenResearchBlock,
    renderGedHeurBlock
} from './blocks';
import { GEDCOM_SEARCH_VIEW, GedcomSearchView } from './views/GedcomSearchView';
import { GEN_RESEARCH_VIEW, GenResearchView } from './views/GenResearchView';
import { parseOverlay, serializeOverlay } from './research/overlayParser';
import { OverlayState, DEFAULT_UI_STATE, SourceStatus, SOURCE_STATUSES } from './research/types';
import { ReproductiveAge, DEFAULT_REPRODUCTIVE_AGE } from './types/settings';
import { PersonListModal } from './commands/personList';
import { registerInsertCommands } from './commands/insertBlocks';
import { GEDCOMPluginSettings, DEFAULT_SETTINGS } from './types/settings';
import { t } from './i18n';
import { DEFAULT_RULES_YAML } from './research/heuristics';
import { RELOAD_ICON } from './assets/reloadIcon';

// Custom ribbon icon — family tree with search
const FAMILY_SEARCH_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor"><g transform="translate(0,16) scale(0.1,-0.1)"><path d="M53 133 c-28 -19 -30 -43 -3 -43 22 0 27 -15 8 -23 -7 -3 3 -5 22 -5 19 0 29 2 23 5 -20 8 -15 23 7 23 28 0 25 24 -5 44 -29 19 -24 19 -52 -1z"/><path d="M7 44 c-4 -4 -7 -12 -7 -18 0 -6 5 -4 10 4 9 13 11 13 21 0 9 -12 10 -12 7 -1 -5 17 -21 25 -31 15z"/><path d="M67 44 c-10 -11 -8 -24 4 -24 5 0 7 5 4 10 -3 6 -2 10 4 10 5 0 12 -5 14 -10 3 -6 4 -5 3 2 -3 14 -20 21 -29 12z"/><path d="M127 44 c-10 -11 -8 -24 4 -24 5 0 7 5 4 10 -3 6 -2 10 4 10 5 0 12 -5 14 -10 3 -6 4 -5 3 2 -3 14 -20 21 -29 12z"/></g></svg>`;

export default class GEDCOMPlugin extends Plugin {
	settings: GEDCOMPluginSettings;
	gedcomService: GedcomService;
	private researchViewOverlay: OverlayState = { ui: { ...DEFAULT_UI_STATE, expandedIds: [] } };
	private sourceStatuses: Record<string, Record<string, number>> = {};
	private noteLinks: Record<string, string> = {};
	private personFlags: Record<string, string[]> = {};
	private difficultyOverrides: Record<string, string> = {};

	async onload() {
		await this.loadSettings();

		// Initialize logging based on settings
		if (this.settings.enableDebugLogging) {
			Logger.enableDebug();
			console.log('[GEDCOM Plugin] DEBUG LOGGING ENABLED');
		} else {
			Logger.disableDebug();
			console.log('[GEDCOM Plugin] DEBUG LOGGING DISABLED');
		}

		// Test Logger.debug
		Logger.debug('[GEDCOM Plugin] Logger.debug test message');
		Logger.info('[GEDCOM Plugin] Logger.info test message');

		// Initialize core service
		this.gedcomService = new GedcomService(this.app);

		// Register view types
		this.registerView(GEDCOM_SEARCH_VIEW, (leaf) => new GedcomSearchView(leaf, this.gedcomService));
		this.registerView(GEN_RESEARCH_VIEW, (leaf) => new GenResearchView(
			leaf,
			this.gedcomService,
			() => this.settings.maxLifespanYears,
			() => this.settings.heuristicsFilePath,
			() => this.researchViewOverlay,
			async (state) => {
				this.researchViewOverlay = state;
				await this.saveData(this.buildSavePayload());
			},
			(id, name) => this.getSourceStatus(id, name),
			(id, name, st) => this.saveSourceStatus(id, name, st),
			(st) => this.getStatusEmoji(st),
			(id) => this.getNoteLink(id),
			(id, link) => this.saveNoteLink(id, link),
			(id) => this.getPersonFlags(id),
			(id, flags) => this.savePersonFlags(id, flags),
			(id) => this.getDifficultyOverride(id),
			(id, ov) => this.saveDifficultyOverride(id, ov),
			() => this.settings.reproductiveAge,
		));

		// Register custom ribbon icons
		addIcon('family-search', FAMILY_SEARCH_ICON);
		addIcon('gedcom-reload', RELOAD_ICON);

		// Ribbon icons
		this.addRibbonIcon('family-search', t('search.openView') || 'GEDCOM Search', () => {
			this.activateView();
		});
		this.addRibbonIcon('telescope', t('research.openView') || 'Research Dashboard', () => {
			this.activateResearchView();
		});
		this.addRibbonIcon('gedcom-reload', t('command.reloadGedcom') || 'Reload GEDCOM data', () => {
			this.reloadGedcomData();
		});

		// Register code blocks
		this.registerMarkdownCodeBlockProcessor('ged-person', async (source, el, ctx) => {
			await renderPersonBlock(source, el, ctx, this.gedcomService, this.app);
		});

		this.registerMarkdownCodeBlockProcessor('ged-person-full', async (source, el, ctx) => {
			await renderPersonFullBlock(source, el, ctx, this.gedcomService, this.app);
		});

		this.registerMarkdownCodeBlockProcessor('ged-person-compare', async (source, el, ctx) => {
			await renderPersonCompareBlock(source, el, ctx, this.gedcomService, this.app);
		});

		this.registerMarkdownCodeBlockProcessor('ged-comp', async (source, el, ctx) => {
			await renderPersonCompareBlock(source, el, ctx, this.gedcomService, this.app);
		});

		this.registerMarkdownCodeBlockProcessor('ged-relatives', async (source, el, ctx) => {
			await renderFamilyBlock(source, el, ctx, this.gedcomService, this.app);
		});

		this.registerMarkdownCodeBlockProcessor('ged-person-events', async (source, el, ctx) => {
			await renderPersonEventsBlock(source, el, ctx, this.gedcomService, this.app);
		});

		this.registerMarkdownCodeBlockProcessor('ged-chronos', async (source, el, ctx) => {
			await renderGedChronosBlock(source, el, ctx, this.gedcomService);
		});

		// Topola diagram blocks
		this.registerMarkdownCodeBlockProcessor('ged-diagram-ancestors', async (source, el, ctx) => {
			await renderDiagramAncestorsBlock(source, el, ctx, this.gedcomService, this.settings.defaultDiagramGenerations);
		});

		this.registerMarkdownCodeBlockProcessor('ged-diagram-descendants', async (source, el, ctx) => {
			await renderDiagramDescendantsBlock(source, el, ctx, this.gedcomService, this.settings.defaultDiagramGenerations);
		});

		this.registerMarkdownCodeBlockProcessor('ged-diagram-hourglass', async (source, el, ctx) => {
			await renderDiagramHourglassBlock(source, el, ctx, this.gedcomService, this.settings.defaultDiagramGenerations);
		});

		this.registerMarkdownCodeBlockProcessor('ged-diagram-relatives', async (source, el, ctx) => {
			await renderDiagramRelativesBlock(source, el, ctx, this.gedcomService, this.settings.defaultDiagramGenerations);
		});

		this.registerMarkdownCodeBlockProcessor('ged-research', async (source, el, ctx) => {
			await renderGenResearchBlock(source, el, ctx, this.gedcomService, this.app, this.settings.maxLifespanYears, this.settings.heuristicsFilePath,
				(id, name) => this.getSourceStatus(id, name),
				(id, name, st) => this.saveSourceStatus(id, name, st),
				(st) => this.getStatusEmoji(st),
				(id) => this.getNoteLink(id),
				(id, link) => this.saveNoteLink(id, link),
				(id) => this.getPersonFlags(id),
				(id, flags) => this.savePersonFlags(id, flags),
				(id) => this.getDifficultyOverride(id),
				(id, ov) => this.saveDifficultyOverride(id, ov),
				this.settings.reproductiveAge);
		});

		this.registerMarkdownCodeBlockProcessor('ged-heur', async (source, el, ctx) => {
			await renderGedHeurBlock(source, el, ctx, this.gedcomService, this.app, this.settings.maxLifespanYears, this.settings.heuristicsFilePath,
				(id, name) => this.getSourceStatus(id, name),
				(id, name, st) => this.saveSourceStatus(id, name, st),
				(st) => this.getStatusEmoji(st),
				this.settings.reproductiveAge);
		});

		this.registerMarkdownCodeBlockProcessor('ged-js', async (source, el, ctx) => {
			if (!this.settings.enableGedJS) {
				el.createEl('p', { text: 'ged-js blocks are disabled. Enable them in GEDCOM plugin settings.' });
				return;
			}
			await renderGedJSBlock(source, el, ctx, this.gedcomService, this.app);
		});

		// Add commands
		this.addCommand({
			id: 'reload-gedcom',
			name: t('command.reloadGedcom') || 'Reload GEDCOM data',
			callback: () => { this.reloadGedcomData(); }
		});

		this.addCommand({
			id: 'show-all-persons',
			name: t('modal.selectPerson') || 'Show all persons',
			callback: () => {
				new PersonListModal(this.app, this.gedcomService).open();
			}
		});

		// Register insert commands (empty code blocks)
		registerInsertCommands(this.app, (cmd) => this.addCommand(cmd), t);

		// Add settings tab
		this.addSettingTab(new GEDCOMSettingTab(this.app, this));

		// Load GEDCOM data after layout is ready
		this.loadGedcomDataOnReady();
	}

	onunload() {
		this.app.workspace.updateOptions();
		this.app.workspace.detachLeavesOfType(GEDCOM_SEARCH_VIEW);
		this.app.workspace.detachLeavesOfType(GEN_RESEARCH_VIEW);
	}

	async loadSettings() {
		const savedData = await this.loadData();
		console.log('[GEDCOM Plugin] loadSettings: savedData=', savedData);
		const { _researchOverlay, sourceStatuses, noteLinks, personFlags, difficultyOverrides, reproductiveAge: savedRepro, ...settingsData } = savedData || {};
		this.settings = Object.assign({}, DEFAULT_SETTINGS, settingsData);
		// Deep-merge reproductiveAge so partial saves don't lose default sub-fields
		this.settings.reproductiveAge = { ...DEFAULT_REPRODUCTIVE_AGE, ...(savedRepro ?? {}) };
		if (_researchOverlay) {
			this.researchViewOverlay = parseOverlay(_researchOverlay);
		}
		if (sourceStatuses) {
			this.sourceStatuses = sourceStatuses;
		}
		if (noteLinks) {
			this.noteLinks = noteLinks;
		}
		if (personFlags) {
			this.personFlags = personFlags;
		}
		if (difficultyOverrides) {
			this.difficultyOverrides = difficultyOverrides;
		}
		console.log('[GEDCOM Plugin] loadSettings: this.settings=', this.settings);
	}

	async saveSettings() {
		console.log('[GEDCOM Plugin] saveSettings: saving this.settings=', this.settings);
		await this.saveData(this.buildSavePayload());
	}

	private buildSavePayload() {
		return {
			...this.settings,
			_researchOverlay: serializeOverlay(this.researchViewOverlay),
			sourceStatuses: this.sourceStatuses,
			noteLinks: this.noteLinks,
			personFlags: this.personFlags,
			difficultyOverrides: this.difficultyOverrides,
		};
	}

	private getSourceStatus(personId: string, sourceName: string): SourceStatus {
		return (this.sourceStatuses[personId]?.[sourceName] ?? 0) as SourceStatus;
	}

	private getStatusEmoji(status: SourceStatus): string {
		return this.settings.sourceStatusEmojis?.[status] || SOURCE_STATUSES[status].emoji;
	}

	private async saveSourceStatus(personId: string, sourceName: string, status: SourceStatus): Promise<void> {
		if (!this.sourceStatuses[personId]) this.sourceStatuses[personId] = {};
		this.sourceStatuses[personId][sourceName] = status;
		await this.saveData(this.buildSavePayload());
	}

	private getNoteLink(personId: string): string {
		return this.noteLinks[personId] ?? '';
	}

	private async saveNoteLink(personId: string, link: string): Promise<void> {
		if (link) {
			this.noteLinks[personId] = link;
		} else {
			delete this.noteLinks[personId];
		}
		await this.saveData(this.buildSavePayload());
	}

	private getPersonFlags(personId: string): Set<import('./research/types').PersonFlag> {
		return new Set((this.personFlags[personId] ?? []) as import('./research/types').PersonFlag[]);
	}

	private async savePersonFlags(personId: string, flags: Set<import('./research/types').PersonFlag>): Promise<void> {
		if (flags.size > 0) {
			this.personFlags[personId] = [...flags];
		} else {
			delete this.personFlags[personId];
		}
		await this.saveData(this.buildSavePayload());
	}

	private getDifficultyOverride(personId: string): import('./research/types').DifficultyCategory | undefined {
		return this.difficultyOverrides[personId] as import('./research/types').DifficultyCategory | undefined;
	}

	private async saveDifficultyOverride(personId: string, override: import('./research/types').DifficultyCategory | undefined): Promise<void> {
		if (override) {
			this.difficultyOverrides[personId] = override;
		} else {
			delete this.difficultyOverrides[personId];
		}
		await this.saveData(this.buildSavePayload());
	}

	private async activateResearchView() {
		const leaves = this.app.workspace.getLeavesOfType(GEN_RESEARCH_VIEW);
		if (leaves.length > 0) {
			await this.app.workspace.revealLeaf(leaves[0]);
			return;
		}
		const leaf = this.app.workspace.getRightLeaf(false);
		if (leaf) {
			await leaf.setViewState({ type: GEN_RESEARCH_VIEW, active: true });
		}
	}

	private async activateView() {
		// If view is already open, just reveal it
		const leaves = this.app.workspace.getLeavesOfType(GEDCOM_SEARCH_VIEW);
		if (leaves.length > 0) {
			await this.app.workspace.revealLeaf(leaves[0]);
			return;
		}

		// Open view in right sidebar
		const leaf = this.app.workspace.getRightLeaf(false);
		if (leaf) {
			await leaf.setViewState({
				type: GEDCOM_SEARCH_VIEW,
				active: true
			});
		}
	}

	async reloadGedcomData(): Promise<void> {
		if (!this.settings.gedcomFilePath) {
			new Notice(t('notice.noGedcomPath'));
			return;
		}
		try {
			await this.gedcomService.loadGEDCOMFile(this.settings.gedcomFilePath);
			new Notice(t('notice.gedcomLoaded'));
		} catch (error) {
			new Notice(t('notice.gedcomLoadError') + (error instanceof Error ? `: ${error.message}` : ''));
		}
	}

	private async loadGedcomDataOnReady() {
		this.app.workspace.onLayoutReady(async () => {
			Logger.info('Layout ready, loading GEDCOM file...');

			if (this.settings.gedcomFilePath) {
				try {
					await this.gedcomService.loadGEDCOMFile(this.settings.gedcomFilePath);
					this.app.workspace.updateOptions();
					new Notice(t('notice.gedcomLoaded'));
					Logger.info('GEDCOM data loaded successfully');
				} catch (error) {
					Logger.error('Failed to load GEDCOM file:', error);

					let errorMessage = t('notice.gedcomLoadError');
					if (error instanceof Error) {
						errorMessage += `: ${error.message}`;
					}

					new Notice(errorMessage);
				}
			} else {
				Logger.info('No GEDCOM file path configured, skipping data load');
			}
		});
	}
}

class GEDCOMSettingTab extends PluginSettingTab {
	plugin: GEDCOMPlugin;

	constructor(app: App, plugin: GEDCOMPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		// ── General ──────────────────────────────────────────────────────────
		containerEl.createEl('h2', { text: t('common.gedcomGenealogySettings') || 'GEDCOM Genealogy Settings' });

		new Setting(containerEl)
			.setName(t('setting.gedcomFilePath') || 'GEDCOM file path')
			.setDesc(t('setting.gedcomFilePathDescription') || 'Path to your .ged file')
			.addText(text => text
				.setPlaceholder(t('setting.enterGedcomPath') || 'Enter path to .ged file')
				.setValue(this.plugin.settings.gedcomFilePath)
				.onChange(async (value) => {
					this.plugin.settings.gedcomFilePath = value;
					await this.plugin.saveSettings();
				}))
			.addButton(btn => btn
				.setButtonText(t('setting.reloadGedcom') || 'Reload')
				.onClick(() => { this.plugin.reloadGedcomData(); }));

		new Setting(containerEl)
			.setName(t('setting.maxLifespanYears') || 'Maximum lifespan years')
			.setDesc(t('setting.maxLifespanYearsDescription') || 'Maximum age for persons without death event (default: 100)')
			.addText(text => text
				.setPlaceholder('100')
				.setValue(this.plugin.settings.maxLifespanYears.toString())
				.onChange(async (value) => {
					const numValue = parseInt(value, 10);
					if (!isNaN(numValue) && numValue > 0) {
						this.plugin.settings.maxLifespanYears = numValue;
						await this.plugin.saveSettings();
					}
				}));

		new Setting(containerEl)
			.setName(t('setting.defaultDiagramGenerations') || 'Default diagram generations')
			.setDesc(t('setting.defaultDiagramGenerationsDescription') || 'Default number of generations to show in diagrams (can be overridden with LVL:N in code block)')
			.addText(text => text
				.setPlaceholder('3')
				.setValue(this.plugin.settings.defaultDiagramGenerations.toString())
				.onChange(async (value) => {
					const numValue = parseInt(value, 10);
					if (!isNaN(numValue) && numValue > 0) {
						this.plugin.settings.defaultDiagramGenerations = numValue;
						await this.plugin.saveSettings();
					}
				}));

		new Setting(containerEl)
			.setName(t('setting.enableDebugLogging') || 'Enable debug logging')
			.setDesc(t('setting.enableDebugLoggingDescription') || 'Enable detailed debug logs for Topola diagrams and other plugin features (requires Obsidian reload)')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableDebugLogging)
				.onChange(async (value) => {
					this.plugin.settings.enableDebugLogging = value;
					await this.plugin.saveSettings();
					new Notice(value ? t('notice.debugLoggingEnabled') : t('notice.debugLoggingDisabled'));
				}));

		new Setting(containerEl)
			.setName(t('setting.enableGedJS') || 'Enable ged-js blocks')
			.setDesc(t('setting.enableGedJSDescription') || 'Allow execution of user JavaScript code in ged-js code blocks. WARNING: This gives full access to Node.js APIs (require, process, etc.) — only use with trusted code.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableGedJS)
				.onChange(async (value) => {
					this.plugin.settings.enableGedJS = value;
					await this.plugin.saveSettings();
					new Notice(value ? t('notice.gedJSBlocksEnabled') : t('notice.gedJSBlocksDisabled'));
				}));

		// ── Heuristics & Research ─────────────────────────────────────────────
		containerEl.createEl('h2', { text: t('setting.heuristicsSection') || 'Heuristics & Research' });

		let heuristicsTextComponent: import('obsidian').TextComponent;
		new Setting(containerEl)
			.setName(t('setting.heuristicsFilePath') || 'Heuristics rules file')
			.setDesc(t('setting.heuristicsFilePathDescription') || 'Path to a YAML file with source suggestion rules for ged-research and ged-heur.')
			.addText(text => {
				heuristicsTextComponent = text;
				text.setPlaceholder(t('setting.enterHeuristicsPath') || 'e.g. genealogy/heuristics.yaml')
					.setValue(this.plugin.settings.heuristicsFilePath)
					.onChange(async (value) => {
						this.plugin.settings.heuristicsFilePath = value;
						await this.plugin.saveSettings();
					});
			})
			.addButton(btn => btn
				.setButtonText(t('setting.createHeuristicsTemplate') || 'Create template')
				.onClick(async () => {
					const path = heuristicsTextComponent.getValue().trim();
					if (!path) return;
					const existing = this.app.vault.getFileByPath(path);
					if (existing) {
						new Notice((t('setting.heuristicsTemplateExists') || 'File already exists: ') + path);
						return;
					}
					await this.app.vault.create(path, DEFAULT_RULES_YAML);
					new Notice((t('setting.heuristicsTemplateCreated') || 'Template created: ') + path);
				}));

		// Reproductive age — spoiler
		const reproDetails = containerEl.createEl('details');
		reproDetails.createEl('summary').createEl('strong', {
			text: t('setting.reproductiveAge') || 'Estimated reproductive age'
		});
		reproDetails.createEl('p', {
			text: t('setting.reproductiveAgeDescription') || 'Used when a person has no dates but known children.',
			cls: 'setting-item-description',
		});

		const ra = this.plugin.settings.reproductiveAge;
		const saveRepro = async (patch: Partial<ReproductiveAge>) => {
			this.plugin.settings.reproductiveAge = { ...this.plugin.settings.reproductiveAge, ...patch };
			await this.plugin.saveSettings();
		};
		const makeReproInput = (container: HTMLElement, label: string, getValue: () => number, key: keyof ReproductiveAge) => {
			new Setting(container)
				.setName(label)
				.addText(text => text
					.setPlaceholder(String(DEFAULT_REPRODUCTIVE_AGE[key]))
					.setValue(String(getValue()))
					.onChange(async (value) => {
						const n = parseInt(value, 10);
						if (!isNaN(n) && n > 0) await saveRepro({ [key]: n });
					}));
		};

		reproDetails.createEl('h4', { text: t('setting.reproductiveAgeMale') || 'Men' });
		makeReproInput(reproDetails, t('setting.reproductiveAgeMin') || 'Minimum age', () => ra.maleMin, 'maleMin');
		makeReproInput(reproDetails, t('setting.reproductiveAgeMax') || 'Maximum age', () => ra.maleMax, 'maleMax');

		reproDetails.createEl('h4', { text: t('setting.reproductiveAgeFemale') || 'Women' });
		makeReproInput(reproDetails, t('setting.reproductiveAgeMin') || 'Minimum age', () => ra.femaleMin, 'femaleMin');
		makeReproInput(reproDetails, t('setting.reproductiveAgeMax') || 'Maximum age', () => ra.femaleMax, 'femaleMax');

		// Emoji customization — spoiler
		const emojiDetails = containerEl.createEl('details');
		emojiDetails.createEl('summary').createEl('strong', {
			text: t('setting.sourceStatusEmojis') || 'Research status emojis'
		});
		emojiDetails.createEl('p', {
			text: t('setting.sourceStatusEmojisDescription') || 'Customize the emoji for each source research status. Leave blank to use the default.',
			cls: 'setting-item-description',
		});

		for (let i = 0; i < 6; i++) {
			const status = i as SourceStatus;
			const def = SOURCE_STATUSES[status];
			new Setting(emojiDetails)
				.setName(`${def.emoji}  ${t(def.labelKey)}`)
				.addText(text => text
					.setPlaceholder(def.emoji)
					.setValue(this.plugin.settings.sourceStatusEmojis?.[status] ?? '')
					.onChange(async (value) => {
						if (!this.plugin.settings.sourceStatusEmojis) {
							this.plugin.settings.sourceStatusEmojis = ['', '', '', '', '', ''];
						}
						this.plugin.settings.sourceStatusEmojis[status] = value.trim();
						await this.plugin.saveSettings();
					}));
		}

		new Setting(emojiDetails)
			.addButton(btn => btn
				.setButtonText(t('setting.sourceStatusEmojisReset') || 'Reset to defaults')
				.onClick(async () => {
					this.plugin.settings.sourceStatusEmojis = ['', '', '', '', '', ''];
					await this.plugin.saveSettings();
					this.display();
				}));
	}
}