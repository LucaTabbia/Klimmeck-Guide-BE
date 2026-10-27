import { BullModule, getQueueToken } from '@nestjs/bull';
import { INestApplication, Logger } from '@nestjs/common';
import {
    getConnectionToken,
    getModelToken,
    MongooseModule,
} from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import type { Queue } from 'bull';
import { Connection, Model, Types } from 'mongoose';
import { Clock, SystemClock } from 'src/auth/clock';
import {
    Character,
    CharacterDocument,
    CharacterSchema,
} from 'src/models/character/character.model';
import { Spell, SpellDocument, SpellSchema } from 'src/models/spell.model';
import {
    buildCharacter,
    persistSpell,
    spellBook,
    SpellBookEntry,
} from '../../../test/fixtures';
import { startRedis, stopRedis } from '../../../test/setup/redis';
import { spellRecoveryJobId } from './spell-recovery-job';
import {
    RECOVER_SPELL_JOB,
    SPELL_RECOVERY_QUEUE,
} from './spell-recovery-queue';
import { SpellRecoveryProcessor } from './spell-recovery.processor';
import { SpellRecoveryService } from './spell-recovery.service';
import { SpellStateMigrator } from './spell-state.migrator';

const WAIT_DEADLINE_MS = 10_000;
const POLL_STEP_MS = 100;
const NEGATIVE_WAIT_MS = 1_000;
const TEST_TIMEOUT_MS = 30_000;
const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;

const pause = (ms: number): Promise<void> =>
    new Promise((resolve) => setTimeout(resolve, ms));

// polling con deadline, mai la promessa di fine job di Bull (open handle, Phase 1 D-06)
async function waitFor(
    predicate: () => Promise<boolean> | boolean,
    timeoutMs = WAIT_DEADLINE_MS,
): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (await predicate()) return true;
        await pause(POLL_STEP_MS);
    }
    return predicate();
}

interface RawSpellState {
    spell: Types.ObjectId;
    usages: number;
    recoveries: Date[];
}

/**
 * INTEGRATION: il job 'recover' della coda dei recuperi su Redis effimero REALE e replSet condiviso.
 * SystemClock reale (il delay di Bull usa il tempo reale); CharactersService assente (nessun change stream).
 */
describe('SpellRecoveryProcessor (real Redis)', () => {
    let app: INestApplication;
    let queue: Queue;
    let characters: Model<CharacterDocument>;
    let spells: Model<SpellDocument>;
    let connection: Connection;
    let spell: Types.ObjectId;
    let heroes = 0;

    beforeAll(async () => {
        const { host, port } = await startRedis();
        const moduleRef = await Test.createTestingModule({
            imports: [
                MongooseModule.forRoot(process.env.MONGO_TEST_URI as string, {
                    dbName: 'spell-recovery-processor-test',
                }),
                MongooseModule.forFeature([
                    { name: Character.name, schema: CharacterSchema },
                    { name: Spell.name, schema: SpellSchema },
                ]),
                BullModule.forRoot({ redis: { host, port } }),
                BullModule.registerQueue({ name: SPELL_RECOVERY_QUEUE }),
            ],
            providers: [
                SpellRecoveryProcessor,
                SpellRecoveryService,
                SpellStateMigrator,
                { provide: Clock, useClass: SystemClock },
            ],
        }).compile();

        app = moduleRef.createNestApplication();
        await app.init();

        queue = app.get<Queue>(getQueueToken(SPELL_RECOVERY_QUEUE));
        characters = app.get<Model<CharacterDocument>>(
            getModelToken(Character.name),
        );
        spells = app.get<Model<SpellDocument>>(getModelToken(Spell.name));
        connection = app.get<Connection>(getConnectionToken());
        await characters.init();
    }, 120_000);

    beforeEach(async () => {
        spell = (
            await persistSpell(spells, { maxUsages: 3, recoveryTime: MINUTE })
        )._id as Types.ObjectId;
    });

    // documenti scritti dalla connessione Nest: sfuggono alla pulizia globale
    afterEach(async () => {
        jest.restoreAllMocks();
        await Promise.all(
            Object.values(connection.collections).map((collection) =>
                collection.deleteMany({}),
            ),
        );
    });

    afterAll(async () => {
        // Redis condiviso in CI: nessun job residuo per le suite successive
        if (queue) await queue.empty();
        if (app) {
            await connection.dropDatabase();
            await app.close();
        }
        await stopRedis();
    });

    // nome unico: l'indice character_name_active_ci_unique vale anche per gli insert grezzi
    async function insertBook(
        entries: readonly SpellBookEntry[],
    ): Promise<Types.ObjectId> {
        const base = buildCharacter();
        const book = spellBook(entries);
        heroes += 1;
        const _id = new Types.ObjectId();
        await characters.collection.insertOne({
            ...base,
            _id,
            infos: { ...base.infos, name: `Hero ${heroes}` },
            status: {
                ...base.status,
                spells: book.spells,
                spellStates: book.spellStates,
            },
            assets: { ...base.assets, activeSpells: book.activeSpells },
        } as never);
        return _id;
    }

    async function rawOf(id: Types.ObjectId) {
        return characters.collection.findOne({ _id: id });
    }

    async function stateOf(id: Types.ObjectId): Promise<RawSpellState> {
        const raw = await rawOf(id);
        return (raw?.status.spellStates as RawSpellState[])[0];
    }

    async function usagesReach(
        id: Types.ObjectId,
        usages: number,
    ): Promise<boolean> {
        return (await stateOf(id)).usages === usages;
    }

    function logged(spy: jest.SpyInstance, message: string): boolean {
        return spy.mock.calls.some(([value]) => value === message);
    }

    it(
        '«Il timer di recupero non si interrompe mai»: a job whose instant is due gives the usage back to an unequipped spell',
        async () => {
            const dueAt = new Date(Date.now() - SECOND);
            const id = await insertBook([
                { spell, usages: 1, recoveries: [dueAt] },
            ]);

            await queue.add(
                RECOVER_SPELL_JOB,
                {
                    characterId: id.toHexString(),
                    spellId: spell.toHexString(),
                    dueAt: dueAt.getTime(),
                },
                { jobId: spellRecoveryJobId(id, spell, dueAt) },
            );

            expect(await waitFor(() => usagesReach(id, 2))).toBe(true);
            expect(await stateOf(id)).toEqual({
                spell,
                usages: 2,
                recoveries: [],
            });
            expect((await rawOf(id))?.assets.activeSpells).toEqual([]);
        },
        TEST_TIMEOUT_MS,
    );

    it(
        'gives back the untracked deficit for a legacy job without an instant',
        async () => {
            const id = await insertBook([{ spell, usages: 1, recoveries: [] }]);

            await queue.add(RECOVER_SPELL_JOB, {
                characterId: id.toHexString(),
                spellId: spell.toHexString(),
            });

            expect(await waitFor(() => usagesReach(id, 2))).toBe(true);
            expect(await stateOf(id)).toEqual({
                spell,
                usages: 2,
                recoveries: [],
            });
        },
        TEST_TIMEOUT_MS,
    );

    it(
        'leaves an early job to the sweep without writing or queueing it again',
        async () => {
            const log = jest.spyOn(Logger.prototype, 'log');
            const dueAt = new Date(Date.now() + HOUR);
            const id = await insertBook([
                { spell, usages: 2, recoveries: [dueAt] },
            ]);
            const jobId = spellRecoveryJobId(id, spell, dueAt);
            const message = `Job di recupero ${jobId} in anticipo: lo restituirà lo sweep`;
            const before = await rawOf(id);

            await queue.add(
                RECOVER_SPELL_JOB,
                {
                    characterId: id.toHexString(),
                    spellId: spell.toHexString(),
                    dueAt: dueAt.getTime(),
                },
                { jobId, delay: 0 },
            );

            expect(await waitFor(() => logged(log, message))).toBe(true);
            // asserzione negativa: il processor ha già risposto, la finestra esclude scritture tardive
            await pause(NEGATIVE_WAIT_MS);

            expect(await rawOf(id)).toEqual(before);
            expect(await queue.getDelayed()).toEqual([]);
        },
        TEST_TIMEOUT_MS,
    );

    it(
        'skips malformed job data with a warning',
        async () => {
            const warn = jest.spyOn(Logger.prototype, 'warn');

            const job = await queue.add(RECOVER_SPELL_JOB, {
                characterId: 'x',
                spellId: 'y',
            });
            const message = `Job di recupero ${String(job.id)} malformato: ignorato`;

            expect(await waitFor(() => logged(warn, message))).toBe(true);
        },
        TEST_TIMEOUT_MS,
    );

    it(
        'credits once when the same deterministic job id is queued twice',
        async () => {
            const dueAt = new Date(Date.now() - SECOND);
            const id = await insertBook([
                { spell, usages: 1, recoveries: [dueAt] },
            ]);
            const data = {
                characterId: id.toHexString(),
                spellId: spell.toHexString(),
                dueAt: dueAt.getTime(),
            };
            const jobId = spellRecoveryJobId(id, spell, dueAt);

            await Promise.all([
                queue.add(RECOVER_SPELL_JOB, data, { jobId }),
                queue.add(RECOVER_SPELL_JOB, data, { jobId }),
            ]);

            expect(await waitFor(() => usagesReach(id, 2))).toBe(true);
            // asserzione negativa: nessun secondo credito entro la finestra
            await pause(NEGATIVE_WAIT_MS);
            expect(await stateOf(id)).toEqual({
                spell,
                usages: 2,
                recoveries: [],
            });
        },
        TEST_TIMEOUT_MS,
    );
});
