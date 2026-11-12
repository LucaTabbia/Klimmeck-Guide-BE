import { Types } from 'mongoose';
import { QuestType } from 'src/models/enums/quest-type.enum';
import {
    UNREWARDED_IDS,
    UNREWARDED_NOW,
    unrewardedBattle,
    unrewardedInput,
    unrewardedSnapshot,
} from '../../../test/quests/unrewarded-plan-input';
import { planUnrewarded, type UnrewardedConclusion } from './unrewarded-plan';

const ACTIVE_SPELL = new Types.ObjectId('64c0000000000000000000b1');
const IDLE_SPELL = new Types.ObjectId('64c0000000000000000000b2');
const RECOVERY_MS = 60_000;
const DUE = new Date(UNREWARDED_NOW.getTime() + RECOVERY_MS);

const conclusion: UnrewardedConclusion = {
    lifePointsAfter: (foughtLifePoints) => foughtLifePoints,
    extraSet: {},
    coinsDelta: 0,
    result: { arrested: false, coinsLost: null, guardEncounter: true },
};

const activeState = (usages: number, recoveries: Date[] = []) => ({
    spell: ACTIVE_SPELL,
    usages,
    recoveries,
    active: true,
});
const idleState = {
    spell: IDLE_SPELL,
    usages: 3,
    recoveries: [],
    active: false,
};

const fought = (
    spellStates: { spell: unknown; usages: number; recoveries: Date[] }[],
) =>
    planUnrewarded(
        unrewardedInput(QuestType.guard, {
            snapshot: unrewardedSnapshot({ spellStates }),
            battle: unrewardedBattle({
                spellsUsed: [
                    { spellId: IDLE_SPELL.toHexString(), usages: 1 },
                    { spellId: ACTIVE_SPELL.toHexString(), usages: 1 },
                ],
            }),
            spellRecoveryTimes: new Map([
                [ACTIVE_SPELL.toHexString(), RECOVERY_MS],
                [IDLE_SPELL.toHexString(), RECOVERY_MS],
            ]),
        }),
        conclusion,
    );

describe('unrewarded outcome plan', () => {
    it('spends only the active spell states (D-07)', () => {
        const plan = fought([idleState, activeState(2)]);

        expect(plan.update.$set['status.spellStates']).toEqual([
            idleState,
            activeState(1, [DUE]),
        ]);
        expect(plan.result.spellsUsed).toEqual([
            { spell: ACTIVE_SPELL, usages: 1 },
        ]);
        expect(plan.spellRecoveries).toEqual([
            {
                characterId: UNREWARDED_IDS.character.toHexString(),
                spellId: ACTIVE_SPELL.toHexString(),
                dueAt: DUE,
            },
        ]);
    });

    it('writes no other spell list than the spell states (D-07)', () => {
        const plan = fought([idleState, activeState(2)]);

        expect(Object.keys(plan.update.$set).sort()).toEqual([
            'assets.ownedEquipments',
            'assets.ownedItems',
            'quests.pendingQuest',
            'status.currentLifePoints',
            'status.injuries',
            'status.spellStates',
        ]);
    });

    it('writes no spell state when no active spell is spent (D-07)', () => {
        const plan = fought([idleState]);

        expect(Object.keys(plan.update.$set).sort()).toEqual([
            'assets.ownedEquipments',
            'assets.ownedItems',
            'quests.pendingQuest',
            'status.currentLifePoints',
            'status.injuries',
        ]);
        expect(plan.result.spellsUsed).toEqual([]);
        expect(plan.spellRecoveries).toEqual([]);
    });
});
