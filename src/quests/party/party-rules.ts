import type { Types } from 'mongoose';
import { idForms, refIdOf } from 'src/mongo/document-id';
import { QuestLane } from 'src/quests/acceptance/quest-lanes';

// utente 2026-10-25: "Se entro 24 ore i posti non diventano pieni, allora la missione viene annullata in automatico per tutti."
export const PARTY_TIMEOUT_MS = 24 * 60 * 60 * 1000;

export interface PartyMember {
    characterId: Types.ObjectId;
    pendingQuestId: Types.ObjectId;
    arrivedAt: Date | null;
    waitingTime: number;
}

export type PartyReadiness =
    | { state: 'incomplete' }
    | { state: 'travelling' }
    | { state: 'ready'; startDate: Date };

export interface LaneDates {
    startDate: Date | null;
    arrivedAt: Date | null;
}

// id dei registrati sulla quest: le voci senza un id valido restano fuori
export function registeredIdsOf(
    registrations: readonly { character?: unknown }[] | null | undefined,
): Types.ObjectId[] {
    return (registrations ?? []).flatMap(
        ({ character }) => refIdOf(character) ?? [],
    );
}

// posti pieni e tutti sul marker; startDate = arrivo più tardo, mai l'ora di elaborazione (D-13)
export function partyReadinessOf(
    totalSeats: number,
    members: readonly PartyMember[],
): PartyReadiness {
    if (members.length < totalSeats) return { state: 'incomplete' };
    let latest = 0;
    for (const { arrivedAt } of members) {
        if (arrivedAt === null) return { state: 'travelling' };
        latest = Math.max(latest, arrivedAt.getTime());
    }
    return { state: 'ready', startDate: new Date(latest) };
}

// la finestra si àncora alla registrazione più vecchia del party corrente; le legacy senza registeredAt le retrodata lo sweep
export function partyFormingSinceOf(
    registrations: readonly { registeredAt?: Date | null }[],
): Date | null {
    let oldest: number | null = null;
    for (const { registeredAt } of registrations) {
        if (!registeredAt) continue;
        const time = registeredAt.getTime();
        if (oldest === null || time < oldest) oldest = time;
    }
    return oldest === null ? null : new Date(oldest);
}

export function partyTimeoutDueAt(since: Date): Date {
    return new Date(since.getTime() + PARTY_TIMEOUT_MS);
}

export function isPartyExpired(since: Date, now: Date): boolean {
    return partyTimeoutDueAt(since).getTime() <= now.getTime();
}

// claim per identità: lo stesso party letto prima, non avviato e non concluso; un membro entrato o uscito nel frattempo fa fallire il claim
export function partyClaimFilter(
    questId: Types.ObjectId,
    memberIds: readonly Types.ObjectId[],
): Record<string, unknown> {
    return {
        _id: questId,
        concludedAt: null,
        startedAt: null,
        'registeredAdventurers.character': { $all: memberIds },
        registeredAdventurers: { $size: memberIds.length },
    };
}

// si abbandona solo sul marker in attesa del gruppo: né in viaggio né dopo l'avvio
export function abandonClaimFilter(
    pendingQuestId: Types.ObjectId,
    questId: Types.ObjectId,
): Record<string, unknown> {
    return {
        _id: pendingQuestId,
        quest: { $in: idForms(questId) },
        startDate: null,
        arrivedAt: { $ne: null },
    };
}

// corsia standard: arrivo ≠ avvio (lo scrive QuestStartService); story e worldMission cominciano all'accettazione (Phase 7 D-16)
export function initialLaneDatesOf(
    lane: QuestLane,
    movement: { kind: 'travel' | 'jump' } | null,
    now: Date,
): LaneDates {
    if (lane !== QuestLane.standard) return { startDate: now, arrivedAt: now };
    return {
        startDate: null,
        arrivedAt: movement?.kind === 'travel' ? null : now,
    };
}
