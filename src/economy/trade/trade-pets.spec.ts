import { Types } from 'mongoose';
import { GameRuleErrorCode } from 'src/gameRules/game-rule-error-code.enum';
import type { TradeLine } from './trade-line';
import {
    applyTradeToPets,
    assertPetsNotOwned,
    petOwnershipGuards,
} from './trade-pets';

const horse = new Types.ObjectId();
const camel = new Types.ObjectId();
const potion = new Types.ObjectId();

const line = (
    direction: TradeLine['direction'],
    kind: TradeLine['kind'],
    itemId: Types.ObjectId,
): TradeLine => ({ direction, kind, itemId, quantity: 1 });

const entry = (
    pet: Types.ObjectId | string,
    xp = 0,
    currentLifePoints = 10,
) => ({ pet, xp, currentLifePoints });

const lifePoints = (...pairs: [Types.ObjectId, unknown][]) =>
    new Map<string, unknown>(pairs.map(([id, max]) => [id.toHexString(), max]));

const NO_LIFE_POINTS = lifePoints();

function codeThrownBy(action: () => unknown): GameRuleErrorCode | undefined {
    try {
        action();
    } catch (error) {
        return (error as { code?: GameRuleErrorCode }).code;
    }
    return undefined;
}

describe('trade pets', () => {
    describe('assertPetsNotOwned', () => {
        it('refuses to buy a pet already owned as an entry (D-03)', () => {
            expect(
                codeThrownBy(() =>
                    assertPetsNotOwned([line('buy', 'Pet', horse)], {
                        ownedPets: [entry(horse, 12, 3)],
                    }),
                ),
            ).toBe(GameRuleErrorCode.PET_ALREADY_OWNED);
            expect(
                codeThrownBy(() =>
                    assertPetsNotOwned([line('buy', 'Pet', horse)], {
                        ownedPets: [entry(horse.toHexString())],
                    }),
                ),
            ).toBe(GameRuleErrorCode.PET_ALREADY_OWNED);
        });

        it('accepts buying a pet not owned (D-14)', () => {
            expect(
                codeThrownBy(() =>
                    assertPetsNotOwned(
                        [
                            line('buy', 'Pet', horse),
                            line('sell', 'Pet', camel),
                            line('buy', 'LootItem', camel),
                        ],
                        { ownedPets: [entry(camel)] },
                    ),
                ),
            ).toBeUndefined();
            expect(
                codeThrownBy(() =>
                    assertPetsNotOwned([line('buy', 'Pet', horse)], {}),
                ),
            ).toBeUndefined();
        });
    });

    describe('applyTradeToPets', () => {
        it('returns no pet outcome for a trade without pet lines (Pitfall 5)', () => {
            expect(
                applyTradeToPets(
                    { ownedPets: [entry(horse)], pet: horse },
                    [line('buy', 'LootItem', potion)],
                    NO_LIFE_POINTS,
                ),
            ).toBeNull();
        });

        it('adds a whole entry for a bought pet (D-03)', () => {
            expect(
                applyTradeToPets(
                    { ownedPets: [entry(camel, 40, 6)], pet: null },
                    [line('buy', 'Pet', horse)],
                    lifePoints([horse, 300], [camel, 80]),
                ),
            ).toEqual({
                ownedPets: [
                    { pet: camel, xp: 40, currentLifePoints: 6 },
                    { pet: horse, xp: 0, currentLifePoints: 300 },
                ],
                unequip: false,
            });
            expect(
                applyTradeToPets(
                    {},
                    [line('buy', 'Pet', horse)],
                    NO_LIFE_POINTS,
                ),
            ).toEqual({
                ownedPets: [{ pet: horse, xp: 0, currentLifePoints: 0 }],
                unequip: false,
            });
        });

        it('removes the whole entry of a sold pet and keeps the others untouched (D-03)', () => {
            expect(
                applyTradeToPets(
                    {
                        ownedPets: [
                            entry(camel, 40, 6),
                            entry(horse.toHexString(), 15, 2),
                        ],
                        pet: camel,
                    },
                    [line('sell', 'Pet', horse)],
                    NO_LIFE_POINTS,
                ),
            ).toEqual({
                ownedPets: [{ pet: camel, xp: 40, currentLifePoints: 6 }],
                unequip: false,
            });
        });

        it('unequips the companion when its entry is sold (D-03)', () => {
            expect(
                applyTradeToPets(
                    {
                        ownedPets: [entry(camel, 40, 6), entry(horse, 15, 2)],
                        pet: horse.toHexString(),
                    },
                    [line('sell', 'Pet', horse)],
                    NO_LIFE_POINTS,
                ),
            ).toEqual({
                ownedPets: [{ pet: camel, xp: 40, currentLifePoints: 6 }],
                unequip: true,
            });
        });

        it('refuses to sell a pet that is in no entry (D-03)', () => {
            expect(
                codeThrownBy(() =>
                    applyTradeToPets(
                        { ownedPets: [entry(camel)], pet: horse },
                        [line('sell', 'Pet', horse)],
                        NO_LIFE_POINTS,
                    ),
                ),
            ).toBe(GameRuleErrorCode.ITEM_NOT_OWNED);
        });
    });

    describe('petOwnershipGuards', () => {
        it('guards the write on the entry reference (D-03)', () => {
            expect(
                petOwnershipGuards([
                    line('buy', 'Pet', horse),
                    line('sell', 'LootItem', potion),
                    line('sell', 'Pet', camel),
                ]),
            ).toEqual([
                {
                    'assets.ownedPets.pet': {
                        $nin: [horse, horse.toHexString()],
                    },
                },
                {
                    'assets.ownedPets.pet': {
                        $in: [camel, camel.toHexString()],
                    },
                },
            ]);
            expect(
                petOwnershipGuards([line('sell', 'LootItem', potion)]),
            ).toEqual([]);
        });
    });
});
