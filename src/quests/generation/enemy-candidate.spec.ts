import { Types } from 'mongoose';
import { enemyCandidateOf } from 'src/quests/generation/enemy-candidate';

describe('enemy candidate read by the generator', () => {
    const enemyLore = new Types.ObjectId();
    const animalLore = new Types.ObjectId();
    const cityLore = new Types.ObjectId();

    it('marks an enemy as an animal when one of its lore is an animal lore (D-01)', () => {
        const crocodile = {
            _id: new Types.ObjectId(),
            name: 'Coccodrillo',
            xp: 63,
            locations: ['swamp'],
            legendary: false,
            relatedLore: [cityLore, animalLore],
            baseWeaknesses: ['cut'],
            energyWeaknesses: [],
        };

        const marked = enemyCandidateOf(
            crocodile,
            new Set([animalLore.toHexString()]),
        );
        const unmarked = enemyCandidateOf(crocodile, new Set());

        expect(marked.animal).toBe(true);
        expect(marked.relatedLore).toEqual([
            cityLore.toHexString(),
            animalLore.toHexString(),
        ]);
        expect(unmarked.animal).toBe(false);
    });

    it('keeps an enemy with only an enemy lore generatable (D-01)', () => {
        const bandit = {
            _id: new Types.ObjectId(),
            name: 'Bandito',
            xp: 4,
            legendary: false,
            relatedLore: [enemyLore],
        };

        expect(
            enemyCandidateOf(bandit, new Set([animalLore.toHexString()]))
                .animal,
        ).toBe(false);
    });

    it('reads a lean enemy without optional fields (D-01)', () => {
        const _id = new Types.ObjectId();

        expect(enemyCandidateOf({ _id }, new Set())).toEqual({
            id: _id.toHexString(),
            name: '',
            xp: 0,
            locations: [],
            legendary: undefined,
            relatedLore: [],
            baseWeaknesses: [],
            energyWeaknesses: [],
            animal: false,
        });
    });
});
