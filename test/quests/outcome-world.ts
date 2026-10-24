import { getQueueToken } from '@nestjs/bull';
import { getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { Types } from 'mongoose';
import type { Clock } from 'src/auth/clock';
import { SPELL_RECOVERY_QUEUE } from 'src/characters/spells/spell-recovery-queue';
import { PUSH_CONFIG } from 'src/config/push-config';
import { QUEST_CONFIG } from 'src/config/quest-config';
import { Character } from 'src/models/character/character.model';
import { City } from 'src/models/city.model';
import { Enemy } from 'src/models/enemy.model';
import { EquipmentItem } from 'src/models/equipment-item.model';
import type { QuestType } from 'src/models/enums/quest-type.enum';
import { LootItem } from 'src/models/loot-item.model';
import { PendingQuest } from 'src/models/pending-quest.model';
import { QuestResult } from 'src/models/quest-result/quest-result.model';
import { Quest } from 'src/models/quest/quest.model';
import { Spell } from 'src/models/spell.model';
import { User } from 'src/models/user.model';
import { PushDevice } from 'src/push/push-device.model';
import { PushPlatform } from 'src/push/push-platform.enum';
import { PushService } from 'src/push/push.service';
import { PushTransport } from 'src/push/transport/push-transport';
import { isRegistered } from 'src/quests/acceptance/quest-eligibility';
import { QuestLane } from 'src/quests/acceptance/quest-lanes';
import { ChanceSource } from 'src/quests/outcomes/chance-source';
import { CombatResolver } from 'src/quests/outcomes/combat/combat-resolver';
import { QuestOutcomesModule } from 'src/quests/outcomes/quest-outcomes.module';
import { QuestResolutionSweeper } from 'src/quests/outcomes/quest-resolution.sweeper';
import { QUEST_RESOLUTION_QUEUE } from 'src/quests/outcomes/scheduling/quest-resolution-job';
import {
    type AuthTestApp,
    createAuthTestApp,
    type ProviderOverride,
} from '../auth/auth-test-app';
import { createPlayer, TestPlayer } from '../authz/player-fixture';
import { buildCharacter, buildQuest, persistQuest } from '../fixtures';
import { FakePushTransport } from '../push/fake-push-transport';
import { FakeTravelQueue } from '../travel/fake-travel-queue';

// solo lo sweep periodico spento: il reconciler al boot gira ancora (la int-spec dello sweeper)
export const QUIET_SWEEP_CONFIG: ProviderOverride = {
    token: QUEST_CONFIG,
    useValue: { sweepIntervalMs: 0 },
};

// nessun reconciler al boot negli harness che risolvono a mano
export const IDLE_QUEST_SWEEPER = {
    onApplicationBootstrap: () => undefined,
    onModuleDestroy: () => undefined,
    sweep: () => Promise.resolve({ resolved: 0, timedOut: 0 }),
};

// ogni harness che monta QuestOutcomesModule o PendingRequestsModule lo usa: nessuno sweep periodico né reconciler concorrente con il setup dei test
export const QUIET_OUTCOME_OVERRIDES: ProviderOverride[] = [
    QUIET_SWEEP_CONFIG,
    { token: QuestResolutionSweeper, useValue: IDLE_QUEST_SWEEPER },
];

export const OUTCOME_START = new Date('2026-10-24T10:00:00.000Z');
export const OUTCOME_WAITING_TIME_MS = 2 * 60 * 60 * 1000;

export interface OutcomeModels {
    characters: Model<any>;
    quests: Model<any>;
    pendingQuests: Model<any>;
    questResults: Model<any>;
    users: Model<any>;
    cities: Model<any>;
    enemies: Model<any>;
    lootItems: Model<any>;
    equipmentItems: Model<any>;
    spells: Model<any>;
}

export function outcomeModels(harness: AuthTestApp): OutcomeModels {
    const modelOf = (name: string): Model<any> =>
        harness.app.get<Model<any>>(getModelToken(name));
    return {
        characters: modelOf(Character.name),
        quests: modelOf(Quest.name),
        pendingQuests: modelOf(PendingQuest.name),
        questResults: modelOf(QuestResult.name),
        users: modelOf(User.name),
        cities: modelOf(City.name),
        enemies: modelOf(Enemy.name),
        lootItems: modelOf(LootItem.name),
        equipmentItems: modelOf(EquipmentItem.name),
        spells: modelOf(Spell.name),
    };
}

// collection pronte prima delle transazioni multi-documento (Pitfall 5)
export async function initOutcomeCollections(
    harness: AuthTestApp,
    models: OutcomeModels,
): Promise<void> {
    for (const model of Object.values(models)) await model.init();
    await harness.connection.model(PushDevice.name).init();
}

export interface OutcomeHarnessOptions {
    clock: Clock;
    chance: ChanceSource;
    combat?: CombatResolver;
    // default QUIET_OUTCOME_OVERRIDES; la int-spec dello sweeper tiene lo sweeper vero
    quiet?: ProviderOverride[];
}

export interface OutcomeHarness {
    harness: AuthTestApp;
    models: OutcomeModels;
    push: FakePushTransport;
    questQueue: FakeTravelQueue;
    spellQueue: FakeTravelQueue;
    reset(): Promise<void>;
}

// QuestOutcomesModule senza Redis né FCM: push e code finte, porte del caso e del combattimento sostituite
export async function createOutcomeHarness(
    options: OutcomeHarnessOptions,
): Promise<OutcomeHarness> {
    const push = new FakePushTransport();
    const questQueue = new FakeTravelQueue();
    const spellQueue = new FakeTravelQueue();
    const harness = await createAuthTestApp({
        clock: options.clock,
        imports: [QuestOutcomesModule],
        overrides: [
            ...(options.quiet ?? QUIET_OUTCOME_OVERRIDES),
            { token: PushTransport, useValue: push },
            { token: PUSH_CONFIG, useValue: { serviceAccount: null } },
            {
                token: getQueueToken(QUEST_RESOLUTION_QUEUE),
                useValue: questQueue,
            },
            {
                token: getQueueToken(SPELL_RECOVERY_QUEUE),
                useValue: spellQueue,
            },
            { token: ChanceSource, useValue: options.chance },
            ...(options.combat
                ? [{ token: CombatResolver, useValue: options.combat }]
                : []),
        ],
    });
    const models = outcomeModels(harness);
    await initOutcomeCollections(harness, models);
    return {
        harness,
        models,
        push,
        questQueue,
        spellQueue,
        async reset() {
            await harness.clearDatabase();
            push.reset();
            questQueue.reset();
            spellQueue.reset();
        },
    };
}

// un device per l'utente: la push questEnd arriva al trasporto finto
export async function registerDevice(
    harness: AuthTestApp,
    player: TestPlayer,
): Promise<void> {
    await harness.app.get(PushService).registerDevice(String(player.user._id), {
        deviceId: 'dev-1',
        token: `tok-${String(player.user._id)}`,
        platform: PushPlatform.android,
    });
}

export interface QuesterOptions {
    twitchId: string;
    questOverrides?: Record<string, any>;
    // quest già persistita (gruppo boss): nessuna quest nuova, il personaggio si registra su questa
    quest?: { _id: unknown };
    characterOverrides?: Record<string, any>;
    startDate?: Date | null;
    waitingTime?: number;
    lane?: QuestLane;
    registered?: boolean;
}

export interface Quester {
    player: TestPlayer;
    characterId: Types.ObjectId;
    quest: any;
    pendingQuest: any;
}

// status, quests e assets si fondono con quelli del fixture: il test scrive solo i campi che gli servono
function characterOf(
    options: QuesterOptions,
    lane: QuestLane,
    pendingQuestId: Types.ObjectId,
): Record<string, unknown> {
    const base = buildCharacter();
    const { status, quests, assets, ...rest } =
        options.characterOverrides ?? {};
    return {
        ...rest,
        status: { ...base.status, ...status },
        quests: { ...base.quests, ...quests, [lane]: pendingQuestId },
        assets: { ...base.assets, ...assets },
    };
}

// personaggio in corsia con la sua PendingQuest e, per i tipi registrati, il posto occupato sulla quest
export async function persistQuester(
    harness: AuthTestApp,
    options: QuesterOptions,
): Promise<Quester> {
    const models = outcomeModels(harness);
    const lane = options.lane ?? QuestLane.standard;
    const quest =
        options.quest ??
        (await persistQuest(models.quests, {
            ...buildQuest(),
            ...options.questOverrides,
        }));
    const pendingQuest = await models.pendingQuests.create({
        startDate:
            options.startDate === undefined ? OUTCOME_START : options.startDate,
        waitingTime: options.waitingTime ?? OUTCOME_WAITING_TIME_MS,
        pointsSpent: 0,
        quest: quest._id,
    });
    const player = await createPlayer(harness, {
        twitchId: options.twitchId,
        characterOverrides: characterOf(
            options,
            lane,
            pendingQuest._id as Types.ObjectId,
        ),
    });
    const characterId = player.character!._id as Types.ObjectId;
    const type = (await models.quests.findById(quest._id).lean<any>().exec())
        .infos.type as QuestType;
    if (options.registered ?? isRegistered(type)) {
        await models.quests.updateOne(
            { _id: quest._id },
            {
                $push: {
                    registeredAdventurers: {
                        character: characterId,
                        title: player.character!.status.title,
                    },
                },
            },
        );
    }
    return {
        player,
        characterId,
        quest: await models.quests.findById(quest._id).lean().exec(),
        pendingQuest,
    };
}
