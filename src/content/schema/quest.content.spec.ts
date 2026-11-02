import { QuestEntry } from 'src/content/schema/quest.content';
import { validateEntry } from 'src/content/schema/validate-entry';

type Raw = Record<string, unknown>;

const LOOT = {
    itemType: 'LootItem',
    item: '64b0000000000000000000f1',
    quantity: 1,
};

const HEAL: Raw = {
    id: '64b000000000000000000301',
    city: '64b0000000000000000000c1',
    infos: {
        title: 'Cure al tempio del Borgo di Prova',
        type: 'heal',
        enemy: null,
        markerLocation: '64b0000000000000000000d1',
        relatedLore: ['64b0000000000000000000a2'],
    },
    requirements: { minTitle: 'rookie', recommendedLoot: [] },
    prizes: { randomLoot: [] },
};

function infos(overrides: Raw): Raw {
    return { ...HEAL, infos: { ...(HEAL.infos as Raw), ...overrides } };
}

function requirements(overrides: Raw): Raw {
    return {
        ...HEAL,
        requirements: { ...(HEAL.requirements as Raw), ...overrides },
    };
}

function prizes(overrides: Raw): Raw {
    return { ...HEAL, prizes: { ...(HEAL.prizes as Raw), ...overrides } };
}

function pathsOf(raw: Raw): string[] {
    return validateEntry(QuestEntry, {
        file: 'quests/esempio.yaml',
        line: 1,
        raw,
    }).map(({ path }) => path);
}

describe('quest entries', () => {
    it.each<[string, Raw]>([
        ['a service quest', HEAL],
        ['a study that draws its spell (D-31)', prizes({ spellDraw: true })],
        [
            'a quest with every optional prize and override (D-19)',
            prizes({
                prizeItem: LOOT,
                spell: '64b0000000000000000000b1',
                prizeCoins: { gold: 0, silver: 1, copper: 0 },
                xpPrize: 120,
                randomLoot: [LOOT],
            }),
        ],
        [
            'a quest with an explicit time (D-21)',
            infos({ timeToComplete: 3600000 }),
        ],
    ])('accepts %s', (_, raw) => {
        expect(pathsOf(raw)).toEqual([]);
    });

    it('accepts a quest with its notice description (D-32)', () => {
        expect(pathsOf(infos({ description: 'Un annuncio.' }))).toEqual([]);
    });

    it('rejects an empty or newline-terminated description (D-32)', () => {
        expect(pathsOf(infos({ description: '' }))).toEqual([
            'infos.description',
        ]);
        expect(pathsOf(infos({ description: 'Un annuncio.\n' }))).toEqual([
            'infos.description',
        ]);
    });

    it.each<[string, Raw, string]>([
        [
            'a quest type that is not a fixed one (D-17)',
            infos({ type: 'enemy' }),
            'infos.type',
        ],
        [
            'a legend minimum title (D-10)',
            requirements({ minTitle: 'legend' }),
            'requirements.minTitle',
        ],
        [
            'a recommended loot with zero quantity (D-28)',
            requirements({ recommendedLoot: [{ ...LOOT, quantity: 0 }] }),
            'requirements.recommendedLoot.0.quantity',
        ],
        [
            'a spell draw that is not a boolean (D-31)',
            prizes({ spellDraw: 'yes' }),
            'prizes.spellDraw',
        ],
        [
            'negative prize coins (D-28)',
            prizes({ prizeCoins: { gold: -1, silver: 0, copper: 0 } }),
            'prizes.prizeCoins.gold',
        ],
        [
            'a marker that is not an id',
            infos({ markerLocation: 'piazza' }),
            'infos.markerLocation',
        ],
        [
            'an unknown key inside the prizes',
            prizes({ gems: 3 }),
            'prizes.gems',
        ],
    ])('rejects %s', (_, raw, path) => {
        expect(pathsOf(raw)).toEqual([path]);
    });

    it('rejects a quest without its city (D-17)', () => {
        const raw = Object.fromEntries(
            Object.entries(HEAL).filter(([key]) => key !== 'city'),
        );

        expect(pathsOf(raw)).toEqual(['city']);
    });
});
