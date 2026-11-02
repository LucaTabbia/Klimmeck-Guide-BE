import { ContentTree } from 'src/content/loading/content-tree';
import { isRecord } from 'src/content/loading/records';
import { LoadedEntry } from 'src/content/loading/yaml-file';
import { ContentConfig } from 'src/content/rules/content-config';
import { enemyLifePoints } from 'src/content/rules/enemy-stats';
import { marchMinutesOf } from 'src/content/rules/quest-prizes';
import { EffectType } from 'src/models/enums/effect-type.enum';
import { RarityType } from 'src/models/enums/rarity-type.enum';
import { winChanceOf } from 'src/quests/outcomes/combat/placeholder-combat-resolver';

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
    enemyId: string;
    party: string;
    rarity: RarityType;
    pieces: number;
}

// scontri di riferimento del flag D-12: i lifePoints vengono dalla voce del nemico, come li scrive il mapper
const ENCOUNTERS: readonly EncounterSpec[] = [
    {
        enemyId: '6ae806b55093fb43140756d9', // Lupo
        party: 'rookie, 1 pezzo mediano common',
        rarity: RarityType.common,
        pieces: 1,
    },
    {
        enemyId: '6ae804ef033e23e10fe491d3', // Troll
        party: 'paladin, 3 pezzi mediani rare',
        rarity: RarityType.rare,
        pieces: 3,
    },
    {
        enemyId: '6ae80b5b2e7351b494ecc870', // Drago rosso adulto
        party: 'hero, 9 pezzi mediani legendary',
        rarity: RarityType.legendary,
        pieces: 9,
    },
    {
        enemyId: '6ae80b5b2e7351b494ecc869', // Tarrasque
        party: '5 legend × 9 pezzi mediani legendary',
        rarity: RarityType.legendary,
        pieces: 45,
    },
];

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

// la formula vive solo nel resolver: qui si arrotonda a due decimali per il report
export function winChance(partyPower: number, lifePoints: number): number {
    return Math.round(winChanceOf(partyPower, lifePoints) * 100) / 100;
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

// override esplicito o PF del source × hpScale, come enemy.mapper
function lifePointsOf(
    raw: Record<string, unknown>,
    config: ContentConfig,
): number | null {
    if (typeof raw.lifePoints === 'number') return raw.lifePoints;
    const pf = isRecord(raw.source) ? raw.source.pf : undefined;
    return typeof pf === 'number'
        ? enemyLifePoints(pf, config.enemy.hpScale)
        : null;
}

// uno scontro il cui nemico manca dai file (o non ha PF) non ha un esempio
function winChanceExamplesOf(
    tree: ContentTree,
    config: ContentConfig,
    byRarity: Record<string, Distribution>,
): WinChanceExample[] {
    return ENCOUNTERS.flatMap(({ enemyId, party, rarity, pieces }) => {
        const enemy = tree.entries.enemies.find(
            ({ raw }) => raw.id === enemyId,
        );
        const lifePoints = enemy ? lifePointsOf(enemy.raw, config) : null;
        if (!enemy || lifePoints === null) return [];
        const partyPower = (byRarity[rarity]?.median ?? 0) * pieces;
        return [
            {
                encounter: keyOf(enemy.raw.name),
                lifePoints,
                party,
                partyPower,
                winChance: winChance(partyPower, lifePoints),
            },
        ];
    });
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
    const { config } = tree;
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
                .map(({ raw }) => marchMinutesOf(numberOf(raw.power), config)),
        ),
        winChanceExamples: winChanceExamplesOf(
            tree,
            config,
            equipmentPowerByRarity,
        ),
    };
}
