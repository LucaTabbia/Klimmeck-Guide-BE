import {
    CONTENT_COLLECTIONS,
    ContentCollection,
    ContentTree,
} from 'src/content/loading/content-tree';
import { LoadedEntry } from 'src/content/loading/yaml-file';
import {
    assertNoUndefined,
    CityLoreUpdate,
    MappedDocument,
} from 'src/content/mapping/canonical';
import {
    cityLoreOf,
    ImageUrls,
    imageUrlsOf,
    mapEquipment,
    mapLoot,
    mapLore,
    mapPet,
    mapSpell,
} from 'src/content/mapping/catalog.mapper';
import { mapEnemy } from 'src/content/mapping/enemy.mapper';
import { mapQuest } from 'src/content/mapping/quest.mapper';
import { ContentConfig } from 'src/content/rules/content-config';
import type {
    EquipmentEntry,
    LootEntry,
    LoreEntry,
    PetEntry,
    SpellEntry,
} from 'src/content/schema/catalog.content';
import type { EnemyEntry } from 'src/content/schema/enemy.content';
import type { QuestEntry } from 'src/content/schema/quest.content';

export type { CityLoreUpdate, MappedDocument };

export interface MappedContent {
    documents: Record<ContentCollection, MappedDocument[]>;
    cityLore: CityLoreUpdate[];
}

interface MappingContext {
    config: ContentConfig;
    spellsById: ReadonlyMap<string, SpellEntry>;
    loreImages: ImageUrls;
    enemyImages: ImageUrls;
    petImages: ImageUrls;
}

type EntryMapper = (raw: unknown, context: MappingContext) => MappedDocument;

// l'albero arriva già controllato (checkContent senza errori): qui le voci si leggono come le classi dello schema
const MAPPERS: Record<ContentCollection, EntryMapper> = {
    lore: (raw, { loreImages }) => mapLore(raw as LoreEntry, loreImages),
    spells: (raw) => mapSpell(raw as SpellEntry),
    equipmentitems: (raw) => mapEquipment(raw as EquipmentEntry),
    lootitems: (raw) => mapLoot(raw as LootEntry),
    enemies: (raw, { config, spellsById, enemyImages }) =>
        mapEnemy(raw as EnemyEntry, spellsById, config, enemyImages),
    pets: (raw, { petImages }) => mapPet(raw as PetEntry, petImages),
    quests: (raw, { config }) => mapQuest(raw as QuestEntry, config),
};

function spellsByIdOf(
    entries: readonly LoadedEntry[],
): Map<string, SpellEntry> {
    return new Map(
        entries.map((entry) => [
            entry.raw.id as string,
            entry.raw as unknown as SpellEntry,
        ]),
    );
}

function contextOf(tree: ContentTree): MappingContext {
    if (!tree.config) {
        throw new Error(
            'config.yaml non valido: controllare il contenuto prima di mapparlo',
        );
    }
    return {
        config: tree.config,
        spellsById: spellsByIdOf(tree.entries.spells),
        loreImages: imageUrlsOf(tree.images.lore),
        enemyImages: imageUrlsOf(tree.images.enemies),
        petImages: imageUrlsOf(tree.images.pets),
    };
}

// un undefined finirebbe a DB come null e il diff lo vedrebbe cambiato a ogni corsa
function mapEntry(
    collection: ContentCollection,
    entry: LoadedEntry,
    context: MappingContext,
): MappedDocument {
    const mapped = MAPPERS[collection](entry.raw, context);
    assertNoUndefined(mapped, `${collection}.${String(entry.raw.id)}`);
    return mapped;
}

// D-27: i documenti seguono l'ordine di caricamento delle voci, collezione per collezione
export function mapContentTree(tree: ContentTree): MappedContent {
    const context = contextOf(tree);
    const documents = Object.fromEntries(
        CONTENT_COLLECTIONS.map((collection) => [
            collection,
            tree.entries[collection].map((entry) =>
                mapEntry(collection, entry, context),
            ),
        ]),
    ) as Record<ContentCollection, MappedDocument[]>;
    const cityLore = tree.entries.lore.flatMap((entry) => {
        const update = cityLoreOf(entry.raw as unknown as LoreEntry);
        return update ? [update] : [];
    });
    return { documents, cityLore };
}
