import { type Model, Types } from 'mongoose';
import {
    AdminAuditLog,
    AdminAuditLogSchema,
    AUDIT_OUTCOME_OK,
} from 'src/authz/audit/admin-audit-log.model';
import { RoleType } from 'src/models/enums/role-type.enum';
import { QuestLane } from 'src/quests/acceptance/quest-lanes';
import { graphqlRequest } from '../../../test/auth/auth-test-app';
import { FixedClock } from '../../../test/auth/fixed-clock';
import {
    createPlayer,
    type TestPlayer,
} from '../../../test/authz/player-fixture';
import { buildQuest } from '../../../test/fixtures';
import {
    createOutcomeHarness,
    type OutcomeHarness,
    persistQuester,
    type Quester,
} from '../../../test/quests/outcome-world';
import { SequenceChance } from '../../../test/quests/sequence-chance';
import { GuidedMissionModule } from './guided-mission.module';
import { MissionDraft } from './mission-draft.model';

const NOW = new Date('2026-10-24T12:00:00.000Z');
const START =
    'mutation StartMissionDraft($pendingQuestId: ID!) { startMissionDraft(pendingQuestId: $pendingQuestId) { id questType participants { character name } prizes { character xp } fights { verdict } } }';
const READ =
    'query MissionDraft($pendingQuestId: ID!) { missionDraft(pendingQuestId: $pendingQuestId) { id } }';
const DISCARD =
    'mutation DiscardMissionDraft($pendingQuestId: ID!) { discardMissionDraft(pendingQuestId: $pendingQuestId) { response successful } }';

interface WireDraft {
    id: string;
    questType?: string;
    participants?: { character: string; name: string }[];
    prizes?: { character: string; xp: number }[];
    fights?: unknown[];
}

interface WireBody {
    data?: {
        startMissionDraft?: WireDraft | null;
        missionDraft?: WireDraft | null;
        discardMissionDraft?: { response: string; successful: boolean };
    } | null;
    errors?: { message: string; extensions: Record<string, unknown> }[];
}

describe('GuidedMissionResolver (wire)', () => {
    let world: OutcomeHarness;
    let audits: Model<AdminAuditLog>;
    let seq = 0;

    beforeAll(async () => {
        world = await createOutcomeHarness({
            clock: new FixedClock(NOW),
            chance: new SequenceChance(),
            imports: [GuidedMissionModule],
        });
        const connection = world.harness.connection;
        audits =
            (connection.models[AdminAuditLog.name] as
                | Model<AdminAuditLog>
                | undefined) ??
            connection.model<AdminAuditLog>(
                AdminAuditLog.name,
                AdminAuditLogSchema,
            );
        await audits.init();
        await connection.model(MissionDraft.name).init();
    });

    beforeEach(async () => {
        await world.reset();
    });

    afterAll(async () => {
        await world.harness.close();
    });

    async function worldMissionPair(): Promise<[Quester, Quester]> {
        seq += 2;
        const first = await persistQuester(world.harness, {
            twitchId: `tw-gm-wire-${seq}a`,
            lane: QuestLane.worldMission,
            questOverrides: {
                infos: {
                    ...buildQuest().infos,
                    type: 'worldMission',
                    title: 'La corte del re',
                },
                requirements: {
                    ...buildQuest().requirements,
                    minTitle: 'rookie',
                },
                prizes: { ...buildQuest().prizes, xpPrize: 300 },
            },
        });
        const second = await persistQuester(world.harness, {
            twitchId: `tw-gm-wire-${seq}b`,
            lane: QuestLane.worldMission,
            quest: first.quest,
        });
        return [first, second];
    }

    function innkeeper(): Promise<TestPlayer> {
        seq += 1;
        return createPlayer(world.harness, {
            twitchId: `tw-gm-oste-${seq}`,
            role: RoleType.innkeeper,
        });
    }

    const hexOf = (subject: Quester) => String(subject.pendingQuest._id);

    async function send(
        document: string,
        pendingQuestId: string,
        bearer: string,
    ): Promise<WireBody> {
        const response = await graphqlRequest(
            world.harness.app,
            document,
            { pendingQuestId },
            bearer,
        );
        return response.body as WireBody;
    }

    it('starts, reads and discards a draft over the wire (D-09)', async () => {
        const [first, second] = await worldMissionPair();
        const oste = await innkeeper();

        const started = await send(START, hexOf(first), oste.bearer);

        expect(started.errors).toBeUndefined();
        const draft = started.data!.startMissionDraft!;
        expect(draft.questType).toBe('worldMission');
        expect(draft.fights).toEqual([]);
        const seated = [first, second].map((subject) => ({
            character: String(subject.characterId),
            name: subject.player.character!.infos.name,
        }));
        expect(
            [...draft.participants!].sort((a, b) =>
                a.character.localeCompare(b.character),
            ),
        ).toEqual(
            seated.sort((a, b) => a.character.localeCompare(b.character)),
        );
        expect(draft.prizes!.map(({ character }) => character).sort()).toEqual(
            seated.map(({ character }) => character).sort(),
        );

        const read = await send(READ, hexOf(second), oste.bearer);

        expect(read.errors).toBeUndefined();
        expect(read.data!.missionDraft).toEqual({ id: draft.id });

        const discarded = await send(DISCARD, hexOf(second), oste.bearer);

        expect(discarded.errors).toBeUndefined();
        expect(discarded.data!.discardMissionDraft).toEqual({
            response: 'Bozza scartata',
            successful: true,
        });
        const after = await send(READ, hexOf(first), oste.bearer);
        expect(after.errors).toBeUndefined();
        expect(after.data!.missionDraft).toBeNull();
    });

    it('never serves the draft to a player (D-10)', async () => {
        const [first] = await worldMissionPair();
        const oste = await innkeeper();
        await send(START, hexOf(first), oste.bearer);

        for (const document of [START, READ, DISCARD]) {
            const body = await send(
                document,
                hexOf(first),
                first.player.bearer,
            );

            // la query è nullable: il rifiuto arriva come data { missionDraft: null }
            expect(Object.values(body.data ?? {})).not.toContainEqual(
                expect.anything(),
            );
            expect(
                body.errors?.map(({ extensions }) => extensions.code),
            ).toEqual(['FORBIDDEN']);
        }
        expect(
            await world.harness.connection
                .model(MissionDraft.name)
                .countDocuments(),
        ).toBe(1);
    });

    it('audits the draft mutations and not the read (D-26)', async () => {
        const [first] = await worldMissionPair();
        const oste = await innkeeper();
        const pendingQuestId = hexOf(first);

        await send(START, pendingQuestId, oste.bearer);
        await send(READ, pendingQuestId, oste.bearer);
        await send(DISCARD, pendingQuestId, oste.bearer);
        await send(READ, pendingQuestId, oste.bearer);

        const records = await audits.find().sort({ _id: 1 }).lean().exec();
        expect(records.map(({ action }) => action)).toEqual([
            'startMissionDraft',
            'discardMissionDraft',
        ]);
        for (const record of records) {
            expect(record).toMatchObject({
                actor: { userId: String(oste.user._id), role: 'innkeeper' },
                target: { type: 'PendingQuest', id: pendingQuestId },
                args: { pendingQuestId },
                outcome: AUDIT_OUTCOME_OK,
            });
        }
    });

    it('answers not found for an unknown pending quest (D-09)', async () => {
        const oste = await innkeeper();

        const body = await send(
            START,
            new Types.ObjectId().toHexString(),
            oste.bearer,
        );

        expect(body.data ?? null).toBeNull();
        expect(body.errors?.map(({ extensions }) => extensions.code)).toEqual([
            'NOT_FOUND',
        ]);
    });
});
