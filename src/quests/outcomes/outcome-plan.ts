// stato finale calcolato prima della scrittura (Phase 4 applyTrade): un solo $set condizionale, unico scrittore di level/maxLifePoints (D-12, D-21)
import type { Types } from 'mongoose';
import type { SpellStateEntry } from 'src/characters/spells/spell-state.snapshot';
import { type CoinPurse, fromCopper } from 'src/economy/coins';
import {
    applyTradeToInventory,
    type InventoryEntry,
    type InventorySnapshot,
} from 'src/economy/trade/trade-inventory';
import type { TradeLine } from 'src/economy/trade/trade-line';
import { activeCharacterById } from 'src/models/character/active-character.filter';
import { InjuryType } from 'src/models/enums/injury-type.enum';
import { QuestOutcome } from 'src/models/enums/quest-outcome.enum';
import { QuestType } from 'src/models/enums/quest-type.enum';
import type { TitleType } from 'src/models/enums/title-type.enum';
import { idForms, objectIdFromHex, sameId } from 'src/mongo/document-id';
import { lanePathOf, type QuestLane } from 'src/quests/acceptance/quest-lanes';
import type { ParticipantEffects } from './combat/combat-resolver';
import { isInjuryType } from './injuries/injury-rules';
import { isPositiveInteger } from './outcome-numbers';
import { lifePointsWithin, progressionAfter } from './progression/level-table';
import { statusFactsOf } from './progression/status-facts';
import { nextTitleAfterStory } from './progression/title-progression';
import {
    canLearnSpell,
    type DrawnRewards,
    type RewardItem,
} from './rewards/quest-rewards';

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
        spells?: unknown[];
        spellStates?: SpellStateEntry[];
        location?: unknown;
        awaitingAid?: unknown;
    };
    quests?: { completedQuests?: unknown[] | null } | null;
    assets?:
        | (InventorySnapshot & {
              activeSpells?: { spell?: unknown; usages?: number }[];
          })
        | null;
}

export interface OutcomeQuestSnapshot {
    _id: Types.ObjectId;
    infos: { type: QuestType; title: string };
    requirements?: { minTitle?: TitleType | null } | null;
}

export interface ConsumableUsage {
    itemType: 'LootItem';
    item: Types.ObjectId;
    quantity: number;
}

export interface QuestResultDraft {
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
    consumablesUsed: ConsumableUsage[];
    spellsUsed: { spell: Types.ObjectId; usages: number }[];
    rewards: { coins: CoinPurse; items: RewardItem[] };
    xpGained: number;
    xpBefore: number;
    xpAfter: number;
    levelBefore: number;
    levelAfter: number;
    titleBefore: TitleType;
    titleAfter: TitleType;
    spellLearned: Types.ObjectId | null;
    enemy: Types.ObjectId | null;
    rescuedCharacters: Types.ObjectId[];
}

export type PlanVerdict =
    | QuestOutcome.success
    | QuestOutcome.failure
    | QuestOutcome.gmCompleted;

export interface ParticipantPlanInput {
    resultId: Types.ObjectId;
    snapshot: OutcomeCharacterSnapshot;
    quest: OutcomeQuestSnapshot;
    lane: QuestLane;
    pendingQuestId: Types.ObjectId;
    userId: Types.ObjectId;
    verdict: PlanVerdict;
    battle: ParticipantEffects | null;
    enemy: { id: Types.ObjectId; xp: number } | null;
    rewards: DrawnRewards;
    aid: { aidQuestId: Types.ObjectId; failedQuestId: Types.ObjectId } | null;
    spellRecoveryTimes: ReadonlyMap<string, number>;
    rescuedCharacters?: readonly Types.ObjectId[];
    now: Date;
}

export interface SpellRecovery {
    characterId: string;
    spellId: string;
    delayMs: number;
}

export interface ParticipantPlan {
    filter: Record<string, unknown>;
    update: { $set: Record<string, unknown> };
    coinsDelta: number;
    result: QuestResultDraft;
    spellRecoveries: SpellRecovery[];
}

export function questFactsOf(
    quest: OutcomeQuestSnapshot,
): QuestResultDraft['quest'] {
    return { id: quest._id, type: quest.infos.type, title: quest.infos.title };
}

function woundsAfter(
    existing: readonly InjuryType[],
    added: readonly InjuryType[],
): { injuries: InjuryType[]; added: InjuryType[] } {
    const fresh = [...new Set(added)].filter(
        (injury) => isInjuryType(injury) && !existing.includes(injury),
    );
    return { injuries: [...existing, ...fresh], added: fresh };
}

// consumi clampati al posseduto (T-09-23): un oggetto non posseduto si ignora, mai un'eccezione
function consumablesSpent(
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

const sellLine = ({ item, quantity }: ConsumableUsage): TradeLine => ({
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

type ActiveSpellEntry = { spell?: unknown; usages?: number };

interface SpellsSpent {
    activeSpells: ActiveSpellEntry[] | null;
    used: QuestResultDraft['spellsUsed'];
    recoveries: SpellRecovery[];
}

// usi mai sotto 0 (T-09-23); un job di recupero per uso, nello stesso formato di useSpell (D-21, C7)
function spellsSpent(
    characterId: Types.ObjectId,
    active: readonly ActiveSpellEntry[] | undefined,
    requested: ParticipantEffects['spellsUsed'],
    recoveryTimes: ReadonlyMap<string, number>,
): SpellsSpent {
    const activeSpells = (active ?? []).map((entry) => ({ ...entry }));
    const used: QuestResultDraft['spellsUsed'] = [];
    const recoveries: SpellRecovery[] = [];
    for (const { spellId, usages } of requested) {
        const spell = objectIdFromHex(spellId);
        if (!spell || !isPositiveInteger(usages)) continue;
        const entry = activeSpells.find((candidate) =>
            sameId(candidate.spell, spell),
        );
        const taken = Math.min(usages, Math.max(0, entry?.usages ?? 0));
        if (!entry || taken <= 0) continue;
        entry.usages = (entry.usages ?? 0) - taken;
        const already = used.find((usage) => sameId(usage.spell, spell));
        if (already) already.usages += taken;
        else used.push({ spell, usages: taken });
        // senza un tempo di recupero noto (magia orfana nel catalogo) gli usi si scalano comunque, nessun job
        const delayMs = recoveryTimes.get(spell.toHexString());
        if (delayMs === undefined) continue;
        for (let use = 0; use < taken; use++) {
            recoveries.push({
                characterId: characterId.toHexString(),
                spellId: spell.toHexString(),
                delayMs,
            });
        }
    }
    return {
        activeSpells: used.length > 0 ? activeSpells : null,
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

function participantFilter(
    input: ParticipantPlanInput,
    lanePath: string,
): Record<string, unknown> {
    const { xp } = input.snapshot.status;
    return {
        ...activeCharacterById(input.snapshot._id),
        [lanePath]: { $in: idForms(input.pendingQuestId) },
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
    const xpEarned = won ? rewards.xpPrize + (input.enemy?.xp ?? 0) : 0;
    const progression = progressionAfter(
        { xp: before.xp, currentLifePoints: hpFought },
        xpEarned,
        hpFought,
    );
    // la heal vinta toglie tutte le ferite e riporta gli HP al nuovo massimo (D-15)
    const healed = won && quest.infos.type === QuestType.heal;
    const currentLifePoints = healed
        ? progression.maxLifePoints
        : progression.currentLifePoints;
    const wounds = healed
        ? { injuries: [], added: [] }
        : woundsAfter(
              snapshot.status.injuries ?? [],
              battle?.injuriesAdded ?? [],
          );
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
    const spells = spellsSpent(
        snapshot._id,
        snapshot.assets?.activeSpells,
        battle?.spellsUsed ?? [],
        input.spellRecoveryTimes,
    );
    const knownSpells = snapshot.status.spells ?? [];
    const spellLearned = won
        ? canLearnSpell(rewards.spellCandidate, progression.xp, knownSpells)
        : null;
    const completedQuests = won
        ? completedQuestsAfter(snapshot, quest._id)
        : null;
    const coinsDelta = won ? rewards.coinsCopper : 0;
    const lanePath = lanePathOf(input.lane);

    const $set: Record<string, unknown> = {
        'status.xp': progression.xp,
        'status.level': progression.level,
        'status.maxLifePoints': progression.maxLifePoints,
        'status.currentLifePoints': currentLifePoints,
        'status.injuries': wounds.injuries,
        'assets.ownedItems': inventory.ownedItems,
        'assets.ownedEquipments': inventory.ownedEquipments,
        [lanePath]: null,
        ...(titleAfter !== before.title ? { 'status.title': titleAfter } : {}),
        ...(spells.activeSpells
            ? { 'assets.activeSpells': spells.activeSpells }
            : {}),
        ...(spellLearned
            ? { 'status.spells': [...knownSpells, spellLearned] }
            : {}),
        ...(completedQuests
            ? { 'quests.completedQuests': completedQuests }
            : {}),
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
        update: { $set },
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
            injuriesAdded: wounds.added,
            consumablesUsed: consumables,
            spellsUsed: spells.used,
            rewards: { coins: fromCopper(coinsDelta), items: rewardItems },
            // guadagno effettivo dopo il clamp a MAX_XP: xpAfter = xpBefore + xpGained sul foglio
            xpGained: Math.max(0, progression.xp - before.xp),
            xpBefore: before.xp,
            xpAfter: progression.xp,
            levelBefore: before.level,
            levelAfter: progression.level,
            titleBefore: before.title,
            titleAfter,
            spellLearned,
            enemy: input.enemy?.id ?? null,
            // solo chi ha vinto il soccorso ha salvato qualcuno
            rescuedCharacters:
                input.verdict === QuestOutcome.success
                    ? [...(input.rescuedCharacters ?? [])]
                    : [],
        },
        spellRecoveries: spells.recoveries,
    };
}
