---
phase: 05
slug: infrastruttura-push-fcm
status: verified
threats_open: 0
asvs_level: 1
created: 2026-10-18
---

# Phase 05 - Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
> Fase: Infrastruttura Push FCM. Branch `feat/05-infrastruttura-push-fcm`, HEAD `236a711` (include i review fix WR-01, IN-01, IN-04a). Diff base: `develop`.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| ambiente di deploy -> processo | `FIREBASE_SERVICE_ACCOUNT` (base64) contiene una private key: attraversa env, parser e log di boot | service account Firebase |
| working tree -> repository git | un JSON service account scaricato dalla console puo essere committato | credenziali |
| client -> `registerPushDevice` / `unregisterPushDevice` | `deviceId`/`token` sono stringhe libere; l'identita arriva solo dal bearer (AuthGuard globale) | deviceId, token FCM |
| innkeeper -> `sendTestPush` | operazione privilegiata che invia notifiche a utenti terzi | targetUserId, id, type |
| resolver -> registro -> Mongo | `userId` dal bearer e input validato arrivano nei filtri; E11000 contiene il token | userId (ObjectId), token |
| BE -> FCM HTTP v1 (Google) | invio autenticato col service account; errori di terze parti rientrano nel processo e decidono il pruning | payload data-only, codici d'errore |
| BE -> device (APNs/Android) | il payload e visibile al sistema operativo | type, title, body, id |
| dominio futuro (Phase 6/8/9) -> `PushService` | i chiamanti non devono fallire per colpa del push | PushMessage |
| schema GraphQL -> client/FE | cosa e osservabile del registro; il FE genera documenti da `src/schema.gql` | schema |
| `.env` sviluppatore -> test | un `.env` locale con credenziali reali non deve accendere FCM nei test | FIREBASE_SERVICE_ACCOUNT |
| documentazione BE / CI -> team FE e fasi future | regole (push dopo il commit, solo builder del catalogo, no segreti) | BACKEND-NOTES |

---

## Threat Register

Evidenza: lettura del codice con file:line su HEAD `236a711` e riferimento ai test indicati (unit + int-spec). L'auditor non ha modificato file di implementazione o di test.

| Threat ID | Category | Component | Disposition | Status | Evidence |
|-----------|----------|-----------|-------------|--------|----------|
| T-05-01 | Information disclosure | `parsePushConfig` | mitigate | CLOSED | `src/config/push-config.ts:75-86,92-94,105-107,115-119`: messaggi fissi che nominano solo variabile/campo; `catch {}` senza inoltrare `error.message` di `JSON.parse`/`createPrivateKey`. Test: `src/config/push-config.spec.ts:121,155-156` (`not.toContain(SECRETKEYMATERIAL/'BEGIN')`), `:65` (non contiene il valore base64) |
| T-05-02 | Information disclosure | `.gitignore`, spec | mitigate | CLOSED | `.gitignore:60-63` (`*service-account*.json`, `*serviceAccount*.json`, `*firebase-adminsdk*.json`); `git ls-files \| grep -iE 'service-?account\|adminsdk'` vuoto; chiavi di test generate a runtime (`push-config.spec.ts:150` usa marcatore, nessun PEM fixture) |
| T-05-03 | Denial of service / misconfig | `validateEnv` | mitigate | CLOSED | `src/config/push-config.ts:61-67` (throw se `NODE_ENV=production` senza variabile), `src/config/env.validation.ts:8` invoca `parsePushConfig`. Test: `src/config/env.validation.spec.ts:37-45` |
| T-05-04 | Tampering | `decodeServiceAccount` | mitigate | CLOSED | `src/config/push-config.ts:22,71-78` (pattern base64 + lunghezza % 4), `:87-95` (oggetto JSON), `:99-111` (tre campi), `:113-120` (PEM valido via `createPrivateKey`) |
| T-05-05 | Elevation (dipendenza/runtime) | `package.json` | mitigate | CLOSED | `package.json:41` `firebase-admin ^14.5.0`; `package.json:9` `engines.node >=22` |
| T-05-06 | Tampering (input non validato) | `push-device-input.validator.ts` | mitigate | CLOSED | `src/push/push-device-input.validator.ts:4-6,17-25,27-35` (deviceId `^[A-Za-z0-9._-]+$` 1..128; token 1..4096 senza whitespace). Chiamato prima di ogni I/O in `push.service.ts:110,130`. Test: `push-device-input.validator.spec.ts`; int-spec `push.resolver.int-spec.ts:221,293` |
| T-05-07 | Tampering / Info disclosure (stato nel push) | `push-events.ts` | mitigate | CLOSED | `src/push/push-events.ts:9-28` catalogo a chiavi fisse; `:36-48` builder; `streamerLive()` senza id (`:46-48`); `src/push/transport/fcm-message.ts:10-17` solo `type,title,body,sentAt[,id]`. Test: `push-events.spec.ts` |
| T-05-08 | Information disclosure (errori) | `PushException` | mitigate | CLOSED | `src/push/push.exception.ts:20-45` messaggi italiani costanti senza id/token. Test: `push.exception.spec.ts` |
| T-05-09 | Spoofing (userId in input) | `RegisterPushDeviceInput` | mitigate | CLOSED | `src/push/dto/register-push-device.input.ts` ha solo `deviceId`, `token`, `platform` (grep `userId` vuoto); `src/push/push.resolver.ts:16-22` usa `identity.userId` |
| T-05-10 | Information disclosure (token nei log) | `FcmPushTransport.reportTopicFailures` | mitigate | CLOSED | `src/push/transport/fcm-push-transport.ts:100-110` logga operazione, topic, conteggio e codici; mai token. Test: `fcm-push-transport.spec.ts:212` (`not.toContain(token)`) |
| T-05-11 | Denial of service (eccezione FCM) | `sendToTokens/sendToTopic` | mitigate | CLOSED | `src/push/transport/fcm-push-transport.ts:43-66` (try/catch con `await` dentro, cattura il throw sincrono; rifiuto -> esiti falliti con codice), `:68-81` per il topic |
| T-05-12 | Tampering / Info disclosure (payload, bypass toggle) | `toFcmBase` | mitigate | CLOSED | `src/push/transport/fcm-message.ts:9-35`: data-only, nessun blocco `notification`, `aps` solo `contentAvailable`. Test: `fcm-message.spec.ts` |
| T-05-13 | Spoofing (FCM acceso accidentalmente nei test) | `pushTransportProvider` | mitigate | CLOSED | `src/push/transport/push-transport.provider.ts:11-14` FCM solo con `serviceAccount`, altrimenti no-op; `FcmPushTransport.connect` senza rete (`fcm-push-transport.ts:33-41`); int-spec sovrascrivono `PushTransport` (`test/push/fake-push-transport.ts`, `push.resolver.int-spec.ts`) |
| T-05-14 | Repudiation / misconfig (progetto Firebase diverso) | FCM errors | accept | CLOSED | Rischio accettato (vedi Accepted Risks Log AR-05-01). `mismatched-credential` arriva come codice per-token ed e loggato WARN (`push.service.ts:226-230`); `PushStartupReporter` logga il `projectId` (`push-startup.reporter.ts:26-28`); checklist in BACKEND-NOTES |
| T-05-15 | Information disclosure (push a utente sbagliato dopo cambio account) | `PushDeviceRegistry.claim` | mitigate | CLOSED | `src/push/push-device.model.ts:33` indice unico su `token`; `src/push/push-device.registry.ts:27-38,71-91` (delete altri detentori -> upsert -> retry su E11000). Test: `push-device.registry.int-spec.ts:121,159`, `push.resolver.int-spec.ts:193` |
| T-05-16 | Denial of service (registrazione persa sotto gara) | `claim` | mitigate | CLOSED | `src/push/push-device.registry.ts:31-37` retry su duplicate-key, upsert senza `deleteMany` post-upsert; indice unico `model.ts:31`. Test: `registry.int-spec.ts:146,159`, `resolver.int-spec.ts:206` |
| T-05-17 | Tampering (userId come stringa) | `PushDevice.userId` | mitigate | CLOSED | `src/push/push-device.model.ts:10` `MongooseSchema.Types.ObjectId`; `registry.ts:10,23` accetta solo `Types.ObjectId`; service converte con `objectIdFromHex` (`push.service.ts:152,131`). Test: `registry.int-spec.ts:70` |
| T-05-18 | Elevation (cancellare il device di un altro) | `unregister` | mitigate | CLOSED | `src/push/push-device.registry.ts:44-50` filtro `{ userId, deviceId }`. Test: `registry.int-spec.ts:198`, `resolver.int-spec.ts:277` |
| T-05-19 | Information disclosure (token nei log dell'index verifier) | `PushDeviceIndexVerifier` | mitigate | CLOSED | `src/push/push-device-index.verifier.ts:21-23` usa `describeMongoError` (`src/mongo/mongo-errors.ts:21`), mai `error.message`. Test: `push-device-index.verifier.spec.ts:34,50` |
| T-05-20 | Information disclosure (token via GraphQL) | `PushDevice` | mitigate | CLOSED | `src/push/push-device.model.ts:8-24` senza `@ObjectType`/`@Field`; `src/schema.gql` senza `PushDevice`/`lastSeenAt`. Test: `test/app.int-spec.ts:296-297` |
| T-05-21 | Denial of service (mass-pruning su invalid-argument) | `prunableTokens` | mitigate | CLOSED | **Regola superseded da review WR-01 (piu forte della regola del testimone pianificata).** `src/push/push-delivery.ts:20-31,42-53`: si pota solo su `registration-token-not-registered` / `invalid-registration-token`; `messaging/invalid-argument` e classificato `payload` e non pota MAI (nemmeno con testimoni nel batch). Log ERROR senza pruning: `push.service.ts:221-225`. Test: `push-delivery.spec.ts:69`, `push.service.spec.ts:162,186` |
| T-05-22 | Denial of service (push che rompe il flusso di dominio) | `sendToUser`/`broadcast` | mitigate | CLOSED | `src/push/push.service.ts:56-83,85-104` try/catch totale, `emptyDelivery()` / topic fallito, log WARN; disabilitato -> report vuoto (`:60,86`). IN-01: pruning isolato in `pruneBestEffort` (`:74,172-185`). Test: `push.service.spec.ts:223` ('pruning failed') |
| T-05-23 | Spoofing (registrazione per conto di altri / utente cancellato) | `registerDevice` | mitigate | CLOSED | `src/push/push.service.ts:106-127,151-157`: `objectIdFromHex` + `userExists` -> `AuthException.unauthenticated()`; userId solo dal bearer (`push.resolver.ts:21`). Test: `resolver.int-spec.ts:238,242` |
| T-05-24 | Tampering (input non validato fino a Mongo) | `registerDevice`/`unregisterDevice` | mitigate | CLOSED | `src/push/push.service.ts:110` (`validateRegisterPushDeviceInput` prima di `exists`/`claim`), `:130` (`assertValidDeviceId`). Test: `resolver.int-spec.ts:221,293` |
| T-05-25 | Information disclosure (enumerazione utenti / ObjectId malformato) | `sendTest.existingUser` | mitigate | CLOSED | `src/push/push.service.ts:159-165` `objectIdFromHex` prima della query; stesso `ResourceNotFoundException.user()` per malformato e inesistente; mutation solo innkeeper (`push.resolver.ts:34`). Test: `resolver.int-spec.ts:472` |
| T-05-26 | Information disclosure (token nei log) | `reportFailures`, `subscribe/unsubscribeBestEffort` | mitigate | CLOSED | `src/push/push.service.ts:211-231` solo conteggi/codici (`failureCodeSummary`, `push-delivery.ts:103-112`); `describePushError` solo nome+codice (`:114-126`); nelle operazioni topic solo suffisso di 6 caratteri (`:39-42,193,206`). Il suffisso e un rischio residuo documentato: vedi AR-05-04 (IN-03b) |
| T-05-27 | Tampering (id arbitrario in `data.id`) | `sendTest` | accept | CLOSED | Rischio accettato (AR-05-03, IN-03a): mutation innkeeper-only (`push.resolver.ts:34`) e auditata (`resolver.int-spec.ts:398`); un id enorme da `payload-size-limit-exceeded`, che non pota (`push-delivery.ts:26-31`) |
| T-05-28 | Spoofing (registrare/deregistrare per conto di altri) | `PushResolver` | mitigate | CLOSED | `src/push/push.resolver.ts:16-31` nessun userId in input, sempre `identity.userId` da `@CurrentUser()`; senza bearer `UNAUTHENTICATED` (AuthGuard globale). Test: `resolver.int-spec.ts:238,277`; `test/app.int-spec.ts:345` |
| T-05-29 | Elevation of privilege (adventurer invia push) | `sendTestPush` | mitigate | CLOSED | `src/push/push.resolver.ts:34` `@Roles(RoleType.innkeeper)`. Test: `resolver.int-spec.ts:387` (FORBIDDEN, nessun invio), `test/app.int-spec.ts:45,384` whitelist innkeeper |
| T-05-30 | Repudiation (abuso dell'invio di prova) | `sendTestPush` | mitigate | CLOSED | Audit automatico del `AdminAuditInterceptor` globale su `@Roles(innkeeper)` (`push.resolver.ts:33-35`); esiti `ok/NOT_FOUND/PUSH_DISABLED` verificati in `resolver.int-spec.ts:398,472,515` |
| T-05-31 | Information disclosure (token via GraphQL) | schema | mitigate | CLOSED | `PushDevice` senza `@ObjectType`; mutation restituiscono `Boolean` / `PushDeliveryReport` (solo conteggi, `src/push/dto/push-delivery-report.model.ts`); `src/schema.gql:296-299,374`. Test: `resolver.int-spec.ts:301`, `test/app.int-spec.ts:296-298` |
| T-05-32 | Information disclosure (credenziali nei log di boot) | `PushStartupReporter` | mitigate | CLOSED | `src/push/push-startup.reporter.ts:26-28` logga solo `projectId` (mai `clientEmail`/private key). Test: `push-startup.reporter.spec.ts` |
| T-05-33 | Denial of service (registration flood) | `registerPushDevice` | accept | CLOSED | Rischio accettato (AR-05-02): rate limiting/cap deferiti a Phase 10 (BE-HARD); attenuato da TTL 270 giorni (`push-device.model.ts:6,34-37`), batching 500 (`FCM_MULTICAST_LIMIT`, `push.service.ts:66`) e validazione lunghezza (`validator.ts:4-5`) |
| T-05-34 | Tampering (rottura contratto GraphQL) | `src/schema.gql` | mitigate | CLOSED | `git diff develop -- src/schema.gql` senza righe rimosse (`^-[^-]` vuoto): diff solo additivo (`schema.gql:296-299,374-391,476-491`) |
| T-05-35 | Elevation (nuova mutation admin/handler pubblico non enumerato) | `test/app.int-spec.ts` | mitigate | CLOSED | `test/app.int-spec.ts:45` (`PushResolver.sendTestPush` nella whitelist innkeeper), `:375` whitelist `@Public` esatta, `:384` whitelist innkeeper esatta |
| T-05-36 | Information disclosure (token nello schema / tipo User) | schema | mitigate | CLOSED | `test/app.int-spec.ts:278-298` asserzioni negative (`type PushDevice`, `lastSeenAt`, `FIREBASE`) |
| T-05-37 | Spoofing (FCM reale nei test da `.env` locale) | real-boot test | mitigate | CLOSED | `test/app.int-spec.ts:173` `FIREBASE_SERVICE_ACCOUNT: ''` prima dell'import di AppModule; `:304` 'resolves the no-op push transport without Firebase credentials' |
| T-05-38 | Spoofing (mutation raggiungibile senza auth) | AuthGuard globale | mitigate | CLOSED | `test/app.int-spec.ts:32,345` 'rejects registerPushDevice without a bearer' su vero AppModule (`src/app.module.ts:30,82` registra `PushModule`) |
| T-05-39 | Information disclosure (service account committato) | repository | mitigate | CLOSED | `git ls-files \| grep -iE 'service-?account\|adminsdk'` vuoto (verificato dall'auditor su HEAD); `.gitignore:60-63`; `.env.example:34-40` con valore vuoto e avvertenza |
| T-05-40 | Tampering (regressione contratto GraphQL) | `src/schema.gql` | mitigate | CLOSED | Diff additivo verificato (vedi T-05-34); schema committato allineato al boot reale (test `app.int-spec.ts:278`) |
| T-05-41 | Tampering / DoS (push dentro transazione o con stato nel payload) | BACKEND-NOTES §8 | mitigate | CLOSED | `BACKEND-NOTES.md:327` regola "DOPO il commit, MAI dentro `connection.transaction`"; builder del catalogo come unica sorgente; commento operativo in `push.service.ts:55`. Verifica continua nelle review delle fasi 6/8/9 |
| T-05-42 | Denial of service (deploy prod senza variabile) | deploy | transfer | CLOSED | Trasferito all'operatore di deploy e documentato: `BACKEND-NOTES.md:339` ("configurare PRIMA del deploy, fail-closed voluto D-06"), `:212-217`; applicazione nel codice `push-config.ts:61-67`, test `env.validation.spec.ts:37` |
| T-05-43 | Information disclosure (segreti nel documento) | BACKEND-NOTES | mitigate | CLOSED | `grep -c 'BEGIN PRIVATE KEY' BACKEND-NOTES.md` = 0; il documento contiene solo identificatori, codici, comandi |

*Status: CLOSED = mitigazione trovata, rischio accettato documentato o transfer documentato. OPEN = mitigazione assente.*

### Nota WR-01 (cambio della regola di pruning)

La regola del testimone di T-05-21 (D-08 rivista) e stata sostituita dal review fix WR-01: `messaging/invalid-argument` non pota mai (`push-delivery.ts:25-31,42-53`), perche un batch mescola piattaforme e un payload rifiutato da una sola avrebbe cancellato i token dell'altra. La difesa contro il mass-pruning e quindi piu forte di quella pianificata; la mitigazione e verificata e coperta da `push-delivery.spec.ts:69` e `push.service.spec.ts:162,186`. Il token davvero morto viene rimosso da `registration-token-not-registered`, dal TTL a 270 giorni o dalla ri-registrazione.

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-05-01 | T-05-14 | Progetto Firebase diverso dal FE: non rilevabile a build-time; `mismatched-credential` arriva per-token ed e loggato WARN, `projectId` loggato al boot, checklist "stesso progetto" in BACKEND-NOTES | orchestrator/plan 05-03 2026-10-18 | 2026-10-18 |
| AR-05-02 | T-05-33 | Registration flood: rate limiting/cap per utente deferiti a Phase 10 (BE-HARD); mitigato da TTL 270 giorni, batching 500, validazione lunghezza e autenticazione obbligatoria | orchestrator/plan 05-06 2026-10-18 | 2026-10-18 |
| AR-05-03 | T-05-27, IN-03a | `sendTestPush.id` non validato: solo innkeeper (game master di fiducia), auditato; un id enorme provoca solo `payload-size-limit-exceeded`, che non pota (nessun danno al registro) | orchestrator/review 2026-10-18 | 2026-10-18 |
| AR-05-04 | T-05-26, IN-03b | Suffisso di 6 caratteri del token nei log di errore della gestione topic: basso valore informativo, documentato in BACKEND-NOTES; il transport non logga mai token | orchestrator/review 2026-10-18 | 2026-10-18 |
| AR-05-05 | IN-02 | `claim` ritenta una sola volta su E11000: con 3+ contendenti simultanei sullo stesso token il retry puo fallire e il device resta non registrato fino al prossimo avvio; le invarianti (indici unici) non vengono mai violate, scenario molto improbabile | orchestrator/review 2026-10-18 | 2026-10-18 |
| AR-05-06 | IN-04b | Race subscribe/unsubscribe per lo stesso token puo lasciare un token iscritto a `streamer-live` senza riga: il topic e un broadcast pubblico non sensibile e la registrazione successiva ripara (D-09), best-effort | orchestrator/review 2026-10-18 | 2026-10-18 |

---

## Unregistered Threat Flags

Nessuno. Tutte le sezioni `## Threat Flags` dei SUMMARY 05-01..05-08 dichiarano "None" o rimandano a minacce gia registrate (T-05-01..T-05-43). Le osservazioni del review (WR-01, IN-01..IN-04) sono mappate sopra: WR-01 su T-05-21, IN-01 su T-05-22, IN-02/IN-03/IN-04b nell'Accepted Risks Log, IN-04a e refactor di duplicazione senza impatto di sicurezza.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-10-18 | 43 (39 mitigate, 3 accept, 1 transfer) | 43 | 0 | gsd-security-auditor (verifica statica del codice a HEAD `236a711`; i test sono citati come evidenza, non rieseguiti) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-10-18
