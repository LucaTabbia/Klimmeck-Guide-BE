import { Types } from 'mongoose';
import type request from 'supertest';
import { AuthErrorCode } from 'src/auth/auth-error-code.enum';
import { RoleType } from 'src/models/enums/role-type.enum';
import {
    PendingQuest,
    PendingQuestDocument,
} from 'src/models/pending-quest.model';
import { PendingQuestsModule } from 'src/pendingQuests/pending-quests.module';
import {
    AuthTestApp,
    createAuthTestApp,
    graphqlRequest,
} from '../../test/auth/auth-test-app';
import { createPlayer, TestPlayer } from '../../test/authz/player-fixture';

// nessuna selezione di quest: è un ref a Quest, non registrato nell'harness
const PENDING_QUEST =
    'query PendingQuest($id: String!) { pendingQuest(id: $id) { id waitingTime } }';
const PENDING_QUESTS = '{ pendingQuests { id } }';
const MISSING_PENDING_QUEST_ID = '64b0000000000000000000ff';

interface WireBody {
    data?: Record<string, unknown> | null;
    errors?: { message: string; extensions: Record<string, unknown> }[];
}

function bodyOf(response: request.Response): WireBody {
    return response.body as WireBody;
}

function extensionsOf(response: request.Response): unknown {
    return bodyOf(response).errors?.[0]?.extensions;
}

describe('Pending quests perimeter (owner or innkeeper)', () => {
    let harness: AuthTestApp;
    let pqAlice: PendingQuestDocument;
    let pqBruno: PendingQuestDocument;
    let alice: TestPlayer;
    let senzaPersonaggio: TestPlayer;
    let guardia: TestPlayer;
    let oste: TestPlayer;

    function persistPendingQuest(): Promise<PendingQuestDocument> {
        return harness.connection
            .model<PendingQuestDocument>(PendingQuest.name)
            .create({
                startDate: new Date('2026-10-14T10:00:00.000Z'),
                waitingTime: 60,
                quest: new Types.ObjectId(),
            });
    }

    function readPendingQuest(
        id: string,
        player: TestPlayer,
    ): Promise<request.Response> {
        return graphqlRequest(
            harness.app,
            PENDING_QUEST,
            { id },
            player.bearer,
        );
    }

    beforeAll(async () => {
        harness = await createAuthTestApp({ imports: [PendingQuestsModule] });
    });

    beforeEach(async () => {
        pqAlice = await persistPendingQuest();
        pqBruno = await persistPendingQuest();
        alice = await createPlayer(harness, {
            twitchId: 'twitch-pq-alice',
            characterOverrides: {
                quests: { completedQuests: [], pendingQuest: pqAlice._id },
            },
        });
        await createPlayer(harness, {
            twitchId: 'twitch-pq-bruno',
            characterOverrides: {
                quests: { completedQuests: [], pendingQuest: pqBruno._id },
            },
        });
        senzaPersonaggio = await createPlayer(harness, {
            twitchId: 'twitch-pq-no-character',
            withCharacter: false,
        });
        guardia = await createPlayer(harness, {
            twitchId: 'twitch-pq-guard',
            role: RoleType.guard,
        });
        oste = await createPlayer(harness, {
            twitchId: 'twitch-pq-innkeeper',
            role: RoleType.innkeeper,
            withCharacter: false,
        });
    });

    afterEach(async () => {
        await harness.clearDatabase();
    });

    afterAll(async () => {
        await harness.close();
    });

    describe('pendingQuest(id)', () => {
        it('returns the own pending quest to the adventurer', async () => {
            const response = await readPendingQuest(String(pqAlice._id), alice);

            expect(bodyOf(response).errors).toBeUndefined();
            expect(bodyOf(response).data?.pendingQuest).toEqual({
                id: String(pqAlice._id),
                waitingTime: 60,
            });
        });

        it('forbids the adventurer on a foreign pending quest', async () => {
            const response = await readPendingQuest(String(pqBruno._id), alice);

            expect(extensionsOf(response)).toEqual({ code: 'FORBIDDEN' });
            expect(bodyOf(response).errors?.[0]?.message).toBe(
                'Questa missione non ti appartiene',
            );
            expect(bodyOf(response).data ?? null).toBeNull();
        });

        it('forbids the guard on a pending quest that is not theirs', async () => {
            const response = await readPendingQuest(
                String(pqAlice._id),
                guardia,
            );

            expect(extensionsOf(response)).toEqual({ code: 'FORBIDDEN' });
        });

        it('forbids an adventurer without a character', async () => {
            const response = await readPendingQuest(
                String(pqAlice._id),
                senzaPersonaggio,
            );

            expect(extensionsOf(response)).toEqual({ code: 'FORBIDDEN' });
        });

        it.each([MISSING_PENDING_QUEST_ID, 'abc'])(
            'answers NOT_FOUND to the adventurer for %s',
            async (id) => {
                const response = await readPendingQuest(id, alice);

                expect(extensionsOf(response)).toEqual({ code: 'NOT_FOUND' });
                expect(bodyOf(response).data ?? null).toBeNull();
            },
        );

        it('returns any pending quest to the innkeeper', async () => {
            const response = await readPendingQuest(String(pqBruno._id), oste);

            expect(bodyOf(response).errors).toBeUndefined();
            expect(bodyOf(response).data?.pendingQuest).toEqual({
                id: String(pqBruno._id),
                waitingTime: 60,
            });
        });

        it('answers a typed NOT_FOUND to the innkeeper for an unknown id', async () => {
            const response = await readPendingQuest(
                MISSING_PENDING_QUEST_ID,
                oste,
            );

            expect(extensionsOf(response)).toEqual({ code: 'NOT_FOUND' });
            expect(bodyOf(response).errors?.[0]?.message).toBe(
                'Missione in attesa non trovata',
            );
        });
    });

    describe('pendingQuests', () => {
        it.each([
            ['adventurer', () => alice],
            ['guard', () => guardia],
        ])('forbids the %s', async (_role, player) => {
            const response = await graphqlRequest(
                harness.app,
                PENDING_QUESTS,
                undefined,
                player().bearer,
            );

            expect(extensionsOf(response)).toEqual({ code: 'FORBIDDEN' });
            expect(bodyOf(response).data ?? null).toBeNull();
        });

        it('lists every pending quest to the innkeeper', async () => {
            const response = await graphqlRequest(
                harness.app,
                PENDING_QUESTS,
                undefined,
                oste.bearer,
            );

            expect(bodyOf(response).errors).toBeUndefined();
            const ids = (
                bodyOf(response).data?.pendingQuests as { id: string }[]
            )
                .map(({ id }) => id)
                .sort();
            expect(ids).toEqual(
                [String(pqAlice._id), String(pqBruno._id)].sort(),
            );
        });

        it('stays unauthenticated without a bearer', async () => {
            const response = await graphqlRequest(harness.app, PENDING_QUESTS);

            expect(extensionsOf(response)).toEqual({
                code: AuthErrorCode.UNAUTHENTICATED,
            });
        });
    });
});
