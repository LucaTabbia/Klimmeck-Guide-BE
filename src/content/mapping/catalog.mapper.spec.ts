import { ObjectId } from 'mongodb';
import { assertNoUndefined } from 'src/content/mapping/canonical';
import {
    cityLoreOf,
    imageUrlsOf,
    mapEquipment,
    mapLoot,
    mapLore,
    mapPet,
    mapSpell,
} from 'src/content/mapping/catalog.mapper';
import type {
    EquipmentEntry,
    LootEntry,
    LoreEntry,
    PetEntry,
    SpellEntry,
} from 'src/content/schema/catalog.content';
import {
    entryOf,
    loadTestContentTree,
} from '../../../test/fixtures/content-tree.fixture';

const REGION_ID = '64b0000000000000000000a1';
const CITY_LORE_ID = '64b0000000000000000000a2';
const VILLAGE_ID = '64b0000000000000000000c1';
const SPELL_ID = '64b0000000000000000000b1';
const SWORD_ID = '64b0000000000000000000e1';
const POTION_ID = '64b0000000000000000000f1';
const HORSE_ID = '64b000000000000000000201';
const CLOUDINARY = 'https://res.cloudinary.com/klimmeck/image/upload';
const NO_IMAGES = imageUrlsOf([]);

function loreEntry(id: string): LoreEntry {
    return entryOf(loadTestContentTree(), 'lore', id) as unknown as LoreEntry;
}

function equipmentEntry(): EquipmentEntry {
    const raw = entryOf(loadTestContentTree(), 'equipmentitems', SWORD_ID);
    return raw as unknown as EquipmentEntry;
}

function lootEntry(): LootEntry {
    const raw = entryOf(loadTestContentTree(), 'lootitems', POTION_ID);
    return raw as unknown as LootEntry;
}

function petEntry(): PetEntry {
    const raw = entryOf(loadTestContentTree(), 'pets', HORSE_ID);
    return raw as unknown as PetEntry;
}

describe('catalog mapper', () => {
    it('writes the lore keys in schema order with ObjectId references', () => {
        const mapped = mapLore(loreEntry(CITY_LORE_ID), NO_IMAGES);

        assertNoUndefined(mapped.set);
        expect(mapped._id.toHexString()).toBe(CITY_LORE_ID);
        expect(mapped.setOnInsert).toBeNull();
        expect(Object.keys(mapped.set)).toEqual([
            'type',
            'image',
            'name',
            'description',
            'relatedLore',
        ]);
        expect(mapped.set.relatedLore[0]).toBeInstanceOf(ObjectId);
        expect(mapped.set.relatedLore[0].toHexString()).toBe(REGION_ID);
    });

    it('writes the lore defaults when the optional fields are absent', () => {
        const entry = loreEntry(REGION_ID);
        delete entry.image;
        delete entry.relatedLore;

        const mapped = mapLore(entry, NO_IMAGES);

        assertNoUndefined(mapped.set);
        expect(mapped.set.image).toBeNull();
        expect(mapped.set.relatedLore).toEqual([]);
    });

    it('takes the lore image from images.yaml when present (D-24)', () => {
        const url = `${CLOUDINARY}/regione.png`;
        const images = imageUrlsOf([{ id: REGION_ID, url }]);

        const mapped = mapLore(loreEntry(REGION_ID), images);

        assertNoUndefined(mapped.set);
        expect(mapped.set.image).toBe(url);
    });

    it('never writes the file-only city field (D-23)', () => {
        const mapped = mapLore(loreEntry(CITY_LORE_ID), NO_IMAGES);

        assertNoUndefined(mapped.set);
        expect(mapped.set).not.toHaveProperty('city');
        expect(mapped.set).not.toHaveProperty('id');
        expect(mapped.set).not.toHaveProperty('_id');
    });

    it('derives the city update from a city lore (D-23)', () => {
        const update = cityLoreOf(loreEntry(CITY_LORE_ID));

        expect(update).not.toBeNull();
        assertNoUndefined(update);
        expect(Object.keys(update!)).toEqual(['cityId', 'relatedLore']);
        expect(update!.cityId).toBeInstanceOf(ObjectId);
        expect(update!.cityId.toHexString()).toBe(VILLAGE_ID);
        expect(update!.relatedLore.toHexString()).toBe(CITY_LORE_ID);
        expect(cityLoreOf(loreEntry(REGION_ID))).toBeNull();
    });

    it('writes the spell keys in schema order', () => {
        const raw = entryOf(loadTestContentTree(), 'spells', SPELL_ID);

        const mapped = mapSpell(raw as unknown as SpellEntry);

        assertNoUndefined(mapped.set);
        expect(Object.keys(mapped.set)).toEqual([
            'name',
            'description',
            'useType',
            'energyDamage',
            'requiredLearnTime',
            'minXpToLearn',
            'recoveryTime',
            'maxUsages',
        ]);
        expect(mapped.set.energyDamage).toEqual({ type: 'fire', power: 300 });
    });

    it('writes coins as gold, silver, copper integers', () => {
        const entry = equipmentEntry();
        entry.sellPrice = { copper: 50, silver: 1, gold: 0 } as never;

        const mapped = mapEquipment(entry);

        assertNoUndefined(mapped.set);
        expect(Object.keys(mapped.set.sellPrice)).toEqual([
            'gold',
            'silver',
            'copper',
        ]);
        expect(mapped.set.sellPrice).toEqual({
            gold: 0,
            silver: 1,
            copper: 50,
        });
        expect(Number.isInteger(mapped.set.sellPrice.copper)).toBe(true);
    });

    it('writes the equipment keys in schema order', () => {
        const entry = equipmentEntry();
        entry.buyPrice = null;

        const mapped = mapEquipment(entry);

        assertNoUndefined(mapped.set);
        expect(Object.keys(mapped.set)).toEqual([
            'name',
            'itemType',
            'description',
            'sellPrice',
            'buyPrice',
            'rarity',
            'equipType',
            'addedSpell',
            'damages',
        ]);
        expect(mapped.set.buyPrice).toBeNull();
        expect(mapped.set.addedSpell).toBeNull();
        expect(mapped.set.damages).toEqual({
            base: [{ type: 'cut', power: 500 }],
            energy: [],
        });
    });

    it('writes the added spell of an equipment as an ObjectId', () => {
        const entry = equipmentEntry();
        entry.addedSpell = SPELL_ID;

        const mapped = mapEquipment(entry);

        expect(mapped.set.addedSpell).toBeInstanceOf(ObjectId);
        expect(mapped.set.addedSpell.toHexString()).toBe(SPELL_ID);
    });

    it('keeps the legacy sellable flag only when the file has it', () => {
        const equipment = equipmentEntry();
        const loot = lootEntry();
        loot.sellable = false;

        const withoutFlag = mapEquipment(equipment);
        const withFlag = mapLoot(loot);

        assertNoUndefined(withoutFlag.set);
        assertNoUndefined(withFlag.set);
        expect(withoutFlag.set).not.toHaveProperty('sellable');
        expect(Object.keys(withFlag.set)).toEqual([
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
        expect(withFlag.set.sellable).toBe(false);
    });

    it('writes the pet keys in schema order', () => {
        const entry = petEntry();
        delete entry.speedModifier;

        const mapped = mapPet(entry, NO_IMAGES);

        assertNoUndefined(mapped.set);
        expect(Object.keys(mapped.set)).toEqual([
            'name',
            'damages',
            'buyPrice',
            'sellPrice',
            'xp',
            'maxXp',
            'currentLifePoints',
            'maxLifePoints',
            'imagePath',
            'speedModifier',
        ]);
        expect(mapped.set.speedModifier).toBeNull();
        expect(mapped.set.imagePath).toBe('assets/images/cavallo-di-prova.png');
    });

    it('writes the pet image from images.yaml (D-24)', () => {
        const url = `${CLOUDINARY}/cavallo.png`;
        const images = imageUrlsOf([{ id: HORSE_ID, url }]);

        const mapped = mapPet(petEntry(), images);

        assertNoUndefined(mapped.set);
        expect(mapped.set.imagePath).toBe(url);
        expect(mapped.set.speedModifier).toBe(2);
    });
});
