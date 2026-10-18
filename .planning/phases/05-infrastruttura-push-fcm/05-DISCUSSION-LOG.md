# Phase 5: Infrastruttura Push FCM - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-18
**Phase:** 05-infrastruttura-push-fcm
**Mode:** `--auto` — l'utente ha chiesto di proseguire la Phase 5 GSD del BE per sbloccare il FE senza sessione interattiva; per ogni domanda è stata scelta l'opzione raccomandata (prima opzione). Tutte le aree individuate sono state incluse.
**Areas discussed:** Registro token (modello e chiave), Contratto di registrazione/cancellazione, Credenziali Firebase e versione SDK, Architettura del servizio e dispatch, Fan-out broadcast, Contratto del payload, Trigger di prova per il FE, Pruning ed errori

---

## Registro token: dove vivono i token

| Option | Description | Selected |
|--------|-------------|----------|
| Collection dedicata (`push_devices`) con una riga per `(userId, deviceId)` | Nessun campo sullo `User`: il token non entra mai nello schema GraphQL; upsert, pruning e TTL semplici; fan-out con un `find({ userId })` | ✓ |
| Array `deviceTokens[]` sullo `User` | Un documento in meno, ma il token rischia di finire in `me`/`userUpdated` e il pruning diventa `$pull` su array con concorrenza | |
| Token sul `Character` | Sbagliato per dominio: l'identità è l'utente, il personaggio può essere eliminato e ricreato | |

**Auto choice:** opzione 1. Indice unico `(userId, deviceId)`, indice su `userId`, TTL 270 giorni su `lastSeenAt`.
**Notes:** invariante aggiuntiva "un token in una sola riga" (cambio account sullo stesso device) — meccanismo a discrezione del planner.

---

## Registro token: chiave della riga

| Option | Description | Selected |
|--------|-------------|----------|
| Chiave `(userId, deviceId)` + invariante "token unico" | Rispetta la lettera di BE-NOTIF-01; il cambio account rimuove la riga del vecchio utente con lo stesso token (niente push a un device ora di un altro) | ✓ |
| Chiave `deviceId` sola (riga riassegnata al nuovo utente) | Più semplice, ma un client che conosce il `deviceId` altrui può sovrascrivergli la riga; fuori dalla lettera del requisito | |
| Chiave `token` sola | Un refresh del token lascia una riga stantia per lo stesso device fino al pruning | |

**Auto choice:** opzione 1.

---

## Contratto di registrazione e cancellazione

| Option | Description | Selected |
|--------|-------------|----------|
| `registerPushDevice(input)` + `unregisterPushDevice(deviceId)`, entrambe `Boolean!`, identità dal bearer | Due operazioni esplicite e idempotenti; `logout` invariato; il FE chiama unregister prima di logout | ✓ |
| Solo register, con `deviceId` opzionale su `logout` | Cambia un contratto esistente (Phase 2) e lega il logout al push | |
| Register che restituisce un oggetto `PushDevice` | Nessun dato utile per il FE; espone `token`/`deviceId` sul wire senza bisogno | |

**Auto choice:** opzione 1. Validazione autoritativa su `deviceId`/`token`, codici `PUSH_INVALID_DEVICE_ID`/`PUSH_INVALID_TOKEN`.

---

## Credenziali Firebase

| Option | Description | Selected |
|--------|-------------|----------|
| Una variabile `FIREBASE_SERVICE_ACCOUNT` (JSON base64), validata al boot; prod senza → boot rifiutato; dev senza → push disabilitato + WARN | Nessuna trappola `\n` della private key; coerente con `parseAuthConfig`; un deploy prod senza push non passa in silenzio | ✓ |
| Tre variabili `FIREBASE_PROJECT_ID` / `FIREBASE_CLIENT_EMAIL` / `FIREBASE_PRIVATE_KEY` | Leggibili ma la private key multilinea nelle env è fonte classica di errori | |
| `GOOGLE_APPLICATION_CREDENTIALS` (path al file) / ADC | Richiede un file sul filesystem del runtime e complica container/CI | |
| Push sempre opzionale anche in prod (solo WARN) | Coerente con Twitch non configurato, ma le notifiche sono parte del core loop (viaggio con notifiche) | |

**Auto choice:** opzione 1.

---

## Versione `firebase-admin`

| Option | Description | Selected |
|--------|-------------|----------|
| `^13.10.0` (engines Node ≥ 18) | Sicura su qualunque runtime prod; API identica alla 14 | ✓ |
| `^14.5.0` (latest, engines Node ≥ 22) | CI e locale sono su Node 22, ma il runtime prod non è confermato (research flag ROADMAP) | |

**Auto choice:** opzione 1; il planner può alzare a 14 solo con runtime prod confermato ≥ 22.

---

## Architettura del servizio e dispatch

| Option | Description | Selected |
|--------|-------------|----------|
| `PushService` → porta `PushTransport` (`FcmPushTransport` / `NoopPushTransport`), dispatch sincrono best-effort, firebase-admin mai nei test | Testabile con fake; i chiamanti di dominio non falliscono mai per il push; la coda resta un'estensione dietro la porta | ✓ |
| Coda Bull `push-dispatch` con retry | Più robusta ma aggiunge Redis ai test del push e infrastruttura non richiesta oggi | |
| Chiamate dirette a `admin.messaging()` dai service di dominio | Accoppia travel/quest/combat a FCM; non testabile senza rete | |

**Auto choice:** opzione 1.

---

## Fan-out broadcast (streamer-live)

| Option | Description | Selected |
|--------|-------------|----------|
| Topic FCM `streamer-live` (iscrizione alla registrazione, disiscrizione all'unregister) | Fan-out delegato a FCM; lettera di BE-NOTIF-02 ("topic broadcast") e research STACK | ✓ |
| Multicast su tutti i token del registro (batch da 500) | Un solo meccanismo e pruning uniforme, ma pagina l'intero registro a ogni live | |

**Auto choice:** opzione 1. Gli eventi personali restano multicast sui token dell'utente.

---

## Contratto del payload

| Option | Description | Selected |
|--------|-------------|----------|
| Data-only (`type`, `id?`, `title`, `body`, `sentAt`), priorità alta Android, background push iOS | Il FE applica i toggle sul device nei tre app state (richiesta FE Phase 4 §4); nessuno stato di gioco | ✓ |
| `notification` + `data` | Il sistema mostra sempre la notifica: i toggle locali non possono sopprimerla ad app uccisa | |
| Filtro server-side delle preferenze | Richiede il contratto preferenze che il FE ha differito | |

**Auto choice:** opzione 1, con caveat iOS (throttling dei background push) documentata nel handoff.

---

## Trigger di prova per il FE

| Option | Description | Selected |
|--------|-------------|----------|
| Mutation innkeeper-only `sendTestPush(type, targetUserId?, id?)` auditata | Sblocca l'E2E FE dei tre app state prima delle Phase 6/8/9; attrezzo legittimo del GM; convenzione Phase 3 | ✓ |
| Nessun trigger (si aspetta Phase 8) | Il FE Phase 5 non potrebbe verificare NOTIF-03..06 sul device | |
| Endpoint REST dev-only dietro `DEV_AUTH` | Non riusabile in prod, fuori dallo schema, non auditato | |

**Auto choice:** opzione 1.

---

## Pruning ed errori

| Option | Description | Selected |
|--------|-------------|----------|
| Prune su `registration-token-not-registered` / token invalido; altri errori WARN senza retry; report `{ targeted, sent, pruned, failed }`; mai eccezioni verso il dominio | Lettera di BE-NOTIF-01; il push resta side-channel | ✓ |
| Prune anche su `unavailable`/`internal` | Cancellerebbe token validi durante un disservizio FCM | |
| Propagare l'errore al chiamante | Un viaggio completato fallirebbe per un push fallito | |

**Auto choice:** opzione 1.

---

## Claude's Discretion

Nomi e collocazione del modulo, forma dell'invariante token-unico, TTL dei messaggi, testo di `title`/`body`, `@Global()` vs export esplicito, split in wave, dettagli del report e dell'esito per-token della porta.

## Deferred Ideas

Coda Bull per il dispatch, preferenze server-side, blocco `notification` iOS, `combatResult` (Phase 9), trigger reali (Phase 6/8/9), query admin del registro, rate limiting (Phase 10), topic per categoria/localizzazione, rimozione di `notification.model.ts`.
