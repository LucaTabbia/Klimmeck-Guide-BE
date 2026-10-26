import { Types } from 'mongoose';
import {
    AID_TIMEOUT_MS,
    aidTimeoutClaimFilter,
    aidTimeoutDueAt,
    aidTimeoutSuspended,
    isAidTimeoutDue,
} from 'src/quests/outcomes/aid/aid-timeout';

const AID_ID = new Types.ObjectId('64b0000000000000000000d1');
const RESCUER_ID = new Types.ObjectId('64b0000000000000000000d2');
const since = new Date('2026-10-01T12:00:00.000Z');

describe('rescue timeout', () => {
    it('lasts seven days', () => {
        expect(AID_TIMEOUT_MS).toBe(604_800_000);
    });

    it('falls due exactly seven days after the aid creation', () => {
        expect(aidTimeoutDueAt(since).getTime()).toBe(
            since.getTime() + AID_TIMEOUT_MS,
        );
        expect(
            isAidTimeoutDue(
                since,
                new Date(since.getTime() + AID_TIMEOUT_MS - 1),
            ),
        ).toBe(false);
        expect(
            isAidTimeoutDue(since, new Date(since.getTime() + AID_TIMEOUT_MS)),
        ).toBe(true);
    });

    it('claims only an open rescue aid that is not in progress', () => {
        expect(aidTimeoutClaimFilter(AID_ID)).toEqual({
            _id: AID_ID,
            concludedAt: null,
            'rescue.characters.0': { $exists: true },
            $or: [{ startedAt: null }, { registeredAdventurers: { $size: 0 } }],
        });
    });

    // C5 rivista (utente 2026-10-25): "Il timer si cancella solo a party completo."
    describe('aidTimeoutSuspended', () => {
        const seat = { character: RESCUER_ID, title: 'rookie' };

        it('suspends the timeout of a started rescue with rescuers', () => {
            expect(
                aidTimeoutSuspended({
                    startedAt: since,
                    registeredAdventurers: [seat],
                }),
            ).toBe(true);
        });

        it('does not suspend it for a rescuer waiting for the party', () => {
            expect(
                aidTimeoutSuspended({
                    startedAt: null,
                    registeredAdventurers: [seat],
                }),
            ).toBe(false);
        });

        it('does not suspend it for a started rescue emptied by the archive', () => {
            expect(
                aidTimeoutSuspended({
                    startedAt: since,
                    registeredAdventurers: [],
                }),
            ).toBe(false);
            expect(aidTimeoutSuspended({})).toBe(false);
        });
    });
});
