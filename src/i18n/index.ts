import { Logger } from '../utils/logger';
import { en } from './en';
import { ru } from './ru';

export const locales = {
    'en': en,
    'ru': ru,
};

export type Locale = keyof typeof locales;

export const DEFAULT_LOCALE: Locale = 'en';

// Get the current locale from moment.js
export function getCurrentLocale(): Locale {
    // We'll use moment to detect the vault's locale
    // This will be initialized when the plugin loads
    let detectedLocale: string | undefined;

    // Try to get the locale from moment if available
    try {
        // Access moment globally in Obsidian
        const globalAny: any = globalThis || window;
        if (globalAny.moment && globalAny.moment.locale) {
            detectedLocale = globalAny.moment.locale();
        }
    } catch (e) {
        Logger.warn('[I18n] Could not detect moment locale, using default');
    }
    
    // Map detected locale to our supported locales
    if (detectedLocale?.startsWith('ru')) {
        return 'ru';
    }
    
    // Default to English if not supported
    return 'en';
}

export function t(key: string, params?: Record<string, any>): string {
    const locale = getCurrentLocale();
    let translation = locales[locale][key] || locales['en'][key] || key;
    
    // Replace parameters in the translation string
    if (params) {
        Object.keys(params).forEach(paramKey => {
            translation = translation.replace(new RegExp(`{${paramKey}}`, 'g'), params[paramKey]);
        });
    }
    
    return translation;
}