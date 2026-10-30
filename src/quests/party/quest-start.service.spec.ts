import { QuestType } from 'src/models/enums/quest-type.enum';
import { soloStartDateOf } from './quest-start.service';

const ARRIVED_AT = new Date('2026-10-30T10:00:00.000Z');

const SOLO_TYPES = [
    QuestType.hunt,
    QuestType.dungeon,
    QuestType.job,
    QuestType.heal,
    QuestType.study,
    QuestType.crime,
    QuestType.guard,
];

const PARTY_TYPES = [QuestType.boss, QuestType.enemy, QuestType.aid];

const GM_LANE_TYPES = [QuestType.story, QuestType.worldMission];

describe('soloStartDateOf', () => {
    it.each(SOLO_TYPES)(
        'starts a solo %s quest at its arrival (D-22)',
        (type) => {
            expect(soloStartDateOf(type, ARRIVED_AT)).toEqual(ARRIVED_AT);
        },
    );

    it.each(PARTY_TYPES)(
        'leaves the start of a %s party to the full party (D-22)',
        (type) => {
            expect(soloStartDateOf(type, ARRIVED_AT)).toBeNull();
        },
    );

    it.each(GM_LANE_TYPES)(
        'leaves the start of a %s to its own lane (D-22)',
        (type) => {
            expect(soloStartDateOf(type, ARRIVED_AT)).toBeNull();
        },
    );

    it('starts nothing before the arrival (D-22)', () => {
        expect(soloStartDateOf(QuestType.hunt, null)).toBeNull();
    });
});
