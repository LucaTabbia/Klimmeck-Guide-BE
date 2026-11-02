import { ContentIssue } from 'src/content/content-issue';
import {
    ContentCollection,
    ContentTree,
    IMAGES_FILE,
    ImagesFile,
} from 'src/content/loading/content-tree';
import {
    EquipmentEntry,
    LootEntry,
    LoreEntry,
    PetEntry,
    SpellEntry,
} from 'src/content/schema/catalog.content';
import { EnemyEntry } from 'src/content/schema/enemy.content';
import { fixEntryIssues } from 'src/content/schema/fix.content';
import { QuestEntry } from 'src/content/schema/quest.content';
import { validateEntry } from 'src/content/schema/validate-entry';
import {
    ImageLinkEntry,
    WorldCityEntry,
} from 'src/content/schema/world.content';

export const ENTRY_CLASSES: Record<ContentCollection, new () => object> = {
    lore: LoreEntry,
    spells: SpellEntry,
    equipmentitems: EquipmentEntry,
    lootitems: LootEntry,
    enemies: EnemyEntry,
    pets: PetEntry,
    quests: QuestEntry,
};

function collectionIssues(tree: ContentTree): ContentIssue[] {
    return (Object.keys(ENTRY_CLASSES) as ContentCollection[]).flatMap(
        (collection) =>
            tree.entries[collection].flatMap((entry) =>
                validateEntry(ENTRY_CLASSES[collection], entry),
            ),
    );
}

// i link di images.yaml non hanno una riga propria: il percorso nomina sezione e posizione
function imageIssues(images: ImagesFile): ContentIssue[] {
    return (Object.keys(images) as (keyof ImagesFile)[]).flatMap((section) =>
        images[section].flatMap((link, index) =>
            validateEntry(ImageLinkEntry, {
                file: IMAGES_FILE,
                line: null,
                raw: link as unknown as Record<string, unknown>,
            }).map((issue) => ({
                ...issue,
                path: `${section}.${index}.${issue.path}`,
                message: `${section}.${index}.${issue.message}`,
            })),
        ),
    );
}

export function validateTreeEntries(tree: ContentTree): ContentIssue[] {
    return [
        ...collectionIssues(tree),
        ...tree.fixes.flatMap(fixEntryIssues),
        ...tree.worldEntries.flatMap((entry) =>
            validateEntry(WorldCityEntry, entry),
        ),
        ...imageIssues(tree.images),
    ];
}
