import { Types } from 'mongoose';
import { QuestOutcome } from 'src/models/enums/quest-outcome.enum';
import { QuestType } from 'src/models/enums/quest-type.enum';
import {
    questClaimFilter,
    questUpdateOf,
} from 'src/quests/outcomes/quest-outcome-plan';

const NOW = new Date('2026-10-24T10:00:00.000Z');
const QUEST_ID = new Types.ObjectId('64b000000000000000000101');
const WINNER_ID = new Types.ObjectId('64b000000000000000000102');
const LOSER_ID = new Types.ObjectId('64b000000000000000000103');
const OTHER_ID = new Types.ObjectId('64b000000000000000000104');

const won = (characterId: Types.ObjectId) => ({
    characterId,
    verdict: QuestOutcome.success,
});
const lost = (characterId: Types.ObjectId) => ({
    characterId,
    verdict: QuestOutcome.failure,
});

describe('questUpdateOf', () => {
    it.each([
        QuestType.hunt,
        QuestType.job,
        QuestType.heal,
        QuestType.study,
        QuestType.dungeon,
        QuestType.story,
    ])('leaves the unregistered %s quest on the board', (type) => {
        expect(
            questUpdateOf({ type, verdicts: [won(WINNER_ID)], now: NOW }),
        ).toBeNull();
        expect(
            questUpdateOf({ type, verdicts: [lost(LOSER_ID)], now: NOW }),
        ).toBeNull();
    });

    it('concludes a won enemy quest', () => {
        expect(
            questUpdateOf({
                type: QuestType.enemy,
                verdicts: [won(WINNER_ID)],
                now: NOW,
            }),
        ).toEqual({ $set: { concludedAt: NOW } });
    });

    it('frees the seat of a lost enemy quest', () => {
        expect(
            questUpdateOf({
                type: QuestType.enemy,
                verdicts: [lost(LOSER_ID)],
                now: NOW,
            }),
        ).toEqual({
            $pull: {
                registeredAdventurers: { character: { $in: [LOSER_ID] } },
            },
        });
    });

    it('concludes a boss with one winner and frees the losers', () => {
        expect(
            questUpdateOf({
                type: QuestType.boss,
                verdicts: [won(WINNER_ID), lost(LOSER_ID)],
                now: NOW,
            }),
        ).toEqual({
            $pull: {
                registeredAdventurers: { character: { $in: [LOSER_ID] } },
            },
            $set: { concludedAt: NOW },
        });
    });

    it('drops incoherent registrants together with the losers (Pitfall 8)', () => {
        expect(
            questUpdateOf({
                type: QuestType.boss,
                verdicts: [won(WINNER_ID), lost(LOSER_ID)],
                dropped: [OTHER_ID],
                now: NOW,
            }),
        ).toEqual({
            $pull: {
                registeredAdventurers: {
                    character: { $in: [LOSER_ID, OTHER_ID] },
                },
            },
            $set: { concludedAt: NOW },
        });
    });

    it('drops incoherent registrants of a boss won by everyone', () => {
        expect(
            questUpdateOf({
                type: QuestType.boss,
                verdicts: [won(WINNER_ID)],
                dropped: [OTHER_ID],
                now: NOW,
            }),
        ).toEqual({
            $pull: {
                registeredAdventurers: { character: { $in: [OTHER_ID] } },
            },
            $set: { concludedAt: NOW },
        });
    });

    it('keeps a boss lost by everyone on the board', () => {
        expect(
            questUpdateOf({
                type: QuestType.boss,
                verdicts: [lost(LOSER_ID), lost(OTHER_ID)],
                now: NOW,
            }),
        ).toEqual({
            $pull: {
                registeredAdventurers: {
                    character: { $in: [LOSER_ID, OTHER_ID] },
                },
            },
        });
    });

    it('always concludes a lost aid', () => {
        expect(
            questUpdateOf({
                type: QuestType.aid,
                verdicts: [lost(LOSER_ID)],
                now: NOW,
            }),
        ).toEqual({
            $pull: {
                registeredAdventurers: { character: { $in: [LOSER_ID] } },
            },
            $set: { concludedAt: NOW },
        });
    });

    it('concludes a won aid', () => {
        expect(
            questUpdateOf({
                type: QuestType.aid,
                verdicts: [won(WINNER_ID)],
                now: NOW,
            }),
        ).toEqual({ $set: { concludedAt: NOW } });
    });

    it('concludes a world mission completed by the game master', () => {
        const gmCompleted = (characterId: Types.ObjectId) => ({
            characterId,
            verdict: QuestOutcome.gmCompleted,
        });

        expect(
            questUpdateOf({
                type: QuestType.worldMission,
                verdicts: [
                    gmCompleted(WINNER_ID),
                    gmCompleted(LOSER_ID),
                    gmCompleted(OTHER_ID),
                ],
                now: NOW,
            }),
        ).toEqual({ $set: { concludedAt: NOW } });
    });
});

describe('questClaimFilter', () => {
    it('claims an open quest still holding the whole group', () => {
        expect(questClaimFilter(QUEST_ID, [WINNER_ID, LOSER_ID])).toEqual({
            _id: QUEST_ID,
            concludedAt: null,
            'registeredAdventurers.character': { $all: [WINNER_ID, LOSER_ID] },
        });
    });

    it('claims an open quest without registration', () => {
        expect(questClaimFilter(QUEST_ID, null)).toEqual({
            _id: QUEST_ID,
            concludedAt: null,
        });
    });
});
