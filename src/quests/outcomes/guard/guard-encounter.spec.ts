import { EnemyCandidate } from 'src/quests/generation/enemy-pool';
import { ComposedEnemy } from 'src/quests/generation/quest-composition';
import { xpBandOf } from 'src/travel/ambush/level-bands';
import { SequenceChance } from '../../../../test/quests/sequence-chance';
import {
    composeGuardEncounter,
    GUARD_ENCOUNTER_CHANCE,
    GUARD_ENCOUNTER_MAX_ENEMIES,
    rollsGuardEncounter,
} from './guard-encounter';

const candidate = (
    id: string,
    locations: readonly string[],
    overrides: Partial<EnemyCandidate> = {},
): EnemyCandidate => ({
    id,
    name: `Nemico ${id}`,
    xp: 5,
    locations,
    legendary: false,
    relatedLore: [],
    weaknesses: { base: [], energy: [] },
    animal: false,
    ...overrides,
});

const compose = (
    level: number,
    enemies: readonly EnemyCandidate[],
    chance: SequenceChance,
): ComposedEnemy[] | null => composeGuardEncounter({ level, enemies, chance });

const xpOf = (entries: readonly ComposedEnemy[]): number =>
    entries.reduce((sum, entry) => sum + entry.enemy.xp * entry.quantity, 0);

const unitsOf = (entries: readonly ComposedEnemy[]): number =>
    entries.reduce((sum, entry) => sum + entry.quantity, 0);

// livello 1: fascia [Facile, Medio] = xp [4, 7]
describe('guard encounter (quick 261110-cgd)', () => {
    it('rolls the encounter one time in five (quick 261110-cgd)', () => {
        expect(GUARD_ENCOUNTER_CHANCE).toBe(0.2);
        expect(rollsGuardEncounter(new SequenceChance([0.19]))).toBe(true);
        expect(rollsGuardEncounter(new SequenceChance([0.2]))).toBe(false);
    });

    it('fights one non legendary enemy of the city or of anywhere within the level band (quick 261110-cgd)', () => {
        const thief = candidate('a', ['city'], { xp: 5 });

        expect(compose(1, [thief], new SequenceChance([0]))).toEqual([
            { enemy: thief, quantity: 1 },
        ]);
        const drifter = candidate('b', ['all'], { xp: 6 });

        expect(compose(1, [drifter], new SequenceChance([0]))).toEqual([
            { enemy: drifter, quantity: 1 },
        ]);
    });

    it('never draws a legendary enemy or one living only elsewhere (quick 261110-cgd)', () => {
        const legend = candidate('a', ['city'], { xp: 5, legendary: true });
        const wolf = candidate('b', ['forest'], { xp: 5 });

        expect(compose(1, [legend, wolf], new SequenceChance([0]))).toBeNull();
    });

    it('prefers a single enemy within the band over a pack (quick 261110-cgd)', () => {
        const rat = candidate('a', ['city'], { xp: 2 });
        const thief = candidate('b', ['city'], { xp: 5 });

        expect(compose(1, [rat, thief], new SequenceChance([0]))).toEqual([
            { enemy: thief, quantity: 1 },
        ]);
    });

    it('falls back to a pack of two or three weaker enemies within the band (quick 261110-cgd)', () => {
        const rat = candidate('a', ['city'], { xp: 2 });
        const band = xpBandOf(1);

        const pack = compose(1, [rat], new SequenceChance([0]));

        expect(pack).not.toBeNull();
        const entries = pack as ComposedEnemy[];
        expect(unitsOf(entries)).toBeGreaterThanOrEqual(2);
        expect(unitsOf(entries)).toBeLessThanOrEqual(
            GUARD_ENCOUNTER_MAX_ENEMIES,
        );
        expect(xpOf(entries)).toBeGreaterThanOrEqual(band.min);
        expect(xpOf(entries)).toBeLessThanOrEqual(band.max);
    });

    it('never builds a pack of more than three enemies (quick 261110-cgd)', () => {
        const flea = candidate('a', ['city'], { xp: 1 });

        expect(GUARD_ENCOUNTER_MAX_ENEMIES).toBe(3);
        expect(compose(1, [flea], new SequenceChance([0]))).toBeNull();
    });

    it('has no encounter when neither a single enemy nor a pack fits the band (quick 261110-cgd)', () => {
        const giant = candidate('a', ['city'], { xp: 500 });

        expect(compose(1, [giant], new SequenceChance([0]))).toBeNull();
        expect(compose(1, [], new SequenceChance([0]))).toBeNull();
    });
});
