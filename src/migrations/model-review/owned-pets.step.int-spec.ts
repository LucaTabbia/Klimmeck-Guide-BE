// UNA TANTUM (Phase 19 D-12): prova sul replica set il passo dei pet posseduti con documenti grezzi — esce dal repo dopo il boot reale
import { Logger } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import {
    Character,
    CharacterSchema,
} from 'src/models/character/character.model';
import { Pet, PetSchema } from 'src/models/pet.model';
import {
    AuthTestApp,
    createAuthTestApp,
} from '../../../test/auth/auth-test-app';
import { buildPet } from '../../../test/fixtures/pet.fixture';
import {
    insertLegacy,
    legacyCharacterWithPets,
    rawById,
    writeAfterNextRead,
} from './legacy-fixtures';
import { OwnedPetsStep } from './owned-pets.step';

describe('OwnedPetsStep (replSet)', () => {
    let harness: AuthTestApp;
    let step: OwnedPetsStep;

    const insertCatalogPet = (maxLifePoints: number): Promise<Types.ObjectId> =>
        insertLegacy(harness.connection, Pet.name, buildPet({ maxLifePoints }));

    const insertCharacter = (
        petRefs: readonly unknown[],
        overrides: Record<string, unknown> = {},
    ): Promise<Types.ObjectId> =>
        insertLegacy(
            harness.connection,
            Character.name,
            legacyCharacterWithPets(petRefs, overrides),
        );

    const rawCharacter = (id: Types.ObjectId) =>
        rawById(harness.connection, Character.name, id);

    const assetsOf = async (id: Types.ObjectId) =>
        (await rawCharacter(id))?.assets as Record<string, unknown>;

    beforeAll(async () => {
        harness = await createAuthTestApp({
            imports: [
                MongooseModule.forFeature([
                    { name: Character.name, schema: CharacterSchema },
                    { name: Pet.name, schema: PetSchema },
                ]),
            ],
            providers: [OwnedPetsStep],
        });
        step = harness.app.get(OwnedPetsStep);
    });

    afterEach(async () => {
        await harness.clearDatabase();
    });

    afterAll(async () => {
        await harness.close();
    });

    it('migrates the owned pets of an active character (D-03)', async () => {
        const mastiff = await insertCatalogPet(10);
        const horse = await insertCatalogPet(25);
        const id = await insertCharacter([mastiff, horse.toHexString()], {
            assets: { pet: horse },
        });
        const before = await rawCharacter(id);

        await expect(step.run()).resolves.toEqual({
            found: 1,
            migrated: 1,
            alreadyDone: 0,
            unmatched: 0,
        });

        expect(await rawCharacter(id)).toEqual({
            ...before,
            assets: {
                ...(before?.assets as Record<string, unknown>),
                ownedPets: [
                    { pet: mastiff, xp: 0, currentLifePoints: 10 },
                    { pet: horse, xp: 0, currentLifePoints: 25 },
                ],
            },
        });
        expect((await assetsOf(id)).pet).toEqual(horse);
    });

    it('migrates an archived character too (D-03)', async () => {
        const mastiff = await insertCatalogPet(10);
        const archived = await insertCharacter([mastiff], {
            deletedAt: new Date('2026-10-01T00:00:00.000Z'),
        });
        const active = await insertCharacter([mastiff]);

        await expect(step.run()).resolves.toEqual({
            found: 2,
            migrated: 2,
            alreadyDone: 0,
            unmatched: 0,
        });

        const entries = [{ pet: mastiff, xp: 0, currentLifePoints: 10 }];
        expect((await assetsOf(archived)).ownedPets).toEqual(entries);
        expect((await assetsOf(active)).ownedPets).toEqual(entries);
    });

    it('counts an orphan entry and keeps the ownership (D-23)', async () => {
        const mastiff = await insertCatalogPet(10);
        const gone = new Types.ObjectId();
        const id = await insertCharacter([gone, mastiff]);

        await expect(step.run()).resolves.toEqual({
            found: 1,
            migrated: 1,
            alreadyDone: 0,
            unmatched: 1,
        });

        expect((await assetsOf(id)).ownedPets).toEqual([
            { pet: gone, xp: 0, currentLifePoints: 0 },
            { pet: mastiff, xp: 0, currentLifePoints: 10 },
        ]);
    });

    it('leaves for the next boot a character written while the step runs (C-WR-02)', async () => {
        const mastiff = await insertCatalogPet(10);
        const horse = await insertCatalogPet(25);
        const id = await insertCharacter([mastiff]);
        const prize = { pet: horse, xp: 0, currentLifePoints: 25 };
        const characters = harness.connection.model(Character.name).collection;
        const warnSpy = jest
            .spyOn(Logger.prototype, 'warn')
            .mockImplementation(() => undefined);
        // un pet in premio cade fra la lettura e la scrittura del passo
        writeAfterNextRead(harness.connection, Character.name, () =>
            characters.updateOne(
                { _id: id },
                { $set: { 'assets.ownedPets': [mastiff, prize] } },
            ),
        );

        await expect(step.run()).resolves.toEqual({
            found: 1,
            migrated: 0,
            alreadyDone: 0,
            unmatched: 1,
        });

        expect((await assetsOf(id)).ownedPets).toEqual([mastiff, prize]);
        expect(warnSpy.mock.calls).toEqual([
            [
                `Revisione dei modelli, pet posseduti: personaggio ${id.toHexString()} cambiato durante il passo, scrittura non applicata: si ritenta al prossimo boot`,
            ],
        ]);
        warnSpy.mockRestore();

        await expect(step.run()).resolves.toEqual({
            found: 1,
            migrated: 1,
            alreadyDone: 0,
            unmatched: 0,
        });
        expect((await assetsOf(id)).ownedPets).toEqual([
            { pet: mastiff, xp: 0, currentLifePoints: 10 },
            prize,
        ]);
    });

    it('skips a character without owned pets or already migrated (D-03)', async () => {
        const mastiff = await insertCatalogPet(10);
        const ids = [
            await insertCharacter([]),
            await insertCharacter([], { assets: { ownedPets: undefined } }),
            await insertCharacter([
                { pet: mastiff, xp: 40, currentLifePoints: 12 },
            ]),
        ];
        const before = await Promise.all(ids.map(rawCharacter));

        await expect(step.run()).resolves.toEqual({
            found: 3,
            migrated: 0,
            alreadyDone: 3,
            unmatched: 0,
        });

        expect(await Promise.all(ids.map(rawCharacter))).toEqual(before);
    });

    it('changes nothing on a second run (D-03)', async () => {
        const mastiff = await insertCatalogPet(10);
        const ids = [
            await insertCharacter([mastiff, new Types.ObjectId()]),
            await insertCharacter([
                { pet: mastiff, xp: 40, currentLifePoints: 12 },
                mastiff.toHexString(),
            ]),
            await insertCharacter([]),
        ];
        await step.run();
        const afterFirstRun = await Promise.all(ids.map(rawCharacter));

        await expect(step.run()).resolves.toEqual({
            found: 3,
            migrated: 0,
            alreadyDone: 3,
            unmatched: 0,
        });

        expect(await Promise.all(ids.map(rawCharacter))).toEqual(afterFirstRun);
    });

    it('reports zero on an empty collection (D-12)', async () => {
        await expect(step.run()).resolves.toEqual({
            found: 0,
            migrated: 0,
            alreadyDone: 0,
            unmatched: 0,
        });
    });
});
