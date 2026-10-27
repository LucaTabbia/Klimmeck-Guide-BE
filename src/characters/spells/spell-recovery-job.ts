import { Types } from 'mongoose';
import { objectIdFromHex } from 'src/mongo/document-id';
import { isEpochMs } from 'src/queues/epoch-ms';
import type { TriggerJob } from 'src/queues/enqueue-trigger';
import { RECOVER_SPELL_JOB } from './spell-recovery-queue';

// dueAt in epoch ms; assente solo nei job accodati prima del deploy (D-06)
export interface SpellRecoveryJobData {
    characterId: string;
    spellId: string;
    dueAt?: number;
}

export interface SpellRecoveryJobTrigger {
    characterId: Types.ObjectId;
    spellId: Types.ObjectId;
    dueAt: Date | null;
}

export const SPELL_RECOVERY_TRIGGER_SUBJECT = 'del recupero della magia';
export const SPELL_RECOVERY_TRIGGER_FALLBACK = 'lo restituirà lo sweep';

// deterministico: due usi nello stesso istante collassano in un job che restituisce tutti gli istanti scaduti (niente ':' per Bull)
export const spellRecoveryJobId = (
    characterId: Types.ObjectId,
    spellId: Types.ObjectId,
    dueAt: Date,
): string =>
    `spell-${characterId.toHexString()}-${spellId.toHexString()}-${dueAt.getTime()}`;

// dato di coda = input non fidato: id esadecimali; dueAt, se presente, in epoch ms
export function spellRecoveryJobDataOf(
    data: unknown,
): SpellRecoveryJobTrigger | null {
    if (typeof data !== 'object' || data === null) return null;
    const { characterId, spellId } = data as Partial<
        Record<keyof SpellRecoveryJobData, unknown>
    >;
    const character = objectIdFromHex(hexOrNull(characterId));
    const spell = objectIdFromHex(hexOrNull(spellId));
    if (!character || !spell) return null;
    if (!('dueAt' in data))
        return { characterId: character, spellId: spell, dueAt: null };
    const { dueAt } = data as { dueAt: unknown };
    if (!isEpochMs(dueAt)) return null;
    return { characterId: character, spellId: spell, dueAt: new Date(dueAt) };
}

export function spellRecoveryTrigger(
    characterId: Types.ObjectId,
    spellId: Types.ObjectId,
    dueAt: Date,
): TriggerJob<SpellRecoveryJobData> {
    return {
        name: RECOVER_SPELL_JOB,
        data: {
            characterId: characterId.toHexString(),
            spellId: spellId.toHexString(),
            dueAt: dueAt.getTime(),
        },
        jobId: spellRecoveryJobId(characterId, spellId, dueAt),
        dueAt,
    };
}

function hexOrNull(value: unknown): string | null {
    return typeof value === 'string' ? value : null;
}
