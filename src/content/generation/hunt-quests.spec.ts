import { generateFixedQuests } from 'src/content/generation/fixed-quests.generator';
import { regionalGroupOf } from 'src/content/generation/city-profile';
import {
    buildGeneratorIndex,
    GENERATOR_IDS as ids,
    generatorConfig,
    generatorInput,
    infosOf,
    questsOf,
    requirementsOf,
} from '../../../test/content/generator-world.fixture';

const EASY_ANIMALS = [ids.wolf, ids.boar];

describe('generateFixedQuests hunts', () => {
    const result = generateFixedQuests(generatorInput());
    const index = buildGeneratorIndex();
    const hunts = questsOf(result, 'hunt');

    it('hunts only animals up to 200 PE (D-18)', () => {
        expect(hunts.length).toBeGreaterThan(0);
        for (const hunt of hunts) {
            expect(EASY_ANIMALS).toContain(infosOf(hunt).enemy);
        }
        expect(hunts.map((hunt) => infosOf(hunt).enemy)).not.toContain(
            ids.bear,
        );
    });

    it('keeps hunts to at most half the cities of a regional group (D-17)', () => {
        const share = generatorConfig().hunt.maxShareOfRegion;
        const groupSizes = new Map<string, number>();
        for (const city of index.cities.values()) {
            if (city.type === 'necrorianCity') continue;
            const group = regionalGroupOf(city.type);
            groupSizes.set(group, (groupSizes.get(group) ?? 0) + 1);
        }
        const huntsByGroup = new Map<string, number>();
        for (const hunt of hunts) {
            const group = regionalGroupOf(
                index.cities.get(hunt.city as string)!.type,
            );
            huntsByGroup.set(group, (huntsByGroup.get(group) ?? 0) + 1);
        }
        for (const [group, count] of huntsByGroup) {
            expect(count).toBeLessThanOrEqual(
                Math.floor(groupSizes.get(group)! * share),
            );
        }
        expect(huntsByGroup.get('drustea')).toBe(5);
        expect(huntsByGroup.get('ferrionCity')).toBeUndefined();
    });

    it('places a hunt on a non-marker, non-dungeon point where the animal lives (D-21)', () => {
        for (const hunt of hunts) {
            const city = index.cities.get(hunt.city as string)!;
            const marker = infosOf(hunt).markerLocation as string;
            const poi = index.pois.get(marker)!;
            const animal = index.byCollection.enemies.get(
                infosOf(hunt).enemy as string,
            )!;
            const habitat = animal.raw.locations as string[];
            expect(poi.cityId).toBe(city.id);
            expect(marker).not.toBe(city.markerLocation);
            expect(poi.poi.type).not.toContain('dungeon');
            expect(
                habitat.includes('all') ||
                    poi.poi.type.some((type) => habitat.includes(type)),
            ).toBe(true);
        }
    });

    it('sets hunts to rookie (D-18)', () => {
        for (const hunt of hunts) {
            expect(requirementsOf(hunt).minTitle).toBe('rookie');
            expect(requirementsOf(hunt).recommendedLoot).toEqual([]);
        }
    });

    it('never places two fixed quests on the same point (D-21)', () => {
        const markers = new Set(
            [...index.cities.values()].map((city) => city.markerLocation),
        );
        const points = result.quests
            .map((quest) => infosOf(quest.entry).markerLocation as string)
            .filter((poi) => !markers.has(poi));
        expect(new Set(points).size).toBe(points.length);
    });

    it('adds the animal lore to the hunt lore', () => {
        const wolfHunts = hunts.filter(
            (hunt) => infosOf(hunt).enemy === ids.wolf,
        );
        expect(wolfHunts.length).toBeGreaterThan(0);
        for (const hunt of wolfHunts) {
            const lore = infosOf(hunt).relatedLore as string[];
            expect(lore).toHaveLength(2);
            expect(lore[1]).toBe(ids.wolfLore);
        }
    });

    it('titles the hunt with the animal and the city (D-22)', () => {
        const [hunt] = hunts;
        const animal = index.namesById.get(infosOf(hunt).enemy as string);
        const city = index.cities.get(hunt.city as string)!.name;
        expect(infosOf(hunt).title).toBe(
            `Caccia: ${animal} nei dintorni di ${city}`,
        );
    });

    it('skips a city without any easy animal around (D-18)', () => {
        expect(questsOf(result, 'hunt', ids.villages[3])).toEqual([]);
    });
});
