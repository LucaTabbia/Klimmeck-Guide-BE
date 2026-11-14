import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CoinsInput } from 'src/models/common/coins.model';
import { MissionPrizeInput } from './mission-draft.inputs';

const CEILING = 9_999_999;
const CHARACTER_ID = '64f3a0000000000000000001';

const prizeOf = (overrides: Record<string, unknown> = {}) =>
    plainToInstance(MissionPrizeInput, {
        characterId: CHARACTER_ID,
        coins: { gold: 0, silver: 0, copper: 0 },
        cure: false,
        items: [],
        pet: null,
        spell: null,
        xp: 0,
        ...overrides,
    });

const invalidFieldsOf = async (prize: MissionPrizeInput) =>
    (await validate(prize)).map(({ property }) => property);

describe('MissionPrizeInput', () => {
    it('accepts every coin and the xp at the technical ceiling (D-15, D-31)', async () => {
        const prize = prizeOf({
            coins: { gold: CEILING, silver: CEILING, copper: CEILING },
            xp: CEILING,
        });

        expect(await invalidFieldsOf(prize)).toEqual([]);
    });

    it.each([
        [
            'gold',
            { coins: { gold: CEILING + 1, silver: 0, copper: 0 } },
            'coins',
        ],
        [
            'silver',
            { coins: { gold: 0, silver: CEILING + 1, copper: 0 } },
            'coins',
        ],
        [
            'copper',
            { coins: { gold: 0, silver: 0, copper: CEILING + 1 } },
            'coins',
        ],
        ['xp', { xp: CEILING + 1 }, 'xp'],
    ])(
        'refuses %s over the technical ceiling (D-15, D-31)',
        async (_name, overrides, field) => {
            expect(await invalidFieldsOf(prizeOf(overrides))).toEqual([field]);
        },
    );

    it('keeps the shared coins input of the shop free of the prize ceiling (D-15)', async () => {
        const coins = plainToInstance(CoinsInput, {
            gold: CEILING + 1,
            silver: 0,
            copper: 0,
        });

        expect(await validate(coins)).toEqual([]);
    });
});
