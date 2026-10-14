import { Logger } from '@nestjs/common';
import { AdminAuditLogSchema } from 'src/authz/audit/admin-audit-log.model';
import {
    AdminAuditEntry,
    AdminAuditLogService,
} from 'src/authz/audit/admin-audit-log.service';
import { RoleType } from 'src/models/enums/role-type.enum';

function buildEntry(): AdminAuditEntry {
    return {
        actor: {
            userId: '64b0000000000000000000aa',
            twitchId: 'twitch-oste',
            role: RoleType.innkeeper,
        },
        action: 'equipItem',
        target: { type: 'Character', id: '64b0000000000000000000bb' },
        args: { request: { id: 'secret-looking-arg', slotType: 'head' } },
        outcome: 'ok',
    };
}

describe('AdminAuditLogSchema', () => {
    it('declares a 90-day TTL index on at', () => {
        expect(AdminAuditLogSchema.indexes()).toContainEqual([
            { at: 1 },
            expect.objectContaining({ expireAfterSeconds: 7_776_000 }),
        ]);
    });

    it('lives in admin_audit_logs without a version key', () => {
        expect(AdminAuditLogSchema.get('collection')).toBe('admin_audit_logs');
        expect(AdminAuditLogSchema.get('versionKey')).toBe(false);
    });

    it('keeps target.type as a String path (dedicated sub-schema)', () => {
        expect(AdminAuditLogSchema.path('target.type')?.instance).toBe(
            'String',
        );
    });
});

describe('AdminAuditLogService', () => {
    let model: { create: jest.Mock };
    let service: AdminAuditLogService;

    beforeEach(() => {
        model = { create: jest.fn().mockResolvedValue({}) };
        service = new AdminAuditLogService(model as never);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('persists the entry with the current instant', async () => {
        const entry = buildEntry();

        await service.record(entry);

        expect(model.create).toHaveBeenCalledTimes(1);
        expect(model.create).toHaveBeenCalledWith({
            ...entry,
            at: expect.any(Date),
        });
    });

    it('never rejects when the write fails and logs the action without the args', async () => {
        const errorSpy = jest
            .spyOn(Logger.prototype, 'error')
            .mockImplementation(() => undefined);
        model.create.mockRejectedValueOnce(new Error('disk full'));
        const entry = buildEntry();

        await expect(service.record(entry)).resolves.toBeUndefined();

        expect(errorSpy).toHaveBeenCalledTimes(1);
        const message = String(errorSpy.mock.calls[0][0]);
        expect(message).toContain(entry.action);
        expect(message).not.toContain('secret-looking-arg');
        expect(message).not.toContain('head');
    });
});
