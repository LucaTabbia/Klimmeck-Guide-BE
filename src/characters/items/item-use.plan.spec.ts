import { Types } from 'mongoose';
import {
    ItemUseCatalogSnapshot,
    ItemUseCharacterSnapshot,
    ItemUsePlan,
    planItemUse,
    recoveryTimeOf,
} from 'src/characters/items/item-use.plan';
import type { InventorySnapshot } from 'src/economy/trade/trade-inventory';
import { GameRuleException } from 'src/gameRules/game-rule.exception';
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

    it('guards the write with the snapshot: identity, no aid, life points, injuries, recovery and stack (D-22)', () => {
        expect(planWith().filter).toEqual({
            _id: CHARACTER_ID,
            deletedAt: null,
            'status.awaitingAid': null,
            'status.currentLifePoints': 400,
            'status.injuries': [InjuryType.deepCut, InjuryType.infection],
            'status.potionRecoveryUntil': null,
            $and: [
                {
                    'assets.ownedItems': {
                        $elemMatch: {
                            item: { $in: [POTION_ID, POTION_ID.toHexString()] },
                            quantity: { $gte: 1 },
                        },
                    },
                },
            ],
        });
    });

    // il filtro ripete ciò che il piano ha letto, mai una regola sua: una forma che il piano accetta deve combaciare (D-22, D-23)
    it.each<[string, unknown]>([
        ['an ended date', new Date(NOW.getTime() - 60_000)],
        ['the exact end', new Date(NOW.getTime())],
        ['a text', 'soon'],
        ['a number', 42],
    ])(
        'pins the recovery the plan read as over: %s (D-22, D-23)',
        (_case, potionRecoveryUntil) => {
            expect(
                planWith({ status: { potionRecoveryUntil } }).filter[
                    'status.potionRecoveryUntil'
                ],
            ).toEqual(potionRecoveryUntil);
        },
    );

    it('pins a missing recovery and missing injuries as null, so a legacy can drink (D-22, D-23)', () => {
        const { filter } = planWith({
            status: { potionRecoveryUntil: undefined, injuries: undefined },
        });

        expect(filter['status.potionRecoveryUntil']).toBeNull();
        expect(filter['status.injuries']).toBeNull();
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

describe('planItemUse — refusals', () => {
    const AWAITING = { awaitingAid: { since: NOW } };
    const FUTURE = { potionRecoveryUntil: new Date(NOW.getTime() + 60_000) };
    const WITHOUT_POTION: InventorySnapshot = {
        ownedItems: [{ itemType: 'LootItem', item: OTHER_ID, quantity: 1 }],
        ownedEquipments: [],
    };

    const refusalOf = (
        snapshotOverrides: SnapshotOverrides = {},
        itemOverrides: ItemUseCatalogSnapshot | null = {},
    ): unknown => {
        try {
            planWith(snapshotOverrides, itemOverrides);
        } catch (error) {
            if (error instanceof GameRuleException) return error.extensions;
            throw error;
        }
        throw new Error('the drink was not refused');
    };

    it('refuses a character awaiting aid before anything else (D-17)', () => {
        expect(
            refusalOf({ status: AWAITING, assets: WITHOUT_POTION }, null),
        ).toEqual({ code: 'AWAITING_AID' });
    });

    it.each<[string, string, SnapshotOverrides, ItemUseCatalogSnapshot]>([
        [
            'AWAITING_AID',
            'ITEM_NOT_OWNED',
            { status: AWAITING, assets: WITHOUT_POTION },
            {},
        ],
        [
            'ITEM_NOT_OWNED',
            'ITEM_NOT_USABLE',
            { assets: WITHOUT_POTION },
            { effect: 'hunger' },
        ],
        [
            'ITEM_NOT_USABLE',
            'POTION_RECOVERING',
            { status: FUTURE },
            { recovery: undefined },
        ],
        [
            'POTION_RECOVERING',
            'ITEM_NO_EFFECT',
            {
                status: {
                    ...FUTURE,
                    currentLifePoints: 1000,
                    injuries: [InjuryType.infection],
                },
            },
            {},
        ],
    ])(
        'answers %s before %s (D-17)',
        (first, _second, snapshotOverrides, itemOverrides) => {
            expect(refusalOf(snapshotOverrides, itemOverrides)).toMatchObject({
                code: first,
            });
        },
    );

    it.each<[string, InventorySnapshot]>([
        ['no stack', WITHOUT_POTION],
        [
            'a stack at quantity 0',
            {
                ownedItems: [
                    { itemType: 'LootItem', item: POTION_ID, quantity: 0 },
                ],
                ownedEquipments: [],
            },
        ],
        [
            'only among the owned equipments',
            {
                ownedItems: [],
                ownedEquipments: [
                    { itemType: 'EquipmentItem', item: POTION_ID, quantity: 1 },
                ],
            },
        ],
    ])('refuses an item that is not owned: %s (D-17)', (_case, assets) => {
        expect(refusalOf({ assets })).toEqual({ code: 'ITEM_NOT_OWNED' });
    });

    it('refuses an owned item missing from the catalog as not usable (D-17)', () => {
        expect(refusalOf({}, null)).toEqual({ code: 'ITEM_NOT_USABLE' });
    });

    it('refuses a loot item whose effect is not heal (D-17)', () => {
        expect(refusalOf({}, { effect: 'hunger' })).toEqual({
            code: 'ITEM_NOT_USABLE',
        });
    });

    it.each([null, {}, { time: 0, turns: 0 }, { time: 1.5, turns: 1 }])(
        'refuses a potion whose recovery is %p: no integer time above 0 (D-23)',
        (recovery) => {
            expect(refusalOf({}, { recovery })).toEqual({
                code: 'ITEM_NOT_USABLE',
            });
        },
    );

    it('refuses a second potion while the recovery runs, with the end instant (D-17)', () => {
        expect(
            refusalOf({
                status: { potionRecoveryUntil: new Date(NOW.getTime() + 1) },
            }),
        ).toEqual({
            code: 'POTION_RECOVERING',
            recoveryUntil: '2026-11-10T12:00:00.001Z',
        });
    });

    it('drinks again at the exact millisecond the recovery ends (D-17)', () => {
        expect(
            planWith({
                status: { potionRecoveryUntil: new Date(NOW.getTime()) },
            }).outcome.hpAfter,
        ).toBe(700);
    });

    it('treats a recovery that is not a date as over (D-23)', () => {
        expect(
            planWith({ status: { potionRecoveryUntil: 'soon' } }).outcome
                .hpAfter,
        ).toBe(700);
    });

    it('refuses a potion that would change nothing: full life points and no curable injury (D-23)', () => {
        expect(
            refusalOf(
                {
                    status: {
                        currentLifePoints: 1000,
                        injuries: [InjuryType.infection],
                    },
                },
                { canHeal: ['deepCut'] },
            ),
        ).toEqual({ code: 'ITEM_NO_EFFECT' });
    });

    it('refuses a potion of power 0 without a curable injury even below the maximum (D-23)', () => {
        expect(
            refusalOf(
                { status: { injuries: [InjuryType.infection] } },
                { power: 0 },
            ),
        ).toEqual({ code: 'ITEM_NO_EFFECT' });
    });

    it('drinks a potion of power 0 that cures an injury (D-23)', () => {
        const { outcome } = planWith(
            { status: { injuries: [InjuryType.deepCut] } },
            { power: 0 },
        );

        expect(outcome.hpAfter).toBe(400);
        expect(outcome.injuriesHealed).toEqual([InjuryType.deepCut]);
    });

    it('drinks at full life points when an injury is curable (D-17)', () => {
        expect(
            planWith({
                status: {
                    currentLifePoints: 1000,
                    injuries: [InjuryType.deepCut],
                },
            }).outcome.hpAfter,
        ).toBe(1000);
    });
});
