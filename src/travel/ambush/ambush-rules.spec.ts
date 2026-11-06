import { TitleType } from 'src/models/enums/title-type.enum';
import {
    AMBUSH_MAX_ATTEMPTS,
    AMBUSH_RULES,
    ambushPrizesOf,
    hazardAt,
    isNightHour,
    prizeRankOf,
} from 'src/travel/ambush/ambush-rules';

describe('ambush rules', () => {
    it('pins the soft hazard per km and the ten km thresholds (D-01, D-03, D-04)', () => {
        expect(AMBUSH_RULES).toEqual({
            dayHazardPerKm: 0.002,
            nightHazardPerKm: 0.006,
            nightStartHour: 22,
            nightEndHour: 6,
            minTravelKm: 10,
            minRemainingKm: 10,
        });
        expect(AMBUSH_MAX_ATTEMPTS).toBe(3);
    });

    it('counts the night from 22 to 6 local time (D-01)', () => {
        expect([0, 5, 6, 12, 21, 22, 23].map(isNightHour)).toEqual([
            true,
            true,
            false,
            false,
            false,
            true,
            true,
        ]);
    });

    it('uses the night hazard only at night (D-01)', () => {
        expect(hazardAt(23)).toBe(0.006);
        expect(hazardAt(3)).toBe(0.006);
        expect(hazardAt(6)).toBe(0.002);
        expect(hazardAt(14)).toBe(0.002);
    });

    it('plays the legend as a hero for the prizes (D-10)', () => {
        expect(prizeRankOf(TitleType.legend)).toBe('hero');
        expect(prizeRankOf(TitleType.mage)).toBe('mage');
        expect(prizeRankOf(TitleType.rookie)).toBe('rookie');
    });

    it('pays the generated enemy prize of the rank plus the enemies xp (D-10)', () => {
        expect(ambushPrizesOf(TitleType.rookie, 7)).toEqual({
            copper: 150,
            xp: 47,
        });
        expect(ambushPrizesOf(TitleType.adventurer, 0)).toEqual({
            copper: 300,
            xp: 80,
        });
        expect(ambushPrizesOf(TitleType.paladin, 10)).toEqual({
            copper: 750,
            xp: 210,
        });
        expect(ambushPrizesOf(TitleType.mage, 0)).toEqual({
            copper: 1800,
            xp: 480,
        });
        expect(ambushPrizesOf(TitleType.hero, 100)).toEqual({
            copper: 3750,
            xp: 1100,
        });
        expect(ambushPrizesOf(TitleType.legend, 0)).toEqual({
            copper: 3750,
            xp: 1000,
        });
    });
});
