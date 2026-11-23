import { getModelToken } from '@nestjs/mongoose';
import { Model, Schema, Types } from 'mongoose';
import type request from 'supertest';
import type { AuthIdentity } from 'src/auth/auth-identity';
import { EnemiesModule } from 'src/enemies/enemies.module';
import { Character } from 'src/models/character/character.model';
import { Enemy, EnemySchema } from 'src/models/enemy.model';
import { RoleType } from 'src/models/enums/role-type.enum';
import { Lore, LoreSchema } from 'src/models/lore.model';
import { Pet, PetSchema } from 'src/models/pet.model';
import { PetsModule } from 'src/pets/pets.module';
import {
    AuthTestApp,
    createAuthTestApp,
    graphqlRequest,
} from '../../test/auth/auth-test-app';
import { createPlayer, type TestPlayer } from '../../test/authz/player-fixture';
import { persistEnemy, persistLore } from '../../test/fixtures';
import { persistPet } from '../../test/fixtures/pet.fixture';
import { playerKnowing } from '../../test/lore/lore-world';
import { LoreCreatureResolver } from './lore-creature.resolver';
import { LoreModule } from './lore.module';

const LORES =
    'query { lores { id enemy { id name damages { base { type power } } weaknesses { base energy } relatedLore { id } } pet { id name attack { base { type power } } defense { base { type power } } relatedLore { id } } } }';
const LORE =
    'query lore($id: String!) { lore(id: $id) { id enemy { id name } pet { id name } } }';

interface WireCreature {
    id: string;
    name: string;
    relatedLore?: { id: string }[];
}

interface WireLore {
    id: string;
    enemy: WireCreature | null;
    pet: WireCreature | null;
}

interface WireBody {
    data?: { lores?: WireLore[]; lore?: WireLore } | null;
    errors?: { message: string; extensions?: { code?: unknown } }[];
}

type Persisted = { _id: Types.ObjectId };

describe('the creature of a lore on the wire (quick 261123-lcv)', () => {
    let harness: AuthTestApp;
    let reader: TestPlayer;
    let stranger: TestPlayer;
    let enemyLore: Persisted;
    let petLore: Persisted;
    let plainLore: Persisted;
    let lockedLore: Persisted;

    function modelOf(name: string, schema: Schema): Model<any> {
        return (
            harness.connection.models[name] ??
            harness.connection.model(name, schema)
        );
    }

    const enemies = () => modelOf(Enemy.name, EnemySchema);
    const pets = () => modelOf(Pet.name, PetSchema);

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

    function loreOf(body: WireBody, lore: Persisted): WireLore | undefined {
        return body.data?.lores?.find((entry) => entry.id === String(lore._id));
    }

    function identityOf(player: TestPlayer): AuthIdentity {
        return {
            userId: String((player.user as unknown as Persisted)._id),
            twitchId: 'twitch',
            role: RoleType.adventurer,
        };
    }

    async function innkeeperBearer(): Promise<string> {
        const innkeeper = await createPlayer(harness, {
            twitchId: 'twitch-creature-innkeeper',
            role: RoleType.innkeeper,
            withCharacter: false,
        });
        return innkeeper.bearer;
    }

    beforeAll(async () => {
        harness = await createAuthTestApp({
            imports: [LoreModule, EnemiesModule, PetsModule],
        });
    });

    beforeEach(async () => {
        await harness.clearDatabase();
        const lore = modelOf(Lore.name, LoreSchema);
        enemyLore = await persistLore(lore, { name: 'Lupo' });
        petLore = await persistLore(lore, { name: 'Falco' });
        plainLore = await persistLore(lore, { name: 'Storia' });
        lockedLore = await persistLore(lore, { name: 'Drago' });
        reader = await playerKnowing(harness, {
            twitchId: 'twitch-creature-reader',
            lore: [enemyLore._id, petLore._id, plainLore._id],
        });
        stranger = await playerKnowing(harness, {
            twitchId: 'twitch-creature-stranger',
            lore: [plainLore._id],
        });
    });

    afterAll(async () => {
        await harness.clearDatabase();
        await harness.close();
    });

    it('serves the enemy and the pet of the lore the viewer unlocked', async () => {
        const wolf = await persistEnemy(enemies(), {
            name: 'Lupo',
            relatedLore: [enemyLore._id],
        });
        const hawk = await persistPet(pets(), {
            name: 'Falco',
            relatedLore: [petLore._id],
        });

        const body = await ask(LORES, reader.bearer);

        expect(body.errors).toBeUndefined();
        expect(loreOf(body, enemyLore)).toMatchObject({
            enemy: {
                id: String(wolf._id),
                name: 'Lupo',
                damages: { base: [{ type: 'cut', power: 100 }] },
                relatedLore: [{ id: String(enemyLore._id) }],
            },
            pet: null,
        });
        expect(loreOf(body, petLore)).toMatchObject({
            enemy: null,
            pet: {
                id: String(hawk._id),
                name: 'Falco',
                relatedLore: [{ id: String(petLore._id) }],
            },
        });
    });

    it('leaves both fields null on a lore that belongs to no creature', async () => {
        await persistEnemy(enemies(), { relatedLore: [enemyLore._id] });
        await persistPet(pets(), { relatedLore: [petLore._id] });

        const body = await ask(LORES, reader.bearer);

        expect(body.errors).toBeUndefined();
        expect(loreOf(body, plainLore)).toEqual({
            id: String(plainLore._id),
            enemy: null,
            pet: null,
        });
    });

    it('serves the creature to the character that unlocked the lore and not to the other', async () => {
        const wolf = await persistEnemy(enemies(), {
            relatedLore: [enemyLore._id],
        });
        const resolver = harness.app.get(LoreCreatureResolver);
        const lore = await modelOf(Lore.name, LoreSchema).findById(
            enemyLore._id,
        );

        const forReader = await resolver.enemy(lore, identityOf(reader), {});
        const forStranger = await resolver.enemy(
            lore,
            identityOf(stranger),
            {},
        );
        const list = await ask(LORES, stranger.bearer);
        const single = await ask(LORE, stranger.bearer, {
            id: String(enemyLore._id),
        });

        expect(String((forReader as unknown as Persisted)._id)).toBe(
            String(wolf._id),
        );
        expect(forStranger).toBeNull();
        expect(list.errors).toBeUndefined();
        expect(list.data?.lores).toEqual([
            { id: String(plainLore._id), enemy: null, pet: null },
        ]);
        expect(single.data ?? null).toBeNull();
    });

    it('serves no pet of a locked lore and runs no query for it', async () => {
        await persistPet(pets(), { relatedLore: [lockedLore._id] });
        await persistEnemy(enemies(), { relatedLore: [lockedLore._id] });
        const resolver = harness.app.get(LoreCreatureResolver);
        const enemyRead = jest.spyOn(
            harness.app.get<Model<unknown>>(getModelToken(Enemy.name)),
            'find',
        );
        const petRead = jest.spyOn(
            harness.app.get<Model<unknown>>(getModelToken(Pet.name)),
            'find',
        );

        try {
            const context = {};
            const identity = identityOf(reader);

            expect(
                await resolver.pet(lockedLore, identity, context),
            ).toBeNull();
            expect(
                await resolver.enemy(lockedLore, identity, context),
            ).toBeNull();
            expect(enemyRead).not.toHaveBeenCalled();
            expect(petRead).not.toHaveBeenCalled();
        } finally {
            enemyRead.mockRestore();
            petRead.mockRestore();
        }
    });

    it('serves nothing to a user without a current character', async () => {
        await persistEnemy(enemies(), { relatedLore: [enemyLore._id] });
        const homeless = await createPlayer(harness, {
            twitchId: 'twitch-creature-homeless',
            withCharacter: false,
        });
        const resolver = harness.app.get(LoreCreatureResolver);

        expect(
            await resolver.enemy(enemyLore, identityOf(homeless), {}),
        ).toBeNull();
    });

    it('serves the innkeeper the creature of every lore', async () => {
        const dragon = await persistEnemy(enemies(), {
            relatedLore: [lockedLore._id],
        });
        const hawk = await persistPet(pets(), { relatedLore: [petLore._id] });

        const body = await ask(LORES, await innkeeperBearer());

        expect(body.errors).toBeUndefined();
        expect(loreOf(body, lockedLore)?.enemy?.id).toBe(String(dragon._id));
        expect(loreOf(body, petLore)?.pet?.id).toBe(String(hawk._id));
    });

    it('picks the enemy and the pet with the smallest id when more share a lore', async () => {
        const first = new Types.ObjectId('0000000000000000000000a1');
        const second = new Types.ObjectId('0000000000000000000000a2');
        await persistEnemy(enemies(), {
            _id: second,
            relatedLore: [enemyLore._id],
        });
        await persistEnemy(enemies(), {
            _id: first,
            relatedLore: [enemyLore._id],
        });
        await persistPet(pets(), { _id: second, relatedLore: [petLore._id] });
        await persistPet(pets(), { _id: first, relatedLore: [petLore._id] });

        const body = await ask(LORES, reader.bearer);

        expect(body.errors).toBeUndefined();
        expect(loreOf(body, enemyLore)?.enemy?.id).toBe(String(first));
        expect(loreOf(body, petLore)?.pet?.id).toBe(String(first));
    });

    it('reads a lore id written as a string by a content script', async () => {
        const wolf = await persistEnemy(enemies(), {});
        const hawk = await persistPet(pets(), {});
        await enemies().collection.updateOne(
            { _id: wolf._id },
            { $set: { relatedLore: [enemyLore._id.toHexString()] } },
        );
        await pets().collection.updateOne(
            { _id: hawk._id },
            { $set: { relatedLore: [petLore._id.toHexString()] } },
        );

        const body = await ask(LORES, reader.bearer);

        expect(body.errors).toBeUndefined();
        expect(loreOf(body, enemyLore)?.enemy?.id).toBe(String(wolf._id));
        expect(loreOf(body, petLore)?.pet?.id).toBe(String(hawk._id));
    });

    it('reads a creature written without the field', async () => {
        const wolf = await persistEnemy(enemies(), {});
        const hawk = await persistPet(pets(), {});
        await enemies().collection.updateOne(
            { _id: wolf._id },
            { $unset: { relatedLore: '' } },
        );
        await pets().collection.updateOne(
            { _id: hawk._id },
            { $unset: { relatedLore: '' } },
        );
        await persistEnemy(enemies(), { relatedLore: [enemyLore._id] });

        const body = await ask(LORES, reader.bearer);

        expect(body.errors).toBeUndefined();
        expect(loreOf(body, enemyLore)?.enemy).not.toBeNull();
        expect(loreOf(body, petLore)?.pet).toBeNull();
    });

    it('reads the creatures of a whole list of lore with one query per catalogue', async () => {
        const lore = modelOf(Lore.name, LoreSchema);
        const many: Types.ObjectId[] = [];
        for (let index = 0; index < 6; index += 1) {
            const entry = await persistLore(lore, { name: `Voce ${index}` });
            many.push(entry._id as Types.ObjectId);
            await persistEnemy(enemies(), { relatedLore: [entry._id] });
            await persistPet(pets(), { relatedLore: [entry._id] });
        }
        const { bearer } = await playerKnowing(harness, {
            twitchId: 'twitch-creature-collector',
            lore: many,
        });
        const enemyRead = jest.spyOn(
            harness.app.get<Model<unknown>>(getModelToken(Enemy.name)),
            'find',
        );
        const petRead = jest.spyOn(
            harness.app.get<Model<unknown>>(getModelToken(Pet.name)),
            'find',
        );
        const characterRead = jest.spyOn(
            harness.app.get<Model<unknown>>(getModelToken(Character.name)),
            'findOne',
        );

        try {
            const body = await ask(LORES, bearer);

            expect(body.errors).toBeUndefined();
            expect(body.data?.lores).toHaveLength(6);
            expect(
                body.data?.lores?.every((entry) => entry.enemy && entry.pet),
            ).toBe(true);
            expect(enemyRead).toHaveBeenCalledTimes(1);
            expect(petRead).toHaveBeenCalledTimes(1);
            expect(characterRead).toHaveBeenCalledTimes(1);
        } finally {
            enemyRead.mockRestore();
            petRead.mockRestore();
            characterRead.mockRestore();
        }
    });
});
