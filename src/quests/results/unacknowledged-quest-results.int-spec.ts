import { getModelToken } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type request from 'supertest';
import { AuthErrorCode } from 'src/auth/auth-error-code.enum';
import { Enemy } from 'src/models/enemy.model';
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
    buildQuestResult,
    persistQuestResult,
} from '../../../test/quests/quest-result.fixture';

const UNCONFIRMED =
    '{ unacknowledgedQuestResults { id outcome resolvedAt acknowledgedAt user character } }';
const T = new Date('2026-10-24T10:00:00.000Z');
const HOUR_MS = 60 * 60 * 1000;

interface UnconfirmedResult {
    id: string;
    outcome: string;
    resolvedAt: string;
    acknowledgedAt: string | null;
    user: string;
    character: string;
}

interface WireBody {
    data?: { unacknowledgedQuestResults?: UnconfirmedResult[] } | null;
    errors?: { message: string; extensions: Record<string, unknown> }[];
}

function bodyOf(response: request.Response): WireBody {
    return response.body as WireBody;
}

function hoursAfterT(hours: number): Date {
    return new Date(T.getTime() + hours * HOUR_MS);
}

describe('unconfirmed quest results list (wire)', () => {
    let harness: AuthTestApp;
    let alice: TestPlayer;
    let bruno: TestPlayer;
    let oste: TestPlayer;

    function modelOf<T>(name: string): Model<T> {
        return harness.app.get<Model<T>>(getModelToken(name));
    }

    function persistResultOf(
        player: TestPlayer,
        overrides: Record<string, unknown> = {},
    ) {
        return persistQuestResult(
            modelOf<QuestResultDocument>(QuestResult.name),
            {
                character: player.character?._id,
                user: player.user._id,
                ...overrides,
            },
        );
    }

    async function listUnconfirmed(
        bearer?: string,
    ): Promise<UnconfirmedResult[]> {
        const response = await graphqlRequest(
            harness.app,
            UNCONFIRMED,
            undefined,
            bearer,
        );
        expect(bodyOf(response).errors).toBeUndefined();
        return bodyOf(response).data?.unacknowledgedQuestResults ?? [];
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
        alice = await createPlayer(harness, { twitchId: 'twitch-ack-alice' });
        bruno = await createPlayer(harness, { twitchId: 'twitch-ack-bruno' });
        oste = await createPlayer(harness, {
            twitchId: 'twitch-ack-innkeeper',
            role: RoleType.innkeeper,
        });
    });

    afterEach(async () => {
        await harness.clearDatabase();
    });

    afterAll(async () => {
        await harness.close();
    });

    it('lists only the unconfirmed results of the caller, oldest first', async () => {
        const byHour = new Map<number, string>();
        for (const hours of [3, 1, 4, 0, 2]) {
            const result = await persistResultOf(alice, {
                resolvedAt: hoursAfterT(hours),
            });
            byHour.set(hours, String(result._id));
        }
        await persistResultOf(alice, {
            resolvedAt: hoursAfterT(-1),
            acknowledgedAt: T,
        });
        await persistResultOf(bruno, { resolvedAt: hoursAfterT(-2) });

        const listed = await listUnconfirmed(alice.bearer);

        expect(listed.map(({ id }) => id)).toEqual(
            [0, 1, 2, 3, 4].map((hours) => byHour.get(hours)),
        );
        for (const result of listed) {
            expect(result.acknowledgedAt).toBeNull();
            expect(result.user).toBe(String(alice.user._id));
        }
    });

    it('breaks ties on the resolution time by id', async () => {
        const first = new Types.ObjectId();
        const second = new Types.ObjectId();
        await persistResultOf(alice, { _id: second, resolvedAt: T });
        await persistResultOf(alice, { _id: first, resolvedAt: T });

        const listed = await listUnconfirmed(alice.bearer);

        expect(listed.map(({ id }) => id)).toEqual([
            String(first),
            String(second),
        ]);
    });

    it('caps the list at 50 results starting from the oldest', async () => {
        const documents = Array.from({ length: 60 }, (_, index) =>
            buildQuestResult({
                user: bruno.user._id,
                character: bruno.character?._id,
                resolvedAt: hoursAfterT(60 - index),
                acknowledgedAt: null,
            }),
        );
        await modelOf<QuestResultDocument>(QuestResult.name).insertMany(
            documents,
        );
        const stored = await harness.connection
            .collection('questresults')
            .find({ user: bruno.user._id })
            .sort({ resolvedAt: 1, _id: 1 })
            .limit(50)
            .toArray();

        const listed = await listUnconfirmed(bruno.bearer);

        expect(listed).toHaveLength(50);
        expect(listed.map(({ id }) => id)).toEqual(
            stored.map(({ _id }) => String(_id)),
        );
    });

    it('shows the innkeeper only their own results', async () => {
        await persistResultOf(alice);
        await persistResultOf(alice, { resolvedAt: hoursAfterT(1) });
        const own = await persistResultOf(oste);

        const listed = await listUnconfirmed(oste.bearer);

        expect(listed.map(({ id }) => id)).toEqual([String(own._id)]);
    });

    it('keeps listing the death result of an archived character', async () => {
        const death = await persistResultOf(alice, {
            outcome: 'death',
            hpAfter: 0,
        });
        await harness.connection
            .collection('characters')
            .updateOne(
                { _id: alice.character?._id },
                { $set: { deletedAt: T, deletionReason: 'death' } },
            );
        await harness.connection
            .collection('users')
            .updateOne(
                { _id: alice.user._id },
                { $set: { currentCharacter: null } },
            );

        const listed = await listUnconfirmed(alice.bearer);

        expect(listed).toEqual([
            expect.objectContaining({
                id: String(death._id),
                outcome: 'death',
                character: String(alice.character?._id),
            }),
        ]);
    });

    it('treats a stored result without the confirmation field as unconfirmed', async () => {
        const legacy = buildQuestResult({
            user: alice.user._id,
            character: alice.character?._id,
        });
        const { insertedId } = await harness.connection
            .collection('questresults')
            .insertOne(legacy);

        const listed = await listUnconfirmed(alice.bearer);

        expect(listed).toEqual([
            expect.objectContaining({
                id: String(insertedId),
                acknowledgedAt: null,
            }),
        ]);
    });

    it('rejects a call without a bearer with UNAUTHENTICATED', async () => {
        await persistResultOf(alice);

        const response = await graphqlRequest(harness.app, UNCONFIRMED);

        expect(bodyOf(response).errors?.[0]?.extensions).toEqual({
            code: AuthErrorCode.UNAUTHENTICATED,
        });
    });
});
