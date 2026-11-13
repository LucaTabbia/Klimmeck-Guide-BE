import { QuestType } from 'src/models/enums/quest-type.enum';
import { TitleType } from 'src/models/enums/title-type.enum';
import { slotsOf } from 'src/quests/acceptance/quest-capacity';
import { TITLE_RANK } from 'src/quests/acceptance/quest-eligibility';
import { ChanceSource } from 'src/quests/outcomes/chance-source';

// xp = max(1, round(PE × XP_SCALE)) come la Phase 11 (D-11): il DB ha solo xp, mai i PE
export const XP_SCALE = 0.14084507;

// fasce contigue a soglie, solo rookie–hero; legend è solo un titolo e gioca le hero (13.1 D-02)
export const GENERATED_RANKS = [
    TitleType.rookie,
    TitleType.adventurer,
    TitleType.paladin,
    TitleType.mage,
    TitleType.hero,
] as const;
export type GeneratedRank = (typeof GENERATED_RANKS)[number];

export interface XpBand {
    min: number;
    max: number;
}

// soglia minima in Enemy.xp di ogni rango (13.1 D-02)
export const RANK_XP_FLOORS: Readonly<Record<GeneratedRank, number>> = {
    rookie: 1,
    adventurer: 21,
    paladin: 70,
    mage: 225,
    hero: 549,
};
// massimo del documento di world building: sopra solo boss (13.1 D-02)
export const HERO_XP_MAX = 803;

// max = soglia successiva − 1: contigue per costruzione
function bandsFromFloors(): Record<GeneratedRank, XpBand> {
    const last = GENERATED_RANKS.length - 1;
    return Object.fromEntries(
        GENERATED_RANKS.map((rank, index) => [
            rank,
            {
                min: RANK_XP_FLOORS[rank],
                max:
                    index < last
                        ? RANK_XP_FLOORS[GENERATED_RANKS[index + 1]] - 1
                        : HERO_XP_MAX,
            },
        ]),
    ) as Record<GeneratedRank, XpBand>;
}

export const RANK_XP_BANDS: Readonly<Record<GeneratedRank, XpBand>> =
    bandsFromFloors();

// media dei PE del party (world building riga 1090); rookie non ha media (D-05 della Phase 13)
export const BOSS_PARTY_AVERAGE_PE: Readonly<
    Partial<Record<GeneratedRank, number>>
> = {
    adventurer: 400,
    paladin: 1500,
    mage: 4000,
    hero: 6000,
};
export const MIN_BOSS_SEATS = 2;
export const MAX_BOSS_SEATS = 6;
// 1 boss ogni 10 nei ranghi idonei (D-06)
export const BOSS_SHARE = 0.1;
// forma (a) nemico singolo contro (b) branco (D-07, discrezione)
export const SINGLE_FORM_SHARE = 0.5;
export const MAX_PACK_UNITS = 8;
export const MAX_PACK_TYPES = 3;
export const PACK_ATTEMPTS = 20;

// C3: lo 0,5 ricava il PE minimo compatibile con l'arrotondamento di xp (Licantropo pipistrello: 2 posti, non 3)
export const bossSeatsOf = (xp: number, average: number): number =>
    Math.ceil((xp - 0.5) / XP_SCALE / average);

// un solo posto sulle enemy generate: solo boss e worldMission hanno più posti (13.1 D-09)
export const ENEMY_SEATS = 1;

// S posti dello stesso rango battono S volte la fascia (13.1 D-03)
export function budgetOf(rank: GeneratedRank, seats: number): XpBand {
    const band = RANK_XP_BANDS[rank];
    return { min: seats * band.min, max: seats * band.max };
}

// boss = singolo sopra la fascia del rango; sopra il massimo hero almeno due posti (13.1 D-03)
export function bossSeatsFor(xp: number, rank: GeneratedRank): number | null {
    const average = BOSS_PARTY_AVERAGE_PE[rank];
    if (average === undefined || xp <= RANK_XP_BANDS[rank].max) return null;
    const formula = bossSeatsOf(xp, average);
    const seats =
        xp > HERO_XP_MAX ? Math.max(MIN_BOSS_SEATS, formula) : formula;
    return seats >= MIN_BOSS_SEATS && seats <= MAX_BOSS_SEATS ? seats : null;
}

export const isBossCandidate = (xp: number, rank: GeneratedRank): boolean =>
    bossSeatsFor(xp, rank) !== null;

export const isGeneratedRank = (title: unknown): title is GeneratedRank =>
    (GENERATED_RANKS as readonly unknown[]).includes(title);

// D-15, D-23: conteggio per rango di copertura delle generate aperte (minTitle, per i boss il titolo più alto dei posti); parità → rango più basso
export function leastCoveredRank(
    counts: Readonly<Partial<Record<GeneratedRank, number>>>,
): GeneratedRank {
    let least: GeneratedRank = GENERATED_RANKS[0];
    for (const rank of GENERATED_RANKS) {
        if ((counts[rank] ?? 0) < (counts[least] ?? 0)) least = rank;
    }
    return least;
}

// un boss generato su due ha anche posti del titolo inferiore, mai superiore (D-03, D-23)
export const MIXED_BOSS_SHARE = 0.5;

export function lowerRankOf(rank: GeneratedRank): GeneratedRank | null {
    const index = GENERATED_RANKS.indexOf(rank);
    return index > 0 ? GENERATED_RANKS[index - 1] : null;
}

// tiri solo per i boss e in coda alla quest (D-23): il cancello sempre, la proporzione solo se metà > 1
export function mixedSeatsOf(seats: number, chance: ChanceSource): number {
    if (chance.next() >= MIXED_BOSS_SHARE) return 0;
    const half = Math.floor(seats / 2);
    if (half <= 1) return 1;
    return Math.min(half, 1 + Math.floor(chance.next() * half));
}

export interface CoverageQuest {
    infos?: { type?: unknown } | null;
    requirements?: {
        minTitle?: unknown;
        requiredAdventurers?: unknown;
    } | null;
}

// il boss misto abbassa minTitle: la copertura lo conta sul titolo più alto dei posti (D-23)
function highestSeatTitleOf(seatsValue: unknown): TitleType | null {
    const slots = slotsOf(seatsValue);
    if (slots === 'invalid') return null;
    let highest: TitleType | null = null;
    for (const { title } of slots) {
        if (title === null) continue;
        if (highest === null || TITLE_RANK[title] > TITLE_RANK[highest])
            highest = title;
    }
    return highest;
}

export function coverageRankOf(quest: CoverageQuest): GeneratedRank | null {
    const minTitle = quest.requirements?.minTitle;
    const rank =
        quest.infos?.type === QuestType.boss
            ? (highestSeatTitleOf(quest.requirements?.requiredAdventurers) ??
              minTitle)
            : minTitle;
    return isGeneratedRank(rank) ? rank : null;
}
