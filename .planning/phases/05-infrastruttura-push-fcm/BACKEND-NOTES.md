# BACKEND-NOTES — Phase 5 Infrastruttura Push FCM (handoff per FE Phase 5 e fasi BE successive)

- **Fase BE:** 05-infrastruttura-push-fcm (requisiti BE-NOTIF-01, BE-NOTIF-02, BE-NOTIF-03; decisioni D-01..D-18 in `05-CONTEXT.md`, con D-05 e D-08 riviste dopo `05-RESEARCH.md`)
- **Data:** 2026-10-18. Documento finale di fine fase.
- **Branch:** `feat/05-infrastruttura-push-fcm` (PR verso `develop`). **La PR BE si fonde PRIMA della PR FE Phase 5** (D-18): il FE verifica i propri documenti GraphQL contro `src/schema.gql` rigenerato.
- **Schema:** `src/schema.gql` cambia in modo **solo additivo** (33 righe aggiunte, 0 rimosse rispetto a `develop`). Commit di riferimento: `e12053b`. Il boot reale in `test/app.int-spec.ts` lo rigenera e `git diff --exit-code src/schema.gql` esce 0. **Lo schema vince su questo documento.**
- **Stato:** implementato e coperto da test (66 suite / 807 unit, 43 suite / 515 di integrazione su replica set + Redis in memoria). Modulo nuovo: `PushModule` (`src/push/`, montato in `AppModule` subito dopo `QuestAcceptanceModule`, esporta solo `PushService`). Collection nuova: `push_devices`.
- **Consumatori:** FE Phase 5 (registrazione device, ricezione data message nei tre app state, E2E con `sendTestPush`); BE Phase 6 (`stream.online` → `streamerLive`), BE Phase 8 (fine viaggio → `travelEnd`, BE-TRAVEL-03), BE Phase 9 (fine quest → `questEnd` con l'id del risultato; nessun `combatResult`, emendato 2026-10-24).
- **Fonte:** ogni nome qui sotto (operazioni, codici, messaggi, firme, copy, TTL) è copiato dal codice: `src/schema.gql`, `src/push/push-events.ts`, `src/push/push-message.ts`, `src/push/transport/fcm-message.ts`, `src/push/push-error-code.enum.ts`, `src/push/push.exception.ts`, `src/push/push-delivery.ts`, `src/push/push.service.ts`, `src/push/push.resolver.ts`, `src/push/push.module.ts`, `src/push/push-device-input.validator.ts`, `src/push/push-device.model.ts`, `src/push/push-startup.reporter.ts`, `src/config/push-config.ts`, `src/authz/resource-not-found.exception.ts`, `src/authz/authorization.exception.ts`, `src/auth/auth.exception.ts`, `.env.example`.

---

## 0. TL;DR per il FE

1. **Tre mutation nuove, schema additivo.** `registerPushDevice`, `unregisterPushDevice`, `sendTestPush` (§1). Nessun documento GraphQL esistente del FE cambia.
2. **Push data-only.** Ogni messaggio porta in `data` solo stringhe: `type` (`travelEnd` / `questEnd` / `streamerLive`), `title`, `body`, `sentAt` e, per i tipi personali, `id`. **Mai stato di gioco**: al tap (o alla ricezione) il FE ri-interroga GraphQL. Nessun blocco `notification`: la notifica locale la mostra il FE.
3. **I toggle restano sul device** (FE Phase 4 §4). Il BE invia a **tutti** i device registrati dell'utente e il FE decide se mostrare la notifica, anche con app uccisa, leggendo `data.type`.
4. **`registerPushDevice` dopo il login e su `onTokenRefresh`**, e di nuovo a ogni avvio con sessione valida. **`unregisterPushDevice` PRIMA di `logout`** (serve il bearer) e al cambio account.
5. **`deviceId` = UUID generato una volta e persistito dal FE** (es. in `shared_preferences`), **NON** `androidId`/IDFV. Ammessi solo `[A-Za-z0-9._-]`, 1..128 caratteri: un UUID v4 va bene così com'è.
6. **E2E con `sendTestPush`** (innkeeper-only): in sviluppo basta il dev bypass con `DEV_AUTH_ROLE=innkeeper` (§6).
7. **iOS:** il push in background è a bassa priorità, limitato ("due o tre all'ora") e **perso se l'utente fa force-quit** dall'app switcher (§3).

---

## 1. Contratto GraphQL

SDL verbatim da `src/schema.gql` (commit `e12053b`).

```graphql
type Mutation {
  ...
  registerPushDevice(input: RegisterPushDeviceInput!): Boolean!
  sendTestPush(input: SendTestPushInput!): PushDeliveryReport!
  ...
  unregisterPushDevice(deviceId: String!): Boolean!
  ...
}
```

```graphql
input RegisterPushDeviceInput {
  deviceId: String!
  platform: PushPlatform!
  token: String!
}

input SendTestPushInput {
  id: String
  targetUserId: ID
  type: PushEventType!
}

enum PushPlatform {
  android
  ios
}

enum PushEventType {
  questEnd
  streamerLive
  travelEnd
}

type PushDeliveryReport {
  failed: Int!
  pruned: Int!
  sent: Int!
  targeted: Int!
}
```

Documenti consigliati per il FE:

```graphql
mutation RegisterPushDevice($input: RegisterPushDeviceInput!) {
  registerPushDevice(input: $input)
}

mutation UnregisterPushDevice($deviceId: String!) {
  unregisterPushDevice(deviceId: $deviceId)
}
```

### Semantica

- **Identità solo dal bearer** (D-02). Nessun `userId` in input: il device viene sempre associato all'utente del token di accesso. Ammessa a ogni utente autenticato, anche senza personaggio.
- **`registerPushDevice`** risponde sempre `true` in caso di successo. Una riga per `(utente, deviceId)`: ri-registrare lo stesso device aggiorna `token`, `platform` e `lastSeenAt` (nessun duplicato, anche con chiamate concorrenti). Un token appartiene a **una sola riga**: se un altro utente o un altro device registra lo stesso token, la riga precedente sparisce. A ogni registrazione il token viene iscritto (best-effort) al topic `streamer-live`; se il device ha cambiato token, il vecchio viene disiscritto.
- **`unregisterPushDevice`** risponde sempre `true` ed è **idempotente**: un `deviceId` sconosciuto o già rimosso non è un errore. Rimuove solo il device del chiamante e disiscrive il token dal topic.
- **`sendTestPush`** è **innkeeper-only** (`@Roles(innkeeper)`) ed è **auditata** in `admin_audit_logs` (target `{ type: 'PushDeliveryReport', id: null }`), anche quando fallisce. Usa lo stesso copy dei trigger reali (§2).
  - `targetUserId` assente → il destinatario è il chiamante.
  - `type: streamerLive` → invio al topic `streamer-live`; `targetUserId` e `id` sono **ignorati**.
  - `id` → finisce in `data.id` **solo** per `travelEnd` e `questEnd` (e solo se non vuoto).
- **`PushDeliveryReport`**:
  - `targeted`: token tentati (per il topic vale `1`);
  - `sent`: consegne accettate da FCM (topic: `1` se accettato, altrimenti `0`);
  - `pruned`: token morti rimossi da `push_devices` durante l'invio;
  - `failed`: token non consegnati (inclusi quelli potati).
  Esempio reale dai test: `{ targeted: 2, sent: 1, pruned: 1, failed: 1 }` = un device ha ricevuto, l'altro aveva un token scaduto ed è stato rimosso.

### Esempio di rifiuto

```json
{
  "errors": [
    {
      "message": "Token di notifica non valido",
      "extensions": { "code": "PUSH_INVALID_TOKEN" }
    }
  ],
  "data": null
}
```

Il FE mappa `extensions.code`, mai il messaggio.

---

## 2. Payload dei messaggi

### Chiavi di `data` (tutte stringhe)

| Chiave | Sempre | Contenuto |
| ------ | ------ | --------- |
| `type` | sì | `travelEnd` / `questEnd` / `streamerLive` / `questCancelled` (valori di `PushEventType`; `questCancelled` aggiunto dalla Phase 9, 09-19) |
| `title` | sì | titolo in italiano dal catalogo `push-events.ts` |
| `body` | sì | testo in italiano dal catalogo |
| `sentAt` | sì | istante di invio, ISO 8601 UTC (`Date.toISOString()`) |
| `id` | solo `travelEnd`/`questEnd`/`questCancelled` | id da ri-interrogare via GraphQL; la chiave è **assente** (non vuota) quando non c'è |

### Un esempio per tipo

`travelEnd` (Phase 8; `id` = `characterId`, TTL 1 h):

```json
{
  "type": "travelEnd",
  "title": "Viaggio completato",
  "body": "Il tuo personaggio è arrivato a destinazione.",
  "sentAt": "2026-10-18T12:00:00.000Z",
  "id": "6712a0c4e1b2c3d4e5f60718"
}
```

`questEnd` (Phase 9; `id` = id del risultato — in origine `pendingQuestId`, vedi l'emendamento sotto —, TTL 1 h):

```json
{
  "type": "questEnd",
  "title": "Missione conclusa",
  "body": "La tua missione è terminata: scopri com'è andata.",
  "sentAt": "2026-10-18T12:00:00.000Z",
  "id": "6712a0c4e1b2c3d4e5f60719"
}
```

> **Emendato dalla Phase 9 (2026-10-24, D-20):** `id` è l'id del risultato (`QuestResult`), non il pendingQuestId: a esito avvenuto la PendingQuest non esiste più. Al tap ri-interrogare `questResult(id: data.id)`. Vedi `.planning/phases/09-combat-result-admin-outcomes/BACKEND-NOTES.md` §4.

`streamerLive` (Phase 6; broadcast sul topic `streamer-live`, nessun `id`, TTL 15 min):

```json
{
  "type": "streamerLive",
  "title": "La locanda è aperta",
  "body": "Lo streamer è in diretta: unisciti all'avventura!",
  "sentAt": "2026-10-18T12:00:00.000Z"
}
```

`questCancelled` (aggiunto dalla Phase 9, 09-19; personale, `id` = id della quest — o della aid — il cui party è stato sciolto, TTL 1 h):

```json
{
  "type": "questCancelled",
  "title": "Missione annullata",
  "body": "Il gruppo non si è formato in tempo: la missione è stata annullata.",
  "sentAt": "2026-10-18T12:00:00.000Z",
  "id": "6712a0c4e1b2c3d4e5f6071a"
}
```

> **Aggiunto dalla Phase 9 (09-19, 2026-10-25):** inviato a ogni proprietario dei personaggi liberati quando un party non si riempie entro 24 ore o quando il timeout di una aid libera i soccorritori di un party incompleto. Al tap: mappa. Vedi `.planning/phases/09-combat-result-admin-outcomes/BACKEND-NOTES.md` §4.

### Opzioni di consegna (verbatim da `src/push/transport/fcm-message.ts`)

```ts
android: {
    priority: 'high',
    ttl: message.ttlSeconds * MILLISECONDS_PER_SECOND, // ms: l'SDK lo converte in "3600s"
},
apns: {
    headers: {
        'apns-push-type': 'background',
        'apns-priority': '5', // 10 è rifiutato da Apple per il push type background
        'apns-expiration': String(expiresAtEpochSeconds), // epoch assoluto in secondi, non una durata
    },
    payload: { aps: { contentAvailable: true } }, // serializzato come "content-available": 1
},
```

- Android: `priority: 'high'`, `ttl` = 3 600 000 ms (`travelEnd`, `questEnd`) o 900 000 ms (`streamerLive`).
- APNs: `apns-push-type: background`, `apns-priority: 5`, `apns-expiration` = epoch assoluto in secondi (`sentAt` + TTL), `aps: { "content-available": 1 }` senza `alert`/`sound`/`badge`.
- Topic broadcast: `streamer-live` (`STREAMER_LIVE_TOPIC` in `src/push/push-message.ts`). Ogni device registrato vi è iscritto automaticamente: il FE **non** deve chiamare `subscribeToTopic` lato client.
- Nessun blocco `notification`: Android non mostra nulla da solo, il FE crea la notifica locale (dopo aver applicato il toggle del tipo).

---

## 3. Caveat iOS e Android

**iOS (APNs background push, citazioni Apple in `05-RESEARCH.md` Q3):**

- Il sistema tratta le background notification come **bassa priorità**: la consegna **non è garantita** e può essere limitata ("non più di due o tre all'ora").
- Se arrivano più push mentre l'app non può riceverli, iOS trattiene **solo l'ultimo** e scarta i precedenti.
- **Se l'utente fa force-quit dall'app switcher, il push trattenuto viene scartato** e l'app non viene risvegliata finché l'utente non la riapre. Il test E2E "app killed" su iOS va eseguito **senza force-quit** (app sospesa dal sistema), oppure accettato come best-effort.
- `apns-priority: 10` con push type `background` è un errore per Apple: il BE usa sempre `5`.

**Android:**

- I data message high-priority che **non** producono una notifica visibile possono essere declassati a priorità normale (Firebase osserva il comportamento su 7 giorni). I toggle FE che scartano messaggi contribuiscono a questo pattern: se un utente disattiva un tipo, una parte dei messaggi alti non mostrerà nulla.

**Decisione rinviata (deferred, lato FE):** se la consegna in background su iOS risultasse insufficiente in UAT, il FE può chiedere al BE di aggiungere un blocco `notification` nativo per iOS (alert visibile senza passare dall'handler). Va valutato insieme ai toggle, che con un alert nativo non potrebbero più filtrare con app uccisa.

---

## 4. Checklist Firebase

1. **Stesso progetto Firebase** di `google-services.json` / `GoogleService-Info.plist` del FE. Al boot il BE logga `Push notifications enabled for Firebase project <project_id>`: confrontare a vista con il `project_id` dei file FE. Un progetto diverso produce `messaging/mismatched-credential` (§7).
2. **Chiave del service account:** Firebase Console → Impostazioni progetto → Account di servizio → **Genera nuova chiave privata**. Si scarica un JSON (`project_id`, `private_key`, `client_email`).
3. **Codifica base64 su una riga** e valore in `FIREBASE_SERVICE_ACCOUNT` (comandi da `.env.example`):
   - macOS: `base64 -i service-account.json | tr -d '\n'`
   - Linux: `base64 -w0 service-account.json`
4. **Mai committare il JSON.** `.gitignore` copre `*service-account*.json`, `*serviceAccount*.json`, `*firebase-adminsdk*.json`. Il parser al boot rifiuta valori malformati con messaggi fissi che nominano solo variabile e campo, mai il contenuto.
5. **iOS:** caricare la chiave APNs (.p8) nella console Firebase (Impostazioni progetto → Cloud Messaging → app iOS). Senza, ogni invio verso iOS fallisce con `messaging/third-party-auth-error`.
6. **Senza variabile in development/test** il push è disabilitato: WARN al boot (`Push notifications disabled: FIREBASE_SERVICE_ACCOUNT not configured. Devices are still registered, sends are skipped and sendTestPush answers PUSH_DISABLED.`). Le registrazioni funzionano, gli invii di dominio sono saltati e `sendTestPush` risponde `PUSH_DISABLED`.
7. **Con `NODE_ENV=production` la variabile è obbligatoria**: senza, l'app rifiuta di avviarsi (§9).

---

## 5. Flusso FE consigliato

1. **Primo avvio:** generare un UUID v4, persisterlo come `deviceId` e non cambiarlo più (sopravvive a logout e cambio account; si perde solo con la reinstallazione, e va bene: la riga vecchia scade da sola per TTL).
2. **Login riuscito** → `registerPushDevice({ deviceId, token, platform })` con il token FCM corrente e `platform: android | ios`.
3. **`onTokenRefresh`** → stessa mutation con il nuovo token (aggiorna la riga, il BE sposta l'iscrizione al topic).
4. **Avvio app con sessione valida** → ri-registrare: aggiorna `lastSeenAt`. Le righe non aggiornate per **270 giorni** vengono rimosse per TTL (`push_devices.lastSeenAt`).
5. **Logout** → `unregisterPushDevice(deviceId)` **PRIMA** di `logout` (la mutation richiede il bearer). Un fallimento non deve bloccare il logout: la riga verrà comunque spostata dal prossimo login o potata dal primo invio fallito.
6. **Cambio account sullo stesso device** → unregister con il **vecchio** bearer, poi register con il **nuovo**. Se l'unregister viene dimenticato, il nuovo register sposta comunque il token (un token appartiene a una sola riga), quindi il vecchio utente non riceve più push su quel device.
7. **Ricezione:** gestire `data.type` nei tre app state (foreground, background, terminated), applicare il toggle del tipo e, se attivo, mostrare la notifica locale con `data.title` / `data.body`.
8. **Tap sulla notifica** → navigare in base a `type` e ri-interrogare GraphQL (`character(id: data.id)` per `travelEnd`, `questResult(id: data.id)` per `questEnd`, emendato dalla Phase 9: `data.id` è l'id del risultato). Il payload non contiene mai stato.
9. **`PUSH_INVALID_DEVICE_ID` / `PUSH_INVALID_TOKEN` = bug FE**: loggare, non ritentare con lo stesso input.

Nota: le richieste di registrazione sono invisibili all'utente (regola FE "no loading bloccanti in sessione attiva"): vanno eseguite in background, senza spinner.

---

## 6. Ricetta E2E con sendTestPush

1. **`.env` del BE:**
   - `FIREBASE_SERVICE_ACCOUNT=<base64 del JSON reale>` (§4);
   - `DEV_AUTH_ENABLED=true`, `DEV_AUTH_ROLE=innkeeper` (dev bypass: il bearer di sviluppo ha ruolo innkeeper).
   Al boot verificare il log `Push notifications enabled for Firebase project <project_id>`.
2. **FE dev build** registrata: dopo il login verificare la riga in Mongo (`db.push_devices.find({ deviceId: "<uuid>" })`).
3. **Invii di prova** (GraphQL playground o client, bearer innkeeper):

```graphql
mutation { sendTestPush(input: { type: travelEnd, id: "<characterId>" }) { targeted sent pruned failed } }
```

```graphql
mutation { sendTestPush(input: { type: questEnd, id: "<questResultId>" }) { targeted sent pruned failed } }
```

```graphql
mutation { sendTestPush(input: { type: streamerLive }) { targeted sent pruned failed } }
```

   Verso un altro utente (i suoi device registrati):

```graphql
mutation { sendTestPush(input: { type: travelEnd, targetUserId: "<userId>", id: "<characterId>" }) { targeted sent pruned failed } }
```

4. **Esito atteso nei tre app state:**
   - foreground: l'handler foreground riceve `data`, il FE mostra la notifica locale (o un toast in-app);
   - background: l'handler background riceve `data` e mostra la notifica locale;
   - killed: Android risveglia l'handler background; iOS solo se l'app **non** è stata chiusa con force-quit (§3);
   - tap: navigazione e ri-query GraphQL.
5. **Report `sent: 0`** e nel log BE `Push <type>: N token(s) not delivered (<code>...)` → consultare la tabella dei codici FCM in §7. `targeted: 0` = l'utente non ha device registrati.

---

## 7. Codici

Errori GraphQL (`errors[0].extensions.code`):

| Codice | Dove | Quando | Messaggio | Azione FE |
| ------ | ---- | ------ | --------- | --------- |
| `PUSH_INVALID_DEVICE_ID` | `registerPushDevice`, `unregisterPushDevice` | `deviceId` vuoto, oltre 128 caratteri o con caratteri fuori da `[A-Za-z0-9._-]` | `Identificativo del dispositivo non valido` | bug FE: correggere la generazione del `deviceId`, non ritentare |
| `PUSH_INVALID_TOKEN` | `registerPushDevice` | `token` vuoto, oltre 4096 caratteri o con spazi | `Token di notifica non valido` | bug FE: non ritentare con lo stesso token |
| `PUSH_DISABLED` | `sendTestPush` | il server non ha `FIREBASE_SERVICE_ACCOUNT` (transport no-op) | `Notifiche push non configurate sul server` | configurare il BE (§4) |
| `UNAUTHENTICATED` | tutte e tre | bearer assente o non valido, oppure utente cancellato | `Authentication required` | flusso di login (per `unregisterPushDevice`: chiamarla prima del logout) |
| `FORBIDDEN` | `sendTestPush` | ruolo diverso da innkeeper | `Operazione riservata al locandiere` | nessuna (strumento del game master) |
| `NOT_FOUND` | `sendTestPush` | `targetUserId` inesistente o malformato | `Utente non trovato` | correggere il `targetUserId` |

La validazione controlla prima `deviceId`, poi `token`: con entrambi invalidi il codice è `PUSH_INVALID_DEVICE_ID`.

Codici FCM lato server (**solo log**, mai restituiti al FE; `src/push/push-delivery.ts`):

| Codice FCM | Effetto sul BE |
| ---------- | -------------- |
| `messaging/registration-token-not-registered` | token potato da `push_devices` (`pruned`) |
| `messaging/invalid-registration-token` | token potato |
| `messaging/invalid-argument`, `messaging/invalid-payload`, `messaging/invalid-data-payload-key`, `messaging/payload-size-limit-exceeded` | ERROR nel log (conteggi e codici), **nessun token potato**, contati in `failed`. `invalid-argument` non fa mai pruning (review WR-01): un batch mescola Android e iOS e un payload rifiutato da una sola piattaforma cancellerebbe i token dell'altra |
| `messaging/mismatched-credential` | WARN senza retry: service account di un progetto Firebase diverso da quello del FE |
| `messaging/third-party-auth-error` | WARN senza retry: chiave APNs mancante o non valida nella console Firebase |
| `messaging/server-unavailable`, `messaging/internal-error`, `messaging/message-rate-exceeded` (e ogni altro codice) | WARN senza retry (l'SDK ha già ritentato internamente) |

Il pruning è a sua volta best-effort (review IN-01): se la cancellazione da `push_devices` fallisce dopo che FCM ha accettato i messaggi, il BE logga WARN `pruning failed` e il report mantiene `targeted`/`sent`/`failed` della consegna con `pruned: 0`; i token restano e verranno potati al prossimo invio.

I log riportano solo tipo, conteggi e codici (`failureCodeSummary`), mai i token (al massimo un suffisso di 6 caratteri nei log dei topic).

---

## 8. Note per le fasi BE 6/8/9

- **Uso:** `imports: [PushModule]` nel modulo di dominio e iniettare `PushService`. `PushModule` è un modulo foglia, **non** `@Global`, ed esporta solo `PushService`.
- **Firme** (verbatim da `src/push/push.service.ts`):

```ts
async sendToUser(
    userId: Types.ObjectId,
    message: PushMessage,
): Promise<PushDeliveryCounts> {
```

```ts
async broadcast(message: PushMessage): Promise<PushDeliveryCounts> {
```

- **Builder del catalogo** (`src/push/push-events.ts`, unica fonte di copy e TTL):
  - `travelEnd(characterId)` → `sendToUser(ownerId, travelEnd(String(character._id)))` — Phase 8, BE-TRAVEL-03;
  - `questEnd(resultId)` → `sendToUser(result.user, questEnd(String(result._id)))` — Phase 9 (emendato: id del risultato, una push per risultato);
  - `streamerLive()` → `broadcast(streamerLive())` — Phase 6, evento EventSub `stream.online`.
- **Phase 9** (emendato 2026-10-24, D-20): **nessun tipo push nuovo**, il risultato viaggia su `questEnd` con l'id del risultato. Un eventuale tipo futuro va aggiunto **nel catalogo** (l'unico posto): il `Record<PushEventType, CatalogEntry>` è esaustivo, quindi il compilatore obbliga a definirne copy e TTL; lo schema cambierebbe in modo additivo (nuovo valore dell'enum).
- **Chiamare `PushService` DOPO il commit, MAI dentro `connection.transaction(...)`:** il callback della transazione si ripete sui WriteConflict (push duplicati) e un invio può durare decine di secondi per i retry dell'SDK (timeout 15 s × fino a 4 retry con backoff). Il push è un side-channel non autoritativo: lo stato vero resta nel DB e il FE lo ri-interroga.
- **`await` sicuro:** `sendToUser` e `broadcast` **non lanciano mai** (best-effort, D-08): transport disabilitato → report vuoto; errori → WARN e report vuoto/fallito. Il flusso di dominio non deve gestire eccezioni del push. Se la latenza nel flusso chiamante è un problema, si può non attendere il risultato (`void this.push.sendToUser(...)`).
- **Mai stato di gioco nel payload:** solo builder del catalogo, che portano al massimo un id.
- **Retry con coda Bull:** estensione differita. Va dietro la porta `PushTransport` (`src/push/transport/push-transport.ts`) senza toccare i chiamanti.
- **Test:** usare `FakePushTransport` (`test/push/fake-push-transport.ts`) con `overrides: [{ token: PushTransport, useValue: transport }]`; registra `sent`, `topicSends`, `subscriptions`, `unsubscriptions` e simula fallimenti (`failToken`, `failTopicSend`, `failTopicManagement`). Niente `jest.mock` di firebase-admin.

---

## 9. Deploy e runtime

- **Runtime:** `firebase-admin ^14.5.0` con `"engines": { "node": ">=22" }` in `package.json` (Node 18 e Node 20 sono EOL; CI e sviluppo locale su Node 22).
- **Se l'host gira ancora su Node 20:** il downgrade a `firebase-admin ^13.10.0` è una riga di `package.json` (più l'`engines`), con API identica per il codice di questa fase. **Ma** la 13.x gestisce i topic tramite la Instance ID API, che Firebase spegne il **2027-09-29**: dopo quella data i nuovi device non verrebbero più iscritti al topic `streamer-live`. Trigger di upgrade: tornare a 14.x prima di quella data.
- **`FIREBASE_SERVICE_ACCOUNT` è obbligatoria con `NODE_ENV=production`**: il boot viene rifiutato senza. Configurarla nell'ambiente **PRIMA** del deploy di questa fase (fail-closed voluto, D-06).
- **Collection nuova `push_devices`:** indice unico `(userId, deviceId)`, indice unico `token`, TTL 270 giorni su `lastSeenAt`. Gli indici sono creati al boot da `PushDeviceIndexVerifier`, che logga ERROR se falliscono senza bloccare l'avvio.
- **Nessuna migrazione:** nessun campo nuovo su `User` o su altre collection esistenti.

---

## 10. Verifica manuale (manual-only)

La consegna reale su device non è automatizzabile (servono credenziali Firebase reali e device fisici). Si esegue nella UAT del FE Phase 5 con la ricetta del §6:

- Android: foreground, background e app uccisa;
- iOS: foreground e background **senza** force-quit (force-quit = best-effort, §3);
- tap sulla notifica → navigazione e ri-query GraphQL;
- toggle disattivato per un tipo → nessuna notifica mostrata per quel tipo.

Lato BE la copertura automatica arriva fino al contratto: forma del messaggio FCM (`fcm-message.spec.ts`), catalogo (`push-events.spec.ts`), pruning e report (`push.service.spec.ts`, `push.resolver.int-spec.ts`), boot reale senza credenziali (`test/app.int-spec.ts`).

---

## 11. Verifica

Gate di fine fase eseguito in 05-08 sul branch `feat/05-infrastruttura-push-fcm`:

| Gate | Esito |
| ---- | ----- |
| `npm test` (unit) | 66 suite, 807 test passati |
| `npm test` (integration, `--runInBand`) | 43 suite, 515 test passati |
| `npm run build` | exit 0 |
| `npx eslint` sui 45 `.ts` toccati dalla fase | exit 0 |
| `npx prettier --check` sugli stessi file | exit 0 |
| `npx jest test/app.int-spec.ts` + `git diff --exit-code src/schema.gql` | 20/20, schema invariato (33 righe aggiunte e 0 rimosse rispetto a `develop`) |
| `git ls-files \| grep -iE 'service-?account\|adminsdk'` | vuoto |
| import `from 'firebase-admin'` (root) in `src`/`test` | nessuno: solo `firebase-admin/app` e `firebase-admin/messaging` nell'adattatore `src/push/transport/` |
| `jest.mock` in `src/push`, `test/push` | nessuno |
| campi push su `User` | nessuno |
| trailer `Co-Authored-By` nei commit della fase | 0 |

### Deviazioni registrate nei plan della fase

- **05-01:** il PEM finto dello spec è stato reso letterale (marker `SECRETKEYMATERIAL`) perché l'acceptance grep potesse verificarlo; `parsePushConfig` è diviso in piccoli helper con gli stessi messaggi.
- **05-02:** titolo `it.each` corretto in `push.exception.spec.ts` (stampava `NaN`); warning ESLint rimosso in `push-events.spec.ts`.
- **05-03, 05-04, 05-07:** nessuna deviazione.
- **05-05:** import relativi degli helper di test nello spec unit (il mapper del progetto unit non risolve `test/...`); il test "il log non contiene il token" usa un token lungo, perché il suffisso di 6 caratteri ammesso conteneva l'intero token di prova. Le firme di `registerDevice`, `sendTest` e `sendToUser` sono spezzate su più righe da Prettier (per questo sono riportate multi-riga al §8).
- **05-06:** helper dell'int-spec condivisi a livello di modulo (solo test).
- **05-08:** il gate ha trovato un fallimento preesistente e dipendente dall'ordine: `spell-recovery.processor.int-spec.ts` scriveva tramite la propria connessione Nest, che la pulizia globale non svuota, e un `Test Hero` residuo rompeva l'indice unico sul nome in `spell-recovery.processor.cap.int-spec.ts` quando girava subito dopo. Corretto con una pulizia `afterEach` nella suite che lasciava i dati (commit `test(characters)`), verificato forzando l'ordine che falliva.
