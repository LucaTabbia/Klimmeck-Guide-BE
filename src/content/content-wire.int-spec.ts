import { Db, MongoClient } from 'mongodb';
import type request from 'supertest';
import { CitiesModule } from 'src/cities/cities.module';
import { EnemiesModule } from 'src/enemies/enemies.module';
import { LoreModule } from 'src/lore/lore.module';
import { PetsModule } from 'src/pets/pets.module';
import { QuestsModule } from 'src/quests/quests.module';
import { SpellsModule } from 'src/spells/spells.module';
import {
    AUTH_TEST_DB_NAME,
    AuthTestApp,
    createAuthTestApp,
    graphqlRequest,
} from '../../test/auth/auth-test-app';
import { createPlayer } from '../../test/authz/player-fixture';
import { seedWorld } from '../../test/content/seed-world';
import { DEFAULT_CONTENT_DIR } from './content-paths';
import {
    CONTENT_COLLECTIONS,
    ContentCollection,
    ContentTree,
    loadContentTree,
} from './loading/content-tree';
import { runContent } from './sync/content-sync';

jest.setTimeout(120_000);

// selezioni FE verbatim (lib/graphql/queries/*_queries.dart, lore senza il campo rimosso in 11-01)
const EQUIPMENT_FIELDS =
    '... on EquipmentItem { id name itemType equipType rarity }';
const LOOT_FIELDS = '... on LootItem { id name itemType rarity }';
const PRIZE_LOOT_FIELDS =
    '... on LootItem { id name itemType rarity description }';
const QUEST_FIELDS = `id infos { markerLocation { id } enemy { id name imagePath } relatedLore { id name description } } requirements { recommendedLoot { quantity item { ${EQUIPMENT_FIELDS} ${LOOT_FIELDS} } } } prizes { prizeItem { quantity item { ${EQUIPMENT_FIELDS} ${PRIZE_LOOT_FIELDS} } } randomLoot { quantity item { ${EQUIPMENT_FIELDS} ${LOOT_FIELDS} } } }`;

// nemici, pet e magie chiedono ogni campo non-null dello SDL: un valore mancante rompe la risposta
const LIST_QUERIES = {
    lores: 'query { lores { id image type name description relatedLore { id name } } }',
    cities: 'query { cities { id type name markerLocation { id } relatedLore { id description image } } }',
    quests: `query { quests { ${QUEST_FIELDS} } }`,
    enemys: 'query { enemys { id name imagePath xp lifePoints locations baseWeaknesses energyWeaknesses relatedLore { id name } spells { id name } damages { base { type power } energy { type power } } } }',
    pets: 'query { pets { id name speedModifier imagePath maxLifePoints currentLifePoints xp maxXp buyPrice { gold silver copper } sellPrice { gold silver copper } damages { base { type power } energy { type power } } } }',
    spells: 'query { spells { id name description useType minXpToLearn maxUsages recoveryTime requiredLearnTime energyDamage { type power } } }',
} as const;

type ListName = keyof typeof LIST_QUERIES;

const COLLECTION_OF_LIST: Record<
    Exclude<ListName, 'cities'>,
    ContentCollection
> = {
    lores: 'lore',
    quests: 'quests',
    enemys: 'enemies',
    pets: 'pets',
    spells: 'spells',
};

interface WireCity {
    id: string;
    relatedLore: { id: string } | null;
}

interface WireBody {
    data?: Record<string, unknown[] | null> | null;
    errors?: { message: string }[];
}

function bodyOf(response: request.Response): WireBody {
    return response.body as WireBody;
}

describe('real content on the GraphQL wire (replSet)', () => {
    let harness: AuthTestApp;
    let client: MongoClient;
    let db: Db;
    let tree: ContentTree;
    let bearer: string;

    async function listOf(name: ListName): Promise<unknown[]> {
        const body = bodyOf(
            await graphqlRequest(
                harness.app,
                LIST_QUERIES[name],
                undefined,
                bearer,
            ),
        );
        expect(body.errors).toBeUndefined();
        const list = body.data?.[name];
        expect(list).toEqual(expect.any(Array));
        return list as unknown[];
    }

    beforeAll(async () => {
        harness = await createAuthTestApp({
            imports: [
                LoreModule,
                EnemiesModule,
                PetsModule,
                SpellsModule,
                QuestsModule,
                CitiesModule,
            ],
        });
        client = await new MongoClient(
            process.env.MONGO_TEST_URI as string,
        ).connect();
        db = client.db(AUTH_TEST_DB_NAME);
        await harness.clearDatabase();
        ({ bearer } = await createPlayer(harness, {
            twitchId: 'twitch-content-wire',
            withCharacter: false,
        }));
        tree = loadContentTree(DEFAULT_CONTENT_DIR);
        await seedWorld(db, tree.world ?? []);
        const report = await runContent(db, 'apply', tree);
        expect(report.errors).toEqual([]);
    });

    afterAll(async () => {
        await client.close();
        await harness.close();
    });

    it('serves every list of the real content without errors (BE-CONTENT-02)', async () => {
        for (const [name, collection] of Object.entries(COLLECTION_OF_LIST)) {
            const list = await listOf(name as ListName);
            expect({ name, count: list.length }).toEqual({
                name,
                count: tree.entries[collection].length,
            });
        }
        const cities = await listOf('cities');
        expect(cities).toHaveLength((tree.world ?? []).length);
    });

    it('applies the real content a second time without changes (D-01)', async () => {
        const report = await runContent(db, 'apply', tree);

        for (const collection of CONTENT_COLLECTIONS) {
            const { inserted, modified } = report.collections[collection];
            expect({ collection, inserted, modified }).toEqual({
                collection,
                inserted: 0,
                modified: 0,
            });
        }
        expect(report.cities.relatedLore.modified).toBe(0);
    });

    it('links every city to its lore on the wire (D-23)', async () => {
        const cities = (await listOf('cities')) as WireCity[];

        const withoutLore = cities
            .filter((city) => city.relatedLore === null)
            .map((city) => city.id);
        expect(withoutLore).toEqual([]);
    });
});
