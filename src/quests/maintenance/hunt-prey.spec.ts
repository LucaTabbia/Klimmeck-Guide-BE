import { EnemyCandidate } from 'src/quests/generation/enemy-pool';
import { keyedChance } from 'src/quests/generation/seeded-chance';
import {
    HUNT_PREY_SEED,
    huntPreyPoolOf,
    huntRewriteOf,
    isCoherentHunt,
    rankOfXp,
} from './hunt-prey';

const HUNT_ID = '65f000000000000000000001';
const BOSA_LORE = '65f0000000000000000000b1';
const TIGER_LORE = '65f0000000000000000000b2';

function candidate(
    id: string,
    name: string,
    xp: number,
    overrides: Partial<EnemyCandidate> = {},
): EnemyCandidate {
    return {
        id,
        name,
        xp,
        locations: ['forest'],
        legendary: false,
        relatedLore: [],
        baseWeaknesses: [],
        energyWeaknesses: [],
        animal: true,
        ...overrides,
    };
}

describe('hunt prey (one-off of 13.1)', () => {
    it('ranks a prey by the band of its xp (D-07)', () => {
        expect([1, 20, 28, 676, 803, 831, 0].map((xp) => rankOfXp(xp))).toEqual(
            ['rookie', 'rookie', 'adventurer', 'hero', 'hero', null, null],
        );
    });

    it('pools the non legendary animals whose habitat meets the poi types (D-07)', () => {
        const wolf = candidate('a02', 'Lupo', 12);
        const tiger = candidate('a01', 'Tigre', 28);
        const enemies = [
            wolf,
            candidate('a03', 'Scorpione', 12, { locations: ['desert'] }),
            candidate('a04', 'Fenice', 12, { legendary: true }),
            candidate('a05', 'Bandito', 12, { animal: false }),
            candidate('a06', 'Ratto', 12, { locations: ['all', 'city'] }),
            candidate('a07', 'Drago', 901),
            tiger,
        ];

        expect(huntPreyPoolOf(enemies, ['forest'])).toEqual([tiger, wolf]);
    });

    it('keeps a hunt whose prey lives in the zone within the band of its minTitle (D-07)', () => {
        const tiger = candidate('a01', 'Tigre', 28);
        const pool = [tiger, candidate('a02', 'Lupo', 12)];

        expect(isCoherentHunt(tiger.id, pool, 'adventurer')).toBe(true);
        expect(isCoherentHunt(tiger.id, pool, 'rookie')).toBe(false);
        expect(isCoherentHunt('a09', pool, 'adventurer')).toBe(false);
        expect(isCoherentHunt(null, pool, 'adventurer')).toBe(false);
    });

    it('draws the same prey for the same hunt id (D-07)', () => {
        const pool = [
            candidate('a01', 'Tigre', 28),
            candidate('a02', 'Lupo', 12),
            candidate('a03', 'Piovra gigante', 676),
        ];
        const city = { name: 'Bosa', relatedLore: null };

        const first = huntRewriteOf({
            pool,
            city,
            chance: keyedChance(HUNT_PREY_SEED, HUNT_ID),
        });
        const second = huntRewriteOf({
            pool,
            city,
            chance: keyedChance(HUNT_PREY_SEED, HUNT_ID),
        });

        expect(second).toEqual(first);
        expect(pool).toContain(first?.prey);
        expect(first?.minTitle).toBe(rankOfXp(first?.prey.xp ?? 0));
    });

    it('rewrites the title, the hunter voice and the lore from the prey and the city (D-07)', () => {
        const tiger = candidate('a01', 'Tigre', 28, {
            relatedLore: [TIGER_LORE],
        });
        const rewriteIn = (relatedLore: string | null) =>
            huntRewriteOf({
                pool: [tiger],
                city: { name: 'Bosa', relatedLore },
                chance: keyedChance(HUNT_PREY_SEED, HUNT_ID),
            });

        expect(rewriteIn(BOSA_LORE)).toEqual({
            prey: tiger,
            minTitle: 'adventurer',
            title: 'Caccia: Tigre nei dintorni di Bosa',
            description:
                'Sono un cacciatore di Bosa e da solo non ce la faccio più. Cerco compagni per stanare una preda pericolosa: Tigre.',
            relatedLore: [BOSA_LORE, TIGER_LORE],
        });
        expect(rewriteIn(null)?.relatedLore).toEqual([TIGER_LORE]);
        expect(
            huntRewriteOf({
                pool: [{ ...tiger, relatedLore: [BOSA_LORE, TIGER_LORE] }],
                city: { name: 'Bosa', relatedLore: BOSA_LORE },
                chance: keyedChance(HUNT_PREY_SEED, HUNT_ID),
            })?.relatedLore,
        ).toEqual([BOSA_LORE, TIGER_LORE]);
    });

    it('returns null with an empty pool (D-07)', () => {
        expect(
            huntRewriteOf({
                pool: [],
                city: { name: 'Bosa', relatedLore: null },
                chance: keyedChance(HUNT_PREY_SEED, HUNT_ID),
            }),
        ).toBeNull();
    });
});
