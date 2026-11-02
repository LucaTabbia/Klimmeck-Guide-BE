import { parseYamlFile } from 'src/content/loading/yaml-file';

const FILE = 'lore/prova.yaml';
const ID_A = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const ID_B = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const ID_C = 'cccccccccccccccccccccccc';

function lines(...rows: string[]): string {
    return `${rows.join('\n')}\n`;
}

describe('parseYamlFile', () => {
    it('reads every entry of a list with its line (D-01)', () => {
        const text = lines(
            `- id: '${ID_A}'`,
            '  name: Primo',
            '  type: knowledge',
            '',
            `- id: '${ID_B}'`,
            '  name: Secondo',
            '  type: knowledge',
            '',
            `- id: '${ID_C}'`,
            '  name: Terzo',
            '  type: knowledge',
        );

        const parsed = parseYamlFile(FILE, text);

        expect(parsed.issues).toEqual([]);
        expect(
            parsed.entries.map(({ file, line }) => ({ file, line })),
        ).toEqual([
            { file: FILE, line: 1 },
            { file: FILE, line: 5 },
            { file: FILE, line: 9 },
        ]);
        expect(parsed.entries[1].raw).toEqual({
            id: ID_B,
            name: 'Secondo',
            type: 'knowledge',
        });
    });

    it('rejects duplicate keys with file and line', () => {
        const text = lines(
            `- id: '${ID_A}'`,
            '  name: Primo',
            '  name: Doppio',
        );

        const parsed = parseYamlFile(FILE, text);

        expect(parsed.issues).toHaveLength(1);
        expect(parsed.issues[0]).toMatchObject({ file: FILE, line: 3 });
        expect(parsed.entries).toEqual([]);
    });

    it('rejects an unquoted id that YAML reads as a number (Pitfall 6)', () => {
        const parsed = parseYamlFile(
            FILE,
            lines('- id: 612345678901234567e89012', '  name: Numero'),
        );

        expect(parsed.issues).toEqual([
            expect.objectContaining({
                file: FILE,
                line: 1,
                entryId: null,
                path: 'id',
                message: expect.stringContaining('id non stringa'),
            }),
        ]);
    });

    it.each([
        ['uppercase', 'AAAAAAAAAAAAAAAAAAAAAAAA'],
        ['23 characters', 'aaaaaaaaaaaaaaaaaaaaaaa'],
    ])('rejects an id that is not 24 lowercase hex (D-01): %s', (_case, id) => {
        const parsed = parseYamlFile(
            FILE,
            lines(`- id: '${id}'`, '  name: Sbagliato'),
        );

        expect(parsed.issues).toEqual([
            expect.objectContaining({
                file: FILE,
                line: 1,
                entryId: id,
                path: 'id',
                message: expect.stringContaining('id non valido'),
            }),
        ]);
    });

    it('reports malformed YAML without throwing', () => {
        const parse = () =>
            parseYamlFile(FILE, lines(`- id: '${ID_A}`, '  name: [aperta'));

        expect(parse).not.toThrow();
        const parsed = parse();
        expect(parsed.issues.length).toBeGreaterThan(0);
        expect(parsed.issues[0].file).toBe(FILE);
        expect(parsed.value).toBeNull();
    });

    it('ignores comments next to reference ids', () => {
        const parsed = parseYamlFile(
            FILE,
            lines(
                `- id: '${ID_A}'`,
                '  relatedLore:',
                `    - '${ID_B}' # Nome della voce`,
            ),
        );

        expect(parsed.issues).toEqual([]);
        expect(parsed.entries[0].raw.relatedLore).toEqual([ID_B]);
    });
});
