import { Types } from 'mongoose';
import { questEnemiesOf, validQuestEnemiesOf } from './quest-enemies';

describe('quest enemies reader', () => {
    const id = new Types.ObjectId();

    it('reads the enemies list of a migrated quest as is (D-01)', () => {
        const enemies = [{ enemy: id, quantity: 3 }];

        expect(questEnemiesOf({ enemies })).toEqual([
            { enemy: id, quantity: 3 },
        ]);
    });

    it('reads a legacy single enemy as one entry with quantity 1 (D-28)', () => {
        expect(questEnemiesOf({ enemy: id })).toEqual([
            { enemy: id, quantity: 1 },
        ]);
        expect(questEnemiesOf({ enemy: null })).toEqual([]);
        expect(questEnemiesOf({})).toEqual([]);
        expect(questEnemiesOf(null)).toEqual([]);
        expect(questEnemiesOf(undefined)).toEqual([]);
    });

    it('prefers the list when both forms are present (D-28)', () => {
        expect(questEnemiesOf({ enemies: [], enemy: id })).toEqual([]);
    });

    it('keeps only entries with a valid ref and a positive integer quantity, in order (D-28)', () => {
        const [a, b, c, d] = Array.from(
            { length: 4 },
            () => new Types.ObjectId(),
        );

        const valid = validQuestEnemiesOf({
            enemies: [
                { enemy: a, quantity: 2 },
                { enemy: 'xyz', quantity: 1 },
                { enemy: b, quantity: 0 },
                { enemy: c, quantity: 1.5 },
                null,
                { enemy: d.toHexString(), quantity: 1 },
            ],
        });

        expect(valid).toEqual([
            { enemy: a, quantity: 2 },
            { enemy: d, quantity: 1 },
        ]);
        expect(valid[1].enemy).toBeInstanceOf(Types.ObjectId);
    });

    it('reads a legacy single enemy through the validating reader (D-28)', () => {
        expect(validQuestEnemiesOf({ enemy: id })).toEqual([
            { enemy: id, quantity: 1 },
        ]);
        expect(validQuestEnemiesOf({ enemy: 'not-an-id' })).toEqual([]);
    });
});
