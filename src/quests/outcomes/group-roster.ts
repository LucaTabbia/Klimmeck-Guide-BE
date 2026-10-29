import type { Types } from 'mongoose';
import { refIdOf } from 'src/mongo/document-id';
import type { ResolutionCharacter } from './resolution-loader.service';

// un posto del gruppo che combatte insieme (boss D-05, soccorso di gruppo D-09): personaggio in corsia, la sua PendingQuest e il proprietario
export interface GroupSeat {
    character: ResolutionCharacter;
    pendingQuestId: Types.ObjectId;
    ownerId: Types.ObjectId;
    resultId: Types.ObjectId;
}

// segnaposto di posto: registrato archiviato dopo l'avvio, fotografia del personaggio archiviato e la sua PendingQuest
export interface SeatHolder {
    character: ResolutionCharacter;
    pendingQuestId: Types.ObjectId;
}

// waiting = almeno un posto vivo non ha finito il countdown; dropped = registrati che escono dal roster, seat holder compresi (Pitfall 8)
export interface GroupRoster {
    seats: GroupSeat[];
    // registrati archiviati dopo l'avvio con una PendingQuest coerente: combattono, non ricevono esiti (D-21)
    seatHolders: SeatHolder[];
    dropped: Types.ObjectId[];
    waiting: boolean;
}

// registrazioni con il marcatore dell'archivio dopo l'avvio (9.2): candidati segnaposto di posto
export function seatHolderIdsOf(
    registrations:
        | readonly { character?: unknown; archivedAt?: Date | null }[]
        | null
        | undefined,
): Types.ObjectId[] {
    return (registrations ?? []).flatMap(({ character, archivedAt }) =>
        archivedAt ? (refIdOf(character) ?? []) : [],
    );
}

// registrati che escono dal roster senza essere segnaposto di posto: incoerenti, da segnalare
export function incoherentOf(roster: GroupRoster): Types.ObjectId[] {
    return roster.dropped.filter(
        (id) =>
            !roster.seatHolders.some(({ character }) =>
                character._id.equals(id),
            ),
    );
}
