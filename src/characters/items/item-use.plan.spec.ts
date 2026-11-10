import { Types } from 'mongoose';
import {
    ItemUseCatalogSnapshot,
    ItemUseCharacterSnapshot,
    ItemUsePlan,
    planItemUse,
    recoveryTimeOf,
} from 'src/characters/items/item-use.plan';
import type { InventorySnapshot } from 'src/economy/trade/trade-inventory';
import { InjuryType } from 'src/models/enums/injury-type.enum';
import { TitleType } from 'src/models/enums/title-type.enum';

const NOW = new Date('2026-11-10T12:00:00.000Z');
const CHARACTER_ID = new Types.ObjectId('64b000000000000000000a01');
const POTION_ID = new Types.ObjectId('64b000000000000000000a02');
const OTHER_ID = new Types.ObjectId('64b000000000000000000a03');
const KNOWN_LORE_ID = new Types.ObjectId('64b000000000000000000a04');
const NEW_LORE_ID = new Types.ObjectId('64b000000000000000000a05');
const RECOVERY_UNTIL = new Date(NOW.getTime() + 1_800_000);

type SnapshotOverrides = {
    status?: Partial<ItemUseCharacterSnapshot['status']>;
    assets?: InventorySnapshot | null;
};

const snapshotWith = (
    overrides: SnapshotOverrides = {},
): ItemUseCharacterSnapshot => ({
    _id: CHARACTER_ID,
    status: {
        title: TitleType.rookie,
        xp: 0,
        currentLifePoints: 400,
        maxLifePoints: 1000,
        injuries: [InjuryType.deepCut, InjuryType.infection],
        unlockedLore: [KNOWN_LORE_ID],
        ...overrides.status,
    },
    assets:
        overrides.assets === undefined
            ? {
                  ownedItems: [
                      { itemType: 'LootItem', item: POTION_ID, quantity: 2 },
                      { itemType: 'LootItem', item: OTHER_ID, quantity: 1 },
                  ],
                  ownedEquipments: [],
              }
            : overrides.assets,
});

const potionWith = (
    overrides: ItemUseCatalogSnapshot = {},
): ItemUseCatalogSnapshot => ({
    effect: 'heal',
    power: 300,
    canHeal: ['deepCut'],
    recovery: { time: 1_800_000, turns: 3 },
    relatedLore: [KNOWN_LORE_ID, NEW_LORE_ID],
    ...overrides,
});

const planWith = (
    snapshotOverrides: SnapshotOverrides = {},
    itemOverrides: ItemUseCatalogSnapshot | null = {},
): ItemUsePlan =>
    planItemUse({
        snapshot: snapshotWith(snapshotOverrides),
        itemId: POTION_ID,
        item: itemOverrides === null ? null : potionWith(itemOverrides),
        now: NOW,
    });

describe('recoveryTimeOf', () => {
    it.each([
        [{ time: 1_800_000, turns: 0 }, 1_800_000],
        [{ time: 1 }, 1],
    ])('reads the recovery %p as %i milliseconds (D-23)', (recovery, ms) => {
        expect(recoveryTimeOf(recovery)).toBe(ms);
    });

    it.each([
        null,
        undefined,
        'soon',
        [],
        {},
        { time: 0 },
        { time: -5 },
        { time: 1.5 },
        { time: '1800000' },
        { time: NaN },
        { time: Infinity },
    ])('reads no recovery time from %p (D-23)', (recovery) => {
        expect(recoveryTimeOf(recovery)).toBeNull();
    });
});

describe('planItemUse — a potion that can be drunk', () => {
    it('plans the life points, the injury, the stack, the recovery and the new lore of a drink (D-17)', () => {
        expect(planWith().outcome).toEqual({
            hpBefore: 400,
            hpAfter: 700,
            injuriesHealed: [InjuryType.deepCut],
            quantityLeft: 1,
            recoveryUntil: RECOVERY_UNTIL,
            loreUnlocked: [NEW_LORE_ID],
        });
    });

    it('writes exactly the five paths of a drink (D-17)', () => {
        expect(planWith().update).toEqual({
            $set: {
                'status.currentLifePoints': 700,
                'status.injuries': [InjuryType.infection],
                'assets.ownedItems': [
                    { itemType: 'LootItem', item: POTION_ID, quantity: 1 },
                    { itemType: 'LootItem', item: OTHER_ID, quantity: 1 },
                ],
                'status.potionRecoveryUntil': RECOVERY_UNTIL,
            },
            $addToSet: { 'status.unlockedLore': { $each: [NEW_LORE_ID] } },
        });
    });

    it('never writes the owned equipments (D-17)', () => {
        expect(Object.keys(planWith().update.$set).sort()).toEqual([
            'assets.ownedItems',
            'status.currentLifePoints',
            'status.injuries',
            'status.potionRecoveryUntil',
        ]);
    });

    it('never raises the life points above the maximum (D-17)', () => {
        expect(
            planWith({ status: { currentLifePoints: 900 } }).outcome.hpAfter,
        ).toBe(1000);
    });

    it('removes the stack at quantity 0 (D-17)', () => {
        const plan = planWith({
            assets: {
                ownedItems: [
                    { itemType: 'LootItem', item: POTION_ID, quantity: 1 },
                    { itemType: 'LootItem', item: OTHER_ID, quantity: 1 },
                ],
                ownedEquipments: [],
            },
        });

        expect(plan.outcome.quantityLeft).toBe(0);
        expect(plan.update.$set['assets.ownedItems']).toEqual([
            { itemType: 'LootItem', item: OTHER_ID, quantity: 1 },
        ]);
    });

    it('adds no lore the second time (D-19)', () => {
        const plan = planWith({
            status: { unlockedLore: [KNOWN_LORE_ID, NEW_LORE_ID] },
        });

        expect(plan.outcome.loreUnlocked).toEqual([]);
        expect(Object.keys(plan.update)).toEqual(['$set']);
    });

    it.each([-50, NaN, '300', null])(
        'reads the power %p as 0 (D-23)',
        (power) => {
            const { outcome } = planWith({}, { power });

            expect(outcome.hpAfter).toBe(400);
            expect(outcome.hpBefore).toBe(400);
            expect(outcome.injuriesHealed).toEqual([InjuryType.deepCut]);
        },
    );

    it('reads lore ids stored as strings and drops unreadable ones (D-23)', () => {
        expect(
            planWith(
                {},
                { relatedLore: [NEW_LORE_ID.toHexString(), 'nope', null] },
            ).outcome.loreUnlocked,
        ).toEqual([NEW_LORE_ID]);
        expect(planWith({}, { relatedLore: 'x' }).outcome.loreUnlocked).toEqual(
            [],
        );
    });

    it('ignores unknown injuries of canHeal and a canHeal that is not a list (D-23)', () => {
        expect(
            planWith({}, { canHeal: ['brokenWing', 'deepCut'] }).outcome
                .injuriesHealed,
        ).toEqual([InjuryType.deepCut]);

        const { outcome } = planWith({}, { canHeal: 'deepCut', power: 300 });
        expect(outcome.injuriesHealed).toEqual([]);
        expect(outcome.hpAfter).toBe(700);
    });

    it('guards the write with the snapshot: identity, no aid, life points, injuries, stack and recovery over (D-22)', () => {
        expect(planWith().filter).toEqual({
            _id: CHARACTER_ID,
            deletedAt: null,
            'status.awaitingAid': null,
            'status.currentLifePoints': 400,
            'status.injuries': [InjuryType.deepCut, InjuryType.infection],
            $and: [
                {
                    'assets.ownedItems': {
                        $elemMatch: {
                            item: { $in: [POTION_ID, POTION_ID.toHexString()] },
                            quantity: { $gte: 1 },
                        },
                    },
                },
                {
                    $or: [
                        { 'status.potionRecoveryUntil': null },
                        { 'status.potionRecoveryUntil': { $lte: NOW } },
                    ],
                },
            ],
        });
    });

    it('guards a legacy snapshot without life points with null (D-22)', () => {
        const plan = planWith({
            status: { currentLifePoints: undefined, maxLifePoints: undefined },
        });

        expect(plan.filter['status.currentLifePoints']).toBeNull();
        expect(plan.outcome.hpBefore).toBe(1000);
    });

    it('drinks while travelling (D-17)', () => {
        const travelling = {
            status: { activeTravel: { endTime: NOW } },
        } as unknown as SnapshotOverrides;

        expect(planWith(travelling).outcome).toEqual(planWith().outcome);
    });
});
