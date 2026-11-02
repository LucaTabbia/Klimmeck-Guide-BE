import type { Document } from 'mongodb';
import { ImageLink } from 'src/content/loading/content-tree';
import {
    CityLoreUpdate,
    MappedDocument,
    toObjectId,
    toObjectIds,
} from 'src/content/mapping/canonical';
import type {
    EquipmentEntry,
    LootEntry,
    LoreEntry,
    PetEntry,
    SpellEntry,
} from 'src/content/schema/catalog.content';
import type {
    CoinsEntry,
    DamagesEntry,
    EnergyDamageEntry,
} from 'src/content/schema/common.content';
import { LoreType } from 'src/models/enums/lore-type.enum';

// Ogni oggetto è un letterale nell'ordine dei @Prop dello schema, mai uno spread della voce:
// il server confronta i sottodocumenti byte per byte e un ordine diverso conta come modifica
// a ogni --apply (probe del RESEARCH §Pattern 3).

export type ImageUrls = ReadonlyMap<string, string>;

export function imageUrlsOf(links: readonly ImageLink[]): ImageUrls {
    return new Map(links.map((link) => [link.id, link.url]));
}

function catalogDocument(id: string, set: Document): MappedDocument {
    return { _id: toObjectId(id), set, setOnInsert: null };
}

export function coinsOf(coins: CoinsEntry): Document {
    return { gold: coins.gold, silver: coins.silver, copper: coins.copper };
}

const coinsOrNull = (coins: CoinsEntry | null): Document | null =>
    coins === null ? null : coinsOf(coins);

function energyDamageOf(damage: EnergyDamageEntry): Document {
    return { type: damage.type, power: damage.power };
}

export function damagesOf(damages: DamagesEntry): Document {
    return {
        base: damages.base.map((damage) => ({
            type: damage.type,
            power: damage.power,
        })),
        energy: damages.energy.map(energyDamageOf),
    };
}

export function mapLore(entry: LoreEntry, images: ImageUrls): MappedDocument {
    return catalogDocument(entry.id, {
        type: entry.type,
        image: images.get(entry.id) ?? entry.image ?? null,
        name: entry.name,
        description: entry.description,
        relatedLore: toObjectIds(entry.relatedLore),
    });
}

export function cityLoreOf(entry: LoreEntry): CityLoreUpdate | null {
    if (entry.type !== LoreType.city || entry.city === undefined) return null;
    return {
        cityId: toObjectId(entry.city),
        relatedLore: toObjectId(entry.id),
    };
}

// condiviso con le copie embedded in Enemy.spells (Pitfall 8)
export function spellFieldsOf(entry: SpellEntry): Document {
    return {
        name: entry.name,
        description: entry.description,
        useType: entry.useType,
        energyDamage: energyDamageOf(entry.energyDamage),
        requiredLearnTime: entry.requiredLearnTime,
        minXpToLearn: entry.minXpToLearn,
        recoveryTime: entry.recoveryTime,
        maxUsages: entry.maxUsages,
    };
}

export const mapSpell = (entry: SpellEntry): MappedDocument =>
    catalogDocument(entry.id, spellFieldsOf(entry));

// sellable è un campo legacy fuori schema: si riscrive in coda solo se il file lo porta (Pattern 3, regola 8)
function withLegacySellable(
    set: Document,
    entry: EquipmentEntry | LootEntry,
): Document {
    if (entry.sellable === undefined) return set;
    return { ...set, sellable: entry.sellable };
}

export function mapEquipment(entry: EquipmentEntry): MappedDocument {
    const set = {
        name: entry.name,
        itemType: entry.itemType,
        description: entry.description,
        sellPrice: coinsOrNull(entry.sellPrice),
        buyPrice: coinsOrNull(entry.buyPrice),
        rarity: entry.rarity,
        equipType: entry.equipType,
        addedSpell:
            entry.addedSpell === null ? null : toObjectId(entry.addedSpell),
        damages: damagesOf(entry.damages),
    };
    return catalogDocument(entry.id, withLegacySellable(set, entry));
}

export function mapLoot(entry: LootEntry): MappedDocument {
    const set = {
        name: entry.name,
        itemType: entry.itemType,
        description: entry.description,
        sellPrice: coinsOrNull(entry.sellPrice),
        buyPrice: coinsOrNull(entry.buyPrice),
        rarity: entry.rarity,
        power: entry.power,
        effect: entry.effect,
    };
    return catalogDocument(entry.id, withLegacySellable(set, entry));
}

export function mapPet(entry: PetEntry, images: ImageUrls): MappedDocument {
    return catalogDocument(entry.id, {
        name: entry.name,
        damages: damagesOf(entry.damages),
        buyPrice: coinsOf(entry.buyPrice),
        sellPrice: coinsOf(entry.sellPrice),
        xp: entry.xp,
        maxXp: entry.maxXp,
        currentLifePoints: entry.currentLifePoints,
        maxLifePoints: entry.maxLifePoints,
        imagePath: images.get(entry.id) ?? entry.imagePath,
        speedModifier: entry.speedModifier ?? null,
    });
}
