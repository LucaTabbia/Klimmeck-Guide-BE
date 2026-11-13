import { Types } from 'mongoose';
import { DungeonTurnKind } from 'src/models/enums/dungeon-turn-kind.enum';
import { QuestOutcome } from 'src/models/enums/quest-outcome.enum';
import { QuestType } from 'src/models/enums/quest-type.enum';
import { TitleType } from 'src/models/enums/title-type.enum';
import { idForms } from 'src/mongo/document-id';
import {
    OutcomeCharacterSnapshot,
    OutcomeQuestSnapshot,
} from 'src/quests/outcomes/outcome-plan';
import { deathResultOf, planRescued } from 'src/quests/outcomes/rescue-plan';
import { NO_TURNS, turnsOf } from '../../../test/quests/dungeon-turns.fixture';

const NOW = new Date('2026-10-24T10:00:00.000Z');
const INJURED_ID = new Types.ObjectId('64b0000000000000000000f1');
const AID_ID = new Types.ObjectId('64b0000000000000000000f2');
const FAILED_ID = new Types.ObjectId('64b0000000000000000000f3');
const USER_ID = new Types.ObjectId('64b0000000000000000000f4');
const RESULT_ID = new Types.ObjectId('64b0000000000000000000f5');
const CITY_MARKER_ID = new Types.ObjectId('64b0000000000000000000f6');
const CITY_LORE_ID = new Types.ObjectId('64b0000000000000000000f7');
const REGION_LORE_ID = new Types.ObjectId('64b0000000000000000000f8');

const injured: OutcomeCharacterSnapshot = {
    _id: INJURED_ID,
    status: {
        xp: 300,
        level: 2,
        title: TitleType.adventurer,
        currentLifePoints: 120,
        maxLifePoints: 1200,
        injuries: [],
        awaitingAid: {
            quest: FAILED_ID,
            aidQuest: AID_ID,
            since: new Date('2026-10-20T10:00:00.000Z'),
        },
    },
    quests: { completedQuests: [] },
    assets: { ownedItems: [], ownedEquipments: [] },
};

const aidQuest: OutcomeQuestSnapshot = {
    _id: AID_ID,
    infos: { type: QuestType.aid, title: 'Soccorso: Il drago di Valantar' },
    requirements: { minTitle: TitleType.rookie },
};

const unchangedSheet = {
    _id: RESULT_ID,
    character: INJURED_ID,
    user: USER_ID,
    quest: {
        id: AID_ID,
        type: QuestType.aid,
        title: 'Soccorso: Il drago di Valantar',
    },
    resolvedAt: NOW,
    hpBefore: 120,
    hpAfter: 120,
    maxLifePoints: 1200,
    injuriesAdded: [],
    injuriesHealed: [],
    consumablesUsed: [],
    spellsUsed: [],
    rewards: {
        coins: { gold: 0, silver: 0, copper: 0 },
        items: [],
        pet: null,
    },
    xpGained: 0,
    petXpGained: 0,
    xpBefore: 300,
    xpAfter: 300,
    levelBefore: 2,
    levelAfter: 2,
    titleBefore: TitleType.adventurer,
    titleAfter: TitleType.adventurer,
    spellLearned: null,
    loreUnlocked: [],
    enemies: [],
    stagesCleared: null,
    stagesTotal: null,
    turnsTotal: null,
    turnsCompleted: null,
    lastTurn: null,
    lastTurnKind: null,
    rescuedCharacters: [],
    arrested: false,
    coinsLost: null,
    guardEncounter: false,
};

describe('planRescued', () => {
    const rescue = (cityMarker: Types.ObjectId | null) =>
        planRescued({
            resultId: RESULT_ID,
            snapshot: injured,
            aidQuest,
            userId: USER_ID,
            cityMarker,
            now: NOW,
        });

    it('frees only the character waiting for this aid', () => {
        expect(rescue(CITY_MARKER_ID).filter).toEqual({
            _id: INJURED_ID,
            deletedAt: null,
            'status.awaitingAid.aidQuest': { $in: idForms(AID_ID) },
        });
    });

    it('frees the injured and brings them back to the city marker', () => {
        expect(rescue(CITY_MARKER_ID).update).toEqual({
            $set: {
                'status.awaitingAid': null,
                'status.location': CITY_MARKER_ID,
            },
        });
    });

    it('leaves the position unchanged when no city holds the marker', () => {
        expect(rescue(null).update).toEqual({
            $set: { 'status.awaitingAid': null },
        });
    });

    it('adds the city geography to the rescued return (D-05)', () => {
        const geography = [CITY_LORE_ID, REGION_LORE_ID];
        const plan = planRescued({
            resultId: RESULT_ID,
            snapshot: injured,
            aidQuest,
            userId: USER_ID,
            cityMarker: CITY_MARKER_ID,
            geography,
            now: NOW,
        });

        expect(plan.update).toEqual({
            $set: {
                'status.awaitingAid': null,
                'status.location': CITY_MARKER_ID,
            },
            $addToSet: {
                'status.unlockedLore': { $each: geography },
            },
        });
        expect(plan.result.loreUnlocked).toEqual([]);
    });

    it('adds no geography when no city holds the marker (D-05)', () => {
        const plan = planRescued({
            resultId: RESULT_ID,
            snapshot: injured,
            aidQuest,
            userId: USER_ID,
            cityMarker: null,
            geography: [CITY_LORE_ID],
            now: NOW,
        });

        expect(plan.update).toEqual({ $set: { 'status.awaitingAid': null } });
    });

    it('drafts a rescued sheet without healing', () => {
        expect(rescue(CITY_MARKER_ID).result).toEqual({
            ...unchangedSheet,
            outcome: QuestOutcome.rescued,
        });
    });
});

describe('deathResultOf', () => {
    it('drafts a death sheet owned by the user, values unchanged', () => {
        expect(
            deathResultOf({
                resultId: RESULT_ID,
                snapshot: injured,
                quest: aidQuest,
                userId: USER_ID,
                now: NOW,
            }),
        ).toEqual({ ...unchangedSheet, outcome: QuestOutcome.death });
    });

    it('writes where the wounded fell on a death in a dungeon aid (D-21)', () => {
        expect(
            deathResultOf({
                resultId: RESULT_ID,
                snapshot: injured,
                quest: aidQuest,
                userId: USER_ID,
                now: NOW,
                turn: { index: 3, kind: DungeonTurnKind.fight, total: 8 },
            }),
        ).toEqual({
            ...unchangedSheet,
            outcome: QuestOutcome.death,
            turnsTotal: 8,
            turnsCompleted: 3,
            lastTurn: 4,
            lastTurnKind: DungeonTurnKind.fight,
        });
    });

    it('leaves the turns null on a death outside a dungeon aid (D-21)', () => {
        const sheet = deathResultOf({
            resultId: RESULT_ID,
            snapshot: injured,
            quest: aidQuest,
            userId: USER_ID,
            now: NOW,
            turn: null,
        });

        expect(turnsOf(sheet)).toEqual(NO_TURNS);
    });
});

describe('planRescued in a dungeon aid', () => {
    it('leaves the turns null on a rescued wounded (D-21)', () => {
        const dungeonAid = {
            ...aidQuest,
            rescue: {
                turn: { index: 4, kind: DungeonTurnKind.exploration, total: 8 },
            },
        };

        const plan = planRescued({
            resultId: RESULT_ID,
            snapshot: injured,
            aidQuest: dungeonAid,
            userId: USER_ID,
            cityMarker: CITY_MARKER_ID,
            now: NOW,
        });

        expect(turnsOf(plan.result)).toEqual(NO_TURNS);
    });
});
