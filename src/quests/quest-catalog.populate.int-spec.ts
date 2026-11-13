import { getModelToken, MongooseModule } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Enemy, EnemySchema } from 'src/models/enemy.model';
import {
    EquipmentItem,
    EquipmentItemSchema,
} from 'src/models/equipment-item.model';
import { LootItem, LootItemSchema } from 'src/models/loot-item.model';
import { Lore, LoreSchema } from 'src/models/lore.model';
import { Pet, PetSchema } from 'src/models/pet.model';
import {
    PointOfInterest,
    PointOfInterestSchema,
} from 'src/models/point-of-interest.model';
import {
    Quest,
    QuestDocument,
    QuestSchema,
} from 'src/models/quest/quest.model';
import { Spell, SpellSchema } from 'src/models/spell.model';
import { AuthTestApp, createAuthTestApp } from '../../test/auth/auth-test-app';
import { persistLootItem } from '../../test/fixtures/catalog-item.fixture';
import { persistPet } from '../../test/fixtures/pet.fixture';
import { buildQuest } from '../../test/fixtures/quest.fixture';
import { persistSpell } from '../../test/fixtures/spell.fixture';
import {
    CatalogRefsHolder,
    dropOrphanCatalogRefs,
    QUEST_CATALOG_POPULATE,
} from './quest-catalog.populate';

interface StoredBlock {
    prizeItem?: { item?: unknown } | null;
    randomLoot?: { item?: unknown }[];
    spell?: unknown;
    pet?: unknown;
}

describe('quest catalog populate of the rank prize blocks (replSet)', () => {
    let harness: AuthTestApp;
    let quests: Model<QuestDocument>;
    let loot: Model<unknown>;
    let pets: Model<unknown>;
    let spells: Model<unknown>;

    const isPopulated = (value: unknown): boolean =>
        value != null &&
        typeof value === 'object' &&
        !(value instanceof Types.ObjectId);

    async function persistBossWithBlock() {
        const lootItem = await persistLootItem(loot, {
            name: 'Rank Block Potion',
        });
        const pet = await persistPet(pets, { name: 'Rank Block Owl' });
        const spell = await persistSpell(spells, { name: 'Rank Block Spark' });
        const entry = { itemType: 'LootItem', item: lootItem._id, quantity: 1 };
        const quest = await quests.create(
            buildQuest({
                infos: { ...buildQuest().infos, type: 'boss' },
                prizes: {
                    ...buildQuest().prizes,
                    rankPrizes: [
                        {
                            title: 'mage',
                            prizeItem: entry,
                            randomLoot: [entry],
                            spell: spell._id,
                            pet: pet._id,
                        },
                    ],
                },
            }),
        );
        return { questId: quest._id, petId: pet._id };
    }

    async function catalogBlockOf(questId: Types.ObjectId) {
        const quest = await quests
            .findOne({ _id: questId })
            .populate(QUEST_CATALOG_POPULATE)
            .lean();
        const holder = quest as unknown as CatalogRefsHolder & {
            prizes: { rankPrizes: StoredBlock[] };
        };
        return { holder, block: () => holder.prizes.rankPrizes[0] };
    }

    beforeAll(async () => {
        harness = await createAuthTestApp({
            imports: [
                MongooseModule.forFeature([
                    { name: Quest.name, schema: QuestSchema },
                    { name: LootItem.name, schema: LootItemSchema },
                    { name: EquipmentItem.name, schema: EquipmentItemSchema },
                    { name: Pet.name, schema: PetSchema },
                    { name: Spell.name, schema: SpellSchema },
                    { name: Enemy.name, schema: EnemySchema },
                    { name: Lore.name, schema: LoreSchema },
                    {
                        name: PointOfInterest.name,
                        schema: PointOfInterestSchema,
                    },
                ]),
            ],
        });
        quests = harness.app.get(getModelToken(Quest.name));
        loot = harness.app.get(getModelToken(LootItem.name));
        pets = harness.app.get(getModelToken(Pet.name));
        spells = harness.app.get(getModelToken(Spell.name));
    });

    afterEach(async () => {
        await harness.clearDatabase();
    });

    afterAll(async () => {
        await harness.close();
    });

    it('resolves the nested block refs on a real query (D-05)', async () => {
        const { questId } = await persistBossWithBlock();

        const { block } = await catalogBlockOf(questId);

        expect(
            [
                block().prizeItem?.item,
                block().randomLoot?.[0]?.item,
                block().spell,
                block().pet,
            ].map(isPopulated),
        ).toEqual([true, true, true, true]);
    });

    it('nulls a deleted pet inside a block on a real query (D-05)', async () => {
        const { questId, petId } = await persistBossWithBlock();
        await pets.deleteOne({ _id: petId });

        const { holder, block } = await catalogBlockOf(questId);
        dropOrphanCatalogRefs(holder);

        expect(block().pet).toBeNull();
        expect(isPopulated(block().randomLoot?.[0]?.item)).toBe(true);
    });
});
