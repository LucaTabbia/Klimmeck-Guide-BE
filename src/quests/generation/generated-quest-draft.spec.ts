import { Types } from 'mongoose';
import { QuestType } from 'src/models/enums/quest-type.enum';
import { TitleType } from 'src/models/enums/title-type.enum';
import { EnemyCandidate } from 'src/quests/generation/enemy-pool';
import {
    GeneratedAssetRef,
    GeneratedPrizes,
} from 'src/quests/generation/generated-prizes';
import { generatedQuestDraftOf } from 'src/quests/generation/generated-quest-draft';
import { GeneratedRank } from 'src/quests/generation/generation-rules';
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

function candidate(name: string, relatedLore: string[] = []): EnemyCandidate {
    return {
        id: hex(),
        name,
        xp: 100,
        locations: ['forest'],
        legendary: false,
        relatedLore,
        baseWeaknesses: [],
        energyWeaknesses: [],
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
    it('builds an enemy quest with one exact seat of the rank (D-09)', () => {
        const draft = draftOf(
            composition(QuestType.enemy, TitleType.paladin, 1),
        );

        expect(draft.requirements).toEqual({
            minTitle: TitleType.paladin,
            requiredPoints: null,
            requiredAdventurers: [{ title: TitleType.paladin, count: 1 }],
            recommendedLoot: RECOMMENDED_REFS,
        });
        expect(draft.infos.type).toBe(QuestType.enemy);
        expect(draft.infos.timeToComplete).toBe(3_600_000);
    });

    it('builds a boss quest with the seats of the formula (D-05)', () => {
        const draft = draftOf(composition(QuestType.boss, TitleType.hero, 2));

        expect(draft.requirements.requiredAdventurers).toEqual([
            { title: TitleType.hero, count: 2 },
        ]);
        expect(draft.requirements.minTitle).toBe(TitleType.hero);
        expect(draft.infos.type).toBe(QuestType.boss);
        expect(draft.infos.timeToComplete).toBe(10_800_000);
        expect(draft.infos.title).toBe('Boss: Orco presso Atheland');
    });

    it('builds an enemy quest with two seats of the rank (D-03)', () => {
        const draft = draftOf(
            composition(QuestType.enemy, TitleType.mage, 2, [
                { enemy: ORC, quantity: 2 },
                { enemy: WOLF, quantity: 1 },
            ]),
        );

        expect(draft.requirements.requiredAdventurers).toEqual([
            { title: TitleType.mage, count: 2 },
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
