import { Types } from 'mongoose';

const DEFAULT_START = new Date('2026-10-21T08:00:00.000Z');
const DEFAULT_END = new Date('2026-10-21T09:00:00.000Z');

// documento activeTravel persistito per i test (nome distinto dal buildActiveTravel di produzione)
export function buildActiveTravelDoc(overrides: Record<string, any> = {}) {
    const startTime: Date = overrides.startTime ?? DEFAULT_START;
    const endTime: Date = overrides.endTime ?? DEFAULT_END;
    return {
        road: {
            coordinates: [
                [0, 0],
                [0, 0.2],
            ],
            distance: 0.44,
        },
        startTime,
        endTime,
        duration: endTime.getTime() - startTime.getTime(),
        to: new Types.ObjectId(),
        kind: 'free',
        ...overrides,
    };
}
