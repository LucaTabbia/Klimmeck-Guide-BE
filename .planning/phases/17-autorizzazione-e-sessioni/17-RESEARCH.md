# Phase 17: Autorizzazione e sessioni - Research

**Researched:** 2026-11-09
**Domain:** NestJS 11 + Mongoose 8.18.1 + Apollo code-first (graphql 16.11.0, graphql-ws 6.0.6, ws 8.18.3). Matrice di autorizzazione sul boot reale, revoca delle sessioni per utente con chiusura dei WebSocket vivi, motivo della revoca nelle `extensions`, change stream sul ruolo degli utenti
**Confidence:** HIGH sul codice (tutto letto sul branch `feat/17-autorizzazione-e-sessioni`, base `develop` `31dba96`) e sui meccanismi (quattro probe eseguite sull'harness, file cancellati); MEDIUM su due punti di prodotto non coperti dal CONTEXT (sessione assente alla `connection_init`, chiusura del WS su logout e riuso: Open Questions 1 e 3)

## Summary

Nessuna libreria nuova. Tutti i pezzi esistono già e vanno solo estesi: `SessionService` scrive già la revoca con filtro condizionale, `WsConnectionAuthenticator` ha già in mano il `sessionId` e il socket, `ChangeStreamPublisher` ha già un precedente «senza publish» su un campo aggiornato (`ArchivedCharacterQueueRefresher`, `src/quests/pending-requests/archived-character-queue.refresher.ts:14-48`), e il boot reale enumera già i 30 handler.

Le probe hanno chiarito quattro meccanismi:

1. **`extensions.reason` oggi non arriva mai sul filo HTTP**, né in sviluppo né in produzione. `formatDomainError` ricostruisce le `extensions` come `{ code }` (`src/graphql/format-domain-error.ts:17-22`). Il sanitizer di produzione fa lo stesso (`src/graphql/production-errors.ts:19`). Su WS in sviluppo la `reason` passa (graphql-js copia `originalError.extensions`); su WS in produzione no. Servono due modifiche, una per file. Il refresh è una mutation HTTP: il percorso che conta per la FE è quello HTTP.
2. **La chiusura dall'esterno funziona come previsto.** `socket.close(4409, 'newLogin')` sul socket di `extra.socket` arriva al client come `{ code: 4409, reason: 'newLogin' }`, anche con due socket per la stessa sessione, in 1 ms. L'hook `onClose` scatta per entrambi. Una chiusura su un socket già chiuso non lancia. Alla `connection_init` basta chiudere con 4409 e poi `return false`: la chiusura 4403 di graphql-ws diventa un no-op e il client riceve `4409` senza ack.
3. **Il change stream vede il ruolo come previsto.** Con `$match` su `operationType: 'update'` e `updateDescription.updatedFields.role` esistente, l'evento arriva solo quando il valore cambia. Un `$set` allo stesso valore (anche via `upsertWithRole`) non produce eventi. Insert, replace e `$unset` restano fuori dal filtro.
4. **Il boot reale di `AppModule` con `listen(0)` dura 2,1 s** (Redis in memoria in cache, run totale 7,2 s). Monta tutti i 30 handler. È l'harness giusto per la matrice.

Sette punti di CONTEXT e REPO-RULES non reggono alla lettera (sezione Conflicts):

- il watcher del ruolo in `UsersModule` crea un ciclo di moduli;
- il «percorso di servizio» `upsertWithRole` ha come unico chiamante il dev bypass ed è già coperto dal change stream;
- il WS non ha `UNAUTHENTICATED` ma la chiusura `4403`;
- l'hook di pulizia è `onClose`, non `onDisconnect`;
- l'harness `createAuthTestApp` non monta da solo i 30 handler;
- il rifiuto del refresh di un utente cancellato non ha un motivo nell'enum;
- due test esistenti diventano instabili con D-06.

**Primary recommendation:**

- `SessionRevokeReason` più `revokeReason` sul modello. `SessionService` diventa l'unico scrittore della revoca, con il motivo esplicito su ogni percorso.
- `SessionRevocationService` (login e ruolo) fa prima la revoca a DB, poi chiama `WsSessionRegistry.closeSessions`.
- `WsConnectionAuthenticator.onConnect` fa, in quest'ordine: risoluzione del bearer, registrazione del socket, una sola `findById` proiettata. Se la sessione è revocata: `close(4409, reason)` e `return false`.
- `UserRoleChangesPublisher` sul modello di `ArchivedCharacterQueueRefresher`, registrato in `AuthModule`.
- `formatDomainError` e `sanitizeFormattedError` conservano `reason`.
- La matrice gira sul boot reale di `AppModule`, condiviso con `test/app.int-spec.ts` tramite un helper.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Matrice di autorizzazione (BE-SESSION-01 → FE HARDEN-02)
- **D-01 (utente, «Innkeeper + ownership, table-driven»):** un int-spec dedicato (progetto `integration`, harness `createAuthTestApp`/`createCharactersTestApp`) **alimentato dalle stesse due liste** di `test/app.int-spec.ts` (estratte in un modulo di test condiviso, così le liste non divergono): per ogni handler innkeeper → `FORBIDDEN` con JWT `adventurer` e con JWT `guard`, `UNAUTHENTICATED` senza bearer e con bearer invalido; per ogni handler owner-only → `FORBIDDEN` su un personaggio di un altro utente (l'innkeeper resta esente e auditato, Phase 3 D-09); le **subscription** della lista (`pendingRequestsUpdated`, `characterUpdated`, `questResultReceived`) passano dall'harness WS esistente (`FORBIDDEN` alla subscribe). Ogni riga della matrice porta gli argomenti minimi validi dell'handler (fixture per handler, tabella in codice): un handler nuovo nelle liste senza riga di fixture **fa fallire la spec** (completezza imposta dal tipo o da un'asserzione sulle chiavi). La spec del boot reale continua a garantire che le liste coincidano coi metadati `@Roles`/ownership.

#### Sessioni per device (BE-SESSION-02 → FE HARDEN-06)
- **D-02 (utente, «L'ultimo login caccia l'altro»):** il login (scambio del ticket, `AuthResolver` mutation che emette la `AuthSession`) **revoca tutte le altre sessioni attive dell'utente** (`revokedAt` + motivo `newLogin`) nello stesso passo in cui crea la nuova sessione; la sessione appena creata non è mai toccata; idempotente (una sessione già revocata resta com'è). Il dev bypass non ha sessioni: nessun effetto.
- **D-03 (utente, «WS chiuso subito, JWT fino a scadenza»):** le connessioni WS autenticate con una sessione revocata vengono **chiuse subito** con un **close code dedicato** (default tecnico `4409`, nome in `17-REPO-RULES.md`) e reason = la stringa del motivo (D-05). Serve un registro dei socket vivi per `sessionId` (l'`identity.sessionId` è già su `extra` in `WsConnectionAuthenticator`) o un canale di eventi fra `SessionService` e il layer WS: **a discrezione della ricerca**, single-node (nessun bus esterno). Una nuova `connection_init` con un JWT della sessione revocata viene rifiutata (`4403`) finché il JWT vive? **No**: il JWT è stateless (D-04) — la connessione rientra e verrà chiusa di nuovo solo se la sessione è ancora revocata al momento della verifica; per evitare il ping-pong il `WsConnectionAuthenticator` **verifica lo stato della sessione alla `connection_init`** (una lettura per connessione, non per richiesta) e rifiuta con il close code dedicato se revocata. Questa è l'unica lookup ammessa.
- **D-04 (utente):** l'**access JWT resta stateless**: le richieste HTTP col token residuo passano fino alla scadenza (`ACCESS_TOKEN_TTL_SECONDS` = 900); nessuna verifica della sessione nel guard HTTP; documentato nel handoff come finestra accettata.
- **D-07 (utente, «Solo quel device»):** `logout` invariato: revoca la sola sessione corrente, motivo `userLogout`.

#### Motivo della revoca sul filo (BE-SESSION-03 → FE D-12)
- **D-05 (utente, «SESSION_REVOKED + reason»):** il rifiuto del refresh conserva il codice `SESSION_REVOKED` e aggiunge **`extensions.reason`** con un enum nuovo (default tecnico `SessionRevokeReason`: `newLogin`, `roleChanged`, `reuseDetected`, `userLogout`; nomi fissati in `17-REPO-RULES.md`); la reuse detection della Phase 2 D-08 scrive `reuseDetected`; `SESSION_EXPIRED` resta senza reason. La stessa stringa è la reason del close WS dedicato (D-03). La FE legge in modo tollerante (ignoto → messaggio neutro).
- **D-08 (tecnico):** `Session` guadagna il campo **additivo e nullable `revokeReason`** (enum sopra), scritto insieme a `revokedAt`; nessuna migrazione (le sessioni già revocate restano senza motivo); nessuna riga SDL (il motivo viaggia nelle `extensions`, non nello schema): il boot reale dichiara **SDL invariato**.

#### Cambio di ruolo (BE-SESSION-04 → T-10-19)
- **D-06 (utente, «Cambio ruolo revoca le sessioni»):** quando il `role` di un utente cambia a DB, il BE **revoca tutte le sessioni di quell'utente** con motivo `roleChanged`: trigger dal **change stream della collection `users`** filtrato su `updateDescription.updatedFields.role` (pattern `ChangeStreamPublisher` con backoff, come i publisher esistenti) **più** il percorso di servizio (`UsersService.upsertWithRole` quando cambia il ruolo di un utente esistente), idempotente; il ruolo si cambia a mano a DB (nessuna mutation admin oggi e nessuna nuova). Il guard dei ruoli continua a leggere `identity.role` dal claim.

#### Gate, boot reale, handoff (BE-SESSION-05)
- **D-09:** handoff `BACKEND-NOTES.md` per la FE Phase 12: close code e reason, enum dei motivi, finestra del JWT, matrice (handler × ruolo) come evidenza di HARDEN-02, note per la UAT dual-device (login reale su telefono + emulatore: il secondo login caccia il primo; il dev bypass non partecipa) e per la UAT della release FE via tunnel TLS (il BE non cambia: CORS chiuso non riguarda l'app; la redirect URI Twitch del tunnel è a carico dell'utente).
- **D-10 (default tecnico, come le fasi precedenti):** TDD; gate `tsc --noEmit`, `test:cov` con soglie per cartella (`auth` è già area critica), lint solo sui file toccati; boot reale con `git diff --exit-code src/schema.gql` vuoto e whitelist del boot invariata (nessun handler nuovo); PR a `develop` con il handoff, `requirements mark-complete` solo nel piano di chiusura.

### Claude's Discretion
- Registro dei socket vs evento interno per la chiusura (D-03); valore numerico del close code; nome dell'enum e del campo; forma del modulo di test condiviso delle liste; fixture per handler della matrice; se la verifica della sessione alla `connection_init` usa una cache breve.

### Deferred Ideas (OUT OF SCOPE)
- «Esci da tutti i dispositivi» (mutation + voce FE) — backlog, superata dalla regola dell'ultimo login.
- Verifica della sessione a ogni richiesta HTTP — rifiutata (JWT stateless, finestra di 15 min accettata).
- Mutation admin per cambiare il ruolo di un utente — non richiesta (ruolo curato a DB).
- Classificazione di tutto lo SDL in pubblico/owner/innkeeper con whitelist — non scelta («Tutto lo schema classificato»).

### Nomi già fissati (`17-REPO-RULES.md`, bozza 2026-11-09 — non si rinominano; vedi Conflicts C-3/C-5 per due correzioni proposte)
`SessionRevokeReason` (`newLogin`, `roleChanged`, `reuseDetected`, `userLogout`) in `src/auth/session/session-revoke-reason.enum.ts`; `WS_SESSION_REVOKED_CLOSE_CODE = 4409`; `Session.revokeReason`; `SessionService.revoke/revokeOthersOf/revokeAllOf/revokeReasonOf`; `WsSessionRegistry` (`src/auth/ws/ws-session-registry.ts`); `SessionRevocationService` (`src/auth/session/session-revocation.service.ts`, `revokeOthersOnLogin`, `revokeAllForRoleChange`); `UserRoleChangesPublisher` (`src/users/user-role-changes.publisher.ts`); `test/authz/expected-handlers.ts`, `test/authz/handler-fixtures.ts`, `test/authz/authorization-matrix.int-spec.ts`.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| BE-SESSION-01 | Matrice table-driven alimentata dalle liste del boot reale; `FORBIDDEN` per `adventurer`/`guard` sugli 11 innkeeper, `UNAUTHENTICATED` senza bearer/bearer invalido; `FORBIDDEN` sul personaggio altrui sui 19 ownership; completezza imposta | F-5 (tabella delle 30 fixture con file:riga), F-9, C-1, C-2, probe P3, Pattern 5 |
| BE-SESSION-02 | Il login revoca le altre sessioni (`newLogin`), WS chiusi con 4409 + motivo, `connection_init` revocata → 4409, JWT stateless | F-1, F-3, F-7, probe P2, Pattern 1–3 |
| BE-SESSION-03 | `SESSION_REVOKED` + `extensions.reason`, `reuseDetected`, `revokeReason` nullable, nessuna migrazione, SDL invariato | F-2, F-6, probe P1, Pattern 4 |
| BE-SESSION-04 | Cambio di `role` (change stream o `upsertWithRole`) → `roleChanged` su tutte le sessioni; logout → `userLogout` sulla sola corrente | F-4, F-6, C-3, C-4, probe P4 |
| BE-SESSION-05 | Gate (`tsc`, coverage per cartella, boot reale con whitelist e SDL invariati) e handoff | F-8, F-10, F-11, Validation Architecture |
</phase_requirements>

## Project Constraints (from CLAUDE.md e 17-REPO-RULES.md)

- TDD obbligatorio: RED (`test(<scope>)`), poi GREEN (`feat`/`fix`), poi REFACTOR. Il titolo di ogni test di una regola nuova nomina la decisione (`(D-02)`; i grep cercano `D-NN)`).
- Clean Code, SoC, Boy Scout. Niente `jest.mock(` di moduli: si fa override dei provider. Nessun `Math.random` né `Date.now` nel codice nuovo (si usa la porta `Clock`). Il codice esistente usa `Date.now()` in `ws-connection-authenticator.ts:67` e `auth.guard.ts:79`: non è codice nuovo.
- Mai `npm run lint`, `npm run build`, `nest build`, `npm run start*`, `node dist/main.js`, `node --env-file`. Lint e prettier solo sui file toccati, uno per uno. Un file che fallisce già `prettier --check` riceve prima un commit `style(...)` separato.
- Jest con i percorsi PRIMA di `--selectProjects`; integration sempre `--runInBand`; mai in background; a fine task `pgrep -fl 'bin/jest'` vuoto (trappola 15-03: spec appesa → `kill -TERM`).
- `npx tsc --noEmit -p tsconfig.json` esce 0 a fine di ogni task di codice.
- Mai leggere o stampare `.env` o variabili d'ambiente. Mai il DB reale. Nessuna variabile d'ambiente nuova (codice e motivi sono costanti TS). Nessuna migrazione.
- Log: solo id, conteggi, nome e codice dell'errore (`describeError`). Mai token, hash o twitchId.
- Commit in inglese, subject ≤ 72, scope `auth|session|ws|authz|users|test|config|phase-17`. **Nessun trailer** `Co-Authored-By`/`Generated with`/`Claude-Session`. Stage per path esplicito.
- SDL invariato: `git diff --exit-code src/schema.gql` resta vuoto per tutta la fase. Backend fonte di verità.

## Standard Stack

### Core (già installato, nessuna aggiunta)

| Libreria | Versione | Uso nella fase | Fonte |
|----------|----------|----------------|-------|
| graphql-ws | 6.0.6 | `onConnect` / `onClose` con `extra.socket`; `return false` → `close(4403)` dopo il nostro `close(4409)` | [VERIFIED: `node_modules/graphql-ws/package.json`, `dist/server-3ewaJSjp.js:66-69,281-288`] |
| ws | 8.18.3 | `socket.close(code, reason)`: 4409 accettato; una seconda `close` su un socket CLOSING/CLOSED è un no-op | [VERIFIED: probe P2] |
| mongoose | 8.18.1 | `updateMany` condizionale, `findById(...).lean()` proiettato, `Model.watch(pipeline)` | [VERIFIED: probe P4] |
| mongodb (driver) | 6.19.0 | change stream: `updateDescription.updatedFields`, `documentKey` | [VERIFIED: probe P4] |
| @nestjs/apollo / graphql | 13.1.0 / 16.11.0 | `formatError` (HTTP); su WS i hook `onNext`/`onError` di produzione | [VERIFIED: `src/graphql/graphql-options.factory.ts:66-107`] |
| jest / mongodb-memory-server / redis-memory-server | 30 / 11.2.0 / in cache | harness integration, boot reale | [VERIFIED: probe P3, 2,1 s di boot] |

### Alternatives Considered

| Invece di | Si potrebbe | Perché no |
|-----------|-------------|-----------|
| Registro in memoria `WsSessionRegistry` chiamato da `SessionRevocationService` | Change stream su `sessions` (`updatedFields.revokedAt`) che chiude i socket in ogni processo | Coprirebbe tutti i percorsi di revoca e più processi. Però è asincrono (test con priming, Pitfall 9), chiuderebbe anche al logout (rumore nel teardown FE, Open Question 3) e contraddice i nomi fissati. D-03 dice single-node: si sceglie il registro e si documenta il limite multi-processo nel handoff (Pitfall 7). |
| Matrice su `createAuthTestApp` + moduli importati | Boot reale di `AppModule` (come `test/app.int-spec.ts`) | Sei moduli registrano code Bull (`characters.module.ts`, `spell-recovery.module.ts`, `travel-planning.module.ts`, `quest-outcomes.module.ts`, `quest-resolution-scheduling.module.ts`): servirebbero override di tre `getQueueToken`, di `PushTransport`, `PUSH_CONFIG`, `TRAVEL_CONFIG` (precedente `test/quests/outcome-world.ts:136-176`), e nessuna garanzia che l'insieme montato sia quello delle liste. Il boot reale costa 2,1 s (probe P3). Vedi C-2. |
| `revokeOthersOf` con `_id: { $ne: keep }` | `_id: { $lt: keep }` | `$ne` revoca anche una sessione nata da un login concorrente successivo: due login quasi simultanei si cacciano a vicenda. Gli ObjectId generati nello stesso processo sono monotoni (probe P4). Open Question 4. |

**Installazione:** nessuna.

## Findings

### F-1 — Revoca al login (D-02)

- **Punto d'innesto.** `AuthSessionService.issueForUser` (`src/auth/auth-session.service.ts:23-28`): dopo `sessionService.create(user.id)` e prima di `buildSession`. È l'unico punto in cui il login emette una `AuthSession`: `exchangeLoginTicket` lo chiama a `:40`. [VERIFIED: codebase]
- **Altri chiamanti di `issueForUser`.** Solo test:
  - `test/auth/test-tokens.ts:73-75` (`createAuthenticatedUser`, usato da `createPlayer`);
  - `src/auth/auth-session.service.int-spec.ts` (una chiamata per test, utente nuovo a ogni `beforeEach`: `:60-63`).

  `createAuthenticatedUser` persiste **sempre un utente nuovo** (`test-tokens.ts:69-72`): la revoca delle altre sessioni non tocca nessun test esistente. Costo in più: una `find` vuota per utente di test. Nessun test esistente fa due login dello stesso utente. Verificato su `login-flow.int-spec.ts`, `auth.resolver.int-spec.ts:121-200`, `http-guard.int-spec.ts`, `twitch-auth.controller.int-spec.ts` e `throttling.int-spec.ts` (ticket invalidi). [VERIFIED: grep]
- **Dev bypass.** `DevAuthStrategy` non passa da `issueForUser` (`src/auth/dev/dev-auth.strategy.ts:27-40`) e l'identità dev non ha `sessionId`: nessun effetto. [VERIFIED: codebase]
- **Forma dell'update** («il filtro è la regola»). Due passi:
  1. `find({ userId, _id: { $lt: keep }, revokedAt: null, expiresAt: { $gt: now } }, { _id: 1 }).lean()` dà gli id candidati;
  2. `updateMany({ _id: { $in: ids }, revokedAt: null }, { $set: { revokedAt: now, revokeReason } })`.

  `revokeOthersOf` restituisce gli id, che servono a chiudere i socket. È idempotente: il filtro `revokedAt: null` lascia intatte motivo e data di una sessione già revocata. `userId` è `MongooseSchema.Types.ObjectId` con `ref` (`session.model.ts:18-24`): Mongoose casta l'esadecimale stringa nei filtri (niente trappola Mixed di 04 Pitfall 1). Indice `userId` presente (`:22`). [VERIFIED: codebase; ASSUMED il cast del filtro, comportamento standard di Mongoose sui path ObjectId tipizzati]
- **Ordine.** Revoca a DB, poi chiusura dei socket (REPO-RULES: «mai l'inverso»). Un errore della revoca fa fallire il login. La sessione nuova resta orfana e scade col TTL dei 30 giorni: innocuo, perché nessuno ne ha il token (Open Question 5).

### F-2 — `extensions.reason` dal servizio al filo (D-05) — PROBE P1

- `AuthException` (`src/auth/auth.exception.ts:4-42`) dichiara `extensions: { code }`. graphql-js copia `originalError.extensions` nella risposta (commento a `:11`).
- **HTTP, sviluppo e produzione.** `formatError` è `formatDomainError` (sviluppo) o `sanitizeFormattedError(formatDomainError(...))` (produzione) (`graphql-options.factory.ts:66,83-88`). `formatDomainError` ricostruisce l'errore con `extensions: { code }` (`format-domain-error.ts:17-22`). **Probe P1:** una `UnauthorizedException` con `extensions = { code: 'SESSION_REVOKED', reason: 'newLogin' }` arriva in HTTP come `{"code":"SESSION_REVOKED"}` in **entrambe** le modalità. [VERIFIED: probe]
- **WS.** In sviluppo graphql-ws serializza `error.toJSON()` senza formatter: la probe vede `{"code":"SESSION_REVOKED","reason":"newLogin"}`. In produzione `onNext`/`onError` passano da `sanitizeExecutionErrors` (`production-errors.ts:28-44`), che chiama `formatDomainError` e poi `sanitizeFormattedError`: la probe vede `{"code":"SESSION_REVOKED"}`. [VERIFIED: probe]
- **Refresh reale di una sessione revocata.** Oggi `{"code":"SESSION_REVOKED"}` in entrambe le modalità (probe). Il refresh è una mutation HTTP (`auth.resolver.ts:34`): il canale della `reason` per la FE è l'HTTP (FE 12 D-09: alla 4409 il client rinnova e legge la `reason` dal rifiuto).
- **Modifiche necessarie (tre file):**
  1. `AuthException.sessionRevoked(reason?: SessionRevokeReason | null)` → `extensions: { code, reason }` solo se presente. Il body Nest (`getResponse`) resta invariato: `auth.exception.spec.ts:42-47` lo pinna;
  2. `formatDomainError`: dalla `CodedHttpException` legge anche `extensions.reason` (stringa) e la riscrive accanto a `code`. Il ramo di ripiego `readNestBodyAuthCode` (`:43-53`) resta senza `reason`, perché il body Nest non la porta;
  3. `sanitizeFormattedError` (`production-errors.ts:10-21`): per un codice non interno conserva `extensions.reason` se è una stringa. Allowlist di una sola chiave: nessun'altra extension passa.

  Il WS di produzione eredita le modifiche, perché `sanitizeExecutionErrors` compone le stesse due funzioni.
- **Asserzioni esistenti che restano verdi** con il parametro opzionale (nessuna `reason` quando assente):
  - `auth.exception.spec.ts:21,41` (`sessionRevoked()` → `{ code }`);
  - `format-domain-error.spec.ts:54-62`;
  - le `toEqual` di `production-surface.int-spec.ts:103,134-147,175,183,196-201,218,241,258,300` e di `production-errors.spec.ts` (errori senza `reason`).

  Diventano RED solo se il piano rende il parametro obbligatorio (tabella F-9).

### F-3 — Chiusura del WS di una sessione revocata (D-03) — PROBE P2

- **Hook realmente cablati.** `createGraphQLOptions` registra solo `onConnect` e `onClose` (`graphql-options.factory.ts:69-76`). L'`onClose` del wrapper passa il solo `context`, non code e reason. graphql-ws chiama `onDisconnect` **solo se la connessione era stata accettata** e `onClose` **sempre** (`node_modules/graphql-ws/dist/server-3ewaJSjp.js:281-288`): la pulizia del registro va in `onClose` (C-5). [VERIFIED: codebase]
- **Probe P2 (harness `createAuthTestApp`, spia su `WsConnectionAuthenticator.onConnect`/`onClose`).** Esiti:
  - due `openAcknowledgedSocket` con lo stesso bearer → due registrazioni con lo stesso `sessionId`. `socket.close(4409, 'newLogin')` su entrambi → ogni client riceve `{"code":4409,"reason":"newLogin","acknowledged":true}`, in 1 ms; `onClose` lato server scatta due volte con `extra.identity.sessionId` valorizzato. **Più connessioni per sessione esistono davvero:** il registro è `Map<sessionId, Set<socket>>`;
  - `onConnect` che fa `extra.socket.close(4409, 'newLogin')` e poi `return false` → il client riceve `{"code":4409,"reason":"newLogin","acknowledged":false}`. La `socket.close(4403, 'Forbidden')` di graphql-ws (`server-3ewaJSjp.js:67-68`) diventa un no-op su un socket già in chiusura. `onClose` scatta anche qui;
  - stessa cosa con `return true`: nessun ack, perché il `send` di `use/ws` risolve senza inviare se il socket non è OPEN (`dist/use/ws.js`, `send`). **Si usa `return false`**: nessun `acknowledged`, nessuna subscription possibile;
  - `close(4409)` su un socket già chiuso dal client (readyState 3) non lancia: `closeSessions` non deve proteggersi.

  [VERIFIED: probe]
- **Codici e reason.** `4409` è nell'intervallo applicativo 4000–4999 (il 4401 e il 4403 esistenti sono già lì). La reason del close è limitata a 123 byte dal protocollo: i quattro valori dell'enum sono corti. [VERIFIED: probe per il 4409; ASSUMED il limite di 123 byte, RFC 6455]
- **Single-node.** Il registro vive nel processo. Un secondo processo BE sullo stesso DB (già usato nelle UAT per gli sweep) non vede i socket del primo (Pitfall 7).

### F-4 — Watcher del ruolo (D-06) — PROBE P4

- **Probe P4** (`users.watch([{ $match: { operationType: 'update', 'updateDescription.updatedFields.role': { $exists: true } } }])` sul replica set dell'harness, dopo il priming). Esiti:
  - `$set twitchPoints` → nessun evento;
  - `$set role` allo stesso valore → nessun evento;
  - `$set role` diverso → un evento `{ operationType: 'update', documentKey: { _id }, updateDescription: { updatedFields: { role: 'innkeeper' }, removedFields: [], truncatedArrays: [] } }`, senza `fullDocument`;
  - update Mongoose senza `$set` esplicito (`{ role }`): stesso esito (no-op sullo stesso valore, evento sul cambio);
  - `UsersService.upsertWithRole` sullo stesso ruolo → niente; su un ruolo diverso → evento; su un utente nuovo → insert, filtrato;
  - `replaceOne` e `$unset` → filtrati.

  **Idempotenza gratis:** il cambio allo stesso valore non produce eventi, e la revoca filtra `revokedAt: null`. [VERIFIED: probe]
- **Modello da copiare.** `ArchivedCharacterQueueRefresher` (`src/quests/pending-requests/archived-character-queue.refresher.ts:14-48`): `ChangeStreamPublisher` senza publish, pipeline su `updatedFields.<campo>`, `onChange` che delega. Il ruolo si legge da `documentKey` con `documentIdOf(change.documentKey)` (`src/mongo/document-id.ts:6-10`): nessun `fullDocument: 'updateLookup'` serve. L'interfaccia `ChangeStreamEvent` (`change-stream-publisher.ts:11-15`) ha già `documentKey`. [VERIFIED: codebase]
- **Ospitarlo in `UserUpdatesPublisher`?** No. Quel publisher ascolta ogni update e replace con `updateLookup` (`user-updates.publisher.ts:16-20`) e ha un'altra responsabilità (SoC). E sta in `UsersModule`, che non può dipendere da `AuthModule` (C-3).
- **Revoca e chiusura.** `onChange` chiama `sessionRevocation.revokeAllForRoleChange(userId)`, che fa `revokeAllOf(userId, roleChanged)` e poi `closeSessions(ids, 'roleChanged')`. La promessa va chiusa con `.catch` e log via `describeError`: un rifiuto non gestito abbatterebbe il processo. Raffiche sullo stesso utente: idempotenti, `KeyedSingleFlight` (`src/mongo/keyed-single-flight.ts`) è facoltativo.
- **Storia persa e BE spento.** Nessuna risincronizzazione serve in `onHistoryLost`. Se il ruolo cambia mentre il BE è giù, l'evento si perde (nessun token di ripresa persistito). Il ruolo stantio vive però al massimo un TTL del JWT: il refresh rilegge il ruolo dal DB a ogni rinnovo (Phase 2 D-10, `auth-session.service.ts:43-61`). Per questo D-10 resta la rete di sicurezza e il suo test va tenuto (Pitfall 2).
- **Oste promosso.** Il cambio a `innkeeper` revoca anche le sue sessioni: rifà il login (accettato dal brief). Lo stesso vale per un `adventurer` retrocesso.
- **Dev bypass.** `DevAuthStrategy` chiama `upsertWithRole(devAuth.twitchId, devAuth.role)` alla prima richiesta col token dev (`dev-auth.strategy.ts:27-40`). Se `DEV_AUTH_TWITCH_ID` coincide con l'account Twitch reale e `DEV_AUTH_ROLE` differisce dal ruolo a DB, ogni primo uso del token dev dopo un riavvio cambia il ruolo e revoca le sessioni reali di quell'account (Pitfall 6). Il processo BE in esecuzione sulla macchina dell'utente (pid 37908, `PORT=3001`) usa `DEV_AUTH_TWITCH_ID=dev-twitch-id`, distinto da un twitchId reale.

### F-5 — Matrice di autorizzazione (D-01) — PROBE P3

- **Liste.** `test/app.int-spec.ts:120-132` (`EXPECTED_INNKEEPER_HANDLERS`, 11), `:133-153` (`EXPECTED_OWNERSHIP_HANDLERS`, 19), `:155-164` (`EXPECTED_OWNER_ONLY_HANDLERS`, 8, sottoinsieme delle 19 senza bypass dell'oste). Confronti coi metadati a `:1169-1189`. Le tre liste sono ordinate e disgiunte fra innkeeper e ownership. [VERIFIED: codebase]
- **`test/authz/expected-handlers.ts`.** Esporta le tre liste come tuple `as const` (con i commenti D-15 e 07 D-11 spostati insieme) e i tipi derivati (`InnkeeperHandler`, `OwnershipHandler`). Diff in `test/app.int-spec.ts`: si tolgono le righe `119-164` (commento più tre costanti) e si aggiunge `import { EXPECTED_INNKEEPER_HANDLERS, EXPECTED_OWNER_ONLY_HANDLERS, EXPECTED_OWNERSHIP_HANDLERS } from './authz/expected-handlers';`. I `toEqual` di `:1170-1189` restano identici: `toEqual` confronta array e tuple readonly.
- **Dove lanciano i guard** [VERIFIED: codebase, probe P3]:
  - senza bearer o con bearer invalido su HTTP: `AuthGuard` globale (`src/auth/guards/auth.guard.ts:22-28`) → `AuthException.unauthenticated()` → `{ code: 'UNAUTHENTICATED' }`, `data: null`, status 200;
  - ruolo sbagliato: `RolesGuard` (`src/authz/roles/roles.guard.ts:14-25`) → `AuthorizationException.innkeeperOnly()` → `{ code: 'FORBIDDEN' }`, messaggio «Operazione riservata al locandiere»;
  - ownership: `OwnershipGuard` → `CharacterAccessPolicy`. Messaggi:
    - personaggio: `notOwner()`, «Questo personaggio non ti appartiene», dopo `assertCharacterExists` (`character-access.policy.ts:93-109`): **il personaggio vittima deve esistere ed essere attivo**, altrimenti `NOT_FOUND`;
    - PendingQuest: `pendingQuestNotOwned()`, «Questa missione non ti appartiene», solo se la PendingQuest esiste (`:112-131`);
    - QuestResult: `questResultNotOwned()`, «Questo risultato non ti appartiene», solo se il risultato esiste (`:134-147`).

    L'innkeeper è esente salvo `ownerOnly` (`:105`). Sulle PendingQuest è sempre esente (`:118`).
  - I guard girano **prima delle pipe** (`character-access.policy.ts:98` C1), ma **dopo la validazione GraphQL** dei documenti e delle variabili: ogni fixture deve essere valida per lo SDL.
  - Su WS, senza bearer o con bearer invalido, nessun errore per operazione: la `connection_init` è chiusa con `4403 'Forbidden'` (`ws-connection-authenticator.ts:41-44`, `test/auth/ws-auth.int-spec.ts:30-37`) (C-1). Con un JWT valido ma ruolo o proprietà sbagliati, la subscribe fallisce come in `character-updated.subscription.int-spec.ts:204-218`. Il primo `next()` dà `{ data: null, errors: [{ extensions: { code: 'FORBIDDEN' }, path: [<campo>] }] }`; il secondo `done: true`. Probe P3 su `pendingRequestsUpdated` come `adventurer`: `{"errors":[{"message":"Operazione riservata al locandiere","path":["pendingRequestsUpdated"],"extensions":{"code":"FORBIDDEN"}}]}`.
- **Fixture minime (una sola volta per spec):**
  - **vittima V**: utente più personaggio attivo C, con `persistUser`, `persistCharacter` e il modello `PointOfInterest`, come `test/authz/player-fixture.ts:31-75`;
  - **PendingQuest P**: qualunque documento;
  - **QuestResult R**: con `user = V`, fixture `test/quests/quest-result.fixture.ts`;
  - **attaccanti**: un `adventurer` senza personaggio, una `guard`, un `innkeeper` (righe facoltative senza bypass), ognuno con una sessione vera via `app.get(AuthSessionService).issueForUser(user)`. Si usano sessioni vere e non JWT stateless, così la matrice non dipende dalla regola sulla sessione assente alla `connection_init` (Open Question 1);
  - **bearer invalidi**: `'Bearer not-a-jwt'` e un JWT firmato con un altro secret (come `ws-auth.int-spec.ts:76-87`).
- **Tabella delle 30 fixture** (`test/authz/handler-fixtures.ts`, `Record<InnkeeperHandler | OwnershipHandler, HandlerFixture>` con `kind: 'query' | 'mutation' | 'subscription'`, `document`, `variables(ids)`). `ANY` = un ObjectId esadecimale qualunque (il guard rifiuta prima di usarlo). [VERIFIED: codebase e `src/schema.gql`]

| # | Handler | Resolver (file:riga) | Kind | Documento e variabili minime | Fixture |
|---|---------|---------------------|------|------------------------------|---------|
| 1 | CharactersResolver.characters | `src/characters/characters.resolver.ts:35-39` | query | `{ characters { id } }` | — |
| 2 | PendingQuestsResolver.pendingQuests | `src/pendingQuests/pending-quests.resolver.ts:12-14` | query | `{ pendingQuests { id } }` | — |
| 3 | PendingRequestsResolver.completePendingRequest | `src/quests/pending-requests/pending-requests.resolver.ts:46-53` | mutation | `completePendingRequest(input: $input) { id }`, `CompletePendingRequestInput!` = `{ pendingQuestId: ANY }` | — |
| 4 | PendingRequestsResolver.pendingRequests | `…/pending-requests.resolver.ts:25-27` | query | `{ pendingRequests { id } }` | — |
| 5 | PendingRequestsResolver.pendingRequestsUpdated | `…/pending-requests.resolver.ts:32-34` | subscription | `subscription { pendingRequestsUpdated { id } }` | — |
| 6 | PushResolver.sendTestPush | `src/push/push.resolver.ts:34-39` | mutation | `sendTestPush(input: $input) { sent }`, `SendTestPushInput!` = `{ type: questEnd }` | — |
| 7 | QuestGenerationResolver.generateQuests | `src/quests/generation/quest-generation.resolver.ts:13-16` | mutation | `mutation { generateQuests { created } }` | — |
| 8 | ShopAdminResolver.shopPoolReport | `src/shops/shop-admin.resolver.ts:12-14` | query | `{ shopPoolReport { cityId } }` | — |
| 9 | TravelAdminResolver.teleportCharacter | `src/travel/travel-admin.resolver.ts:17-21` | mutation | `teleportCharacter(request: $r) { successful }`, `TravelRequest!` = `{ id: ANY, poiId: ANY }` | — |
| 10 | UsersResolver.user | `src/users/users.resolver.ts:29-33` | query | `user(id: $id) { id }`, `String!` | — |
| 11 | UsersResolver.users | `src/users/users.resolver.ts:23-27` | query | `{ users { id } }` | — |
| 12 | CharactersResolver.character | `characters.resolver.ts:41-45` | query | `character(id: $id) { id }`, `String!` = C | C |
| 13 | CharactersResolver.characterUpdated | `characters.resolver.ts:122-137` | subscription | `characterUpdated(id: $id) { id }` = C | C |
| 14 | CharactersResolver.doTransaction | `characters.resolver.ts:53-61` | mutation | `TransactionRequest!` = `{ id: C, boughtItems: { equipAssets: [], lootAssets: [] }, soldItems: { equipAssets: [], lootAssets: [] }, total: { gold: 0, silver: 0, copper: 0 }, isTotalPositive: true }`, `{ successful }` | C |
| 15 | CharactersResolver.equipItem | `characters.resolver.ts:63-70` | mutation | `EquipItemRequest!` = `{ id: C, slotType: arms }` | C |
| 16 | CharactersResolver.equipPet | `characters.resolver.ts:73-80` | mutation | `EquipPetRequest!` = `{ id: C, petId: ANY }` | C |
| 17 | CharactersResolver.equipSpell | `characters.resolver.ts:91-98` | mutation | `EquipSpellRequest!` = `{ id: C, spellId: ANY }` | C |
| 18 | CharactersResolver.equipment | `characters.resolver.ts:47-51` | query | `equipment(id: $id) { arms { id } }` = C | C |
| 19 | CharactersResolver.unequipPet | `characters.resolver.ts:82-89` | mutation | `UnequipPetRequest!` = `{ id: C }` | C |
| 20 | CharactersResolver.unequipSpell | `characters.resolver.ts:100-107` | mutation | `EquipSpellRequest!` = `{ id: C, spellId: ANY }` | C |
| 21 | CharactersResolver.useSpell | `characters.resolver.ts:109-118` | mutation | `UseSpellRequest!` = `{ characterId: C, spellId: ANY }` | C |
| 22 | PartyResolver.abandonQuest | `src/quests/party/party.resolver.ts:15-22` (ownerOnly) | mutation | `AbandonQuestRequest!` = `{ id: C, questId: ANY }` | C |
| 23 | PendingQuestsResolver.pendingQuest | `pending-quests.resolver.ts:18-20` | query | `pendingQuest(id: $id) { id }` = P | P |
| 24 | QuestAcceptanceResolver.acceptQuest | `src/quests/acceptance/quest-acceptance.resolver.ts:18-24` (ownerOnly) | mutation | `AcceptQuestRequest!` = `{ id: C, questId: ANY }` | C |
| 25 | QuestAcceptanceResolver.questTravelPreview | `quest-acceptance.resolver.ts:41-47` (ownerOnly) | query | `questTravelPreview(request: $r) { duration }` = `{ id: C, questId: ANY }` | C |
| 26 | QuestResultsResolver.acknowledgeQuestResult | `src/quests/results/quest-results.resolver.ts:45-48` (ownerOnly) | mutation | `acknowledgeQuestResult(id: $id) { successful }` = R | R |
| 27 | QuestResultsResolver.questResult | `quest-results.resolver.ts:28-30` (ownerOnly) | query | `questResult(id: $id) { id }` = R | R |
| 28 | QuestResultsResolver.questResultReceived | `quest-results.resolver.ts:60-66` (ownerOnly) | subscription | `questResultReceived(characterId: $c) { id }` = C | C |
| 29 | TravelResolver.startTravel | `src/travel/travel.resolver.ts:17-22` (ownerOnly) | mutation | `TravelRequest!` = `{ id: C, poiId: ANY }` | C |
| 30 | TravelResolver.travelPreview | `travel.resolver.ts:32-37` (ownerOnly) | query | `travelPreview(request: $r) { duration }` = `{ id: C, poiId: ANY }` | C |

- **Completezza.** È doppia:
  - il tipo `Record<…>` impone una chiave per ogni voce delle tuple (`tsc`);
  - un test esplicito: `expect(Object.keys(HANDLER_FIXTURES).sort()).toEqual([...EXPECTED_INNKEEPER_HANDLERS, ...EXPECTED_OWNERSHIP_HANDLERS].sort())`.

  Un handler nuovo nelle liste senza fixture non compila e fa fallire la spec. Il boot reale garantisce lista = metadati.
- **Righe.** Innkeeper: 11 × {`adventurer`, `guard`} → `FORBIDDEN`; 11 × {nessun bearer, bearer invalido} → `UNAUTHENTICATED` su HTTP, `4403 'Forbidden'` su WS per la riga 5 (C-1). Ownership: 19 × `adventurer` sul C/P/R altrui → `FORBIDDEN`. Facoltativo e raccomandato: le 8 owner-only × `innkeeper` → `FORBIDDEN` (07 D-11, nessun bypass). In tutto ≈ 71 casi.
- **Tempi stimati.** Boot reale 2,1 s (probe P3), circa 60 richieste HTTP da circa 10 ms, 8 subscription WS da circa 10 ms (probe: 7 ms). Spec intera ≈ 8–12 s.

### F-6 — Modello della sessione (D-08) e scritture del motivo

- `revokeReason: SessionRevokeReason | null`, `@Prop({ type: String, enum: Object.values(SessionRevokeReason), default: null })` accanto a `revokedAt` (`session.model.ts:41-42`). **Gli update non validano gli enum:** probe P4 su uno schema usa e getta con `enum` → `updateMany` con un valore fuori enum lo scrive (`'zzz'`); con `runValidators: true` → `ValidationError`; `create` → `ValidationError`. Il tipo TS è l'unica barriera sugli update: nessun valore arriva da input esterno. [VERIFIED: probe]
- **Documenti esistenti.** Le sessioni revocate prima della fase non hanno il campo: `lean()` restituisce `undefined`, un documento idratato restituisce `null` (default). `revokeReasonOf` normalizza a `null` (Pitfall 4). Nessuna migrazione.
- **Punti di scrittura** [VERIFIED: codebase]:
  - `SessionService.revoke` (`session.service.ts:96-104`) → `$set: { revokedAt, revokeReason }`. Chiamanti: `auth-session.service.ts:53` (utente cancellato: nessun motivo nell'enum, C-6) e `:67` (logout → `userLogout`, D-07);
  - reuse detection: `rejectRefresh` (`session.service.ts:191-213`), `findOneAndUpdate` a `:195-203` → `$set: { revokedAt: now, revokeReason: reuseDetected }`, poi `throw AuthException.sessionRevoked(reuseDetected)` a `:208`;
  - rifiuto di un token di una sessione già revocata: `isRevokedSessionToken` (`:215-228`) diventa una `findOne` proiettata su `revokeReason` che restituisce il motivo memorizzato, poi `sessionRevoked(reason)` a `:211`. Così il caso IN-11 (token ritirato di una sessione già revocata, `session.service.int-spec.ts:571-584`) risponde col motivo originale (es. `userLogout`).
- **Asserzioni esatte su documenti `Session`:** nessuna (nessun `toEqual` sull'intero documento; `session.service.int-spec.ts:757-770` valida solo la fixture). `test/fixtures/session.fixture.ts:15-26` può aggiungere `revokeReason: null` (Boy Scout, facoltativo). [VERIFIED: grep]

### F-7 — Verifica della sessione alla `connection_init` (D-03, una lettura)

- **Query più economica:** `sessionModel.findById(sessionId, { revokedAt: 1, revokeReason: 1 }).lean()` sull'`_id`. `revokeReasonOf(sessionId)` restituisce `null` se la sessione è attiva o assente, `{ reason: SessionRevokeReason | null }` se è revocata (`revokedAt != null`). Un `sid` non ObjectId → `null`, come `revoke` a `session.service.ts:97`. Nessuna condizione su `expiresAt`: un JWT vivo con la sessione scaduta non capita (TTL 900 s contro 30 giorni).
- **Ordine in `onConnect`** (`ws-connection-authenticator.ts:28-45`):
  1. `resolveBearer`;
  2. `extra.identity = identity`;
  3. se `extra.closed` → `return true`: **nessuna registrazione** (il socket è già chiuso: `onClose` è già passato, una registrazione ora resterebbe orfana);
  4. **registra** il socket (`registry.register(sessionId, socket)`) se c'è un `sessionId`;
  5. **leggi** lo stato. Se è revocata: `socket.close(4409, reason ?? '')` e `return false`;
  6. `scheduleExpiryClose` e `return true`.

  Registrare **prima** di leggere chiude la finestra di corsa con un login concorrente. La revoca scrive a DB e poi scorre il registro: o il socket è già nel registro (chiuso dallo scorrimento), o la lettura, successiva, vede la revoca. Un errore della lettura cade nel `catch` esistente → `return false` → 4403 (fail-closed, come oggi). La pulizia di `onClose` usa `extra.identity?.sessionId` e il socket.
- **Cache:** nessuna. È una lettura per connessione, su `_id`; le connessioni sono rare (una per avvio o per riconnessione).
- **Identità dev:** nessun `sessionId` → nessuna lettura, nessuna registrazione.

### F-8 — Coverage e gate

- **Coverage di `./src/auth/`** con le sole spec di `src/auth` e `test/auth` (unit + integration, 36 suite, 404 test, **32 s**): statements 99,83 % (590/591), branches **86,71 %** (261/301), lines 100 % (526/526). Soglie in `package.json`: 97 / 84 / 98. [VERIFIED: comando eseguito] Margine sui branch: circa 8 branch scoperti. La fase aggiunge almeno 10 rami in `src/auth/`: `reason` presente o assente, revocata o attiva, `closed`, `sessionId` assente, `sid` invalido, `catch` del watcher se il file sta in `src/auth`, ramo vuoto di `revokeOthersOf`, motivo legacy null. Vanno coperti tutti dai test unitari.
- **Ripiego per cartella.** `test:cov` era a 576,5 s alla 16-11 (373 suite): con le suite nuove supererà quasi certamente i 600 s del tool. Comando di ripiego verificato:

  `npx jest src/auth test/auth test/authz --coverage --coverageThreshold='{}' --collectCoverageFrom='src/auth/**/*.ts' --collectCoverageFrom='!src/**/*.spec.ts' --collectCoverageFrom='!src/**/*.int-spec.ts' --coverageReporters=json-summary --coverageReporters=text-summary --selectProjects unit integration --runInBand`

  poi il confronto con `node -e` su `coverage/coverage-summary.json` (`total.statements.pct >= 97 && total.branches.pct >= 84 && total.lines.pct >= 98`). Senza `--coverageThreshold='{}'` il comando **esce sempre 1**: le altre chiavi di cartella (`./src/economy/`, …) danno «Coverage data for … was not found» (Pitfall 8). [VERIFIED: entrambi i comandi eseguiti]
- **SDL.** Nessun `registerEnumType` né `@Field` nuovi: l'enum viaggia solo nelle `extensions` e il campo `revokeReason` è solo `@Prop` (la `Session` non è un `@ObjectType`, `session.model.ts:16`). Dopo il boot reale della probe P3 `git diff --stat src/schema.gql` era vuoto. [VERIFIED]
- **Whitelist del boot reale.** Nessun handler nuovo: le liste `EXPECTED_*` non cambiano, si spostano. Va aggiunto un test «mounts the user role changes publisher» sul modello di `test/app.int-spec.ts:892-902`.

### F-9 — Asserzioni esistenti che cambiano (tabella F)

| File:riga | Cosa pinna | Cosa succede | Azione |
|-----------|------------|--------------|--------|
| `src/auth/auth-session.service.int-spec.ts:173-185` | «re-reads the role from the database on every refresh (D-10)»: `updateOne role → innkeeper`, poi refresh | **Instabile**: il watcher (attivo in ogni `createAuthTestApp` via `AuthModule`) revoca la sessione in modo asincrono → `SESSION_REVOKED` o successo a seconda della gara | Override del provider del watcher in questa spec (`overrides: [{ token: UserRoleChangesPublisher, useValue: {} }]`), così D-10 resta provato come rete di sicurezza. Il comportamento nuovo va in una spec D-06 dedicata |
| `src/users/user-updated.subscription.int-spec.ts:232-245` | «streams a role changed by hand»: il WS dello stesso utente riceve il nuovo ruolo | **Instabile**: lo stesso cambio chiude il suo WS con `4409 roleChanged` (D-03, D-06), in gara col publish di `userUpdated` | Riscrivere con il bearer dev (`TEST_DEV_ACCESS_TOKEN`: identità senza sessione, mai chiusa) cambiando a mano il ruolo dell'utente dev, oppure pinnare il comportamento nuovo (chiusura 4409). Raccomandato: bearer dev più una riga D-06 nella spec nuova |
| `src/auth/ws/ws-connection-authenticator.spec.ts:51-53` | `new WsConnectionAuthenticator(identityResolver)` | **RED (tsc)** quando il costruttore riceve `SessionService` (o una porta di lookup) e `WsSessionRegistry` | Aggiornare il costruttore con due fake; i test esistenti (`:61-196`) restano validi con la lookup «attiva» |
| `src/auth/session/session.service.int-spec.ts:157,165,170,575,590,652` | `service.revoke(id)` a un argomento | **RED (tsc)** se `revoke(sessionId, reason)` ha il secondo parametro obbligatorio (raccomandato: esplicito, `SessionRevokeReason \| null`) | Passare il motivo |
| `src/auth/auth-session.service.ts:53` | revoca dell'utente cancellato | Nessun motivo nell'enum (C-6) | `revoke(sessionId, null)` e `sessionRevoked()` senza motivo |
| `test/app.int-spec.ts:119-164` | le tre liste inline | Spostate (refactor, non RED) | `import` da `./authz/expected-handlers` |
| `src/auth/auth.exception.spec.ts:21,41`, `src/graphql/format-domain-error.spec.ts:54-62` | `sessionRevoked()` → `{ code }` | Restano verdi con il parametro opzionale | Aggiungere i casi con `reason` |
| `src/users/user-updates.publisher.int-spec.ts:171-184` | publish di un ruolo cambiato a mano (PubSub, niente WS) | Resta verde: la revoca non tocca il PubSub | — |
| `test/auth/ws-auth.int-spec.ts:30-37,223-243` | 4403 e 4401 letterali | Restano verdi: sessioni vere, attive | Aggiungere la costante letterale `4409` nei test nuovi (stesso stile `:18-22`) |

Nessun `Object.keys` pinnato su `Session` o sulle `extensions` di `AuthException` oltre a quelli elencati. [VERIFIED: grep su `toEqual`, `Object.keys`, `toStrictEqual` in `src/auth`, `test/auth`, `src/graphql`, `test/fixtures`]

### F-10 — Prettier sui file che la fase tocca

`npx prettier --check` eseguito su 40 file candidati (sorgenti e spec di `src/auth/**`, `src/graphql/{format-domain-error,production-errors,graphql-options.factory}*`, `src/mongo/change-stream-publisher.ts`, `src/users/*`, `src/pubsub.module.ts`, `test/app.int-spec.ts`, `test/auth/*`, `test/authz/*`, `test/fixtures/session.fixture.ts`, `test/harness/prime-change-stream.ts`). **Fallisce solo `test/setup/redis.ts`**. La fase lo tocca solo se l'helper del boot reale ci finisce dentro: in quel caso prima un commit `style(test): format test/setup/redis.ts`. [VERIFIED]

### F-11 — Handoff (D-09) e tunnel TLS

- **Contratto per la FE.**
  - Close `4409`, reason = valore dell'enum oppure `''` per una sessione revocata senza motivo (Open Question 2). FE 12-REPO-RULES: «a missing or unknown reason is legal».
  - Errore d'esempio: `{"errors":[{"message":"Session revoked, sign in again","locations":[{"line":1,"column":27}],"path":["refreshSession"],"extensions":{"code":"SESSION_REVOKED","reason":"newLogin"}}],"data":null}`. È la forma della probe P1, con la `reason` che la fase aggiunge.
  - `SESSION_EXPIRED` senza `reason`.
  - Finestra del JWT: 900 s su HTTP (D-04).
  - La FE alla 4409 rinnova prima di riconnettere (FE 12 D-09): il refresh rifiutato porta la `reason`.
- **UAT dual-device.** Il secondo login (stesso account Twitch reale) revoca il primo e chiude il suo WS in pochi ms. **Serve un solo processo BE** (Pitfall 7). Il dev bypass non partecipa. Un cambio di ruolo a mano revoca entrambi i device con `roleChanged`.
- **Tunnel TLS** (cloudflared o ngrok verso il BE locale):
  - nessun `enableCors`, nessun controllo dell'host (`src/main.ts`, grep di `enableCors`/`helmet`/`allowedHosts` vuoto, Phase 10 D-06): l'app mobile non manda header CORS che contino;
  - `TWITCH_REDIRECT_URI` deve diventare `https://<host-del-tunnel>/auth/twitch/callback` nel `.env` dell'utente ed essere registrata nella console Twitch. `isAllowedTwitchRedirectUri` accetta qualunque `https:` (`src/config/auth-config.ts:183-191`). Si usa sia nell'authorize URL (`src/auth/twitch/twitch-authorize-url.ts:14`) sia nello scambio del codice (`http-twitch-oauth.client.ts:53`): deve coincidere byte per byte con quella registrata;
  - `APP_AUTH_REDIRECT_URL` resta il deep link `klimmeck://auth`;
  - il WS passa come `wss://` dal tunnel (cloudflared e ngrok inoltrano l'upgrade) [ASSUMED];
  - il throttler (`THROTTLE_LIMIT` 20/60 s su login e refresh) vede tutte le richieste del tunnel dallo stesso IP locale (`THROTTLE_TRUST_PROXY` spenta): con due device basta, da annotare.

  Nessuna modifica di codice BE. [VERIFIED: codebase]

## Architecture Patterns

### Recommended Project Structure

```
src/auth/session/
├── session-revoke-reason.enum.ts      # SessionRevokeReason (4 valori stringa), niente registerEnumType
├── session.model.ts                    # + revokeReason
├── session.service.ts                  # revoke(id, reason), revokeOthersOf, revokeAllOf, revokeReasonOf, reuseDetected
├── session-revocation.service.ts       # revokeOthersOnLogin, revokeAllForRoleChange: DB, poi registry
└── user-role-changes.publisher.ts      # (C-3: qui, registrato in AuthModule) change stream sul ruolo
src/auth/ws/
├── ws-close-codes.ts                   # + WS_SESSION_REVOKED_CLOSE_CODE = 4409
├── ws-session-registry.ts              # Map<sessionId, Set<socket>>
└── ws-connection-authenticator.ts      # register → lookup → 4409 | expiry timer; onClose → unregister
src/auth/auth.exception.ts              # sessionRevoked(reason?)
src/auth/auth-session.service.ts        # issueForUser → revokeOthersOnLogin; logout → userLogout
src/auth/auth.module.ts                 # + WsSessionRegistry, SessionRevocationService, UserRoleChangesPublisher, forFeature User
src/graphql/format-domain-error.ts       # conserva reason
src/graphql/production-errors.ts        # conserva reason per i codici non interni
test/authz/
├── expected-handlers.ts                # tre liste as const + tipi
├── handler-fixtures.ts                 # 30 righe
└── authorization-matrix.int-spec.ts    # boot reale, it.each
test/harness/real-app-boot.ts           # (consigliato) env + boot di AppModule condiviso con app.int-spec
```

### Pattern 1: revoca condizionale per utente (BE-SESSION-02, BE-SESSION-04)

Una `find` degli id candidati, poi un `updateMany` con `revokedAt: null` nel filtro. Restituisce gli id per chiudere i socket. Mai leggere, modificare e riscrivere il documento.

### Pattern 2: fan-out DB → socket in un solo servizio

`SessionRevocationService` è l'unico che conosce sia `SessionService` sia `WsSessionRegistry`. `AuthSessionService` e `UserRoleChangesPublisher` chiamano solo lui. `SessionService` resta ignaro del WS.

### Pattern 3: registrazione prima della lettura in `onConnect`

Vedi F-7. È l'unico ordine che non lascia un socket vivo su una sessione revocata in gara.

### Pattern 4: `reason` su allowlist di una chiave

Si estende `formatDomainError` e si propaga in `sanitizeFormattedError`. Nessuna copia generica delle `extensions`.

### Pattern 5: matrice table-driven sul boot reale

`describe.each` per gruppo (innkeeper HTTP, innkeeper WS, ownership HTTP, ownership WS), `it.each` sulle righe filtrate per `kind`, un test di completezza. Asserzioni con `toEqual` su `extensions` e `data ?? null` (stile `pending-quests-authz.int-spec.ts:239-252`).

### Anti-Patterns to Avoid

- **Chiudere i socket prima di scrivere la revoca:** il client si riconnette e passa la `connection_init` prima della scrittura.
- **Registrare il socket dopo la lettura della sessione**, o anche dopo `extra.closed`: corsa (F-7) e voci orfane nel registro.
- **`return true` dopo `close(4409)`:** funziona (probe), ma lascia `ctx.acknowledged = true` lato server per un socket morto. Usare `return false`.
- **Copiare tutte le `extensions` dell'eccezione nel formatter:** apre la porta a campi interni futuri.
- **`fullDocument: 'updateLookup'` nel watcher del ruolo:** una lettura in più per evento, inutile (basta `documentKey`).
- **`$ne: keepSessionId`** senza considerare i login concorrenti (Open Question 4).
- **Matrice con JWT stateless dal `sid` finto:** dipende dalla regola sulla sessione assente (Open Question 1).

## Don't Hand-Roll

| Problema | Non costruire | Usa invece | Perché |
|----------|---------------|------------|--------|
| Riapertura e backoff del change stream | un `watch()` con retry a mano | `ChangeStreamPublisher` (`src/mongo/change-stream-publisher.ts`) | resume token, history lost, chiusura in shutdown già provati (BE-HARD-06) |
| Priming del change stream nei test | `setTimeout` fissi | ciclo di scritture sentinella finché la revoca appare (stile `test/harness/prime-change-stream.ts:51-76`) | il cursore si apre in modo asincrono (Pitfall 9 delle fasi precedenti) |
| Firma dei token di test | `JwtService` a mano | `signTestAccessToken` (`test/auth/test-tokens.ts:36-63`), `AuthSessionService.issueForUser` | stessi audience e issuer della produzione |
| Client WS di test | `ws` grezzo nuovo | `connectAndAwaitClose`, `openAcknowledgedSocket`, `openSubscription` (`test/auth/ws-test-client.ts`) | gestiscono timeout e handle aperti |
| Env del boot reale | un secondo blocco `Object.assign(process.env, …)` | un helper estratto da `test/app.int-spec.ts:268-301` | duplicazione delle trappole Pitfall 8/11/13 |

## Runtime State Inventory

| Categoria | Trovato | Azione |
|-----------|---------|--------|
| Dati salvati | Collection `sessions`: i documenti revocati prima della fase non hanno `revokeReason` (letto come `undefined` da `lean()`). Gli utenti con più sessioni attive (telefono + emulatore) le tengono fino al prossimo login | Nessuna migrazione (D-08): codice tollerante (`?? null`). Primo login dopo il deploy → revoca delle altre, comportamento atteso |
| Configurazione di servizi | Nessuna (nessun servizio esterno ha i nomi nuovi) | — |
| Stato registrato nel sistema operativo | Processo BE dell'utente in esecuzione da `dist/` di questo albero (pid 37908, `PORT=3001`, `DEV_AUTH_ROLE=adventurer`, `DEV_AUTH_TWITCH_ID=dev-twitch-id`) | Build e riavvio a cura dell'orchestratore dopo la merge; mai `npm run build` dagli esecutori |
| Segreti e variabili d'ambiente | Nessuna variabile nuova. Per la UAT via tunnel: `TWITCH_REDIRECT_URI` nel `.env` dell'utente | Documentare nel handoff §3; nessuna modifica di codice |
| Artefatti di build | `dist/` stantio fino alla build dell'orchestratore | — |

## Conflicts

| # | Dove | Cosa non regge | Proposta (non applicata: decide l'orchestratore) |
|---|------|----------------|---------------------------------------------------|
| C-1 | D-01, REPO-RULES §Matrice: «`UNAUTHENTICATED` senza bearer o con bearer invalido» | Vale su HTTP. Per l'unica subscription innkeeper (`pendingRequestsUpdated`) un bearer assente o invalido non produce un errore GraphQL: la `connection_init` è chiusa con `4403 'Forbidden'` (`ws-connection-authenticator.ts:41-44`) | Pinnare com'è (la REPO-RULES lo prevede già: «chiusura secondo il comportamento attuale»): riga WS con `connectAndAwaitClose` → `{ code: 4403, reason: 'Forbidden', acknowledged: false }` |
| C-2 | D-01: «harness `createAuthTestApp`/`createCharactersTestApp`» | Da soli non montano i 30 handler: sei moduli registrano code Bull; servirebbero override di tre code e di push e travel config, senza garanzia di copertura | Boot reale di `AppModule` con `listen(0)` (probe P3: 2,1 s) tramite un helper `test/harness/real-app-boot.ts` estratto da `test/app.int-spec.ts:260-320`. Vantaggio: l'insieme montato è per costruzione quello delle liste |
| C-3 | REPO-RULES: `UserRoleChangesPublisher` in `src/users/user-role-changes.publisher.ts` che chiama `revokeAllForRoleChange` | `AuthModule` importa `UsersModule` (`auth.module.ts:27,33`): un provider di `UsersModule` che inietta `SessionRevocationService` crea un ciclo (servirebbe `forwardRef`) | Registrarlo in `AuthModule` (che già importa `UsersModule`) con `MongooseModule.forFeature([{ name: User.name, schema: UserSchema }])`. Precedente di modello registrato in due moduli: `Character` in `UsersModule` e in `test/authz/characters-test-app.ts:47-55`. Raccomandato: file in `src/auth/session/user-role-changes.publisher.ts` (la sua responsabilità è la revoca). In subordine, nome e percorso fissati ma provider in `AuthModule` |
| C-4 | D-06: «**più** il percorso di servizio (`UsersService.upsertWithRole` …)» | Stesso ciclo (`UsersService` in `UsersModule`). L'unico chiamante è `DevAuthStrategy` (`dev-auth.strategy.ts:29`). La probe P4 prova che il change stream vede già il cambio fatto da `upsertWithRole` (e tace sullo stesso valore) | Nessuna chiamata esplicita. Il requisito «via `UsersService.upsertWithRole`» si prova con una int-spec: utente esistente con sessione, `upsertWithRole` con un ruolo diverso → sessione `roleChanged` (attraverso il watcher). Idempotenza: `upsertWithRole` allo stesso ruolo → sessione intatta |
| C-5 | REPO-RULES: registro «svuotato da `onDisconnect`» | Il wrapper cabla solo `onClose` (`graphql-options.factory.ts:73-76`); `onDisconnect` scatta solo per connessioni con ack (`server-3ewaJSjp.js:287`) e non per quella rifiutata con 4409 | Svuotare in `WsConnectionAuthenticator.onClose` (già cablato, già usato per il timer) |
| C-6 | REPO-RULES: `SessionService.revoke(sessionId, reason)`; enum chiuso a quattro valori | Il refresh di un utente cancellato revoca la sessione (`auth-session.service.ts:52-55`) e non ha un motivo fra i quattro | `revoke(sessionId, reason: SessionRevokeReason \| null)` con `null` per l'utente cancellato; `sessionRevoked()` senza `reason` (la FE mostra il messaggio neutro). Nessun valore nuovo senza il via |
| C-7 | REPO-RULES «la sanitizzazione di produzione conserva `extensions.reason`» | Oggi neppure lo sviluppo la conserva su HTTP (`format-domain-error.ts:17-22`). Non è un conflitto di decisione ma un lavoro in più: due file, non uno | Pattern 4; RED nei due spec unitari e in una int-spec di produzione |

## Common Pitfalls

### Pitfall 1: socket registrato dopo la chiusura
**Cosa succede:** `onConnect` è asincrono. Se il client chiude durante `resolveBearer`, `onClose` passa prima della registrazione e la voce resta nel registro per sempre.
**Come evitarlo:** controllare `extra.closed` prima di `register` (come il timer a `ws-connection-authenticator.ts:34-35`). Test unitario sul modello di `:177-193`.

### Pitfall 2: test D-10 e `userUpdated` instabili
**Cosa succede:** il watcher del ruolo gira in ogni harness che importa `AuthModule`. Un cambio di ruolo nei test revoca le sessioni e chiude i WS in modo asincrono.
**Come evitarlo:** vedi le prime due righe di F-9. Cercare `role` negli update dei test prima del GREEN del watcher: oggi i soli casi sono `auth-session.service.int-spec.ts:177`, `user-updated.subscription.int-spec.ts:239-242` e `user-updates.publisher.int-spec.ts:176-179` (quest'ultimo innocuo).

### Pitfall 3: priming del watcher del ruolo
**Cosa succede:** il cursore del change stream si apre in modo asincrono; il primo cambio di ruolo può andare perso. Il watcher non pubblica nulla su PubSub, quindi `primeChangeStream` non si applica così com'è.
**Come evitarlo:** priming con un utente sentinella con sessione, cambiando il ruolo finché la sua sessione risulta revocata (poll su `sessions`, limite in ms), poi pulizia. In alternativa si osserva la chiusura di un WS sentinella.

### Pitfall 4: `revokeReason` assente sui documenti legacy
**Cosa succede:** `lean()` restituisce `undefined`, non `null`. Un `=== null` lascia passare `undefined` e la `reason` diventa `undefined` nelle `extensions` (JSON la toglie, ma il tipo mente).
**Come evitarlo:** normalizzare con `?? null` in `revokeReasonOf` e nel ramo di `rejectRefresh`. Test con `persistSession(…, { revokedAt: new Date() })` senza il campo.

### Pitfall 5: gli enum non si validano negli update
Probe P4: `updateMany` scrive un valore fuori enum. Il tipo `SessionRevokeReason` nei parametri è l'unica barriera: mai `string`.

### Pitfall 6: dev bypass con il twitchId reale
Se `DEV_AUTH_TWITCH_ID` è il twitchId dell'utente e `DEV_AUTH_ROLE` differisce dal ruolo a DB, la prima richiesta col token dev dopo il riavvio cambia il ruolo e revoca le sessioni reali. Da scrivere nel handoff §3: in UAT il token dev usa un twitchId distinto, come fa già il processo in esecuzione.

### Pitfall 7: più processi BE sullo stesso DB
Il registro è per processo. Un login servito dal BE A non chiude i WS aperti sul BE B: restano vivi fino al 4401. La `connection_init` successiva è comunque rifiutata, perché la verifica è sul DB. Il watcher del ruolo gira in ogni processo, ma la `find` filtra `revokedAt: null`: il secondo processo trova zero id e non chiude i suoi socket. **UAT dual-device con un solo processo BE**; il «secondo BE per gli sweep» delle UAT passate va spento.

### Pitfall 8: coverage per cartella con exit 1
Senza `--coverageThreshold='{}'` il ripiego esce 1 per le cartelle non raccolte (F-8). Leggere sempre il JSON.

### Pitfall 9: fixture della matrice che non esistono
Senza C, P o R vere l'ownership risponde `NOT_FOUND`, non `FORBIDDEN` (`character-access.policy.ts:107,127-128,143`). Un archiviato conta come inesistente (`:196-205`).

### Pitfall 10: validazione GraphQL prima dei guard
Un documento della matrice con un campo o una variabile sbagliati risponde `GRAPHQL_VALIDATION_FAILED` e il test passa per il motivo sbagliato. L'asserzione deve essere `toEqual({ code: 'FORBIDDEN' })`, mai `not.toBeUndefined()`.

## Code Examples

### Registro dei socket (unit-testabile, senza Nest)

```typescript
// src/auth/ws/ws-session-registry.ts — schema, nomi da REPO-RULES
type ClosableSocket = Pick<Extra['socket'], 'close'>;

@Injectable()
export class WsSessionRegistry {
    private readonly sockets = new Map<string, Set<ClosableSocket>>();

    register(sessionId: string, socket: ClosableSocket): void {
        const live = this.sockets.get(sessionId) ?? new Set<ClosableSocket>();
        live.add(socket);
        this.sockets.set(sessionId, live);
    }

    unregister(sessionId: string, socket: ClosableSocket): void {
        const live = this.sockets.get(sessionId);
        live?.delete(socket);
        if (live?.size === 0) this.sockets.delete(sessionId);
    }

    closeSessions(sessionIds: readonly string[], reason: SessionRevokeReason): void {
        for (const sessionId of sessionIds) {
            for (const socket of this.sockets.get(sessionId) ?? []) {
                socket.close(WS_SESSION_REVOKED_CLOSE_CODE, reason);
            }
            this.sockets.delete(sessionId);
        }
    }
}
```

### `onConnect` con registrazione prima della lettura

```typescript
async onConnect(context: WsConnectionContext): Promise<boolean> {
    try {
        const identity = await this.identityResolver.resolveBearer(
            readAuthorization(context.connectionParams),
        );
        context.extra.identity = identity;
        if (context.extra.closed) return true;
        const { sessionId } = identity;
        if (sessionId) {
            this.registry.register(sessionId, context.extra.socket);
            const revoked = await this.sessions.revokeReasonOf(sessionId);
            if (revoked) {
                context.extra.socket.close(
                    WS_SESSION_REVOKED_CLOSE_CODE,
                    revoked.reason ?? '',
                );
                return false;
            }
        }
        context.extra.expiryTimer = scheduleExpiryClose(
            context.extra.socket,
            identity.expiresAt,
        );
        return true;
    } catch {
        return false;
    }
}
```

`onClose` aggiunge `if (sessionId) this.registry.unregister(sessionId, context.extra.socket)`. Un `close` senza registrazione è innocuo.

### Watcher del ruolo (modello `ArchivedCharacterQueueRefresher`)

```typescript
const USER_ROLE_CHANGES = {
    pipeline: [
        {
            $match: {
                operationType: 'update',
                'updateDescription.updatedFields.role': { $exists: true },
            },
        },
    ],
    subject: 'dei ruoli degli utenti',
};

@Injectable()
export class UserRoleChangesPublisher extends ChangeStreamPublisher<UserDocument> {
    constructor(
        @InjectModel(User.name) userModel: Model<UserDocument>,
        private readonly revocation: SessionRevocationService,
        @Inject(PUB_SUB) pubSub: PubSub<PubSubEvents>,
    ) {
        super(userModel, USER_ROLE_CHANGES, pubSub);
    }

    protected onChange(change: ChangeStreamEvent): void {
        const userId = documentIdOf(change.documentKey);
        if (!userId) return;
        this.revocation.revokeAllForRoleChange(userId).catch((error: unknown) =>
            this.logger.error(`Revoca per cambio ruolo fallita: ${describeError(error)}`),
        );
    }
}
```

### `reason` nel formatter (forma)

```typescript
type CodedHttpException = HttpException & {
    extensions: { code: string; reason?: unknown };
};
// formatDomainError: extensions: { code, ...reasonOf(original) }
// sanitizeFormattedError (codice non interno): extensions: { code, ...(typeof reason === 'string' ? { reason } : {}) }
```

## State of the Art

| Prima | Dopo la fase | Impatto |
|-------|--------------|---------|
| Sessioni indipendenti per device (Phase 2 D-08) | L'ultimo login revoca le altre (`newLogin`) | Un account è attivo su un solo device alla volta |
| `SESSION_REVOKED` muto | `SESSION_REVOKED` + `extensions.reason` | La FE mostra un avviso specifico |
| Ruolo stantio fino a 15 min più il refresh (T-10-19) | Sessioni revocate al cambio, WS chiusi | Resta solo la finestra HTTP del JWT (D-04) |
| Liste degli handler dentro `test/app.int-spec.ts` | Modulo condiviso più matrice | Un handler protetto nuovo senza prova non passa |

## Assumptions Log

| # | Claim | Sezione | Rischio se sbagliata |
|---|-------|---------|----------------------|
| A1 | Mongoose casta l'esadecimale stringa di `userId`/`_id` nei filtri di `find`/`updateMany` su path `Schema.Types.ObjectId` | F-1 | Basso: revoca a vuoto. Coperto dal primo test RED/GREEN di `revokeOthersOf` |
| A2 | Limite di 123 byte della reason del close (RFC 6455) | F-3 | Nullo con i valori attuali |
| A3 | cloudflared e ngrok inoltrano l'upgrade WebSocket (`wss://`) | F-11 | Medio per la UAT release: da verificare al primo passo della UAT |
| A4 | Compass modifica un documento con `findOneAndUpdate` sui soli campi cambiati (non replace), quindi un ruolo cambiato da Compass passa dal filtro | F-4 | Medio: un replace non verrebbe visto. Mitigato da D-10 (refresh) entro 15 min. Fonte: [COMPASS-5528](https://jira.mongodb.org/browse/COMPASS-5528) (citazione della documentazione Compass) |

## Open Questions (RESOLVED — orchestratore, 2026-11-09: tutte accettate come raccomandato; ruling nel CONTEXT D-01/D-03/D-06 rivisti e D-11..D-16, e nelle REPO-RULES «Completato dopo la ricerca»)

1. **Sessione assente alla `connection_init`** (JWT valido, documento `sessions` inesistente: cancellato a mano, TTL, JWT di test)
   - Si sa: D-03 parla solo di sessione revocata; il JWT è stateless (D-04).
   - **Raccomandato:** accettare (solo `revokedAt != null` chiude). Test «(D-03) a JWT whose session document is missing still connects».
2. **Reason del close per una sessione revocata senza motivo** (legacy o utente cancellato)
   - **Raccomandato:** `4409` con reason `''`; la FE ricade sul messaggio neutro (FE 12-REPO-RULES).
3. **Logout e reuse detection chiudono anche i WS vivi?**
   - Si sa: REPO-RULES dà a `SessionRevocationService` solo login e ruolo. D-03 parla in generale di «connessioni di una sessione revocata».
   - **Raccomandato:** no. Al logout la FE chiude il suo WS (FE 11 D-12): un 4409 `userLogout` durante il teardown innescherebbe un refresh inutile. Sul riuso la finestra HTTP resta comunque (D-04). Le `connection_init` successive sono comunque rifiutate con 4409. Va scritto nel handoff §1.
4. **`$lt` o `$ne` sulla sessione da tenere**
   - **Raccomandato:** `$lt` (l'ultimo ObjectId vince fra login concorrenti). Test «(D-02) a concurrent later login is not revoked by an earlier one».
5. **Errore della revoca durante il login**
   - **Raccomandato:** propagare (il login fallisce, sanitizzato in produzione); la sessione orfana scade da sola.
6. **Sessioni vere o JWT stateless nella matrice**
   - **Raccomandato:** sessioni vere via `issueForUser` (indipendenti dalla Open Question 1).
7. **Righe innkeeper × owner-only nella matrice**
   - **Raccomandato:** incluse (8 righe, prova di 07 D-11 a costo nullo).
8. **Spostare anche `EXPECTED_OWNER_ONLY_HANDLERS`**
   - **Raccomandato:** sì, nello stesso modulo (serve alla riga 7).
9. **Posizione di `UserRoleChangesPublisher`** — vedi C-3. **Raccomandato:** `src/auth/session/user-role-changes.publisher.ts`, provider di `AuthModule`.

## Environment Availability

| Dipendenza | Richiesta da | Disponibile | Versione | Ripiego |
|------------|--------------|-------------|----------|---------|
| Node | tutto | ✓ | v26.12.1 locale (CI: 22) | — |
| MongoMemoryReplSet | integration, change stream | ✓ | binari in cache (`~/.cache/mongodb-binaries`) | — |
| redis-memory-server | boot reale (matrice, `app.int-spec`) | ✓ | in cache (boot 2,1 s) | CI: service container Redis (`ci.yml`) |
| Processo BE dell'utente da `dist/` | — (non toccare) | in esecuzione (pid 37908) | — | — |

Nessuna dipendenza mancante.

## Validation Architecture

### Test Framework

| Proprietà | Valore |
|-----------|--------|
| Framework | Jest 30 + ts-jest, progetti `unit` e `integration` (`package.json` → `jest.projects`) |
| Config | `package.json` (nessun file separato); setup integration in `test/setup/{global-setup,after-env}.ts` |
| Comando rapido | `npx jest <spec> --selectProjects unit` / `npx jest <spec> --selectProjects integration --runInBand` |
| Suite completa | `npm run test:cov` (≈ 576 s alla 16-11: ripiego per cartella, F-8) |

### Phase Requirements → Test Map

| Req ID | Comportamento | Tipo | Comando automatico | Il file esiste? |
|--------|---------------|------|--------------------|-----------------|
| BE-SESSION-01 | Matrice 11 × 4 + 19 (+8) righe, completezza | integration | `npx jest test/authz/authorization-matrix.int-spec.ts --selectProjects integration --runInBand` | ❌ Wave 0 |
| BE-SESSION-01 | Liste condivise ≡ metadati | integration | `npx jest test/app.int-spec.ts --selectProjects integration --runInBand` | ✅ (import da aggiornare) |
| BE-SESSION-02 | `revokeOthersOf` idempotente, `$lt`, solo attive | integration | `npx jest src/auth/session/session.service.int-spec.ts --selectProjects integration --runInBand` | ✅ (casi nuovi) |
| BE-SESSION-02 | `issueForUser` revoca le altre (`newLogin`), nuova intatta, dev senza effetto | integration | `npx jest src/auth/auth-session.service.int-spec.ts --selectProjects integration --runInBand` | ✅ (casi nuovi) |
| BE-SESSION-02 | Registro: register, unregister, `closeSessions` → `close(4409, reason)` | unit | `npx jest src/auth/ws/ws-session-registry.spec.ts --selectProjects unit` | ❌ Wave 0 |
| BE-SESSION-02 | `onConnect`: registrazione prima della lettura, 4409 + `return false`, `closed`, nessun `sessionId`, lookup in errore → false | unit | `npx jest src/auth/ws/ws-connection-authenticator.spec.ts --selectProjects unit` | ✅ (costruttore RED) |
| BE-SESSION-02 | Filo: secondo login → WS del primo `{4409,'newLogin',true}`, `connection_init` col JWT revocato → `{4409,'newLogin',false}`, refresh `newLogin`, HTTP col JWT residuo passa, nuova sessione intatta | integration | `npx jest test/auth/session-revocation.int-spec.ts --selectProjects integration --runInBand` | ❌ Wave 0 |
| BE-SESSION-03 | `sessionRevoked(reason)` → `{ code, reason }`, senza → `{ code }`; valori dell'enum pinnati | unit | `npx jest src/auth/auth.exception.spec.ts --selectProjects unit` | ✅ (casi nuovi) |
| BE-SESSION-03 | Formatter e sanitizer conservano `reason` | unit | `npx jest src/graphql/format-domain-error.spec.ts src/graphql/production-errors.spec.ts --selectProjects unit` | ✅ (casi nuovi) |
| BE-SESSION-03 | Produzione HTTP: refresh revocato → `{ code: 'SESSION_REVOKED', reason: 'newLogin' }`; `SESSION_EXPIRED` senza `reason` | integration | `npx jest src/graphql/production-surface.int-spec.ts --selectProjects integration --runInBand` | ✅ (caso nuovo) |
| BE-SESSION-03 | Riuso → `reuseDetected` a DB e sul filo; token di una sessione revocata → motivo memorizzato; legacy senza campo → senza `reason` | integration | `npx jest src/auth/session/session.service.int-spec.ts --selectProjects integration --runInBand` | ✅ (casi nuovi) |
| BE-SESSION-04 | Cambio di ruolo a mano → tutte le sessioni `roleChanged` più WS 4409 `roleChanged`; stesso valore → niente; `upsertWithRole` su utente esistente → `roleChanged` (C-4) | integration | `npx jest src/auth/session/user-role-changes.publisher.int-spec.ts --selectProjects integration --runInBand` | ❌ Wave 0 |
| BE-SESSION-04 | Logout → `userLogout` solo sulla corrente, l'altra sessione intatta | integration | `npx jest src/auth/auth-session.service.int-spec.ts --selectProjects integration --runInBand` | ✅ (casi nuovi) |
| BE-SESSION-05 | `tsc`, coverage `./src/auth/` ≥ 97/84/98, boot reale, SDL invariato | gate | `npx tsc --noEmit -p tsconfig.json`; ripiego F-8; `git diff --exit-code src/schema.gql` | ✅ |
| BE-SESSION-05 | Handoff `BACKEND-NOTES.md` | manuale (documento) | `grep -c 4409 .planning/phases/17-autorizzazione-e-sessioni/BACKEND-NOTES.md` | ❌ piano di chiusura |

**Solo manuale:** la UAT dual-device e quella della release via tunnel appartengono alla FE Phase 12 (dopo la merge). Il BE fornisce solo le note.

### Sampling Rate

- **Per task:** la spec mirata più `npx tsc --noEmit -p tsconfig.json`, poi `pgrep -fl 'bin/jest'` vuoto.
- **Per wave:** `npx jest src/auth test/auth test/authz src/users src/graphql --selectProjects unit integration --runInBand` (≈ 1 min stimato; `src/auth` + `test/auth` misurati a 32 s).
- **Gate di fase:** `test:cov` oppure il ripiego per cartella (F-8), boot reale verde, SDL invariato, prima di `/gsd-verify-work`.

### Wave 0 Gaps

- [ ] `test/authz/expected-handlers.ts` — liste condivise (refactor di `test/app.int-spec.ts`, verde prima e dopo)
- [ ] `test/harness/real-app-boot.ts` — env e boot condivisi (C-2), con `test/app.int-spec.ts` che lo usa
- [ ] `test/authz/handler-fixtures.ts` e `test/authz/authorization-matrix.int-spec.ts`
- [ ] `src/auth/ws/ws-session-registry.spec.ts`
- [ ] `test/auth/session-revocation.int-spec.ts` — filo WS e HTTP di D-02/D-03/D-05 (nome a scelta del planner)
- [ ] `src/auth/session/user-role-changes.publisher.int-spec.ts` (o `src/users/…` secondo il ruling di C-3), con l'helper di priming (Pitfall 3)
- [ ] `src/auth/session/session-revocation.service.int-spec.ts` — ordine DB → socket (registro finto che legge lo stato a DB quando viene chiamato)

## Security Domain

### Applicable ASVS Categories

| Categoria ASVS | Si applica | Controllo |
|----------------|------------|-----------|
| V2 Authentication | sì | JWT invariato; il login revoca le altre sessioni |
| V3 Session Management | sì | revoca per utente e per ruolo, motivo registrato, WS chiusi, `connection_init` verificata (una lettura) |
| V4 Access Control | sì | matrice che prova `@Roles` e ownership su 30 handler |
| V5 Input Validation | marginale | nessun input nuovo; il motivo è una costante TS (Pitfall 5) |
| V7 Error Handling | sì | `reason` su allowlist di una chiave; nulla di interno trapela (Pattern 4) |

### Known Threat Patterns per NestJS + Mongo + graphql-ws

| Minaccia | STRIDE | Mitigazione |
|----------|--------|-------------|
| Token rubato su un device usato dopo un nuovo login | Spoofing | revoca `newLogin`, WS chiuso, `connection_init` rifiutata; HTTP fino a 900 s (D-04, accettato) |
| Ruolo stantio nel JWT (T-10-19) | Elevation of privilege | watcher `roleChanged`; ripiego D-10 al refresh |
| Socket orfani nel registro | Denial of service | `extra.closed` prima di `register`, `unregister` in `onClose` (Pitfall 1) |
| Fuga di `extensions` interne | Information disclosure | allowlist `reason` nel formatter e nel sanitizer |
| Due login concorrenti che si cacciano a vicenda | Denial of service | `$lt` sull'ObjectId (Open Question 4) |
| Ruolo cambiato dal dev bypass sul twitchId reale | Tampering | nota nel handoff, twitchId dev distinto (Pitfall 6) |

## Probe eseguite

Tutte nell'harness integration, in `test/_probes/`, file cancellati alla fine (`git status --short` pulito prima di scrivere questo file; `pgrep -fl 'bin/jest'` vuoto).

| # | Probe | Comando | Esito |
|---|-------|---------|-------|
| P1 | Eccezione codificata con `extensions.reason` (resolver sonda) su HTTP e WS, sviluppo e produzione; refresh reale di una sessione revocata | `npx jest test/_probes/p17-errors-and-ws.int-spec.ts --selectProjects integration --runInBand` | HTTP dev e prod: `{code}`; WS dev: `{code, reason}`; WS prod: `{code}`; refresh: `{code}` |
| P2 | Spia su `onConnect`/`onClose`: chiusura dall'esterno di due socket della stessa sessione; `close(4409)` + `return false` e `return true`; `close` su un socket chiuso | stesso file | client `{4409,'newLogin',true}` × 2 in 1 ms; init `{4409,'newLogin',false}` in entrambe le varianti; `onClose` sempre chiamato; nessun throw |
| P3 | Boot reale di `AppModule` con `listen(0)`; `users` come `guard`, `generateQuests` senza bearer, `shopPoolReport` con bearer invalido, `pendingRequestsUpdated` come `adventurer` su WS | `npx jest test/_probes/p17-real-boot.int-spec.ts --selectProjects integration --runInBand` | boot 2,1 s (run 7,2 s); `FORBIDDEN`/`UNAUTHENTICATED` come in F-5; subscription: errors `FORBIDDEN`; `src/schema.gql` invariato |
| P4 | Change stream filtrato sul ruolo (vari update, `upsertWithRole`, replace, unset); validazione degli enum negli update; monotonia degli ObjectId | `npx jest test/_probes/p17-role-stream.int-spec.ts --selectProjects integration --runInBand` | come in F-4 e F-6; ObjectId monotoni |
| — | Coverage per cartella di `./src/auth/` | F-8 | 99,83 / 86,71 / 100 in 32 s; exit 1 senza `--coverageThreshold='{}'`, 0 con |

## Sources

### Primary (HIGH confidence)
- Codice del repo sul branch `feat/17-autorizzazione-e-sessioni` (file:riga citati sopra).
- `node_modules/graphql-ws/dist/server-3ewaJSjp.js` e `dist/use/ws.js` (6.0.6): `onConnect` → 4403, `onDisconnect` e `onClose`, `send` su un socket non aperto.
- Probe P1–P4 (sezione precedente).

### Secondary (MEDIUM confidence)
- [COMPASS-5528 — Compass replaces whole array if you update one field in an array of objects](https://jira.mongodb.org/browse/COMPASS-5528): cita la documentazione Compass («performs a findOneAndUpdate operation and updates only those fields that you have changed»).

### Tertiary (LOW confidence)
- Nessuna.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — nessuna dipendenza nuova, versioni lette da `node_modules`.
- Architettura: HIGH — meccanismi provati (P1–P4); MEDIUM su C-3 e C-4 (ruling dell'orchestratore).
- Pitfall: HIGH — derivati da codice e probe.

**Research date:** 2026-11-09
**Valid until:** 2026-12-09 (stack stabile)

## RESEARCH COMPLETE
