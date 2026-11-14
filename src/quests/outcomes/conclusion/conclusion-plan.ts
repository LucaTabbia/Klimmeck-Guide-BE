import { QuestOutcome } from 'src/models/enums/quest-outcome.enum';
import type { ChanceSource } from '../chance-source';
import { buildCombatContext } from '../combat/combat-context';
import type { CombatResolver } from '../combat/combat-resolver';
import {
    battleOf,
    type CombatantPlan,
    type CombatantPlanInput,
    enemyFactsOf,
    planCombatant,
} from '../combatant-plan';
import { planArrest } from '../crime/crime-arrest';
import {
    doubledCoinPrizes,
    encounterCatalogOf,
    foughtSnapshotOf,
    mergedEffects,
    planGuardDefeat,
} from '../guard/guard-outcome';
import type { UnrewardedPlanInput } from '../unrewarded-plan';
import type { ConclusionEvent } from './conclusion-event';

export interface ConclusionPlanInput extends CombatantPlanInput {
    event: ConclusionEvent | null;
    combat: CombatResolver;
}

const unrewardedInputOf = (
    input: ConclusionPlanInput,
    overrides: Pick<UnrewardedPlanInput, 'battle' | 'enemies'>,
): UnrewardedPlanInput => ({
    resultId: input.resultId,
    snapshot: input.snapshot,
    quest: input.quest,
    pendingQuestId: input.pendingQuestId,
    userId: input.userId,
    spellRecoveryTimes: input.catalog.recoveryTimes,
    now: input.now,
    ...overrides,
});

// l'evento vale solo per la quest vinta (quick 261110-cgd): una sconfitta passa da planCombatant, senza aid per crime e guard (D-19)
export function planConclusion(input: ConclusionPlanInput): CombatantPlan {
    const { event, battle } = input;
    if (!event || battle?.verdict === 'failure') return planCombatant(input);
    if (event.kind === 'arrest') {
        return {
            plan: planArrest(
                unrewardedInputOf(input, {
                    battle: battle?.effects ?? null,
                    enemies: enemyFactsOf(input.catalog),
                }),
            ),
            verdict: QuestOutcome.failure,
            aid: null,
        };
    }
    return planGuardEncounter(input, event.catalog, input.chance);
}

function planGuardEncounter(
    input: ConclusionPlanInput,
    encounter: Extract<ConclusionEvent, { kind: 'guardEncounter' }>['catalog'],
    chance: ChanceSource,
): CombatantPlan {
    const questEffects = input.battle?.effects ?? null;
    const fought = battleOf(
        input.combat.resolve(
            buildCombatContext({
                quest: input.quest,
                enemies: encounter.enemies,
                participants: [foughtSnapshotOf(input.snapshot, questEffects)],
                equipment: encounter.equipment,
                spells: encounter.spells,
                loot: encounter.loot,
                pets: encounter.pets,
            }),
            chance,
        ),
        input.snapshot._id,
    );
    if (!fought) throw new Error('guard encounter without a verdict');
    const effects = fought.effects
        ? mergedEffects(questEffects, fought.effects)
        : questEffects;
    const catalog = encounterCatalogOf(input.catalog, encounter);
    if (fought.verdict === 'failure') {
        return {
            plan: planGuardDefeat({
                ...unrewardedInputOf(input, {
                    battle: effects,
                    enemies: enemyFactsOf(catalog),
                }),
                spellRecoveryTimes: catalog.recoveryTimes,
            }),
            verdict: QuestOutcome.failure,
            aid: null,
        };
    }
    const won = planCombatant({
        ...input,
        quest: doubledCoinPrizes(input.quest),
        catalog,
        battle: {
            verdict: 'success',
            effects,
            stages: input.battle?.stages ?? null,
        },
    });
    return {
        ...won,
        plan: {
            ...won.plan,
            result: { ...won.plan.result, guardEncounter: true },
        },
    };
}
