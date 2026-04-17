import { App, MarkdownView, Notice } from 'obsidian';
import { t } from '../i18n';

export type BlockType =
    | 'ged-person'
    | 'ged-person-full'
    | 'ged-person-compare'
    | 'ged-comp'
    | 'ged-relatives'
    | 'ged-person-events'
    | 'ged-chronos'
    | 'ged-js'
    | 'ged-diagram-ancestors'
    | 'ged-diagram-descendants'
    | 'ged-diagram-hourglass'
    | 'ged-diagram-relatives';

/**
 * Создает пустой блок кода для команды (без ID)
 */
export function createEmptyBlock(type: BlockType): string {
    return `\`\`\`${type}\n\n\`\`\``;
}

/**
 * Создает блок кода для персоны (с заполненным ID)
 */
export function createBlockForPerson(type: BlockType, id: string): string {
    const formattedId = id.startsWith('@') ? id : `@${id}@`;

    // Особая логика для ged-chronos
    if (type === 'ged-chronos') {
        return `\`\`\`${type}\ngci: ${formattedId}\n\`\`\``;
    }

    // Остальные блоки — просто ID
    return `\`\`\`${type}\n${formattedId}\n\`\`\``;
}

/**
 * Создает блок кода для семьи (с заполненным ID)
 */
export function createBlockForFamily(type: BlockType, id: string): string {
    const formattedId = id.startsWith('@') ? id : `@${id}@`;

    // Особая логика для ged-chronos
    if (type === 'ged-chronos') {
        return `\`\`\`${type}\ngcf: ${formattedId}\n\`\`\``;
    }

    // Для ged-relatives и ged-comp — просто ID
    return `\`\`\`${type}\n${formattedId}\n\`\`\``;
}

/**
 * Получает наиболее актуальный MarkdownView, даже если фокус сейчас в сайдбаре.
 * Использует getMostRecentLeaf() который отслеживает последний активный leaf
 * в основной рабочей области (root split), игнорируя сайдбары.
 */
function getMostRecentMarkdownView(app: App): MarkdownView | null {
    // getMostRecentLeaf() возвращает последний активный leaf в root split,
    // даже если сейчас фокус в сайдбаре
    const leaf = app.workspace.getMostRecentLeaf();
    
    if (leaf?.view instanceof MarkdownView) {
        return leaf.view;
    }
    
    // Fallback: если getMostRecentLeaf() вернул не-MarkdownView,
    // перебрать все markdown leaves
    const markdownLeaves = app.workspace.getLeavesOfType('markdown');
    for (const leaf of markdownLeaves) {
        if (leaf.view instanceof MarkdownView) {
            return leaf.view;
        }
    }
    
    return null;
}

/**
 * Вставляет текст в активный Markdown-редактор на позицию курсора
 * @returns true если вставка успешна
 */
export function insertCodeAtCursor(content: string, app: App): boolean {
    const view = getMostRecentMarkdownView(app);
    if (!view) {
        new Notice(t('notice.noEditorOpen') || 'No Markdown editor is open. Please open a note first.');
        return false;
    }

    const editor = view.editor;
    const cursor = editor.getCursor();

    // Вставляем контент на позицию курсора
    editor.replaceRange(content, cursor);

    // Перемещаем курсор внутрь блока (после открывающей ```` и перед закрывающей)
    const insertedLines = content.split('\n');
    const cursorLine = cursor.line + 1; // Перемещаем на первую строку внутри блока

    editor.setCursor({ line: cursorLine, ch: 0 });

    return true;
}

/**
 * Возвращает релевантные типы блоков для персоны
 */
export function getPersonBlockTypes(): BlockType[] {
    return [
        'ged-person',
        'ged-person-full',
        'ged-person-events',
        'ged-person-compare',
        'ged-chronos',
        'ged-diagram-ancestors',
        'ged-diagram-descendants',
        'ged-diagram-hourglass',
        'ged-diagram-relatives',
    ];
}

/**
 * Возвращает релевантные типы блоков для семьи
 * Только ged-chronos поддерживает gcf: @F@ напрямую
 */
export function getFamilyBlockTypes(): BlockType[] {
    return [
        'ged-chronos',
    ];
}
