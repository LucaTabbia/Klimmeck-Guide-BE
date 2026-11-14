import { Types } from 'mongoose';
import { InjuryType } from 'src/models/enums/injury-type.enum';
import type { Enemy } from 'src/models/enemy.model';
import { toMissionDraftWire } from './mission-draft.mapper';
import {
    MissionDraftRecord,
    MissionDraftStep,
    MissionFightRecord,
    MissionFightVerdict,
} from './mission-draft.model';

const DRAFT_ID = new Types.ObjectId();
const QUEST_ID = new Types.ObjectId();
const HERO_ID = new Types.ObjectId();
const PENDING_ID = new Types.ObjectId();
const WOLF_ID = new Types.ObjectId();
const BEAR_ID = new Types.ObjectId();
const GHOST_ID = new Types.ObjectId();
const POTION_ID = new Types.ObjectId();
const SWORD_ID = new Types.ObjectId();
const SPELL_ID = new Types.ObjectId();
const PET_ID = new Types.ObjectId();
const STARTED_AT = new Date('2026-11-14T10:00:00.000Z');
const UPDATED_AT = new Date('2026-11-14T10:05:00.000Z');

const WOLF = { id: WOLF_ID.toHexString(), name: 'Lupo' } as Enemy;
const BEAR = { id: BEAR_ID.toHexString(), name: 'Orso' } as Enemy;

const BESTIARY: ReadonlyMap<string, Enemy> = new Map([
    [WOLF_ID.toHexString(), WOLF],
    [BEAR_ID.toHexString(), BEAR],
]);

function simulatedFight(): MissionFightRecord {
    return {
        enemies: [{ enemy: WOLF_ID, quantity: 2 }],
        verdict: MissionFightVerdict.success,
        outcomes: [
            {
                character: HERO_ID,
                hpBefore: 30,
                injuriesBefore: [InjuryType.blackEye],
                consumablesAvailable: [{ item: POTION_ID, quantity: 3 }],
                spellsAvailable: [{ spell: SPELL_ID, usages: 2 }],
                simulated: {
                    hpAfter: 18,
                    injuriesAdded: [InjuryType.headConcussion],
                    consumablesUsed: [{ item: POTION_ID, quantity: 1 }],
                    spellsUsed: [{ spell: SPELL_ID, usages: 1 }],
                },
                corrected: null,
            },
        ],
    };
}

function draftWith(fights: MissionFightRecord[]): MissionDraftRecord {
    return {
        _id: DRAFT_ID,
        quest: QUEST_ID,
        questType: 'story',
        participants: [
            {
                character: HERO_ID,
                pendingQuest: PENDING_ID,
                name: 'Eroe',
                title: 'rookie',
                maxLifePoints: 40,
            },
        ],
        step: MissionDraftStep.fights,
        place: null,
        fights,
        prizes: [
            {
                character: HERO_ID,
                coins: { gold: 1, silver: 2, copper: 3 },
                xp: 120,
                items: [
                    {
                        itemType: 'LootItem',
                        item: POTION_ID,
                        quantity: 2,
                    },
                    {
                        itemType: 'EquipmentItem',
                        item: SWORD_ID,
                        quantity: 1,
                    },
                ],
                pet: PET_ID,
                spell: null,
                cure: { lifePointsShare: 0.5, canHeal: [InjuryType.blackEye] },
            },
        ],
        startedBy: null,
        startedAt: STARTED_AT,
        updatedAt: UPDATED_AT,
        rev: 3,
    };
}

describe('toMissionDraftWire', () => {
    it('maps a draft record to the wire with hex ids (D-17)', () => {
        expect(
            toMissionDraftWire(draftWith([simulatedFight()]), BESTIARY),
        ).toEqual({
            id: DRAFT_ID.toHexString(),
            quest: QUEST_ID.toHexString(),
            questType: 'story',
            step: MissionDraftStep.fights,
            place: null,
            participants: [
                {
                    character: HERO_ID.toHexString(),
                    pendingQuest: PENDING_ID.toHexString(),
                    name: 'Eroe',
                    title: 'rookie',
                    maxLifePoints: 40,
                },
            ],
            fights: [
                {
                    enemies: [{ enemy: WOLF, quantity: 2 }],
                    verdict: 'success',
                    outcomes: [
                        {
                            character: HERO_ID.toHexString(),
                            hpBefore: 30,
                            injuriesBefore: [InjuryType.blackEye],
                            consumablesAvailable: [
                                { item: POTION_ID.toHexString(), quantity: 3 },
                            ],
                            spellsAvailable: [
                                { spell: SPELL_ID.toHexString(), usages: 2 },
                            ],
                            simulated: {
                                hpAfter: 18,
                                injuriesAdded: [InjuryType.headConcussion],
                                consumablesUsed: [
                                    {
                                        item: POTION_ID.toHexString(),
                                        quantity: 1,
                                    },
                                ],
                                spellsUsed: [
                                    {
                                        spell: SPELL_ID.toHexString(),
                                        usages: 1,
                                    },
                                ],
                            },
                            corrected: null,
                        },
                    ],
                },
            ],
            prizes: [
                {
                    character: HERO_ID.toHexString(),
                    coins: { gold: 1, silver: 2, copper: 3 },
                    xp: 120,
                    items: [
                        { item: POTION_ID.toHexString(), quantity: 2 },
                        { item: SWORD_ID.toHexString(), quantity: 1 },
                    ],
                    pet: PET_ID.toHexString(),
                    spell: null,
                    cure: {
                        lifePointsShare: 0.5,
                        canHeal: [InjuryType.blackEye],
                    },
                },
            ],
            startedAt: STARTED_AT,
            updatedAt: UPDATED_AT,
        });
    });

    it('drops a fight enemy missing from the bestiary (D-17)', () => {
        const fight: MissionFightRecord = {
            ...simulatedFight(),
            enemies: [
                { enemy: WOLF_ID, quantity: 2 },
                { enemy: GHOST_ID, quantity: 1 },
                { enemy: BEAR_ID, quantity: 1 },
            ],
        };

        const wire = toMissionDraftWire(draftWith([fight]), BESTIARY);

        expect(wire.fights[0].enemies).toEqual([
            { enemy: WOLF, quantity: 2 },
            { enemy: BEAR, quantity: 1 },
        ]);
    });

    it('serves an unsimulated fight with no outcomes (D-18)', () => {
        const fight: MissionFightRecord = {
            enemies: [{ enemy: BEAR_ID, quantity: 1 }],
            verdict: null,
            outcomes: [],
        };

        const wire = toMissionDraftWire(draftWith([fight]), BESTIARY);

        expect(wire.fights).toEqual([
            {
                enemies: [{ enemy: BEAR, quantity: 1 }],
                verdict: null,
                outcomes: [],
            },
        ]);
    });

    it('serves the prize items without their item type (D-17)', () => {
        const wire = toMissionDraftWire(draftWith([]), BESTIARY);

        expect(Object.keys(wire.prizes[0].items[0]).sort()).toEqual([
            'item',
            'quantity',
        ]);
    });
});
