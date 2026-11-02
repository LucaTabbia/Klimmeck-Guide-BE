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
        it('refuses buying a pet already owned with PET_ALREADY_OWNED (D-14)', () => {
            expect(
                codeThrownBy(() =>
                    assertPetsNotOwned([line('buy', 'Pet', horse)], {
                        ownedPets: [horse],
                    }),
                ),
            ).toBe(GameRuleErrorCode.PET_ALREADY_OWNED);
            expect(
                codeThrownBy(() =>
                    assertPetsNotOwned([line('buy', 'Pet', horse)], {
                        ownedPets: [horse.toHexString()],
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
                        { ownedPets: [camel] },
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
                applyTradeToPets({ ownedPets: [horse], pet: horse }, [
                    line('buy', 'LootItem', potion),
                ]),
            ).toBeNull();
        });

        it('adds a bought pet to the owned pets without equipping it (D-14)', () => {
            expect(
                applyTradeToPets({ ownedPets: [camel], pet: null }, [
                    line('buy', 'Pet', horse),
                ]),
            ).toEqual({ ownedPets: [camel, horse], unequip: false });
            expect(applyTradeToPets({}, [line('buy', 'Pet', horse)])).toEqual({
                ownedPets: [horse],
                unequip: false,
            });
        });

        it('removes a sold pet from the owned pets (D-14)', () => {
            expect(
                applyTradeToPets(
                    { ownedPets: [camel, horse.toHexString()], pet: camel },
                    [line('sell', 'Pet', horse)],
                ),
            ).toEqual({ ownedPets: [camel], unequip: false });
        });

        it('unequips the sold pet when it was the equipped one (D-14)', () => {
            expect(
                applyTradeToPets(
                    { ownedPets: [camel, horse], pet: horse.toHexString() },
                    [line('sell', 'Pet', horse)],
                ),
            ).toEqual({ ownedPets: [camel], unequip: true });
        });

        it('refuses selling a pet not owned with ITEM_NOT_OWNED (D-14)', () => {
            expect(
                codeThrownBy(() =>
                    applyTradeToPets({ ownedPets: [camel], pet: horse }, [
                        line('sell', 'Pet', horse),
                    ]),
                ),
            ).toBe(GameRuleErrorCode.ITEM_NOT_OWNED);
        });
    });

    describe('petOwnershipGuards', () => {
        it('guards a bought pet as absent and a sold pet as present in the write (D-14)', () => {
            expect(
                petOwnershipGuards([
                    line('buy', 'Pet', horse),
                    line('sell', 'LootItem', potion),
                    line('sell', 'Pet', camel),
                ]),
            ).toEqual([
                {
                    'assets.ownedPets': {
                        $nin: [horse, horse.toHexString()],
                    },
                },
                {
                    'assets.ownedPets': {
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
