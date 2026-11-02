import { Logger } from '@nestjs/common';
import mongoose, { Model, Types } from 'mongoose';
import { Pet, PetDocument, PetSchema } from 'src/models/pet.model';
import { persistPet } from '../../../test/fixtures';
import { SELLABLE_PET_IDS } from '../shop-pool.constants';
import { PetSellableMigrator } from './pet-sellable.migrator';

const PetModel: Model<PetDocument> =
    mongoose.models.Pet || mongoose.model(Pet.name, PetSchema);

const SHOP_PET_NAMES = [
    'Cavallo leggero',
    'Cammello del Mar Sabbioso',
    'Tartaruga gigante delle isole',
    'Cavallo da viaggio',
];

interface RawPet {
    _id: Types.ObjectId;
    name: string;
    sellable?: boolean | null;
}

describe('PetSellableMigrator', () => {
    let migrator: PetSellableMigrator;
    let logSpy: jest.SpyInstance;
    let shopPetIds: Types.ObjectId[];
    let pegasoId: Types.ObjectId;
    let worgId: Types.ObjectId;

    beforeEach(async () => {
        migrator = new PetSellableMigrator(PetModel as never);
        logSpy = jest
            .spyOn(Logger.prototype, 'log')
            .mockImplementation(() => undefined);
        shopPetIds = SELLABLE_PET_IDS.map((id) => new Types.ObjectId(id));
        for (const [index, _id] of shopPetIds.entries())
            await persistPet(PetModel, { _id, name: SHOP_PET_NAMES[index] });
        pegasoId = (await persistPet(PetModel, { name: 'Pegaso' }))
            ._id as Types.ObjectId;
        worgId = (await persistPet(PetModel, { name: 'Worg' }))
            ._id as Types.ObjectId;
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    async function rawPets(): Promise<RawPet[]> {
        return (await PetModel.collection
            .find({}, { projection: { name: 1, sellable: 1 } })
            .sort({ _id: 1 })
            .toArray()) as unknown as RawPet[];
    }

    async function sellableOf(id: Types.ObjectId): Promise<unknown> {
        const pet = (await PetModel.collection.findOne({
            _id: id,
        })) as RawPet | null;
        return pet?.sellable;
    }

    it('marks the four shop pets sellable where the field is missing (D-10, D-16)', async () => {
        const report = await migrator.migrate();

        expect(report.sellable).toBe(4);
        for (const id of shopPetIds) expect(await sellableOf(id)).toBe(true);
    });

    it('marks every other pet quest-only where the field is missing (D-10, D-16)', async () => {
        const report = await migrator.migrate();

        expect(report).toEqual({ sellable: 4, questOnly: 2 });
        expect(await sellableOf(pegasoId)).toBe(false);
        expect(await sellableOf(worgId)).toBe(false);
    });

    it('fills a null sellable too (D-16)', async () => {
        await PetModel.collection.updateOne(
            { _id: shopPetIds[0] },
            { $set: { sellable: null } },
        );
        await PetModel.collection.updateOne(
            { _id: worgId },
            { $set: { sellable: null } },
        );

        const report = await migrator.migrate();

        expect(report).toEqual({ sellable: 4, questOnly: 2 });
        expect(await sellableOf(shopPetIds[0])).toBe(true);
        expect(await sellableOf(worgId)).toBe(false);
    });

    it('never overwrites a sellable chosen in the database (D-16)', async () => {
        await PetModel.collection.updateOne(
            { _id: shopPetIds[0] },
            { $set: { sellable: false } },
        );
        await PetModel.collection.updateOne(
            { _id: pegasoId },
            { $set: { sellable: true } },
        );

        const report = await migrator.migrate();

        expect(report).toEqual({ sellable: 3, questOnly: 1 });
        expect(await sellableOf(shopPetIds[0])).toBe(false);
        expect(await sellableOf(pegasoId)).toBe(true);
    });

    it('is idempotent (D-16)', async () => {
        await migrator.migrate();
        const afterFirst = await rawPets();

        const second = await migrator.migrate();

        expect(second).toEqual({ sellable: 0, questOnly: 0 });
        expect(await rawPets()).toEqual(afterFirst);
    });

    it('logs counts only (D-16)', async () => {
        await migrator.migrate();

        const messages = logSpy.mock.calls.map(([message]) => String(message));
        expect(messages).toHaveLength(1);
        expect(messages[0]).not.toMatch(/[0-9a-f]{24}/);
    });
});
