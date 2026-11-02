import { MongooseModule } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { EquipmentItemsModule } from 'src/equipmentItems/equipment-items.module';
import { LootItemsModule } from 'src/lootItems/loot-items.module';
import { EquipmentItem } from 'src/models/equipment-item.model';
import { LootItem } from 'src/models/loot-item.model';
import { Pet } from 'src/models/pet.model';
import { Spell, SpellSchema } from 'src/models/spell.model';
import { PetsModule } from 'src/pets/pets.module';
import {
    AuthTestApp,
    createAuthTestApp,
    graphqlRequest,
} from '../auth/auth-test-app';
import { createPlayer } from '../authz/player-fixture';
import {
    persistEquipmentItem,
    persistLootItem,
} from '../fixtures/catalog-item.fixture';
import { persistPet } from '../fixtures/pet.fixture';

interface WireSellable {
    name: string;
    sellable: boolean | null;
}

function sortedByName<T extends { name: string }>(list: T[]): T[] {
    return [...list].sort((left, right) => left.name.localeCompare(right.name));
}

describe('catalogue sellable on the wire', () => {
    let harness: AuthTestApp;
    let pets: Model<any>;
    let equipmentItems: Model<any>;
    let lootItems: Model<any>;
    let bearer: string;

    beforeAll(async () => {
        harness = await createAuthTestApp({
            imports: [
                PetsModule,
                EquipmentItemsModule,
                LootItemsModule,
                MongooseModule.forFeature([
                    { name: Spell.name, schema: SpellSchema },
                ]),
            ],
        });
        pets = harness.connection.model(Pet.name);
        equipmentItems = harness.connection.model(EquipmentItem.name);
        lootItems = harness.connection.model(LootItem.name);
    });

    beforeEach(async () => {
        ({ bearer } = await createPlayer(harness, {
            twitchId: 'twitch-catalog-sellable',
            withCharacter: false,
        }));
    });

    afterEach(async () => {
        await harness.clearDatabase();
    });

    afterAll(async () => {
        await harness.close();
    });

    async function query<T>(document: string, field: string): Promise<T> {
        const response = await graphqlRequest(
            harness.app,
            document,
            undefined,
            bearer,
        ).expect(200);
        expect(response.body.errors).toBeUndefined();
        return response.body.data[field];
    }

    it('serves the stored sellable of a pet, null when absent (D-07)', async () => {
        await persistPet(pets, { name: 'Cavallo', sellable: true });
        await persistPet(pets, { name: 'Drago', sellable: false });
        await persistPet(pets, { name: 'Gatto' });

        const served = await query<WireSellable[]>(
            '{ pets { name sellable } }',
            'pets',
        );

        expect(sortedByName(served)).toEqual([
            { name: 'Cavallo', sellable: true },
            { name: 'Drago', sellable: false },
            { name: 'Gatto', sellable: null },
        ]);
    });

    it('serves sellable on equipment and loot (D-07)', async () => {
        await persistEquipmentItem(equipmentItems, {
            name: 'Spada',
            sellable: true,
        });
        await persistEquipmentItem(equipmentItems, { name: 'Scudo' });
        await persistLootItem(lootItems, { name: 'Pozione', sellable: false });
        await persistLootItem(lootItems, { name: 'Erba' });

        const equipment = await query<WireSellable[]>(
            '{ equipmentItems { name sellable } }',
            'equipmentItems',
        );
        const loot = await query<WireSellable[]>(
            '{ lootItems { name sellable } }',
            'lootItems',
        );

        expect({
            equipment: sortedByName(equipment),
            loot: sortedByName(loot),
        }).toEqual({
            equipment: [
                { name: 'Scudo', sellable: null },
                { name: 'Spada', sellable: true },
            ],
            loot: [
                { name: 'Erba', sellable: null },
                { name: 'Pozione', sellable: false },
            ],
        });
    });

    it('keeps filtering equipmentAssetsQuantity by sellable true (D-20)', async () => {
        await persistEquipmentItem(equipmentItems, {
            name: 'Spada',
            sellable: true,
        });
        await persistEquipmentItem(equipmentItems, {
            name: 'Ascia',
            sellable: false,
        });
        await persistEquipmentItem(equipmentItems, { name: 'Scudo' });

        const served = await query<{ item: { name: string } }[]>(
            '{ equipmentAssetsQuantity(sellable: true) { item { ... on EquipmentItem { name } } } }',
            'equipmentAssetsQuantity',
        );

        expect(served).toEqual([{ item: { name: 'Spada' } }]);
    });
});
