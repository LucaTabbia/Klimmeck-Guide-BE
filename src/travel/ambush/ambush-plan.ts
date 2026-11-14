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
    companionSlotFilter,
    companionSlotSet,
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
    type CompanionAfterFight,
    companionAfterFight,
    type CompanionCatalogEntry,
    type CompanionOutcomeDraft,
} from 'src/quests/outcomes/pets/companion-after-fight';
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
import { refIdOf } from 'src/mongo/document-id';
import type { LonLat } from 'src/roads/road-route';
import {
    type FoodSettlement,
    foodProgressSetOf,
    settlementGuardsOf,
} from 'src/travel/food/travel-food-settlement';
import { mealLinesOf } from 'src/travel/food/travel-food.updates';
import { stacksOf } from 'src/travel/food/travel-pantry.reader';
import { BASE_SPEED, durationMsOf } from 'src/travel/travel-timing';
import { type AmbushFood, defeatSettlementOf } from './ambush-food';
import type { DrawnAmbush } from './ambush-draw';
import type { AmbushIdentity } from './ambush-job';
import {
    isMountFallen,
    onFootFoodOf,
    onFootTravelOf,
    paceFactorOf,
} from './ambush-on-foot';
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
    // piano del cibo salvato alla partenza, validato da foodLegOf (Phase 20 D-05)
    food?: unknown;
    // cavalcatura fotografata alla partenza, interna; assente sui viaggi partiti prima della Phase 23 (D-29)
    mount?: unknown;
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
    // il piano lo scrive sempre; assente nei report trattenuti prima della Phase 23
    companion?: CompanionOutcomeDraft | null;
    // il piano lo scrive sempre; assente nei report trattenuti prima della Phase 23 (D-28)
    onFoot?: boolean;
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
    // velocità del solo pet: la durata usa petSpeed × le ferite nuove, BASE_SPEED se il compagno cade (C-11)
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
    // punto dell'imboscata sulla polilinea: da lì riparte la strada a piedi (D-13)
    ambushPoint: { point: LonLat; segment: number };
    spellRecoveryTimes: ReadonlyMap<string, number>;
    petMaxXp: ReadonlyMap<string, number>;
    petCatalog: ReadonlyMap<string, CompanionCatalogEntry>;
    now: Date;
    // passo «cibo»: lo snapshot arriva già assestato al km dell'imboscata (Phase 20 D-07, D-18); null = viaggio senza piano
    food?: AmbushFood | null;
}

export interface AmbushOutcomePlan {
    filter: Record<string, unknown>;
    update: {
        $set: Record<string, unknown>;
        $addToSet?: KnowledgeAddition['$addToSet'];
    };
    coinsDelta: number;
    report: AmbushReportDraft;
    spellRecoveries: SpellRecovery[];
    // rewritten = viaggio riscritto con un startTime nuovo: i job vanno riallineati (Pitfall 5)
    travelAfter: {
        startTime: Date;
        endTime: Date;
        ambush: DrawnAmbush | null;
        rewritten: boolean;
    };
    // solo sulla strada a piedi con un piano del cibo: il ridirezionamento per fame lo legge (D-16)
    onFootFood: { arrivesAlive: boolean } | null;
    // vinta a piedi senza cibo per arrivare vivi: deviazione verso la città più vicina, corsia abbandonata (D-16)
    redirected: boolean;
}

interface FoughtOutcome {
    before: StatusFacts;
    progression: Progression;
    wounds: { injuries: InjuryType[]; added: InjuryType[] };
    consumables: ConsumableUsage[];
    inventory: ReturnType<typeof applyTradeToInventory>;
    spells: SpellsSpent;
    companion: CompanionAfterFight;
    coinsDelta: number;
}

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
        // in sconfitta si mangia il cibo dei km percorsi (Phase 20 D-03)
        inventory: applyTradeToInventory(snapshot.assets ?? {}, [
            ...consumables.map(sellLine),
            ...(won ? [] : mealLinesOf(input.food?.defeat?.consumed ?? [])),
        ]),
        // ancorati all'istante dell'imboscata, non al ritardo dello sweep (D-20)
        spells: spellsSpent(
            snapshot._id,
            snapshot.status.spellStates ?? [],
            effects?.spellsUsed ?? [],
            input.spellRecoveryTimes,
            input.identity.at,
        ),
        // quota sugli xp grezzi dei nemici, non sul premio di grado (Phase 19 D-04); vita e sconfitta all'istante dell'imboscata (D-03, D-26)
        companion: companionAfterFight({
            assets: snapshot.assets,
            effects,
            enemiesXp: won ? input.enemies.xp : 0,
            petMaxXp: input.petMaxXp,
            petCatalog: input.petCatalog,
            at: input.identity.at,
        }),
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
        ...companionSlotSet(companion),
    };
}

function reportOf(
    input: AmbushPlanInput,
    fought: FoughtOutcome,
    learned: KnowledgeUpdate,
    won: boolean,
    onFoot: boolean,
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
        companion: fought.companion.outcome,
        onFoot,
    };
}

// viaggio invariato (D-02): solo la prossima imboscata; il report si scrive subito come risultato (D-28)
function victoryUpdateOf(
    input: AmbushPlanInput,
    fought: FoughtOutcome,
    learned: KnowledgeUpdate,
): AmbushOutcomePlan['update'] {
    return {
        $set: {
            ...commonSetOf(fought),
            'status.activeTravel.ambush': nextAmbushEntry(input.nextAmbush),
            // dentro il tratto coperto la vittoria non tocca il piano (Phase 20 D-07)
            ...(input.food?.progress
                ? foodProgressSetOf(input.food.progress)
                : {}),
        },
        ...learned.addition,
    };
}

// l'unica lista di guardie viene dal cibo: il filtro dell'imboscata non ne ha (Phase 20 D-14, Pitfall 9)
function filterOf(
    input: AmbushPlanInput,
    fought: FoughtOutcome,
    guarded: FoodSettlement | null,
): Record<string, unknown> {
    const { xp } = input.snapshot.status;
    return {
        ...ambushFilter(input.identity, input.now),
        ...(typeof xp === 'number' ? { 'status.xp': xp } : {}),
        ...companionSlotFilter(input.snapshot.assets, fought.companion),
        ...(input.food
            ? settlementGuardsOf(input.food.food, guarded, input.food.hpRaw)
            : {}),
    };
}

// il compagno equipaggiato è caduto: la deviazione si fa a piedi (C-11)
function companionFell(fought: FoughtOutcome): boolean {
    return fought.companion.outcome?.defeated === true;
}

// ripiego sulla strada residua: durata della cavalcatura della partenza, allungata a piedi se è caduta (C-11)
function residualDurationOf(
    input: AmbushPlanInput,
    detour: DetourDraft,
    fought: FoughtOutcome,
): number {
    const residual = detour.residualMs ?? 0;
    if (!mountFallenIn(input, fought)) return residual;
    return Math.round(
        residual * paceFactorOf(input.snapshot.status.activeTravel.mount),
    );
}

// D-11: viaggio riscritto dal punto; D-03: nessun sorteggio sulla deviazione; porta solo i report trattenuti prima della Phase 23 (Pitfall 9)
function detourTravelOf(
    input: AmbushPlanInput,
    detour: DetourDraft,
    fought: FoughtOutcome,
): { travel: Record<string, unknown>; endTime: Date } {
    const at = input.identity.at;
    const pace = companionFell(fought) ? BASE_SPEED : detour.petSpeed;
    const speed = pace * travelSpeedFactorOf(fought.wounds.injuries);
    const duration =
        detour.baseHours !== null
            ? durationMsOf(detour.baseHours, speed)
            : residualDurationOf(input, detour, fought);
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
            ambushReports: held,
        },
    };
}

// deviazione con la corsia standard liberata: il viaggio riscritto non porta il piano (Phase 20 D-04)
function detourWriteOf(
    input: AmbushPlanInput,
    detour: DetourDraft,
    fought: FoughtOutcome,
): {
    filter: Record<string, unknown>;
    $set: Record<string, unknown>;
    endTime: Date;
} {
    const { travel, endTime } = detourTravelOf(input, detour, fought);
    const lane = input.snapshot.quests?.pendingQuest
        ? { 'quests.pendingQuest': null }
        : {};
    return {
        endTime,
        filter: filterOf(
            input,
            fought,
            input.food ? defeatSettlementOf(input.food) : null,
        ),
        $set: {
            ...commonSetOf(fought),
            'status.activeTravel': travel,
            ...lane,
        },
    };
}

function defeatPlanOf(
    input: AmbushPlanInput,
    detour: DetourDraft,
    fought: FoughtOutcome,
    report: AmbushReportDraft,
): AmbushOutcomePlan {
    const { filter, $set, endTime } = detourWriteOf(input, detour, fought);
    return {
        filter,
        update: { $set },
        coinsDelta: fought.coinsDelta,
        report,
        spellRecoveries: fought.spells.recoveries,
        travelAfter: {
            startTime: input.identity.at,
            endTime,
            ambush: null,
            rewritten: false,
        },
        onFootFood: null,
        redirected: false,
    };
}

// D-16: come la deviazione della sconfitta, coi premi e la conoscenza della vittoria; la città raggiunta finisce nel report (D-29)
function redirectPlanOf(
    input: AmbushPlanInput,
    detour: DetourDraft,
    walker: FoughtOutcome,
    learned: KnowledgeUpdate,
    report: AmbushReportDraft,
): AmbushOutcomePlan {
    const { filter, $set, endTime } = detourWriteOf(input, detour, walker);
    return {
        filter,
        update: { $set, ...learned.addition },
        coinsDelta: walker.coinsDelta,
        report: { ...report, reachedCity: detour.reachedCity },
        spellRecoveries: walker.spells.recoveries,
        travelAfter: {
            startTime: input.identity.at,
            endTime,
            ambush: null,
            rewritten: true,
        },
        onFootFood: { arrivesAlive: false },
        redirected: true,
    };
}

// la cavalcatura della partenza sconfitta in questo scontro (D-13, D-29)
function mountFallenIn(input: AmbushPlanInput, fought: FoughtOutcome): boolean {
    return isMountFallen(input.snapshot.status.activeTravel.mount, {
        petId: refIdOf(input.snapshot.assets?.pet),
        defeated: fought.companion.outcome?.defeated ?? false,
    });
}

// arrivare al punto è uno stop: si mangia il cibo dei km percorsi prima di ripartire a piedi (D-13, Phase 20 D-03)
function eatenAtStop(
    fought: FoughtOutcome,
    food: AmbushFood | null | undefined,
): FoughtOutcome {
    const meal = mealLinesOf(food?.defeat?.consumed ?? []);
    if (meal.length === 0) return fought;
    return {
        ...fought,
        inventory: {
            ...applyTradeToInventory(fought.inventory, meal),
            vacatedSlots: fought.inventory.vacatedSlots,
        },
    };
}

// D-13: viaggio riscritto dal punto all'istante dell'imboscata, senza mount; piano del cibo nuovo solo se il viaggio ne aveva uno valido
function onFootPlanOf(
    input: AmbushPlanInput,
    fought: FoughtOutcome,
    learned: KnowledgeUpdate,
    report: AmbushReportDraft,
): AmbushOutcomePlan {
    const travel = input.snapshot.status.activeTravel;
    const walker = eatenAtStop(fought, input.food);
    const walk = onFootTravelOf({
        travel,
        point: input.ambushPoint.point,
        segment: input.ambushPoint.segment,
        next: input.nextAmbush,
    });
    const meal = input.food
        ? onFootFoodOf({
              durationMs: walk.duration,
              distanceKm: walk.road.distance,
              hpBefore: walker.progression.currentLifePoints,
              stacks: stacksOf(walker.inventory.ownedItems, input.food.catalog),
          })
        : null;
    if (input.detour && meal && !meal.plan.arrivesAlive) {
        return redirectPlanOf(input, input.detour, walker, learned, report);
    }
    const held = travel.ambushReports ?? [];
    return {
        filter: filterOf(
            input,
            walker,
            input.food ? defeatSettlementOf(input.food) : null,
        ),
        update: {
            $set: {
                ...commonSetOf(walker),
                'status.activeTravel': {
                    road: walk.road,
                    startTime: walk.startTime,
                    endTime: walk.endTime,
                    duration: walk.duration,
                    to: walk.to,
                    kind: walk.kind,
                    ...(walk.next
                        ? { ambush: nextAmbushEntry(walk.next) }
                        : {}),
                    ...(meal ? { food: meal.food } : {}),
                    ...(held.length > 0 ? { ambushReports: held } : {}),
                },
            },
            ...learned.addition,
        },
        coinsDelta: walker.coinsDelta,
        report,
        spellRecoveries: walker.spells.recoveries,
        travelAfter: {
            startTime: walk.startTime,
            endTime: walk.endTime,
            ambush: walk.next,
            rewritten: true,
        },
        onFootFood: meal ? { arrivesAlive: meal.plan.arrivesAlive } : null,
        redirected: false,
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
    const onFoot = won ? mountFallenIn(input, fought) : companionFell(fought);
    const report = reportOf(input, fought, learned, won, onFoot);
    if (!won) {
        if (!input.detour) {
            throw new Error('ambush defeat needs the reached city');
        }
        return defeatPlanOf(input, input.detour, fought, report);
    }
    if (onFoot) return onFootPlanOf(input, fought, learned, report);
    const travel = input.snapshot.status.activeTravel;
    return {
        filter: filterOf(input, fought, input.food?.progress ?? null),
        update: victoryUpdateOf(input, fought, learned),
        coinsDelta: fought.coinsDelta,
        report,
        spellRecoveries: fought.spells.recoveries,
        travelAfter: {
            startTime: travel.startTime,
            endTime: travel.endTime,
            ambush: input.nextAmbush,
            rewritten: false,
        },
        onFootFood: null,
        redirected: false,
    };
}
