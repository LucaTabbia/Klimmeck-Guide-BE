import { LoadedEntry } from 'src/content/loading/yaml-file';
import { EquipmentEntry } from 'src/content/schema/catalog.content';
import { validateEntry } from 'src/content/schema/validate-entry';

const SWORD_ID = '64b0000000000000000000e1';

function swordEntry(overrides: Record<string, unknown> = {}): LoadedEntry {
    return {
        file: 'equipment/weapon.yaml',
        line: 7,
        raw: {
            id: SWORD_ID,
            name: 'Spada di prova',
            itemType: 'EquipmentItem',
            description: 'Una lama corta.',
            sellPrice: { gold: 0, silver: 1, copper: 50 },
            buyPrice: { gold: 0, silver: 0, copper: 75 },
            rarity: 'common',
            equipType: 'weapon',
            addedSpell: null,
            damages: { base: [{ type: 'cut', power: 500 }], energy: [] },
            ...overrides,
        },
    };
}

describe('validateEntry', () => {
    it('accepts a valid entry with no issue', () => {
        expect(validateEntry(EquipmentEntry, swordEntry())).toEqual([]);
    });

    it('rejects an unknown key with its path (D-28)', () => {
        const issues = validateEntry(
            EquipmentEntry,
            swordEntry({ colour: 'rosso' }),
        );

        expect(issues).toEqual([
            expect.objectContaining({
                path: 'colour',
                message: expect.stringContaining('campo sconosciuto'),
            }),
        ]);
    });

    it('flattens nested errors into dotted paths', () => {
        const issues = validateEntry(
            EquipmentEntry,
            swordEntry({
                damages: { base: [{ type: 'slash', power: 500 }], energy: [] },
            }),
        );

        expect(issues.map(({ path }) => path)).toEqual(['damages.base.0.type']);
        expect(issues[0].message).toMatch(/^damages\.base\.0\.type: /);
    });

    it('carries file, line and entry id in every issue', () => {
        const issues = validateEntry(
            EquipmentEntry,
            swordEntry({ name: '', rarity: 'mythic' }),
        );

        expect(issues).toHaveLength(2);
        issues.forEach((issue) =>
            expect(issue).toEqual(
                expect.objectContaining({
                    file: 'equipment/weapon.yaml',
                    line: 7,
                    entryId: SWORD_ID,
                }),
            ),
        );
    });

    it('reports a prose that ends with a newline (D-28)', () => {
        const issues = validateEntry(
            EquipmentEntry,
            swordEntry({ description: 'Una lama corta.\n' }),
        );

        expect(issues.map(({ path }) => path)).toEqual(['description']);
    });
});
