import { Logger } from '@nestjs/common';
import mongoose, { Model, Types } from 'mongoose';
import {
    Character,
    CharacterDocument,
    CharacterSchema,
} from 'src/models/character/character.model';
import { buildCharacter } from '../../../test/fixtures';
import { OwnedPetsMigrator } from './owned-pets.migrator';

const CharacterModel: Model<CharacterDocument> =
    mongoose.models.Character ||
    mongoose.model(Character.name, CharacterSchema);

interface RawAssets {
    pet?: unknown;
    ownedPets?: unknown[] | null;
}

// nome unico: l'indice character_name_active_ci_unique vale anche per gli insert grezzi
let heroes = 0;

// documento grezzo: senza ownedPets quando assente, come i personaggi scritti prima della fase (nessun default di Mongoose)
function rawCharacter({ pet, ownedPets }: RawAssets) {
    const base = buildCharacter();
    heroes += 1;
    const assets: Record<string, unknown> = { ...base.assets, pet };
    if (ownedPets !== undefined) assets.ownedPets = ownedPets;
    return {
        _id: new Types.ObjectId(),
        ...base,
        infos: { ...base.infos, name: `Pet Owner ${heroes}` },
        assets,
    };
}

async function insertRaw(assets: RawAssets): Promise<Types.ObjectId> {
    const character = rawCharacter(assets);
    await CharacterModel.collection.insertOne(character);
    return character._id;
}

async function rawOf(id: Types.ObjectId) {
    return CharacterModel.collection.findOne({ _id: id });
}

async function ownedPetsOf(id: Types.ObjectId): Promise<unknown> {
    const raw = await rawOf(id);
    return (raw?.assets as RawAssets | undefined)?.ownedPets;
}

describe('OwnedPetsMigrator', () => {
    let migrator: OwnedPetsMigrator;
    let petId: Types.ObjectId;

    beforeEach(() => {
        migrator = new OwnedPetsMigrator(CharacterModel as never);
        jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
        petId = new Types.ObjectId();
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('adds the equipped pet to the owned pets (D-16)', async () => {
        const otherPet = new Types.ObjectId();
        const id = await insertRaw({ pet: petId, ownedPets: [otherPet] });

        const report = await migrator.migrate();

        expect(report).toEqual({ owned: 1 });
        expect(await ownedPetsOf(id)).toEqual([otherPet, petId]);
    });

    it('creates the list on a legacy character stored without it (D-16)', async () => {
        const id = await insertRaw({ pet: petId });

        const report = await migrator.migrate();

        expect(report).toEqual({ owned: 1 });
        expect(await ownedPetsOf(id)).toEqual([petId]);
    });

    it('never duplicates a pet already owned as ObjectId or as hex string (D-16)', async () => {
        const asObjectId = await insertRaw({ pet: petId, ownedPets: [petId] });
        const asHex = await insertRaw({
            pet: petId,
            ownedPets: [petId.toHexString()],
        });

        const report = await migrator.migrate();

        expect(report).toEqual({ owned: 0 });
        expect(await ownedPetsOf(asObjectId)).toEqual([petId]);
        expect(await ownedPetsOf(asHex)).toEqual([petId.toHexString()]);
    });

    it('tolerates an equipped pet stored as a hex string (D-16)', async () => {
        const id = await insertRaw({ pet: petId.toHexString(), ownedPets: [] });

        const report = await migrator.migrate();

        expect(report).toEqual({ owned: 1 });
        const owned = (await ownedPetsOf(id)) as unknown[];
        expect(owned).toEqual([petId]);
        expect(owned[0]).toBeInstanceOf(Types.ObjectId);
    });

    it('leaves the characters without an equipped pet untouched (D-16)', async () => {
        const withNull = await insertRaw({ pet: null });
        const withEmptyList = await insertRaw({ pet: null, ownedPets: [] });
        const before = [await rawOf(withNull), await rawOf(withEmptyList)];

        const report = await migrator.migrate();

        expect(report).toEqual({ owned: 0 });
        expect([await rawOf(withNull), await rawOf(withEmptyList)]).toEqual(
            before,
        );
    });

    it('migrates every character even after one stored with a null list (D-16)', async () => {
        const withNullList = await insertRaw({ pet: petId, ownedPets: null });
        const valid = await insertRaw({ pet: petId, ownedPets: [] });

        const report = await migrator.migrate();

        expect({
            report,
            withNullList: await ownedPetsOf(withNullList),
            valid: await ownedPetsOf(valid),
        }).toEqual({
            report: { owned: 2 },
            withNullList: [petId],
            valid: [petId],
        });
    });

    it('is idempotent (D-16)', async () => {
        await insertRaw({ pet: petId });
        await insertRaw({ pet: petId.toHexString(), ownedPets: [] });
        await insertRaw({ pet: null });
        await migrator.migrate();
        const before = await CharacterModel.collection
            .find({})
            .sort({ _id: 1 })
            .toArray();

        const report = await migrator.migrate();

        expect(report).toEqual({ owned: 0 });
        expect(
            await CharacterModel.collection.find({}).sort({ _id: 1 }).toArray(),
        ).toEqual(before);
    });
});
