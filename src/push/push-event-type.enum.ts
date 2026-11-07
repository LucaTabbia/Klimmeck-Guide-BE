import { registerEnumType } from '@nestjs/graphql';

// Phase 9 aggiungerà combatResult (deferred)
export enum PushEventType {
    travelEnd = 'travelEnd',
    questEnd = 'questEnd',
    streamerLive = 'streamerLive',
    // party sciolto dopo 24 ore senza posti pieni (utente 2026-10-25)
    questCancelled = 'questCancelled',
    // sconfitta in imboscata (Phase 15 D-12): personale, id = personaggio
    ambushDefeat = 'ambushDefeat',
}

registerEnumType(PushEventType, { name: 'PushEventType' });
