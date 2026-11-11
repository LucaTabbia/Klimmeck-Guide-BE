import { QuestType } from 'src/models/enums/quest-type.enum';
import { RarityType } from 'src/models/enums/rarity-type.enum';
import { TitleType } from 'src/models/enums/title-type.enum';
import { GeneratedQuestType } from 'src/quests/generation/generated-prizes';
import { GeneratedRank } from 'src/quests/generation/generation-rules';
import {
    BOSS_PET_PRIZE_CHANCE,
    PetCandidate,
    PetPrizeInput,
    SAME_ENEMY_PET_PRIZE_CHANCE,
    ZONE_PET_PRIZE_CHANCE,
    petPrizeOf,
    petRarityCapOf,
} from 'src/quests/generation/pet-prize';
import { SequenceChance } from '../../../test/quests/sequence-chance';

const QUEST_ENEMY = 'e1';
const OTHER_ENEMY = 'e2';
const FOREST = 'forest';

const pet = (
    id: string,
    overrides: Partial<PetCandidate> = {},
): PetCandidate => ({
    id,
    rarity: RarityType.common,
    sellable: true,
    enemyId: null,
    enemyLocations: [],
    ...overrides,
});

const ofQuestEnemy = (id: string, overrides: Partial<PetCandidate> = {}) =>
    pet(id, { enemyId: QUEST_ENEMY, ...overrides });

const ofForest = (id: string, overrides: Partial<PetCandidate> = {}) =>
    pet(id, {
        enemyId: OTHER_ENEMY,
        enemyLocations: ['cave', FOREST],
        ...overrides,
    });

const bossOnly = (id: string, overrides: Partial<PetCandidate> = {}) =>
    pet(id, { sellable: false, ...overrides });

function offer(
    pets: readonly PetCandidate[],
    chance: SequenceChance,
    overrides: Partial<PetPrizeInput> = {},
): string | null {
    return petPrizeOf({
        type: QuestType.boss,
        rank: TitleType.rookie,
        pets,
        enemyIds: [QUEST_ENEMY],
        poiTypes: [FOREST],
        chance,
        ...overrides,
    });
}

// un pet per fascia: l'id dice quale fascia l'ha offerto
const ONE_PER_BAND = [
    ofQuestEnemy('same-enemy'),
    ofForest('zone'),
    bossOnly('boss-only'),
];

describe('generated pet prize', () => {
    it('pins the three additive chances of a generated pet prize (D-28)', () => {
        expect(SAME_ENEMY_PET_PRIZE_CHANCE).toBe(0.1);
        expect(ZONE_PET_PRIZE_CHANCE).toBe(0.05);
        expect(BOSS_PET_PRIZE_CHANCE).toBe(0.05);
    });

    it.each<[GeneratedQuestType, GeneratedRank, RarityType]>([
        [QuestType.boss, TitleType.hero, RarityType.legendary],
        [QuestType.boss, TitleType.mage, RarityType.ultrarare],
        [QuestType.boss, TitleType.paladin, RarityType.rare],
        [QuestType.boss, TitleType.adventurer, RarityType.uncommon],
        [QuestType.boss, TitleType.rookie, RarityType.common],
        [QuestType.enemy, TitleType.hero, RarityType.ultrarare],
        [QuestType.enemy, TitleType.mage, RarityType.rare],
        [QuestType.enemy, TitleType.paladin, RarityType.uncommon],
        [QuestType.enemy, TitleType.adventurer, RarityType.common],
        [QuestType.enemy, TitleType.rookie, RarityType.common],
    ])(
        'reads the rarity cap of a quest from the widest slot of its loot pool: %s %s (D-28)',
        (type, rank, cap) => {
            expect(petRarityCapOf(type, rank)).toBe(cap);
        },
    );

    it('offers the pet of one of the quest enemies in the first band (D-28)', () => {
        const pets = [
            ofForest('p0'),
            ofQuestEnemy('p3'),
            bossOnly('p1'),
            ofQuestEnemy('p2'),
        ];

        expect(
            offer([pets[0], pets[1], pets[2]], new SequenceChance([0])),
        ).toBe('p3');
        expect(offer(pets, new SequenceChance([0, 0]))).toBe('p2');
        expect(offer(pets, new SequenceChance([0, 0.99]))).toBe('p3');
    });

    it('offers a zone pet in the second band, never one of the first band (D-28)', () => {
        const pets = [
            ofQuestEnemy('p1', { enemyLocations: [FOREST] }),
            ofForest('p2'),
            pet('p3', { enemyId: OTHER_ENEMY, enemyLocations: ['cave'] }),
        ];

        expect(offer(pets, new SequenceChance([0.12, 0]))).toBe('p2');
        expect(offer(pets, new SequenceChance([0.12, 0.99]))).toBe('p2');
        expect(
            offer(pets, new SequenceChance([0.12, 0]), {
                type: QuestType.enemy,
            }),
        ).toBe('p2');
    });

    it('offers any non sellable pet in the third band on a boss only (D-28)', () => {
        const pets = [
            pet('p1', { sellable: true }),
            pet('p2', { sellable: null }),
            bossOnly('p3'),
            bossOnly('p4', { enemyId: QUEST_ENEMY, enemyLocations: [FOREST] }),
        ];

        expect(offer(pets, new SequenceChance([0.17, 0]))).toBe('p3');
        expect(offer(pets, new SequenceChance([0.17, 0.99]))).toBe('p4');
    });

    it('offers no pet in the third band on an enemy quest (D-28)', () => {
        const chance = new SequenceChance([0.17, 0]);

        expect(
            offer(ONE_PER_BAND, chance, { type: QuestType.enemy }),
        ).toBeNull();
        expect(chance.drawn).toEqual([0.17]);
    });

    it.each<[number, string | null]>([
        [0.0999, 'same-enemy'],
        [0.1, 'zone'],
        [0.1499, 'zone'],
        [0.15, 'boss-only'],
        [0.1999, 'boss-only'],
        [0.2, null],
    ])('keeps the band boundaries at r = %p (D-28)', (roll, offered) => {
        expect(offer(ONE_PER_BAND, new SequenceChance([roll, 0]))).toBe(
            offered,
        );
    });

    it('offers nothing when the hit band has no candidate and does not fall through to another band (D-28)', () => {
        const chance = new SequenceChance([0, 0]);

        expect(offer([ofForest('zone'), bossOnly('boss-only')], chance)).toBe(
            null,
        );
        expect(chance.drawn).toEqual([0]);
    });

    it('never offers a pet above the rarity cap of the rank (D-28)', () => {
        const pets = [ofQuestEnemy('p1', { rarity: RarityType.rare })];
        const onRank = (rank: GeneratedRank) =>
            offer(pets, new SequenceChance([0, 0]), {
                type: QuestType.enemy,
                rank,
            });

        expect(onRank(TitleType.adventurer)).toBeNull();
        expect(onRank(TitleType.mage)).toBe('p1');
    });

    it.each<[string | null]>([[null], ['mythic'], ['toString']])(
        'never offers a pet without a rarity or with an unknown one: %p (D-28)',
        (rarity) => {
            const pets = [
                ofQuestEnemy('same-enemy', { rarity }),
                ofForest('zone', { rarity }),
                bossOnly('boss-only', { rarity }),
            ];
            const onHero = (roll: number) =>
                offer(pets, new SequenceChance([roll, 0]), {
                    rank: TitleType.hero,
                });

            expect([onHero(0), onHero(0.12), onHero(0.17)]).toEqual([
                null,
                null,
                null,
            ]);
        },
    );

    it('draws exactly one roll, plus one index only when the band has a candidate (D-28)', () => {
        const empty = new SequenceChance([0, 0]);
        const missed = new SequenceChance([0.5, 0]);
        const hit = new SequenceChance([0, 0.5]);

        offer([], empty);
        offer(ONE_PER_BAND, missed);
        offer(ONE_PER_BAND, hit);

        expect(empty.drawn).toEqual([0]);
        expect(missed.drawn).toEqual([0.5]);
        expect(hit.drawn).toEqual([0, 0.5]);
    });
});
