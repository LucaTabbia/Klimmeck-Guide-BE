import { PushEventType } from 'src/push/push-event-type.enum';
import { PushMessage } from 'src/push/push-message';

const PERSONAL_TTL_SECONDS = 60 * 60; // 1 h (D-11)
const BROADCAST_TTL_SECONDS = 15 * 60; // 15 min (D-11)

type CatalogEntry = Omit<PushMessage, 'id'>;

const CATALOG: Record<PushEventType, CatalogEntry> = {
    [PushEventType.travelEnd]: {
        type: PushEventType.travelEnd,
        title: 'Viaggio completato',
        body: 'Il tuo personaggio è arrivato a destinazione.',
        ttlSeconds: PERSONAL_TTL_SECONDS,
    },
    [PushEventType.questEnd]: {
        type: PushEventType.questEnd,
        title: 'Missione conclusa',
        body: "La tua missione è terminata: scopri com'è andata.",
        ttlSeconds: PERSONAL_TTL_SECONDS,
    },
    [PushEventType.streamerLive]: {
        type: PushEventType.streamerLive,
        title: 'La locanda è aperta',
        body: "Lo streamer è in diretta: unisciti all'avventura!",
        ttlSeconds: BROADCAST_TTL_SECONDS,
    },
};

const IDENTIFIED_TYPES: ReadonlySet<PushEventType> = new Set([
    PushEventType.travelEnd,
    PushEventType.questEnd,
]);

// Phase 8 (fine viaggio), Phase 9 (fine quest), Phase 6 (stream.online) chiamano PushService con questi builder (D-12)
export const travelEnd = (characterId: string): PushMessage => ({
    ...CATALOG[PushEventType.travelEnd],
    id: characterId,
});

export const questEnd = (pendingQuestId: string): PushMessage => ({
    ...CATALOG[PushEventType.questEnd],
    id: pendingQuestId,
});

export const streamerLive = (): PushMessage => ({
    ...CATALOG[PushEventType.streamerLive],
});

// sendTestPush (D-13): stesso copy dei builder; l'id arriva dal game master solo per i tipi personali
export function testPushMessage(
    type: PushEventType,
    id?: string | null,
): PushMessage {
    const entry = { ...CATALOG[type] };
    return id && IDENTIFIED_TYPES.has(type) ? { ...entry, id } : entry;
}
