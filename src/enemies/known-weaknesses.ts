import { DamageType } from 'src/models/enums/damage-type.enum';
import { EnergyType } from 'src/models/enums/energy-type.enum';
import { stringsOf } from 'src/mongo/lean-values';

const KNOWN_DAMAGE_TYPES: ReadonlySet<string> = new Set(
    Object.values(DamageType),
);
const KNOWN_ENERGY_TYPES: ReadonlySet<string> = new Set(
    Object.values(EnergyType),
);

const knownOf = <T extends string>(
    value: unknown,
    known: ReadonlySet<string>,
): T[] => stringsOf(value).filter((item): item is T => known.has(item));

// motore e filo ricevono solo debolezze dei due enum (Phase 19 D-01, D-22): lista assente o nulla = vuota
export const knownDamageTypesOf = (value: unknown): DamageType[] =>
    knownOf<DamageType>(value, KNOWN_DAMAGE_TYPES);

export const knownEnergyTypesOf = (value: unknown): EnergyType[] =>
    knownOf<EnergyType>(value, KNOWN_ENERGY_TYPES);
