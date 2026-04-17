import { Logger } from '../utils/logger';
import { GedcomService } from '../gedcom/service';
import { GedcomIndividual, GedcomFamily, GedcomEvent } from '../gedcom/types';

/**
 * Интерфейс для события Chronos
 */
export interface ChronosEvent {
    date: string;
    label: string;
    type?: string;
    place?: string;
    description?: string;  // NOTE из GEDCOM
    groupId?: string;      // Группа (имя персоны/семьи)
}

/**
 * Конфигурация метода извлечения события из raw GEDCOM объекта
 */
interface EventMethodConfig {
    method: string;
    type: string;        // Тип события Chronos (Birth, Death, etc.)
    label: string;       // Русское название для отображения
}

/**
 * Результат извлечения события из raw GEDCOM объекта
 */
interface ExtractedEvent {
    date: string;
    place: string;
    note: string;
}

/**
 * Результат разбора DSL
 */
export interface ChronosDSLResult {
    events: ChronosEvent[];
    errors: string[];
}

/**
 * Настройки ChronosService
 */
export interface ChronosServiceSettings {
    /** Максимальная продолжительность жизни в годах (по умолчанию 100) */
    maxLifespanYears?: number;
}

/**
 * Сервис для работы с Chronos DSL
 */
export class ChronosService {
    private gedcomService: GedcomService;
    private settings: ChronosServiceSettings;

    constructor(gedcomService: GedcomService, settings?: ChronosServiceSettings) {
        this.gedcomService = gedcomService;
        this.settings = {
            maxLifespanYears: settings?.maxLifespanYears ?? 100
        };
    }

    /**
     * Раскрыть DSL и вернуть строки Chronos
     * Прямые строки и другие директивы оставляет как есть, gci/gcf раскрывает в события
     */
    expandDSLToLines(source: string): { lines: string[]; errors: string[] } {
        const lines = source.split('\n').map(line => line.trim()).filter(line => line.length > 0);
        const result: string[] = [];
        const errors: string[] = [];
        const seenGroups = new Set<string>();

        for (const line of lines) {
            // Директива gci: @I1@ - раскрыть события персоны
            if (line.startsWith('gci:')) {
                const id = this.extractId(line);
                if (id) {
                    const individualLines = this.expandIndividualToLines(id, seenGroups);
                    result.push(...individualLines);
                } else {
                    errors.push(`Invalid individual ID: ${line}`);
                }
            }
            // Директива gcf: @F1@ - раскрыть как gci всех членов семьи
            else if (line.startsWith('gcf:')) {
                const id = this.extractId(line);
                if (id) {
                    const familyLines = this.expandFamilyToIndividuals(id, seenGroups);
                    result.push(...familyLines);
                } else {
                    errors.push(`Invalid family ID: ${line}`);
                }
            }
            // Все остальные строки отдаем как есть (прямые события, маркеры, периоды и т.д.)
            else {
                result.push(line);
            }
        }
        Logger.debug('[ChronosService] Expanded lines:', result);
        return { lines: result, errors };
    }

    /**
     * Раскрыть gcf в gci всех членов семьи (муж, жена, дети)
     * Порядок: {Husband & Wife} → {Husband} → {Wife} → {Children}
     * Брак длится до развода, смерти одного из супругов или следующего брака
     */
    private expandFamilyToIndividuals(familyId: string, seenGroups: Set<string>): string[] {
        const normalizedId = familyId.startsWith('@') ? familyId : `@${familyId}@`;
        const family = this.gedcomService.getFamily(normalizedId);

        if (!family) {
            return [];
        }

        const result: string[] = [];

        // Получаем имена супругов для группы
        const husband = family.husbandId ? this.gedcomService.getIndividual(family.husbandId) : null;
        const wife = family.wifeId ? this.gedcomService.getIndividual(family.wifeId) : null;
        const husbandName = this.escapeGroupName(husband?.surname ? `${husband.surname} ${husband.firstName}`.trim() : husband?.name || 'Unknown');
        const wifeName = this.escapeGroupName(wife?.surname ? `${wife.surname} ${wife.firstName}`.trim() : wife?.name || 'Unknown');

        // Формируем годы брака для семьи
        const marriageYears = this.getMarriageYearsString(family, husband, wife);
        const familyGroupName = `${husbandName} & ${wifeName} (${marriageYears})`;

        // 1. Сначала добавляем период жизни семьи (брак) ТОЛЬКО если есть дата брака
        if (family.marriageDate) {
            const marriageDate = this.normalizeDate(family.marriageDate);

            // Определяем дату окончания брака
            const endDate = this.getMarriageEndDate(family, husband, wife);
            const lifespan = (marriageDate && endDate) ? `${marriageDate}~${endDate}` : (marriageDate ? `${marriageDate}~` : '');

            if (lifespan) {
                const periodLine = `@ [${lifespan}] #cyan {${familyGroupName}} п.б.`;
                const eventLine = `* [${marriageDate}] #yellow {${familyGroupName}} брак | ${family.marriagePlace || ''}`.trim();

                // Дедупликация: не добавляем если группа уже есть
                if (!seenGroups.has(familyGroupName)) {
                    result.push(periodLine);
                    result.push(eventLine);
                    seenGroups.add(familyGroupName);
                }
            }
        }

        // 2. Добавляем мужа
        if (family.husbandId) {
            const husbandLines = this.expandIndividualToLines(family.husbandId, seenGroups);
            result.push(...husbandLines);
        }

        // 3. Добавляем жену
        if (family.wifeId) {
            const wifeLines = this.expandIndividualToLines(family.wifeId, seenGroups);
            result.push(...wifeLines);
        }

        // 4. Добавляем детей
        if (family.childrenIds) {
            for (const childId of family.childrenIds) {
                const childLines = this.expandIndividualToLines(childId, seenGroups);
                result.push(...childLines);
            }
        }

        return result;
    }

    /**
     * Определить дату окончания брака
     * Брак заканчивается при: разводе, смерти одного из супругов, следующем браке
     * @returns Нормализованную дату окончания или null
     */
    private getMarriageEndDate(
        family: any, 
        husband: GedcomIndividual | null, 
        wife: GedcomIndividual | null
    ): string | null {
        const endDates: string[] = [];

        // 1. Развод
        if (family.divorceDate) {
            endDates.push(this.normalizeDate(family.divorceDate));
        }

        // 2. Смерть одного из супругов
        if (husband?.deathDate) {
            endDates.push(this.normalizeDate(husband.deathDate));
        }
        if (wife?.deathDate) {
            endDates.push(this.normalizeDate(wife.deathDate));
        }

        // 3. Следующий брак мужа
        if (husband?.familiesAsSpouse) {
            const nextMarriage = this.getNextMarriageDate(husband, family.id);
            if (nextMarriage) {
                endDates.push(nextMarriage);
            }
        }

        // 4. Следующий брак жены
        if (wife?.familiesAsSpouse) {
            const nextMarriage = this.getNextMarriageDate(wife, family.id);
            if (nextMarriage) {
                endDates.push(nextMarriage);
            }
        }

        // Возвращаем самую раннюю дату окончания
        return endDates.length > 0 ? this.getEarliestDate(endDates) : null;
    }

    /**
     * Получить самую раннюю дату из списка
     */
    private getEarliestDate(dates: string[]): string | null {
        if (dates.length === 0) return null;
        dates.sort();
        return dates[0];
    }

    /**
     * Ограничить период жизни максимальным возрастом
     * Если известна только дата рождения, ограничивает период maxLifespanYears
     * Если известна только дата смерти, вычисляет предполагаемую дату рождения
     * @param birthDate Дата рождения (нормализованная)
     * @param deathDate Дата смерти (нормализованная) или пустая строка
     * @returns Строка периода в формате "YYYY-MM-DD~YYYY-MM-DD" или "YYYY-MM-DD~"
     */
    private limitLifespan(birthDate: string, deathDate: string): string {
        // Если известна дата рождения
        if (birthDate) {
            // Если есть дата смерти - возвращаем полный период
            if (deathDate) {
                return `${birthDate}~${deathDate}`;
            }

            // Если смерти нет, ограничиваем период максимальным возрастом
            const birthYear = parseInt(birthDate.substring(0, 4), 10);
            if (isNaN(birthYear)) {
                return `${birthDate}~`;
            }

            const maxDeathYear = birthYear + (this.settings.maxLifespanYears || 100);
            const currentYear = new Date().getFullYear();
            const endYear = Math.min(maxDeathYear, currentYear);

            // Сохраняем месяц и день из даты рождения если они есть
            const parts = birthDate.split('-');
            if (parts.length === 3) {
                return `${birthDate}~${endYear}-${parts[1]}-${parts[2]}`;
            } else if (parts.length === 2) {
                return `${birthDate}~${endYear}-${parts[1]}`;
            } else {
                return `${birthDate}~${endYear}`;
            }
        }

        // Если дата рождения неизвестна, но есть дата смерти
        if (deathDate) {
            const deathYear = parseInt(deathDate.substring(0, 4), 10);
            if (isNaN(deathYear)) {
                return `~${deathDate}`;
            }

            // Вычисляем предполагаемую дату рождения (смерть - maxLifespanYears)
            const minBirthYear = deathYear - (this.settings.maxLifespanYears || 100);

            // Сохраняем месяц и день из даты смерти если они есть
            const parts = deathDate.split('-');
            if (parts.length === 3) {
                return `${minBirthYear}-${parts[1]}-${parts[2]}~${deathDate}`;
            } else if (parts.length === 2) {
                return `${minBirthYear}-${parts[1]}~${deathDate}`;
            } else {
                return `${minBirthYear}~${deathDate}`;
            }
        }

        // Если ничего не известно
        return '';
    }

    /**
     * Получить дату следующего брака для персоны (после указанной семьи)
     */
    private getNextMarriageDate(individual: GedcomIndividual, currentFamilyId: string): string | null {
        if (!individual.familiesAsSpouse?.length) return null;

        const normalizedCurrentId = currentFamilyId.startsWith('@') 
            ? currentFamilyId 
            : `@${currentFamilyId}@`;

        const nextMarriages = individual.familiesAsSpouse
            .filter((fid: string) => fid !== normalizedCurrentId)
            .map((fid: string) => {
                const family = this.gedcomService.getFamily(fid);
                return family?.marriageDate ? this.normalizeDate(family.marriageDate) : null;
            })
            .filter((date): date is string => date !== null);

        return nextMarriages.length > 0 ? this.getEarliestDate(nextMarriages) : null;
    }

    /**
     * Извлечь данные события из raw GEDCOM объекта
     * @returns {date, place, note} или null если событие не найдено
     */
    private extractEventFromRaw(rawObject: any, methodName: string): ExtractedEvent | null {
        try {
            const eventSelection = rawObject[methodName]();
            if (!eventSelection || eventSelection.length === 0) {
                return null;
            }

            const events = eventSelection.arraySelect();
            const extracted: ExtractedEvent[] = [];

            for (const evt of events) {
                const dateSel = evt.getDate();
                let date = '';
                if (dateSel && dateSel.length > 0 && typeof dateSel.value === 'function') {
                    const dateValue = dateSel.value();
                    date = Array.isArray(dateValue) ? dateValue[0] : dateValue;
                }

                const placeSel = evt.getPlace();
                let place = '';
                if (placeSel && placeSel.length > 0 && typeof placeSel.value === 'function') {
                    const placeValue = placeSel.value();
                    place = Array.isArray(placeValue) ? placeValue[0] : placeValue;
                }

                const note = this.gedcomService.getNoteFromEvent(evt);

                if (date) {
                    extracted.push({ date: this.normalizeDate(date), place, note });
                }
            }

            return extracted.length > 0 ? extracted[0] : null;
        } catch (e) {
            Logger.error(`[ChronosService] Error extracting event ${methodName}:`, e);
            return null;
        }
    }

    /**
     * Извлечь все события из raw GEDCOM объекта по конфигурации
     */
    private extractAllEventsFromRaw(
        rawObject: any, 
        configs: EventMethodConfig[]
    ): ExtractedEvent[] {
        const events: ExtractedEvent[] = [];

        for (const { method } of configs) {
            const event = this.extractEventFromRaw(rawObject, method);
            if (event) {
                events.push(event);
            }
        }

        return events;
    }

    /**
     * Раскрыть события персоны в строки Chronos
     * @param seenGroups - Set для дедупликации групп (если передан)
     */
    private expandIndividualToLines(id: string, seenGroups?: Set<string>): string[] {
        const normalizedId = id.startsWith('@') ? id : `@${id}@`;
        const individual = this.gedcomService.getIndividual(normalizedId);
        const rawIndividual = this.gedcomService.getRawIndividual(normalizedId);

        if (!individual) {
            return [];
        }

        const lines: string[] = [];
        const baseName = individual.surname
            ? `${individual.surname} ${individual.firstName}`.trim()
            : individual.name;

        // Добавляем годы жизни к имени группы
        const lifespan = this.getLifespanString(individual);
        const groupName = `${baseName} (${lifespan})`;

        // Дедупликация: не добавляем если группа уже есть
        if (seenGroups && seenGroups.has(groupName)) {
            return lines;
        }

        // Добавляем группу в seenGroups
        if (seenGroups) {
            seenGroups.add(groupName);
        }

        // Добавляем период жизни ТОЛЬКО если известна хоть одна дата
        // (период не может быть построен без дат)
        const hasBirthDate = !!individual.birthDate;
        const hasDeathDate = !!individual.deathDate;

        if (hasBirthDate || hasDeathDate) {
            const birthDate = individual.birthDate ? this.normalizeDate(individual.birthDate) : '';
            const deathDate = individual.deathDate ? this.normalizeDate(individual.deathDate) : '';
            const normalizedLifespan = this.limitLifespan(birthDate, deathDate);
            lines.push(`@ [${normalizedLifespan}] #cyan {${groupName}} п.ж.`);
        }

        if (!rawIndividual) {
            return lines;
        }

        // Конфигурация событий для извлечения
        const eventConfigs: EventMethodConfig[] = [
            { method: 'getEventBirth', type: 'Birth', label: 'рождение' },
            { method: 'getEventDeath', type: 'Death', label: 'смерть' },
            { method: 'getEventBurial', type: 'Burial', label: 'похороны' },
            { method: 'getEventCremation', type: 'Cremation', label: 'кремация' },
            { method: 'getEventAdoption', type: 'Adoption', label: 'усыновление' },
            { method: 'getEventBaptism', type: 'Baptism', label: 'крещение' },
            { method: 'getEventConfirmation', type: 'Confirmation', label: 'конфирмация' },
            { method: 'getEventGraduation', type: 'Graduation', label: 'выпуск' },
            { method: 'getEventRetirement', type: 'Retirement', label: 'выход на пенсию' },
            { method: 'getEventEmigration', type: 'Emigration', label: 'эмиграция' },
            { method: 'getEventImmigration', type: 'Immigration', label: 'иммиграция' },
            { method: 'getEventCensus', type: 'Census', label: 'перепись' },
        ];

        // Извлекаем и добавляем все события
        for (const config of eventConfigs) {
            const event = this.extractEventFromRaw(rawIndividual, config.method);
            if (event?.date) {
                lines.push(this.formatChronosLine(event.date, groupName, config.label, event.place, event.note));
            }
        }

        return lines;
    }

    /**
     * Получить годы жизни персоны в формате "YYYY" или "YYYY-YYYY" или "YYYY-..."
     */
    private getLifespanString(individual: GedcomIndividual): string {
        const birthYear = this.extractYear(individual.birthDate);
        const deathYear = this.extractYear(individual.deathDate);

        if (birthYear && deathYear) {
            return `${birthYear}-${deathYear}`;
        } else if (birthYear) {
            return `${birthYear}-…`;
        } else if (deathYear) {
            return `…-${deathYear}`;
        } else {
            return '?';
        }
    }

    /**
     * Получить годы брака в формате "YYYY" или "YYYY-YYYY"
     * Брак заканчивается при: разводе, смерти одного из супругов, следующем браке
     */
    private getMarriageYearsString(family: any, husband: GedcomIndividual | null, wife: GedcomIndividual | null): string {
        const marriageYear = this.extractYear(family.marriageDate);
        
        if (!marriageYear) {
            return '?';
        }

        const endDate = this.getMarriageEndDate(family, husband, wife);
        const endYear = endDate ? this.extractYear(endDate) : null;

        if (endYear) {
            return `${marriageYear}-${endYear}`;
        } else {
            return `${marriageYear}-…`;
        }
    }

    /**
     * Экранировать специальные символы в имени группы для Chronos DSL
     * Экранирует кавычки и другие потенциально проблемные символы
     */
    private escapeGroupName(name: string): string {
        return name.replace(/"/g, '\\"').replace(/'/g, "\\'");
    }

    /**
     * Извлечь год из даты
     */
    private extractYear(date: string | undefined): string | null {
        if (!date) return null;
        
        const normalized = this.normalizeDate(date);
        const match = normalized.match(/^(\d{4})/);
        return match ? match[1] : null;
    }

    /**
     * Получить цвет для типа события
     */
    private getColorForEventType(eventType: string): string {
        switch (eventType) {
            case 'рождение':
                return '#green';
            case 'смерть':
                return '#555555';
            case 'брак':
                return '#yellow';
            default:
                return '#orange';
        }
    }

    /**
     * Форматировать строку Chronos с цветом и маркером
     */
    private formatChronosLine(date: string, group: string, eventType: string, place?: string, note?: string): string {
        const color = this.getColorForEventType(eventType);

        // Все события через *, цвет указывается после даты
        let line = `* [${date}] ${color} {${group}} ${eventType}`;

        const details: string[] = [];
        if (place) details.push(place);
        if (note) details.push(note);

        if (details.length > 0) {
            line += ` | ${details.join('; ')}`;
        }

        return line;
    }

    /**
     * Раскрыть события персоны (устаревший метод, используется expandIndividualToLines)
     * @deprecated - используется expandIndividualToLines для Chronos DSL
     */
    private expandIndividual(id: string): ChronosEvent[] {
        const normalizedId = id.startsWith('@') ? id : `@${id}@`;
        const individual = this.gedcomService.getIndividual(normalizedId);
        const rawIndividual = this.gedcomService.getRawIndividual(normalizedId);

        if (!individual) {
            return [];
        }

        const events: ChronosEvent[] = [];
        const groupName = individual.surname
            ? `${individual.surname} ${individual.firstName}`.trim()
            : individual.name;

        if (!rawIndividual) {
            return events;
        }

        // Конфигурация событий для извлечения
        const eventConfigs: EventMethodConfig[] = [
            { method: 'getEventBirth', type: 'Birth', label: 'рождение' },
            { method: 'getEventDeath', type: 'Death', label: 'смерть' },
            { method: 'getEventBurial', type: 'Burial', label: 'похороны' },
            { method: 'getEventCremation', type: 'Cremation', label: 'кремация' },
            { method: 'getEventAdoption', type: 'Adoption', label: 'усыновление' },
            { method: 'getEventBaptism', type: 'Baptism', label: 'крещение' },
            { method: 'getEventConfirmation', type: 'Confirmation', label: 'конфирмация' },
            { method: 'getEventGraduation', type: 'Graduation', label: 'выпуск' },
            { method: 'getEventRetirement', type: 'Retirement', label: 'выход на пенсию' },
            { method: 'getEventEmigration', type: 'Emigration', label: 'эмиграция' },
            { method: 'getEventImmigration', type: 'Immigration', label: 'иммиграция' },
            { method: 'getEventCensus', type: 'Census', label: 'перепись' },
        ];

        // Извлекаем и добавляем все события
        for (const config of eventConfigs) {
            const event = this.extractEventFromRaw(rawIndividual, config.method);
            if (event?.date) {
                events.push({
                    date: event.date,
                    label: `${groupName} — ${config.label}`,
                    type: config.type,
                    place: event.place,
                    description: event.note || undefined,
                    groupId: groupName
                });
            }
        }

        return events;
    }

    /**
     * Раскрыть события семьи (устаревший метод)
     * @deprecated - используется expandFamilyToIndividuals для Chronos DSL
     */
    private expandFamily(id: string): ChronosEvent[] {
        const normalizedId = id.startsWith('@') ? id : `@${id}@`;
        const family = this.gedcomService.getFamily(normalizedId);
        const rawFamily = this.gedcomService.getRawFamily(normalizedId);

        if (!family) {
            return [];
        }

        const events: ChronosEvent[] = [];

        // Получаем имена супругов для группы
        const husband = family.husbandId ? this.gedcomService.getIndividual(family.husbandId) : null;
        const wife = family.wifeId ? this.gedcomService.getIndividual(family.wifeId) : null;
        const husbandName = this.escapeGroupName(husband?.name || 'Unknown');
        const wifeName = this.escapeGroupName(wife?.name || 'Unknown');
        const groupName = `${husbandName} & ${wifeName}`;

        // Брак
        if (family.marriageDate) {
            events.push({
                date: this.normalizeDate(family.marriageDate),
                label: `${groupName} — брак`,
                type: 'Marriage',
                place: family.marriagePlace,
                groupId: groupName
            });
        }

        // События семьи из raw данных
        if (rawFamily) {
            const familyEventConfigs: EventMethodConfig[] = [
                { method: 'getEventDivorce', type: 'Divorce', label: 'развод' },
                { method: 'getEventEngagement', type: 'Engagement', label: 'помолвка' },
                { method: 'getEventMarriageLicense', type: 'Marriage License', label: 'лицензия на брак' },
            ];

            for (const config of familyEventConfigs) {
                const event = this.extractEventFromRaw(rawFamily, config.method);
                if (event?.date) {
                    events.push({
                        date: event.date,
                        label: `${groupName} — ${config.label}`,
                        type: config.type,
                        place: event.place,
                        description: event.note || undefined,
                        groupId: groupName
                    });
                }
            }
        }

        // События детей
        if (family.childrenIds) {
            const childEventConfigs: EventMethodConfig[] = [
                { method: 'getEventBirth', type: 'Birth', label: 'рождение' },
                { method: 'getEventDeath', type: 'Death', label: 'смерть' },
                { method: 'getEventBaptism', type: 'Baptism', label: 'крещение' },
                { method: 'getEventGraduation', type: 'Graduation', label: 'выпуск' },
            ];

            for (const childId of family.childrenIds) {
                const child = this.gedcomService.getIndividual(childId);
                const rawChild = this.gedcomService.getRawIndividual(childId);
                if (!child) continue;

                const childGroupName = this.escapeGroupName(
                    child.surname ? `${child.surname} ${child.firstName}`.trim() : child.name
                );

                // Извлекаем события ребенка
                for (const config of childEventConfigs) {
                    const event = this.extractEventFromRaw(rawChild, config.method);
                    if (event?.date) {
                        events.push({
                            date: event.date,
                            label: `${childGroupName} — ${config.label}`,
                            type: config.type,
                            place: event.place,
                            description: event.note || undefined,
                            groupId: childGroupName
                        });
                    }
                }
            }
        }

        return events;
    }

    /**
     * Распарсить прямую запись события
     */
    private parseDirectEvent(line: string): ChronosEvent | null {
        // Формат: - [1789~1799] French Revolution
        const match = line.match(/^-\s*\[(.*?)\]\s*(.*)$/);
        if (!match) {
            return null;
        }

        const [, dateRange, label] = match;
        return {
            date: this.normalizeDate(dateRange),
            label: label.trim()
        };
    }

    /**
     * Извлечь ID из директивы
     */
    private extractId(line: string): string | null {
        const match = line.match(/@([^@]+)@/);
        return match ? `@${match[1]}@` : null;
    }

    /**
     * Нормализовать дату для Chronos
     * Преобразует форматы GEDCOM (1 JAN 1950) в YYYY-MM-DD или YYYY
     */
    private normalizeDate(date: string): string {
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
     * Удалить дубликаты событий
     */
    private deduplicateEvents(events: ChronosEvent[]): ChronosEvent[] {
        const seen = new Set<string>();
        return events.filter(event => {
            const key = `${event.date}|${event.label}`;
            if (seen.has(key)) {
                return false;
            }
            seen.add(key);
            return true;
        });
    }

    /**
     * Сортировать события по дате
     */
    private sortEvents(events: ChronosEvent[]): ChronosEvent[] {
        return events.sort((a, b) => {
            const dateA = this.extractYear(a.date);
            const dateB = this.extractYear(b.date);
            const yearA = dateA ? parseInt(dateA, 10) : 0;
            const yearB = dateB ? parseInt(dateB, 10) : 0;
            return yearA - yearB;
        });
    }

    /**
     * Преобразовать события в формат Chronos DSL
     * Формат: - [YYYY-MM-DD] {Group Name} Event Label | Description
     */
    toChronosDSL(events: ChronosEvent[]): string {
        return events.map(event => {
            let dsl = `- [${event.date}]`;
            
            // Добавляем группу в фигурных скобках
            if (event.groupId) {
                dsl += ` {${event.groupId}}`;
            }
            
            // Добавляем описание события
            dsl += ` ${event.label}`;
            
            // Добавляем место и заметку через разделитель |
            const details: string[] = [];
            if (event.place) {
                details.push(event.place);
            }
            if (event.description) {
                details.push(event.description);
            }
            
            if (details.length > 0) {
                dsl += ` | ${details.join('; ')}`;
            }
            
            return dsl;
        }).join('\n');
    }
}
