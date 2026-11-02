import { ContentIndex } from 'src/content/checking/content-index';
import { WorldCity } from 'src/content/loading/content-tree';
import {
    citySizeOf,
    COLLEGE_CITY,
    NO_CRIME_CITY_TYPES,
    NO_SERVICE_CITY_TYPES,
    questFileOf,
    SPELL_STUDY_CITY,
} from 'src/content/generation/city-profile';
import { QUEST_TITLES } from 'src/content/generation/quest-titles';
import { SeededChanceSource } from 'src/content/generation/seeded-chance';
import {
    ContentConfig,
    ContentTier,
    FixedQuestType,
} from 'src/content/rules/content-config';

/*
 * Generatore puro delle quest fisse (D-17..D-22, D-31): niente DB, file né orologio.
 * Ordine dei sorteggi, fisso perché stesso input + stesso seme = stesse voci (T-11-31):
 * 1. città ordinate per id: per ogni città di taglia «city» il tiro del crime (non a Ferrion),
 *    poi il tiro della study;
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
    skipped: SkippedQuest[];
}

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

function serviceDraft(
    world: GeneratorWorld,
    city: WorldCity,
    type: ServiceType,
    minTitle: ContentTier,
): QuestDraft {
    return {
        file: questFileOf(city.type),
        city: city.id,
        type,
        title: QUEST_TITLES[type](city.name),
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

function entryOf(draft: QuestDraft, id: string): Raw {
    const prizes: Raw = { randomLoot: draft.randomLoot };
    if (draft.spellDraw) prizes.spellDraw = true;
    return {
        id,
        city: draft.city,
        infos: {
            title: draft.title,
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
    const drafts = serviceDrafts(world);
    return {
        quests: drafts.map((draft) => ({
            file: draft.file,
            entry: entryOf(draft, input.newId()),
        })),
        skipped: world.skipped,
    };
}
