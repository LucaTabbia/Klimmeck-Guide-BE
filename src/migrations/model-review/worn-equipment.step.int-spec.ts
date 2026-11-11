// UNA TANTUM (Phase 19 D-12): prova sul replica set il passo dell'equipaggiamento indossato con documenti grezzi — esce dal repo dopo il boot reale
import { MongooseModule } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import {
    Character,
    CharacterSchema,
} from 'src/models/character/character.model';
import {
    AuthTestApp,
    createAuthTestApp,
} from '../../../test/auth/auth-test-app';
import {
    insertLegacy,
    legacyCharacterWithEquipment,
    rawById,
} from './legacy-fixtures';
import { WornEquipmentStep } from './worn-equipment.step';

const OLD_FIELD = 'wearedEquipment';
const OLD_SLOT = 'foots';

const ASSET_KEYS = [
    'activeSpells',
    'ownedEquipments',
    'ownedItems',
    'ownedPets',
    'pet',
    'wornEquipment',
];

describe('WornEquipmentStep (replSet)', () => {
    let harness: AuthTestApp;
    let step: WornEquipmentStep;

    const insertCharacter = (
        slots: Record<string, unknown>,
        overrides: Record<string, unknown> = {},
    ): Promise<Types.ObjectId> =>
        insertLegacy(
            harness.connection,
            Character.name,
            legacyCharacterWithEquipment(slots, overrides),
        );

    const rawCharacter = async (id: Types.ObjectId) =>
        (await rawById(harness.connection, Character.name, id)) ?? {};

    const assetsOf = async (id: Types.ObjectId) =>
        (await rawCharacter(id)).assets as Record<string, unknown>;

    const wornOf = async (id: Types.ObjectId) =>
        (await assetsOf(id)).wornEquipment as Record<string, unknown>;

    beforeAll(async () => {
        harness = await createAuthTestApp({
            imports: [
                MongooseModule.forFeature([
                    { name: Character.name, schema: CharacterSchema },
                ]),
            ],
            providers: [WornEquipmentStep],
        });
        step = harness.app.get(WornEquipmentStep);
    });

    afterEach(async () => {
        await harness.clearDatabase();
    });

    afterAll(async () => {
        await harness.close();
    });

    it('renames the slot and the field of the worn equipment (D-06)', async () => {
        const boots = new Types.ObjectId();
        const helmet = new Types.ObjectId();
        const id = await insertCharacter({
            head: helmet,
            chest: null,
            [OLD_SLOT]: boots,
            rightHand: null,
        });
        const before = await rawCharacter(id);

        await expect(step.run()).resolves.toEqual({
            found: 1,
            migrated: 1,
            alreadyDone: 0,
            unmatched: 0,
        });

        const assets = await assetsOf(id);
        expect(Object.keys(assets).sort()).toEqual(ASSET_KEYS);
        expect(Object.keys(assets)).not.toContain(OLD_FIELD);
        const worn = await wornOf(id);
        expect(Object.keys(worn).sort()).toEqual([
            'chest',
            'feet',
            'head',
            'rightHand',
        ]);
        expect(worn).toEqual({
            head: helmet,
            chest: null,
            feet: boots,
            rightHand: null,
        });
        expect(withoutAssets(await rawCharacter(id))).toEqual(
            withoutAssets(before),
        );
    });

    it('renames the field of a character without the feet slot (D-06)', async () => {
        const sword = new Types.ObjectId();
        const withoutSlot = await insertCharacter({ rightHand: sword });
        const withEmptySlot = await insertCharacter({ [OLD_SLOT]: null });
        const bare = await insertCharacter({});

        await expect(step.run()).resolves.toEqual({
            found: 3,
            migrated: 3,
            alreadyDone: 0,
            unmatched: 0,
        });

        expect(Object.keys(await assetsOf(withoutSlot)).sort()).toEqual(
            ASSET_KEYS,
        );
        expect(await wornOf(withoutSlot)).toEqual({ rightHand: sword });
        expect(await wornOf(withEmptySlot)).toEqual({ feet: null });
        expect(await wornOf(bare)).toEqual({});
    });

    it('migrates an archived character too (D-06)', async () => {
        const boots = new Types.ObjectId();
        const archived = await insertCharacter(
            { [OLD_SLOT]: boots },
            { deletedAt: new Date('2026-10-01T00:00:00.000Z') },
        );
        const active = await insertCharacter({ [OLD_SLOT]: boots });

        await expect(step.run()).resolves.toEqual({
            found: 2,
            migrated: 2,
            alreadyDone: 0,
            unmatched: 0,
        });

        expect(await wornOf(archived)).toEqual({ feet: boots });
        expect(await wornOf(active)).toEqual({ feet: boots });
    });

    it('never overwrites an equipment already under the new name: counted and untouched (C-WR-03)', async () => {
        const oldBoots = new Types.ObjectId();
        const newHelmet = new Types.ObjectId();
        const withBoth = await insertCharacter(
            { [OLD_SLOT]: oldBoots },
            { assets: { wornEquipment: { head: newHelmet } } },
        );
        const legacy = await insertCharacter({ [OLD_SLOT]: oldBoots });
        const untouched = await rawCharacter(withBoth);

        await expect(step.run()).resolves.toEqual({
            found: 2,
            migrated: 1,
            alreadyDone: 0,
            unmatched: 1,
        });

        expect(await rawCharacter(withBoth)).toEqual(untouched);
        expect(await wornOf(legacy)).toEqual({ feet: oldBoots });

        await expect(step.run()).resolves.toEqual({
            found: 2,
            migrated: 0,
            alreadyDone: 1,
            unmatched: 1,
        });
        expect(await rawCharacter(withBoth)).toEqual(untouched);
    });

    it('changes nothing on a second run (D-06)', async () => {
        const characters = [
            await insertCharacter({ [OLD_SLOT]: new Types.ObjectId() }),
            await insertCharacter({ head: new Types.ObjectId() }),
            await insertCharacter({}, { assets: { [OLD_FIELD]: undefined } }),
        ];
        await expect(step.run()).resolves.toEqual({
            found: 3,
            migrated: 2,
            alreadyDone: 1,
            unmatched: 0,
        });
        const afterFirstRun = await Promise.all(characters.map(rawCharacter));

        await expect(step.run()).resolves.toEqual({
            found: 3,
            migrated: 0,
            alreadyDone: 3,
            unmatched: 0,
        });

        expect(await Promise.all(characters.map(rawCharacter))).toEqual(
            afterFirstRun,
        );
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

// il resto del personaggio, che il passo non deve toccare
function withoutAssets(character: Record<string, unknown>) {
    return Object.fromEntries(
        Object.entries(character).filter(([key]) => key !== 'assets'),
    );
}
