import { Types } from 'mongoose';
import { QuestType } from 'src/models/enums/quest-type.enum';
import { resolutionKindOf } from './resolution-kind';

const RESCUE = {
    characters: [new Types.ObjectId(), new Types.ObjectId()],
    failedQuest: new Types.ObjectId(),
};

describe('resolutionKindOf', () => {
    it('resolves a boss as a group', () => {
        expect(resolutionKindOf({ infos: { type: QuestType.boss } })).toBe(
            'group',
        );
    });

    it('resolves an automatic aid through the rescue chain', () => {
        expect(
            resolutionKindOf({
                infos: { type: QuestType.aid },
                rescue: RESCUE,
            }),
        ).toBe('rescue');
    });

    it('resolves a hand-made aid without rescue individually', () => {
        expect(resolutionKindOf({ infos: { type: QuestType.aid } })).toBe(
            'individual',
        );
        expect(
            resolutionKindOf({ infos: { type: QuestType.aid }, rescue: null }),
        ).toBe('individual');
    });

    it('resolves an aid left without wounded individually', () => {
        expect(
            resolutionKindOf({
                infos: { type: QuestType.aid },
                rescue: { ...RESCUE, characters: [] },
            }),
        ).toBe('individual');
        expect(
            resolutionKindOf({
                infos: { type: QuestType.aid },
                rescue: { characters: [null, 'not-an-id'] },
            }),
        ).toBe('individual');
    });

    it('accepts a wounded saved as a hex string', () => {
        expect(
            resolutionKindOf({
                infos: { type: QuestType.aid },
                rescue: { characters: [RESCUE.characters[0].toHexString()] },
            }),
        ).toBe('rescue');
    });

    it('ignores a rescue reference on a quest that is not an aid', () => {
        expect(
            resolutionKindOf({
                infos: { type: QuestType.enemy },
                rescue: RESCUE,
            }),
        ).toBe('individual');
    });

    it.each([
        QuestType.enemy,
        QuestType.hunt,
        QuestType.dungeon,
        QuestType.job,
        QuestType.heal,
        QuestType.study,
    ])('resolves %s individually', (type) => {
        expect(resolutionKindOf({ infos: { type } })).toBe('individual');
    });
});
