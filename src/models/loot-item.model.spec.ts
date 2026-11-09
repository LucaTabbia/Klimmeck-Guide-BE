import { readFileSync } from 'fs';
import { model } from 'mongoose';
import { join } from 'path';
import { buildLootItem } from '../../test/fixtures/catalog-item.fixture';
import { InjuryType } from './enums/injury-type.enum';
import { LootItemSchema } from './loot-item.model';

const LootItemProbe = model('EffectedInjuriesLootItemProbe', LootItemSchema);
const SCHEMA_FILE = join(process.cwd(), 'src/schema.gql');

interface EnumListPath {
    instance: string;
    caster: { instance: string; enumValues: string[] };
}

function effectedInjuriesPath(): EnumListPath {
    return LootItemSchema.path('effectedInjuries') as unknown as EnumListPath;
}

function lootItemTypeLines(): string[] {
    const schema = readFileSync(SCHEMA_FILE, 'utf8');
    const block = schema.match(/^type LootItem \{\n([\s\S]*?)\n\}/m);
    return block ? block[1].split('\n') : [];
}

describe('LootItem effectedInjuries (quick 261109-inj)', () => {
    it('declares the injuries a heal item can cure as a list of InjuryType', () => {
        const path = effectedInjuriesPath();

        expect({
            instance: path.instance,
            caster: path.caster.instance,
            enumValues: path.caster.enumValues,
        }).toEqual({
            instance: 'Array',
            caster: 'String',
            enumValues: Object.values(InjuryType),
        });
    });

    it('defaults effectedInjuries to an empty list', () => {
        const potion = new LootItemProbe(buildLootItem()).toObject();

        expect(potion.effectedInjuries).toEqual([]);
    });

    it('rejects an injury outside the enum', () => {
        const potion = new LootItemProbe(
            buildLootItem({ effectedInjuries: ['brokenWing'] }),
        );

        expect(Object.keys(potion.validateSync()?.errors ?? {})).toEqual([
            'effectedInjuries.0',
        ]);
    });

    it('accepts known injuries', () => {
        const potion = new LootItemProbe(
            buildLootItem({ effectedInjuries: ['deepCut', 'infection'] }),
        );

        expect(potion.validateSync()).toBeUndefined();
        expect(potion.toObject().effectedInjuries).toEqual([
            'deepCut',
            'infection',
        ]);
    });

    it('exposes effectedInjuries right after effect in the LootItem SDL', () => {
        const lines = lootItemTypeLines();
        const effectIndex = lines.indexOf('  effect: String!');

        expect(effectIndex).toBeGreaterThan(-1);
        expect(lines[effectIndex + 1]).toBe(
            '  effectedInjuries: [InjuryType!]!',
        );
    });
});
