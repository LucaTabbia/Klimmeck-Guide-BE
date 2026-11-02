import { BSON, Document } from 'mongodb';

// stessa uguaglianza del server (probe 2026-11-01): tipi numerici e ordine delle chiavi contano
export const sameBson = (a: unknown, b: unknown): boolean =>
    Buffer.compare(BSON.serialize({ v: a }), BSON.serialize({ v: b })) === 0;

// un campo assente a DB cambia anche se il valore scritto è null: BSON serializza undefined come null
export function changedFields(
    stored: Document | null,
    next: Document,
): string[] {
    if (!stored) return Object.keys(next);
    return Object.keys(next).filter(
        (field) =>
            !Object.hasOwn(stored, field) ||
            !sameBson(stored[field], next[field]),
    );
}
