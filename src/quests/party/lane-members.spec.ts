import { Types } from 'mongoose';
import type { LaneModels } from './lane-members';
import { seatHolderLaneMembersOf } from './lane-members';

const PROJECTIONS = {
    character: { _id: 1, quests: 1 } as Record<string, 1>,
    pendingQuest: { _id: 1 } as Record<string, 1>,
};

interface FakeCharacter {
    _id: Types.ObjectId;
    quests: { pendingQuest: Types.ObjectId };
}

function queryReturning(documents: unknown[]): jest.Mock {
    return jest
        .fn()
        .mockReturnValue({ lean: () => ({ exec: async () => documents }) });
}

describe('seatHolderLaneMembersOf', () => {
    it('reads archived seat holders with their lane and drops a registration without one (D-21)', async () => {
        const questId = new Types.ObjectId();
        const lane = new Types.ObjectId();
        const archived: FakeCharacter = {
            _id: new Types.ObjectId(),
            quests: { pendingQuest: lane },
        };
        const withoutLane = new Types.ObjectId();
        const findCharacters = queryReturning([archived]);
        const findPendingQuests = queryReturning([{ _id: lane }]);
        const models = {
            characters: { find: findCharacters },
            pendingQuests: { find: findPendingQuests },
        } as unknown as LaneModels;

        const { members, dropped } = await seatHolderLaneMembersOf(
            models,
            questId,
            [archived._id, withoutLane],
            PROJECTIONS,
        );

        expect(members).toEqual([
            { character: archived, pendingQuest: { _id: lane } },
        ]);
        expect(dropped).toEqual([withoutLane]);
        const [characterFilter] = findCharacters.mock.calls[0] as [
            Record<string, unknown>,
        ];
        expect(Object.keys(characterFilter)).toEqual([
            '_id',
            'quests.pendingQuest',
        ]);
    });

    it('reads nothing without seat holders (D-21)', async () => {
        const findCharacters = queryReturning([]);
        const models = {
            characters: { find: findCharacters },
            pendingQuests: { find: queryReturning([]) },
        } as unknown as LaneModels;

        await expect(
            seatHolderLaneMembersOf(
                models,
                new Types.ObjectId(),
                [],
                PROJECTIONS,
            ),
        ).resolves.toEqual({ members: [], dropped: [] });
        expect(findCharacters.mock.calls).toEqual([]);
    });
});
