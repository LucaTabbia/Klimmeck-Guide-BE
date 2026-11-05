import { TitleType } from 'src/models/enums/title-type.enum';
import { QuestType } from 'src/models/enums/quest-type.enum';
import { EnemyCandidate } from 'src/quests/generation/enemy-pool';
import {
    GENERATED_RANKS,
    GeneratedRank,
    MAX_PACK_UNITS,
    RANK_XP_BANDS,
} from 'src/quests/generation/generation-rules';
import {
    Composition,
    composeQuest,
} from 'src/quests/generation/quest-composition';
import { SeededChanceSource } from 'src/quests/generation/seeded-chance';
import { SequenceChance } from '../../../test/quests/sequence-chance';

const enemy = (
    id: string,
    name: string,
    xp: number,
    locations: readonly string[] = ['forest'],
    legendary: unknown = false,
): EnemyCandidate => ({
    id,
    name,
    xp,
    locations,
    legendary,
    relatedLore: [],
    baseWeaknesses: [],
    energyWeaknesses: [],
});

const bandito = enemy('a01', 'Bandito', 4);
const cultista = enemy('a02', 'Cultista', 4);
const goblin = enemy('a03', 'Goblin', 19);
const capoGoblin = enemy('a04', 'Capo goblin', 63);
const orsogufo = enemy('a05', 'Orsogufo', 99);
const troll = enemy('a06', 'Troll', 254);
const gladiatore = enemy('a07', 'Gladiatore', 560);
const magoRinnegato = enemy('a08', 'Mago rinnegato', 650);
const cavaliereNero = enemy('a09', 'Cavaliere nero', 790);
const picchiatore = enemy('a10', 'Picchiatore', 22);

const catalog: EnemyCandidate[] = [
    bandito,
    cultista,
    goblin,
    capoGoblin,
    orsogufo,
    troll,
    gladiatore,
    magoRinnegato,
    cavaliereNero,
    picchiatore,
];

const FOREST = ['forest'];
const SEEDS = Array.from({ length: 200 }, (_, index) => index + 1);

const compose = (
    rank: GeneratedRank,
    enemies: readonly EnemyCandidate[],
    chance: SequenceChance | SeededChanceSource,
    poiTypes: readonly string[] = FOREST,
): Composition | null => composeQuest({ rank, enemies, poiTypes, chance });

const unitsOf = (composition: Composition): number =>
    composition.enemies.reduce((sum, entry) => sum + entry.quantity, 0);

const xpOf = (composition: Composition): number =>
    composition.enemies.reduce(
        (sum, entry) => sum + entry.enemy.xp * entry.quantity,
        0,
    );

const isPack = (composition: Composition): boolean =>
    composition.type === QuestType.enemy && unitsOf(composition) >= 2;

const seededCompositions = (
    rank: GeneratedRank,
    enemies: readonly EnemyCandidate[],
    poiTypes: readonly string[] = FOREST,
): (Composition | null)[] =>
    SEEDS.map((seed) =>
        compose(rank, enemies, new SeededChanceSource(seed), poiTypes),
    );

const memberIdsOf = (compositions: readonly (Composition | null)[]) =>
    new Set(
        compositions.flatMap(
            (composition) =>
                composition?.enemies.map((entry) => entry.enemy.id) ?? [],
        ),
    );

describe('composition of generated quests', () => {
    it('composes a single enemy inside the band of the rank (D-07)', () => {
        const composition = compose(
            TitleType.paladin,
            catalog,
            new SequenceChance([0.5, 0.2, 0.0]),
        );

        expect(composition).toEqual({
            type: QuestType.enemy,
            rank: TitleType.paladin,
            enemies: [{ enemy: orsogufo, quantity: 1 }],
            seats: 1,
        });
    });

    it('composes a pack of weaker enemies whose xp sum falls in the band (D-07)', () => {
        const band = RANK_XP_BANDS.paladin;
        const composition = compose(
            TitleType.paladin,
            [capoGoblin, goblin],
            new SequenceChance([0.5, 0.6]),
        );

        expect(composition).not.toBeNull();
        const pack = composition as Composition;
        expect(pack.type).toBe(QuestType.enemy);
        expect(pack.seats).toBe(1);
        expect(xpOf(pack)).toBeGreaterThanOrEqual(band.min);
        expect(xpOf(pack)).toBeLessThanOrEqual(band.max);
        expect(unitsOf(pack)).toBeGreaterThanOrEqual(2);
        expect(unitsOf(pack)).toBeLessThanOrEqual(MAX_PACK_UNITS);
        expect(pack.enemies.length).toBeGreaterThanOrEqual(1);
        expect(pack.enemies.length).toBeLessThanOrEqual(3);
        for (const entry of pack.enemies) {
            expect(entry.enemy.xp).toBeLessThan(band.min);
        }
    });

    it('never packs enemies of the band or above (D-07)', () => {
        let packs = 0;

        for (const rank of GENERATED_RANKS) {
            const band = RANK_XP_BANDS[rank];
            for (const composition of seededCompositions(rank, catalog)) {
                if (composition === null || !isPack(composition)) continue;
                packs += 1;
                expect(composition.enemies.length).toBeLessThanOrEqual(3);
                expect(unitsOf(composition)).toBeLessThanOrEqual(
                    MAX_PACK_UNITS,
                );
                expect(xpOf(composition)).toBeGreaterThanOrEqual(band.min);
                expect(xpOf(composition)).toBeLessThanOrEqual(band.max);
                for (const entry of composition.enemies) {
                    expect(entry.enemy.xp).toBeLessThan(band.min);
                }
            }
        }

        expect(packs).toBeGreaterThan(0);
    });

    it('falls back to the single form when no pack fits (D-07)', () => {
        const composition = compose(
            TitleType.paladin,
            [bandito, orsogufo],
            new SequenceChance([0.5, 0.6]),
        );

        expect(composition).toEqual({
            type: QuestType.enemy,
            rank: TitleType.paladin,
            enemies: [{ enemy: orsogufo, quantity: 1 }],
            seats: 1,
        });
    });

    it('keeps every pack member inside the pool of the point of interest (D-07, D-08)', () => {
        const forestGoblin = enemy('b01', 'Goblin', 19, ['forest']);
        const cityThief = enemy('b02', 'Ladro', 4, ['city']);
        const desertRaider = enemy('b03', 'Predone del deserto', 51, [
            'desert',
        ]);
        const zoned = seededCompositions(TitleType.paladin, [
            forestGoblin,
            cityThief,
            desertRaider,
        ]);

        expect(zoned.every((composition) => composition !== null)).toBe(true);
        expect([...memberIdsOf(zoned)].sort()).toEqual(['b01', 'b02']);

        const forestBrute = enemy('c01', 'Bruto', 1300, ['forest']);
        const wanderer = enemy('c02', 'Errante', 40, ['all']);
        const desertScout = enemy('c03', 'Esploratore', 30, ['desert']);
        const fallback = seededCompositions(TitleType.paladin, [
            forestBrute,
            wanderer,
            desertScout,
        ]);

        expect(fallback.every((composition) => composition !== null)).toBe(
            true,
        );
        expect([...memberIdsOf(fallback)]).toEqual(['c02']);
    });

    it('never composes a legend quest (D-02)', () => {
        const ranks = new Set<string>();

        for (const rank of GENERATED_RANKS) {
            for (const composition of seededCompositions(rank, catalog)) {
                if (composition === null) continue;
                ranks.add(composition.rank);
                expect(composition.rank).toBe(rank);
                expect(composition.rank).not.toBe(TitleType.legend);
            }
        }

        expect([...ranks].sort()).toEqual(
            ['adventurer', 'hero', 'mage', 'paladin', 'rookie'].sort(),
        );
    });

    it('draws a boss one time in ten for adventurer to hero with seats from the formula (D-05, D-06)', () => {
        const pool = [bandito, goblin, picchiatore, troll];

        expect(
            compose(
                TitleType.adventurer,
                pool,
                new SequenceChance([0.05, 0.0]),
            ),
        ).toEqual({
            type: QuestType.boss,
            rank: TitleType.adventurer,
            enemies: [{ enemy: troll, quantity: 1 }],
            seats: 5,
        });
        expect(
            compose(TitleType.adventurer, pool, new SequenceChance([0.1]))
                ?.type,
        ).toBe(QuestType.enemy);
    });

    it('never draws a boss for rookie (D-05)', () => {
        const composition = compose(
            TitleType.rookie,
            [bandito, cultista, troll],
            new SequenceChance([0.0]),
        );

        expect(composition?.type).toBe(QuestType.enemy);
        expect(composition?.seats).toBe(1);
    });

    it('falls back to an enemy quest when no boss candidate is in the pool (D-05)', () => {
        const composition = compose(
            TitleType.adventurer,
            [bandito, goblin, picchiatore],
            new SequenceChance([0.0]),
        );

        expect(composition?.type).toBe(QuestType.enemy);
        expect(composition?.seats).toBe(1);
    });

    it('returns null when the pool cannot serve the rank at all (D-08)', () => {
        const desertHero = enemy('d01', 'Sciamano', 600, ['desert']);

        expect(
            compose(
                TitleType.hero,
                [bandito, desertHero],
                new SequenceChance([0.0]),
            ),
        ).toBeNull();
        expect(compose(TitleType.hero, [], new SequenceChance())).toBeNull();
    });

    it('never composes a legendary enemy (D-04)', () => {
        const legendaryOwl = enemy('z01', 'Orsogufo antico', 99, FOREST, true);
        const legendaryDragon = enemy('z02', 'Drago', 650, FOREST, true);
        const unflagged = {
            ...enemy('z03', 'Nuovo', 99),
            legendary: undefined,
        };
        const enemies = [...catalog, legendaryOwl, legendaryDragon, unflagged];
        const members = new Set<string>();

        for (const rank of GENERATED_RANKS) {
            for (const id of memberIdsOf(seededCompositions(rank, enemies))) {
                members.add(id);
            }
        }

        expect(members.size).toBeGreaterThan(0);
        for (const id of ['z01', 'z02', 'z03']) {
            expect(members.has(id)).toBe(false);
        }
    });
});
