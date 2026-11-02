import { createHash } from 'node:crypto';

// primi 4 byte di sha256('<versione>:<città>:<lista>'): un flusso per lista, ri-seminare una lista non tocca le altre (D-24)
// sha256 qui è un hash di seme, non una primitiva di sicurezza
export function seedOf(...parts: readonly (string | number)[]): number {
    return createHash('sha256')
        .update(parts.join(':'))
        .digest()
        .readUInt32BE(0);
}

export function mulberry32(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
