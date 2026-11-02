import {
    citySizeOf,
    dungeonSizeKeyOf,
    questFileOf,
    regionalGroupOf,
} from 'src/content/generation/city-profile';

describe('city profile', () => {
    it.each([
        ['drusteaSeaCity', 'city'],
        ['ferrionCity', 'city'],
        ['elfCapital', 'capital'],
        ['flameNorthCapital', 'capital'],
        ['talmvereVillage', 'village'],
    ])('sizes %s as %s', (type, size) => {
        expect(citySizeOf(type)).toBe(size);
    });

    it.each([
        ['drusteaSeaCity', 'SeaCity'],
        ['valanCity', 'City'],
        ['mirwaCapital', 'Capital'],
        ['desertVillage', 'Village'],
    ])('keys the dungeon size of %s as %s', (type, key) => {
        expect(dungeonSizeKeyOf(type)).toBe(key);
    });

    it('rejects a city type without a size suffix', () => {
        expect(() => citySizeOf('somewhere')).toThrow(RangeError);
    });

    it.each([
        ['flameVillage', 'flame'],
        ['flameNorthCapital', 'flame'],
        ['drusteaCity', 'drustea'],
        ['desertVillage', 'desertVillage'],
        ['ferrionCity', 'ferrionCity'],
    ])('groups %s in %s', (type, group) => {
        expect(regionalGroupOf(type)).toBe(group);
    });

    it.each([
        ['motherCity', 'madre'],
        ['flameCity', 'fiamme'],
        ['valanCapital', 'valan'],
        ['liberiaVillage', 'liberia'],
        ['elfCapital', 'speciali'],
        ['necrorianCity', 'speciali'],
    ])('files the quests of %s in %s', (type, file) => {
        expect(questFileOf(type)).toBe(file);
    });
});
