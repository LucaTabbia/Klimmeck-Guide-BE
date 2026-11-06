import { Types } from 'mongoose';
import {
    ACTIVE_CHARACTER_FILTER,
    activeCharacterById,
} from 'src/models/character/active-character.filter';
import type { AmbushIdentity } from './ambush-job';
import {
    AMBUSH_ATTEMPT_UPDATE,
    ambushFilter,
    ambushSkipUpdate,
    DUE_AMBUSH_PROJECTION,
    dueAmbushesFilter,
} from './ambush.updates';

const CHARACTER_ID = new Types.ObjectId('64b0000000000000000000a1');
const START = new Date('2026-10-21T10:00:00.000Z');
const AT = new Date('2026-10-21T20:00:00.000Z');
const NOW = new Date('2026-10-21T20:05:00.000Z');

const identity: AmbushIdentity = {
    characterId: CHARACTER_ID,
    startTime: START,
    at: AT,
};

describe('ambush updates', () => {
    it('reaffirms the travel and the ambush identity, already due (D-05)', () => {
        expect(ambushFilter(identity, NOW)).toEqual({
            ...activeCharacterById(CHARACTER_ID),
            'status.activeTravel.startTime': START,
            'status.activeTravel.ambush.at': { $eq: AT, $lte: NOW },
        });
    });

    it('writes the next ambush or clears it (D-02, D-03)', () => {
        const next = new Date('2026-10-21T22:00:00.000Z');
        expect(ambushSkipUpdate({ at: next, km: 12 })).toEqual({
            $set: {
                'status.activeTravel.ambush': { at: next, km: 12, attempts: 0 },
            },
        });
        expect(ambushSkipUpdate(null)).toEqual({
            $set: { 'status.activeTravel.ambush': null },
        });
    });

    it('finds the ambushes already due (D-05)', () => {
        expect(dueAmbushesFilter(NOW)).toEqual({
            ...ACTIVE_CHARACTER_FILTER,
            'status.activeTravel.ambush.at': { $lte: NOW },
        });
    });

    it('counts one more failed attempt (D-18)', () => {
        expect(AMBUSH_ATTEMPT_UPDATE).toEqual({
            $inc: { 'status.activeTravel.ambush.attempts': 1 },
        });
    });

    it('projects the identity and the attempts of a due ambush (D-05, D-18)', () => {
        expect(Object.keys(DUE_AMBUSH_PROJECTION).sort()).toEqual([
            'status.activeTravel.ambush',
            'status.activeTravel.endTime',
            'status.activeTravel.startTime',
        ]);
    });
});
