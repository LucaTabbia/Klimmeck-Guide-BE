import { Types } from 'mongoose';
import {
    fightersOf,
    GroupRoster,
    GroupSeat,
    incoherentOf,
    SeatHolder,
    seatHolderIdsOf,
} from './group-roster';
import type { ResolutionCharacter } from './resolution-loader.service';

function characterOf(id = new Types.ObjectId()): ResolutionCharacter {
    return { _id: id } as ResolutionCharacter;
}

function seatOf(character = characterOf()): GroupSeat {
    return {
        character,
        pendingQuestId: new Types.ObjectId(),
        ownerId: new Types.ObjectId(),
        resultId: new Types.ObjectId(),
    };
}

function seatHolderOf(character = characterOf()): SeatHolder {
    return { character, pendingQuestId: new Types.ObjectId() };
}

function rosterOf(overrides: Partial<GroupRoster>): GroupRoster {
    return {
        seats: [],
        seatHolders: [],
        dropped: [],
        waiting: false,
        ...overrides,
    };
}

describe('group roster', () => {
    it('lists as seat holder candidates only the archived registrations with a readable character (D-21)', () => {
        const archived = new Types.ObjectId();
        const archivedAsHex = new Types.ObjectId();
        const archivedAt = new Date('2026-10-30T10:00:00Z');

        const ids = seatHolderIdsOf([
            { character: archived, archivedAt },
            { character: archivedAsHex.toHexString(), archivedAt },
            { archivedAt },
            { character: 'not-an-id', archivedAt },
            { character: new Types.ObjectId(), archivedAt: null },
            { character: new Types.ObjectId() },
        ]);

        expect(ids.map(String)).toEqual([
            archived.toHexString(),
            archivedAsHex.toHexString(),
        ]);
        expect(seatHolderIdsOf(undefined)).toEqual([]);
    });

    it('reports as incoherent the dropped registrations that are not seat holders (D-21)', () => {
        const holder = characterOf();
        const stray = new Types.ObjectId();

        const incoherent = incoherentOf(
            rosterOf({
                seatHolders: [seatHolderOf(holder)],
                dropped: [holder._id, stray],
            }),
        );

        expect(incoherent).toEqual([stray]);
    });

    it('lines up the fighters as live seats first, then seat holders, in roster order (D-21)', () => {
        const first = characterOf();
        const second = characterOf();
        const holder = characterOf();

        const fighters = fightersOf(
            rosterOf({
                seats: [seatOf(first), seatOf(second)],
                seatHolders: [seatHolderOf(holder)],
            }),
        );

        expect(fighters).toEqual([first, second, holder]);
    });
});
