import {
    ambush,
    missionStart,
    petRecovered,
    prisonRelease,
    questCancelled,
    questEnd,
    spellResearchFailed,
    spellResearchSucceeded,
    startedQuestCancelled,
    streamerLive,
    testPushMessage,
    travelEnd,
} from 'src/push/push-events';
import { PushEventType } from 'src/push/push-event-type.enum';
import { PushMessage, STREAMER_LIVE_TOPIC } from 'src/push/push-message';

const BUILDERS: Record<PushEventType, (id: string) => PushMessage> = {
    [PushEventType.travelEnd]: travelEnd,
    [PushEventType.questEnd]: questEnd,
    [PushEventType.streamerLive]: () => streamerLive(),
    [PushEventType.questCancelled]: questCancelled,
    [PushEventType.ambushDefeat]: (id) =>
        testPushMessage(PushEventType.ambushDefeat, id),
    [PushEventType.prisonRelease]: prisonRelease,
    [PushEventType.missionStart]: (id) => missionStart(id, 'La corte del re'),
    [PushEventType.petRecovered]: (id) => petRecovered(id, 'Fenrir'),
    [PushEventType.ambush]: (id) =>
        ambush(id, 'Imboscata presso Crocevia: hai respinto gli assalitori'),
    [PushEventType.spellResearchSucceeded]: (id) =>
        spellResearchSucceeded(id, 'Dardo', 1_800_000),
    [PushEventType.spellResearchFailed]: spellResearchFailed,
};
const IDENTIFIED_TYPES = [
    PushEventType.travelEnd,
    PushEventType.questEnd,
    PushEventType.questCancelled,
    PushEventType.ambushDefeat,
    PushEventType.prisonRelease,
    PushEventType.missionStart,
    PushEventType.petRecovered,
    PushEventType.ambush,
    PushEventType.spellResearchSucceeded,
    PushEventType.spellResearchFailed,
];
// il builder compone il corpo con la città (D-12): il push di prova tiene quello generico del catalogo
const COMPOSED_BODY_TYPES = [
    PushEventType.missionStart,
    PushEventType.petRecovered,
    PushEventType.ambush,
    PushEventType.spellResearchSucceeded,
];

describe('push event catalog', () => {
    it('builds travelEnd with the character id and a 1 h ttl', () => {
        expect(travelEnd('64b0000000000000000000c1')).toEqual({
            type: PushEventType.travelEnd,
            id: '64b0000000000000000000c1',
            title: 'Viaggio completato',
            body: 'Il tuo personaggio è arrivato a destinazione.',
            ttlSeconds: 3600,
        });
    });

    it('builds questEnd with the quest result id and a 1 h ttl', () => {
        expect(questEnd('64b0000000000000000000d1')).toEqual({
            type: PushEventType.questEnd,
            id: '64b0000000000000000000d1',
            title: 'Missione conclusa',
            body: "La tua missione è terminata: scopri com'è andata.",
            ttlSeconds: 3600,
        });
    });

    // party sciolto dopo 24 ore senza posti pieni (utente 2026-10-25): id = id della quest
    it('builds questCancelled with the quest id and a 1 h ttl', () => {
        expect(questCancelled('64b0000000000000000000e1')).toEqual({
            type: PushEventType.questCancelled,
            id: '64b0000000000000000000e1',
            title: 'Missione annullata',
            body: 'Il gruppo non si è formato in tempo: la missione è stata annullata.',
            ttlSeconds: 3600,
        });
    });

    // quest cominciata annullata dalla cancellazione di un account (Phase 26 D-13, D-26): stesso tipo, testo proprio (provvisorio, vive solo nel builder)
    it('builds the cancellation of a started quest with the quest id and its own text (D-26)', () => {
        const id = '64b0000000000000000000e2';
        const message = startedQuestCancelled(id);
        expect(message).toEqual({
            ...questCancelled(id),
            body: expect.any(String),
        });
        expect(message.type).toBe(PushEventType.questCancelled);
        expect(message.id).toBe(id);
        expect(message.body.trim()).not.toBe('');
        expect(message.body).not.toBe(questCancelled(id).body);
    });

    // ogni imboscata subita, vinta o persa (D-14, D-30): id = QuestResult dell'imboscata, corpo composto dal BE
    it('builds the ambush push with the result id (D-30)', () => {
        expect(
            ambush(
                '64b0000000000000000000f1',
                'Imboscata presso Crocevia: hai respinto gli assalitori',
            ),
        ).toEqual({
            type: PushEventType.ambush,
            id: '64b0000000000000000000f1',
            title: 'Imboscata!',
            body: 'Imboscata presso Crocevia: hai respinto gli assalitori',
            ttlSeconds: 3600,
        });
    });

    it('keeps a generic ambush body for the test push (D-30)', () => {
        expect(testPushMessage(PushEventType.ambush, 'a')).toEqual({
            type: 'ambush',
            id: 'a',
            title: 'Imboscata!',
            body: "Hai subito un'imboscata.",
            ttlSeconds: 3600,
        });
    });

    it('keeps a generic ambush defeat body for the test push (D-12)', () => {
        expect(testPushMessage(PushEventType.ambushDefeat, 'a')).toEqual({
            type: 'ambushDefeat',
            id: 'a',
            title: 'Imboscata!',
            body: 'Sei stato sconfitto: la via torna verso la città più vicina.',
            ttlSeconds: 3600,
        });
    });

    // liberazione dalla prigione (quick 261110-prp): personale, id = personaggio
    it('builds prisonRelease with the character id and a 1 h ttl (quick 261110-prp)', () => {
        expect(prisonRelease('64b0000000000000000000c1')).toEqual({
            type: PushEventType.prisonRelease,
            id: '64b0000000000000000000c1',
            title: 'Di nuovo libero',
            body: "La prigionia è finita: torna all'avventura.",
            ttlSeconds: 3600,
        });
    });

    // avvio del flusso guidato dell'oste (utente 2026-11-14): personale, id = personaggio, corpo col titolo della missione
    it('builds missionStart with the character id, the mission title and a 1 h ttl', () => {
        expect(
            missionStart('64b0000000000000000000c1', 'La corte del re'),
        ).toEqual({
            type: PushEventType.missionStart,
            id: '64b0000000000000000000c1',
            title: 'La missione comincia',
            body: "L'oste ha dato inizio a «La corte del re»",
            ttlSeconds: 3600,
        });
    });

    // compagno sconfitto di nuovo a vita piena (D-11): id = pet a catalogo, corpo col nome mostrato (D-20)
    it('builds the companion recovery push with the shown name (D-11, D-20)', () => {
        expect(petRecovered('64b0000000000000000000a1', 'Fenrir')).toEqual({
            type: PushEventType.petRecovered,
            title: 'Di nuovo in forze',
            body: 'Fenrir è di nuovo in forze',
            ttlSeconds: 3600,
            id: '64b0000000000000000000a1',
        });
    });

    // fine della «Fase di ricerca» con una magia trovata (D-29, D-31): id = QuestResult della ricerca, corpo col nome e la durata
    it('builds the research success push with the research sheet id, the spell name and the learning time (D-29, D-31)', () => {
        expect(
            spellResearchSucceeded(
                '64b0000000000000000000d2',
                'Dardo',
                1_800_000,
            ),
        ).toEqual({
            type: PushEventType.spellResearchSucceeded,
            id: '64b0000000000000000000d2',
            title: 'Ricerca riuscita',
            body: "Hai scoperto «Dardo»: l'apprendimento dura 30 minuti.",
            ttlSeconds: 3600,
        });
    });

    it('builds the research success push without a spell name (D-29)', () => {
        expect(
            spellResearchSucceeded('64b0000000000000000000d2', null, 5_400_000),
        ).toEqual({
            type: PushEventType.spellResearchSucceeded,
            id: '64b0000000000000000000d2',
            title: 'Ricerca riuscita',
            body: "Hai scoperto una magia: l'apprendimento dura 1 ora e 30 minuti.",
            ttlSeconds: 3600,
        });
    });

    it('keeps a generic research success body for the test push (D-29)', () => {
        expect(
            testPushMessage(PushEventType.spellResearchSucceeded, 'a'),
        ).toEqual({
            type: 'spellResearchSucceeded',
            id: 'a',
            title: 'Ricerca riuscita',
            body: "Hai scoperto una magia: comincia l'apprendimento.",
            ttlSeconds: 3600,
        });
    });

    // ricerca senza magia (D-29): al posto di questEnd, id = QuestResult
    it('builds the research failure push with the quest result id (D-29)', () => {
        expect(spellResearchFailed('64b0000000000000000000d3')).toEqual({
            type: PushEventType.spellResearchFailed,
            id: '64b0000000000000000000d3',
            title: 'Ricerca conclusa',
            body: "Nessuna magia scoperta: scopri com'è andata la missione.",
            ttlSeconds: 3600,
        });
    });

    it('builds streamerLive without an id and a 15 min ttl', () => {
        expect(streamerLive()).toEqual({
            type: PushEventType.streamerLive,
            title: 'La locanda è aperta',
            body: "Lo streamer è in diretta: unisciti all'avventura!",
            ttlSeconds: 900,
        });
        expect(streamerLive()).not.toHaveProperty('id');
    });

    it.each(Object.values(PushEventType))(
        'testPushMessage(%s) reuses the catalog copy',
        (type) => {
            const message = testPushMessage(type, 'abc');
            const built = BUILDERS[type]('abc');

            expect(message).toMatchObject({
                type: built.type,
                title: built.title,
                ttlSeconds: built.ttlSeconds,
            });
            if (!COMPOSED_BODY_TYPES.includes(type)) {
                expect(message.body).toBe(built.body);
            }
            if (IDENTIFIED_TYPES.includes(type)) {
                expect(message.id).toBe('abc');
            } else {
                expect(message).not.toHaveProperty('id');
            }
        },
    );

    it.each([undefined, ''])(
        'testPushMessage omits the id when it is %p',
        (id) => {
            expect(
                testPushMessage(PushEventType.travelEnd, id),
            ).not.toHaveProperty('id');
        },
    );

    it.each([
        [
            'travelEnd',
            travelEnd('a'),
            ['body', 'id', 'title', 'ttlSeconds', 'type'],
        ],
        [
            'questEnd',
            questEnd('a'),
            ['body', 'id', 'title', 'ttlSeconds', 'type'],
        ],
        [
            'streamerLive',
            streamerLive(),
            ['body', 'title', 'ttlSeconds', 'type'],
        ],
        [
            'testPushMessage(questEnd)',
            testPushMessage(PushEventType.questEnd, 'a'),
            ['body', 'id', 'title', 'ttlSeconds', 'type'],
        ],
        [
            'questCancelled',
            questCancelled('a'),
            ['body', 'id', 'title', 'ttlSeconds', 'type'],
        ],
        [
            'startedQuestCancelled',
            startedQuestCancelled('a'),
            ['body', 'id', 'title', 'ttlSeconds', 'type'],
        ],
        [
            'ambush',
            ambush(
                'a',
                'Imboscata presso Crocevia: hai respinto gli assalitori',
            ),
            ['body', 'id', 'title', 'ttlSeconds', 'type'],
        ],
        [
            'prisonRelease',
            prisonRelease('a'),
            ['body', 'id', 'title', 'ttlSeconds', 'type'],
        ],
        [
            'petRecovered',
            petRecovered('a', 'Fenrir'),
            ['body', 'id', 'title', 'ttlSeconds', 'type'],
        ],
        [
            'spellResearchSucceeded',
            spellResearchSucceeded('a', 'Dardo', 1_800_000),
            ['body', 'id', 'title', 'ttlSeconds', 'type'],
        ],
        [
            'spellResearchFailed',
            spellResearchFailed('a'),
            ['body', 'id', 'title', 'ttlSeconds', 'type'],
        ],
        [
            'testPushMessage(streamerLive)',
            testPushMessage(PushEventType.streamerLive, 'a'),
            ['body', 'title', 'ttlSeconds', 'type'],
        ],
    ])(
        '%s carries exactly the keys type,title,body,ttlSeconds[,id]',
        (_name, message, keys) => {
            expect(Object.keys(message).sort()).toEqual(keys);
        },
    );

    it('exposes a valid FCM topic name for streamerLive', () => {
        expect(STREAMER_LIVE_TOPIC).toBe('streamer-live');
        expect(STREAMER_LIVE_TOPIC).toMatch(/^[a-zA-Z0-9-_.~%]+$/);
    });
});
