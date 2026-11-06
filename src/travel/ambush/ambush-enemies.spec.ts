import { EnemyCandidate } from 'src/quests/generation/enemy-pool';
import { ComposedEnemy } from 'src/quests/generation/quest-composition';
import { composeAmbushEnemies } from 'src/travel/ambush/ambush-enemies';
import { xpBandOf } from 'src/travel/ambush/level-bands';
import { SequenceChance } from '../../../test/quests/sequence-chance';

const candidate = (
    id: string,
    locations: readonly string[],
    overrides: Partial<EnemyCandidate> = {},
): EnemyCandidate => ({
    id,
    name: `Nemico ${id}`,
    xp: 20,
    locations,
    legendary: false,
    relatedLore: [],
    baseWeaknesses: [],
    energyWeaknesses: [],
    animal: false,
    ...overrides,
});

const FOREST = ['forest'];

const compose = (
    level: number,
    enemies: readonly EnemyCandidate[],
    chance: SequenceChance,
): ComposedEnemy[] | null =>
    composeAmbushEnemies({ level, poiTypes: FOREST, enemies, chance });

const xpOf = (entries: readonly ComposedEnemy[]): number =>
    entries.reduce((sum, entry) => sum + entry.enemy.xp * entry.quantity, 0);

const unitsOf = (entries: readonly ComposedEnemy[]): number =>
    entries.reduce((sum, entry) => sum + entry.quantity, 0);

describe('ambush enemies', () => {
    it('fights the zone animals of the nearest point of interest (D-07)', () => {
        const wolf = candidate('w', ['forest'], { xp: 5, animal: true });

        expect(compose(1, [wolf], new SequenceChance([0.1, 0]))).toEqual([
            { enemy: wolf, quantity: 1 },
        ]);
    });

    it('always adds the city habitat to the zone (D-07)', () => {
        const brigand = candidate('b', ['city'], { xp: 6 });

        expect(compose(1, [brigand], new SequenceChance([0.1, 0]))).toEqual([
            { enemy: brigand, quantity: 1 },
        ]);
    });

    it('never fights a legendary enemy (D-07)', () => {
        const legend = candidate('l', ['forest'], { xp: 5, legendary: true });

        expect(compose(1, [legend], new SequenceChance([0.1, 0]))).toBeNull();
    });

    it('falls back on enemies living anywhere when the zone does not compose (D-06)', () => {
        const strong = candidate('s', ['forest'], { xp: 50 });
        const wanderer = candidate('x', ['all'], { xp: 5 });

        expect(
            compose(1, [strong, wanderer], new SequenceChance([0.1, 0])),
        ).toEqual([{ enemy: wanderer, quantity: 1 }]);
    });

    it('uses the easy to medium band of the level as budget and cap (D-08)', () => {
        const inBand = candidate('m', ['forest'], { xp: 52 });
        const tooStrong = candidate('t', ['forest'], { xp: 80 });
        const enemies = [inBand, tooStrong];

        expect(xpBandOf(5)).toEqual({ min: 35, max: 70 });
        expect(compose(5, enemies, new SequenceChance([0.1, 0, 0]))).toEqual([
            { enemy: inBand, quantity: 1 },
        ]);
        const members = Array.from({ length: 20 }, (_, index) =>
            compose(5, enemies, new SequenceChance([index / 20], 0.5)),
        ).flatMap((entries) => entries?.map((entry) => entry.enemy.id) ?? []);
        expect(members.length).toBeGreaterThan(0);
        expect([...new Set(members)]).toEqual(['m']);
    });

    it('composes a pack whose total stays in the band (D-08)', () => {
        const rat = candidate('r', ['forest'], { xp: 2, animal: true });
        const band = xpBandOf(3);

        const pack = compose(3, [rat], new SequenceChance([0.9], 0));

        expect(band).toEqual({ min: 11, max: 21 });
        expect(pack).not.toBeNull();
        const entries = pack ?? [];
        expect(entries.map((entry) => entry.enemy)).toEqual([rat]);
        expect(xpOf(entries)).toBeGreaterThanOrEqual(band.min);
        expect(xpOf(entries)).toBeLessThanOrEqual(band.max);
        expect(unitsOf(entries)).toBeGreaterThanOrEqual(2);
        expect(unitsOf(entries)).toBeLessThanOrEqual(8);
    });

    it('answers null when neither pool composes (D-08)', () => {
        const strong = candidate('s', ['forest'], { xp: 50 });
        const wanderer = candidate('x', ['all'], { xp: 50 });

        expect(
            compose(1, [strong, wanderer], new SequenceChance([0.1, 0])),
        ).toBeNull();
    });
});
