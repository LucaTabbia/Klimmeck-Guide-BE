import { readFileSync } from 'fs';
import { model } from 'mongoose';
import { join } from 'path';
import { buildLootItem } from '../../test/fixtures/catalog-item.fixture';
import { InjuryType } from './enums/injury-type.enum';
import { LootItemSchema } from './loot-item.model';

const LootItemProbe = model('CanHealLootItemProbe', LootItemSchema);
const SCHEMA_FILE = join(process.cwd(), 'src/schema.gql');

interface EnumListPath {
    instance: string;
    caster: { instance: string; enumValues: string[] };
}

function canHealPath(): EnumListPath {
    return LootItemSchema.path('canHeal') as unknown as EnumListPath;
}

function lootItemTypeLines(): string[] {
    const schema = readFileSync(SCHEMA_FILE, 'utf8');
    const block = schema.match(/^type LootItem \{\n([\s\S]*?)\n\}/m);
    return block ? block[1].split('\n') : [];
}

describe('LootItem canHeal (quick 261109-inj)', () => {
    it('declares the injuries a heal item can cure as a list of InjuryType', () => {
        const path = canHealPath();

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

    it('defaults canHeal to an empty list', () => {
        const potion = new LootItemProbe(buildLootItem()).toObject();

        expect(potion.canHeal).toEqual([]);
    });

    it('rejects an injury outside the enum', () => {
        const potion = new LootItemProbe(
            buildLootItem({ canHeal: ['brokenWing'] }),
        );

        expect(Object.keys(potion.validateSync()?.errors ?? {})).toEqual([
            'canHeal.0',
        ]);
    });

    it('accepts known injuries', () => {
        const potion = new LootItemProbe(
            buildLootItem({ canHeal: ['deepCut', 'infection'] }),
        );

        expect(potion.validateSync()).toBeUndefined();
        expect(potion.toObject().canHeal).toEqual(['deepCut', 'infection']);
    });

    it('exposes canHeal right after buyPrice in the LootItem SDL', () => {
        const lines = lootItemTypeLines();
        const buyPriceIndex = lines.indexOf('  buyPrice: Coins');

        expect(buyPriceIndex).toBeGreaterThan(-1);
        expect(lines[buyPriceIndex + 1]).toBe('  canHeal: [InjuryType!]!');
    });
});
