import { Types } from 'mongoose';
import {
    BOARD_CHARACTER_PROJECTION,
    boardFilterOf,
    cityOfLocationFilter,
    cityPoiIdsOf,
    laneQuestIdsOf,
} from 'src/quests/quest-board';

const A = new Types.ObjectId();
const B = new Types.ObjectId();
const Q = new Types.ObjectId();

describe('quest board', () => {
    it('builds the board filter from the city pois, the story of the title and the lanes (D-05)', () => {
        expect(
            boardFilterOf({
                poiIds: [A, B],
                title: 'paladin',
                laneQuestIds: [Q],
            }),
        ).toEqual({
            concludedAt: null,
            $or: [
                {
                    'infos.markerLocation': {
                        $in: [A, A.toHexString(), B, B.toHexString()],
                    },
                },
                { 'infos.type': 'story', 'requirements.minTitle': 'paladin' },
                { _id: { $in: [Q] } },
            ],
        });
    });

    it.each([undefined, 7])(
        'omits the story branch without a title (%p) (D-05)',
        (title) => {
            expect(
                boardFilterOf({ poiIds: [A], title, laneQuestIds: [Q] }),
            ).toEqual({
                concludedAt: null,
                $or: [
                    {
                        'infos.markerLocation': {
                            $in: [A, A.toHexString()],
                        },
                    },
                    { _id: { $in: [Q] } },
                ],
            });
        },
    );

    it('keeps empty lists as empty matches (D-05)', () => {
        expect(
            boardFilterOf({ poiIds: [], title: 'rookie', laneQuestIds: [] }),
        ).toEqual({
            concludedAt: null,
            $or: [
                { 'infos.markerLocation': { $in: [] } },
                { 'infos.type': 'story', 'requirements.minTitle': 'rookie' },
                { _id: { $in: [] } },
            ],
        });
    });

    it('finds the city by its marker or by a listed poi (D-05)', () => {
        const location = new Types.ObjectId();
        expect(cityOfLocationFilter(location)).toEqual({
            $or: [
                {
                    markerLocation: {
                        $in: [location, location.toHexString()],
                    },
                },
                { pointsOfInterest: location },
            ],
        });
    });

    it('lists the city marker with its pois once (D-05)', () => {
        const marker = new Types.ObjectId();
        const first = new Types.ObjectId();
        const second = new Types.ObjectId();
        expect(
            cityPoiIdsOf({
                markerLocation: marker,
                pointsOfInterest: [first, marker, second],
            }),
        ).toEqual([marker, first, second]);
    });

    it('reads legacy hex ids of the marker and the pois and drops invalid entries (D-05)', () => {
        const marker = new Types.ObjectId();
        const first = new Types.ObjectId();
        expect(
            cityPoiIdsOf({
                markerLocation: marker.toHexString(),
                pointsOfInterest: [first.toHexString(), 'not-an-id', null],
            }),
        ).toEqual([marker, first]);
    });

    it('answers no pois for a city without marker nor pois (D-05)', () => {
        expect(cityPoiIdsOf({})).toEqual([]);
    });

    it('reads the lane quest ids of the pending quests (D-05)', () => {
        const first = new Types.ObjectId();
        const second = new Types.ObjectId();
        expect(
            laneQuestIdsOf([
                { quest: first },
                { quest: second.toHexString() },
                { quest: null },
                {},
            ]),
        ).toEqual([first, second]);
    });

    it('projects only location, title and lanes of the character (D-05)', () => {
        expect(BOARD_CHARACTER_PROJECTION).toEqual({
            'status.location': 1,
            'status.title': 1,
            'quests.pendingQuest': 1,
            'quests.activeStoryQuest': 1,
            'quests.activeWorldMissionQuest': 1,
        });
    });
});
