import { Types } from 'mongoose';
import { activeCharacterById } from 'src/models/character/active-character.filter';
import {
    classifyEquipPetFailure,
    equipPetFilter,
    equipPetUpdate,
} from './equip-pet.updates';

describe('companion updates', () => {
    const c = new Types.ObjectId();
    const p = new Types.ObjectId();

    it('matches only a character that owns the pet in one of its entries (D-03)', () => {
        const filter = equipPetFilter(c, p);

        expect(filter).toEqual({
            ...activeCharacterById(c),
            'assets.ownedPets.pet': { $in: [p, p.toHexString()] },
        });
        expect(Object.keys(filter).sort()).toEqual([
            '_id',
            'assets.ownedPets.pet',
            'deletedAt',
        ]);
    });

    it('sets the companion slot or empties it (D-15)', () => {
        expect(equipPetUpdate(p)).toEqual({ $set: { 'assets.pet': p } });
        expect(equipPetUpdate(null)).toEqual({ $set: { 'assets.pet': null } });
    });

    it('classifies a failure as PET_NOT_OWNED or NOT_FOUND (D-15)', () => {
        expect(classifyEquipPetFailure(true)).toMatchObject({
            code: 'PET_NOT_OWNED',
        });
        expect(classifyEquipPetFailure(false)).toMatchObject({
            code: 'NOT_FOUND',
        });
    });
});
