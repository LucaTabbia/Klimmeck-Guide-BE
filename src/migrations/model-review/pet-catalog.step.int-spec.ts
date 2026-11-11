// UNA TANTUM (Phase 19 D-12): prova sul replica set il passo del catalogo dei pet con documenti grezzi — esce dal repo dopo il boot reale
import { MongooseModule } from '@nestjs/mongoose';
import type { Types } from 'mongoose';
import { Pet, PetSchema } from 'src/models/pet.model';
import {
    AuthTestApp,
    createAuthTestApp,
} from '../../../test/auth/auth-test-app';
import { insertLegacy, legacyPet, rawById } from './legacy-fixtures';
import { PetCatalogStep } from './pet-catalog.step';

const OLD_FIELDS = ['damages', 'xp', 'currentLifePoints'];
const EMPTY_DAMAGES = { base: [], energy: [] };
const BITE = { base: [{ type: 'pierce', power: 40 }], energy: [] };
const THICK_HIDE = { base: [{ type: 'blunt', power: 25 }], energy: [] };
const EMBER_BREATH = { base: [], energy: [{ type: 'fire', power: 15 }] };

describe('PetCatalogStep (replSet)', () => {
    let harness: AuthTestApp;
    let step: PetCatalogStep;

    const insertPet = (
        overrides: Record<string, unknown> = {},
    ): Promise<Types.ObjectId> =>
        insertLegacy(harness.connection, Pet.name, legacyPet(overrides));

    const rawPet = (id: Types.ObjectId) =>
        rawById(harness.connection, Pet.name, id);

    const oldFieldsOf = (stored: Record<string, unknown> | null) =>
        Object.keys(stored ?? {}).filter((key) => OLD_FIELDS.includes(key));

    beforeAll(async () => {
        harness = await createAuthTestApp({
            imports: [
                MongooseModule.forFeature([
                    { name: Pet.name, schema: PetSchema },
                ]),
            ],
            providers: [PetCatalogStep],
        });
        step = harness.app.get(PetCatalogStep);
    });

    afterEach(async () => {
        await harness.clearDatabase();
    });

    afterAll(async () => {
        await harness.close();
    });

    it('moves the damages into the attack and creates an empty defense (D-15)', async () => {
        const id = await insertPet({ damages: BITE });

        await expect(step.run()).resolves.toEqual({
            found: 1,
            migrated: 1,
            alreadyDone: 0,
            unmatched: 0,
        });

        const stored = await rawPet(id);
        expect(stored?.attack).toEqual(BITE);
        expect(stored?.defense).toEqual(EMPTY_DAMAGES);
        expect(Object.keys(stored ?? {}).sort()).toEqual(
            [
                ...Object.keys(legacyPet()).filter(
                    (key) => !OLD_FIELDS.includes(key),
                ),
                '_id',
                'attack',
                'defense',
            ].sort(),
        );
    });

    it('drops the state fields from the catalogue (D-03)', async () => {
        const withState = await insertPet({ xp: 70, currentLifePoints: 4 });
        const onlyState = await insertPet({
            damages: undefined,
            attack: BITE,
            defense: THICK_HIDE,
            xp: 12,
        });

        await step.run();

        const storedWithState = await rawPet(withState);
        expect(oldFieldsOf(storedWithState)).toEqual([]);
        expect(storedWithState?.maxXp).toBe(100);
        expect(storedWithState?.maxLifePoints).toBe(10);
        const storedOnlyState = await rawPet(onlyState);
        expect(oldFieldsOf(storedOnlyState)).toEqual([]);
        expect(storedOnlyState?.attack).toEqual(BITE);
        expect(storedOnlyState?.defense).toEqual(THICK_HIDE);
    });

    it('gives an empty attack to a pet whose damages are null or missing (D-15)', async () => {
        const nullDamages = await insertPet({ damages: null });
        const noDamages = await insertPet({ damages: undefined });

        await step.run();

        const storedNull = await rawPet(nullDamages);
        expect(storedNull?.attack).toEqual(EMPTY_DAMAGES);
        expect(storedNull?.defense).toEqual(EMPTY_DAMAGES);
        expect(oldFieldsOf(storedNull)).toEqual([]);
        const storedMissing = await rawPet(noDamages);
        expect(storedMissing?.attack).toEqual(EMPTY_DAMAGES);
        expect(storedMissing?.defense).toEqual(EMPTY_DAMAGES);
        expect(oldFieldsOf(storedMissing)).toEqual([]);
    });

    it('never overwrites an attack or a defense already written by hand (D-15)', async () => {
        const curatedDefense = await insertPet({
            damages: BITE,
            defense: THICK_HIDE,
        });
        const curatedAttack = await insertPet({
            damages: BITE,
            attack: EMBER_BREATH,
        });

        await expect(step.run()).resolves.toEqual({
            found: 2,
            migrated: 2,
            alreadyDone: 0,
            unmatched: 0,
        });

        const storedDefense = await rawPet(curatedDefense);
        expect(storedDefense?.attack).toEqual(BITE);
        expect(storedDefense?.defense).toEqual(THICK_HIDE);
        expect(oldFieldsOf(storedDefense)).toEqual([]);
        const storedAttack = await rawPet(curatedAttack);
        expect(storedAttack?.attack).toEqual(EMBER_BREATH);
        expect(storedAttack?.defense).toEqual(EMPTY_DAMAGES);
        expect(oldFieldsOf(storedAttack)).toEqual([]);
    });

    it('changes nothing on a second run (D-15)', async () => {
        const ids = [
            await insertPet({ damages: BITE }),
            await insertPet({ damages: null, defense: THICK_HIDE }),
            await insertPet({
                damages: undefined,
                xp: undefined,
                currentLifePoints: undefined,
                attack: EMBER_BREATH,
            }),
        ];
        await step.run();
        const afterFirstRun = await Promise.all(ids.map(rawPet));

        await expect(step.run()).resolves.toEqual({
            found: 3,
            migrated: 0,
            alreadyDone: 3,
            unmatched: 0,
        });

        expect(await Promise.all(ids.map(rawPet))).toEqual(afterFirstRun);
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
