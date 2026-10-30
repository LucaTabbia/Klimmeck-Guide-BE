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
import { QuestResultAcknowledgementService } from 'src/quests/results/quest-result-acknowledgement.service';
import { QuestResultsModule } from 'src/quests/results/quest-results.module';
import {
    AuthTestApp,
    createAuthTestApp,
    graphqlRequest,
} from '../../../test/auth/auth-test-app';
import { FixedClock } from '../../../test/auth/fixed-clock';
import { createPlayer, TestPlayer } from '../../../test/authz/player-fixture';
import { persistQuestResult } from '../../../test/quests/quest-result.fixture';

const CONFIRM =
    'mutation Confirm($id: String!) { acknowledgeQuestResult(id: $id) { response successful } }';
const UNCONFIRMED = '{ unacknowledgedQuestResults { id } }';
const NOW = new Date('2026-10-27T12:00:00.000Z');
const EARLIER = new Date('2026-10-26T08:00:00.000Z');
const MISSING_ID = '64b0000000000000000000ff';
const CONFIRMED = { response: 'Risultato confermato', successful: true };

interface WireBody {
    data?: {
        acknowledgeQuestResult?: { response: string; successful: boolean };
        unacknowledgedQuestResults?: { id: string }[];
    } | null;
    errors?: { message: string; extensions: Record<string, unknown> }[];
}

function bodyOf(response: request.Response): WireBody {
    return response.body as WireBody;
}

describe('quest result confirmation (wire)', () => {
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

    function confirm(id: string, bearer?: string): Promise<request.Response> {
        return graphqlRequest(harness.app, CONFIRM, { id }, bearer);
    }

    async function storedConfirmationOf(id: Types.ObjectId): Promise<unknown> {
        const stored = await harness.connection
            .collection('questresults')
            .findOne({ _id: id });
        return stored?.acknowledgedAt;
    }

    beforeAll(async () => {
        harness = await createAuthTestApp({
            imports: [QuestResultsModule],
            clock: new FixedClock(NOW),
        });
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
        alice = await createPlayer(harness, { twitchId: 'twitch-conf-alice' });
        bruno = await createPlayer(harness, { twitchId: 'twitch-conf-bruno' });
        oste = await createPlayer(harness, {
            twitchId: 'twitch-conf-innkeeper',
            role: RoleType.innkeeper,
        });
    });

    afterEach(async () => {
        jest.restoreAllMocks();
        await harness.clearDatabase();
    });

    afterAll(async () => {
        await harness.close();
    });

    it('confirms the result once with the server time', async () => {
        const result = await persistAliceResult();

        const response = await confirm(String(result._id), alice.bearer);

        expect(bodyOf(response).errors).toBeUndefined();
        expect(bodyOf(response).data?.acknowledgeQuestResult).toEqual(
            CONFIRMED,
        );
        expect(await storedConfirmationOf(result._id)).toEqual(NOW);
    });

    it('answers successfully without writing when the result is already confirmed', async () => {
        const result = await persistAliceResult({ acknowledgedAt: EARLIER });

        const response = await confirm(String(result._id), alice.bearer);

        expect(bodyOf(response).errors).toBeUndefined();
        expect(bodyOf(response).data?.acknowledgeQuestResult).toEqual(
            CONFIRMED,
        );
        expect(await storedConfirmationOf(result._id)).toEqual(EARLIER);
    });

    it('writes once under two concurrent confirmations', async () => {
        const result = await persistAliceResult();
        const other = await persistAliceResult();

        const responses = await Promise.all([
            confirm(String(result._id), alice.bearer),
            confirm(String(result._id), alice.bearer),
        ]);

        for (const response of responses) {
            expect(bodyOf(response).errors).toBeUndefined();
            expect(bodyOf(response).data?.acknowledgeQuestResult).toEqual(
                CONFIRMED,
            );
        }
        expect(await storedConfirmationOf(result._id)).toEqual(NOW);

        const service = harness.app.get(QuestResultAcknowledgementService);
        const writes = await Promise.all([
            service.acknowledge(other._id, alice.user._id as Types.ObjectId),
            service.acknowledge(other._id, alice.user._id as Types.ObjectId),
        ]);

        expect([...writes].sort()).toEqual([false, true]);
        expect(await storedConfirmationOf(other._id)).toEqual(NOW);
    });

    it('answers BAD_USER_INPUT for a malformed id without reading the database (D-02)', async () => {
        const findById = jest.spyOn(Model, 'findById');
        const updateOne = jest.spyOn(Model, 'updateOne');

        const response = await confirm('not-an-id', alice.bearer);

        expect(bodyOf(response).errors?.[0]?.extensions).toEqual({
            code: 'BAD_USER_INPUT',
        });
        expect(bodyOf(response).errors?.[0]?.message).toBe(
            'Input non valido: id',
        );
        expect(findById).not.toHaveBeenCalled();
        expect(updateOne).not.toHaveBeenCalled();
    });

    it('answers NOT_FOUND for an unknown id', async () => {
        const response = await confirm(MISSING_ID, alice.bearer);

        expect(bodyOf(response).errors?.[0]?.extensions).toEqual({
            code: 'NOT_FOUND',
        });
        expect(bodyOf(response).errors?.[0]?.message).toBe(
            'Risultato non trovato',
        );
    });

    it('answers FORBIDDEN to another user and writes nothing', async () => {
        const result = await persistAliceResult();

        const response = await confirm(String(result._id), bruno.bearer);

        expect(bodyOf(response).errors?.[0]?.extensions).toEqual({
            code: 'FORBIDDEN',
        });
        expect(bodyOf(response).errors?.[0]?.message).toBe(
            'Questo risultato non ti appartiene',
        );
        expect(await storedConfirmationOf(result._id)).toBeNull();
    });

    it('answers FORBIDDEN to the innkeeper on a player result and writes nothing', async () => {
        const result = await persistAliceResult();

        const response = await confirm(String(result._id), oste.bearer);

        expect(bodyOf(response).errors?.[0]?.extensions).toEqual({
            code: 'FORBIDDEN',
        });
        expect(bodyOf(response).errors?.[0]?.message).toBe(
            'Questo risultato non ti appartiene',
        );
        expect(await storedConfirmationOf(result._id)).toBeNull();
    });

    it('lets the user confirm the death result of an archived character', async () => {
        const death = await persistAliceResult({
            outcome: 'death',
            hpAfter: 0,
        });
        await harness.connection
            .collection('characters')
            .updateOne(
                { _id: alice.character?._id as Types.ObjectId },
                { $set: { deletedAt: NOW, deletionReason: 'death' } },
            );
        // utente già scollegato da deleteCharacter dopo la morte: la conferma resta possibile (il caso collegato è in death-acknowledgement)
        await harness.connection
            .collection('users')
            .updateOne(
                { _id: alice.user._id as Types.ObjectId },
                { $set: { currentCharacter: null } },
            );

        const response = await confirm(String(death._id), alice.bearer);

        expect(bodyOf(response).errors).toBeUndefined();
        expect(bodyOf(response).data?.acknowledgeQuestResult).toEqual(
            CONFIRMED,
        );
        expect(await storedConfirmationOf(death._id)).toEqual(NOW);
    });

    it('writes no admin audit entry', async () => {
        const result = await persistAliceResult();

        await confirm(String(result._id), oste.bearer);
        await confirm(String(result._id), alice.bearer);

        expect(
            await harness.connection
                .collection('admin_audit_logs')
                .countDocuments(),
        ).toBe(0);
    });

    it('drops the confirmed result from the unconfirmed list', async () => {
        const first = await persistAliceResult({
            resolvedAt: new Date('2026-10-24T10:00:00.000Z'),
        });
        const second = await persistAliceResult({
            resolvedAt: new Date('2026-10-24T11:00:00.000Z'),
        });

        await confirm(String(first._id), alice.bearer);
        const response = await graphqlRequest(
            harness.app,
            UNCONFIRMED,
            undefined,
            alice.bearer,
        );

        expect(bodyOf(response).errors).toBeUndefined();
        expect(bodyOf(response).data?.unacknowledgedQuestResults).toEqual([
            { id: String(second._id) },
        ]);
    });

    it('rejects a call without a bearer with UNAUTHENTICATED', async () => {
        const result = await persistAliceResult();

        const response = await confirm(String(result._id));

        expect(bodyOf(response).errors?.[0]?.extensions).toEqual({
            code: AuthErrorCode.UNAUTHENTICATED,
        });
        expect(await storedConfirmationOf(result._id)).toBeNull();
    });
});
