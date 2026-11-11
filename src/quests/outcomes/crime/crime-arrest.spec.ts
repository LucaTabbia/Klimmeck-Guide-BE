import { QuestOutcome } from 'src/models/enums/quest-outcome.enum';
import { QuestType } from 'src/models/enums/quest-type.enum';
import { SequenceChance } from '../../../../test/quests/sequence-chance';
import {
    UNREWARDED_IDS,
    unrewardedBattle,
    unrewardedInput,
    unrewardedSnapshot,
} from '../../../../test/quests/unrewarded-plan-input';
import {
    arrestFineOf,
    CRIME_ARREST_CHANCE,
    CRIME_ARREST_COIN_LOSS_SHARE,
    planArrest,
    rollsArrest,
} from './crime-arrest';

const RELEASE = new Date('2026-11-10T22:00:00.000Z');

describe('crime arrest (quick 261110-cgd)', () => {
    it('rolls the arrest one time in five (quick 261110-cgd)', () => {
        expect(CRIME_ARREST_CHANCE).toBe(0.2);
        expect(rollsArrest(new SequenceChance([0.19]))).toBe(true);
        expect(rollsArrest(new SequenceChance([0.2]))).toBe(false);
    });

    it.each([
        [{ gold: 0, silver: 30, copper: 0 }, 750],
        [{ gold: 1, silver: 0, copper: 3 }, 2500],
        [{ gold: 0, silver: 0, copper: 3 }, 0],
        [{ gold: 0, silver: 0, copper: 0 }, 0],
        [null, 0],
    ])(
        'fines a purse of %p by a quarter rounded down: %p copper (quick 261110-cgd)',
        (coins, fine) => {
            expect(CRIME_ARREST_COIN_LOSS_SHARE).toBe(0.25);
            expect(arrestFineOf(coins)).toBe(fine);
        },
    );

    it('imprisons for ten hours, fines a quarter of the coins and gives no prize (quick 261110-cgd)', () => {
        const plan = planArrest(unrewardedInput(QuestType.crime));

        expect(plan.coinsDelta).toBe(-750);
        expect(plan.update.$set).toEqual({
            'status.currentLifePoints': 900,
            'status.injuries': ['sprain'],
            'status.imprisonedUntil': RELEASE,
            'assets.ownedItems': unrewardedSnapshot().assets?.ownedItems,
            'assets.ownedEquipments': [],
            'quests.pendingQuest': null,
        });
        expect(plan.update).not.toHaveProperty('$addToSet');
        expect(plan.spellRecoveries).toEqual([]);
        expect(plan.result).toMatchObject({
            outcome: QuestOutcome.failure,
            arrested: true,
            coinsLost: { gold: 0, silver: 7, copper: 50 },
            guardEncounter: false,
            hpBefore: 900,
            hpAfter: 900,
            xpGained: 0,
            xpBefore: 300,
            xpAfter: 300,
            levelBefore: 2,
            levelAfter: 2,
            rewards: {
                coins: { gold: 0, silver: 0, copper: 0 },
                items: [],
                pet: null,
            },
            spellLearned: null,
            loreUnlocked: [],
            injuriesHealed: [],
            rescuedCharacters: [],
        });
    });

    it('keeps the wounds and the consumables of a fought crime but no prize (quick 261110-cgd)', () => {
        const plan = planArrest(
            unrewardedInput(QuestType.crime, {
                battle: unrewardedBattle(),
                enemies: {
                    entries: [{ enemy: UNREWARDED_IDS.enemy, quantity: 1 }],
                    xp: 40,
                },
            }),
        );

        expect(plan.update.$set).toMatchObject({
            'status.currentLifePoints': 400,
            'status.injuries': ['sprain', 'deepCut'],
        });
        expect(plan.result).toMatchObject({
            hpAfter: 400,
            injuriesAdded: ['deepCut'],
            xpGained: 0,
            enemies: [{ enemy: UNREWARDED_IDS.enemy, quantity: 1 }],
            consumablesUsed: [
                {
                    itemType: 'LootItem',
                    item: UNREWARDED_IDS.potion,
                    quantity: 1,
                },
            ],
        });
    });

    it('fines nothing from an empty purse and still imprisons (quick 261110-cgd)', () => {
        const plan = planArrest(
            unrewardedInput(QuestType.crime, {
                snapshot: unrewardedSnapshot({
                    coins: { gold: 0, silver: 0, copper: 0 },
                }),
            }),
        );

        expect(plan.coinsDelta).toBe(0);
        expect(plan.result.coinsLost).toEqual({
            gold: 0,
            silver: 0,
            copper: 0,
        });
        expect(plan.update.$set['status.imprisonedUntil']).toEqual(RELEASE);
    });

    it('writes only on the snapshot lane and progression (quick 261110-cgd)', () => {
        const plan = planArrest(unrewardedInput(QuestType.crime));

        expect(plan.filter).toMatchObject({
            _id: UNREWARDED_IDS.character,
            'status.xp': 300,
        });
    });
});
