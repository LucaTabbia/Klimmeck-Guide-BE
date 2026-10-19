# BACKEND-NOTES — Phase 6 EventSub: Punti Canale & Streamer Live (handoff per FE e ops)

- **Fase BE:** 06-eventsub-punti-canale-streamer-live (requisiti BE-POINTS-01, BE-POINTS-02, BE-POINTS-03; decisioni D-01..D-20 in `06-CONTEXT.md`, con i rimedi C1–C7 di `06-RESEARCH.md` §"Conflitti con il CONTEXT").
- **Data:** 2026-10-19. Documento di fine fase, scritto prima della UAT umana (`06-HUMAN-UAT.md`).
- **Branch:** `feat/06-eventsub-punti-canale-streamer-live` (PR verso `develop`). **Nessuna dipendenza da una PR FE** (D-20): la PR BE si fonde in autonomia, il FE non deve cambiare nulla.
- **Schema:** `src/schema.gql` **invariato** rispetto a `develop` (D-16). Il boot reale in `test/app.int-spec.ts` lo rigenera e `git diff --exit-code src/schema.gql` esce 0.
- **Stato:** implementato e coperto da test. Gate di 06-09: unit **79 suite / 1098 test**, integration **46 suite / 550 test** (replica set + Redis in memoria, `--runInBand`), `npm run build` exit 0, lint filtrato 0 righe, `eslint` e `prettier --check` puliti sui 53 `.ts` toccati dalla fase, nessuna dipendenza nuova in `package.json`. Baseline di inizio fase: unit 66 / 810, integration 43 / 515.
- **Modulo nuovo:** `EventSubModule` (`src/eventsub/`, montato in `AppModule` subito dopo `PushModule`, foglia, non globale). Collection nuova: `eventsub_messages`. `main.ts`: `NestFactory.create(AppModule, { rawBody: true })`.
- **Fonte:** ogni messaggio, header, codice e comando qui sotto è copiato dal codice: `src/eventsub/eventsub.controller.ts`, `src/eventsub/eventsub-webhook.service.ts`, `src/eventsub/eventsub-headers.ts`, `src/eventsub/eventsub-signature.ts`, `src/eventsub/eventsub-types.ts`, `src/eventsub/eventsub-message.model.ts`, `src/eventsub/eventsub-message-index.verifier.ts`, `src/eventsub/eventsub-startup.reporter.ts`, `src/eventsub/subscriptions/eventsub-subscription.manager.ts`, `src/eventsub/helix/*.ts`, `src/config/eventsub-config.ts`, `src/config/auth-config.ts`, `src/auth/twitch/twitch-login.service.ts`, `src/push/push-events.ts`, `src/push/push-message.ts`, `.env.example`. **Il codice vince su questo documento.**

---

## 0. TL;DR per il FE

1. **Nulla da chiamare.** Nessuna mutation, query o subscription nuova: `src/schema.gql` è invariato.
2. **I punti arrivano da soli.** Ogni riscatto di **qualunque custom reward** del canale accredita `reward.cost` **1:1** su `twitchPoints` dell'utente con quel `twitchId` (D-05, D-06). Il nuovo saldo arriva al FE con la subscription esistente **`userUpdated`** (change stream su `users`, Phase 3). Il FE deve solo continuare a mostrare `twitchPoints` dallo `User` ricevuto.
3. **Push `streamerLive`.** A ogni `stream.online` del canale, di qualunque `type` (`live`, `playlist`, `watch_party`, `premiere`, `rerun`), il BE invia il data message `type: streamerLive` sul topic **`streamer-live`** (Phase 5, `STREAMER_LIVE_TOPIC`), copy `La locanda è aperta` / `Lo streamer è in diretta: unisciti all'avventura!`, TTL 15 min. Contratto del payload invariato rispetto a Phase 5 BACKEND-NOTES §2.
4. **Best-effort.** Il push parte senza essere atteso (C1): se FCM fallisce il BE logga un WARN e non ritenta. La riconsegna dello stesso `stream.online` da parte di Twitch **non** invia un secondo push (dedup).
5. **Viewer senza account.** Chi riscatta punti prima del primo login nell'app **non riceve nulla** e non viene creato alcun utente (D-07): i punti riscattati prima del login non vengono recuperati.
6. **Consenso.** Solo lo streamer, una volta, vede la richiesta di consenso Twitch `channel:read:redemptions` (§3). Se le ops lasciano impostata `TWITCH_LOGIN_SCOPES`, **ogni** viewer vedrebbe la stessa richiesta al login (Pitfall 14): non è un bug del FE.

---

## 1. Webhook

**`POST /webhooks/twitch/eventsub`**, pubblico: è l'unico handler `@Public()` aggiunto dalla fase (`EventSubController.receive`, decoratore sull'handler e non sulla classe). La whitelist del boot reale ha ora 6 voci. La fiducia è la firma HMAC, non un bearer.

- Header letti (stringa singola non vuota, max 200 caratteri): `twitch-eventsub-message-id`, `twitch-eventsub-message-timestamp`, `twitch-eventsub-message-signature`, `twitch-eventsub-message-type`. Il tipo di subscription si legge **dal body firmato**, mai dall'header `twitch-eventsub-subscription-type`.
- Firma: `sha256=` + hex(HMAC-SHA256(`TWITCH_EVENTSUB_SECRET`, id ‖ timestamp ‖ raw body)), calcolata sui byte grezzi (`req.rawBody`, solo con `Content-Type: application/json`), confronto `timingSafeEqual` dopo il controllo di lunghezza.
- Finestra di replay: timestamp al massimo **10 minuti** nel passato e **60 secondi** nel futuro (`REPLAY_WINDOW_MS`, `MAX_FUTURE_SKEW_MS`).
- La firma si verifica **prima** di ogni ramo, challenge incluso.

| Caso | Status | Body |
|------|--------|------|
| challenge (`webhook_callback_verification`) firmato | 200 `text/plain` | solo il valore `challenge` (max 1000 caratteri) |
| firma errata, timestamp fuori finestra (replay), header mancanti, `Content-Type` non JSON (nessun raw body), challenge assente, EventSub `disabled` | 403 | vuoto |
| notification gestita (redemption accreditata, `stream.online` registrato) | 204 | vuoto |
| notification duplicata (stesso message id o stesso `event.id`) | 204 | vuoto |
| viewer senza account | 204 | vuoto |
| broadcaster diverso da `TWITCH_BROADCASTER_ID` | 204 | vuoto |
| payload malformato (`user_id` mancante, `reward.cost` non intero positivo, ...) | 204 | vuoto |
| tipo di subscription o di messaggio sconosciuto | 204 | vuoto |
| `revocation` | 204 | vuoto |
| errore DB durante credito o registrazione | 500 | vuoto (Twitch riconsegna; la dedup rende la riconsegna sicura) |
| body > 100 KB | 413 | errore di Nest (body parser, prima dell'handler) |

L'elaborazione è sincrona nel handler (D-04), senza coda. Solo un errore del DB chiede a Twitch di riconsegnare; tutto il resto risponde 204 perché ritentare non aiuterebbe.

---

## 2. Modalità e configurazione

`parseEventSubConfig` (`src/config/eventsub-config.ts`) decide la modalità al boot; `validateEnv` la chiama dopo auth e push.

| Modalità | Condizione | Comportamento |
|----------|------------|---------------|
| `disabled` | le tre variabili webhook vuote, `NODE_ENV` diverso da `production` | WARN al boot, il webhook risponde 403, nessuna chiamata Helix |
| `local` | callback `http://localhost` o `http://127.0.0.1`, fuori produzione | WARN al boot, webhook attivo con verifica della firma (Twitch CLI), **nessuna chiamata Helix** (C3) |
| `managed` | callback `https` sulla porta 443 | LOG al boot, webhook attivo, reconcile delle subscription al boot, ogni ora e a ogni `revocation`, con app access token |

Variabili (tutte in `.env.example`, valori vuoti):

- `TWITCH_LOGIN_SCOPES` — scope extra chiesti al login Twitch, separati da spazi; vuota = solo identità (D-11).
- `TWITCH_EVENTSUB_SECRET` — 10–100 caratteri ASCII stampabili senza spazi.
- `TWITCH_EVENTSUB_CALLBACK_URL` — `https://<host>/webhooks/twitch/eventsub` (managed) o `http://localhost:3000/webhooks/twitch/eventsub` (local).
- `TWITCH_BROADCASTER_ID` — id numerico Twitch del canale.
- `TWITCH_CLIENT_ID` / `TWITCH_CLIENT_SECRET` — letti **direttamente** da `parseEventSubConfig` (C6), obbligatori in `managed`; non serve `TWITCH_REDIRECT_URI` per l'app token.

Messaggi d'errore di boot (verbatim, non contengono mai un valore):

- `EventSub configuration is incomplete: missing <variabili> (set TWITCH_EVENTSUB_SECRET, TWITCH_EVENTSUB_CALLBACK_URL and TWITCH_BROADCASTER_ID together, or none)`
- `TWITCH_EVENTSUB_SECRET, TWITCH_EVENTSUB_CALLBACK_URL and TWITCH_BROADCASTER_ID are required when NODE_ENV=production`
- `TWITCH_EVENTSUB_SECRET must be 10-100 printable ASCII characters without spaces`
- `TWITCH_EVENTSUB_CALLBACK_URL must be an absolute https URL on port 443 without credentials or fragment (http://localhost or http://127.0.0.1 only outside production)`
- `TWITCH_BROADCASTER_ID must be the numeric Twitch user id of the channel`
- `TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET are required when TWITCH_EVENTSUB_CALLBACK_URL is https (EventSub subscriptions are managed with an app access token)`
- `TWITCH_LOGIN_SCOPES must be a space-separated list of Twitch scopes (e.g. channel:read:redemptions)`

**Produzione (D-12):** con `NODE_ENV=production` le tre variabili webhook e `TWITCH_CLIENT_ID`/`TWITCH_CLIENT_SECRET` sono obbligatorie e il callback deve essere `https`: senza, il boot viene rifiutato. Una configurazione parziale o malformata rifiuta il boot in **ogni** ambiente.

---

## 3. Checklist ops

- [ ] **Un'app Twitch (client_id) dedicata a ogni ambiente** che gestisce EventSub (C3). Il reconcile cancella le subscription del proprio client con callback diverso: due ambienti `https` con lo stesso client_id si cancellano a vicenda. In alternativa, EventSub configurato in un solo ambiente.
- [ ] `TWITCH_CLIENT_ID` / `TWITCH_CLIENT_SECRET` dell'app di quell'ambiente.
- [ ] URL HTTPS pubblico del BE, **porta 443, senza redirect** (Twitch non segue i redirect), come `TWITCH_EVENTSUB_CALLBACK_URL=https://<host>/webhooks/twitch/eventsub`.
- [ ] `TWITCH_BROADCASTER_ID`: `twitch api get users -q login=lordreavor` (campo `data[0].id`; richiede `twitch configure` + `twitch token`).
- [ ] `TWITCH_EVENTSUB_SECRET`: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Mai in repo.
- [ ] **Login dello streamer UNA volta con `TWITCH_LOGIN_SCOPES=channel:read:redemptions`**, poi svuotare la variabile e riavviare (Pitfall 14: finché è impostata ogni viewer vede la richiesta di consenso). L'autorizzazione non scade nel tempo; muore solo se lo streamer scollega l'app (Impostazioni → Connessioni) o cambia password. Verifica C4 in `06-HUMAN-UAT.md` test 3.
- [ ] **Ogni custom reward con "Salta la coda delle richieste"** (Pitfall 10). Altrimenti lo streamer può rifiutare la redemption dalla coda: Twitch restituisce i punti canale ma i `twitchPoints` restano accreditati (il BE non ascolta `.update`; il rimborso automatico è BE-FUT-05).
- [ ] **`.env` locale (C2):** chi ha già `TWITCH_EVENTSUB_SECRET` e `TWITCH_BROADCASTER_ID` deve aggiungere `TWITCH_EVENTSUB_CALLBACK_URL=http://localhost:3000/webhooks/twitch/eventsub` (modalità locale) **oppure** svuotare `TWITCH_EVENTSUB_SECRET` e `TWITCH_BROADCASTER_ID` (disabled). Altrimenti il boot locale viene rifiutato con `EventSub configuration is incomplete: missing TWITCH_EVENTSUB_CALLBACK_URL ...`.
- [ ] **Log di boot:** in managed compare `EventSub enabled for broadcaster <id> with callback <url>: subscriptions are reconciled at boot and every hour.`, poi `EventSub subscriptions reconciled: kept [...], removed [...], created [...]` con le due subscription (`channel.channel_points_custom_reward_redemption.add` e `stream.online`). Subito dopo la create sono `webhook_callback_verification_pending`; al ciclo successivo (riavvio o timer orario) devono risultare in `kept [...]` con stato `enabled`.
- [ ] **Rotazione del secret (Pitfall 12):** Helix non aggiorna il secret delle subscription esistenti, che continuerebbero a firmare con il vecchio (tutte 403). Procedura: cambiare `TWITCH_EVENTSUB_SECRET`, cancellare le subscription (`twitch api get /eventsub/subscriptions` per gli id, poi `twitch api delete /eventsub/subscriptions -q id=<id>`) e riavviare: il reconcile le ricrea con il secret nuovo.

---

## 4. Ledger eventsub_messages (supporto)

Collection `eventsub_messages` (`src/eventsub/eventsub-message.model.ts`), un documento per ogni redemption accreditata e per ogni `stream.online` registrato.

| Campo | Contenuto |
|-------|-----------|
| `messageId` | `twitch-eventsub-message-id` |
| `type` | tipo di subscription (`channel.channel_points_custom_reward_redemption.add` / `stream.online`) |
| `eventId` | `event.id` (id della redemption o dello stream) |
| `twitchUserId` | viewer che ha riscattato (null per `stream.online`) |
| `rewardId` | id della custom reward (null per `stream.online`) |
| `amount` | punti accreditati = `reward.cost` (null per `stream.online`) |
| `outcome` | `credited` / `broadcast` |
| `receivedAt` | istante di ricezione |

Indici (creati al boot da `EventSubMessageIndexVerifier`, non bloccante):

- `eventsub_message_id_unique` — unico su `{ messageId: 1 }` (riconsegne).
- `eventsub_event_unique` — unico parziale su `{ type: 1, eventId: 1 }` (C7: due subscription che consegnano lo stesso evento con message id diversi).
- `eventsub_message_ttl` — TTL su `receivedAt`, `expireAfterSeconds: 604800` (604 800 s = 7 giorni).

Caso "ho riscattato ma non ho i punti":

```js
db.eventsub_messages.find({ twitchUserId: '<twitch id>' }).sort({ receivedAt: -1 })
```

- Nessun documento entro 7 giorni: Twitch non ha consegnato, oppure il viewer **non aveva un account** al momento del riscatto (D-07: gli eventi ignorati non lasciano traccia), oppure la notifica è stata rifiutata (403 o 500 nel log, §5).
- Nessun record in `admin_audit_logs` (D-16): non è un'azione admin.
- Credito e insert del ledger avvengono nella **stessa transazione** con `WalletService.creditUserPoints` (unico scrittore del saldo): un documento `credited` implica il credito.

---

## 5. Log ed esiti

Contesto `EventSub` (verifier: `EventSubMessageIndexVerifier`). I log contengono id, tipi, importi e codici; mai secret, firma o body.

| Livello | Messaggio | Significato | Azione |
|---------|-----------|-------------|--------|
| WARN (boot) | `EventSub disabled: TWITCH_EVENTSUB_SECRET, TWITCH_EVENTSUB_CALLBACK_URL and TWITCH_BROADCASTER_ID are not configured. The webhook answers 403 and no subscription is managed.` | modalità `disabled` | atteso in dev/test; in prod il boot non arriva qui |
| WARN (boot) | `EventSub local mode: callback <url> is not https. The webhook verifies signatures (use the Twitch CLI) but Helix subscriptions are not managed.` | modalità `local` | atteso per la Twitch CLI |
| LOG (boot) | `EventSub enabled for broadcaster <id> with callback <url>: subscriptions are reconciled at boot and every hour.` | modalità `managed` | controllare broadcaster e callback |
| LOG | `EventSub subscriptions reconciled: kept [...], removed [...], created [...]` | esito del reconcile (tipo, id, stato) | entrambe le subscription `enabled` a regime |
| DEBUG | `EventSub reconcile ignored <n> subscriptions it does not own` | subscription di altri tipi/broadcaster/transport | nessuna |
| WARN | `EventSub subscription <type> already exists (409): the next reconcile will see it` | create concorrente | nessuna, si risolve al ciclo successivo |
| ERROR | `EventSub subscription channel.channel_points_custom_reward_redemption.add rejected with status 403: the streamer must log in again with TWITCH_LOGIN_SCOPES=channel:read:redemptions` | lo streamer non ha autorizzato lo scope | rifare il login dello streamer con lo scope (§3); se succede subito dopo quel login → C4, §7 |
| ERROR | `EventSub subscription <type> could not be created: <errore Helix>` | create fallita (rete, 4xx/5xx) | verificare chiavi e callback |
| ERROR | `EventSub subscription <type> <id> could not be deleted: <errore Helix>` | delete fallita | ritentata al ciclo successivo |
| ERROR | `EventSub reconcile failed: <errore Helix>` | list fallita o token non ottenibile | verificare `TWITCH_CLIENT_ID/SECRET` e rete |
| ERROR | `EventSub subscription <type> revoked by Twitch (status <status>, id <id>)` + `: the streamer must log in again with TWITCH_LOGIN_SCOPES=channel:read:redemptions` solo per `authorization_revoked` sulla redemption | `revocation` ricevuta; parte un reconcile immediato | per `authorization_revoked`: rifare il login dello streamer con lo scope |
| WARN | `EventSub revocation <messageId> has an invalid payload` | revocation non leggibile; parte comunque un reconcile | nessuna |
| LOG | `EventSub callback verification answered (message <messageId>)` | challenge risposto | nessuna |
| LOG | `EventSub redemption <messageId> credited <cost> points to twitch user <userId>` | credito eseguito | nessuna |
| DEBUG | `EventSub redemption <messageId> already processed` | riconsegna o doppia subscription | nessuna |
| DEBUG | `EventSub redemption <messageId> ignored: twitch user <userId> has no account` | viewer senza account (D-07) | nessuna |
| ERROR | `EventSub redemption <messageId> not credited (<errore DB>): Twitch will redeliver` | errore DB, risposta 500 | controllare Mongo; la riconsegna è sicura |
| LOG | `EventSub stream.online <messageId> (<type>) recorded: streamer-live push dispatched` | push `streamerLive` lanciato | nessuna |
| DEBUG | `EventSub stream.online <messageId> already processed` | riconsegna, nessun secondo push | nessuna |
| ERROR | `EventSub stream.online <messageId> not recorded (<errore DB>): Twitch will redeliver` | errore DB, risposta 500, nessun push | controllare Mongo |
| WARN | `EventSub streamer-live push not sent: <errore>` | il broadcast fire-and-forget è fallito | vedere i log `PushService` (Phase 5) |
| WARN | `EventSub request rejected: missing EventSub headers` | 403 | richiesta non Twitch |
| WARN | `EventSub request rejected: invalid signature or outside the replay window` | 403 | secret sbagliato, replay o orologio; molti di fila in prod → Pitfall 12 |
| DEBUG | `EventSub request rejected: EventSub is disabled` | 403 in `disabled` | nessuna |
| WARN | `EventSub message <messageId> of unknown type ignored` | tipo di messaggio sconosciuto, 204 | nessuna |
| WARN | `EventSub <type> notification <messageId> ignored: unsupported subscription type` | subscription non gestita dal BE, 204 | eventuali subscription manuali da cancellare |
| ERROR | `EventSub <type> notification <messageId> has an invalid payload` | payload malformato, 204 | segnalare (formato Twitch cambiato?) |
| WARN | `EventSub <type> notification <messageId> ignored: broadcaster <id> is not the configured channel` | broadcaster diverso, 204 | verificare `TWITCH_BROADCASTER_ID` |
| ERROR | `EventSub message handling failed (<errore>)` | errore inatteso, 500 | segnalare |
| ERROR | `Indexes on eventsub_messages could not be built (<errore>). EventSub deliveries are not guaranteed to be credited once.` | indici non costruiti al boot (non blocca) | risolvere subito: senza indici unici la dedup non è garantita |

Errori Helix (`<errore Helix>`, senza token né secret): `Helix list subscriptions failed with status <n>`, `Helix create subscription failed with status <n>`, `Helix delete subscription failed with status <n>`, `<operazione> request failed` (rete o timeout 5 s), `<operazione> response is not valid JSON`, `Helix list subscriptions exceeded 20 pages`, `Helix create subscription response is missing the subscription`, `EventSub subscriptions are not managed in this environment` (`NOT_MANAGED_MESSAGE`). Il token app viene rinnovato 5 minuti prima della scadenza e dopo un 401 (un solo retry).

---

## 6. Ricetta Twitch CLI locale

Prerequisiti: Twitch CLI (provata con 1.1.24), BE avviato in **modalità `local`** (`TWITCH_EVENTSUB_CALLBACK_URL=http://localhost:3000/webhooks/twitch/eventsub`, più `TWITCH_EVENTSUB_SECRET` e `TWITCH_BROADCASTER_ID`), log di boot `EventSub local mode: ...`. In modalità local il BE non chiama mai Helix. `<secret>` = il valore di `TWITCH_EVENTSUB_SECRET`, `<broadcaster id>` = `TWITCH_BROADCASTER_ID`, `<twitchId>` = `twitchId` di un utente che ha già fatto login nell'app.

```bash
CB=http://localhost:3000/webhooks/twitch/eventsub

# 1. challenge → ✔ Valid response / ✔ Valid content-type header / ✔ Valid status code
twitch event verify-subscription channel.channel_points_custom_reward_redemption.add -F $CB -s <secret> -b <broadcaster id> -D

# 2. redemption da 250 → 204, twitchPoints +250, un documento credited in eventsub_messages
twitch event trigger channel.channel_points_custom_reward_redemption.add -F $CB -s <secret> -t <broadcaster id> -f <twitchId> -C 250 -I dup-1 -D

# 3. stesso comando con -I dup-1 (riconsegna) → 204, nessun nuovo credito, log DEBUG "already processed"
twitch event trigger channel.channel_points_custom_reward_redemption.add -F $CB -s <secret> -t <broadcaster id> -f <twitchId> -C 250 -I dup-1 -D

# 4. timestamp vecchio (replay) → 403, WARN "invalid signature or outside the replay window"
twitch event trigger channel.channel_points_custom_reward_redemption.add -F $CB -s <secret> -t <broadcaster id> -f <twitchId> --timestamp 2026-01-01T00:00:00.000000000Z -D

# 5. secret sbagliato → 403, stesso WARN
twitch event trigger channel.channel_points_custom_reward_redemption.add -F $CB -s wrong-secret-123 -t <broadcaster id> -D

# 6. stream.online → 204, LOG "recorded: streamer-live push dispatched", documento broadcast
twitch event trigger stream.online -F $CB -s <secret> -t <broadcaster id> -D

# 7. revocation → 204, ERROR "revoked by Twitch (status authorization_revoked, ...)" con il rimedio
twitch event trigger channel.channel_points_custom_reward_redemption.add -F $CB -s <secret> -t <broadcaster id> -r authorization_revoked -D
```

Note:

- Senza `-I` ogni `trigger` genera un nuovo message id e un nuovo `event.id`: è una redemption nuova e accredita di nuovo.
- Con `-t` diverso da `TWITCH_BROADCASTER_ID` la risposta è 204 con il WARN "is not the configured channel" e nessun credito.
- Con un `-f` che non corrisponde a nessun utente la risposta è 204, nessun documento, solo un DEBUG.
- Al passo 6, con `FIREBASE_SERVICE_ACCOUNT` vuota il push passa dal `NoopPushTransport` (Phase 5): il LOG di EventSub compare comunque.
- Al passo 7 in modalità local il reconcile è un no-op (nessuna chiamata Helix).

Verifica del saldo: `db.users.findOne({ twitchId: '<twitchId>' }, { twitchPoints: 1 })`, oppure il FE via `userUpdated`. Verifica del ledger: `db.eventsub_messages.find({ twitchUserId: '<twitchId>' }).sort({ receivedAt: -1 })`.

---

## 7. UAT C4 e fallback

Test 3 di `06-HUMAN-UAT.md`. Al login il BE revoca subito il token Twitch dello streamer (Phase 2 D-05, `revokeQuietly` in `TwitchLoginService.completeLogin`). Le docs Twitch sono ambigue sul fatto che questa revoke sciolga l'autorizzazione EventSub (confidenza MEDIUM, A1).

- **Pass:** dopo il login dello streamer con `TWITCH_LOGIN_SCOPES=channel:read:redemptions` e il reconcile successivo, la create di `channel.channel_points_custom_reward_redemption.add` risponde 202 (compare in `created [...]` e poi `enabled` in `kept [...]`), senza ERROR `rejected with status 403`.
- **Fallback se 403:** in `TwitchLoginService.completeLogin` saltare `revokeQuietly` quando `tokenInfo.scopes` include `channel:read:redemptions` (una riga, riguarda solo lo streamer: i viewer non hanno quello scope). Si fa **solo** se la UAT fallisce, come gap-closure (`/gsd-plan-phase 6 --gaps`) con TDD su `TwitchLoginService`. Nessun codice preventivo in questa fase.

---

## 8. Limiti noti e note per Phase 10

- **Rate limiting del webhook:** `POST /webhooks/twitch/eventsub` è `@Public()` e una richiesta non firmata costa solo un HMAC prima del 403. Un limite per IP (`@nestjs/throttler`) è materia della Phase 10.
- **413 loggato con stack (Pitfall 16):** un body oltre 100 KB viene rifiutato dal body parser JSON di Nest con 413 prima dell'handler; `ExceptionsHandler` logga `PayloadTooLargeError` con lo stack perché gli errori del body parser non sono `HttpException`. È il comportamento del framework su ogni rotta JSON (GraphQL incluso) e il log non contiene secret né contenuto del body. Da valutare in Phase 10 insieme al rate limiting.
- **`twitchPoints` è GraphQL `Int` a 32 bit (Pitfall 15):** oltre 2 147 483 647 la serializzazione di `me`/`userUpdated` fallirebbe. Rischio pratico trascurabile, nessun codice in questa fase.
- **DB giù a lungo (A6):** Twitch riconsegna sui 500 un numero non documentato di volte; dopo troppi fallimenti la subscription va in `notification_failures_exceeded` e il reconcile la ricrea, ma gli eventi dell'intervallo sono persi. Una riconciliazione delle redemption via `Get Custom Reward Redemption` è differita.
- **Rimborsi / `CANCELED`:** il BE non aggiorna lo stato delle redemption su Twitch e non ascolta `.update` (D-10): resta BE-FUT-05. Mitigazione ops: "Salta la coda delle richieste" (§3).
- **Coda Bull di ingestione:** differita; l'elaborazione resta sincrona nel handler (D-04).
- **Scope a tutti i viewer:** finché `TWITCH_LOGIN_SCOPES` è impostata ogni login mostra il consenso (Pitfall 14): procedura ops in §3.

---

## 9. Deploy

- Con `NODE_ENV=production` vanno configurate **prima del deploy** `TWITCH_EVENTSUB_SECRET`, `TWITCH_EVENTSUB_CALLBACK_URL` (https, 443), `TWITCH_BROADCASTER_ID`, `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`: senza, **il boot viene rifiutato** (fail-closed come `FIREBASE_SERVICE_ACCOUNT` in Phase 5).
- Collection nuova `eventsub_messages`: collection e indici vengono creati al boot da `EventSubMessageIndexVerifier`; se falliscono compare l'ERROR di §5, senza bloccare l'avvio. Nessuna migrazione.
- `main.ts` crea l'app con `rawBody: true`: aggiunge `req.rawBody` accanto al body JSON già parsato, nessun effetto sulle altre rotte.
- Dopo il deploy: login dello streamer con lo scope (§3), poi verificare il log `EventSub subscriptions reconciled` e lo stato `enabled` al ciclo successivo.
- Nessuna dipendenza npm nuova (client Helix su `fetch` nativo).

---

## 10. Deviazioni registrate nei piani 06-01..06-08

- **06-01:** regole URL estratte in `src/config/url-rules.ts` (refactor Boy Scout, condiviso da auth ed eventsub, comportamento invariato). `TWITCH_LOGIN_SCOPES` è validata prima del controllo delle chiavi Twitch.
- **06-02:** `parseNotification` usa una `Map` per tipo (evita i warning di confronto enum/stringa e la risoluzione di nomi come `constructor` sui membri di `Object.prototype`). Le fixture firmate seguono la semantica degli override (`Object.hasOwn`: `null` resta, `undefined` toglie il campo, `omitEvent` toglie `event`). Uno spec che passava a vuoto (raw body mancante) è stato corretto.
- **06-03:** nomi espliciti degli indici (§4); `ResourceNotFoundException` dentro la transazione → viewer sconosciuto (utente cancellato fra lookup e credito, Pitfall 7).
- **06-04:** il client Helix rifiuta da sé fuori da `managed` con `NOT_MANAGED_MESSAGE`, senza fetch. Una create 202 senza subscription nel body è un errore. Chiave `mode` duplicata nella config di test corretta.
- **06-05 / 06-06:** costante di modulo `REDEMPTION_TYPE: string` e type guard `messageTypeOf` contro il warning `no-unsafe-enum-comparison`, comportamento invariato. Il catch del broadcast è il campo freccia `logPushFailure`, così `void this.push.broadcast(streamerLive())` resta su una riga.
- **06-07:** harness d'integrazione con `rawBody: true` incondizionato (retrocompatibile); il 413 con stack è annotato in §8.
- **06-08:** scope del commit RED `test(app)` invece di `test(test)`.
- Più subject di commit accorciati per stare nei 72 caratteri; nessun impatto sul codice.
