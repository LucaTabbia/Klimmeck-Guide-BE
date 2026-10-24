import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { priceKey } from 'src/economy/trade/trade-line';
import { ACTIVE_CHARACTER_FILTER } from 'src/models/character/active-character.filter';
import {
    Character,
    CharacterDocument,
} from 'src/models/character/character.model';
import { Enemy, EnemyDocument } from 'src/models/enemy.model';
import { RarityType } from 'src/models/enums/rarity-type.enum';
import {
    EquipmentItem,
    EquipmentItemDocument,
} from 'src/models/equipment-item.model';
import { LootItem, LootItemDocument } from 'src/models/loot-item.model';
import {
    PendingQuest,
    PendingQuestDocument,
} from 'src/models/pending-quest.model';
import { Quest, QuestDocument } from 'src/models/quest/quest.model';
import { Spell, SpellDocument } from 'src/models/spell.model';
import { User, UserDocument } from 'src/models/user.model';
import { idForms, refIdOf } from 'src/mongo/document-id';
import { lanePathOf, QuestLane } from 'src/quests/acceptance/quest-lanes';
import type { AidSourceQuest } from './aid/aid-quest';
import {
    type CombatCharacterSnapshot,
    combatCatalogRefsOf,
    type CombatEnemySnapshot,
} from './combat/combat-context';
import {
    OUTCOME_CHARACTER_PROJECTION,
    type OutcomeCharacterSnapshot,
    type OutcomeQuestSnapshot,
} from './outcome-plan';
import { StaleResolution } from './outcome-writer.service';
import {
    type PrizesSnapshot,
    type RewardCatalog,
    rewardRefsOf,
} from './rewards/quest-rewards';

export type ResolutionOutcome = 'resolved' | 'stale' | 'waiting';

export interface StandardTrigger {
    pendingQuestId: Types.ObjectId;
    startDate: Date;
}

export type ResolutionCharacter = OutcomeCharacterSnapshot &
    CombatCharacterSnapshot;

export type ResolutionQuest = OutcomeQuestSnapshot &
    AidSourceQuest & {
        prizes?: PrizesSnapshot | null;
        concludedAt?: Date | null;
        registeredAdventurers?: { character?: unknown }[] | null;
        rescue?: { character?: unknown; failedQuest?: unknown } | null;
    };

export interface PendingQuestSnapshot {
    _id: Types.ObjectId;
    startDate: Date | null;
    waitingTime?: number | null;
    quest?: unknown;
}

export interface StandardLoad {
    pendingQuest: PendingQuestSnapshot;
    character: ResolutionCharacter;
    quest: ResolutionQuest;
    ownerId: Types.ObjectId;
}

export interface ResolutionCatalog {
    enemy: CombatEnemySnapshot | null;
    rewards: RewardCatalog;
    equipment: ReadonlyMap<string, { damages?: unknown }>;
    spells: ReadonlyMap<string, { energyDamage?: unknown }>;
    loot: ReadonlyMap<string, { effect?: unknown; power?: unknown }>;
    recoveryTimes: ReadonlyMap<string, number>;
}

type CatalogEntry<T> = T & { _id: Types.ObjectId };

export const RESOLUTION_QUEST_PROJECTION = {
    infos: 1,
    requirements: 1,
    prizes: 1,
    registeredAdventurers: 1,
    rescue: 1,
    concludedAt: 1,
} as const;

const STANDARD_LANE_PATH = lanePathOf(QuestLane.standard);

export const isFiniteNumber = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value);

const byHex = <T extends { _id: Types.ObjectId }>(
    entries: readonly T[],
): Map<string, T> =>
    new Map(entries.map((entry) => [entry._id.toHexString(), entry]));

// personaggio attivo con la corsia standard sulla PendingQuest attesa: la corsia decide chi risolve (T-09-54)
export function standardLaneFilter(
    pendingQuestId: Types.ObjectId,
): Record<string, unknown> {
    return {
        ...ACTIVE_CHARACTER_FILTER,
        [STANDARD_LANE_PATH]: { $in: idForms(pendingQuestId) },
    };
}

// letture comuni dei rami della risoluzione (individuale, gruppo, soccorso): trigger, catalogo, proprietari, snapshot in sessione
@Injectable()
export class ResolutionLoader {
    private readonly logger = new Logger(ResolutionLoader.name);

    constructor(
        @InjectModel(Character.name)
        private readonly characterModel: Model<CharacterDocument>,
        @InjectModel(Quest.name)
        private readonly questModel: Model<QuestDocument>,
        @InjectModel(PendingQuest.name)
        private readonly pendingQuestModel: Model<PendingQuestDocument>,
        @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
        @InjectModel(Enemy.name)
        private readonly enemyModel: Model<EnemyDocument>,
        @InjectModel(LootItem.name)
        private readonly lootItemModel: Model<LootItemDocument>,
        @InjectModel(EquipmentItem.name)
        private readonly equipmentItemModel: Model<EquipmentItemDocument>,
        @InjectModel(Spell.name)
        private readonly spellModel: Model<SpellDocument>,
    ) {}

    // pre-letture lean fuori dalla transazione: solo id e stato, la transazione rilegge il personaggio in sessione
    async loadStandardTrigger(
        trigger: StandardTrigger,
        now: Date,
    ): Promise<StandardLoad | 'stale' | 'waiting'> {
        const pendingQuest = await this.pendingQuestModel
            .findById(trigger.pendingQuestId, {
                startDate: 1,
                waitingTime: 1,
                quest: 1,
            })
            .lean<PendingQuestSnapshot | null>()
            .exec();
        if (!pendingQuest?.startDate) return 'stale';
        if (pendingQuest.startDate.getTime() !== trigger.startDate.getTime())
            return 'stale';
        const dueAt =
            pendingQuest.startDate.getTime() + (pendingQuest.waitingTime ?? 0);
        if (dueAt > now.getTime()) return 'waiting';
        const character = await this.characterModel
            .findOne(
                standardLaneFilter(trigger.pendingQuestId),
                OUTCOME_CHARACTER_PROJECTION,
            )
            .lean<ResolutionCharacter | null>()
            .exec();
        if (!character) return 'stale';
        const quest = await this.readQuest(pendingQuest);
        if (!quest) return 'stale';
        const owners = await this.ownersOf([character._id]);
        const ownerId = owners.get(character._id.toHexString());
        if (!ownerId) {
            this.logger.warn(
                `Personaggio ${character._id.toHexString()} della missione in attesa ${pendingQuest._id.toHexString()} senza proprietario: nessuna scrittura`,
            );
            return 'stale';
        }
        return { pendingQuest, character, quest, ownerId };
    }

    // proprietario = utente che punta al personaggio; un personaggio senza utente resta fuori dalla mappa
    async ownersOf(
        characterIds: readonly Types.ObjectId[],
    ): Promise<Map<string, Types.ObjectId>> {
        const forms = characterIds.flatMap((id) => idForms(id));
        const users = await this.userModel
            .find(
                { currentCharacter: { $in: forms } },
                { _id: 1, currentCharacter: 1 },
            )
            .lean<{ _id: Types.ObjectId; currentCharacter: unknown }[]>()
            .exec();
        return new Map(
            users.flatMap(({ _id, currentCharacter }) => {
                const characterId = refIdOf(currentCharacter);
                return characterId
                    ? [[characterId.toHexString(), _id] as const]
                    : [];
            }),
        );
    }

    // stesso filtro della pre-lettura, in sessione: un partecipante sparito o cambiato rende il trigger obsoleto
    async snapshotInSession(
        characterId: Types.ObjectId,
        pendingQuestId: Types.ObjectId,
        session: ClientSession,
    ): Promise<ResolutionCharacter> {
        const snapshot = await this.characterModel
            .findOne(
                { ...standardLaneFilter(pendingQuestId), _id: characterId },
                OUTCOME_CHARACTER_PROJECTION,
            )
            .session(session)
            .lean<ResolutionCharacter | null>()
            .exec();
        if (!snapshot) throw new StaleResolution();
        return snapshot;
    }

    // cataloghi letti in serie fuori dalla transazione: nemico, rarità e magia dei premi, oggetti del combattimento
    async readCatalog(
        quest: ResolutionQuest,
        participants: readonly ResolutionCharacter[],
    ): Promise<ResolutionCatalog> {
        const enemy = await this.readEnemy(quest);
        const rewards = await this.readRewardCatalog(quest.prizes);
        if (!enemy) {
            return {
                enemy,
                rewards,
                equipment: new Map(),
                spells: new Map(),
                loot: new Map(),
                recoveryTimes: new Map(),
            };
        }
        const refs = combatCatalogRefsOf(participants);
        const equipment = await this.equipmentItemModel
            .find({ _id: { $in: refs.equipmentIds } }, { damages: 1 })
            .lean<CatalogEntry<{ damages?: unknown }>[]>()
            .exec();
        const spells = await this.spellModel
            .find(
                { _id: { $in: refs.spellIds } },
                { energyDamage: 1, recoveryTime: 1 },
            )
            .lean<
                CatalogEntry<{
                    energyDamage?: unknown;
                    recoveryTime?: unknown;
                }>[]
            >()
            .exec();
        const loot = await this.lootItemModel
            .find({ _id: { $in: refs.lootIds } }, { effect: 1, power: 1 })
            .lean<CatalogEntry<{ effect?: unknown; power?: unknown }>[]>()
            .exec();
        return {
            enemy,
            rewards,
            equipment: byHex(equipment),
            spells: byHex(spells),
            loot: byHex(loot),
            recoveryTimes: new Map(
                spells.flatMap(({ _id, recoveryTime }) =>
                    isFiniteNumber(recoveryTime)
                        ? [[_id.toHexString(), recoveryTime] as const]
                        : [],
                ),
            ),
        };
    }

    private async readQuest(
        pendingQuest: PendingQuestSnapshot,
    ): Promise<ResolutionQuest | null> {
        const questId = refIdOf(pendingQuest.quest);
        const quest = questId
            ? await this.questModel
                  .findById(questId, RESOLUTION_QUEST_PROJECTION)
                  .lean<ResolutionQuest | null>()
                  .exec()
            : null;
        if (!quest) {
            this.logger.warn(
                `Missione della missione in attesa ${pendingQuest._id.toHexString()} inesistente: nessuna scrittura`,
            );
        }
        return quest;
    }

    // C6: un ref orfano vale come missione senza nemico, con un WARN di soli id
    private async readEnemy(
        quest: ResolutionQuest,
    ): Promise<CombatEnemySnapshot | null> {
        const enemyId = refIdOf(quest.infos.enemy);
        if (!enemyId) return null;
        const enemy = await this.enemyModel
            .findById(enemyId)
            .lean<CombatEnemySnapshot | null>()
            .exec();
        if (!enemy) {
            this.logger.warn(
                `Nemico ${enemyId.toHexString()} della missione ${quest._id.toHexString()} inesistente: missione senza nemico`,
            );
        }
        return enemy;
    }

    private async readRewardCatalog(
        prizes: PrizesSnapshot | null | undefined,
    ): Promise<RewardCatalog> {
        const refs = rewardRefsOf(prizes);
        const idsOf = (itemType: string) =>
            refs.items
                .filter((entry) => entry.itemType === itemType)
                .map(({ item }) => item);
        const rarityProjection = { rarity: 1 };
        const lootItems = await this.lootItemModel
            .find({ _id: { $in: idsOf('LootItem') } }, rarityProjection)
            .lean<CatalogEntry<{ rarity?: RarityType | null }>[]>()
            .exec();
        const equipmentItems = await this.equipmentItemModel
            .find({ _id: { $in: idsOf('EquipmentItem') } }, rarityProjection)
            .lean<CatalogEntry<{ rarity?: RarityType | null }>[]>()
            .exec();
        const spell = refs.spellId
            ? await this.spellModel
                  .findById(refs.spellId, { minXpToLearn: 1 })
                  .lean<CatalogEntry<{ minXpToLearn?: unknown }> | null>()
                  .exec()
            : null;
        return {
            rarities: new Map([
                ...lootItems.map(
                    ({ _id, rarity }) =>
                        [priceKey('LootItem', _id), rarity ?? null] as const,
                ),
                ...equipmentItems.map(
                    ({ _id, rarity }) =>
                        [
                            priceKey('EquipmentItem', _id),
                            rarity ?? null,
                        ] as const,
                ),
            ]),
            // una magia senza soglia valida non si insegna (D-17): mai una soglia 0 implicita
            spells: new Map(
                spell && isFiniteNumber(spell.minXpToLearn)
                    ? [
                          [
                              spell._id.toHexString(),
                              { minXpToLearn: spell.minXpToLearn },
                          ],
                      ]
                    : [],
            ),
        };
    }
}
