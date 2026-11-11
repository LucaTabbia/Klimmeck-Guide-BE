import { getModelToken } from '@nestjs/mongoose';
import { Model, Schema, Types } from 'mongoose';
import type request from 'supertest';
import { EnemiesModule } from 'src/enemies/enemies.module';
import { LootItemsModule } from 'src/lootItems/loot-items.module';
import { Enemy, EnemySchema } from 'src/models/enemy.model';
import { RoleType } from 'src/models/enums/role-type.enum';
import { LootItem, LootItemSchema } from 'src/models/loot-item.model';
import { Lore, LoreSchema } from 'src/models/lore.model';
import { Pet, PetSchema } from 'src/models/pet.model';
import { Spell, SpellSchema } from 'src/models/spell.model';
import { PetsModule } from 'src/pets/pets.module';
import {
    AuthTestApp,
    createAuthTestApp,
    graphqlRequest,
} from '../../test/auth/auth-test-app';
import { createPlayer } from '../../test/authz/player-fixture';
import { persistEnemy, persistLore, persistSpell } from '../../test/fixtures';
import { persistLootItem } from '../../test/fixtures/catalog-item.fixture';
import { persistPet } from '../../test/fixtures/pet.fixture';
import { playerKnowing } from '../../test/lore/lore-world';
import { LoreModule } from './lore.module';

// selezione FE verbatim (lib/graphql/queries/lore_queries.dart)
const LORES =
    'query { lores { id image type name description relatedLore { id name } } }';
const LORE =
    'query lore($id: String!) { lore(id: $id) { id image type name description relatedLore { id name } } }';
const ENEMIES = 'query { enemys { id name relatedLore { id name } } }';
const ENEMY_RELATED = 'query { enemys { id relatedLore { id } } }';
const ENEMY =
    'query Enemy($id: String!) { enemy(id: $id) { id name relatedLore { id name } } }';
const ENEMIES_SPELLS = 'query { enemys { id spells { id name } } }';
const ENEMY_SPELLS =
    'query Enemy($id: String!) { enemy(id: $id) { id spells { id name } } }';
const LOOT_ITEMS = 'query { lootItems { id relatedLore { id name } } }';
const LOOT_ITEM =
    'query LootItem($id: String!) { lootItem(id: $id) { id relatedLore { id name } } }';

const PETS = 'query { pets { id relatedLore { id name } } }';
const PET =
    'query Pet($id: String!) { pet(id: $id) { id relatedLore { id name } } }';

interface WireRelated {
    id: string;
    name?: string;
}

interface WireWithRelated {
    id: string;
    relatedLore: WireRelated[];
}

interface WireBody {
    data?: {
        lores?: WireWithRelated[];
        lore?: WireWithRelated;
        enemys?: WireWithRelated[];
        enemy?: WireWithRelated;
        lootItems?: WireWithRelated[];
        lootItem?: WireWithRelated;
        pets?: WireWithRelated[];
        pet?: WireWithRelated;
    } | null;
    errors?: { message: string; extensions?: { code?: unknown } }[];
}

function bodyOf(response: request.Response): WireBody {
    return response.body as WireBody;
}

describe('related lore (wire)', () => {
    let harness: AuthTestApp;
    let bearer: string;
    let loreModel: Model<any>;
    let loreA: { _id: Types.ObjectId };
    let loreB: { _id: Types.ObjectId };
    let loreC: { _id: Types.ObjectId };

    function modelOf(name: string, schema: Schema): Model<any> {
        return (
            harness.connection.models[name] ??
            harness.connection.model(name, schema)
        );
    }

    async function request(
        query: string,
        variables?: Record<string, unknown>,
        auth: string = bearer,
    ) {
        return bodyOf(
            await graphqlRequest(harness.app, query, variables, auth),
        );
    }

    async function innkeeperBearer(): Promise<string> {
        const innkeeper = await createPlayer(harness, {
            twitchId: 'twitch-lore-innkeeper',
            role: RoleType.innkeeper,
            withCharacter: false,
        });
        return innkeeper.bearer;
    }

    async function potionWith(
        relatedLore: unknown[],
    ): Promise<{ _id: Types.ObjectId }> {
        return persistLootItem(modelOf(LootItem.name, LootItemSchema), {
            relatedLore,
        });
    }

    async function petWith(
        relatedLore: unknown[],
    ): Promise<{ _id: Types.ObjectId }> {
        return persistPet(modelOf(Pet.name, PetSchema), { relatedLore });
    }

    function idsOf(entries: { id: string }[] | undefined): string[] {
        return (entries ?? []).map((entry) => entry.id).sort();
    }

    function relatedOf(
        entries: WireWithRelated[] | undefined,
        id: Types.ObjectId,
    ): WireRelated[] | undefined {
        return entries?.find((entry) => entry.id === String(id))?.relatedLore;
    }

    beforeAll(async () => {
        harness = await createAuthTestApp({
            imports: [LoreModule, EnemiesModule, LootItemsModule, PetsModule],
        });
    });

    beforeEach(async () => {
        await harness.clearDatabase();
        loreModel = modelOf(Lore.name, LoreSchema);
        loreA = await persistLore(loreModel, { name: 'A' });
        loreB = await persistLore(loreModel, {
            name: 'B',
            relatedLore: [loreA._id],
        });
        loreC = await persistLore(loreModel, { name: 'C' });
        // le lore prima del giocatore: il filtro per viewer (D-10) mostra solo quelle che conosce
        ({ bearer } = await playerKnowing(harness, {
            twitchId: 'twitch-lore-reader',
            lore: [loreA._id, loreB._id],
        }));
    });

    afterAll(async () => {
        await harness.clearDatabase();
        await harness.close();
    });

    it('serves the related lore of every lore in the list (11 Pitfall 1, D-10)', async () => {
        await loreModel.updateOne(
            { _id: loreA._id },
            { relatedLore: [loreB._id] },
        );

        const body = await request(LORES);

        expect(body.errors).toBeUndefined();
        expect(relatedOf(body.data?.lores, loreA._id)).toEqual([
            { id: String(loreB._id), name: 'B' },
        ]);
        expect(relatedOf(body.data?.lores, loreB._id)).toEqual([
            { id: String(loreA._id), name: 'A' },
        ]);
    });

    it('drops a related lore that no longer exists instead of failing the list (D-10)', async () => {
        await loreModel.updateOne(
            { _id: loreA._id },
            { relatedLore: [loreB._id, new Types.ObjectId()] },
        );

        const body = await request(LORES);

        expect(body.errors).toBeUndefined();
        expect(relatedOf(body.data?.lores, loreA._id)).toEqual([
            { id: String(loreB._id), name: 'B' },
        ]);
    });

    it('serves the related lore of a single lore (D-10)', async () => {
        await loreModel.updateOne(
            { _id: loreA._id },
            { relatedLore: [loreB._id, new Types.ObjectId()] },
        );

        const body = await request(LORE, { id: String(loreA._id) });

        expect(body.errors).toBeUndefined();
        expect(body.data?.lore?.relatedLore).toEqual([
            { id: String(loreB._id), name: 'B' },
        ]);
    });

    it('serves the related lore of every enemy (D-10)', async () => {
        const enemy = await persistEnemy(modelOf(Enemy.name, EnemySchema), {
            relatedLore: [loreA._id, new Types.ObjectId()],
        });
        const expected = [{ id: String(loreA._id), name: 'A' }];

        const list = await request(ENEMIES);
        const single = await request(ENEMY, { id: String(enemy._id) });

        expect(list.errors).toBeUndefined();
        expect(relatedOf(list.data?.enemys, enemy._id)).toEqual(expected);
        expect(single.errors).toBeUndefined();
        expect(single.data?.enemy?.relatedLore).toEqual(expected);
    });

    it('serves a player only the lore they unlocked (D-10)', async () => {
        const body = await request(LORES);

        expect(body.errors).toBeUndefined();
        expect(idsOf(body.data?.lores)).toEqual(
            [String(loreA._id), String(loreB._id)].sort(),
        );
    });

    it('filters the nested related lore to the unlocked set (D-10)', async () => {
        await loreModel.updateOne(
            { _id: loreB._id },
            { relatedLore: [loreA._id, loreC._id] },
        );
        const expected = [{ id: String(loreA._id), name: 'A' }];

        const list = await request(LORES);
        const single = await request(LORE, { id: String(loreB._id) });

        expect(list.errors).toBeUndefined();
        expect(relatedOf(list.data?.lores, loreB._id)).toEqual(expected);
        expect(single.errors).toBeUndefined();
        expect(single.data?.lore?.relatedLore).toEqual(expected);
    });

    it('answers NOT_FOUND for a locked lore exactly like a missing one (D-10)', async () => {
        const locked = await request(LORE, { id: String(loreC._id) });
        const missing = await request(LORE, {
            id: new Types.ObjectId().toHexString(),
        });

        const failureOf = (body: WireBody) => ({
            data: body.data,
            code: body.errors?.[0]?.extensions?.code,
            message: body.errors?.[0]?.message,
        });
        expect(failureOf(locked)).toEqual({
            data: null,
            code: 'NOT_FOUND',
            message: 'Lore non trovata',
        });
        expect(failureOf(locked)).toEqual(failureOf(missing));
    });

    it('serves the innkeeper every lore and every related lore (D-10)', async () => {
        await loreModel.updateOne(
            { _id: loreB._id },
            { relatedLore: [loreA._id, loreC._id] },
        );
        const auth = await innkeeperBearer();

        const list = await request(LORES, undefined, auth);
        const single = await request(LORE, { id: String(loreC._id) }, auth);

        expect(list.errors).toBeUndefined();
        expect(idsOf(list.data?.lores)).toEqual(
            [String(loreA._id), String(loreB._id), String(loreC._id)].sort(),
        );
        expect(relatedOf(list.data?.lores, loreB._id)).toEqual([
            { id: String(loreA._id), name: 'A' },
            { id: String(loreC._id), name: 'C' },
        ]);
        expect(single.errors).toBeUndefined();
        expect(single.data?.lore?.id).toBe(String(loreC._id));
    });

    it('serves nothing to a user without a current character (D-10)', async () => {
        const { bearer: homeless } = await createPlayer(harness, {
            twitchId: 'twitch-lore-homeless',
            withCharacter: false,
        });

        const list = await request(LORES, undefined, homeless);
        const single = await request(LORE, { id: String(loreA._id) }, homeless);

        expect(list).toEqual({ data: { lores: [] } });
        expect(single.data).toBeNull();
        expect(single.errors?.[0]?.extensions?.code).toBe('NOT_FOUND');
    });

    it('filters the related lore of every enemy (D-10)', async () => {
        const enemy = await persistEnemy(modelOf(Enemy.name, EnemySchema), {
            relatedLore: [loreA._id, loreC._id],
        });

        const player = await request(ENEMY_RELATED);
        const innkeeper = await request(
            ENEMY_RELATED,
            undefined,
            await innkeeperBearer(),
        );

        expect(player.errors).toBeUndefined();
        expect(relatedOf(player.data?.enemys, enemy._id)).toEqual([
            { id: String(loreA._id) },
        ]);
        expect(innkeeper.errors).toBeUndefined();
        expect(relatedOf(innkeeper.data?.enemys, enemy._id)).toEqual([
            { id: String(loreA._id) },
            { id: String(loreC._id) },
        ]);
    });

    // Spell.name è String!: un id nudo o pendente annullerebbe il nemico sul filo
    it('serves the spells of every enemy from the catalogue (D-02)', async () => {
        const spell = await persistSpell(modelOf(Spell.name, SpellSchema), {
            name: 'Soffio gelido',
        });
        const enemy = await persistEnemy(modelOf(Enemy.name, EnemySchema), {
            spells: [spell._id, new Types.ObjectId()],
        });
        const expected = {
            id: String(enemy._id),
            spells: [{ id: String(spell._id), name: 'Soffio gelido' }],
        };

        const list = await request(ENEMIES_SPELLS);
        const single = await request(ENEMY_SPELLS, { id: String(enemy._id) });

        expect(list.errors).toBeUndefined();
        expect(list.data?.enemys).toEqual([expected]);
        expect(single.errors).toBeUndefined();
        expect(single.data?.enemy).toEqual(expected);
    });

    describe('the related lore of a loot item', () => {
        const wireOf = (lore: { _id: Types.ObjectId }, name: string) => ({
            id: String(lore._id),
            name,
        });

        it('serves a player only the unlocked lore of a loot item (D-19)', async () => {
            const potion = await potionWith([loreA._id, loreC._id]);

            const body = await request(LOOT_ITEMS);

            expect(body.errors).toBeUndefined();
            expect(relatedOf(body.data?.lootItems, potion._id)).toEqual([
                wireOf(loreA, 'A'),
            ]);
        });

        it('serves the innkeeper every lore of a loot item in the order of the refs (D-19)', async () => {
            const potion = await potionWith([loreC._id, loreA._id]);

            const body = await request(
                LOOT_ITEMS,
                undefined,
                await innkeeperBearer(),
            );

            expect(body.errors).toBeUndefined();
            expect(relatedOf(body.data?.lootItems, potion._id)).toEqual([
                wireOf(loreC, 'C'),
                wireOf(loreA, 'A'),
            ]);
        });

        it('serves no lore of a loot item to a user without a current character (D-19)', async () => {
            const potion = await potionWith([loreA._id, loreC._id]);
            const { bearer: homeless } = await createPlayer(harness, {
                twitchId: 'twitch-loot-homeless',
                withCharacter: false,
            });

            const body = await request(LOOT_ITEMS, undefined, homeless);

            expect(body.errors).toBeUndefined();
            expect(relatedOf(body.data?.lootItems, potion._id)).toEqual([]);
        });

        it('drops a lore of a loot item that no longer exists (D-19)', async () => {
            const potion = await potionWith([loreA._id, new Types.ObjectId()]);

            const body = await request(
                LOOT_ITEMS,
                undefined,
                await innkeeperBearer(),
            );

            expect(body.errors).toBeUndefined();
            expect(relatedOf(body.data?.lootItems, potion._id)).toEqual([
                wireOf(loreA, 'A'),
            ]);
        });

        it('serves the unlocked lore on the single loot item query too (D-19)', async () => {
            const potion = await potionWith([loreA._id, loreC._id]);

            const body = await request(LOOT_ITEM, { id: String(potion._id) });

            expect(body.errors).toBeUndefined();
            expect(body.data?.lootItem?.relatedLore).toEqual([
                wireOf(loreA, 'A'),
            ]);
        });

        it('runs no lore query for a loot item without visible lore (D-19)', async () => {
            const potion = await potionWith([loreC._id]);
            const injected = harness.app.get<Model<unknown>>(
                getModelToken(Lore.name),
            );
            const find = jest.spyOn(injected, 'find');

            try {
                const body = await request(LOOT_ITEMS);

                expect(body.errors).toBeUndefined();
                expect(relatedOf(body.data?.lootItems, potion._id)).toEqual([]);
                expect(find).not.toHaveBeenCalled();
            } finally {
                find.mockRestore();
            }
        });

        it('reads a lore id written as a string by a content script (D-23)', async () => {
            const potion = await potionWith([]);
            await modelOf(LootItem.name, LootItemSchema).collection.updateOne(
                { _id: potion._id },
                { $set: { relatedLore: [loreA._id.toHexString()] } },
            );

            const body = await request(LOOT_ITEMS);

            expect(body.errors).toBeUndefined();
            expect(relatedOf(body.data?.lootItems, potion._id)).toEqual([
                wireOf(loreA, 'A'),
            ]);
        });
    });

    describe('the related lore of a pet', () => {
        const wireOf = (lore: { _id: Types.ObjectId }, name: string) => ({
            id: String(lore._id),
            name,
        });

        it('serves a player only the unlocked lore of a pet (D-26)', async () => {
            const pet = await petWith([loreA._id, loreC._id]);

            const body = await request(PETS);

            expect(body.errors).toBeUndefined();
            expect(relatedOf(body.data?.pets, pet._id)).toEqual([
                wireOf(loreA, 'A'),
            ]);
        });

        it('serves the innkeeper every lore of a pet in the order of the refs (D-26)', async () => {
            const pet = await petWith([loreC._id, loreA._id]);

            const body = await request(
                PETS,
                undefined,
                await innkeeperBearer(),
            );

            expect(body.errors).toBeUndefined();
            expect(relatedOf(body.data?.pets, pet._id)).toEqual([
                wireOf(loreC, 'C'),
                wireOf(loreA, 'A'),
            ]);
        });

        it('serves no lore of a pet to a user without a current character (D-26)', async () => {
            const pet = await petWith([loreA._id, loreC._id]);
            const { bearer: homeless } = await createPlayer(harness, {
                twitchId: 'twitch-pet-homeless',
                withCharacter: false,
            });

            const body = await request(PETS, undefined, homeless);

            expect(body.errors).toBeUndefined();
            expect(relatedOf(body.data?.pets, pet._id)).toEqual([]);
        });

        it('drops a lore of a pet that no longer exists (D-26)', async () => {
            const pet = await petWith([loreA._id, new Types.ObjectId()]);

            const body = await request(
                PETS,
                undefined,
                await innkeeperBearer(),
            );

            expect(body.errors).toBeUndefined();
            expect(relatedOf(body.data?.pets, pet._id)).toEqual([
                wireOf(loreA, 'A'),
            ]);
        });

        it('serves the unlocked lore on the single pet query too (D-26)', async () => {
            const pet = await petWith([loreA._id, loreC._id]);

            const body = await request(PET, { id: String(pet._id) });

            expect(body.errors).toBeUndefined();
            expect(body.data?.pet?.relatedLore).toEqual([wireOf(loreA, 'A')]);
        });

        it('reads a pet lore id written as a string by a content script (D-26)', async () => {
            const pet = await petWith([]);
            await modelOf(Pet.name, PetSchema).collection.updateOne(
                { _id: pet._id },
                { $set: { relatedLore: [loreA._id.toHexString()] } },
            );

            const body = await request(PETS);

            expect(body.errors).toBeUndefined();
            expect(relatedOf(body.data?.pets, pet._id)).toEqual([
                wireOf(loreA, 'A'),
            ]);
        });
    });
});
