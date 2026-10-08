import { getQueueToken } from '@nestjs/bull';
import { BullModule } from '@nestjs/bull';
import { getModelToken, MongooseModule } from '@nestjs/mongoose';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Queue } from 'bull';
import { Model, Types } from 'mongoose';
import {
    Character,
    CharacterSchema,
} from 'src/models/character/character.model';
import { startRedis, stopRedis } from '../../test/setup/redis';
import { buildCharacter } from '../../test/fixtures';
import { SpellRecoveryProcessor } from './spell-recovery.processor';

/**
 * INTEGRATION: the spell-recovery processor runs against a REAL ephemeral Redis
 * (no ioredis-mock — Bull needs Lua/blocking commands) and the shared
 * MongoMemoryReplSet. We enqueue a real job and wait for it deterministically
 * with job.finished(), then assert the Character usages were incremented (2 -> 3).
 *
 * The processor is registered inside its own Nest app so BullModule wires the
 * @Process handler on init; CharactersService is intentionally NOT imported to
 * avoid opening its change stream in this focused test.
 */
describe('SpellRecoveryProcessor (integration — real Redis + replSet)', () => {
    let app: INestApplication;
    let queue: Queue;
    let characterModel: Model<any>;

    beforeAll(async () => {
        const { host, port } = await startRedis();

        const moduleRef = await Test.createTestingModule({
            imports: [
                MongooseModule.forRoot(process.env.MONGO_TEST_URI as string),
                MongooseModule.forFeature([
                    { name: Character.name, schema: CharacterSchema },
                ]),
                BullModule.forRoot({ redis: { host, port } }),
                BullModule.registerQueue({ name: 'spell-recovery' }),
            ],
            providers: [SpellRecoveryProcessor],
        }).compile();

        app = moduleRef.createNestApplication();
        await app.init();

        queue = moduleRef.get<Queue>(getQueueToken('spell-recovery'));
        characterModel = moduleRef.get<Model<any>>(
            getModelToken(Character.name),
        );
    }, 120000);

    afterAll(async () => {
        if (queue) {
            await queue.empty();
        }
        // app.close() shuts down the BullModule queue (and its Redis clients)
        // together with the Nest-managed Mongoose connection — no double close.
        if (app) {
            await app.close();
        }
        await stopRedis();
    });

    it('increments the active spell usages on the persisted character (2 -> 3)', async () => {
        const spellId = new Types.ObjectId();
        const base = buildCharacter({
            assets: {
                ownedEquipments: [],
                ownedItems: [],
                wearedEquipment: {},
                activeSpells: [{ spell: spellId, usages: 2 }],
                pet: null,
            },
        });
        const character = await characterModel.create(base);
        const characterId = character._id.toString();

        await queue.add(
            'recover',
            { characterId, spellId: spellId.toString() },
            {},
        );

        // Deterministic wait — poll the persisted document until the processor
        // has incremented usages, guarded by an explicit timeout (no fixed
        // sleep). Polling avoids the extra subscriber connection that
        // job.finished() opens (which would leak an open handle).
        const getUsages = async (): Promise<number | undefined> => {
            const reloaded = await characterModel.findById(characterId).exec();
            const activeSpell = reloaded.assets.activeSpells.find(
                (a: any) => a.spell?.toString() === spellId.toString(),
            );
            return activeSpell?.usages;
        };

        const deadline = Date.now() + 15000;
        let usages = await getUsages();
        while (usages !== 3 && Date.now() < deadline) {
            await new Promise((resolve) => setTimeout(resolve, 100));
            usages = await getUsages();
        }

        expect(usages).toBe(3);
    }, 30000);
});
