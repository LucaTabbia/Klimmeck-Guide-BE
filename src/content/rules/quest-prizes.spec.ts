import { readFileSync } from 'fs';
import { join } from 'path';
import { DEFAULT_CONTENT_DIR } from 'src/content/content-paths';
import { parseYamlFile } from 'src/content/loading/yaml-file';
import {
    ContentConfig,
    parseContentConfig,
} from 'src/content/rules/content-config';
import {
    dungeonLootRarity,
    marchMinutesOf,
    questPrizeCoins,
    questXpPrize,
    timeToCompleteMs,
} from 'src/content/rules/quest-prizes';

function repositoryConfig(): ContentConfig {
    const file = 'config.yaml';
    const text = readFileSync(join(DEFAULT_CONTENT_DIR, file), 'utf8');
    return parseContentConfig(parseYamlFile(file, text).value, file).config!;
}

const config = repositoryConfig();

describe('quest prizes', () => {
    it.each([
        ['guard', 'paladin', { gold: 0, silver: 10, copper: 0 }],
        ['hunt', 'rookie', { gold: 0, silver: 1, copper: 0 }],
        ['job', 'rookie', { gold: 0, silver: 0, copper: 40 }],
        ['dungeon', 'hero', { gold: 1, silver: 0, copper: 0 }],
        ['heal', 'mage', { gold: 0, silver: 0, copper: 0 }],
    ] as const)(
        'multiplies the base coins by the tier (D-19): %s %s',
        (type, tier, coins) => {
            expect(questPrizeCoins(type, tier, config)).toEqual(coins);
        },
    );

    it('pays no xp for a job (D-19 i job non danno xp)', () => {
        expect(questXpPrize('job', 'hero', config)).toBe(0);
    });

    it('multiplies the base xp by the tier (D-19)', () => {
        expect(questXpPrize('dungeon', 'mage', config)).toBe(960);
    });

    it('expresses the time to complete in milliseconds (D-21, Pitfall 4)', () => {
        expect(timeToCompleteMs('guard', config)).toBe(28800000);
        expect(timeToCompleteMs('hunt', config)).toBe(3_600_000);
    });

    it('draws the dungeon loot rarity from the tier (D-19)', () => {
        expect(dungeonLootRarity('paladin', config)).toBe('rare');
        expect(dungeonLootRarity('hero', config)).toBe('legendary');
    });

    it('converts the food power into march minutes (D-16)', () => {
        expect(marchMinutesOf(60, config)).toBe(180);
    });

    it('rejects the legend tier for a fixed quest prize (D-19)', () => {
        expect(() => questPrizeCoins('dungeon', 'legend', config)).toThrow(
            RangeError,
        );
        expect(() => questXpPrize('dungeon', 'legend', config)).toThrow(
            RangeError,
        );
        expect(() => dungeonLootRarity('legend', config)).toThrow(RangeError);
    });
});
