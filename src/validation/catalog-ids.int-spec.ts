import type request from 'supertest';
import { CitiesModule } from 'src/cities/cities.module';
import { EnemiesModule } from 'src/enemies/enemies.module';
import { EquipmentItemsModule } from 'src/equipmentItems/equipment-items.module';
import { LootItemsModule } from 'src/lootItems/loot-items.module';
import { LoreModule } from 'src/lore/lore.module';
import { PetsModule } from 'src/pets/pets.module';
import { PointOfInterestModule } from 'src/pointsOfInterest/point-of-interest.module';
import { SpellsModule } from 'src/spells/spells.module';
import { MAX_ID_LIST } from 'src/validation/object-id.pipe';
import {
    AuthTestApp,
    createAuthTestApp,
    graphqlRequest,
} from '../../test/auth/auth-test-app';
import { createPlayer } from '../../test/authz/player-fixture';

const MISSING_ID = '64b0000000000000000000ff';
const MALFORMED_ID = 'abc';

const CATALOG_QUERIES = [
    {
        name: 'lore',
        query: 'query Q($id: String!) { lore(id: $id) { id } }',
        message: 'Lore non trovata',
    },
    {
        name: 'pet',
        query: 'query Q($id: String!) { pet(id: $id) { id } }',
        message: 'Compagno non trovato',
    },
    {
        name: 'pointOfInterest',
        query: 'query Q($id: String!) { pointOfInterest(id: $id) { id } }',
        message: 'Luogo non trovato',
    },
    {
        name: 'spell',
        query: 'query Q($id: String!) { spell(id: $id) { id } }',
        message: 'Magia non trovata',
    },
    {
        name: 'lootItem',
        query: 'query Q($id: String!) { lootItem(id: $id) { id } }',
        message: 'Oggetto non trovato',
    },
    {
        name: 'city',
        query: 'query Q($id: String!) { city(id: $id) { id } }',
        message: 'Città non trovata',
    },
    {
        name: 'equipmentItem',
        query: 'query Q($id: String!) { equipmentItem(id: $id) { id } }',
        message: 'Equipaggiamento non trovato',
    },
    {
        name: 'enemy',
        query: 'query Q($id: String!) { enemy(id: $id) { id } }',
        message: 'Nemico non trovato',
    },
];

const ID_LIST_QUERIES = [
    'query Q($ids: [String!]!) { lootItemsByIds(ids: $ids) { id } }',
    'query Q($ids: [String!]!) { equipmentItemsByIds(ids: $ids) { id } }',
];

interface WireBody {
    data?: Record<string, unknown> | null;
    errors?: { message: string; extensions: Record<string, unknown> }[];
}

function firstErrorOf(response: request.Response) {
    const [error] = (response.body as WireBody).errors ?? [];
    return { message: error?.message, extensions: error?.extensions };
}

function wellFormedIds(count: number): string[] {
    return Array.from({ length: count }, (_value, index) =>
        index.toString(16).padStart(24, '0'),
    );
}

describe('catalog id arguments (wire)', () => {
    let harness: AuthTestApp;
    let bearer: string;

    beforeAll(async () => {
        harness = await createAuthTestApp({
            imports: [
                LoreModule,
                PetsModule,
                PointOfInterestModule,
                SpellsModule,
                LootItemsModule,
                CitiesModule,
                EquipmentItemsModule,
                EnemiesModule,
            ],
        });
    });

    beforeEach(async () => {
        ({ bearer } = await createPlayer(harness, {
            twitchId: 'twitch-catalog-ids',
        }));
    });

    afterEach(async () => {
        await harness.clearDatabase();
    });

    afterAll(async () => {
        await harness.close();
    });

    it.each(CATALOG_QUERIES)(
        'rejects a malformed id on $name with BAD_USER_INPUT (D-02)',
        async ({ query }) => {
            const response = await graphqlRequest(
                harness.app,
                query,
                { id: MALFORMED_ID },
                bearer,
            );

            expect(firstErrorOf(response)).toEqual({
                message: 'Input non valido: id',
                extensions: { code: 'BAD_USER_INPUT' },
            });
        },
    );

    it.each(CATALOG_QUERIES)(
        'answers a coded NOT_FOUND on $name for a missing id (F2)',
        async ({ query, message }) => {
            const response = await graphqlRequest(
                harness.app,
                query,
                { id: MISSING_ID },
                bearer,
            );

            expect(firstErrorOf(response)).toEqual({
                message,
                extensions: { code: 'NOT_FOUND' },
            });
        },
    );

    it('caps the item id lists at 100 (D-04)', async () => {
        for (const query of ID_LIST_QUERIES) {
            const atCap = await graphqlRequest(
                harness.app,
                query,
                { ids: wellFormedIds(MAX_ID_LIST) },
                bearer,
            );
            const overCap = await graphqlRequest(
                harness.app,
                query,
                { ids: wellFormedIds(MAX_ID_LIST + 1) },
                bearer,
            );
            const malformed = await graphqlRequest(
                harness.app,
                query,
                { ids: [MISSING_ID, MALFORMED_ID] },
                bearer,
            );

            expect((atCap.body as WireBody).errors).toBeUndefined();
            expect(firstErrorOf(overCap)).toEqual({
                message: 'Input non valido: ids',
                extensions: { code: 'BAD_USER_INPUT' },
            });
            expect(firstErrorOf(malformed)).toEqual({
                message: 'Input non valido: ids',
                extensions: { code: 'BAD_USER_INPUT' },
            });
        }
    });
});
