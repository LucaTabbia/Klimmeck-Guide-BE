import { ContentIssue } from 'src/content/content-issue';
import { MAX_GRAPHQL_INT } from 'src/content/schema/common.content';
import { PoiType } from 'src/models/enums/poi-type.enum';
import { RarityType } from 'src/models/enums/rarity-type.enum';
import { TitleType } from 'src/models/enums/title-type.enum';

export type ContentTier = `${TitleType}`;

export type RankedTier = Exclude<ContentTier, 'legend'>;

export const FIXED_QUEST_TYPES = [
    'hunt',
    'dungeon',
    'heal',
    'job',
    'study',
    'crime',
    'guard',
] as const;

export type FixedQuestType = (typeof FIXED_QUEST_TYPES)[number];

// ordine crescente delle fasce: le tiers del config devono coprire i livelli 1..20 in quest'ordine
export const RANKED_TIERS: readonly RankedTier[] = [
    'rookie',
    'adventurer',
    'paladin',
    'mage',
    'hero',
];

export const MAX_DOCUMENT_LEVEL = 20;

export const MS_PER_HOUR = 3_600_000;

// Quest.infos.timeToComplete è un Int GraphQL in millisecondi: oltre ~596 ore non si serializza
const MAX_QUEST_HOURS = Math.floor(MAX_GRAPHQL_INT / MS_PER_HOUR);

export const CITY_SIZES = ['Village', 'City', 'SeaCity', 'Capital'] as const;

export type CitySize = (typeof CITY_SIZES)[number];

export interface QuestPrizeBase {
    copper: number;
    xp: number;
    randomLootQuantity?: number;
}

export interface ContentConfig {
    enemy: { xpScale: number; hpScale: number; damageScale: number };
    tiers: Record<RankedTier, [number, number]>;
    mediumPeByLevel: number[];
    tierMultiplier: Record<RankedTier, number>;
    prizes: Record<FixedQuestType, QuestPrizeBase>;
    dungeonLootRarity: Record<RankedTier, string>;
    timeToCompleteHours: Record<FixedQuestType, number>;
    minTitle: { serviceCity: RankedTier; serviceCapital: RankedTier };
    dungeonTierByCitySize: Record<CitySize, RankedTier>;
    dungeonHeroZones: string[];
    hunt: { maxAnimalPe: number; maxShareOfRegion: number };
    generator: {
        seed: number;
        crimeCityChance: number;
        studyCityChance: number;
    };
    food: { minutesPerPower: number };
}

export interface ParsedContentConfig {
    config: ContentConfig | null;
    issues: ContentIssue[];
}

type Check = (value: unknown) => string | null;

const CONFIG_KEYS: readonly (keyof ContentConfig)[] = [
    'enemy',
    'tiers',
    'mediumPeByLevel',
    'tierMultiplier',
    'prizes',
    'dungeonLootRarity',
    'timeToCompleteHours',
    'minTitle',
    'dungeonTierByCitySize',
    'dungeonHeroZones',
    'hunt',
    'generator',
    'food',
];

const HUNT_KEYS: readonly string[] = ['maxAnimalPe', 'maxShareOfRegion'];

const GENERATOR_KEYS: readonly string[] = [
    'seed',
    'crimeCityChance',
    'studyCityChance',
];

const RARITIES: readonly string[] = Object.values(RarityType);
const POI_TYPES: readonly string[] = Object.values(PoiType);

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
}

const positive: Check = (value) =>
    isFiniteNumber(value) && value > 0 ? null : 'deve essere un numero > 0';

const nonNegativeInteger: Check = (value) =>
    Number.isSafeInteger(value) && (value as number) >= 0
        ? null
        : 'deve essere un intero ≥ 0';

const positiveInteger: Check = (value) =>
    Number.isSafeInteger(value) && (value as number) > 0
        ? null
        : 'deve essere un intero > 0';

const questHours: Check = (value) =>
    isFiniteNumber(value) && value > 0 && value <= MAX_QUEST_HOURS
        ? null
        : `deve essere un numero di ore > 0 e ≤ ${MAX_QUEST_HOURS}`;

const chance: Check = (value) =>
    isFiniteNumber(value) && value >= 0 && value <= 1
        ? null
        : 'deve essere una probabilità fra 0 e 1';

const oneOf =
    (allowed: readonly string[], what: string): Check =>
    (value) =>
        typeof value === 'string' && allowed.includes(value)
            ? null
            : `${what} sconosciuta: «${String(value)}» (ammesse: ${allowed.join(', ')})`;

// legend non ha premio (rankedTierOf): un minTitle o una fascia di dungeon legend romperebbe il generatore
const rankedTier = oneOf(RANKED_TIERS, 'fascia');
const rarity = oneOf(RARITIES, 'rarità');

function isIncreasingTable(value: unknown): boolean {
    return (
        Array.isArray(value) &&
        value.length === MAX_DOCUMENT_LEVEL &&
        value.every(
            (pe: unknown, index) =>
                Number.isSafeInteger(pe) &&
                (pe as number) > 0 &&
                (index === 0 || (pe as number) > (value[index - 1] as number)),
        )
    );
}

function isLevelRange(value: unknown): value is [number, number] {
    return (
        Array.isArray(value) &&
        value.length === 2 &&
        value.every((level) => Number.isSafeInteger(level)) &&
        (value[0] as number) <= (value[1] as number)
    );
}

// le fasce sono intervalli contigui 1..20 nell'ordine di RANKED_TIERS: un buco lascerebbe livelli senza fascia
function coversAllLevels(value: Record<string, unknown>): boolean {
    let next = 1;
    for (const rankedTier of RANKED_TIERS) {
        const range = value[rankedTier];
        if (!isLevelRange(range) || range[0] !== next) return false;
        next = range[1] + 1;
    }
    return next === MAX_DOCUMENT_LEVEL + 1;
}

class ConfigValidator {
    readonly issues: ContentIssue[] = [];

    constructor(private readonly file: string) {}

    report(path: string, message: string): void {
        this.issues.push({
            file: this.file,
            line: null,
            entryId: null,
            path,
            message,
        });
    }

    section(
        raw: Record<string, unknown>,
        key: string,
    ): Record<string, unknown> | null {
        if (isRecord(raw[key])) return raw[key];
        this.report(key, 'sezione mancante o non è una mappa');
        return null;
    }

    field(
        section: Record<string, unknown>,
        path: string,
        key: string,
        check: Check,
    ): void {
        const fieldPath = `${path}.${key}`;
        if (!(key in section)) {
            this.report(fieldPath, 'valore mancante');
            return;
        }
        const problem = check(section[key]);
        if (problem) this.report(fieldPath, problem);
    }

    // un refuso in una sezione non deve lasciare in silenzio il valore di default
    unknownKeys(
        section: Record<string, unknown>,
        path: string,
        known: readonly string[],
    ): void {
        for (const key of Object.keys(section)) {
            if (!known.includes(key)) {
                this.report(
                    path ? `${path}.${key}` : key,
                    'chiave sconosciuta',
                );
            }
        }
    }

    fields(
        raw: Record<string, unknown>,
        key: string,
        keys: readonly string[],
        check: Check,
    ): void {
        const section = this.section(raw, key);
        if (!section) return;
        for (const name of keys) this.field(section, key, name, check);
        this.unknownKeys(section, key, keys);
    }
}

const PRIZE_KEYS: readonly string[] = ['copper', 'xp'];

// solo la dungeon estrae loot casuale (D-19)
const DUNGEON_PRIZE_KEYS: readonly string[] = [
    ...PRIZE_KEYS,
    'randomLootQuantity',
];

function validatePrizes(
    validator: ConfigValidator,
    raw: Record<string, unknown>,
): void {
    const prizes = validator.section(raw, 'prizes');
    if (!prizes) return;
    for (const type of FIXED_QUEST_TYPES) {
        const path = `prizes.${type}`;
        const prize = prizes[type];
        if (!isRecord(prize)) {
            validator.report(path, 'premio mancante per il tipo di quest');
            continue;
        }
        validator.field(prize, path, 'copper', nonNegativeInteger);
        validator.field(prize, path, 'xp', nonNegativeInteger);
        const isDungeon = type === 'dungeon';
        if (isDungeon && 'randomLootQuantity' in prize) {
            validator.field(prize, path, 'randomLootQuantity', positiveInteger);
        }
        validator.unknownKeys(
            prize,
            path,
            isDungeon ? DUNGEON_PRIZE_KEYS : PRIZE_KEYS,
        );
    }
    validator.unknownKeys(prizes, 'prizes', FIXED_QUEST_TYPES);
}

function validateLevels(
    validator: ConfigValidator,
    raw: Record<string, unknown>,
): void {
    const tiers = validator.section(raw, 'tiers');
    if (tiers) validator.unknownKeys(tiers, 'tiers', RANKED_TIERS);
    if (tiers && !coversAllLevels(tiers)) {
        validator.report(
            'tiers',
            `le fasce ${RANKED_TIERS.join(', ')} devono coprire i livelli 1..${MAX_DOCUMENT_LEVEL} senza buchi`,
        );
    }
    if (!isIncreasingTable(raw.mediumPeByLevel)) {
        validator.report(
            'mediumPeByLevel',
            `servono ${MAX_DOCUMENT_LEVEL} interi positivi crescenti (colonna «Medio»)`,
        );
    }
}

function validateHeroZones(
    validator: ConfigValidator,
    raw: Record<string, unknown>,
): void {
    const zones = raw.dungeonHeroZones;
    if (!Array.isArray(zones)) {
        validator.report(
            'dungeonHeroZones',
            'deve essere una lista di PoiType',
        );
        return;
    }
    const isPoiType = oneOf(POI_TYPES, 'zona');
    zones.forEach((zone: unknown, index) => {
        const problem = isPoiType(zone);
        if (problem) validator.report(`dungeonHeroZones[${index}]`, problem);
    });
}

function validate(
    validator: ConfigValidator,
    raw: Record<string, unknown>,
): void {
    validator.fields(
        raw,
        'enemy',
        ['xpScale', 'hpScale', 'damageScale'],
        positive,
    );
    validateLevels(validator, raw);
    validator.fields(raw, 'tierMultiplier', RANKED_TIERS, positive);
    validatePrizes(validator, raw);
    validator.fields(raw, 'dungeonLootRarity', RANKED_TIERS, rarity);
    validator.fields(raw, 'timeToCompleteHours', FIXED_QUEST_TYPES, questHours);
    validator.fields(
        raw,
        'minTitle',
        ['serviceCity', 'serviceCapital'],
        rankedTier,
    );
    validator.fields(raw, 'dungeonTierByCitySize', CITY_SIZES, rankedTier);
    validateHeroZones(validator, raw);
    const hunt = validator.section(raw, 'hunt');
    if (hunt) {
        validator.field(hunt, 'hunt', 'maxAnimalPe', positiveInteger);
        validator.field(hunt, 'hunt', 'maxShareOfRegion', chance);
        validator.unknownKeys(hunt, 'hunt', HUNT_KEYS);
    }
    const generator = validator.section(raw, 'generator');
    if (generator) {
        validator.field(generator, 'generator', 'seed', nonNegativeInteger);
        validator.field(generator, 'generator', 'crimeCityChance', chance);
        validator.field(generator, 'generator', 'studyCityChance', chance);
        validator.unknownKeys(generator, 'generator', GENERATOR_KEYS);
    }
    validator.fields(raw, 'food', ['minutesPerPower'], positive);
    validator.unknownKeys(raw, '', CONFIG_KEYS);
}

// un config invalido è un errore con il percorso della chiave, mai un default silenzioso (D-19)
export function parseContentConfig(
    raw: unknown,
    file: string,
): ParsedContentConfig {
    const validator = new ConfigValidator(file);
    if (!isRecord(raw)) {
        validator.report('', 'il config deve essere una mappa di costanti');
        return { config: null, issues: validator.issues };
    }
    validate(validator, raw);
    if (validator.issues.length > 0) {
        return { config: null, issues: validator.issues };
    }
    return { config: raw as unknown as ContentConfig, issues: [] };
}
