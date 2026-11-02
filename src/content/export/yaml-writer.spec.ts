import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parse } from 'yaml';
import { entriesToYaml, writeEntriesFile } from './yaml-writer';

const LORE_ID = '64b0000000000000000000a1';
const CITY_ID = '64b0000000000000000000c1';
const NUMERIC_LOOKING_ID = '123e4567890123456789abcd';

const NAMES = new Map([
    [LORE_ID, 'Regione di Prova'],
    [CITY_ID, 'Borgo di Prova'],
    [NUMERIC_LOOKING_ID, 'Voce di Prova'],
]);

const ENTRY = {
    id: NUMERIC_LOOKING_ID,
    type: 'city',
    name: 'Voce di Prova',
    description: 'Prima riga.\nSeconda riga.',
    image: null,
    relatedLore: [LORE_ID],
    city: CITY_ID,
};

describe('entriesToYaml', () => {
    it('comments every reference id with its name but not the entry id (D-02)', () => {
        const yaml = entriesToYaml([ENTRY], NAMES);

        expect(yaml).toContain(`- '${LORE_ID}' # Regione di Prova`);
        expect(yaml).toContain(`city: '${CITY_ID}' # Borgo di Prova`);
        expect(yaml).toContain(`- id: '${NUMERIC_LOOKING_ID}'\n`);
        expect(yaml).not.toContain('# Voce di Prova');
    });

    it('quotes every id even when YAML would read it as a number (Pitfall 6)', () => {
        const yaml = entriesToYaml([ENTRY], NAMES);

        expect(yaml).toContain(`id: '${NUMERIC_LOOKING_ID}'`);
        expect(yaml).toContain(`city: '${CITY_ID}'`);
        expect((parse(yaml) as { id: unknown }[])[0].id).toBe(
            NUMERIC_LOOKING_ID,
        );
    });

    it('writes multiline prose as a literal block without trailing newline', () => {
        const yaml = entriesToYaml([ENTRY], NAMES);

        expect(yaml).toContain(
            '  description: |-\n    Prima riga.\n    Seconda riga.\n',
        );
        expect((parse(yaml) as { description: string }[])[0].description).toBe(
            ENTRY.description,
        );
    });

    it('writes every description as a literal block, as the README asks for prose', () => {
        const yaml = entriesToYaml(
            [{ ...ENTRY, description: 'Una riga sola: con due punti.' }],
            NAMES,
        );

        expect(yaml).toContain(
            '  description: |-\n    Una riga sola: con due punti.\n',
        );
        expect(
            parse(entriesToYaml([{ ...ENTRY, description: null }], NAMES)),
        ).toEqual([{ ...ENTRY, description: null }]);
    });

    it('writes a header comment', () => {
        const yaml = entriesToYaml([ENTRY], NAMES, 'Esportato da --export');

        expect(yaml.startsWith('# Esportato da --export\n')).toBe(true);
    });

    it('writes short lists of plain values on one line', () => {
        const yaml = entriesToYaml(
            [
                {
                    id: CITY_ID,
                    locations: ['forest', 'hills'],
                    location: [9.1, 45.4],
                },
            ],
            NAMES,
        );

        expect(yaml).toContain('locations: [forest, hills]');
        expect(yaml).toContain('location: [9.1, 45.4]');
    });

    it('reads back exactly the entries it wrote', () => {
        const entries = [
            ENTRY,
            {
                id: CITY_ID,
                damages: { base: [{ type: 'cut', power: 5 }], energy: [] },
                price: null,
                sellable: false,
                speedModifier: 1.5,
                tag: '123',
            },
        ];

        expect(parse(entriesToYaml(entries, NAMES))).toEqual(entries);
        expect(parse(entriesToYaml([], NAMES))).toEqual([]);
    });
});

describe('writeEntriesFile', () => {
    it('creates the missing folders and writes the YAML text', () => {
        const dir = mkdtempSync(join(tmpdir(), 'content-writer-'));
        try {
            const path = join(dir, 'lore', 'esistenti.yaml');
            writeEntriesFile(path, [ENTRY], NAMES, 'intestazione');

            expect(readFileSync(path, 'utf8')).toBe(
                entriesToYaml([ENTRY], NAMES, 'intestazione'),
            );
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });
});
