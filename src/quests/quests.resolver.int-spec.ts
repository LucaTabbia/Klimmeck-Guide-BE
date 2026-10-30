import { Model, Schema, Types } from 'mongoose';
import type request from 'supertest';
import { AuthErrorCode } from 'src/auth/auth-error-code.enum';
import { Enemy, EnemySchema } from 'src/models/enemy.model';
import {
    EquipmentItem,
    EquipmentItemSchema,
} from 'src/models/equipment-item.model';
import { LoreType } from 'src/models/enums/lore-type.enum';
import { LootItem, LootItemSchema } from 'src/models/loot-item.model';
import { Lore, LoreSchema } from 'src/models/lore.model';
import {
    PointOfInterest,
    PointOfInterestSchema,
} from 'src/models/point-of-interest.model';
import { Quest, QuestSchema } from 'src/models/quest/quest.model';
import { Spell, SpellSchema } from 'src/models/spell.model';
import { QuestsModule } from 'src/quests/quests.module';
import {
    AuthTestApp,
    createAuthTestApp,
    graphqlRequest,
} from '../../test/auth/auth-test-app';
import { createPlayer } from '../../test/authz/player-fixture';
import {
    buildQuest,
    persistEquipmentItem,
    persistLootItem,
    persistPoi,
    persistQuest,
    persistSpell,
} from '../../test/fixtures';

// selezioni FE verbatim (FE 06-12, lib/graphql/queries/quest_queries.dart)
const EQUIPMENT_FIELDS =
    '... on EquipmentItem { id name itemType equipType rarity }';
const LOOT_FIELDS = '... on LootItem { id name itemType rarity }';
const PRIZE_LOOT_FIELDS =
    '... on LootItem { id name itemType rarity description }';
const QUEST_FIELDS = `id infos { markerLocation { id } enemy { id name imagePath } relatedLore { id name description } } requirements { recommendedLoot { quantity item { ${EQUIPMENT_FIELDS} ${LOOT_FIELDS} } } } prizes { prizeItem { quantity item { ${EQUIPMENT_FIELDS} ${PRIZE_LOOT_FIELDS} } } randomLoot { quantity item { ${EQUIPMENT_FIELDS} ${LOOT_FIELDS} } } }`;
const QUESTS = `query { quests { ${QUEST_FIELDS} } }`;
const QUEST = `query Quest($id: String!) { quest(id: $id) { ${QUEST_FIELDS} } }`;
const MISSING_QUEST_ID = '64b0000000000000000000ff';
const QUEST_IDS = 'query { quests { id } }';
const QUEST_SPELLS =
    'query { quests { id prizes { spell { id name minXpToLearn } } } }';
const CONCLUDED_AT = new Date('2026-10-24T10:00:00.000Z');

interface WireItem {
    id: string;
    name: string;
    itemType: string;
    rarity: string;
    equipType?: string;
    description?: string;
}

interface WireAssetQuantity {
    quantity: number;
    item: WireItem;
}

interface WireQuest {
    id: string;
    infos: {
        markerLocation: { id: string };
        enemy: { id: string; name: string; imagePath: string } | null;
        relatedLore: { id: string; name: string; description: string }[];
    };
    requirements: { recommendedLoot: WireAssetQuantity[] };
    prizes: {
        prizeItem: WireAssetQuantity | null;
        randomLoot: WireAssetQuantity[];
    };
}

interface WireSpell {
    id: string;
    name: string;
    minXpToLearn: number;
}

interface WireQuestSpell {
    id: string;
    prizes: { spell: WireSpell | null };
}

interface WireBody {
    data?: { quests?: WireQuest[]; quest?: WireQuest } | null;
    errors?: { message: string; extensions: Record<string, unknown> }[];
}

function bodyOf(response: request.Response): WireBody {
    return response.body as WireBody;
}

describe('quest catalog (wire)', () => {
    let harness: AuthTestApp;
    let bearer: string;
    let poi: { _id: Types.ObjectId };
    let enemy: { _id: Types.ObjectId };
    let loreA: { _id: Types.ObjectId };
    let loreB: { _id: Types.ObjectId };
    let sword: { _id: Types.ObjectId };
    let loot: { _id: Types.ObjectId };

    function modelOf(name: string, schema: Schema): Model<any> {
        return (
            harness.connection.models[name] ??
            harness.connection.model(name, schema)
        );
    }

    function persistCatalogQuest(overrides: Record<string, unknown> = {}) {
        const base = buildQuest();
        return persistQuest(modelOf(Quest.name, QuestSchema), {
            ...overrides,
            infos: {
                ...base.infos,
                markerLocation: poi._id,
                ...(overrides.infos as Record<string, unknown>),
            },
        });
    }

    function persistFullQuest() {
        return persistCatalogQuest({
            infos: { enemy: enemy._id, relatedLore: [loreA._id, loreB._id] },
            requirements: {
                ...buildQuest().requirements,
                recommendedLoot: [
                    { itemType: 'LootItem', item: loot._id, quantity: 1 },
                ],
            },
            prizes: {
                ...buildQuest().prizes,
                prizeItem: {
                    itemType: 'EquipmentItem',
                    item: sword._id,
                    quantity: 1,
                },
                randomLoot: [
                    { itemType: 'EquipmentItem', item: sword._id, quantity: 2 },
                    { itemType: 'LootItem', item: loot._id, quantity: 3 },
                ],
            },
        });
    }

    function expectFullQuest(quest: WireQuest | undefined): void {
        expect(quest?.infos.markerLocation).toEqual({ id: String(poi._id) });
        expect(quest?.infos.enemy).toEqual({
            id: String(enemy._id),
            name: 'Lupo',
            imagePath: 'enemies/wolf.png',
        });
        expect(quest?.infos.relatedLore).toEqual([
            {
                id: String(loreA._id),
                name: 'Leggenda A',
                description: 'Racconto A',
            },
            {
                id: String(loreB._id),
                name: 'Leggenda B',
                description: 'Racconto B',
            },
        ]);
        expect(quest?.requirements.recommendedLoot).toEqual([
            {
                quantity: 1,
                item: {
                    id: String(loot._id),
                    name: 'Test Potion',
                    itemType: 'potion',
                    rarity: 'common',
                },
            },
        ]);
        expect(quest?.prizes.prizeItem).toEqual({
            quantity: 1,
            item: {
                id: String(sword._id),
                name: 'Test Sword',
                itemType: 'weapon',
                equipType: 'weapon',
                rarity: 'common',
            },
        });
        expect(
            quest?.prizes.randomLoot.map(({ quantity, item }) => ({
                quantity,
                id: item.id,
                name: item.name,
            })),
        ).toEqual([
            { quantity: 2, id: String(sword._id), name: 'Test Sword' },
            { quantity: 3, id: String(loot._id), name: 'Test Potion' },
        ]);
    }

    beforeAll(async () => {
        harness = await createAuthTestApp({ imports: [QuestsModule] });
    });

    beforeEach(async () => {
        await harness.clearDatabase();
        ({ bearer } = await createPlayer(harness, {
            twitchId: 'twitch-catalog-reader',
        }));
        poi = await persistPoi(
            modelOf(PointOfInterest.name, PointOfInterestSchema),
        );
        enemy = await modelOf(Enemy.name, EnemySchema).create({
            name: 'Lupo',
            imagePath: 'enemies/wolf.png',
        });
        const loreModel = modelOf(Lore.name, LoreSchema);
        const loreType = Object.values(LoreType)[0];
        loreA = await loreModel.create({
            name: 'Leggenda A',
            description: 'Racconto A',
            type: loreType,
        });
        loreB = await loreModel.create({
            name: 'Leggenda B',
            description: 'Racconto B',
            type: loreType,
        });
        sword = await persistEquipmentItem(
            modelOf(EquipmentItem.name, EquipmentItemSchema),
        );
        loot = await persistLootItem(modelOf(LootItem.name, LootItemSchema));
    });

    afterAll(async () => {
        await harness.clearDatabase();
        await harness.close();
    });

    it('populates the enemy, the lore and every catalog item on quests', async () => {
        await persistFullQuest();

        const body = bodyOf(
            await graphqlRequest(harness.app, QUESTS, {}, bearer),
        );

        expect(body.errors).toBeUndefined();
        expect(body.data?.quests).toHaveLength(1);
        expectFullQuest(body.data?.quests?.[0]);
    });

    it('keeps the list alive on orphan refs', async () => {
        const orphan = await persistCatalogQuest({
            infos: {
                enemy: new Types.ObjectId(),
                relatedLore: [loreA._id, new Types.ObjectId()],
            },
            requirements: {
                ...buildQuest().requirements,
                recommendedLoot: [
                    {
                        itemType: 'LootItem',
                        item: new Types.ObjectId(),
                        quantity: 1,
                    },
                    { itemType: 'LootItem', item: loot._id, quantity: 1 },
                ],
            },
            prizes: {
                ...buildQuest().prizes,
                prizeItem: {
                    itemType: 'EquipmentItem',
                    item: new Types.ObjectId(),
                    quantity: 1,
                },
                randomLoot: [
                    {
                        itemType: 'EquipmentItem',
                        item: new Types.ObjectId(),
                        quantity: 1,
                    },
                ],
            },
        });
        const healthy = await persistFullQuest();

        const body = bodyOf(
            await graphqlRequest(harness.app, QUESTS, {}, bearer),
        );

        expect(body.errors).toBeUndefined();
        const quests = body.data?.quests ?? [];
        expect(quests).toHaveLength(2);
        const broken = quests.find(({ id }) => id === String(orphan._id));
        expect(broken?.infos.enemy).toBeNull();
        expect(broken?.infos.relatedLore.map(({ id }) => id)).toEqual([
            String(loreA._id),
        ]);
        expect(
            broken?.requirements.recommendedLoot.map(({ item }) => item.id),
        ).toEqual([String(loot._id)]);
        expect(broken?.prizes.prizeItem).toBeNull();
        expect(broken?.prizes.randomLoot).toEqual([]);
        expectFullQuest(quests.find(({ id }) => id === String(healthy._id)));
    });

    // scrittura diretta: itemType è required nello schema, ma le quest a DB si editano a mano (D-28);
    // senza itemType il refPath non si risolve e populate lascia l'ObjectId grezzo (in un array misto
    // Mongoose riusa il modello dei fratelli: qui una voce sola per path, così l'esito è deterministico)
    async function insertQuestWithoutItemType(): Promise<Types.ObjectId> {
        const base = buildQuest();
        const _id = new Types.ObjectId();
        await modelOf(Quest.name, QuestSchema).collection.insertOne({
            ...base,
            _id,
            infos: { ...base.infos, markerLocation: poi._id },
            requirements: {
                ...base.requirements,
                recommendedLoot: [{ item: loot._id, quantity: 1 }],
            },
            prizes: {
                ...base.prizes,
                prizeItem: { item: sword._id, quantity: 1 },
                randomLoot: [{ item: sword._id, quantity: 1 }],
            },
        });
        return _id;
    }

    it('keeps the list alive when an item has no itemType', async () => {
        const brokenId = await insertQuestWithoutItemType();
        const healthy = await persistFullQuest();

        const body = bodyOf(
            await graphqlRequest(harness.app, QUESTS, {}, bearer),
        );

        expect(body.errors).toBeUndefined();
        const quests = body.data?.quests ?? [];
        expect(quests).toHaveLength(2);
        const broken = quests.find(({ id }) => id === String(brokenId));
        expect(broken?.requirements.recommendedLoot).toEqual([]);
        expect(broken?.prizes.prizeItem).toBeNull();
        expect(broken?.prizes.randomLoot).toEqual([]);
        expectFullQuest(quests.find(({ id }) => id === String(healthy._id)));
    });

    it('populates the same refs on quest(id)', async () => {
        const quest = await persistFullQuest();

        const body = bodyOf(
            await graphqlRequest(
                harness.app,
                QUEST,
                { id: String(quest._id) },
                bearer,
            ),
        );

        expect(body.errors).toBeUndefined();
        expect(body.data?.quest?.id).toBe(String(quest._id));
        expectFullQuest(body.data?.quest);
    });

    it('answers NOT_FOUND for an unknown quest id', async () => {
        const body = bodyOf(
            await graphqlRequest(
                harness.app,
                QUEST,
                { id: MISSING_QUEST_ID },
                bearer,
            ),
        );

        expect(body.errors?.[0]?.extensions).toEqual({ code: 'NOT_FOUND' });
        expect(body.errors?.[0]?.message).toBe('Missione non trovata');
    });

    it('answers BAD_USER_INPUT for a malformed quest id (D-02)', async () => {
        const body = bodyOf(
            await graphqlRequest(harness.app, QUEST, { id: 'abc' }, bearer),
        );

        expect(body.errors?.[0]?.extensions).toEqual({
            code: 'BAD_USER_INPUT',
        });
        expect(body.errors?.[0]?.message).toBe('Input non valido: id');
    });

    function conclude(questId: Types.ObjectId) {
        return modelOf(Quest.name, QuestSchema).collection.updateOne(
            { _id: questId },
            { $set: { concludedAt: CONCLUDED_AT } },
        );
    }

    // quest legacy senza il campo concludedAt: per la board vale null (D-06)
    async function insertLegacyQuest(): Promise<Types.ObjectId> {
        const base = buildQuest();
        const _id = new Types.ObjectId();
        await modelOf(Quest.name, QuestSchema).collection.insertOne({
            ...base,
            _id,
            infos: { ...base.infos, markerLocation: poi._id },
        });
        return _id;
    }

    // una quest conclusa sparisce dalla board per tutti (D-06, C9)
    it('hides a concluded quest from quests and answers NOT_FOUND on quest(id)', async () => {
        const concluded = await persistCatalogQuest();
        await conclude(concluded._id as Types.ObjectId);
        const open = await persistCatalogQuest();
        const legacyId = await insertLegacyQuest();

        const list = bodyOf(
            await graphqlRequest(harness.app, QUEST_IDS, {}, bearer),
        );
        const single = bodyOf(
            await graphqlRequest(
                harness.app,
                QUEST,
                { id: String(concluded._id) },
                bearer,
            ),
        );

        expect(list.errors).toBeUndefined();
        expect((list.data?.quests ?? []).map(({ id }) => id).sort()).toEqual(
            [String(open._id), String(legacyId)].sort(),
        );
        expect(single.errors?.[0]?.extensions).toEqual({ code: 'NOT_FOUND' });
        expect(single.errors?.[0]?.message).toBe('Missione non trovata');
    });

    it('still serves a legacy quest without concludedAt on quest(id)', async () => {
        const legacyId = await insertLegacyQuest();

        const body = bodyOf(
            await graphqlRequest(
                harness.app,
                QUEST,
                { id: String(legacyId) },
                bearer,
            ),
        );

        expect(body.errors).toBeUndefined();
        expect(body.data?.quest?.id).toBe(String(legacyId));
    });

    // la magia del premio arriva popolata; un ref orfano vale null senza annullare la lista (D-17)
    it('populates prizes.spell and tolerates an orphan spell', async () => {
        const spell = await persistSpell(modelOf(Spell.name, SpellSchema), {
            name: 'Palla di fuoco',
            minXpToLearn: 40000,
        });
        const withSpell = await persistCatalogQuest({
            prizes: { ...buildQuest().prizes, spell: spell._id },
        });
        const orphan = await persistCatalogQuest({
            prizes: {
                ...buildQuest().prizes,
                spell: new Types.ObjectId(),
            },
        });

        const body = bodyOf(
            await graphqlRequest(harness.app, QUEST_SPELLS, {}, bearer),
        );

        expect(body.errors).toBeUndefined();
        const quests = (body.data?.quests ?? []) as unknown as WireQuestSpell[];
        const spellOf = (id: unknown) =>
            quests.find((quest) => quest.id === String(id))?.prizes.spell;
        expect(spellOf(withSpell._id)).toEqual({
            id: String(spell._id),
            name: 'Palla di fuoco',
            minXpToLearn: 40000,
        });
        expect(spellOf(orphan._id)).toBeNull();
    });

    it('requires a bearer', async () => {
        const body = bodyOf(await graphqlRequest(harness.app, QUESTS));

        expect(body.errors?.[0]?.extensions).toEqual({
            code: AuthErrorCode.UNAUTHENTICATED,
        });
    });
});
