import { Types } from 'mongoose';
import { InjuryType } from 'src/models/enums/injury-type.enum';
import { QuestType } from 'src/models/enums/quest-type.enum';
import { TitleType } from 'src/models/enums/title-type.enum';
import {
    buildCombatContext,
    CombatCharacterSnapshot,
    CombatHydration,
    combatCatalogRefsOf,
    normalizeDamages,
} from './combat-context';
import { statusFactsOf } from '../progression/status-facts';

const id = (hex: string) => new Types.ObjectId(hex.padStart(24, '0'));

const swordId = id('e1');
const shieldId = id('e2');
const fireballId = id('51');
const iceId = id('52');
const windId = id('53');
const potionId = id('71');
const herbId = id('72');

const heroA = (): CombatCharacterSnapshot => ({
    _id: id('a1'),
    status: {
        title: TitleType.mage,
        level: 3,
        currentLifePoints: 700,
        maxLifePoints: 1000,
        injuries: [InjuryType.deepCut],
        spellStates: [
            { spell: fireballId, usages: 2, recoveries: [], active: true },
        ],
    },
    assets: {
        wornEquipment: {
            rightHand: swordId,
            leftHand: shieldId.toHexString(),
            head: null,
        },
        ownedItems: [
            { itemType: 'LootItem', item: potionId, quantity: 2 },
            { itemType: 'LootItem', item: herbId, quantity: 0 },
            { itemType: 'EquipmentItem', item: swordId, quantity: 1 },
        ],
    },
});

const heroB = (): CombatCharacterSnapshot => ({
    _id: id('a2'),
    status: { title: TitleType.rookie },
    assets: null,
});

const hydration = (): CombatHydration => ({
    quest: {
        _id: id('91'),
        infos: { type: QuestType.hunt, title: 'Wolves' },
    },
    enemies: [
        {
            snapshot: {
                _id: id('b1'),
                name: 'Wolf',
                lifePoints: 1000,
                xp: 100,
                damages: { base: { type: 'cut', power: 80 } },
                weaknesses: { base: ['blunt'], energy: ['fire'] },
            },
            quantity: 1,
        },
    ],
    participants: [heroB(), heroA()],
    equipment: new Map([
        [
            swordId.toHexString(),
            { damages: { base: [{ type: 'cut', power: 300 }], energy: [] } },
        ],
    ]),
    spells: new Map([
        [
            fireballId.toHexString(),
            { energyDamage: { type: 'fire', power: 40 } },
        ],
    ]),
    loot: new Map([
        [potionId.toHexString(), { effect: 'heal', power: 200 }],
        [herbId.toHexString(), { effect: 'heal', power: 50 }],
    ]),
    pets: new Map(),
});

describe('normalizeDamages', () => {
    it('keeps well-formed damages as they are', () => {
        expect(
            normalizeDamages({
                base: [{ type: 'cut', power: 100 }],
                energy: [],
            }),
        ).toEqual({ base: [{ type: 'cut', power: 100 }], energy: [] });
    });

    it('wraps a single damage object into an array (Pitfall 10)', () => {
        expect(
            normalizeDamages({
                base: { type: 'blunt', power: 50 },
                energy: null,
            }),
        ).toEqual({ base: [{ type: 'blunt', power: 50 }], energy: [] });
    });

    it('drops entries with a non numeric or negative power', () => {
        expect(
            normalizeDamages({
                base: [
                    { type: 'cut', power: 'x' },
                    { type: 'cut', power: -3 },
                    { type: 'pierce', power: 7 },
                ],
            }),
        ).toEqual({ base: [{ type: 'pierce', power: 7 }], energy: [] });
    });

    it('returns empty damages for missing input', () => {
        expect(normalizeDamages(undefined)).toEqual({ base: [], energy: [] });
        expect(normalizeDamages('broken')).toEqual({ base: [], energy: [] });
    });
});

describe('combatCatalogRefsOf', () => {
    it('collects worn equipment, active spells and owned loot ids, deduplicated, skipping empty stacks', () => {
        const refs = combatCatalogRefsOf([heroA(), heroA(), heroB()]);

        expect(refs.equipmentIds.map(String).sort()).toEqual(
            [swordId, shieldId].map(String).sort(),
        );
        expect(refs.spellIds.map(String)).toEqual([String(fireballId)]);
        expect(refs.lootIds.map(String)).toEqual([String(potionId)]);
        refs.equipmentIds.forEach((ref) =>
            expect(ref).toBeInstanceOf(Types.ObjectId),
        );
    });
});

describe('buildCombatContext', () => {
    it('hydrates quest, enemy and participants sorted by character id', () => {
        const context = buildCombatContext(hydration());

        expect(context.quest).toEqual({
            id: id('91').toHexString(),
            type: QuestType.hunt,
            title: 'Wolves',
        });
        expect(context.enemies).toEqual([
            {
                id: id('b1').toHexString(),
                name: 'Wolf',
                lifePoints: 1000,
                xp: 100,
                damages: { base: [{ type: 'cut', power: 80 }], energy: [] },
                weaknesses: { base: ['blunt'], energy: ['fire'] },
                quantity: 1,
            },
        ]);
        expect(context.participants.map((p) => p.characterId)).toEqual([
            id('a1').toHexString(),
            id('a2').toHexString(),
        ]);
    });

    it('lists the enemies in quest order with their quantities (D-02)', () => {
        const source = hydration();
        source.enemies = [
            {
                snapshot: {
                    _id: id('c2'),
                    name: 'Goblin',
                    lifePoints: 100,
                    xp: 10,
                },
                quantity: 3,
            },
            {
                snapshot: {
                    _id: id('c1'),
                    name: 'Capo',
                    lifePoints: 600,
                    xp: 63,
                },
                quantity: 1,
            },
        ];

        expect(buildCombatContext(source).enemies).toEqual([
            {
                id: id('c2').toHexString(),
                name: 'Goblin',
                lifePoints: 100,
                xp: 10,
                damages: { base: [], energy: [] },
                weaknesses: { base: [], energy: [] },
                quantity: 3,
            },
            {
                id: id('c1').toHexString(),
                name: 'Capo',
                lifePoints: 600,
                xp: 63,
                damages: { base: [], energy: [] },
                weaknesses: { base: [], energy: [] },
                quantity: 1,
            },
        ]);
    });

    it('keeps only catalogued equipment, spells with damage and owned loot', () => {
        const [hero] = buildCombatContext(hydration()).participants;

        expect(hero).toEqual({
            characterId: id('a1').toHexString(),
            title: TitleType.mage,
            level: 3,
            currentLifePoints: 700,
            maxLifePoints: 1000,
            injuries: [InjuryType.deepCut],
            equipment: [
                {
                    itemId: swordId.toHexString(),
                    slot: 'rightHand',
                    damages: {
                        base: [{ type: 'cut', power: 300 }],
                        energy: [],
                    },
                    equipType: null,
                    accessoryUseTypes: null,
                },
            ],
            activeSpells: [
                {
                    spellId: fireballId.toHexString(),
                    usages: 2,
                    damage: { type: 'fire', power: 40 },
                },
            ],
            consumables: [
                {
                    itemId: potionId.toHexString(),
                    quantity: 2,
                    effect: 'heal',
                    power: 200,
                },
            ],
            companion: null,
        });
    });

    it('reads an enemy without the weaknesses sub-document as two empty lists (D-01)', () => {
        const source = hydration();
        source.enemies = [
            { snapshot: { _id: id('b2'), weaknesses: null }, quantity: 1 },
            { snapshot: { _id: id('b3'), weaknesses: {} }, quantity: 1 },
        ];

        expect(
            buildCombatContext(source).enemies.map((enemy) => enemy.weaknesses),
        ).toEqual([
            { base: [], energy: [] },
            { base: [], energy: [] },
        ]);
    });

    it('keeps only the weaknesses of the two enums in the combat context (D-22)', () => {
        const source = hydration();
        source.enemies = [
            {
                snapshot: {
                    _id: id('b2'),
                    weaknesses: {
                        base: ['cut', 'laser'],
                        energy: ['fire', 'cut'],
                    },
                },
                quantity: 1,
            },
        ];

        expect(buildCombatContext(source).enemies[0].weaknesses).toEqual({
            base: ['cut'],
            energy: ['fire'],
        });
    });

    it('fills missing numbers with safe defaults', () => {
        const source = hydration();
        source.enemies = [{ snapshot: { _id: id('b2') }, quantity: 1 }];
        const context = buildCombatContext(source);
        const rookie = context.participants[1];

        expect(rookie).toEqual({
            characterId: id('a2').toHexString(),
            title: TitleType.rookie,
            level: 1,
            currentLifePoints: 1000,
            maxLifePoints: 1000,
            injuries: [],
            equipment: [],
            activeSpells: [],
            consumables: [],
            companion: null,
        });
        expect(context.enemies).toEqual([
            {
                id: id('b2').toHexString(),
                name: '',
                lifePoints: 0,
                xp: 0,
                damages: { base: [], energy: [] },
                weaknesses: { base: [], energy: [] },
                quantity: 1,
            },
        ]);
    });

    it('reads the life points of a legacy character from the level table, like the outcome plan', () => {
        const legacy = {
            _id: id('a3'),
            status: { title: TitleType.rookie, xp: 900 },
            assets: null,
        };
        const wounded = {
            _id: id('a4'),
            status: {
                title: TitleType.rookie,
                xp: 900,
                currentLifePoints: 400,
            },
            assets: null,
        };
        const source = hydration();
        source.participants = [legacy, wounded];

        const [veteran, hurt] = buildCombatContext(source).participants;

        expect(veteran).toMatchObject({
            level: 3,
            currentLifePoints: 1600,
            maxLifePoints: 1600,
        });
        expect(hurt).toMatchObject({
            level: 3,
            currentLifePoints: 400,
            maxLifePoints: 1600,
        });
        for (const [participant, snapshot] of [
            [veteran, legacy],
            [hurt, wounded],
        ] as const) {
            const facts = statusFactsOf(snapshot);
            expect(participant).toMatchObject({
                level: facts.level,
                currentLifePoints: facts.currentLifePoints,
                maxLifePoints: facts.maxLifePoints,
            });
        }
    });

    it('maps an unknown effect to null and a non numeric power to 0', () => {
        const source = hydration();
        source.loot = new Map([
            [potionId.toHexString(), { effect: 'teleport', power: 'lots' }],
        ]);
        const [hero] = buildCombatContext(source).participants;

        expect(hero.consumables).toEqual([
            {
                itemId: potionId.toHexString(),
                quantity: 2,
                effect: null,
                power: 0,
            },
        ]);
    });

    it('gives a null damage to a spell without a valid energy damage', () => {
        const source = hydration();
        source.spells = new Map([[fireballId.toHexString(), {}]]);
        const [hero] = buildCombatContext(source).participants;

        expect(hero.activeSpells).toEqual([
            { spellId: fireballId.toHexString(), usages: 2, damage: null },
        ]);
    });

    describe('the spells of a participant', () => {
        const spellOf = (
            spell: Types.ObjectId,
            usages: number,
            type: string,
            power: number,
        ) => ({
            spellId: spell.toHexString(),
            usages,
            damage: { type, power },
        });
        const fighterWith = (
            spellStates: CombatCharacterSnapshot['status']['spellStates'],
        ) => {
            const source = hydration();
            source.spells = new Map([
                [
                    fireballId.toHexString(),
                    { energyDamage: { type: 'fire', power: 40 } },
                ],
                [
                    iceId.toHexString(),
                    { energyDamage: { type: 'ice', power: 10 } },
                ],
                [
                    windId.toHexString(),
                    { energyDamage: { type: 'wind', power: 5 } },
                ],
            ]);
            const hero = heroA();
            source.participants = [
                { ...hero, status: { ...hero.status, spellStates } },
            ];
            const [fighter] = buildCombatContext(source).participants;
            return fighter;
        };

        it('brings into the fight only the active spell states with their usages (D-07)', () => {
            const fighter = fighterWith([
                { spell: fireballId, usages: 1, recoveries: [], active: true },
                { spell: iceId, usages: 2, recoveries: [], active: false },
                { spell: windId, usages: 4, recoveries: [], active: true },
            ]);

            expect(fighter.activeSpells).toEqual([
                spellOf(fireballId, 1, 'fire', 40),
                spellOf(windId, 4, 'wind', 5),
            ]);
        });

        it('keeps the learning order of the active spells (D-16)', () => {
            const fighter = fighterWith([
                { spell: windId, usages: 4, recoveries: [], active: true },
                { spell: fireballId, usages: 1, recoveries: [], active: false },
                { spell: iceId, usages: 2, recoveries: [], active: true },
            ]);

            expect(fighter.activeSpells).toEqual([
                spellOf(windId, 4, 'wind', 5),
                spellOf(iceId, 2, 'ice', 10),
            ]);
        });

        it('brings no spell for a character without spell states (D-07)', () => {
            expect(fighterWith(undefined).activeSpells).toEqual([]);
        });

        it('reads a spell state stored without the flag as not active (D-07)', () => {
            const fighter = fighterWith([
                { spell: fireballId, usages: 3, recoveries: [] },
            ]);

            expect(fighter.activeSpells).toEqual([]);
        });

        it('never brings negative usages nor an unreadable spell ref (D-07)', () => {
            const fighter = fighterWith([
                { spell: fireballId, usages: -2, recoveries: [], active: true },
                { spell: 'xyz', usages: 2, recoveries: [], active: true },
                { spell: iceId, recoveries: [], active: true },
            ]);

            expect(fighter.activeSpells).toEqual([
                spellOf(fireballId, 0, 'fire', 40),
                spellOf(iceId, 0, 'ice', 10),
            ]);
        });

        it('collects the catalogue refs of the active spell states only (D-07)', () => {
            const hero = heroA();
            const refs = combatCatalogRefsOf([
                {
                    ...hero,
                    status: {
                        ...hero.status,
                        spellStates: [
                            {
                                spell: iceId,
                                usages: 2,
                                recoveries: [],
                                active: false,
                            },
                            {
                                spell: windId,
                                usages: 4,
                                recoveries: [],
                                active: true,
                            },
                        ],
                    },
                },
            ]);

            expect(refs.spellIds.map(String)).toEqual([String(windId)]);
        });
    });

    it('does not mutate the input snapshots', () => {
        const source = hydration();

        buildCombatContext(source);

        expect(source).toEqual(hydration());
    });
});

describe('jewel use types in the combat context', () => {
    const ringId = id('e3');

    const wearing = (item: Record<string, unknown>) => {
        const source = hydration();
        source.participants = [
            {
                _id: id('a5'),
                status: { title: TitleType.rookie },
                assets: { wornEquipment: { firstAccessory: ringId } },
            },
        ];
        source.equipment = new Map([[ringId.toHexString(), item]]);
        return buildCombatContext(source).participants[0].equipment;
    };

    it('snapshots the use types of a worn jewel (D-24)', () => {
        expect(
            wearing({
                damages: { base: [], energy: [] },
                equipType: 'ring',
                accessoryUseTypes: ['attack', 'defense'],
            }),
        ).toEqual([
            {
                itemId: ringId.toHexString(),
                slot: 'firstAccessory',
                damages: { base: [], energy: [] },
                equipType: 'ring',
                accessoryUseTypes: ['attack', 'defense'],
            },
        ]);
    });

    it('keeps null use types on gear without them (D-24)', () => {
        const [hero] = buildCombatContext({
            ...hydration(),
            equipment: new Map([
                [
                    swordId.toHexString(),
                    { damages: { base: [], energy: [] }, equipType: 'weapon' },
                ],
            ]),
        }).participants;

        expect(hero.equipment).toEqual([
            {
                itemId: swordId.toHexString(),
                slot: 'rightHand',
                damages: { base: [], energy: [] },
                equipType: 'weapon',
                accessoryUseTypes: null,
            },
        ]);
    });

    it('drops values outside the enum and keeps a malformed list null (D-24)', () => {
        const [listed] = wearing({
            equipType: 'ring',
            accessoryUseTypes: ['attack', 'fly'],
        });
        const [single] = wearing({
            equipType: 'necklace',
            accessoryUseTypes: 'attack',
        });
        const [unknown] = wearing({
            equipType: 'cape',
            accessoryUseTypes: ['defense'],
        });

        expect([listed, single, unknown]).toEqual([
            expect.objectContaining({
                equipType: 'ring',
                accessoryUseTypes: ['attack'],
            }),
            expect.objectContaining({
                equipType: 'necklace',
                accessoryUseTypes: null,
            }),
            expect.objectContaining({
                equipType: null,
                accessoryUseTypes: ['defense'],
            }),
        ]);
    });
});

describe('the companion in the combat context', () => {
    const wolfId = id('61');
    const wolfStats = {
        attack: { base: { type: 'cut', power: 30 } },
        defense: { base: [{ type: 'blunt', power: 5 }], energy: null },
        maxLifePoints: 50,
    };

    const companionWith = (
        assets: CombatCharacterSnapshot['assets'],
        pets: CombatHydration['pets'] = new Map([
            [wolfId.toHexString(), wolfStats],
        ]),
    ) => {
        const source = hydration();
        source.participants = [
            { _id: id('a6'), status: { title: TitleType.rookie }, assets },
        ];
        source.pets = pets;
        return buildCombatContext(source).participants[0].companion;
    };

    it('carries the equipped companion into the context (D-20)', () => {
        expect(
            companionWith({
                pet: wolfId,
                ownedPets: [{ pet: wolfId, xp: 40, currentLifePoints: 30 }],
            }),
        ).toEqual({
            petId: wolfId.toHexString(),
            attack: { base: [{ type: 'cut', power: 30 }], energy: [] },
            defense: { base: [{ type: 'blunt', power: 5 }], energy: [] },
            currentLifePoints: 30,
            maxLifePoints: 50,
            xp: 40,
        });
    });

    it('has no companion without an equipped pet (D-20)', () => {
        expect(
            companionWith({
                pet: null,
                ownedPets: [{ pet: wolfId, xp: 40, currentLifePoints: 30 }],
            }),
        ).toBeNull();
        expect(companionWith(null)).toBeNull();
    });

    it('drops a companion missing from the catalogue or not owned (D-20)', () => {
        const owned = {
            pet: wolfId,
            ownedPets: [{ pet: wolfId, xp: 40, currentLifePoints: 30 }],
        };

        expect(companionWith(owned, new Map())).toBeNull();
        expect(
            companionWith({
                pet: wolfId,
                ownedPets: [{ pet: id('62'), xp: 1, currentLifePoints: 1 }],
            }),
        ).toBeNull();
    });
});
