import {
    ContentIndex,
    IndexedEntry,
    indexContent,
} from 'src/content/checking/content-index';
import { ContentIssue } from 'src/content/content-issue';
import {
    ContentCollection,
    ContentTree,
    IMAGES_FILE,
    ImagesFile,
    WORLD_FILE,
    WorldCity,
} from 'src/content/loading/content-tree';
import { LoadedEntry } from 'src/content/loading/yaml-file';
import { ContentConfig } from 'src/content/rules/content-config';
import { enemyFactsOf } from 'src/content/rules/enemy-facts';
import { validateTreeEntries } from 'src/content/schema/validate-tree';
import { CityType } from 'src/models/enums/city-type.enum';
import { PoiType } from 'src/models/enums/poi-type.enum';

export interface ContentCheck {
    errors: ContentIssue[];
    warnings: ContentIssue[];
}

type Raw = Record<string, unknown>;

const NO_SNAPSHOT = `snapshot ${WORLD_FILE} mancante`;

const SERVICE_QUEST_TYPES: readonly string[] = [
    'heal',
    'job',
    'guard',
    'crime',
    'study',
];

const ENEMY_CATEGORY_OF_QUEST: Readonly<Record<string, string>> = {
    hunt: 'animal',
    dungeon: 'monster',
};

const DECISION_OF_QUEST: Readonly<Record<string, string>> = {
    hunt: 'D-18',
    dungeon: 'D-20',
};

const COLLECTION_OF_ITEM_TYPE: Readonly<Record<string, ContentCollection>> = {
    EquipmentItem: 'equipmentitems',
    LootItem: 'lootitems',
};

const SPELL_DRAW_CITY = 'Valantar';

function isRecord(value: unknown): value is Raw {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function recordAt(raw: Raw, key: string): Raw {
    const value = raw[key];
    return isRecord(value) ? value : {};
}

function stringAt(raw: Raw, key: string): string | null {
    const value = raw[key];
    return typeof value === 'string' ? value : null;
}

function issueAt(
    entry: IndexedEntry,
    path: string,
    message: string,
): ContentIssue {
    return {
        file: entry.file,
        line: entry.line,
        entryId: entry.id,
        path,
        message,
    };
}

function entriesOf(
    index: ContentIndex,
    collection: ContentCollection,
): IndexedEntry[] {
    return index.entries.filter((entry) => entry.collection === collection);
}

// ---- schema e prosa: lo stesso difetto può uscire dal loader e dalla validazione, vince il primo messaggio

function issueKeyOf(issue: ContentIssue): string {
    return `${issue.file}:${issue.line ?? ''}:${issue.path}`;
}

function withoutRepeats(issues: readonly ContentIssue[]): ContentIssue[] {
    const seen = new Set<string>();
    return issues.filter((issue) => {
        const key = issueKeyOf(issue);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function trailingNewlinePaths(value: unknown, path: string): string[] {
    if (typeof value === 'string') return value.endsWith('\n') ? [path] : [];
    const children: [string, unknown][] = Array.isArray(value)
        ? value.map((item, position) => [String(position), item])
        : isRecord(value)
          ? Object.entries(value)
          : [];
    return children.flatMap(([key, child]) =>
        trailingNewlinePaths(child, path ? `${path}.${key}` : key),
    );
}

// lo scalare `|` lascia un a capo finale che finirebbe a DB: nei file si scrive `|-`
function proseIssues(tree: ContentTree): ContentIssue[] {
    const loaded: LoadedEntry[] = [
        ...Object.values(tree.entries).flat(),
        ...tree.fixes,
        ...tree.worldEntries,
    ];
    return loaded.flatMap((entry) =>
        trailingNewlinePaths(entry.raw, '').map((path) => ({
            file: entry.file,
            line: entry.line,
            entryId: stringAt(entry.raw, 'id') ?? stringAt(entry.raw, 'key'),
            path,
            message: 'la prosa finisce con un a capo: usare |- invece di |',
        })),
    );
}

function schemaIssues(tree: ContentTree): ContentIssue[] {
    return withoutRepeats([
        ...tree.issues,
        ...validateTreeEntries(tree),
        ...proseIssues(tree),
    ]);
}

// ---- id doppi e nomi doppi (D-02)

function duplicateIssues(index: ContentIndex): ContentIssue[] {
    return [...index.allIds.values()].flatMap((sameId) =>
        sameId.slice(1).map((entry, position) => {
            const earlier = sameId.slice(0, position + 1);
            const sameCollection = earlier.some(
                (other) => other.collection === entry.collection,
            );
            const message = sameCollection
                ? `id doppio in ${entry.collection}: ${entry.id}`
                : `id già usato in ${earlier[0].collection}: ${entry.id}`;
            return issueAt(entry, 'id', message);
        }),
    );
}

function nameWarnings(index: ContentIndex): ContentIssue[] {
    const seen = new Set<string>();
    return index.entries.flatMap((entry) => {
        if (entry.name === null) return [];
        const key = [entry.collection, entry.type, entry.name].join('\u0000');
        if (!seen.has(key)) {
            seen.add(key);
            return [];
        }
        const group = entry.type
            ? `${entry.collection} (${entry.type})`
            : entry.collection;
        const path = entry.collection === 'quests' ? 'infos.title' : 'name';
        return [issueAt(entry, path, `nome doppio in ${group}: ${entry.name}`)];
    });
}

// ---- riferimenti (D-02, Pitfall 9)

class RefChecker {
    constructor(
        private readonly index: ContentIndex,
        private readonly hasSnapshot: boolean,
    ) {}

    one(
        entry: IndexedEntry,
        path: string,
        value: unknown,
        collection: ContentCollection,
    ): ContentIssue[] {
        if (typeof value !== 'string') return [];
        if (this.index.byCollection[collection].has(value)) return [];
        return [
            issueAt(
                entry,
                path,
                `riferimento pendente: ${value} non è in ${collection}`,
            ),
        ];
    }

    list(
        entry: IndexedEntry,
        path: string,
        value: unknown,
        collection: ContentCollection,
    ): ContentIssue[] {
        if (!Array.isArray(value)) return [];
        return value.flatMap((id: unknown, position) =>
            this.one(entry, `${path}.${position}`, id, collection),
        );
    }

    city(entry: IndexedEntry, value: unknown): ContentIssue[] {
        if (typeof value !== 'string') return [];
        if (!this.hasSnapshot) return [issueAt(entry, 'city', NO_SNAPSHOT)];
        if (this.index.cities.has(value)) return [];
        return [
            issueAt(entry, 'city', `città assente dallo snapshot: ${value}`),
        ];
    }

    marker(
        entry: IndexedEntry,
        cityId: unknown,
        marker: unknown,
    ): ContentIssue[] {
        if (!this.hasSnapshot || typeof marker !== 'string') return [];
        const path = 'infos.markerLocation';
        const poi = this.index.pois.get(marker);
        if (!poi) {
            return [
                issueAt(
                    entry,
                    path,
                    `riferimento pendente: ${marker} non è un POI dello snapshot`,
                ),
            ];
        }
        const city =
            typeof cityId === 'string' ? this.index.cities.get(cityId) : null;
        if (!city || poi.cityId === city.id) return [];
        return [
            issueAt(
                entry,
                path,
                `il marker ${marker} non è un POI di ${city.name}`,
            ),
        ];
    }

    asset(entry: IndexedEntry, path: string, asset: unknown): ContentIssue[] {
        if (!isRecord(asset)) return [];
        const item = stringAt(asset, 'item');
        const itemType = stringAt(asset, 'itemType');
        const expected = itemType ? COLLECTION_OF_ITEM_TYPE[itemType] : null;
        if (!item || !expected) return [];
        if (this.index.byCollection[expected].has(item)) return [];
        const actual = this.index.allIds.get(item)?.[0]?.collection;
        const message = actual
            ? `${item} è in ${actual} ma itemType è ${itemType}`
            : `riferimento pendente: ${item} non è in ${expected}`;
        return [issueAt(entry, `${path}.item`, message)];
    }

    assets(entry: IndexedEntry, path: string, value: unknown): ContentIssue[] {
        if (!Array.isArray(value)) return [];
        return value.flatMap((asset: unknown, position) =>
            this.asset(entry, `${path}.${position}`, asset),
        );
    }
}

function questRefIssues(refs: RefChecker, entry: IndexedEntry): ContentIssue[] {
    const infos = recordAt(entry.raw, 'infos');
    const requirements = recordAt(entry.raw, 'requirements');
    const prizes = recordAt(entry.raw, 'prizes');
    return [
        ...refs.city(entry, entry.raw.city),
        ...refs.marker(entry, entry.raw.city, infos.markerLocation),
        ...refs.one(entry, 'infos.enemy', infos.enemy, 'enemies'),
        ...refs.list(entry, 'infos.relatedLore', infos.relatedLore, 'lore'),
        ...refs.assets(
            entry,
            'requirements.recommendedLoot',
            requirements.recommendedLoot,
        ),
        ...refs.assets(entry, 'prizes.randomLoot', prizes.randomLoot),
        ...refs.asset(entry, 'prizes.prizeItem', prizes.prizeItem),
        ...refs.one(entry, 'prizes.spell', prizes.spell, 'spells'),
    ];
}

const REF_RULES: Partial<
    Record<
        ContentCollection,
        (refs: RefChecker, entry: IndexedEntry) => ContentIssue[]
    >
> = {
    lore: (refs, entry) => [
        ...refs.list(entry, 'relatedLore', entry.raw.relatedLore, 'lore'),
        ...refs.city(entry, entry.raw.city),
    ],
    enemies: (refs, entry) => [
        ...refs.list(entry, 'relatedLore', entry.raw.relatedLore, 'lore'),
        ...refs.list(entry, 'spells', entry.raw.spells, 'spells'),
    ],
    equipmentitems: (refs, entry) =>
        refs.one(entry, 'addedSpell', entry.raw.addedSpell, 'spells'),
    quests: questRefIssues,
};

function refIssues(index: ContentIndex, tree: ContentTree): ContentIssue[] {
    const refs = new RefChecker(index, tree.world !== null);
    return index.entries.flatMap(
        (entry) => REF_RULES[entry.collection]?.(refs, entry) ?? [],
    );
}

function imageIssues(index: ContentIndex, images: ImagesFile): ContentIssue[] {
    return (Object.keys(images) as (keyof ImagesFile)[]).flatMap((section) =>
        images[section].flatMap((link, position) => {
            const id = stringAt(link as unknown as Raw, 'id');
            if (id === null || index.byCollection[section].has(id)) return [];
            return [
                {
                    file: IMAGES_FILE,
                    line: null,
                    entryId: id,
                    path: `${section}.${position}.id`,
                    message: `immagine per un id che non è in ${section}: ${id}`,
                },
            ];
        }),
    );
}

// ---- lore di città (D-23)

function cityLoreByCity(index: ContentIndex): Map<string, IndexedEntry[]> {
    const byCity = new Map<string, IndexedEntry[]>();
    for (const lore of entriesOf(index, 'lore')) {
        const cityId = stringAt(lore.raw, 'city');
        if (cityId === null) continue;
        byCity.set(cityId, [...(byCity.get(cityId) ?? []), lore]);
    }
    return byCity;
}

function cityLoreErrors(index: ContentIndex): ContentIssue[] {
    return [...cityLoreByCity(index)].flatMap(([cityId, lore]) => {
        const city = index.cities.get(cityId);
        if (!city) return [];
        return lore
            .slice(1)
            .map((extra) =>
                issueAt(
                    extra,
                    'city',
                    `seconda lore per la città ${city.name} (già in ${lore[0].id})`,
                ),
            );
    });
}

function lineOfCity(tree: ContentTree, cityId: string): number | null {
    return (
        tree.worldEntries.find((entry) => entry.raw.id === cityId)?.line ?? null
    );
}

function cityLoreWarnings(
    index: ContentIndex,
    tree: ContentTree,
): ContentIssue[] {
    const byCity = cityLoreByCity(index);
    return [...index.cities.values()]
        .filter((city) => !byCity.has(city.id))
        .map((city) => ({
            file: WORLD_FILE,
            line: lineOfCity(tree, city.id),
            entryId: city.id,
            path: '',
            message: `città senza lore: ${city.name} (${city.type})`,
        }));
}

// ---- regole delle quest fisse (D-17, D-18, D-20, D-21, D-31)

interface QuestFacts {
    entry: IndexedEntry;
    type: string | null;
    city: WorldCity | null;
    marker: string | null;
    infos: Raw;
}

function questFactsOf(index: ContentIndex, entry: IndexedEntry): QuestFacts {
    const infos = recordAt(entry.raw, 'infos');
    const cityId = stringAt(entry.raw, 'city');
    return {
        entry,
        type: stringAt(infos, 'type'),
        city: (cityId && index.cities.get(cityId)) || null,
        marker: stringAt(infos, 'markerLocation'),
        infos,
    };
}

function cityTypeIssues({ entry, type, city }: QuestFacts): ContentIssue[] {
    if (city?.type === CityType.necrorianCity && type !== 'dungeon') {
        return [
            issueAt(entry, 'infos.type', 'a Necrorian solo dungeon (D-17)'),
        ];
    }
    if (city?.type === CityType.ferrionCity && type === 'crime') {
        return [issueAt(entry, 'infos.type', 'mai crime a Ferrion (D-17)')];
    }
    return [];
}

function serviceIssues({
    entry,
    type,
    city,
    marker,
    infos,
}: QuestFacts): ContentIssue[] {
    if (type === null || !SERVICE_QUEST_TYPES.includes(type)) return [];
    const issues: ContentIssue[] = [];
    if (city && marker !== null && marker !== city.markerLocation) {
        issues.push(
            issueAt(
                entry,
                'infos.markerLocation',
                `la quest ${type} sta sul marker della città (D-21)`,
            ),
        );
    }
    if (infos.enemy !== null && infos.enemy !== undefined) {
        issues.push(
            issueAt(
                entry,
                'infos.enemy',
                `la quest ${type} non ha nemico (D-21)`,
            ),
        );
    }
    return issues;
}

function huntPeIssues(
    entry: IndexedEntry,
    enemy: IndexedEntry,
    config: ContentConfig,
): ContentIssue[] {
    const { pe } = enemyFactsOf(enemy.raw, config);
    const max = config.hunt.maxAnimalPe;
    if (pe !== null && pe <= max) return [];
    const message =
        pe === null
            ? `animale senza PE nel source (D-18)`
            : `animale oltre ${max} PE: ${pe} (D-18)`;
    return [issueAt(entry, 'infos.enemy', message)];
}

function enemyIssues(
    index: ContentIndex,
    { entry, type, infos }: QuestFacts,
    config: ContentConfig,
): ContentIssue[] {
    const expected = type ? ENEMY_CATEGORY_OF_QUEST[type] : undefined;
    if (!type || !expected) return [];
    const decision = DECISION_OF_QUEST[type];
    if (infos.enemy === null || infos.enemy === undefined) {
        return [
            issueAt(
                entry,
                'infos.enemy',
                `la ${type} vuole un nemico (${decision})`,
            ),
        ];
    }
    const enemy =
        typeof infos.enemy === 'string'
            ? index.byCollection.enemies.get(infos.enemy)
            : undefined;
    if (!enemy) return [];
    if (enemy.type !== expected) {
        const wanted = expected === 'animal' ? 'un animale' : 'un mostro';
        return [
            issueAt(
                entry,
                'infos.enemy',
                `la ${type} vuole ${wanted}, non ${enemy.type} (${decision})`,
            ),
        ];
    }
    return type === 'hunt' ? huntPeIssues(entry, enemy, config) : [];
}

function poiTypesOf(index: ContentIndex, marker: string | null): string[] {
    const poi = marker ? index.pois.get(marker)?.poi : undefined;
    return Array.isArray(poi?.type) ? poi.type : [];
}

function markerIssues(
    index: ContentIndex,
    { entry, type, city, marker }: QuestFacts,
): ContentIssue[] {
    if (!city || marker === null || !index.pois.has(marker)) return [];
    const path = 'infos.markerLocation';
    const onDungeon = poiTypesOf(index, marker).includes(PoiType.dungeon);
    if (type === 'hunt' && marker === city.markerLocation) {
        return [
            issueAt(
                entry,
                path,
                'la hunt va su un POI della zona, non sul marker della città (D-21)',
            ),
        ];
    }
    if (type === 'hunt' && onDungeon) {
        return [
            issueAt(entry, path, 'la hunt non va su un POI dungeon (D-21)'),
        ];
    }
    if (type === 'dungeon' && !onDungeon) {
        return [
            issueAt(
                entry,
                path,
                'la dungeon va su un POI di tipo dungeon (D-20)',
            ),
        ];
    }
    return [];
}

function huntTitleIssues({ entry, type }: QuestFacts): ContentIssue[] {
    if (type !== 'hunt') return [];
    const minTitle = recordAt(entry.raw, 'requirements').minTitle;
    if (minTitle === 'rookie') return [];
    return [
        issueAt(
            entry,
            'requirements.minTitle',
            'la hunt è sempre rookie (D-18)',
        ),
    ];
}

function fixedSpellIssues({ entry, type }: QuestFacts): ContentIssue[] {
    const spell = recordAt(entry.raw, 'prizes').spell;
    if (spell === null || spell === undefined || type === 'study') return [];
    return [
        issueAt(entry, 'prizes.spell', 'prizes.spell solo su una study (D-31)'),
    ];
}

function spellDrawIssues(quests: readonly QuestFacts[]): ContentIssue[] {
    const drawing = quests.filter(
        ({ entry }) => recordAt(entry.raw, 'prizes').spellDraw === true,
    );
    const misplaced = drawing
        .filter(
            ({ type, city }) =>
                type !== 'study' || city?.name !== SPELL_DRAW_CITY,
        )
        .map(({ entry }) =>
            issueAt(
                entry,
                'prizes.spellDraw',
                `il sorteggio della magia è solo sulla study di ${SPELL_DRAW_CITY} (D-31)`,
            ),
        );
    const repeated = drawing
        .slice(1)
        .map(({ entry }) =>
            issueAt(
                entry,
                'prizes.spellDraw',
                `sorteggio della magia già sulla quest ${drawing[0].entry.id} (D-31)`,
            ),
        );
    return [...misplaced, ...repeated];
}

// le quest di servizio condividono il marker della città; ogni altro POI regge una sola quest fissa (D-21)
function occupancyIssues(
    index: ContentIndex,
    quests: readonly QuestFacts[],
): ContentIssue[] {
    const cityMarkers = new Set(
        [...index.cities.values()].map((city) => city.markerLocation),
    );
    const firstByKey = new Map<string, string>();
    return quests.flatMap(({ entry, type, marker }) => {
        if (marker === null || type === null) return [];
        const onCityMarker = cityMarkers.has(marker);
        const key = onCityMarker ? `${type}@${marker}` : marker;
        const first = firstByKey.get(key);
        if (!first) {
            firstByKey.set(key, entry.id);
            return [];
        }
        const message = onCityMarker
            ? `${type} già presente su questo marker: ${first} (D-21)`
            : `POI già occupato dalla quest ${first} (D-21)`;
        return [issueAt(entry, 'infos.markerLocation', message)];
    });
}

function questRuleIssues(
    index: ContentIndex,
    config: ContentConfig,
): ContentIssue[] {
    const quests = entriesOf(index, 'quests').map((entry) =>
        questFactsOf(index, entry),
    );
    return [
        ...quests.flatMap((quest) => [
            ...cityTypeIssues(quest),
            ...serviceIssues(quest),
            ...enemyIssues(index, quest, config),
            ...markerIssues(index, quest),
            ...huntTitleIssues(quest),
            ...fixedSpellIssues(quest),
        ]),
        ...spellDrawIssues(quests),
        ...occupancyIssues(index, quests),
    ];
}

export function checkContent(tree: ContentTree): ContentCheck {
    const errors = schemaIssues(tree);
    if (!tree.config) return { errors, warnings: [] };
    const index = indexContent(tree);
    return {
        errors: [
            ...errors,
            ...duplicateIssues(index),
            ...refIssues(index, tree),
            ...imageIssues(index, tree.images),
            ...cityLoreErrors(index),
            ...questRuleIssues(index, tree.config),
        ],
        warnings: [...nameWarnings(index), ...cityLoreWarnings(index, tree)],
    };
}
