// regole delle imboscate (Phase 15 D-01..D-04): costanti di dominio, nessuna variabile d'ambiente tranne il fuso
import { QuestType } from 'src/models/enums/quest-type.enum';
import { TitleType } from 'src/models/enums/title-type.enum';
import {
    GENERATED_PRIZES,
    TIER_MULTIPLIER,
} from 'src/quests/generation/generated-prizes';
import {
    GeneratedRank,
    isGeneratedRank,
} from 'src/quests/generation/generation-rules';

// rischio per km 0,2% di giorno, 0,6% di notte (22–06 locali); 10 km di soglia per partire e per risorteggiare
export const AMBUSH_RULES = {
    dayHazardPerKm: 0.002,
    nightHazardPerKm: 0.006,
    nightStartHour: 22,
    nightEndHour: 6,
    minTravelKm: 10,
    minRemainingKm: 10,
} as const;

// D-18: al terzo errore lo sweep annulla l'imboscata
export const AMBUSH_MAX_ATTEMPTS = 3;

export const isNightHour = (hour: number): boolean =>
    hour >= AMBUSH_RULES.nightStartHour || hour < AMBUSH_RULES.nightEndHour;

export const hazardAt = (hour: number): number =>
    isNightHour(hour)
        ? AMBUSH_RULES.nightHazardPerKm
        : AMBUSH_RULES.dayHazardPerKm;

// legend gioca come hero (13.1 D-02)
export const prizeRankOf = (title: TitleType): GeneratedRank =>
    isGeneratedRank(title) ? title : TitleType.hero;

export function ambushPrizesOf(
    title: TitleType,
    enemiesXp: number,
): { copper: number; xp: number } {
    const base = GENERATED_PRIZES[QuestType.enemy];
    const multiplier = TIER_MULTIPLIER[prizeRankOf(title)];
    return {
        copper: base.copper * multiplier,
        xp: base.xp * multiplier + Math.max(0, enemiesXp),
    };
}
