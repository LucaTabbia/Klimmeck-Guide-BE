import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const SOURCE_DIR = join(ROOT, 'src');
const CONFIG_DIR = join(SOURCE_DIR, 'config');
const CONFIG_MODULE = /-config\.ts$/;
const ENV_KEYS_EXPORT = /_ENV_KEYS$/;
const PRODUCTION_SOURCE = /(?<![.-]spec)\.ts$/;
const CONFIG_GET_KEY = /\.get(?:<[^>]+>)?\(\s*'([A-Z][A-Z0-9_]*)'/g;
const PROCESS_ENV_KEY = /process\.env\.([A-Z][A-Z0-9_]*)/g;
const PROCESS_ENV_READ = 'process.env.';
const TEMPLATE_KEY = /^([A-Z][A-Z0-9_]*)=/gm;

function productionSources(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) return productionSources(path);
        return PRODUCTION_SOURCE.test(entry.name) ? [path] : [];
    });
}

function configModuleKeys(): string[] {
    return readdirSync(CONFIG_DIR)
        .filter((file) => CONFIG_MODULE.test(file))
        .flatMap((file) => {
            const exported = jest.requireActual<Record<string, unknown>>(
                join(CONFIG_DIR, file),
            );
            return Object.entries(exported)
                .filter(([name]) => ENV_KEYS_EXPORT.test(name))
                .flatMap(([, keys]) => keys as readonly string[]);
        });
}

function sourceKeys(): string[] {
    return productionSources(SOURCE_DIR).flatMap((path) => {
        const source = readFileSync(path, 'utf8');
        return [
            ...source.matchAll(CONFIG_GET_KEY),
            ...source.matchAll(PROCESS_ENV_KEY),
        ].map(([, key]) => key);
    });
}

function codeKeys(): Set<string> {
    return new Set([...configModuleKeys(), ...sourceKeys()]);
}

function templateKeys(): Set<string> {
    const template = readFileSync(join(ROOT, '.env.example'), 'utf8');
    return new Set([...template.matchAll(TEMPLATE_KEY)].map(([, key]) => key));
}

function missingFrom(source: Set<string>, target: Set<string>): string[] {
    return [...source].filter((key) => !target.has(key)).sort();
}

describe('.env.example drift', () => {
    it('lists in the template every key the code reads (D-11)', () => {
        expect(missingFrom(codeKeys(), templateKeys())).toEqual([]);
    });

    it('reads in the code every key the template lists (D-11)', () => {
        expect(missingFrom(templateKeys(), codeKeys())).toEqual([]);
    });

    it('reads the environment only through config (D-11)', () => {
        const directReaders = productionSources(SOURCE_DIR)
            .filter((path) =>
                readFileSync(path, 'utf8').includes(PROCESS_ENV_READ),
            )
            .map((path) => relative(ROOT, path))
            .sort();

        expect(directReaders).toEqual([]);
    });
});
