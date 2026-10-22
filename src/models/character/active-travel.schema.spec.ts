import { model, Types } from 'mongoose';
import { PendingQuestSchema } from '../pending-quest.model';
import { PetSchema } from '../pet.model';
import {
    ActiveTravelSchema,
    TravelKind,
    TravelPathSchema,
} from './active-travel.model';
import { CharacterStatusSchema } from './character-status.model';

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
