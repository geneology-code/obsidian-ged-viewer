import { App } from 'obsidian';
import { createEmptyBlock, BlockType, insertCodeAtCursor } from '../utils/blockTemplates';

interface InsertCommandDef {
    id: string;
    nameKey: string;
    blockType: BlockType;
}

const INSERT_COMMANDS: InsertCommandDef[] = [
    {
        id: 'insert-ged-person',
        nameKey: 'command.insertGedPerson',
        blockType: 'ged-person',
    },
    {
        id: 'insert-ged-person-full',
        nameKey: 'command.insertGedPersonFull',
        blockType: 'ged-person-full',
    },
    {
        id: 'insert-ged-person-compare',
        nameKey: 'command.insertGedPersonCompare',
        blockType: 'ged-person-compare',
    },
    {
        id: 'insert-ged-relatives',
        nameKey: 'command.insertGedRelatives',
        blockType: 'ged-relatives',
    },
    {
        id: 'insert-ged-person-events',
        nameKey: 'command.insertGedPersonEvents',
        blockType: 'ged-person-events',
    },
    {
        id: 'insert-ged-chronos',
        nameKey: 'command.insertGedChronos',
        blockType: 'ged-chronos',
    },
    {
        id: 'insert-ged-js',
        nameKey: 'command.insertGedJS',
        blockType: 'ged-js',
    },
    {
        id: 'insert-ged-diagram-ancestors',
        nameKey: 'command.insertDiagramAncestors',
        blockType: 'ged-diagram-ancestors',
    },
    {
        id: 'insert-ged-diagram-descendants',
        nameKey: 'command.insertDiagramDescendants',
        blockType: 'ged-diagram-descendants',
    },
    {
        id: 'insert-ged-diagram-hourglass',
        nameKey: 'command.insertDiagramHourglass',
        blockType: 'ged-diagram-hourglass',
    },
    {
        id: 'insert-ged-diagram-relatives',
        nameKey: 'command.insertDiagramRelatives',
        blockType: 'ged-diagram-relatives',
    },
];

/**
 * Регистрирует все команды вставки пустых блоков кода
 */
export function registerInsertCommands(app: App, addCommand: (cmd: any) => void, t: (key: string) => string): void {
    for (const cmdDef of INSERT_COMMANDS) {
        addCommand({
            id: cmdDef.id,
            name: t(cmdDef.nameKey) || cmdDef.id,
            callback: () => {
                const blockContent = createEmptyBlock(cmdDef.blockType);
                insertCodeAtCursor(blockContent, app);
            },
        });
    }
}
