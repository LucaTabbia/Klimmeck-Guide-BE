import { ValidateBy } from 'class-validator';
import type { ValidationArguments } from 'class-validator';
import {
    CoinsEntry,
    DamagesEntry,
    EnergyDamageEntry,
    Flag,
    IdField,
    IdList,
    IntBetween,
    Nested,
    Nullable,
    OneOf,
    Optional,
    OptionalNullable,
    PositiveNumber,
    Text,
} from 'src/content/schema/common.content';
import { EffectType } from 'src/models/enums/effect-type.enum';
import { EquipType } from 'src/models/enums/equip-type.enum';
import { LoreType } from 'src/models/enums/lore-type.enum';
import { RarityType } from 'src/models/enums/rarity-type.enum';
import { UseType } from 'src/models/enums/use-type.enum';

// tetto della LEVEL_TABLE: una magia oltre non sarebbe mai apprendibile
export const MAX_SPELL_XP_TO_LEARN = 50_000;

// solo file: il mapper scrive City.relatedLore, quindi `city` ha senso solo su una lore di città
function OnlyOnCityLore(): PropertyDecorator {
    return ValidateBy({
        name: 'onlyOnCityLore',
        validator: {
            validate: (_: unknown, { object }: ValidationArguments) =>
                (object as LoreEntry).type === LoreType.city,
            defaultMessage: () => 'ammesso solo su una lore di tipo city',
        },
    });
}

function NotAboveMaxLifePoints(): PropertyDecorator {
    return ValidateBy({
        name: 'notAboveMaxLifePoints',
        validator: {
            validate: (value: unknown, { object }: ValidationArguments) =>
                typeof value !== 'number' ||
                value <= (object as PetEntry).maxLifePoints,
            defaultMessage: () => 'non può superare maxLifePoints',
        },
    });
}

export class LoreEntry {
    @IdField()
    id: string;

    @OneOf(Object.values(LoreType))
    type: LoreType;

    @Text()
    name: string;

    @Text()
    description: string;

    @OptionalNullable()
    @Text()
    image?: string | null;

    @Optional()
    @IdList()
    relatedLore?: string[];

    @Optional()
    @IdField()
    @OnlyOnCityLore()
    city?: string;
}

export class SpellEntry {
    @IdField()
    id: string;

    @Text()
    name: string;

    @Text()
    description: string;

    @OneOf(Object.values(UseType))
    useType: UseType;

    @Nested(() => EnergyDamageEntry)
    energyDamage: EnergyDamageEntry;

    @IntBetween(0)
    requiredLearnTime: number;

    @IntBetween(0, MAX_SPELL_XP_TO_LEARN)
    minXpToLearn: number;

    @IntBetween(0)
    recoveryTime: number;

    @IntBetween(1)
    maxUsages: number;
}

abstract class AssetEntry {
    @IdField()
    id: string;

    @Text()
    name: string;

    @Text()
    description: string;

    @Nullable()
    @Nested(() => CoinsEntry)
    sellPrice: CoinsEntry | null;

    @Nullable()
    @Nested(() => CoinsEntry)
    buyPrice: CoinsEntry | null;

    @OneOf(Object.values(RarityType))
    rarity: RarityType;

    // campo legacy esportato dal DB (D-04): riscritto identico, non a schema Mongoose
    @Optional()
    @Flag()
    sellable?: boolean;
}

export class EquipmentEntry extends AssetEntry {
    @OneOf(['EquipmentItem'])
    itemType: 'EquipmentItem';

    @OneOf(Object.values(EquipType))
    equipType: EquipType;

    @Nullable()
    @IdField()
    addedSpell: string | null;

    @Nested(() => DamagesEntry)
    damages: DamagesEntry;
}

export class LootEntry extends AssetEntry {
    @OneOf(['LootItem'])
    itemType: 'LootItem';

    @IntBetween(0)
    power: number;

    @OneOf(Object.values(EffectType))
    effect: EffectType;
}

export class PetEntry {
    @IdField()
    id: string;

    @Text()
    name: string;

    @Nested(() => DamagesEntry)
    damages: DamagesEntry;

    @Nested(() => CoinsEntry)
    buyPrice: CoinsEntry;

    @Nested(() => CoinsEntry)
    sellPrice: CoinsEntry;

    @IntBetween(0)
    xp: number;

    @IntBetween(0)
    maxXp: number;

    @IntBetween(0)
    @NotAboveMaxLifePoints()
    currentLifePoints: number;

    @IntBetween(1)
    maxLifePoints: number;

    @Text()
    imagePath: string;

    @OptionalNullable()
    @PositiveNumber()
    speedModifier?: number | null;
}
