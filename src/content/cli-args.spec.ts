import { resolve } from 'path';
import { CliCommand, parseCliArgs } from 'src/content/cli-args';
import { DEFAULT_CONTENT_DIR } from 'src/content/content-paths';

describe('parseCliArgs (D-27)', () => {
    it.each<[string[], CliCommand]>([
        [['--check'], { mode: 'check', contentDir: DEFAULT_CONTENT_DIR }],
        [['--dry-run'], { mode: 'dry-run', contentDir: DEFAULT_CONTENT_DIR }],
        [['--apply'], { mode: 'apply', contentDir: DEFAULT_CONTENT_DIR }],
        [
            ['--verify', '--content-dir', 'x'],
            { mode: 'verify', contentDir: resolve('x') },
        ],
        [
            ['--content-dir', 'x', '--verify'],
            { mode: 'verify', contentDir: resolve('x') },
        ],
        [
            ['--export', 'out'],
            {
                mode: 'export',
                dir: resolve('out'),
                contentDir: DEFAULT_CONTENT_DIR,
            },
        ],
        [
            ['--prune', 'lore'],
            {
                mode: 'prune',
                collection: 'lore',
                contentDir: DEFAULT_CONTENT_DIR,
            },
        ],
        [
            ['--prune', 'quests'],
            {
                mode: 'prune',
                collection: 'quests',
                contentDir: DEFAULT_CONTENT_DIR,
            },
        ],
        [['--new-id', '30'], { mode: 'new-id', count: 30 }],
        [['--new-id', '1'], { mode: 'new-id', count: 1 }],
        [['--new-id', '500'], { mode: 'new-id', count: 500 }],
        [['--stats'], { mode: 'stats', contentDir: DEFAULT_CONTENT_DIR }],
    ])('reads %j as one mode (D-27)', (argv, command) => {
        expect(parseCliArgs(argv)).toEqual(command);
    });

    it.each<[string[]]>([
        [[]],
        [['--prune', 'cities']],
        [['--prune', 'spells']],
        [['--prune', 'enemies']],
        [['--prune']],
        [['--new-id', '0']],
        [['--new-id', '501']],
        [['--new-id', 'x']],
        [['--new-id', '2.5']],
        [['--new-id']],
        [['--apply', '--verify']],
        [['--check', '--check']],
        [['--stats', '--check']],
        [['--force']],
        [['--export']],
        [['--export', '--check']],
        [['--check', '--content-dir']],
        [['--check', '--content-dir', 'a', '--content-dir', 'b']],
        [['--check', 'extra']],
    ])('rejects %j as a wrong usage (D-27)', (argv) => {
        expect(parseCliArgs(argv)).toBeNull();
    });
});
