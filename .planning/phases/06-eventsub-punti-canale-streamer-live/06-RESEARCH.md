# Phase 6: EventSub: Punti Canale & Streamer Live - Research

**Researched:** 2026-10-19
**Domain:** Twitch EventSub webhook (HMAC, challenge, revocation), Helix EventSub subscription lifecycle con app access token, NestJS 11 / Express 5 raw body e risposte non-JSON, idempotenza Mongo in transazione su replica set (Mongoose 8.18.1), timer in-process, config fail-closed
**Confidence:** HIGH sulle forme verificate empiricamente: rawBody nel harness, challenge `text/plain` accettato dalla Twitch CLI contro un'app Nest reale, E11000 dentro `connection.transaction` con consegne concorrenti (mongod **8.0.4** = pin CI e **8.2.6** = cache locale), header e payload catturati dalla Twitch CLI 1.1.24, status/response code Helix letti dalla reference ufficiale. MEDIUM su un solo punto esterno: se la `revoke` del token utente subito dopo il login (Phase 2 D-05) lasci intatta l'autorizzazione EventSub dello streamer (docs ambigue, vedi Conflitto C4).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Webhook e verifica (BE-POINTS-01)
- **D-01 (default tecnico):** Controller REST **`POST /webhooks/twitch/eventsub`** in un modulo nuovo **`src/eventsub/`** (`EventSubModule`), handler decorato **`@Public()`** (solo sull'handler, mai sulla classe: Phase 2 D-12) e aggiunto a `EXPECTED_PUBLIC_HANDLERS` di `test/app.int-spec.ts` (RED prima). L'identità non serve: la fiducia è la firma HMAC.
- **D-02 (default tecnico):** **Raw body**: `NestFactory.create(AppModule, { rawBody: true })` in `main.ts` (e nel harness di test: `createNestApplication({ rawBody: true })`), handler con `@Req() req: RawBodyRequest<Request>` → `req.rawBody`. Verifica in una funzione pura `verifyEventSubSignature({ messageId, timestamp, signature }, rawBody, secret, now)`: HMAC-SHA256 hex con prefisso `sha256=`, `crypto.timingSafeEqual` su buffer di pari lunghezza, header mancanti/secret assente/firma diversa → **403** senza corpo utile e senza loggare firma o body; **timestamp più vecchio di 10 minuti** (o nel futuro oltre una tolleranza di clock, research) → 403. La firma si verifica **prima** di qualunque altro ramo, challenge incluso.
- **D-03 (default tecnico):** Tipi di messaggio (`Twitch-Eventsub-Message-Type`): `webhook_callback_verification` → **200 `text/plain`** con il solo valore `challenge` (nessun JSON, nessun interceptor che lo avvolga); `notification` → elaborazione (D-05..D-08) → **204**; `revocation` → ERROR nel log con `subscription.status` e tipo, poi riconciliazione immediata (D-14) → 204; tipo sconosciuto → 204 + WARN (non far ritentare Twitch). Eventi di un `broadcaster_user_id` diverso da `TWITCH_BROADCASTER_ID` → 204 + WARN, mai credito.
- **D-04 (utente):** **Elaborazione sincrona nel handler**, nessuna coda: la `notification` viene elaborata prima di rispondere. Errore del DB → **500**, così Twitch riconsegna (sicuro grazie al dedup); payload malformato (manca `user_id` o `reward.cost` non è un intero positivo) → 204 + ERROR nel log (ritentare non aiuta). La coda Bull per l'ingestione resta un'estensione differita dietro il service.

#### Credito e idempotenza (BE-POINTS-02)
- **D-05 (utente):** **Tutte le custom reward del canale** accreditano: la subscription usa la sola condizione `{ broadcaster_user_id }` (nessun `reward_id`), nessuna variabile `TWITCH_REWARD_ID`. Ogni reward che lo streamer crea su Twitch diventa automaticamente valuta di gioco.
- **D-06 (utente):** **Importo = `event.reward.cost`, 1:1** (PROJECT.md "conversione punti 1:1"): un riscatto da N punti canale accredita N `twitchPoints`. Validato come intero positivo sicuro (già `assertPositiveAmount` in `WalletService`).
- **D-07 (utente):** **Viewer senza `User`** (nessun documento con quel `twitchId`): il BE **non fa nulla** — nessun credito, nessun documento, nessun log sopra il livello DEBUG, risposta 204. Gli utenti nascono solo dal login (Phase 3 D-14); i punti riscattati prima del primo login non vengono recuperati (nessun ledger di crediti non riscossi).
- **D-08 (default tecnico):** **Idempotenza in transazione** (pattern 02.1/03.1/04, Phase 4 D-19 "transazioni solo multi-documento"): `connection.transaction(session => { insertOne(eventsub_messages, { messageId, ... }, { session }); walletService.creditUserPoints(userId, cost, session) })`. Indice **unico su `messageId`**: E11000 nell'insert → transazione abortita → duplicato → 204 senza credito (anche per due consegne concorrenti: una sola vince). `creditUserPoints` resta l'**unico scrittore** del saldo (Phase 4 D-04). La risoluzione `twitchId → User._id` avviene prima della transazione con una lettura (`findOne({ twitchId })`, proiezione `_id`).
- **D-09 (utente):** Collection di dedup/ledger **`eventsub_messages`** `{ messageId, type (subscription type), twitchUserId, rewardId, amount, outcome, receivedAt }` con **TTL 7 giorni** su `receivedAt` (crescita limitata, stesso criterio di costo di Phase 3 D-18); serve anche al supporto ("ho riscattato ma non ho i punti"). Indici creati al boot da un verifier non bloccante sul modello di `PushDeviceIndexVerifier`. Gli eventi ignorati per D-07 **non** lasciano traccia; gli `stream.online` sì (D-15).
- **D-10 (utente):** **Nessuna chiamata di stato su Twitch**: la redemption resta come Twitch la lascia (`unfulfilled` o `fulfilled` secondo la configurazione "salta la coda richieste" della reward, da annotare nella checklist ops); rimborso/`CANCELED` su credito fallito resta **BE-FUT-05**. Nessuno scope `channel:manage:redemptions`.

#### Consenso, token e configurazione (BE-POINTS-03)
- **D-11 (utente, dopo verifica sulle fonti Twitch):** la subscription alle redemption richiede che lo streamer abbia autorizzato il client_id con **`channel:read:redemptions`** prima della subscribe; l'autorizzazione **non scade nel tempo** (muore solo se lo streamer scollega l'app da Impostazioni → Connessioni o cambia password → `authorization_revoked`), e la `revoke` del token dopo la validate (Phase 2 D-05) **non** la scioglie. Scelta: **scope da env** — variabile **`TWITCH_LOGIN_SCOPES`** (lista separata da spazi, default vuota) aggiunta all'URL di authorize (`twitch-authorize-url.ts`, oggi `scope: ''`); lo streamer la imposta a `channel:read:redemptions`, fa login una volta, e può lasciarla o toglierla. Procedura e rimedio ("rifare login con lo scope") documentati in `.env.example` e nel handoff; al login il BE può loggare a DEBUG se `validate().scopes` contiene lo scope (discrezione). Nessun endpoint dedicato.
- **D-12 (utente):** Variabili nuove **`TWITCH_EVENTSUB_SECRET`** (10–100 caratteri ASCII, generato random), **`TWITCH_EVENTSUB_CALLBACK_URL`** (URL `https` assoluto; `http://localhost` ammesso solo fuori produzione per i test con Twitch CLI), **`TWITCH_BROADCASTER_ID`** (stringa numerica). Parsate in `src/config/eventsub-config.ts` (`parseEventSubConfig`, `readEventSubEnv`, provider) sul modello di `push-config.ts`, chiamate da `validateEnv`. **Con `NODE_ENV=production` sono obbligatorie insieme a `TWITCH_CLIENT_ID`/`TWITCH_CLIENT_SECRET`: senza, il boot viene rifiutato** (fail-closed come `FIREBASE_SERVICE_ACCOUNT`, Phase 5 D-06). In development/test: tutte assenti → EventSub **disabilitato con WARN** al boot (il webhook risponde 403 perché non c'è secret, nessuna subscription viene creata); configurazione parziale o malformata → boot rifiutato ovunque. I messaggi d'errore nominano variabile e regola, mai il valore.
- **D-13 (default tecnico):** **App access token** via `POST https://id.twitch.tv/oauth2/token` `grant_type=client_credentials` con le credenziali di `TwitchOAuthConfig`, tenuto **solo in memoria** con la scadenza, rinnovato prima della scadenza e su 401, mai persistito. Nuova porta **`TwitchHelixClient`** (classe astratta come token DI, pattern `TwitchOAuthClient`): `listEventSubSubscriptions()`, `createEventSubSubscription({ type, version, condition, transport })`, `deleteEventSubSubscription(id)`; implementazione `HttpTwitchHelixClient` con `fetch`, timeout 5 s, errori normalizzati in un `TwitchHelixError` senza token/secret nel messaggio; `FakeTwitchHelixClient` nei test (Phase 2 D-21: nessuna chiave reale in `npm test`/CI).
- **D-14 (utente):** **Riconciliazione `EventSubSubscriptionManager.reconcile()`**: lista le subscription del client, e per ciascuna desiderata — `channel.channel_points_custom_reward_redemption.add` v1 `{ broadcaster_user_id }` e `stream.online` v1 `{ broadcaster_user_id }`, transport `{ method: 'webhook', callback, secret }` — mantiene quella `enabled` con lo stesso callback, **cancella e ricrea** quelle in altro stato (`webhook_callback_verification_failed`, `notification_failures_exceeded`, `authorization_revoked`, …) o con callback diverso, crea le mancanti; il piano è una funzione pura `planReconciliation(existing, desired)` testata a tabella. Gira **al boot** (`OnApplicationBootstrap`, asincrona, mai blocca l'avvio, errori a ERROR), **ogni 60 minuti con un timer in-process** (`setInterval` con `unref()`, pulito in `onModuleDestroy`) e **subito a ogni `revocation`**. `authorization_revoked` sulla redemption → ERROR con il rimedio di D-11. Nessuna coda Bull, nessuno stato persistito: la lista su Twitch è la verità.

#### Streamer live e sync FE
- **D-15 (utente):** **Qualunque `stream.online`** del canale (ogni valore di `type`: `live`, `playlist`, `watch_party`, `premiere`, `rerun`) → `PushService.broadcast(streamerLive())` **dopo** il record di dedup (stessa collection, outcome `broadcast`), mai dentro una transazione (Phase 5 handoff §8), `await` sicuro perché `broadcast` non lancia mai.
- **D-16 (default tecnico):** Il credito rende visibile il nuovo saldo al FE tramite il change stream su `users` → `userUpdated` (Phase 3 D-02): **nessuna modifica allo schema GraphQL** (`src/schema.gql` senza diff al gate). Nessun record in `admin_audit_logs` (non è un'azione admin, Phase 3 D-16). Log strutturati con `messageId`, tipo, `twitchUserId`, importo ed esito; mai il secret, la firma o il body.

#### Test, tooling, handoff, branch
- **D-17 (default tecnico):** **TDD.** Unit: verificatore di firma (vettori generati con `crypto` nel test: valida, firma errata, header mancanti, timestamp vecchio di 11 minuti, nel futuro), routing per tipo di messaggio, parsing/validazione del payload redemption e `stream.online`, `parseEventSubConfig` (obbligatorietà in production, tutto-o-niente, `https`, lunghezza secret), `planReconciliation`, cache del token. Integrazione sul harness replica set con `createAuthTestApp` + `rawBody` + `EventSubModule` e `FakeTwitchHelixClient`/`FakePushTransport`: challenge → 200 `text/plain` con il challenge; redemption → `twitchPoints` incrementato di `reward.cost` e documento in `eventsub_messages`; stesso `message_id` riconsegnato → un solo credito; due consegne **concorrenti** dello stesso `message_id` → un solo credito; viewer sconosciuto → 204, nessun documento; broadcaster diverso → 204 senza credito; firma errata → 403 senza scritture; `stream.online` → un `topicSends` sul fake transport; `revocation` → `reconcile()` ricrea la subscription sul fake Helix; boot reale (`test/app.int-spec.ts`): whitelist `@Public` aggiornata, variabili EventSub vuote → WARN e nessuna chiamata Helix, `src/schema.gql` invariato.
- **D-18 (default tecnico):** Tooling (02.1 D-14 / 04 D-18 / 05 D-17): `npx prettier --write <file>` + `npx eslint <file>` solo sui file toccati (mai `npm run lint`); percorsi jest **prima** di `--selectProjects`; gate CI: lint, build, unit, integration, `git diff --exit-code src/schema.gql`. `.env.example` aggiornato con le quattro variabili (`TWITCH_LOGIN_SCOPES`, `TWITCH_EVENTSUB_SECRET`, `TWITCH_EVENTSUB_CALLBACK_URL`, `TWITCH_BROADCASTER_ID`), i comandi per generare il secret e ottenere l'id del canale (`twitch api get users -q login=lordreavor`), e la ricetta Twitch CLI (`twitch event verify-subscription` / `twitch event trigger channel.channel_points_custom_reward_redemption.add -F http://localhost:3000/webhooks/twitch/eventsub -s <secret>`). Nessun secret in repo.
- **D-19 (default tecnico):** Handoff **`BACKEND-NOTES.md`** di fase: per il FE (nulla da chiamare: i punti arrivano via `userUpdated`; semantica del push `streamerLive`; nota sul consenso con lo scope), per le ops (checklist: chiavi Twitch, URL HTTPS pubblico, login dello streamer con `TWITCH_LOGIN_SCOPES`, configurazione "salta la coda" delle reward, verifica dello stato delle subscription nel log di boot), ledger `eventsub_messages` per il supporto, elenco dei codici/esiti nel log, note per Phase 10 (rate limiting del webhook).
- **D-20 (default tecnico):** Branch **`feat/06-eventsub-punti-canale-streamer-live`** da `develop` (template `feat/{phase}-{slug}`; la riga Branch della ROADMAP `feat/06-eventsub-points` è stata allineata in questo discuss), PR a `develop`. Nessuna dipendenza da una PR FE: la PR si fonde in autonomia.

### Claude's Discretion
- Nomi di file, classi e del modulo (`EventSubModule`, `EventSubController`, `EventSubService`, `EventSubSignatureVerifier`, `EventSubSubscriptionManager`, `TwitchHelixClient` sono suggerimenti); forma del modello `EventSubMessage`; valore esatto della tolleranza di clock nel futuro; se il timer orario sia una costante o una variabile d'env con default.
- Come il controller bypassa `ClassSerializerInterceptor`/formatter per il challenge `text/plain` (`@Res()` passthrough o `@Header`), purché il body sia la stringa nuda.
- Forma del log DEBUG facoltativo sugli scope concessi al login (D-11).
- Ordine dei plan e delle wave; harness `createAuthTestApp` esteso con `rawBody` in modo retrocompatibile.

### Deferred Ideas (OUT OF SCOPE)
- **Rimborso/`CANCELED` della redemption su credito fallito e `FULFILLED` dopo il credito** (BE-FUT-05) — richiede `channel:manage:redemptions`.
- **Riconciliazione periodica via `Get Custom Reward Redemption`** — se emergono eventi persi oltre le riconsegne Twitch.
- **`user.authorization.revoke` → revoca della sessione BE** — differenziatore della research, non in questa fase.
- **Coda Bull per l'ingestione del webhook** — se la latenza del handler sincrono diventasse un problema.
- **Ledger permanente delle redemption** — oggi TTL 7 giorni; rivedere con BE-FUT-05.
- **Rate limiting del webhook** (`@nestjs/throttler`) — Phase 10.
- **Filtro per reward specifica / lista di reward** — scartato dall'utente (tutte le reward accreditano); rivedere solo se nascono reward non monetarie.
- **Crediti a viewer senza account** (ledger "non riscossi" o pre-provisioning) — scartato dall'utente.
- **`stream.offline`** — nessun consumatore.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| BE-POINTS-01 | Endpoint webhook EventSub (REST, `@Public()`, `rawBody: true`) con verifica firma HMAC-SHA256 su `message_id + timestamp + raw_body`, gestione challenge e rifiuto messaggi fuori dalla replay window | Q1 (header esatti catturati dalla CLI, HMAC verificato byte-per-byte, replay 10 min citato), Q2 (`rawBody` funziona con `createNestApplication({ rawBody: true })` sul harness reale; challenge `text/plain; charset=utf-8` accettato dalla `twitch event verify-subscription` contro Nest; 204/403/500 misurati; `@Public()` rispettato dall'`AuthGuard` globale, formato whitelist), Code Example §1–§2 |
| BE-POINTS-02 | Accredito `twitchPoints` idempotente: dedup per `message_id` + `$inc` atomico; la redemption accredita 1:1 | Q3 (probe: E11000 dentro `connection.transaction` aborta senza credito; 40 gare concorrenti da 2 e 8 consegne → **sempre esattamente 1 credito**, i perdenti ricevono **sempre `11000`**, mai `112` perché il driver ritenta internamente il WriteConflict; identico su 8.0.4 e 8.2.6; l'indice unico deve esistere prima), Q4 (`twitchId` stringa, `user_id` stringa numerica), Conflitto C7 (doppie subscription → `eventId` unico), Code Example §3 |
| BE-POINTS-03 | Lifecycle delle subscription EventSub (app access token, creazione/verifica/rinnovo di `channel_points_custom_reward_redemption.add` e `stream.online`); `stream.online` alimenta il push streamer-live | Q1 (Helix POST/GET/DELETE, response code 202/400/401/403/409/410/429, tutti gli `status`, paginazione, "subscriptions do not expire"), Q5 (client credentials, nessun refresh token, 401 reattivo, cache), Q6 (`planReconciliation` a tabella con decisioni motivate, single-flight, timer `unref`), Q7 (config), Q8 (`broadcast` non lancia mai), Conflitti C1/C3/C5/C6 |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- Stack fisso: NestJS 11 + Mongoose 8 + Apollo code-first. **Nessuna dipendenza nuova** in questa fase: `fetch` nativo (Node 22), `node:crypto`, niente `@twurple/*` (STACK.md lo dà come opzionale; il CONTEXT ha scelto `fetch` come `HttpTwitchOAuthClient`).
- **TDD obbligatorio** (Red → Green → Refactor): ogni comportamento parte da un test che fallisce. La whitelist `@Public` in `test/app.int-spec.ts` va resa RED prima di decorare il controller.
- Clean Code, SoC, Boy Scout Rule (es. il commento in `twitch-authorize-url.ts:5` "scope sempre presente e vuoto: al BE serve solo l'identità" diventa falso e va riscritto nello stesso commit).
- Conventional Commits con scope `phase-6`; la memoria utente vieta il trailer `Co-Authored-By`.
- Tooling: `npx prettier --write <file>` e `npx eslint <file>` solo sui file toccati; **mai** `npm run lint` né prettier/format su directory. Jest: percorsi **prima** di `--selectProjects`; integrazione sempre `--runInBand`.
- Branch + PR verso `develop`; mai push su `develop`/`main`. Contratti GraphQL invariati: **zero diff** su `src/schema.gql`.
- Nessun secret in repo: `.env.example` con le quattro variabili vuote (o con il default `TWITCH_LOGIN_SCOPES=` vuoto) e istruzioni; nessun secret/firma/body nei log.
- Il backend è la fonte di verità: il credito è server-side; il FE vede il saldo via `userUpdated`.
- Le modifiche passano dal workflow GSD (`/gsd-execute-phase`).

## Summary

Tutte le decisioni del CONTEXT sono implementabili come scritte. La ricerca ha misurato le tre forme che più rischiavano di cambiare il piano, e **nessuna lo rompe**:

1. **Raw body**: `Test.createTestingModule(...).createNestApplication({ rawBody: true })` espone `req.rawBody` come `Buffer` con i byte esatti (spazi inclusi) **solo** per `Content-Type: application/json` (e urlencoded); senza l'opzione `req.rawBody` è `undefined`; con `text/plain` è `undefined` anche con l'opzione. Il body parser JSON di default rifiuta oltre **100 KB** con 413 e un JSON malformato con 400, **prima** di guard e handler [VERIFIED: probe sul harness, `node_modules/@nestjs/platform-express/adapters/utils/get-body-parser-options.util.js`].
2. **Challenge**: sia `@HttpCode(200) @Header('Content-Type','text/plain')` + `return challenge` sia `@Res() res.status(200).type('text/plain').send(challenge)` producono `200`, `Content-Type: text/plain; charset=utf-8`, `Content-Length` esatto e il body nudo; la **Twitch CLI 1.1.24 `verify-subscription` contro l'app Nest** risponde a entrambi "✔ Valid response / ✔ Valid content-type header (text/plain with charset utf-8) / ✔ Valid status code" [VERIFIED: probe]. Il global `AdminAuditInterceptor` passa oltre sui contesti HTTP (`admin-audit.interceptor.ts`: `pendingEntryOf` ritorna `null` se il tipo non è `graphql`).
3. **E11000 in transazione concorrente**: con indice unico su `messageId` creato prima, `connection.transaction(async s => { create([msg],{session:s}); findOneAndUpdate($inc,{session:s}) })` lanciata 2 o 8 volte in parallelo con lo stesso `messageId` (40 prove) ha dato **sempre esattamente un credito**; i perdenti rigettano **sempre** con `MongoServerError` `code 11000` e `keyPattern {messageId:1}` (nessun `112`, nessuna error label: il WriteConflict transitorio viene ritentato dal driver dentro `withTransaction`, fino a 8 riesecuzioni extra del callback). Stesso risultato su mongod 8.0.4 e 8.2.6. **Senza** indice unico i duplicati passano (2 documenti) [VERIFIED: probe].

Fatti esterni verificati che il planner deve usare: header `Twitch-Eventsub-Message-Id/-Retry/-Type/-Signature/-Timestamp`, `Twitch-Eventsub-Subscription-Type/-Version`; firma `sha256=` + hex(HMAC-SHA256(secret, id ‖ timestamp ‖ rawBody)); timestamp con fino a 9 cifre frazionarie (`Date.parse` di Node 22 le accetta); Helix **POST → 202** con `status: webhook_callback_verification_pending`, **403 "The access token is missing the required scopes"** quando lo streamer non ha autorizzato, **409** se esiste già una subscription per lo stesso type+condition, **410** versione rimossa; **GET** con filtri mutuamente esclusivi e paginazione a cursore di dimensione indeterminata; **DELETE → 204/404**; "**Subscriptions do not expire, but Twitch may revoke them**"; callback "HTTPS and port 443", "**Redirects are not followed**"; app access token **non rinnovabile** (si richiede un nuovo token), 401 reattivo [CITED: dev.twitch.tv].

Sette **raffinamenti** al CONTEXT, elencati in "Conflitti con il CONTEXT": i più importanti sono (C3) con callback `http://localhost` il manager **non deve toccare Helix**, altrimenti cancella le subscription di un altro ambiente con lo stesso client_id; (C7) dedup anche sull'**id della redemption** (`event.id`) perché due subscription per lo stesso evento consegnano message_id diversi; (C1) il `broadcast` di `stream.online` va lanciato **senza attendere** la risposta FCM per restare nei "pochi secondi" di Twitch; (C2) il `.env` locale di Luca-sama contiene già `TWITCH_EVENTSUB_SECRET` e `TWITCH_BROADCASTER_ID` ma **non** `TWITCH_EVENTSUB_CALLBACK_URL`: con la regola "parziale → boot rifiutato" il boot locale fallirà finché non si aggiunge il callback.

**Primary recommendation:** modulo foglia `src/eventsub/` con: funzioni pure (firma, header, payload, piano di riconciliazione, config) testate a tabella; un `EventSubWebhookService` che restituisce un `WebhookReply` discriminato (`challenge` | `noContent` | `forbidden` | `retryLater`) e un controller sottile con `@Res()` che lo traduce; un `PointsCreditService` con la transazione dedup+credito e la classificazione E11000 via `isDuplicateKeyOn`; la porta `TwitchHelixClient` con `HttpTwitchHelixClient` (token in memoria single-flight, retry una volta su 401) e `FakeTwitchHelixClient`; un `EventSubSubscriptionManager` single-flight con timer orario `unref()`; config `parseEventSubConfig` autonoma (legge anche `TWITCH_CLIENT_ID/SECRET`).

## Conflitti con il CONTEXT

Nessuna decisione è smentita dai fatti; questi sono raffinamenti o rischi che il planner deve recepire esplicitamente (la decisione resta all'utente dove cambia comportamento).

| # | Decisione | Fatto trovato | Rimedio consigliato |
|---|---|---|---|
| C1 | D-15 "`await` sicuro perché `broadcast` non lancia mai" | Vero che non lancia (`push.service.ts:85-104`), ma Twitch richiede risposta "within a few seconds" e un invio FCM può durare decine di secondi (BACKEND-NOTES Phase 5 §8: timeout 15 s × fino a 4 retry). Un timeout conta come fallimento verso `notification_failures_exceeded`. | Dopo l'insert del record di dedup, **`void this.push.broadcast(streamerLive())`** e rispondere 204 subito. BACKEND-NOTES §8 lo prevede già ("si può non attendere"). Il test d'integrazione resta deterministico: `FakePushTransport.sendToTopic` registra `topicSends` in modo sincrono alla chiamata. |
| C2 | D-12 "configurazione parziale → boot rifiutato ovunque" | Il `.env` locale contiene `TWITCH_EVENTSUB_SECRET` e `TWITCH_BROADCASTER_ID` ma non `TWITCH_EVENTSUB_CALLBACK_URL` (verificato sui soli nomi delle chiavi). | Nessun cambio di decisione. Il piano include un passo ops/handoff: prima di avviare in locale aggiungere `TWITCH_EVENTSUB_CALLBACK_URL=http://localhost:3000/webhooks/twitch/eventsub` (o svuotare le due). Il messaggio d'errore deve nominare la variabile mancante. `test/app.int-spec.ts` deve azzerare **tutte e quattro** le variabili (process.env vince sul `.env`: `@nestjs/config` 4.0.2 fa `{ ...dotenv, ...process.env }`, `config.module.js:81-84`). |
| C3 | D-12 `http://localhost` ammesso fuori produzione + D-14 "callback diverso → cancella e ricrea" | Helix rifiuta callback non `https:443` con 400. Se lo stesso `TWITCH_CLIENT_ID` è usato da prod e da un dev con callback locale, il reconcile del dev vede la subscription di prod con callback diverso, **la cancella**, poi la create fallisce: il dev spegne il sync di produzione. Stesso effetto ping-pong tra due ambienti `https` con lo stesso client. | (a) Callback non-`https` ⇒ "modalità locale": webhook attivo (verifica firma, test con CLI), **manager disabilitato** (nessuna chiamata Helix, WARN al boot). (b) Checklist ops: **un'app Twitch (client_id) per ambiente** che fa EventSub, oppure EventSub configurato in un solo ambiente. |
| C4 | D-11 "la `revoke` del token dopo la validate non la scioglie" | Le docs dicono `authorization_revoked` quando "The user revoked the authorization token or simply changed their password" (handling-webhook-events) e "revoked their authorization letting you get events on their behalf" (manage-subscriptions): ambigue sul caso "è l'app a chiamare `/oauth2/revoke`". Il thread del forum trovato non lo chiarisce. | MEDIUM: va confermato nella UAT manuale (login streamer con scope → reconcile → la create della redemption risponde 202, non 403). **Fallback pronto** se risponde 403: in `TwitchLoginService` saltare la `revoke` quando `validate().scopes` include `channel:read:redemptions` (una riga, solo per lo streamer). |
| C5 | D-14 "cancella e ricrea quelle in altro stato (…)" | Una subscription appena creata è `webhook_callback_verification_pending` finché Twitch non riceve la risposta al challenge; cancellarla durante un reconcile concorrente (revocation + timer) rompe la verifica in corso. | `pending` con stesso callback ⇒ **keep** (il ciclo successivo la vedrà `enabled` o `webhook_callback_verification_failed` e agirà). Tutti gli altri stati non-`enabled` ⇒ delete+create. |
| C6 | D-13 "con le credenziali di `TwitchOAuthConfig`" | `parseTwitchConfig` restituisce `null` se manca anche solo `TWITCH_REDIRECT_URI` (`auth-config.ts:149-153`): l'app token non ne ha bisogno, e `AUTH_CONFIG` vive in `AuthModule`. | `parseEventSubConfig` legge direttamente `TWITCH_CLIENT_ID`/`TWITCH_CLIENT_SECRET` (stesse variabili, stesse credenziali) e le mette in `EventSubConfig`: nessuna dipendenza da `AuthModule`, override semplice nei test, regola di produzione verificabile in un solo parser. |
| C7 | D-08/D-09 dedup per `messageId` | Due subscription attive per lo stesso evento (es. una vecchia `redemption.add` con `condition.reward_id` da prove manuali: condizione diversa, quindi niente 409) consegnano la **stessa redemption con message_id diversi** → doppio credito. | Nel modello (discrezione "forma del modello"): campo `eventId` (= `event.id`, id della redemption / dello stream) con **indice unico parziale su `{ type, eventId }`** oltre all'unico su `messageId`; `isDuplicateKeyOn(error, 'messageId') || isDuplicateKeyOn(error, 'eventId')` ⇒ duplicato. In più `planReconciliation` cancella le subscription dei tipi desiderati con lo stesso broadcaster ma condizione/versione diversa. |

## Answers to the research questions

### Q1 — Twitch EventSub e Helix (fonti ufficiali + cattura CLI) — HIGH

**Header** (catturati dalla Twitch CLI 1.1.24 e citati dalla doc) [VERIFIED: probe CLI][CITED: dev.twitch.tv/docs/eventsub/handling-webhook-events]:

| Header (Node li espone in minuscolo) | Valore osservato |
|---|---|
| `twitch-eventsub-message-id` | UUID (`6ad3c54d-06c5-8f44-eb19-f8ef4d21b096`); impostabile con `twitch event trigger -I <id>` |
| `twitch-eventsub-message-retry` | `"0"` |
| `twitch-eventsub-message-type` | `notification` \| `webhook_callback_verification` \| `revocation` |
| `twitch-eventsub-message-signature` | `sha256=<64 hex minuscoli>` |
| `twitch-eventsub-message-timestamp` | RFC3339 con frazioni fino ai ns (`2026-10-19T17:09:43.226869Z`; la doc mostra `.634234626Z`) |
| `twitch-eventsub-subscription-type` | es. `channel.channel_points_custom_reward_redemption.add` |
| `twitch-eventsub-subscription-version` | `"1"` |
| `content-type` | `application/json` |

- **HMAC**: "Twitch uses the secret as the key when creating an HMAC-SHA256 … the concatenation of the values in the Twitch-Eventsub-Message-Id header, the Twitch-Eventsub-Message-Timestamp header, and the raw request body (the order is important)"; prefisso `sha256=`, digest hex, "Be sure to use a time safe comparison function"; mismatch → "return a 4XX status code". Ricalcolato sui byte grezzi nel probe: `signatureMatches: true` per redemption, stream.online e challenge.
- **Replay**: "Make sure the value in the `message_timestamp` field isn't older than 10 minutes" e "Make sure you haven't seen the ID in the `message_id` field before"; "If Twitch resends the message, the message ID will be the same" [CITED: dev.twitch.tv/docs/eventsub/]. Il `Message-Timestamp` è l'istante di invio, quindi una riconsegna arriva con un timestamp nuovo e resta nella finestra.
- **Challenge**: "Your response must return a 200 status code", "The response body must contain the raw challenge string only", "you must set the Content-Length response header to the length of the challenge value"; esempio con `text/plain`. Nessun timeout specifico documentato per il challenge (il "~10 s" della domanda **non** compare nelle pagine lette).
- **Notification**: "You must respond to notification requests within a few seconds … If you fail to respond quickly enough too many times, the subscription's status changes to `notification_failures_exceeded` and Twitch revokes the subscription". Numero di retry e backoff **non documentati**; consegna "at least once".
- **Revocation**: body con `subscription.status` ∈ `user_removed`, `authorization_revoked`, `notification_failures_exceeded`, `version_removed`; "Twitch reserves the right to revoke a subscription at any time"; risposta 2xx. "**Subscriptions do not expire, but Twitch may revoke them.**" [CITED: handling-webhook-events]. La CLI genera un messaggio `revocation` con `twitch event trigger <type> -r authorization_revoked` [VERIFIED: probe].
- **Callback**: "The URL must use the HTTPS protocol and port 443 … NOTE: Redirects are not followed". **Secret**: "ASCII string that's a minimum of 10 characters long and a maximum of 100" [CITED: dev.twitch.tv/docs/api/reference/#create-eventsub-subscription].

**Body catturati** (abbreviati):
```json
// webhook_callback_verification
{ "challenge": "176be8ae-14f9-8516-56c0-ee8d078bf31a",
  "subscription": { "id": "9cbc…", "status": "webhook_callback_verification_pending",
    "type": "channel.channel_points_custom_reward_redemption.add", "version": "1",
    "condition": { "broadcaster_user_id": "11111" },
    "transport": { "method": "webhook", "callback": "http://localhost:18080/webhooks/twitch/eventsub" },
    "created_at": "…", "cost": 0 } }
// notification channel.channel_points_custom_reward_redemption.add v1
{ "subscription": { "id": "e199…", "status": "enabled", "type": "channel.channel_points_custom_reward_redemption.add", "version": "1", "condition": { "broadcaster_user_id": "11111" }, "…": "…" },
  "event": { "id": "e62f2ad8-…", "broadcaster_user_id": "11111", "broadcaster_user_login": "testBroadcaster",
    "broadcaster_user_name": "testBroadcaster", "user_id": "22222", "user_login": "testFromUser", "user_name": "testFromUser",
    "user_input": "Test Input From CLI", "status": "unfulfilled",
    "reward": { "id": "b55001de-…", "title": "Test Reward from CLI", "cost": 250, "prompt": "…" },
    "redeemed_at": "2026-10-19T17:09:43.226869Z" } }
// notification stream.online v1
{ "subscription": { "type": "stream.online", "version": "1", "…": "…" },
  "event": { "id": "53418160", "broadcaster_user_id": "11111", "broadcaster_user_login": "testBroadcaster",
    "broadcaster_user_name": "testBroadcaster", "type": "live", "started_at": "2026-10-19T17:09:43.627278Z" } }
```
Campi redemption [CITED: eventsub-reference]: `status` "Defaults to `unfulfilled`. Possible values are `unknown`, `unfulfilled`, `fulfilled`, and `canceled`"; `reward` = "Basic information about the reward … at the time it was redeemed" (`id`, `title`, `cost`, `prompt`). `stream.online.type` ∈ `live`, `playlist`, `watch_party`, `premiere`, `rerun`. Autorizzazione: redemption.add "Must have `channel:read:redemptions` or `channel:manage:redemptions` scope"; stream.online "No authorization required" [CITED: eventsub-subscription-types]. `reward.cost`: "The minimum is 1 point", **nessun massimo documentato** [CITED: api reference, Create Custom Rewards].

**Helix** [CITED: dev.twitch.tv/docs/api/reference]:

| Endpoint | Auth | Esito |
|---|---|---|
| `POST https://api.twitch.tv/helix/eventsub/subscriptions` body `{ type, version, condition, transport: { method: 'webhook', callback, secret } }`, header `Authorization: Bearer <app token>`, `Client-Id`, `Content-Type: application/json` | "If you use webhooks … the request must specify an app access token. The request will fail if you use a user access token. If the subscription type requires user authorization, the user must have granted your app (client ID) permissions … before you subscribe" | **202** `{ data: [{ id, status: 'webhook_callback_verification_pending', type, version, condition, created_at, transport: { method, callback }, cost }], total, total_cost, max_total_cost }`; **400** (condition/secret/callback/method non validi), **401** (token mancante/non valido, Client-Id ≠ client del token), **403 "The access token is missing the required scopes"**, **409** "A subscription already exists for the specified event type and condition combination. The id value in the error response represents the existing EventSub subscription", **410** type/version rimossi, **429** troppe subscription con lo stesso type+condition |
| `GET …/eventsub/subscriptions[?status=|type=|user_id=|subscription_id=][&after=]` | app token | **200** `{ data[], total, total_cost, max_total_cost, pagination: { cursor? } }`; "The filters are mutually exclusive"; "The number of subscriptions returned per page is undetermined"; ordinata dalla più vecchia; `condition` descritto come "string-encoded JSON object" ma gli esempi mostrano un oggetto (parsing difensivo) |
| `DELETE …/eventsub/subscriptions?id=<id>` | app token | **204**; **404** "The subscription was not found" (da trattare come successo idempotente) |

**Status possibili** (GET, elenco completo): `enabled`, `webhook_callback_verification_pending`, `webhook_callback_verification_failed`, `notification_failures_exceeded`, `authorization_revoked`, `moderator_removed`, `user_removed`, `chat_user_banned`, `version_removed`, `beta_maintenance`, `websocket_*` (disconnected, failed_ping_pong, received_inbound_traffic, connection_unused, internal_error, network_timeout, network_error, failed_to_reconnect), `conduit_deleted`. Per webhook le non-enabled restano visibili "for a minimum of 10 days" [CITED: manage-subscriptions]. Costo: "Subscriptions requiring user authorization have no cost" (es. CLI: `cost: 0`); stream.online senza autorizzazione può costare 1 su `max_total_cost` 10000: irrilevante per 2 subscription.

**Client credentials** [CITED: dev.twitch.tv/docs/authentication/getting-tokens-oauth]: `POST https://id.twitch.tv/oauth2/token`, `x-www-form-urlencoded` `client_id`, `client_secret`, `grant_type=client_credentials`; risposta `{ access_token, expires_in (es. 5011271 s ≈ 58 giorni), token_type: 'bearer' }`, nessun `refresh_token`. "You cannot refresh app access tokens"; "If you call a Twitch API with an invalid token, the request returns 401 Unauthorized … reactively respond to HTTP status code 401" [CITED: refresh-tokens]. Scope nell'authorize: "A space-delimited list of scopes … You must URL encode the list" (es. `channel%3Amanage%3Apolls+channel%3Aread%3Apolls`): `URLSearchParams` produce esattamente `+` per lo spazio e `%3A` per `:`.

### Q2 — NestJS 11.1.6 + Express 5.1.0: raw body, challenge, status code, guard — HIGH (empirico)

Versioni installate [VERIFIED: node_modules]: `@nestjs/core|common|platform-express 11.1.6`, `express 5.1.0`, `body-parser 2.2.0`, `@nestjs/config 4.0.2`, `mongoose 8.18.1`, `mongodb 6.19.0`, `supertest 7.1.4`, Node `v22.12.0`.

- `createNestApplication({ rawBody: true })` registra `express.json({ verify })` che salva `req.rawBody = buffer` (`get-body-parser-options.util.js`). Con `RawBodyRequest<Request>` il tipo è `Buffer | undefined`. Probe: `rawIsBuffer: true`, `raw: "{\"b\":1,  \"a\":\"x\"}"` (spazi preservati), `parsedBody: {b:1,a:'x'}`; senza opzione `rawIsBuffer: false`; con `Content-Type: text/plain` `rawIsBuffer: false` ⇒ il verificatore deve trattare `rawBody` assente come **403**.
- Limite: body > 100 KB → **413** `{"statusCode":413,"message":"request entity too large"}` (loggato da `ExceptionsHandler` come ERROR); JSON malformato → **400** con il messaggio del parser. Entrambi prima del guard: nessun impatto sui payload Twitch (1–2 KB).
- Challenge (entrambe le forme sono state provate con supertest **e** con `twitch event verify-subscription` contro l'app Nest):

| Forma | status | content-type | content-length | body | CLI |
|---|---|---|---|---|---|
| `@HttpCode(200) @Header('Content-Type','text/plain')` + `return challenge` | 200 | `text/plain; charset=utf-8` | 32 | `pogchamp-kappa-360noscope-vohiyo` | ✔✔✔ |
| `@Res() res` → `res.status(200).type('text/plain').send(challenge)` | 200 | `text/plain; charset=utf-8` | 32 | idem | ✔✔✔ |

  `@Header` vale per l'intero handler: se lo stesso handler risponde anche 204/403 conviene la forma `@Res()` (o `@Res({ passthrough: true })` con `res.status(...)`; il passthrough è coerente con il codice: Nest imposta lo status di default **prima** dell'handler e `reply()` riceve `statusCode` undefined, `router-execution-context.js:155-185`; il probe ha confermato `res.status(403)` in passthrough → 403 vuoto).
- Status senza corpo informativo (probe):

| Handler | status | body |
|---|---|---|
| `throw new ForbiddenException()` | 403 | `{"message":"Forbidden","statusCode":403}` (generico, accettabile) |
| `@Res({ passthrough: true })` + `res.status(403)` | 403 | vuoto |
| `throw new InternalServerErrorException()` | 500 | `{"message":"Internal Server Error","statusCode":500}` |
| errore non HTTP (es. E11000 rilanciato) | 500 | `{"statusCode":500,"message":"Internal server error"}` **ma `ExceptionsHandler` logga a ERROR messaggio e stack** |
| `@HttpCode(204)` + `void` | 204 | vuoto |
| handler **senza** `@Public()` | 401 | `{"statusCode":401,"error":"Unauthorized","message":"Authentication required","code":"UNAUTHENTICATED"}` |

  Raccomandazione: il service non lascia mai uscire errori grezzi; logga con `describeMongoError` e il controller risponde `retryLater` → 500 generico.
- `AuthGuard` (APP_GUARD, `auth.guard.ts:24,31-37`) legge `IS_PUBLIC_KEY` con `getAllAndOverride([handler, class])`: `@Public()` sull'handler basta (probe: handler pubblico raggiunto senza bearer, non pubblico → 401).
- Whitelist: `collectPublicHandlers` produce `${instance.constructor.name}.${methodName}` ordinati con `sort()` (`test/app.int-spec.ts:88-130`). Per `EventSubController.receive` l'array diventa:
  ```ts
  const EXPECTED_PUBLIC_HANDLERS = [
      'AppController.getHello',
      'AuthResolver.exchangeLoginTicket',
      'AuthResolver.refreshSession',
      'EventSubController.receive',
      'TwitchAuthController.callback',
      'TwitchAuthController.start',
  ];
  ```
  e `publicClasses` deve restare `[]` (mai `@Public()` sulla classe).
- Il real-boot test usa `moduleRef.createNestApplication()` (`app.int-spec.ts:183`), non `main.ts`: passare `{ rawBody: true }` anche lì per specchiare la produzione.

### Q3 — Idempotenza in transazione su replica set — HIGH (empirico, 8.0.4 e 8.2.6)

Probe (codice e output in Code Examples §3):
- **(a) Riconsegna sequenziale**: secondo `deliver` → rigetta `11000`, saldo `100` (un solo credito), un solo documento.
- **(b) Concorrenza**: 40 prove alternando 2 e 8 consegne parallele dello stesso `messageId` → `{"ok":40,"11000":160}`, `trialsWithWrongOutcome 0`, fino a **8 riesecuzioni extra del callback** in una prova: i WriteConflict (112, label `TransientTransactionError`) avvengono ma il driver li ritenta dentro `withTransaction`; al chiamante arriva **solo** `MongoServerError` con `code: 11000`, `keyPattern: { messageId: 1 }`, `keyValue: { messageId: 'm-shape' }`. Conseguenze: (1) classificare con `isDuplicateKeyOn(error, 'messageId')` (`src/mongo/mongo-errors.ts:15-19`, legge `keyPattern` anche in `errorResponse`); (2) il callback può girare più volte ⇒ **nessun side effect dentro** (log a parte, push mai).
- **(c) Indice prima della transazione**: su 8.x la creazione implicita della collection dentro la transazione funziona anche in concorrenza (4/4 ok), ma **senza l'indice unico i duplicati passano** (2 documenti). L'indice è la garanzia: va creato dal verifier al boot (`createIndexes()` in `onApplicationBootstrap`, che Nest **attende** prima di `listen()`: `on-app-bootstrap.hook.js:43-51`, `nest-application.js:172-188`), e nei test va atteso prima delle gare (il harness lo fa già perché `app.listen` esegue i bootstrap hook).
- **(d) TTL + unico**: `{ messageId: 1 } unique` e `{ receivedAt: 1 } expireAfterSeconds 604800` coesistono (letti da `collection.indexes()`). Il TTL monitor gira ogni ~60 s: irrilevante per la dedup, la finestra replay è 10 min.
- La risoluzione `twitchId → _id` avviene fuori transazione (D-08); se lo User sparisce fra lookup e credito, `creditUserPoints` lancia `ResourceNotFoundException.user()` (`wallet.service.ts:112`), la transazione abortisce e il service la tratta come D-07 (204, DEBUG).

### Q4 — Lookup `twitchId → User._id` — HIGH

`User.twitchId` è `@Prop({ required: true, unique: true }) twitchId: string` (`src/models/user.model.ts:13-15`); `event.user_id` è una stringa numerica (`"22222"` nella cattura; "User ID of the user that redeemed the reward", tipo `string`). Match esatto con `userModel.findOne({ twitchId: event.user_id }, { _id: 1 }).lean()`. Validare `user_id` con `/^\d{1,20}$/` prima della query (difesa: niente oggetti/operatori in un filtro Mongo, anche se il body è firmato). Il modello `User` va registrato localmente con `MongooseModule.forFeature` come fa `PushModule` (`push.module.ts:16-21`), senza importare `UsersModule` (change stream).

### Q5 — App access token e client Helix — HIGH

- Stampo: `TwitchOAuthClient` astratta come token DI (`twitch-oauth.client.ts:21-25`) + `HttpTwitchOAuthClient` con `fetch`, `AbortSignal.timeout(5000)`, errori `TwitchOAuthError` con sola operazione e status (`http-twitch-oauth.client.ts:96-122`); test con `jest.spyOn(global, 'fetch')` (`http-twitch-oauth.client.spec.ts:24-36`).
- `TwitchHelixError` deve portare `status?: number` (il manager distingue 401/403/404/409/410) e un messaggio `"${operation} failed with status ${status}"`: mai token, secret, né il body Twitch.
- Token: `TwitchAppTokenCache` con `Clock` iniettato: `{ accessToken, expiresAt = now + expires_in·1000 }`; rinnovo se `now ≥ expiresAt − 5 min`; **single-flight** (una sola richiesta token in volo); `invalidate()` su 401 e **un solo** retry della chiamata Helix. `expires_in` mancante o ≤ 0 → token usato una volta e richiesto di nuovo alla successiva.
- Configurazione senza cicli: `EventSubConfig` contiene già `clientId`/`clientSecret` (Conflitto C6); `EventSubModule` non importa `AuthModule`. Il `Clock` va fornito localmente (`{ provide: Clock, useClass: SystemClock }`) come fa `PushModule`.
- Paginazione: ciclo `after=cursor` finché `pagination.cursor` è assente, con un tetto difensivo (es. 20 pagine) per non entrare in loop.

### Q6 — Riconciliazione e timer — HIGH

**`planReconciliation(existing, desired, callback)`** → `{ keep, remove, create }`; un `existing` "corrisponde" a un `desired` se `transport.method === 'webhook'`, `type` uguale, `version` uguale, `condition` **esattamente** `{ broadcaster_user_id }` (stesse chiavi, stesso valore). Callback confrontato dopo normalizzazione `new URL(x).href` su entrambi i lati.

| # | Esistente | Azione | Motivazione |
|---|---|---|---|
| 1 | corrisponde, `enabled`, stesso callback | keep | stato desiderato |
| 2 | corrisponde, `webhook_callback_verification_pending`, stesso callback | keep | verifica in corso (C5); il ciclo successivo vede l'esito |
| 3 | corrisponde, `webhook_callback_verification_failed` / `notification_failures_exceeded` / `authorization_revoked` / `user_removed` / `version_removed` / `moderator_removed` / `beta_maintenance` / qualunque stato sconosciuto | remove + create | D-14; uno stato futuro sconosciuto non deve bloccare il sync |
| 4 | corrisponde ma callback diverso (qualunque stato) | remove + create | D-14 (dominio cambiato); possibile solo con manager attivo (C3) |
| 5 | più `enabled` corrispondenti | keep la più vecchia, remove le altre | due subscription = message_id diversi per lo stesso evento (C7) |
| 6 | stesso `type` desiderato e stesso broadcaster ma condizione o versione diversa (es. `reward_id`) | remove | doppia consegna per quella reward (C7) |
| 7 | tipo non desiderato (es. `stream.offline`), altro broadcaster, transport non webhook | ignore (DEBUG) | il client potrebbe servire altro; non distruggere ciò che non si possiede; il webhook risponde comunque 204+WARN a un tipo inatteso |
| 8 | nessuna corrispondenza tenuta | create | D-14 |

Esecuzione: prima tutte le `remove` (404 = ok), poi le `create` (evita il 409); ogni passo isolato con try/catch e log; 409 → WARN "già esistente, la vedrà il prossimo ciclo"; 403 sulla redemption → ERROR con il rimedio D-11 ("rifare login dello streamer con `TWITCH_LOGIN_SCOPES=channel:read:redemptions`"); 400/410 → ERROR. Il risultato dettagliato (keep/remove/create con id e status, mai il secret) va a LOG/INFO: è la "verifica dello stato nel log di boot" della checklist ops.

**Single-flight**: `reconcile()` mentre un'altra è in corso restituisce la promessa in corso e marca un "rerun" da eseguire una volta alla fine (revocation e timer concorrenti non devono creare doppioni né cancellare una `pending` appena creata).

**Timer** [VERIFIED: probe unit con fake timers]: `setInterval(...).unref()` restituisce lo stesso handle (`hasRef() === false`); con `jest.useFakeTimers()` 3 h → 3 chiamate, dopo `clearInterval` nessuna; `jest.advanceTimersByTimeAsync` per drenare le promesse. `onModuleDestroy` → `clearInterval` (Nest lo chiama su `app.close()` senza `enableShutdownHooks`).

**Boot non bloccante**: `onApplicationBootstrap` **è atteso** da Nest e gira **prima** di `listen()` (`nest-application.js:172-188`): quindi `void this.reconcileSafely()` (catch → ERROR), mai `await`. Twitch invia il challenge dopo il 202 della create, quando il server è già in ascolto (race teorica, autoriparata dal ciclo orario grazie alle righe 3/8). Opzionale: primo giro differito con `setTimeout(…, 5_000).unref()`.

**CI/npm test non partono mai davvero**: (1) config assente ⇒ manager disabilitato, nessun timer, WARN; (2) nei test del modulo `overrides: [{ token: TwitchHelixClient, useValue: fakeHelix }, { token: EVENTSUB_CONFIG, useValue: testConfig }]`; (3) nel real-boot `jest.spyOn(global, 'fetch')` prima del boot e asserzione "nessuna chiamata verso `api.twitch.tv`/`id.twitch.tv`".

### Q7 — `parseEventSubConfig` fail-closed — HIGH

`EVENTSUB_ENV_KEYS = ['NODE_ENV', 'TWITCH_CLIENT_ID', 'TWITCH_CLIENT_SECRET', 'TWITCH_EVENTSUB_SECRET', 'TWITCH_EVENTSUB_CALLBACK_URL', 'TWITCH_BROADCASTER_ID']`, `readEventSubEnv = readEnvKeys(source, EVENTSUB_ENV_KEYS)` (`env-keys.ts`), provider `EVENTSUB_CONFIG` con `ConfigService` come `pushConfigProvider` (`push-config.ts:48-59`), chiamata aggiunta in `validateEnv` (`env.validation.ts`).

Regole (messaggi fissi, nominano variabile e regola, mai il valore):
1. Le tre variabili EventSub tutte vuote ⇒ `NODE_ENV=production` → throw "`TWITCH_EVENTSUB_SECRET`, `TWITCH_EVENTSUB_CALLBACK_URL` and `TWITCH_BROADCASTER_ID` are required when NODE_ENV=production"; altrimenti `{ enabled: false }` (WARN al boot da un reporter).
2. Alcune sì e altre no ⇒ throw ovunque nominando quelle mancanti.
3. `TWITCH_EVENTSUB_SECRET`: lunghezza 10–100, solo ASCII stampabile `/^[\x21-\x7E]{10,100}$/` (niente spazi: evita trim accidentali).
4. `TWITCH_EVENTSUB_CALLBACK_URL`: `new URL()` valido, niente whitespace/controlli, niente userinfo né fragment; `https:` con porta vuota o 443; `http:` solo con host `localhost`/`127.0.0.1` e `NODE_ENV !== 'production'` ⇒ `mode: 'local'` (C3).
5. `TWITCH_BROADCASTER_ID`: `/^\d{1,20}$/`.
6. `mode: 'managed'` (callback https) ⇒ `TWITCH_CLIENT_ID` e `TWITCH_CLIENT_SECRET` obbligatori (anche fuori produzione: senza, il manager non può funzionare).

`TWITCH_LOGIN_SCOPES` è un concern di login: va in `AUTH_ENV_KEYS` (`auth-config.ts:41-52`) e in `TwitchOAuthConfig.scopes: readonly string[]` (split su whitespace, filtro vuoti, dedup, ogni scope `/^[a-z0-9_]+(:[a-z0-9_]+)*$/`, throw altrimenti). `buildTwitchAuthorizeUrl` usa `scope: twitch.scopes.join(' ')` al posto di `scope: ''` (`twitch-authorize-url.ts:15`): il default vuoto mantiene il test esistente "sends an empty but present scope" (`twitch-urls.spec.ts:45-50`). Da aggiornare anche `test/auth/test-auth-config.ts:20-24` (`scopes: []`), `twitch-urls.spec.ts:13-18`, `auth-config.spec.ts:67` e il test `.env.example` (`env.validation.spec.ts:59-90`: dichiarare le chiavi nuove vuote, `validateEnv` deve passare). `env-keys.spec.ts` non richiede modifiche (la funzione è generica); va aggiunto `readEventSubEnv` "keeps only the eventsub keys" come `readPushEnv`.

Impatto su `test/app.int-spec.ts`: aggiungere a `Object.assign(process.env, …)` `TWITCH_EVENTSUB_SECRET: ''`, `TWITCH_EVENTSUB_CALLBACK_URL: ''`, `TWITCH_BROADCASTER_ID: ''`, `TWITCH_LOGIN_SCOPES: ''` (process.env vince sul `.env`, che localmente ha due di queste chiavi).

### Q8 — Side effect push — HIGH

`PushService.broadcast(message): Promise<PushDeliveryCounts>` (`push.service.ts:85-104`): transport disabilitato → `emptyDelivery()`; esito non consegnato → WARN; eccezione → catch, WARN, `topicDeliveryCounts({ delivered: false })`. **Non lancia mai**. `streamerLive()` (`push-events.ts:46-48`) produce il messaggio topic `streamer-live`. Nei test: `overrides: [{ token: PushTransport, useValue: new FakePushTransport() }]` e asserire `transport.topicSends` = `[{ topic: 'streamer-live', message: expect.objectContaining({ type: PushEventType.streamerLive }) }]` (`test/push/fake-push-transport.ts:17,55-67`). `EventSubModule` importa `PushModule` (foglia, esporta solo `PushService`).

### Q9 — Ricetta Twitch CLI e ops — HIGH (CLI provata in locale)

Twitch CLI **1.1.24** è installata (`/opt/homebrew/bin/twitch`). `trigger` e `verify-subscription` accettano il nome completo del tipo e funzionano verso `http://localhost` senza credenziali; flag utili: `-F` forward, `-s` secret (10–100), `-t` broadcaster (to-user), `-f` viewer (from-user), `-C` costo, `-I` **Message-Id** (riconsegna simulata), `--timestamp` (RFC3339Nano, replay), `-r` stato subscription (`authorization_revoked` ⇒ messaggio `revocation`), `-b` broadcaster per `verify-subscription`, `-D` ignora la config salvata [VERIFIED: `twitch event trigger --help`, probe].

```bash
# secret (64 caratteri, nel range 10–100)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# id del canale (richiede `twitch configure` + `twitch token` con le chiavi dell'app; fatto dall'utente)
twitch api get users -q login=lordreavor          # → data[0].id
# webhook locale (mode 'local': nessuna chiamata Helix)
CB=http://localhost:3000/webhooks/twitch/eventsub
twitch event verify-subscription channel.channel_points_custom_reward_redemption.add -F $CB -s "$SECRET" -b "$BID" -D   # ✔ ✔ ✔
twitch event trigger channel.channel_points_custom_reward_redemption.add -F $CB -s "$SECRET" -t "$BID" -f "<twitchId di un utente loggato>" -C 250 -I dup-1 -D   # 204, +250
# stesso comando con -I dup-1 → 204, nessun nuovo credito
twitch event trigger channel.channel_points_custom_reward_redemption.add -F $CB -s "$SECRET" -t "$BID" -f "<twitchId>" --timestamp 2026-01-01T00:00:00.000000000Z -D   # 403 (replay)
twitch event trigger channel.channel_points_custom_reward_redemption.add -F $CB -s wrong-secret-123 -t "$BID" -D   # 403
twitch event trigger stream.online -F $CB -s "$SECRET" -t "$BID" -D                        # 204 + push topic
twitch event trigger channel.channel_points_custom_reward_redemption.add -F $CB -s "$SECRET" -t "$BID" -r authorization_revoked -D   # revocation → 204 + ERROR
```

E2E reale con Twitch (manuale): tunnel HTTPS sulla porta 443 verso `localhost:3000` (`cloudflared tunnel --url http://localhost:3000` o `ngrok http 3000`, **nessuno dei due è installato**: `brew install cloudflared`), oppure deploy su staging HTTPS. Checklist ops (handoff D-19): app Twitch dedicata all'ambiente (C3); `TWITCH_CLIENT_ID/SECRET`; URL HTTPS pubblico senza redirect; `TWITCH_BROADCASTER_ID`; secret generato; **login dello streamer una volta con `TWITCH_LOGIN_SCOPES=channel:read:redemptions`** (poi la variabile si può svuotare: con la variabile impostata anche ogni viewer vedrebbe la richiesta di consenso); verificare nel log del reconcile `enabled` per entrambe; ogni custom reward con **"Salta la coda delle richieste"** (Pitfall 10); rotazione del secret = cancellare le subscription (Pitfall 12).

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@nestjs/core` / `@nestjs/platform-express` | 11.1.6 (installato) | `rawBody: true`, `RawBodyRequest`, `@Res()` | già nel progetto; supporto nativo del raw body |
| `node:crypto` | Node 22.12.0 | `createHmac('sha256')`, `timingSafeEqual` | primitive standard, nessuna dipendenza |
| `fetch` globale | Node 22 | Helix + token endpoint | stesso pattern di `HttpTwitchOAuthClient` |
| `mongoose` | 8.18.1 | transazione dedup+credito, indici unici + TTL | già in uso; replica set già richiesto |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `supertest` | 7.1.4 | richieste firmate verso il webhook nei test | integrazione |
| Twitch CLI | 1.1.24 (fuori npm) | mock firmati, challenge, revocation | test manuali / UAT locale |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `fetch` nativo | `@twurple/api` + `@twurple/auth` 8.x | tipi Helix e gestione token pronti, ma dipendenza pesante per tre chiamate; scartato dal CONTEXT (D-13) |
| HMAC manuale | `@twurple/eventsub-http` | vuole un proprio listener; incompatibile con il controller Nest e il rawBody globale |
| timer `setInterval` | `@nestjs/schedule` | non presente, non serve (CONTEXT) |

**Installazione:** nessuna.

## Architecture Patterns

### Recommended Project Structure
```
src/config/
├── eventsub-config.ts (+ .spec.ts)        # parseEventSubConfig, readEventSubEnv, EVENTSUB_CONFIG provider
└── auth-config.ts                          # + TWITCH_LOGIN_SCOPES → TwitchOAuthConfig.scopes
src/auth/twitch/twitch-authorize-url.ts     # scope: twitch.scopes.join(' ')
src/eventsub/
├── eventsub.module.ts                      # imports EconomyModule, PushModule, forFeature(User, EventSubMessage)
├── eventsub.controller.ts                  # POST /webhooks/twitch/eventsub, @Public() su receive, @Res()
├── eventsub-headers.ts (+ spec)            # readEventSubHeaders(headers) → tipizzati o null
├── eventsub-signature.ts (+ spec)          # verifyEventSubSignature(headers, rawBody, secret, now)
├── eventsub-payload.ts (+ spec)            # parseRedemptionEvent / parseStreamOnlineEvent / parseRevocation
├── eventsub-webhook.service.ts (+ spec)    # routing → WebhookReply
├── points-credit.service.ts                # transazione dedup + creditUserPoints
├── eventsub-message.model.ts               # eventsub_messages (+ indici)
├── eventsub-message-index.verifier.ts (+ spec)
├── eventsub-startup.reporter.ts (+ spec)   # WARN disabled / WARN local mode / INFO managed
├── helix/
│   ├── twitch-helix.client.ts              # porta astratta + tipi + TwitchHelixError
│   ├── http-twitch-helix.client.ts (+ spec)
│   └── twitch-app-token.cache.ts (+ spec)
└── subscriptions/
    ├── plan-reconciliation.ts (+ spec)     # funzione pura a tabella
    └── eventsub-subscription.manager.ts (+ spec)
test/eventsub/
├── fake-twitch-helix.client.ts             # in memoria, registra chiamate, simula 403/409/404
└── signed-eventsub-request.ts              # helper: firma e invia con supertest
```

### Pattern 1: risposta discriminata, controller sottile
**What:** il service restituisce `WebhookReply = { kind: 'challenge'; challenge: string } | { kind: 'noContent' } | { kind: 'forbidden' } | { kind: 'retryLater' }`; il controller con `@Res()` lo traduce in `200 text/plain` / `204` / `403` / `500`. **When:** sempre, così il routing è testabile in unit senza HTTP e il controller non contiene logica.

### Pattern 2: ordine dei controlli nel service
1. `config.enabled` falso o `rawBody` assente o header mancanti ⇒ `forbidden`.
2. firma non valida o timestamp fuori finestra ⇒ `forbidden` (WARN con solo `messageId` se presente).
3. `webhook_callback_verification` ⇒ `challenge` (stringa non vuota, altrimenti `forbidden`).
4. `revocation` ⇒ ERROR `{ type, status, subscriptionId }`, `void manager.reconcileSafely()`, `noContent`.
5. `notification` ⇒ per `Subscription-Type`; tipo sconosciuto ⇒ WARN, `noContent`.
6. broadcaster ≠ config ⇒ WARN, `noContent`.
7. redemption: payload non valido ⇒ ERROR, `noContent`; utente assente ⇒ DEBUG, `noContent`; transazione: ok ⇒ INFO `credited`; duplicato ⇒ INFO/DEBUG `duplicate`, `noContent`; utente sparito ⇒ DEBUG, `noContent`; altro errore ⇒ ERROR `describeMongoError`, `retryLater`.
8. stream.online: insert singolo (nessuna transazione: un solo documento) ⇒ duplicato ⇒ `noContent` senza push; errore DB ⇒ `retryLater`; ok ⇒ `void push.broadcast(streamerLive())` (C1), `noContent`.

### Pattern 3: manager con porta e config iniettate
`EventSubSubscriptionManager` implementa `OnApplicationBootstrap` (avvio timer + `void reconcileSafely()` solo se `mode === 'managed'`) e `OnModuleDestroy` (`clearInterval`); `reconcile()` pubblico per i test e per la revocation; single-flight.

### Anti-Patterns to Avoid
- **`JSON.stringify(req.body)` per la firma:** i byte differiscono (Pitfall 7 di milestone); usare solo `req.rawBody`.
- **`===` sulla firma o `timingSafeEqual` senza controllo di lunghezza:** il secondo lancia `RangeError` su buffer di lunghezza diversa.
- **Push o log rumorosi dentro `connection.transaction`:** il callback può rigirare fino a 8+ volte (probe).
- **`await` del reconcile in `onApplicationBootstrap`:** blocca l'avvio e il server non è ancora in ascolto per il challenge.
- **Reconcile con callback locale:** cancella subscription di altri ambienti (C3).
- **Rilanciare l'errore grezzo dal controller:** `ExceptionsHandler` lo logga con stack; mappare a `retryLater`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Lettura del body grezzo | middleware `express.raw` per rotta, stream manuale | `rawBody: true` di Nest | un solo body parser, `req.body` resta parsato |
| Dedup concorrente | lock applicativi, `findOne` + `insert` | indice unico + E11000 nella transazione | il server serializza; misurato 0 errori su 40 gare |
| Retry dei WriteConflict | loop manuali | `connection.transaction` (withTransaction del driver) | già ritenta le label transitorie |
| Classificazione E11000 | parsing del messaggio | `isDuplicateKeyOn(error, path)` (`src/mongo/mongo-errors.ts`) | legge `keyPattern`, già testato nel repo |
| Saldo | `$inc` diretto sul modello User | `WalletService.creditUserPoints(userId, amount, session)` | unico scrittore (04 D-04), valida l'importo |
| Firma test | fixture statiche | `createHmac` nel test, CLI per il manuale | vettori sempre coerenti con il secret di test |

**Key insight:** tutto ciò che è delicato (raw body, serializzazione concorrente, retry transitori) è già risolto da Nest, MongoDB e dal repo; il codice nuovo è quasi solo funzioni pure e cablaggio.

## Common Pitfalls

### Pitfall 1: firma calcolata sul body ri-serializzato
**What goes wrong:** firma sempre diversa o, peggio, verifica bypassata. **How to avoid:** `createHmac('sha256', secret).update(id).update(timestamp).update(rawBody)`; test con un body che contiene spazi e ordine di chiavi non canonico. **Warning signs:** la CLI riceve 403 con il secret giusto.

### Pitfall 2: `timingSafeEqual` su lunghezze diverse
Lancia `RangeError` ⇒ 500 invece di 403. Confrontare prima la lunghezza dei due `Buffer` (stessa codifica) e restituire `false`.

### Pitfall 3: `rawBody` assente nei test o nel real boot
Il harness (`test/auth/auth-test-app.ts:116`) e `app.int-spec.ts:183` chiamano `createNestApplication()` senza opzioni ⇒ `req.rawBody` undefined ⇒ tutto 403. Passare `{ rawBody: true }` (sempre nel harness: retrocompatibile, specchia `main.ts`).

### Pitfall 4: timestamp malformato o futuro
`Date.parse` restituisce `NaN` ⇒ 403; tolleranza nel futuro **60 s** (scelta: orologi NTP; la doc fissa solo il limite di 10 min nel passato). Le frazioni a 9 cifre sono accettate da Node 22 (verificato).

### Pitfall 5: indice unico non ancora costruito
Senza indice i duplicati passano (probe). Verifier al boot, ERROR se fallisce; nei test di concorrenza assicurarsi che `app.listen()` (bootstrap hook) sia completato prima delle gare.

### Pitfall 6: side effect nel callback della transazione
Il callback rigira sui WriteConflict (fino a 8 volte nel probe). Log di esito e push **dopo** il commit.

### Pitfall 7: utente cancellato tra lookup e credito
`ResourceNotFoundException.user()` dalla transazione ⇒ trattarlo come D-07 (204, DEBUG), non come 500 (Twitch ritenterebbe all'infinito).

### Pitfall 8: doppie subscription ⇒ doppio credito
Message-id diversi per la stessa redemption (C7). `eventId` unico + reconcile che cancella le condizioni non esatte.

### Pitfall 9: callback normalizzato da Twitch
Un confronto stringa puro potrebbe vedere "callback diverso" a ogni ciclo e cancellare/ricreare ogni ora. Normalizzare con `new URL().href` e testare il caso slash finale. **Warning signs:** subscription con `created_at` sempre recente.

### Pitfall 10: rimborso manuale della redemption = punti gratis
Se una reward non salta la coda, lo streamer può rifiutarla dalla coda e Twitch restituisce i punti canale, mentre i `twitchPoints` restano accreditati (nessuna subscription `.update`, BE-FUT-05 differito). Checklist ops: tutte le reward con "salta la coda" (redemption `fulfilled` subito, non rimborsabile).

### Pitfall 11: reconcile concorrenti
Revocation + timer + boot ⇒ doppie create (409) o delete di una `pending` appena creata. Single-flight + regola `pending ⇒ keep`.

### Pitfall 12: rotazione del secret
Helix non restituisce il secret delle subscription esistenti: dopo un cambio di `TWITCH_EVENTSUB_SECRET` le `enabled` continuano a firmare con il vecchio ⇒ tutte 403 ⇒ `notification_failures_exceeded` dopo un periodo non documentato. Procedura nel handoff: cancellare le subscription (`twitch api delete /eventsub/subscriptions -q id=<id>`) e riavviare, così il reconcile le ricrea con il secret nuovo.

### Pitfall 13: `.env` locale parziale e real-boot test
Vedi C2: boot locale rifiutato; nel real boot azzerare tutte le variabili nuove.

### Pitfall 14: scope richiesto a tutti i viewer
Con `TWITCH_LOGIN_SCOPES` impostata ogni login mostra il consenso `channel:read:redemptions`. Impostarla solo per il login dello streamer, poi svuotarla (D-11 lo consente).

### Pitfall 15: GraphQL `Int` a 32 bit
`User.twitchPoints` è `@Field(() => Int)` (`user.model.ts:17-19`); `reward.cost` non ha massimo documentato. Oltre 2 147 483 647 la serializzazione di `me`/`userUpdated` fallirebbe. Rischio pratico trascurabile; annotarlo nel handoff, nessun codice in questa fase.

### Pitfall 16: errore grezzo loggato con stack
Un errore non HTTP che esce dal controller viene loggato da `ExceptionsHandler` con messaggio e stack (probe). Il messaggio E11000 contiene il valore duplicato (un messageId, non un secret), ma il pattern del repo è loggare solo nome+codice (`describeMongoError`).

### Pitfall 17: tooling (vincolante)
Mai `npm run lint`; il comando di baseline lint deve filtrare le **righe d'errore**, non solo i nomi file (vedi Validation Architecture).

## Code Examples

### §1 Verifica firma (src/eventsub/eventsub-signature.ts)
```ts
import { createHmac, timingSafeEqual } from 'node:crypto';

export const REPLAY_WINDOW_MS = 10 * 60 * 1000; // dev.twitch.tv/docs/eventsub "isn't older than 10 minutes"
export const MAX_FUTURE_SKEW_MS = 60 * 1000;
const SIGNATURE_PREFIX = 'sha256=';

export interface SignedHeaders {
    messageId: string;
    timestamp: string;
    signature: string;
}

export function verifyEventSubSignature(
    headers: SignedHeaders,
    rawBody: Buffer | undefined,
    secret: string,
    now: Date,
): boolean {
    if (!rawBody || !secret) return false;
    const expected = Buffer.from(
        SIGNATURE_PREFIX +
            createHmac('sha256', secret)
                .update(headers.messageId)
                .update(headers.timestamp)
                .update(rawBody)
                .digest('hex'),
    );
    const received = Buffer.from(headers.signature);
    if (expected.length !== received.length) return false;
    if (!timingSafeEqual(expected, received)) return false;
    return isWithinReplayWindow(headers.timestamp, now);
}

function isWithinReplayWindow(timestamp: string, now: Date): boolean {
    const sentAt = Date.parse(timestamp);
    if (!Number.isFinite(sentAt)) return false;
    const age = now.getTime() - sentAt;
    return age <= REPLAY_WINDOW_MS && -age <= MAX_FUTURE_SKEW_MS;
}
```
Vettore di test (in spec): `sign = (id, ts, body) => 'sha256=' + createHmac('sha256', SECRET).update(id + ts + body).digest('hex')`.

### §2 Controller sottile (src/eventsub/eventsub.controller.ts)
```ts
@Controller('webhooks/twitch')
export class EventSubController {
    constructor(private readonly webhook: EventSubWebhookService) {}

    // @Public() solo sull'handler (Phase 2 D-12): la fiducia è la firma HMAC
    @Public()
    @Post('eventsub')
    async receive(
        @Req() req: RawBodyRequest<Request>,
        @Res() res: Response,
    ): Promise<void> {
        const reply = await this.webhook.handle(req.headers, req.rawBody, req.body);
        switch (reply.kind) {
            case 'challenge':
                res.status(HttpStatus.OK).type('text/plain').send(reply.challenge);
                return;
            case 'noContent':
                res.status(HttpStatus.NO_CONTENT).end();
                return;
            case 'forbidden':
                res.status(HttpStatus.FORBIDDEN).end();
                return;
            case 'retryLater':
                res.status(HttpStatus.INTERNAL_SERVER_ERROR).end();
        }
    }
}
```

### §3 Probe transazionale (spec usa-e-getta, cancellato) e output
```ts
const msgSchema = new Schema({ messageId: { type: String, required: true }, amount: Number,
    receivedAt: { type: Date, required: true } }, { collection: 'probe_eventsub_messages', versionKey: false });
msgSchema.index({ messageId: 1 }, { unique: true });
msgSchema.index({ receivedAt: 1 }, { expireAfterSeconds: 604800 });

async function deliver(userId, messageId, amount, attempts) {
    await mongoose.connection.transaction(async (session) => {
        attempts.n += 1;
        await Msg.create([{ messageId, amount, receivedAt: new Date() }], { session });
        await User.findOneAndUpdate({ _id: userId }, { $inc: { twitchPoints: amount } }, { session, new: true });
    });
}
// beforeAll: await Msg.createCollection(); await Msg.init();
// (b) 40 prove: N = 2 o 8 consegne parallele dello stesso messageId via Promise.allSettled
```
Output (identico con `MONGOMS_VERSION=8.0.4` e con 8.2.6):
```
INDEXES [{"key":{"_id":1}},{"key":{"messageId":1},"name":"messageId_1","unique":true},{"key":{"receivedAt":1},"name":"receivedAt_1","expireAfterSeconds":604800}]
SEQ points 100 secondError 11000/undefined/[] attempts 2 msgs 1
CONC {"ok":40,"11000/undefined/[]":160} trialsWithWrongOutcome 0 maxExtraCallbackRuns 8
IMPLICIT-CREATE single ok
IMPLICIT-CREATE concurrent ["ok","ok","ok","ok"] docs 4
NO-UNIQUE duplicates stored 2
SHAPE MongoServerError {"messageId":1} {"messageId":"m-shape"} E11000 duplicate key error collection: test.probe_eventsub_messages index: messageId_1 dup key: { messageId: "m-shape" }
```

### §4 Credito idempotente (src/eventsub/points-credit.service.ts, forma raccomandata)
```ts
async credit(redemption: RedemptionEvent, messageId: string, receivedAt: Date): Promise<CreditOutcome> {
    const user = await this.userModel
        .findOne({ twitchId: redemption.userId }, { _id: 1 })
        .lean<{ _id: Types.ObjectId } | null>()
        .exec();
    if (!user) return CreditOutcome.unknownViewer; // D-07: nessuna traccia, log DEBUG
    try {
        await this.connection.transaction(async (session) => {
            await this.messageModel.create(
                [{ messageId, eventId: redemption.id, type: REDEMPTION_ADD, twitchUserId: redemption.userId,
                   rewardId: redemption.rewardId, amount: redemption.cost, outcome: 'credited', receivedAt }],
                { session },
            );
            await this.wallet.creditUserPoints(user._id, redemption.cost, session);
        });
        return CreditOutcome.credited;
    } catch (error) {
        if (isDuplicateKeyOn(error, 'messageId') || isDuplicateKeyOn(error, 'eventId')) return CreditOutcome.duplicate;
        if (error instanceof ResourceNotFoundException) return CreditOutcome.unknownViewer;
        throw error; // il service logga describeMongoError e risponde retryLater (500)
    }
}
```
Modello: `@Schema({ collection: 'eventsub_messages', versionKey: false })`, indici `{ messageId: 1 } unique`, `{ type: 1, eventId: 1 } unique` con `partialFilterExpression: { eventId: { $type: 'string' } }`, `{ receivedAt: 1 } expireAfterSeconds: 604_800`.

### §5 Probe HTTP (spec usa-e-getta, cancellato): output
```
RAW 204 "" {"rawIsBuffer":true,"raw":"{\"b\":1,  \"a\":\"x\"}","parsedBody":{"b":1,"a":"x"},"headerLower":"ID-1"}
NORAW 204 {"rawIsBuffer":false,"parsedBody":{"b":1,"a":"x"}}
RAW text/plain 204 {"rawIsBuffer":false}
RAW 120KB 413 {"statusCode":413,"message":"request entity too large"}
CHALLENGE header 200 text/plain; charset=utf-8 32 "pogchamp-kappa-360noscope-vohiyo"
CHALLENGE res 200 text/plain; charset=utf-8 32 "pogchamp-kappa-360noscope-vohiyo"
ERR forbidden 403 application/json; charset=utf-8 "{\"message\":\"Forbidden\",\"statusCode\":403}"
ERR passthrough403 403 undefined ""
ERR guarded 401 … "code":"UNAUTHENTICATED"
CLI cli       ✔ Valid response … ✔ Valid content-type header. Received type text/plain with charset utf-8 ✔ Valid status code. Received status 200
CLI cliheader ✔ Valid response … ✔ … ✔ …   (firma ricalcolata da req.rawBody: true per entrambi)
```
App di prova: `Test.createTestingModule({ imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }), MongooseModule.forRoot(MONGO_TEST_URI), PubSubModule, AuthModule], controllers: [ProbeController] })` + override `AUTH_CONFIG`/`TwitchOAuthClient` + `createNestApplication({ rawBody: true })`; CLI lanciata con `execFile` **asincrono** (un `execFileSync` bloccherebbe l'event loop del server).

### §6 Override nei test d'integrazione
```ts
const helix = new FakeTwitchHelixClient();
const push = new FakePushTransport();
const harness = await createAuthTestApp({
    imports: [EventSubModule],
    overrides: [
        { token: EVENTSUB_CONFIG, useValue: buildTestEventSubConfig({ mode: 'managed' }) },
        { token: TwitchHelixClient, useValue: helix },
        { token: PushTransport, useValue: push },
    ],
}); // createAuthTestApp esteso con createNestApplication({ rawBody: true })
```
Con config `managed` nei test il boot avvia il reconcile sul fake: i test che ne contano le chiamate devono azzerare `helix` dopo il boot o usare una config con timer disabilitato (es. `reconcileIntervalMs: 0` = nessun timer; discrezione D-14 "costante o variabile").

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| PubSub Twitch per i punti canale | EventSub (webhook/WebSocket/conduit) | PubSub dismesso nel 2025 [ASSUMED] | EventSub è l'unica via |
| Webhook con user token | App access token per webhook, user token solo per WebSocket | doc attuale | D-13 corretto |

**Deprecated/outdated:** il pacchetto `twurple` nudo (placeholder, STACK.md).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | La `revoke` del token utente fatta dal BE subito dopo la validate non provoca `authorization_revoked` né il 403 sulla create | Conflitto C4 | Subscription redemption impossibile: applicare il fallback (niente revoke per i token con lo scope) |
| A2 | Il body di errore Helix per lo scope mancante contiene un `message` tipo "subscription missing proper authorization" | Q6 | Nessuno: il manager decide sullo status 403, non sul testo |
| A3 | Twitch non normalizza il callback in modo diverso da `new URL().href` | Pitfall 9 | Delete/create ogni ora: visibile nel log, correggibile |
| A4 | Le subscription non-enabled non bloccano la create (forum, ~2021) | Q6 riga 3 | Con il delete preventivo il rischio è nullo |
| A5 | PubSub dismesso nel 2025 | State of the Art | Nessuno sul piano |
| A6 | Il numero di retry di Twitch su 5xx non è noto; un DB giù a lungo porta a `notification_failures_exceeded` | D-04 | Eventi persi nell'intervallo (riconciliazione redemption differita) |

## Open Questions (RESOLVED)

1. **`@Header` o `@Res()` per il challenge?**
   - RESOLVED: entrambe validate dalla CLI; si usa `@Res()` (§2) perché lo stesso handler risponde anche 204/403/500 e `@Header` varrebbe per tutte le risposte.
2. **Che codice arriva al perdente di una consegna concorrente: 11000 o 112?**
   - RESOLVED (probe, 8.0.4 e 8.2.6): sempre 11000; il 112 è ritentato dal driver dentro `connection.transaction`.
3. **Serve pre-creare la collection prima della transazione?**
   - RESOLVED: su 8.x la creazione implicita in transazione funziona anche in concorrenza; ciò che serve davvero è l'**indice unico** già costruito ⇒ verifier al boot (`createIndexes()` crea collection e indici) e asserzione degli indici nel test d'integrazione.
4. **Stato `webhook_callback_verification_pending` nel piano?**
   - RESOLVED: keep (C5).
5. **Subscription di tipo non desiderato con lo stesso callback: delete o ignore?**
   - RESOLVED: ignore (riga 7): non si distrugge ciò che non si possiede e il webhook le gestisce con 204+WARN; si cancellano invece le varianti dei tipi desiderati (riga 6) perché causano doppio credito.
6. **Callback `http://localhost`: il manager chiama Helix?**
   - RESOLVED: no, modalità locale (C3).
7. **Credenziali per l'app token da `AUTH_CONFIG` o da env?**
   - RESOLVED: da env dentro `parseEventSubConfig` (C6).
8. **Tolleranza nel futuro del timestamp?**
   - RESOLVED: 60 s (discrezione, Pitfall 4).
9. **Timer orario: costante o env?**
   - RESOLVED: costante `RECONCILE_INTERVAL_MS = 60 * 60 * 1000` dentro `EventSubConfig` (non da env), sovrascrivibile nei test tramite l'override della config; `0` = nessun timer.
10. **`await` del broadcast su `stream.online`?**
    - RESOLVED: `void` dopo l'insert del record (C1), da confermare dall'utente in fase di plan-check perché ritocca la lettera di D-15.
11. **La revoke del token dello streamer rompe l'autorizzazione?**
    - RESOLVED come procedura: verifica nella UAT manuale con il fallback pronto (C4); il piano include il test unit del fallback solo se la UAT fallisce (nessun codice preventivo).
12. **Rotazione del secret automatica?**
    - RESOLVED: procedura manuale documentata (Pitfall 12); nessun meccanismo automatico in questa fase.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | runtime/test | ✓ | v22.12.0 | — |
| mongod (mongodb-memory-server) | integrazione | ✓ | 8.0.4 (pin CI) e 8.2.6 in cache | — |
| Redis (redis-memory-server / service CI) | real-boot test | ✓ | baseline integrazione verde | — |
| Twitch CLI | test manuali | ✓ | 1.1.24 | — |
| ngrok / cloudflared | E2E con Twitch reale | ✗ | — | `brew install cloudflared` o staging HTTPS |
| Chiavi Twitch nel `.env` locale | E2E | parziale | presenti `TWITCH_CLIENT_ID/SECRET/REDIRECT_URI`, `TWITCH_EVENTSUB_SECRET`, `TWITCH_BROADCASTER_ID`; **manca** `TWITCH_EVENTSUB_CALLBACK_URL` | aggiungerla (C2) |

**Missing dependencies with no fallback:** nessuna per il codice e la CI. **With fallback:** tunnel HTTPS solo per l'E2E manuale.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 30 + ts-jest 29. Progetto `unit` (`src/**/*.spec.ts`, `test/**/*.spec.ts`) e `integration` (`*.int-spec.ts`, `MongoMemoryReplSet` globale, `after-env.ts`) |
| Config file | `package.json` → `jest.projects` |
| Quick run command | `npx jest src/eventsub src/config src/auth/twitch --selectProjects unit` |
| Integration command | `npx jest src/eventsub test/app.int-spec.ts --selectProjects integration --runInBand` |
| Full suite command | `npm run test:unit && npm run test:int` |

**Baseline misurate (2026-10-19, branch pulito su 83c71cb):**
- `npx jest --selectProjects unit` → **66 suite, 810 test**, tutti verdi (3,7 s)
- `npx jest --selectProjects integration --runInBand` → **43 suite, 515 test**, tutti verdi (77 s)
- `npm run build` → exit 0
- `npx eslint "{src,apps,libs,test}/**/*.ts" --quiet | grep -vE "prettier/prettier|prefer-const"` → **non** è vuoto alla lettera: stampa i nomi dei 92 file con errori di formato pre-esistenti e la riga di riepilogo (481 errori, tutti `prettier/prettier`/`prefer-const`). Il comando corretto per il gate è
  `npx eslint "{src,apps,libs,test}/**/*.ts" --quiet | grep -E "^\s+[0-9]+:[0-9]+" | grep -vE "prettier/prettier|prefer-const"` → **0 righe** (baseline), deve restare 0; più `npx eslint <file toccati>` pulito.

### Phase Requirements → Test Map
| Req / D | Behavior | Type | File | Automated Command | RED before impl | Exists? |
|---|---|---|---|---|---|---|
| D-12 / C3 / C6 | `parseEventSubConfig`: tutte vuote → disabled in dev, throw in production (anche senza `TWITCH_CLIENT_ID/SECRET`); parziale → throw nominando le mancanti; secret 9/10/100/101 caratteri e non ASCII → throw; callback `https` ok, `https:8443` throw, `http://localhost` → `mode 'local'` fuori prod e throw in prod, userinfo/fragment/spazi throw; broadcaster non numerico throw; `managed` senza client id/secret throw; nessun messaggio contiene il valore | unit | `src/config/eventsub-config.spec.ts` | `npx jest src/config/eventsub-config.spec.ts --selectProjects unit` | modulo mancante | ❌ Wave 0 |
| D-12 / D-18 | `validateEnv` throw in production senza EventSub; `.env.example` dichiara le quattro chiavi vuote e passa `validateEnv`; `readEventSubEnv` tiene solo le sue chiavi | unit | `src/config/env.validation.spec.ts` (estendere) | `npx jest src/config --selectProjects unit` | chiavi mancanti | ✅ estendere |
| D-11 | `TWITCH_LOGIN_SCOPES`: vuota → `scope=` presente e vuoto; `"channel:read:redemptions"` → `scope=channel%3Aread%3Aredemptions`; due scope → separati da `+`; scope malformato → throw al parse | unit | `src/auth/twitch/twitch-urls.spec.ts`, `src/config/auth-config.spec.ts` (estendere) | `npx jest src/auth/twitch src/config --selectProjects unit` | campo assente | ✅ estendere |
| BE-POINTS-01 / D-02 | `verifyEventSubSignature`: valida; firma errata; firma di lunghezza diversa (no throw); prefisso mancante; rawBody assente; secret vuoto; timestamp 11 min fa; 9 min fa ok; +61 s nel futuro; `NaN`; body con spazi firmato sui byte | unit | `src/eventsub/eventsub-signature.spec.ts` | `npx jest src/eventsub --selectProjects unit` | modulo mancante | ❌ |
| BE-POINTS-01 | `readEventSubHeaders`: header mancanti/array/vuoti → null | unit | `src/eventsub/eventsub-headers.spec.ts` | idem | mancante | ❌ |
| D-04 / D-06 | payload redemption: `user_id` non numerico, `reward.cost` 0/-1/1.5/stringa/`2**53` → invalid; `event.id`/`reward.id` mancanti → invalid; stream.online ogni `type` valido; revocation `status`/`type` | unit | `src/eventsub/eventsub-payload.spec.ts` | idem | mancante | ❌ |
| D-03 / D-04 / D-07 / C1 | `EventSubWebhookService` con fake: ordine dei controlli (firma prima del challenge), challenge → `challenge`, revocation → reconcile chiamato + `noContent`, tipo sconosciuto → WARN, broadcaster diverso → WARN senza credito, viewer sconosciuto → nessun log sopra DEBUG, errore DB → `retryLater`, duplicato → `noContent`, stream.online → broadcast non atteso | unit | `src/eventsub/eventsub-webhook.service.spec.ts` | idem | mancante | ❌ |
| D-14 / C5 / C7 | `planReconciliation` a tabella (righe 1–8 di Q6, callback con slash finale, condition come stringa JSON) | unit | `src/eventsub/subscriptions/plan-reconciliation.spec.ts` | idem | mancante | ❌ |
| D-14 | manager: deletes prima delle create; 404 ok; 409 WARN; 403 ERROR con rimedio; single-flight (due reconcile concorrenti → una lista); boot non atteso (`onApplicationBootstrap` risolve prima del reconcile); timer 60 min con fake timers; `onModuleDestroy` pulisce; `mode 'local'`/disabled → nessuna chiamata | unit | `src/eventsub/subscriptions/eventsub-subscription.manager.spec.ts` | idem | mancante | ❌ |
| D-13 | `HttpTwitchHelixClient` (fetch spy): header `Client-Id` + `Bearer`, body JSON della create, paginazione a cursore, DELETE `?id=`, 401 → nuovo token e un solo retry, errori con status senza token/secret; `TwitchAppTokenCache`: riuso, rinnovo a 5 min dalla scadenza, single-flight | unit | `src/eventsub/helix/*.spec.ts` | idem | mancante | ❌ |
| D-09 | verifier: `createIndexes` e ERROR senza throw | unit | `src/eventsub/eventsub-message-index.verifier.spec.ts` | idem | mancante | ❌ |
| BE-POINTS-01 | wire: challenge firmato → 200 `text/plain` con il solo challenge; firma errata → 403 e nessuna scrittura; timestamp vecchio → 403; senza header → 403; config disabled → 403 | integration | `src/eventsub/eventsub.controller.int-spec.ts` | `npx jest src/eventsub/eventsub.controller.int-spec.ts --selectProjects integration --runInBand` | mancante | ❌ |
| BE-POINTS-02 | wire: redemption → `twitchPoints += cost` e documento `eventsub_messages` (outcome `credited`); stesso message_id → un credito; **5 consegne concorrenti** → un credito; stesso `event.id` con message_id diverso → un credito (C7); viewer sconosciuto → 204, nessun documento; broadcaster diverso → 204, nessun credito; indici presenti (unico messageId, unico parziale type+eventId, TTL 604800) | integration | stesso file | stesso comando | mancante | ❌ |
| BE-POINTS-03 / D-15 | wire: `stream.online` → un `topicSends` `streamer-live`, documento outcome `broadcast`; riconsegna → nessun secondo push; `revocation` → il fake Helix riceve delete+create per il tipo revocato | integration | stesso file | stesso comando | mancante | ❌ |
| D-01 / D-16 / D-17 | real boot: `EventSubController.receive` in `EXPECTED_PUBLIC_HANDLERS`, nessuna classe pubblica; env EventSub vuote → manager disabilitato, nessuna `fetch` verso Twitch; `POST /webhooks/twitch/eventsub` → 403; schema senza diff | integration + CI | `test/app.int-spec.ts` (estendere) | `npx jest test/app.int-spec.ts --selectProjects integration --runInBand && git diff --exit-code src/schema.gql` | whitelist RED | ✅ estendere |
| D-19 | BACKEND-NOTES: FE (nulla da chiamare, `userUpdated`, push), ops checklist (C2, C3, C4, Pitfall 10/12/14), codici/esiti di log, ledger, note Phase 10 | manual review | `.planning/phases/06-…/BACKEND-NOTES.md` | — | mancante | ❌ |
| BE-POINTS-01..03 (Twitch reale) | ricetta CLI locale (Q9) e E2E con tunnel: redemption reale accredita, stream reale invia il push, log reconcile `enabled` ×2 | **manual-only** | — | — | servono chiavi, tunnel, login streamer | manuale |

### Sampling Rate
- **Per task commit:** gli spec unit toccati con `--selectProjects unit` più il singolo int-spec toccato con `--selectProjects integration --runInBand`.
- **Per wave merge:** `npx jest src/eventsub src/config src/auth/twitch --selectProjects unit` e `npx jest src/eventsub test/app.int-spec.ts --selectProjects integration --runInBand`.
- **Phase gate:** `npm run test:unit && npm run test:int` verdi (attese ≥ 66+N suite unit, ≥ 43+N integrazione); `npm run build`; il comando lint filtrato sulle righe → 0; `npx eslint <file toccati>`; `git diff --exit-code src/schema.gql`; `git grep -nE "TWITCH_EVENTSUB_SECRET=.+" -- .env.example` vuoto; poi `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `test/auth/auth-test-app.ts`: `createNestApplication({ rawBody: true })` (retrocompatibile)
- [ ] `test/eventsub/fake-twitch-helix.client.ts`, `test/eventsub/signed-eventsub-request.ts`, `buildTestEventSubConfig`
- [ ] `src/config/eventsub-config.ts` scheletro + spec
- [ ] `test/app.int-spec.ts`: whitelist RED con `EventSubController.receive` + env vuote
- Framework install: nessuno

## Security Domain

### Applicable ASVS Categories (L1)

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no (nessun utente) | — |
| V3 Session Management | no | — |
| V4 Access Control | sì | `@Public()` enumerato per handler + firma HMAC come unica fiducia; credito solo per `broadcaster_user_id` configurato |
| V5 Input Validation | sì | parser puri del payload (id numerici, costo intero positivo sicuro), nessun valore del body in un filtro senza validazione |
| V6 Cryptography | sì | `node:crypto` HMAC-SHA256 + `timingSafeEqual`, secret random 32 byte hex |
| V7 Error Handling & Logging | sì | log con soli id/tipi/importi/esiti; mai secret, firma, body, token; `describeMongoError` |
| V13 API | sì | 403/204/500 senza body informativo; limite 100 KB del parser; rate limit in Phase 10 |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Redemption forgiata via POST pubblico | Spoofing | HMAC su raw body, confronto a tempo costante, 403 |
| Replay di un messaggio catturato | Tampering/Repudiation | finestra 10 min + dedup `messageId` unico |
| Doppio credito da riconsegna / doppia subscription | Tampering | E11000 in transazione; `eventId` unico (C7); reconcile che elimina varianti |
| Timing attack sulla firma | Information disclosure | `timingSafeEqual` su buffer di pari lunghezza |
| Secret/token nei log o negli errori | Information disclosure | messaggi fissi in config e client; `TwitchHelixError` con solo status |
| Flood del webhook | DoS | parser 100 KB, verifica firma prima del DB; throttling Phase 10 |
| Dev che cancella le subscription di prod | Tampering (operativo) | modalità locale senza Helix (C3); un client_id per ambiente |
| Rimborso della redemption dopo il credito | Elevation (economia) | reward con "salta la coda" (Pitfall 10); refund BE-FUT-05 |

## Sources

### Primary (HIGH confidence)
- https://dev.twitch.tv/docs/eventsub/handling-webhook-events/ — header, HMAC, challenge, notification timing, revocation, "Subscriptions do not expire", HTTPS 443, secret 10–100
- https://dev.twitch.tv/docs/eventsub/ — at-least-once, stesso message id sulle riconsegne, replay 10 min
- https://dev.twitch.tv/docs/eventsub/manage-subscriptions/ — app token per webhook, autorizzazione prima della subscribe, status, 10 giorni di visibilità, costi
- https://dev.twitch.tv/docs/api/reference/ (#create-eventsub-subscription, #get-eventsub-subscriptions, #delete-eventsub-subscription, #create-custom-rewards) — body, response code 202/400/401/403/409/410/429, filtri, paginazione, redirect non seguiti, costo minimo 1
- https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types/ e https://dev.twitch.tv/docs/eventsub/eventsub-reference/ — payload redemption.add v1 e stream.online v1, scope
- https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/ e https://dev.twitch.tv/docs/authentication/refresh-tokens/ — client credentials, nessun refresh, 401 reattivo, formato scope
- https://dev.twitch.tv/docs/cli/event-command/ e https://github.com/twitchdev/twitch-cli/blob/main/docs/event.md — comandi CLI; `twitch event trigger --help` della 1.1.24 installata
- Probe empirici (cancellati): rawBody/challenge/status/guard/CLI su Nest 11.1.6; transazioni su mongod 8.0.4 e 8.2.6; fake timers Jest 30
- Codice del repo citato per file:riga; `node_modules/@nestjs/{core,platform-express,config}` per ordine dei hook, raw body e precedenza env

### Secondary (MEDIUM confidence)
- https://discuss.dev.twitch.com/t/eventsub-revoke-after-password-reset/34047 — subscription revocate non riattivabili, 403 finché lo streamer non ri-autorizza, non-enabled non bloccano
- https://discuss.dev.twitch.com/t/clarification-on-auth-flow-for-subscribing-to-eventsub/60179 — non chiarisce l'effetto della revoke del token (base di C4)

### Tertiary (LOW confidence)
- Testo esatto del messaggio Helix 403 (A2), dismissione PubSub (A5)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — nessuna dipendenza nuova, versioni lette da `node_modules`
- Architecture: HIGH — forme HTTP e Mongo provate sul harness reale
- Twitch lifecycle: HIGH sui fatti documentati, MEDIUM su C4 (revoke) e sui retry non documentati
- Pitfalls: HIGH — la maggior parte ha un probe o una citazione

**Research date:** 2026-10-19
**Valid until:** 2026-11-18 (Twitch cambia raramente EventSub v1; ricontrollare la reference Helix se il piano slitta oltre)
