import { Types } from 'mongoose';
import {
    ItemUseCatalogSnapshot,
    ItemUseCharacterSnapshot,
    ItemUsePlan,
    planItemUse,
    planPetPotion,
    recoveryTimeOf,
} from 'src/characters/items/item-use.plan';
import type { OwnedPetEntry } from 'src/characters/pets/owned-pet-entry';
import type { InventorySnapshot } from 'src/economy/trade/trade-inventory';
import { GameRuleException } from 'src/gameRules/game-rule.exception';
import { InjuryType } from 'src/models/enums/injury-type.enum';
import { MAX_RECOVERY_VALUE } from 'src/models/loot-item.model';
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
    missionInProgress = false,
): ItemUsePlan =>
    planItemUse({
        snapshot: snapshotWith(snapshotOverrides),
        itemId: POTION_ID,
        item: itemOverrides === null ? null : potionWith(itemOverrides),
        now: NOW,
        missionInProgress,
    });

describe('recoveryTimeOf', () => {
    it.each([
        [{ time: 1_800_000, turns: 0 }, 1_800_000],
        [{ time: 1 }, 1],
        [{ time: 2_147_483_647, turns: 0 }, 2_147_483_647],
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
        { time: 2_147_483_648 },
        { time: 9e15 },
    ])('reads no recovery time from %p (D-23)', (recovery) => {
        expect(recoveryTimeOf(recovery)).toBeNull();
    });

    // il tetto dell'Int GraphQL tiene la fine della ricarica lontana dal limite delle date di JavaScript
    it('plans a valid end of recovery at the longest readable time (D-15, D-23)', () => {
        const { recoveryUntil } = planWith(
            {},
            { recovery: { time: MAX_RECOVERY_VALUE, turns: 0 } },
        ).outcome;

        expect(recoveryUntil.getTime()).toBe(
            NOW.getTime() + MAX_RECOVERY_VALUE,
        );
        expect(Number.isNaN(recoveryUntil.getTime())).toBe(false);
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

    // stesso principio del tetto delle heal (D-02): il massimo limita la cura, non ridimensiona la vita
    it('never lowers life points above the maximum and still cures the injury (D-17, D-02)', () => {
        const { outcome } = planWith({
            status: {
                currentLifePoints: 1200,
                injuries: [InjuryType.deepCut],
            },
        });

        expect(outcome.hpBefore).toBe(1200);
        expect(outcome.hpAfter).toBe(1200);
        expect(outcome.injuriesHealed).toEqual([InjuryType.deepCut]);
    });

    it('refuses a potion above the maximum without a curable injury (D-17, D-02)', () => {
        expect(() =>
            planWith({
                status: {
                    currentLifePoints: 1200,
                    injuries: [InjuryType.infection],
                },
            }),
        ).toThrow(
            expect.objectContaining({
                extensions: { code: 'ITEM_NO_EFFECT' },
            }) as Error,
        );
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

    // il cast di Mongoose sul path Date renderebbe impossibile l'uguaglianza con un testo o un numero
    it.each(['soon', 42])(
        'pins a recovery that is not a date by its type: %p (D-22, D-23)',
        (potionRecoveryUntil) => {
            expect(
                planWith({ status: { potionRecoveryUntil } }).filter[
                    'status.potionRecoveryUntil'
                ],
            ).toEqual({ $not: { $type: 'date' } });
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
        missionInProgress = false,
    ): unknown => {
        try {
            planWith(snapshotOverrides, itemOverrides, missionInProgress);
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

    it('refuses a potion during a mission with its own code (D-11, D-12)', () => {
        expect(refusalOf({}, {}, true)).toEqual({
            code: 'MISSION_IN_PROGRESS',
        });
    });

    it('keeps the aid refusal first (D-23)', () => {
        expect(refusalOf({ status: AWAITING }, {}, true)).toEqual({
            code: 'AWAITING_AID',
        });
    });

    it('refuses a mission before ownership and recovery (D-23)', () => {
        expect(
            refusalOf({ status: FUTURE, assets: WITHOUT_POTION }, null, true),
        ).toEqual({ code: 'MISSION_IN_PROGRESS' });
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

describe('pet potion plan', () => {
    const MINUTE = 60_000;
    const T0 = NOW;
    const AT = new Date(T0.getTime() + 20 * MINUTE);
    const PET_ID = new Types.ObjectId('64b000000000000000000a06');
    const OTHER_PET_ID = new Types.ObjectId('64b000000000000000000a07');
    const PET_RECOVERY_UNTIL = new Date(AT.getTime() + 10 * MINUTE);
    const SPECIES = { maxLifePoints: 100, recoveryTime: 100 * MINUTE };
    const RESTING: OwnedPetEntry = {
        pet: PET_ID,
        xp: 0,
        currentLifePoints: 20,
        lifeAsOf: T0,
    };
    const OTHER: OwnedPetEntry = {
        pet: OTHER_PET_ID,
        xp: 5,
        currentLifePoints: 30,
        level: 1,
        name: 'Ombra',
        lifeAsOf: T0,
        potionRecoveryUntil: new Date(AT.getTime() + 5 * MINUTE),
    };
    const OWNED_ITEMS: InventorySnapshot['ownedItems'] = [
        { itemType: 'LootItem', item: POTION_ID, quantity: 2 },
        { itemType: 'LootItem', item: OTHER_ID, quantity: 1 },
    ];

    interface PetCase {
        status?: Partial<ItemUseCharacterSnapshot['status']>;
        slot?: unknown;
        ownedPets?: OwnedPetEntry[];
        ownedItems?: typeof OWNED_ITEMS;
        pet?: {
            maxLifePoints?: unknown;
            maxXp?: unknown;
            recoveryTime?: unknown;
        } | null;
        item?: ItemUseCatalogSnapshot | null;
        missionInProgress?: boolean;
    }

    const petPlanWith = (petCase: PetCase = {}): ItemUsePlan =>
        planPetPotion({
            snapshot: {
                ...snapshotWith({ status: petCase.status }),
                assets: {
                    ownedItems: petCase.ownedItems ?? OWNED_ITEMS,
                    ownedEquipments: [],
                    pet: petCase.slot ?? null,
                    ownedPets: petCase.ownedPets ?? [RESTING, OTHER],
                },
            },
            itemId: POTION_ID,
            item:
                petCase.item === null
                    ? null
                    : potionWith({
                          power: 30,
                          recovery: { time: 10 * MINUTE },
                          ...petCase.item,
                      }),
            now: AT,
            missionInProgress: petCase.missionInProgress ?? false,
            petId: PET_ID,
            pet: petCase.pet === undefined ? SPECIES : petCase.pet,
        });

    const petRefusalOf = (petCase: PetCase): unknown => {
        try {
            petPlanWith(petCase);
        } catch (error) {
            if (error instanceof GameRuleException) return error.extensions;
            throw error;
        }
        throw new Error('the potion was not refused');
    };

    const writtenEntryOf = (plan: ItemUsePlan): unknown =>
        (plan.update.$set['assets.ownedPets'] as unknown[])[0];

    it('heals a resting companion from the life it reached and anchors the rest at now (D-07, D-05)', () => {
        const plan = petPlanWith();

        expect(plan.outcome).toEqual({
            hpBefore: 40,
            hpAfter: 70,
            injuriesHealed: [],
            quantityLeft: 1,
            recoveryUntil: PET_RECOVERY_UNTIL,
            loreUnlocked: [NEW_LORE_ID],
        });
        expect(writtenEntryOf(plan)).toEqual({
            pet: PET_ID,
            xp: 0,
            currentLifePoints: 70,
            level: 1,
            lifeAsOf: AT,
            potionRecoveryUntil: PET_RECOVERY_UNTIL,
        });
        expect(plan.update.$set['assets.ownedItems']).toEqual([
            { itemType: 'LootItem', item: POTION_ID, quantity: 1 },
            { itemType: 'LootItem', item: OTHER_ID, quantity: 1 },
        ]);
    });

    it('heals the equipped companion without a rest anchor (D-07)', () => {
        const plan = petPlanWith({
            slot: PET_ID,
            ownedPets: [
                { pet: PET_ID, xp: 0, currentLifePoints: 50, level: 1 },
                OTHER,
            ],
        });

        expect(plan.outcome.hpBefore).toBe(50);
        expect(plan.outcome.hpAfter).toBe(80);
        expect(writtenEntryOf(plan)).toEqual({
            pet: PET_ID,
            xp: 0,
            currentLifePoints: 80,
            level: 1,
            potionRecoveryUntil: PET_RECOVERY_UNTIL,
        });
    });

    it('refuses a defeated companion before its wait (D-06)', () => {
        expect(
            petRefusalOf({
                ownedPets: [
                    {
                        ...RESTING,
                        defeatedUntil: new Date(AT.getTime() + 60 * MINUTE),
                        potionRecoveryUntil: new Date(AT.getTime() + MINUTE),
                    },
                ],
            }),
        ).toEqual({ code: 'PET_DEFEATED' });
    });

    it('refuses a companion in its own potion wait with the date (D-32, D-05)', () => {
        const until = new Date(AT.getTime() + 5 * MINUTE);

        expect(
            petRefusalOf({
                ownedPets: [{ ...RESTING, potionRecoveryUntil: until }],
            }),
        ).toEqual({
            code: 'PET_POTION_RECOVERING',
            recoveryUntil: until.toISOString(),
        });
    });

    it("ignores the character's potion wait for the companion (D-05)", () => {
        const plan = petPlanWith({
            status: { potionRecoveryUntil: new Date(AT.getTime() + MINUTE) },
        });

        expect(plan.outcome.hpAfter).toBe(70);
        expect(Object.keys(plan.update.$set).sort()).toEqual([
            'assets.ownedItems',
            'assets.ownedPets',
        ]);
        expect(Object.keys(plan.filter)).not.toContain(
            'status.potionRecoveryUntil',
        );
    });

    it('refuses a full-life companion without consuming the potion (D-07, D-32)', () => {
        expect(
            petRefusalOf({
                ownedPets: [
                    { pet: PET_ID, xp: 0, currentLifePoints: 100, level: 1 },
                ],
            }),
        ).toEqual({ code: 'ITEM_NO_EFFECT' });
    });

    it('rounds a fractional potion down like the character one, life always whole (D-07)', () => {
        const equippedAt50: PetCase = {
            slot: PET_ID,
            ownedPets: [
                { pet: PET_ID, xp: 0, currentLifePoints: 50, level: 1 },
            ],
        };

        const plan = petPlanWith({ ...equippedAt50, item: { power: 12.5 } });

        expect(plan.outcome).toMatchObject({ hpBefore: 50, hpAfter: 62 });
        expect(writtenEntryOf(plan)).toMatchObject({ currentLifePoints: 62 });
        expect(petRefusalOf({ ...equippedAt50, item: { power: 0.5 } })).toEqual(
            { code: 'ITEM_NO_EFFECT' },
        );
    });

    it('heals up to the maximum of the companion level, not the species base (D-38)', () => {
        const levelled = (currentLifePoints: number): PetCase => ({
            slot: PET_ID,
            pet: { maxLifePoints: 100, maxXp: 100 },
            ownedPets: [{ pet: PET_ID, xp: 100, level: 10, currentLifePoints }],
        });

        expect(petPlanWith(levelled(150)).outcome.hpAfter).toBe(180);
        expect(petPlanWith(levelled(190)).outcome.hpAfter).toBe(200);
        expect(petPlanWith(levelled(100)).outcome).toMatchObject({
            hpBefore: 100,
            hpAfter: 130,
        });
    });

    it('refuses a potion on a companion never touched by the phase, read at full life (D-23, D-38)', () => {
        expect(
            petRefusalOf({
                pet: { maxLifePoints: 100, maxXp: 100 },
                ownedPets: [{ pet: PET_ID, xp: 22, currentLifePoints: 100 }],
            }),
        ).toEqual({ code: 'ITEM_NO_EFFECT' });
    });

    it('refuses a companion whose species has no readable life (D-38)', () => {
        expect(petRefusalOf({ pet: null })).toEqual({
            code: 'ITEM_NO_EFFECT',
        });
    });

    it('refuses a pet not owned after the potion checks (D-32)', () => {
        const withoutPotion: InventorySnapshot['ownedItems'] = [
            { itemType: 'LootItem', item: OTHER_ID, quantity: 1 },
        ];

        expect(petRefusalOf({ ownedPets: [OTHER] })).toEqual({
            code: 'PET_NOT_OWNED',
        });
        expect(
            petRefusalOf({ ownedPets: [OTHER], ownedItems: withoutPotion }),
        ).toEqual({ code: 'ITEM_NOT_OWNED' });
        expect(
            petRefusalOf({ ownedPets: [OTHER], item: { effect: 'hunger' } }),
        ).toEqual({ code: 'ITEM_NOT_USABLE' });
    });

    it('keeps the mission lock and the awaiting aid before everything (D-32)', () => {
        const defeated = [
            {
                ...RESTING,
                defeatedUntil: new Date(AT.getTime() + 60 * MINUTE),
            },
        ];

        expect(
            petRefusalOf({
                status: { awaitingAid: { since: NOW } },
                missionInProgress: true,
                ownedPets: defeated,
            }),
        ).toEqual({ code: 'AWAITING_AID' });
        expect(
            petRefusalOf({
                missionInProgress: true,
                ownedPets: defeated,
                item: null,
            }),
        ).toEqual({ code: 'MISSION_IN_PROGRESS' });
    });

    it('unlocks the potion lore to the character (D-32)', () => {
        const plan = petPlanWith();

        expect(plan.outcome.loreUnlocked).toEqual([NEW_LORE_ID]);
        expect(plan.update.$addToSet).toEqual(planWith().update.$addToSet);
    });

    it('guards the write on the companion as read (D-23)', () => {
        expect(petPlanWith().filter).toEqual({
            _id: CHARACTER_ID,
            deletedAt: null,
            'status.awaitingAid': null,
            'assets.pet': null,
            'assets.ownedPets': {
                $elemMatch: {
                    pet: { $in: [PET_ID, PET_ID.toHexString()] },
                    currentLifePoints: 20,
                    lifeAsOf: T0,
                    potionRecoveryUntil: null,
                    defeatedUntil: null,
                },
            },
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

    it('guards the slot and the ended dates of the companion as read (D-23)', () => {
        const ended = new Date(AT.getTime() - MINUTE);
        const { filter } = petPlanWith({
            slot: PET_ID.toHexString(),
            ownedPets: [
                {
                    pet: PET_ID,
                    xp: 0,
                    currentLifePoints: 50,
                    level: 1,
                    potionRecoveryUntil: ended,
                    defeatedUntil: 'soon',
                },
            ],
        });

        expect(filter['assets.pet']).toEqual({
            $in: [PET_ID, PET_ID.toHexString()],
        });
        expect(filter['assets.ownedPets']).toEqual({
            $elemMatch: {
                pet: { $in: [PET_ID, PET_ID.toHexString()] },
                currentLifePoints: 50,
                lifeAsOf: null,
                potionRecoveryUntil: ended,
                defeatedUntil: { $not: { $type: 'date' } },
            },
        });
    });

    it('keeps the name and dates of the other companions (D-23)', () => {
        expect(
            (petPlanWith().update.$set['assets.ownedPets'] as unknown[])[1],
        ).toEqual(OTHER);
    });
});
