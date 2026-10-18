import { PushEventType } from 'src/push/push-event-type.enum';

// messaggio transport-agnostic: porta al massimo un id da ri-interrogare via GraphQL, mai stato di gioco (D-10)
export interface PushMessage {
    type: PushEventType;
    id?: string;
    title: string;
    body: string;
    ttlSeconds: number;
}

export const STREAMER_LIVE_TOPIC = 'streamer-live';
