import { model, Types } from 'mongoose';
import { InjuryType } from '../enums/injury-type.enum';
import { QuestOutcome } from '../enums/quest-outcome.enum';
import { TitleType } from '../enums/title-type.enum';
import { PendingQuestSchema } from '../pending-quest.model';
import { PetSchema } from '../pet.model';
import {
    ActiveTravelSchema,
    TravelKind,
    TravelPathSchema,
} from './active-travel.model';
import {
    AmbushPlanEntrySchema,
    AmbushReportSnapshotSchema,
} from './ambush-snapshot.model';
import { CharacterStatusSchema } from './character-status.model';

const AMBUSH_TRAVEL = {
    road: {
        coordinates: [
            [0, 0],
            [0, 9],
        ],
        distance: 20,
    },
    startTime: new Date('2026-07-01T10:00:00.000Z'),
    endTime: new Date('2026-07-02T06:00:00.000Z'),
    duration: 72_000_000,
    to: new Types.ObjectId(),
    kind: TravelKind.free,
};

function heldReport(): Record<string, unknown> {
    return {
        resultId: new Types.ObjectId(),
        user: new Types.ObjectId(),
        outcome: QuestOutcome.failure,
        at: new Date('2026-07-01T11:00:00.000Z'),
        nearCity: { id: new Types.ObjectId(), name: 'Alba' },
        reachedCity: null,
        enemies: [{ enemy: new Types.ObjectId(), quantity: 2 }],
        hpBefore: 20,
        hpAfter: 1,
        maxLifePoints: 20,
        injuriesAdded: [InjuryType.deepCut],
        consumablesUsed: [],
        spellsUsed: [{ spell: new Types.ObjectId(), usages: 1 }],
        coins: { gold: 0, silver: 1, copper: 50 },
        xpGained: 0,
        xpBefore: 100,
        xpAfter: 100,
        levelBefore: 2,
        levelAfter: 2,
        titleBefore: TitleType.rookie,
        titleAfter: TitleType.rookie,
    };
}

describe('active travel schemas', () => {
    it('stores the active travel as an embedded subdocument', () => {
        expect(CharacterStatusSchema.path('activeTravel').instance).toBe(
            'Embedded',
        );
    });

    it('defaults the active travel to null for new and legacy statuses', () => {
        const Status = model(
            'CharacterStatusTravelProbe',
            CharacterStatusSchema,
        );

        expect(
            new Status({ location: new Types.ObjectId(), title: 'rookie' })
                .activeTravel,
        ).toBeNull();
        expect(
            Status.hydrate({ location: new Types.ObjectId(), title: 'rookie' })
                .activeTravel,
        ).toBeNull();
    });

    it('stores the destination as a cast ref and the kind as a string', () => {
        expect(ActiveTravelSchema.path('to').instance).toBe('ObjectId');
        expect(ActiveTravelSchema.path('kind').instance).toBe('String');
        expect(TravelPathSchema.path('coordinates').instance).toBe('Array');
    });

    it('validates a complete travel and rejects unknown kinds and missing fields', () => {
        const Travel = model('ActiveTravelProbe', ActiveTravelSchema);
        const travel = {
            road: {
                coordinates: [
                    [0, 0],
                    [0, 0.2],
                ],
                distance: 0.44,
            },
            startTime: new Date('2026-10-21T10:00:00.000Z'),
            endTime: new Date('2026-10-21T12:00:00.000Z'),
            duration: 7_200_000,
            to: new Types.ObjectId(),
            kind: TravelKind.free,
        };

        expect(new Travel(travel).validateSync()).toBeUndefined();
        expect(
            new Travel({ ...travel, kind: 'teleport' }).validateSync()?.errors
                .kind,
        ).toBeDefined();

        const errors = new Travel({}).validateSync()?.errors ?? {};

        for (const path of [
            'road',
            'startTime',
            'endTime',
            'duration',
            'to',
            'kind',
        ]) {
            expect(errors[path]).toBeDefined();
        }
    });

    it('keeps the ambush and its reports as internal subdocuments (D-05, D-13)', () => {
        expect(ActiveTravelSchema.path('ambush').instance).toBe('Embedded');
        expect(ActiveTravelSchema.path('ambushReports').instance).toBe('Array');
        expect(AmbushReportSnapshotSchema.path('resultId').instance).toBe(
            'ObjectId',
        );
        expect(AmbushPlanEntrySchema.path('attempts').options.default).toBe(0);
    });

    it('writes no ambush fields on a travel without ambush (D-05)', () => {
        const Travel = model('ActiveTravelNoAmbushProbe', ActiveTravelSchema);

        expect(
            Object.keys(new Travel(AMBUSH_TRAVEL).toObject()).sort(),
        ).toEqual(['duration', 'endTime', 'kind', 'road', 'startTime', 'to']);
    });

    it('casts a drawn ambush with zero attempts (D-05, D-18)', () => {
        const Travel = model('ActiveTravelAmbushProbe', ActiveTravelSchema);
        const at = new Date('2026-07-01T11:00:00.000Z');

        expect(
            new Travel({ ...AMBUSH_TRAVEL, ambush: { at, km: 7 } }).toObject()
                .ambush,
        ).toEqual({ at, km: 7, attempts: 0 });
    });

    it('validates a held report with a null reached city (D-13)', () => {
        const Travel = model('ActiveTravelReportProbe', ActiveTravelSchema);
        const withoutNearCity = heldReport();
        delete withoutNearCity.nearCity;

        expect(
            new Travel({
                ...AMBUSH_TRAVEL,
                ambushReports: [heldReport()],
            }).validateSync(),
        ).toBeUndefined();
        expect(
            Object.keys(
                new Travel({
                    ...AMBUSH_TRAVEL,
                    ambushReports: [withoutNearCity],
                }).validateSync()?.errors ?? {},
            ),
        ).toContain('ambushReports.0.nearCity');
    });

    it('keeps the companion xp of a held report through the schema (D-19)', () => {
        const Travel = model('ActiveTravelCompanionProbe', ActiveTravelSchema);
        const reportsOf = (reports: Record<string, unknown>[]) =>
            new Travel({ ...AMBUSH_TRAVEL, ambushReports: reports }).toObject()
                .ambushReports ?? [];

        expect(
            reportsOf([{ ...heldReport(), petXpGained: 30 }, heldReport()]).map(
                (report) => report.petXpGained,
            ),
        ).toEqual([30, 0]);
    });

    it('knows only free and quest travels', () => {
        expect(Object.values(TravelKind)).toEqual(['free', 'quest']);
    });

    it('defaults the pending quest start date to null', () => {
        const Pending = model('PendingQuestStartProbe', PendingQuestSchema);

        expect(
            new Pending({ waitingTime: 0, quest: new Types.ObjectId() })
                .startDate,
        ).toBeNull();
    });

    it('stores a nullable pet speed modifier', () => {
        expect(PetSchema.path('speedModifier').instance).toBe('Number');
        expect(
            new (model('PetSpeedProbe', PetSchema))({}).speedModifier,
        ).toBeNull();
    });
});
