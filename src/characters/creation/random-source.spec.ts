import {
    MathRandomSource,
    RandomSource,
} from 'src/characters/creation/random-source';

describe('MathRandomSource', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('is a RandomSource', () => {
        expect(new MathRandomSource()).toBeInstanceOf(RandomSource);
    });

    it('picks the first index when Math.random returns 0', () => {
        jest.spyOn(Math, 'random').mockReturnValue(0);

        expect(new MathRandomSource().pickIndex(4)).toBe(0);
    });

    it('picks the last index when Math.random is close to 1', () => {
        jest.spyOn(Math, 'random').mockReturnValue(0.9999);

        expect(new MathRandomSource().pickIndex(4)).toBe(3);
    });

    it('always picks 0 from a single candidate', () => {
        jest.spyOn(Math, 'random').mockReturnValue(0.5);

        expect(new MathRandomSource().pickIndex(1)).toBe(0);
    });
});
