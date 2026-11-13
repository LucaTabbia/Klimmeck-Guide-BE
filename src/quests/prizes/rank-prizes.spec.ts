import { model, Types } from 'mongoose';
import { QuestSchema } from 'src/models/quest/quest.model';
import { QuestType } from 'src/models/enums/quest-type.enum';
import { TitleType } from 'src/models/enums/title-type.enum';
import { buildQuest } from '../../../test/fixtures/quest.fixture';
import {
    prizeBlockFor,
    prizeBlocksOf,
    rankBlocksOf,
    RankPrizesHolder,
} from './rank-prizes';

const block = (title: string, xpPrize = 10) => ({
    title,
    prizeCoins: { gold: 0, silver: xpPrize, copper: 0 },
    xpPrize,
    prizeItem: null,
    randomLoot: [],
    spell: null,
    pet: null,
    cure: null,
});

const questOf = (
    type: QuestType,
    prizes: Record<string, unknown> | null,
    minTitle: TitleType | null = TitleType.rookie,
): RankPrizesHolder => ({
    infos: { type },
    requirements: { minTitle },
    prizes: prizes as RankPrizesHolder['prizes'],
});

const plainPrizes = {
    prizeCoins: { gold: 1, silver: 0, copper: 0 },
    xpPrize: 99,
    prizeItem: null,
    randomLoot: [],
    spell: null,
    spellDraw: false,
    pet: null,
    cure: null,
};

const titlesOf = (quest: RankPrizesHolder) =>
    prizeBlocksOf(quest).map((prize) => prize.title);

describe('rank prize blocks', () => {
    it('reads the blocks of a group quest in seat order (D-01)', () => {
        const quest = questOf(QuestType.boss, {
            ...plainPrizes,
            rankPrizes: [block('mage', 40), block('paladin', 20)],
        });

        expect(prizeBlocksOf(quest)).toEqual([
            block('mage', 40),
            block('paladin', 20),
        ]);
    });

    it('reads a solo quest as one block on its minimum title (D-01)', () => {
        const quest = questOf(
            QuestType.hunt,
            { ...plainPrizes, rankPrizes: [block('mage', 40)] },
            TitleType.paladin,
        );

        expect(prizeBlocksOf(quest)).toEqual([
            { title: TitleType.paladin, ...plainPrizes },
        ]);
    });

    it('reads a legacy boss without blocks as one block on its minimum title (D-28)', () => {
        const quest = questOf(QuestType.boss, plainPrizes, TitleType.hero);

        expect(prizeBlocksOf(quest)).toEqual([
            { title: TitleType.hero, ...plainPrizes },
        ]);
    });

    it('ignores the plain fields of a group quest with blocks (D-06)', () => {
        const quest = questOf(QuestType.worldMission, {
            ...plainPrizes,
            rankPrizes: [block('hero', 70)],
        });

        expect(prizeBlocksOf(quest)).toEqual([block('hero', 70)]);
    });

    it('keeps the study draw and the cure on the single block (D-01)', () => {
        const cure = { lifePointsShare: 0.5, canHeal: ['deepCut'] };
        const study = questOf(QuestType.study, {
            ...plainPrizes,
            spellDraw: true,
        });
        const heal = questOf(QuestType.heal, { ...plainPrizes, cure });

        expect(prizeBlocksOf(study)[0].spellDraw).toBe(true);
        expect(prizeBlocksOf(heal)[0].cure).toEqual(cure);
    });

    it('drops blocks without a valid title (D-01)', () => {
        const mixed = questOf(QuestType.aid, {
            ...plainPrizes,
            rankPrizes: [block('emperor'), 'junk', null, block('hero')],
        });
        const invalid = questOf(
            QuestType.aid,
            { ...plainPrizes, rankPrizes: [block('emperor'), { xp: 1 }] },
            TitleType.mage,
        );

        expect(titlesOf(mixed)).toEqual(['hero']);
        expect(prizeBlocksOf(invalid)).toEqual([
            { title: TitleType.mage, ...plainPrizes },
        ]);
    });

    it('picks the block of the exact title (D-04)', () => {
        const quest = questOf(QuestType.boss, {
            ...plainPrizes,
            rankPrizes: [block('hero'), block('mage')],
        });

        expect(prizeBlockFor(quest, TitleType.mage)?.title).toBe('mage');
    });

    it('falls back to the highest block not above the title (D-18)', () => {
        const heroMage = questOf(QuestType.boss, {
            ...plainPrizes,
            rankPrizes: [block('hero'), block('mage')],
        });
        const magePaladin = questOf(QuestType.boss, {
            ...plainPrizes,
            rankPrizes: [block('mage'), block('paladin')],
        });

        expect(prizeBlockFor(heroMage, TitleType.legend)?.title).toBe('hero');
        expect(prizeBlockFor(magePaladin, TitleType.hero)?.title).toBe('mage');
    });

    it('falls back to the lowest block below every block (D-18)', () => {
        const quest = questOf(QuestType.boss, {
            ...plainPrizes,
            rankPrizes: [block('mage'), block('paladin')],
        });

        expect(prizeBlockFor(quest, TitleType.rookie)?.title).toBe('paladin');
    });

    it('uses the minimum title without a character (D-18)', () => {
        const rankPrizes = [block('mage'), block('paladin')];
        const withMinTitle = questOf(
            QuestType.boss,
            { ...plainPrizes, rankPrizes },
            TitleType.paladin,
        );
        const withoutMinTitle = questOf(
            QuestType.boss,
            { ...plainPrizes, rankPrizes },
            null,
        );

        expect(prizeBlockFor(withMinTitle, null)?.title).toBe('paladin');
        expect(prizeBlockFor(withMinTitle, undefined)?.title).toBe('paladin');
        expect(prizeBlockFor(withoutMinTitle, null)?.title).toBe('paladin');
    });

    it('reads the single block of a hydrated document (D-01)', () => {
        const Probe = model('RankPrizeProbe', QuestSchema);
        const doc = new Probe(
            buildQuest({
                prizes: {
                    ...buildQuest().prizes,
                    xpPrize: 40,
                    randomLoot: [
                        {
                            itemType: 'LootItem',
                            item: new Types.ObjectId(),
                            quantity: 2,
                        },
                    ],
                },
            }),
        );

        const chosen = prizeBlockFor(doc, null);

        expect(chosen?.xpPrize).toBe(40);
        expect(chosen?.randomLoot).toHaveLength(1);
        expect(
            Object.keys(chosen ?? {}).filter(
                (key) => key.startsWith('$') || key === '_doc',
            ),
        ).toEqual([]);
    });

    it('reads the blocks of a group quest only through rankBlocksOf (D-01)', () => {
        const rankPrizes = [block('mage'), block('paladin')];

        expect(
            rankBlocksOf(
                questOf(QuestType.hunt, { ...plainPrizes, rankPrizes }),
            ),
        ).toEqual([]);
        expect(
            rankBlocksOf(
                questOf(QuestType.boss, { ...plainPrizes, rankPrizes }),
            ),
        ).toEqual(rankPrizes);
        expect(rankBlocksOf(questOf(QuestType.boss, plainPrizes))).toEqual([]);
    });

    it('returns no block without prizes (D-01)', () => {
        const quest = questOf(QuestType.boss, null);

        expect(prizeBlocksOf(quest)).toEqual([]);
        expect(prizeBlockFor(quest, TitleType.mage)).toBeNull();
    });
});
