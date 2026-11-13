import { QuestType } from 'src/models/enums/quest-type.enum';
import { opensAid } from './aid-opening';

const RESCUE_TYPES = new Set<QuestType>([
    QuestType.enemy,
    QuestType.boss,
    QuestType.hunt,
    QuestType.dungeon,
    QuestType.aid,
]);

describe('opensAid', () => {
    it.each(Object.values(QuestType))(
        'opens an aid only for enemy, boss, hunt, dungeon and aid (D-09): %s',
        (type) => {
            expect(opensAid(type)).toBe(RESCUE_TYPES.has(type));
        },
    );

    it.each([null, undefined])(
        'opens no aid without a quest type (D-09): %s',
        (type) => {
            expect(opensAid(type)).toBe(false);
        },
    );
});
