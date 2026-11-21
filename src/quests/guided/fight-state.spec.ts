import { Types } from 'mongoose';
import { GameRuleErrorCode } from 'src/gameRules/game-rule-error-code.enum';
import { InjuryType } from 'src/models/enums/injury-type.enum';
import { TitleType } from 'src/models/enums/title-type.enum';
import type { ParticipantEffects } from 'src/quests/outcomes/combat/combat-resolver';
import type { CompanionCatalogEntry } from 'src/quests/outcomes/pets/companion-after-fight';
import type { ResolutionCharacter } from 'src/quests/outcomes/resolution-loader.service';
import {
    assertWoundCorrectionAllowed,
    effectsRecordOf,
    fightStartOf,
    participantEffectsOf,
    stateBeforeFight,
} from 'src/quests/guided/fight-state';

const HERO_ID = new Types.ObjectId('64d0000000000000000000a1');
const HERB_ID = new Types.ObjectId('64d0000000000000000000b1');
const POTION_ID = new Types.ObjectId('64d0000000000000000000b2');
const ACTIVE_SPELL_ID = new Types.ObjectId('64d0000000000000000000c1');
const RESTING_SPELL_ID = new Types.ObjectId('64d0000000000000000000c2');
const WOLF_ID = new Types.ObjectId('64d0000000000000000000d1');

const PET_CATALOG: ReadonlyMap<string, CompanionCatalogEntry> = new Map([
    [WOLF_ID.toHexString(), { name: 'Lupo', maxLifePoints: 100, maxXp: 100 }],
]);
const NO_PETS: ReadonlyMap<string, CompanionCatalogEntry> = new Map();

const heroSnapshot = (): ResolutionCharacter => ({
    _id: HERO_ID,
    status: {
        title: TitleType.rookie,
        xp: 20000,
        level: 1,
        currentLifePoints: 800,
        maxLifePoints: 1000,
        injuries: [],
        spellStates: [
            {
                spell: ACTIVE_SPELL_ID,
                usages: 5,
                recoveries: [],
                active: true,
            },
            {
                spell: RESTING_SPELL_ID,
                usages: 4,
                recoveries: [],
                active: false,
            },
        ],
    },
    assets: {
        ownedItems: [
            { itemType: 'LootItem', item: HERB_ID, quantity: 1 },
            { itemType: 'LootItem', item: POTION_ID, quantity: 3 },
        ],
        ownedEquipments: [],
        wornEquipment: {},
        pet: null,
        ownedPets: [],
    },
});

type OwnedPets = NonNullable<ResolutionCharacter['assets']>['ownedPets'];

const heroWith = (ownedPets: OwnedPets): ResolutionCharacter => {
    const snapshot = heroSnapshot();
    return {
        ...snapshot,
        assets: { ...snapshot.assets, pet: WOLF_ID, ownedPets },
    };
};

const fenrirAt = (currentLifePoints: number) => ({
    pet: WOLF_ID,
    xp: 0,
    currentLifePoints,
    level: 1,
    name: 'Fenrir',
});

const firstFight: ParticipantEffects = {
    characterId: HERO_ID.toHexString(),
    hpAfter: 600,
    injuriesAdded: [InjuryType.crushedRightHand],
    consumablesUsed: [{ itemId: POTION_ID.toHexString(), quantity: 1 }],
    spellsUsed: [{ spellId: ACTIVE_SPELL_ID.toHexString(), usages: 2 }],
};

const fightLeavingCompanionAt = (
    companionLifeAfter: number,
): ParticipantEffects => ({
    characterId: HERO_ID.toHexString(),
    hpAfter: 800,
    injuriesAdded: [],
    consumablesUsed: [],
    spellsUsed: [],
    companionLifeAfter,
});

function codeOf(run: () => unknown): GameRuleErrorCode | undefined {
    try {
        run();
    } catch (error) {
        return (error as { code?: GameRuleErrorCode }).code;
    }
    return undefined;
}

describe('stateBeforeFight', () => {
    it('starts the first fight from the real state (D-04)', () => {
        expect(stateBeforeFight(heroSnapshot(), [], NO_PETS)).toEqual(
            heroSnapshot(),
        );
    });

    it('starts a fight from the corrected state of the previous one (D-02)', () => {
        const snapshot = heroSnapshot();

        expect(stateBeforeFight(snapshot, [firstFight], NO_PETS)).toEqual({
            ...snapshot,
            status: {
                ...snapshot.status,
                currentLifePoints: 600,
                injuries: [InjuryType.crushedRightHand],
                innkeeperInjuries: [],
                spellStates: [
                    {
                        spell: ACTIVE_SPELL_ID,
                        usages: 3,
                        recoveries: [],
                        active: true,
                    },
                    {
                        spell: RESTING_SPELL_ID,
                        usages: 4,
                        recoveries: [],
                        active: false,
                    },
                ],
            },
            assets: {
                ...snapshot.assets,
                ownedItems: [
                    { itemType: 'LootItem', item: HERB_ID, quantity: 1 },
                    { itemType: 'LootItem', item: POTION_ID, quantity: 2 },
                ],
                ownedEquipments: [],
            },
        });
    });

    it('never mutates the snapshot read (D-04)', () => {
        const snapshot = heroSnapshot();

        stateBeforeFight(snapshot, [firstFight, firstFight], NO_PETS);

        expect(snapshot).toEqual(heroSnapshot());
    });

    it('starts the next fight from the companion life left by the previous one (D-17)', () => {
        const snapshot = heroWith([fenrirAt(60)]);

        const state = stateBeforeFight(
            snapshot,
            [fightLeavingCompanionAt(30)],
            PET_CATALOG,
        );

        expect(state.assets?.pet).toBe(WOLF_ID);
        expect(state.assets?.ownedPets).toEqual([fenrirAt(30)]);
    });

    it('carries a companion never touched by the phase with its level so it is not read full again (D-17, D-23)', () => {
        const snapshot = heroWith([
            { pet: WOLF_ID, xp: 22, currentLifePoints: 100 },
        ]);

        const state = stateBeforeFight(
            snapshot,
            [fightLeavingCompanionAt(70)],
            PET_CATALOG,
        );

        expect(state.assets?.ownedPets).toEqual([
            { pet: WOLF_ID, xp: 22, currentLifePoints: 70, level: 5 },
        ]);
        expect(fightStartOf(state, PET_CATALOG).companion).toEqual({
            pet: WOLF_ID,
            name: 'Lupo',
            lifeBefore: 70,
            maxLifePoints: 122,
        });
    });

    it('leaves a companion defeated in a fight out of the following fights (D-12, D-26)', () => {
        const snapshot = heroWith([fenrirAt(60)]);

        const state = stateBeforeFight(
            snapshot,
            [fightLeavingCompanionAt(1)],
            PET_CATALOG,
        );

        expect(state.assets?.pet).toBeNull();
        expect(state.assets?.ownedPets).toEqual([fenrirAt(1)]);
        expect(fightStartOf(state, PET_CATALOG).companion).toBeNull();
    });

    it('does not touch the snapshot it reads (D-17)', () => {
        const snapshot = heroWith([fenrirAt(60)]);
        const copy = structuredClone(snapshot);

        stateBeforeFight(
            snapshot,
            [fightLeavingCompanionAt(30), fightLeavingCompanionAt(1)],
            PET_CATALOG,
        );

        expect(snapshot).toEqual(copy);
    });
});

describe('fightStartOf', () => {
    it('serves the bounds at the start of a fight (D-06, D-17)', () => {
        const state = stateBeforeFight(heroSnapshot(), [firstFight], NO_PETS);

        expect(fightStartOf(state, PET_CATALOG)).toEqual({
            hpBefore: 600,
            injuriesBefore: [InjuryType.crushedRightHand],
            innkeeperInjuriesBefore: [],
            consumablesAvailable: [
                { item: HERB_ID, quantity: 1 },
                { item: POTION_ID, quantity: 2 },
            ],
            spellsAvailable: [{ spell: ACTIVE_SPELL_ID, usages: 3 }],
            companion: null,
        });
    });

    it('serves the companion bounds at the start of a fight (D-17, D-20)', () => {
        expect(
            fightStartOf(heroWith([fenrirAt(60)]), PET_CATALOG).companion,
        ).toEqual({
            pet: WOLF_ID,
            name: 'Fenrir',
            lifeBefore: 60,
            maxLifePoints: 100,
        });
        expect(
            fightStartOf(heroWith([fenrirAt(60)]), NO_PETS).companion,
        ).toBeNull();
        expect(
            fightStartOf(
                heroWith([fenrirAt(60)]),
                new Map([[WOLF_ID.toHexString(), { maxLifePoints: 0 }]]),
            ).companion,
        ).toBeNull();
        expect(fightStartOf(heroWith([]), PET_CATALOG).companion).toBeNull();
        expect(
            fightStartOf(
                heroWith([{ pet: WOLF_ID, xp: 0, currentLifePoints: 0 }]),
                PET_CATALOG,
            ).companion,
        ).toEqual({
            pet: WOLF_ID,
            name: 'Lupo',
            lifeBefore: 100,
            maxLifePoints: 100,
        });
    });

    it('bounds the companion with the maximum of its level (D-38)', () => {
        expect(
            fightStartOf(
                heroWith([
                    {
                        pet: WOLF_ID,
                        xp: 62,
                        currentLifePoints: 90,
                        level: 8,
                    },
                ]),
                PET_CATALOG,
            ).companion,
        ).toEqual({
            pet: WOLF_ID,
            name: 'Lupo',
            lifeBefore: 90,
            maxLifePoints: 162,
        });
    });

    it('brings a companion never touched by the phase into the mission at full life (D-23, D-38)', () => {
        expect(
            fightStartOf(
                heroWith([{ pet: WOLF_ID, xp: 22, currentLifePoints: 100 }]),
                PET_CATALOG,
            ).companion,
        ).toEqual({
            pet: WOLF_ID,
            name: 'Lupo',
            lifeBefore: 122,
            maxLifePoints: 122,
        });
        expect(
            fightStartOf(
                heroWith([
                    { pet: WOLF_ID, xp: 0, currentLifePoints: 102, level: 2 },
                ]),
                PET_CATALOG,
            ).companion,
        ).toEqual({
            pet: WOLF_ID,
            name: 'Lupo',
            lifeBefore: 102,
            maxLifePoints: 102,
        });
    });
});

describe('wounds across the fights (Phase 25)', () => {
    const { deepCut, crushedRightHand, brokenLeftLeg } = InjuryType;

    const woundedSnapshot = (
        wounds: Partial<ResolutionCharacter['status']>,
    ): ResolutionCharacter => {
        const snapshot = heroSnapshot();
        return { ...snapshot, status: { ...snapshot.status, ...wounds } };
    };

    const fightWith = (
        wounds: Partial<ParticipantEffects>,
    ): ParticipantEffects => ({
        characterId: HERO_ID.toHexString(),
        hpAfter: 700,
        injuriesAdded: [],
        consumablesUsed: [],
        spellsUsed: [],
        ...wounds,
    });

    const startAfter = (
        snapshot: ResolutionCharacter,
        previous: ParticipantEffects[],
    ) => fightStartOf(stateBeforeFight(snapshot, previous, NO_PETS), NO_PETS);

    it('starts the next fight without a wound removed in the previous one (D-13)', () => {
        const start = startAfter(
            woundedSnapshot({
                injuries: [deepCut, brokenLeftLeg],
                innkeeperInjuries: [deepCut],
            }),
            [fightWith({ injuriesRemoved: [deepCut] })],
        );

        expect(start.injuriesBefore).toEqual([brokenLeftLeg]);
        expect(start.innkeeperInjuriesBefore).toEqual([]);
    });

    it("starts the next fight counting a hand-inflicted wound among the innkeeper's (D-12)", () => {
        const start = startAfter(woundedSnapshot({ injuries: [deepCut] }), [
            fightWith({
                injuriesAdded: [crushedRightHand],
                innkeeperInjuries: [crushedRightHand],
            }),
            fightWith({}),
        ]);

        expect(start.injuriesBefore).toEqual([deepCut, crushedRightHand]);
        expect(start.innkeeperInjuriesBefore).toEqual([crushedRightHand]);
    });

    it('starts the next fight with a simulated wound as an ordinary one (D-12)', () => {
        const start = startAfter(heroSnapshot(), [firstFight]);

        expect(start.injuriesBefore).toEqual([crushedRightHand]);
        expect(start.innkeeperInjuriesBefore).toEqual([]);
    });

    it('reads the innkeeper wounds at the start of the first fight from the character (D-13)', () => {
        expect(
            startAfter(
                woundedSnapshot({
                    injuries: [deepCut, brokenLeftLeg],
                    innkeeperInjuries: [brokenLeftLeg],
                }),
                [],
            ).innkeeperInjuriesBefore,
        ).toEqual([brokenLeftLeg]);
        expect(
            startAfter(woundedSnapshot({ injuries: [deepCut] }), [])
                .innkeeperInjuriesBefore,
        ).toEqual([]);
    });

    it('does not mutate the snapshot it overlays', () => {
        const snapshot = woundedSnapshot({
            injuries: [deepCut],
            innkeeperInjuries: [deepCut],
        });
        const copy = structuredClone(snapshot);

        stateBeforeFight(
            snapshot,
            [
                fightWith({
                    injuriesAdded: [deepCut, crushedRightHand],
                    injuriesRemoved: [deepCut],
                    innkeeperInjuries: [crushedRightHand],
                }),
            ],
            NO_PETS,
        );

        expect(snapshot).toEqual(copy);
    });
});

describe('assertWoundCorrectionAllowed', () => {
    const { crushedRightHand, brokenLeftLeg } = InjuryType;

    it('allows the removal of a wound carried before the fight (D-13)', () => {
        expect(() =>
            assertWoundCorrectionAllowed([crushedRightHand], {
                injuriesAdded: [],
                injuriesRemoved: [crushedRightHand],
            }),
        ).not.toThrow();
    });

    it('refuses the removal of a wound not carried before the fight (D-13)', () => {
        expect(
            codeOf(() =>
                assertWoundCorrectionAllowed([crushedRightHand], {
                    injuriesAdded: [],
                    injuriesRemoved: [brokenLeftLeg],
                }),
            ),
        ).toBe(GameRuleErrorCode.OUTCOME_OVERRIDE_INVALID);
    });

    it('refuses a correction that adds again a wound still carried (D-16)', () => {
        expect(
            codeOf(() =>
                assertWoundCorrectionAllowed([crushedRightHand], {
                    injuriesAdded: [crushedRightHand],
                }),
            ),
        ).toBe(GameRuleErrorCode.OUTCOME_OVERRIDE_INVALID);
        expect(() =>
            assertWoundCorrectionAllowed([crushedRightHand], {
                injuriesAdded: [brokenLeftLeg],
            }),
        ).not.toThrow();
    });

    it('allows a wound removed and added again in the same correction (D-16)', () => {
        expect(() =>
            assertWoundCorrectionAllowed([crushedRightHand], {
                injuriesAdded: [crushedRightHand],
                injuriesRemoved: [crushedRightHand],
            }),
        ).not.toThrow();
    });
});

describe('effects conversions', () => {
    it('round trips the effects between the draft and the engine (D-17)', () => {
        expect(
            participantEffectsOf(
                HERO_ID.toHexString(),
                effectsRecordOf(firstFight),
            ),
        ).toEqual(firstFight);
    });

    it('records the simulated companion life and reads it back (D-33)', () => {
        const fought = fightLeavingCompanionAt(35);

        expect(effectsRecordOf(fought).companionLifeAfter).toBe(35);
        expect(effectsRecordOf(firstFight).companionLifeAfter).toBeNull();
        expect(
            participantEffectsOf(
                HERO_ID.toHexString(),
                effectsRecordOf(fought),
            ),
        ).toEqual(fought);
        expect(
            participantEffectsOf(
                HERO_ID.toHexString(),
                effectsRecordOf(firstFight),
            ),
        ).not.toHaveProperty('companionLifeAfter');
    });

    it('keeps the removals in the saved effects and back (D-13)', () => {
        const corrected: ParticipantEffects = {
            ...firstFight,
            injuriesRemoved: [InjuryType.deepCut],
        };

        expect(effectsRecordOf(corrected).injuriesRemoved).toEqual([
            InjuryType.deepCut,
        ]);
        expect(
            participantEffectsOf(
                HERO_ID.toHexString(),
                effectsRecordOf(corrected),
            ),
        ).toEqual(corrected);
    });

    it('carries no removal key for effects without removals (D-13)', () => {
        const { injuriesRemoved, ...recordOfAnOlderDraft } = effectsRecordOf({
            ...firstFight,
            injuriesRemoved: [],
        });

        expect(injuriesRemoved).toBeUndefined();
        expect(effectsRecordOf(firstFight)).not.toHaveProperty(
            'injuriesRemoved',
        );
        expect(
            participantEffectsOf(HERO_ID.toHexString(), recordOfAnOlderDraft),
        ).toEqual(firstFight);
        expect(
            participantEffectsOf(HERO_ID.toHexString(), {
                ...recordOfAnOlderDraft,
                injuriesRemoved: [],
            }),
        ).not.toHaveProperty('injuriesRemoved');
    });
});
