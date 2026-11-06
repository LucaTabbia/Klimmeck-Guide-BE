import { ChanceSource } from 'src/quests/outcomes/chance-source';
import { hourFormatterOf, localHourOf } from 'src/travel/ambush/ambush-clock';
import {
    AmbushDrawInput,
    DrawnAmbush,
    drawAmbush,
} from 'src/travel/ambush/ambush-draw';
import { SequenceChance } from '../../../test/quests/sequence-chance';

const DAY_START = new Date('2026-07-01T10:00:00.000Z');
const NIGHT_START = new Date('2026-07-01T20:00:00.000Z');
const HOURS_20 = 72_000_000;
const rome = hourFormatterOf('Europe/Rome');
const hourOf = (instant: Date): number => localHourOf(rome, instant);

const draw = (
    overrides: Partial<AmbushDrawInput>,
    chance: ChanceSource,
): DrawnAmbush | null =>
    drawAmbush({
        road: { distance: 20 },
        startTime: DAY_START,
        durationMs: HOURS_20,
        fromKm: 0,
        chance,
        hourOf,
        ...overrides,
    });

describe('ambush draw', () => {
    it('rolls one chance per whole km and none past the last whole km (D-01)', () => {
        const chance = new SequenceChance([], 0.99);
        expect(draw({}, chance)).toBeNull();
        expect(chance.drawn.length).toBe(19);

        const longer = new SequenceChance([], 0.99);
        expect(draw({ road: { distance: 20.5 } }, longer)).toBeNull();
        expect(longer.drawn.length).toBe(20);
    });

    it('fixes the ambush at the first km under the day hazard (D-01)', () => {
        const chance = new SequenceChance([0.99, 0.99, 0.001]);
        expect(draw({}, chance)).toEqual({
            km: 3,
            at: new Date('2026-07-01T13:00:00.000Z'),
        });
    });

    it('uses the night hazard on a km travelled at night (D-01)', () => {
        const night = new SequenceChance([0.004]);
        expect(draw({ startTime: NIGHT_START }, night)).toEqual({
            km: 1,
            at: new Date('2026-07-01T21:00:00.000Z'),
        });

        const day = new SequenceChance([0.004], 0.99);
        expect(draw({ startTime: DAY_START }, day)).toBeNull();
        expect(day.drawn[0]).toBe(0.004);
    });

    it('switches to the night hazard when the km is crossed after 22 (D-01)', () => {
        const chance = new SequenceChance([0.004, 0.004]);
        expect(
            draw({ startTime: new Date('2026-07-01T18:30:00.000Z') }, chance),
        ).toEqual({ km: 2, at: new Date('2026-07-01T20:30:00.000Z') });
    });

    it('never sets an ambush at or after the end of the travel (D-01)', () => {
        const short = { road: { distance: 10 }, durationMs: 36_000_000 };
        const endTime = DAY_START.getTime() + short.durationMs;

        expect(draw(short, new SequenceChance([], 0))).toEqual({
            km: 1,
            at: new Date('2026-07-01T11:00:00.000Z'),
        });

        const last = draw(
            short,
            new SequenceChance([...Array<number>(8).fill(0.99), 0.001]),
        );
        expect(last?.km).toBe(9);
        expect(last!.at.getTime()).toBeLessThan(endTime);

        const none = new SequenceChance([], 0.99);
        expect(draw(short, none)).toBeNull();
        expect(none.drawn.length).toBe(9);
    });

    it('never draws on a travel under ten km (D-03)', () => {
        const under = new SequenceChance([], 0);
        expect(draw({ road: { distance: 9.99 } }, under)).toBeNull();
        expect(under.drawn.length).toBe(0);

        const exact = new SequenceChance([], 0.99);
        expect(draw({ road: { distance: 10 } }, exact)).toBeNull();
        expect(exact.drawn.length).toBe(9);
    });

    it('redraws from the ambush km on the remaining road (D-02, D-03)', () => {
        expect(draw({ fromKm: 3 }, new SequenceChance([], 0))?.km).toBe(4);

        const remaining = new SequenceChance([], 0.99);
        expect(draw({ fromKm: 10 }, remaining)).toBeNull();
        expect(remaining.drawn.length).toBe(9);
    });

    it('never redraws with less than ten km left (D-03)', () => {
        const chance = new SequenceChance([], 0);
        expect(draw({ fromKm: 11 }, chance)).toBeNull();
        expect(chance.drawn.length).toBe(0);
    });

    it('answers null on a travel without duration (D-01)', () => {
        const chance = new SequenceChance([], 0);
        expect(draw({ durationMs: 0 }, chance)).toBeNull();
        expect(chance.drawn.length).toBe(0);
    });
});
