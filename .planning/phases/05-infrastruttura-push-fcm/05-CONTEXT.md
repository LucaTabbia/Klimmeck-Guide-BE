# Phase 5: Infrastruttura Push FCM - Context

**Gathered:** 2026-10-18
**Status:** Ready for planning
**Mode:** `--auto` (discussione non interattiva su richiesta dell'utente "prosegui con la fase 5 gsd del BE in modo da sbloccare il FE"): per ogni area è stata scelta l'opzione raccomandata; le alternative sono nel `05-DISCUSSION-LOG.md`. L'utente può rivedere qualunque D-xx prima della PR.

<domain>
## Phase Boundary

Consegnare un'**infrastruttura push FCM domain-agnostic** sul backend: un registro di device token per-utente (una riga per device, upsert idempotente, cancellazione all'uscita), un servizio di invio condiviso basato su `firebase-admin` (FCM HTTP v1) che consegna **data message** ai device di un utente o in broadcast, il pruning dei token che FCM dichiara non più registrati, e il **catalogo tipizzato** degli eventi push della v1.0 (`travelEnd`, `questEnd`, `streamerLive`) con il contratto del payload che il FE Phase 5 consuma. Il push è un **side-channel non autoritativo**: porta al massimo un ID e il tipo dell'evento, mai stato di gioco; la fonte di verità resta la subscription/query GraphQL.

Per sbloccare l'E2E del FE prima che esistano i trigger di dominio, la fase espone anche una mutation **innkeeper-only** di invio di prova (auditata per convenzione Phase 3). Chiude la voce "FCM: NOT IMPLEMENTED" di `.planning/codebase/INTEGRATIONS.md`.

Fuori scope: i trigger reali (fine viaggio → Phase 8, fine quest/esiti combat → Phase 9, `stream.online` → Phase 6), le preferenze notifiche lato server (restano sul device, FE Phase 4 D-09..D-13), code di retry per il dispatch, query admin sul registro, rate limiting della registrazione (Phase 10), il blocco `notification` nativo per iOS (decisione rinviata al FE, vedi D-11).

</domain>

<decisions>
## Implementation Decisions

### Registro device token (BE-NOTIF-01)
- **D-01:** Collection **dedicata** (es. `push_devices`, nome a discrezione del planner) con documento `{ userId: ObjectId, deviceId: string, token: string, platform: 'android' | 'ios', lastSeenAt: Date }`. **Niente sullo `User`**: il token non deve mai comparire nello schema GraphQL, in `me` né in `userUpdated`. Invarianti del registro: (a) al massimo **una riga per `(userId, deviceId)`** (indice unico composto); (b) **un token compare in al massimo una riga** (lo stesso device che cambia account non deve lasciare al vecchio utente un token che ora riceve il nuovo); (c) la registrazione è **idempotente**. Il meccanismo per (b) è a discrezione del planner (rimozione delle righe con lo stesso `token` di un'altra coppia dopo l'upsert, oppure indice unico su `token` con gestione E11000 come in `UsersService.retryOnDuplicateKey`). Indice su `userId` per il fan-out. **Indice TTL su `lastSeenAt` a 270 giorni** (allineato alla scadenza FCM dei token inattivi) come igiene; il FE ri-registra a ogni avvio/login e su refresh del token, quindi un device attivo non scade mai.
- **D-02:** Mutation **`registerPushDevice(input: RegisterPushDeviceInput!): Boolean!`** con `deviceId: String!`, `token: String!`, `platform: PushPlatform!` (`enum PushPlatform { android, ios }`). Identità **solo dal bearer** (`@CurrentUser()`, pattern `deleteCharacter`): nessun `userId` in input; ammessa a ogni autenticato, anche senza personaggio. Validazione autoritativa prima della scrittura: `deviceId` 1–128 caratteri in `[A-Za-z0-9._-]`; `token` non vuoto, senza whitespace, ≤ 4096 caratteri. Rifiuti con eccezione tipizzata e codici stabili in `extensions.code` (es. `PUSH_INVALID_DEVICE_ID`, `PUSH_INVALID_TOKEN`), messaggi in italiano, pattern `formatDomainError`. Restituisce `true` (nessun dato utile da restituire al FE).
- **D-03:** Mutation **`unregisterPushDevice(deviceId: String!): Boolean!`**: `deleteOne({ userId: bearer, deviceId })`, **idempotente** (`true` anche se la riga non c'era); disiscrizione dal topic best-effort (D-09). Il FE la chiama **prima** di `logout` (serve il bearer) e al cambio account. Il contratto di `logout` **non** cambia. Un device che non ha chiamato unregister e viene ri-registrato da un altro utente è comunque sanato dall'invariante (b) di D-01.
- **D-04:** `lastSeenAt` aggiornato a ogni `registerPushDevice`; nessuna mutation di "ping"/heartbeat. Un token che cambia sullo stesso device (`onTokenRefresh`) è una ri-registrazione che aggiorna la riga `(userId, deviceId)`.

### Credenziali Firebase e servizio di invio (BE-NOTIF-02)
- **D-05:** Dipendenza **`firebase-admin` linea 13.x** (`^13.10.0`, `engines.node >= 18`): la 14.x (latest 14.5.0) richiede Node ≥ 22; CI e sviluppo locale sono su Node 22, ma il **runtime di produzione non è confermato** (research flag della ROADMAP). Il planner può scegliere la 14.x solo se il runtime prod risulta ≥ 22; l'API usata (`messaging().sendEachForMulticast`, `subscribeToTopic`, `unsubscribeFromTopic`, `send({ topic })`) è identica nelle due linee. Nessun'altra dipendenza nuova.
- **D-06:** Credenziali via **una sola variabile `FIREBASE_SERVICE_ACCOUNT`** = JSON del service account Firebase **codificato base64** (evita le trappole dei `\n` della private key nelle tre variabili separate). Parsata e validata al boot in `src/config/push-config.ts` sul modello di `parseAuthConfig` (chiamata da `validateEnv`; `.env.example` aggiornato con il comando per generarla; il valore e la private key **non vengono mai loggati**; i test non la richiedono). Comportamento fail-closed: **assente in `NODE_ENV=production` → boot rifiutato** (un deploy prod senza push non deve passare in silenzio); assente in development/test → push **disabilitato** con transport no-op e **WARN al boot** (stesso stile di `AuthStartupReporter` per Twitch non configurato). Il `project_id` del service account deve essere lo **stesso progetto Firebase** dei `google-services.json` / `GoogleService-Info.plist` del FE (fuori VCS su entrambi i lati).
- **D-07:** Architettura a porta: **`PushService`** (API di dominio: `sendToUser(userId, message)`, `broadcast(message)`) → **`PushTransport`** (classe astratta/porta: `sendToTokens(tokens, message)` con esito per-token, `subscribeToTopic(tokens, topic)`, `unsubscribeFromTopic(tokens, topic)`, `sendToTopic(topic, message)`) con due implementazioni: **`FcmPushTransport`** (firebase-admin inizializzato una volta, `sendEachForMulticast` in **batch da 500 token**) e **`NoopPushTransport`** (credenziali assenti). Modulo dedicato `src/push/` (`PushModule`, `@Global()` o esportato esplicitamente a discrezione), senza Bull. **firebase-admin non viene mai contattato nei test**: unit test di `PushService` con un transport fake in memoria; integration test sul wire con `createAuthTestApp({ imports: [PushModule], overrides: [{ token: PushTransport, useValue: fake }] })`.
- **D-08:** **Pruning**: esito per token con codice `messaging/registration-token-not-registered` (e `messaging/invalid-registration-token` / `messaging/invalid-argument` riferiti al token) → `deleteOne({ token })` dal registro + log INFO; altri errori (`messaging/unavailable`, `messaging/internal-error`, quota) → WARN, **nessun retry in questa fase** (coda differita). `sendToUser`/`broadcast` sono **best-effort e non lanciano mai verso il chiamante di dominio**: restituiscono un report `{ targeted, sent, pruned, failed }` e loggano; un viaggio completato o un esito di combat non devono fallire perché il push è fallito. Dispatch sincrono (`await` della chiamata firebase-admin) dentro il chiamante: la coda Bull per retry/asincronia è un'estensione differita dietro la stessa porta.
- **D-09:** **Fan-out**: evento personale → multicast su **tutti i token del registro dell'utente** (multi-device); **streamer-live → topic FCM `streamer-live`**: ogni token è iscritto al topic alla registrazione (best-effort: un errore di `subscribeToTopic` è loggato e la registrazione resta `true`) e disiscritto all'unregister; `broadcast()` invia al topic. Le **preferenze dell'utente (toggle fine viaggio / streamer live / fine quest) restano sul device**: il BE invia a tutti i device registrati e il FE filtra (FE Phase 4 BACKEND-NOTES §4).

### Contratto del payload (BE-NOTIF-03)
- **D-10:** **Data-only message** (nessun blocco `notification`): il FE gestisce i tre app state (killed, background, foreground) in modo uniforme e applica i toggle anche ad app uccisa prima di mostrare la notifica locale. Chiavi di `data` (tutte stringhe, come richiede FCM): `type` ∈ **`enum PushEventType { travelEnd, questEnd, streamerLive }`** (Phase 9 aggiungerà `combatResult`), `id` (opzionale: l'identificatore della risorsa da ri-interrogare — personaggio, pending quest — **mai stato di gioco**), `title` e `body` (copy in italiano per la notifica locale / banner `KGNotification { title, description }`, catalogo per tipo lato BE, testo a discrezione), `sentAt` (ISO 8601 del server). Niente altro.
- **D-11:** Opzioni di consegna: Android `android.priority = 'high'`; iOS come **background push**: `apns.headers['apns-push-type'] = 'background'`, `apns-priority = '5'`, `aps['content-available'] = 1` (research flag: forma esatta e limiti; i background push iOS con app uccisa sono **best-effort e soggetti a throttling**: la caveat va documentata nel handoff, lasciando al FE la decisione di chiedere un blocco `notification` nativo per iOS in una fase successiva). TTL del messaggio per tipo (`android.ttl` / `apns-expiration`, es. 1 h per `travelEnd`/`questEnd`, 15 min per `streamerLive`) a discrezione del planner.
- **D-12:** **Catalogo tipizzato degli eventi in un solo posto** (es. `src/push/push-events.ts`): builder puri `travelEnd(characterId)`, `questEnd(pendingQuestId)`, `streamerLive()` che producono il messaggio data-only completo (tipo, id, copy, opzioni di consegna). BE Phase 8 (completamento viaggio), Phase 9 (fine quest/combat) e Phase 6 (`stream.online`) chiamano `PushService` con questi builder. **Nessun trigger di dominio esiste oggi** e Phase 5 non ne inventa: nessun job, nessun cambiamento a `Character`/`PendingQuest`.

### Trigger di prova per il FE (sblocco FE Phase 5)
- **D-13:** Mutation **innkeeper-only** **`sendTestPush(input: SendTestPushInput!): PushDeliveryReport!`** con `type: PushEventType!`, `targetUserId: ID` (default: il chiamante), `id: String` opzionale (valore passato in `data.id`). Decorata `@Roles(innkeeper)` → **auditata automaticamente** (Phase 3 D-15/D-16, `admin_audit_logs`). Serve al FE per l'E2E dei tre app state prima che esistano i trigger di dominio (dev bypass con `DEV_AUTH_ROLE=innkeeper`) e resta un attrezzo legittimo del game master in prod. `type: streamerLive` invia al topic e ignora `targetUserId`. `PushDeliveryReport { targeted: Int!, sent: Int!, pruned: Int!, failed: Int! }`. Codici: `FORBIDDEN` (ruolo), `NOT_FOUND` (`targetUserId` inesistente/malformato), `PUSH_DISABLED` quando il transport è no-op (credenziali assenti).

### Errori, schema, handoff, test, tooling, branch
- **D-14:** Schema **additivo**: `registerPushDevice`, `unregisterPushDevice`, `sendTestPush`, `input RegisterPushDeviceInput`, `input SendTestPushInput`, `enum PushPlatform`, `enum PushEventType`, `type PushDeliveryReport`. `src/schema.gql` rigenerato dal real-boot test (`test/app.int-spec.ts`) e committato; **nessuna operazione esistente cambia**; la CI verifica l'assenza di drift.
- **D-15:** Handoff **`BACKEND-NOTES.md`** di fase per il FE Phase 5: SDL verbatim, payload `data` con un esempio per tipo, caveat iOS (D-11), checklist Firebase (stesso progetto del FE; come generare `FIREBASE_SERVICE_ACCOUNT`), flusso FE consigliato (register dopo il login e su `onTokenRefresh`; unregister **prima** di `logout` e al cambio account; `deviceId` = UUID generato una volta e persistito dal FE, **non** `androidId`/IDFV), ricetta E2E con `sendTestPush`, tabella codici, note per BE Phase 6/8/9 (come usare i builder D-12 e `PushService`).
- **D-16:** **TDD.** Unit test: validazione input (D-02), builder del catalogo (D-12), `PushService` con transport fake (pruning su not-registered → riga rimossa; report corretto; batch da 500; errori non-pruning → WARN senza eccezione; no-op → `PUSH_DISABLED` solo in `sendTestPush`), `parsePushConfig` (base64 malformato, JSON senza `project_id`/`private_key`/`client_email`, prod senza variabile → errore, dev senza variabile → disabilitato). Integration test sul wire (replica set, `createAuthTestApp`): register due volte lo stesso device → **una riga** con `lastSeenAt` aggiornato; nuovo token stesso device → una riga; stesso token da un altro utente → la riga precedente sparisce; **due register concorrenti** dello stesso device → una riga; unregister idempotente; register senza bearer → `UNAUTHENTICATED`; `sendTestPush` da `adventurer` → `FORBIDDEN`, da `innkeeper` → report + record in `admin_audit_logs`; `subscribeToTopic` del fake chiamato alla registrazione; token non salvati su `User` (`me` invariato).
- **D-17:** Tooling (02.1 D-14 / 04 D-18): `npx prettier --write <file>` + `npx eslint <file>` solo sui file toccati (mai `npm run lint`); percorsi jest **prima** di `--selectProjects`; gate CI: lint, build, unit, integration, `git diff --exit-code src/schema.gql`. **Nessun secret in repo**: `.env.example` con `FIREBASE_SERVICE_ACCOUNT=` vuoto e istruzioni; nessun file `serviceAccount*.json` committato (aggiungere il pattern a `.gitignore`).
- **D-18:** Branch **`feat/05-infrastruttura-push-fcm`** da `develop` (template `feat/{phase}-{slug}`; la riga Branch della ROADMAP `feat/05-fcm-infrastructure` è stata allineata), PR a `develop`. **La PR BE si fonde prima della PR FE Phase 5**: il FE verifica i propri documenti GraphQL contro `src/schema.gql` rigenerato.

### Claude's Discretion
- Nomi e collocazione (`src/push/` vs `src/notifications/`, `PushModule`, `push_devices`), forma esatta dell'invariante "token unico" (D-01), TTL dei messaggi per tipo (D-11), testo di `title`/`body` per tipo (D-10), `@Global()` vs export esplicito, split in wave, se restituire in `PushDeliveryReport` anche i codici d'errore aggregati, come esporre l'esito per-token dalla porta (`PushTransport`).

</decisions>

<specifics>
## Specific Ideas

- Il FE ha già fissato le aspettative in `Klimmeck-Guide/.planning/phases/04-settings-screen/BACKEND-NOTES.md` §4: i toggle sono locali al device, il BE **non** deve esporre preferenze, e il payload deve essere un **data message con il tipo dell'evento** (`travelEnd` / `streamerLive` / `questEnd`) oltre all'id, così il background handler applica la preferenza prima di mostrare la notifica locale. D-09/D-10 lo recepiscono alla lettera.
- Il FE ha `firebase_messaging ^15.2.9`, `firebase_core`, `firebase_auth` in `pubspec.yaml` e il modello `KGNotification { title, description }` (`lib/models/notification.dart`): `title`/`body` in `data` si mappano 1:1 sul banner in-app (FE NOTIF-07).
- Research di progetto (`.planning/research/STACK.md` §"FCM targeting"): registro per-device con pruning su `registration-token-not-registered`, multicast per gli eventi personali, topic per `streamer-live`, push che porta solo l'id (combat hybrid). Phase 5 segue quella traccia.
- Stile già in codice da replicare: `parseAuthConfig`/`validateEnv` (config fail-closed), `AuthStartupReporter` (WARN al boot senza interpolare segreti), `CharacterDeletionResolver` (identità dal bearer, nessun argomento ridondante), `AdminProbeResolver` in `test/authz/` (mutation `@Roles(innkeeper)` auditata), eccezioni tipizzate + `formatDomainError`.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Scope e requisiti
- `.planning/ROADMAP.md` §"Phase 5: Infrastruttura Push FCM" — goal, success criteria 1–4, research flag (runtime Node prod), branch.
- `.planning/REQUIREMENTS.md` — BE-NOTIF-01, BE-NOTIF-02, BE-NOTIF-03 (e i consumatori a valle: BE-POINTS-03 `stream.online` → push streamer-live, BE-TRAVEL-03 push travel-end, BE-COMBAT-02 push con `resultId`).
- `.planning/PROJECT.md` — core value (fonte di verità; il push non trasporta stato), Key Decisions (combat result ibrido: ID su push), Constraints (nessun secret in repo).
- `.planning/research/STACK.md` §"firebase-admin", §"FCM targeting", §"What NOT to Use" (firebase-admin@14 su Node < 22); `.planning/research/ARCHITECTURE.md` §"notifications module"; `.planning/research/FEATURES.md` §"FCM device-token registration + send".
- `.planning/codebase/INTEGRATIONS.md` §"Push Notifications" (stato NOT IMPLEMENTED da chiudere).

### Contratto FE (sola lettura)
- `/Users/lucatabbia/Personale/Code/Klimmeck-Guide/Klimmeck-Guide/.planning/phases/04-settings-screen/BACKEND-NOTES.md` §4 — preferenze sul device, payload data message con `type`, nessun contratto per le preferenze.
- `/Users/lucatabbia/Personale/Code/Klimmeck-Guide/Klimmeck-Guide/.planning/ROADMAP.md` §"Phase 5: Notifications Infrastructure" e `/Users/lucatabbia/Personale/Code/Klimmeck-Guide/Klimmeck-Guide/.planning/REQUIREMENTS.md` NOTIF-01..NOTIF-08 — cosa il FE si aspetta di consumare (token per-device, tre app state, tap → Map, banner `KGNotification`, dedup foreground).
- `/Users/lucatabbia/Personale/Code/Klimmeck-Guide/Klimmeck-Guide/lib/models/notification.dart` — `KGNotification { title, description }`.

### Decisioni precedenti su cui si costruisce
- `.planning/phases/02-auth-identity-foundation/02-CONTEXT.md` — D-12/D-13 (seam d'identità, `@CurrentUser()`), config fail-closed e `.env.example`, dev bypass.
- `.planning/phases/02.1-character-creation-contract/02.1-CONTEXT.md` — D-14 (tooling), D-16 (eccezioni tipizzate + `formatDomainError`), D-21 (moduli dedicati senza Bull, `createAuthTestApp({ imports, overrides })`).
- `.planning/phases/03-autorizzazione-ownership-ruoli-audit/03-CONTEXT.md` e `BACKEND-NOTES.md` — D-15/D-16/D-17 (convenzione `@Roles(innkeeper)` + audit automatico), codici `FORBIDDEN`/`NOT_FOUND`.
- `.planning/phases/03.1-character-deletion-contract/03.1-CONTEXT.md` — mutation senza argomenti sull'identità del bearer, modulo sibling dedicato.
- `.planning/phases/04-integrita-economica-atomics/04-CONTEXT.md` — D-18 (tooling/CI), D-20 (PR autonoma); `BACKEND-NOTES.md` come modello di handoff.

### Codice da leggere
- `src/config/auth-config.ts`, `src/config/env.validation.ts`, `src/auth/auth-startup.reporter.ts` — modello per `parsePushConfig` e il WARN al boot.
- `src/auth/decorators/current-user.decorator.ts`, `src/auth/auth-identity.ts`, `src/authz/roles/roles.decorator.ts`, `src/authz/audit/admin-audit.interceptor.ts` — identità, ruolo, audit automatico.
- `src/characters/deletion/*` — modulo piccolo con resolver + service + eccezione tipizzata + int-spec sul wire.
- `src/users/users.service.ts` (`retryOnDuplicateKey`, `findOne` → `ResourceNotFoundException.user()`), `src/mongo/mongo-errors.ts`, `src/mongo/document-id.ts`, `src/authz/resource-not-found.exception.ts`, `src/graphql/format-domain-error.ts`.
- `src/models/user.model.ts` (non va toccato), `src/models/notification.model.ts` (`KGNotification` lato BE, oggi inutilizzato dal wire).
- `src/app.module.ts` (montaggio del nuovo modulo), `src/pubsub.module.ts` (esempio di modulo `@Global()`), `.env.example`, `.github/workflows/ci.yml`, `package.json`.
- `test/auth/auth-test-app.ts`, `test/auth/test-tokens.ts` (`createAuthenticatedUser`), `test/authz/admin-probe.resolver.ts`, `test/authz/admin-audit.int-spec.ts` (come asserire il record di audit), `test/fixtures/user.fixture.ts`, `test/app.int-spec.ts` (rigenerazione schema e assert sulle API).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `parseAuthConfig`/`readAuthEnv`/`validateEnv` — pattern di config tipizzata, fail-closed, con test che verificano che i segreti non finiscano nei messaggi d'errore.
- `AuthStartupReporter` (`OnApplicationBootstrap`) — WARN al boot per feature non configurate.
- `@CurrentUser()` + `AuthIdentity { userId, twitchId, role }` — identità del bearer nei resolver; `@Roles(RoleType.innkeeper)` + `AdminAuditInterceptor` globale — mutation admin auditate senza codice aggiuntivo.
- Eccezioni tipizzate con `extensions.code` (`CharacterDeletionException`, `ResourceNotFoundException`, `AuthorizationException`) + `formatDomainError`.
- `UsersService.findOne`/`retryOnDuplicateKey`, `isObjectIdHex`/`objectIdFromHex`, `isDuplicateKeyError`.
- Harness: `createAuthTestApp({ imports, overrides })`, `createAuthenticatedUser(role)`, `graphqlRequest`, fixture `persistUser`, replica set condiviso, `admin-audit.int-spec.ts` per leggere `admin_audit_logs`.

### Established Patterns
- Un modulo per capability (`src/<feature>/`), senza Bull dove non serve; `MongooseModule.forFeature` locale; service esportato per i consumatori a valle.
- Mutation giocatore: identità dal bearer, nessun argomento ridondante; mutation admin: `@Roles(innkeeper)` → `FORBIDDEN` + audit.
- Schema GraphQL code-first rigenerato dal real-boot test e committato; CI fallisce sul drift.
- Messaggi utente in italiano, codici stabili mai cambiati; log senza segreti.
- Tooling: prettier/eslint solo sui file toccati; jest paths prima di `--selectProjects`.

### Integration Points
- `AppModule` (nuovo `PushModule`), `validateEnv` (nuova `parsePushConfig`), `.env.example`, `src/schema.gql`, `test/app.int-spec.ts` (assert sulle nuove API nello schema), `BACKEND-NOTES.md` per il FE Phase 5; consumatori futuri: BE Phase 6 (`streamerLive()`), Phase 8 (`travelEnd()`), Phase 9 (`questEnd()` / `combatResult`).

</code_context>

<deferred>
## Deferred Ideas

- **Coda Bull per il dispatch push** (retry su `unavailable`/`internal`, asincronia rispetto al chiamante) — estensione dietro `PushTransport`; rivalutare al primo fallimento osservato (CONCERNS DLQ/monitoraggio).
- **Preferenze notifiche server-side** (`notificationPreferences` sullo `User`, soppressione lato BE, coerenza multi-device) — il FE le ha differite (Phase 4 §4); se servirà, il FE proporrà il contratto.
- **Blocco `notification` nativo per iOS** (consegna garantita ad app uccisa a scapito del filtro client-side) — decisione del FE dopo l'E2E su iOS con il data-only.
- **`PushEventType.combatResult`** e push con `resultId` — Phase 9 (BE-COMBAT-02).
- **Trigger reali**: fine viaggio (Phase 8, BE-TRAVEL-03), fine quest/esiti (Phase 9), `stream.online` (Phase 6, BE-POINTS-03).
- **Query admin del registro** (`pushDevices(userId)`) e metriche di consegna — osservabilità, fuori scope.
- **Rate limiting di `registerPushDevice`** e validazione generale con `class-validator` — Phase 10 (BE-HARD).
- **Topic per categoria** (es. `quest-end`) e localizzazione del copy — non richiesti dalla v1.0.
- **Rimozione di `src/models/notification.model.ts`** se resta inutilizzato dal wire — Boy Scout in una fase successiva, non in questa.

</deferred>

---

*Phase: 05-infrastruttura-push-fcm*
*Context gathered: 2026-10-18*
