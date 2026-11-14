import { getModelToken, MongooseModule } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
    Character,
    CharacterDocument,
    CharacterSchema,
} from 'src/models/character/character.model';
import {
    AuthTestApp,
    createAuthTestApp,
} from '../../../test/auth/auth-test-app';
import { FixedClock } from '../../../test/auth/fixed-clock';
import { buildCharacter } from '../../../test/fixtures';
import { buildOwnedPet } from '../../../test/fixtures/owned-pet.fixture';
import { normalisedOwnedPets } from './owned-pet-entry';

const MINUTE_MS = 60_000;

interface StoredAssets {
    assets: { ownedPets: Record<string, unknown>[] };
}

describe('owned pet fields (replSet)', () => {
    const clock = new FixedClock(new Date('2026-11-14T10:00:00.000Z'));
    let harness: AuthTestApp;
    let characters: Model<CharacterDocument>;

    const later = (minutes: number): Date =>
        new Date(clock.now().getTime() + minutes * MINUTE_MS);

    async function seedCharacter(
        ownedPets: Record<string, unknown>[],
    ): Promise<Types.ObjectId> {
        const base = buildCharacter();
        const { insertedId } = await characters.collection.insertOne({
            ...base,
            assets: { ...base.assets, ownedPets },
        });
        return insertedId;
    }

    async function storedPetsOf(
        id: Types.ObjectId,
    ): Promise<Record<string, unknown>[]> {
        const stored = (await characters
            .findById(id)
            .lean()
            .exec()) as unknown as StoredAssets;
        return stored.assets.ownedPets;
    }

    beforeAll(async () => {
        harness = await createAuthTestApp({
            clock,
            imports: [
                MongooseModule.forFeature([
                    { name: Character.name, schema: CharacterSchema },
                ]),
            ],
        });
        characters = harness.app.get<Model<CharacterDocument>>(
            getModelToken(Character.name),
        );
    });

    afterEach(async () => {
        await harness.clearDatabase();
    });

    afterAll(async () => {
        await harness.close();
    });

    it('stores and reads back every companion field through the character schema (D-23, D-39)', async () => {
        const wolf = new Types.ObjectId();
        const hawk = new Types.ObjectId();
        const id = await seedCharacter([]);
        const written = normalisedOwnedPets([
            {
                pet: wolf,
                xp: 22,
                currentLifePoints: 40,
                name: 'Fenrir',
                lifeAsOf: clock.now(),
                defeatedUntil: later(100),
                potionRecoveryUntil: later(30),
                level: 5,
            },
            buildOwnedPet(hawk, { xp: 4, currentLifePoints: 9 }),
        ]);
        expect(Object.keys(written[0]).sort()).toEqual([
            'currentLifePoints',
            'defeatedUntil',
            'level',
            'lifeAsOf',
            'name',
            'pet',
            'potionRecoveryUntil',
            'xp',
        ]);

        await characters
            .updateOne({ _id: id }, { $set: { 'assets.ownedPets': written } })
            .exec();

        expect(await storedPetsOf(id)).toEqual(written);
    });

    it('reads a stored entry without the new fields with no added keys (D-23)', async () => {
        const id = await seedCharacter([
            { ...buildOwnedPet(new Types.ObjectId()) },
        ]);

        const [entry] = await storedPetsOf(id);

        expect(Object.keys(entry).sort()).toEqual([
            'currentLifePoints',
            'pet',
            'xp',
        ]);
    });
});
