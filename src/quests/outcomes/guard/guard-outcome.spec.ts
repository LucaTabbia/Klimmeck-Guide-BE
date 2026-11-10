import { Types } from 'mongoose';
import { InjuryType } from 'src/models/enums/injury-type.enum';
import { QuestOutcome } from 'src/models/enums/quest-outcome.enum';
import { QuestType } from 'src/models/enums/quest-type.enum';
import {
    UNREWARDED_IDS,
    unrewardedBattle,
    unrewardedInput,
    unrewardedSnapshot,
} from '../../../../test/quests/unrewarded-plan-input';
import {
    doubledCoinPrizes,
    encounterCatalogOf,
    foughtSnapshotOf,
    mergedEffects,
    planGuardDefeat,
} from './guard-outcome';

const SPELL_A = new Types.ObjectId('64c0000000000000000000b1');
const SPELL_B = new Types.ObjectId('64c0000000000000000000b2');
const OTHER_ENEMY = new Types.ObjectId('64c0000000000000000000b3');

describe('guard outcome (quick 261110-cgd)', () => {
    it('leaves a defeated guard at one life point in the city without aid nor prize (quick 261110-cgd)', () => {
        const plan = planGuardDefeat(
            unrewardedInput(QuestType.guard, {
                battle: unrewardedBattle(),
                enemies: {
                    entries: [{ enemy: UNREWARDED_IDS.enemy, quantity: 2 }],
                    xp: 80,
                },
            }),
        );

        expect(plan.coinsDelta).toBe(0);
        expect(plan.update.$set).toEqual({
            'status.currentLifePoints': 1,
            'status.injuries': ['sprain', 'deepCut'],
            'assets.ownedItems': [
                {
                    itemType: 'LootItem',
                    item: UNREWARDED_IDS.potion,
                    quantity: 1,
                },
            ],
            'assets.ownedEquipments': [],
            'quests.pendingQuest': null,
        });
        expect(plan.result).toMatchObject({
            outcome: QuestOutcome.failure,
            arrested: false,
            coinsLost: null,
            guardEncounter: true,
            hpBefore: 900,
            hpAfter: 1,
            injuriesAdded: ['deepCut'],
            xpGained: 0,
            enemies: [{ enemy: UNREWARDED_IDS.enemy, quantity: 2 }],
            rewards: {
                coins: { gold: 0, silver: 0, copper: 0 },
                items: [],
                pet: null,
            },
        });
    });

    it('doubles every coin of the quest prize (quick 261110-cgd)', () => {
        const quest = {
            _id: UNREWARDED_IDS.quest,
            infos: { type: QuestType.guard, title: 'Ronda' },
            prizes: {
                prizeCoins: { gold: 1, silver: 60, copper: 75 },
                xpPrize: 40,
            },
        };

        expect(doubledCoinPrizes(quest)).toEqual({
            ...quest,
            prizes: {
                prizeCoins: { gold: 3, silver: 21, copper: 50 },
                xpPrize: 40,
            },
        });
        expect(quest.prizes.prizeCoins).toEqual({
            gold: 1,
            silver: 60,
            copper: 75,
        });
    });

    it('leaves a quest without prizes untouched (quick 261110-cgd)', () => {
        const quest = {
            _id: UNREWARDED_IDS.quest,
            infos: { type: QuestType.guard, title: 'Ronda' },
        };

        expect(doubledCoinPrizes(quest)).toEqual(quest);
    });

    it('enters the encounter with the life and the wounds left by the quest fight (quick 261110-cgd)', () => {
        const snapshot = unrewardedSnapshot();

        expect(foughtSnapshotOf(snapshot, unrewardedBattle()).status).toEqual({
            ...snapshot.status,
            currentLifePoints: 400,
            injuries: [InjuryType.sprain, InjuryType.deepCut],
        });
        expect(foughtSnapshotOf(snapshot, null)).toBe(snapshot);
    });

    it('sums the effects of the quest fight and of the encounter (quick 261110-cgd)', () => {
        const first = unrewardedBattle({
            spellsUsed: [{ spellId: SPELL_A.toHexString(), usages: 1 }],
        });
        const second = unrewardedBattle({
            hpAfter: 150,
            injuriesAdded: [InjuryType.infection],
            spellsUsed: [{ spellId: SPELL_B.toHexString(), usages: 1 }],
        });

        expect(mergedEffects(first, second)).toEqual({
            characterId: UNREWARDED_IDS.character.toHexString(),
            hpAfter: 150,
            injuriesAdded: [InjuryType.deepCut, InjuryType.infection],
            consumablesUsed: [
                ...first.consumablesUsed,
                ...second.consumablesUsed,
            ],
            spellsUsed: [...first.spellsUsed, ...second.spellsUsed],
        });
        expect(mergedEffects(null, second)).toBe(second);
    });

    it('merges the enemies of the quest and of the encounter for xp and knowledge (quick 261110-cgd)', () => {
        const questEnemy = {
            snapshot: { _id: UNREWARDED_IDS.enemy, xp: 10 },
            quantity: 1,
        };
        const encounterEnemy = {
            snapshot: { _id: OTHER_ENEMY, xp: 6 },
            quantity: 2,
        };
        const questCatalog = {
            enemies: [questEnemy],
            rewards: { marker: 'quest' },
            equipment: new Map([['q', {}]]),
            spells: new Map(),
            loot: new Map(),
            recoveryTimes: new Map([['a', 1]]),
            spellMaxUsages: new Map([['a', 3]]),
        };
        const encounterCatalog = {
            enemies: [encounterEnemy],
            equipment: new Map([['e', {}]]),
            spells: new Map([['s', {}]]),
            loot: new Map([['l', {}]]),
            recoveryTimes: new Map([['b', 2]]),
            spellMaxUsages: new Map([['a', 3]]),
        };

        const merged = encounterCatalogOf(
            questCatalog as never,
            encounterCatalog as never,
        );

        expect(merged.enemies).toEqual([questEnemy, encounterEnemy]);
        expect(merged.rewards).toBe(questCatalog.rewards);
        expect(merged.equipment).toBe(encounterCatalog.equipment);
        expect(merged.spells).toBe(encounterCatalog.spells);
        expect(merged.loot).toBe(encounterCatalog.loot);
        expect([...merged.recoveryTimes.entries()]).toEqual([
            ['a', 1],
            ['b', 2],
        ]);
    });
});
