import { LoadedEntry } from 'src/content/loading/yaml-file';
import {
    EquipmentEntry,
    LootEntry,
    LoreEntry,
    PetEntry,
    SpellEntry,
} from 'src/content/schema/catalog.content';
import { validateEntry } from 'src/content/schema/validate-entry';

type Raw = Record<string, unknown>;

const COINS = { gold: 0, silver: 1, copper: 50 };
const NO_DAMAGES = { base: [], energy: [] };

const LORE: Raw = {
    id: '64b0000000000000000000a2',
    type: 'city',
    name: 'Borgo di Prova',
    description: 'Un borgo sulla collina.',
    image: null,
    relatedLore: ['64b0000000000000000000a1'],
};

const SPELL: Raw = {
    id: '64b0000000000000000000b1',
    name: 'Dardo di fuoco',
    description: 'Una fiammata.',
    useType: 'attack',
    energyDamage: { type: 'fire', power: 300 },
    requiredLearnTime: 3600000,
    minXpToLearn: 4000,
    recoveryTime: 3600000,
    maxUsages: 2,
};

const EQUIPMENT: Raw = {
    id: '64b0000000000000000000e1',
    name: 'Spada di prova',
    itemType: 'EquipmentItem',
    description: 'Una lama corta.',
    sellPrice: COINS,
    buyPrice: null,
    rarity: 'common',
    equipType: 'weapon',
    addedSpell: null,
    damages: { base: [{ type: 'cut', power: 500 }], energy: [] },
};

const LOOT: Raw = {
    id: '64b0000000000000000000f1',
    name: 'Pozione di prova',
    itemType: 'LootItem',
    description: 'Cura le ferite.',
    sellPrice: COINS,
    buyPrice: COINS,
    rarity: 'common',
    power: 1000,
    effect: 'heal',
};

const PET: Raw = {
    id: '64b000000000000000000201',
    name: 'Cavallo di prova',
    damages: NO_DAMAGES,
    buyPrice: COINS,
    sellPrice: COINS,
    xp: 0,
    maxXp: 1000,
    currentLifePoints: 500,
    maxLifePoints: 500,
    imagePath: 'assets/images/cavallo.png',
    speedModifier: 2,
};

function entryOf(raw: Raw): LoadedEntry {
    return { file: 'catalogo/esempio.yaml', line: 1, raw };
}

function without(raw: Raw, key: string): Raw {
    return Object.fromEntries(
        Object.entries(raw).filter(([name]) => name !== key),
    );
}

const ENTRY_CLASSES = {
    lore: LoreEntry,
    spell: SpellEntry,
    equipment: EquipmentEntry,
    loot: LootEntry,
    pet: PetEntry,
};

type Kind = keyof typeof ENTRY_CLASSES;

function issuesOf(kind: Kind, raw: Raw): string[] {
    return validateEntry(ENTRY_CLASSES[kind], entryOf(raw)).map(
        ({ path }) => path,
    );
}

describe('catalog entries (D-28)', () => {
    it.each<[string, Kind, Raw]>([
        [
            'a city lore with its city',
            'lore',
            { ...LORE, city: '64b0000000000000000000c1' },
        ],
        [
            'a lore without city, image and related lore',
            'lore',
            without(without(without(LORE, 'image'), 'relatedLore'), 'city'),
        ],
        ['a spell', 'spell', SPELL],
        ['an equipment item', 'equipment', EQUIPMENT],
        [
            'an equipment item with sellable',
            'equipment',
            { ...EQUIPMENT, sellable: false },
        ],
        ['a loot item', 'loot', LOOT],
        ['a loot item with sellable', 'loot', { ...LOOT, sellable: true }],
        ['a pet', 'pet', PET],
        ['a pet that cannot be ridden', 'pet', { ...PET, speedModifier: null }],
    ])('accepts %s', (_, kind, raw) => {
        expect(issuesOf(kind, raw)).toEqual([]);
    });

    it.each<[string, Kind, Raw, string]>([
        [
            'a lore type outside LoreType',
            'lore',
            { ...LORE, type: 'town' },
            'type',
        ],
        [
            'a lore without description',
            'lore',
            without(LORE, 'description'),
            'description',
        ],
        [
            'the removed lore unlocked flag (D-25)',
            'lore',
            { ...LORE, unlocked: true },
            'unlocked',
        ],
        [
            'a city id on a lore that is not a city',
            'lore',
            { ...LORE, type: 'region', city: '64b0000000000000000000c1' },
            'city',
        ],
        [
            'a spell with no usage',
            'spell',
            { ...SPELL, maxUsages: 0 },
            'maxUsages',
        ],
        [
            'a spell above the experience cap',
            'spell',
            { ...SPELL, minXpToLearn: 60000 },
            'minXpToLearn',
        ],
        [
            'an equipment item typed as loot',
            'equipment',
            { ...EQUIPMENT, itemType: 'LootItem' },
            'itemType',
        ],
        [
            'equipment damages as an object instead of a list',
            'equipment',
            {
                ...EQUIPMENT,
                damages: { base: { type: 'cut', power: 500 }, energy: [] },
            },
            'damages.base',
        ],
        [
            'negative coins',
            'equipment',
            { ...EQUIPMENT, sellPrice: { ...COINS, copper: -1 } },
            'sellPrice.copper',
        ],
        [
            'fractional coins',
            'loot',
            { ...LOOT, buyPrice: { ...COINS, copper: 1.5 } },
            'buyPrice.copper',
        ],
        [
            'a loot effect outside EffectType',
            'loot',
            { ...LOOT, effect: 'food' },
            'effect',
        ],
        [
            'a non boolean sellable',
            'loot',
            { ...LOOT, sellable: 'no' },
            'sellable',
        ],
        [
            'a pet without image path',
            'pet',
            without(PET, 'imagePath'),
            'imagePath',
        ],
        [
            'a pet with a zero speed modifier',
            'pet',
            { ...PET, speedModifier: 0 },
            'speedModifier',
        ],
        [
            'a pet with more life than its maximum',
            'pet',
            { ...PET, currentLifePoints: 600 },
            'currentLifePoints',
        ],
    ])('rejects %s', (_, kind, raw, path) => {
        expect(issuesOf(kind, raw)).toEqual([path]);
    });
});
