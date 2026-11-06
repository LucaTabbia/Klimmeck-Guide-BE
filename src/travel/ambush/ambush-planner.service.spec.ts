import { Types } from 'mongoose';
import { TravelKind } from 'src/models/character/active-travel.model';
import type { ActiveTravelDraft } from 'src/travel/travel-timing';
import { SequenceChance } from '../../../test/quests/sequence-chance';
import { AmbushPlanner } from './ambush-planner.service';

const DAY_START = new Date('2026-07-01T10:00:00.000Z');
const NIGHT_START = new Date('2026-07-01T20:00:00.000Z');
const TWENTY_HOURS_MS = 72_000_000;

function draftOf(distance: number, startTime = DAY_START): ActiveTravelDraft {
    return {
        road: {
            coordinates: [
                [0, 0],
                [0, 9],
            ],
            distance,
        },
        startTime,
        endTime: new Date(startTime.getTime() + TWENTY_HOURS_MS),
        duration: TWENTY_HOURS_MS,
        to: new Types.ObjectId(),
        kind: TravelKind.free,
    };
}

describe('AmbushPlanner', () => {
    it('adds a drawn ambush with zero attempts to the departure (D-05)', () => {
        const planner = new AmbushPlanner(
            { timeZone: 'Europe/Rome' },
            new SequenceChance([], 0),
        );
        const draft = draftOf(20);
        const before = structuredClone(draft);

        expect(planner.withAmbush(draft)).toEqual({
            ...draft,
            ambush: {
                at: new Date('2026-07-01T11:00:00.000Z'),
                km: 1,
                attempts: 0,
            },
        });
        expect(draft).toEqual(before);
    });

    it('leaves a departure without ambush untouched (D-03, D-05)', () => {
        const never = new SequenceChance();
        const draft = draftOf(20);

        expect(
            new AmbushPlanner({ timeZone: 'Europe/Rome' }, never).withAmbush(
                draft,
            ),
        ).toBe(draft);
        expect(Object.keys(draft)).not.toContain('ambush');

        const short = draftOf(9);
        const always = new SequenceChance([], 0);

        expect(
            new AmbushPlanner({ timeZone: 'Europe/Rome' }, always).withAmbush(
                short,
            ),
        ).toBe(short);
        expect(always.drawn.length).toBe(0);
    });

    it('counts the night in the configured time zone (D-04)', () => {
        const draft = draftOf(20, NIGHT_START);

        expect(
            new AmbushPlanner(
                { timeZone: 'Europe/Rome' },
                new SequenceChance([0.004]),
            ).withAmbush(draft).ambush?.km,
        ).toBe(1);
        expect(
            new AmbushPlanner(
                { timeZone: 'UTC' },
                new SequenceChance([0.004]),
            ).withAmbush(draft),
        ).toBe(draft);
    });

    it('redraws from a km of the same travel (D-02)', () => {
        const planner = new AmbushPlanner(
            { timeZone: 'Europe/Rome' },
            new SequenceChance([], 0),
        );

        expect(
            planner.drawFrom(
                {
                    road: { distance: 20 },
                    startTime: DAY_START,
                    duration: TWENTY_HOURS_MS,
                },
                5,
            ),
        ).toEqual({
            km: 6,
            at: new Date(DAY_START.getTime() + 21_600_000),
        });
    });
});
