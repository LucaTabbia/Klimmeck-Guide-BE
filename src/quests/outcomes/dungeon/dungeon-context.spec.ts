import { Types } from 'mongoose';
import { QuestType } from 'src/models/enums/quest-type.enum';
import { TitleType } from 'src/models/enums/title-type.enum';
import { CombatCharacterSnapshot } from '../combat/combat-context';
import { CombatContext } from '../combat/combat-resolver';
import { buildDungeonContext } from './dungeon-context';

const id = (hex: string) => new Types.ObjectId(hex.padStart(24, '0'));

const swordId = id('e1');
const herbId = id('72');
const heroId = id('a1');
const otherId = id('a2');

const combat = (): CombatContext => ({
    quest: {
        id: id('91').toHexString(),
        type: QuestType.dungeon,
        title: 'Cripta',
    },
    enemies: [
        {
            id: id('b1').toHexString(),
            name: 'Goblin',
            lifePoints: 100,
            xp: 20,
            damages: { base: [], energy: [] },
            baseWeaknesses: [],
            energyWeaknesses: [],
            quantity: 3,
        },
    ],
    participants: [
        {
            characterId: heroId.toHexString(),
            title: TitleType.adventurer,
            level: 2,
            currentLifePoints: 900,
            maxLifePoints: 1000,
            injuries: [],
            equipment: [],
            activeSpells: [],
            consumables: [],
        },
    ],
});

const snapshot = (
    _id: Types.ObjectId,
    assets: CombatCharacterSnapshot['assets'],
): CombatCharacterSnapshot => ({
    _id,
    status: { title: TitleType.adventurer },
    assets,
});

const recommendedLoot = () => [
    { itemType: 'EquipmentItem', item: swordId, quantity: 1 },
    { itemType: 'LootItem', item: herbId, quantity: 2 },
];

describe('buildDungeonContext', () => {
    it('carries the recommended loot of the quest in order (D-11)', () => {
        const context = buildDungeonContext({
            combat: combat(),
            recommendedLoot: [
                ...recommendedLoot(),
                { itemType: 'Pet', item: herbId, quantity: 1 },
                { itemType: 'LootItem', item: 'not-an-id', quantity: 1 },
                { itemType: 'LootItem', item: herbId, quantity: 1.5 },
                { itemType: 'LootItem', item: herbId, quantity: 0 },
                null,
            ],
            participants: [],
        });

        expect(context.recommendedLoot).toEqual([
            {
                itemType: 'EquipmentItem',
                itemId: swordId.toHexString(),
                quantity: 1,
            },
            { itemType: 'LootItem', itemId: herbId.toHexString(), quantity: 2 },
        ]);
    });

    it('reads populated recommended items by their id (D-11)', () => {
        const context = buildDungeonContext({
            combat: combat(),
            recommendedLoot: [
                { itemType: 'LootItem', item: { _id: herbId }, quantity: 2 },
            ],
            participants: [],
        });

        expect(context.recommendedLoot).toEqual([
            { itemType: 'LootItem', itemId: herbId.toHexString(), quantity: 2 },
        ]);
    });

    it('lists the recommended items each participant owns, worn included (D-11)', () => {
        const context = buildDungeonContext({
            combat: combat(),
            recommendedLoot: recommendedLoot(),
            participants: [
                snapshot(heroId, {
                    ownedItems: [
                        { itemType: 'LootItem', item: herbId, quantity: 3 },
                    ],
                    ownedEquipments: [{ item: swordId, quantity: 1 }],
                    wearedEquipment: { rightHand: swordId },
                }),
                snapshot(otherId, {
                    ownedItems: [
                        {
                            itemType: 'EquipmentItem',
                            item: herbId,
                            quantity: 4,
                        },
                    ],
                }),
            ],
        });

        expect(context.recommendedOwned).toEqual({
            [heroId.toHexString()]: [
                {
                    itemType: 'EquipmentItem',
                    itemId: swordId.toHexString(),
                    quantity: 1,
                },
                {
                    itemType: 'LootItem',
                    itemId: herbId.toHexString(),
                    quantity: 3,
                },
            ],
            [otherId.toHexString()]: [],
        });
    });

    it('does not double count the worn copy (D-11)', () => {
        const wornOnlyId = id('a3');
        const twoHandsId = id('a4');
        const context = buildDungeonContext({
            combat: combat(),
            recommendedLoot: [recommendedLoot()[0]],
            participants: [
                snapshot(heroId, {
                    ownedEquipments: [{ item: swordId, quantity: 1 }],
                    wearedEquipment: { rightHand: swordId },
                }),
                snapshot(otherId, {
                    ownedEquipments: [
                        { item: swordId, quantity: 1 },
                        { item: { _id: swordId }, quantity: 1 },
                    ],
                    wearedEquipment: { rightHand: swordId },
                }),
                snapshot(wornOnlyId, {
                    ownedEquipments: [],
                    wearedEquipment: { rightHand: swordId },
                }),
                snapshot(twoHandsId, {
                    ownedEquipments: [{ item: swordId, quantity: 1 }],
                    wearedEquipment: {
                        rightHand: swordId,
                        leftHand: swordId.toHexString(),
                    },
                }),
            ],
        });

        const swords = (quantity: number) => [
            {
                itemType: 'EquipmentItem',
                itemId: swordId.toHexString(),
                quantity,
            },
        ];
        expect(context.recommendedOwned).toEqual({
            [heroId.toHexString()]: swords(1),
            [otherId.toHexString()]: swords(2),
            [wornOnlyId.toHexString()]: swords(1),
            [twoHandsId.toHexString()]: swords(2),
        });
    });

    it('keeps the combat context untouched (D-12)', () => {
        const source = combat();
        const context = buildDungeonContext({
            combat: source,
            recommendedLoot: null,
            participants: [],
        });

        expect(Object.keys(context).sort()).toEqual([
            'enemies',
            'participants',
            'quest',
            'recommendedLoot',
            'recommendedOwned',
        ]);
        expect(context.quest).toEqual(combat().quest);
        expect(context.enemies).toEqual(combat().enemies);
        expect(context.participants).toEqual(combat().participants);
        expect(context.recommendedLoot).toEqual([]);
        expect(context.recommendedOwned).toEqual({});
    });
});
