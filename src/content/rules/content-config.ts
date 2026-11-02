import { ContentIssue } from 'src/content/content-issue';

export type ContentTier =
    | 'rookie'
    | 'adventurer'
    | 'paladin'
    | 'mage'
    | 'hero'
    | 'legend';

export type FixedQuestType =
    | 'hunt'
    | 'dungeon'
    | 'heal'
    | 'job'
    | 'study'
    | 'crime'
    | 'guard';

export type RankedTier = Exclude<ContentTier, 'legend'>;

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
    minTitle: { serviceCity: ContentTier; serviceCapital: ContentTier };
    dungeonTierByCitySize: {
        Village: ContentTier;
        City: ContentTier;
        SeaCity: ContentTier;
        Capital: ContentTier;
    };
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

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseContentConfig(
    raw: unknown,
    file: string,
): ParsedContentConfig {
    if (!isRecord(raw)) {
        return {
            config: null,
            issues: [
                {
                    file,
                    line: null,
                    entryId: null,
                    path: '',
                    message: 'il config deve essere una mappa di costanti',
                },
            ],
        };
    }
    return { config: raw as unknown as ContentConfig, issues: [] };
}
