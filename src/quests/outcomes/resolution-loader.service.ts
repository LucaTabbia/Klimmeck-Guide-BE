import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { isUsageCount } from 'src/characters/spells/spell-state.snapshot';
import {
    DEFAULT_LORE_STUDY_CHANCE,
    LORE_CONFIG,
    type LoreConfig,
} from 'src/config/lore-config';
import { priceKey } from 'src/economy/trade/trade-line';
import { ACTIVE_CHARACTER_FILTER } from 'src/models/character/active-character.filter';
import {
    Character,
    CharacterDocument,
} from 'src/models/character/character.model';
import { Enemy, EnemyDocument } from 'src/models/enemy.model';
import { QuestType } from 'src/models/enums/quest-type.enum';
import { RarityType } from 'src/models/enums/rarity-type.enum';
import {
    EquipmentItem,
    EquipmentItemDocument,
} from 'src/models/equipment-item.model';
import { Lore, LoreDocument } from 'src/models/lore.model';
import { LootItem, LootItemDocument } from 'src/models/loot-item.model';
import { Pet, PetDocument } from 'src/models/pet.model';
import {
    PendingQuest,
    PendingQuestDocument,
} from 'src/models/pending-quest.model';
import { Quest, QuestDocument } from 'src/models/quest/quest.model';
import { Spell, SpellDocument } from 'src/models/spell.model';
import { User, UserDocument } from 'src/models/user.model';
import { relatedLoreIdsOf } from 'src/lore/related-lore-ids';
import { STUDY_LORE_TYPES } from 'src/lore/study-lore-types';
import { idForms, refIdOf } from 'src/mongo/document-id';
import { ownersOf } from 'src/mongo/owners-of';
import { lanePathOf, QuestLane } from 'src/quests/acceptance/quest-lanes';
import {
    laneMembersOf,
    LaneProjections,
    seatHolderLaneMembersOf,
} from 'src/quests/party/lane-members';
import type { AidSourceQuest } from './aid/aid-quest';
import type { GroupRoster, GroupSeat, SeatHolder } from './group-roster';
import {
    type CombatCharacterSnapshot,
    combatCatalogRefsOf,
    type CombatEnemySnapshot,
    type CombatEquipmentSnapshot,
} from './combat/combat-context';
import {
    OUTCOME_CHARACTER_PROJECTION,
    type OutcomeCharacterSnapshot,
    type OutcomeQuestSnapshot,
} from './outcome-plan';
import { StaleResolution } from './outcome-writer.service';
import { isPetXpCap } from './pets/pet-xp';
import { prizeBlocksOf, type RankPrizesHolder } from '../prizes/rank-prizes';
import { type QuestEnemyRef, validQuestEnemiesOf } from './quest-enemies';
import {
    type PrizesSnapshot,
    type RewardCatalog,
    rewardRefsOf,
    type SpellCandidate,
} from './rewards/quest-rewards';

export type ResolutionOutcome = 'resolved' | 'stale' | 'waiting';

export interface StandardTrigger {
    pendingQuestId: Types.ObjectId;
    startDate: Date;
}

export type ResolutionCharacter = OutcomeCharacterSnapshot &
    CombatCharacterSnapshot;

// snapshot con la corsia che lo lega alla PendingQuest (standard per il boss, story/worldMission per il GM)
export type LaneCharacter<L extends QuestLane> = ResolutionCharacter & {
    quests?: Partial<Record<L, unknown>> | null;
};

export type ResolutionQuest = OutcomeQuestSnapshot &
    AidSourceQuest & {
        // i campi di oggi più i blocchi per titolo delle quest di gruppo (D-01)
        prizes?: RankPrizesHolder['prizes'];
        concludedAt?: Date | null;
        startedAt?: Date | null;
        generated?: unknown;
        registeredAdventurers?:
            | { character?: unknown; archivedAt?: Date | null }[]
            | null;
        rescue?: {
            characters?: unknown[] | null;
            failedQuest?: unknown;
            turn?: unknown;
        } | null;
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

export interface CatalogEnemy {
    snapshot: CombatEnemySnapshot;
    quantity: number;
}

export interface ResolutionCatalog {
    // nell'ordine della quest (D-02)
    enemies: CatalogEnemy[];
    rewards: RewardCatalog;
    equipment: ReadonlyMap<string, CombatEquipmentSnapshot>;
    spells: ReadonlyMap<string, { energyDamage?: unknown }>;
    loot: ReadonlyMap<string, { effect?: unknown; power?: unknown }>;
    recoveryTimes: ReadonlyMap<string, number>;
    // tetti di xp dell'intero catalogo dei pet: solo quelli validi (Phase 19 D-17)
    petMaxXp: ReadonlyMap<string, number>;
}

// il catalogo del combattimento senza i premi: quest e imboscate (Phase 15 D-09)
export type CombatCatalog = Omit<ResolutionCatalog, 'rewards'>;

type CatalogEntry<T> = T & { _id: Types.ObjectId };

export const RESOLUTION_QUEST_PROJECTION = {
    infos: 1,
    requirements: 1,
    prizes: 1,
    registeredAdventurers: 1,
    rescue: 1,
    concludedAt: 1,
    generated: 1,
} as const;

export const isFiniteNumber = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value);

const byHex = <T extends { _id: Types.ObjectId }>(
    entries: readonly T[],
): Map<string, T> =>
    new Map(entries.map((entry) => [entry._id.toHexString(), entry]));

type PrizePetEntry = CatalogEntry<{
    maxLifePoints?: unknown;
    relatedLore?: unknown;
}>;

type LearnableSpellEntry = CatalogEntry<{
    minXpToLearn?: unknown;
    maxUsages?: unknown;
}>;

const LEARNABLE_SPELL_PROJECTION = { minXpToLearn: 1, maxUsages: 1 } as const;

// i campi di CombatEnemySnapshot, come le altre letture del catalogo
const COMBAT_ENEMY_PROJECTION = {
    name: 1,
    lifePoints: 1,
    xp: 1,
    damages: 1,
    weaknesses: 1,
    // le lore dei nemici per la conoscenza della vittoria (Phase 16 D-06); stesso catalogo per quest e imboscate
    relatedLore: 1,
} as const;

// una magia senza soglia valida o senza maxUsages intero ≥ 0 non si insegna (D-17, 09.1 D-07): mai valori impliciti
const learnableSpellOf = ({
    _id,
    minXpToLearn,
    maxUsages,
}: LearnableSpellEntry): SpellCandidate | null =>
    isFiniteNumber(minXpToLearn) && isUsageCount(maxUsages)
        ? { spellId: _id, minXpToLearn, maxUsages }
        : null;

const isSpellCandidate = (
    candidate: SpellCandidate | null,
): candidate is SpellCandidate => candidate !== null;

const recoveryTimesFrom = (
    spells: readonly CatalogEntry<{ recoveryTime?: unknown }>[],
): Map<string, number> =>
    new Map(
        spells.flatMap(({ _id, recoveryTime }) =>
            isFiniteNumber(recoveryTime)
                ? [[_id.toHexString(), recoveryTime] as const]
                : [],
        ),
    );

const laneOn = (
    pendingQuestId: Types.ObjectId,
    lane: QuestLane,
): Record<string, unknown> => ({
    [lanePathOf(lane)]: { $in: idForms(pendingQuestId) },
});

// personaggio attivo con la corsia sulla PendingQuest attesa: la corsia decide chi risolve (T-09-54)
export function laneFilter(
    pendingQuestId: Types.ObjectId,
    lane: QuestLane,
): Record<string, unknown> {
    return {
        ...ACTIVE_CHARACTER_FILTER,
        ...laneOn(pendingQuestId, lane),
    };
}

const ROSTER_PROJECTIONS: LaneProjections = {
    character: OUTCOME_CHARACTER_PROJECTION,
    pendingQuest: { startDate: 1, waitingTime: 1, quest: 1 },
};

const isDue = (pendingQuest: PendingQuestSnapshot, now: Date): boolean =>
    pendingQuest.startDate !== null &&
    pendingQuest.startDate.getTime() + (pendingQuest.waitingTime ?? 0) <=
        now.getTime();

export const standardLaneFilter = (
    pendingQuestId: Types.ObjectId,
): Record<string, unknown> => laneFilter(pendingQuestId, QuestLane.standard);

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
        @InjectModel(Pet.name)
        private readonly petModel: Model<PetDocument>,
        @InjectModel(Lore.name)
        private readonly loreModel: Model<LoreDocument>,
        @Optional()
        @Inject(LORE_CONFIG)
        private readonly loreConfig?: LoreConfig,
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

    // pre-letture lean del gruppo (boss, soccorso): registrati attivi in corsia con una PendingQuest di questa quest; chi non ce l'ha (o non ha utente) esce (Pitfall 8);
    // i registrati con il marcatore ancora in corsia sulla PendingQuest della quest restano come segnaposto di posto (D-21)
    async readGroupRoster(
        questId: Types.ObjectId,
        registered: readonly Types.ObjectId[],
        now: Date,
        seatHolderIds: readonly Types.ObjectId[] = [],
    ): Promise<GroupRoster> {
        const seats = await this.readLiveSeats(questId, registered);
        const isOut = (id: Types.ObjectId) =>
            !seats.some(({ seat }) => seat.character._id.equals(id));
        const seatHolders = await this.readSeatHolders(
            questId,
            seatHolderIds.filter(isOut),
        );
        const dropped = registered.filter(isOut);
        return {
            seats: seats.map(({ seat }) => seat),
            seatHolders,
            dropped,
            waiting: seats.some(
                ({ pendingQuest }) => !isDue(pendingQuest, now),
            ),
        };
    }

    private async readLiveSeats(
        questId: Types.ObjectId,
        registered: readonly Types.ObjectId[],
    ): Promise<{ seat: GroupSeat; pendingQuest: PendingQuestSnapshot }[]> {
        const { members } = await laneMembersOf<
            LaneCharacter<QuestLane.standard>,
            PendingQuestSnapshot
        >(this.laneModels(), questId, registered, ROSTER_PROJECTIONS);
        const owners = await this.ownersOf(
            members.map(({ character }) => character._id),
        );
        return members.flatMap(({ character, pendingQuest }) => {
            const ownerId = owners.get(character._id.toHexString());
            if (!ownerId) return [];
            return [
                {
                    seat: {
                        character,
                        pendingQuestId: pendingQuest._id,
                        ownerId,
                        resultId: new Types.ObjectId(),
                    },
                    pendingQuest,
                },
            ];
        });
    }

    private async readSeatHolders(
        questId: Types.ObjectId,
        seatHolderIds: readonly Types.ObjectId[],
    ): Promise<SeatHolder[]> {
        const { members } = await seatHolderLaneMembersOf<
            LaneCharacter<QuestLane.standard>,
            PendingQuestSnapshot
        >(this.laneModels(), questId, seatHolderIds, ROSTER_PROJECTIONS);
        return members.map(({ character, pendingQuest }) => ({
            character,
            pendingQuestId: pendingQuest._id,
        }));
    }

    private laneModels() {
        return {
            characters: this.characterModel,
            pendingQuests: this.pendingQuestModel,
        };
    }

    ownersOf(
        characterIds: readonly Types.ObjectId[],
    ): Promise<Map<string, Types.ObjectId>> {
        return ownersOf(this.userModel, characterIds);
    }

    // stesso filtro della pre-lettura, in sessione: un partecipante sparito o cambiato rende il trigger obsoleto
    async snapshotInSession(
        characterId: Types.ObjectId,
        pendingQuestId: Types.ObjectId,
        session: ClientSession,
        lane: QuestLane = QuestLane.standard,
    ): Promise<ResolutionCharacter> {
        return this.snapshotWhere(
            { ...laneFilter(pendingQuestId, lane), _id: characterId },
            session,
        );
    }

    // segnaposto di posto (D-21): stessa lettura in sessione senza il filtro dei personaggi attivi, la corsia resta la prova del posto
    async snapshotSeatHolderInSession(
        characterId: Types.ObjectId,
        pendingQuestId: Types.ObjectId,
        session: ClientSession,
    ): Promise<ResolutionCharacter> {
        return this.snapshotWhere(
            {
                ...laneOn(pendingQuestId, QuestLane.standard),
                _id: characterId,
            },
            session,
        );
    }

    private async snapshotWhere(
        filter: Record<string, unknown>,
        session: ClientSession,
    ): Promise<ResolutionCharacter> {
        const snapshot = await this.characterModel
            .findOne(filter, OUTCOME_CHARACTER_PROJECTION)
            .session(session)
            .lean<ResolutionCharacter | null>()
            .exec();
        if (!snapshot) throw new StaleResolution();
        return snapshot;
    }

    // cataloghi letti in serie fuori dalla transazione: combattimento, poi rarità e magia dei premi
    async readCatalog(
        quest: ResolutionQuest,
        participants: readonly ResolutionCharacter[],
    ): Promise<ResolutionCatalog> {
        const combat = await this.readCombatCatalog(
            validQuestEnemiesOf(quest.infos),
            participants,
            `della missione ${quest._id.toHexString()}`,
        );
        const rewards = {
            ...(await this.readRewardCatalog(quest)),
            studyLorePool: await this.readStudyLorePool(quest),
            studyLoreChance:
                this.loreConfig?.studyChance ?? DEFAULT_LORE_STUDY_CHANCE,
        };
        return { ...combat, rewards };
    }

    // nemici nell'ordine delle voci, tetti dei pet, oggetti del combattimento; subject nomina la fonte nel WARN delle voci orfane
    async readCombatCatalog(
        entries: readonly QuestEnemyRef[],
        participants: readonly CombatCharacterSnapshot[],
        subject: string,
    ): Promise<CombatCatalog> {
        const enemies = await this.readEnemies(entries, subject);
        const petMaxXp = await this.readPetMaxXp();
        if (enemies.length === 0) {
            return {
                enemies,
                equipment: new Map(),
                spells: new Map(),
                loot: new Map(),
                recoveryTimes: new Map(),
                petMaxXp,
            };
        }
        const refs = combatCatalogRefsOf(participants);
        const equipment = await this.equipmentItemModel
            .find(
                { _id: { $in: refs.equipmentIds } },
                { damages: 1, equipType: 1, accessoryUseTypes: 1 },
            )
            .lean<CatalogEntry<CombatEquipmentSnapshot>[]>()
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
            enemies,
            equipment: byHex(equipment),
            spells: byHex(spells),
            loot: byHex(loot),
            recoveryTimes: recoveryTimesFrom(spells),
            petMaxXp,
        };
    }

    // tetti dell'intero catalogo (piccolo): il compagno equipaggiato può cambiare fra questa lettura e lo snapshot in sessione
    private async readPetMaxXp(): Promise<Map<string, number>> {
        const pets = await this.petModel
            .find({}, { maxXp: 1 })
            .lean<CatalogEntry<{ maxXp?: unknown }>[]>()
            .exec();
        return new Map(
            pets.flatMap(({ _id, maxXp }) =>
                isPetXpCap(maxXp) ? [[_id.toHexString(), maxXp] as const] : [],
            ),
        );
    }

    // tempi di recupero delle magie usate fuori dal combattimento (consumi riportati dal GM): un job per uso come useSpell
    async recoveryTimesOf(
        spellIds: readonly Types.ObjectId[],
    ): Promise<Map<string, number>> {
        if (spellIds.length === 0) return new Map();
        const spells = await this.spellModel
            .find({ _id: { $in: spellIds } }, { recoveryTime: 1 })
            .lean<CatalogEntry<{ recoveryTime?: unknown }>[]>()
            .exec();
        return recoveryTimesFrom(spells);
    }

    async readQuest(
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

    // C6 esteso (D-28): voci orfane scartate con un WARN di soli id e soggetto; ordine delle voci
    private async readEnemies(
        entries: readonly QuestEnemyRef[],
        subject: string,
    ): Promise<CatalogEnemy[]> {
        if (entries.length === 0) return [];
        const found = byHex(
            await this.enemyModel
                .find(
                    { _id: { $in: entries.map(({ enemy }) => enemy) } },
                    COMBAT_ENEMY_PROJECTION,
                )
                .lean<CombatEnemySnapshot[]>()
                .exec(),
        );
        return entries.flatMap(({ enemy, quantity }) => {
            const snapshot = found.get(enemy.toHexString());
            if (!snapshot) {
                this.logger.warn(
                    `Nemico ${enemy.toHexString()} ${subject} inesistente: voce scartata`,
                );
            }
            return snapshot ? [{ snapshot, quantity }] : [];
        });
    }

    // rarità, magie fisse e pet sull'unione dei blocchi premio: ogni vincitore tira dal suo (D-05, D-05a)
    private async readRewardCatalog(
        quest: ResolutionQuest,
    ): Promise<RewardCatalog> {
        const refs = rewardRefsOf(prizeBlocksOf(quest));
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
            spells: await this.readFixedSpells(refs.spellIds),
            spellPool: await this.readSpellPool(quest.prizes),
            ...(await this.readPrizePets(refs.petIds)),
        };
    }

    // magie fisse imparabili di tutti i blocchi (D-05): una magia senza soglia valida resta fuori
    private async readFixedSpells(
        spellIds: readonly Types.ObjectId[],
    ): Promise<RewardCatalog['spells']> {
        if (spellIds.length === 0) return new Map();
        const spells = await this.spellModel
            .find({ _id: { $in: spellIds } }, LEARNABLE_SPELL_PROJECTION)
            .lean<LearnableSpellEntry[]>()
            .exec();
        return new Map(
            spells
                .map(learnableSpellOf)
                .filter(isSpellCandidate)
                .map(({ spellId, minXpToLearn, maxUsages }) => [
                    spellId.toHexString(),
                    { minXpToLearn, maxUsages },
                ]),
        );
    }

    // D-21: il pet in premio vale solo se esiste ancora a catalogo; un ref orfano non consuma il tiro; la sua vita massima apre la voce del vincitore (Phase 19 D-03) e le sue lore si sbloccano con la voce (D-26); un pet per blocco (D-05a)
    private async readPrizePets(
        petIds: readonly Types.ObjectId[],
    ): Promise<Pick<RewardCatalog, 'pets' | 'petLore'>> {
        if (petIds.length === 0) return { pets: new Map(), petLore: new Map() };
        const pets = await this.petModel
            .find(
                { _id: { $in: petIds } },
                { maxLifePoints: 1, relatedLore: 1 },
            )
            .lean<PrizePetEntry[]>()
            .exec();
        return {
            pets: new Map(
                pets.map(({ _id, maxLifePoints }) => [
                    _id.toHexString(),
                    maxLifePoints,
                ]),
            ),
            petLore: new Map(
                pets.map(({ _id, relatedLore }) => [
                    _id.toHexString(),
                    relatedLoreIdsOf(relatedLore),
                ]),
            ),
        };
    }

    // D-08, C-3: pool intero fuori transazione, il piano lo filtra contro lo snapshot in sessione; ordine per id così il tiro è riproducibile
    private async readStudyLorePool(
        quest: ResolutionQuest,
    ): Promise<Types.ObjectId[]> {
        const type = quest.infos?.type;
        if (type !== QuestType.study && type !== QuestType.magic) return [];
        const lore = await this.loreModel
            .find({ type: { $in: [...STUDY_LORE_TYPES] } }, { _id: 1 })
            .lean<{ _id: Types.ObjectId }[]>()
            .exec();
        return lore
            .map(({ _id }) => _id)
            .sort((left, right) =>
                left.toHexString().localeCompare(right.toHexString()),
            );
    }

    // D-31: l'intero catalogo delle magie solo per la study che sorteggia; ordine per id così il tiro è riproducibile
    private async readSpellPool(
        prizes: PrizesSnapshot | null | undefined,
    ): Promise<SpellCandidate[]> {
        if (prizes?.spellDraw !== true) return [];
        const spells = await this.spellModel
            .find({}, LEARNABLE_SPELL_PROJECTION)
            .lean<LearnableSpellEntry[]>()
            .exec();
        return spells
            .map(learnableSpellOf)
            .filter(isSpellCandidate)
            .sort((left, right) =>
                left.spellId
                    .toHexString()
                    .localeCompare(right.spellId.toHexString()),
            );
    }
}
