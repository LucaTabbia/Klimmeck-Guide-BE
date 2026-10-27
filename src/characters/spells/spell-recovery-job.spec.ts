import { Types } from 'mongoose';
import {
    SPELL_RECOVERY_TRIGGER_FALLBACK,
    SPELL_RECOVERY_TRIGGER_SUBJECT,
    spellRecoveryJobDataOf,
    spellRecoveryJobId,
    spellRecoveryTrigger,
} from './spell-recovery-job';

describe('spell recovery job contract', () => {
    const c = new Types.ObjectId();
    const s = new Types.ObjectId();
    const hexC = c.toHexString();
    const hexS = s.toHexString();
    const dueAtMs = 1_700_000_000_000;
    const dueAt = new Date(dueAtMs);

    it('spellRecoveryJobId is deterministic per instant and free of colons', () => {
        const jobId = spellRecoveryJobId(c, s, dueAt);

        expect(jobId).toBe(`spell-${hexC}-${hexS}-1700000000000`);
        expect(jobId).not.toContain(':');
        expect(spellRecoveryJobId(c, s, new Date(dueAtMs))).toBe(jobId);
    });

    it('spellRecoveryJobDataOf parses ids and the due instant', () => {
        expect(
            spellRecoveryJobDataOf({
                characterId: hexC,
                spellId: hexS,
                dueAt: dueAtMs,
            }),
        ).toEqual({
            characterId: new Types.ObjectId(hexC),
            spellId: new Types.ObjectId(hexS),
            dueAt,
        });
    });

    it('spellRecoveryJobDataOf reads a legacy job without the due instant', () => {
        expect(
            spellRecoveryJobDataOf({ characterId: hexC, spellId: hexS }),
        ).toEqual({ characterId: c, spellId: s, dueAt: null });
    });

    it.each([null, undefined, 'job', 42])(
        'spellRecoveryJobDataOf rejects non-object data (%p)',
        (data) => {
            expect(spellRecoveryJobDataOf(data)).toBeNull();
        },
    );

    it.each([
        { characterId: 'abc', spellId: hexS },
        { characterId: hexC, spellId: 'abc' },
        { characterId: c, spellId: hexS },
        { spellId: hexS },
        { characterId: hexC },
    ])('spellRecoveryJobDataOf rejects malformed ids (%p)', (data) => {
        expect(spellRecoveryJobDataOf(data)).toBeNull();
    });

    it.each([-1, 1.5, '1700000000000', null])(
        'spellRecoveryJobDataOf rejects a due instant that is not epoch ms (%p)',
        (value) => {
            expect(
                spellRecoveryJobDataOf({
                    characterId: hexC,
                    spellId: hexS,
                    dueAt: value,
                }),
            ).toBeNull();
        },
    );

    it('spellRecoveryTrigger enqueues the recover job at the due instant', () => {
        expect(spellRecoveryTrigger(c, s, dueAt)).toEqual({
            name: 'recover',
            data: { characterId: hexC, spellId: hexS, dueAt: dueAtMs },
            jobId: spellRecoveryJobId(c, s, dueAt),
            dueAt,
        });
    });

    it('names the trigger in the enqueue warning', () => {
        expect(SPELL_RECOVERY_TRIGGER_SUBJECT).toBe('del recupero della magia');
        expect(SPELL_RECOVERY_TRIGGER_FALLBACK).toBe('lo restituirà lo sweep');
    });
});
