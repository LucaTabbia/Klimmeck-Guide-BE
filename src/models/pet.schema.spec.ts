import { model } from 'mongoose';
import { buildPet } from '../../test/fixtures/pet.fixture';
import { RarityType } from './enums/rarity-type.enum';
import { PetSchema } from './pet.model';

const PetProbe = model('PetSchemaProbe', PetSchema);

const STORED_WITHOUT_ATTACK_AND_DEFENSE = {
    name: 'Non migrato',
    maxXp: 100,
    maxLifePoints: 10,
};

const EMPTY_DAMAGES = { base: [], energy: [] };

const CATALOGUE_PATHS = [
    '__v',
    '_id',
    'attack',
    'buyPrice',
    'defense',
    'imagePath',
    'maxLifePoints',
    'maxXp',
    'name',
    'rarity',
    'relatedLore',
    'sellPrice',
    'sellable',
    'speedModifier',
];

describe('catalogue pet schema', () => {
    it('hydrates a stored pet without attack and defense with two empty damages (D-15)', () => {
        const pet = PetProbe.hydrate(
            STORED_WITHOUT_ATTACK_AND_DEFENSE,
        ).toObject();

        expect(pet.attack).toEqual(EMPTY_DAMAGES);
        expect(pet.defense).toEqual(EMPTY_DAMAGES);
    });

    it('keeps the attack and the defense given at creation (D-15)', () => {
        const attack = { base: [{ type: 'cut', power: 30 }], energy: [] };
        const defense = { base: [], energy: [{ type: 'fire', power: 20 }] };

        const pet = new PetProbe(buildPet({ attack, defense })).toObject();

        expect(pet.attack).toEqual(attack);
        expect(pet.defense).toEqual(defense);
    });

    it('stores the related lore of a pet as typed references, empty by default (D-26)', () => {
        const path = PetSchema.path('relatedLore') as unknown as {
            instance: string;
            caster?: { instance: string; options?: { ref?: unknown } };
            options?: { ref?: unknown };
        };

        expect({
            instance: path?.instance,
            caster: path?.caster?.instance,
            ref: path?.options?.ref ?? path?.caster?.options?.ref,
        }).toEqual({ instance: 'Array', caster: 'ObjectId', ref: 'Lore' });
        expect(
            new PetProbe(STORED_WITHOUT_ATTACK_AND_DEFENSE).toObject()
                .relatedLore,
        ).toEqual([]);
    });

    it('leaves the rarity of a pet null until it is curated (D-27)', () => {
        const pet = new PetProbe(STORED_WITHOUT_ATTACK_AND_DEFENSE);

        expect(pet.validateSync()).toBeUndefined();
        expect(pet.toObject().rarity).toBeNull();
    });

    it.each(Object.values(RarityType))(
        'stores a rarity of the existing enum: %s (D-27)',
        (rarity) => {
            const pet = new PetProbe(buildPet({ rarity }));

            expect(pet.validateSync()).toBeUndefined();
            expect(pet.toObject().rarity).toBe(rarity);
        },
    );

    it('rejects a rarity outside the enum (D-27)', () => {
        const pet = new PetProbe(buildPet({ rarity: 'mythic' }));

        expect(Object.keys(pet.validateSync()?.errors ?? {})).toEqual([
            'rarity',
        ]);
    });

    it('declares no state on the catalogue pet (D-03)', () => {
        expect(Object.keys(PetSchema.paths).sort()).toEqual(CATALOGUE_PATHS);
    });
});
