import { ContentTree } from 'src/content/loading/content-tree';
import { LoadedEntry } from 'src/content/loading/yaml-file';
import { EffectType } from 'src/models/enums/effect-type.enum';
import { RarityType } from 'src/models/enums/rarity-type.enum';

export interface Distribution {
    count: number;
    min: number;
    median: number;
    max: number;
}

export interface WinChanceExample {
    encounter: string;
    lifePoints: number;
    party: string;
    partyPower: number;
    winChance: number;
}

export interface CatalogStats {
    mode: 'stats';
    equipmentPowerByRarity: Record<string, Distribution>;
    equipmentPowerByEquipType: Record<string, Distribution>;
    spellPowerByUseType: Record<string, Distribution>;
    spellPower: Distribution;
    lootPowerByEffect: Record<string, Distribution>;
    hungerMarchMinutes: Distribution;
    winChanceExamples: WinChanceExample[];
}

interface EncounterSpec {
    encounter: string;
    lifePoints: number;
    party: string;
    rarity: RarityType;
    pieces: number;
}

// scontri di riferimento del flag D-12 (lifePoints = PF del bestiario × 100)
const ENCOUNTERS: readonly EncounterSpec[] = [
    {
        encounter: 'Lupo',
        lifePoints: 1100,
        party: 'rookie, 1 pezzo mediano common',
        rarity: RarityType.common,
        pieces: 1,
    },
    {
        encounter: 'Troll',
        lifePoints: 8400,
        party: 'paladin, 3 pezzi mediani rare',
        rarity: RarityType.rare,
        pieces: 3,
    },
    {
        encounter: 'Drago rosso adulto',
        lifePoints: 25600,
        party: 'hero, 9 pezzi mediani legendary',
        rarity: RarityType.legendary,
        pieces: 9,
    },
    {
        encounter: 'Tarrasque',
        lifePoints: 67600,
        party: '5 legend × 9 pezzi mediani legendary',
        rarity: RarityType.legendary,
        pieces: 45,
    },
];

// stessa scelta del resolver segnaposto quando entrambe le parti valgono zero
const EVEN_ODDS = 0.5;

const EMPTY_DISTRIBUTION: Distribution = {
    count: 0,
    min: 0,
    median: 0,
    max: 0,
};

function medianOf(sorted: readonly number[]): number {
    const middle = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 1) return sorted[middle];
    return Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

export function distributionOf(values: readonly number[]): Distribution {
    if (values.length === 0) return { ...EMPTY_DISTRIBUTION };
    const sorted = [...values].sort((a, b) => a - b);
    return {
        count: sorted.length,
        min: sorted[0],
        median: medianOf(sorted),
        max: sorted[sorted.length - 1],
    };
}

// formula di placeholder-combat-resolver.ts, arrotondata a due decimali
export function winChance(partyPower: number, lifePoints: number): number {
    const total = partyPower + lifePoints;
    const chance = total > 0 ? partyPower / total : EVEN_ODDS;
    return Math.round(chance * 100) / 100;
}

function numberOf(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function keyOf(value: unknown): string {
    return typeof value === 'string' ? value : '(senza valore)';
}

function powersOf(list: unknown): number[] {
    if (!Array.isArray(list)) return [];
    return list.map((item: unknown) =>
        numberOf((item as { power?: unknown } | null)?.power),
    );
}

function piecePowerOf(raw: Record<string, unknown>): number {
    const damages = (raw.damages ?? {}) as Record<string, unknown>;
    return [...powersOf(damages.base), ...powersOf(damages.energy)].reduce(
        (total, power) => total + power,
        0,
    );
}

function spellPowerOf(raw: Record<string, unknown>): number {
    return numberOf((raw.energyDamage as { power?: unknown } | null)?.power);
}

function groupedDistributions(
    entries: readonly LoadedEntry[],
    groupOf: (raw: Record<string, unknown>) => string,
    valueOf: (raw: Record<string, unknown>) => number,
): Record<string, Distribution> {
    const groups = new Map<string, number[]>();
    for (const { raw } of entries) {
        const group = groupOf(raw);
        groups.set(group, [...(groups.get(group) ?? []), valueOf(raw)]);
    }
    return Object.fromEntries(
        [...groups.keys()]
            .sort()
            .map((group) => [group, distributionOf(groups.get(group) ?? [])]),
    );
}

function winChanceExamplesOf(
    byRarity: Record<string, Distribution>,
): WinChanceExample[] {
    return ENCOUNTERS.map(
        ({ encounter, lifePoints, party, rarity, pieces }) => {
            const partyPower = (byRarity[rarity]?.median ?? 0) * pieces;
            return {
                encounter,
                lifePoints,
                party,
                partyPower,
                winChance: winChance(partyPower, lifePoints),
            };
        },
    );
}

// D-12/D-16: misura offline dai soli file, per l'handoff; il resolver non cambia
export function catalogStats(tree: ContentTree): CatalogStats {
    if (!tree.config)
        throw new Error('config.yaml non valido: statistiche non calcolabili');
    const { equipmentitems, lootitems, spells } = tree.entries;
    const equipmentPowerByRarity = groupedDistributions(
        equipmentitems,
        (raw) => keyOf(raw.rarity),
        piecePowerOf,
    );
    const minutesPerPower = tree.config.food.minutesPerPower;
    return {
        mode: 'stats',
        equipmentPowerByRarity,
        equipmentPowerByEquipType: groupedDistributions(
            equipmentitems,
            (raw) => keyOf(raw.equipType),
            piecePowerOf,
        ),
        spellPowerByUseType: groupedDistributions(
            spells,
            (raw) => keyOf(raw.useType),
            spellPowerOf,
        ),
        spellPower: distributionOf(spells.map(({ raw }) => spellPowerOf(raw))),
        lootPowerByEffect: groupedDistributions(
            lootitems,
            (raw) => keyOf(raw.effect),
            (raw) => numberOf(raw.power),
        ),
        hungerMarchMinutes: distributionOf(
            lootitems
                .filter(({ raw }) => raw.effect === EffectType.hunger)
                .map(({ raw }) => numberOf(raw.power) * minutesPerPower),
        ),
        winChanceExamples: winChanceExamplesOf(equipmentPowerByRarity),
    };
}
