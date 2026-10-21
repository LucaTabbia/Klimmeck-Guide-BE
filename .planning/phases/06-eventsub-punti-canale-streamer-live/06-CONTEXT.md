# Phase 6: EventSub: Punti Canale & Streamer Live - Context

**Gathered:** 2026-10-19 (discuss interattivo: l'utente ha deciso ogni area grigia; i default tecnici sono marcati come tali)
**Status:** Ready for planning
**Emendato:** 2026-10-19 dopo la ricerca — D-08, D-09, D-11, D-12, D-13, D-14, D-15 portano una nota "rivista dopo la ricerca" (06-RESEARCH.md §"Conflitti con il CONTEXT", C1–C7); l'utente può porre il veto in PR.

<domain>
## Phase Boundary

Il backend riceve gli eventi **Twitch EventSub** del canale dello streamer tramite un **webhook REST pubblico** e li trasforma in stato di gioco:

- **Webhook** (BE-POINTS-01): `POST` pubblico con `rawBody`, verifica **HMAC-SHA256** su `message_id + message_timestamp + raw_body` (confronto timing-safe), gestione del challenge `webhook_callback_verification`, rifiuto dei messaggi fuori dalla finestra di replay (10 minuti) o con firma errata, gestione di `revocation`.
- **Credito punti** (BE-POINTS-02): ogni redemption di **qualunque custom reward del canale** accredita `reward.cost` **1:1** su `User.twitchPoints` tramite `WalletService.creditUserPoints` (`$inc`, Phase 4), **idempotente** per `message_id` (delivery at-least-once) in una transazione con il record di dedup. Il FE lo vede live tramite `userUpdated` (Phase 3): nessuna superficie GraphQL nuova.
- **Ciclo di vita delle subscription** (BE-POINTS-03): app access token (client credentials), creazione/verifica/ricreazione di `channel.channel_points_custom_reward_redemption.add` e `stream.online` al boot, ogni ora e su `revocation`.
- **Streamer live**: ogni `stream.online` del canale → `PushService.broadcast(streamerLive())` (Phase 5), fuori dalla transazione, best-effort.

Fuori scope (per decisione utente o roadmap): aggiornamento dello stato delle redemption su Twitch (FULFILLED/CANCELED, rimborsi: BE-FUT-05), riconciliazione periodica via `Get Custom Reward Redemption`, `user.authorization.revoke` → revoca sessione, `stream.offline`, multi-canale, coda Bull per l'ingestione, rate limiting (Phase 10), filtro per reward specifica, accrediti a viewer senza account (ignorati).

**Prerequisiti operativi (utente, fuori repo):** chiavi Twitch (`TWITCH_CLIENT_ID/SECRET`, già previste dalla Phase 2), un **URL HTTPS pubblico** del BE per il callback, l'id Twitch del canale, un secret EventSub generato, e **un login dello streamer con lo scope `channel:read:redemptions`** (D-11). In produzione tutto questo è obbligatorio al boot (D-12).

</domain>

<decisions>
## Implementation Decisions

### Webhook e verifica (BE-POINTS-01)
- **D-01 (default tecnico):** Controller REST **`POST /webhooks/twitch/eventsub`** in un modulo nuovo **`src/eventsub/`** (`EventSubModule`), handler decorato **`@Public()`** (solo sull'handler, mai sulla classe: Phase 2 D-12) e aggiunto a `EXPECTED_PUBLIC_HANDLERS` di `test/app.int-spec.ts` (RED prima). L'identità non serve: la fiducia è la firma HMAC.
- **D-02 (default tecnico):** **Raw body**: `NestFactory.create(AppModule, { rawBody: true })` in `main.ts` (e nel harness di test: `createNestApplication({ rawBody: true })`), handler con `@Req() req: RawBodyRequest<Request>` → `req.rawBody`. Verifica in una funzione pura `verifyEventSubSignature({ messageId, timestamp, signature }, rawBody, secret, now)`: HMAC-SHA256 hex con prefisso `sha256=`, `crypto.timingSafeEqual` su buffer di pari lunghezza, header mancanti/secret assente/firma diversa → **403** senza corpo utile e senza loggare firma o body; **timestamp più vecchio di 10 minuti** (o nel futuro oltre una tolleranza di clock, research) → 403. La firma si verifica **prima** di qualunque altro ramo, challenge incluso.
- **D-03 (default tecnico):** Tipi di messaggio (`Twitch-Eventsub-Message-Type`): `webhook_callback_verification` → **200 `text/plain`** con il solo valore `challenge` (nessun JSON, nessun interceptor che lo avvolga); `notification` → elaborazione (D-05..D-08) → **204**; `revocation` → ERROR nel log con `subscription.status` e tipo, poi riconciliazione immediata (D-14) → 204; tipo sconosciuto → 204 + WARN (non far ritentare Twitch). Eventi di un `broadcaster_user_id` diverso da `TWITCH_BROADCASTER_ID` → 204 + WARN, mai credito.
- **D-04 (utente):** **Elaborazione sincrona nel handler**, nessuna coda: la `notification` viene elaborata prima di rispondere. Errore del DB → **500**, così Twitch riconsegna (sicuro grazie al dedup); payload malformato (manca `user_id` o `reward.cost` non è un intero positivo) → 204 + ERROR nel log (ritentare non aiuta). La coda Bull per l'ingestione resta un'estensione differita dietro il service.

### Credito e idempotenza (BE-POINTS-02)
- **D-05 (utente):** **Tutte le custom reward del canale** accreditano: la subscription usa la sola condizione `{ broadcaster_user_id }` (nessun `reward_id`), nessuna variabile `TWITCH_REWARD_ID`. Ogni reward che lo streamer crea su Twitch diventa automaticamente valuta di gioco.
- **D-06 (utente):** **Importo = `event.reward.cost`, 1:1** (PROJECT.md "conversione punti 1:1"): un riscatto da N punti canale accredita N `twitchPoints`. Validato come intero positivo sicuro (già `assertPositiveAmount` in `WalletService`).
- **D-07 (utente):** **Viewer senza `User`** (nessun documento con quel `twitchId`): il BE **non fa nulla** — nessun credito, nessun documento, nessun log sopra il livello DEBUG, risposta 204. Gli utenti nascono solo dal login (Phase 3 D-14); i punti riscattati prima del primo login non vengono recuperati (nessun ledger di crediti non riscossi).
- **D-08 (default tecnico):** **Idempotenza in transazione** (pattern 02.1/03.1/04, Phase 4 D-19 "transazioni solo multi-documento"): `connection.transaction(session => { insertOne(eventsub_messages, { messageId, ... }, { session }); walletService.creditUserPoints(userId, cost, session) })`. Indice **unico su `messageId`**: E11000 nell'insert → transazione abortita → duplicato → 204 senza credito (anche per due consegne concorrenti: una sola vince — provato sul harness con 40 gare: i WriteConflict sono ritentati dal driver e al chiamante arriva solo `11000` su `keyPattern { messageId: 1 }`; il callback può essere rieseguito, quindi **nessun side effect dentro la transazione**). _Rivista dopo la ricerca (C7):_ accanto all'unico su `messageId` un **indice unico parziale su `{ type, eventId }`** (`eventId` = `event.id`, id della redemption / dello stream) blocca il doppio credito quando due subscription attive consegnano lo stesso evento con `message_id` diversi; `isDuplicateKeyOn(error, 'messageId') || isDuplicateKeyOn(error, 'eventId')` ⇒ duplicato. `creditUserPoints` resta l'**unico scrittore** del saldo (Phase 4 D-04). La risoluzione `twitchId → User._id` avviene prima della transazione con una lettura (`findOne({ twitchId })`, proiezione `_id`).
- **D-09 (utente):** Collection di dedup/ledger **`eventsub_messages`** `{ messageId, type (subscription type), eventId, twitchUserId, rewardId, amount, outcome, receivedAt }` (campo `eventId` aggiunto dopo la ricerca, C7) con **TTL 7 giorni** su `receivedAt` (crescita limitata, stesso criterio di costo di Phase 3 D-18); serve anche al supporto ("ho riscattato ma non ho i punti"). Indici creati al boot da un verifier non bloccante sul modello di `PushDeviceIndexVerifier`. Gli eventi ignorati per D-07 **non** lasciano traccia; gli `stream.online` sì (D-15).
- **D-10 (utente):** **Nessuna chiamata di stato su Twitch**: la redemption resta come Twitch la lascia (`unfulfilled` o `fulfilled` secondo la configurazione "salta la coda richieste" della reward, da annotare nella checklist ops); rimborso/`CANCELED` su credito fallito resta **BE-FUT-05**. Nessuno scope `channel:manage:redemptions`.

### Consenso, token e configurazione (BE-POINTS-03)
- **D-11 (utente, dopo verifica sulle fonti Twitch):** la subscription alle redemption richiede che lo streamer abbia autorizzato il client_id con **`channel:read:redemptions`** prima della subscribe; l'autorizzazione **non scade nel tempo** (muore solo se lo streamer scollega l'app da Impostazioni → Connessioni o cambia password → `authorization_revoked`), e la `revoke` del token dopo la validate (Phase 2 D-05) **non** la scioglie. Scelta: **scope da env** — variabile **`TWITCH_LOGIN_SCOPES`** (lista separata da spazi, default vuota) aggiunta all'URL di authorize (`twitch-authorize-url.ts`, oggi `scope: ''`); lo streamer la imposta a `channel:read:redemptions`, fa login una volta, e può lasciarla o toglierla. Procedura e rimedio ("rifare login con lo scope") documentati in `.env.example` e nel handoff; al login il BE può loggare a DEBUG se `validate().scopes` contiene lo scope (discrezione). Nessun endpoint dedicato. _Rivista dopo la ricerca (C4, confidenza MEDIUM):_ le docs Twitch sono ambigue sul caso in cui è l'app a chiamare `/oauth2/revoke`; la UAT manuale verifica che dopo login dello streamer con lo scope → `revoke` → reconcile la create della redemption risponda 202 e non 403. **Fallback pronto** se risponde 403: in `TwitchLoginService` saltare la `revoke` quando `validate().scopes` include `channel:read:redemptions`.
- **D-12 (utente):** Variabili nuove **`TWITCH_EVENTSUB_SECRET`** (10–100 caratteri ASCII, generato random), **`TWITCH_EVENTSUB_CALLBACK_URL`** (URL `https` assoluto; `http://localhost` ammesso solo fuori produzione per i test con Twitch CLI), **`TWITCH_BROADCASTER_ID`** (stringa numerica). Parsate in `src/config/eventsub-config.ts` (`parseEventSubConfig`, `readEventSubEnv`, provider) sul modello di `push-config.ts`, chiamate da `validateEnv`. **Con `NODE_ENV=production` sono obbligatorie insieme a `TWITCH_CLIENT_ID`/`TWITCH_CLIENT_SECRET`: senza, il boot viene rifiutato** (fail-closed come `FIREBASE_SERVICE_ACCOUNT`, Phase 5 D-06). In development/test: tutte assenti → EventSub **disabilitato con WARN** al boot (il webhook risponde 403 perché non c'è secret, nessuna subscription viene creata); configurazione parziale o malformata → boot rifiutato ovunque. I messaggi d'errore nominano variabile e regola, mai il valore. _Rivista dopo la ricerca (C2, C3, C6):_ (a) il `.env` locale ha già `TWITCH_EVENTSUB_SECRET` e `TWITCH_BROADCASTER_ID` ma non `TWITCH_EVENTSUB_CALLBACK_URL`: prima di avviare in locale va aggiunta (es. `http://localhost:3000/webhooks/twitch/eventsub`) o vanno svuotate le altre due — nota ops nel handoff e in `.env.example`; `test/app.int-spec.ts` azzera **tutte e quattro** le variabili nuove (process.env vince sul `.env`). (b) **Callback non-`https` ⇒ "modalità locale"**: webhook attivo (verifica firma, test con Twitch CLI) ma **manager Helix disabilitato** con WARN al boot — Helix rifiuta i callback non `https:443` e un reconcile con callback locale cancellerebbe le subscription dell'ambiente che condivide lo stesso `client_id`; checklist ops: **un'app Twitch (client_id) per ambiente** che fa EventSub. (c) `parseEventSubConfig` legge direttamente `TWITCH_CLIENT_ID`/`TWITCH_CLIENT_SECRET` e li mette in `EventSubConfig` (`TwitchOAuthConfig` è `null` senza `TWITCH_REDIRECT_URI`, e vive in `AuthModule`).
- **D-13 (default tecnico):** **App access token** via `POST https://id.twitch.tv/oauth2/token` `grant_type=client_credentials` con `clientId`/`clientSecret` presi da `EventSubConfig` (_rivista dopo la ricerca, C6: non da `TwitchOAuthConfig`, che è `null` senza `TWITCH_REDIRECT_URI`_), tenuto **solo in memoria** con la scadenza, rinnovato prima della scadenza e su 401, mai persistito. Nuova porta **`TwitchHelixClient`** (classe astratta come token DI, pattern `TwitchOAuthClient`): `listEventSubSubscriptions()`, `createEventSubSubscription({ type, version, condition, transport })`, `deleteEventSubSubscription(id)`; implementazione `HttpTwitchHelixClient` con `fetch`, timeout 5 s, errori normalizzati in un `TwitchHelixError` senza token/secret nel messaggio; `FakeTwitchHelixClient` nei test (Phase 2 D-21: nessuna chiave reale in `npm test`/CI).
- **D-14 (utente):** **Riconciliazione `EventSubSubscriptionManager.reconcile()`**: lista le subscription del client, e per ciascuna desiderata — `channel.channel_points_custom_reward_redemption.add` v1 `{ broadcaster_user_id }` e `stream.online` v1 `{ broadcaster_user_id }`, transport `{ method: 'webhook', callback, secret }` — mantiene quella `enabled` con lo stesso callback, **cancella e ricrea** quelle in altro stato (`webhook_callback_verification_failed`, `notification_failures_exceeded`, `authorization_revoked`, …) o con callback diverso, crea le mancanti; _rivista dopo la ricerca (C5, C7):_ una `webhook_callback_verification_pending` con lo stesso callback viene **mantenuta** (verifica in corso), fra più `enabled` corrispondenti si tiene la più vecchia e si cancellano le altre, le subscription dei tipi desiderati con stesso broadcaster ma condizione/versione diversa (es. `reward_id`) vengono **cancellate**, tutto il resto (altri tipi, altri broadcaster, transport non webhook) è ignorato; il manager **non chiama Helix** se il callback non è `https` (D-12 modalità locale); `reconcile()` è single-flight; il piano è una funzione pura `planReconciliation(existing, desired)` testata a tabella. Gira **al boot** (`OnApplicationBootstrap`, asincrona, mai blocca l'avvio, errori a ERROR), **ogni 60 minuti con un timer in-process** (`setInterval` con `unref()`, pulito in `onModuleDestroy`) e **subito a ogni `revocation`**. `authorization_revoked` sulla redemption → ERROR con il rimedio di D-11. Nessuna coda Bull, nessuno stato persistito: la lista su Twitch è la verità.

### Streamer live e sync FE
- **D-15 (utente):** **Qualunque `stream.online`** del canale (ogni valore di `type`: `live`, `playlist`, `watch_party`, `premiere`, `rerun`) → `PushService.broadcast(streamerLive())` **dopo** il record di dedup (stessa collection, outcome `broadcast`), mai dentro una transazione (Phase 5 handoff §8). _Rivista dopo la ricerca (C1):_ **`void this.push.broadcast(streamerLive())`** (fire-and-forget con `.catch` di sicurezza) subito dopo l'insert del record di dedup, e risposta 204 immediata: Twitch esige la risposta "within a few seconds" mentre un invio FCM può durare decine di secondi e un timeout conterebbe verso `notification_failures_exceeded`; `broadcast` non lancia comunque. Il test d'integrazione resta deterministico perché `FakePushTransport.sendToTopic` registra `topicSends` in modo sincrono alla chiamata.
- **D-16 (default tecnico):** Il credito rende visibile il nuovo saldo al FE tramite il change stream su `users` → `userUpdated` (Phase 3 D-02): **nessuna modifica allo schema GraphQL** (`src/schema.gql` senza diff al gate). Nessun record in `admin_audit_logs` (non è un'azione admin, Phase 3 D-16). Log strutturati con `messageId`, tipo, `twitchUserId`, importo ed esito; mai il secret, la firma o il body.

### Test, tooling, handoff, branch
- **D-17 (default tecnico):** **TDD.** Unit: verificatore di firma (vettori generati con `crypto` nel test: valida, firma errata, header mancanti, timestamp vecchio di 11 minuti, nel futuro), routing per tipo di messaggio, parsing/validazione del payload redemption e `stream.online`, `parseEventSubConfig` (obbligatorietà in production, tutto-o-niente, `https`, lunghezza secret), `planReconciliation`, cache del token. Integrazione sul harness replica set con `createAuthTestApp` + `rawBody` + `EventSubModule` e `FakeTwitchHelixClient`/`FakePushTransport`: challenge → 200 `text/plain` con il challenge; redemption → `twitchPoints` incrementato di `reward.cost` e documento in `eventsub_messages`; stesso `message_id` riconsegnato → un solo credito; due consegne **concorrenti** dello stesso `message_id` → un solo credito; viewer sconosciuto → 204, nessun documento; broadcaster diverso → 204 senza credito; firma errata → 403 senza scritture; `stream.online` → un `topicSends` sul fake transport; `revocation` → `reconcile()` ricrea la subscription sul fake Helix; boot reale (`test/app.int-spec.ts`): whitelist `@Public` aggiornata, variabili EventSub vuote → WARN e nessuna chiamata Helix, `src/schema.gql` invariato.
- **D-18 (default tecnico):** Tooling (02.1 D-14 / 04 D-18 / 05 D-17): `npx prettier --write <file>` + `npx eslint <file>` solo sui file toccati (mai `npm run lint`); percorsi jest **prima** di `--selectProjects`; gate CI: lint, build, unit, integration, `git diff --exit-code src/schema.gql`. `.env.example` aggiornato con le quattro variabili (`TWITCH_LOGIN_SCOPES`, `TWITCH_EVENTSUB_SECRET`, `TWITCH_EVENTSUB_CALLBACK_URL`, `TWITCH_BROADCASTER_ID`), i comandi per generare il secret e ottenere l'id del canale (`twitch api get users -q login=lordreavor`), e la ricetta Twitch CLI (`twitch event verify-subscription` / `twitch event trigger channel.channel_points_custom_reward_redemption.add -F http://localhost:3000/webhooks/twitch/eventsub -s <secret>`). Nessun secret in repo.
- **D-19 (default tecnico):** Handoff **`BACKEND-NOTES.md`** di fase: per il FE (nulla da chiamare: i punti arrivano via `userUpdated`; semantica del push `streamerLive`; nota sul consenso con lo scope), per le ops (checklist: chiavi Twitch, URL HTTPS pubblico, login dello streamer con `TWITCH_LOGIN_SCOPES`, configurazione "salta la coda" delle reward, verifica dello stato delle subscription nel log di boot), ledger `eventsub_messages` per il supporto, elenco dei codici/esiti nel log, note per Phase 10 (rate limiting del webhook).
- **D-20 (default tecnico):** Branch **`feat/06-eventsub-punti-canale-streamer-live`** da `develop` (template `feat/{phase}-{slug}`; la riga Branch della ROADMAP `feat/06-eventsub-points` è stata allineata in questo discuss), PR a `develop`. Nessuna dipendenza da una PR FE: la PR si fonde in autonomia.

### Claude's Discretion
- Nomi di file, classi e del modulo (`EventSubModule`, `EventSubController`, `EventSubService`, `EventSubSignatureVerifier`, `EventSubSubscriptionManager`, `TwitchHelixClient` sono suggerimenti); forma del modello `EventSubMessage`; valore esatto della tolleranza di clock nel futuro; se il timer orario sia una costante o una variabile d'env con default.
- Come il controller bypassa `ClassSerializerInterceptor`/formatter per il challenge `text/plain` (`@Res()` passthrough o `@Header`), purché il body sia la stringa nuda.
- Forma del log DEBUG facoltativo sugli scope concessi al login (D-11).
- Ordine dei plan e delle wave; harness `createAuthTestApp` esteso con `rawBody` in modo retrocompatibile.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Scope e requisiti
- `.planning/ROADMAP.md` §"Phase 6: EventSub: Punti Canale & Streamer Live" — goal, success criteria 1–4, research flag (Helix subscription lifecycle), branch.
- `.planning/REQUIREMENTS.md` — BE-POINTS-01, BE-POINTS-02, BE-POINTS-03; BE-FUT-05 (refund differito); Out of Scope "Validazione token Twitch per-request", "Storage a lungo termine dei token Twitch".
- `.planning/PROJECT.md` §"Key Decisions" — "Sync punti canale via Twitch EventSub webhook" (pending → da validare), constraint "API Twitch: rate limit".

### Research di milestone
- `.planning/research/PITFALLS.md` — Pitfall 7 (raw body, ordine di concatenazione, timing-safe), Pitfall 8 (challenge `text/plain`), Pitfall 9 (dedup `message_id`, finestra 10 min, transazione), Pitfall 10 (revocation + reconcile al boot, app access token), tabella "Integration Gotchas".
- `.planning/research/STACK.md` — raw `crypto` HMAC in un controller `@Public()` con `rawBody: true`; Twitch CLI e tunnel HTTPS per i test; `@twurple/*` opzionale (non adottato: `fetch` nativo come `HttpTwitchOAuthClient`).
- `.planning/research/FEATURES.md` — "Twitch EventSub points sync" e "EventSub idempotency + replay protection" (table stakes), anti-feature "Full OAuth con storage token", differenziatori differiti (reconciliation sweep, refund).
- `.planning/research/SUMMARY.md` §"Phase 6" e §"Research Flags".

### Decisioni precedenti su cui si costruisce
- `.planning/phases/02-auth-identity-foundation/02-CONTEXT.md` — D-02/D-12 (`@Public()` enumerato per handler), D-05 (token Twitch revocato subito: non tocca l'autorizzazione), D-06 (Twitch non configurato → boot con warning), D-17 (fail-closed in production), D-21 (client Twitch finto nei test), D-23 (`.env.example`), D-30 (introspection pubblica fino a Phase 10).
- `.planning/phases/03-autorizzazione-ownership-ruoli-audit/03-CONTEXT.md` — D-02 (`userUpdated` dal change stream su `users`), D-14 ("gli utenti nascono dal login"), D-16/D-18 (audit solo admin, TTL per contenere i costi).
- `.planning/phases/04-integrita-economica-atomics/04-CONTEXT.md` — D-03 (`twitchPoints` con `$inc`; "Phase 6 la userà per il credito EventSub"), D-04 (`WalletService` unico scrittore, `session` opzionale), D-19 (update a documento singolo dove possibile, transazioni solo multi-documento).
- `.planning/phases/05-infrastruttura-push-fcm/05-CONTEXT.md` — D-06 (pattern config fail-closed), D-07 (`PushService.broadcast`), D-12 (builder `streamerLive()`); `BACKEND-NOTES.md` §8 (chiamare `PushService` dopo il commit, mai in transazione; `await` sicuro).

### Codice da leggere
- `src/main.ts` — `NestFactory.create` da estendere con `rawBody: true`.
- `src/auth/twitch/twitch-oauth.client.ts`, `http-twitch-oauth.client.ts` — porta + client HTTP con `fetch`, timeout, errori normalizzati: pattern per `TwitchHelixClient`; `twitch-authorize-url.ts` (`scope: ''` → `TWITCH_LOGIN_SCOPES`); `twitch-auth.controller.ts` (`@Public()` per handler); `src/auth/decorators/public.decorator.ts`.
- `src/config/auth-config.ts`, `src/config/push-config.ts`, `src/config/env-keys.ts`, `src/config/env.validation.ts` — pattern di parsing/fail-closed e `readEnvKeys`.
- `src/economy/wallet.service.ts` (`creditUserPoints(userId, amount, session?)`), `src/economy/economy.module.ts`.
- `src/users/users.service.ts` (`findOrCreateByTwitchId` **non** va usato: D-07; serve solo una `findOne` per `twitchId`), `src/models/user.model.ts`.
- `src/push/push.service.ts`, `src/push/push-events.ts` (`streamerLive()`), `src/push/push.module.ts` (modulo foglia da importare), `src/push/push-device-index.verifier.ts` (verifier non bloccante).
- `src/app.module.ts` — montaggio dei moduli, `ConfigModule.validate`.
- `test/app.int-spec.ts` — `EXPECTED_PUBLIC_HANDLERS`, env del boot reale (aggiungere le variabili EventSub vuote), `collectPublicHandlers`; harness `createAuthTestApp` e `test/push/fake-push-transport.ts`.

### Twitch (esterni, verificati 2026-10-19)
- https://dev.twitch.tv/docs/eventsub/handling-webhook-events/ — header, HMAC, challenge, revocation, replay.
- https://dev.twitch.tv/docs/eventsub/manage-subscriptions/ — "the user must grant your app (client ID) permissions to the required scopes prior to subscribing", webhook con app access token, `authorization_revoked`, costi (0 con autorizzazione).
- https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types/ — `channel.channel_points_custom_reward_redemption.add` (v1, scope `channel:read:redemptions`), `stream.online` (v1, nessuno scope).
- https://dev.twitch.tv/docs/authentication/revoke-tokens/ — la revoke invalida il solo token (forum Twitch: il collegamento in Connessioni resta).
- https://dev.twitch.tv/docs/cli/event-command/ — `twitch event trigger` / `verify-subscription`.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `HttpTwitchOAuthClient` (`fetch`, `AbortSignal.timeout`, `TwitchOAuthError` senza secret) e la classe astratta `TwitchOAuthClient` come token DI: lo stampo per `TwitchHelixClient`/`HttpTwitchHelixClient`/`FakeTwitchHelixClient`.
- `TwitchOAuthConfig` (`clientId`, `clientSecret`) già in `AUTH_CONFIG`: le credenziali per il client-credentials grant.
- `WalletService.creditUserPoints(userId, amount, session?)` — l'unico percorso di credito, già session-aware e validato (`assertPositiveAmount`).
- `PushService.broadcast(message)` + `streamerLive()` — il push streamer-live è una riga.
- `parsePushConfig`/`pushConfigProvider` + `readEnvKeys` — pattern per `eventsub-config.ts`; `PushStartupReporter` per il WARN/INFO di boot; `PushDeviceIndexVerifier` per il verifier degli indici.
- `createAuthTestApp({ imports, overrides })` e `test/app.int-spec.ts` (whitelist `@Public`, env del boot reale) — harness e gate.
- `connection.transaction(...)` nei moduli creation/deletion/economy — pattern transazionale con retry dei WriteConflict gestito dal driver.
- `UsersService.findDuplicateTwitchIds`/indice unico `twitchId` — lookup per `twitchId` affidabile.

### Established Patterns
- `@Public()` solo per handler, verificato con whitelist enumerata nel boot reale (ogni aggiunta passa dal test RED).
- Config pura e fail-closed con messaggi che non echeggiano i valori; variabili opzionali "tutto-o-niente".
- Eccezioni tipizzate con `extensions.code` solo per il wire GraphQL: il webhook è REST e risponde con soli status code (403/204/500), senza body informativo.
- Side-channel (push) chiamato dopo il commit, mai in transazione; `await` sicuro perché non lancia.
- Log con soli id/conteggi/codici, mai segreti.

### Integration Points
- `src/main.ts` (`rawBody: true`), `src/app.module.ts` (`EventSubModule`), `src/config/env.validation.ts` (`parseEventSubConfig`), `src/auth/twitch/twitch-authorize-url.ts` (`TWITCH_LOGIN_SCOPES`), `.env.example`.
- `EventSubModule` importa `EconomyModule` (WalletService), `PushModule` (PushService), `MongooseModule.forFeature` per `User` (lookup) ed `EventSubMessage`; registra config, Helix client, verifier, manager, controller, service.
- `test/app.int-spec.ts`: `EXPECTED_PUBLIC_HANDLERS` += `EventSubController.<handler>`; env += variabili EventSub vuote.

### Gaps found during scouting
- `main.ts` non abilita `rawBody`; nessun controller REST oggi legge il body grezzo.
- Nessun client Helix né app access token: `HttpTwitchOAuthClient` copre solo token exchange/validate/revoke.
- `twitch-authorize-url.ts` fissa `scope: ''` con commento "al BE serve solo l'identità": da aggiornare con D-11.
- `@nestjs/schedule` non è presente e non serve (timer in-process, D-14).

</code_context>

<specifics>
## Specific Ideas

- Utente (2026-10-19): «Il canale è sempre e solo il mio, quindi l'autorizzazione la voglio sempre dare» → scope da env e nessun endpoint dedicato (D-11), dopo la verifica che l'autorizzazione non scade nel tempo.
- Utente (2026-10-19): viewer senza account → «Non fa niente, neanche warning» (D-07); «Tutte le custom reward del canale» (D-05); `stream.online` di qualunque tipo (D-15); variabili obbligatorie in produzione (D-12); elaborazione sincrona in transazione (D-04/D-08); riconciliazione boot + ogni ora in-process (D-14); ledger 7 giorni (D-09); nessun tocco allo stato delle redemption (D-10).
- Canale: `https://www.twitch.tv/lordreavor` (login `lordreavor`), fornito dall'utente nel discuss FE Phase 5: serve per ricavare `TWITCH_BROADCASTER_ID`.

</specifics>

<deferred>
## Deferred Ideas

- **Rimborso/`CANCELED` della redemption su credito fallito e `FULFILLED` dopo il credito** (BE-FUT-05) — richiede `channel:manage:redemptions`.
- **Riconciliazione periodica via `Get Custom Reward Redemption`** — se emergono eventi persi oltre le riconsegne Twitch.
- **`user.authorization.revoke` → revoca della sessione BE** — differenziatore della research, non in questa fase.
- **Coda Bull per l'ingestione del webhook** — se la latenza del handler sincrono diventasse un problema.
- **Ledger permanente delle redemption** — oggi TTL 7 giorni; rivedere con BE-FUT-05.
- **Rate limiting del webhook** (`@nestjs/throttler`) — Phase 10.
- **Filtro per reward specifica / lista di reward** — scartato dall'utente (tutte le reward accreditano); rivedere solo se nascono reward non monetarie.
- **Crediti a viewer senza account** (ledger "non riscossi" o pre-provisioning) — scartato dall'utente.
- **`stream.offline`** — nessun consumatore.

</deferred>

---

*Phase: 06-eventsub-punti-canale-streamer-live*
*Context gathered: 2026-10-19*
