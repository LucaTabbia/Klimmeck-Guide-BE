import { TitleType } from 'src/models/enums/title-type.enum';
import { EnemyCandidate } from 'src/quests/generation/enemy-pool';
import {
    GeneratedRank,
    MAX_PACK_UNITS,
    RANK_XP_BANDS,
} from 'src/quests/generation/generation-rules';
import { keyedChance } from 'src/quests/generation/seeded-chance';
import {
    BANDIT_CHIEF_ID,
    BANDIT_ID,
    DUNGEON_STAGES_SEED,
    DungeonStage,
    dungeonStagesOf,
} from './dungeon-stages';

const CURRENT: DungeonStage = {
    enemy: '6ae80bf6947d6a423521c000',
    quantity: 1,
};
const FOREST = ['forest'];
const RANKS: readonly GeneratedRank[] = [
    TitleType.rookie,
    TitleType.adventurer,
    TitleType.paladin,
    TitleType.mage,
    TitleType.hero,
];

let counter = 0;
function candidate(
    name: string,
    xp: number,
    locations: readonly string[],
    id?: string,
): EnemyCandidate {
    counter += 1;
    return {
        id:
            id ??
            `6ae80bf6947d6a4235210${counter.toString(16).padStart(3, '0')}`,
        name,
        xp,
        locations,
        legendary: false,
        relatedLore: [],
        baseWeaknesses: [],
        energyWeaknesses: [],
    };
}

// pool di foresta + city senza briganti: una fascia per rango più i deboli dei branchi
const ZONE_ENEMIES: EnemyCandidate[] = [
    candidate('Ratto', 2, ['forest']),
    candidate('Lupo', 10, ['forest']),
    candidate('Orso', 30, ['forest']),
    candidate('Guardia corrotta', 20, ['city']),
    candidate('Orsogufo', 99, ['forest']),
    candidate('Troll', 300, ['forest']),
];
const HERO_ANYWHERE = candidate('Arcimago', 700, ['all']);
const DESERT_ONLY = [
    candidate('Scorpione', 12, ['desert']),
    candidate('Mummia', 30, ['desert']),
    candidate('Sfinge', 120, ['desert']),
    candidate('Verme', 600, ['desert']),
];
const LEGENDARY = {
    ...candidate('Kraken', 25, ['forest']),
    legendary: true,
};
const POOL = [...ZONE_ENEMIES, HERO_ANYWHERE, ...DESERT_ONLY, LEGENDARY];

const BANDIT = candidate('Bandito', 4, ['forest'], BANDIT_ID);
const BANDIT_CHIEF = candidate(
    'Capo dei Banditi',
    63,
    ['forest'],
    BANDIT_CHIEF_ID,
);

const KEYS = Array.from({ length: 50 }, (_, index) => `dungeon-${index}`);

function stagesFor(
    rank: GeneratedRank,
    key: string,
    enemies: readonly EnemyCandidate[] = POOL,
): DungeonStage[] {
    return dungeonStagesOf({
        rank,
        current: [CURRENT],
        poiTypes: FOREST,
        enemies,
        chance: keyedChance(DUNGEON_STAGES_SEED, key),
    });
}

const addedOf = (stages: readonly DungeonStage[]): DungeonStage[] =>
    stages.slice(1);

describe('dungeonStagesOf', () => {
    it('adds one to three stages after the current enemy (D-13)', () => {
        const counts = new Set<number>();
        for (const key of KEYS) {
            const stages = stagesFor(TitleType.adventurer, key);
            const added = addedOf(stages).length;

            expect(stages[0]).toEqual(CURRENT);
            expect(added).toBeGreaterThanOrEqual(1);
            expect(added).toBeLessThanOrEqual(3);
            counts.add(added);
        }
        expect([...counts].sort()).toEqual([1, 2, 3]);
    });

    it('composes every added stage inside the band of the minTitle from the poi pool (D-08, D-13)', () => {
        const byId = new Map(POOL.map((enemy) => [enemy.id, enemy]));
        const zoneIds = new Set(ZONE_ENEMIES.map((enemy) => enemy.id));
        for (const rank of RANKS) {
            const band = RANK_XP_BANDS[rank];
            const allowed =
                rank === TitleType.hero
                    ? new Set([...zoneIds, HERO_ANYWHERE.id])
                    : zoneIds;
            for (const key of KEYS) {
                for (const stage of addedOf(stagesFor(rank, key))) {
                    const enemy = byId.get(stage.enemy);
                    const total = (enemy?.xp ?? 0) * stage.quantity;

                    expect(allowed.has(stage.enemy)).toBe(true);
                    expect(total).toBeGreaterThanOrEqual(band.min);
                    expect(total).toBeLessThanOrEqual(band.max);
                    if (stage.quantity === 1) continue;
                    expect(enemy?.xp ?? 0).toBeLessThan(band.min);
                    expect(stage.quantity).toBeLessThanOrEqual(MAX_PACK_UNITS);
                }
            }
        }
    });

    it('opens with a bandit band where the zone allows it (D-13)', () => {
        const enemies = [...POOL, BANDIT, BANDIT_CHIEF];
        for (const key of KEYS) {
            const rookie = addedOf(stagesFor(TitleType.rookie, key, enemies));
            const adventurer = addedOf(
                stagesFor(TitleType.adventurer, key, enemies),
            );
            const paladin = addedOf(stagesFor(TitleType.paladin, key, enemies));

            expect(rookie[0].enemy).toBe(BANDIT_ID);
            expect(rookie[0].quantity).toBeGreaterThanOrEqual(2);
            expect(rookie[0].quantity).toBeLessThanOrEqual(3);
            expect(adventurer[0].enemy).toBe(BANDIT_ID);
            expect(adventurer[0].quantity).toBeGreaterThanOrEqual(6);
            expect(adventurer[0].quantity).toBeLessThanOrEqual(8);
            expect(paladin[0]).toEqual({ enemy: BANDIT_CHIEF_ID, quantity: 1 });
            expect(paladin[1].enemy).toBe(BANDIT_ID);
            expect(paladin[1].quantity).toBeGreaterThanOrEqual(2);
            expect(paladin[1].quantity).toBeLessThanOrEqual(7);
            expect(paladin.length).toBeLessThanOrEqual(3);
            for (const rank of [TitleType.mage, TitleType.hero]) {
                const added = addedOf(stagesFor(rank, key, enemies));
                expect(
                    added.filter(
                        (stage) =>
                            stage.enemy === BANDIT_ID ||
                            (stage.enemy === BANDIT_CHIEF_ID &&
                                stage.quantity === 1),
                    ),
                ).toEqual([]);
            }
        }
    });

    it('repeats the same stages for the same dungeon id (D-13)', () => {
        const id = '6ae80b5b2e7351b494ecc900';

        expect(stagesFor(TitleType.paladin, id)).toEqual(
            stagesFor(TitleType.paladin, id),
        );
        expect(stagesFor(TitleType.mage, id)).toEqual(
            stagesFor(TitleType.mage, id),
        );
    });
});
