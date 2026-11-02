import { ObjectId } from 'mongodb';
import {
    enemyEntryOf,
    equipmentEntryOf,
    lootEntryOf,
    loreEntryOf,
    petEntryOf,
    spellEntryOf,
    worldCityOf,
} from './entry-from-document';

const REGION = new ObjectId('64b0000000000000000000a1');
const CITY_LORE = new ObjectId('64b0000000000000000000a2');
const CITY = new ObjectId('64b0000000000000000000c1');
const SPELL = new ObjectId('64b0000000000000000000b1');
const SWORD = new ObjectId('64b0000000000000000000e1');
const POTION = new ObjectId('64b0000000000000000000f1');
const WOLF = new ObjectId('64b000000000000000000101');
const HORSE = new ObjectId('64b000000000000000000201');
const MARKER = new ObjectId('64b0000000000000000000d1');
const FOREST = new ObjectId('64b0000000000000000000d2');

const NO_CITIES = new Map<string, string>();

const coins = (copper: number) => ({ gold: 0, silver: 0, copper });

function cityLoreDocument(extra: Record<string, unknown> = {}) {
    return {
        _id: CITY_LORE,
        type: 'city',
        image: null,
        name: 'Borgo di Prova',
        description: 'Un borgo.',
        relatedLore: [REGION],
        ...extra,
    };
}

function swordDocument(extra: Record<string, unknown> = {}) {
    return {
        _id: SWORD,
        name: 'Spada di Prova',
        itemType: 'EquipmentItem',
        description: 'Una lama.',
        sellPrice: coins(150),
        buyPrice: coins(75),
        rarity: 'common',
        equipType: 'weapon',
        addedSpell: SPELL,
        damages: { base: [{ type: 'cut', power: 500 }], energy: [] },
        ...extra,
    };
}

const spellDocument = {
    _id: SPELL,
    name: 'Dardo di Prova',
    description: 'Una fiammata.',
    useType: 'attack',
    energyDamage: { type: 'fire', power: 300 },
    requiredLearnTime: 3600000,
    minXpToLearn: 4000,
    recoveryTime: 3600000,
    maxUsages: 2,
};

describe('entry-from-document', () => {
    it('turns ObjectId references into hex strings', () => {
        const lore = loreEntryOf(cityLoreDocument(), NO_CITIES).entry;
        const sword = equipmentEntryOf(swordDocument()).entry;

        expect(lore.id).toBe(CITY_LORE.toHexString());
        expect(lore.relatedLore).toEqual([REGION.toHexString()]);
        expect(sword.addedSpell).toBe(SPELL.toHexString());
    });

    it('drops __v and unlocked (D-25)', () => {
        const exported = loreEntryOf(
            cityLoreDocument({ __v: 0, unlocked: true }),
            NO_CITIES,
        );

        expect(exported.entry).not.toHaveProperty('__v');
        expect(exported.entry).not.toHaveProperty('unlocked');
        expect(exported.dropped).toEqual([]);
    });

    it('normalizes a single damages.base object into a list and reports it', () => {
        const exported = equipmentEntryOf(
            swordDocument({
                damages: {
                    base: { type: 'cut', power: 500 },
                    energy: { type: 'fire', power: 100 },
                },
            }),
        );

        expect(exported.entry.damages).toEqual({
            base: [{ type: 'cut', power: 500 }],
            energy: [{ type: 'fire', power: 100 }],
        });
        expect(exported.normalized).toEqual(['damages.base', 'damages.energy']);
    });

    it('fills missing schema keys with their defaults', () => {
        const lore = loreEntryOf(
            { _id: REGION, type: 'region', name: 'Regione', description: 'R.' },
            NO_CITIES,
        ).entry;
        const sword = swordDocument();
        delete (sword as Record<string, unknown>).addedSpell;
        delete (sword as Record<string, unknown>).damages;
        delete (sword as Record<string, unknown>).sellPrice;
        const pet = petEntryOf({
            _id: HORSE,
            name: 'Cavallo',
            damages: { base: [] },
            buyPrice: { gold: 1 },
            sellPrice: coins(5),
            xp: 0,
            maxXp: 10,
            currentLifePoints: 5,
            maxLifePoints: 5,
            imagePath: 'assets/images/cavallo.png',
        }).entry;

        expect(lore).toEqual({
            id: REGION.toHexString(),
            type: 'region',
            name: 'Regione',
            description: 'R.',
            image: null,
            relatedLore: [],
        });
        expect(equipmentEntryOf(sword).entry).toEqual(
            expect.objectContaining({
                sellPrice: null,
                addedSpell: null,
                damages: { base: [], energy: [] },
            }),
        );
        expect(pet.damages).toEqual({ base: [], energy: [] });
        expect(pet.buyPrice).toEqual({ gold: 1, silver: 0, copper: 0 });
        expect(pet.speedModifier).toBeNull();
    });

    it('reports unknown fields as dropped', () => {
        const exported = lootEntryOf({
            _id: POTION,
            name: 'Pozione',
            itemType: 'LootItem',
            description: 'Rossa.',
            sellPrice: coins(20),
            buyPrice: null,
            rarity: 'common',
            power: 1000,
            effect: 'heal',
            sellable: true,
            legacyStock: 3,
            __v: 0,
        });

        expect(exported.dropped).toEqual(['legacyStock']);
        expect(exported.entry).not.toHaveProperty('legacyStock');
        expect(exported.entry.sellable).toBe(true);
        expect(Object.keys(exported.entry)).toEqual([
            'id',
            'name',
            'itemType',
            'description',
            'sellPrice',
            'buyPrice',
            'rarity',
            'power',
            'effect',
            'sellable',
        ]);
    });

    it('derives the lore city from the city that links it (D-23)', () => {
        const cityByLore = new Map([
            [CITY_LORE.toHexString(), CITY.toHexString()],
        ]);

        expect(loreEntryOf(cityLoreDocument(), cityByLore).entry.city).toBe(
            CITY.toHexString(),
        );
        expect(
            loreEntryOf(cityLoreDocument({ type: 'region' }), cityByLore).entry,
        ).not.toHaveProperty('city');
    });

    it('exports the enemy spells as catalog ids', () => {
        const exported = enemyEntryOf({
            _id: WOLF,
            name: 'Golem',
            locations: ['forest'],
            energyWeaknesses: [],
            baseWeaknesses: [],
            relatedLore: [],
            xp: 63,
            spells: [spellDocument],
            lifePoints: 5000,
            imagePath: 'assets/images/golem.png',
            damages: { base: [{ type: 'blunt', power: 1000 }], energy: [] },
        });

        expect(exported.entry.spells).toEqual([SPELL.toHexString()]);
    });

    it('exports enemies as monsters with explicit values', () => {
        const exported = enemyEntryOf({
            _id: WOLF,
            name: 'Lupo',
            locations: ['forest'],
            relatedLore: [REGION],
            xp: 7,
            lifePoints: 1100,
            imagePath: 'assets/images/lupo.png',
            damages: { base: { type: 'pierce', power: 700 } },
        });

        expect(exported.entry).toEqual({
            id: WOLF.toHexString(),
            name: 'Lupo',
            category: 'monster',
            locations: ['forest'],
            energyWeaknesses: [],
            baseWeaknesses: [],
            relatedLore: [REGION.toHexString()],
            spells: [],
            imagePath: 'assets/images/lupo.png',
            xp: 7,
            lifePoints: 1100,
            damages: { base: [{ type: 'pierce', power: 700 }], energy: [] },
        });
        expect(exported.entry).not.toHaveProperty('source');
        expect(exported.normalized).toEqual(['damages.base']);
    });

    it('exports a spell in the order of its schema', () => {
        const exported = spellEntryOf({ ...spellDocument, __v: 0 });

        expect(Object.keys(exported.entry)).toEqual([
            'id',
            'name',
            'description',
            'useType',
            'energyDamage',
            'requiredLearnTime',
            'minXpToLearn',
            'recoveryTime',
            'maxUsages',
        ]);
        expect(exported.dropped).toEqual([]);
    });

    it('writes the world snapshot of a city with its points of interest by id (Pitfall 10)', () => {
        const city = worldCityOf(
            {
                _id: CITY,
                type: 'drusteaVillage',
                area: [[1, 2]],
                name: 'Borgo di Prova',
                markerLocation: MARKER,
                relatedLore: CITY_LORE,
                pointsOfInterest: [FOREST, MARKER],
            },
            [
                {
                    _id: FOREST,
                    type: 'forest',
                    location: [9.2, 45.5],
                    city: CITY,
                },
                {
                    _id: MARKER,
                    type: ['city'],
                    location: [9.1, 45.4],
                    city: CITY,
                },
            ],
        );

        expect(city).toEqual({
            id: CITY.toHexString(),
            name: 'Borgo di Prova',
            type: 'drusteaVillage',
            markerLocation: MARKER.toHexString(),
            relatedLore: CITY_LORE.toHexString(),
            pointsOfInterest: [
                {
                    id: MARKER.toHexString(),
                    type: ['city'],
                    location: [9.1, 45.4],
                },
                {
                    id: FOREST.toHexString(),
                    type: ['forest'],
                    location: [9.2, 45.5],
                },
            ],
        });
    });
});
