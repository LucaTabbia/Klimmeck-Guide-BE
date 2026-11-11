import { model, Schema, Types } from 'mongoose';
import { buildEquipmentItem } from '../../test/fixtures/catalog-item.fixture';
import { buildCity } from '../../test/fixtures/city.fixture';
import { buildPet } from '../../test/fixtures/pet.fixture';
import { CharacterAssetsSchema } from './character/character-assets.model';
import { CitySchema } from './city.model';
import { EquipmentItemSchema } from './equipment-item.model';
import { LootItemSchema } from './loot-item.model';
import { PetSchema } from './pet.model';

const CityProbe = model('ShopFieldsCityProbe', CitySchema);
const PetProbe = model('ShopFieldsPetProbe', PetSchema);
const EquipmentProbe = model('ShopFieldsEquipmentProbe', EquipmentItemSchema);
const AssetsProbe = model('ShopFieldsAssetsProbe', CharacterAssetsSchema);

interface ReferenceListPath {
    instance: string;
    caster: { instance: string; options: { ref: string } };
}

function referenceListPath(
    path: string,
    schema: Schema = CitySchema,
): ReferenceListPath {
    return schema.path(path) as unknown as ReferenceListPath;
}

describe('city shop pool fields', () => {
    it('leaves the three pool lists absent on create (D-22)', () => {
        const city = new CityProbe(buildCity()).toObject();

        expect(
            Object.keys(city).filter((key) => key.startsWith('shop')),
        ).toEqual([]);
    });

    it('keeps a stored empty pool list empty (D-03)', () => {
        const city = CityProbe.hydrate({
            ...buildCity(),
            shopLoot: [],
        }).toObject();

        expect(city.shopLoot).toEqual([]);
        expect(city.shopEquipment).toBeUndefined();
    });

    it.each([
        ['shopEquipment', 'EquipmentItem'],
        ['shopLoot', 'LootItem'],
        ['shopPets', 'Pet'],
    ])('stores the pool lists as typed references (D-03): %s', (path, ref) => {
        const schemaPath = referenceListPath(path);

        expect({
            instance: schemaPath.instance,
            caster: schemaPath.caster.instance,
            ref: schemaPath.caster.options.ref,
        }).toEqual({ instance: 'Array', caster: 'ObjectId', ref });
    });
});

describe('catalogue sellable', () => {
    it('declares sellable as an optional Boolean on the catalogue schemas (D-07)', () => {
        expect({
            equipment: EquipmentItemSchema.path('sellable')?.instance,
            loot: LootItemSchema.path('sellable')?.instance,
            pet: PetSchema.path('sellable')?.instance,
        }).toEqual({ equipment: 'Boolean', loot: 'Boolean', pet: 'Boolean' });
    });

    it('leaves sellable absent when a catalogue document has none (D-16)', () => {
        const pet = new PetProbe(buildPet()).toObject();
        const equipment = new EquipmentProbe(buildEquipmentItem()).toObject();

        expect('sellable' in pet).toBe(false);
        expect('sellable' in equipment).toBe(false);
    });

    it('keeps a stored false (D-05)', () => {
        const pet = PetProbe.hydrate({
            ...buildPet(),
            sellable: false,
        }).toObject();

        expect(pet.sellable).toBe(false);
    });
});

describe('character owned pets', () => {
    it('defaults ownedPets to an empty list (D-13)', () => {
        expect(new AssetsProbe({}).toObject().ownedPets).toEqual([]);
    });

    it('stores the owned pets as entries with a typed reference to the catalogue (D-03)', () => {
        const entry = CharacterAssetsSchema.path('ownedPets').schema;
        const pet = entry?.path('pet') as unknown as
            | { instance: string; options: { ref: string } }
            | undefined;

        expect({ instance: pet?.instance, ref: pet?.options.ref }).toEqual({
            instance: 'ObjectId',
            ref: 'Pet',
        });
        expect(Object.keys(entry?.paths ?? {}).sort()).toEqual([
            'currentLifePoints',
            'pet',
            'xp',
        ]);
    });

    it('defaults the experience of an owned pet to 0 and requires its life points (D-03)', () => {
        const pet = new Types.ObjectId();

        const stored = new AssetsProbe({
            ownedPets: [{ pet, currentLifePoints: 80 }],
        });
        const lifeless = new AssetsProbe({ ownedPets: [{ pet }] });

        expect(stored.toObject().ownedPets).toEqual([
            { pet, xp: 0, currentLifePoints: 80 },
        ]);
        expect(Object.keys(lifeless.validateSync()?.errors ?? {})).toEqual([
            'ownedPets.0.currentLifePoints',
        ]);
    });
});
