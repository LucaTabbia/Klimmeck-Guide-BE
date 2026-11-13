import { Types } from 'mongoose';
import { QuestType } from 'src/models/enums/quest-type.enum';
import { TitleType } from 'src/models/enums/title-type.enum';
import {
    describeGroupPrizeViolations,
    GroupPrizeQuest,
    groupPrizeViolationsOf,
} from './group-prize.report';

const SPELL = new Types.ObjectId();

function questOf(
    type: QuestType,
    seats: { title: TitleType | null; count: number }[],
    rankPrizes?: unknown[],
): GroupPrizeQuest {
    return {
        _id: new Types.ObjectId(),
        infos: { type },
        requirements: {
            minTitle: TitleType.paladin,
            requiredAdventurers: seats,
        },
        prizes: { prizeCoins: null, xpPrize: 100, rankPrizes },
    };
}

describe('groupPrizeViolationsOf', () => {
    it.each([QuestType.boss, QuestType.worldMission])(
        'reports an untitled seat of a boss or a world mission (D-02, D-24): %s',
        (type) => {
            const quest = questOf(type, [
                { title: TitleType.mage, count: 2 },
                { title: null, count: 1 },
            ]);

            expect(groupPrizeViolationsOf(quest)).toEqual(['nullSeat']);
            expect(
                groupPrizeViolationsOf(
                    questOf(QuestType.aid, [{ title: null, count: 1 }]),
                ),
            ).toEqual([]);
        },
    );

    it('reports a seat title without a block (D-24)', () => {
        const seats = [
            { title: TitleType.mage, count: 1 },
            { title: TitleType.paladin, count: 1 },
        ];

        expect(
            groupPrizeViolationsOf(
                questOf(QuestType.boss, seats, [{ title: TitleType.mage }]),
            ),
        ).toEqual(['seatWithoutBlock']);
        expect(groupPrizeViolationsOf(questOf(QuestType.boss, seats))).toEqual(
            [],
        );
    });

    it('reports a spell in a block below mage (D-05c, D-24)', () => {
        const seats = [
            { title: TitleType.mage, count: 1 },
            { title: TitleType.paladin, count: 1 },
        ];

        expect(
            groupPrizeViolationsOf(
                questOf(QuestType.boss, seats, [
                    { title: TitleType.mage },
                    { title: TitleType.paladin, spell: SPELL },
                ]),
            ),
        ).toEqual(['spellBelowMage']);
        expect(
            groupPrizeViolationsOf(
                questOf(QuestType.boss, seats, [
                    { title: TitleType.mage, spell: SPELL },
                    { title: TitleType.paladin },
                ]),
            ),
        ).toEqual([]);
    });

    it('lists every violation in a fixed order (D-24)', () => {
        const quest = questOf(
            QuestType.worldMission,
            [
                { title: TitleType.mage, count: 1 },
                { title: TitleType.hero, count: 1 },
                { title: null, count: 1 },
            ],
            [
                { title: TitleType.mage },
                { title: TitleType.adventurer, spell: SPELL },
            ],
        );

        expect(groupPrizeViolationsOf(quest)).toEqual([
            'nullSeat',
            'seatWithoutBlock',
            'spellBelowMage',
        ]);
    });

    it('ignores the solo quests and the seats that are not valid (D-24)', () => {
        expect(
            groupPrizeViolationsOf(
                questOf(
                    QuestType.enemy,
                    [{ title: null, count: 1 }],
                    [{ title: TitleType.rookie, spell: SPELL }],
                ),
            ),
        ).toEqual([]);
        expect(
            groupPrizeViolationsOf({
                _id: new Types.ObjectId(),
                infos: { type: QuestType.boss },
                requirements: { requiredAdventurers: 1 },
                prizes: null,
            }),
        ).toEqual([]);
    });
});

describe('describeGroupPrizeViolations', () => {
    it('describes a quest with its id and violation names only (D-24)', () => {
        const id = new Types.ObjectId('6a0000000000000000000001');

        expect(
            describeGroupPrizeViolations(id, ['nullSeat', 'spellBelowMage']),
        ).toEqual(
            'Premi per titolo: missione 6a0000000000000000000001 da correggere (nullSeat, spellBelowMage)',
        );
    });
});
