import { readFileSync } from 'fs';
import { join } from 'path';
import { DEFAULT_CONTENT_DIR } from 'src/content/content-paths';
import { parseYamlFile } from 'src/content/loading/yaml-file';
import {
    ContentConfig,
    parseContentConfig,
} from 'src/content/rules/content-config';
import {
    BASE_ORDER,
    ENERGY_ORDER,
    enemyDamages,
    enemyLifePoints,
    enemyXp,
    levelFromPe,
    tierOfLevel,
} from 'src/content/rules/enemy-stats';

function repositoryConfig(): ContentConfig {
    const file = 'config.yaml';
    const text = readFileSync(join(DEFAULT_CONTENT_DIR, file), 'utf8');
    return parseContentConfig(parseYamlFile(file, text).value, file).config!;
}

const config = repositoryConfig();

describe('enemy stats', () => {
    it.each([
        ['Lupo', 50, 7],
        ['Goblin', 135, 19],
        ['Troll', 1800, 254],
        ['Beholder', 10000, 1408],
        ['Tarrasque', 155000, 21831],
        ['a minimum of 1', 1, 1],
    ])('derives the xp from the PE (D-11): %s', (_name, pe, xp) => {
        expect(enemyXp(pe, config.enemy.xpScale)).toBe(xp);
    });

    it.each([
        ['Bandito', 25, 1],
        ['Capo dei Banditi', 450, 4],
        ['Veterano', 700, 6],
        ['Gladiatore', 1800, 11],
        ['Assassino', 3900, 17],
        ['Tarrasque', 155000, 20],
    ])(
        'derives the level from the medium PE column (D-10): %s',
        (_name, pe, level) => {
            expect(levelFromPe(pe, config.mediumPeByLevel)).toBe(level);
        },
    );

    it.each([
        [1, 'rookie'],
        [2, 'rookie'],
        [3, 'adventurer'],
        [4, 'adventurer'],
        [5, 'paladin'],
        [10, 'paladin'],
        [11, 'mage'],
        [16, 'mage'],
        [17, 'hero'],
        [20, 'hero'],
    ])('maps the level %i to its tier (D-10)', (level, tier) => {
        expect(tierOfLevel(level, config.tiers)).toBe(tier);
    });

    it('rejects a level outside the tiers (D-10)', () => {
        expect(() => tierOfLevel(21, config.tiers)).toThrow(RangeError);
    });

    it('scales the average hit points into life points (D-12)', () => {
        expect(enemyLifePoints(11, config.enemy.hpScale)).toBe(1100);
    });

    it('scales the damage per round by type in the enum order (D-12)', () => {
        const damages = enemyDamages(
            { pierce: 7, fire: 3.5, cut: 2 },
            config.enemy.damageScale,
        );

        expect(damages).toEqual({
            base: [
                { type: 'cut', power: 200 },
                { type: 'pierce', power: 700 },
            ],
            energy: [{ type: 'fire', power: 350 }],
        });
        expect(Object.keys(damages.base[0])).toEqual(['type', 'power']);
    });

    it('orders the energy types like the enum, enhancing excluded (D-12)', () => {
        expect(BASE_ORDER).toEqual(['blunt', 'cut', 'pierce']);
        expect(ENERGY_ORDER).not.toContain('enhancing');
        expect(ENERGY_ORDER[0]).toBe('fire');
        expect(ENERGY_ORDER).toHaveLength(10);
    });

    it.each(['enhancing', 'laser'])(
        'rejects an unknown damage type (D-12): %s',
        (type) => {
            expect(() => enemyDamages({ [type]: 4 }, 100)).toThrow(
                new RangeError(`Tipo di danno sconosciuto: ${type}`),
            );
        },
    );
});
