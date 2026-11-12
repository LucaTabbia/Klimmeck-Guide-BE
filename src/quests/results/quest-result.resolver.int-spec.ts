import { getModelToken } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type request from 'supertest';
import { AuthErrorCode } from 'src/auth/auth-error-code.enum';
import { Enemy, EnemyDocument } from 'src/models/enemy.model';
import { EquipmentItem } from 'src/models/equipment-item.model';
import { RoleType } from 'src/models/enums/role-type.enum';
import { LootItem } from 'src/models/loot-item.model';
import { Lore } from 'src/models/lore.model';
import { Pet } from 'src/models/pet.model';
import {
    QuestResult,
    QuestResultDocument,
} from 'src/models/quest-result/quest-result.model';
import { Spell } from 'src/models/spell.model';
import { QuestResultsModule } from 'src/quests/results/quest-results.module';
import {
    AuthTestApp,
    createAuthTestApp,
    graphqlRequest,
} from '../../../test/auth/auth-test-app';
import { createPlayer, TestPlayer } from '../../../test/authz/player-fixture';
import {
    persistEquipmentItem,
    persistLootItem,
    persistLore,
    persistPet,
    persistSpell,
} from '../../../test/fixtures';
import {
    buildQuestResult,
    persistQuestResult,
} from '../../../test/quests/quest-result.fixture';

// selezione del foglio esiti (FE COMBAT-02..05)
const QUEST_RESULT = `query QuestResult($id: String!) { questResult(id: $id) { id character user outcome resolvedAt acknowledgedAt hpBefore hpAfter maxLifePoints injuriesAdded xpGained xpBefore xpAfter levelBefore levelAfter titleBefore titleAfter rescuedCharacters quest { id type title } rewards { coins { gold silver copper } items { quantity item { ... on LootItem { id name } ... on EquipmentItem { id name } } } pet { id name } } consumablesUsed { quantity item { ... on LootItem { id name } } } spellsUsed { usages spell { id name } } spellLearned { id name } enemies { quantity enemy { id name } } stagesCleared stagesTotal } }`;
const QUEST_RESULT_LORE =
    'query QuestResult($id: String!) { questResult(id: $id) { id spellLearned { id name } loreUnlocked { id name type } } }';
const QUEST_RESULT_COMPANION =
    'query QuestResult($id: String!) { questResult(id: $id) { id xpGained petXpGained } }';
const QUEST_RESULT_HEALED =
    'query QuestResult($id: String!) { questResult(id: $id) { id hpBefore hpAfter injuriesHealed } }';
const QUEST_RESULT_ENEMY_SPELLS =
    'query QuestResult($id: String!) { questResult(id: $id) { id enemies { quantity enemy { id spells { id name } } } } }';
const MISSING_ID = '64b0000000000000000000ff';
const CONFIRMED_AT = new Date('2026-10-25T09:30:00.000Z');

interface WireBody {
    data?: { questResult?: Record<string, unknown> | null } | null;
    errors?: { message: string; extensions: Record<string, unknown> }[];
}

function bodyOf(response: request.Response): WireBody {
    return response.body as WireBody;
}

describe('questResult(id) (wire)', () => {
    let harness: AuthTestApp;
    let alice: TestPlayer;
    let bruno: TestPlayer;
    let oste: TestPlayer;

    function modelOf<T>(name: string): Model<T> {
        return harness.app.get<Model<T>>(getModelToken(name));
    }

    function persistAliceResult(overrides: Record<string, unknown> = {}) {
        return persistQuestResult(
            modelOf<QuestResultDocument>(QuestResult.name),
            {
                character: alice.character?._id,
                user: alice.user._id,
                ...overrides,
            },
        );
    }

    function persistTestEnemy(overrides: Record<string, unknown> = {}) {
        // locations omesso: lo schema Enemy lo dichiara String singolo (deferred-items.md, 09-04)
        return modelOf<EnemyDocument>(Enemy.name).create({
            name: 'Test Bandit',
            weaknesses: { base: [], energy: [] },
            relatedLore: [],
            xp: 100,
            spells: [],
            lifePoints: 1000,
            imagePath: 'enemies/test.png',
            damages: { base: [{ type: 'cut', power: 100 }], energy: [] },
            ...overrides,
        });
    }

    function readResult(
        id: string,
        bearer?: string,
    ): Promise<request.Response> {
        return graphqlRequest(harness.app, QUEST_RESULT, { id }, bearer);
    }

    beforeAll(async () => {
        harness = await createAuthTestApp({ imports: [QuestResultsModule] });
        for (const name of [
            QuestResult.name,
            Enemy.name,
            Spell.name,
            LootItem.name,
            EquipmentItem.name,
            Pet.name,
            Lore.name,
        ]) {
            await modelOf(name).createCollection();
        }
    });

    beforeEach(async () => {
        alice = await createPlayer(harness, { twitchId: 'twitch-res-alice' });
        bruno = await createPlayer(harness, { twitchId: 'twitch-res-bruno' });
        oste = await createPlayer(harness, {
            twitchId: 'twitch-res-innkeeper',
            role: RoleType.innkeeper,
        });
    });

    afterEach(async () => {
        await harness.clearDatabase();
    });

    afterAll(async () => {
        await harness.close();
    });

    it('returns the populated result with the fought enemies to its owning user (D-01, D-21)', async () => {
        const potion = await persistLootItem(modelOf(LootItem.name));
        const sword = await persistEquipmentItem(modelOf(EquipmentItem.name));
        const fireball = await persistSpell(modelOf(Spell.name), {
            name: 'Fireball',
        });
        const shield = await persistSpell(modelOf(Spell.name), {
            name: 'Shield',
        });
        const enemy = await persistTestEnemy();
        const pet = await persistPet(modelOf(Pet.name), {
            name: 'Gufo delle nevi',
            sellable: false,
        });
        const questId = new Types.ObjectId();
        const rescued = new Types.ObjectId();
        const alsoRescued = new Types.ObjectId();
        const result = await persistAliceResult({
            quest: { id: questId, type: 'job', title: 'Bandits at the gate' },
            hpBefore: 1000,
            hpAfter: 640,
            maxLifePoints: 1200,
            injuriesAdded: ['headConcussion'],
            xpGained: 150,
            xpBefore: 100,
            xpAfter: 250,
            levelBefore: 1,
            levelAfter: 2,
            titleBefore: 'rookie',
            titleAfter: 'adventurer',
            rescuedCharacters: [rescued, alsoRescued],
            rewards: {
                coins: { gold: 1, silver: 2, copper: 3 },
                items: [
                    { itemType: 'EquipmentItem', item: sword._id, quantity: 1 },
                    { itemType: 'LootItem', item: potion._id, quantity: 3 },
                ],
                pet: pet._id,
            },
            consumablesUsed: [
                { itemType: 'LootItem', item: potion._id, quantity: 2 },
            ],
            spellsUsed: [{ spell: fireball._id, usages: 2 }],
            spellLearned: shield._id,
            enemies: [{ enemy: enemy._id, quantity: 2 }],
        });

        const response = await readResult(String(result._id), alice.bearer);

        expect(bodyOf(response).errors).toBeUndefined();
        expect(bodyOf(response).data?.questResult).toEqual({
            id: String(result._id),
            character: String(alice.character?._id),
            user: String(alice.user._id),
            outcome: 'success',
            resolvedAt: '2026-10-24T10:00:00.000Z',
            acknowledgedAt: null,
            hpBefore: 1000,
            hpAfter: 640,
            maxLifePoints: 1200,
            injuriesAdded: ['headConcussion'],
            xpGained: 150,
            xpBefore: 100,
            xpAfter: 250,
            levelBefore: 1,
            levelAfter: 2,
            titleBefore: 'rookie',
            titleAfter: 'adventurer',
            rescuedCharacters: [String(rescued), String(alsoRescued)],
            quest: {
                id: String(questId),
                type: 'job',
                title: 'Bandits at the gate',
            },
            rewards: {
                coins: { gold: 1, silver: 2, copper: 3 },
                items: [
                    {
                        quantity: 1,
                        item: { id: String(sword._id), name: 'Test Sword' },
                    },
                    {
                        quantity: 3,
                        item: { id: String(potion._id), name: 'Test Potion' },
                    },
                ],
                pet: { id: String(pet._id), name: 'Gufo delle nevi' },
            },
            consumablesUsed: [
                {
                    quantity: 2,
                    item: { id: String(potion._id), name: 'Test Potion' },
                },
            ],
            spellsUsed: [
                {
                    usages: 2,
                    spell: { id: String(fireball._id), name: 'Fireball' },
                },
            ],
            spellLearned: { id: String(shield._id), name: 'Shield' },
            enemies: [
                {
                    quantity: 2,
                    enemy: { id: String(enemy._id), name: 'Test Bandit' },
                },
            ],
            stagesCleared: null,
            stagesTotal: null,
        });
    });

    it('returns an unconfirmed result with a null confirmation', async () => {
        const result = await persistAliceResult();

        const response = await readResult(String(result._id), alice.bearer);

        expect(bodyOf(response).errors).toBeUndefined();
        expect(bodyOf(response).data?.questResult?.acknowledgedAt).toBeNull();
    });

    it('returns the confirmation time once the result is confirmed', async () => {
        const result = await persistAliceResult({
            acknowledgedAt: CONFIRMED_AT,
        });

        const response = await readResult(String(result._id), alice.bearer);

        expect(bodyOf(response).errors).toBeUndefined();
        expect(bodyOf(response).data?.questResult?.acknowledgedAt).toBe(
            CONFIRMED_AT.toISOString(),
        );
    });

    it('returns a null confirmation for a result stored before the field existed', async () => {
        const results = modelOf<QuestResultDocument>(QuestResult.name);
        const { insertedId } = await results.collection.insertOne(
            buildQuestResult({
                character: alice.character?._id,
                user: alice.user._id,
            }),
        );

        const response = await readResult(String(insertedId), alice.bearer);

        expect(bodyOf(response).errors).toBeUndefined();
        expect(bodyOf(response).data?.questResult).toMatchObject({
            id: String(insertedId),
            acknowledgedAt: null,
        });
    });

    it('drops orphan items and enemies and nulls orphan spells and pet without nulling the result (D-28)', async () => {
        const potion = await persistLootItem(modelOf(LootItem.name));
        const result = await persistAliceResult({
            rewards: {
                coins: { gold: 0, silver: 0, copper: 0 },
                items: [
                    {
                        itemType: 'LootItem',
                        item: new Types.ObjectId(),
                        quantity: 1,
                    },
                    { itemType: 'LootItem', item: potion._id, quantity: 1 },
                ],
                pet: new Types.ObjectId(),
            },
            consumablesUsed: [
                {
                    itemType: 'LootItem',
                    item: new Types.ObjectId(),
                    quantity: 1,
                },
            ],
            spellsUsed: [{ spell: new Types.ObjectId(), usages: 1 }],
            spellLearned: new Types.ObjectId(),
            enemies: [{ enemy: new Types.ObjectId(), quantity: 1 }],
        });

        const response = await readResult(String(result._id), alice.bearer);

        expect(bodyOf(response).errors).toBeUndefined();
        expect(bodyOf(response).data?.questResult).toMatchObject({
            rewards: {
                items: [
                    {
                        quantity: 1,
                        item: { id: String(potion._id), name: 'Test Potion' },
                    },
                ],
                pet: null,
            },
            consumablesUsed: [],
            spellsUsed: [{ usages: 1, spell: null }],
            spellLearned: null,
            enemies: [],
        });
    });

    // Spell.name è String!: un id nudo o pendente annullerebbe il nemico sul filo
    it('serves the spells of a fought enemy on the result sheet (D-02)', async () => {
        const spell = await persistSpell(modelOf(Spell.name), {
            name: 'Soffio gelido',
        });
        const enemy = await persistTestEnemy({
            spells: [spell._id, new Types.ObjectId()],
        });
        const result = await persistAliceResult({
            enemies: [{ enemy: enemy._id, quantity: 1 }],
        });

        const response = await graphqlRequest(
            harness.app,
            QUEST_RESULT_ENEMY_SPELLS,
            { id: String(result._id) },
            alice.bearer,
        );

        expect(bodyOf(response).errors).toBeUndefined();
        expect(bodyOf(response).data?.questResult).toEqual({
            id: String(result._id),
            enemies: [
                {
                    quantity: 1,
                    enemy: {
                        id: String(enemy._id),
                        spells: [
                            { id: String(spell._id), name: 'Soffio gelido' },
                        ],
                    },
                },
            ],
        });
    });

    it('serves the lore unlocked by the outcome with the FE selection (D-09)', async () => {
        const goblin = await persistLore(modelOf(Lore.name), {
            type: 'enemy',
            name: 'Goblin',
        });
        const result = await persistAliceResult({
            loreUnlocked: [goblin._id, new Types.ObjectId()],
        });

        const response = await graphqlRequest(
            harness.app,
            QUEST_RESULT_LORE,
            { id: String(result._id) },
            alice.bearer,
        );

        expect(bodyOf(response)).toEqual({
            data: {
                questResult: {
                    id: String(result._id),
                    spellLearned: null,
                    loreUnlocked: [
                        {
                            id: String(goblin._id),
                            name: 'Goblin',
                            type: 'enemy',
                        },
                    ],
                },
            },
        });
    });

    it('serves an old result without unlocked lore as an empty list (D-09)', async () => {
        const result = await persistAliceResult();
        await modelOf<QuestResultDocument>(
            QuestResult.name,
        ).collection.updateOne(
            { _id: result._id },
            { $unset: { loreUnlocked: '' } },
        );

        const response = await graphqlRequest(
            harness.app,
            QUEST_RESULT_LORE,
            { id: String(result._id) },
            alice.bearer,
        );

        expect(bodyOf(response)).toEqual({
            data: {
                questResult: {
                    id: String(result._id),
                    spellLearned: null,
                    loreUnlocked: [],
                },
            },
        });
    });

    it('serves the injuries healed by the outcome (D-08)', async () => {
        const result = await persistAliceResult({
            injuriesHealed: ['deepCut', 'sprain'],
        });

        const response = await graphqlRequest(
            harness.app,
            QUEST_RESULT_HEALED,
            { id: String(result._id) },
            alice.bearer,
        );

        expect(bodyOf(response)).toEqual({
            data: {
                questResult: {
                    id: String(result._id),
                    hpBefore: 1000,
                    hpAfter: 1000,
                    injuriesHealed: ['deepCut', 'sprain'],
                },
            },
        });
    });

    it('serves an old result without healed injuries as an empty list (D-08)', async () => {
        const result = await persistAliceResult();
        await modelOf<QuestResultDocument>(
            QuestResult.name,
        ).collection.updateOne(
            { _id: result._id },
            { $unset: { injuriesHealed: '' } },
        );

        const response = await graphqlRequest(
            harness.app,
            QUEST_RESULT_HEALED,
            { id: String(result._id) },
            alice.bearer,
        );

        expect(bodyOf(response)).toEqual({
            data: {
                questResult: {
                    id: String(result._id),
                    hpBefore: 1000,
                    hpAfter: 1000,
                    injuriesHealed: [],
                },
            },
        });
    });

    it('serves the companion xp gained by the outcome (D-04)', async () => {
        const result = await persistAliceResult({
            xpGained: 250,
            petXpGained: 20,
        });

        const response = await graphqlRequest(
            harness.app,
            QUEST_RESULT_COMPANION,
            { id: String(result._id) },
            alice.bearer,
        );

        expect(bodyOf(response)).toEqual({
            data: {
                questResult: {
                    id: String(result._id),
                    xpGained: 250,
                    petXpGained: 20,
                },
            },
        });
    });

    it('serves an old result without the companion xp as 0 (D-04)', async () => {
        const result = await persistAliceResult({ xpGained: 250 });
        await modelOf<QuestResultDocument>(
            QuestResult.name,
        ).collection.updateOne(
            { _id: result._id },
            { $unset: { petXpGained: '' } },
        );

        const response = await graphqlRequest(
            harness.app,
            QUEST_RESULT_COMPANION,
            { id: String(result._id) },
            alice.bearer,
        );

        expect(bodyOf(response)).toEqual({
            data: {
                questResult: {
                    id: String(result._id),
                    xpGained: 250,
                    petXpGained: 0,
                },
            },
        });
    });

    it('serves the obtained pet on the result (D-21)', async () => {
        const pet = await persistPet(modelOf(Pet.name), {
            name: 'Gufo delle nevi',
            sellable: false,
        });
        const result = await persistAliceResult({
            rewards: {
                coins: { gold: 0, silver: 0, copper: 0 },
                items: [],
                pet: pet._id,
            },
        });

        const won = await readResult(String(result._id), alice.bearer);
        await modelOf(Pet.name).deleteOne({ _id: pet._id });
        const orphaned = await readResult(String(result._id), alice.bearer);

        expect(bodyOf(won).errors).toBeUndefined();
        expect(bodyOf(won).data?.questResult).toMatchObject({
            rewards: { pet: { id: String(pet._id), name: 'Gufo delle nevi' } },
        });
        expect(bodyOf(orphaned).errors).toBeUndefined();
        expect(bodyOf(orphaned).data?.questResult).toMatchObject({
            id: String(result._id),
            rewards: { pet: null },
        });
    });

    it('still serves the result to its user after the character died', async () => {
        const result = await persistAliceResult({
            outcome: 'death',
            hpAfter: 0,
        });
        await harness.connection
            .collection('users')
            .updateOne(
                { _id: alice.user._id as Types.ObjectId },
                { $set: { currentCharacter: null } },
            );

        const response = await readResult(String(result._id), alice.bearer);

        expect(bodyOf(response).errors).toBeUndefined();
        expect(bodyOf(response).data?.questResult).toMatchObject({
            id: String(result._id),
            outcome: 'death',
            hpAfter: 0,
        });
    });

    it.each([
        ['another adventurer', () => bruno],
        ['the innkeeper', () => oste],
    ])('forbids %s', async (_who, player) => {
        const result = await persistAliceResult();

        const response = await readResult(String(result._id), player().bearer);

        expect(bodyOf(response).errors?.[0]?.extensions).toEqual({
            code: 'FORBIDDEN',
        });
        expect(bodyOf(response).data ?? null).toBeNull();
    });

    it('answers NOT_FOUND for an unknown id', async () => {
        const response = await readResult(MISSING_ID, alice.bearer);

        expect(bodyOf(response).errors?.[0]?.extensions).toEqual({
            code: 'NOT_FOUND',
        });
    });

    it('answers BAD_USER_INPUT for a malformed id (D-02, C1)', async () => {
        const response = await readResult('not-an-id', alice.bearer);

        expect(bodyOf(response).errors?.[0]?.extensions).toEqual({
            code: 'BAD_USER_INPUT',
        });
        expect(bodyOf(response).errors?.[0]?.message).toBe(
            'Input non valido: id',
        );
    });

    it('rejects a request without a bearer', async () => {
        const result = await persistAliceResult();

        const response = await readResult(String(result._id));

        expect(bodyOf(response).errors?.[0]?.extensions).toEqual({
            code: AuthErrorCode.UNAUTHENTICATED,
        });
    });
});
