import { Types } from 'mongoose';
import { QuestType } from 'src/models/enums/quest-type.enum';
import { awaitsRescue, openAidsFilter } from './rescue-lock';

const SOURCE = new Types.ObjectId();
const OTHER = new Types.ObjectId();

const questOf = (type: QuestType, _id: Types.ObjectId = SOURCE) => ({
    _id,
    infos: { type },
});

describe('openAidsFilter', () => {
    it('reads every open aid (quick 261113-aql)', () => {
        expect(openAidsFilter()).toEqual({
            'infos.type': QuestType.aid,
            concludedAt: null,
        });
    });

    it('reads the open aids born from the given quests (quick 261113-aql)', () => {
        expect(openAidsFilter([SOURCE, OTHER])).toEqual({
            'infos.type': QuestType.aid,
            concludedAt: null,
            'rescue.failedQuest': { $in: [SOURCE, OTHER] },
        });
    });
});

describe('awaitsRescue', () => {
    const awaiting = new Set([SOURCE.toHexString()]);

    it.each([QuestType.hunt, QuestType.dungeon])(
        'locks a %s with an open aid born from it for everyone (quick 261113-aql)',
        (type) => {
            expect(awaitsRescue(questOf(type), awaiting)).toBe(true);
        },
    );

    it.each([QuestType.hunt, QuestType.dungeon])(
        'leaves a %s without an open aid free (quick 261113-aql)',
        (type) => {
            expect(awaitsRescue(questOf(type, OTHER), awaiting)).toBe(false);
        },
    );

    it.each(
        Object.values(QuestType).filter(
            (type) => type !== QuestType.hunt && type !== QuestType.dungeon,
        ),
    )(
        'never locks a %s, even with an open aid pointing at it (quick 261113-aql)',
        (type) => {
            expect(awaitsRescue(questOf(type), awaiting)).toBe(false);
        },
    );

    it('locks nothing for a quest without a readable id (quick 261113-aql)', () => {
        expect(
            awaitsRescue({ infos: { type: QuestType.hunt } }, awaiting),
        ).toBe(false);
    });
});
