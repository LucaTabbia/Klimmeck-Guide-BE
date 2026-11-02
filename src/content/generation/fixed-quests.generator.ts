import { ContentIndex } from 'src/content/checking/content-index';
import { WorldCity, WorldPoi } from 'src/content/loading/content-tree';
import { IndexedEntry } from 'src/content/checking/content-index';
import {
    citySizeOf,
    COLLEGE_CITY,
    DUNGEON_QUEST_FILE,
    dungeonSizeKeyOf,
    HERO_DUNGEON_CITY_TYPES,
    NO_CRIME_CITY_TYPES,
    NO_SERVICE_CITY_TYPES,
    questFileOf,
    regionalGroupOf,
    SPELL_STUDY_CITY,
    INN_CITY_TYPE,
} from 'src/content/generation/city-profile';
import { QUEST_DESCRIPTIONS } from 'src/content/generation/quest-descriptions';
import type {
    DescriptionKind,
    DescriptionNames,
} from 'src/content/generation/quest-descriptions';
import { QUEST_TITLES } from 'src/content/generation/quest-titles';
import {
    keyedChance,
    SeededChanceSource,
} from 'src/content/generation/seeded-chance';
import {
    ContentConfig,
    ContentTier,
    FixedQuestType,
    RANKED_TIERS,
    RankedTier,
} from 'src/content/rules/content-config';
import { enemyFactsOf } from 'src/content/rules/enemy-facts';
import { rarityRankOf } from 'src/content/rules/quest-prizes';

/*
 * Generatore puro delle quest fisse (D-17..D-22, D-31): niente DB, file né orologio.
 * Ordine dei sorteggi, fisso perché stesso input + stesso seme = stesse voci (T-11-31):
 * 1. città ordinate per id: per ogni città di taglia «city» il tiro del crime (non a Ferrion),
 *    poi il tiro della study;
 * 2. gruppi regionali ordinati per nome: shuffle delle città candidate alla hunt, poi per
 *    ciascuna scelta pick dell'animale e pick del POI (candidati ordinati per id);
 * 3. POI dungeon ordinati per id: pick del mostro, pick del loot casuale;
 * 4. descrizioni dal flusso `keyedChance` della chiave, fuori dalla sequenza (D-32).
 * Gli id si riusano per chiave `type|markerLocation[|spellDraw]` (D-01): rigenerare non crea orfani.
 */

type Raw = Record<string, unknown>;

export interface GeneratorInput {
    index: ContentIndex;
    config: ContentConfig;
    existingQuests: readonly Raw[];
    newId: () => string;
}

export interface GeneratedQuest {
    file: string;
    entry: Raw;
}

export interface SkippedQuest {
    city: string;
    poi: string | null;
    type: string;
    reason: string;
}

export interface GeneratorResult {
    quests: GeneratedQuest[];
    skipped: SkippedQuest[];
}

export const CITY_WITHOUT_LORE = 'città senza lore';

export const DUNGEON_WITHOUT_MONSTER = 'nessun mostro compatibile';

const RECOMMENDED_EQUIPMENT = 2;

const RECOMMENDED_HUNT_EQUIPMENT = 1;

const RECOMMENDED_EXPLORATION = 2;

type ServiceType = 'heal' | 'job' | 'guard' | 'crime' | 'study';

interface AssetRef {
    itemType: 'EquipmentItem' | 'LootItem';
    item: string;
    quantity: number;
}

interface QuestDraft {
    file: string;
    city: string;
    type: FixedQuestType;
    title: string;
    description: string;
    enemy: string | null;
    markerLocation: string;
    relatedLore: string[];
    minTitle: ContentTier;
    recommendedLoot: AssetRef[];
    randomLoot: AssetRef[];
    spellDraw: boolean;
}

interface GeneratorWorld {
    index: ContentIndex;
    config: ContentConfig;
    chance: SeededChanceSource;
    cities: WorldCity[];
    cityLore: Map<string, string>;
    enemies: IndexedEntry[];
    skipped: SkippedQuest[];
}

const EVERYWHERE = 'all';

const DUNGEON_POI = 'dungeon';

function byId<T extends { id: string }>(a: T, b: T): number {
    if (a.id === b.id) return 0;
    return a.id < b.id ? -1 : 1;
}

// la prima lore `city` di ogni città, nell'ordine dei file
function cityLoreOf(index: ContentIndex): Map<string, string> {
    const cityLore = new Map<string, string>();
    for (const lore of index.byCollection.lore.values()) {
        const city = lore.raw.city;
        if (
            lore.type === 'city' &&
            typeof city === 'string' &&
            !cityLore.has(city)
        ) {
            cityLore.set(city, lore.id);
        }
    }
    return cityLore;
}

function worldOf(input: GeneratorInput): GeneratorWorld {
    const cities = [...input.index.cities.values()].sort(byId);
    const cityLore = cityLoreOf(input.index);
    const skipped = cities
        .filter((city) => !cityLore.has(city.id))
        .map((city) => ({
            city: city.id,
            poi: null,
            type: '*',
            reason: CITY_WITHOUT_LORE,
        }));
    return {
        index: input.index,
        config: input.config,
        chance: new SeededChanceSource(input.config.generator.seed),
        cities,
        cityLore,
        enemies: [...input.index.byCollection.enemies.values()].sort(byId),
        skipped,
    };
}

function cityLoreIds(world: GeneratorWorld, city: WorldCity): string[] {
    const lore = world.cityLore.get(city.id);
    return lore ? [lore] : [];
}

function isServed(city: WorldCity): boolean {
    return !NO_SERVICE_CITY_TYPES.includes(city.type);
}

function serviceMinTitle(world: GeneratorWorld, city: WorldCity): ContentTier {
    return citySizeOf(city.type) === 'capital'
        ? world.config.minTitle.serviceCapital
        : world.config.minTitle.serviceCity;
}

function questKey(
    type: unknown,
    markerLocation: unknown,
    spellDraw: boolean,
): string {
    const key = `${String(type)}|${String(markerLocation)}`;
    return spellDraw ? `${key}|spellDraw` : key;
}

// variante legata alla chiave della quest: non consuma il flusso principale (D-32)
function descriptionOf(
    world: GeneratorWorld,
    kind: DescriptionKind,
    key: string,
    names: DescriptionNames,
): string {
    const notice = keyedChance(
        world.config.generator.seed,
        `${key}|description`,
    ).pick(QUEST_DESCRIPTIONS[kind]);
    return notice ? notice(names) : '';
}

function serviceDraft(
    world: GeneratorWorld,
    city: WorldCity,
    type: ServiceType,
    minTitle: ContentTier,
): QuestDraft {
    const kind =
        type === 'job' && city.type === INN_CITY_TYPE ? 'innJob' : type;
    return {
        file: questFileOf(city.type),
        city: city.id,
        type,
        title: QUEST_TITLES[kind](city.name),
        description: descriptionOf(
            world,
            kind,
            questKey(type, city.markerLocation, false),
            { city: city.name, enemy: '' },
        ),
        enemy: null,
        markerLocation: city.markerLocation,
        relatedLore: cityLoreIds(world, city),
        minTitle,
        recommendedLoot: [],
        randomLoot: [],
        spellDraw: false,
    };
}

function spellStudyDraft(world: GeneratorWorld, city: WorldCity): QuestDraft {
    return {
        ...serviceDraft(world, city, 'study', serviceMinTitle(world, city)),
        title: QUEST_TITLES.spellStudy(city.name),
        description: descriptionOf(
            world,
            'spellStudy',
            questKey('study', city.markerLocation, true),
            { city: city.name, enemy: '' },
        ),
        spellDraw: true,
    };
}

// i tiri avvengono solo nelle città di taglia «city», sempre nello stesso ordine: crime poi study
function drawnServices(world: GeneratorWorld, city: WorldCity) {
    const { chance, config } = world;
    const scale = citySizeOf(city.type);
    const isTown = scale === 'city';
    const crimeAllowed = !NO_CRIME_CITY_TYPES.includes(city.type);
    const crimeRoll =
        isTown && crimeAllowed
            ? chance.next() < config.generator.crimeCityChance
            : false;
    const fixedStudy =
        scale === 'capital' ||
        city.name === COLLEGE_CITY ||
        city.name === SPELL_STUDY_CITY;
    const studyRoll =
        isTown && !fixedStudy
            ? chance.next() < config.generator.studyCityChance
            : false;
    return {
        guard: scale !== 'village',
        crime: crimeAllowed && (scale === 'capital' || crimeRoll),
        study: fixedStudy || studyRoll,
    };
}

function serviceDraftsOf(world: GeneratorWorld, city: WorldCity): QuestDraft[] {
    const drawn = drawnServices(world, city);
    const minTitle = serviceMinTitle(world, city);
    const drafts = [
        serviceDraft(world, city, 'heal', 'rookie'),
        serviceDraft(world, city, 'job', 'rookie'),
    ];
    if (drawn.guard) drafts.push(serviceDraft(world, city, 'guard', minTitle));
    if (drawn.crime) drafts.push(serviceDraft(world, city, 'crime', minTitle));
    if (city.name === SPELL_STUDY_CITY) {
        drafts.push(spellStudyDraft(world, city));
    } else if (drawn.study) {
        drafts.push(serviceDraft(world, city, 'study', minTitle));
    }
    return drafts;
}

// heal e job ovunque tranne Necrorian, che ha solo la sua dungeon (D-17)
function serviceDrafts(world: GeneratorWorld): QuestDraft[] {
    return world.cities
        .filter(isServed)
        .flatMap((city) => serviceDraftsOf(world, city));
}

function locationsOf(enemy: IndexedEntry): string[] {
    const locations = enemy.raw.locations;
    return Array.isArray(locations) ? (locations as string[]) : [];
}

function livesIn(enemy: IndexedEntry, poi: WorldPoi): boolean {
    const locations = locationsOf(enemy);
    return (
        locations.includes(EVERYWHERE) ||
        poi.type.some((type) => locations.includes(type))
    );
}

function enemyLoreOf(enemy: IndexedEntry): string[] {
    const lore = enemy.raw.relatedLore;
    return Array.isArray(lore) ? (lore as string[]) : [];
}

function withoutDuplicates(ids: readonly string[]): string[] {
    return [...new Set(ids)];
}

// solo animali facili: la hunt è l'uscita alla portata di un rookie (D-18)
function easyAnimalsOf(world: GeneratorWorld): IndexedEntry[] {
    const maxPe = world.config.hunt.maxAnimalPe;
    return world.enemies.filter((enemy) => {
        if (enemy.raw.category !== 'animal') return false;
        const { pe } = enemyFactsOf(enemy.raw, world.config);
        return pe !== null && pe <= maxPe;
    });
}

// il marker resta alle quest di servizio, i POI dungeon alle dungeon (D-21)
function huntPoisOf(
    city: WorldCity,
    animals: readonly IndexedEntry[],
): WorldPoi[] {
    return city.pointsOfInterest
        .filter(
            (poi) =>
                poi.id !== city.markerLocation &&
                !poi.type.includes(DUNGEON_POI) &&
                animals.some((animal) => livesIn(animal, poi)),
        )
        .sort(byId);
}

function huntDraft(
    world: GeneratorWorld,
    city: WorldCity,
    animals: readonly IndexedEntry[],
): QuestDraft | null {
    const pois = huntPoisOf(city, animals);
    const animal = world.chance.pick(
        animals.filter((candidate) =>
            pois.some((poi) => livesIn(candidate, poi)),
        ),
    );
    if (!animal) return null;
    const poi = world.chance.pick(pois.filter((poi) => livesIn(animal, poi)));
    if (!poi) return null;
    const key = questKey('hunt', poi.id, false);
    return {
        file: questFileOf(city.type),
        city: city.id,
        type: 'hunt',
        title: QUEST_TITLES.hunt(city.name, animal.name ?? ''),
        description: descriptionOf(world, 'hunt', key, {
            city: city.name,
            enemy: animal.name ?? '',
        }),
        enemy: animal.id,
        markerLocation: poi.id,
        relatedLore: withoutDuplicates([
            ...cityLoreIds(world, city),
            ...enemyLoreOf(animal),
        ]),
        minTitle: 'rookie',
        recommendedLoot: huntRecommendedLoot(world, animal),
        randomLoot: [],
        spellDraw: false,
    };
}

function regionalGroupsOf(
    cities: readonly WorldCity[],
): [string, WorldCity[]][] {
    const groups = new Map<string, WorldCity[]>();
    for (const city of cities) {
        const group = regionalGroupOf(city.type);
        groups.set(group, [...(groups.get(group) ?? []), city]);
    }
    return [...groups.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
}

// al più una città su due per gruppo regionale riceve la hunt, Necrorian esclusa (D-17)
function huntDrafts(world: GeneratorWorld): QuestDraft[] {
    const animals = easyAnimalsOf(world);
    const share = world.config.hunt.maxShareOfRegion;
    const drafts: QuestDraft[] = [];
    for (const [, cities] of regionalGroupsOf(world.cities.filter(isServed))) {
        const limit = Math.floor(cities.length * share);
        const candidates = cities.filter(
            (city) => huntPoisOf(city, animals).length > 0,
        );
        const chosen = world.chance.shuffle(candidates).slice(0, limit);
        for (const city of chosen) {
            const draft = huntDraft(world, city, animals);
            if (draft) drafts.push(draft);
        }
    }
    return drafts.sort((a, b) => (a.city < b.city ? -1 : 1));
}

interface Monster {
    enemy: IndexedEntry;
    band: RankedTier;
}

// RANKED_TIERS è già in ordine crescente come TITLE_RANK (rookie < adventurer < … < hero)
function bandRank(band: RankedTier): number {
    return RANKED_TIERS.indexOf(band);
}

function isRankedTier(tier: ContentTier | null): tier is RankedTier {
    return (RANKED_TIERS as readonly (string | null)[]).includes(tier);
}

// solo mostri con una fascia: niente animali, umanoidi o leggendari nelle dungeon (D-20)
function monstersOf(world: GeneratorWorld): Monster[] {
    return world.enemies.flatMap((enemy) => {
        if (enemy.raw.category !== 'monster') return [];
        const { tier } = enemyFactsOf(enemy.raw, world.config);
        return isRankedTier(tier) ? [{ enemy, band: tier }] : [];
    });
}

function dungeonBandOf(
    world: GeneratorWorld,
    city: WorldCity,
    poi: WorldPoi,
): RankedTier {
    const heroZone = poi.type.some((type) =>
        world.config.dungeonHeroZones.includes(type),
    );
    if (heroZone || HERO_DUNGEON_CITY_TYPES.includes(city.type)) return 'hero';
    const tier =
        world.config.dungeonTierByCitySize[dungeonSizeKeyOf(city.type)];
    return isRankedTier(tier) ? tier : 'hero';
}

function livesInZone(enemy: IndexedEntry, poi: WorldPoi): boolean {
    const locations = locationsOf(enemy);
    return poi.type.some(
        (type) => type !== DUNGEON_POI && locations.includes(type),
    );
}

// fallback documentati: mostro della zona, poi uno che vive ovunque, poi la fascia inferiore
function monsterCandidates(
    monsters: readonly Monster[],
    poi: WorldPoi,
    band: RankedTier,
): Monster[] {
    for (let rank = bandRank(band); rank >= 0; rank -= 1) {
        const ofBand = monsters.filter(
            (monster) => monster.band === RANKED_TIERS[rank],
        );
        const inZone = ofBand.filter((monster) =>
            livesInZone(monster.enemy, poi),
        );
        if (inZone.length > 0) return inZone;
        const everywhere = ofBand.filter((monster) =>
            locationsOf(monster.enemy).includes(EVERYWHERE),
        );
        if (everywhere.length > 0) return everywhere;
    }
    return [];
}

function bandRarityRank(world: GeneratorWorld, band: RankedTier): number {
    return rarityRankOf(world.config.dungeonLootRarity[band]) ?? 0;
}

function assetRef(
    itemType: AssetRef['itemType'],
    item: IndexedEntry,
    quantity = 1,
): AssetRef {
    return { itemType, item: item.id, quantity };
}

function equipmentOf(world: GeneratorWorld): IndexedEntry[] {
    return [...world.index.byCollection.equipmentitems.values()].sort(byId);
}

// rarità della fascia; senza oggetti di quella rarità, la rarità inferiore più vicina (D-19)
function randomLootOf(world: GeneratorWorld, band: RankedTier): AssetRef[] {
    const equipment = equipmentOf(world);
    const quantity = world.config.prizes.dungeon.randomLootQuantity ?? 1;
    for (let rank = bandRarityRank(world, band); rank >= 0; rank -= 1) {
        const item = world.chance.pick(
            equipment.filter(
                (entry) => rarityRankOf(entry.raw.rarity) === rank,
            ),
        );
        if (item) return [assetRef('EquipmentItem', item, quantity)];
    }
    return [];
}

function weaknessesOf(enemy: IndexedEntry): string[] {
    const { baseWeaknesses, energyWeaknesses } = enemy.raw;
    return [
        ...(Array.isArray(baseWeaknesses) ? (baseWeaknesses as string[]) : []),
        ...(Array.isArray(energyWeaknesses)
            ? (energyWeaknesses as string[])
            : []),
    ];
}

interface Damage {
    type: string;
    power: number;
}

function damagesOf(item: IndexedEntry): Damage[] {
    const damages = item.raw.damages as
        | { base?: Damage[]; energy?: Damage[] }
        | undefined;
    return [...(damages?.base ?? []), ...(damages?.energy ?? [])];
}

function usefulPower(
    item: IndexedEntry,
    weaknesses: readonly string[],
): number {
    return damagesOf(item)
        .filter((damage) => weaknesses.includes(damage.type))
        .reduce((total, damage) => total + damage.power, 0);
}

function withinRarity(item: IndexedEntry, maxRank: number): boolean {
    const rank = rarityRankOf(item.raw.rarity);
    return rank !== null && rank <= maxRank;
}

function weaponsAgainst(
    world: GeneratorWorld,
    enemy: IndexedEntry,
    maxRank: number,
    limit: number,
): AssetRef[] {
    const weaknesses = weaknessesOf(enemy);
    return weaponsOf(world)
        .filter((item) => withinRarity(item, maxRank))
        .map((item) => ({ item, power: usefulPower(item, weaknesses) }))
        .filter(({ power }) => power > 0)
        .sort((a, b) => b.power - a.power || byId(a.item, b.item))
        .slice(0, limit)
        .map(({ item }) => assetRef('EquipmentItem', item));
}

function powerOf(item: IndexedEntry): number {
    return typeof item.raw.power === 'number' ? item.raw.power : 0;
}

// ripiego delle hunt: l'arma entro il tetto con più danni in totale, pari merito per id
// i damages di un equipaggiamento non-arma indicano la protezione, non l'attacco (utente, D-33)
function weaponsOf(world: GeneratorWorld): IndexedEntry[] {
    return equipmentOf(world).filter((item) => item.raw.equipType === 'weapon');
}

function bestLootOf(
    world: GeneratorWorld,
    effect: 'heal' | 'hunger',
    maxRank: number,
): AssetRef[] {
    const [best] = [...world.index.byCollection.lootitems.values()]
        .filter(
            (item) => item.raw.effect === effect && withinRarity(item, maxRank),
        )
        .sort((a, b) => powerOf(b) - powerOf(a) || byId(a, b));
    return best ? [assetRef('LootItem', best)] : [];
}

function explorationGearOf(
    world: GeneratorWorld,
    key: string,
    maxRank: number,
): AssetRef[] {
    const gear = [...world.index.byCollection.lootitems.values()]
        .filter(
            (item) =>
                item.raw.effect === 'exploration' &&
                withinRarity(item, maxRank),
        )
        .sort(byId);
    return keyedChance(world.config.generator.seed, `${key}|exploration`)
        .shuffle(gear)
        .slice(0, RECOMMENDED_EXPLORATION)
        .map((item) => assetRef('LootItem', item));
}

// D-33: oggetti consigliati per la missione, entro la rarità della fascia del minTitle; i consumabili contro i punti di forza del nemico non hanno dati strutturati e restano fuori
function dungeonRecommendedLoot(
    world: GeneratorWorld,
    picked: Monster,
    key: string,
): AssetRef[] {
    const maxRank = bandRarityRank(world, picked.band);
    return [
        ...weaponsAgainst(world, picked.enemy, maxRank, RECOMMENDED_EQUIPMENT),
        ...bestLootOf(world, 'heal', maxRank),
        ...bestLootOf(world, 'hunger', maxRank),
        ...explorationGearOf(world, key, maxRank),
    ];
}

function huntWeaponOf(
    world: GeneratorWorld,
    animal: IndexedEntry,
    maxRank: number,
): AssetRef[] {
    return weaponsAgainst(world, animal, maxRank, RECOMMENDED_HUNT_EQUIPMENT);
}

function huntRecommendedLoot(
    world: GeneratorWorld,
    animal: IndexedEntry,
): AssetRef[] {
    const maxRank = bandRarityRank(world, 'rookie');
    return [
        ...huntWeaponOf(world, animal, maxRank),
        ...bestLootOf(world, 'heal', maxRank),
    ];
}

function dungeonPoisOf(world: GeneratorWorld): [WorldCity, WorldPoi][] {
    return [...world.index.pois.values()]
        .filter(({ poi }) => poi.type.includes(DUNGEON_POI))
        .sort((a, b) => byId(a.poi, b.poi))
        .flatMap(({ poi, cityId }) => {
            const city = world.index.cities.get(cityId);
            return city ? [[city, poi] as [WorldCity, WorldPoi]] : [];
        });
}

function dungeonDraft(
    world: GeneratorWorld,
    monsters: readonly Monster[],
    city: WorldCity,
    poi: WorldPoi,
): QuestDraft | null {
    const band = dungeonBandOf(world, city, poi);
    const picked = world.chance.pick(monsterCandidates(monsters, poi, band));
    if (!picked) return null;
    const randomLoot = randomLootOf(world, picked.band);
    const key = questKey('dungeon', poi.id, false);
    return {
        file: DUNGEON_QUEST_FILE,
        city: city.id,
        type: 'dungeon',
        title: QUEST_TITLES.dungeon(city.name, picked.enemy.name ?? ''),
        description: descriptionOf(world, 'dungeon', key, {
            city: city.name,
            enemy: picked.enemy.name ?? '',
        }),
        enemy: picked.enemy.id,
        markerLocation: poi.id,
        relatedLore: withoutDuplicates([
            ...cityLoreIds(world, city),
            ...enemyLoreOf(picked.enemy),
        ]),
        minTitle: picked.band,
        recommendedLoot: dungeonRecommendedLoot(world, picked, key),
        randomLoot,
        spellDraw: false,
    };
}

// una dungeon per ogni POI dungeon, Necrorian compresa (D-20)
function dungeonDrafts(world: GeneratorWorld): QuestDraft[] {
    const monsters = monstersOf(world);
    const drafts: QuestDraft[] = [];
    for (const [city, poi] of dungeonPoisOf(world)) {
        const draft = dungeonDraft(world, monsters, city, poi);
        if (draft) {
            drafts.push(draft);
        } else {
            world.skipped.push({
                city: city.id,
                poi: poi.id,
                type: 'dungeon',
                reason: DUNGEON_WITHOUT_MONSTER,
            });
        }
    }
    return drafts;
}

function sectionOf(raw: Raw, key: string): Raw {
    const section = raw[key];
    return typeof section === 'object' && section !== null
        ? (section as Raw)
        : {};
}

function existingIdsOf(quests: readonly Raw[]): Map<string, string> {
    const ids = new Map<string, string>();
    for (const quest of quests) {
        const infos = sectionOf(quest, 'infos');
        const key = questKey(
            infos.type,
            infos.markerLocation,
            sectionOf(quest, 'prizes').spellDraw === true,
        );
        if (typeof quest.id === 'string' && !ids.has(key)) {
            ids.set(key, quest.id);
        }
    }
    return ids;
}

function entryOf(draft: QuestDraft, id: string): Raw {
    const prizes: Raw = { randomLoot: draft.randomLoot };
    if (draft.spellDraw) prizes.spellDraw = true;
    return {
        id,
        city: draft.city,
        infos: {
            title: draft.title,
            description: draft.description,
            type: draft.type,
            enemy: draft.enemy,
            markerLocation: draft.markerLocation,
            relatedLore: draft.relatedLore,
        },
        requirements: {
            minTitle: draft.minTitle,
            recommendedLoot: draft.recommendedLoot,
        },
        prizes,
    };
}

export function generateFixedQuests(input: GeneratorInput): GeneratorResult {
    const world = worldOf(input);
    const drafts = [
        ...serviceDrafts(world),
        ...huntDrafts(world),
        ...dungeonDrafts(world),
    ];
    const existingIds = existingIdsOf(input.existingQuests);
    return {
        quests: drafts.map((draft) => {
            const key = questKey(
                draft.type,
                draft.markerLocation,
                draft.spellDraw,
            );
            const id = existingIds.get(key) ?? input.newId();
            return { file: draft.file, entry: entryOf(draft, id) };
        }),
        skipped: world.skipped,
    };
}
