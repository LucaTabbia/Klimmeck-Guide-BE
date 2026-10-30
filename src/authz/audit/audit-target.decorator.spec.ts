import {
    AUDIT_TARGET_KEY,
    AuditTarget,
    type AuditTargetRule,
} from 'src/authz/audit/audit-target.decorator';

class ProbeHandlers {
    @AuditTarget(
        'PendingQuest',
        ({ input }) => (input as { pendingQuestId?: unknown })?.pendingQuestId,
    )
    complete(): void {}
}

describe('AuditTarget', () => {
    it('declares the audit target type and the id reader of a handler (D-17c)', () => {
        const rule = Reflect.getMetadata(
            AUDIT_TARGET_KEY,
            ProbeHandlers.prototype.complete,
        ) as AuditTargetRule;

        expect(rule.type).toBe('PendingQuest');
        expect(rule.idOf({ input: { pendingQuestId: 'x' } })).toBe('x');
    });
});
