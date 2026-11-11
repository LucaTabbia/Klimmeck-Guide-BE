import { Model, Types } from 'mongoose';
import type request from 'supertest';
import { RarityType } from 'src/models/enums/rarity-type.enum';
import { Pet, PetSchema } from 'src/models/pet.model';
import {
    AuthTestApp,
    createAuthTestApp,
    graphqlRequest,
} from '../../test/auth/auth-test-app';
import { createPlayer } from '../../test/authz/player-fixture';
import { buildPet, persistPet } from '../../test/fixtures/pet.fixture';
import { PetsModule } from './pets.module';

const PETS = 'query { pets { id name rarity } }';
const PET = 'query Pet($id: String!) { pet(id: $id) { id rarity } }';

interface WirePet {
    id: string;
    name?: string;
    rarity: string | null;
}

interface WireBody {
    data?: { pets?: WirePet[]; pet?: WirePet } | null;
    errors?: { message: string; path?: (string | number)[] }[];
}

function bodyOf(response: request.Response): WireBody {
    return response.body as WireBody;
}

describe('pet rarity (wire)', () => {
    let harness: AuthTestApp;
    let bearer: string;
    let petModel: Model<any>;

    async function request(query: string, variables?: Record<string, unknown>) {
        return bodyOf(
            await graphqlRequest(harness.app, query, variables, bearer),
        );
    }

    beforeAll(async () => {
        harness = await createAuthTestApp({ imports: [PetsModule] });
    });

    beforeEach(async () => {
        await harness.clearDatabase();
        petModel =
            harness.connection.models[Pet.name] ??
            harness.connection.model(Pet.name, PetSchema);
        ({ bearer } = await createPlayer(harness, {
            twitchId: 'twitch-pet-rarity-reader',
        }));
    });

    afterAll(async () => {
        await harness.clearDatabase();
        await harness.close();
    });

    it('serves a null rarity for a pet stored without it (D-27)', async () => {
        const { insertedId } = await petModel.collection.insertOne(
            buildPet({ rarity: undefined }),
            { ignoreUndefined: true },
        );

        const body = await request(PET, { id: String(insertedId) });

        expect(body.errors).toBeUndefined();
        expect(body.data?.pet).toEqual({
            id: String(insertedId),
            rarity: null,
        });
    });

    it('serves the curated rarity of a pet (D-27)', async () => {
        const pet = (await persistPet(petModel, {
            rarity: RarityType.ultrarare,
        })) as { _id: Types.ObjectId };

        const body = await request(PET, { id: String(pet._id) });

        expect(body.errors).toBeUndefined();
        expect(body.data?.pet).toEqual({
            id: String(pet._id),
            rarity: 'ultrarare',
        });
    });

    it('nulls only the rarity of a pet stored outside the enum and keeps the list (D-27)', async () => {
        await petModel.collection.insertOne(
            buildPet({ name: 'Fuori enum', rarity: 'mythic' }),
        );
        await persistPet(petModel, {
            name: 'Curato',
            rarity: RarityType.common,
        });

        const body = await request(PETS);

        expect(
            body.data?.pets
                ?.map(({ name, rarity }) => ({ name, rarity }))
                .sort((a, b) => String(a.name).localeCompare(String(b.name))),
        ).toEqual([
            { name: 'Curato', rarity: 'common' },
            { name: 'Fuori enum', rarity: null },
        ]);
        expect(body.errors?.map((error) => error.path?.at(-1))).toEqual([
            'rarity',
        ]);
    });
});
