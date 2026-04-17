/**
 * Logging utility for GEDCOM plugin
 */
export class Logger {
    private static prefix = '[GEDCOM Plugin]';
    private static debugEnabled = false;

    static enableDebug(): void {
        this.debugEnabled = true;
    }

    static disableDebug(): void {
        this.debugEnabled = false;
    }

    static isDebugEnabled(): boolean {
        return this.debugEnabled;
    }

    static debug(message: string, ...args: any[]): void {
        if (this.debugEnabled) {
            console.log(`${this.prefix} [DEBUG] ${message}`, ...args);
        }
    }

    static info(message: string, ...args: any[]): void {
        console.info(`${this.prefix} ${message}`, ...args);
    }

    static warn(message: string, ...args: any[]): void {
        console.warn(`${this.prefix} ${message}`, ...args);
    }

    static error(message: string, error?: Error | any, ...args: any[]): void {
        console.error(`${this.prefix} ${message}`, error, ...args);

        // If it's an Error object, also log stack trace
        if (error instanceof Error && error.stack) {
            console.error(`${this.prefix} Stack trace:`, error.stack);
        }
    }
}

/**
 * Error types for GEDCOM plugin
 */
export class GEDCOMError extends Error {
    constructor(
        message: string,
        public readonly code?: string,
        public readonly context?: Record<string, any>
    ) {
        super(message);
        this.name = 'GEDCOMError';
    }
}

export class GEDCOMDataError extends GEDCOMError {
    constructor(message: string, context?: Record<string, any>) {
        super(message, 'DATA_ERROR', context);
        this.name = 'GEDCOMDataError';
    }
}

export class GEDCOMRenderError extends GEDCOMError {
    constructor(message: string, context?: Record<string, any>) {
        super(message, 'RENDER_ERROR', context);
        this.name = 'GEDCOMRenderError';
    }
}

export class GEDCOMPluginError extends GEDCOMError {
    constructor(message: string, context?: Record<string, any>) {
        super(message, 'PLUGIN_ERROR', context);
        this.name = 'GEDCOMPluginError';
    }
}