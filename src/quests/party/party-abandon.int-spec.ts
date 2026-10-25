import { Types } from 'mongoose';
import type request from 'supertest';
import { graphqlRequest } from '../../../test/auth/auth-test-app';
import { FixedClock } from '../../../test/auth/fixed-clock';
import {
    createPlayer,
    type TestPlayer,
} from '../../../test/authz/player-fixture';
import { buildQuest } from '../../../test/fixtures';
import {
    createOutcomeHarness,
    OUTCOME_START,
    type OutcomeHarness,
    persistQuester,
    type Quester,
    type QuesterOptions,
} from '../../../test/quests/outcome-world';
import { SequenceChance } from '../../../test/quests/sequence-chance';
import { PartyLifecycleModule } from './party-lifecycle.module';

const NOW = new Date('2026-10-25T12:00:00.000Z');
const ABANDON_QUEST =
    'mutation Abandon($id: String!, $questId: String!) { abandonQuest(request: { id: $id, questId: $questId }) { successful response } }';

interface WireBody {
    data?: {
        abandonQuest?: { successful: boolean; response: string } | null;
    } | null;
    errors?: { extensions?: { code?: string } }[];
}

const bodyOf = (response: request.Response): WireBody =>
    response.body as WireBody;

const codeOf = (response: request.Response): string | undefined =>
    bodyOf(response).errors?.[0]?.extensions?.code;

describe('abandonQuest (replSet, wire)', () => {
    let world: OutcomeHarness;
    let seq = 0;
    const clock = new FixedClock(NOW);
    const chance = new SequenceChance();

    beforeAll(async () => {
        world = await createOutcomeHarness({
            clock,
            chance,
            imports: [PartyLifecycleModule],
        });
    });

    beforeEach(async () => {
        await world.reset();
    });

    afterAll(async () => {
        await world.harness.close();
    });

    const bossQuest = {
        infos: { ...buildQuest().infos, type: 'boss' },
        requirements: {
            ...buildQuest().requirements,
            requiredAdventurers: [{ title: null, count: 2 }],
        },
    };

    function quester(options: Partial<QuesterOptions> = {}): Promise<Quester> {
        seq += 1;
        return persistQuester(world.harness, {
            twitchId: `tw-abandon-${seq}`,
            questOverrides: bossQuest,
            startDate: null,
            arrivedAt: OUTCOME_START,
            ...options,
        });
    }

    function abandon(
        subject: { player: TestPlayer; characterId: Types.ObjectId },
        questId: unknown,
        bearer = subject.player.bearer,
    ): Promise<request.Response> {
        return graphqlRequest(
            world.harness.app,
            ABANDON_QUEST,
            { id: subject.characterId.toHexString(), questId: String(questId) },
            bearer,
        );
    }

    const characterOf = (subject: Quester) =>
        world.models.characters.findById(subject.characterId).lean<any>();

    const questOf = (subject: Quester) =>
        world.models.quests.findById(subject.quest._id).lean<any>();

    async function expectUntouched(subject: Quester): Promise<void> {
        expect(String((await characterOf(subject)).quests.pendingQuest)).toBe(
            String(subject.pendingQuest._id),
        );
        expect(
            await world.models.pendingQuests.exists({
                _id: subject.pendingQuest._id,
            }),
        ).toBeTruthy();
        expect((await questOf(subject)).registeredAdventurers).toHaveLength(1);
    }

    it('lets a member waiting on the marker leave the party', async () => {
        const waiting = await quester();

        const response = await abandon(waiting, waiting.quest._id);

        expect(bodyOf(response).errors).toBeUndefined();
        expect(bodyOf(response).data?.abandonQuest).toEqual({
            successful: true,
            response: 'Missione abbandonata',
        });
        expect((await characterOf(waiting)).quests.pendingQuest).toBeNull();
        expect(
            await world.models.pendingQuests.exists({
                _id: waiting.pendingQuest._id,
            }),
        ).toBeNull();
        const quest = await questOf(waiting);
        expect(quest.registeredAdventurers).toEqual([]);
        expect(quest.startedAt).toBeNull();
        expect(quest.concludedAt).toBeNull();
        expect(await world.models.questResults.countDocuments()).toBe(0);
    });

    it('refuses to leave a quest already started with QUEST_NOT_WAITING', async () => {
        const started = await quester({ startDate: OUTCOME_START });

        const response = await abandon(started, started.quest._id);

        expect(codeOf(response)).toBe('QUEST_NOT_WAITING');
        await expectUntouched(started);
    });

    it('refuses to leave while still travelling with QUEST_NOT_WAITING', async () => {
        const travelling = await quester({ arrivedAt: null });

        const response = await abandon(travelling, travelling.quest._id);

        expect(codeOf(response)).toBe('QUEST_NOT_WAITING');
        await expectUntouched(travelling);
    });

    it('answers NOT_FOUND without a standard lane or for another quest', async () => {
        seq += 1;
        const idle = await createPlayer(world.harness, {
            twitchId: `tw-abandon-${seq}`,
        });
        const waiting = await quester();
        const idleSubject = {
            player: idle,
            characterId: idle.character!._id as Types.ObjectId,
        };

        expect(codeOf(await abandon(idleSubject, waiting.quest._id))).toBe(
            'NOT_FOUND',
        );
        expect(codeOf(await abandon(waiting, new Types.ObjectId()))).toBe(
            'NOT_FOUND',
        );
        await expectUntouched(waiting);
    });

    it('forbids another user to abandon the quest', async () => {
        const waiting = await quester();
        seq += 1;
        const intruder = await createPlayer(world.harness, {
            twitchId: `tw-abandon-${seq}`,
        });

        const response = await abandon(
            waiting,
            waiting.quest._id,
            intruder.bearer,
        );

        expect(codeOf(response)).toBe('FORBIDDEN');
        await expectUntouched(waiting);
    });

    it('writes once under two concurrent abandons', async () => {
        const waiting = await quester();
        const other = await quester({ quest: waiting.quest });

        const responses = await Promise.all([
            abandon(waiting, waiting.quest._id),
            abandon(waiting, waiting.quest._id),
        ]);

        const succeeded = responses.filter(
            (response) => bodyOf(response).data?.abandonQuest?.successful,
        );
        expect(succeeded).toHaveLength(1);
        const codes = responses.map(codeOf).filter(Boolean);
        expect(codes).toHaveLength(1);
        expect(['NOT_FOUND', 'QUEST_NOT_WAITING']).toContain(codes[0]);
        expect(
            (await questOf(waiting)).registeredAdventurers.map((seat: any) =>
                String(seat.character),
            ),
        ).toEqual([String(other.characterId)]);
    });
});
