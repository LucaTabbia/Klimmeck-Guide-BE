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
import { SPELL_DRAW_CITY_TYPE } from 'src/content/generation/city-profile';
import { LoadedEntry } from 'src/content/loading/yaml-file';
import {
    ContentConfig,
    RANKED_TIERS,
    RankedTier,
} from 'src/content/rules/content-config';
import { enemyFactsOf } from 'src/content/rules/enemy-facts';
import { rarityRankOf } from 'src/content/rules/quest-prizes';
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
// l'id della voce fa parte della chiave: due voci in stile flow sulla stessa riga restano due errori

function issueKeyOf(issue: ContentIssue): string {
    return [issue.file, issue.line ?? '', issue.entryId ?? '', issue.path].join(
        '\u0000',
    );
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

function descriptionIssues({ entry, infos }: QuestFacts): ContentIssue[] {
    if (stringAt(infos, 'description') !== null) return [];
    return [
        issueAt(
            entry,
            'infos.description',
            "la quest fissa vuole l'annuncio in infos.description (D-32)",
        ),
    ];
}

function isRankedTier(value: unknown): value is RankedTier {
    return (RANKED_TIERS as readonly unknown[]).includes(value);
}

function itemOf(index: ContentIndex, asset: unknown): IndexedEntry | null {
    if (!isRecord(asset)) return null;
    const itemType = stringAt(asset, 'itemType');
    const item = stringAt(asset, 'item');
    const collection = itemType ? COLLECTION_OF_ITEM_TYPE[itemType] : null;
    if (!collection || !item) return null;
    return index.byCollection[collection].get(item) ?? null;
}

// D-33: gli oggetti consigliati restano entro la rarità della fascia del minTitle
function lootRarityIssues(
    index: ContentIndex,
    { entry }: QuestFacts,
    config: ContentConfig,
): ContentIssue[] {
    const requirements = recordAt(entry.raw, 'requirements');
    const { minTitle, recommendedLoot } = requirements;
    if (!isRankedTier(minTitle) || !Array.isArray(recommendedLoot)) return [];
    const ceiling = config.dungeonLootRarity[minTitle];
    const maxRank = rarityRankOf(ceiling) ?? 0;
    return recommendedLoot.flatMap((asset: unknown, position) => {
        const item = itemOf(index, asset);
        const rarity = item?.raw.rarity;
        const rank = rarityRankOf(rarity);
        if (!item || rank === null || rank <= maxRank) return [];
        return [
            issueAt(
                entry,
                `requirements.recommendedLoot.${position}.item`,
                `${item.name ?? item.id} è ${String(rarity)}: oltre la rarità ${ceiling} di ${minTitle} (D-33)`,
            ),
        ];
    });
}

// D-17/D-31 rivisti: le study fuori da Valantar non danno magie, quella di Valantar la sorteggia
function fixedSpellIssues({ entry }: QuestFacts): ContentIssue[] {
    const spell = recordAt(entry.raw, 'prizes').spell;
    if (spell === null || spell === undefined) return [];
    return [
        issueAt(
            entry,
            'prizes.spell',
            'nessuna quest fissa porta una magia fissa: la study di Valantar la sorteggia (D-17, D-31)',
        ),
    ];
}

function drawsSpell({ entry }: QuestFacts): boolean {
    return recordAt(entry.raw, 'prizes').spellDraw === true;
}

function isSpellDrawStudy({ type, city }: QuestFacts): boolean {
    return type === 'study' && city?.type === SPELL_DRAW_CITY_TYPE;
}

function spellDrawIssues(quests: readonly QuestFacts[]): ContentIssue[] {
    const drawing = quests.filter(drawsSpell);
    const misplaced = drawing
        .filter((quest) => !isSpellDrawStudy(quest))
        .map(({ entry }) =>
            issueAt(
                entry,
                'prizes.spellDraw',
                `il sorteggio della magia è solo sulla study della città ${SPELL_DRAW_CITY_TYPE} (D-31)`,
            ),
        );
    const missing = quests
        .filter((quest) => isSpellDrawStudy(quest) && !drawsSpell(quest))
        .map(({ entry }) =>
            issueAt(
                entry,
                'prizes.spellDraw',
                `la study della città ${SPELL_DRAW_CITY_TYPE} sorteggia la magia: serve spellDraw: true (D-31)`,
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
    return [...misplaced, ...missing, ...repeated];
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
            ...descriptionIssues(quest),
            ...lootRarityIssues(index, quest, config),
            ...fixedSpellIssues(quest),
        ]),
        ...spellDrawIssues(quests),
        ...occupancyIssues(index, quests),
    ];
}

// una quest dei file cancellata dalla stessa corsa che la inserisce non converge mai
function deletedFileQuestIssues(
    index: ContentIndex,
    fixes: readonly LoadedEntry[],
): ContentIssue[] {
    const fileQuests = new Set(
        entriesOf(index, 'quests').map((entry) => entry.id),
    );
    return fixes
        .filter((fix) => fix.raw.kind === 'deleteQuests')
        .flatMap((fix) => {
            const ids: unknown[] = Array.isArray(fix.raw.ids)
                ? fix.raw.ids
                : [];
            return ids
                .filter((id): id is string => typeof id === 'string')
                .filter((id) => fileQuests.has(id))
                .map((id) => ({
                    file: fix.file,
                    line: fix.line,
                    entryId: stringAt(fix.raw, 'key'),
                    path: 'ids',
                    message: `la quest ${id} è nei file quests/: una fix deleteQuests non può cancellarla`,
                }));
        });
}

export function checkContent(tree: ContentTree): ContentCheck {
    const errors = schemaIssues(tree);
    if (!tree.config) return { errors, warnings: tree.warnings };
    const index = indexContent(tree);
    return {
        errors: [
            ...errors,
            ...duplicateIssues(index),
            ...refIssues(index, tree),
            ...imageIssues(index, tree.images),
            ...cityLoreErrors(index),
            ...questRuleIssues(index, tree.config),
            ...deletedFileQuestIssues(index, tree.fixes),
        ],
        warnings: [
            ...tree.warnings,
            ...nameWarnings(index),
            ...cityLoreWarnings(index, tree),
        ],
    };
}
