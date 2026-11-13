import { QuestType } from 'src/models/enums/quest-type.enum';
import { locksWhileRescued, opensAid } from './aid-opening';

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

describe('locksWhileRescued', () => {
    const LOCKED_TYPES = new Set<QuestType>([
        QuestType.hunt,
        QuestType.dungeon,
    ]);

    it.each(Object.values(QuestType))(
        'locks only a hunt or a dungeon while an aid born from it is open (quick 261113-aql): %s',
        (type) => {
            expect(locksWhileRescued(type)).toBe(LOCKED_TYPES.has(type));
        },
    );

    it.each([null, undefined])(
        'locks nothing without a quest type (quick 261113-aql): %s',
        (type) => {
            expect(locksWhileRescued(type)).toBe(false);
        },
    );
});
