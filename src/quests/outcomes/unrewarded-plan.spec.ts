import { Types } from 'mongoose';
import { QuestType } from 'src/models/enums/quest-type.enum';
import { idForms } from 'src/mongo/document-id';
import {
    UNREWARDED_IDS,
    UNREWARDED_NOW,
    unrewardedBattle,
    unrewardedInput,
    unrewardedSnapshot,
} from '../../../test/quests/unrewarded-plan-input';
import { planUnrewarded, type UnrewardedConclusion } from './unrewarded-plan';

const COMPANION = new Types.ObjectId('64c0000000000000000000b3');
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

    it('writes the companion hurt or defeated in a defeat without a prize (D-03, Pitfall 8)', () => {
        const base = unrewardedSnapshot();
        const plan = planUnrewarded(
            unrewardedInput(QuestType.guard, {
                snapshot: {
                    ...base,
                    assets: {
                        ...base.assets,
                        pet: COMPANION,
                        ownedPets: [
                            {
                                pet: COMPANION,
                                xp: 5,
                                currentLifePoints: 40,
                                level: 1,
                            },
                        ],
                    },
                },
                battle: unrewardedBattle({ companionLifeAfter: 1 }),
                enemies: {
                    entries: [{ enemy: UNREWARDED_IDS.enemy, quantity: 2 }],
                    xp: 500,
                },
                petCatalog: new Map([
                    [
                        COMPANION.toHexString(),
                        {
                            name: 'Volpe',
                            maxLifePoints: 50,
                            maxXp: 100,
                            recoveryTime: RECOVERY_MS,
                        },
                    ],
                ]),
            }),
            conclusion,
        );

        expect(plan.update.$set['assets.pet']).toBeNull();
        expect(plan.update.$set['assets.ownedPets']).toEqual([
            {
                pet: COMPANION,
                xp: 5,
                currentLifePoints: 1,
                level: 1,
                lifeAsOf: UNREWARDED_NOW,
                defeatedUntil: DUE,
            },
        ]);
        expect(plan.filter['assets.pet']).toEqual({
            $in: idForms(COMPANION),
        });
        expect(plan.result.companion).toEqual({
            name: 'Volpe',
            lifeBefore: 40,
            lifePoints: 1,
            maxLifePoints: 50,
            defeated: true,
            fullLifeAt: DUE,
        });
        expect(plan.result.petXpGained).toBe(0);
    });
});
