import { Model, Schema, Types } from 'mongoose';
import type request from 'supertest';
import { EnemiesModule } from 'src/enemies/enemies.module';
import { Enemy, EnemySchema } from 'src/models/enemy.model';
import { RoleType } from 'src/models/enums/role-type.enum';
import { Pet, PetSchema } from 'src/models/pet.model';
import { PetsModule } from 'src/pets/pets.module';
import {
    AuthTestApp,
    createAuthTestApp,
    graphqlRequest,
} from '../auth/auth-test-app';
import { persistEnemy } from '../fixtures';
import { persistPet } from '../fixtures/pet.fixture';
import { createPlayer } from './player-fixture';

const ENEMIES =
    'query { enemys { id name lifePoints damages { base { type power } } weaknesses { base energy } } }';
const PETS =
    'query { pets { id name attack { base { type power } } defense { base { type power } } } }';
const ENEMY = 'query Enemy($id: String!) { enemy(id: $id) { id name } }';
const PET = 'query Pet($id: String!) { pet(id: $id) { id name } }';

interface WireBody {
    data?: {
        enemys?: { id: string; name: string }[];
        pets?: { id: string; name: string }[];
        enemy?: { id: string };
        pet?: { id: string };
    } | null;
    errors?: { message: string; extensions?: { code?: unknown } }[];
}

// il catalogo intero di nemici e pet è dell'oste (quick 261123-lcv): il giocatore riceve le creature dalle lore che ha sbloccato
describe('the whole catalogue of enemies and pets (quick 261123-lcv)', () => {
    let harness: AuthTestApp;
    let player: string;
    let innkeeper: string;
    let wolf: { _id: Types.ObjectId };
    let hawk: { _id: Types.ObjectId };

    function modelOf(name: string, schema: Schema): Model<any> {
        return (
            harness.connection.models[name] ??
            harness.connection.model(name, schema)
        );
    }

    async function ask(
        query: string,
        bearer: string,
        variables?: Record<string, unknown>,
    ): Promise<WireBody> {
        const response: request.Response = await graphqlRequest(
            harness.app,
            query,
            variables,
            bearer,
        );
        return response.body as WireBody;
    }

    beforeAll(async () => {
        harness = await createAuthTestApp({
            imports: [EnemiesModule, PetsModule],
        });
    });

    beforeEach(async () => {
        await harness.clearDatabase();
        wolf = await persistEnemy(modelOf(Enemy.name, EnemySchema), {
            name: 'Lupo',
        });
        hawk = await persistPet(modelOf(Pet.name, PetSchema), {
            name: 'Falco',
        });
        ({ bearer: player } = await createPlayer(harness, {
            twitchId: 'twitch-catalogue-player',
        }));
        ({ bearer: innkeeper } = await createPlayer(harness, {
            twitchId: 'twitch-catalogue-innkeeper',
            role: RoleType.innkeeper,
            withCharacter: false,
        }));
    });

    afterAll(async () => {
        await harness.clearDatabase();
        await harness.close();
    });

    it.each([
        ['enemys', ENEMIES],
        ['pets', PETS],
    ])('refuses %s to a player with the roles error', async (_name, query) => {
        const body = await ask(query, player);

        expect(body.data ?? null).toBeNull();
        expect(body.errors).toHaveLength(1);
        expect(body.errors?.[0]?.extensions?.code).toBe('FORBIDDEN');
    });

    it('serves the innkeeper every enemy, whole', async () => {
        const body = await ask(ENEMIES, innkeeper);

        expect(body.errors).toBeUndefined();
        expect(body.data?.enemys).toEqual([
            {
                id: String(wolf._id),
                name: 'Lupo',
                lifePoints: 1000,
                damages: { base: [{ type: 'cut', power: 100 }] },
                weaknesses: { base: [], energy: [] },
            },
        ]);
    });

    it('serves the innkeeper every pet, whole', async () => {
        const body = await ask(PETS, innkeeper);

        expect(body.errors).toBeUndefined();
        expect(body.data?.pets).toEqual([
            {
                id: String(hawk._id),
                name: 'Falco',
                attack: { base: [] },
                defense: { base: [] },
            },
        ]);
    });

    it('leaves the single enemy and the single pet as they were, open to a player', async () => {
        const enemy = await ask(ENEMY, player, { id: String(wolf._id) });
        const pet = await ask(PET, player, { id: String(hawk._id) });

        expect(enemy.errors).toBeUndefined();
        expect(enemy.data?.enemy?.id).toBe(String(wolf._id));
        expect(pet.errors).toBeUndefined();
        expect(pet.data?.pet?.id).toBe(String(hawk._id));
    });
});
