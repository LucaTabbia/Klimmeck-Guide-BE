// UNA TANTUM (Phase 24 D-01, D-07): prova sul replica set il passo delle magie con documenti grezzi — esce dal repo dopo il boot reale
import { Logger } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { Spell, SpellSchema } from 'src/models/spell.model';
import {
    AuthTestApp,
    createAuthTestApp,
} from '../../../test/auth/auth-test-app';
import { SpellFieldsStep } from './spell-fields.step';

type RawSpell = Record<string, unknown>;

// magia del catalogo di oggi: nessun livello né origine, solo l'xp minimo; un override indefinito toglie il campo
function legacySpell(overrides: RawSpell = {}): RawSpell {
    const spell: RawSpell = {
        _id: new Types.ObjectId(),
        name: 'Dardo incantato',
        description: 'Un dardo di energia',
        useType: 'attack',
        requiredLearnTime: 60,
        recoveryTime: 30,
        maxUsages: 3,
        relatedLore: [],
        minXpToLearn: 12_000,
        ...overrides,
    };
    return Object.fromEntries(
        Object.entries(spell).filter(([, value]) => value !== undefined),
    );
}

describe('SpellFieldsStep (replSet)', () => {
    let harness: AuthTestApp;
    let step: SpellFieldsStep;

    const spells = () => harness.connection.model(Spell.name).collection;

    async function insertSpell(overrides: RawSpell = {}): Promise<RawSpell> {
        const spell = legacySpell(overrides);
        await spells().insertOne(spell);
        return spell;
    }

    const rawSpell = async (id: unknown): Promise<RawSpell | null> =>
        spells().findOne({ _id: id as Types.ObjectId });

    beforeAll(async () => {
        harness = await createAuthTestApp({
            imports: [
                MongooseModule.forFeature([
                    { name: Spell.name, schema: SpellSchema },
                ]),
            ],
        });
        step = new SpellFieldsStep(harness.connection);
    });

    afterEach(async () => {
        jest.restoreAllMocks();
        await harness.clearDatabase();
    });

    afterAll(async () => {
        await harness.close();
    });

    it("writes the level and the arcane origin on a spell of today's catalogue and keeps its minimum xp (D-01, D-07)", async () => {
        const spell = await insertSpell({ minXpToLearn: 12_000 });

        await step.run();

        expect(await rawSpell(spell._id)).toEqual({
            ...spell,
            minLevelToLearn: 10,
            origin: 'arcane',
        });
    });

    it('leaves a spell written by the content script untouched (D-07)', async () => {
        const spell = await insertSpell({
            minXpToLearn: undefined,
            minLevelToLearn: 4,
            origin: 'void',
        });
        const before = await rawSpell(spell._id);

        await step.run();

        expect(await rawSpell(spell._id)).toEqual(before);
    });

    it('fills only the missing field of a half migrated spell (D-07)', async () => {
        const withLevel = await insertSpell({
            minXpToLearn: 4_000,
            minLevelToLearn: 3,
        });
        const withOrigin = await insertSpell({
            minXpToLearn: 20_000,
            origin: 'shamanic',
        });

        await step.run();

        expect(await rawSpell(withLevel._id)).toEqual({
            ...withLevel,
            origin: 'arcane',
        });
        expect(await rawSpell(withOrigin._id)).toEqual({
            ...withOrigin,
            minLevelToLearn: 12,
        });
    });

    it('leaves a spell without a convertible minimum xp as it is and counts it (D-07)', async () => {
        const spell = await insertSpell({ minXpToLearn: 'molto' });
        const before = await rawSpell(spell._id);

        await expect(step.run()).resolves.toEqual({
            found: 1,
            migrated: 0,
            alreadyDone: 0,
            unmatched: 1,
        });
        expect(await rawSpell(spell._id)).toEqual(before);
    });

    it('reports found, migrated, already done and unmatched (D-07)', async () => {
        await insertSpell({ minXpToLearn: 4_000 });
        await insertSpell({ minXpToLearn: 30_000, origin: 'void' });
        await insertSpell({
            minXpToLearn: undefined,
            minLevelToLearn: 5,
            origin: 'arcane',
        });
        await insertSpell({ minXpToLearn: null });

        await expect(step.run()).resolves.toEqual({
            found: 4,
            migrated: 2,
            alreadyDone: 1,
            unmatched: 1,
        });
    });

    it('writes nothing on a second run (D-07)', async () => {
        await insertSpell({ minXpToLearn: 4_000 });
        await insertSpell({ minXpToLearn: 50_000, minLevelToLearn: 2 });
        await step.run();
        const afterFirst = await spells().find({}).sort({ _id: 1 }).toArray();

        await expect(step.run()).resolves.toEqual({
            found: 2,
            migrated: 0,
            alreadyDone: 2,
            unmatched: 0,
        });
        expect(await spells().find({}).sort({ _id: 1 }).toArray()).toEqual(
            afterFirst,
        );
    });

    it('does not overwrite a spell changed between the read and the write (D-07)', async () => {
        const spell = await insertSpell({ minXpToLearn: 4_000 });
        const warnSpy = jest
            .spyOn(Logger.prototype, 'warn')
            .mockImplementation(() => undefined);
        const collection = spells();
        const updateOne = collection.updateOne.bind(collection);
        // la scrittura concorrente arriva dopo la lettura del passo e prima della sua scrittura
        jest.spyOn(collection, 'updateOne').mockImplementationOnce(
            async (filter, update) => {
                await updateOne(
                    { _id: spell._id as Types.ObjectId },
                    { $set: { origin: 'void' } },
                );
                return updateOne(filter, update);
            },
        );

        await expect(step.run()).resolves.toEqual({
            found: 1,
            migrated: 0,
            alreadyDone: 0,
            unmatched: 1,
        });
        expect(await rawSpell(spell._id)).toEqual({
            ...spell,
            origin: 'void',
        });
        expect(warnSpy.mock.calls).toEqual([
            [
                `Origini delle magie, magie: magia ${String(spell._id)} cambiata durante il passo, scrittura non applicata`,
            ],
        ]);
    });

    it('reports zeros on an empty catalogue (D-07)', async () => {
        await expect(step.run()).resolves.toEqual({
            found: 0,
            migrated: 0,
            alreadyDone: 0,
            unmatched: 0,
        });
    });
});
