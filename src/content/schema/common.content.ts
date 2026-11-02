import { applyDecorators } from '@nestjs/common';
import { Type } from 'class-transformer';
import {
    ArrayNotEmpty,
    IsArray,
    IsBoolean,
    IsDefined,
    IsIn,
    IsInt,
    IsNotEmpty,
    IsNumber,
    IsObject,
    IsOptional,
    IsPositive,
    IsString,
    Max,
    Min,
    ValidateBy,
    ValidateIf,
    ValidateNested,
} from 'class-validator';
import type { ValidationArguments } from 'class-validator';
import { DamageType } from 'src/models/enums/damage-type.enum';
import { EnergyType } from 'src/models/enums/energy-type.enum';
import { IsObjectIdHex } from 'src/validation/is-object-id-hex.decorator';

type EntryClass = new () => object;

// Int a 32 bit di GraphQL: un valore oltre questo limite rompe la serializzazione del campo
export const MAX_GRAPHQL_INT = 2_147_483_647;

export const ITEM_REFERENCE_TYPES = ['EquipmentItem', 'LootItem'] as const;

function notAllowedMessage({ value }: ValidationArguments): string {
    return Array.isArray(value)
        ? 'contiene un valore non ammesso'
        : `valore non ammesso: «${String(value)}»`;
}

// facoltativo ma mai null: una chiave scritta vuota è un refuso, non un default
export function Optional(): PropertyDecorator {
    return ValidateIf((_, value) => value !== undefined);
}

// obbligatorio, con null ammesso come valore esplicito
export function Nullable(): PropertyDecorator {
    return ValidateIf((_, value) => value !== null);
}

export function OptionalNullable(): PropertyDecorator {
    return IsOptional();
}

export function OneOf(values: readonly unknown[]): PropertyDecorator {
    return IsIn([...values], { message: notAllowedMessage });
}

export function EachOneOf(values: readonly unknown[]): PropertyDecorator {
    return applyDecorators(
        IsArray({ message: 'deve essere una lista' }),
        IsIn([...values], { each: true, message: notAllowedMessage }),
    );
}

// i blocchi di prosa usano `|-`: lo scalare `|` lascia un a capo finale che finirebbe a DB
export function Text(): PropertyDecorator {
    return applyDecorators(
        IsString({ message: 'deve essere un testo' }),
        IsNotEmpty({ message: 'non può essere vuoto' }),
        ValidateBy({
            name: 'noTrailingNewline',
            validator: {
                validate: (value: unknown) =>
                    typeof value !== 'string' || !value.endsWith('\n'),
                defaultMessage: () =>
                    'termina con un a capo (usare `|-`, non `|`)',
            },
        }),
    );
}

export function Flag(): PropertyDecorator {
    return IsBoolean({ message: 'deve essere true o false' });
}

export function IntBetween(
    min: number,
    max: number = MAX_GRAPHQL_INT,
): PropertyDecorator {
    return applyDecorators(
        IsInt({ message: 'deve essere un intero' }),
        Min(min, { message: `deve essere almeno ${min}` }),
        Max(max, { message: `deve essere al massimo ${max}` }),
    );
}

export function PositiveNumber(): PropertyDecorator {
    return applyDecorators(
        IsNumber(
            { allowNaN: false, allowInfinity: false },
            { message: 'deve essere un numero' },
        ),
        IsPositive({ message: 'deve essere maggiore di 0' }),
    );
}

export function IdField(): PropertyDecorator {
    return applyDecorators(
        IsString({ message: 'id non stringa (va fra apici)' }),
        IsObjectIdHex({
            message: 'id non valido (24 caratteri esadecimali minuscoli)',
        }),
    );
}

export function IdList(): PropertyDecorator {
    return applyDecorators(
        IsArray({ message: 'deve essere una lista di id' }),
        IsObjectIdHex({
            each: true,
            message:
                'contiene un id non valido (24 caratteri esadecimali minuscoli)',
        }),
    );
}

export function NonEmptyIdList(): PropertyDecorator {
    return applyDecorators(
        IdList(),
        ArrayNotEmpty({ message: 'deve contenere almeno un id' }),
    );
}

export function Nested(cls: () => EntryClass): PropertyDecorator {
    return applyDecorators(
        IsDefined({ message: 'valore mancante' }),
        IsObject({ message: 'deve essere una mappa' }),
        ValidateNested(),
        Type(cls),
    );
}

export function NestedList(cls: () => EntryClass): PropertyDecorator {
    return applyDecorators(
        IsArray({ message: 'deve essere una lista' }),
        ValidateNested({ each: true }),
        Type(cls),
    );
}

// mappa con chiavi e valori liberi nel file (es. danni per tipo, sostituzioni di tipi di POI): ogni coppia va controllata
export function RecordOf(
    isValidPair: (key: string, value: unknown) => boolean,
    message: string,
): PropertyDecorator {
    return ValidateBy({
        name: 'recordOf',
        validator: {
            validate: (value: unknown) =>
                typeof value === 'object' &&
                value !== null &&
                !Array.isArray(value) &&
                Object.entries(value).every(([key, item]) =>
                    isValidPair(key, item),
                ),
            defaultMessage: () => message,
        },
    });
}

export class CoinsEntry {
    @IntBetween(0)
    gold: number;

    @IntBetween(0)
    silver: number;

    @IntBetween(0)
    copper: number;
}

export class BaseDamageEntry {
    @OneOf(Object.values(DamageType))
    type: DamageType;

    @IntBetween(0)
    power: number;
}

export class EnergyDamageEntry {
    @OneOf(Object.values(EnergyType))
    type: EnergyType;

    @IntBetween(0)
    power: number;
}

export class DamagesEntry {
    @NestedList(() => BaseDamageEntry)
    base: BaseDamageEntry[];

    @NestedList(() => EnergyDamageEntry)
    energy: EnergyDamageEntry[];
}

export class AssetQuantityEntry {
    @OneOf(ITEM_REFERENCE_TYPES)
    itemType: (typeof ITEM_REFERENCE_TYPES)[number];

    @IdField()
    item: string;

    @IntBetween(1)
    quantity: number;
}
