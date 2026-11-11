// UNA TANTUM (Phase 19 D-12): prova sul replica set il passo del back-link dei POI con documenti grezzi — esce dal repo dopo il boot reale
import { MongooseModule } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import {
    PointOfInterest,
    PointOfInterestSchema,
} from 'src/models/point-of-interest.model';
import {
    AuthTestApp,
    createAuthTestApp,
} from '../../../test/auth/auth-test-app';
import { insertLegacy, legacyPoi, rawById } from './legacy-fixtures';
import { PoiQuestStep } from './poi-quest.step';

const BACK_LINK = 'quest';

describe('PoiQuestStep (replSet)', () => {
    let harness: AuthTestApp;
    let step: PoiQuestStep;

    const insertPoi = (
        overrides: Record<string, unknown> = {},
    ): Promise<Types.ObjectId> =>
        insertLegacy(
            harness.connection,
            PointOfInterest.name,
            legacyPoi(overrides),
        );

    const rawPoi = (id: Types.ObjectId) =>
        rawById(harness.connection, PointOfInterest.name, id);

    const withoutBackLink = (doc: Record<string, unknown>) =>
        Object.fromEntries(
            Object.entries(doc).filter(([key]) => key !== BACK_LINK),
        );

    beforeAll(async () => {
        harness = await createAuthTestApp({
            imports: [
                MongooseModule.forFeature([
                    {
                        name: PointOfInterest.name,
                        schema: PointOfInterestSchema,
                    },
                ]),
            ],
            providers: [PoiQuestStep],
        });
        step = harness.app.get(PoiQuestStep);
    });

    afterEach(async () => {
        await harness.clearDatabase();
    });

    afterAll(async () => {
        await harness.close();
    });

    it('removes the back link field where it exists, null included (D-09)', async () => {
        const nullLink = await insertPoi({ quest: null });
        const valuedLink = await insertPoi({
            quest: new Types.ObjectId(),
            type: ['dungeon'],
            location: [1, 2],
        });
        const before = [await rawPoi(nullLink), await rawPoi(valuedLink)];

        await expect(step.run()).resolves.toEqual({
            found: 2,
            migrated: 2,
            alreadyDone: 0,
            unmatched: 0,
        });

        const after = [await rawPoi(nullLink), await rawPoi(valuedLink)];
        expect(after.map((poi) => Object.keys(poi ?? {}).sort())).toEqual([
            ['_id', 'city', 'location', 'type'],
            ['_id', 'city', 'location', 'type'],
        ]);
        expect(after).toEqual(before.map((poi) => withoutBackLink(poi ?? {})));
    });

    it('leaves a point of interest without the field untouched (D-09)', async () => {
        const id = await insertPoi({ quest: undefined });
        const before = await rawPoi(id);

        await expect(step.run()).resolves.toEqual({
            found: 1,
            migrated: 0,
            alreadyDone: 1,
            unmatched: 0,
        });

        expect(await rawPoi(id)).toEqual(before);
    });

    it('changes nothing on a second run (D-09)', async () => {
        const ids = [
            await insertPoi(),
            await insertPoi({ quest: new Types.ObjectId() }),
            await insertPoi({ quest: undefined }),
        ];
        await step.run();
        const afterFirstRun = await Promise.all(ids.map(rawPoi));

        await expect(step.run()).resolves.toEqual({
            found: 3,
            migrated: 0,
            alreadyDone: 3,
            unmatched: 0,
        });

        expect(await Promise.all(ids.map(rawPoi))).toEqual(afterFirstRun);
    });

    it('reports zero on an empty collection (D-12)', async () => {
        await expect(step.run()).resolves.toEqual({
            found: 0,
            migrated: 0,
            alreadyDone: 0,
            unmatched: 0,
        });
    });
});
