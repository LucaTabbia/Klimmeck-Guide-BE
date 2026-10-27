import { Types } from 'mongoose';
import { refIdOf, sameId } from 'src/mongo/document-id';

export interface SpellStateEntry {
    spell?: unknown;
    usages?: number;
    recoveries?: Date[];
}

export interface ActiveSpellEntry {
    spell?: unknown;
    usages?: number;
}

export interface SpellStateSnapshot {
    status?: { spells?: unknown[]; spellStates?: SpellStateEntry[] } | null;
    assets?: { activeSpells?: ActiveSpellEntry[] } | null;
}

export interface LearnedSpellState {
    spell: Types.ObjectId;
    usages: number;
    recoveries: Date[];
}

// per chi legge solo le magie attive (usi dal mirror nella base migrata): nessun catalogo necessario
export const NO_SPELL_MAX_USAGES: ReadonlyMap<string, number> = new Map();

export function stateEntryOf(
    states: readonly SpellStateEntry[] | undefined,
    spellId: Types.ObjectId,
): SpellStateEntry | undefined {
    return (states ?? []).find((entry) => sameId(entry.spell, spellId));
}

export function usagesFromState(
    states: readonly SpellStateEntry[] | undefined,
    spellId: Types.ObjectId,
): number {
    return Math.max(0, stateEntryOf(states, spellId)?.usages ?? 0);
}

// recoveryTime del catalogo è in ms
export function recoveryDueAt(now: Date, recoveryTimeMs: number): Date {
    return new Date(now.getTime() + recoveryTimeMs);
}

// nuova voce, input intatto: gli istanti restano crescenti con i duplicati (D-02)
export function spendFromState(
    entry: SpellStateEntry,
    taken: number,
    dueAt: Date | null,
): SpellStateEntry {
    const added = dueAt ? Array.from({ length: taken }, () => dueAt) : [];
    const recoveries = [...(entry.recoveries ?? []), ...added].sort(
        (left, right) => left.getTime() - right.getTime(),
    );
    return { ...entry, usages: (entry.usages ?? 0) - taken, recoveries };
}

export function learnedSpellState(
    spellId: Types.ObjectId,
    maxUsages: number,
): LearnedSpellState {
    return { spell: spellId, usages: maxUsages, recoveries: [] };
}

// il ref resta nella forma salvata; gli usi vengono dallo stato, l'entry vale solo se la voce manca
export function mirrorFromStates(
    active: readonly ActiveSpellEntry[] | undefined,
    states: readonly SpellStateEntry[] | undefined,
): ActiveSpellEntry[] {
    return (active ?? []).map((entry) => {
        const spellId = refIdOf(entry.spell);
        const state = spellId ? stateEntryOf(states, spellId) : undefined;
        return { ...entry, usages: state?.usages ?? entry.usages };
    });
}

// base per chi legge uno snapshot forse non ancora migrato (esiti che partono prima della migrazione al boot, F6): stesse regole della pipeline D-08
export function spellStatesOrMigrated(
    snapshot: SpellStateSnapshot,
    maxUsagesOf: ReadonlyMap<string, number>,
): SpellStateEntry[] {
    const stored = snapshot.status?.spellStates;
    if (stored) return stored;
    const active = snapshot.assets?.activeSpells ?? [];
    return knownSpellIds(snapshot.status?.spells).map((spellId) => ({
        spell: spellId,
        usages:
            active.find((entry) => sameId(entry.spell, spellId))?.usages ??
            maxUsagesOf.get(spellId.toHexString()) ??
            0,
        recoveries: [],
    }));
}

function knownSpellIds(spells: readonly unknown[] | undefined) {
    return (spells ?? [])
        .map(refIdOf)
        .filter((spellId): spellId is Types.ObjectId => spellId !== null);
}
