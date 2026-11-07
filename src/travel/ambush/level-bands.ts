import { XP_SCALE, XpBand } from 'src/quests/generation/generation-rules';

export interface LevelBandRow {
    level: number;
    easyPe: number;
    mediumPe: number;
}

// world-building.md righe 156–177, colonne Facile e Medio, in PE
export const LEVEL_BANDS: readonly LevelBandRow[] = [
    { level: 1, easyPe: 25, mediumPe: 50 },
    { level: 2, easyPe: 50, mediumPe: 100 },
    { level: 3, easyPe: 75, mediumPe: 150 },
    { level: 4, easyPe: 125, mediumPe: 250 },
    { level: 5, easyPe: 250, mediumPe: 500 },
    { level: 6, easyPe: 300, mediumPe: 600 },
    { level: 7, easyPe: 350, mediumPe: 750 },
    { level: 8, easyPe: 450, mediumPe: 900 },
    { level: 9, easyPe: 550, mediumPe: 1100 },
    { level: 10, easyPe: 600, mediumPe: 1200 },
    { level: 11, easyPe: 800, mediumPe: 1600 },
    { level: 12, easyPe: 1000, mediumPe: 2000 },
    { level: 13, easyPe: 1100, mediumPe: 2200 },
    { level: 14, easyPe: 1250, mediumPe: 2500 },
    { level: 15, easyPe: 1400, mediumPe: 2800 },
    { level: 16, easyPe: 1600, mediumPe: 3200 },
    { level: 17, easyPe: 2000, mediumPe: 3900 },
    { level: 18, easyPe: 2100, mediumPe: 4200 },
    { level: 19, easyPe: 2400, mediumPe: 4900 },
    { level: 20, easyPe: 2800, mediumPe: 5700 },
];

const xpOfPe = (pe: number): number => Math.max(1, Math.round(pe * XP_SCALE));

// fascia [Facile, Medio] del livello in xp dei nemici (D-08); livelli fuori tabella o non finiti → riga più vicina
export function xpBandOf(level: number): XpBand {
    const index = Number.isFinite(level)
        ? Math.min(LEVEL_BANDS.length, Math.max(1, Math.floor(level))) - 1
        : 0;
    const row = LEVEL_BANDS[index];
    return { min: xpOfPe(row.easyPe), max: xpOfPe(row.mediumPe) };
}
