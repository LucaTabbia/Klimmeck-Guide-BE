import { prisonReleaseAfter } from 'src/characters/imprisonment/imprisonment';
import { type CoinPurse, fromCopper, toCopper } from 'src/economy/coins';
import type { ChanceSource } from '../chance-source';
import type { ParticipantPlan } from '../outcome-plan';
import { planUnrewarded, type UnrewardedPlanInput } from '../unrewarded-plan';

// arresto alla conclusione di una crime (quick 261110-cgd): nessun premio, 10 ore di prigione, un quarto delle monete
export const CRIME_ARREST_CHANCE = 0.2;
export const CRIME_ARREST_COIN_LOSS_SHARE = 0.25;

export const rollsArrest = (chance: ChanceSource): boolean =>
    chance.next() < CRIME_ARREST_CHANCE;

// in rame, per difetto; un borsellino vuoto o illeggibile non perde nulla; i punti canale non si toccano
export function arrestFineOf(
    coins: Partial<CoinPurse> | null | undefined,
): number {
    const fine = Math.floor(toCopper(coins) * CRIME_ARREST_COIN_LOSS_SHARE);
    return Number.isSafeInteger(fine) && fine > 0 ? fine : 0;
}

export function planArrest(input: UnrewardedPlanInput): ParticipantPlan {
    const fine = arrestFineOf(input.snapshot.status.coins);
    return planUnrewarded(input, {
        lifePointsAfter: (fought) => fought,
        extraSet: { 'status.imprisonedUntil': prisonReleaseAfter(input.now) },
        coinsDelta: fine > 0 ? -fine : 0,
        result: {
            arrested: true,
            coinsLost: fromCopper(fine),
            guardEncounter: false,
        },
    });
}
