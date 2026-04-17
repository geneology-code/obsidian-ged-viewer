import { MarkdownRenderer, MarkdownPostProcessorContext, App, Component } from 'obsidian';
import { GedcomService } from '../gedcom/service';
import { GedcomIndividual, GedcomFamily } from '../gedcom/types';
import { t } from '../i18n';
import { formatDisplayDate } from '../utils/formatDate';

/**
 * Get spouse names for an individual
 */
export function getSpouseNames(individual: GedcomIndividual, gedcomService: GedcomService): string[] {
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

/**
 * Get total children count for an individual
 */
export function getChildrenCount(individual: GedcomIndividual, gedcomService: GedcomService): number {
    if (!individual.familiesAsSpouse || individual.familiesAsSpouse.length === 0) {
        return 0;
    }

    let totalChildren = 0;
    for (const familyId of individual.familiesAsSpouse) {
        const family = gedcomService.getFamily(familyId);
        if (family && family.childrenIds) {
            totalChildren += family.childrenIds.length;
        }
    }

    return totalChildren;
}

export function renderSinglePerson(el: HTMLElement, individual: GedcomIndividual, gedcomService: GedcomService): void {
    const container = el.createDiv({ cls: 'ged-person-details' });

    // Create rows with "**Field:** Value" format
    const createRow = (label: string, value: string) => {
        if (!value) return;
        const row = container.createDiv({ cls: 'ged-person-row' });
        row.createEl('span', { cls: 'ged-field-label' }).createEl('strong', { text: label + ':' });
        row.createEl('span', { text: ' ' + value, cls: 'ged-field-value' });
    };

    // Name
    const fullName = individual.name || `${individual.firstName || ''} ${individual.surname || ''}`.trim();
    if (fullName) {
        createRow(t('person.name'), fullName);
    }

    // Surname
    if (individual.surname) {
        createRow(t('person.surname'), individual.surname);
    }

    // First Name
    if (individual.firstName) {
        createRow(t('person.firstName'), individual.firstName);
    }

    // Birth Date - normalized to YYYY-MM-DD
    if (individual.birthDate) {
        createRow(t('person.birthDate'), formatDisplayDate(individual.birthDate, gedcomService));
    }

    // Birth Place
    if (individual.birthPlace) {
        createRow(t('person.birthPlace'), individual.birthPlace);
    }

    // Death Date - normalized to YYYY-MM-DD
    if (individual.deathDate) {
        createRow(t('person.deathDate'), formatDisplayDate(individual.deathDate, gedcomService));
    }

    // Death Place
    if (individual.deathPlace) {
        createRow(t('person.deathPlace'), individual.deathPlace);
    }

    // Spouses (only if there are spouses)
    const spouseNames = getSpouseNames(individual, gedcomService);
    if (spouseNames.length > 0) {
        createRow(t('person.spouses'), spouseNames.join(', '));
    }

    // Children count (only if there are children)
    const childrenCount = getChildrenCount(individual, gedcomService);
    if (childrenCount > 0) {
        createRow(t('person.numberOfChildren'), childrenCount.toString());
    }
}

export function renderPersonFull(
    el: HTMLElement,
    individual: GedcomIndividual,
    gedcomService: GedcomService,
    app: App,
    component: Component
): void {
    // Part 1: Key-value details
    renderSinglePerson(el, individual, gedcomService);

    // Part 2: Family/relatives as markdown
    const familyMembers = gedcomService.getFamilyMembers(individual.id);
    const divider = el.createDiv({ cls: 'ged-person-full-divider' });
    renderSingleFamily(el, individual, familyMembers, gedcomService, app, component);
}

export function renderPersonComparisonTable(el: HTMLElement, individuals: GedcomIndividual[], gedcomService: GedcomService): void {
    const wrapper = el.createDiv({ cls: 'ged-table-wrapper' });
    const table = wrapper.createEl('table', { cls: 'ged-person-table' });

    // Create header row with field names
    const headerRow = table.createEl('tr');
    headerRow.createEl('th', { text: t('person.surname') });
    headerRow.createEl('th', { text: t('person.firstName') });
    headerRow.createEl('th', { text: t('person.birth') });
    headerRow.createEl('th', { text: t('person.death') });
    headerRow.createEl('th', { text: t('person.spouses') });
    headerRow.createEl('th', { text: t('person.childrenCount') });

    // Create data rows for each individual
    for (const individual of individuals) {
        const row = table.createEl('tr');

        // Surname
        row.createEl('td', { text: individual.surname || '' });

        // First Name
        row.createEl('td', { text: individual.firstName || '' });

        // Birth: date + place combined
        const birthParts: string[] = [];
        if (individual.birthDate) birthParts.push(formatDisplayDate(individual.birthDate, gedcomService));
        if (individual.birthPlace) birthParts.push(individual.birthPlace);
        row.createEl('td', { text: birthParts.join(', ') || '' });

        // Death: date + place combined
        const deathParts: string[] = [];
        if (individual.deathDate) deathParts.push(formatDisplayDate(individual.deathDate, gedcomService));
        if (individual.deathPlace) deathParts.push(individual.deathPlace);
        row.createEl('td', { text: deathParts.join(', ') || '' });

        // Spouse(s)
        const spouseNames = getSpouseNames(individual, gedcomService);
        row.createEl('td', { text: spouseNames.join(', ') });

        // Children Count
        row.createEl('td', { text: getChildrenCount(individual, gedcomService).toString() });
    }
}

/**
 * Получить заголовок брака с номером
 */
function getMarriageHeaderLabel(marriageIndex: number, totalMarriages: number): string {
    if (totalMarriages > 1) {
        return t('family.marriageNumber').replace('{n}', String(marriageIndex));
    }
    return t('family.marriage');
}

/**
 * Сгенерировать markdown-строку для одной семьи
 */
function generateFamilyMarkdown(
    individual: GedcomIndividual,
    familyMembers: any,
    gedcomService: GedcomService
): string {
    const lines: string[] = [];

    const personName = individual.name || `${individual.firstName || ''} ${individual.surname || ''}`.trim();
    const relativesLabel = t('family.relatives') || 'Родственники';
    lines.push(`### ${personName} — ${relativesLabel}`);
    lines.push('');

    // 1. Родители (family of origin)
    if (familyMembers.father || familyMembers.mother) {
        lines.push(`#### ${t('family.parents')}`);
        lines.push('');

        if (familyMembers.father) {
            const fatherInfo = familyMembers.father;
            const fatherName = `${fatherInfo.firstName || ''} ${fatherInfo.surname || ''}`.trim();
            let fatherLine = `**${t('family.father')}:** ${fatherName}`;

            if (fatherInfo.birthDate || fatherInfo.birthPlace || fatherInfo.deathDate || fatherInfo.deathPlace) {
                const parts: string[] = [];
                if (fatherInfo.birthDate) parts.push(formatDisplayDate(fatherInfo.birthDate, gedcomService));
                if (fatherInfo.birthPlace) parts.push(fatherInfo.birthPlace);
                if (fatherInfo.deathDate) parts.push(formatDisplayDate(fatherInfo.deathDate, gedcomService));
                if (fatherInfo.deathPlace) parts.push(fatherInfo.deathPlace);
                fatherLine += ` (${parts.join(' – ')})`;
            }

            lines.push(fatherLine);
            lines.push('');
        }

        if (familyMembers.mother) {
            const motherInfo = familyMembers.mother;
            const motherName = `${motherInfo.firstName || ''} ${motherInfo.surname || ''}`.trim();
            let motherLine = `**${t('family.mother')}:** ${motherName}`;

            if (motherInfo.birthDate || motherInfo.birthPlace || motherInfo.deathDate || motherInfo.deathPlace) {
                const parts: string[] = [];
                if (motherInfo.birthDate) parts.push(formatDisplayDate(motherInfo.birthDate, gedcomService));
                if (motherInfo.birthPlace) parts.push(motherInfo.birthPlace);
                if (motherInfo.deathDate) parts.push(formatDisplayDate(motherInfo.deathDate, gedcomService));
                if (motherInfo.deathPlace) parts.push(motherInfo.deathPlace);
                motherLine += ` (${parts.join(' – ')})`;
            }

            lines.push(motherLine);
            lines.push('');
        }
    }

    // 2. Братья/сёстры
    if (familyMembers.siblings && familyMembers.siblings.length > 0) {
        lines.push(`#### ${t('family.siblings')}`);
        lines.push('');

        familyMembers.siblings.forEach((sibling: GedcomIndividual) => {
            const siblingName = `${sibling.firstName || ''} ${sibling.surname || ''}`.trim();
            let siblingLine = `- ${siblingName}`;

            if (sibling.birthDate || sibling.birthPlace || sibling.deathDate || sibling.deathPlace) {
                const parts: string[] = [];
                if (sibling.birthDate) parts.push(formatDisplayDate(sibling.birthDate, gedcomService));
                if (sibling.birthPlace) parts.push(sibling.birthPlace);
                if (sibling.deathDate) parts.push(formatDisplayDate(sibling.deathDate, gedcomService));
                if (sibling.deathPlace) parts.push(sibling.deathPlace);
                siblingLine += ` (${parts.join(' – ')})`;
            }

            lines.push(siblingLine);
        });
        lines.push('');
    }

    // 3. Браки с информацией о супруге, свадьбе, разводе и детьми
    if (individual.familiesAsSpouse && individual.familiesAsSpouse.length > 0) {
        const totalMarriages = individual.familiesAsSpouse.length;
        let marriageIndex = 0;

        for (const familyId of individual.familiesAsSpouse) {
            const family = gedcomService.getFamily(familyId);
            if (!family) continue;

            marriageIndex++;

            // Найти супруга
            const spouseId = family.husbandId === individual.id ? family.wifeId : family.husbandId;
            if (!spouseId) continue;

            const spouse = gedcomService.getIndividual(spouseId);
            if (!spouse) continue;

            // Заголовок брака
            lines.push(`#### ${getMarriageHeaderLabel(marriageIndex, totalMarriages)}`);
            lines.push('');

            // Супруг(а)
            const spouseName = `${spouse.firstName || ''} ${spouse.surname || ''}`.trim();
            let spouseLabel: string;
            if (spouse.sex === 'M') {
                spouseLabel = t('family.spouseMale');
            } else if (spouse.sex === 'F') {
                spouseLabel = t('family.spouseFemale');
            } else {
                spouseLabel = t('family.spouse');
            }

            let spouseLine = `**${spouseLabel}:** ${spouseName}`;
            if (spouse.birthDate || spouse.birthPlace || spouse.deathDate || spouse.deathPlace) {
                const parts: string[] = [];
                if (spouse.birthDate) parts.push(formatDisplayDate(spouse.birthDate, gedcomService));
                if (spouse.birthPlace) parts.push(spouse.birthPlace);
                if (spouse.deathDate) parts.push(formatDisplayDate(spouse.deathDate, gedcomService));
                if (spouse.deathPlace) parts.push(spouse.deathPlace);
                spouseLine += ` (${parts.join(' – ')})`;
            }
            lines.push(spouseLine);

            // Свадьба (только если есть дата или место)
            if (family.marriageDate || family.marriagePlace) {
                const marriageParts: string[] = [];
                if (family.marriageDate) {
                    marriageParts.push(formatDisplayDate(family.marriageDate, gedcomService));
                }
                if (family.marriagePlace) {
                    marriageParts.push(family.marriagePlace);
                }
                lines.push(`**${t('family.wedding')}:** ${marriageParts.join(', ')}`);
            }

            // Развод (только если есть дата или место)
            if (family.divorceDate || family.divorcePlace) {
                const divorceParts: string[] = [];
                if (family.divorceDate) {
                    divorceParts.push(formatDisplayDate(family.divorceDate, gedcomService));
                }
                if (family.divorcePlace) {
                    divorceParts.push(family.divorcePlace);
                }
                lines.push(`**${t('family.divorce')}:** ${divorceParts.join(', ')}`);
            }

            // Дети от этого брака
            if (family.childrenIds && family.childrenIds.length > 0) {
                lines.push(`##### ${t('family.children') || 'Дети'}`);
                lines.push('');

                for (const childId of family.childrenIds) {
                    const child = gedcomService.getIndividual(childId);
                    if (!child) continue;

                    const childName = `${child.firstName || ''} ${child.surname || ''}`.trim();
                    let childLine = `- ${childName}`;

                    if (child.birthDate || child.birthPlace || child.deathDate || child.deathPlace) {
                        const parts: string[] = [];
                        if (child.birthDate) parts.push(formatDisplayDate(child.birthDate, gedcomService));
                        if (child.birthPlace) parts.push(child.birthPlace);
                        if (child.deathDate) parts.push(formatDisplayDate(child.deathDate, gedcomService));
                        if (child.deathPlace) parts.push(child.deathPlace);
                        childLine += ` (${parts.join(' – ')})`;
                    }

                    lines.push(childLine);
                }
                lines.push('');
            }
        }
    }

    // Show no relatives message if nothing found
    if (!individual.familiesAsSpouse?.length && !familyMembers.father && !familyMembers.mother && !familyMembers.siblings?.length) {
        lines.push(t('family.noFamilyInfo'));
        lines.push('');
    }

    return lines.join('\n');
}

/**
 * Рендерит семью через MarkdownRenderer (стандартное форматирование Obsidian)
 */
export async function renderSingleFamily(
    el: HTMLElement,
    individual: GedcomIndividual,
    familyMembers: any,
    gedcomService: GedcomService,
    app: App,
    component: Component
): Promise<void> {
    const markdown = generateFamilyMarkdown(individual, familyMembers, gedcomService);

    await MarkdownRenderer.render(app, markdown, el, '', component);
}

export function renderFamilyComparisonTable(el: HTMLElement, individuals: GedcomIndividual[], families: any[], gedcomService: GedcomService): void {
    const wrapper = el.createDiv({ cls: 'ged-table-wrapper' });
    const table = wrapper.createEl('table', { cls: 'ged-relatives-table' });

    // Create header row
    const headerRow = table.createEl('tr');
    headerRow.createEl('th', { text: t('family.tableHeaderField') });
    individuals.forEach((individual, index) => {
        const personName = individual.name || `${individual.firstName || ''} ${individual.surname || ''}`.trim() || t('common.unknown');
        const headerText = t('family.tableHeaderPerson', { id: individual.id, name: personName });
        headerRow.createEl('th', { text: headerText });
    });

    // Define the fields to compare
    const fields = [
        { label: t('family.spouses'), getter: (family: any) => {
            if (!family.spouses || family.spouses.length === 0) return '';
            return family.spouses.map((spouse: GedcomIndividual) =>
                `${spouse.firstName || ''} ${spouse.surname || ''}`.trim()
            ).join(', ');
        }},
        { label: t('family.father'), getter: (family: any) => {
            if (!family.father) return '';
            const father = family.father;
            const birthDate = father.birthDate ? formatDisplayDate(father.birthDate, gedcomService) : '?';
            const deathDate = father.deathDate ? formatDisplayDate(father.deathDate, gedcomService) : '?';
            return `${father.firstName || ''} ${father.surname || ''}`.trim() +
                   (father.birthDate || father.birthPlace || father.deathDate || father.deathPlace
                     ? ` (${birthDate} ${father.birthPlace || ''} - ${deathDate} ${father.deathPlace || ''})`
                     : '');
        }},
        { label: t('family.mother'), getter: (family: any) => {
            if (!family.mother) return '';
            const mother = family.mother;
            const birthDate = mother.birthDate ? formatDisplayDate(mother.birthDate, gedcomService) : '?';
            const deathDate = mother.deathDate ? formatDisplayDate(mother.deathDate, gedcomService) : '?';
            return `${mother.firstName || ''} ${mother.surname || ''}`.trim() +
                   (mother.birthDate || mother.birthPlace || mother.deathDate || mother.deathPlace
                     ? ` (${birthDate} ${mother.birthPlace || ''} - ${deathDate} ${mother.deathPlace || ''})`
                     : '');
        }},
        { label: t('family.numberOfChildren'), getter: (family: any) => family.children ? family.children.length.toString() : '0' },
        { label: t('family.children'), getter: (family: any) => {
            if (!family.children || family.children.length === 0) return '';
            return family.children.map((child: GedcomIndividual) =>
                `${child.firstName || ''} ${child.surname || ''}`.trim()
            ).join(', ');
        }},
        { label: t('family.numberOfSiblings'), getter: (family: any) => family.siblings ? family.siblings.length.toString() : '0' },
        { label: t('family.siblings'), getter: (family: any) => {
            if (!family.siblings || family.siblings.length === 0) return '';
            return family.siblings.map((sibling: GedcomIndividual) =>
                `${sibling.firstName || ''} ${sibling.surname || ''}`.trim()
            ).join(', ');
        }}
    ];

    // Create data rows
    fields.forEach(field => {
        const row = table.createEl('tr');
        row.createEl('td', { text: field.label });

        families.forEach(family => {
            const value = field.getter(family);
            row.createEl('td', { text: value });
        });
    });
}

/**
 * Событие для таблицы ged-person-events
 */
interface PersonEventRow {
    sortKey: string;       // YYYY-MM-DD для сортировки
    category: string;      // birth, marriage, death, other
    label: string;         // Отображаемое имя (переведённое)
    originalType?: string; // Оригинальный тип из GEDCOM (для поиска в events)
    index?: number;        // Для множественных (брак #1, #2)
}

/**
 * Получить переводимую метку для типа события
 */
function getEventLabel(eventType: string): string {
    const labelMap: Record<string, string> = {
        'Birth': t('events.birth'),
        'Christening': t('events.christening'),
        'Death': t('events.death'),
        'Burial': t('events.burial'),
        'Cremation': t('events.cremation'),
        'Adoption': t('events.adoption'),
        'Baptism': t('events.baptism'),
        'Bar Mitzvah': t('events.barMitzvah'),
        'Bat Mitzvah': t('events.batMitzvah'),
        'Adult Christening': t('events.adultChristening'),
        'Confirmation': t('events.confirmation'),
        'First Communion': t('events.firstCommunion'),
        'Naturalization': t('events.naturalization'),
        'Emigration': t('events.emigration'),
        'Immigration': t('events.immigration'),
        'Census': t('events.census'),
        'Probate': t('events.probate'),
        'Will': t('events.will'),
        'Graduation': t('events.graduation'),
        'Retirement': t('events.retirement'),
        'Event': t('events.event'),
    };
    return labelMap[eventType] || eventType;
}

/**
 * Собрать все события персоны в единый список
 */
function collectPersonEvents(
    individual: GedcomIndividual,
    gedcomService: GedcomService
): PersonEventRow[] {
    const events: PersonEventRow[] = [];

    // Рождение — нормализуем дату для сортировки
    if (individual.birthDate || individual.birthPlace) {
        const normalizedBirth = individual.birthDate ? gedcomService.normalizeDate(individual.birthDate) : '9999-99-99';
        events.push({
            sortKey: normalizedBirth,
            category: 'birth',
            label: t('events.birth'),
        });
    }

    // Дополнительные события (крещение, погребение и т.д.)
    if (individual.events) {
        for (const event of individual.events) {
            const normalizedDate = event.date ? gedcomService.normalizeDate(event.date) : '9999-99-99';
            events.push({
                sortKey: normalizedDate,
                category: 'other',
                label: getEventLabel(event.type),
                originalType: event.type,
            });
        }
    }

    // Браки (по дате каждого брака)
    if (individual.familiesAsSpouse) {
        let marriageIndex = 1;
        const marriages: PersonEventRow[] = [];
        for (const familyId of individual.familiesAsSpouse) {
            const family = gedcomService.getFamily(familyId);
            if (family && family.marriageDate) {
                const normalizedMarriage = gedcomService.normalizeDate(family.marriageDate);
                marriages.push({
                    sortKey: normalizedMarriage,
                    category: 'marriage',
                    label: t('events.marriage'),
                    index: marriageIndex,
                });
                marriageIndex++;
            }
        }
        // Сортируем браки по дате
        marriages.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
        // Переназначаем индексы после сортировки
        marriages.forEach((m, i) => m.index = i + 1);
        events.push(...marriages);
    }

    // Смерть — нормализуем дату для сортировки
    if (individual.deathDate || individual.deathPlace) {
        const normalizedDeath = individual.deathDate ? gedcomService.normalizeDate(individual.deathDate) : '9999-99-99';
        events.push({
            sortKey: normalizedDeath,
            category: 'death',
            label: t('events.death'),
        });
    }

    // Сортируем все события по дате
    events.sort((a, b) => a.sortKey.localeCompare(b.sortKey));

    return events;
}

/**
 * Получить отображаемое значение события для персоны
 */
function getEventDisplayValue(
    individual: GedcomIndividual,
    event: PersonEventRow,
    gedcomService: GedcomService
): string {
    const parts: string[] = [];

    if (event.category === 'birth') {
        if (individual.birthDate) {
            parts.push(formatDisplayDate(individual.birthDate, gedcomService));
        }
        if (individual.birthPlace) {
            parts.push(individual.birthPlace);
        }
    } else if (event.category === 'death') {
        if (individual.deathDate) {
            parts.push(formatDisplayDate(individual.deathDate, gedcomService));
        }
        if (individual.deathPlace) {
            parts.push(individual.deathPlace);
        }
    } else if (event.category === 'marriage') {
        if (individual.familiesAsSpouse) {
            let marriageCount = 0;
            for (const familyId of individual.familiesAsSpouse) {
                const family = gedcomService.getFamily(familyId);
                if (family && family.marriageDate) {
                    marriageCount++;
                    if (marriageCount === event.index) {
                        if (family.marriageDate) {
                            parts.push(formatDisplayDate(family.marriageDate, gedcomService));
                        }
                        // Найти супруга
                        const spouseId = family.husbandId === individual.id ? family.wifeId : family.husbandId;
                        if (spouseId) {
                            const spouse = gedcomService.getIndividual(spouseId);
                            if (spouse) {
                                const spouseName = `${spouse.firstName || ''} ${spouse.surname || ''}`.trim();
                                if (spouseName) {
                                    parts.push(`с ${spouseName}`);
                                }
                            }
                        }
                        break;
                    }
                }
            }
        }
    } else if (event.category === 'other') {
        // Найти событие в individual.events по оригинальному типу
        const evt = individual.events?.find(e => e.type === event.originalType);
        if (evt) {
            if (evt.date) {
                parts.push(formatDisplayDate(evt.date, gedcomService));
            }
            if (evt.place) {
                parts.push(evt.place);
            }
        }
    }

    return parts.join(', ') || '—';
}

/**
 * Таблица событий для сравнения персон (ged-person-events)
 */
export function renderPersonEventsTable(el: HTMLElement, individuals: GedcomIndividual[], gedcomService: GedcomService): void {
    const wrapper = el.createDiv({ cls: 'ged-table-wrapper' });
    const table = wrapper.createEl('table', { cls: 'ged-person-events-table' });

    // Собираем все уникальные события у всех персон
    const allEvents: PersonEventRow[] = [];
    const seenEventKeys = new Set<string>();

    for (const individual of individuals) {
        const events = collectPersonEvents(individual, gedcomService);
        for (const event of events) {
            const key = `${event.category}-${event.label}-${event.index || ''}`;
            if (!seenEventKeys.has(key)) {
                seenEventKeys.add(key);
                allEvents.push(event);
            }
        }
    }

    // Сортируем все события по дате
    allEvents.sort((a, b) => a.sortKey.localeCompare(b.sortKey));

    // Заголовок таблицы
    const headerRow = table.createEl('tr');
    headerRow.createEl('th', { text: t('events.title') || 'Событие' });
    individuals.forEach((individual, index) => {
        const name = `${individual.firstName || ''} ${individual.surname || ''}`.trim() || individual.id;
        headerRow.createEl('th', { text: `${individual.id} ${name}` });
    });

    // Строки событий
    for (const event of allEvents) {
        const row = table.createEl('tr');

        // Метка события
        const labelCell = row.createEl('td', { cls: 'ged-event-label' });
        let labelText = event.label;
        if (event.index && event.index > 1) {
            labelText += ` #${event.index}`;
        }
        labelCell.createEl('strong', { text: labelText });

        // Значения для каждой персоны
        for (const individual of individuals) {
            const value = getEventDisplayValue(individual, event, gedcomService);
            row.createEl('td', { text: value });
        }
    }

    // Если нет событий
    if (allEvents.length === 0) {
        const row = table.createEl('tr');
        const cell = row.createEl('td', { text: t('events.noEvents') || 'Нет событий' });
        cell.setAttribute('colspan', String(individuals.length + 1));
    }
}
