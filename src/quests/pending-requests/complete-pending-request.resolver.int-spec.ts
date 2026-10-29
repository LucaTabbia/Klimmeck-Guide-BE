import { getQueueToken } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { type Model, Types } from 'mongoose';
import { AuthErrorCode } from 'src/auth/auth-error-code.enum';
import {
    AdminAuditLog,
    AdminAuditLogSchema,
    AUDIT_OUTCOME_OK,
} from 'src/authz/audit/admin-audit-log.model';
import { SPELL_RECOVERY_QUEUE } from 'src/characters/spells/spell-recovery-queue';
import { PUSH_CONFIG } from 'src/config/push-config';
import { RoleType } from 'src/models/enums/role-type.enum';
import { PushTransport } from 'src/push/transport/push-transport';
import { lanePathOf, QuestLane } from 'src/quests/acceptance/quest-lanes';
import { QUEST_RESOLUTION_QUEUE } from 'src/quests/outcomes/scheduling/quest-resolution-job';
import { PendingRequestsModule } from 'src/quests/pending-requests/pending-requests.module';
import {
    type AuthTestApp,
    createAuthTestApp,
    graphqlRequest,
} from '../../../test/auth/auth-test-app';
import { FixedClock } from '../../../test/auth/fixed-clock';
import {
    createPlayer,
    type TestPlayer,
} from '../../../test/authz/player-fixture';
import { buildQuest } from '../../../test/fixtures';
import { FakePushTransport } from '../../../test/push/fake-push-transport';
import {
    initOutcomeCollections,
    outcomeModels,
    persistQuester,
    QUIET_OUTCOME_OVERRIDES,
    type Quester,
} from '../../../test/quests/outcome-world';
import { FakeTravelQueue } from '../../../test/travel/fake-travel-queue';

const NOW = new Date('2026-10-24T12:00:00.000Z');
const COMPLETE =
    'mutation Complete($input: CompletePendingRequestInput!) { completePendingRequest(input: $input) { id outcome hpAfter titleAfter quest { type } } }';

interface WireResult {
    id: string;
    outcome: string;
    hpAfter: number;
    titleAfter: string;
    quest: { type: string };
}

interface WireBody {
    data?: { completePendingRequest?: WireResult[] | null } | null;
    errors?: { message: string; extensions: Record<string, unknown> }[];
}

describe('completePendingRequest (wire)', () => {
    let harness: AuthTestApp;
    let audits: Model<AdminAuditLog>;
    let seq = 0;

    beforeAll(async () => {
        harness = await createAuthTestApp({
            clock: new FixedClock(NOW),
            imports: [PendingRequestsModule],
            overrides: [
                ...QUIET_OUTCOME_OVERRIDES,
                { token: PushTransport, useValue: new FakePushTransport() },
                { token: PUSH_CONFIG, useValue: { serviceAccount: null } },
                {
                    token: getQueueToken(QUEST_RESOLUTION_QUEUE),
                    useValue: new FakeTravelQueue(),
                },
                {
                    token: getQueueToken(SPELL_RECOVERY_QUEUE),
                    useValue: new FakeTravelQueue(),
                },
            ],
        });
        audits =
            (harness.connection.models[AdminAuditLog.name] as
                | Model<AdminAuditLog>
                | undefined) ??
            harness.connection.model<AdminAuditLog>(
                AdminAuditLog.name,
                AdminAuditLogSchema,
            );
        await initOutcomeCollections(harness, outcomeModels(harness));
        await audits.init();
    });

    beforeEach(async () => {
        await harness.clearDatabase();
    });

    afterAll(async () => {
        await harness.close();
    });

    function storyQuester(): Promise<Quester> {
        seq += 1;
        return persistQuester(harness, {
            twitchId: `tw-complete-${seq}`,
            lane: QuestLane.story,
            questOverrides: {
                infos: { ...buildQuest().infos, type: 'story', title: 'Il re' },
                prizes: { ...buildQuest().prizes, xpPrize: 400 },
            },
            characterOverrides: {
                status: { xp: 0, currentLifePoints: 1000, maxLifePoints: 1000 },
            },
        });
    }

    function playerWithRole(role: RoleType): Promise<TestPlayer> {
        seq += 1;
        return createPlayer(harness, { twitchId: `tw-staff-${seq}`, role });
    }

    async function completeOnWire(
        input: Record<string, unknown>,
        bearer?: string,
    ): Promise<WireBody> {
        const response = await graphqlRequest(
            harness.app,
            COMPLETE,
            { input },
            bearer,
        );
        return response.body as WireBody;
    }

    it('lets the innkeeper complete a story and audits it', async () => {
        const subject = await storyQuester();
        const oste = await playerWithRole(RoleType.innkeeper);
        const input = { pendingQuestId: String(subject.pendingQuest._id) };

        const body = await completeOnWire(input, oste.bearer);

        expect(body.errors).toBeUndefined();
        expect(body.data?.completePendingRequest).toEqual([
            {
                id: expect.any(String),
                outcome: 'gmCompleted',
                hpAfter: 1000,
                titleAfter: 'adventurer',
                quest: { type: 'story' },
            },
        ]);
        const records = await audits.find().lean().exec();
        expect(records).toHaveLength(1);
        expect(records[0]).toMatchObject({
            actor: { userId: String(oste.user._id), role: 'innkeeper' },
            action: 'completePendingRequest',
            target: { type: 'QuestResult', id: null },
            args: { input },
            outcome: AUDIT_OUTCOME_OK,
        });
    });

    it('answers with the committed results when reading them back fails after the commit', async () => {
        const subject = await storyQuester();
        const oste = await playerWithRole(RoleType.innkeeper);
        const models = outcomeModels(harness);
        const readFailure = () => {
            throw new Error('transient read failure');
        };
        const resultReads = [
            jest
                .spyOn(models.questResults, 'findById')
                .mockImplementation(readFailure),
            jest
                .spyOn(models.questResults, 'findOne')
                .mockImplementation(readFailure),
            jest
                .spyOn(models.questResults, 'find')
                .mockImplementation(readFailure),
        ];
        const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();

        let body: WireBody;
        try {
            body = await completeOnWire(
                { pendingQuestId: String(subject.pendingQuest._id) },
                oste.bearer,
            );
        } finally {
            resultReads.forEach((spy) => spy.mockRestore());
            warn.mockRestore();
        }

        expect(body.errors).toBeUndefined();
        const stored = await models.questResults.find().lean().exec();
        expect(stored).toHaveLength(1);
        expect(body.data?.completePendingRequest).toEqual([
            {
                id: String(stored[0]._id),
                outcome: 'gmCompleted',
                hpAfter: 1000,
                titleAfter: 'adventurer',
                quest: { type: 'story' },
            },
        ]);
        expect(
            await models.pendingQuests.countDocuments({
                _id: subject.pendingQuest._id,
            }),
        ).toBe(0);
        const character = await models.characters
            .findById(subject.characterId)
            .lean()
            .exec();
        expect(
            (character as { quests: Record<string, unknown> }).quests[
                lanePathOf(QuestLane.story).split('.')[1]
            ] ?? null,
        ).toBeNull();
        const [record] = await audits.find().lean().exec();
        expect(record).toMatchObject({ outcome: AUDIT_OUTCOME_OK });
    });

    it('rejects an invalid override with its code and audits it', async () => {
        const subject = await storyQuester();
        const oste = await playerWithRole(RoleType.innkeeper);
        const input = {
            pendingQuestId: String(subject.pendingQuest._id),
            outcomes: [
                { characterId: String(subject.characterId), hpAfter: 0 },
            ],
        };

        const body = await completeOnWire(input, oste.bearer);

        expect(body.data ?? null).toBeNull();
        expect(body.errors?.[0]?.extensions).toEqual({
            code: 'OUTCOME_OVERRIDE_INVALID',
        });
        const records = await audits.find().lean().exec();
        expect(records).toHaveLength(1);
        expect(records[0]).toMatchObject({
            action: 'completePendingRequest',
            target: { type: 'QuestResult', id: null },
            outcome: 'OUTCOME_OVERRIDE_INVALID',
        });
    });

    it('audits a completion refused for a busy participant with QUEST_IN_PROGRESS (D-24)', async () => {
        const subject = await storyQuester();
        const oste = await playerWithRole(RoleType.innkeeper);
        await harness.connection
            .collection('characters')
            .updateOne(
                { _id: subject.characterId },
                { $set: { 'quests.pendingQuest': new Types.ObjectId() } },
            );

        const body = await completeOnWire(
            { pendingQuestId: String(subject.pendingQuest._id) },
            oste.bearer,
        );

        expect(body.data ?? null).toBeNull();
        expect(body.errors?.[0]?.message).toBe(
            'Il personaggio è impegnato in una missione in corso',
        );
        expect(body.errors?.[0]?.extensions).toEqual({
            code: 'QUEST_IN_PROGRESS',
        });
        const records = await audits.find().lean().exec();
        expect(records).toHaveLength(1);
        expect(records[0]).toMatchObject({
            action: 'completePendingRequest',
            target: { type: 'QuestResult', id: null },
            outcome: 'QUEST_IN_PROGRESS',
        });
    });

    it('forbids an adventurer', async () => {
        const subject = await storyQuester();

        const body = await completeOnWire(
            { pendingQuestId: String(subject.pendingQuest._id) },
            subject.player.bearer,
        );

        expect(body.data ?? null).toBeNull();
        expect(body.errors?.[0]?.extensions).toEqual({ code: 'FORBIDDEN' });
        expect(await audits.countDocuments()).toBe(0);
    });

    it('rejects a call without a bearer', async () => {
        const subject = await storyQuester();

        const body = await completeOnWire({
            pendingQuestId: String(subject.pendingQuest._id),
        });

        expect(body.errors?.[0]?.extensions).toMatchObject({
            code: AuthErrorCode.UNAUTHENTICATED,
        });
    });
});
