import type { Document } from 'mongodb';
import type { MixedRefPath } from './mixed-ref-paths';

// solo la forma canonica minuscola emessa dal server, la stessa di isObjectIdHex: il maiuscolo e il resto restano intatti
export const OBJECT_ID_HEX_PATTERN = '^[0-9a-f]{24}$';
const OBJECT_ID_HEX = new RegExp(OBJECT_ID_HEX_PATTERN);

const HEX_STRING = { $type: 'string', $regex: OBJECT_ID_HEX };

function typeIs(expr: string, type: string): Document {
    return { $eq: [{ $type: expr }, type] };
}

// condizioni annidate: il controllo della regex gira solo su una stringa, mai su un ObjectId o un null
export function convertValue(expr: string): Document {
    return {
        $cond: {
            if: typeIs(expr, 'string'),
            then: {
                $cond: {
                    if: {
                        $regexMatch: {
                            input: expr,
                            regex: OBJECT_ID_HEX_PATTERN,
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

function convertSubdocument(key: string): Document {
    return {
        $cond: {
            if: typeIs('$$entry', 'object'),
            then: {
                $mergeObjects: [
                    '$$entry',
                    { [key]: convertValue(`$$entry.${key}`) },
                ],
            },
            else: '$$entry',
        },
    };
}

function mapOverList(path: string, as: string, each: Document): Document {
    const list = `$${path}`;
    return {
        $cond: {
            if: { $isArray: list },
            then: { $map: { input: list, as, in: each } },
            else: list,
        },
    };
}

function convertedPath(ref: MixedRefPath): Document {
    switch (ref.shape) {
        case 'scalar':
            return convertValue(`$${ref.path}`);
        case 'array':
            return mapOverList(ref.path, 'ref', convertValue('$$ref'));
        case 'subdocArray':
            return mapOverList(ref.path, 'entry', convertSubdocument(ref.key));
    }
}

export function conversionStage(ref: MixedRefPath): Document {
    return { $set: { [ref.path]: convertedPath(ref) } };
}

export function convertibleFilter(ref: MixedRefPath): Document {
    switch (ref.shape) {
        case 'scalar':
            return { [ref.path]: HEX_STRING };
        case 'array':
            return { [ref.path]: { $elemMatch: HEX_STRING } };
        case 'subdocArray':
            return {
                [ref.path]: { $elemMatch: { [ref.key]: HEX_STRING } },
            };
    }
}

// un residuo è un ref ancora convertibile: --verify e il verificatore al boot contano la stessa cosa
export function residualFilter(ref: MixedRefPath): Document {
    return convertibleFilter(ref);
}

const POI_TYPE_IS_SCALAR = typeIs('$type', 'string');

export const POI_TYPE_SCALAR_FILTER: Document = { $expr: POI_TYPE_IS_SCALAR };

// il type legacy scalare di un punto d'interesse diventa una lista di un elemento (D-17b)
export const poiTypeNormalization: Document = {
    $set: {
        type: {
            $cond: { if: POI_TYPE_IS_SCALAR, then: ['$type'], else: '$type' },
        },
    },
};
