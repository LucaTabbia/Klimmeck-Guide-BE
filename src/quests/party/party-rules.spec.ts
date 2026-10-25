import { Types } from 'mongoose';
import { QuestLane } from 'src/quests/acceptance/quest-lanes';
import {
    abandonClaimFilter,
    initialLaneDatesOf,
    isPartyExpired,
    PARTY_TIMEOUT_MS,
    partyClaimFilter,
    partyFormingSinceOf,
    type PartyMember,
    partyReadinessOf,
    partyTimeoutDueAt,
} from './party-rules';

const TEN = new Date('2026-10-25T10:00:00.000Z');
const TEN_THIRTY = new Date('2026-10-25T10:30:00.000Z');
const ELEVEN = new Date('2026-10-25T11:00:00.000Z');

function member(arrivedAt: Date | null): PartyMember {
    return {
        characterId: new Types.ObjectId(),
        pendingQuestId: new Types.ObjectId(),
        arrivedAt,
        waitingTime: 1_000,
    };
}

describe('party rules', () => {
    it('gives the party 24 hours to fill its seats', () => {
        expect(PARTY_TIMEOUT_MS).toBe(24 * 60 * 60 * 1000);
    });

    describe('partyReadinessOf', () => {
        it('waits while seats are still open', () => {
            expect(
                partyReadinessOf(3, [member(TEN), member(TEN_THIRTY)]),
            ).toEqual({ state: 'incomplete' });
        });

        it('waits while a member is still travelling', () => {
            expect(
                partyReadinessOf(3, [member(TEN), member(null), member(TEN)]),
            ).toEqual({ state: 'travelling' });
        });

        it('starts every member at the latest arrival', () => {
            expect(
                partyReadinessOf(3, [
                    member(TEN_THIRTY),
                    member(ELEVEN),
                    member(TEN),
                ]),
            ).toEqual({ state: 'ready', startDate: ELEVEN });
        });

        it('starts a single seat quest at the arrival', () => {
            expect(partyReadinessOf(1, [member(TEN)])).toEqual({
                state: 'ready',
                startDate: TEN,
            });
        });
    });

    describe('partyFormingSinceOf', () => {
        it('takes the oldest registration and ignores the missing ones', () => {
            expect(
                partyFormingSinceOf([
                    { registeredAt: TEN_THIRTY },
                    {},
                    { registeredAt: null },
                    { registeredAt: TEN },
                ]),
            ).toEqual(TEN);
        });

        it('is null without any registration time', () => {
            expect(partyFormingSinceOf([{}, { registeredAt: null }])).toBe(
                null,
            );
            expect(partyFormingSinceOf([])).toBe(null);
        });
    });

    describe('isPartyExpired', () => {
        it('expires exactly 24 hours after the first registration', () => {
            const now = new Date(TEN.getTime() + PARTY_TIMEOUT_MS);

            expect(isPartyExpired(TEN, now)).toBe(true);
            expect(isPartyExpired(TEN, new Date(now.getTime() - 1))).toBe(
                false,
            );
        });

        it('is due 24 hours after the first registration', () => {
            expect(partyTimeoutDueAt(TEN)).toEqual(
                new Date(TEN.getTime() + PARTY_TIMEOUT_MS),
            );
        });
    });

    describe('claim filters', () => {
        const questId = new Types.ObjectId();
        const pendingQuestId = new Types.ObjectId();

        it('claims the party by the identity of its members', () => {
            const ids = [new Types.ObjectId(), new Types.ObjectId()];

            expect(partyClaimFilter(questId, ids)).toEqual({
                _id: questId,
                concludedAt: null,
                startedAt: null,
                'registeredAdventurers.character': { $all: ids },
                registeredAdventurers: { $size: 2 },
            });
        });

        it('abandons only a pending quest waiting on the marker', () => {
            expect(abandonClaimFilter(pendingQuestId, questId)).toEqual({
                _id: pendingQuestId,
                quest: { $in: [questId, questId.toHexString()] },
                startDate: null,
                arrivedAt: { $ne: null },
            });
        });
    });

    describe('initialLaneDatesOf', () => {
        it('leaves a travelling standard quest without dates', () => {
            expect(
                initialLaneDatesOf(QuestLane.standard, { kind: 'travel' }, TEN),
            ).toEqual({ startDate: null, arrivedAt: null });
        });

        it('marks the arrival of a standard quest on the marker, not the start', () => {
            expect(initialLaneDatesOf(QuestLane.standard, null, TEN)).toEqual({
                startDate: null,
                arrivedAt: TEN,
            });
            expect(
                initialLaneDatesOf(QuestLane.standard, { kind: 'jump' }, TEN),
            ).toEqual({ startDate: null, arrivedAt: TEN });
        });

        it('starts story and world missions at the acceptance', () => {
            expect(initialLaneDatesOf(QuestLane.story, null, TEN)).toEqual({
                startDate: TEN,
                arrivedAt: TEN,
            });
            expect(
                initialLaneDatesOf(QuestLane.worldMission, null, TEN),
            ).toEqual({ startDate: TEN, arrivedAt: TEN });
        });
    });
});
