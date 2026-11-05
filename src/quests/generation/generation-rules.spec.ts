import { TitleType } from 'src/models/enums/title-type.enum';
import {
    BOSS_PARTY_AVERAGE_PE,
    BOSS_SHARE,
    bossSeatsOf,
    GENERATED_RANKS,
    HERO_XP_MAX,
    isBossCandidate,
    isGeneratedRank,
    leastCoveredRank,
    MAX_BOSS_SEATS,
    MAX_PACK_TYPES,
    MAX_PACK_UNITS,
    MIN_BOSS_SEATS,
    PACK_ATTEMPTS,
    RANK_XP_BANDS,
    RANK_XP_FLOORS,
    SINGLE_FORM_SHARE,
    XP_SCALE,
} from 'src/quests/generation/generation-rules';

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
});
