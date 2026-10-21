---
phase: 06-eventsub-punti-canale-streamer-live
audited: 2026-10-21
status: open
asvs_level: 1
threats_total: 48
threats_mitigated: 47
threats_open: 1
threats_open_blocking: 0
open_ids: [T-06-47]
---

# Phase 06 — Security Audit (EventSub, punti canale + streamer live)

Verifica a posteriori dei blocchi `<threat_model>` dei piani 06-01 … 06-09, sul codice del branch `feat/06-eventsub-punti-canale-streamer-live` dopo i fix di 06-REVIEW-FIX (WR-01, IN-01..IN-05). Le 378 unit test di `src/eventsub` e `src/config` passano (`npx jest src/eventsub src/config --selectProjects unit`). Le int-spec citate sono state lette, non rieseguite (le esegue l'orchestratore).

Esito: 47/48 chiuse. L'unica aperta, T-06-47, e aperta per design e rinviata alla pre-produzione (UAT test 3). Non blocca il merge; blocca il go-live.

Legenda: `mitigated` = mitigazione trovata nel codice e test che la esercita; `closed (accepted)` = rischio accettato e registrato qui; `closed (transferred)` = trasferito, documentato in BACKEND-NOTES.

## Riepilogo

| ID | Disp. | Status | Mitigazione (file:riga) | Test |
|----|-------|--------|-------------------------|------|
| T-06-01 | mitigate | mitigated | `src/config/eventsub-config.ts:75-78,123-125,132-135,143-145,181-183` messaggi fissi, nessuna interpolazione di valori | `src/config/eventsub-config.spec.ts:314` "never echo a value" |
| T-06-02 | mitigate | mitigated | `eventsub-config.ts:121-127` (production senza le tre variabili), `:175-185` (credenziali app in managed), `src/config/env.validation.ts:13` | `src/config/env.validation.spec.ts:75` "throws in production without the EventSub variables"; `eventsub-config.spec.ts:98,257` |
| T-06-03 | mitigate | mitigated | `eventsub-config.ts:158-164` (https:443 = managed; http loopback solo fuori produzione = local; altro = errore); `eventsub-subscription.manager.ts:49,62` e `twitch-app-token.cache.ts:46`, `http-twitch-helix.client.ts:156-158` (nessuna chiamata Helix fuori da managed) | `eventsub-config.spec.ts:190,206,223`; `eventsub-subscription.manager.spec.ts:64,74`; `eventsub.controller.int-spec.ts:228` (local, challenge senza Helix) |
| T-06-04 | accept | closed (accepted) | Registro rischi accettati sotto. `src/config/auth-config.ts:65,169-181` valida gli scope con pattern; default vuoto, `.env.example:23-27` spiega l'uso | `src/config/auth-config.spec.ts:126` |
| T-06-05 | mitigate | mitigated | `.env.example:20-21,27,52,56,58` tutte vuote (grep `^(...)=.+` vuoto); `.env` ignorato (`.gitignore:39`) e non tracciato (`git ls-files` vuoto) | `src/config/env.validation.spec.ts:142` "declares the EventSub and login scope keys empty" |
| T-06-06 | mitigate | mitigated | `src/eventsub/eventsub-signature.ts:21-33` HMAC-SHA256 su id, timestamp, rawBody; `timingSafeEqual` dopo controllo di lunghezza; `rawBody` assente o secret vuoto = false (`:21`); `src/main.ts:7` `rawBody: true` | `eventsub-signature.spec.ts:40-90`; `eventsub-webhook.service.spec.ts:155,179`; `eventsub.controller.int-spec.ts:107,117` |
| T-06-07 | mitigate | mitigated | `eventsub-signature.ts:4-5,36-41` finestra 10 min passato, 60 s futuro, timestamp non parsabile rifiutato; dedup su messageId in `eventsub-message.model.ts:48-51` | `eventsub-signature.spec.ts:91,100,108`; `eventsub-webhook.service.spec.ts:166`; `eventsub.controller.int-spec.ts:134`; UAT test 1 caso d (403, saldo invariato) |
| T-06-08 | mitigate | mitigated | `eventsub-signature.ts:30-32` buffer di pari lunghezza prima di `timingSafeEqual` (nessuna eccezione, nessuna short-circuit sul contenuto) | `eventsub-signature.spec.ts:65` "different length without throwing" |
| T-06-09 | mitigate | mitigated | `src/eventsub/eventsub-payload.ts:124-127` (`TWITCH_USER_ID_PATTERN` = `/^\d{1,20}$/`, `eventsub-config.ts:14`), `:129-132` costo intero positivo sicuro; `src/eventsub/points-credit.service.ts:37-40` filtro Mongo con la stringa validata | `eventsub-payload.spec.ts:60,83,89` (inclusi oggetti `$gt`) |
| T-06-10 | mitigate | mitigated | `src/eventsub/eventsub-headers.ts:19-29` legge solo id, timestamp, firma, message-type; il tipo di subscription viene dal body firmato (`eventsub-payload.ts:45-55`); `grep twitch-eventsub-subscription-type src` vuoto | `eventsub-headers.spec.ts:25,57` |
| T-06-11 | mitigate | mitigated | `eventsub-headers.ts:10,35` header oltre 200 caratteri, duplicati o vuoti = null, prima di ogni HMAC (`eventsub-webhook.service.ts:125-132`) | `eventsub-headers.spec.ts:34,38,42,48` |
| T-06-12 | mitigate | mitigated | `points-credit.service.ts:44-65` insert del ledger e credito nella stessa transazione; E11000 su messageId = duplicate (`:68`); indice unico `eventsub-message.model.ts:48-51` | `eventsub-ledger.int-spec.ts:157,169,233`; `eventsub-points.int-spec.ts:127,137` |
| T-06-13 | mitigate | mitigated | `eventsub-message.model.ts:53-60` indice unico parziale `{type,eventId}` (`eventsub_event_unique`); `duplicate-delivery.ts:4-8` | `eventsub-ledger.int-spec.ts:188,282`; `eventsub-points.int-spec.ts:151` |
| T-06-14 | mitigate | mitigated | `src/eventsub/eventsub-message-index.verifier.ts:20-27` `createIndexes()` in `onApplicationBootstrap` (prima di `listen`), ERROR senza valori se fallisce, boot non bloccato | `eventsub-message-index.verifier.spec.ts:21,31,53`; `eventsub-ledger.int-spec.ts:111` asserisce i tre indici |
| T-06-15 | mitigate | mitigated | `verifier.ts:25` + `src/mongo/mongo-errors.ts:21-25` `describeError` = nome e codice; `isDuplicateKeyOn` (`:15-19`) legge solo `keyPattern` | `eventsub-message-index.verifier.spec.ts:31` (non contiene il message id) |
| T-06-16 | mitigate | mitigated | `points-credit.service.ts:37-41` solo `findOne` con proiezione `_id`, nessun upsert; utente cancellato fra lookup e credito = transazione abortita (`:70-72`) | `eventsub-ledger.int-spec.ts:200,220`; `eventsub-points.int-spec.ts:163` |
| T-06-17 | mitigate | mitigated | `eventsub-message.model.ts:12-41` campi messageId, type, eventId, twitchUserId, rewardId, amount, outcome, receivedAt; TTL 7 giorni (`:5,61-66`) | `eventsub-ledger.int-spec.ts:111,135`; UAT test 1 caso b (documento letto da DB) |
| T-06-18 | mitigate | mitigated | `src/eventsub/helix/twitch-http.ts:5-26,39-44` messaggi con sola operazione, status e `name` dell'errore (mai `message`, mai `cause`); `twitch-helix.client.ts:23-38` `describeHelixError` espone il solo `name` degli errori estranei; `manager.ts:73-79,153-155,194-196` usano solo quella | `twitch-app-token.cache.spec.ts:181`; `http-twitch-helix.client.spec.ts:249`; `twitch-helix.client.spec.ts` |
| T-06-19 | mitigate | mitigated | `twitch-app-token.cache.ts:37-38,95` token in un campo privato, nessun modello, nessun log; `invalidate(rejectedToken)` (`:60-63`) | `twitch-app-token.cache.spec.ts:126,139` (nessun accesso a storage; assenza di `Logger` nel file) |
| T-06-20 | mitigate | mitigated | `http-twitch-helix.client.ts:25,59-67` tetto 20 pagine; `twitch-http.ts:3` + `:86`/`:150` timeout 5 s su ogni richiesta; `:119-134` un solo retry sul 401, con cancel del body (IN-03) | `http-twitch-helix.client.spec.ts:229,395,412,421` |
| T-06-21 | mitigate | mitigated | `http-twitch-helix.client.ts:168-209` mapping difensivo, elementi senza id scartati, condition stringa o non JSON = `{}`; `twitch-http.ts:28-37` JSON non valido = errore tipizzato | `http-twitch-helix.client.spec.ts:192,338` |
| T-06-22 | mitigate | mitigated | `test/eventsub/fake-twitch-helix.client.ts` + `fetch` spy con default "Unexpected network call" in tutti gli spec helix (`http-twitch-helix.client.spec.ts:98`, `twitch-app-token.cache.spec.ts:36`, `twitch-helix.client.spec.ts:62`) | gli stessi spec |
| T-06-23 | mitigate | mitigated | Nessun Helix fuori da managed (vedi T-06-03); `plan-reconciliation.ts:53-55,62-70,57-59` tocca solo tipi, broadcaster e transport webhook posseduti, il resto va in `ignored` | `eventsub-subscription.manager.spec.ts:64,74`; `plan-reconciliation.spec.ts` (riga 7, ignored) |
| T-06-24 | mitigate | mitigated | `plan-reconciliation.ts:52-60,86-94,108-114` keep la piu vecchia exact-match, remove di duplicati e varianti (`reward_id`, versione) | `plan-reconciliation.spec.ts` (righe 5 e 6) |
| T-06-25 | mitigate | mitigated | `plan-reconciliation.ts:92-93,22` pending = keep; `manager.ts:60-71,89-99` single-flight con rerun, rerun eseguito anche dopo un run fallito (WR-01) | `eventsub-subscription.manager.spec.ts:191,204,221`; `eventsub-points.int-spec.ts:215` |
| T-06-26 | mitigate | mitigated | `manager.ts:48-52` `void this.reconcileSafely()`; `:83-86` timer `unref()`; timeout 5 s nel client | `eventsub-subscription.manager.spec.ts:232,241` |
| T-06-27 | mitigate | mitigated | `manager.ts:137-143,200-204` riepilogo con tipo, id, status; il secret vive solo nel request (`:165-172`); `describeHelixError` altrove | `eventsub-subscription.manager.spec.ts:266` (nessun log contiene il secret) |
| T-06-28 | mitigate | mitigated | `src/eventsub/eventsub-webhook.service.ts:102-107` disabled = 403; `:134-140` firma verificata prima dello switch (challenge, revocation, notification); eccezioni = 500 senza stack (`:108-115`) | `eventsub-webhook.service.spec.ts:130,155,254`; `eventsub.controller.int-spec.ts:107`; `int-spec:210`; `app.int-spec.ts:343` |
| T-06-29 | mitigate | mitigated | `eventsub-webhook.service.ts:219-221,228-239` `broadcasterUserId !== config.broadcasterId` = nessun credito (per redemption e stream.online) | `eventsub-webhook.service.spec.ts:414,576`; `eventsub-points.int-spec.ts:174` |
| T-06-30 | mitigate | mitigated | `eventsub-webhook.service.ts:302` `void this.push.broadcast(...).catch(...)` dopo l'insert, risposta immediata; `grep "await this.push" src/eventsub` vuoto | `eventsub-webhook.service.spec.ts:523,561` |
| T-06-31 | mitigate | mitigated | `eventsub-webhook.service.ts:206-218` unsupported e invalid = 204; `:259-279` viewer sconosciuto e duplicato = 204; solo errori DB = 500 (`:249-254`, `:288-294`) | `eventsub-webhook.service.spec.ts:399,426,461,471,483,545`; `eventsub-points.int-spec.ts:183` |
| T-06-32 | mitigate | mitigated | Rifiuti pre-firma: messaggi costanti senza id, firma o body (`eventsub-webhook.service.ts:63-66,157-170`), throttled 1/min per motivo (`log-throttle.ts:9-22`, IN-01); log post-firma solo id, tipo, importo, esito, `describeError` (`:111-113,250-253,290-293,309-313`); campi del body nei log troncati a 100 caratteri (`eventsub-payload.ts:32,118-122`); reporter di boot senza secret (`eventsub-startup.reporter.ts:23-36`) | `eventsub-webhook.service.spec.ts:192,210,231,483`; `eventsub-payload.spec.ts:194,256,271`; `log-throttle.spec.ts`; `eventsub-startup.reporter.spec.ts` |
| T-06-33 | accept | closed (accepted) | Registro rischi accettati sotto. Richiede firma valida; `manager.ts:60-71` single-flight idempotente | `eventsub-subscription.manager.spec.ts:191` |
| T-06-34 | mitigate | mitigated | `src/eventsub/eventsub.controller.ts:12` unico `@Public()` in `src/eventsub` (grep = 1), sull'handler, mai sulla classe; whitelist `test/app.int-spec.ts:36-43` | `test/app.int-spec.ts:422` "exposes exactly the enumerated @Public handlers and no public class" |
| T-06-35 | mitigate | mitigated | `eventsub.controller.ts:32-34` 403 per forbidden; service: header mancanti, firma errata, replay, disabled, rawBody assente (Content-Type non JSON = nessun rawBody, `eventsub-signature.ts:21`) | `eventsub.controller.int-spec.ts:107,117,134,146,156`; `int-spec:210` |
| T-06-36 | mitigate | mitigated | Body parser JSON di Nest con limite default 100 KB (`src/main.ts:7` non lo altera) = 413 prima dell'handler | `eventsub.controller.int-spec.ts:187` (413, zero scritture) |
| T-06-37 | mitigate | mitigated | `eventsub.controller.ts:30-36` 204/403/500 con `.end()` senza corpo; unico corpo è il challenge firmato (`:25-27`) | `eventsub.controller.int-spec.ts:114,129,153,164` (`response.text === ''`) |
| T-06-38 | mitigate | mitigated | Stack completo: transazione + indici (T-06-12/13); `creditUserPoints` ha un solo chiamante, `points-credit.service.ts:60` (grep) | `eventsub-points.int-spec.ts:111,127,137,151`; `eventsub-ledger.int-spec.ts:169` |
| T-06-39 | mitigate | mitigated | `test/app.int-spec.ts:36-43` lista enumerata a 6 voci (include `EventSubController.receive`), `publicClasses` atteso `[]` (`:426`) | `test/app.int-spec.ts:422` |
| T-06-40 | mitigate | mitigated | Variabili vuote = `disabled` (`eventsub-config.ts:73,121-128`) = 403 (`eventsub-webhook.service.ts:102-107`); in production il boot fallisce | `test/app.int-spec.ts:343` "rejects EventSub webhook calls while EventSub is disabled"; `eventsub.controller.int-spec.ts:210` |
| T-06-41 | mitigate | mitigated | Manager, token cache e client Helix inerti fuori da managed (T-06-03) | `test/app.int-spec.ts:327` "boots EventSub disabled without calling Twitch" |
| T-06-42 | mitigate | mitigated | `git diff HEAD -- src/schema.gql` vuoto | `test/app.int-spec.ts:356` (lo schema non contiene eventsub/redemption) |
| T-06-43 | mitigate | mitigated | Idem T-06-42 | idem |
| T-06-44 | mitigate | mitigated | Un solo `@Public()` in `src/eventsub` (`eventsub.controller.ts:12`); nessun `await this.push` (push a `eventsub-webhook.service.ts:302` con `void`) | `test/app.int-spec.ts:422`; `eventsub-webhook.service.spec.ts:523` |
| T-06-45 | transfer | closed (transferred) | `BACKEND-NOTES.md` §3 riga 85 (un client_id per ambiente, C3); la modalita locale e garantita dal codice (T-06-03) | `manager.spec.ts:64,74` |
| T-06-46 | transfer | closed (transferred) | `BACKEND-NOTES.md` §3 riga 91 ("Salta la coda delle richieste" su ogni reward) e §8 riga 230 (BE-FUT-05) | n/a (processo ops) |
| T-06-47 | mitigate | **open (deferred to pre-production)** | Fallback documentato in `BACKEND-NOTES.md` §7 (`revokeQuietly` condizionale in `TwitchLoginService.completeLogin` quando gli scope includono `channel:read:redemptions`, TDD come gap-closure). Rimedio operativo gia nel log: `STREAMER_SCOPE_REMEDY` su 403 della create (`manager.ts:188-193`) e su revocation `authorization_revoked` (`eventsub-webhook.service.ts:184-190`) | `06-HUMAN-UAT.md` test 3 (skipped, dipende dal test 2 con tunnel HTTPS) |
| T-06-48 | mitigate | mitigated | `grep "TWITCH_EVENTSUB_SECRET=.+\|TWITCH_CLIENT_SECRET=.+"` su `BACKEND-NOTES.md` e `06-HUMAN-UAT.md` vuoto; l'UAT cita solo la lunghezza del secret | acceptance grep |

## Dettaglio delle minacce aperte

### T-06-47 — C4: la revoke del token dello streamer potrebbe sciogliere l'autorizzazione EventSub (open, deferred to pre-production)

- Rischio: al login dello streamer il BE revoca subito il token utente (Phase 2 D-05, `revokeQuietly`). Se Twitch lega l'autorizzazione della subscription `channel.channel_points_custom_reward_redemption.add` a quel token, la create risponde 403 (o la subscription viene revocata) e i punti canale non vengono piu accreditati. Effetto: indisponibilita della sincronizzazione punti, non perdita di integrita ne esposizione di dati.
- Stato: non verificabile senza Twitch reale con callback https. UAT test 2 e 3 skipped (nessun tunnel), obbligatori prima della produzione.
- Rilevabilita: il fallimento non e silenzioso. Il manager logga ERROR con il rimedio (`manager.ts:188-193`) e il webhook logga l'ERROR sulla revocation `authorization_revoked` (`eventsub-webhook.service.ts:184-190`).
- Azione suggerita (gate di go-live): eseguire UAT test 2 e poi 3 in mode managed. Se la create risponde 403, aprire la gap-closure (`/gsd-plan-phase 6 --gaps`): TDD su `TwitchLoginService.completeLogin`, nessun `revokeQuietly` quando `validate().scopes` include `channel:read:redemptions`. Dopo l'esito, chiudere questa voce e portare `threats_open` a 0.

## Registro dei rischi accettati

| ID | Rischio | Motivazione | Condizione di revisione |
|----|---------|-------------|--------------------------|
| T-06-04 | `TWITCH_LOGIN_SCOPES` impostata chiede lo stesso scope a ogni viewer che fa login | Default vuoto; la variabile si imposta solo per il login dello streamer e poi si svuota (`.env.example:23-27`); gli scope sono validati da pattern; effetto limitato a una schermata di consenso piu ampia | Se la variabile resta impostata in produzione |
| T-06-33 | Una revocation forgiata scatena un reconcile | Serve una firma valida (quindi il secret); il reconcile e single-flight e idempotente; costo limitato a una list Helix | Rate limit del webhook in Phase 10 |

## Out of scope / notes

- **Rilievo IAM FCM** (risolto il 2026-10-20, ruolo per le topic subscription): nota ops di Phase 5, non una minaccia di questa fase.
- **Rate limit** dell'endpoint pubblico: rinviato a Phase 10 (T-06-33, T-06-36). Oggi i rifiuti non autenticati sono limitati nei log (1 WARN al minuto per motivo) ma non nel traffico.
- **Evidenza sui log reali**: l'UAT test 1 ha provato 403 su replay e secret errato senza scritture e 204 sulla dedup, ma le righe di log del BE sono rimaste nel terminale dell'utente e non sono state lette (`06-HUMAN-UAT.md`, evidenza test 1). L'assenza di segreti nei log poggia quindi sui test unitari (`eventsub-webhook.service.spec.ts:192,483`, manager e token cache), non su un'osservazione del processo reale.
- **Log injection residua (bassa)**: `subscription.type/id/status` sono troncati a 100 caratteri ma non ripuliti dai caratteri di controllo. Il body e firmato, quindi solo chi possiede il secret (Twitch) puo produrli. Nessuna azione richiesta; eventuale hardening: strip dei caratteri di controllo in `loggableString` (`eventsub-payload.ts:118`).
- **Throttle dei WARN**: il contatore dei rifiuti e per processo e per motivo (header mancanti, firma/replay); un attaccante puo mascherare un rifiuto "vero" in mezzo a rumore, ma il 403 e il ledger restano la fonte di verita.
- **Ownership del reconcile**: `plan-reconciliation.ts:62-70` considera "posseduta" ogni subscription webhook dello stesso tipo e broadcaster, anche con callback diverso (e la ragione per cui serve un client_id per ambiente, T-06-45). La protezione tra ambienti con lo stesso client_id e quindi organizzativa, non tecnica, per i soli ambienti in managed.
- **Rimborsi/CANCELED**: il BE non ascolta `.update`; mitigazione ops in T-06-46, automazione in BE-FUT-05.
