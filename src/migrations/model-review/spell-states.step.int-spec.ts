// UNA TANTUM (Phase 19 D-12): prova sul replica set il passo della lista unica delle magie con documenti grezzi — esce dal repo dopo il boot reale
import { Logger } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { mongo, Types } from 'mongoose';
import {
    Character,
    CharacterSchema,
} from 'src/models/character/character.model';
import { Spell, SpellSchema } from 'src/models/spell.model';
import {
    AuthTestApp,
    createAuthTestApp,
} from '../../../test/auth/auth-test-app';
import { buildSpell } from '../../../test/fixtures/spell.fixture';
import {
    insertLegacy,
    legacyCharacterWithSpells,
    type LegacySpellListsFixture,
    rawById,
    writeAfterNextRead,
} from './legacy-fixtures';
import { SpellStatesStep } from './spell-states.step';

const OLD_KNOWN_LIST = 'spells';
const OLD_EQUIPPED_LIST = 'activeSpells';
const OLD_SLOT_COUNT = 'maxActiveSpells';

const STATUS_KEYS = [
    'coins',
    'currentLifePoints',
    'injuries',
    'level',
    'location',
    'maxLifePoints',
    'spellStates',
    'title',
    'xp',
];

const ASSET_KEYS = [
    'ownedEquipments',
    'ownedItems',
    'ownedPets',
    'pet',
    'wearedEquipment',
];

const FIRST_RECOVERY = new Date('2026-11-11T10:00:00.000Z');

describe('SpellStatesStep (replSet)', () => {
    let harness: AuthTestApp;
    let step: SpellStatesStep;
    let warnSpy: jest.SpyInstance;

    const insertCatalogSpell = (maxUsages: number): Promise<Types.ObjectId> =>
        insertLegacy(harness.connection, Spell.name, buildSpell({ maxUsages }));

    const insertCharacter = (
        lists: LegacySpellListsFixture,
        overrides: Record<string, unknown> = {},
    ): Promise<Types.ObjectId> =>
        insertLegacy(
            harness.connection,
            Character.name,
            legacyCharacterWithSpells(lists, overrides),
        );

    const rawCharacter = async (id: Types.ObjectId) =>
        (await rawById(harness.connection, Character.name, id)) ?? {};

    const statusOf = async (id: Types.ObjectId) =>
        (await rawCharacter(id)).status as Record<string, unknown>;

    const assetsOf = async (id: Types.ObjectId) =>
        (await rawCharacter(id)).assets as Record<string, unknown>;

    const withoutLists = (raw: Record<string, unknown>) => {
        const status = { ...(raw.status as Record<string, unknown>) };
        const assets = { ...(raw.assets as Record<string, unknown>) };
        delete status[OLD_KNOWN_LIST];
        delete status.spellStates;
        delete status[OLD_SLOT_COUNT];
        delete assets[OLD_EQUIPPED_LIST];
        return { ...raw, status, assets };
    };

    beforeAll(async () => {
        harness = await createAuthTestApp({
            imports: [
                MongooseModule.forFeature([
                    { name: Character.name, schema: CharacterSchema },
                    { name: Spell.name, schema: SpellSchema },
                ]),
            ],
            providers: [SpellStatesStep],
        });
        step = harness.app.get(SpellStatesStep);
    });

    beforeEach(() => {
        warnSpy = jest
            .spyOn(Logger.prototype, 'warn')
            .mockImplementation(() => undefined);
    });

    afterEach(async () => {
        warnSpy.mockRestore();
        await harness.clearDatabase();
    });

    afterAll(async () => {
        await harness.close();
    });

    it('merges the three lists and drops the two old ones in one write (D-07)', async () => {
        const fireball = await insertCatalogSpell(3);
        const frost = await insertCatalogSpell(5);
        const spark = await insertCatalogSpell(2);
        const id = await insertCharacter({
            spells: [fireball, frost, spark],
            spellStates: [
                { spell: fireball, usages: 1, recoveries: [FIRST_RECOVERY] },
                { spell: frost, usages: 5, recoveries: [] },
            ],
            activeSpells: [
                { spell: spark, usages: 2 },
                { spell: fireball, usages: 1 },
            ],
        });
        const before = await rawCharacter(id);

        await expect(step.run()).resolves.toEqual({
            found: 1,
            migrated: 1,
            alreadyDone: 0,
            unmatched: 0,
        });

        const status = await statusOf(id);
        expect(status.spellStates).toEqual([
            {
                spell: fireball,
                usages: 1,
                recoveries: [FIRST_RECOVERY],
                active: true,
            },
            { spell: frost, usages: 5, recoveries: [], active: false },
            { spell: spark, usages: 2, recoveries: [], active: true },
        ]);
        expect(Object.keys(status).sort()).toEqual(STATUS_KEYS);
        expect(Object.keys(status)).not.toContain(OLD_KNOWN_LIST);
        const assets = await assetsOf(id);
        expect(Object.keys(assets).sort()).toEqual(ASSET_KEYS);
        expect(Object.keys(assets)).not.toContain(OLD_EQUIPPED_LIST);
        expect(withoutLists(await rawCharacter(id))).toEqual(
            withoutLists(before),
        );
        expect(warnSpy).not.toHaveBeenCalled();
    });

    it('drops a persisted max active spells value with the old lists (D-08)', async () => {
        const id = await insertCharacter(
            { spells: [], spellStates: [], activeSpells: [] },
            { status: { [OLD_SLOT_COUNT]: 2 } },
        );

        await step.run();

        expect(Object.keys(await statusOf(id)).sort()).toEqual(STATUS_KEYS);
    });

    it('migrates a character that has no spells at all (D-07)', async () => {
        const id = await insertCharacter({
            spells: [],
            spellStates: [],
            activeSpells: [],
        });

        await expect(step.run()).resolves.toEqual({
            found: 1,
            migrated: 1,
            alreadyDone: 0,
            unmatched: 0,
        });

        const status = await statusOf(id);
        expect(status.spellStates).toEqual([]);
        expect(Object.keys(status).sort()).toEqual(STATUS_KEYS);
        expect(Object.keys(await assetsOf(id)).sort()).toEqual(ASSET_KEYS);
    });

    it('migrates an archived character too (D-07)', async () => {
        const fireball = await insertCatalogSpell(3);
        const lists = {
            spells: [fireball],
            spellStates: [{ spell: fireball, usages: 2, recoveries: [] }],
            activeSpells: [{ spell: fireball, usages: 2 }],
        };
        const archived = await insertCharacter(lists, {
            deletedAt: new Date('2026-10-01T00:00:00.000Z'),
        });
        const active = await insertCharacter(lists);

        await expect(step.run()).resolves.toEqual({
            found: 2,
            migrated: 2,
            alreadyDone: 0,
            unmatched: 0,
        });

        const entries = [
            { spell: fireball, usages: 2, recoveries: [], active: true },
        ];
        expect((await statusOf(archived)).spellStates).toEqual(entries);
        expect((await statusOf(active)).spellStates).toEqual(entries);
    });

    it('never uses the active flag as the idempotence marker (D-07)', async () => {
        const fireball = await insertCatalogSpell(3);
        const alreadyNew = await insertCharacter({
            spellStates: [
                { spell: fireball, usages: 2, recoveries: [], active: true },
            ],
        });
        const flaggedButOld = await insertCharacter({
            spells: [fireball],
            spellStates: [
                { spell: fireball, usages: 2, recoveries: [], active: true },
            ],
            activeSpells: [],
        });
        // voce scritta dal codice nuovo: il suo flag vince sulla lista vecchia (C-WR-01)
        const untouched = await rawCharacter(alreadyNew);

        await expect(step.run()).resolves.toEqual({
            found: 2,
            migrated: 1,
            alreadyDone: 1,
            unmatched: 0,
        });

        expect(await rawCharacter(alreadyNew)).toEqual(untouched);
        const status = await statusOf(flaggedButOld);
        expect(status.spellStates).toEqual([
            { spell: fireball, usages: 2, recoveries: [], active: true },
        ]);
        expect(Object.keys(status).sort()).toEqual(STATUS_KEYS);
    });

    it('fills a missing state from the catalogue maximum (D-07)', async () => {
        const frost = await insertCatalogSpell(5);
        const id = await insertCharacter({
            spells: [frost],
            activeSpells: [],
        });

        await step.run();

        expect((await statusOf(id)).spellStates).toEqual([
            { spell: frost, usages: 5, recoveries: [], active: false },
        ]);
    });

    it('keeps the entries the new code wrote before the step and loses none (C-WR-01)', async () => {
        const fireball = await insertCatalogSpell(3);
        const studied = await insertCatalogSpell(4);
        const id = await insertCharacter({
            spells: [fireball],
            spellStates: [
                { spell: fireball, usages: 2, recoveries: [], active: true },
                {
                    spell: studied,
                    usages: 4,
                    recoveries: [FIRST_RECOVERY],
                    active: false,
                },
            ],
            activeSpells: [],
        });

        await expect(step.run()).resolves.toEqual({
            found: 1,
            migrated: 1,
            alreadyDone: 0,
            unmatched: 0,
        });

        expect((await statusOf(id)).spellStates).toEqual([
            { spell: fireball, usages: 2, recoveries: [], active: true },
            {
                spell: studied,
                usages: 4,
                recoveries: [FIRST_RECOVERY],
                active: false,
            },
        ]);
        expect(warnSpy).not.toHaveBeenCalled();
    });

    it('counts the anomalies of a character and logs its id with the spell ids left out (D-07, C-WR-01)', async () => {
        const fireball = await insertCatalogSpell(3);
        const unknownActive = new Types.ObjectId();
        const unknownState = new Types.ObjectId();
        const id = await insertCharacter({
            spells: [fireball],
            spellStates: [
                { spell: fireball, usages: 2, recoveries: [] },
                { spell: unknownState, usages: 1, recoveries: [] },
            ],
            activeSpells: [
                { spell: fireball, usages: 3 },
                { spell: unknownActive, usages: 1 },
            ],
        });

        await expect(step.run()).resolves.toEqual({
            found: 1,
            migrated: 1,
            alreadyDone: 0,
            unmatched: 3,
        });

        expect((await statusOf(id)).spellStates).toEqual([
            { spell: fireball, usages: 2, recoveries: [], active: true },
        ]);
        expect(warnSpy.mock.calls).toEqual([
            [
                `Revisione dei modelli, lista delle magie: personaggio ${id.toHexString()}, usi in conflitto 1, equipaggiate non conosciute 1 [${unknownActive.toHexString()}], stati lasciati fuori 1 [${unknownState.toHexString()}]`,
            ],
        ]);
    });

    it('leaves for the next boot a character written while the step runs (C-WR-02)', async () => {
        const fireball = await insertCatalogSpell(3);
        const id = await insertCharacter({
            spells: [fireball],
            spellStates: [{ spell: fireball, usages: 1, recoveries: [] }],
            activeSpells: [{ spell: fireball, usages: 1 }],
        });
        const characters = harness.connection.model(Character.name).collection;
        // un credito di recupero cade fra la lettura e la scrittura del passo
        writeAfterNextRead(harness.connection, Character.name, () =>
            characters.updateOne(
                { _id: id },
                { $inc: { 'status.spellStates.0.usages': 1 } },
            ),
        );

        await expect(step.run()).resolves.toEqual({
            found: 1,
            migrated: 0,
            alreadyDone: 0,
            unmatched: 1,
        });

        const status = await statusOf(id);
        expect(status[OLD_KNOWN_LIST]).toEqual([fireball]);
        expect(status.spellStates).toEqual([
            { spell: fireball, usages: 2, recoveries: [] },
        ]);
        expect(warnSpy.mock.calls).toEqual([
            [
                `Revisione dei modelli, lista delle magie: personaggio ${id.toHexString()} cambiato durante il passo, scrittura non applicata: si ritenta al prossimo boot`,
            ],
        ]);

        await expect(step.run()).resolves.toEqual({
            found: 1,
            migrated: 1,
            alreadyDone: 0,
            unmatched: 1,
        });
        expect((await statusOf(id)).spellStates).toEqual([
            { spell: fireball, usages: 2, recoveries: [], active: true },
        ]);
    });

    it('still writes a character whose numbers are stored as doubles or longs (C-WR-02)', async () => {
        const fireball = await insertCatalogSpell(3);
        const frost = await insertCatalogSpell(5);
        const id = await insertCharacter({
            spells: [fireball, frost],
            spellStates: [
                {
                    spell: fireball,
                    usages: new mongo.Double(2),
                    recoveries: [FIRST_RECOVERY],
                },
                { spell: frost, usages: mongo.Long.fromNumber(5) },
            ],
            activeSpells: [{ spell: frost, usages: new mongo.Double(5) }],
        });

        await expect(step.run()).resolves.toEqual({
            found: 1,
            migrated: 1,
            alreadyDone: 0,
            unmatched: 0,
        });

        expect((await statusOf(id)).spellStates).toEqual([
            {
                spell: fireball,
                usages: 2,
                recoveries: [FIRST_RECOVERY],
                active: false,
            },
            { spell: frost, usages: 5, recoveries: [], active: true },
        ]);
    });

    it('changes nothing on a second run (D-07)', async () => {
        const fireball = await insertCatalogSpell(3);
        const ids = [
            await insertCharacter({
                spells: [fireball],
                spellStates: [{ spell: fireball, usages: 2, recoveries: [] }],
                activeSpells: [{ spell: fireball, usages: 2 }],
            }),
            await insertCharacter({
                spells: [],
                spellStates: [],
                activeSpells: [],
            }),
            await insertCharacter({ spellStates: [] }),
        ];
        await step.run();
        const afterFirstRun = await Promise.all(ids.map(rawCharacter));

        await expect(step.run()).resolves.toEqual({
            found: 3,
            migrated: 0,
            alreadyDone: 3,
            unmatched: 0,
        });

        expect(await Promise.all(ids.map(rawCharacter))).toEqual(afterFirstRun);
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
