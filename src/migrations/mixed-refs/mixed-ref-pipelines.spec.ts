import type { MixedRefPath } from './mixed-ref-paths';
import {
    conversionStage,
    convertibleFilter,
    convertValue,
    OBJECT_ID_HEX_PATTERN,
    POI_TYPE_SCALAR_FILTER,
    poiTypeNormalization,
    residualFilter,
} from './mixed-ref-pipelines';

const HEX = /^[0-9a-f]{24}$/;

const SCALAR: MixedRefPath = {
    collection: 'users',
    path: 'currentCharacter',
    shape: 'scalar',
};
const ARRAY: MixedRefPath = {
    collection: 'characters',
    path: 'status.spells',
    shape: 'array',
};
const SUBDOC_ARRAY: MixedRefPath = {
    collection: 'characters',
    path: 'assets.ownedItems',
    shape: 'subdocArray',
    key: 'item',
};

function expectedConversion(expr: string) {
    return {
        $cond: {
            if: { $eq: [{ $type: expr }, 'string'] },
            then: {
                $cond: {
                    if: {
                        $regexMatch: {
                            input: expr,
                            regex: '^[0-9a-f]{24}$',
                        },
                    },
                    then: { $toObjectId: expr },
                    else: expr,
                },
            },
            else: expr,
        },
    };
}

describe('mixed reference pipelines', () => {
    it('builds the conversion of a hex string reference to an ObjectId for every shape (D-17d)', () => {
        expect(convertValue('$currentCharacter')).toEqual(
            expectedConversion('$currentCharacter'),
        );
        expect(conversionStage(SCALAR)).toEqual({
            $set: { currentCharacter: expectedConversion('$currentCharacter') },
        });
        expect(conversionStage(ARRAY)).toEqual({
            $set: {
                'status.spells': {
                    $cond: {
                        if: { $isArray: '$status.spells' },
                        then: {
                            $map: {
                                input: '$status.spells',
                                as: 'ref',
                                in: expectedConversion('$$ref'),
                            },
                        },
                        else: '$status.spells',
                    },
                },
            },
        });
        expect(conversionStage(SUBDOC_ARRAY)).toEqual({
            $set: {
                'assets.ownedItems': {
                    $cond: {
                        if: { $isArray: '$assets.ownedItems' },
                        then: {
                            $map: {
                                input: '$assets.ownedItems',
                                as: 'entry',
                                in: {
                                    $cond: {
                                        if: {
                                            $eq: [
                                                { $type: '$$entry' },
                                                'object',
                                            ],
                                        },
                                        then: {
                                            $mergeObjects: [
                                                '$$entry',
                                                {
                                                    item: expectedConversion(
                                                        '$$entry.item',
                                                    ),
                                                },
                                            ],
                                        },
                                        else: '$$entry',
                                    },
                                },
                            },
                        },
                        else: '$assets.ownedItems',
                    },
                },
            },
        });
    });

    it('selects only documents with a convertible string on the path', () => {
        const hex = { $type: 'string', $regex: HEX };

        expect(convertibleFilter(SCALAR)).toEqual({ currentCharacter: hex });
        expect(convertibleFilter(ARRAY)).toEqual({
            'status.spells': { $elemMatch: hex },
        });
        expect(convertibleFilter(SUBDOC_ARRAY)).toEqual({
            'assets.ownedItems': { $elemMatch: { item: hex } },
        });
    });

    it('counts as residual exactly what is still convertible (D-17d)', () => {
        for (const ref of [SCALAR, ARRAY, SUBDOC_ARRAY]) {
            expect(residualFilter(ref)).toEqual(convertibleFilter(ref));
        }
    });

    it('normalizes a scalar point of interest type into a list (D-17b)', () => {
        const isString = { $eq: [{ $type: '$type' }, 'string'] };

        expect(POI_TYPE_SCALAR_FILTER).toEqual({ $expr: isString });
        expect(poiTypeNormalization).toEqual({
            $set: {
                type: {
                    $cond: { if: isString, then: ['$type'], else: '$type' },
                },
            },
        });
    });

    it('never converts a non hex or uppercase string', () => {
        const pattern = new RegExp(OBJECT_ID_HEX_PATTERN);

        expect(OBJECT_ID_HEX_PATTERN).toBe('^[0-9a-f]{24}$');
        expect(pattern.test('65a1b2c3d4e5f60718293a4b')).toBe(true);
        expect(pattern.test('65A1B2C3D4E5F60718293A4B')).toBe(false);
        expect(pattern.test('not-an-object-id-at-all!')).toBe(false);
        expect(pattern.test('65a1b2c3d4e5f60718293a4')).toBe(false);
    });
});
