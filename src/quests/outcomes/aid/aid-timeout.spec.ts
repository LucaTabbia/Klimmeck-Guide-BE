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

    it('claims only an open rescue aid without registered rescuers', () => {
        expect(aidTimeoutClaimFilter(AID_ID)).toEqual({
            _id: AID_ID,
            concludedAt: null,
            'rescue.characters.0': { $exists: true },
            registeredAdventurers: { $size: 0 },
        });
    });

    it('keeps the rescue timeout suspended while a rescuer is registered (C5)', () => {
        expect(
            aidTimeoutSuspended({
                registeredAdventurers: [
                    { character: RESCUER_ID, title: 'rookie' },
                ],
            }),
        ).toBe(true);
        expect(aidTimeoutSuspended({ registeredAdventurers: [] })).toBe(false);
        expect(aidTimeoutSuspended({})).toBe(false);
    });
});
