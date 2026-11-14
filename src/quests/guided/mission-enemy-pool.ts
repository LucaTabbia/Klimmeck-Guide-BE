import { TitleType } from 'src/models/enums/title-type.enum';
import { livesAnywhere, livesIn } from 'src/quests/generation/enemy-pool';
import {
    GENERATED_RANKS,
    RANK_XP_BANDS,
    XpBand,
} from 'src/quests/generation/generation-rules';

// legendary non tipizzato: solo true/false hanno un significato (fail-closed come la Phase 13)
export interface MissionEnemyCandidate {
    id: string;
    name: string;
    xp: number;
    locations: readonly string[];
    legendary: unknown;
}

export interface MissionPoolRule {
    poiTypes: readonly string[];
    band: XpBand;
    legendaries: boolean;
}

type MissionTitle = TitleType | null | undefined;

// legend gioca le hero (13.1 D-02), un titolo assente le rookie
function rankIndexOf(title: MissionTitle): number {
    if (!title) return 0;
    if (title === TitleType.legend) return GENERATED_RANKS.length - 1;
    return Math.max(0, GENERATED_RANKS.indexOf(title));
}

// D-19: fascia unione dal titolo minimo al titolo più alto dei posti
export function missionBandOf(
    minTitle: MissionTitle,
    seatTitles: readonly MissionTitle[],
): XpBand {
    const low = rankIndexOf(minTitle);
    const high = Math.max(low, ...seatTitles.map(rankIndexOf));
    return {
        min: RANK_XP_BANDS[GENERATED_RANKS[low]].min,
        max: RANK_XP_BANDS[GENERATED_RANKS[high]].max,
    };
}

export function byMissionOrder(
    a: MissionEnemyCandidate,
    b: MissionEnemyCandidate,
): number {
    return (
        a.xp - b.xp || a.name.localeCompare(b.name) || a.id.localeCompare(b.id)
    );
}

const withinBand = (enemy: MissionEnemyCandidate, band: XpBand): boolean =>
    enemy.xp >= band.min && enemy.xp <= band.max;

function poolWhere(
    enemies: readonly MissionEnemyCandidate[],
    rule: MissionPoolRule,
    livesThere: (enemy: MissionEnemyCandidate) => boolean,
): MissionEnemyCandidate[] {
    return enemies.filter(
        (enemy) =>
            livesThere(enemy) &&
            ((enemy.legendary === false && withinBand(enemy, rule.band)) ||
                (rule.legendaries && enemy.legendary === true)),
    );
}

// D-03, D-19: stessa regola di zona di zonePoolOf, animali inclusi, leggendari solo per la worldMission e senza fascia
export function missionEnemyPoolOf(
    enemies: readonly MissionEnemyCandidate[],
    rule: MissionPoolRule,
): MissionEnemyCandidate[] {
    const zone = poolWhere(enemies, rule, (enemy) =>
        livesIn(enemy, rule.poiTypes),
    );
    const pool =
        zone.length > 0
            ? zone
            : poolWhere(
                  enemies,
                  rule,
                  (enemy) =>
                      livesIn(enemy, rule.poiTypes) || livesAnywhere(enemy),
              );
    return pool.sort(byMissionOrder);
}
