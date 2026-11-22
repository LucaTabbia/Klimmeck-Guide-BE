import { model, Types } from 'mongoose';
import { QuestType } from '../enums/quest-type.enum';
import { QuestInfosSchema } from './quest-infos.model';

const PLACE_PATH = 'markerLocation';
const TYPES_WITH_A_PLACE = Object.values(QuestType).filter(
    (type) => type !== QuestType.story,
);

describe('quest place schema (quick 261122-snp)', () => {
    const Probe = model('QuestPlaceInfosProbe', QuestInfosSchema);

    const errorsOf = (infos: Record<string, unknown>) =>
        Object.keys(
            new Probe({
                title: 'Missione',
                relatedLore: [],
                ...infos,
            }).validateSync()?.errors ?? {},
        );

    it('accepts a story without a place', () => {
        expect(errorsOf({ type: QuestType.story })).toEqual([]);
    });

    it('accepts a story whose place is written as null', () => {
        expect(
            errorsOf({ type: QuestType.story, markerLocation: null }),
        ).toEqual([]);
    });

    it('keeps the place of a story that has one', () => {
        const markerLocation = new Types.ObjectId();
        const infos = new Probe({
            title: 'Missione',
            relatedLore: [],
            type: QuestType.story,
            markerLocation,
        });

        expect(infos.validateSync()).toBeUndefined();
        expect(infos.toObject().markerLocation).toEqual(markerLocation);
    });

    it.each(TYPES_WITH_A_PLACE)('refuses a %s without a place', (type) => {
        expect(errorsOf({ type })).toEqual([PLACE_PATH]);
        expect(errorsOf({ type, markerLocation: null })).toEqual([PLACE_PATH]);
    });

    it.each(TYPES_WITH_A_PLACE)('accepts a %s with a place', (type) => {
        expect(
            errorsOf({ type, markerLocation: new Types.ObjectId() }),
        ).toEqual([]);
    });
});
