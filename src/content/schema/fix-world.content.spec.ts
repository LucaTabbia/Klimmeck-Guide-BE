import { EntrySource, validateEntry } from 'src/content/schema/validate-entry';
import { fixEntryIssues } from 'src/content/schema/fix.content';
import {
    ImageLinkEntry,
    WorldCityEntry,
} from 'src/content/schema/world.content';

type Raw = Record<string, unknown>;

function entryOf(file: string, raw: Raw): EntrySource {
    return { file, line: 2, raw };
}

function fixPaths(raw: Raw): string[] {
    return fixEntryIssues(entryOf('fixes/esempio.yaml', raw)).map(
        ({ path }) => path,
    );
}

const NORMALIZE: Raw = {
    key: 'poi-types-prova',
    kind: 'normalizePoiTypes',
    target: '64b0000000000000000000d2',
    replacements: { gounet: 'glounet' },
};

const RENAME: Raw = {
    key: 'rename-capitale',
    kind: 'renameCity',
    target: '64b0000000000000000000c2',
    from: 'Capitale di Prova',
    to: 'Capitale Rinominata',
};

const DELETE: Raw = {
    key: 'delete-test-quests',
    kind: 'deleteQuests',
    ids: ['64b000000000000000000399'],
};

const UNSET: Raw = { key: 'lore-unset-unlocked', kind: 'unsetLoreUnlocked' };

const CITY: Raw = {
    id: '64b0000000000000000000c1',
    name: 'Borgo di Prova',
    type: 'drusteaVillage',
    markerLocation: '64b0000000000000000000d1',
    relatedLore: null,
    pointsOfInterest: [
        {
            id: '64b0000000000000000000d1',
            type: ['city'],
            location: [9.1, 45.4],
        },
    ],
};

function cityPaths(raw: Raw): string[] {
    return validateEntry(WorldCityEntry, entryOf('world/cities.yaml', raw)).map(
        ({ path }) => path,
    );
}

function imagePaths(raw: Raw): string[] {
    return validateEntry(ImageLinkEntry, entryOf('images.yaml', raw)).map(
        ({ path }) => path,
    );
}

describe('fix entries (closed kinds)', () => {
    it.each<[string, Raw]>([
        ['normalizePoiTypes', NORMALIZE],
        ['renameCity', RENAME],
        ['deleteQuests', DELETE],
        ['unsetLoreUnlocked', UNSET],
    ])('accepts a %s fix', (_, raw) => {
        expect(fixPaths(raw)).toEqual([]);
    });

    it('rejects a kind outside the closed set', () => {
        const issues = fixEntryIssues(
            entryOf('fixes/esempio.yaml', { key: 'x', kind: 'setAnything' }),
        );

        expect(issues).toEqual([
            expect.objectContaining({
                path: 'kind',
                entryId: 'x',
                message: expect.stringContaining('kind sconosciuto'),
            }),
        ]);
    });

    it.each<[string, Raw, string]>([
        ['a rename without the new name', { ...RENAME, to: undefined }, 'to'],
        ['a quest deletion with no id', { ...DELETE, ids: [] }, 'ids'],
        [
            'a replacement outside PoiType',
            { ...NORMALIZE, replacements: { gounet: 'gounet' } },
            'replacements',
        ],
        ['a fix without key', { ...UNSET, key: '' }, 'key'],
        [
            'a key that belongs to another kind',
            { ...UNSET, target: '64b0000000000000000000c2' },
            'target',
        ],
    ])('rejects %s', (_, raw, path) => {
        const defined = Object.fromEntries(
            Object.entries(raw).filter(([, value]) => value !== undefined),
        );

        expect(fixPaths(defined)).toEqual([path]);
    });
});

describe('world snapshot entries', () => {
    it('accepts a city with its points of interest', () => {
        expect(cityPaths(CITY)).toEqual([]);
    });

    it('rejects a city without marker', () => {
        const raw = Object.fromEntries(
            Object.entries(CITY).filter(([key]) => key !== 'markerLocation'),
        );

        expect(cityPaths(raw)).toEqual(['markerLocation']);
    });

    it('rejects a point of interest whose location is not [lng, lat]', () => {
        const raw = {
            ...CITY,
            pointsOfInterest: [
                {
                    id: '64b0000000000000000000d1',
                    type: ['city'],
                    location: [9.1, 45.4, 3],
                },
            ],
        };

        expect(cityPaths(raw)).toEqual(['pointsOfInterest.0.location']);
    });

    it('rejects a city type outside CityType', () => {
        expect(cityPaths({ ...CITY, type: 'metropolis' })).toEqual(['type']);
    });
});

describe('image links (D-24)', () => {
    it('accepts a Cloudinary url', () => {
        expect(
            imagePaths({
                id: '64b0000000000000000000a1',
                url: 'https://res.cloudinary.com/demo/image/upload/lupo.png',
            }),
        ).toEqual([]);
    });

    it('rejects an url outside Cloudinary', () => {
        expect(
            imagePaths({
                id: '64b0000000000000000000a1',
                url: 'http://example.com/x.png',
            }),
        ).toEqual(['url']);
    });
});
