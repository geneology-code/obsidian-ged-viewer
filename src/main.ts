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
    renderDiagramRelativesBlock
} from './blocks';
import { GEDCOM_SEARCH_VIEW, GedcomSearchView } from './views/GedcomSearchView';
import { PersonListModal } from './commands/personList';
import { registerInsertCommands } from './commands/insertBlocks';
import { GEDCOMPluginSettings, DEFAULT_SETTINGS } from './types/settings';
import { t } from './i18n';

// Custom ribbon icon — family tree with search
const FAMILY_SEARCH_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor"><g transform="translate(0,16) scale(0.1,-0.1)"><path d="M53 133 c-28 -19 -30 -43 -3 -43 22 0 27 -15 8 -23 -7 -3 3 -5 22 -5 19 0 29 2 23 5 -20 8 -15 23 7 23 28 0 25 24 -5 44 -29 19 -24 19 -52 -1z"/><path d="M7 44 c-4 -4 -7 -12 -7 -18 0 -6 5 -4 10 4 9 13 11 13 21 0 9 -12 10 -12 7 -1 -5 17 -21 25 -31 15z"/><path d="M67 44 c-10 -11 -8 -24 4 -24 5 0 7 5 4 10 -3 6 -2 10 4 10 5 0 12 -5 14 -10 3 -6 4 -5 3 2 -3 14 -20 21 -29 12z"/><path d="M127 44 c-10 -11 -8 -24 4 -24 5 0 7 5 4 10 -3 6 -2 10 4 10 5 0 12 -5 14 -10 3 -6 4 -5 3 2 -3 14 -20 21 -29 12z"/></g></svg>`;

export default class GEDCOMPlugin extends Plugin {
	settings: GEDCOMPluginSettings;
	gedcomService: GedcomService;

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

		// Register view type
		this.registerView(GEDCOM_SEARCH_VIEW, (leaf) => new GedcomSearchView(leaf, this.gedcomService));

		// Register custom ribbon icon
		addIcon('family-search', FAMILY_SEARCH_ICON);

		// Register ribbon icon
		this.addRibbonIcon('family-search', t('search.openView') || 'GEDCOM Search', () => {
			this.activateView();
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

		this.registerMarkdownCodeBlockProcessor('ged-js', async (source, el, ctx) => {
			if (!this.settings.enableGedJS) {
				el.createEl('p', { text: 'ged-js blocks are disabled. Enable them in GEDCOM plugin settings.' });
				return;
			}
			await renderGedJSBlock(source, el, ctx, this.gedcomService, this.app);
		});

		// Add commands
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
		// Refresh views on unload to clean up
		this.app.workspace.updateOptions();
		// Detach all leaves of our view
		this.app.workspace.detachLeavesOfType(GEDCOM_SEARCH_VIEW);
	}

	async loadSettings() {
		const savedData = await this.loadData();
		console.log('[GEDCOM Plugin] loadSettings: savedData=', savedData);
		this.settings = Object.assign({}, DEFAULT_SETTINGS, savedData);
		console.log('[GEDCOM Plugin] loadSettings: this.settings=', this.settings);
	}

	async saveSettings() {
		console.log('[GEDCOM Plugin] saveSettings: saving this.settings=', this.settings);
		await this.saveData(this.settings);
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

		containerEl.createEl('h2', {text: t('common.gedcomGenealogySettings') || 'GEDCOM Genealogy Settings'});

		new Setting(containerEl)
			.setName(t('setting.gedcomFilePath') || 'GEDCOM file path')
			.setDesc(t('setting.gedcomFilePathDescription') || 'Path to your .ged file')
			.addText(text => text
				.setPlaceholder(t('setting.enterGedcomPath') || 'Enter path to .ged file')
				.setValue(this.plugin.settings.gedcomFilePath)
				.onChange(async (value) => {
					this.plugin.settings.gedcomFilePath = value;
					await this.plugin.saveSettings();
				}));

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
	}
}