import { Model, Schema, Types } from 'mongoose';
import {
    Character,
    CharacterSchema,
} from 'src/models/character/character.model';
import { Enemy, EnemySchema } from 'src/models/enemy.model';
import { DeletionReason } from 'src/models/enums/deletion-reason.enum';
import { RoleType } from 'src/models/enums/role-type.enum';
import {
    PointOfInterest,
    PointOfInterestSchema,
} from 'src/models/point-of-interest.model';
import {
    QuestResult,
    QuestResultSchema,
} from 'src/models/quest-result/quest-result.model';
import { Quest, QuestSchema } from 'src/models/quest/quest.model';
import { QuestsModule } from 'src/quests/quests.module';
import { QuestResultsModule } from 'src/quests/results/quest-results.module';
import {
    AuthTestApp,
    createAuthTestApp,
    graphqlRequest,
} from '../../test/auth/auth-test-app';
import {
    graphqlWsUrl,
    OpenSubscription,
    openSubscription,
    withTimeout,
} from '../../test/auth/ws-test-client';
import { createPlayer, type TestPlayer } from '../../test/authz/player-fixture';
import {
    buildQuest,
    persistEnemy,
    persistPoi,
    persistQuest,
} from '../../test/fixtures';
import {
    primeChangeStream,
    questResultTouch,
} from '../../test/harness/prime-change-stream';
import { playerKnowing } from '../../test/lore/lore-world';
import { persistQuestResult } from '../../test/quests/quest-result.fixture';

// selezione FE verbatim (QuestFragment e QuestResultFragment della FE Phase 17)
const ENEMY_FIELDS =
    'enemies { quantity known enemy { id name imagePath xp } }';
const QUEST = `query Quest($id: String!) { quest(id: $id) { id infos { ${ENEMY_FIELDS} } } }`;
const QUEST_RESULT = `query QuestResult($id: String!) { questResult(id: $id) { id ${ENEMY_FIELDS} } }`;
const QUEST_RESULT_RECEIVED = `subscription OnQuestResult($characterId: String!) { questResultReceived(characterId: $characterId) { id ${ENEMY_FIELDS} } }`;
const EVENT_WAIT_MS = 5000;
// il client è lazy: la subscription si apre dopo il primo next(), una finestra di silenzio la lascia registrare
const SUBSCRIBER_WAIT_MS = 300;

interface WireQuestEnemy {
    quantity: number;
    known: boolean;
    enemy: { id: string; name: string; imagePath: string; xp: number };
}

interface WireBody {
    data?: {
        quest?: { id: string; infos: { enemies: WireQuestEnemy[] } };
        questResult?: { id: string; enemies: WireQuestEnemy[] };
    } | null;
    errors?: unknown[];
}

type QuestResultReceived = {
    questResultReceived: { id: string; enemies: WireQuestEnemy[] };
};

type EnemyRef = { _id: Types.ObjectId };

describe('QuestEnemy.known (wire)', () => {
    let harness: AuthTestApp;
    let goblin: EnemyRef;
    let goblinBoss: EnemyRef;
    let wolf: EnemyRef;
    let poi: { _id: Types.ObjectId };
    const opened: OpenSubscription<QuestResultReceived>[] = [];

    function modelOf(name: string, schema: Schema): Model<any> {
        return (
            harness.connection.models[name] ??
            harness.connection.model(name, schema)
        );
    }

    function entriesOf(...enemies: EnemyRef[]) {
        return enemies.map((enemy) => ({ enemy: enemy._id, quantity: 1 }));
    }

    function persistQuestAgainst(...enemies: EnemyRef[]) {
        return persistQuest(modelOf(Quest.name, QuestSchema), {
            infos: {
                ...buildQuest().infos,
                markerLocation: poi._id,
                enemies: entriesOf(...enemies),
            },
        });
    }

    function persistResultOf(player: TestPlayer, ...enemies: EnemyRef[]) {
        return persistQuestResult(
            modelOf(QuestResult.name, QuestResultSchema),
            {
                character: player.character?._id,
                user: player.user._id,
                enemies: entriesOf(...enemies),
            },
        );
    }

    async function knownOnQuest(
        questId: Types.ObjectId,
        bearer: string,
    ): Promise<Record<string, boolean>> {
        const response = await graphqlRequest(
            harness.app,
            QUEST,
            { id: String(questId) },
            bearer,
        );
        const body = response.body as WireBody;
        expect(body.errors).toBeUndefined();
        return knownByName(body.data?.quest?.infos.enemies ?? []);
    }

    function knownByName(entries: WireQuestEnemy[]): Record<string, boolean> {
        return Object.fromEntries(
            entries.map((entry) => [entry.enemy.name, entry.known]),
        );
    }

    async function nextResult(
        subscription: OpenSubscription<QuestResultReceived>,
    ): Promise<WireQuestEnemy[]> {
        const event = await withTimeout(subscription.next(), EVENT_WAIT_MS);
        expect(event.done).toBe(false);
        expect(event.value.errors).toBeUndefined();
        return event.value.data?.questResultReceived.enemies ?? [];
    }

    beforeAll(async () => {
        harness = await createAuthTestApp({
            imports: [QuestsModule, QuestResultsModule],
        });
        await modelOf(QuestResult.name, QuestResultSchema).createCollection();
    });

    beforeEach(async () => {
        await harness.clearDatabase();
        const enemies = modelOf(Enemy.name, EnemySchema);
        goblin = await persistEnemy(enemies, { name: 'Goblin' });
        goblinBoss = await persistEnemy(enemies, { name: 'Goblin boss' });
        wolf = await persistEnemy(enemies, { name: 'Lupo' });
        poi = await persistPoi(
            modelOf(PointOfInterest.name, PointOfInterestSchema),
        );
    });

    afterEach(async () => {
        jest.restoreAllMocks();
        await Promise.all(
            opened.splice(0).map((subscription) => subscription.dispose()),
        );
    });

    afterAll(async () => {
        await harness.clearDatabase();
        await harness.close();
    });

    it('serves known for the exact enemies the player defeated (D-06, D-07)', async () => {
        const quest = await persistQuestAgainst(goblin, goblinBoss);
        const player = await playerKnowing(harness, {
            twitchId: 'twitch-known-goblin',
            enemies: [goblin._id],
        });

        const response = await graphqlRequest(
            harness.app,
            QUEST,
            { id: String(quest._id) },
            player.bearer,
        );

        expect(response.body).toEqual({
            data: {
                quest: {
                    id: String(quest._id),
                    infos: {
                        enemies: [
                            {
                                quantity: 1,
                                known: true,
                                enemy: {
                                    id: String(goblin._id),
                                    name: 'Goblin',
                                    imagePath: 'enemies/test.png',
                                    xp: 100,
                                },
                            },
                            {
                                quantity: 1,
                                known: false,
                                enemy: {
                                    id: String(goblinBoss._id),
                                    name: 'Goblin boss',
                                    imagePath: 'enemies/test.png',
                                    xp: 100,
                                },
                            },
                        ],
                    },
                },
            },
        });
    });

    it('serves every enemy as known to the innkeeper (D-07)', async () => {
        const quest = await persistQuestAgainst(goblin, goblinBoss);
        const innkeeper = await createPlayer(harness, {
            twitchId: 'twitch-known-innkeeper',
            role: RoleType.innkeeper,
        });

        expect(await knownOnQuest(quest._id, innkeeper.bearer)).toEqual({
            Goblin: true,
            'Goblin boss': true,
        });
    });

    it('serves no enemy as known without a current character (D-07)', async () => {
        const quest = await persistQuestAgainst(goblin, goblinBoss);
        const homeless = await createPlayer(harness, {
            twitchId: 'twitch-known-homeless',
            withCharacter: false,
        });

        expect(await knownOnQuest(quest._id, homeless.bearer)).toEqual({
            Goblin: false,
            'Goblin boss': false,
        });
    });

    it('serves no enemy as known to a dead character awaiting the sheet (D-13)', async () => {
        const quest = await persistQuestAgainst(goblin, goblinBoss);
        const dead = await playerKnowing(harness, {
            twitchId: 'twitch-known-dead',
            enemies: [goblin._id, goblinBoss._id],
            characterOverrides: {
                deletedAt: new Date('2026-11-07T10:00:00.000Z'),
                deletionReason: DeletionReason.death,
            },
        });

        expect(await knownOnQuest(quest._id, dead.bearer)).toEqual({
            Goblin: false,
            'Goblin boss': false,
        });
    });

    it('serves known on the result enemies (D-07)', async () => {
        const player = await playerKnowing(harness, {
            twitchId: 'twitch-known-result',
            enemies: [wolf._id],
        });
        const result = await persistResultOf(player, goblin, wolf);

        const response = await graphqlRequest(
            harness.app,
            QUEST_RESULT,
            { id: String(result._id) },
            player.bearer,
        );
        const body = response.body as WireBody;

        expect(body.errors).toBeUndefined();
        expect(body.data?.questResult?.enemies).toEqual([
            {
                quantity: 1,
                known: false,
                enemy: {
                    id: String(goblin._id),
                    name: 'Goblin',
                    imagePath: 'enemies/test.png',
                    xp: 100,
                },
            },
            {
                quantity: 1,
                known: true,
                enemy: {
                    id: String(wolf._id),
                    name: 'Lupo',
                    imagePath: 'enemies/test.png',
                    xp: 100,
                },
            },
        ]);
    });

    it('reads the viewer once for a request with many enemies (D-07)', async () => {
        const quest = await persistQuestAgainst(goblin, goblinBoss, wolf);
        const player = await playerKnowing(harness, {
            twitchId: 'twitch-known-once',
            enemies: [wolf._id],
        });
        const characterRead = jest.spyOn(
            modelOf(Character.name, CharacterSchema),
            'findOne',
        );

        expect(await knownOnQuest(quest._id, player.bearer)).toEqual({
            Goblin: false,
            'Goblin boss': false,
            Lupo: true,
        });
        expect(characterRead).toHaveBeenCalledTimes(1);
    });

    it('answers each result event with the knowledge of that moment (D-07, Pitfall 1)', async () => {
        await primeChangeStream(
            harness,
            'questResultReceived',
            questResultTouch(harness),
        );
        const player = await playerKnowing(harness, {
            twitchId: 'twitch-known-live',
        });
        const subscription = openSubscription<QuestResultReceived>(
            graphqlWsUrl(harness.port),
            { Authorization: player.bearer },
            {
                query: QUEST_RESULT_RECEIVED,
                variables: { characterId: String(player.character?._id) },
            },
        );
        opened.push(subscription);
        const first = nextResult(subscription);
        await new Promise((resolve) => setTimeout(resolve, SUBSCRIBER_WAIT_MS));

        await persistResultOf(player, goblin);
        expect(knownByName(await first)).toEqual({ Goblin: false });

        await harness.connection
            .collection('characters')
            .updateOne(
                { _id: player.character?._id as Types.ObjectId },
                { $addToSet: { 'status.knownEnemies': goblin._id } },
            );
        const second = nextResult(subscription);
        await persistResultOf(player, goblin);

        expect(knownByName(await second)).toEqual({ Goblin: true });
    });
});
