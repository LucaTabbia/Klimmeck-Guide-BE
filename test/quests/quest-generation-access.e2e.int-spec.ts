import { Logger } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AdminAuditLog } from 'src/authz/audit/admin-audit-log.model';
import { AuthzModule } from 'src/authz/authz.module';
import { City } from 'src/models/city.model';
import { Enemy } from 'src/models/enemy.model';
import { RoleType } from 'src/models/enums/role-type.enum';
import { EquipmentItem } from 'src/models/equipment-item.model';
import { LootItem } from 'src/models/loot-item.model';
import { Lore } from 'src/models/lore.model';
import { Pet } from 'src/models/pet.model';
import { PointOfInterest } from 'src/models/point-of-interest.model';
import { Quest } from 'src/models/quest/quest.model';
import { QuestGenerationModule } from 'src/quests/generation/quest-generation.module';
import { QuestGenerator } from 'src/quests/generation/quest-generator.service';
import { SeededChanceSource } from 'src/quests/generation/seeded-chance';
import { ChanceSource } from 'src/quests/outcomes/chance-source';
import {
    AuthTestApp,
    createAuthTestApp,
    graphqlRequest,
} from '../auth/auth-test-app';
import { createPlayer } from '../authz/player-fixture';
import {
    GenerationModels,
    persistGenerationWorld,
    QUIET_GENERATION_CONFIG,
    QUIET_GENERATION_OVERRIDES,
} from './generation-world';

const SEED = 7;
const GENERATE = 'mutation { generateQuests { created } }';
const WAIT_TICKS = 1_000;

interface WireBody {
    data?: { generateQuests?: { created: number } } | null;
    errors?: { extensions?: { code?: string } }[];
}

const nextTick = () => new Promise<void>((resolve) => setImmediate(resolve));

describe('quest generation access end to end (replSet)', () => {
    let harness: AuthTestApp;
    let models: GenerationModels;
    let quests: Model<any>;
    let audits: Model<any>;
    let seq = 0;

    const modelOf = (name: string) =>
        harness.app.get<Model<any>>(getModelToken(name));

    async function bearerOf(role: RoleType): Promise<string> {
        seq += 1;
        const player = await createPlayer(harness, {
            twitchId: `tw-e2e-access-${seq}`,
            role,
            withCharacter: false,
        });
        return player.bearer;
    }

    async function generateAs(bearer: string): Promise<WireBody> {
        const response = await graphqlRequest(
            harness.app,
            GENERATE,
            undefined,
            bearer,
        );
        return response.body as WireBody;
    }

    function standaloneGenerator(
        seed: number,
        questModel: Model<any>,
    ): QuestGenerator {
        return new QuestGenerator(
            models.cities as never,
            models.pois as never,
            questModel as never,
            models.enemies as never,
            models.lore as never,
            models.equipment as never,
            models.loot as never,
            models.pets as never,
            { ...QUIET_GENERATION_CONFIG, target: 1 },
            new SeededChanceSource(seed),
        );
    }

    // ogni insert attende che anche l'altro generatore sia arrivato all'insert: i due leggono lo stesso mondo libero
    function barrierModel(parties: number): Model<any> {
        let arrived = 0;
        let release: () => void = () => undefined;
        const allArrived = new Promise<void>((resolve) => {
            release = resolve;
        });
        return new Proxy(quests, {
            get(target, property) {
                if (property === 'create') {
                    return async (draft: object) => {
                        arrived += 1;
                        if (arrived >= parties) release();
                        await allArrived;
                        return target.create(draft);
                    };
                }
                const value: unknown = Reflect.get(target, property, target);
                return typeof value === 'function' ? value.bind(target) : value;
            },
        });
    }

    // la corsa parte solo quando entrambe le chiamate sono arrivate al generatore: la sovrapposizione non dipende dai tempi
    function holdRunUntilCalls(generator: QuestGenerator, calls: number) {
        const generate = jest.spyOn(generator, 'generate');
        const spied = generator as unknown as { runOnce(): Promise<number> };
        const runOnce = spied.runOnce.bind(generator);
        jest.spyOn(spied, 'runOnce').mockImplementation(async () => {
            for (let tick = 0; tick < WAIT_TICKS; tick += 1) {
                if (generate.mock.calls.length >= calls) break;
                await nextTick();
            }
            return runOnce();
        });
        return generate;
    }

    beforeAll(async () => {
        harness = await createAuthTestApp({
            imports: [QuestGenerationModule, AuthzModule],
            overrides: [
                ...QUIET_GENERATION_OVERRIDES,
                {
                    token: ChanceSource,
                    useValue: new SeededChanceSource(SEED),
                },
            ],
        });
        models = {
            cities: modelOf(City.name),
            pois: modelOf(PointOfInterest.name),
            enemies: modelOf(Enemy.name),
            lore: modelOf(Lore.name),
            equipment: modelOf(EquipmentItem.name),
            loot: modelOf(LootItem.name),
            pets: modelOf(Pet.name),
        };
        quests = modelOf(Quest.name);
        audits = modelOf(AdminAuditLog.name);
        await quests.createIndexes();
    });

    afterEach(async () => {
        jest.restoreAllMocks();
        await harness.clearDatabase();
    });

    afterAll(async () => {
        await harness.close();
    });

    it('shares one run between two concurrent innkeeper calls (D-17)', async () => {
        await persistGenerationWorld(models, { cities: 4, poisPerCity: 3 });
        const generate = holdRunUntilCalls(harness.app.get(QuestGenerator), 2);
        const bearer = await bearerOf(RoleType.innkeeper);

        const bodies = await Promise.all([
            generateAs(bearer),
            generateAs(bearer),
        ]);

        expect(generate).toHaveBeenCalledTimes(2);
        const created = bodies.map(
            (body) => body.data?.generateQuests?.created,
        );
        expect(created[0]).toBeGreaterThan(0);
        expect(created).toEqual([created[0], created[0]]);
        expect(await quests.countDocuments({ generated: true })).toBe(
            created[0],
        );
    });

    it('never creates two quests on the same poi under two concurrent generators (D-28)', async () => {
        const world = await persistGenerationWorld(models, {
            cities: 1,
            poisPerCity: 1,
        });
        const [poi] = world.cities[0].poiIds;

        const questModel = barrierModel(2);
        const warn = jest.spyOn(Logger.prototype, 'warn');

        const created = await Promise.all([
            standaloneGenerator(SEED, questModel).generate(),
            standaloneGenerator(SEED + 1, questModel).generate(),
        ]);

        expect(created.reduce((sum, count) => sum + count, 0)).toBe(1);
        const markers = (
            await quests
                .find({ generated: true })
                .lean<{ infos: { markerLocation: Types.ObjectId } }[]>()
        ).map((quest) => quest.infos.markerLocation.toHexString());
        expect(markers).toEqual([poi.toHexString()]);
        expect(warn.mock.calls).toEqual([
            [
                `Generatore: POI ${poi.toHexString()} già occupato da un'altra corsa, si prosegue`,
            ],
        ]);
    });

    it('refuses an adventurer and a guard with FORBIDDEN without generating (D-16)', async () => {
        await persistGenerationWorld(models, { cities: 3, poisPerCity: 2 });

        const bodies = [
            await generateAs(await bearerOf(RoleType.adventurer)),
            await generateAs(await bearerOf(RoleType.guard)),
        ];

        expect(
            bodies.map(({ data, errors }) => ({
                data: data ?? null,
                codes: (errors ?? []).map((error) => error.extensions?.code),
            })),
        ).toEqual([
            { data: null, codes: ['FORBIDDEN'] },
            { data: null, codes: ['FORBIDDEN'] },
        ]);
        expect(await quests.countDocuments()).toBe(0);
    });

    it('audits the innkeeper run without auditing the refused calls (D-16)', async () => {
        await persistGenerationWorld(models, { cities: 3, poisPerCity: 2 });

        await generateAs(await bearerOf(RoleType.adventurer));
        const body = await generateAs(await bearerOf(RoleType.innkeeper));
        await generateAs(await bearerOf(RoleType.guard));

        expect(body.errors).toBeUndefined();
        const records = await audits.find().lean().exec();
        expect(records).toHaveLength(1);
        expect(records[0]).toMatchObject({
            actor: { role: 'innkeeper' },
            action: 'generateQuests',
            target: { type: 'QuestGeneration', id: null },
            outcome: 'ok',
        });
    });
});
