import { ONE_LIFE_POINT_CONCLUSION } from './guard/guard-outcome';
import type { ParticipantPlan } from './outcome-plan';
import { planUnrewarded, type UnrewardedPlanInput } from './unrewarded-plan';

// sconfitta in una quest che non apre soccorso: come lo scontro di guardia perso, senza l'incontro (D-19)
export function planDefeatWithoutAid(
    input: UnrewardedPlanInput,
): ParticipantPlan {
    return planUnrewarded(input, {
        ...ONE_LIFE_POINT_CONCLUSION,
        result: { arrested: false, coinsLost: null, guardEncounter: false },
    });
}
