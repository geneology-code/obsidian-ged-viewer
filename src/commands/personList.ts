import { App, Modal, Notice } from 'obsidian';
import { GedcomService } from '../gedcom/service';
import { t } from '../i18n';

export class PersonListModal extends Modal {
	private gedcomService: GedcomService;

	constructor(app: App, gedcomService: GedcomService) {
		super(app);
		this.gedcomService = gedcomService;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.addClass('gedcom-person-list-modal');

		contentEl.createEl('h2', { text: t('modal.selectPerson') });

		// Create search input
		const searchContainer = contentEl.createDiv({ cls: 'search-container' });
		const searchInput = searchContainer.createEl('input', {
			type: 'text',
			placeholder: t('modal.searchPlaceholder'),
			cls: 'gedcom-search-input'
		});

		searchInput.addEventListener('input', (e) => {
			const target = e.target as HTMLInputElement;
			this.renderPersonList(contentEl, this.gedcomService.getIndividualsForList(), target.value.toLowerCase());
		});

		// Render the full list initially
		this.renderPersonList(contentEl, this.gedcomService.getIndividualsForList());
	}

	private renderPersonList(contentEl: HTMLElement, individuals: any[], searchTerm: string = '') {
		// Clear existing list except for the search input
		const existingList = contentEl.querySelector('.person-list-container');
		if (existingList) {
			existingList.remove();
		}

		const existingTable = contentEl.querySelector('.person-table-container');
		if (existingTable) {
			existingTable.remove();
		}

		// Filter individuals based on search term
		const filteredIndividuals = individuals.filter(person =>
			person.name.toLowerCase().includes(searchTerm) ||
			person.id.toLowerCase().includes(searchTerm) ||
			(person.birthDate && person.birthDate.toLowerCase().includes(searchTerm)) ||
			(person.deathDate && person.deathDate.toLowerCase().includes(searchTerm))
		);

		// Create container for the table
		const tableContainer = contentEl.createDiv({ cls: 'person-table-container' });

		if (filteredIndividuals.length === 0) {
			tableContainer.createEl('p', { text: t('modal.noPersonsFound') });
			return;
		}

		// Create table
		const table = tableContainer.createEl('table', { cls: 'gedcom-person-table' });

		// Create header row
		const headerRow = table.createEl('tr');
		headerRow.createEl('th', { text: t('modal.idColumn'), cls: 'col-id' });
		headerRow.createEl('th', { text: t('modal.nameColumn'), cls: 'col-name' });
		headerRow.createEl('th', { text: t('modal.lifeDatesColumn'), cls: 'col-dates' });

		// Create data rows
		for (const person of filteredIndividuals) {
			const row = table.createEl('tr');

			// ID column
			row.createEl('td', {
				text: `@${person.id}@`,
				cls: 'col-id'
			});

			// Name column
			row.createEl('td', {
				text: person.name || 'Unknown',
				cls: 'col-name'
			});

			// Dates column
			const birthDate = person.birthDate || '?';
			const deathDate = person.deathDate || '?';
			const lifeDates = birthDate === '?' && deathDate === '?' ? '?' : `${birthDate} - ${deathDate}`;
			row.createEl('td', {
				text: lifeDates,
				cls: 'col-dates'
			});

			// Add click handler
			row.addEventListener('click', () => {
				// Copy the person ID to clipboard
				navigator.clipboard.writeText(person.id);

				// Close the modal
				this.close();

				// Show a notice
				new Notice(t('modal.copiedId', { id: `@${person.id}@` }));
			});
		}
	}

	onClose() {
		const { contentEl } = this;
		while (contentEl.firstChild) {
			contentEl.removeChild(contentEl.firstChild);
		}
	}
}