import { ArrayNotEmpty, IsDefined, ValidateIf } from 'class-validator';
import { MAX_DOCUMENT_LEVEL } from 'src/content/rules/content-config';
import { BASE_ORDER, ENERGY_ORDER } from 'src/content/rules/enemy-stats';
import {
    DamagesEntry,
    EachOneOf,
    IdField,
    IdList,
    IntBetween,
    Nested,
    OneOf,
    Optional,
    PositiveNumber,
    RecordOf,
    Text,
} from 'src/content/schema/common.content';
import { DamageType } from 'src/models/enums/damage-type.enum';
import { EnergyType } from 'src/models/enums/energy-type.enum';
import { PoiType } from 'src/models/enums/poi-type.enum';
import { TitleType } from 'src/models/enums/title-type.enum';

export const ENEMY_CATEGORIES = [
    'monster',
    'animal',
    'legendary',
    'humanoid',
] as const;

export type EnemyCategory = (typeof ENEMY_CATEGORIES)[number];

const DAMAGE_PER_ROUND_TYPES: readonly string[] = [
    ...BASE_ORDER,
    ...ENERGY_ORDER,
];

function isDamagePerRound(type: string, average: unknown): boolean {
    return (
        DAMAGE_PER_ROUND_TYPES.includes(type) &&
        typeof average === 'number' &&
        Number.isFinite(average) &&
        average > 0
    );
}

function IsDamagePerRound(): PropertyDecorator {
    return RecordOf(
        isDamagePerRound,
        `deve mappare tipi di danno (${DAMAGE_PER_ROUND_TYPES.join(', ')}) su medie > 0`,
    );
}

// il loader deriva xp, lifePoints e damages dal blocco source: senza source servono tutti e tre (D-11)
function lacksDerivedOverrides(entry: EnemyEntry): boolean {
    return (
        entry.xp === undefined ||
        entry.lifePoints === undefined ||
        entry.damages === undefined
    );
}

export class EnemyAnalogEntry {
    @Text()
    name: string;

    @IntBetween(1)
    pe: number;

    @PositiveNumber()
    factor: number;
}

export class EnemySourceEntry {
    @Optional()
    @IntBetween(1, MAX_DOCUMENT_LEVEL)
    level?: number;

    @IntBetween(1)
    pe: number;

    @PositiveNumber()
    pf: number;

    @IsDefined({ message: 'valore mancante' })
    @IsDamagePerRound()
    damagePerRound: Record<string, number>;

    @Optional()
    @Nested(() => EnemyAnalogEntry)
    analog?: EnemyAnalogEntry;
}

export class EnemyEntry {
    @IdField()
    id: string;

    @Text()
    name: string;

    @OneOf(ENEMY_CATEGORIES)
    category: EnemyCategory;

    @Optional()
    @OneOf(Object.values(TitleType))
    tier?: TitleType;

    @ValidateIf(
        (entry: EnemyEntry) =>
            entry.source !== undefined || lacksDerivedOverrides(entry),
    )
    @IsDefined({ message: 'source o xp/lifePoints/damages obbligatori' })
    @Nested(() => EnemySourceEntry)
    source?: EnemySourceEntry;

    @EachOneOf(Object.values(PoiType))
    @ArrayNotEmpty({ message: 'serve almeno un luogo' })
    locations: PoiType[];

    @EachOneOf(ENERGY_ORDER)
    energyWeaknesses: EnergyType[];

    @EachOneOf(Object.values(DamageType))
    baseWeaknesses: DamageType[];

    @IdList()
    relatedLore: string[];

    @IdList()
    spells: string[];

    @Text()
    imagePath: string;

    @Optional()
    @IntBetween(1)
    xp?: number;

    @Optional()
    @IntBetween(1)
    lifePoints?: number;

    @Optional()
    @Nested(() => DamagesEntry)
    damages?: DamagesEntry;
}
