import {
    buildSpell,
    buildUser,
    buildRoad,
    buildPoi,
    buildCharacter,
    buildQuest,
} from './index';

/**
 * UNIT: buildX produces deterministic plain objects with required fields set,
 * and top-level overrides win. No DB — runs in the fast unit project.
 */
describe('fixtures builders', () => {
    describe('buildSpell', () => {
        it('sets valid enum values and required fields', () => {
            const spell = buildSpell();
            expect(spell.useType).toBe('attack');
            expect(spell.energyDamage).toEqual({ type: 'fire', power: 10 });
            expect(spell.maxUsages).toBe(3);
        });

        it('applies overrides', () => {
            expect(buildSpell({ maxUsages: 5 }).maxUsages).toBe(5);
        });
    });

    describe('buildUser', () => {
        it('uses a fake deterministic twitchId, never a real one', () => {
            const user = buildUser();
            expect(user.twitchId).toBe('twitch-test-1');
            expect(user.role).toBe('adventurer');
            expect(user.currentCharacter).toBeNull();
        });
    });

    describe('buildRoad', () => {
        it('provides the three required fields', () => {
            const road = buildRoad();
            expect(road.coordinates.length).toBe(2);
            expect(road.length).toBe(1);
            expect(road.speedFactor).toBe(1);
        });
    });

    describe('buildPoi', () => {
        it('sets required location and a city ObjectId', () => {
            const poi = buildPoi();
            expect(poi.location).toEqual([0, 0]);
            expect(poi.type).toBe('city');
            expect(poi.city).toBeDefined();
        });
    });

    describe('buildCharacter', () => {
        it('defaults xp to 20000 so maxActiveSpells virtual yields one slot', () => {
            expect(buildCharacter().status.xp).toBe(20000);
        });

        it('sets a required location ObjectId', () => {
            expect(buildCharacter().status.location).toBeDefined();
        });

        it('applies top-level overrides', () => {
            const hero = buildCharacter({ infos: { name: 'Override Hero' } });
            expect(hero.infos.name).toBe('Override Hero');
        });
    });

    describe('buildQuest', () => {
        it('sets required markerLocation and a valid QuestType', () => {
            const quest = buildQuest();
            expect(quest.infos.type).toBe('hunt');
            expect(quest.infos.markerLocation).toBeDefined();
            expect(quest.registeredAdventurers).toEqual([]);
        });
    });
});
