import { Logger } from '@nestjs/common';
import { getModelToken, MongooseModule } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
    EquipmentItem,
    EquipmentItemDocument,
    EquipmentItemSchema,
} from 'src/models/equipment-item.model';
import {
    AuthTestApp,
    createAuthTestApp,
} from '../../../test/auth/auth-test-app';
import { buildEquipmentItem } from '../../../test/fixtures/catalog-item.fixture';
import {
    JEWEL_ACCESSORY_USE_TYPES,
    JewelAccessoryMigrator,
} from './jewel-accessory.migrator';

const SCALED_RING = '68c19536541d89c481b832c8';
const PURITY_AMULET = '68c19536541d89c481b832d7';
const IRON_RING = '68c19536541d89c481b832c0';
const BRONZE_RING = '68c19536541d89c481b832bf';

describe('JewelAccessoryMigrator (replSet)', () => {
    let harness: AuthTestApp;
    let items: Model<EquipmentItemDocument>;
    let migrator: JewelAccessoryMigrator;
    let warnSpy: jest.SpyInstance;

    async function insertJewel(
        hex: string,
        overrides: Record<string, unknown>,
    ): Promise<void> {
        await items.collection.insertOne({
            ...buildEquipmentItem(overrides),
            _id: new Types.ObjectId(hex),
        });
    }

    async function useTypesOf(hex: string): Promise<unknown> {
        const raw = await items.collection.findOne({
            _id: new Types.ObjectId(hex),
        });
        return raw?.accessoryUseTypes;
    }

    beforeAll(async () => {
        harness = await createAuthTestApp({
            imports: [
                MongooseModule.forFeature([
                    { name: EquipmentItem.name, schema: EquipmentItemSchema },
                ]),
            ],
        });
        items = harness.app.get<Model<EquipmentItemDocument>>(
            getModelToken(EquipmentItem.name),
        );
        migrator = new JewelAccessoryMigrator(items as never);
    });

    beforeEach(() => {
        warnSpy = jest
            .spyOn(Logger.prototype, 'warn')
            .mockImplementation(() => undefined);
    });

    afterEach(async () => {
        jest.restoreAllMocks();
        await harness.clearDatabase();
    });

    afterAll(async () => {
        await harness.close();
    });

    it('pins the 42 approved jewels: 26 defense, 8 attack, 8 both (D-26)', () => {
        const combinations = [...JEWEL_ACCESSORY_USE_TYPES.values()].map(
            (types) => [...types].sort().join('+'),
        );
        const countOf = (combination: string) =>
            combinations.filter((entry) => entry === combination).length;

        expect(JEWEL_ACCESSORY_USE_TYPES.size).toBe(42);
        expect({
            defense: countOf('defense'),
            attack: countOf('attack'),
            both: countOf('attack+defense'),
        }).toEqual({ defense: 26, attack: 8, both: 8 });
    });

    it('writes the approved use types only where the field is missing (D-26)', async () => {
        await insertJewel(SCALED_RING, { equipType: 'ring' });
        await insertJewel(PURITY_AMULET, { equipType: 'necklace' });
        await insertJewel(IRON_RING, {
            equipType: 'ring',
            accessoryUseTypes: ['attack'],
        });

        const report = await migrator.migrate();

        expect(report.written).toBe(2);
        expect(await useTypesOf(SCALED_RING)).toEqual(['attack', 'defense']);
        expect(await useTypesOf(PURITY_AMULET)).toEqual(['defense']);
        expect(await useTypesOf(IRON_RING)).toEqual(['attack']);
    });

    it('never writes on a piece that is not a ring or a necklace (D-24)', async () => {
        await insertJewel(BRONZE_RING, { equipType: 'weapon' });

        const report = await migrator.migrate();

        expect(report.written).toBe(0);
        const raw = await items.collection.findOne({
            _id: new Types.ObjectId(BRONZE_RING),
        });
        expect(Object.keys(raw ?? {})).not.toContain('accessoryUseTypes');
        expect(report.missing).not.toContain(BRONZE_RING);
    });

    it('warns with ids only about the approved jewels missing from the database (D-26)', async () => {
        await insertJewel(SCALED_RING, { equipType: 'ring' });
        const absent = [...JEWEL_ACCESSORY_USE_TYPES.keys()].filter(
            (hex) => hex !== SCALED_RING,
        );

        const report = await migrator.migrate();

        expect(report).toEqual({ written: 1, missing: absent, notJewels: [] });
        expect(warnSpy.mock.calls).toEqual([
            [
                `Gioielli: 41 della tabella non trovati a DB: ${absent.join(', ')}`,
            ],
        ]);
        expect(String(warnSpy.mock.calls[0][0])).not.toMatch(/mongodb|:\/\//);
    });

    it('warns with ids only about the approved jewels stored as another equip type (D-26)', async () => {
        await insertJewel(BRONZE_RING, { equipType: 'weapon' });
        const absent = [...JEWEL_ACCESSORY_USE_TYPES.keys()].filter(
            (hex) => hex !== BRONZE_RING,
        );

        const report = await migrator.migrate();

        expect(report).toEqual({
            written: 0,
            missing: absent,
            notJewels: [BRONZE_RING],
        });
        expect(warnSpy.mock.calls).toEqual([
            [
                `Gioielli: 41 della tabella non trovati a DB: ${absent.join(', ')}`,
            ],
            [
                `Gioielli: 1 della tabella non sono anelli né collane a DB: ${BRONZE_RING}`,
            ],
        ]);
    });

    it('writes nothing on the second run (D-26)', async () => {
        await insertJewel(SCALED_RING, { equipType: 'ring' });
        await insertJewel(PURITY_AMULET, { equipType: 'necklace' });
        await migrator.migrate();

        const second = await migrator.migrate();

        expect(second.written).toBe(0);
        expect(await useTypesOf(SCALED_RING)).toEqual(['attack', 'defense']);
    });
});
