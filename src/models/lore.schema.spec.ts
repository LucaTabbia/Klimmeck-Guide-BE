import { LoreSchema } from './lore.model';

const LORE_PATHS = [
    '_id',
    'description',
    'imagePath',
    'name',
    'relatedLore',
    'type',
];

describe('lore schema', () => {
    it('declares the image path of a lore and no other image field (D-11)', () => {
        expect(Object.keys(LoreSchema.paths).sort()).toEqual(LORE_PATHS);
    });
});
