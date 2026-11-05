import {
    keyedChance,
    SeededChanceSource,
} from 'src/quests/generation/seeded-chance';

function sequenceOf(seed: number, length = 100): number[] {
    const chance = new SeededChanceSource(seed);
    return Array.from({ length }, () => chance.next());
}

describe('SeededChanceSource', () => {
    it('repeats the same sequence for the same seed (D-17)', () => {
        expect(sequenceOf(13, 10)).toEqual(sequenceOf(13, 10));
        for (const value of sequenceOf(13, 10)) {
            expect(value).toBeGreaterThanOrEqual(0);
            expect(value).toBeLessThan(1);
        }
    });

    it('gives different sequences for different seeds (D-17)', () => {
        expect(sequenceOf(11)).not.toEqual(sequenceOf(12));
    });

    it('keeps every value in [0, 1) (D-17)', () => {
        for (const value of sequenceOf(7, 1000)) {
            expect(value).toBeGreaterThanOrEqual(0);
            expect(value).toBeLessThan(1);
        }
    });

    it('shuffles deterministically and picks nothing from an empty list (D-17)', () => {
        const chance = new SeededChanceSource(3);
        expect(chance.pick([])).toBeUndefined();
        expect(['a', 'b', 'c']).toContain(chance.pick(['a', 'b', 'c']));
        expect(new SeededChanceSource(5).shuffle([1, 2, 3, 4, 5, 6])).toEqual(
            new SeededChanceSource(5).shuffle([1, 2, 3, 4, 5, 6]),
        );
    });

    it('shuffles into a permutation without touching the input (D-17)', () => {
        const items = [1, 2, 3, 4, 5, 6];
        const shuffled = new SeededChanceSource(5).shuffle(items);
        expect(items).toEqual([1, 2, 3, 4, 5, 6]);
        expect([...shuffled].sort((a, b) => a - b)).toEqual(items);
        expect(new SeededChanceSource(5).shuffle(items)).toEqual(shuffled);
    });
});

describe('keyedChance', () => {
    const keyedSequence = (seed: number, key: string) => {
        const chance = keyedChance(seed, key);
        return Array.from({ length: 20 }, () => chance.next());
    };

    it('gives a different stream per key (D-17)', () => {
        expect(keyedChance(13, 'a').next()).not.toBe(
            keyedChance(13, 'b').next(),
        );
        expect(keyedChance(13, 'a').next()).toBe(keyedChance(13, 'a').next());
    });

    it('derives the same sequence from the same seed and key (D-17)', () => {
        expect(keyedSequence(11, 'heal|poi')).toEqual(
            keyedSequence(11, 'heal|poi'),
        );
    });

    it('derives a different sequence for another key (D-17)', () => {
        expect(keyedSequence(11, 'heal|poi')).not.toEqual(
            keyedSequence(11, 'job|poi'),
        );
    });

    it('leaves the main source untouched (D-17)', () => {
        const main = new SeededChanceSource(11);
        const first = [main.next(), main.next()];
        keyedChance(11, 'heal|poi').next();
        const rest = [main.next(), main.next()];
        expect([...first, ...rest]).toEqual(sequenceOf(11, 4));
    });
});
