import { Types } from 'mongoose';
import { GameRuleErrorCode } from 'src/gameRules/game-rule-error-code.enum';
import { InjuryType } from 'src/models/enums/injury-type.enum';
import { TitleType } from 'src/models/enums/title-type.enum';
import type { ParticipantEffects } from 'src/quests/outcomes/combat/combat-resolver';
import type { ResolutionCharacter } from 'src/quests/outcomes/resolution-loader.service';
import {
    assertAddsOnlyNewInjuries,
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

const firstFight: ParticipantEffects = {
    characterId: HERO_ID.toHexString(),
    hpAfter: 600,
    injuriesAdded: [InjuryType.crushedRightHand],
    consumablesUsed: [{ itemId: POTION_ID.toHexString(), quantity: 1 }],
    spellsUsed: [{ spellId: ACTIVE_SPELL_ID.toHexString(), usages: 2 }],
};

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
        expect(stateBeforeFight(heroSnapshot(), [])).toEqual(heroSnapshot());
    });

    it('starts a fight from the corrected state of the previous one (D-02)', () => {
        const snapshot = heroSnapshot();

        expect(stateBeforeFight(snapshot, [firstFight])).toEqual({
            ...snapshot,
            status: {
                ...snapshot.status,
                currentLifePoints: 600,
                injuries: [InjuryType.crushedRightHand],
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

        stateBeforeFight(snapshot, [firstFight, firstFight]);

        expect(snapshot).toEqual(heroSnapshot());
    });
});

describe('fightStartOf', () => {
    it('serves the bounds at the start of a fight (D-06, D-17)', () => {
        const state = stateBeforeFight(heroSnapshot(), [firstFight]);

        expect(fightStartOf(state)).toEqual({
            hpBefore: 600,
            injuriesBefore: [InjuryType.crushedRightHand],
            consumablesAvailable: [
                { item: HERB_ID, quantity: 1 },
                { item: POTION_ID, quantity: 2 },
            ],
            spellsAvailable: [{ spell: ACTIVE_SPELL_ID, usages: 3 }],
        });
    });
});

describe('assertAddsOnlyNewInjuries', () => {
    it('refuses a correction that adds an injury the character already had (D-14)', () => {
        expect(
            codeOf(() =>
                assertAddsOnlyNewInjuries(
                    [InjuryType.crushedRightHand],
                    [InjuryType.crushedRightHand],
                ),
            ),
        ).toBe(GameRuleErrorCode.OUTCOME_OVERRIDE_INVALID);
        expect(() =>
            assertAddsOnlyNewInjuries(
                [InjuryType.crushedRightHand],
                [InjuryType.brokenLeftLeg],
            ),
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
});
