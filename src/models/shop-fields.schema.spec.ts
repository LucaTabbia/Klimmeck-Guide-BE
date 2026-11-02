import { model } from 'mongoose';
import { buildEquipmentItem } from '../../test/fixtures/catalog-item.fixture';
import { buildCity } from '../../test/fixtures/city.fixture';
import { buildPet } from '../../test/fixtures/pet.fixture';
import { CitySchema } from './city.model';
import { EquipmentItemSchema } from './equipment-item.model';
import { LootItemSchema } from './loot-item.model';
import { PetSchema } from './pet.model';

const CityProbe = model('ShopFieldsCityProbe', CitySchema);
const PetProbe = model('ShopFieldsPetProbe', PetSchema);
const EquipmentProbe = model('ShopFieldsEquipmentProbe', EquipmentItemSchema);

interface ReferenceListPath {
    instance: string;
    caster: { instance: string; options: { ref: string } };
}

function referenceListPath(path: string): ReferenceListPath {
    return CitySchema.path(path) as unknown as ReferenceListPath;
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
