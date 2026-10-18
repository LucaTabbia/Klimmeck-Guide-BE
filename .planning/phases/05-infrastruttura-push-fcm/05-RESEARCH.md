# Phase 5: Infrastruttura Push FCM - Research

**Researched:** 2026-10-18
**Domain:** firebase-admin (FCM HTTP v1) server-side messaging, per-device token registry on MongoDB (Mongoose 8), NestJS DI ports/adapters, fail-closed env config, Apollo code-first additive schema
**Confidence:** HIGH. The firebase-admin 13.10.0 and 14.5.0 tarballs were unpacked and diffed, and 13.10.0 was compiled and run offline with this repo's `nodenext` tsconfig. Every Mongo registry shape was run on this repo's replica-set harness against mongod **8.0.4** (the CI pin) and **8.2.6** (the local cache), with Mongoose 8.18.1. Apple's and Firebase's official docs were fetched.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Registro device token (BE-NOTIF-01)
- **D-01:** Collection **dedicata** (es. `push_devices`, nome a discrezione del planner) con documento `{ userId: ObjectId, deviceId: string, token: string, platform: 'android' | 'ios', lastSeenAt: Date }`. **Niente sullo `User`**: il token non deve mai comparire nello schema GraphQL, in `me` né in `userUpdated`. Invarianti del registro: (a) al massimo **una riga per `(userId, deviceId)`** (indice unico composto); (b) **un token compare in al massimo una riga** (lo stesso device che cambia account non deve lasciare al vecchio utente un token che ora riceve il nuovo); (c) la registrazione è **idempotente**. Il meccanismo per (b) è a discrezione del planner (rimozione delle righe con lo stesso `token` di un'altra coppia dopo l'upsert, oppure indice unico su `token` con gestione E11000 come in `UsersService.retryOnDuplicateKey`). Indice su `userId` per il fan-out. **Indice TTL su `lastSeenAt` a 270 giorni** (allineato alla scadenza FCM dei token inattivi) come igiene; il FE ri-registra a ogni avvio/login e su refresh del token, quindi un device attivo non scade mai.
- **D-02:** Mutation **`registerPushDevice(input: RegisterPushDeviceInput!): Boolean!`** con `deviceId: String!`, `token: String!`, `platform: PushPlatform!` (`enum PushPlatform { android, ios }`). Identità **solo dal bearer** (`@CurrentUser()`, pattern `deleteCharacter`): nessun `userId` in input; ammessa a ogni autenticato, anche senza personaggio. Validazione autoritativa prima della scrittura: `deviceId` 1–128 caratteri in `[A-Za-z0-9._-]`; `token` non vuoto, senza whitespace, ≤ 4096 caratteri. Rifiuti con eccezione tipizzata e codici stabili in `extensions.code` (es. `PUSH_INVALID_DEVICE_ID`, `PUSH_INVALID_TOKEN`), messaggi in italiano, pattern `formatDomainError`. Restituisce `true` (nessun dato utile da restituire al FE).
- **D-03:** Mutation **`unregisterPushDevice(deviceId: String!): Boolean!`**: `deleteOne({ userId: bearer, deviceId })`, **idempotente** (`true` anche se la riga non c'era); disiscrizione dal topic best-effort (D-09). Il FE la chiama **prima** di `logout` (serve il bearer) e al cambio account. Il contratto di `logout` **non** cambia. Un device che non ha chiamato unregister e viene ri-registrato da un altro utente è comunque sanato dall'invariante (b) di D-01.
- **D-04:** `lastSeenAt` aggiornato a ogni `registerPushDevice`; nessuna mutation di "ping"/heartbeat. Un token che cambia sullo stesso device (`onTokenRefresh`) è una ri-registrazione che aggiorna la riga `(userId, deviceId)`.

#### Credenziali Firebase e servizio di invio (BE-NOTIF-02)
- **D-05 (rivista dopo questa ricerca, vedi CONTEXT):** Dipendenza **`firebase-admin` linea 14.x** (`^14.5.0`, `engines.node >= 22`, `"engines": { "node": ">=22" }` in `package.json`): Node 18/20 sono EOL, CI e locale sono su Node 22, la 13.x perde la gestione topic il 2027-09-29. API identica alle due linee; downgrade a `^13.10.0` = una riga se il deploy girasse su un Node EOL. Codici d'errore confrontati come stringhe.
- **D-06:** Credenziali via **una sola variabile `FIREBASE_SERVICE_ACCOUNT`** = JSON del service account Firebase **codificato base64** (evita le trappole dei `\n` della private key nelle tre variabili separate). Parsata e validata al boot in `src/config/push-config.ts` sul modello di `parseAuthConfig` (chiamata da `validateEnv`; `.env.example` aggiornato con il comando per generarla; il valore e la private key **non vengono mai loggati**; i test non la richiedono). Comportamento fail-closed: **assente in `NODE_ENV=production` → boot rifiutato** (un deploy prod senza push non deve passare in silenzio); assente in development/test → push **disabilitato** con transport no-op e **WARN al boot** (stesso stile di `AuthStartupReporter` per Twitch non configurato). Il `project_id` del service account deve essere lo **stesso progetto Firebase** dei `google-services.json` / `GoogleService-Info.plist` del FE (fuori VCS su entrambi i lati).
- **D-07:** Architettura a porta: **`PushService`** (API di dominio: `sendToUser(userId, message)`, `broadcast(message)`) → **`PushTransport`** (classe astratta/porta: `sendToTokens(tokens, message)` con esito per-token, `subscribeToTopic(tokens, topic)`, `unsubscribeFromTopic(tokens, topic)`, `sendToTopic(topic, message)`) con due implementazioni: **`FcmPushTransport`** (firebase-admin inizializzato una volta, `sendEachForMulticast` in **batch da 500 token**) e **`NoopPushTransport`** (credenziali assenti). Modulo dedicato `src/push/` (`PushModule`, `@Global()` o esportato esplicitamente a discrezione), senza Bull. **firebase-admin non viene mai contattato nei test**: unit test di `PushService` con un transport fake in memoria; integration test sul wire con `createAuthTestApp({ imports: [PushModule], overrides: [{ token: PushTransport, useValue: fake }] })`.
- **D-08:** **Pruning**: esito per token con codice `messaging/registration-token-not-registered` (e `messaging/invalid-registration-token` / `messaging/invalid-argument` riferiti al token) → `deleteOne({ token })` dal registro + log INFO; altri errori (`messaging/unavailable`, `messaging/internal-error`, quota) → WARN, **nessun retry in questa fase** (coda differita). `sendToUser`/`broadcast` sono **best-effort e non lanciano mai verso il chiamante di dominio**: restituiscono un report `{ targeted, sent, pruned, failed }` e loggano; un viaggio completato o un esito di combat non devono fallire perché il push è fallito. Dispatch sincrono (`await` della chiamata firebase-admin) dentro il chiamante: la coda Bull per retry/asincronia è un'estensione differita dietro la stessa porta.
- **D-09:** **Fan-out**: evento personale → multicast su **tutti i token del registro dell'utente** (multi-device); **streamer-live → topic FCM `streamer-live`**: ogni token è iscritto al topic alla registrazione (best-effort: un errore di `subscribeToTopic` è loggato e la registrazione resta `true`) e disiscritto all'unregister; `broadcast()` invia al topic. Le **preferenze dell'utente (toggle fine viaggio / streamer live / fine quest) restano sul device**: il BE invia a tutti i device registrati e il FE filtra (FE Phase 4 BACKEND-NOTES §4).

#### Contratto del payload (BE-NOTIF-03)
- **D-10:** **Data-only message** (nessun blocco `notification`): il FE gestisce i tre app state (killed, background, foreground) in modo uniforme e applica i toggle anche ad app uccisa prima di mostrare la notifica locale. Chiavi di `data` (tutte stringhe, come richiede FCM): `type` ∈ **`enum PushEventType { travelEnd, questEnd, streamerLive }`** (Phase 9 aggiungerà `combatResult`), `id` (opzionale: l'identificatore della risorsa da ri-interrogare — personaggio, pending quest — **mai stato di gioco**), `title` e `body` (copy in italiano per la notifica locale / banner `KGNotification { title, description }`, catalogo per tipo lato BE, testo a discrezione), `sentAt` (ISO 8601 del server). Niente altro.
- **D-11:** Opzioni di consegna: Android `android.priority = 'high'`; iOS come **background push**: `apns.headers['apns-push-type'] = 'background'`, `apns-priority = '5'`, `aps['content-available'] = 1` (research flag: forma esatta e limiti; i background push iOS con app uccisa sono **best-effort e soggetti a throttling**: la caveat va documentata nel handoff, lasciando al FE la decisione di chiedere un blocco `notification` nativo per iOS in una fase successiva). TTL del messaggio per tipo (`android.ttl` / `apns-expiration`, es. 1 h per `travelEnd`/`questEnd`, 15 min per `streamerLive`) a discrezione del planner.
- **D-12:** **Catalogo tipizzato degli eventi in un solo posto** (es. `src/push/push-events.ts`): builder puri `travelEnd(characterId)`, `questEnd(pendingQuestId)`, `streamerLive()` che producono il messaggio data-only completo (tipo, id, copy, opzioni di consegna). BE Phase 8 (completamento viaggio), Phase 9 (fine quest/combat) e Phase 6 (`stream.online`) chiamano `PushService` con questi builder. **Nessun trigger di dominio esiste oggi** e Phase 5 non ne inventa: nessun job, nessun cambiamento a `Character`/`PendingQuest`.

#### Trigger di prova per il FE (sblocco FE Phase 5)
- **D-13:** Mutation **innkeeper-only** **`sendTestPush(input: SendTestPushInput!): PushDeliveryReport!`** con `type: PushEventType!`, `targetUserId: ID` (default: il chiamante), `id: String` opzionale (valore passato in `data.id`). Decorata `@Roles(innkeeper)` → **auditata automaticamente** (Phase 3 D-15/D-16, `admin_audit_logs`). Serve al FE per l'E2E dei tre app state prima che esistano i trigger di dominio (dev bypass con `DEV_AUTH_ROLE=innkeeper`) e resta un attrezzo legittimo del game master in prod. `type: streamerLive` invia al topic e ignora `targetUserId`. `PushDeliveryReport { targeted: Int!, sent: Int!, pruned: Int!, failed: Int! }`. Codici: `FORBIDDEN` (ruolo), `NOT_FOUND` (`targetUserId` inesistente/malformato), `PUSH_DISABLED` quando il transport è no-op (credenziali assenti).

#### Errori, schema, handoff, test, tooling, branch
- **D-14:** Schema **additivo**: `registerPushDevice`, `unregisterPushDevice`, `sendTestPush`, `input RegisterPushDeviceInput`, `input SendTestPushInput`, `enum PushPlatform`, `enum PushEventType`, `type PushDeliveryReport`. `src/schema.gql` rigenerato dal real-boot test (`test/app.int-spec.ts`) e committato; **nessuna operazione esistente cambia**; la CI verifica l'assenza di drift.
- **D-15:** Handoff **`BACKEND-NOTES.md`** di fase per il FE Phase 5: SDL verbatim, payload `data` con un esempio per tipo, caveat iOS (D-11), checklist Firebase (stesso progetto del FE; come generare `FIREBASE_SERVICE_ACCOUNT`), flusso FE consigliato (register dopo il login e su `onTokenRefresh`; unregister **prima** di `logout` e al cambio account; `deviceId` = UUID generato una volta e persistito dal FE, **non** `androidId`/IDFV), ricetta E2E con `sendTestPush`, tabella codici, note per BE Phase 6/8/9 (come usare i builder D-12 e `PushService`).
- **D-16:** **TDD.** Unit test: validazione input (D-02), builder del catalogo (D-12), `PushService` con transport fake (pruning su not-registered → riga rimossa; report corretto; batch da 500; errori non-pruning → WARN senza eccezione; no-op → `PUSH_DISABLED` solo in `sendTestPush`), `parsePushConfig` (base64 malformato, JSON senza `project_id`/`private_key`/`client_email`, prod senza variabile → errore, dev senza variabile → disabilitato). Integration test sul wire (replica set, `createAuthTestApp`): register due volte lo stesso device → **una riga** con `lastSeenAt` aggiornato; nuovo token stesso device → una riga; stesso token da un altro utente → la riga precedente sparisce; **due register concorrenti** dello stesso device → una riga; unregister idempotente; register senza bearer → `UNAUTHENTICATED`; `sendTestPush` da `adventurer` → `FORBIDDEN`, da `innkeeper` → report + record in `admin_audit_logs`; `subscribeToTopic` del fake chiamato alla registrazione; token non salvati su `User` (`me` invariato).
- **D-17:** Tooling (02.1 D-14 / 04 D-18): `npx prettier --write <file>` + `npx eslint <file>` solo sui file toccati (mai `npm run lint`); percorsi jest **prima** di `--selectProjects`; gate CI: lint, build, unit, integration, `git diff --exit-code src/schema.gql`. **Nessun secret in repo**: `.env.example` con `FIREBASE_SERVICE_ACCOUNT=` vuoto e istruzioni; nessun file `serviceAccount*.json` committato (aggiungere il pattern a `.gitignore`).
- **D-18:** Branch **`feat/05-infrastruttura-push-fcm`** da `develop` (template `feat/{phase}-{slug}`; la riga Branch della ROADMAP `feat/05-fcm-infrastructure` è stata allineata), PR a `develop`. **La PR BE si fonde prima della PR FE Phase 5**: il FE verifica i propri documenti GraphQL contro `src/schema.gql` rigenerato.

### Claude's Discretion
- Nomi e collocazione (`src/push/` vs `src/notifications/`, `PushModule`, `push_devices`), forma esatta dell'invariante "token unico" (D-01), TTL dei messaggi per tipo (D-11), testo di `title`/`body` per tipo (D-10), `@Global()` vs export esplicito, split in wave, se restituire in `PushDeliveryReport` anche i codici d'errore aggregati, come esporre l'esito per-token dalla porta (`PushTransport`).

### Deferred Ideas (OUT OF SCOPE)
- **Coda Bull per il dispatch push** (retry su `unavailable`/`internal`, asincronia rispetto al chiamante) — estensione dietro `PushTransport`; rivalutare al primo fallimento osservato (CONCERNS DLQ/monitoraggio).
- **Preferenze notifiche server-side** (`notificationPreferences` sullo `User`, soppressione lato BE, coerenza multi-device) — il FE le ha differite (Phase 4 §4); se servirà, il FE proporrà il contratto.
- **Blocco `notification` nativo per iOS** (consegna garantita ad app uccisa a scapito del filtro client-side) — decisione del FE dopo l'E2E su iOS con il data-only.
- **`PushEventType.combatResult`** e push con `resultId` — Phase 9 (BE-COMBAT-02).
- **Trigger reali**: fine viaggio (Phase 8, BE-TRAVEL-03), fine quest/esiti (Phase 9), `stream.online` (Phase 6, BE-POINTS-03).
- **Query admin del registro** (`pushDevices(userId)`) e metriche di consegna — osservabilità, fuori scope.
- **Rate limiting di `registerPushDevice`** e validazione generale con `class-validator` — Phase 10 (BE-HARD).
- **Topic per categoria** (es. `quest-end`) e localizzazione del copy — non richiesti dalla v1.0.
- **Rimozione di `src/models/notification.model.ts`** se resta inutilizzato dal wire — Boy Scout in una fase successiva, non in questa.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| BE-NOTIF-01 | Mutation di registrazione token FCM per-device (upsert per userId+deviceId), con pruning dei token invalidi (`registration-token-not-registered`) | Q4: registry "claim" pattern. A unique `(userId, deviceId)` index plus a unique `token` index, a pre-delete of other holders, the upsert, and one retry on E11000. Verified on 8.0.4 and 8.2.6: 30 concurrent upserts on one device give 1 row and 0 errors, and 200 two-user races on one token give 1 row with every call succeeding. Q2 covers the pruning-code set and the invalid-argument witness rule. Pattern 2 covers the validator. |
| BE-NOTIF-02 | Servizio push condiviso domain-agnostic (`sendToUser`, topic broadcast) basato su firebase-admin (FCM HTTP v1); side-channel non autoritativo | Q1: modular imports and a single named app, verified offline. Q5: the `PushTransport` port, an injectable `Messaging` for unit tests, and a factory provider. Q2: per-token `BatchResponse`, a synchronous throw at 0 or more than 500 tokens, and string error codes that work on both 13 and 14. Pitfall 7 covers dispatch timing after commit. |
| BE-NOTIF-03 | Push travel-end, quest-end e streamer-live come data message (tre app state FE) | Q3: the exact data-only shape (`data` holds strings only, `android.priority/ttl`, APNs background headers with priority 5, and absolute `apns-expiration`). Apple doc quotes: priority 10 is an error, delivery is throttled, and force-quit drops held pushes. The pure catalog builders are in Code Example §3. |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- Stack fixed: NestJS 11 + Mongoose 8 + Apollo code-first. **One** new runtime dependency is allowed (`firebase-admin`, D-05) and nothing else.
- **TDD is mandatory** (Red → Green → Refactor). Every behaviour starts with a failing test. Builders, validator, config parser and `PushService` are unit-tested first. Registry invariants and wire contracts are integration-tested on the replica set.
- Clean Code, SoC, Boy Scout Rule. The `.gitignore` gains the service-account patterns (D-17). `src/models/notification.model.ts` stays untouched (deferred).
- Conventional Commits with scope `phase-5` (`feat(phase-5): …`, `docs(phase-5): …`). User memory says **no `Co-Authored-By` trailer**, and that overrides the harness attribution.
- Tooling: run `npx prettier --write <file>` and `npx eslint <file>` on touched files only. **Never** run `npm run lint` (it is `eslint --fix` on the whole repo), and never run prettier or format on directories.
- Jest: paths go **before** `--selectProjects` (`npx jest <paths> --selectProjects integration --runInBand`).
- Branch + PR to `develop`. Never push to `develop` or `main`. Existing GraphQL contracts must not change: the schema diff is additive only.
- No secrets in repo: no service-account JSON, no PEM fixture (Pitfall 18), and an empty `FIREBASE_SERVICE_ACCOUNT=` in `.env.example`.
- The backend is the source of truth. A push carries no game state (D-10).
- Edits go through the GSD workflow (`/gsd-execute-phase`).

## Summary

Every locked decision can be implemented as written, with **four factual corrections** the planner must apply.

1. **D-08 names error codes that do not exist.** firebase-admin returns `messaging/server-unavailable`, not `messaging/unavailable`. The quota code is `messaging/message-rate-exceeded` (plus `device-message-rate-exceeded` and `topics-message-rate-exceeded`). Auth and config failures surface as `messaging/third-party-auth-error`, `messaging/mismatched-credential` and `messaging/authentication-error`. Both 13.x and 14.x set `error.code = "messaging/<code>"`. 14.x renamed the exported enum (`MessagingClientErrorCode` became `MessagingErrorCode`), so compare **strings**, never the enum [VERIFIED: unpacked 13.10.0 / 14.5.0 sources].
2. **Pruning on `messaging/invalid-argument` is unsafe as stated.** Firebase's own token-management guide says `INVALID_ARGUMENT` "can also be returned in cases of issues in the message payload" and that you should delete a token only when "certain the payload is valid". A payload bug would therefore wipe every token in the batch. The fix is a witness rule: prune on `invalid-argument` only when at least one token in the same batch succeeded. Always prune on `registration-token-not-registered` and `invalid-registration-token`.
3. **firebase-admin 13.x manages topics through the legacy Instance ID API.** Requests go to `iid.googleapis.com/iid/v1:batchAdd`. Firebase states that "earlier versions of the Admin SDK won't be able to manage topic subscriptions after September 29, 2027". 14.5.0 (2026-09-23) "migrate[s] topic subscriptions to FCM v1 API".
4. **Node 18 and 20 are both end-of-life today.** Node 20 reached end of life on 2026-04-30, so any *supported* production runtime is ≥ 22.

The locked 13.10.0 still works today and for 11 more months. The code must be written so that moving to 14.x is a one-line `package.json` bump. Use modular imports and string codes, and avoid every API removed in 14 (verified by diffing the two packages' `messaging` and `app` typings).

The registry invariants are best enforced **by the database**: a unique `(userId, deviceId)` index, a unique `token` index, and a TTL index on `lastSeenAt`. The write is a "claim": first `deleteMany({ token, $nor: [{ userId, deviceId }] })`, then `findOneAndUpdate({ userId, deviceId }, { $set }, { upsert: true, returnDocument: 'before' })`, retried once on E11000. Measured on the replica-set harness, on both 8.0.4 and 8.2.6:
- 30 concurrent upserts of the same `(userId, deviceId)` give **1 row and 0 errors**, because MongoDB retries the duplicate-key upsert on the server.
- 200 trials of two users racing on the same token gave **1 row every time and both calls succeeded** with a single retry.
- The alternative, an upsert followed by `deleteMany({ token, _id: { $ne } })` without a unique token index, ended with **0 rows** under the same race: each writer deleted the other.

Keeping firebase-admin out of the tests needs no `jest.mock`. `PushTransport` is an abstract class used as the DI token. A `useFactory` provider builds `FcmPushTransport` only when the parsed config has credentials, and `NoopPushTransport` otherwise. `FcmPushTransport` takes a `Messaging`-shaped object in its constructor, so it can be unit-tested with a stub. Integration tests override the token with an in-memory `FakePushTransport` through `createAuthTestApp({ overrides })`.

`initializeApp` + `cert()` + `getMessaging()` run fully offline (verified), so even the factory can be unit-tested with a key generated at runtime. On a bad key, firebase-admin's own error messages carry no key material. `JSON.parse` errors, however, **echo a snippet of the input** (verified: `Unexpected token 'S', ..."ate_key": SECRETKEYM"...`). The config parser must therefore swallow every underlying message.

**Primary recommendation:** build `src/push/` as a leaf module with these parts:
- a pure catalog (`push-events.ts`) that produces a transport-agnostic `PushMessage`;
- a pure FCM serializer that takes `(message, now)` and returns `data` / `android` / `apns`;
- a Mongo `PushDeviceRegistry` with DB-enforced invariants and the claim + retry-once write;
- a `PushService` that chunks into batches of 500, classifies failures, prunes, reports and never throws;
- the `PushTransport` port with `FcmPushTransport` / `NoopPushTransport` / a test `FakePushTransport`;
- `parsePushConfig` wired into `validateEnv`;
- one resolver with the three mutations.

**Orchestrator addendum (2026-10-18, after this research):** CONTEXT D-05 was revised to **`firebase-admin@^14.5.0`** on the strength of findings 3 and 4 above (IID topic API removal on 2027-09-29; Node 18/20 EOL so any supported production runtime is ≥ 22; CI on Node 22). Every `^13.10.0` mention below is superseded: install `firebase-admin@^14.5.0`, add `"engines": { "node": ">=22" }` to `package.json`, and note in BACKEND-NOTES that a downgrade to `^13.10.0` is a one-line change if the host turns out to run an EOL Node 20. The code recommended in this document uses only APIs identical in both lines.

## Answers to the research questions

### Q1 — firebase-admin 13.x vs 14.x, imports, initialization, service-account validation — HIGH

**Versions** [VERIFIED: npm registry, 2026-10-18]:
- `latest` is `14.5.0` (2026-09-23), with `engines.node ">=22"`.
- The latest 13.x is **`13.10.0`** (2026-05-14), with `engines.node ">=18"`.
- 13.10.0 runtime dependencies: `google-auth-library ^10.6.1`, `jsonwebtoken`, `jwks-rsa`, `@fastify/busboy`, `farmhash-modern`, `fast-deep-equal`, `@firebase/database-*`. Optional dependencies: `@google-cloud/firestore` and `@google-cloud/storage`. These are optional and are not required for messaging.

**Messaging API diff, 13.10.0 → 14.5.0** [VERIFIED: diff of `lib/messaging/*.d.ts` and `lib/app/index.d.ts` from both tarballs]:

| Surface | 13.10.0 | 14.5.0 | Impact for us |
|---|---|---|---|
| `getMessaging(app?)` | ✓ | ✓ | identical |
| `sendEachForMulticast(MulticastMessage, dryRun?)` | ✓ | ✓, plus an overload for `FidMulticastMessage` | identical for tokens |
| `send(Message)`, with `TopicMessage { topic }` | ✓ | ✓ (`Message` gains `FidMessage`) | identical |
| `subscribeToTopic` / `unsubscribeFromTopic` | legacy IID `iid.googleapis.com/iid/v1:batchAdd` / `:batchRemove` | **FCM v1** `/v1/projects/{p}/registrations/{token}/topicSubscriptions` (v14.5.0 "migrate topic subscriptions to FCM v1 API"). The legacy calls survive as `*Legacy` (deprecated). | same signature, different backend |
| Error class / codes | `FirebaseMessagingError` (from `utils/error`), `MessagingClientErrorCode` | `FirebaseMessagingError` (from `messaging/error`), **`MessagingErrorCode`** (renamed) | **compare `error.code` strings**: both produce `"messaging/<code>"` |
| Legacy types (`MessagingPayload`, `DataMessagePayload`, …) | exported | **removed** ("Drop legacy messaging types") | do not import them |
| `firebase-admin/app` exports `initializeApp, getApp, getApps, deleteApp, cert, ServiceAccount` | ✓ | ✓ | identical |

**Modular imports** compile under this repo's `module: nodenext` / `resolvePackageJsonExports` and CJS output. The package `exports` map has `require` conditions for `./app` and `./messaging` [VERIFIED: compiled and ran in the scratchpad with an identical tsconfig].
```ts
import { cert, deleteApp, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getMessaging, type Messaging, type MulticastMessage, type TopicMessage, type BatchResponse } from 'firebase-admin/messaging';
```
Do **not** use the namespace import `import * as admin from 'firebase-admin'`. 14.0.0 removed "Deprecated Legacy Namespace Support" [CITED: github.com/firebase/firebase-admin-node/releases].

**Initialize once** with a **named** app (`'klimmeck-push'`) and reuse it through `getApps()`. A second `initializeApp(..., 'klimmeck-push')` throws `app/invalid-app-options` [VERIFIED: offline probe]. `initializeApp({ credential: cert({...}) })` and `getMessaging(app)` make **no network call**. Access tokens are fetched lazily at the first send [VERIFIED: offline probe].

**Service-account JSON.** `cert()` accepts `{ project_id, client_email, private_key }` or the camelCase equivalents. It rejects a missing or empty one with `app/invalid-credential` "Service account object must contain a string "project_id" property." Since 13.10.0 it validates the key with native `crypto.createPrivateKey` ("fix: Replace node-forge with native crypto for private key validation"). For a bad key the message is `Failed to parse private key: Error: error:1E08010C:DECODER routines::unsupported`, and it **does not echo the key** [VERIFIED: probe]. Our parser still re-validates the three fields and the PEM (`createPrivateKey`) at `validateEnv` time and throws **its own** generic messages (Code Example §1). The boot then fails before any provider is built, and no third-party message ever reaches a log.

### Q2 — Per-token error codes, pruning set, 500 limit, throw vs return — HIGH

- `sendEachForMulticast` **throws synchronously** (not a rejected promise) when `tokens` is empty, has more than 500 entries, or the message is not an object: `messaging/invalid-argument` "tokens list must not contain more than 500 items" [VERIFIED: probe and source `FCM_MAX_BATCH_SIZE = 500`]. Never call it with zero tokens. Chunk into batches of 500 or fewer. Call it inside `try` (an `await` in a `try` block catches synchronous throws too, because the call expression is evaluated inside the block).
- Otherwise it **resolves** a `BatchResponse { responses: SendResponse[], successCount, failureCount }`, where `responses[i]` matches `tokens[i]` and has `{ success: true, messageId }` or `{ success: false, error: FirebaseMessagingError }`. Client-side validation errors (e.g. a non-string `data` value) are raised per message inside the async map, so they come back as **per-token** failures (`messaging/invalid-payload`), not as a throw [VERIFIED: `messaging.js` `sendEach` → `Promise.allSettled` → `parseSendResponses`].
- Whole-call rejections still happen. An HTTP/2 session failure rejects with `FirebaseMessagingSessionError`, and a project-id lookup failure also rejects. `PushService` must catch everything (D-08).
- **Built-in retries:** each request has a 15 s timeout (`FIREBASE_MESSAGING_TIMEOUT = 15000`). The default retry policy is `maxRetries: 4` on HTTP 503 / `ECONNRESET` / `ETIMEDOUT`, with exponential backoff (`backOffFactor 0.5`) and `Retry-After` honoured up to 60 s [VERIFIED: `utils/api-request.js defaultRetryConfig`]. A synchronous `await` can therefore take **tens of seconds** in the worst case (see Pitfall 7).
- **Server-to-client code mapping** (13.10.0 `MESSAGING_SERVER_TO_CLIENT_CODE`; 14.5.0 has the same strings) [VERIFIED: source]:

| FCM v1 server code | `error.code` | Action |
|---|---|---|
| `UNREGISTERED`, `NOT_FOUND` (404) | `messaging/registration-token-not-registered` | **prune** + INFO |
| legacy `InvalidRegistration` | `messaging/invalid-registration-token` | **prune** + INFO |
| `INVALID_ARGUMENT` (400) | `messaging/invalid-argument` | prune **only if ≥ 1 token in the same batch succeeded** (payload witness); otherwise ERROR "payload probably invalid", no prune |
| `SENDER_ID_MISMATCH`, `PERMISSION_DENIED` | `messaging/mismatched-credential` | WARN (wrong Firebase project: see the D-06 same-project checklist), no prune |
| `THIRD_PARTY_AUTH_ERROR`, `APNS_AUTH_ERROR`, `UNAUTHENTICATED` | `messaging/third-party-auth-error` | WARN (APNs key not uploaded to the Firebase console), no prune |
| `QUOTA_EXCEEDED`, `RESOURCE_EXHAUSTED` | `messaging/message-rate-exceeded` (also `device-message-rate-exceeded`, `topics-message-rate-exceeded`) | WARN, no retry |
| `UNAVAILABLE` | `messaging/server-unavailable` | WARN (the SDK already retried) |
| `INTERNAL` | `messaging/internal-error` | WARN |
| client-side validation | `messaging/invalid-payload`, `messaging/invalid-data-payload-key`, `messaging/payload-size-limit-exceeded` | ERROR (our bug), no prune |
| anything else | `messaging/unknown-error` | WARN |

Firebase's guidance [CITED: firebase.google.com/docs/cloud-messaging/manage-tokens]: "`UNREGISTERED` (HTTP 404) and `INVALID_ARGUMENT` (HTTP 400) indicate a targeted registration may be invalid … `INVALID_ARGUMENT` can also be returned in cases of issues in the message payload … delete the registration only when certain the payload is valid". Android registrations inactive for 270 days are garbage-collected by FCM (iOS has no inactivity expiry). Both points justify the D-01 TTL.

- **Topic management** (`subscribeToTopic` / `unsubscribeFromTopic`): accepts up to **1,000** tokens per call [CITED: firebase.google.com/docs/cloud-messaging/manage-topic-subscriptions]. It **resolves** with `MessagingTopicManagementResponse { successCount, failureCount, errors: [{ index, error }] }`, so per-token failures **do not throw** and must be inspected and logged. Whole-request failures reject [VERIFIED: 13.10.0 `mapRawResponseToTopicManagementResponse`]. Topic names must match `^[a-zA-Z0-9-_.~%]+$`, and `streamer-live` is valid [VERIFIED: `validateMessage`].

### Q3 — Data-only message shape (Android + APNs background) — HIGH

firebase-admin typings [VERIFIED: 13.10.0 `messaging-api.d.ts` and `messaging-internal.js`]:
- `data`: `{ [key: string]: string }`. **Every value must be a string.** `undefined` or a number makes the message fail per token with `messaging/invalid-payload`, so omit absent keys (Pitfall 3). The SDK rejects the key `from`. Firebase also reserves `google.*` / `gcm.*` and `message_type` / `collapse_key` [ASSUMED from FCM docs; our keys `type`, `id`, `title`, `body`, `sentAt` avoid all of them].
- `android: AndroidConfig`: `priority?: 'high' | 'normal'`. `ttl?: number` is **milliseconds**; the SDK converts it to `"3600s"` and rejects a negative or non-number value. Normal is "the default priority for data and notification messages". High-priority messages that do not produce a user-visible notification "may be deprioritized to normal priority", based on 7 days of behaviour [CITED: firebase.google.com/docs/cloud-messaging/android/message-priority].
- `apns: ApnsConfig`: `headers?: { [k]: string }` (**string values only**) and `payload?: { aps: Aps, ...custom }`. `Aps.contentAvailable?: boolean`. The SDK renames it to `content-available` and normalizes `true` → `1`. Setting both spellings throws "Multiple specifications".
- Apple [CITED: developer.apple.com/documentation/usernotifications/pushing-background-updates-to-your-app and …/sending-notification-requests-to-apns, fetched via Apple's JSON doc API]:
  - "create a remote notification with an `aps` dictionary that includes only the `content-available` key … the `aps` dictionary must not contain any keys that would trigger user interactions".
  - "the `apns-push-type` header field with a value of `background`, and the `apns-priority` field with a value of `5`".
  - For the `background` push type: "**Always use priority `5`. Using priority `10` is an error.**"
  - "The system treats background notifications as low priority … doesn't guarantee their delivery … may throttle … **don't try to send more than two or three per hour**."
  - "When the system receives a new background notification, it discards the older notification and only holds the newest one. **If something force quits or kills the app, the system discards the held notification.** If the user launches the app, the system immediately delivers the held notification."
  - `apns-expiration`: "a UNIX epoch expressed in seconds (UTC) … If the value is `0`, APNs attempts to deliver the notification only once and doesn't store it". APNs stores at most one notification per bundle ID and keeps it for 30 days or less. It is an **absolute** time, so it must be computed from `now` at send time.
- The result is the shape in Code Example §4. With a `notification` block (handoff contrast only, deferred), FCM/the OS would display the banner itself when the app is in background or killed (the iOS `alert` push type, priority 10 allowed). The FE background handler would **not** run before display on iOS, so the device-side toggles could not suppress it. That is exactly why D-10 chose data-only.

### Q4 — Registry invariants on Mongoose 8 — HIGH (empirical, mongod 8.0.4 + 8.2.6)

A throwaway int-spec (deleted, `git status` clean) ran on the shared `MongoMemoryReplSet`:

| Case | Setup | Result (8.0.4 and 8.2.6) |
|---|---|---|
| 1 | 30 concurrent `findOneAndUpdate({ userId, deviceId }, { $set: { token: t_i, … } }, { upsert: true })` | **1 row, 0 errors**. The server retries a duplicate-key upsert whose filter is an equality on the unique index keys (MongoDB ≥ 4.2 behaviour) |
| 2 | 30 concurrent upserts, same device, same token | 1 row, 0 errors |
| 3 | plain upsert by another user with an existing token | `E11000`, `keyPattern: { token: 1 }` (also under `errorResponse.keyPattern`), **not** retried by the server |
| 4 | **claim** (pre-delete other holders → upsert, retry once on 11000), 2 users racing on one token, 200 trials | **200/200: both calls `ok`, exactly 1 row**. With 10 users racing on one token, a 3-attempt budget left most callers "exhausted", but the invariant still held (1 row). Not a realistic load (a token moves only when a human switches account). |
| 5 | option (a): upsert, then `deleteMany({ token, _id: { $ne: own } })`, **no** unique token index, 10 users | **0 rows**. Each writer deleted the others, so the registration was lost |

Decision: **option (b)**, a unique index on `token` plus the claim sequence and one retry. Option (a) satisfies "at most one row" only by sometimes leaving **zero**, which breaks idempotent registration (c).

Index declaration with `@Schema` / `SchemaFactory` follows the existing `SessionSchema` / `AdminAuditLogSchema` pattern. The probe printed `{"key":{"lastSeenAt":1},"expireAfterSeconds":23328000}` for `270 * 24 * 3600`.

- `userId` **must** be `@Prop({ type: MongooseSchema.Types.ObjectId, required: true })`. `Types.ObjectId` turns into `Mixed` with no casting (STATE.md Phase 02 decision; 04 Pitfall 1).
- Autoindex runs at model compile. Concurrency integration tests must `await connection.model(PushDevice.name).init()` in `beforeAll` (03.1 / 04 Pitfall 9).
- Boot-time index verification precedent: `TwitchIdIndexVerifier` and `CharacterNameIndexVerifier` are `OnApplicationBootstrap` providers. Each calls `model.createIndexes()` and logs ERROR without blocking the boot. Add a small `PushDeviceIndexVerifier` with the same shape (see Open Question 8).

### Q5 — Keeping firebase-admin out of tests — HIGH

- An abstract class used as a token (`export abstract class PushTransport`) is the established pattern in this repo (`Clock`, `TwitchOAuthClient`).
- The factory provider is `{ provide: PushTransport, inject: [PUSH_CONFIG], useFactory: (c) => c.serviceAccount ? FcmPushTransport.connect(c.serviceAccount) : new NoopPushTransport() }`.
- `createAuthTestApp` applies `overrideProvider(token).useValue(value)` for each `overrides` entry. An overridden factory **never runs**, so `initializeApp` is never called. Also override `PUSH_CONFIG` with `{ serviceAccount: null }`, so the test does not depend on the developer's shell env.
- `FcmPushTransport` takes a `Messaging`-shaped dependency in its constructor. Unit tests pass `{ sendEachForMulticast: jest.fn(), send: jest.fn(), subscribeToTopic: jest.fn(), unsubscribeFromTopic: jest.fn() } as unknown as Messaging`. **No `jest.mock('firebase-admin/...')` anywhere.**
- `FcmPushTransport.connect(serviceAccount)` (`initializeApp` + `cert` + `getMessaging`) can itself be unit-tested offline. Use a key generated in the spec with `generateKeyPairSync('rsa', { modulusLength: 2048 })`, assert idempotence (a second `connect` reuses the app), then `deleteApp` in `afterAll` [VERIFIED: offline probe].
- The real-boot `test/app.int-spec.ts` loads `fcm-push-transport.ts` (and so firebase-admin) without network. With `FIREBASE_SERVICE_ACCOUNT: ''` in its env the factory picks `NoopPushTransport`.

### Q6 — Config shape — HIGH

`auth-config.ts` exposes the pattern to mirror. The pieces and their push counterparts:

| Auth config | Push config (to add) |
|---|---|
| `AUTH_CONFIG` token | `PUSH_CONFIG` |
| `AUTH_ENV_KEYS` (includes `NODE_ENV`) | `PUSH_ENV_KEYS = ['NODE_ENV', 'FIREBASE_SERVICE_ACCOUNT']` |
| `readAuthEnv(source)` (scalar-only copy) | `readPushEnv` |
| `parseAuthConfig(env)` (pure, throws `Error` with field-name-only messages) | `parsePushConfig` |
| `authConfigProvider: FactoryProvider` reading through `ConfigService` | `pushConfigProvider` |
| `validateEnv` calls `parseAuthConfig(readAuthEnv(env))` | add `parsePushConfig(readPushEnv(env))` in the same function |

`NODE_ENV === 'production'` is already the production test (`parseDevAuthConfig`). Jest sets `NODE_ENV=test` when it is unset [ASSUMED, standard Jest behaviour; the existing suites rely on it].

The `.env.example` suite (`env.validation.spec.ts`) parses the file and asserts every auth key exists. Extend it to `FIREBASE_SERVICE_ACCOUNT` (present and empty), and keep the "passes validateEnv" case green: `.env.example` has `NODE_ENV=development`, so a missing value means "disabled".

### Q7 — Admin mutation, audit row, NOT_FOUND — HIGH

`@Roles(RoleType.innkeeper)` applies `RolesGuard` at method level, which throws `AuthorizationException.innkeeperOnly()` (`FORBIDDEN`, "Operazione riservata al locandiere"). The global `AdminAuditInterceptor` (registered as `APP_INTERCEPTOR` **inside `AuthzModule`**) records every **Mutation** whose handler carries `ROLES_KEY` including innkeeper. A rejected attempt writes no record, because the guards run first.

For `sendTestPush(input: …)`:
- `action: 'sendTestPush'`
- `target: { type: getNamedType(info.returnType).name, id: typeof args.id === 'string' ? args.id : null }`, which gives **`{ type: 'PushDeliveryReport', id: null }`**. `id` is nested in `input`, not a top-level arg.
- `args: { input: { type, targetUserId?, id? } }`, with no secrets.
- `outcome: 'ok'` or the error's `extensions.code` (e.g. `PUSH_DISABLED`, `NOT_FOUND`).

The test pattern is in `src/authz/audit/admin-audit.int-spec.ts` (the file is under `src/`, not `test/authz/`): `audits.find().lean()` plus `toMatchObject({ actor, action, target, args, outcome })`.

**`createAuthTestApp` does not import `AuthzModule`.** The audit test must use `createCharactersTestApp` (which imports it) or pass `imports: [AuthzModule, PushModule]`.

`ResourceNotFoundException.user()` gives `NOT_FOUND` "Utente non trovato". The same `isObjectIdHex` → `exists` guard as `UsersService.findOne` covers both "malformed" and "missing". Do it locally in `PushModule` with a `User` model, instead of importing `UsersModule`. That keeps `PushModule` a leaf: no `UserUpdatesPublisher` change stream and no `TwitchIdIndexVerifier` dragged into every Phase 6/8/9 consumer.

### Q8 — Schema regeneration and enums — HIGH

`test/app.int-spec.ts` boots the real `AppModule` (`autoSchemaFile: join(cwd, 'src/schema.gql')`, `sortSchema: true`) with process env set **before** the import, so it wins over `.env` (Pitfall 8 there). It then asserts schema strings plus three handler whitelists. **`EXPECTED_INNKEEPER_HANDLERS` must gain `'<ResolverClass>.sendTestPush'`**, otherwise the existing test fails. The CI step `git diff --exit-code src/schema.gql` catches drift. `createGraphQLOptions(authenticator, true)` in the test harness builds the schema **in memory** (`autoSchemaFile: true`), so integration tests never touch `src/schema.gql`.

Enums are registered with `registerEnumType(X, { name: 'X' })` next to the enum (e.g. `role-type.enum.ts`). Values are lowercase and camelCase (`android`, `ios`, `travelEnd`, `questEnd`, `streamerLive`), which matches D-02 and D-10.

### Q9 — Typed exceptions — HIGH

The established pattern is `CharacterDeletionException` / `CharacterCreationException` / `GameRuleException`:
- `extends <NestException>`
- `readonly code` and `readonly extensions = { code }`
- a private constructor `super({ statusCode, error, message, code })`
- static factories with Italian messages
- an `<x>-error-code.enum.ts` whose values equal their names, plus a spec asserting `Object.entries(enum)`.

`formatDomainError` passes through **any** `HttpException` carrying `extensions.code: string`, so no change is needed there. Place `src/push/push-error-code.enum.ts` (`PUSH_INVALID_DEVICE_ID`, `PUSH_INVALID_TOKEN`, `PUSH_DISABLED`) and `src/push/push.exception.ts` in the feature folder. Push is infrastructure, not a game rule, so do not use `GameRuleErrorCode`.

The base class is `HttpException` with the status per factory: 400 for the two input codes and 503 `Service Unavailable` for `PUSH_DISABLED`. The status is invisible on the GraphQL wire, but it keeps the semantics honest. The audit's `outcomeCodeOf` reads `extensions.code` first, so it records `PUSH_DISABLED`.

### Q10 — Production Node runtime — LOW (unconfirmable from the repo)

The repo has no `Dockerfile`, `.nvmrc`, `engines` field or deploy doc. `docker-compose.yml` only runs Redis. CI uses `node-version: 22`, and local is `v22.12.0` [VERIFIED: repo scan, `node --version`]. Node 18 reached end of life on 2025-04-30 and **Node 20 on 2026-04-30** [VERIFIED: nodejs/Release schedule.json]. A supported production runtime is therefore necessarily ≥ 22, but the actual host is **not confirmed**. Decision (CONTEXT D-05 revised after this research): **`firebase-admin@^14.5.0`** with `engines.node >= 22` declared in `package.json`; see Open Question 1.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `firebase-admin` | `^14.5.0` (14.5.0, published 2026-09-23, `engines.node >=22`; superseded `^13.10.0` per revised D-05) | FCM HTTP v1 send, multicast, topic management | Google's first-party server SDK; handles OAuth2 service-account token minting, HTTP/2, retries [VERIFIED: npm registry] |
| `mongoose` / `@nestjs/mongoose` | 8.18.1 / 11.0.3 (installed) | `push_devices` registry with unique and TTL indexes | already in use |
| `@nestjs/graphql` + Apollo | 13.2.0 (installed) | 3 mutations, 2 inputs, 2 enums, 1 object type | already in use |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `node:crypto` (`createPrivateKey`, `generateKeyPairSync`) | Node 22 built-in | PEM validation in `parsePushConfig`; test keys generated at runtime | config parsing and specs only |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `firebase-admin@13.10.0` | `firebase-admin@14.5.0` | Uses the FCM v1 topic API (needed after 2027-09-29) and the newer error types, but needs Node ≥ 22. Allowed by D-05 only once the production runtime is confirmed ≥ 22. The code below works unchanged on both. |
| firebase-admin | raw FCM v1 REST + `google-auth-library` | Re-implements service-account JWT minting, HTTP/2 pooling and retries. Not worth it (STACK.md). |
| Unique index on `token` + claim | upsert + `deleteMany({ token, _id: $ne })` | Verified to lose **both** registrations under a race (0 rows) |

**Installation:**
```bash
npm install firebase-admin@^14.5.0
```
Afterwards, check that `package-lock.json` changed (the repo is npm-locked despite the `packageManager: yarn` field; CI runs `npm ci`) and that `npm run build` passes.

## Architecture Patterns

### Recommended Project Structure
```
src/config/
├── push-config.ts                 # PUSH_CONFIG, PUSH_ENV_KEYS, readPushEnv, parsePushConfig, pushConfigProvider
└── env.validation.ts              # + parsePushConfig(readPushEnv(env))
src/push/
├── push.module.ts                 # leaf module, exports PushService (not @Global; consumers import it)
├── push-platform.enum.ts          # enum PushPlatform { android, ios } + registerEnumType
├── push-event-type.enum.ts        # enum PushEventType { travelEnd, questEnd, streamerLive } + registerEnumType
├── push-message.ts                # PushMessage (transport-agnostic), STREAMER_LIVE_TOPIC
├── push-events.ts                 # pure catalog: travelEnd(characterId), questEnd(pendingQuestId), streamerLive()
├── push-delivery.ts               # PushDeliveryOutcome types, classifyDeliveryFailure(code), chunk(), report helpers (pure)
├── push-device.model.ts           # Mongoose-only schema (no @ObjectType), indexes
├── push-device.registry.ts        # claim/unregister/tokensOf/removeTokens (Mongo)
├── push-device-index.verifier.ts  # OnApplicationBootstrap createIndexes + ERROR log
├── push-device-input.validator.ts # pure D-02 validation → PushException
├── push.service.ts                # registerDevice, unregisterDevice, sendToUser, broadcast, sendTest
├── push.resolver.ts               # registerPushDevice, unregisterPushDevice, sendTestPush
├── push-startup.reporter.ts       # WARN when disabled, LOG project_id when enabled
├── push-error-code.enum.ts
├── push.exception.ts
├── dto/
│   ├── register-push-device.input.ts
│   ├── send-test-push.input.ts
│   └── push-delivery-report.model.ts
└── transport/
    ├── push-transport.ts          # abstract class (DI token) + outcome types
    ├── noop-push-transport.ts
    ├── fcm-push-transport.ts      # wraps Messaging; static connect(serviceAccount)
    ├── fcm-message.ts             # pure: toFcmBase(message, now) → data/android/apns
    └── push-transport.provider.ts # useFactory(PUSH_CONFIG)
test/push/
└── fake-push-transport.ts         # in-memory fake: records calls, scripted per-token outcomes, `enabled` flag
```

### Pattern 1: Port with per-token outcomes; batching and classification in the service
**What:** the transport is thin and FCM-specific (it maps `BatchResponse` to `TokenDeliveryOutcome[]` by index). `PushService` owns everything testable without firebase: 500-chunking, failure classification, the invalid-argument witness rule, pruning, the report, never-throw, and logging.
**When:** always. This resolves the D-07 vs D-16 tension: D-07 puts batching "in FcmPushTransport", while D-16 wants "batch da 500" unit-tested with a fake. The transport contract becomes "≤ 500 tokens per call" and is enforced by an `FCM_MULTICAST_LIMIT` constant. `FcmPushTransport` still calls `sendEachForMulticast` once per batch it receives.

### Pattern 2: Pure validators and builders, Mongo at the edge
`validateRegisterPushDeviceInput(input)` throws `PushException`, checks in the order deviceId → token, and has no I/O. The catalog builders and the FCM serializer are pure and take an injected `now: Date` (use the repo's `Clock` abstraction; `PushModule` provides `{ provide: Clock, useClass: SystemClock }` exactly as `AuthModule` does, because `Clock` is not exported from `AuthModule`).

### Pattern 3: Registration flow (service)
1. Validate the input (pure).
2. **(Recommended)** Reject a valid bearer whose `User` no longer exists with `AuthException.unauthenticated()`. This is the deletion-module precedent (`rejectUnlinked`) and avoids orphan rows.
3. `registry.claim(...)`, which returns the previous token of that `(userId, deviceId)` row or `null`.
4. Best-effort `transport.subscribeToTopic([token], 'streamer-live')`. Resubscribe on every registration (idempotent, heals earlier failures; Firebase recommends resubscribing when the registration changes). If `previousToken && previousToken !== token`, also call best-effort `unsubscribeFromTopic([previousToken])`.
5. Return `true`.

Topic errors are logged and never surface.

### Pattern 4: `sendTestPush` order of checks
1. `RolesGuard` (`FORBIDDEN`).
2. `transport.enabled === false` → `PushException.disabled()` (`PUSH_DISABLED`). This check is environmental and independent of input.
3. For `streamerLive`: `broadcast(streamerLive())`, ignoring `targetUserId` without validating it.
4. Otherwise, resolve the target as `targetUserId ?? identity.userId`. Use `isObjectIdHex` + `userModel.exists`, else `ResourceNotFoundException.user()`.
5. `sendToUser(target, builder(id))`.
6. Return the report.

**Report semantics:**
- `sendToUser`: `targeted` is the number of tokens, `sent` the per-token successes, `pruned` the rows removed, `failed` is `targeted − sent`.
- `broadcast`: one topic send, so `{ targeted: 1, sent: 1|0, failed: 0|1, pruned: 0 }`.
- A user with no devices gets `{0,0,0,0}` and the transport is not called.

### Anti-Patterns to Avoid
- **Importing `MessagingClientErrorCode`, `admin.messaging()` or legacy payload types.** They are renamed or removed in 14.x. Compare `error.code` strings.
- **Calling `PushService` inside a `connection.transaction` callback.** The callback is re-run on write conflicts (04 Pitfall 6), so the push would be sent twice. It also holds the transaction open across a send that can take 15 s or more. Always call after commit (ARCHITECTURE.md: "Only push non-authoritative signals (FCM ID) after `await session commit`").
- **Putting `token` on `User` or any `@ObjectType`** (D-01).
- **Logging tokens in full.** Log a suffix only (`…${token.slice(-6)}`).
- **`@Global()` on `PushModule`.** The explicit import keeps the dependency visible (Phase 6/8/9 modules `imports: [PushModule]`) and lets tests compose it. `PubSubModule` is global because every resolver needs it; push is used by three domain modules.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| OAuth2 access tokens for FCM v1 | JWT signing + token cache | `firebase-admin` `cert()` credential | key rotation, clock skew, caching, HTTP/2 |
| Retry on 503 / `ECONNRESET` | custom loop | firebase-admin built-in (4 retries, backoff, `Retry-After`) | already there; a second loop would multiply latency |
| "One row per device / token" | read-then-write in JS | unique indexes + claim + retry once | verified race-safe; JS checks lose under concurrency (case 5) |
| Token expiry | cron job | Mongo TTL index (`expireAfterSeconds: 23_328_000`) | the monitor runs about every 60 s |
| PEM validation | regex on `-----BEGIN` | `crypto.createPrivateKey` | the same check firebase-admin 13.10 performs |
| Audit of `sendTestPush` | manual `auditLog.record` | `@Roles(innkeeper)` → global `AdminAuditInterceptor` | Phase 3 convention; zero code |

**Key insight:** the only FCM-specific code is the `Messaging` adapter (about 60 lines) and one `connect()`. Everything that decides behaviour is pure or Mongo, so it is testable on the existing harness.

## Common Pitfalls

### Pitfall 1: secrets leaking through error messages
**What goes wrong:** `JSON.parse` on Node 22 echoes input (`Unexpected token 'S', ..."ate_key": SECRETKEYM"... is not valid JSON` [VERIFIED]). Forwarding `error.message` from the parser, from `cert()` or from `createPrivateKey` into a thrown boot error prints key material in deploy logs.
**How to avoid:** use `try { … } catch { throw new Error('FIREBASE_SERVICE_ACCOUNT …') }` with **fixed** messages that name only the variable and the field. Unit tests assert that messages contain neither the base64 value nor any substring of the key.
**Warning signs:** a test snapshot containing `BEGIN PRIVATE KEY`.

### Pitfall 2: `Buffer.from(x, 'base64')` never throws
**What goes wrong:** garbage decodes to garbage (`"not base64 !!!"` decodes to `"��[jǺ"`), and the error surfaces later as a confusing JSON error.
**How to avoid:** strip whitespace (allows `base64` output wrapped at 76 columns), then require `^[A-Za-z0-9+/]+={0,2}$` and `length % 4 === 0`, or throw "must be the base64 encoding of the service account JSON". Document the generator for each OS in `.env.example`: macOS `base64 -i service-account.json | tr -d '\n'`, Linux `base64 -w0 service-account.json`.

### Pitfall 3: non-string or `undefined` values in `data`
**What goes wrong:** `{ id: undefined }` or a number fails **every token** with `messaging/invalid-payload` (per-token, not a throw).
**How to avoid:** the serializer adds `id` only when it is a non-empty string, and `sentAt = now.toISOString()`. A unit test asserts `Object.values(data).every(v => typeof v === 'string')` and the exact key set `type, title, body, sentAt[, id]`.

### Pitfall 4: mass pruning on `messaging/invalid-argument`
**What goes wrong:** a payload bug (or an oversized `id` from `sendTestPush`) returns `invalid-argument` for **all** tokens. D-08 as written would delete the whole registry for that user, or for every user in a broadcast loop.
**How to avoid:** apply the witness rule. Prune `invalid-argument` tokens only if the same batch has ≥ 1 success; otherwise log ERROR once and prune nothing. Always prune `registration-token-not-registered` and `invalid-registration-token`. Unit-test both branches with the fake.

### Pitfall 5: D-08 error-code names that do not exist
**What goes wrong:** matching `messaging/unavailable` never fires. The real codes are `messaging/server-unavailable`, `messaging/message-rate-exceeded`, `messaging/internal-error`, … (Q2 table). `MessagingClientErrorCode` is renamed in 14.x.
**How to avoid:** one string constant table in `push-delivery.ts` (`PRUNE_ALWAYS`, `PRUNE_WITH_WITNESS`), derived from the Q2 table, with the classification unit-tested.

### Pitfall 6: synchronous throw at 0 or more than 500 tokens
**What goes wrong:** `sendEachForMulticast({ tokens: [] })` throws synchronously (verified), and so does a batch of 501.
**How to avoid:** `PushService` returns early for zero tokens and chunks into batches of 500 (unit test: 1,001 tokens → 3 transport calls of 500/500/1). `FcmPushTransport` wraps every call in `try` and returns all-failed outcomes with code `transport-error` when the whole call rejects.

### Pitfall 7: push latency and side effects inside domain flows
**What goes wrong:** a 15 s timeout × up to 4 retries with backoff and `Retry-After` up to 60 s means a synchronous `await` (D-08) can block a Phase 8/9 completion for tens of seconds. Inside a transaction callback it would also be re-sent on retry.
**How to avoid:** in the BACKEND-NOTES "Note per BE Phase 6/8/9", call `PushService` **after** the commit and never inside `connection.transaction(...)`. Await it, because it never throws, but outside any lock or transaction. The Bull queue remains the deferred extension.

### Pitfall 8: `@Prop({ type: Types.ObjectId })` is `Mixed`
**What goes wrong:** the `userId` filter silently matches nothing when given a string, and a string id is stored as String.
**How to avoid:** use `MongooseSchema.Types.ObjectId` (the `session.model.ts` pattern) and convert with `new Types.ObjectId(identity.userId)` at the service edge. An integration test asserts that the raw BSON `userId` is an `ObjectId`.

### Pitfall 9: indexes not yet built in concurrency tests
**What goes wrong:** the unique indexes are created asynchronously at model compile, so the first concurrent registers produce duplicates.
**How to avoid:** `await harness.connection.model(PushDevice.name).init()` in `beforeAll`. `clearDatabase()` keeps the indexes, because it uses `deleteMany`, not drop.

### Pitfall 10: option (a) loses registrations
**What goes wrong:** verified 0 rows after a two-user race on the same token.
**How to avoid:** use the unique `token` index + claim + retry once (Code Example §2). The D-16 integration case "stesso token da un altro utente → la riga precedente sparisce" plus a **concurrent** two-user variant asserting exactly 1 row.

### Pitfall 11: the real-boot test silently enables FCM, or fails on a whitelist
**What goes wrong:**
- A developer `.env` with `FIREBASE_SERVICE_ACCOUNT` makes `test/app.int-spec.ts` initialize a real Firebase app. `ConfigModule` reads `.env` there; process env wins only for keys that are set.
- The new `@Roles` handler breaks `EXPECTED_INNKEEPER_HANDLERS`.
**How to avoid:** add `FIREBASE_SERVICE_ACCOUNT: ''` to the `Object.assign(process.env, …)` block (same trick as `TWITCH_CLIENT_ID: ''`). Add `'<PushResolverClass>.sendTestPush'` to the whitelist. Add schema assertions for the D-14 surface and a negative assertion that `token`, `PushDevice` and `deviceId` do not appear in the `User` type.

### Pitfall 12: wrong expectation for the audit target
**What goes wrong:** a test expecting `target.id === targetUserId` fails, because the interceptor only reads a **top-level** `args.id`.
**How to avoid:** assert `target: { type: 'PushDeliveryReport', id: null }`, `args: { input: { type: 'travelEnd', targetUserId } }` and `outcome: 'ok'` (or `'PUSH_DISABLED'` / `'NOT_FOUND'`). A rejected `adventurer` call writes **no** record.

### Pitfall 13: audit test without `AuthzModule`
**What goes wrong:** `createAuthTestApp({ imports: [PushModule] })` has no `APP_INTERCEPTOR`, so no audit row is ever written and the test fails confusingly.
**How to avoid:** use `createCharactersTestApp({ imports: [PushModule], overrides })`, which imports `AuthzModule`, or pass `imports: [AuthzModule, PushModule]`.

### Pitfall 14: double `initializeApp`
**What goes wrong:** `app/invalid-app-options` when the factory runs twice in one process (e.g. two Nest apps in one Jest file with real credentials).
**How to avoid:** `connect()` reuses `getApps().find(a => a.name === FCM_APP_NAME)`. Optionally `deleteApp` on shutdown (A1).

### Pitfall 15: iOS and Android delivery caveats (handoff, not code)
**What goes wrong:**
- APNs background: priority 10 is an **error**; delivery is throttled ("two or three per hour"); only the newest held push is kept; **force-quit discards it**.
- Android: high-priority data messages that do not show a notification may be deprioritized to normal after 7 days of that pattern. FE toggles that drop messages contribute to that pattern.
**How to avoid:** set exactly `apns-priority: '5'` and `apns-push-type: 'background'`, with no `alert`/`sound`/`badge` in `aps`. Write the D-15 caveat verbatim into BACKEND-NOTES. The FE "app killed" E2E on iOS must be run **without** force-quitting from the app switcher (or accepted as best-effort).

### Pitfall 16: wrong units for expiry
**What goes wrong:** `android.ttl` is **milliseconds** (the SDK converts it to `"3600s"`). `apns-expiration` is an **absolute UNIX time in seconds**, as a string header. A relative value like `'3600'` means 1970 and makes APNs drop the push.
**How to avoid:** `apnsExpiration = String(Math.floor(now.getTime() / 1000) + ttlSeconds)`, unit-tested with a fixed `now`.

### Pitfall 17: 13.x topic management stops on 2027-09-29
**What goes wrong:** the legacy Instance ID API is removed on that date. On 13.x, `subscribeToTopic` then fails, and `streamer-live` reaches no newly registered device.
**How to avoid:** the upgrade trigger in Open Question 1, recorded in BACKEND-NOTES and STATE.md. The code is already 14-compatible.

### Pitfall 18: committing key material
**What goes wrong:** a PEM test fixture or a `service-account.json` gets committed. Secret scanners flag it, and it violates CLAUDE.md.
**How to avoid:** specs generate keys at runtime (`generateKeyPairSync`). Add `.gitignore` patterns: `*service-account*.json`, `*serviceAccount*.json`, `*firebase-adminsdk*.json`. The existing line `firebase_key.json` stays.

### Pitfall 19: per-token topic failures look like success
**What goes wrong:** `subscribeToTopic` **resolves** with `failureCount > 0` instead of throwing.
**How to avoid:** the transport inspects `failureCount` and returns or logs it as WARN, with no token in the message.

### Pitfall 20: tooling traps (binding)
Never run `npm run lint`. Use `npx prettier --write <file>` and `npx eslint <file>` on touched files. Put Jest paths before `--selectProjects`. Integration runs need `--runInBand`. `@graphql-yoga/subscription` `publish()` returns void (irrelevant here, as push never publishes).

## Code Examples

### §1 `parsePushConfig` (src/config/push-config.ts)
```ts
// Source: modelled on src/config/auth-config.ts; node:crypto createPrivateKey (same check as firebase-admin 13.10)
import type { FactoryProvider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createPrivateKey } from 'node:crypto';

export const PUSH_CONFIG = 'PUSH_CONFIG';
export const PUSH_ENV_KEYS = ['NODE_ENV', 'FIREBASE_SERVICE_ACCOUNT'] as const;
export type PushEnv = Partial<Record<(typeof PUSH_ENV_KEYS)[number], string>>;

export interface FirebaseServiceAccount { projectId: string; clientEmail: string; privateKey: string; }
export interface PushConfig { serviceAccount: FirebaseServiceAccount | null; }

const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;
const REQUIRED_FIELDS = ['project_id', 'client_email', 'private_key'] as const;

// messaggi fissi: né il valore né la chiave privata finiscono mai in un errore o in un log (D-06)
export function parsePushConfig(env: PushEnv): PushConfig {
    const encoded = (env.FIREBASE_SERVICE_ACCOUNT ?? '').replace(/\s+/g, '');
    if (!encoded) {
        if (env.NODE_ENV === 'production') {
            throw new Error('FIREBASE_SERVICE_ACCOUNT is required when NODE_ENV=production');
        }
        return { serviceAccount: null };
    }
    const json = decodeServiceAccount(encoded);
    for (const field of REQUIRED_FIELDS) {
        if (typeof json[field] !== 'string' || json[field] === '') {
            throw new Error(`FIREBASE_SERVICE_ACCOUNT is missing the "${field}" field`);
        }
    }
    const privateKey = json.private_key as string;
    assertPemPrivateKey(privateKey);
    return {
        serviceAccount: {
            projectId: json.project_id as string,
            clientEmail: json.client_email as string,
            privateKey,
        },
    };
}

function decodeServiceAccount(encoded: string): Record<string, unknown> {
    if (!BASE64_PATTERN.test(encoded) || encoded.length % 4 !== 0) {
        throw new Error('FIREBASE_SERVICE_ACCOUNT must be the base64 encoding of the service account JSON');
    }
    let parsed: unknown;
    try {
        parsed = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
    } catch {
        throw new Error('FIREBASE_SERVICE_ACCOUNT does not decode to valid JSON');
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error('FIREBASE_SERVICE_ACCOUNT does not decode to a JSON object');
    }
    return parsed as Record<string, unknown>;
}

function assertPemPrivateKey(privateKey: string): void {
    try {
        createPrivateKey(privateKey);
    } catch {
        throw new Error('FIREBASE_SERVICE_ACCOUNT private_key is not a valid PEM private key');
    }
}

export function readPushEnv(source: Record<string, unknown>): PushEnv { /* same as readAuthEnv over PUSH_ENV_KEYS */ }

export const pushConfigProvider: FactoryProvider<PushConfig> = {
    provide: PUSH_CONFIG,
    inject: [ConfigService],
    useFactory: (config: ConfigService) =>
        parsePushConfig(readPushEnv(Object.fromEntries(PUSH_ENV_KEYS.map((k) => [k, config.get<string>(k)])))),
};
```
`readAuthEnv` and `readPushEnv` duplicate `isEnvScalar` plus the key loop. Boy Scout: extract a `readEnvKeys(source, keys)` helper into `src/config/env-keys.ts` and use it from both (scope: these two files only).

### §2 Registry claim with DB-enforced invariants (src/push/push-device.registry.ts)
```ts
// Source: probe on the replica set (8.0.4 + 8.2.6): 2-way token race → 1 row, both ok, with one retry
@Schema({ collection: 'push_devices', versionKey: false })
export class PushDevice {
    @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
    userId: Types.ObjectId;
    @Prop({ type: String, required: true }) deviceId: string;
    @Prop({ type: String, required: true }) token: string;
    @Prop({ type: String, enum: Object.values(PushPlatform), required: true }) platform: PushPlatform;
    @Prop({ type: Date, required: true }) lastSeenAt: Date;
}
export const PUSH_DEVICE_TTL_SECONDS = 270 * 24 * 60 * 60; // 23_328_000, scadenza FCM dei token Android inattivi
export const PushDeviceSchema = SchemaFactory.createForClass(PushDevice);
PushDeviceSchema.index({ userId: 1, deviceId: 1 }, { unique: true }); // invariante (a); il prefisso userId serve il fan-out
PushDeviceSchema.index({ token: 1 }, { unique: true });              // invariante (b)
PushDeviceSchema.index({ lastSeenAt: 1 }, { expireAfterSeconds: PUSH_DEVICE_TTL_SECONDS });

// registry
async claim(registration: DeviceRegistration, now: Date): Promise<string | null> {
    const write = () => this.claimOnce(registration, now);
    // un altro utente ha preso lo stesso token tra la delete e l'upsert: il secondo tentativo lo rimuove
    return write().catch((error: unknown) => {
        if (!isDuplicateKeyError(error)) throw error;
        return write();
    });
}

private async claimOnce({ userId, deviceId, token, platform }: DeviceRegistration, now: Date): Promise<string | null> {
    await this.model.deleteMany({ token, $nor: [{ userId, deviceId }] }).exec();
    const previous = await this.model
        .findOneAndUpdate(
            { userId, deviceId },
            { $set: { token, platform, lastSeenAt: now } },
            { upsert: true, returnDocument: 'before', projection: { token: 1 } },
        )
        .lean<{ token: string } | null>()
        .exec();
    return previous?.token ?? null;
}

async unregister(userId: Types.ObjectId, deviceId: string): Promise<string | null> {
    const removed = await this.model.findOneAndDelete({ userId, deviceId }, { projection: { token: 1 } }).lean<{ token: string } | null>().exec();
    return removed?.token ?? null;
}
tokensOf(userId: Types.ObjectId): Promise<string[]> { return this.model.distinct('token', { userId }).exec(); }
removeTokens(tokens: string[]): Promise<unknown> { return this.model.deleteMany({ token: { $in: tokens } }).exec(); }
```
The `{ userId, deviceId }` compound index has `userId` as its prefix, so it serves `tokensOf(userId)`. The D-01 "indice su userId" is satisfied without a separate single-field index. Optional: add `{ userId: 1 }` explicitly if the planner wants it spelled out.

### §3 Pure event catalog (src/push/push-events.ts)
```ts
export interface PushMessage { type: PushEventType; id?: string; title: string; body: string; ttlSeconds: number; }
export const STREAMER_LIVE_TOPIC = 'streamer-live';
const PERSONAL_TTL_SECONDS = 60 * 60;     // 1 h (D-11)
const BROADCAST_TTL_SECONDS = 15 * 60;    // 15 min (D-11)

export const travelEnd = (characterId: string): PushMessage => ({
    type: PushEventType.travelEnd, id: characterId,
    title: 'Viaggio completato', body: 'Il tuo personaggio è arrivato a destinazione.',
    ttlSeconds: PERSONAL_TTL_SECONDS,
});
export const questEnd = (pendingQuestId: string): PushMessage => ({
    type: PushEventType.questEnd, id: pendingQuestId,
    title: 'Missione conclusa', body: "La tua missione è terminata: scopri com'è andata.",
    ttlSeconds: PERSONAL_TTL_SECONDS,
});
export const streamerLive = (): PushMessage => ({
    type: PushEventType.streamerLive,
    title: 'La locanda è aperta', body: 'Lo streamer è in diretta: unisciti all\'avventura!',
    ttlSeconds: BROADCAST_TTL_SECONDS,
});
```
The copy is at Claude's discretion (A3). The builders carry no clock and no FCM types. `sendTestPush` maps `PushEventType` to a builder through a `Record<PushEventType, (id?: string) => PushMessage>` (exhaustive at compile time).

### §4 Data-only FCM serializer (src/push/transport/fcm-message.ts)
```ts
// Source: firebase-admin 13.10.0 messaging-api.d.ts; Apple "Pushing background updates" + "Sending notification requests to APNs"
import type { BaseMessage } from 'firebase-admin/messaging';

export function toFcmBase(message: PushMessage, now: Date): Required<Pick<BaseMessage, 'data' | 'android' | 'apns'>> {
    const data: Record<string, string> = {
        type: message.type,
        title: message.title,
        body: message.body,
        sentAt: now.toISOString(),
    };
    if (message.id) data.id = message.id; // mai undefined: un valore non stringa fa fallire ogni token (invalid-payload)
    const expiresAtEpochSeconds = Math.floor(now.getTime() / 1000) + message.ttlSeconds;
    return {
        data,
        android: { priority: 'high', ttl: message.ttlSeconds * 1000 }, // ms: l'SDK converte in "3600s"
        apns: {
            headers: {
                'apns-push-type': 'background',
                'apns-priority': '5', // 10 è un errore per il push type background (Apple)
                'apns-expiration': String(expiresAtEpochSeconds), // epoch assoluto in secondi
            },
            payload: { aps: { contentAvailable: true } }, // l'SDK lo serializza come "content-available": 1
        },
    };
}
```

### §5 Port + FCM adapter (src/push/transport/*)
```ts
export interface TokenDeliveryOutcome { token: string; delivered: boolean; errorCode?: string; }
export interface TopicDeliveryOutcome { delivered: boolean; errorCode?: string; }
export const FCM_MULTICAST_LIMIT = 500;

export abstract class PushTransport {
    abstract readonly enabled: boolean;
    abstract sendToTokens(tokens: string[], message: PushMessage): Promise<TokenDeliveryOutcome[]>; // ≤ FCM_MULTICAST_LIMIT
    abstract sendToTopic(topic: string, message: PushMessage): Promise<TopicDeliveryOutcome>;
    abstract subscribeToTopic(tokens: string[], topic: string): Promise<void>;
    abstract unsubscribeFromTopic(tokens: string[], topic: string): Promise<void>;
}

export class NoopPushTransport extends PushTransport {
    readonly enabled = false;
    async sendToTokens(tokens: string[]) { return tokens.map((token) => ({ token, delivered: false, errorCode: 'push-disabled' })); }
    async sendToTopic() { return { delivered: false, errorCode: 'push-disabled' }; }
    async subscribeToTopic() {}
    async unsubscribeFromTopic() {}
}

import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging, type Messaging } from 'firebase-admin/messaging';

const FCM_APP_NAME = 'klimmeck-push';
const TRANSPORT_ERROR = 'transport-error';

export class FcmPushTransport extends PushTransport {
    readonly enabled = true;
    private readonly logger = new Logger('Push');

    constructor(private readonly messaging: Messaging, private readonly clock: Clock) { super(); }

    // nessuna chiamata di rete: il token OAuth si ottiene al primo invio
    static connect(account: FirebaseServiceAccount, clock: Clock): FcmPushTransport {
        const app = getApps().find((candidate) => candidate.name === FCM_APP_NAME)
            ?? initializeApp({ credential: cert(account) }, FCM_APP_NAME);
        return new FcmPushTransport(getMessaging(app), clock);
    }

    async sendToTokens(tokens: string[], message: PushMessage): Promise<TokenDeliveryOutcome[]> {
        try {
            const batch = await this.messaging.sendEachForMulticast({ tokens, ...toFcmBase(message, this.clock.now()) });
            return batch.responses.map((response, index) => ({
                token: tokens[index],
                delivered: response.success,
                errorCode: response.error?.code,
            }));
        } catch (error) {
            return tokens.map((token) => ({ token, delivered: false, errorCode: errorCodeOf(error) ?? TRANSPORT_ERROR }));
        }
    }

    async sendToTopic(topic: string, message: PushMessage): Promise<TopicDeliveryOutcome> {
        try {
            await this.messaging.send({ topic, ...toFcmBase(message, this.clock.now()) });
            return { delivered: true };
        } catch (error) {
            return { delivered: false, errorCode: errorCodeOf(error) ?? TRANSPORT_ERROR };
        }
    }

    async subscribeToTopic(tokens: string[], topic: string): Promise<void> {
        const response = await this.messaging.subscribeToTopic(tokens, topic);
        if (response.failureCount > 0) this.logger.warn(`subscribeToTopic(${topic}): ${response.failureCount} failed (${response.errors.map((e) => e.error.code).join(', ')})`);
    }
    // unsubscribeFromTopic: symmetric
}

// provider
export const pushTransportProvider: FactoryProvider<PushTransport> = {
    provide: PushTransport,
    inject: [PUSH_CONFIG, Clock],
    useFactory: (config: PushConfig, clock: Clock) =>
        config.serviceAccount ? FcmPushTransport.connect(config.serviceAccount, clock) : new NoopPushTransport(),
};
```
`subscribeToTopic` may throw, and `PushService` wraps it best-effort (D-09). `errorCodeOf` reads a string `code` property, the same shape as `mongoErrorCodeOf`.

### §6 `PushService` core (never throws)
```ts
async sendToUser(userId: Types.ObjectId, message: PushMessage): Promise<PushDeliveryReport> {
    try {
        const tokens = await this.registry.tokensOf(userId);
        if (tokens.length === 0) return emptyReport();
        const outcomes: TokenDeliveryOutcome[] = [];
        for (const batch of chunk(tokens, FCM_MULTICAST_LIMIT)) {
            outcomes.push(...(await this.transport.sendToTokens(batch, message)));
        }
        const prunable = prunableTokens(outcomes); // PRUNE_ALWAYS + PRUNE_WITH_WITNESS when any delivered (per batch)
        if (prunable.length) await this.registry.removeTokens(prunable);
        this.logFailures(message.type, outcomes, prunable);
        return reportOf(outcomes, prunable.length);
    } catch (error) {
        this.logger.warn(`Push ${message.type} non inviato: ${describeError(error)}`);
        return emptyReport();
    }
}
```
Apply the witness rule per batch: compute `prunableTokens` on each batch's outcomes, then concatenate.

### §7 Test override (integration)
```ts
// test/push/fake-push-transport.ts
export class FakePushTransport extends PushTransport {
    enabled = true;
    readonly sent: Array<{ tokens: string[]; message: PushMessage }> = [];
    readonly topicSends: Array<{ topic: string; message: PushMessage }> = [];
    readonly subscriptions: Array<{ tokens: string[]; topic: string }> = [];
    readonly unsubscriptions: Array<{ tokens: string[]; topic: string }> = [];
    private readonly failures = new Map<string, string>(); // token → errorCode
    failToken(token: string, errorCode: string) { this.failures.set(token, errorCode); }
    reset() { /* clear arrays + failures, enabled = true */ }
    async sendToTokens(tokens: string[], message: PushMessage) {
        this.sent.push({ tokens, message });
        return tokens.map((token) => this.failures.has(token)
            ? { token, delivered: false, errorCode: this.failures.get(token) }
            : { token, delivered: true });
    }
    // sendToTopic / subscribeToTopic / unsubscribeFromTopic record and resolve
}

// in the int-spec
const transport = new FakePushTransport();
harness = await createCharactersTestApp({            // imports AuthzModule → audit interceptor active
    imports: [PushModule],
    overrides: [
        { token: PushTransport, useValue: transport },
        { token: PUSH_CONFIG, useValue: { serviceAccount: null } },
    ],
});
await harness.connection.model(PushDevice.name).init(); // unique indexes before concurrency cases
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `sendMulticast` / legacy batch endpoint | `sendEachForMulticast` (one HTTP/2 request per token) | firebase-admin 11.x–12.x | use `sendEachForMulticast` only |
| `admin.messaging()` namespace | modular `getMessaging(app)` | namespace removed in 14.0.0 | modular imports from day one |
| Topic management through the Instance ID API | FCM v1 `registrations/{token}/topicSubscriptions` | firebase-admin 14.5.0 (2026-09-23); IID removal 2027-09-29 | 13.x works until then; upgrade trigger |
| `MessagingClientErrorCode` | `MessagingErrorCode` (same string values) | 14.0.0 "Error Handling Revamp" | compare `error.code` strings |
| token targeting | `fid` targeting (`FidMessage`), `token` deprecated for the Send API | 14.1.0 | tokens still work; FIDs out of scope for v1.0 [CITED: release notes] |

**Deprecated/outdated:** the STACK.md suggestion "array of tokens on the User" is superseded by D-01 (dedicated collection).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Nest calls `onModuleDestroy` on factory-provided instances, so `FcmPushTransport` could `deleteApp` on shutdown | Pitfall 14 | Low: the process exits anyway; skip the hook if it is not verified in a test |
| A2 | The FE `firebase_messaging` background handler runs for APNs `content-available` data messages (app in background, not force-quit) | Q3 / Pitfall 15 | Medium for the FE E2E on iOS; the deferred `notification` block is the documented fallback |
| A3 | The Italian copy for `title`/`body` (§3) | Code Examples | None; discretion D-10 |
| A4 | The production Node runtime is unknown (no repo evidence). Node 18/20 being EOL suggests ≥ 22 | Q10 / OQ1 | 13.10.0 works on both; only the upgrade timing depends on it |
| A5 | Keys `google.*`, `gcm.*`, `message_type`, `collapse_key` are reserved in `data` (SDK only rejects `from`) | Q3 | None: our key set avoids them |
| A6 | Jest sets `NODE_ENV=test` when it is unset | Q6 | Low: the existing suites already rely on non-production behaviour |

## Open Questions (RESOLVED)

1. **firebase-admin 13.x or 14.x?**
   - Resolution (revised D-05): **`firebase-admin@^14.5.0`** + `"engines": { "node": ">=22" }` — Node 18/20 are EOL, CI is on 22, and 13.x topic management ends 2027-09-29.
   - The code uses only APIs identical in 13.10.0 and 14.5.0: modular imports, string error codes, no legacy types. The upgrade is therefore `npm install firebase-admin@^14.5.0` with no code change.
   - Downgrade trigger (one-line `package.json` change, API identical): only if the production host is found to run an EOL Node 20; record the host runtime in BACKEND-NOTES when known.
   - Record both triggers in BACKEND-NOTES and in STATE.md "Pending Todos".
2. **Which codes prune?**
   - Resolution: always prune `messaging/registration-token-not-registered` and `messaging/invalid-registration-token`.
   - Prune `messaging/invalid-argument` only when the same batch contains ≥ 1 delivered token (payload witness, per Firebase's manage-tokens caveat). Otherwise log ERROR and prune nothing.
   - All other codes: WARN, no retry (the Q2 table). This supersedes the non-existent `messaging/unavailable` named in D-08 with `messaging/server-unavailable`.
3. **Mechanism for invariant (b)?**
   - Resolution: a unique index on `token` plus the claim (pre-delete other holders → upsert `returnDocument: 'before'`), retried once on E11000. Verified race-safe (Q4). Option (a) rejected (0 rows under a race).
4. **Where does batching live (D-07 vs D-16)?**
   - Resolution: `PushService` chunks into 500s, so it is unit-testable with the fake. `PushTransport.sendToTokens` takes ≤ `FCM_MULTICAST_LIMIT` tokens, and `FcmPushTransport` issues one `sendEachForMulticast` per batch.
5. **How does `sendTestPush` know the transport is no-op?**
   - Resolution: `abstract readonly enabled: boolean` on the port. `NoopPushTransport.enabled = false`. The fake has a mutable `enabled` to test `PUSH_DISABLED` on the wire.
6. **What does `PushDeliveryReport` mean for a topic send?**
   - Resolution: one FCM send gives `{ targeted: 1, sent: 1|0, failed: 0|1, pruned: 0 }`.
   - No aggregated error codes in the GraphQL report (discretion). Codes go to the logs only, which keeps the schema minimal and avoids leaking FCM internals to clients.
7. **A valid bearer whose User was deleted calls `registerPushDevice`?**
   - Resolution: answer `UNAUTHENTICATED` after an `exists` check, the deletion-module precedent. This prevents orphan rows. It costs one indexed read per registration.
8. **Index verifier for `push_devices`?**
   - Resolution: yes, a minimal `PushDeviceIndexVerifier` (`createIndexes`, ERROR log, never blocks boot), mirroring `TwitchIdIndexVerifier`. The invariants (a)/(b) depend on unique indexes whose autoindex failure would otherwise be silent.
9. **Where do the enums, inputs and report type live?**
   - Resolution: in the feature folder (`src/push/*.enum.ts`, `src/push/dto/*`), following the `src/auth/dto/` precedent. `PushModule` is self-contained infrastructure, so nothing is added to `src/models/`.
10. **Global module or not?**
    - Resolution: not global. `PushModule` exports `PushService`, and Phase 6/8/9 modules import it explicitly.
11. **Unsubscribe the old token when the token rotates on the same device?**
    - Resolution: yes, best-effort, using the `returnDocument: 'before'` token from the claim. Unregister also unsubscribes, best-effort, using the token returned by `findOneAndDelete`.
    - Pruned tokens and TTL-expired rows are **not** unsubscribed. Pruned tokens are dead. TTL deletion is silent; Android tokens are GC'd by FCM after 270 days, and stale iOS topic subscriptions only receive harmless broadcasts.
12. **Cap on devices per user / registration rate?**
    - Resolution: not in this phase. Rate limiting is deferred to Phase 10 (BE-HARD). The registry design (indexed by user) allows a later cap without migration.
13. **Validate `sendTestPush.id` length?**
    - Resolution: not needed for correctness. An oversized `id` makes FCM fail every token with `invalid-argument`, which the witness rule refuses to prune. The tool is innkeeper-only. The planner may add a ≤ 128-char guard reusing `PUSH_INVALID_TOKEN`-style validation, but this is not required.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | everything | ✓ | v22.12.0 (local), 22 (CI) | — |
| npm registry access | `npm install firebase-admin@^14.5.0` | ✓ | npm 10.9.0; the 13.10.0 tarball downloaded in this session | — |
| mongod via mongodb-memory-server | integration (unique/TTL indexes, concurrency) | ✓ | 8.2.6 cached; 8.0.4 downloaded and run in this session (CI pin) | — |
| Redis | real-boot `test/app.int-spec.ts` only | ✓ | redis-memory-server locally; CI `redis:7` service | — |
| Firebase project + service account | **manual** E2E only (real delivery) | ✗ in repo (by design) | — | `NoopPushTransport` + `PUSH_DISABLED`; all automated tests use the fake |
| APNs auth key uploaded to Firebase | iOS delivery (manual E2E) | unknown | — | Android-only E2E first; FCM returns `messaging/third-party-auth-error` if it is missing |

**Missing dependencies with no fallback:** none for automated verification.
**Missing dependencies with fallback:** Firebase credentials. Real delivery is a manual step via `sendTestPush` once the user provides `FIREBASE_SERVICE_ACCOUNT` locally.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 30 + ts-jest 29. Project `unit` (`src/**/*.spec.ts`, `test/**/*.spec.ts`) and project `integration` (`*.int-spec.ts`, global `MongoMemoryReplSet`, `after-env.ts`) |
| Config file | `package.json` → `jest.projects` |
| Quick run command | `npx jest src/push src/config --selectProjects unit` |
| Integration command | `npx jest src/push --selectProjects integration --runInBand` |
| Full suite command | `npm run test:unit && npm run test:int` |

### Phase Requirements → Test Map
| Req / D | Behavior | Type | File | Automated Command | RED before impl | Exists? |
|---|---|---|---|---|---|---|
| D-06 | `parsePushConfig`: missing → `null` in dev/test; missing in production → throws; whitespace-wrapped base64 accepted; non-base64 → throws; non-JSON → throws **without echoing input**; JSON array/primitive → throws; missing `project_id`/`client_email`/`private_key` → throws naming the field; invalid PEM → throws; valid (key generated at runtime) → camelCase account; no message contains the value or the key | unit | `src/config/push-config.spec.ts` | `npx jest src/config/push-config.spec.ts --selectProjects unit` | module missing | ❌ Wave 0 |
| D-06 / D-17 | `validateEnv` throws in production without the variable and passes in dev; `.env.example` declares `FIREBASE_SERVICE_ACCOUNT` empty and still passes `validateEnv` | unit | `src/config/env.validation.spec.ts` (extend) | `npx jest src/config --selectProjects unit` | key missing | ✅ extend |
| D-06 | `PushStartupReporter`: WARN when disabled; LOG with `project_id` when enabled; never the key or client email | unit | `src/push/push-startup.reporter.spec.ts` | `npx jest src/push/push-startup.reporter.spec.ts --selectProjects unit` | missing | ❌ |
| BE-NOTIF-01 / D-02 | validator: deviceId 1–128 `[A-Za-z0-9._-]` (boundaries 0/1/128/129, bad chars); token empty, whitespace, 4096/4097; codes `PUSH_INVALID_DEVICE_ID`/`PUSH_INVALID_TOKEN`; Italian messages | unit | `src/push/push-device-input.validator.spec.ts` | `npx jest src/push --selectProjects unit` | missing | ❌ |
| D-02 / D-13 | `PushException` factories: status, `extensions.code`, message; error-code enum values equal names | unit | `src/push/push.exception.spec.ts` | same | missing | ❌ |
| BE-NOTIF-03 / D-10 / D-12 | catalog builders: type, id, copy, TTL per type; `streamerLive` has no id | unit | `src/push/push-events.spec.ts` | same | missing | ❌ |
| BE-NOTIF-03 / D-11 | serializer: all `data` values are strings; exact key set; `id` omitted when absent; `sentAt` ISO from injected now; `android.priority 'high'`, `ttl` ms; APNs headers `background`/`'5'`/absolute epoch-seconds expiration; `aps` = `{ contentAvailable: true }` only | unit | `src/push/transport/fcm-message.spec.ts` | same | missing | ❌ |
| BE-NOTIF-02 / D-07 | `FcmPushTransport` with stub `Messaging`: maps `BatchResponse` by index; whole-call rejection → all failed with code; topic send ok/fail; subscribe logs `failureCount`; `connect()` offline with a generated key, idempotent (second call reuses the app) | unit | `src/push/transport/fcm-push-transport.spec.ts` | same | missing | ❌ |
| BE-NOTIF-02 / D-08 | `PushService` + fake transport + in-memory registry: zero tokens → no transport call, `{0,0,0,0}`; 1,001 tokens → 3 calls (500/500/1); not-registered and invalid-registration → `removeTokens` + INFO; invalid-argument with a success in the batch → pruned; invalid-argument with all failed → **not** pruned + ERROR; server-unavailable / message-rate-exceeded → WARN, not pruned; registry or transport throwing → no throw, empty report; broadcast → one topic send, report semantics | unit | `src/push/push.service.spec.ts` | same | missing | ❌ |
| BE-NOTIF-01 / D-01 / D-04 | registry on the replica set: indexes exist (unique compound, unique token, TTL 23,328,000 s); register twice → 1 row, `lastSeenAt` advanced; new token same device → 1 row, previous token returned; same token, other user → old row gone; **concurrent** same device ×5 → 1 row; **concurrent** two users same token → exactly 1 row, both calls succeed; raw `userId` is an ObjectId | integration | `src/push/push-device.registry.int-spec.ts` | `npx jest src/push/push-device.registry.int-spec.ts --selectProjects integration --runInBand` | missing | ❌ |
| BE-NOTIF-01 / D-02 / D-03 / D-09 | wire: `registerPushDevice` → `true`, 1 row, fake `subscribeToTopic(['tok'], 'streamer-live')`; invalid input → codes, no row; no bearer → `UNAUTHENTICATED`; bearer of a deleted user → `UNAUTHENTICATED`; subscribe failure → still `true`; token rotation → unsubscribe old; `unregisterPushDevice` → row gone + unsubscribe; repeated → `true`; other user's deviceId untouched; `me` / the `User` type expose no token | integration | `src/push/push.resolver.int-spec.ts` | `npx jest src/push/push.resolver.int-spec.ts --selectProjects integration --runInBand` | missing | ❌ |
| BE-NOTIF-01 SC3 | wire: `sendTestPush` with a fake failing `registration-token-not-registered` for one of two devices → report `{targeted:2, sent:1, pruned:1, failed:1}` and the row is gone from Mongo | integration | same file | same | missing | ❌ |
| BE-NOTIF-03 / D-13 | wire: `sendTestPush` as adventurer → `FORBIDDEN`, no audit; as innkeeper → report + audit row `{ action:'sendTestPush', target:{type:'PushDeliveryReport', id:null}, args:{input:{…}}, outcome:'ok' }`; default target = caller; unknown or malformed `targetUserId` → `NOT_FOUND` (audit outcome `NOT_FOUND`); `streamerLive` → fake `topicSends` has one entry and `targetUserId` is ignored; `fake.enabled=false` → `PUSH_DISABLED` (audit outcome `PUSH_DISABLED`); message `data` built by the catalog | integration | same file | same | missing | ❌ |
| D-14 / CI | real boot with `FIREBASE_SERVICE_ACCOUNT: ''`: `PushTransport` resolves to `NoopPushTransport`; schema contains the D-14 surface (`registerPushDevice(input: RegisterPushDeviceInput!): Boolean!`, `unregisterPushDevice(deviceId: String!): Boolean!`, `sendTestPush(input: SendTestPushInput!): PushDeliveryReport!`, `enum PushPlatform`, `enum PushEventType`, `type PushDeliveryReport`); no `PushDevice`/token field; `EXPECTED_INNKEEPER_HANDLERS` includes `sendTestPush` | integration (real boot) + CI | `test/app.int-spec.ts` (extend) | `npx jest test/app.int-spec.ts --selectProjects integration --runInBand && git diff --exit-code src/schema.gql` | assertions fail before the module exists | ✅ extend |
| D-01 | `PushDeviceIndexVerifier` builds the indexes and logs ERROR (no throw) when `createIndexes` rejects | unit (model stub) | `src/push/push-device-index.verifier.spec.ts` | `npx jest src/push --selectProjects unit` | missing | ❌ |
| D-15 | BACKEND-NOTES: SDL verbatim, a `data` example per type, iOS/Android caveats (Pitfall 15), Firebase checklist + base64 command, FE flow (register / `onTokenRefresh` / unregister before logout, UUID deviceId), `sendTestPush` E2E recipe, codes table, Phase 6/8/9 notes (call after commit, builders), upgrade trigger 2027-09-29 | manual review | `.planning/phases/05-infrastruttura-push-fcm/BACKEND-NOTES.md` | — | missing | ❌ |
| BE-NOTIF-03 (real delivery) | a real device receives the data message in foreground, background and killed (Android); iOS background (not force-quit) | **manual-only** | — | `sendTestPush` with a real `FIREBASE_SERVICE_ACCOUNT` + FE dev build | needs credentials + device | manual |

### Sampling Rate
- **Per task commit:** `npx jest <touched unit specs> --selectProjects unit`, plus the single touched int-spec with `--selectProjects integration --runInBand`.
- **Per wave merge:** `npx jest src/push src/config --selectProjects unit` and `npx jest src/push --selectProjects integration --runInBand`.
- **Phase gate:**
  - `npm run test:unit && npm run test:int` green
  - `npm run build`
  - `npx eslint <touched files>`
  - `git diff --exit-code src/schema.gql` after the real-boot test
  - `git ls-files | grep -iE 'service-?account|adminsdk'` returns nothing
  - then `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `npm install firebase-admin@^14.5.0` (package.json + package-lock.json) and a `.gitignore` service-account patterns commit
- [ ] `src/push/push-error-code.enum.ts` + `push.exception.ts` + spec
- [ ] `src/push/push-platform.enum.ts`, `push-event-type.enum.ts` (registerEnumType)
- [ ] `test/push/fake-push-transport.ts` (shared by the unit and integration suites)
- [ ] In-memory registry fake for the `PushService` unit spec (inline in the spec, or `test/push/in-memory-push-device.registry.ts`)
- [ ] `src/config/push-config.ts` skeleton + spec (keys generated at runtime; no PEM fixture)
- Framework install: none (Jest/harness already present)

## Security Domain

### Applicable ASVS Categories (L1)

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Global `AuthGuard`. Identity comes only from the bearer (`@CurrentUser()`); there is no `userId` in input. A deleted user's bearer gets `UNAUTHENTICATED` |
| V3 Session Management | no | unchanged (`logout` contract untouched, D-03) |
| V4 Access Control | yes | `@Roles(innkeeper)` on `sendTestPush` (`FORBIDDEN`) + automatic audit. Register and unregister act only on `(bearer userId, deviceId)`, so one user cannot unregister another's device |
| V5 Input Validation | yes | Authoritative pure validator (deviceId charset/length, token whitespace/length); `isObjectIdHex` before any `ObjectId` construction for `targetUserId` |
| V6 Cryptography | yes (config) | No hand-rolled crypto. `createPrivateKey` validation only; firebase-admin mints OAuth tokens |
| V7 Error Handling & Logging | yes | Fixed error messages in the config parser (Pitfall 1). Tokens logged as a suffix only. Audit args hold no secrets |
| V8 Data Protection | yes | Tokens never exposed through GraphQL (no `@ObjectType` on `PushDevice`). Push payload carries an ID only, never game state (D-10) |
| V14 Configuration | yes | Fail-closed in production without credentials. Service-account files gitignored. `.env.example` empty |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Attacker registers a victim's FCM token under their own account to receive the victim's pushes | Information disclosure / Spoofing | Tokens are never exposed by the API. The payload holds only type/id/copy, and the id still needs an authorized query (ownership guards from Phase 3) |
| Same attack used to evict the victim's row (invariant b) | Denial of service | The attacker needs the victim's token, which is not obtainable through the API. The victim's app re-registers at start / `onTokenRefresh`. Rate limiting is deferred to Phase 10 |
| Registration flood (many deviceIds per user) amplifying fan-out | DoS | Deferred to Phase 10 (rate limit / device cap). Mitigated meanwhile by the TTL and the 500-batching |
| Push used to smuggle authoritative state | Tampering (integrity of truth) | The catalog is the only message source. The data keys are fixed. The FE re-queries GraphQL |
| Service-account leakage via logs or errors | Information disclosure | Pitfall 1 (fixed messages), reporter logs `project_id` only, no PEM fixtures |
| Innkeeper abuse of `sendTestPush` (spamming users) | Repudiation | Automatic `admin_audit_logs` record per call (actor, args, outcome); APNs throttling caps impact |
| Wrong Firebase project (credentials of another project) | Misconfiguration | `messaging/mismatched-credential` → WARN. D-06 same-project checklist in BACKEND-NOTES. The reporter logs `project_id` at boot for an eyeball check |

## Sources

### Primary (HIGH confidence)
- npm registry (`npm view firebase-admin`, 2026-10-18): versions, publish times, engines, dependencies, exports map.
- Unpacked tarballs firebase-admin **13.10.0** and **14.5.0** (scratchpad): `lib/messaging/{messaging,messaging-api,messaging-internal,messaging-api-request-internal}.{js,d.ts}`, `lib/utils/{error,api-request}.js`, `lib/messaging/error.js` (14), `lib/app/{index.d.ts,credential-internal.js}`.
- Offline probe (scratchpad, firebase-admin 13.10.0, tsc 5.7.3, `nodenext`): modular imports compile; `initializeApp`/`cert`/`getMessaging` work offline; duplicate named app → `app/invalid-app-options`; synchronous throw at 0 and 501 tokens; `cert()` error messages without key material; `deleteApp`.
- Replica-set probes on this repository (throwaway int-spec, deleted; mongod 8.0.4 + 8.2.6, Mongoose 8.18.1): concurrent upserts, E11000 keyPattern, claim race, option-(a) race, TTL index shape.
- Apple Developer documentation (JSON doc API): "Pushing background updates to your App", "Sending notification requests to APNs".
- Firebase docs: https://firebase.google.com/docs/cloud-messaging/manage-tokens ; https://firebase.google.com/docs/cloud-messaging/manage-topic-subscriptions ; https://firebase.google.com/docs/cloud-messaging/android/message-priority ; https://firebase.google.com/docs/cloud-messaging/send/admin-sdk
- firebase-admin-node releases: https://github.com/firebase/firebase-admin-node/releases (14.0.0 removals, 14.1.0 fid, 14.5.0 topic v1 migration, 13.10.0 native crypto).
- Node.js release schedule: https://raw.githubusercontent.com/nodejs/Release/main/schedule.json
- Repository code: `src/config/*`, `src/auth/{auth-startup.reporter,clock,auth.module}.ts`, `src/authz/**`, `src/characters/{creation,deletion}/*`, `src/users/*`, `src/mongo/*`, `src/graphql/*`, `src/auth/session/session.model.ts`, `test/auth/*`, `test/authz/*`, `test/app.int-spec.ts`, `.env.example`, `.gitignore`, `.github/workflows/ci.yml`, `package.json`, `tsconfig.json`.

### Secondary (MEDIUM confidence)
- `.planning/research/STACK.md` / `ARCHITECTURE.md` (project research, July 2026): FCM targeting and "push after commit" guidance, consistent with the official docs above.
- Web search on IID deprecation, corroborated by the official Firebase topic page.

### Tertiary (LOW confidence)
- None relied upon for decisions.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH. Registry versions and both tarballs inspected; 13.10.0 compiled and run.
- Architecture: HIGH. Mirrors existing repo patterns (config parser, reporter, abstract-class tokens, verifiers, typed exceptions, test harness overrides).
- Registry invariants: HIGH. Empirical on the CI mongod version and the local one.
- Payload / APNs / Android semantics: HIGH for the shape (SDK source + Apple docs); MEDIUM for real-device behaviour (A2, manual E2E).
- Production runtime: LOW (unconfirmable). The decision is robust to it.

**Research date:** 2026-10-18
**Valid until:** 2026-11-17 (30 days). Re-check firebase-admin 13.x/14.x releases and the IID deprecation timeline before upgrading.
