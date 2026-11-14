import { Types } from 'mongoose';
import { MissionLockReader } from 'src/characters/mission-lock/mission-lock.reader';
import { CharacterStatus } from 'src/models/character/character-status.model';
import { TitleType } from 'src/models/enums/title-type.enum';
import { CharacterStatusResolver } from './character-status.resolver';

const SLOTS_BY_XP_AND_TITLE: Array<[number, TitleType, number]> = [
    [40000, TitleType.rookie, 0],
    [20000, TitleType.mage, 1],
    [40000, TitleType.legend, 4],
];

function statusOf(fields: Partial<CharacterStatus>): CharacterStatus {
    return fields as CharacterStatus;
}

const STARTED = new Date('2026-11-14T10:00:00.000Z');

// il sottodocumento idratato raggiunge il personaggio con $parent(): qui un finto che restituisce il genitore dato
function statusWithParent(parent: object): CharacterStatus {
    return { xp: 0, $parent: () => parent } as unknown as CharacterStatus;
}

describe('CharacterStatusResolver', () => {
    const missionLock = {
        isLocked: jest.fn(),
        isGuidedLocked: jest.fn(),
    };
    const resolver = new CharacterStatusResolver(
        missionLock as unknown as MissionLockReader,
    );

    beforeEach(() => {
        missionLock.isLocked.mockReset();
        missionLock.isGuidedLocked.mockReset();
    });

    it.each(SLOTS_BY_XP_AND_TITLE)(
        'resolves the active spell slots of %i xp as %s to %i (D-08)',
        (xp, title, slots) => {
            expect(resolver.maxActiveSpells(statusOf({ xp, title }))).toBe(
                slots,
            );
        },
    );

    it('reads a status without xp as 0 xp (D-08)', () => {
        expect(
            resolver.maxActiveSpells(statusOf({ title: TitleType.legend })),
        ).toBe(0);
    });

    it('resolves both flags from populated lanes without reading (D-16)', async () => {
        const status = statusWithParent({
            _id: new Types.ObjectId(),
            quests: {
                pendingQuest: { startDate: STARTED },
                activeStoryQuest: null,
                activeWorldMissionQuest: null,
            },
        });

        await expect(resolver.missionInProgress(status)).resolves.toBe(true);
        await expect(resolver.guidedMissionInProgress(status)).resolves.toBe(
            false,
        );
        expect(missionLock.isLocked).not.toHaveBeenCalled();
        expect(missionLock.isGuidedLocked).not.toHaveBeenCalled();
    });

    it('resolves the guided flag from a draft marker (D-16)', async () => {
        const status = statusWithParent({
            _id: new Types.ObjectId(),
            quests: {
                pendingQuest: null,
                activeWorldMissionQuest: {
                    startDate: STARTED,
                    missionDraftStartedAt: STARTED,
                },
            },
        });

        await expect(resolver.missionInProgress(status)).resolves.toBe(true);
        await expect(resolver.guidedMissionInProgress(status)).resolves.toBe(
            true,
        );
        expect(missionLock.isLocked).not.toHaveBeenCalled();
    });

    it('asks the reader for lanes stored as ids (D-16)', async () => {
        const characterId = new Types.ObjectId();
        const status = statusWithParent({
            _id: characterId,
            quests: { activeStoryQuest: new Types.ObjectId() },
        });
        missionLock.isLocked.mockResolvedValue(true);
        missionLock.isGuidedLocked.mockResolvedValue(false);

        await expect(resolver.missionInProgress(status)).resolves.toBe(true);
        await expect(resolver.guidedMissionInProgress(status)).resolves.toBe(
            false,
        );
        expect(missionLock.isLocked.mock.calls).toEqual([[characterId]]);
        expect(missionLock.isGuidedLocked.mock.calls).toEqual([[characterId]]);
    });

    it('answers false for a plain status without parent (D-16)', async () => {
        const status = statusOf({ xp: 0 });

        await expect(resolver.missionInProgress(status)).resolves.toBe(false);
        await expect(resolver.guidedMissionInProgress(status)).resolves.toBe(
            false,
        );
        expect(missionLock.isLocked).not.toHaveBeenCalled();
    });
});
