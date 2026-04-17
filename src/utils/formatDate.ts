import { GedcomService } from '../gedcom/service';

/**
 * Форматирует дату GEDCOM в единый формат YYYY-MM-DD
 * 
 * Преобразует различные форматы дат:
 * - "1 JAN 1950" → "1950-01-01"
 * - "JAN 1950" → "1950-01"
 * - "1950" → "1950"
 * - "1 JAN 1950 ~ 2 FEB 1960" → "1950-01-01~1960-02-02"
 * 
 * @param date - исходная дата GEDCOM
 * @param gedcomService - сервис для нормализации дат
 * @returns нормализованная дата в формате YYYY-MM-DD или исходная, если не удалось распознать
 */
export function formatDisplayDate(date: string | undefined, gedcomService: GedcomService): string {
    if (!date) return '';
    
    // Нормализуем дату через сервис
    const normalized = gedcomService.normalizeDate(date);
    
    // Возвращаем нормализованную дату (уже в формате YYYY-MM-DD или YYYY-MM)
    return normalized;
}

/**
 * Извлекает год из даты в формате YYYY-MM-DD или YYYY
 * 
 * @param date - дата в формате YYYY-MM-DD, YYYY-MM или YYYY
 * @returns год или пустая строка
 */
export function extractYear(date: string): string {
    if (!date) return '';
    
    const match = date.match(/^(\d{4})/);
    return match ? match[1] : '';
}
