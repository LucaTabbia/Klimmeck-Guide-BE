import { Model, Schema, Types } from 'mongoose';
import type request from 'supertest';
import { AuthErrorCode } from 'src/auth/auth-error-code.enum';
import {
    Character,
    CharacterSchema,
} from 'src/models/character/character.model';
import { City, CitySchema } from 'src/models/city.model';
import { Enemy, EnemySchema } from 'src/models/enemy.model';
import {
    EquipmentItem,
    EquipmentItemSchema,
} from 'src/models/equipment-item.model';
import { LoreType } from 'src/models/enums/lore-type.enum';
import { RoleType } from 'src/models/enums/role-type.enum';
import { LootItem, LootItemSchema } from 'src/models/loot-item.model';
import { Lore, LoreSchema } from 'src/models/lore.model';
import { Pet, PetSchema } from 'src/models/pet.model';
import {
    PointOfInterest,
    PointOfInterestSchema,
} from 'src/models/point-of-interest.model';
import { Quest, QuestSchema } from 'src/models/quest/quest.model';
import { Spell, SpellSchema } from 'src/models/spell.model';
import { User, UserSchema } from 'src/models/user.model';
import { QuestsModule } from 'src/quests/quests.module';
import {
    AuthTestApp,
    createAuthTestApp,
    graphqlRequest,
} from '../../test/auth/auth-test-app';
import { createPlayer, TestPlayer } from '../../test/authz/player-fixture';
import {
    buildCharacter,
    buildQuest,
    persistCity,
    persistEnemy,
    persistEquipmentItem,
    persistLootItem,
    persistPet,
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
const QUEST_FIELDS = `id infos { markerLocation { id } enemies { quantity enemy { id name imagePath xp } } relatedLore { id name description } } requirements { recommendedLoot { quantity item { ${EQUIPMENT_FIELDS} ${LOOT_FIELDS} } } } prizes { prizeItem { quantity item { ${EQUIPMENT_FIELDS} ${PRIZE_LOOT_FIELDS} } } randomLoot { quantity item { ${EQUIPMENT_FIELDS} ${LOOT_FIELDS} } } }`;
const QUESTS = `query { quests { ${QUEST_FIELDS} } }`;
const QUEST = `query Quest($id: String!) { quest(id: $id) { ${QUEST_FIELDS} } }`;
const MISSING_QUEST_ID = '64b0000000000000000000ff';
const QUEST_IDS = 'query { quests { id } }';
const QUEST_SPELLS =
    'query { quests { id prizes { spell { id name minXpToLearn } } } }';
const QUEST_PETS = 'query { quests { id prizes { pet { id name } } } }';
const CONCLUDED_AT = new Date('2026-10-24T10:00:00.000Z');
const QUEST_NO_EFFECT =
    'query Quest($id: String!) { quest(id: $id) { id noEffect } }';
const QUESTS_NO_EFFECT = 'query { quests { id noEffect } }';
const VILLAGE_CURE = { lifePointsShare: 0.5, canHeal: ['deepCut'] };
const FULL_LIFE = 1000;

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

interface WireQuestEnemy {
    quantity: number;
    enemy: { id: string; name: string; imagePath: string; xp: number };
}

interface WireQuest {
    id: string;
    infos: {
        markerLocation: { id: string };
        enemies: WireQuestEnemy[];
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

interface WireQuestPet {
    id: string;
    prizes: { pet: { id: string; name: string } | null };
}

interface WireNoEffect {
    id: string;
    noEffect: boolean;
}

interface WireNoEffectBody {
    data?: { quests?: WireNoEffect[]; quest?: WireNoEffect } | null;
    errors?: { message: string; extensions: Record<string, unknown> }[];
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
    let cityMarker: unknown;
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
            infos: {
                enemies: [{ enemy: enemy._id, quantity: 1 }],
                relatedLore: [loreA._id, loreB._id],
            },
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
        expect(quest?.infos.enemies).toEqual([
            {
                quantity: 1,
                enemy: {
                    id: String(enemy._id),
                    name: 'Lupo',
                    imagePath: 'enemies/wolf.png',
                    xp: 100,
                },
            },
        ]);
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
        const reader = await createPlayer(harness, {
            twitchId: 'twitch-catalog-reader',
        });
        bearer = reader.bearer;
        cityMarker = reader.character?.status.location;
        poi = await persistPoi(
            modelOf(PointOfInterest.name, PointOfInterestSchema),
        );
        // il tabellone è per area (13.1 D-05): il lettore sta sul marker della città del POI delle quest
        await persistCity(modelOf(City.name, CitySchema), {
            markerLocation: reader.character?.status.location,
            pointsOfInterest: [poi._id],
        });
        enemy = await persistEnemy(modelOf(Enemy.name, EnemySchema), {
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

    it('populates the enemies, the lore and every catalog item on quests (D-01)', async () => {
        await persistFullQuest();

        const body = bodyOf(
            await graphqlRequest(harness.app, QUESTS, {}, bearer),
        );

        expect(body.errors).toBeUndefined();
        expect(body.data?.quests).toHaveLength(1);
        expectFullQuest(body.data?.quests?.[0]);
    });

    it('populates the enemies of a multi-enemy quest in order (D-01)', async () => {
        const enemies = modelOf(Enemy.name, EnemySchema);
        const goblin = await persistEnemy(enemies, {
            name: 'Goblin',
            imagePath: 'enemies/goblin.png',
            xp: 7,
        });
        const chief = await persistEnemy(enemies, {
            name: 'Capo goblin',
            imagePath: 'enemies/goblin-chief.png',
            xp: 21,
        });
        await persistCatalogQuest({
            infos: {
                enemies: [
                    { enemy: goblin._id, quantity: 3 },
                    { enemy: chief._id, quantity: 1 },
                ],
            },
        });

        const body = bodyOf(
            await graphqlRequest(harness.app, QUESTS, {}, bearer),
        );

        expect(body.errors).toBeUndefined();
        expect(body.data?.quests?.[0]?.infos.enemies).toEqual([
            {
                quantity: 3,
                enemy: {
                    id: String(goblin._id),
                    name: 'Goblin',
                    imagePath: 'enemies/goblin.png',
                    xp: 7,
                },
            },
            {
                quantity: 1,
                enemy: {
                    id: String(chief._id),
                    name: 'Capo goblin',
                    imagePath: 'enemies/goblin-chief.png',
                    xp: 21,
                },
            },
        ]);
    });

    it('drops an orphan enemy entry without nulling the quests list (D-28)', async () => {
        const orphan = await persistCatalogQuest({
            infos: {
                enemies: [
                    { enemy: new Types.ObjectId(), quantity: 2 },
                    { enemy: enemy._id, quantity: 1 },
                ],
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
        expect(broken?.infos.enemies).toEqual([
            {
                quantity: 1,
                enemy: {
                    id: String(enemy._id),
                    name: 'Lupo',
                    imagePath: 'enemies/wolf.png',
                    xp: 100,
                },
            },
        ]);
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

    it('populates prizes.pet and nulls an orphan pet without nulling the list (D-21, D-28)', async () => {
        const pet = await persistPet(modelOf(Pet.name, PetSchema), {
            name: 'Gufo delle nevi',
            sellable: false,
        });
        const withPet = await persistCatalogQuest({
            prizes: { ...buildQuest().prizes, pet: pet._id },
        });
        const orphan = await persistCatalogQuest({
            prizes: { ...buildQuest().prizes, pet: new Types.ObjectId() },
        });

        const body = bodyOf(
            await graphqlRequest(harness.app, QUEST_PETS, {}, bearer),
        );

        expect(body.errors).toBeUndefined();
        const quests = (body.data?.quests ?? []) as unknown as WireQuestPet[];
        const petOf = (id: unknown) =>
            quests.find((quest) => quest.id === String(id))?.prizes.pet;
        expect(petOf(withPet._id)).toEqual({
            id: String(pet._id),
            name: 'Gufo delle nevi',
        });
        expect(petOf(orphan._id)).toBeNull();
    });

    it('requires a bearer', async () => {
        const body = bodyOf(await graphqlRequest(harness.app, QUESTS));

        expect(body.errors?.[0]?.extensions).toEqual({
            code: AuthErrorCode.UNAUTHENTICATED,
        });
    });

    describe('Quest.noEffect (D-25)', () => {
        function playerAtFullLife(
            name: string,
            injuries: string[],
            role?: RoleType,
        ): Promise<TestPlayer> {
            const base = buildCharacter();
            return createPlayer(harness, {
                twitchId: `twitch-no-effect-${name}`,
                role,
                characterOverrides: {
                    status: {
                        ...base.status,
                        location: cityMarker,
                        currentLifePoints: FULL_LIFE,
                        maxLifePoints: FULL_LIFE,
                        injuries,
                    },
                },
            });
        }

        function persistCuringQuest(
            type: string,
            cure: unknown = VILLAGE_CURE,
        ) {
            return persistCatalogQuest({
                infos: { type },
                prizes: { ...buildQuest().prizes, cure },
            });
        }

        async function noEffectOf(
            questId: unknown,
            viewerBearer: string,
        ): Promise<boolean | undefined> {
            const body = (
                await graphqlRequest(
                    harness.app,
                    QUEST_NO_EFFECT,
                    { id: String(questId) },
                    viewerBearer,
                )
            ).body as WireNoEffectBody;
            expect(body.errors).toBeUndefined();
            expect(body.data?.quest?.id).toBe(String(questId));
            return body.data?.quest?.noEffect;
        }

        it('marks a heal without effect for the character of the bearer (D-25)', async () => {
            const alice = await playerAtFullLife('alice', []);
            const heal = await persistCuringQuest('heal');

            expect(await noEffectOf(heal._id, alice.bearer)).toBe(true);
        });

        it('gives two characters different values on the same heal (D-25)', async () => {
            const alice = await playerAtFullLife('alice', []);
            const bruno = await playerAtFullLife('bruno', ['deepCut']);
            const heal = await persistCuringQuest('heal');

            expect(await noEffectOf(heal._id, alice.bearer)).toBe(true);
            expect(await noEffectOf(heal._id, bruno.bearer)).toBe(false);
        });

        it('answers false for a quest of another type that carries a cure (D-25)', async () => {
            const alice = await playerAtFullLife('alice', []);
            const job = await persistCuringQuest('job');

            expect(await noEffectOf(job._id, alice.bearer)).toBe(false);
        });

        it('marks a heal without a cure for every character (D-25)', async () => {
            const alice = await playerAtFullLife('alice', []);
            const bruno = await playerAtFullLife('bruno', ['deepCut']);
            const bare = await persistCatalogQuest({ infos: { type: 'heal' } });

            expect(await noEffectOf(bare._id, alice.bearer)).toBe(true);
            expect(await noEffectOf(bare._id, bruno.bearer)).toBe(true);
        });

        it('gives the innkeeper playing an own character the same value as anyone (D-25)', async () => {
            const innkeeper = await playerAtFullLife(
                'innkeeper',
                [],
                RoleType.innkeeper,
            );
            const heal = await persistCuringQuest('heal');

            expect(await noEffectOf(heal._id, innkeeper.bearer)).toBe(true);

            await modelOf(Character.name, CharacterSchema).collection.updateOne(
                { _id: innkeeper.character?._id as Types.ObjectId },
                { $set: { 'status.injuries': ['deepCut'] } },
            );

            expect(await noEffectOf(heal._id, innkeeper.bearer)).toBe(false);
        });

        it('answers false to a user without a current character, whatever the role (D-25)', async () => {
            const wanderer = await createPlayer(harness, {
                twitchId: 'twitch-no-effect-wanderer',
                withCharacter: false,
            });
            const innkeeper = await createPlayer(harness, {
                twitchId: 'twitch-no-effect-bare-innkeeper',
                role: RoleType.innkeeper,
                withCharacter: false,
            });
            const heal = await persistCuringQuest('heal');

            expect(await noEffectOf(heal._id, wanderer.bearer)).toBe(false);
            expect(await noEffectOf(heal._id, innkeeper.bearer)).toBe(false);
        });

        it('reads the character once per request for a board of heals (D-25)', async () => {
            const alice = await playerAtFullLife('alice', []);
            const healed = await persistCuringQuest('heal');
            const needed = await persistCuringQuest('heal', {
                lifePointsShare: 1,
                canHeal: [],
            });
            await modelOf(Character.name, CharacterSchema).collection.updateOne(
                { _id: alice.character?._id as Types.ObjectId },
                { $set: { 'status.currentLifePoints': 900 } },
            );
            const users = modelOf(User.name, UserSchema);
            const characters = modelOf(Character.name, CharacterSchema);
            const userRead = jest.spyOn(users, 'findById');
            const characterRead = jest.spyOn(characters, 'findOne');

            try {
                const body = (
                    await graphqlRequest(
                        harness.app,
                        QUESTS_NO_EFFECT,
                        {},
                        alice.bearer,
                    )
                ).body as WireNoEffectBody;

                expect(body.errors).toBeUndefined();
                expect(
                    [...(body.data?.quests ?? [])].sort((a, b) =>
                        a.id.localeCompare(b.id),
                    ),
                ).toEqual(
                    [
                        { id: String(healed._id), noEffect: true },
                        { id: String(needed._id), noEffect: false },
                    ].sort((a, b) => a.id.localeCompare(b.id)),
                );
                // il tabellone legge lo User una volta, i vitali una sola volta per entrambe le heal
                expect(userRead).toHaveBeenCalledTimes(2);
                const vitalsReads = (
                    characterRead.mock.calls as unknown[][]
                ).filter(
                    ([, projection]) =>
                        typeof projection === 'object' &&
                        projection !== null &&
                        'status.injuries' in projection,
                );
                expect(vitalsReads).toHaveLength(1);
            } finally {
                userRead.mockRestore();
                characterRead.mockRestore();
            }
        });
    });
});
