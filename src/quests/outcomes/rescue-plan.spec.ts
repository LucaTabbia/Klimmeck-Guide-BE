import { Types } from 'mongoose';
import { QuestOutcome } from 'src/models/enums/quest-outcome.enum';
import { QuestType } from 'src/models/enums/quest-type.enum';
import { TitleType } from 'src/models/enums/title-type.enum';
import { idForms } from 'src/mongo/document-id';
import {
    OutcomeCharacterSnapshot,
    OutcomeQuestSnapshot,
} from 'src/quests/outcomes/outcome-plan';
import { deathResultOf, planRescued } from 'src/quests/outcomes/rescue-plan';

const NOW = new Date('2026-10-24T10:00:00.000Z');
const INJURED_ID = new Types.ObjectId('64b0000000000000000000f1');
const AID_ID = new Types.ObjectId('64b0000000000000000000f2');
const FAILED_ID = new Types.ObjectId('64b0000000000000000000f3');
const USER_ID = new Types.ObjectId('64b0000000000000000000f4');
const RESULT_ID = new Types.ObjectId('64b0000000000000000000f5');
const CITY_MARKER_ID = new Types.ObjectId('64b0000000000000000000f6');

const injured: OutcomeCharacterSnapshot = {
    _id: INJURED_ID,
    status: {
        xp: 300,
        level: 2,
        title: TitleType.adventurer,
        currentLifePoints: 120,
        maxLifePoints: 1200,
        injuries: [],
        spells: [],
        awaitingAid: {
            quest: FAILED_ID,
            aidQuest: AID_ID,
            since: new Date('2026-10-20T10:00:00.000Z'),
        },
    },
    quests: { completedQuests: [] },
    assets: { ownedItems: [], ownedEquipments: [], activeSpells: [] },
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
    consumablesUsed: [],
    spellsUsed: [],
    rewards: { coins: { gold: 0, silver: 0, copper: 0 }, items: [] },
    xpGained: 0,
    xpBefore: 300,
    xpAfter: 300,
    levelBefore: 2,
    levelAfter: 2,
    titleBefore: TitleType.adventurer,
    titleAfter: TitleType.adventurer,
    spellLearned: null,
    enemy: null,
    rescuedCharacters: [],
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
});
