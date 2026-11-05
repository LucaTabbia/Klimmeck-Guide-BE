import { RarityType } from 'src/models/enums/rarity-type.enum';
import { TitleType } from 'src/models/enums/title-type.enum';
import { EnemyCandidate } from 'src/quests/generation/enemy-pool';
import { PrizeCatalogItem } from 'src/quests/generation/generated-prizes';
import {
    RECOMMENDED_LOOT_RARITY,
    recommendedLootOf,
} from 'src/quests/generation/recommended-loot';

const enemy = (
    id: string,
    baseWeaknesses: readonly string[],
    energyWeaknesses: readonly string[],
): EnemyCandidate => ({
    id,
    name: id,
    xp: 10,
    locations: ['forest'],
    legendary: false,
    relatedLore: [],
    baseWeaknesses,
    energyWeaknesses,
});

interface Hit {
    type: string;
    power: number;
}

const gear = (
    id: string,
    rarity: RarityType,
    base: Hit[],
    energy: Hit[] = [],
    equipType = 'weapon',
): PrizeCatalogItem => ({
    itemType: 'EquipmentItem',
    id,
    rarity,
    equipType,
    damages: { base, energy },
});

const potion = (
    id: string,
    rarity: RarityType,
    power: number,
    effect = 'heal',
): PrizeCatalogItem => ({ itemType: 'LootItem', id, rarity, effect, power });

const weapon = (id: string) => ({
    itemType: 'EquipmentItem',
    item: id,
    quantity: 1,
});

const healing = (id: string) => ({
    itemType: 'LootItem',
    item: id,
    quantity: 1,
});

describe('recommendedLootOf', () => {
    const enemies = [enemy('e1', ['blunt'], []), enemy('e2', [], ['fire'])];

    it('recommends up to two weapons that hit the weaknesses of the enemies (D-27)', () => {
        const catalog = [
            gear('w-club', RarityType.common, [{ type: 'blunt', power: 5 }]),
            gear(
                'w-torch',
                RarityType.common,
                [],
                [{ type: 'fire', power: 5 }],
            ),
            gear(
                'w-flail',
                RarityType.common,
                [{ type: 'blunt', power: 4 }],
                [{ type: 'fire', power: 4 }],
            ),
            gear('w-sword', RarityType.common, [{ type: 'slash', power: 20 }]),
            gear(
                'armor-blunt',
                RarityType.common,
                [{ type: 'blunt', power: 50 }],
                [],
                'chestPiece',
            ),
        ];

        expect(
            recommendedLootOf({
                rank: TitleType.rookie,
                enemies,
                catalog,
            }),
        ).toEqual([weapon('w-flail'), weapon('w-club')]);
    });

    it('stays within the rarity of the rank band (D-27)', () => {
        expect(RECOMMENDED_LOOT_RARITY).toEqual({
            rookie: RarityType.common,
            adventurer: RarityType.uncommon,
            paladin: RarityType.rare,
            mage: RarityType.ultrarare,
            hero: RarityType.legendary,
        });
        const catalog = [
            gear('w-rare', RarityType.rare, [{ type: 'blunt', power: 30 }]),
            gear('w-uncommon', RarityType.uncommon, [
                { type: 'blunt', power: 3 },
            ]),
            potion('heal-rare', RarityType.rare, 99),
        ];

        expect(
            recommendedLootOf({
                rank: TitleType.adventurer,
                enemies,
                catalog,
            }),
        ).toEqual([weapon('w-uncommon')]);
    });

    it('adds the best healing item within the rarity (D-27)', () => {
        const catalog = [
            potion('heal-b', RarityType.uncommon, 40),
            potion('heal-a', RarityType.common, 40),
            potion('heal-weak', RarityType.common, 10),
            potion('food', RarityType.common, 90, 'hunger'),
            potion('heal-too-rare', RarityType.rare, 90),
        ];

        expect(
            recommendedLootOf({
                rank: TitleType.adventurer,
                enemies,
                catalog,
            }),
        ).toEqual([healing('heal-a')]);
    });

    it('returns an empty list when nothing matches (D-27)', () => {
        const catalog = [
            gear('w-sword', RarityType.common, [{ type: 'slash', power: 20 }]),
            potion('food', RarityType.common, 90, 'hunger'),
        ];

        expect(
            recommendedLootOf({ rank: TitleType.hero, enemies, catalog }),
        ).toEqual([]);
        expect(
            recommendedLootOf({
                rank: TitleType.hero,
                enemies: [],
                catalog: [],
            }),
        ).toEqual([]);
    });

    it('excludes a rarity that names a key of the prototype (D-27)', () => {
        const prototypeKeys = ['constructor', '__proto__', 'toString'];
        const catalog = prototypeKeys.flatMap((rarity) => [
            gear(`w-${rarity}`, rarity as RarityType, [
                { type: 'blunt', power: 9 },
            ]),
            potion(`heal-${rarity}`, rarity as RarityType, 90),
        ]);

        expect(
            recommendedLootOf({ rank: TitleType.hero, enemies, catalog }),
        ).toEqual([]);
    });
});
