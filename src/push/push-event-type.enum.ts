import { registerEnumType } from '@nestjs/graphql';

// Phase 9 aggiungerà combatResult (deferred)
export enum PushEventType {
    travelEnd = 'travelEnd',
    questEnd = 'questEnd',
    streamerLive = 'streamerLive',
}

registerEnumType(PushEventType, { name: 'PushEventType' });
