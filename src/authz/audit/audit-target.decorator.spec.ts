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

    @AuditTarget('User', () => null, {
        argsOf: () => ({}),
        idOfResult: (result) => (result as { twitchId: string }).twitchId,
    })
    redacted(): void {}
}

function ruleOf(name: keyof ProbeHandlers): AuditTargetRule {
    const handler = Object.getOwnPropertyDescriptor(
        ProbeHandlers.prototype,
        name,
    )?.value as object;
    return Reflect.getMetadata(AUDIT_TARGET_KEY, handler) as AuditTargetRule;
}

describe('AuditTarget', () => {
    it('declares the audit target type and the id reader of a handler (D-17c)', () => {
        const handler = Object.getOwnPropertyDescriptor(
            ProbeHandlers.prototype,
            'complete',
        )?.value as object;
        const rule = Reflect.getMetadata(
            AUDIT_TARGET_KEY,
            handler,
        ) as AuditTargetRule;

        expect(rule.type).toBe('PendingQuest');
        expect(rule.idOf({ input: { pendingQuestId: 'x' } })).toBe('x');
    });

    it('stores the optional redaction hooks of a target (D-25)', () => {
        const rule = ruleOf('redacted');

        expect(rule.type).toBe('User');
        expect(rule.idOf({ twitchLogin: 'someone' })).toBeNull();
        expect(rule.argsOf?.({ twitchLogin: 'someone' })).toEqual({});
        expect(rule.idOfResult?.({ twitchId: '123' })).toBe('123');
    });

    it("keeps today's metadata when no hook is given (D-25)", () => {
        expect(Object.keys(ruleOf('complete')).sort()).toEqual([
            'idOf',
            'type',
        ]);
    });
});
