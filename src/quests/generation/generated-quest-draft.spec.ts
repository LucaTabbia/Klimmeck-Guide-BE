import { Types } from 'mongoose';
import { QuestType } from 'src/models/enums/quest-type.enum';
import { TitleType } from 'src/models/enums/title-type.enum';
import { EnemyCandidate } from 'src/quests/generation/enemy-pool';
import {
    GeneratedAssetRef,
    GeneratedPrizes,
} from 'src/quests/generation/generated-prizes';
import {
    generatedQuestDraftOf,
    mixedBossDraftOf,
} from 'src/quests/generation/generated-quest-draft';
import {
    GeneratedRank,
    isGeneratedRank,
} from 'src/quests/generation/generation-rules';
import { TITLE_RANK } from 'src/quests/acceptance/quest-eligibility';
import { Composition } from 'src/quests/generation/quest-composition';
import {
    BOSS_ANNOUNCEMENTS,
    ENEMY_ANNOUNCEMENTS,
} from 'src/quests/generation/quest-templates';
import { ChanceSource } from 'src/quests/outcomes/chance-source';
import { SequenceChance } from '../../../test/quests/sequence-chance';

const hex = (): string => new Types.ObjectId().toHexString();

const CITY_LORE = hex();
const ORC_LORE = hex();
const POI = hex();
const PET = hex();
const SWORD = hex();
const POTION = hex();
const LOOT = hex();
const LOWER_PET = hex();
const LOWER_LOOT = hex();

function candidate(name: string, relatedLore: string[] = []): EnemyCandidate {
    return {
        id: hex(),
        name,
        xp: 100,
        locations: ['forest'],
        legendary: false,
        relatedLore,
        weaknesses: { base: [], energy: [] },
        animal: false,
    };
}

const ORC = candidate('Orco', [ORC_LORE, CITY_LORE]);
const WOLF = candidate('Lupo');

function composition(
    type: QuestType.enemy | QuestType.boss,
    rank: GeneratedRank,
    seats: number,
    enemies = [{ enemy: ORC, quantity: 1 }],
): Composition {
    return { type, rank, seats, enemies };
}

const PRIZES: GeneratedPrizes = {
    prizeCoins: { gold: 0, silver: 7, copper: 50 },
    xpPrize: 200,
    randomLoot: [{ itemType: 'LootItem', item: LOOT, quantity: 1 }],
    pet: PET,
};

const RECOMMENDED: GeneratedAssetRef[] = [
    { itemType: 'EquipmentItem', item: SWORD, quantity: 1 },
    { itemType: 'LootItem', item: POTION, quantity: 1 },
];

function draftOf(
    comp: Composition,
    chance: ChanceSource = new SequenceChance([0]),
    prizes: GeneratedPrizes = PRIZES,
) {
    return generatedQuestDraftOf({
        composition: comp,
        poiId: POI,
        city: { name: 'Atheland', relatedLore: CITY_LORE },
        prizes,
        recommendedLoot: RECOMMENDED,
        chance,
    });
}

const RECOMMENDED_REFS = [
    {
        itemType: 'EquipmentItem',
        item: new Types.ObjectId(SWORD),
        quantity: 1,
    },
    { itemType: 'LootItem', item: new Types.ObjectId(POTION), quantity: 1 },
];

describe('generatedQuestDraftOf', () => {
    // quick 261111-enm: le enemy non hanno posti a titolo, il rango lo decide minTitle (supera D-09 per il solo tipo enemy)
    it('builds an enemy quest with one rank-free seat and the rank as minTitle (quick 261111-enm)', () => {
        const draft = draftOf(
            composition(QuestType.enemy, TitleType.paladin, 1),
        );

        expect(draft.requirements).toEqual({
            minTitle: TitleType.paladin,
            requiredPoints: null,
            requiredAdventurers: [{ title: null, count: 1 }],
            recommendedLoot: RECOMMENDED_REFS,
        });
        expect(draft.infos.type).toBe(QuestType.enemy);
        expect(draft.infos.timeToComplete).toBe(3_600_000);
    });

    it('builds a boss quest with the rank-exact seats of the formula (D-05)', () => {
        const draft = draftOf(composition(QuestType.boss, TitleType.hero, 2));

        expect(draft.requirements.requiredAdventurers).toEqual([
            { title: TitleType.hero, count: 2 },
        ]);
        expect(draft.requirements.minTitle).toBe(TitleType.hero);
        expect(draft.infos.type).toBe(QuestType.boss);
        expect(draft.infos.timeToComplete).toBe(10_800_000);
        expect(draft.infos.title).toBe('Boss: Orco presso Atheland');
    });

    it('never writes more than one seat on an enemy quest, boss excepted (13.1 D-09)', () => {
        const draft = draftOf(
            composition(QuestType.enemy, TitleType.mage, 2, [
                { enemy: ORC, quantity: 2 },
                { enemy: WOLF, quantity: 1 },
            ]),
        );

        expect(draft.requirements.requiredAdventurers).toEqual([
            { title: null, count: 1 },
        ]);
        expect(draft.requirements.minTitle).toBe(TitleType.mage);
    });

    it('marks the quest as generated and open (D-17)', () => {
        const draft = draftOf(
            composition(QuestType.enemy, TitleType.rookie, 1),
        );

        expect(draft.generated).toBe(true);
        expect(draft.concludedAt).toBeNull();
        expect(draft.startedAt).toBeNull();
        expect(draft.rescue).toBeNull();
        expect(draft.registeredAdventurers).toEqual([]);
        expect(Object.keys(draft).sort()).toEqual([
            'concludedAt',
            'generated',
            'infos',
            'prizes',
            'registeredAdventurers',
            'requirements',
            'rescue',
            'startedAt',
        ]);
    });

    it('writes the enemies, the poi, the title, the announcement and the lore (D-22)', () => {
        const chance = new SequenceChance([0.5]);
        const draft = draftOf(
            composition(QuestType.enemy, TitleType.adventurer, 1, [
                { enemy: ORC, quantity: 2 },
                { enemy: WOLF, quantity: 3 },
            ]),
            chance,
        );

        expect(draft.infos).toEqual({
            title: 'Minaccia: 2 Orco e 3 Lupo presso Atheland',
            type: QuestType.enemy,
            markerLocation: new Types.ObjectId(POI),
            relatedLore: [
                new Types.ObjectId(CITY_LORE),
                new Types.ObjectId(ORC_LORE),
            ],
            timeToComplete: 3_600_000,
            enemies: [
                { enemy: new Types.ObjectId(ORC.id), quantity: 2 },
                { enemy: new Types.ObjectId(WOLF.id), quantity: 3 },
            ],
            description: ENEMY_ANNOUNCEMENTS[1]
                .split('{città}')
                .join('Atheland')
                .split('{nemici}')
                .join('2 Orco e 3 Lupo'),
        });
        expect(draft.prizes).toEqual({
            prizeCoins: { gold: 0, silver: 7, copper: 50 },
            xpPrize: 200,
            prizeItem: null,
            randomLoot: [
                {
                    itemType: 'LootItem',
                    item: new Types.ObjectId(LOOT),
                    quantity: 1,
                },
            ],
            spell: null,
            spellDraw: false,
            pet: new Types.ObjectId(PET),
        });
        expect(chance.drawn).toEqual([0.5]);
    });

    it('draws only the announcement and keeps a missing pet and city lore null (D-22)', () => {
        const chance = new SequenceChance([0.99]);
        const draft = generatedQuestDraftOf({
            composition: composition(QuestType.boss, TitleType.mage, 3),
            poiId: POI,
            city: { name: 'Bosa', relatedLore: null },
            prizes: { ...PRIZES, pet: null, randomLoot: [] },
            recommendedLoot: [],
            chance,
        });

        expect(draft.infos.description).toBe(
            BOSS_ANNOUNCEMENTS[2]
                .split('{città}')
                .join('Bosa')
                .split('{nemici}')
                .join('Orco'),
        );
        expect(draft.infos.relatedLore).toEqual([
            new Types.ObjectId(ORC_LORE),
            new Types.ObjectId(CITY_LORE),
        ]);
        expect(draft.prizes.pet).toBeNull();
        expect(draft.prizes.randomLoot).toEqual([]);
        expect(draft.requirements.recommendedLoot).toEqual([]);
        expect(chance.drawn).toEqual([0.99]);
    });
});

describe('generated boss rank blocks', () => {
    const BOSS_BLOCK_OF_TODAY = {
        prizeCoins: { gold: 0, silver: 7, copper: 50 },
        xpPrize: 200,
        prizeItem: null,
        randomLoot: [
            {
                itemType: 'LootItem',
                item: new Types.ObjectId(LOOT),
                quantity: 1,
            },
        ],
        spell: null,
        pet: new Types.ObjectId(PET),
        cure: null,
    };

    const LOWER_PRIZES: GeneratedPrizes = {
        prizeCoins: { gold: 0, silver: 3, copper: 0 },
        xpPrize: 80,
        randomLoot: [{ itemType: 'LootItem', item: LOWER_LOOT, quantity: 1 }],
        pet: LOWER_PET,
    };

    const mixedMage = () =>
        mixedBossDraftOf(
            draftOf(composition(QuestType.boss, TitleType.mage, 4)),
            {
                lower: TitleType.paladin,
                lowerSeats: 2,
                lowerPrizes: LOWER_PRIZES,
            },
        );

    it('writes one rank block on every generated boss (D-05, D-23)', () => {
        const draft = draftOf(composition(QuestType.boss, TitleType.mage, 3));

        expect(draft.prizes.rankPrizes).toEqual([
            { title: TitleType.mage, ...BOSS_BLOCK_OF_TODAY },
        ]);
        expect(draft.requirements.requiredAdventurers).toEqual([
            { title: TitleType.mage, count: 3 },
        ]);
    });

    it('writes no rank block on a generated enemy (D-01)', () => {
        const draft = draftOf(
            composition(QuestType.enemy, TitleType.paladin, 1),
        );

        expect(Object.keys(draft.prizes).sort()).toEqual([
            'pet',
            'prizeCoins',
            'prizeItem',
            'randomLoot',
            'spell',
            'spellDraw',
            'xpPrize',
        ]);
    });

    it('mixes a boss with the lower title only (D-03, D-23)', () => {
        const draft = mixedMage();

        expect(draft.requirements.minTitle).toBe(TitleType.paladin);
        expect(draft.requirements.requiredAdventurers).toEqual([
            { title: TitleType.mage, count: 2 },
            { title: TitleType.paladin, count: 2 },
        ]);
        expect(draft.prizes.rankPrizes?.map((block) => block.title)).toEqual([
            TitleType.mage,
            TitleType.paladin,
        ]);
        expect(draft.prizes).toMatchObject({
            prizeCoins: BOSS_BLOCK_OF_TODAY.prizeCoins,
            xpPrize: BOSS_BLOCK_OF_TODAY.xpPrize,
            randomLoot: BOSS_BLOCK_OF_TODAY.randomLoot,
            pet: BOSS_BLOCK_OF_TODAY.pet,
            prizeItem: null,
            spell: null,
            spellDraw: false,
        });
        for (const seat of draft.requirements.requiredAdventurers) {
            expect(isGeneratedRank(seat.title)).toBe(true);
            expect(TITLE_RANK[seat.title as GeneratedRank]).toBeLessThanOrEqual(
                TITLE_RANK.mage,
            );
        }
        expect(draft.infos.type).toBe(QuestType.boss);
    });

    it('keeps cure and spell out of the generated blocks (D-05c)', () => {
        for (const block of mixedMage().prizes.rankPrizes ?? []) {
            expect(block.spell).toBeNull();
            expect(block.cure).toBeNull();
            expect(block.prizeItem).toBeNull();
        }
    });

    it('draws the pet of each block with its own rank cap (D-05a)', () => {
        const [mage, paladin] = mixedMage().prizes.rankPrizes ?? [];

        expect(mage.pet).toEqual(new Types.ObjectId(PET));
        expect(paladin).toEqual({
            title: TitleType.paladin,
            prizeCoins: { gold: 0, silver: 3, copper: 0 },
            xpPrize: 80,
            prizeItem: null,
            randomLoot: [
                {
                    itemType: 'LootItem',
                    item: new Types.ObjectId(LOWER_LOOT),
                    quantity: 1,
                },
            ],
            spell: null,
            pet: new Types.ObjectId(LOWER_PET),
            cure: null,
        });
    });
});
