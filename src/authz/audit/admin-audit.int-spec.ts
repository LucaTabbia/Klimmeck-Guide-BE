import { Logger } from '@nestjs/common';
import type { Model } from 'mongoose';
import type request from 'supertest';
import {
    AdminAuditLog,
    AdminAuditLogSchema,
} from 'src/authz/audit/admin-audit-log.model';
import { RoleType } from 'src/models/enums/role-type.enum';
import { Spell, SpellDocument } from 'src/models/spell.model';
import { AuthTestApp, graphqlRequest } from '../../../test/auth/auth-test-app';
import { AdminProbeResolver } from '../../../test/authz/admin-probe.resolver';
import { createCharactersTestApp } from '../../../test/authz/characters-test-app';
import { createPlayer, TestPlayer } from '../../../test/authz/player-fixture';
import {
    buildCharacter,
    persistSpell,
    spellBook,
} from '../../../test/fixtures';

const EQUIP_ITEM =
    'mutation($request: EquipItemRequest!) { equipItem(request: $request) { successful } }';
const UNEQUIP_SPELL =
    'mutation($request: EquipSpellRequest!) { unequipSpell(request: $request) { successful } }';
const ADMIN_PROBE_SUCCEED =
    'mutation($id: String!) { adminProbeSucceed(id: $id) }';
const ADMIN_PROBE_FAIL = 'mutation($id: String!) { adminProbeFail(id: $id) }';
const ADMIN_PROBE_QUERY = 'query { adminProbeQuery }';
const CHARACTER = 'query($id: String!) { character(id: $id) { id } }';

interface WireError {
    message: string;
    extensions: Record<string, unknown>;
}

interface WireBody {
    data?: Record<string, unknown> | null;
    errors?: WireError[];
}

function bodyOf(response: request.Response): WireBody {
    return response.body as WireBody;
}

describe('Admin audit log (wire)', () => {
    let harness: AuthTestApp;
    let audits: Model<AdminAuditLog>;
    let spells: Model<SpellDocument>;

    let alice: TestPlayer;
    let bruno: TestPlayer;
    let oste: TestPlayer;
    let aliceCharId: string;
    let osteCharId: string;
    let inactiveSpellId: string;

    function equipItem(
        characterId: string,
        bearer: string,
    ): Promise<request.Response> {
        return graphqlRequest(
            harness.app,
            EQUIP_ITEM,
            { request: { id: characterId, slotType: 'head' } },
            bearer,
        );
    }

    function auditCount(): Promise<number> {
        return audits.countDocuments().exec();
    }

    beforeAll(async () => {
        harness = await createCharactersTestApp({
            providers: [AdminProbeResolver],
        });
        audits =
            (harness.connection.models[AdminAuditLog.name] as
                | Model<AdminAuditLog>
                | undefined) ??
            harness.connection.model<AdminAuditLog>(
                AdminAuditLog.name,
                AdminAuditLogSchema,
            );
        spells = harness.connection.model<SpellDocument>(Spell.name);
    });

    beforeEach(async () => {
        const spellA = await persistSpell(spells, { name: 'Dardo' });
        const spellB = await persistSpell(spells, { name: 'Scudo' });
        inactiveSpellId = String(spellA._id);
        const book = spellBook([
            { spell: spellA._id, usages: 3 },
            { spell: spellB._id, usages: 1, active: true },
        ]);
        const richCharacter = {
            status: {
                ...buildCharacter().status,
                xp: 25000,
                spells: book.spells,
                spellStates: book.spellStates,
            },
            assets: {
                ...buildCharacter().assets,
                activeSpells: book.activeSpells,
            },
        };
        alice = await createPlayer(harness, {
            twitchId: 'twitch-audit-alice',
            characterOverrides: richCharacter,
        });
        bruno = await createPlayer(harness, {
            twitchId: 'twitch-audit-bruno',
            characterOverrides: richCharacter,
        });
        oste = await createPlayer(harness, {
            twitchId: 'twitch-audit-innkeeper',
            role: RoleType.innkeeper,
            characterOverrides: richCharacter,
        });
        aliceCharId = String(alice.character?._id);
        osteCharId = String(oste.character?._id);
    });

    afterEach(async () => {
        jest.restoreAllMocks();
        await harness.clearDatabase();
    });

    afterAll(async () => {
        await harness.close();
    });

    describe('on-behalf player mutations', () => {
        it('records the innkeeper equipping an item on another character', async () => {
            const before = new Date();
            const response = await equipItem(aliceCharId, oste.bearer);
            const after = new Date();

            expect(bodyOf(response).errors).toBeUndefined();
            const records = await audits.find().lean().exec();
            expect(records).toHaveLength(1);
            expect(records[0]).toMatchObject({
                actor: {
                    userId: String(oste.user._id),
                    twitchId: oste.user.twitchId,
                    role: 'innkeeper',
                },
                action: 'equipItem',
                target: { type: 'Character', id: aliceCharId },
                args: { request: { id: aliceCharId, slotType: 'head' } },
                outcome: 'ok',
            });
            expect(records[0].at).toBeInstanceOf(Date);
            expect(records[0].at.getTime()).toBeGreaterThanOrEqual(
                before.getTime(),
            );
            expect(records[0].at.getTime()).toBeLessThanOrEqual(
                after.getTime(),
            );
        });

        it('does not record the innkeeper acting on their own character', async () => {
            const response = await equipItem(osteCharId, oste.bearer);

            expect(bodyOf(response).errors).toBeUndefined();
            expect(await auditCount()).toBe(0);
        });

        it('does not record an adventurer acting on their own character', async () => {
            const response = await equipItem(aliceCharId, alice.bearer);

            expect(bodyOf(response).errors).toBeUndefined();
            expect(await auditCount()).toBe(0);
        });

        it('does not record an attempt rejected by the ownership guard', async () => {
            const response = await equipItem(aliceCharId, bruno.bearer);

            expect(bodyOf(response).errors?.[0]?.extensions).toEqual({
                code: 'FORBIDDEN',
            });
            expect(await auditCount()).toBe(0);
        });

        it('records the error code of a failed on-behalf mutation', async () => {
            const response = await graphqlRequest(
                harness.app,
                UNEQUIP_SPELL,
                { request: { id: aliceCharId, spellId: inactiveSpellId } },
                oste.bearer,
            );

            expect(bodyOf(response).errors?.[0]?.extensions).toEqual({
                code: 'SPELL_NOT_ACTIVE',
            });
            const records = await audits.find().lean().exec();
            expect(records).toHaveLength(1);
            expect(records[0]).toMatchObject({
                action: 'unequipSpell',
                target: { type: 'Character', id: aliceCharId },
                outcome: 'SPELL_NOT_ACTIVE',
            });
        });
    });

    describe('@Roles(innkeeper) mutations', () => {
        it('records a successful admin mutation', async () => {
            const response = await graphqlRequest(
                harness.app,
                ADMIN_PROBE_SUCCEED,
                { id: 'probe-1' },
                oste.bearer,
            );

            expect(bodyOf(response).data?.adminProbeSucceed).toBe(true);
            const records = await audits.find().lean().exec();
            expect(records).toHaveLength(1);
            expect(records[0]).toMatchObject({
                action: 'adminProbeSucceed',
                target: { type: 'Boolean', id: 'probe-1' },
                args: { id: 'probe-1' },
                outcome: 'ok',
            });
        });

        it('records a failed admin mutation with its error code', async () => {
            jest.spyOn(Logger.prototype, 'error').mockImplementation(
                () => undefined,
            );
            const response = await graphqlRequest(
                harness.app,
                ADMIN_PROBE_FAIL,
                { id: 'probe-2' },
                oste.bearer,
            );

            expect(bodyOf(response).errors).toHaveLength(1);
            const records = await audits.find().lean().exec();
            expect(records).toHaveLength(1);
            expect(records[0]).toMatchObject({
                action: 'adminProbeFail',
                target: { type: 'Boolean', id: 'probe-2' },
                outcome: 'INTERNAL_SERVER_ERROR',
            });
        });

        it('does not record an admin mutation rejected by the roles guard', async () => {
            const response = await graphqlRequest(
                harness.app,
                ADMIN_PROBE_SUCCEED,
                { id: 'probe-3' },
                bruno.bearer,
            );

            expect(bodyOf(response).errors?.[0]?.extensions).toEqual({
                code: 'FORBIDDEN',
            });
            expect(await auditCount()).toBe(0);
        });
    });

    it('never records queries, admin or on-behalf', async () => {
        const adminQuery = await graphqlRequest(
            harness.app,
            ADMIN_PROBE_QUERY,
            undefined,
            oste.bearer,
        );
        const onBehalfQuery = await graphqlRequest(
            harness.app,
            CHARACTER,
            { id: aliceCharId },
            oste.bearer,
        );

        expect(bodyOf(adminQuery).errors).toBeUndefined();
        expect(bodyOf(onBehalfQuery).errors).toBeUndefined();
        expect(await auditCount()).toBe(0);
    });

    it('keeps the operation outcome when the audit write fails', async () => {
        jest.spyOn(audits, 'create').mockRejectedValueOnce(
            new Error('disk full'),
        );
        const errorSpy = jest
            .spyOn(Logger.prototype, 'error')
            .mockImplementation(() => undefined);

        const response = await equipItem(aliceCharId, oste.bearer);

        expect(bodyOf(response).errors).toBeUndefined();
        expect(bodyOf(response).data?.equipItem).toEqual({ successful: true });
        expect(errorSpy).toHaveBeenCalled();
        expect(await auditCount()).toBe(0);
    });

    it('declares the 90-day TTL index on the collection', async () => {
        await audits.init();

        expect(await audits.collection.indexes()).toContainEqual(
            expect.objectContaining({
                key: { at: 1 },
                expireAfterSeconds: 7_776_000,
            }),
        );
    });
});
