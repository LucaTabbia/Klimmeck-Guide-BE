import {
    cpSync,
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { checkContent } from 'src/content/checking/check-content';
import { loadContentTree } from 'src/content/loading/content-tree';
import {
    GENERATED_QUESTS_HEADER,
    GENERATE_QUESTS_EXIT,
    main,
    runGenerateQuests,
} from 'src/content/run-generate-quests';

const TEST_CONTENT = resolve(__dirname, '../../test/content-fixtures');
const CAPITAL_ID = '64b0000000000000000000c2';
const VILLAGE_ID = '64b0000000000000000000c1';
const VILLAGE_MARKER = '64b0000000000000000000d1';
const STALE_QUEST_ID = '6c2300000000000000000fff';
const QUOTED_ID = /'[0-9a-f]{24}'/;

let contentDir: string;

function sequentialIds(): jest.Mock<string, []> {
    let next = 0;
    return jest.fn(() => {
        next += 1;
        return `6c23${next.toString(16).padStart(20, '0')}`;
    });
}

function questFile(name: string): string {
    return join(contentDir, 'quests', `${name}.yaml`);
}

function readQuestFiles(): string[] {
    return ['drustea', 'dungeon'].map((name) =>
        readFileSync(questFile(name), 'utf8'),
    );
}

// una quest generata in passato che oggi il generatore non produce più (nessuna guard nei villaggi, D-17)
function writeStaleQuest(): void {
    mkdirSync(join(contentDir, 'quests'), { recursive: true });
    writeFileSync(
        questFile('drustea'),
        [
            `- id: '${STALE_QUEST_ID}'`,
            `  city: '${VILLAGE_ID}'`,
            '  infos:',
            '    title: Guardia alle mura del Borgo di Prova',
            '    type: guard',
            '    enemy: null',
            `    markerLocation: '${VILLAGE_MARKER}'`,
            '    relatedLore: []',
            '  requirements:',
            '    minTitle: rookie',
            '    recommendedLoot: []',
            '  prizes:',
            '    randomLoot: []',
            '',
        ].join('\n'),
        'utf8',
    );
}

beforeEach(() => {
    contentDir = mkdtempSync(join(tmpdir(), 'generate-quests-'));
    cpSync(TEST_CONTENT, contentDir, { recursive: true });
    rmSync(join(contentDir, 'quests'), { recursive: true, force: true });
});

afterEach(() => {
    rmSync(contentDir, { recursive: true, force: true });
});

describe('runGenerateQuests', () => {
    it('writes the generated quests per kingdom and the dungeons (D-17)', () => {
        const report = runGenerateQuests(contentDir, sequentialIds());

        expect(report.errors).toEqual([]);
        expect(report.files).toEqual([
            { file: 'quests/drustea.yaml', entries: 8 },
            { file: 'quests/dungeon.yaml', entries: 1 },
        ]);
        expect(report.byType).toEqual({
            hunt: 1,
            dungeon: 1,
            heal: 2,
            job: 2,
            guard: 1,
            crime: 1,
            study: 1,
        });
        expect(existsSync(questFile('drustea'))).toBe(true);
        expect(existsSync(questFile('dungeon'))).toBe(true);
        expect(checkContent(loadContentTree(contentDir)).errors).toEqual([]);
    });

    it('reports the cities skipped by the generator with their reason (D-17)', () => {
        const report = runGenerateQuests(contentDir, sequentialIds());

        expect(report.skipped).toEqual([
            {
                city: CAPITAL_ID,
                poi: null,
                type: '*',
                reason: 'città senza lore',
            },
        ]);
    });

    it('writes byte-identical files on a second run (D-01)', () => {
        runGenerateQuests(contentDir, sequentialIds());
        const firstRun = readQuestFiles();
        const newId = sequentialIds();

        runGenerateQuests(contentDir, newId);

        expect(newId).not.toHaveBeenCalled();
        expect(readQuestFiles()).toEqual(firstRun);
    });

    it('writes nothing when the tree has errors', () => {
        writeFileSync(
            join(contentDir, 'lore', 'rotta.yaml'),
            "- id: '64b0000000000000000000a1'\n  type: region\n",
            'utf8',
        );

        const report = runGenerateQuests(contentDir, sequentialIds());

        expect(report.errors.length).toBeGreaterThan(0);
        expect(report.files).toEqual([]);
        expect(existsSync(join(contentDir, 'quests'))).toBe(false);
    });

    it('comments every reference id with its name (D-02)', () => {
        runGenerateQuests(contentDir, sequentialIds());

        const references = readQuestFiles()
            .flatMap((text) => text.split('\n'))
            .filter((line) => QUOTED_ID.test(line) && !/^- id:/.test(line));

        expect(references.length).toBeGreaterThan(0);
        expect(references.filter((line) => !/ # \S/.test(line))).toEqual([]);
    });

    it('heads every generated file with the generator notice (D-17)', () => {
        runGenerateQuests(contentDir, sequentialIds());

        for (const text of readQuestFiles()) {
            expect(text.split('\n')[0]).toBe(`# ${GENERATED_QUESTS_HEADER}`);
        }
    });

    it('reports the generated quests that are no longer produced (D-01)', () => {
        writeStaleQuest();

        const report = runGenerateQuests(contentDir, sequentialIds());

        expect(report.orphaned).toEqual([
            {
                file: 'quests/drustea.yaml',
                id: STALE_QUEST_ID,
                title: 'Guardia alle mura del Borgo di Prova',
            },
        ]);
        expect(readFileSync(questFile('drustea'), 'utf8')).not.toContain(
            STALE_QUEST_ID,
        );
    });

    it('leaves the hand-written quest files alone', () => {
        cpSync(join(TEST_CONTENT, 'quests'), join(contentDir, 'quests'), {
            recursive: true,
        });
        const newId = sequentialIds();

        runGenerateQuests(contentDir, newId);

        expect(newId).toHaveBeenCalledTimes(9);
    });
});

describe('main', () => {
    it('prints the report and exits 0 on a clean tree', async () => {
        const printed: string[] = [];

        const code = await main(['--content-dir', contentDir], (line) =>
            printed.push(line),
        );

        expect(code).toBe(GENERATE_QUESTS_EXIT.ok);
        expect(printed).toHaveLength(1);
        expect(JSON.parse(printed[0])).toMatchObject({
            mode: 'generate-quests',
            spellDraw: 0,
        });
    });

    it('exits 1 when the tree has errors', async () => {
        writeFileSync(
            join(contentDir, 'lore', 'rotta.yaml'),
            "- id: '64b0000000000000000000a1'\n  type: region\n",
            'utf8',
        );

        const code = await main(['--content-dir', contentDir], () => {});

        expect(code).toBe(GENERATE_QUESTS_EXIT.errors);
    });

    it('exits 2 on unknown arguments', async () => {
        const printed: string[] = [];

        const code = await main(['--apply'], (line) => printed.push(line));

        expect(code).toBe(GENERATE_QUESTS_EXIT.usage);
        expect(printed[0]).toMatch(/^Uso:/);
    });
});
