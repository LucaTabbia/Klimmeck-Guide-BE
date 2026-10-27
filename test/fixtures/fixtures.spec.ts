import mongoose, { Types } from 'mongoose';
import { CharacterStatusSchema } from 'src/models/character/character-status.model';
import { EnemySchema } from 'src/models/enemy.model';
import {
    buildCity,
    buildSpell,
    buildUser,
    buildRoad,
    buildPoi,
    buildCharacter,
    buildQuest,
    buildEquipmentItem,
    buildLootItem,
    buildEnemy,
    spellBook,
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
        it('defaults to a rookie with 20000 xp: no spell slot until the mage rank', () => {
            const StatusProbe =
                mongoose.models.FixtureStatusSlotsProbe ??
                mongoose.model(
                    'FixtureStatusSlotsProbe',
                    CharacterStatusSchema,
                );
            const status = buildCharacter().status;

            expect(status.xp).toBe(20000);
            expect(status.title).toBe('rookie');
            expect(new StatusProbe(status).get('maxActiveSpells')).toBe(0);
            expect(
                new StatusProbe({ ...status, title: 'mage' }).get(
                    'maxActiveSpells',
                ),
            ).toBe(1);
        });

        it('sets a required location ObjectId', () => {
            expect(buildCharacter().status.location).toBeDefined();
        });

        it('applies top-level overrides', () => {
            const hero = buildCharacter({ infos: { name: 'Override Hero' } });
            expect(hero.infos.name).toBe('Override Hero');
        });

        it('starts with empty spell states (D-03)', () => {
            expect(buildCharacter().status.spellStates).toEqual([]);
        });
    });

    describe('spellBook', () => {
        const first = new Types.ObjectId();
        const second = new Types.ObjectId();
        const earlier = new Date('2026-10-27T10:00:00.000Z');
        const later = new Date('2026-10-27T10:05:00.000Z');

        it('builds spells, spell states and active spells in the same order', () => {
            expect(
                spellBook([
                    {
                        spell: first,
                        usages: 1,
                        recoveries: [later, earlier],
                        active: true,
                    },
                    { spell: second, usages: 3 },
                ]),
            ).toEqual({
                spells: [first, second],
                spellStates: [
                    { spell: first, usages: 1, recoveries: [later, earlier] },
                    { spell: second, usages: 3, recoveries: [] },
                ],
                activeSpells: [{ spell: first, usages: 1 }],
            });
        });

        it('keeps a legacy string ref on spells and active spells and casts it on the state', () => {
            const legacy = new Types.ObjectId().toHexString();
            const book = spellBook([
                { spell: legacy, usages: 2, active: true },
            ]);

            expect(book.spells[0]).toBe(legacy);
            expect(book.activeSpells[0].spell).toBe(legacy);
            expect(book.spellStates[0].spell).toBeInstanceOf(Types.ObjectId);
            expect(book.spellStates[0].spell.toHexString()).toBe(legacy);
        });

        it('copies the given recoveries', () => {
            const recoveries = [earlier];
            const book = spellBook([{ spell: first, usages: 0, recoveries }]);

            expect(book.spellStates[0].recoveries).toEqual(recoveries);
            expect(book.spellStates[0].recoveries).not.toBe(recoveries);
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

    describe('buildCity', () => {
        it('sets a valid CityType and the required fields', () => {
            const city = buildCity();
            expect(city.type).toBe('drusteaCapital');
            expect(city.name).toBe('Test City');
            expect(city.area).toEqual([]);
            expect(city.pointsOfInterest).toEqual([]);
            expect(city.relatedLore).toBeNull();
        });

        it('sets a fresh markerLocation ObjectId on every call', () => {
            const first = buildCity().markerLocation;
            const second = buildCity().markerLocation;
            expect(first).toBeInstanceOf(Types.ObjectId);
            expect(first.equals(second)).toBe(false);
        });

        it('applies overrides', () => {
            expect(buildCity({ type: 'elfCapital' }).type).toBe('elfCapital');
        });
    });
    describe('buildEquipmentItem', () => {
        it('sets prices and valid enums', () => {
            const sword = buildEquipmentItem();
            expect(sword.buyPrice).toEqual({ gold: 0, silver: 1, copper: 50 });
            expect(sword.sellPrice).toEqual({ gold: 0, silver: 0, copper: 75 });
            expect(sword.equipType).toBe('weapon');
            expect(sword.rarity).toBe('common');
            expect(sword.damages).toEqual({ base: [], energy: [] });
        });

        it('applies overrides', () => {
            expect(buildEquipmentItem({ buyPrice: null }).buyPrice).toBeNull();
        });
    });

    describe('buildLootItem', () => {
        it('sets prices and valid enums', () => {
            const potion = buildLootItem();
            expect(potion.buyPrice).toEqual({ gold: 0, silver: 0, copper: 20 });
            expect(potion.sellPrice).toEqual({
                gold: 0,
                silver: 0,
                copper: 10,
            });
            expect(potion.effect).toBe('heal');
            expect(potion.power).toBe(1);
        });
    });

    describe('buildEnemy', () => {
        const EnemyProbe =
            mongoose.models.EnemyFixtureProbe ??
            mongoose.model('EnemyFixtureProbe', EnemySchema);

        it('builds a valid enemy at the D-12 scale', () => {
            const enemy = buildEnemy();

            expect(new EnemyProbe(enemy).validateSync()).toBeUndefined();
            expect(enemy.lifePoints).toBe(1000);
            expect(enemy.xp).toBe(100);
            expect(enemy.damages.base).toEqual([{ type: 'cut', power: 100 }]);
        });

        it('applies overrides', () => {
            const enemy = buildEnemy({ name: 'Ogre', lifePoints: 3000 });

            expect(enemy.name).toBe('Ogre');
            expect(enemy.lifePoints).toBe(3000);
        });
    });
});
