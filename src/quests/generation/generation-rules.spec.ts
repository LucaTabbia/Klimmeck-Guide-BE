import { TitleType } from 'src/models/enums/title-type.enum';
import {
    BOSS_PARTY_AVERAGE_PE,
    BOSS_SHARE,
    bossSeatsFor,
    bossSeatsOf,
    budgetOf,
    coverageRankOf,
    ENEMY_SEATS,
    GENERATED_RANKS,
    HERO_XP_MAX,
    isBossCandidate,
    isGeneratedRank,
    leastCoveredRank,
    lowerRankOf,
    MAX_BOSS_SEATS,
    MAX_PACK_TYPES,
    MAX_PACK_UNITS,
    MIN_BOSS_SEATS,
    MIXED_BOSS_SHARE,
    mixedSeatsOf,
    PACK_ATTEMPTS,
    RANK_XP_BANDS,
    RANK_XP_FLOORS,
    SINGLE_FORM_SHARE,
    XP_SCALE,
} from 'src/quests/generation/generation-rules';
import { SequenceChance } from '../../../test/quests/sequence-chance';

describe('generation rules', () => {
    it('pins the five contiguous bands from rookie 1 to hero 803 (D-02)', () => {
        expect(RANK_XP_FLOORS).toEqual({
            rookie: 1,
            adventurer: 21,
            paladin: 70,
            mage: 225,
            hero: 549,
        });
        expect(HERO_XP_MAX).toBe(803);
        expect(RANK_XP_BANDS).toEqual({
            rookie: { min: 1, max: 20 },
            adventurer: { min: 21, max: 69 },
            paladin: { min: 70, max: 224 },
            mage: { min: 225, max: 548 },
            hero: { min: 549, max: 803 },
        });
        expect(XP_SCALE).toBe(0.14084507);
    });

    it('leaves no gap between rookie and hero (D-02)', () => {
        expect(RANK_XP_BANDS.rookie.min).toBe(1);
        for (let index = 0; index < GENERATED_RANKS.length - 1; index += 1) {
            const rank = GENERATED_RANKS[index];
            const next = GENERATED_RANKS[index + 1];
            expect(RANK_XP_BANDS[rank].max + 1).toBe(RANK_XP_BANDS[next].min);
        }
    });

    it('rotates over the five ranks and never treats legend as a generated rank (D-02)', () => {
        expect(GENERATED_RANKS).toEqual([
            'rookie',
            'adventurer',
            'paladin',
            'mage',
            'hero',
        ]);
        expect(GENERATED_RANKS.every((rank) => isGeneratedRank(rank))).toBe(
            true,
        );
        expect(isGeneratedRank(TitleType.legend)).toBe(false);
        expect(isGeneratedRank('emperor')).toBe(false);
        expect(isGeneratedRank(null)).toBe(false);
    });

    it('pins the party averages of the boss ranks (D-05)', () => {
        expect(BOSS_PARTY_AVERAGE_PE).toEqual({
            adventurer: 400,
            paladin: 1500,
            mage: 4000,
            hero: 6000,
        });
        expect([MIN_BOSS_SEATS, MAX_BOSS_SEATS]).toEqual([2, 6]);
    });

    it('computes the boss seats from the party average with the rounding fix (D-05)', () => {
        expect(bossSeatsOf(254, 400)).toBe(5);
        expect(bossSeatsOf(113, 400)).toBe(2);
        expect(bossSeatsOf(549, 1500)).toBe(3);
        expect(bossSeatsOf(1408, 4000)).toBe(3);
        expect(bossSeatsOf(1408, 6000)).toBe(2);
        expect(bossSeatsOf(901, 4000)).toBe(2);
    });

    it('admits a boss only with 2 to 6 seats and only for adventurer to hero (D-05, D-07)', () => {
        expect(isBossCandidate(254, TitleType.adventurer)).toBe(true);
        expect(isBossCandidate(30, TitleType.adventurer)).toBe(false);
        expect(isBossCandidate(400, TitleType.adventurer)).toBe(false);
        expect(isBossCandidate(549, TitleType.paladin)).toBe(true);
        expect(isBossCandidate(1408, TitleType.mage)).toBe(true);
        expect(isBossCandidate(1408, TitleType.hero)).toBe(true);
        for (const xp of [7, 30, 254, 1408, 5000]) {
            expect(isBossCandidate(xp, TitleType.rookie)).toBe(false);
        }
    });

    it('scales the xp budget with the seats of the quest (D-03)', () => {
        expect(budgetOf(TitleType.paladin, 1)).toEqual({ min: 70, max: 224 });
        expect(budgetOf(TitleType.paladin, 2)).toEqual({ min: 140, max: 448 });
        expect(budgetOf(TitleType.hero, 2)).toEqual({ min: 1098, max: 1606 });
    });

    it('pins one seat on generated enemy quests, boss and worldMission excepted (D-09)', () => {
        expect(ENEMY_SEATS).toBe(1);
        for (const rank of GENERATED_RANKS) {
            expect(budgetOf(rank, ENEMY_SEATS)).toEqual(RANK_XP_BANDS[rank]);
        }
        expect(bossSeatsFor(254, TitleType.adventurer)).toBe(5);
        expect(bossSeatsFor(831, TitleType.hero)).toBe(MIN_BOSS_SEATS);
    });

    it('admits a boss only above the band of the rank (D-03)', () => {
        expect(isBossCandidate(63, TitleType.adventurer)).toBe(false);
        expect(isBossCandidate(224, TitleType.paladin)).toBe(false);
        expect(isBossCandidate(803, TitleType.hero)).toBe(false);
        expect(isBossCandidate(254, TitleType.adventurer)).toBe(true);
        expect(isBossCandidate(549, TitleType.paladin)).toBe(true);
        expect(isBossCandidate(1408, TitleType.mage)).toBe(true);
        for (const xp of [1, 20, 63, 254, 831, 1408]) {
            expect(isBossCandidate(xp, TitleType.rookie)).toBe(false);
        }
    });

    it('clamps a boss above the hero maximum to two seats (D-03)', () => {
        expect(bossSeatsOf(831, 6000)).toBe(1);
        expect(bossSeatsFor(831, TitleType.hero)).toBe(2);
        expect(bossSeatsFor(901, TitleType.hero)).toBe(2);
        expect(bossSeatsFor(1408, TitleType.hero)).toBe(2);
        expect(bossSeatsFor(831, TitleType.mage)).toBe(2);
        expect(bossSeatsFor(803, TitleType.hero)).toBeNull();
        expect(bossSeatsFor(400, TitleType.adventurer)).toBeNull();
    });

    it('serves the least covered rank with ties to the lowest (D-15)', () => {
        expect(leastCoveredRank({})).toBe(TitleType.rookie);
        expect(
            leastCoveredRank({
                rookie: 2,
                adventurer: 1,
                paladin: 1,
                mage: 1,
                hero: 1,
            }),
        ).toBe(TitleType.adventurer);
        expect(
            leastCoveredRank({
                rookie: 1,
                adventurer: 1,
                paladin: 1,
                mage: 1,
                hero: 0,
            }),
        ).toBe(TitleType.hero);
        expect(leastCoveredRank({ rookie: 3, adventurer: 2 })).toBe(
            TitleType.paladin,
        );
    });

    it('pins the shares and the pack limits (D-06, D-07)', () => {
        expect(BOSS_SHARE).toBe(0.1);
        expect(SINGLE_FORM_SHARE).toBe(0.5);
        expect(MAX_PACK_UNITS).toBe(8);
        expect(MAX_PACK_TYPES).toBe(3);
        expect(PACK_ATTEMPTS).toBe(20);
    });

    describe('mixed bosses', () => {
        it.each([
            [TitleType.rookie, null],
            [TitleType.adventurer, TitleType.rookie],
            [TitleType.paladin, TitleType.adventurer],
            [TitleType.mage, TitleType.paladin],
            [TitleType.hero, TitleType.mage],
        ] as const)(
            'names the title just below each boss rank (D-03): %s',
            (rank, lower) => {
                expect(lowerRankOf(rank)).toBe(lower);
            },
        );

        it('mixes one boss out of two (D-23)', () => {
            expect(MIXED_BOSS_SHARE).toBe(0.5);
            const mixed = new SequenceChance([0.49, 0]);
            expect(mixedSeatsOf(4, mixed)).toBe(1);
            expect(mixed.drawn).toEqual([0.49, 0]);

            const plain = new SequenceChance([0.5, 0.25]);
            expect(mixedSeatsOf(4, plain)).toBe(0);
            expect(plain.drawn).toEqual([0.5]);
            expect(plain.next()).toBe(0.25);
        });

        it('puts from one to half of the seats on the lower title (D-03, D-23)', () => {
            const cases: [number, number[], number][] = [
                [2, [0], 1],
                [3, [0], 1],
                [4, [0, 0], 1],
                [4, [0, 0.99], 2],
                [5, [0, 0.99], 2],
                [6, [0, 0], 1],
                [6, [0, 0.5], 2],
                [6, [0, 0.99], 3],
                [6, [0, 1], 3],
                [4, [0, 1], 2],
            ];
            for (const [seats, draws, lowerSeats] of cases) {
                const chance = new SequenceChance(draws, 0.42);
                expect(mixedSeatsOf(seats, chance)).toBe(lowerSeats);
                expect(chance.drawn).toEqual(draws);
            }
            const twoSeats = new SequenceChance([0, 0.7]);
            mixedSeatsOf(2, twoSeats);
            expect(twoSeats.drawn).toEqual([0]);
        });

        it('counts a boss on its highest seat title and an enemy on its minimum title (D-23)', () => {
            expect(
                coverageRankOf({
                    infos: { type: 'boss' },
                    requirements: {
                        minTitle: TitleType.paladin,
                        requiredAdventurers: [
                            { title: TitleType.mage, count: 3 },
                            { title: TitleType.paladin, count: 1 },
                        ],
                    },
                }),
            ).toBe(TitleType.mage);
            expect(
                coverageRankOf({
                    infos: { type: 'enemy' },
                    requirements: {
                        minTitle: TitleType.adventurer,
                        requiredAdventurers: [{ title: null, count: 1 }],
                    },
                }),
            ).toBe(TitleType.adventurer);
            expect(
                coverageRankOf({
                    infos: { type: 'boss' },
                    requirements: {
                        minTitle: TitleType.hero,
                        requiredAdventurers: [
                            { title: TitleType.hero, count: 4 },
                        ],
                    },
                }),
            ).toBe(TitleType.hero);
            expect(
                coverageRankOf({
                    infos: { type: 'enemy' },
                    requirements: { minTitle: TitleType.legend },
                }),
            ).toBeNull();
            expect(
                coverageRankOf({
                    infos: { type: 'boss' },
                    requirements: {
                        minTitle: TitleType.legend,
                        requiredAdventurers: [
                            { title: TitleType.legend, count: 2 },
                        ],
                    },
                }),
            ).toBeNull();
        });
    });
});
