import { TitleType } from 'src/models/enums/title-type.enum';

// xp = max(1, round(PE × XP_SCALE)) come la Phase 11 (D-11): il DB ha solo xp, mai i PE
export const XP_SCALE = 0.14084507;

// rango meno coperto su sei ranghi (D-07 emendata: legend entra nel giro con i soli branchi di nemici hero)
export const GENERATED_RANKS = [
    TitleType.rookie,
    TitleType.adventurer,
    TitleType.paladin,
    TitleType.mage,
    TitleType.hero,
    TitleType.legend,
] as const;
export type GeneratedRank = (typeof GENERATED_RANKS)[number];

export interface XpBand {
    min: number;
    max: number;
}

// fasce in Enemy.xp dal mediumPeByLevel × XP_SCALE (D-07; mage 451 per l'arrotondamento, C2); legend = 2–4 nemici della fascia hero
export const RANK_XP_BANDS: Readonly<Record<GeneratedRank, XpBand>> = {
    rookie: { min: 7, max: 14 },
    adventurer: { min: 21, max: 35 },
    paladin: { min: 70, max: 169 },
    mage: { min: 225, max: 451 },
    hero: { min: 549, max: 803 },
    legend: { min: 1098, max: 3212 },
};

// media dei PE del party (world building riga 1090, D-05); rookie non ha media, legend non ha boss (D-07)
export const BOSS_PARTY_AVERAGE_PE: Readonly<
    Partial<Record<GeneratedRank, number>>
> = {
    adventurer: 400,
    paladin: 1500,
    mage: 4000,
    hero: 6000,
};
// documentata (D-05), nessun candidato non leggendario oggi
export const LEGEND_PARTY_AVERAGE_PE = 15_000;
export const MIN_BOSS_SEATS = 2;
export const MAX_BOSS_SEATS = 6;
// 1 boss ogni 10 nei ranghi idonei (D-06)
export const BOSS_SHARE = 0.1;
// forma (a) nemico singolo contro (b) branco (D-07, discrezione)
export const SINGLE_FORM_SHARE = 0.5;
export const MAX_PACK_UNITS = 8;
export const MAX_PACK_TYPES = 3;
export const PACK_ATTEMPTS = 20;
export const LEGEND_PACK_UNITS = { min: 2, max: 4 } as const;

// C3: lo 0,5 ricava il PE minimo compatibile con l'arrotondamento di xp (Licantropo pipistrello: 2 posti, non 3)
export const bossSeatsOf = (xp: number, average: number): number =>
    Math.ceil((xp - 0.5) / XP_SCALE / average);

export function isBossCandidate(xp: number, rank: GeneratedRank): boolean {
    const average = BOSS_PARTY_AVERAGE_PE[rank];
    if (average === undefined) return false;
    const seats = bossSeatsOf(xp, average);
    return seats >= MIN_BOSS_SEATS && seats <= MAX_BOSS_SEATS;
}

export const isGeneratedRank = (title: unknown): title is GeneratedRank =>
    (GENERATED_RANKS as readonly unknown[]).includes(title);

// D-15: conteggio per minTitle delle generate aperte; parità → rango più basso
export function leastCoveredRank(
    counts: Readonly<Partial<Record<GeneratedRank, number>>>,
): GeneratedRank {
    let least: GeneratedRank = GENERATED_RANKS[0];
    for (const rank of GENERATED_RANKS) {
        if ((counts[rank] ?? 0) < (counts[least] ?? 0)) least = rank;
    }
    return least;
}
