import { getModelToken } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type request from 'supertest';
import { AuthErrorCode } from 'src/auth/auth-error-code.enum';
import { Enemy, EnemyDocument } from 'src/models/enemy.model';
import { EquipmentItem } from 'src/models/equipment-item.model';
import { RoleType } from 'src/models/enums/role-type.enum';
import { LootItem } from 'src/models/loot-item.model';
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
    persistSpell,
} from '../../../test/fixtures';
import {
    buildQuestResult,
    persistQuestResult,
} from '../../../test/quests/quest-result.fixture';

// selezione del foglio esiti (FE COMBAT-02..05)
const QUEST_RESULT = `query QuestResult($id: String!) { questResult(id: $id) { id character user outcome resolvedAt acknowledgedAt hpBefore hpAfter maxLifePoints injuriesAdded xpGained xpBefore xpAfter levelBefore levelAfter titleBefore titleAfter rescuedCharacters quest { id type title } rewards { coins { gold silver copper } items { quantity item { ... on LootItem { id name } ... on EquipmentItem { id name } } } } consumablesUsed { quantity item { ... on LootItem { id name } } } spellsUsed { usages spell { id name } } spellLearned { id name } enemy { id name } } }`;
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

    function persistTestEnemy() {
        // locations omesso: lo schema Enemy lo dichiara String singolo (deferred-items.md, 09-04)
        return modelOf<EnemyDocument>(Enemy.name).create({
            name: 'Test Bandit',
            energyWeaknesses: [],
            baseWeaknesses: [],
            relatedLore: [],
            xp: 100,
            spells: [],
            lifePoints: 1000,
            imagePath: 'enemies/test.png',
            damages: { base: [{ type: 'cut', power: 100 }], energy: [] },
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

    it('returns the populated result to its owning user', async () => {
        const potion = await persistLootItem(modelOf(LootItem.name));
        const sword = await persistEquipmentItem(modelOf(EquipmentItem.name));
        const fireball = await persistSpell(modelOf(Spell.name), {
            name: 'Fireball',
        });
        const shield = await persistSpell(modelOf(Spell.name), {
            name: 'Shield',
        });
        const enemy = await persistTestEnemy();
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
            },
            consumablesUsed: [
                { itemType: 'LootItem', item: potion._id, quantity: 2 },
            ],
            spellsUsed: [{ spell: fireball._id, usages: 2 }],
            spellLearned: shield._id,
            enemy: enemy._id,
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
            enemy: { id: String(enemy._id), name: 'Test Bandit' },
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

    it('drops orphan items and nulls orphan spells and enemy without nulling the result', async () => {
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
            enemy: new Types.ObjectId(),
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
            },
            consumablesUsed: [],
            spellsUsed: [{ usages: 1, spell: null }],
            spellLearned: null,
            enemy: null,
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
                { _id: alice.user._id },
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
