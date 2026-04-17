import { ItemView, Menu, Notice, setIcon, TFile } from 'obsidian';
import { GedcomService } from '../gedcom/service';
import { t } from '../i18n';
import {
    BlockType,
    createBlockForPerson,
    createBlockForFamily,
    getPersonBlockTypes,
    getFamilyBlockTypes,
    insertCodeAtCursor,
} from '../utils/blockTemplates';

export const GEDCOM_SEARCH_VIEW = 'gedcom-search-view';

type SearchTab = 'individuals' | 'families';
type SortColumn = 'id' | 'name' | 'dates';
type SortDirection = 'asc' | 'desc';
type FamilySortColumn = 'id' | 'spouses' | 'marriage' | 'children';

export class GedcomSearchView extends ItemView {
    private gedcomService: GedcomService;
    private searchInput: HTMLInputElement;
    private regexCheckbox: HTMLInputElement;
    private resultsContainer: HTMLElement;
    private activeTab: SearchTab = 'individuals';

    // Individual sort state
    private indSortColumn: SortColumn = 'id';
    private indSortDirection: SortDirection = 'asc';

    // Family sort state
    private famSortColumn: FamilySortColumn = 'id';
    private famSortDirection: SortDirection = 'asc';

    constructor(leaf: any, gedcomService: GedcomService) {
        super(leaf);
        this.gedcomService = gedcomService;
    }

    getViewType(): string {
        return GEDCOM_SEARCH_VIEW;
    }

    getDisplayText(): string {
        return t('search.viewTitle') || 'GEDCOM Search';
    }

    getIcon(): string {
        return 'family-search';
    }

    async onOpen() {
        const { contentEl } = this;
        contentEl.addClass('gedcom-search-view');

        // Create tab switcher
        const tabContainer = contentEl.createDiv({ cls: 'gedcom-search-tabs' });
        const individualsTab = tabContainer.createEl('button', {
            text: t('search.tabIndividuals') || 'Персоны',
            cls: 'gedcom-search-tab gedcom-search-tab-active'
        });
        const familiesTab = tabContainer.createEl('button', {
            text: t('search.tabFamilies') || 'Семьи',
            cls: 'gedcom-search-tab'
        });

        individualsTab.addEventListener('click', () => {
            this.setActiveTab('individuals');
        });
        familiesTab.addEventListener('click', () => {
            this.setActiveTab('families');
        });

        // Create search container
        const searchContainer = contentEl.createDiv({ cls: 'gedcom-search-container' });

        // Search input
        this.searchInput = searchContainer.createEl('input', {
            type: 'text',
            placeholder: t('search.placeholderIndividuals') || 'Поиск персон...',
            cls: 'gedcom-search-input'
        });

        // Regex checkbox
        const regexContainer = searchContainer.createDiv({ cls: 'gedcom-regex-container' });
        this.regexCheckbox = regexContainer.createEl('input', {
            type: 'checkbox',
            cls: 'gedcom-regex-checkbox'
        });
        const regexLabel = regexContainer.createEl('label', {
            text: t('search.regex') || 'Regex',
            cls: 'gedcom-regex-label'
        });
        regexLabel.addEventListener('click', () => {
            this.regexCheckbox.checked = !this.regexCheckbox.checked;
            this.performSearch();
        });

        // Search event listener
        this.searchInput.addEventListener('input', () => {
            this.performSearch();
        });

        // Results container
        this.resultsContainer = contentEl.createDiv({ cls: 'gedcom-search-results' });

        // Initial render - individuals by default
        this.activeTab = 'individuals';
        this.performSearch();
    }

    private setActiveTab(tab: SearchTab) {
        this.activeTab = tab;
        
        // Update tab styles
        const tabs = this.containerEl.querySelectorAll('.gedcom-search-tab');
        tabs.forEach((tabEl: HTMLElement, index) => {
            if ((tab === 'individuals' && index === 0) || (tab === 'families' && index === 1)) {
                tabEl.addClass('gedcom-search-tab-active');
            } else {
                tabEl.removeClass('gedcom-search-tab-active');
            }
        });

        // Update search placeholder
        this.searchInput.placeholder = tab === 'individuals' 
            ? (t('search.placeholderIndividuals') || 'Поиск персон...')
            : (t('search.placeholderFamilies') || 'Поиск семей...');

        this.performSearch();
    }

    private performSearch() {
        const query = this.searchInput.value;
        const useRegex = this.regexCheckbox.checked;

        this.resultsContainer.empty();

        if (this.activeTab === 'families') {
            if (!query) {
                this.renderFamilies([]);
                return;
            }
            const families = this.gedcomService.getFamiliesForList();
            const filtered = this.filterFamilies(families, query, useRegex);
            const sorted = this.sortFamilies(filtered);
            this.renderFamilies(sorted);
        } else {
            if (!query) {
                this.renderResults([]);
                return;
            }
            const individuals = this.gedcomService.getIndividualsForList();
            const filtered = this.filterIndividuals(individuals, query, useRegex);
            const sorted = this.sortIndividuals(filtered);
            this.renderResults(sorted);
        }
    }

    private filterIndividuals(individuals: any[], query: string, useRegex: boolean): any[] {
        if (useRegex) {
            try {
                const regex = new RegExp(query, 'i');
                return individuals.filter(person => {
                    const searchText = this.getSearchText(person);
                    return regex.test(searchText);
                });
            } catch (e) {
                // Invalid regex, show all
                return individuals;
            }
        } else {
            const lowerQuery = query.toLowerCase();
            return individuals.filter(person => {
                const searchText = this.getSearchText(person).toLowerCase();
                return searchText.includes(lowerQuery);
            });
        }
    }

    private getSearchText(person: any): string {
        return `${person.name} ${person.id} ${person.birthDate || ''} ${person.deathDate || ''} ${person.birthPlace || ''} ${person.deathPlace || ''}`;
    }

    private sortIndividuals(individuals: any[]): any[] {
        return [...individuals].sort((a, b) => {
            let valueA: string, valueB: string;

            switch (this.indSortColumn) {
                case 'id':
                    valueA = a.id;
                    valueB = b.id;
                    break;
                case 'name':
                    valueA = a.name || '';
                    valueB = b.name || '';
                    break;
                case 'dates':
                    // Сортируем по дате рождения (первая дата)
                    valueA = a.birthDate || '';
                    valueB = b.birthDate || '';
                    // Нормализуем даты для корректной сортировки
                    valueA = this.normalizeDateForSort(valueA);
                    valueB = this.normalizeDateForSort(valueB);
                    break;
            }

            const comparison = valueA.localeCompare(valueB, undefined, { numeric: true });
            return this.indSortDirection === 'asc' ? comparison : -comparison;
        });
    }

    private normalizeDateForSort(date: string): string {
        if (!date) return '';
        // Преобразуем GEDCOM дату в формат YYYY-MM-DD для сортировки
        const normalized = this.gedcomService.normalizeDate(date);
        return normalized;
    }

    private setIndSortColumn(column: SortColumn) {
        if (this.indSortColumn === column) {
            this.indSortDirection = this.indSortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            this.indSortColumn = column;
            this.indSortDirection = 'asc';
        }
        this.performSearch();
    }

    // Family methods
    private filterFamilies(families: any[], query: string, useRegex: boolean): any[] {
        if (useRegex) {
            try {
                const regex = new RegExp(query, 'i');
                return families.filter(family => {
                    const searchText = this.getFamilySearchText(family);
                    return regex.test(searchText);
                });
            } catch (e) {
                return families;
            }
        } else {
            const lowerQuery = query.toLowerCase();
            return families.filter(family => {
                const searchText = this.getFamilySearchText(family).toLowerCase();
                return searchText.includes(lowerQuery);
            });
        }
    }

    private getFamilySearchText(family: any): string {
        return `${family.id} ${family.husbandName || ''} ${family.wifeName || ''} ${family.marriageDate || ''} ${family.marriagePlace || ''}`;
    }

    private sortFamilies(families: any[]): any[] {
        return [...families].sort((a, b) => {
            let valueA: string, valueB: string;

            switch (this.famSortColumn) {
                case 'id':
                    valueA = a.id;
                    valueB = b.id;
                    break;
                case 'spouses':
                    valueA = `${a.husbandName || ''} ${a.wifeName || ''}`.trim();
                    valueB = `${b.husbandName || ''} ${b.wifeName || ''}`.trim();
                    break;
                case 'marriage':
                    valueA = this.normalizeDateForSort(a.marriageDate || '');
                    valueB = this.normalizeDateForSort(b.marriageDate || '');
                    break;
                case 'children':
                    valueA = a.childrenCount.toString();
                    valueB = b.childrenCount.toString();
                    break;
            }

            const comparison = valueA.localeCompare(valueB, undefined, { numeric: true });
            return this.famSortDirection === 'asc' ? comparison : -comparison;
        });
    }

    private setFamSortColumn(column: FamilySortColumn) {
        if (this.famSortColumn === column) {
            this.famSortDirection = this.famSortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            this.famSortColumn = column;
            this.famSortDirection = 'asc';
        }
        this.performSearch();
    }

    private formatDisplayDate(date: string | undefined): string {
        if (!date) return '?';
        // Нормализуем дату через сервис
        const normalized = this.gedcomService.normalizeDate(date);
        // Преобразуем в читаемый формат YYYY-MM-DD → DD.MM.YYYY
        const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (match) {
            return `${match[3]}.${match[2]}.${match[1]}`;
        }
        // Если формат YYYY-MM
        const match2 = normalized.match(/^(\d{4})-(\d{2})$/);
        if (match2) {
            return `${match2[2]}.${match2[1]}`;
        }
        // Если только год
        if (/^\d{4}$/.test(normalized)) {
            return normalized;
        }
        return date;
    }

    private createLifeDatesTooltip(person: any): string {
        const lines: string[] = [];

        // Информация о рождении
        if (person.birthDate || person.birthPlace) {
            const birthLabel = t('person.birthDate') || 'Рождение';
            const birthInfo: string[] = [];
            if (person.birthDate) {
                birthInfo.push(this.formatDisplayDate(person.birthDate));
            }
            if (person.birthPlace) {
                birthInfo.push(person.birthPlace);
            }
            lines.push(`${birthLabel}: ${birthInfo.join(', ')}`);
        }

        // Информация о смерти
        if (person.deathDate || person.deathPlace) {
            const deathLabel = t('person.deathDate') || 'Смерть';
            const deathInfo: string[] = [];
            if (person.deathDate) {
                deathInfo.push(this.formatDisplayDate(person.deathDate));
            }
            if (person.deathPlace) {
                deathInfo.push(person.deathPlace);
            }
            lines.push(`${deathLabel}: ${deathInfo.join(', ')}`);
        }

        if (lines.length === 0) {
            return t('common.unknown') || 'Неизвестно';
        }

        return lines.join('\n');
    }

    private renderResults(individuals: any[]) {
        this.resultsContainer.empty();

        if (individuals.length === 0) {
            const emptyMsg = this.resultsContainer.createEl('p', {
                text: t('search.noResults') || 'Ничего не найдено',
                cls: 'gedcom-search-empty'
            });
            return;
        }

        // Create table
        const table = this.resultsContainer.createEl('table', { cls: 'gedcom-search-table' });

        // Header with sort indicators
        const headerRow = table.createEl('tr');
        
        // ID column header (clickable for sort)
        const idHeader = headerRow.createEl('th', { cls: 'col-id sortable' });
        const idContent = idHeader.createDiv({ cls: 'sort-header-content' });
        idContent.createSpan({ text: t('search.colID') || 'ID' });
        const idIcon = idContent.createSpan({ cls: 'sort-icon' });
        setIcon(idIcon, this.indSortColumn === 'id' && this.indSortDirection === 'asc' ? 'arrow-up' :
                                     this.indSortColumn === 'id' && this.indSortDirection === 'desc' ? 'arrow-down' : 'chevrons-up-down');
        idHeader.style.cursor = 'pointer';
        idHeader.addEventListener('click', () => this.setIndSortColumn('id'));

        // Name column header (clickable for sort)
        const nameHeader = headerRow.createEl('th', { cls: 'col-name sortable' });
        const nameContent = nameHeader.createDiv({ cls: 'sort-header-content' });
        nameContent.createSpan({ text: t('modal.nameColumn') || 'Имя' });
        const nameIcon = nameContent.createSpan({ cls: 'sort-icon' });
        setIcon(nameIcon, this.indSortColumn === 'name' && this.indSortDirection === 'asc' ? 'arrow-up' :
                                       this.indSortColumn === 'name' && this.indSortDirection === 'desc' ? 'arrow-down' : 'chevrons-up-down');
        nameHeader.style.cursor = 'pointer';
        nameHeader.addEventListener('click', () => this.setIndSortColumn('name'));

        // Dates column header (clickable for sort)
        const datesHeader = headerRow.createEl('th', { cls: 'col-dates sortable' });
        const datesContent = datesHeader.createDiv({ cls: 'sort-header-content' });
        datesContent.createSpan({ text: t('modal.lifeDatesColumn') || 'Даты жизни' });
        const datesIcon = datesContent.createSpan({ cls: 'sort-icon' });
        setIcon(datesIcon, this.indSortColumn === 'dates' && this.indSortDirection === 'asc' ? 'arrow-up' :
                                        this.indSortColumn === 'dates' && this.indSortDirection === 'desc' ? 'arrow-down' : 'chevrons-up-down');
        datesHeader.style.cursor = 'pointer';
        datesHeader.addEventListener('click', () => this.setIndSortColumn('dates'));

        // Insert column header
        headerRow.createEl('th', { cls: 'col-insert', text: '' });

        // Rows
        for (const person of individuals) {
            const row = table.createEl('tr');
            row.addClass('gedcom-search-row');

            // ID column
            row.createEl('td', {
                text: `@${person.id}@`,
                cls: 'col-id'
            });

            // Name column
            row.createEl('td', {
                text: person.name || t('person.unknown') || 'Неизвестно',
                cls: 'col-name'
            });

            // Dates column - normalized display format with tooltip
            const birthDate = this.formatDisplayDate(person.birthDate);
            const deathDate = this.formatDisplayDate(person.deathDate);
            const lifeDates = (!person.birthDate && !person.deathDate) ? '?' : `${birthDate} - ${deathDate}`;
            const tooltip = this.createLifeDatesTooltip(person);
            const datesCell = row.createEl('td', {
                text: lifeDates,
                cls: 'col-dates'
            });
            datesCell.setAttribute('title', tooltip);

            // Insert column - button with context menu
            const insertCell = row.createEl('td', { cls: 'col-insert' });
            const insertBtn = insertCell.createEl('button', {
                cls: 'gedcom-insert-btn',
                text: '⊕',
                attr: { title: 'Insert block' }
            });
            insertBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.showPersonInsertMenu(person.id, e);
            });

            // Double-click to copy ID
            row.addEventListener('dblclick', () => {
                const idText = `@${person.id}@`;
                navigator.clipboard.writeText(idText);
                new Notice(t('search.copiedId', { id: idText }) || `Скопирован ID: ${idText}`);
            });
        }
    }

    private renderFamilies(families: any[]) {
        this.resultsContainer.empty();

        if (families.length === 0) {
            const emptyMsg = this.resultsContainer.createEl('p', {
                text: t('search.noResults') || 'Ничего не найдено',
                cls: 'gedcom-search-empty'
            });
            return;
        }

        // Create table
        const table = this.resultsContainer.createEl('table', { cls: 'gedcom-search-table' });

        // Header with sort indicators
        const headerRow = table.createEl('tr');

        // ID column header
        const idHeader = headerRow.createEl('th', { cls: 'col-id sortable' });
        const idContent = idHeader.createDiv({ cls: 'sort-header-content' });
        idContent.createSpan({ text: t('search.colID') || 'ID' });
        const idIcon = idContent.createSpan({ cls: 'sort-icon' });
        setIcon(idIcon, this.famSortColumn === 'id' && this.famSortDirection === 'asc' ? 'arrow-up' :
                                     this.famSortColumn === 'id' && this.famSortDirection === 'desc' ? 'arrow-down' : 'chevrons-up-down');
        idHeader.style.cursor = 'pointer';
        idHeader.addEventListener('click', () => this.setFamSortColumn('id'));

        // Spouses column header
        const spousesHeader = headerRow.createEl('th', { cls: 'col-spouses sortable' });
        const spousesContent = spousesHeader.createDiv({ cls: 'sort-header-content' });
        spousesContent.createSpan({ text: t('search.colSpouses') || 'Супруги' });
        const spousesIcon = spousesContent.createSpan({ cls: 'sort-icon' });
        setIcon(spousesIcon, this.famSortColumn === 'spouses' && this.famSortDirection === 'asc' ? 'arrow-up' :
                                           this.famSortColumn === 'spouses' && this.famSortDirection === 'desc' ? 'arrow-down' : 'chevrons-up-down');
        spousesHeader.style.cursor = 'pointer';
        spousesHeader.addEventListener('click', () => this.setFamSortColumn('spouses'));

        // Marriage column header
        const marriageHeader = headerRow.createEl('th', { cls: 'col-marriage sortable' });
        const marriageContent = marriageHeader.createDiv({ cls: 'sort-header-content' });
        marriageContent.createSpan({ text: t('search.colMarriage') || 'Брак' });
        const marriageIcon = marriageContent.createSpan({ cls: 'sort-icon' });
        setIcon(marriageIcon, this.famSortColumn === 'marriage' && this.famSortDirection === 'asc' ? 'arrow-up' :
                                            this.famSortColumn === 'marriage' && this.famSortDirection === 'desc' ? 'arrow-down' : 'chevrons-up-down');
        marriageHeader.style.cursor = 'pointer';
        marriageHeader.addEventListener('click', () => this.setFamSortColumn('marriage'));

        // Children column header
        const childrenHeader = headerRow.createEl('th', { cls: 'col-children sortable' });
        const childrenContent = childrenHeader.createDiv({ cls: 'sort-header-content' });
        childrenContent.createSpan({ text: t('search.colChildren') || 'Дети' });
        const childrenIcon = childrenContent.createSpan({ cls: 'sort-icon' });
        setIcon(childrenIcon, this.famSortColumn === 'children' && this.famSortDirection === 'asc' ? 'arrow-up' :
                                            this.famSortColumn === 'children' && this.famSortDirection === 'desc' ? 'arrow-down' : 'chevrons-up-down');
        childrenHeader.style.cursor = 'pointer';
        childrenHeader.addEventListener('click', () => this.setFamSortColumn('children'));

        // Insert column header
        headerRow.createEl('th', { cls: 'col-insert', text: '' });

        // Rows
        for (const family of families) {
            const row = table.createEl('tr');
            row.addClass('gedcom-search-row');

            // ID column
            row.createEl('td', {
                text: `@${family.id}@`,
                cls: 'col-id'
            });

            // Spouses column
            const spousesText = [family.husbandName, family.wifeName].filter(Boolean).join(' & ') || 'Unknown';
            row.createEl('td', {
                text: spousesText,
                cls: 'col-spouses'
            });

            // Marriage column
            const marriageDate = this.formatDisplayDate(family.marriageDate);
            const marriagePlace = family.marriagePlace || '';
            const marriageText = marriageDate === '?' ? '?' : `${marriageDate}${marriagePlace ? ', ' + marriagePlace : ''}`;
            row.createEl('td', {
                text: marriageText,
                cls: 'col-marriage'
            });

            // Children column
            row.createEl('td', {
                text: family.childrenCount.toString(),
                cls: 'col-children'
            });

            // Insert column - button with context menu
            const insertCell = row.createEl('td', { cls: 'col-insert' });
            const insertBtn = insertCell.createEl('button', {
                cls: 'gedcom-insert-btn',
                text: '⊕',
                attr: { title: 'Insert block' }
            });
            insertBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.showFamilyInsertMenu(family.id, e);
            });

            // Double-click to copy ID
            row.addEventListener('dblclick', () => {
                const idText = `@${family.id}@`;
                navigator.clipboard.writeText(idText);
                new Notice(t('search.copiedId', { id: idText }) || `Скопирован ID: ${idText}`);
            });
        }
    }

    /**
     * Показывает контекстное меню с релевантными типами блоков для персоны
     */
    private showPersonInsertMenu(personId: string, event: MouseEvent) {
        const menu = new Menu();
        for (const blockType of getPersonBlockTypes()) {
            menu.addItem((item) => {
                item.setTitle(`Insert ${blockType}`)
                    .setIcon('plus-circle')
                    .onClick(() => {
                        const content = createBlockForPerson(blockType as BlockType, personId);
                        insertCodeAtCursor(content, this.app);
                    });
            });
        }
        menu.showAtMouseEvent(event);
    }

    /**
     * Показывает контекстное меню с релевантными типами блоков для семьи
     */
    private showFamilyInsertMenu(familyId: string, event: MouseEvent) {
        const menu = new Menu();
        for (const blockType of getFamilyBlockTypes()) {
            menu.addItem((item) => {
                item.setTitle(`Insert ${blockType}`)
                    .setIcon('plus-circle')
                    .onClick(() => {
                        const content = createBlockForFamily(blockType as BlockType, familyId);
                        insertCodeAtCursor(content, this.app);
                    });
            });
        }
        menu.showAtMouseEvent(event);
    }

    async onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
