import { model } from 'mongoose';
import { buildCity } from '../../test/fixtures/city.fixture';
import { CitySchema } from './city.model';

const CityProbe = model('ShopFieldsCityProbe', CitySchema);

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
