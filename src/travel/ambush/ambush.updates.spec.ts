import { Types } from 'mongoose';
import { activeCharacterById } from 'src/models/character/active-character.filter';
import type { AmbushIdentity } from './ambush-job';
import { ambushFilter, ambushSkipUpdate } from './ambush.updates';

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
});
