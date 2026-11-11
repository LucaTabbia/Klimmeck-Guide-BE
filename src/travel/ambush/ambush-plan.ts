// piano puro dell'imboscata (Phase 15): compone gli helper di outcome-plan senza planParticipant (lancia sul fallimento, scrive awaitingAid, azzera la corsia); mai awaitingAid, mai la corsia, mai completedQuests
import type { Types } from 'mongoose';
import { type CoinPurse, fromCopper } from 'src/economy/coins';
import { applyTradeToInventory } from 'src/economy/trade/trade-inventory';
import { TravelKind } from 'src/models/character/active-travel.model';
import type { InjuryType } from 'src/models/enums/injury-type.enum';
import { QuestOutcome } from 'src/models/enums/quest-outcome.enum';
import type { TitleType } from 'src/models/enums/title-type.enum';
import type {
    CombatVerdict,
    ParticipantEffects,
} from 'src/quests/outcomes/combat/combat-resolver';
import {
    type ConsumableUsage,
    consumablesSpent,
    type EnemyFacts,
    type OutcomeCharacterSnapshot,
    type QuestEnemyDraft,
    sellLine,
    type SpellRecovery,
    type SpellsSpent,
    spellsSpent,
    woundsAfter,
} from 'src/quests/outcomes/outcome-plan';
import { travelSpeedFactorOf } from 'src/quests/outcomes/injuries/injury-rules';
import {
    type CompanionXpAward,
    companionXpAward,
} from 'src/quests/outcomes/pets/companion-xp';
import type { KnowledgeAddition } from 'src/lore/knowledge-addition';
import {
    lifePointsWithin,
    type Progression,
    progressionAfter,
} from 'src/quests/outcomes/progression/level-table';
import {
    type StatusFacts,
    statusFactsOf,
} from 'src/quests/outcomes/progression/status-facts';
import {
    type KnowledgeUpdate,
    knowledgeUpdateOf,
    type VictoryKnowledge,
} from 'src/quests/outcomes/victory-knowledge';
import type { LonLat } from 'src/roads/road-route';
import { durationMsOf } from 'src/travel/travel-timing';
import type { DrawnAmbush } from './ambush-draw';
import type { AmbushIdentity } from './ambush-job';
import { ambushPrizesOf } from './ambush-rules';
import { ambushFilter, nextAmbushEntry } from './ambush.updates';

export interface AmbushCity {
    id: Types.ObjectId;
    name: string;
}

export interface AmbushTravelSnapshot {
    road: { coordinates: LonLat[]; distance: number };
    startTime: Date;
    endTime: Date;
    duration: number;
    to: Types.ObjectId;
    kind: TravelKind;
    ambush: { at: Date; km: number; attempts?: number };
    ambushReports?: AmbushReportDraft[];
}

export type AmbushCharacterSnapshot = OutcomeCharacterSnapshot & {
    status: OutcomeCharacterSnapshot['status'] & {
        activeTravel: AmbushTravelSnapshot;
    };
};

export interface AmbushReportDraft {
    resultId: Types.ObjectId;
    user: Types.ObjectId;
    outcome: QuestOutcome.success | QuestOutcome.failure;
    at: Date;
    nearCity: AmbushCity;
    reachedCity: AmbushCity | null;
    enemies: QuestEnemyDraft[];
    hpBefore: number;
    hpAfter: number;
    maxLifePoints: number;
    injuriesAdded: InjuryType[];
    consumablesUsed: ConsumableUsage[];
    spellsUsed: { spell: Types.ObjectId; usages: number }[];
    coins: CoinPurse;
    xpGained: number;
    xpBefore: number;
    xpAfter: number;
    levelBefore: number;
    levelAfter: number;
    titleBefore: TitleType;
    titleAfter: TitleType;
    // il piano lo scrive sempre; assente nei report trattenuti prima della Phase 16
    loreUnlocked?: Types.ObjectId[];
    // il piano lo scrive sempre; assente nei report trattenuti prima della Phase 19
    petXpGained?: number;
}

// deviazione verso la città più vicina dopo una sconfitta (D-11); ripiego sulla strada residua verso la meta (D-25)
export interface DetourDraft {
    road: { coordinates: LonLat[]; distance: number };
    to: Types.ObjectId;
    reachedCity: AmbushCity;
    // rotta verso la città più vicina; null sul ripiego
    baseHours: number | null;
    // ripiego: durata residua del viaggio originale (endTime − at)
    residualMs: number | null;
    // velocità del solo pet: la durata usa petSpeed × le ferite nuove
    petSpeed: number;
}

export interface AmbushPlanInput {
    snapshot: AmbushCharacterSnapshot;
    identity: AmbushIdentity;
    resultId: Types.ObjectId;
    userId: Types.ObjectId;
    verdict: CombatVerdict;
    effects: ParticipantEffects | null;
    enemies: EnemyFacts;
    victory?: VictoryKnowledge | null;
    nearCity: AmbushCity;
    nextAmbush: DrawnAmbush | null;
    detour: DetourDraft | null;
    spellRecoveryTimes: ReadonlyMap<string, number>;
    petMaxXp: ReadonlyMap<string, number>;
    now: Date;
}

export interface AmbushOutcomePlan {
    filter: Record<string, unknown>;
    update: {
        $set: Record<string, unknown>;
        $push?: Record<string, unknown>;
        $addToSet?: KnowledgeAddition['$addToSet'];
    };
    coinsDelta: number;
    report: AmbushReportDraft;
    spellRecoveries: SpellRecovery[];
    travelAfter: { startTime: Date; endTime: Date; ambush: DrawnAmbush | null };
}

interface FoughtOutcome {
    before: StatusFacts;
    progression: Progression;
    wounds: { injuries: InjuryType[]; added: InjuryType[] };
    consumables: ConsumableUsage[];
    inventory: ReturnType<typeof applyTradeToInventory>;
    spells: SpellsSpent;
    companion: CompanionXpAward;
    coinsDelta: number;
}

const REPORT_PATH = 'status.activeTravel.ambushReports';

function foughtOutcomeOf(input: AmbushPlanInput, won: boolean): FoughtOutcome {
    const { snapshot, effects } = input;
    const before = statusFactsOf(snapshot);
    const hpFought = effects
        ? lifePointsWithin(effects.hpAfter, before.maxLifePoints)
        : before.currentLifePoints;
    const prizes = ambushPrizesOf(before.title, input.enemies.xp);
    const progression = progressionAfter(
        { xp: before.xp, currentLifePoints: hpFought },
        won ? prizes.xp : 0,
        hpFought,
    );
    const consumables = consumablesSpent(
        snapshot.assets?.ownedItems,
        effects?.consumablesUsed ?? [],
    );
    return {
        before,
        progression,
        wounds: woundsAfter(
            snapshot.status.injuries ?? [],
            effects?.injuriesAdded ?? [],
        ),
        consumables,
        inventory: applyTradeToInventory(
            snapshot.assets ?? {},
            consumables.map(sellLine),
        ),
        // ancorati all'istante dell'imboscata, non al ritardo dello sweep (D-20)
        spells: spellsSpent(
            snapshot._id,
            snapshot.status.spellStates ?? [],
            effects?.spellsUsed ?? [],
            input.spellRecoveryTimes,
            input.identity.at,
        ),
        // quota sugli xp grezzi dei nemici, non sul premio di grado (Phase 19 D-04)
        companion: companionXpAward(
            snapshot.assets,
            won ? input.enemies.xp : 0,
            input.petMaxXp,
        ),
        coinsDelta: won ? prizes.copper : 0,
    };
}

// il titolo resta fermo (C2): avanza solo con la story del titolo
function commonSetOf(fought: FoughtOutcome): Record<string, unknown> {
    const { progression, wounds, inventory, spells, companion } = fought;
    return {
        'status.xp': progression.xp,
        'status.level': progression.level,
        'status.maxLifePoints': progression.maxLifePoints,
        'status.currentLifePoints': progression.currentLifePoints,
        'status.injuries': wounds.injuries,
        'assets.ownedItems': inventory.ownedItems,
        'assets.ownedEquipments': inventory.ownedEquipments,
        ...(spells.spellStates
            ? { 'status.spellStates': spells.spellStates }
            : {}),
        ...(companion.ownedPets
            ? { 'assets.ownedPets': companion.ownedPets }
            : {}),
    };
}

function reportOf(
    input: AmbushPlanInput,
    fought: FoughtOutcome,
    learned: KnowledgeUpdate,
    won: boolean,
): AmbushReportDraft {
    const { before, progression } = fought;
    return {
        resultId: input.resultId,
        user: input.userId,
        outcome: won ? QuestOutcome.success : QuestOutcome.failure,
        at: input.identity.at,
        nearCity: input.nearCity,
        reachedCity: won ? null : (input.detour?.reachedCity ?? null),
        enemies: [...input.enemies.entries],
        hpBefore: before.currentLifePoints,
        hpAfter: progression.currentLifePoints,
        maxLifePoints: progression.maxLifePoints,
        injuriesAdded: fought.wounds.added,
        consumablesUsed: fought.consumables,
        spellsUsed: fought.spells.used,
        coins: fromCopper(fought.coinsDelta),
        xpGained: Math.max(0, progression.xp - before.xp),
        xpBefore: before.xp,
        xpAfter: progression.xp,
        levelBefore: before.level,
        levelAfter: progression.level,
        titleBefore: before.title,
        titleAfter: before.title,
        loreUnlocked: learned.fresh,
        petXpGained: fought.companion.gained,
    };
}

// viaggio invariato (D-02): solo la prossima imboscata e il report trattenuto (D-13)
function victoryUpdateOf(
    input: AmbushPlanInput,
    fought: FoughtOutcome,
    learned: KnowledgeUpdate,
    report: AmbushReportDraft,
): AmbushOutcomePlan['update'] {
    return {
        $set: {
            ...commonSetOf(fought),
            'status.activeTravel.ambush': nextAmbushEntry(input.nextAmbush),
        },
        $push: { [REPORT_PATH]: report },
        ...learned.addition,
    };
}

function filterOf(input: AmbushPlanInput): Record<string, unknown> {
    const { xp } = input.snapshot.status;
    return {
        ...ambushFilter(input.identity, input.now),
        ...(typeof xp === 'number' ? { 'status.xp': xp } : {}),
    };
}

// D-11: viaggio riscritto dal punto, corsia standard liberata; D-03: nessun sorteggio sulla deviazione
function defeatTravelOf(
    input: AmbushPlanInput,
    detour: DetourDraft,
    fought: FoughtOutcome,
    report: AmbushReportDraft,
): { travel: Record<string, unknown>; endTime: Date } {
    const at = input.identity.at;
    const speed = detour.petSpeed * travelSpeedFactorOf(fought.wounds.injuries);
    const duration =
        detour.baseHours !== null
            ? durationMsOf(detour.baseHours, speed)
            : (detour.residualMs ?? 0);
    const endTime = new Date(at.getTime() + duration);
    const held = input.snapshot.status.activeTravel.ambushReports ?? [];
    return {
        endTime,
        travel: {
            road: detour.road,
            startTime: at,
            endTime,
            duration,
            to: detour.to,
            kind: TravelKind.free,
            ambushReports: [...held, report],
        },
    };
}

function defeatPlanOf(
    input: AmbushPlanInput,
    detour: DetourDraft,
    fought: FoughtOutcome,
    report: AmbushReportDraft,
): AmbushOutcomePlan {
    const { travel, endTime } = defeatTravelOf(input, detour, fought, report);
    const lane = input.snapshot.quests?.pendingQuest
        ? { 'quests.pendingQuest': null }
        : {};
    return {
        filter: filterOf(input),
        update: {
            $set: {
                ...commonSetOf(fought),
                'status.activeTravel': travel,
                ...lane,
            },
        },
        coinsDelta: fought.coinsDelta,
        report,
        spellRecoveries: fought.spells.recoveries,
        travelAfter: { startTime: input.identity.at, endTime, ambush: null },
    };
}

export function planAmbushOutcome(input: AmbushPlanInput): AmbushOutcomePlan {
    const won = input.verdict === 'success';
    const fought = foughtOutcomeOf(input, won);
    // la sconfitta non insegna (Phase 16 D-06): la deviazione insegna solo all'arrivo (D-05)
    const victory = won ? (input.victory ?? null) : null;
    const learned = knowledgeUpdateOf(
        input.snapshot.status.unlockedLore,
        victory?.loreIds ?? [],
        victory?.enemyIds ?? [],
    );
    const report = reportOf(input, fought, learned, won);
    if (!won) {
        if (!input.detour) {
            throw new Error('ambush defeat needs the reached city');
        }
        return defeatPlanOf(input, input.detour, fought, report);
    }
    const travel = input.snapshot.status.activeTravel;
    return {
        filter: filterOf(input),
        update: victoryUpdateOf(input, fought, learned, report),
        coinsDelta: fought.coinsDelta,
        report,
        spellRecoveries: fought.spells.recoveries,
        travelAfter: {
            startTime: travel.startTime,
            endTime: travel.endTime,
            ambush: input.nextAmbush,
        },
    };
}
