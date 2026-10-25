import { registerEnumType } from '@nestjs/graphql';

// Phase 9 aggiungerà combatResult (deferred)
export enum PushEventType {
    travelEnd = 'travelEnd',
    questEnd = 'questEnd',
    streamerLive = 'streamerLive',
    // party sciolto dopo 24 ore senza posti pieni (utente 2026-10-25)
    questCancelled = 'questCancelled',
}

registerEnumType(PushEventType, { name: 'PushEventType' });
