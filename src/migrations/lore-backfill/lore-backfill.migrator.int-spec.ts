import { MongooseModule } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { LoreGeographyModule } from 'src/lore/lore-geography.module';
import {
    Character,
    CharacterSchema,
} from 'src/models/character/character.model';
import { Enemy, EnemySchema } from 'src/models/enemy.model';
import { QuestOutcome } from 'src/models/enums/quest-outcome.enum';
import {
    PointOfInterest,
    PointOfInterestSchema,
} from 'src/models/point-of-interest.model';
import {
    QuestResult,
    QuestResultSchema,
} from 'src/models/quest-result/quest-result.model';
import {
    AuthTestApp,
    createAuthTestApp,
} from '../../../test/auth/auth-test-app';
import {
    persistCharacter,
    persistEnemy,
    persistPoi,
} from '../../../test/fixtures';
import { persistGeography } from '../../../test/lore/lore-world';
import { persistQuestResult } from '../../../test/quests/quest-result.fixture';
import { LoreBackfillMigrator } from './lore-backfill.migrator';

interface RawStatus {
    unlockedLore?: unknown[];
    knownEnemies?: unknown[];
}

describe('LoreBackfillMigrator (replSet)', () => {
    let harness: AuthTestApp;
    let migrator: LoreBackfillMigrator;
    let characters: Model<any>;
    let results: Model<any>;
    let enemies: Model<any>;
    let pois: Model<any>;

    const hexes = (ids: readonly unknown[] | undefined) =>
        (ids ?? []).map(String);

    async function rawStatus(id: Types.ObjectId): Promise<RawStatus> {
        const document = await characters.collection.findOne(
            { _id: id },
            { projection: { status: 1 } },
        );
        return (document?.status ?? {}) as RawStatus;
    }

    async function hero(name: string, overrides: Record<string, any> = {}) {
        const character = await persistCharacter(
            characters,
            { ...overrides, infos: { ...heroInfos(), name } },
            pois,
        );
        return character._id as Types.ObjectId;
    }

    function heroInfos() {
        return {
            sex: 'male',
            name: 'Test Hero',
            race: 'human',
            pronoun: 'he',
            classType: 'fighter',
            age: 20,
            background: 'test',
            imagePath: null,
        };
    }

    function statusAt(location: Types.ObjectId, extra: RawStatus = {}) {
        return {
            status: {
                xp: 20000,
                level: 1,
                location,
                title: 'rookie',
                injuries: [],
                spells: [],
                spellStates: [],
                coins: { gold: 0, silver: 0, copper: 0 },
                currentLifePoints: 100,
                maxLifePoints: 100,
                ...extra,
            },
        };
    }

    async function wonAgainst(
        character: Types.ObjectId,
        enemy: Types.ObjectId,
        outcome: QuestOutcome = QuestOutcome.success,
    ) {
        return persistQuestResult(results, {
            character,
            outcome,
            enemies: [{ enemy, quantity: 1 }],
        });
    }

    async function enemyWith(name: string, relatedLore: Types.ObjectId[] = []) {
        const enemy = await persistEnemy(enemies, { name, relatedLore });
        return enemy._id as Types.ObjectId;
    }

    beforeAll(async () => {
        harness = await createAuthTestApp({
            imports: [
                LoreGeographyModule,
                MongooseModule.forFeature([
                    { name: Character.name, schema: CharacterSchema },
                    { name: QuestResult.name, schema: QuestResultSchema },
                    { name: Enemy.name, schema: EnemySchema },
                    {
                        name: PointOfInterest.name,
                        schema: PointOfInterestSchema,
                    },
                ]),
            ],
            providers: [LoreBackfillMigrator],
        });
        migrator = harness.app.get(LoreBackfillMigrator);
        characters = harness.connection.models[Character.name];
        results = harness.connection.models[QuestResult.name];
        enemies = harness.connection.models[Enemy.name];
        pois = harness.connection.models[PointOfInterest.name];
    });

    afterEach(async () => {
        await harness.clearDatabase();
    });

    afterAll(async () => {
        await harness.close();
    });

    async function seededHero() {
        const world = await persistGeography(harness.connection);
        const pageOfTheWolf = new Types.ObjectId();
        const wolf = await enemyWith('Lupo', [pageOfTheWolf]);
        const bandit = await enemyWith('Bandito');
        const dragon = await enemyWith('Drago', [new Types.ObjectId()]);
        const id = await hero('Aldo', statusAt(world.marker));
        await wonAgainst(id, wolf);
        await wonAgainst(id, bandit, QuestOutcome.gmCompleted);
        await wonAgainst(id, dragon, QuestOutcome.failure);
        return { world, id, wolf, bandit, pageOfTheWolf };
    }

    it('backfills an active character from its position and its won results (D-11)', async () => {
        const { world, id, wolf, bandit, pageOfTheWolf } = await seededHero();

        const report = await migrator.backfillAll();

        const status = await rawStatus(id);
        expect(hexes(status.unlockedLore)).toEqual(
            hexes([...world.geography, pageOfTheWolf]),
        );
        expect(hexes(status.knownEnemies)).toEqual(hexes([wolf, bandit]));
        expect(report).toEqual({
            characters: 1,
            updated: 1,
            loreAdded: world.geography.length + 1,
            enemiesAdded: 2,
            withoutCity: 0,
        });
    });

    it('keeps what the character already knows and unites (D-11)', async () => {
        const world = await persistGeography(harness.connection);
        const known = new Types.ObjectId();
        const id = await hero(
            'Bruna',
            statusAt(world.marker, {
                unlockedLore: [known, world.geography[0]],
                knownEnemies: [],
            }),
        );

        await migrator.backfillAll();

        expect(hexes((await rawStatus(id)).unlockedLore)).toEqual(
            hexes([known, ...world.geography]),
        );
    });

    it('changes nothing on a second run (D-11)', async () => {
        const { id } = await seededHero();
        await migrator.backfillAll();
        const before = await characters.collection.findOne({ _id: id });

        const report = await migrator.backfillAll();

        expect(report).toEqual({
            characters: 1,
            updated: 0,
            loreAdded: 0,
            enemiesAdded: 0,
            withoutCity: 0,
        });
        expect(await characters.collection.findOne({ _id: id })).toEqual(
            before,
        );
    });

    it('never touches an archived character (D-11)', async () => {
        const world = await persistGeography(harness.connection);
        const wolf = await enemyWith('Lupo', [new Types.ObjectId()]);
        const id = await hero('Carla', {
            ...statusAt(world.marker, { unlockedLore: [], knownEnemies: [] }),
            deletedAt: new Date('2026-10-01T00:00:00.000Z'),
        });
        await wonAgainst(id, wolf);

        const report = await migrator.backfillAll();

        expect(await rawStatus(id)).toMatchObject({
            unlockedLore: [],
            knownEnemies: [],
        });
        expect(report.characters).toBe(0);
        expect(report.updated).toBe(0);
    });

    it('counts a character on the territory as without city (D-11)', async () => {
        const territory = await persistPoi(pois, { type: 'quest' });
        await hero('Dario', statusAt(territory._id as Types.ObjectId));

        expect(await migrator.backfillAll()).toEqual({
            characters: 1,
            updated: 0,
            loreAdded: 0,
            enemiesAdded: 0,
            withoutCity: 1,
        });
    });

    it('finds the results of a legacy string character ref (D-11)', async () => {
        const territory = await persistPoi(pois, { type: 'quest' });
        const wolf = await enemyWith('Lupo');
        const id = await hero(
            'Elsa',
            statusAt(territory._id as Types.ObjectId),
        );
        const result = await wonAgainst(id, wolf);
        await results.collection.updateOne(
            { _id: result._id },
            { $set: { character: id.toHexString() } },
        );

        const report = await migrator.backfillAll();

        expect(hexes((await rawStatus(id)).knownEnemies)).toEqual(
            hexes([wolf]),
        );
        expect(report.enemiesAdded).toBe(1);
    });

    it('leaves the unlocked lore of the old results untouched (D-11)', async () => {
        const { id } = await seededHero();
        const legacy = await persistQuestResult(results, {
            character: id,
            enemies: [{ enemy: await enemyWith('Orso'), quantity: 1 }],
        });
        await results.collection.updateOne(
            { _id: legacy._id },
            { $unset: { loreUnlocked: '' } },
        );
        const before = await results.collection
            .find({}, { projection: { loreUnlocked: 1 } })
            .sort({ _id: 1 })
            .toArray();

        await migrator.backfillAll();

        expect(
            await results.collection
                .find({}, { projection: { loreUnlocked: 1 } })
                .sort({ _id: 1 })
                .toArray(),
        ).toEqual(before);
        expect(
            before.map((document) => Object.hasOwn(document, 'loreUnlocked')),
        ).toEqual([true, true, true, false]);
    });
});
