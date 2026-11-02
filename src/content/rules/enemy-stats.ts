import { RankedTier, RANKED_TIERS } from 'src/content/rules/content-config';
import { DamageType } from 'src/models/enums/damage-type.enum';
import { EnergyType } from 'src/models/enums/energy-type.enum';

export interface ScaledDamage<T extends string> {
    type: T;
    power: number;
}

export interface EnemyDamages {
    base: ScaledDamage<DamageType>[];
    energy: ScaledDamage<EnergyType>[];
}

export const BASE_ORDER: readonly DamageType[] = Object.values(DamageType);

// enhancing è energia di supporto delle magie, mai un danno dei nemici
export const ENERGY_ORDER: readonly EnergyType[] = Object.values(
    EnergyType,
).filter((type) => type !== EnergyType.enhancing);

const KNOWN_TYPES: readonly string[] = [...BASE_ORDER, ...ENERGY_ORDER];

// il livello è quello per cui la creatura è uno scontro «Medio»: il più alto con PE della colonna ≤ PE (min 1)
export function levelFromPe(
    pe: number,
    mediumPeByLevel: readonly number[],
): number {
    const reached = mediumPeByLevel.filter((medium) => medium <= pe).length;
    return Math.max(1, reached);
}

export function tierOfLevel(
    level: number,
    tiers: Record<RankedTier, [number, number]>,
): RankedTier {
    const tier = RANKED_TIERS.find(
        (ranked) => tiers[ranked][0] <= level && level <= tiers[ranked][1],
    );
    if (!tier) throw new RangeError(`Livello senza fascia: ${level}`);
    return tier;
}

export function enemyXp(pe: number, xpScale: number): number {
    return Math.max(1, Math.round(pe * xpScale));
}

export function enemyLifePoints(pf: number, hpScale: number): number {
    return Math.round(pf * hpScale);
}

function scaledInOrder<T extends string>(
    order: readonly T[],
    damagePerRound: Readonly<Record<string, number>>,
    damageScale: number,
): ScaledDamage<T>[] {
    return order
        .filter((type) => type in damagePerRound)
        .map((type) => ({
            type,
            power: Math.round(damagePerRound[type] * damageScale),
        }));
}

export function enemyDamages(
    damagePerRound: Readonly<Record<string, number>>,
    damageScale: number,
): EnemyDamages {
    const unknown = Object.keys(damagePerRound).find(
        (type) => !KNOWN_TYPES.includes(type),
    );
    if (unknown) throw new RangeError(`Tipo di danno sconosciuto: ${unknown}`);
    return {
        base: scaledInOrder(BASE_ORDER, damagePerRound, damageScale),
        energy: scaledInOrder(ENERGY_ORDER, damagePerRound, damageScale),
    };
}
