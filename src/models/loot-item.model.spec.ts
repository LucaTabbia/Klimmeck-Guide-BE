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

interface RefListPath {
    instance: string;
    caster: { instance: string };
    options: { ref: string };
}

function recoveryErrorsOf(recovery: unknown): string[] {
    const potion = new LootItemProbe(buildLootItem({ recovery }));
    return Object.keys(potion.validateSync()?.errors ?? {});
}

describe('LootItem recovery and related lore (Phase 18)', () => {
    it('defaults the recovery of a loot item to null (D-15)', () => {
        const potion = new LootItemProbe(buildLootItem()).toObject();

        expect(potion.recovery).toBeNull();
    });

    it('stores a recovery with integer time and turns, without an id (D-15)', () => {
        const potion = new LootItemProbe(
            buildLootItem({ recovery: { time: 1800000, turns: 3 } }),
        );

        expect(potion.validateSync()).toBeUndefined();
        expect(potion.toObject().recovery).toEqual({ time: 1800000, turns: 3 });
    });

    it.each([
        [{ time: -1, turns: 0 }, 'recovery.time'],
        [{ time: 1.5, turns: 0 }, 'recovery.time'],
        [{ time: 0, turns: -1 }, 'recovery.turns'],
        [{ time: 0, turns: 0.5 }, 'recovery.turns'],
        [{ time: 2_147_483_648, turns: 0 }, 'recovery.time'],
        [{ time: 0, turns: 2_147_483_648 }, 'recovery.turns'],
    ])('rejects the recovery %p on validation (D-15)', (recovery, key) => {
        expect(recoveryErrorsOf(recovery)).toEqual([key]);
    });

    it('requires both fields of a recovery (D-15)', () => {
        expect(recoveryErrorsOf({ time: 1000 })).toEqual(['recovery.turns']);
        expect(recoveryErrorsOf({ turns: 1 })).toEqual(['recovery.time']);
    });

    it('accepts time and turns at the GraphQL Int ceiling (D-15)', () => {
        expect(
            recoveryErrorsOf({ time: 2_147_483_647, turns: 2_147_483_647 }),
        ).toEqual([]);
    });

    it('accepts a recovery time of 0 in the schema (D-15)', () => {
        expect(recoveryErrorsOf({ time: 0, turns: 0 })).toEqual([]);
    });

    it('defaults the related lore to an empty list of cast lore refs (D-19)', () => {
        const potion = new LootItemProbe(buildLootItem()).toObject();
        const path = LootItemSchema.path('relatedLore') as unknown as
            | RefListPath
            | undefined;

        expect(potion.relatedLore).toEqual([]);
        expect({
            instance: path?.instance,
            caster: path?.caster.instance,
            ref: path?.options.ref,
        }).toEqual({ instance: 'Array', caster: 'ObjectId', ref: 'Lore' });
    });
});
