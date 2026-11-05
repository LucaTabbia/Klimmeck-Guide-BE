import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
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
import { SeededChanceSource } from 'src/quests/generation/seeded-chance';
import { ChanceSource } from 'src/quests/outcomes/chance-source';
import {
    AuthTestApp,
    createAuthTestApp,
    graphqlRequest,
} from '../../../test/auth/auth-test-app';
import { createPlayer } from '../../../test/authz/player-fixture';
import {
    GenerationModels,
    persistGenerationWorld,
    QUIET_GENERATION_OVERRIDES,
    SeatedQuest,
    seatViolationsOf,
} from '../../../test/quests/generation-world';

const GENERATE = 'mutation { generateQuests { created } }';

interface WireBody {
    data?: { generateQuests?: { created: number } } | null;
    errors?: { extensions?: { code?: string } }[];
}

describe('generateQuests (replSet)', () => {
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
            twitchId: `tw-generate-${seq}`,
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

    beforeAll(async () => {
        harness = await createAuthTestApp({
            imports: [QuestGenerationModule, AuthzModule],
            overrides: [
                ...QUIET_GENERATION_OVERRIDES,
                { token: ChanceSource, useValue: new SeededChanceSource(7) },
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

    beforeEach(async () => {
        await persistGenerationWorld(models, { cities: 3, poisPerCity: 2 });
    });

    afterEach(async () => {
        await harness.clearDatabase();
    });

    afterAll(async () => {
        await harness.close();
    });

    it('lets the innkeeper run the generator and returns the created count (D-16)', async () => {
        const body = await generateAs(await bearerOf(RoleType.innkeeper));

        expect(body.errors).toBeUndefined();
        const created = body.data?.generateQuests?.created ?? 0;
        expect(created).toBeGreaterThan(0);
        expect(await quests.countDocuments({ generated: true })).toBe(created);
    });

    it('returns zero when the world is full (D-16)', async () => {
        const bearer = await bearerOf(RoleType.innkeeper);
        await generateAs(bearer);
        const before = await quests.countDocuments({ generated: true });

        const body = await generateAs(bearer);

        expect(body).toEqual({ data: { generateQuests: { created: 0 } } });
        expect(await quests.countDocuments({ generated: true })).toBe(before);
    });

    it('refuses an adventurer and a guard with FORBIDDEN without generating (D-16)', async () => {
        const bodies = [
            await generateAs(await bearerOf(RoleType.adventurer)),
            await generateAs(await bearerOf(RoleType.guard)),
        ];

        expect(
            bodies.map(({ data, errors }) => ({
                data: data ?? null,
                extensions: errors?.[0]?.extensions,
            })),
        ).toEqual([
            { data: null, extensions: { code: 'FORBIDDEN' } },
            { data: null, extensions: { code: 'FORBIDDEN' } },
        ]);
        expect(await quests.countDocuments()).toBe(0);
        expect(await audits.countDocuments()).toBe(0);
    });

    it('audits every innkeeper run (D-16)', async () => {
        const bearer = await bearerOf(RoleType.innkeeper);
        await generateAs(bearer);
        await generateAs(bearer);

        const records = await audits.find().lean().exec();
        expect(records).toHaveLength(2);
        for (const record of records) {
            expect(record).toMatchObject({
                actor: { role: 'innkeeper' },
                action: 'generateQuests',
                target: { type: 'QuestGeneration', id: null },
                outcome: 'ok',
            });
        }
    });

    // ultimo caso: il seme è condiviso, così i tiri dei casi precedenti non cambiano
    it('writes one seat on every enemy quest of an innkeeper run (D-09)', async () => {
        const body = await generateAs(await bearerOf(RoleType.innkeeper));

        expect(body.errors).toBeUndefined();
        const created = await quests
            .find({ generated: true })
            .lean<SeatedQuest[]>();
        expect(created.length).toBeGreaterThan(0);
        expect(seatViolationsOf(created)).toEqual([]);
    });
});
