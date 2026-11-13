// stato finale calcolato prima della scrittura (Phase 4 applyTrade): un solo $set condizionale, unico scrittore di level/maxLifePoints (D-12, D-21)
import type { Types } from 'mongoose';
import {
    learnedSpellState,
    recoveryDueAt,
    spendFromState,
    type SpellStateEntry,
} from 'src/characters/spells/spell-state.snapshot';
import {
    newOwnedPetEntry,
    normalisedOwnedPets,
    ownsPet,
    type NewOwnedPetEntry,
    type OwnedPetEntry,
} from 'src/characters/pets/owned-pet-entry';
import { type CoinPurse, fromCopper } from 'src/economy/coins';
import {
    applyTradeToInventory,
    type InventoryEntry,
    type InventorySnapshot,
} from 'src/economy/trade/trade-inventory';
import type { TradeLine } from 'src/economy/trade/trade-line';
import { activeCharacterById } from 'src/models/character/active-character.filter';
import type { DungeonTurnKind } from 'src/models/enums/dungeon-turn-kind.enum';
import type { InjuryType } from 'src/models/enums/injury-type.enum';
import { QuestOutcome } from 'src/models/enums/quest-outcome.enum';
import { QuestType } from 'src/models/enums/quest-type.enum';
import type { TitleType } from 'src/models/enums/title-type.enum';
import type { KnowledgeAddition } from 'src/lore/knowledge-addition';
import { idForms, objectIdFromHex, sameId } from 'src/mongo/document-id';
import {
    isGmLane,
    lanePathOf,
    type QuestLane,
    STANDARD_LANE_FREE,
} from 'src/quests/acceptance/quest-lanes';
import type { ParticipantEffects } from './combat/combat-resolver';
import { cureInjuries } from './injuries/cure-injuries';
import { isInjuryType } from './injuries/injury-rules';
import { cureOf, lifePointsAfterCure } from './injuries/quest-cure';
import { isPositiveInteger } from './outcome-numbers';
import { lifePointsWithin, progressionAfter } from './progression/level-table';
import { statusFactsOf } from './progression/status-facts';
import { nextTitleAfterStory } from './progression/title-progression';
import { companionXpAward } from './pets/companion-xp';
import {
    canLearnSpell,
    type DrawnRewards,
    drawLearnableSpell,
    drawStudyLore,
    type RewardItem,
} from './rewards/quest-rewards';
import { knowledgeUpdateOf, type VictoryKnowledge } from './victory-knowledge';

export const OUTCOME_CHARACTER_PROJECTION = {
    status: 1,
    quests: 1,
    assets: 1,
} as const;

export interface OutcomeCharacterSnapshot {
    _id: Types.ObjectId;
    status: {
        xp?: number;
        level?: number;
        title: TitleType;
        currentLifePoints?: number;
        maxLifePoints?: number;
        injuries?: InjuryType[];
        // unica lista delle magie, in ordine di apprendimento (Phase 19 D-07)
        spellStates?: SpellStateEntry[];
        location?: unknown;
        awaitingAid?: unknown;
        // borsellino letto dalla multa dell'arresto (quick 261110-cgd)
        coins?: Partial<CoinPurse> | null;
        unlockedLore?: unknown[];
        knownEnemies?: unknown[];
    };
    quests?: {
        completedQuests?: unknown[] | null;
        pendingQuest?: unknown;
    } | null;
    assets?:
        | (InventorySnapshot & {
              // compagno equipaggiato: riceve la sua quota degli xp dei nemici (Phase 19 D-04)
              pet?: unknown;
              ownedPets?: OwnedPetEntry[] | null;
          })
        | null;
}

export interface OutcomeQuestSnapshot {
    _id: Types.ObjectId;
    infos: { type: QuestType; title: string };
    requirements?: { minTitle?: TitleType | null } | null;
    prizes?: { cure?: unknown } | null;
}

export interface ConsumableUsage {
    itemType: 'LootItem';
    item: Types.ObjectId;
    quantity: number;
}

export interface QuestEnemyDraft {
    enemy: Types.ObjectId;
    quantity: number;
}

// nemici affrontati e xp sommata per quantità (D-02)
export interface EnemyFacts {
    entries: QuestEnemyDraft[];
    xp: number;
}

export interface QuestResultDraft extends DungeonTurnFields {
    _id: Types.ObjectId;
    character: Types.ObjectId;
    user: Types.ObjectId;
    quest: { id: Types.ObjectId; type: QuestType; title: string };
    outcome: QuestOutcome;
    resolvedAt: Date;
    hpBefore: number;
    hpAfter: number;
    maxLifePoints: number;
    injuriesAdded: InjuryType[];
    injuriesHealed: InjuryType[];
    consumablesUsed: ConsumableUsage[];
    spellsUsed: { spell: Types.ObjectId; usages: number }[];
    rewards: {
        coins: CoinPurse;
        items: RewardItem[];
        pet: Types.ObjectId | null;
    };
    xpGained: number;
    // guadagno effettivo del compagno dopo il tetto (Phase 19 D-17)
    petXpGained: number;
    xpBefore: number;
    xpAfter: number;
    levelBefore: number;
    levelAfter: number;
    titleBefore: TitleType;
    titleAfter: TitleType;
    spellLearned: Types.ObjectId | null;
    // le sole lore nuove dell'esito (D-09): planParticipant lo scrive sempre
    loreUnlocked?: Types.ObjectId[];
    enemies: QuestEnemyDraft[];
    stagesCleared: number | null;
    stagesTotal: number | null;
    rescuedCharacters: Types.ObjectId[];
    // esiti della quick 261110-cgd: arresto con multa, scontro di guardia
    arrested: boolean;
    coinsLost: CoinPurse | null;
    guardEncounter: boolean;
}

export type PlanVerdict =
    | QuestOutcome.success
    | QuestOutcome.failure
    | QuestOutcome.gmCompleted;

// contatori dei turni (D-21): tutti valorizzati in una dungeon, tutti null altrove
export interface DungeonTurnFields {
    turnsTotal: number | null;
    turnsCompleted: number | null;
    lastTurn: number | null;
    lastTurnKind: DungeonTurnKind | null;
}

export const NO_TURN_COUNTERS: DungeonTurnFields = {
    turnsTotal: null,
    turnsCompleted: null,
    lastTurn: null,
    lastTurnKind: null,
};

export interface DungeonStages extends DungeonTurnFields {
    cleared: number;
    total: number;
}

const turnFieldsOf = (stages: DungeonStages | null | undefined) =>
    stages
        ? {
              turnsTotal: stages.turnsTotal,
              turnsCompleted: stages.turnsCompleted,
              lastTurn: stages.lastTurn,
              lastTurnKind: stages.lastTurnKind,
          }
        : NO_TURN_COUNTERS;

export interface ParticipantPlanInput {
    resultId: Types.ObjectId;
    snapshot: OutcomeCharacterSnapshot;
    quest: OutcomeQuestSnapshot;
    lane: QuestLane;
    pendingQuestId: Types.ObjectId;
    userId: Types.ObjectId;
    verdict: PlanVerdict;
    battle: ParticipantEffects | null;
    enemies: EnemyFacts | null;
    victory?: VictoryKnowledge | null;
    rewards: DrawnRewards;
    aid: { aidQuestId: Types.ObjectId; failedQuestId: Types.ObjectId } | null;
    spellRecoveryTimes: ReadonlyMap<string, number>;
    // tetti di xp dei pet a catalogo, per esadecimale (Phase 19 D-17)
    petMaxXp: ReadonlyMap<string, number>;
    rescuedCharacters?: readonly Types.ObjectId[];
    // le dungeon a tappe e i soccorritori di un'aid di dungeon (D-12, D-21): null altrove
    stages?: DungeonStages | null;
    now: Date;
}

export interface SpellRecovery {
    characterId: string;
    spellId: string;
    dueAt: Date;
}

export interface ParticipantPlan {
    filter: Record<string, unknown>;
    // tipo letterale, non l'interfaccia: il writer accetta un Record<string, unknown>
    update: {
        $set: Record<string, unknown>;
        $addToSet?: KnowledgeAddition['$addToSet'];
    };
    coinsDelta: number;
    result: QuestResultDraft;
    spellRecoveries: SpellRecovery[];
}

export function questFactsOf(
    quest: OutcomeQuestSnapshot,
): QuestResultDraft['quest'] {
    return { id: quest._id, type: quest.infos.type, title: quest.infos.title };
}

// riusati dall'imboscata (Phase 15 D-09): planParticipant resta il solo piano delle quest
export function woundsAfter(
    existing: readonly InjuryType[],
    added: readonly InjuryType[],
): { injuries: InjuryType[]; added: InjuryType[] } {
    const fresh = [...new Set(added)].filter(
        (injury) => isInjuryType(injury) && !existing.includes(injury),
    );
    return { injuries: [...existing, ...fresh], added: fresh };
}

// consumi clampati al posseduto (T-09-23): un oggetto non posseduto si ignora, mai un'eccezione
export function consumablesSpent(
    owned: readonly InventoryEntry[] | undefined,
    used: ParticipantEffects['consumablesUsed'],
): ConsumableUsage[] {
    const spent: ConsumableUsage[] = [];
    for (const { itemId, quantity } of used) {
        const item = objectIdFromHex(itemId);
        if (!item || !isPositiveInteger(quantity)) continue;
        const stack = owned?.find((entry) => sameId(entry.item, item));
        const already = spent.find((entry) => sameId(entry.item, item));
        const left = (stack?.quantity ?? 0) - (already?.quantity ?? 0);
        const taken = Math.min(quantity, left);
        if (taken <= 0) continue;
        if (already) already.quantity += taken;
        else spent.push({ itemType: 'LootItem', item, quantity: taken });
    }
    return spent;
}

export const sellLine = ({ item, quantity }: ConsumableUsage): TradeLine => ({
    direction: 'sell',
    kind: 'LootItem',
    itemId: item,
    quantity,
});

const buyLine = ({ itemType, item, quantity }: RewardItem): TradeLine => ({
    direction: 'buy',
    kind: itemType,
    itemId: item,
    quantity,
});

export interface SpellsSpent {
    // null se nessuna magia è stata spesa
    spellStates: SpellStateEntry[] | null;
    used: QuestResultDraft['spellsUsed'];
    recoveries: SpellRecovery[];
}

const sameRecovery = (left: SpellRecovery, right: SpellRecovery) =>
    left.spellId === right.spellId &&
    left.dueAt.getTime() === right.dueAt.getTime();

// solo le voci attive (Phase 19 D-07), usi della voce e mai sotto 0 (T-09-23); istanti now + recoveryTime con i duplicati (D-02, D-06); un trigger per magia e istante
export function spellsSpent(
    characterId: Types.ObjectId,
    baseStates: readonly SpellStateEntry[],
    requested: ParticipantEffects['spellsUsed'],
    recoveryTimes: ReadonlyMap<string, number>,
    now: Date,
): SpellsSpent {
    // copia: la base può essere l'array dello snapshot
    const states = [...baseStates];
    const used: QuestResultDraft['spellsUsed'] = [];
    const recoveries: SpellRecovery[] = [];
    for (const { spellId, usages } of requested) {
        const spell = objectIdFromHex(spellId);
        if (!spell || !isPositiveInteger(usages)) continue;
        const index = states.findIndex((state) => sameId(state.spell, spell));
        if (index < 0 || states[index].active !== true) continue;
        const taken = Math.min(usages, Math.max(0, states[index].usages ?? 0));
        if (taken <= 0) continue;
        // senza un tempo di recupero noto (magia orfana nel catalogo) gli usi si scalano comunque, nessun istante né job
        const recoveryTime = recoveryTimes.get(spell.toHexString());
        const dueAt =
            recoveryTime === undefined
                ? null
                : recoveryDueAt(now, recoveryTime);
        states[index] = spendFromState(states[index], taken, dueAt);
        const already = used.find((usage) => sameId(usage.spell, spell));
        if (already) already.usages += taken;
        else used.push({ spell, usages: taken });
        if (!dueAt) continue;
        const recovery = {
            characterId: characterId.toHexString(),
            spellId: spell.toHexString(),
            dueAt,
        };
        if (!recoveries.some((queued) => sameRecovery(queued, recovery)))
            recoveries.push(recovery);
    }
    return {
        spellStates: used.length > 0 ? states : null,
        used,
        recoveries,
    };
}

function completedQuestsAfter(
    snapshot: OutcomeCharacterSnapshot,
    questId: Types.ObjectId,
): unknown[] | null {
    const completed = snapshot.quests?.completedQuests ?? [];
    return completed.some((entry) => sameId(entry, questId))
        ? null
        : [...completed, questId];
}

// idempotente sullo snapshot in sessione (D-21): già posseduto ⇒ nulla, nessun errore; ownedPets fuori dall'update se non cambia (Pitfall 5)
// il pet vinto è una voce intera con la vita massima del catalogo (Phase 19 D-03)
function petWonBy(
    snapshot: OutcomeCharacterSnapshot,
    won: boolean,
    pet: Types.ObjectId | null,
    lifePoints: unknown,
): NewOwnedPetEntry | null {
    if (!won || !pet) return null;
    return ownsPet(snapshot.assets?.ownedPets, pet)
        ? null
        : newOwnedPetEntry(pet, lifePoints);
}

// un solo valore finale dei posseduti (Phase 19 D-04, Pitfall 4): compagno premiato e pet vinto nello stesso array; null = nulla da scrivere
function ownedPetsAfterOutcome(
    owned: readonly OwnedPetEntry[] | null | undefined,
    awarded: NewOwnedPetEntry[] | null,
    petWon: NewOwnedPetEntry | null,
): NewOwnedPetEntry[] | null {
    if (!petWon) return awarded;
    return [...(awarded ?? normalisedOwnedPets(owned)), petWon];
}

// riusato dai piani senza premio (quick 261110-cgd)
export function participantFilter(
    input: Pick<ParticipantPlanInput, 'snapshot' | 'pendingQuestId' | 'lane'>,
    lanePath: string,
): Record<string, unknown> {
    const { xp } = input.snapshot.status;
    return {
        ...activeCharacterById(input.snapshot._id),
        [lanePath]: { $in: idForms(input.pendingQuestId) },
        // il completamento del GM riafferma la corsia standard libera (D-24); la risoluzione standard non la riceve: la sua corsia è proprio quella
        ...(isGmLane(input.lane) ? STANDARD_LANE_FREE : {}),
        ...(typeof xp === 'number' ? { 'status.xp': xp } : {}),
    };
}

export function planParticipant(input: ParticipantPlanInput): ParticipantPlan {
    const { snapshot, quest, rewards, battle, aid } = input;
    const won = input.verdict !== QuestOutcome.failure;
    if (!won && !aid) {
        throw new Error('failure outcome requires an aid quest');
    }
    const before = statusFactsOf(snapshot);
    const hpFought = battle
        ? lifePointsWithin(battle.hpAfter, before.maxLifePoints)
        : before.currentLifePoints;
    const enemiesXp = won ? (input.enemies?.xp ?? 0) : 0;
    const xpEarned = won ? rewards.xpPrize + enemiesXp : 0;
    const progression = progressionAfter(
        { xp: before.xp, currentLifePoints: hpFought },
        xpEarned,
        hpFought,
    );
    // la cura è un premio della quest vinta, qualunque sia il tipo (Phase 18 D-07): dopo il combattimento e dopo la progressione (D-20);
    // viaggia col blocco tirato per il titolo, mai riletta dalla quest (D-05)
    const cure = won ? cureOf(rewards.cure) : null;
    const fought = woundsAfter(
        snapshot.status.injuries ?? [],
        battle?.injuriesAdded ?? [],
    );
    const cured = cureInjuries(fought.injuries, cure?.canHeal ?? []);
    const currentLifePoints = cure
        ? lifePointsAfterCure(
              progression.currentLifePoints,
              progression.maxLifePoints,
              cure.lifePointsShare,
          )
        : progression.currentLifePoints;
    // il titolo avanza solo con la story vinta del titolo esatto (D-14, T-09-24)
    const titleAfter =
        won && quest.infos.type === QuestType.story
            ? nextTitleAfterStory(before.title, quest.requirements?.minTitle)
            : before.title;
    const consumables = consumablesSpent(
        snapshot.assets?.ownedItems,
        battle?.consumablesUsed ?? [],
    );
    const rewardItems = won ? rewards.items : [];
    const inventory = applyTradeToInventory(snapshot.assets ?? {}, [
        ...consumables.map(sellLine),
        ...rewardItems.map(buyLine),
    ]);
    // stessa base per spesa e apprendimento: «già conosciuta» si decide sulle voci (Phase 19 D-07)
    const knownStates = snapshot.status.spellStates ?? [];
    const knownSpells = knownStates.map((state) => state.spell);
    const spells = spellsSpent(
        snapshot._id,
        knownStates,
        battle?.spellsUsed ?? [],
        input.spellRecoveryTimes,
        input.now,
    );
    // la magia fissa della study vince sul sorteggio (D-31): il sorteggio vale solo senza prizes.spell
    const spellCandidate =
        rewards.spellCandidate ??
        drawLearnableSpell(
            rewards.spellDraw,
            progression.xp,
            knownSpells,
            titleAfter,
        );
    const spellLearned = won
        ? canLearnSpell(spellCandidate, progression.xp, knownSpells, titleAfter)
        : null;
    // la magia imparata entra nello stato nello stesso $set (D-03, D-07): usi pieni, nessun recupero
    const learnedState =
        spellLearned && spellCandidate
            ? learnedSpellState(spellLearned, spellCandidate.maxUsages)
            : null;
    const statesAfter =
        spells.spellStates || learnedState
            ? [
                  ...(spells.spellStates ?? knownStates),
                  ...(learnedState ? [learnedState] : []),
              ]
            : null;
    const completedQuests = won
        ? completedQuestsAfter(snapshot, quest._id)
        : null;
    const coinsDelta = won ? rewards.coinsCopper : 0;
    const petWon = petWonBy(snapshot, won, rewards.pet, rewards.petLifePoints);
    // la quota del compagno viene dai soli nemici, mai dal premio della quest (Phase 19 D-04, D-18)
    const companion = companionXpAward(
        snapshot.assets,
        enemiesXp,
        input.petMaxXp,
    );
    const ownedPetsAfter = ownedPetsAfterOutcome(
        snapshot.assets?.ownedPets,
        companion.ownedPets,
        petWon,
    );
    const victory = won ? (input.victory ?? null) : null;
    const victoryLore = victory?.loreIds ?? [];
    // la study vinta senza magia apprende una lore chiusa, mai una già sbloccata dallo stesso esito (Phase 16 D-08, Pitfall 6)
    const studyLore =
        won && !spellLearned
            ? drawStudyLore(rewards.loreDraw, [
                  ...(snapshot.status.unlockedLore ?? []),
                  ...victoryLore,
              ])
            : null;
    // le lore del pet solo con la voce aggiunta in questo esito (Phase 19 D-26)
    const petLore = petWon ? rewards.petLore : [];
    // ordine D-09: lore dei nemici, poi quella dello studio, poi quelle del pet vinto
    const learned = knowledgeUpdateOf(
        snapshot.status.unlockedLore,
        [...victoryLore, ...(studyLore ? [studyLore] : []), ...petLore],
        victory?.enemyIds ?? [],
    );
    const lanePath = lanePathOf(input.lane);

    const $set: Record<string, unknown> = {
        'status.xp': progression.xp,
        'status.level': progression.level,
        'status.maxLifePoints': progression.maxLifePoints,
        'status.currentLifePoints': currentLifePoints,
        'status.injuries': cured.injuries,
        'assets.ownedItems': inventory.ownedItems,
        'assets.ownedEquipments': inventory.ownedEquipments,
        [lanePath]: null,
        ...(titleAfter !== before.title ? { 'status.title': titleAfter } : {}),
        ...(statesAfter ? { 'status.spellStates': statesAfter } : {}),
        ...(completedQuests
            ? { 'quests.completedQuests': completedQuests }
            : {}),
        ...(ownedPetsAfter ? { 'assets.ownedPets': ownedPetsAfter } : {}),
        // il fallimento aspetta il soccorso sul marker della quest (D-07, D-08)
        ...(!won && aid
            ? {
                  'status.awaitingAid': {
                      quest: aid.failedQuestId,
                      aidQuest: aid.aidQuestId,
                      since: input.now,
                  },
              }
            : {}),
    };

    return {
        filter: participantFilter(input, lanePath),
        // la conoscenza si scrive nello stesso update del piano, solo se c'è qualcosa da imparare (Phase 16 D-06, D-14)
        update: { $set, ...learned.addition },
        coinsDelta,
        result: {
            _id: input.resultId,
            character: snapshot._id,
            user: input.userId,
            quest: questFactsOf(quest),
            outcome: input.verdict,
            resolvedAt: input.now,
            hpBefore: before.currentLifePoints,
            hpAfter: currentLifePoints,
            maxLifePoints: progression.maxLifePoints,
            injuriesAdded: fought.added,
            injuriesHealed: cured.healed,
            consumablesUsed: consumables,
            spellsUsed: spells.used,
            rewards: {
                coins: fromCopper(coinsDelta),
                items: rewardItems,
                pet: petWon?.pet ?? null,
            },
            // guadagno effettivo dopo il clamp a MAX_XP: xpAfter = xpBefore + xpGained sul foglio
            xpGained: Math.max(0, progression.xp - before.xp),
            petXpGained: companion.gained,
            xpBefore: before.xp,
            xpAfter: progression.xp,
            levelBefore: before.level,
            levelAfter: progression.level,
            titleBefore: before.title,
            titleAfter,
            spellLearned,
            loreUnlocked: learned.fresh,
            enemies: [...(input.enemies?.entries ?? [])],
            stagesCleared: input.stages?.cleared ?? null,
            stagesTotal: input.stages?.total ?? null,
            ...turnFieldsOf(input.stages),
            // solo chi ha vinto il soccorso ha salvato qualcuno
            rescuedCharacters:
                input.verdict === QuestOutcome.success
                    ? [...(input.rescuedCharacters ?? [])]
                    : [],
            arrested: false,
            coinsLost: null,
            guardEncounter: false,
        },
        spellRecoveries: spells.recoveries,
    };
}
