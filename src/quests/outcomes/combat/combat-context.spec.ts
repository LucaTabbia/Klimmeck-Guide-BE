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
    },
    assets: {
        wearedEquipment: {
            rightHand: swordId,
            leftHand: shieldId.toHexString(),
            head: null,
        },
        activeSpells: [{ spell: fireballId, usages: 2 }],
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
    enemy: {
        _id: id('b1'),
        name: 'Wolf',
        lifePoints: 1000,
        xp: 100,
        damages: { base: { type: 'cut', power: 80 } },
        baseWeaknesses: ['blunt'],
        energyWeaknesses: ['fire'],
    },
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
        expect(context.enemy).toEqual({
            id: id('b1').toHexString(),
            name: 'Wolf',
            lifePoints: 1000,
            xp: 100,
            damages: { base: [{ type: 'cut', power: 80 }], energy: [] },
            baseWeaknesses: ['blunt'],
            energyWeaknesses: ['fire'],
        });
        expect(context.participants.map((p) => p.characterId)).toEqual([
            id('a1').toHexString(),
            id('a2').toHexString(),
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
        });
    });

    it('fills missing numbers with safe defaults', () => {
        const source = hydration();
        source.enemy = { _id: id('b2') };
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
        });
        expect(context.enemy).toEqual({
            id: id('b2').toHexString(),
            name: '',
            lifePoints: 0,
            xp: 0,
            damages: { base: [], energy: [] },
            baseWeaknesses: [],
            energyWeaknesses: [],
        });
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

    it('does not mutate the input snapshots', () => {
        const source = hydration();

        buildCombatContext(source);

        expect(source).toEqual(hydration());
    });
});
