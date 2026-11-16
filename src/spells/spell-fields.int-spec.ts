import { type Model, Types } from 'mongoose';
import { Spell } from 'src/models/spell.model';
import { MAX_LEVEL } from 'src/quests/outcomes/progression/level-table';
import {
    AuthTestApp,
    createAuthTestApp,
    graphqlRequest,
} from '../../test/auth/auth-test-app';
import { createPlayer } from '../../test/authz/player-fixture';
import { buildSpell, persistSpell } from '../../test/fixtures/spell.fixture';
import { SpellsModule } from './spells.module';

const SPELLS = '{ spells { id origin minLevelToLearn } }';

function spellWithout(field: string): Record<string, unknown> {
    const spell: Record<string, unknown> = { ...buildSpell() };
    delete spell[field];
    return spell;
}

describe('Spell origin and minimum level', () => {
    let harness: AuthTestApp;
    let spells: Model<any>;
    let bearer: string;

    beforeAll(async () => {
        harness = await createAuthTestApp({ imports: [SpellsModule] });
        spells = harness.connection.model(Spell.name);
    });

    beforeEach(async () => {
        ({ bearer } = await createPlayer(harness, {
            twitchId: 'twitch-spell-fields',
            withCharacter: false,
        }));
    });

    afterEach(async () => {
        await harness.clearDatabase();
    });

    afterAll(async () => {
        await harness.close();
    });

    it('keeps the origin and the minimum level of a spell across a write (D-01, D-07)', async () => {
        const written = await persistSpell(spells, {
            origin: 'shamanic',
            minLevelToLearn: 6,
        });

        const stored = await spells.collection.findOne({ _id: written._id });

        expect(stored).toMatchObject({
            origin: 'shamanic',
            minLevelToLearn: 6,
        });
    });

    it('refuses a spell with an origin outside the three (D-01)', async () => {
        await expect(
            persistSpell(spells, { origin: 'magic' }),
        ).rejects.toMatchObject({ name: 'ValidationError' });
    });

    it('refuses a spell without an origin or without a minimum level (D-01, D-07)', async () => {
        await expect(
            spells.create(spellWithout('origin')),
        ).rejects.toMatchObject({ name: 'ValidationError' });
        await expect(
            spells.create(spellWithout('minLevelToLearn')),
        ).rejects.toMatchObject({ name: 'ValidationError' });
    });

    it('refuses a minimum level below one (D-07)', async () => {
        await expect(
            persistSpell(spells, { minLevelToLearn: 0 }),
        ).rejects.toMatchObject({ name: 'ValidationError' });
    });

    it('refuses a minimum level above the top of the level table (D-07, WR-03)', async () => {
        await expect(
            persistSpell(spells, { minLevelToLearn: MAX_LEVEL + 1 }),
        ).rejects.toMatchObject({ name: 'ValidationError' });
        await expect(
            persistSpell(spells, { minLevelToLearn: MAX_LEVEL }),
        ).resolves.toBeDefined();
    });

    it('serves the origin and the minimum level of every spell on the wire (D-01, D-07)', async () => {
        const voidSpell = await persistSpell(spells, {
            name: 'Vuoto',
            origin: 'void',
            minLevelToLearn: 3,
        });
        const arcaneSpell = await persistSpell(spells, {
            name: 'Arcano',
            origin: 'arcane',
            minLevelToLearn: 1,
        });

        const response = await graphqlRequest(
            harness.app,
            SPELLS,
            undefined,
            bearer,
        ).expect(200);

        expect(response.body.errors).toBeUndefined();
        expect(response.body.data.spells).toEqual([
            { id: String(voidSpell._id), origin: 'void', minLevelToLearn: 3 },
            {
                id: String(arcaneSpell._id),
                origin: 'arcane',
                minLevelToLearn: 1,
            },
        ]);
    });

    it('no longer stores a minimum xp on a spell (D-07)', async () => {
        const written = await spells.create({
            ...buildSpell(),
            minXpToLearn: 4000,
        });

        const stored = await spells.collection.findOne({ _id: written._id });

        expect(Object.keys(stored ?? {})).not.toContain('minXpToLearn');
        expect(Object.keys(buildSpell()).sort()).toEqual([
            'description',
            'energyDamage',
            'maxUsages',
            'minLevelToLearn',
            'name',
            'origin',
            'recoveryTime',
            'requiredLearnTime',
            'useType',
        ]);
    });

    it('stores the related lore of a spell as a list of ids, empty by default (D-24)', async () => {
        const lore = new Types.ObjectId();
        const linked = await persistSpell(spells, { relatedLore: [lore] });
        const bare = await persistSpell(spells);

        const storedLinked = await spells.collection.findOne({
            _id: linked._id,
        });
        const storedBare = await spells.collection.findOne({ _id: bare._id });

        expect(storedLinked?.relatedLore).toEqual([lore]);
        expect(storedBare?.relatedLore).toEqual([]);
    });

    it('serves the fixture spell as arcane from level one (D-01, D-07)', () => {
        expect(buildSpell()).toMatchObject({
            origin: 'arcane',
            minLevelToLearn: 1,
        });
    });
});
