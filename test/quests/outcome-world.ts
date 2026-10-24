import { getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { Types } from 'mongoose';
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
import { isRegistered } from 'src/quests/acceptance/quest-eligibility';
import { QuestLane } from 'src/quests/acceptance/quest-lanes';
import type { AuthTestApp, ProviderOverride } from '../auth/auth-test-app';
import { createPlayer, TestPlayer } from '../authz/player-fixture';
import { buildCharacter, buildQuest, persistQuest } from '../fixtures';

// ogni harness che monta QuestOutcomesModule o PendingRequestsModule lo usa: nessuno sweep periodico né reconciler concorrente con il setup dei test (09-14 lo estende con uno sweeper inerte)
export const QUIET_OUTCOME_OVERRIDES: ProviderOverride[] = [
    { token: QUEST_CONFIG, useValue: { sweepIntervalMs: 0 } },
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
    models: OutcomeModels,
): Promise<void> {
    for (const model of Object.values(models)) await model.init();
}

export interface QuesterOptions {
    twitchId: string;
    questOverrides?: Record<string, any>;
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
    const quest = await persistQuest(models.quests, {
        ...buildQuest(),
        ...options.questOverrides,
    });
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
    const type = quest.infos.type as QuestType;
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
