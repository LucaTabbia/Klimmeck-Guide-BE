import { QuestOutcome } from 'src/models/enums/quest-outcome.enum';
import { QuestType } from 'src/models/enums/quest-type.enum';
import {
    UNREWARDED_IDS,
    unrewardedBattle,
    unrewardedInput,
} from '../../../test/quests/unrewarded-plan-input';
import { planDefeatWithoutAid } from './defeat-without-aid';
import { planGuardDefeat } from './guard/guard-outcome';

const lostJob = () =>
    unrewardedInput(QuestType.job, {
        battle: unrewardedBattle(),
        enemies: {
            entries: [{ enemy: UNREWARDED_IDS.enemy, quantity: 2 }],
            xp: 80,
        },
    });

describe('planDefeatWithoutAid', () => {
    it('leaves the character at one life point without aid nor prize (D-19)', () => {
        const plan = planDefeatWithoutAid(lostJob());

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
            guardEncounter: false,
            hpBefore: 900,
            hpAfter: 1,
            injuriesAdded: ['deepCut'],
            consumablesUsed: [
                {
                    itemType: 'LootItem',
                    item: UNREWARDED_IDS.potion,
                    quantity: 1,
                },
            ],
            xpGained: 0,
            rewards: {
                coins: { gold: 0, silver: 0, copper: 0 },
                items: [],
                pet: null,
            },
            enemies: [{ enemy: UNREWARDED_IDS.enemy, quantity: 2 }],
        });
    });

    it('carries the same failure outcome as a lost guard encounter (D-19)', () => {
        const withoutAid = planDefeatWithoutAid(lostJob()).result;
        const guardDefeat = planGuardDefeat(lostJob()).result;

        expect(withoutAid.outcome).toEqual(guardDefeat.outcome);
        expect(withoutAid.outcome).toBe(QuestOutcome.failure);
        expect({ ...withoutAid, guardEncounter: true }).toEqual(guardDefeat);
    });

    it('leaves the turn counters null on a defeat without aid (D-19, D-21)', () => {
        const { result } = planDefeatWithoutAid(lostJob());

        expect({
            turnsTotal: result.turnsTotal,
            turnsCompleted: result.turnsCompleted,
            lastTurn: result.lastTurn,
            lastTurnKind: result.lastTurnKind,
        }).toEqual({
            turnsTotal: null,
            turnsCompleted: null,
            lastTurn: null,
            lastTurnKind: null,
        });
    });
});
