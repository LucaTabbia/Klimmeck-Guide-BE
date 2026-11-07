import { nearestPoi, pointAtFraction } from 'src/travel/ambush/ambush-point';

describe('ambush point', () => {
    const bend: [number, number][] = [
        [0, 0],
        [0, 1],
        [3, 1],
    ];

    it('interpolates on planar degrees like the FE travel route (D-01)', () => {
        expect(
            pointAtFraction(
                [
                    [0, 0],
                    [0, 10],
                ],
                0.25,
            ),
        ).toEqual({ point: [0, 2.5], segment: 1 });
        expect(pointAtFraction(bend, 0.5)).toEqual({
            point: [1, 1],
            segment: 2,
        });
    });

    it('clamps the fraction to the ends of the polyline (D-01)', () => {
        expect(pointAtFraction(bend, 0)).toEqual({ point: [0, 0], segment: 1 });
        expect(pointAtFraction(bend, 1)).toEqual({ point: [3, 1], segment: 2 });
        expect(pointAtFraction(bend, 1.7)).toEqual({
            point: [3, 1],
            segment: 2,
        });
        expect(pointAtFraction(bend, -0.2)).toEqual({
            point: [0, 0],
            segment: 1,
        });
    });

    it('answers the only point of a degenerate polyline (D-01)', () => {
        expect(pointAtFraction([[5, 5]], 0.5)).toEqual({
            point: [5, 5],
            segment: 0,
        });
        expect(
            pointAtFraction(
                [
                    [5, 5],
                    [5, 5],
                ],
                0.5,
            ),
        ).toEqual({ point: [5, 5], segment: 1 });
    });

    it('picks the nearest point of interest by game distance (D-06)', () => {
        const pois = [
            { id: 'b', location: [0, 1] as [number, number] },
            { id: 'a', location: [0, 3] as [number, number] },
        ];
        expect(nearestPoi([0, 0.9], pois)?.id).toBe('b');
        expect(nearestPoi([0, 0.9], [])).toBeNull();
    });

    it('breaks a nearest tie by id (D-06)', () => {
        const b = { id: 'b', location: [0, 1] as [number, number] };
        const a = { id: 'a', location: [0, -1] as [number, number] };
        expect(nearestPoi([0, 0], [b, a])?.id).toBe('a');
        expect(nearestPoi([0, 0], [a, b])?.id).toBe('a');
    });
});
