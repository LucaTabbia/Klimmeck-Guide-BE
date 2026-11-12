---
phase: 17-autorizzazione-e-sessioni
fixed: 2026-11-09
fixed_at: 2026-11-09T18:36:58Z
source: 17-REVIEW.md
review_path: .planning/phases/17-autorizzazione-e-sessioni/17-REVIEW.md
rulings_path: .planning/phases/17-autorizzazione-e-sessioni/17-REVIEW-RULINGS.md
iteration: 1
fix_scope: all
findings_total: 18
findings_in_scope: 18
fixed_count: 17
skipped_count: 1
not_needed_count: 0
deferred_count: 0
status: partial
---

# Phase 17: report dei fix della code review

**Data dei fix:** 2026-11-09
**Review di partenza:** `.planning/phases/17-autorizzazione-e-sessioni/17-REVIEW.md` (gruppi A/B/C, dettagli in `17-REVIEW-A.md`, `17-REVIEW-B.md`, `17-REVIEW-C.md`)
**Ruling applicati:** `.planning/phases/17-autorizzazione-e-sessioni/17-REVIEW-RULINGS.md`
**Base:** `cdd1a7c` su `feat/17-autorizzazione-e-sessioni`
**Iterazione:** 1

**Esito:** 18 finding (0 critical, 3 warning, 15 info) → 17 corretti (A-IN-06 solo nei punti 1 e 2, il punto 3 è `not_needed` per ruling), 1 saltato (C-IN-02), 0 rinviati. 27 commit, più questo report.

## Tabella dei finding

| Finding | Esito | Commit | Note |
| --- | --- | --- | --- |
| B-WR-02 | fixed | `3e24dfd` (RED), `14e5d67` (GREEN) | `ChangeStreamEvent` guadagna `clusterTime?: mongo.Timestamp` (campo opzionale, gli altri publisher invariati). Il watcher calcola `createdBefore = (clusterTime.getHighBits() + 1) * 1000` (fine del secondo dell'evento) e chiama `revokeAllForRoleChange(userId, { createdBefore })` → `revokeAllOf(userId, roleChanged, createdBefore?)`, che aggiunge `createdAt` con `$lt` al filtro; senza `clusterTime` nessun limite. RED a due livelli: `session.service.int-spec.ts` «revokes only the sessions created before the given limit (D-06)» e `user-role-changes.publisher.spec.ts` «limits the revocation to the sessions created up to the second of the event (D-06)» / «sets no limit when the event carries no cluster time (D-06)». Handoff §1.4 aggiornato (limite noto del secondo). |
| A-IN-01 | fixed | `0fce887` (RED), `85f55a3` (GREEN) | Dopo l'`updateMany`, `revokeActive` rilegge `{ _id: { $in: ids }, revokeReason: reason }` con proiezione `{ _id: 1 }` e restituisce solo quegli id, nell'ordine della `find`. RED «does not return a session revoked by a concurrent logout between the read and the write (D-02, D-12)» con una spia su `find` che, dopo i candidati, revoca una sessione con `userLogout`: prima l'id tornava, ora no e a DB resta `userLogout`. Handoff §1.4 aggiornato. |
| B-WR-01 | fixed | `4294b3d` (RED), `a139e6f` (GREEN) | Campo privato `tail` nel publisher: ogni `onChange` accoda la revoca alla catena, un rifiuto viene loggato con `describeError` senza spezzarla. RED «starts the next revocation only after the previous one settled (D-06)»; «keeps revoking after a failed revocation (D-06)» verde già prima (oggi ogni evento partiva da sé). Commento di `flushRoleWatcher` aggiornato: ora la barriera è vera. |
| B-IN-02 | fixed | `4743704` (RED), `e3d9222` (GREEN) | `closeSessions` chiude ogni socket con `closeQuietly` (try/catch con il solo commento del perché); la `delete` resta fuori dal ciclo interno. RED «keeps closing the other sockets when one close throws (D-03)». |
| A-IN-03 | fixed | `ae0202d` (spec), `2074450` (refactor) | `revoke` usa `isObjectIdHex`. Spec «ignores a 12-character id that is not 24 hex digits (D-02)» verde già prima: il `bson` installato rifiuta già le stringhe di 12 caratteri in `ObjectId.isValid`; il caso fissa la guardia. |
| A-IN-04 | fixed | `c7226c8` (RED), `3f39093` (GREEN) | `revokeReasonOf(code, reason)` esportata da `format-domain-error.ts` e usata da entrambi i formatter: la `reason` resta solo con `SESSION_REVOKED` e un valore di `SessionRevokeReason` (enum e `AuthErrorCode` importati dai loro file, nessuna DI). RED: `PROBE_CODE` + `probe` scartata e `SESSION_REVOKED` + `zzz` scartata, in sviluppo e in produzione; `roleChanged` conservata; la vecchia spec `keeps only the reason…` spostata su `SESSION_REVOKED` + `newLogin`. `production-surface.int-spec.ts` 16/16. Handoff §1.3 aggiornato. |
| A-IN-02 | fixed (solo commento) | `6c9f1fa` | Commento di D-12 in `revokeOthersOf`: ordine valido con un solo processo BE, con più nodi `createdAt` con `_id` come spareggio. |
| A-IN-05 | fixed (solo commento) | `6c9f1fa` | Commento di `issueForUser` corretto: la sessione appena creata resta attiva fino al TTL del refresh, il login successivo la revoca perché ha `_id` minore. Comportamento invariato. |
| C-WR-01 | fixed | `50b6e3f` (RED), `0bcb527` (GREEN) | `createMatrixWorld` crea `adventurer` e `innkeeper` con `persistPlayer` (personaggio attivo, PendingQuest e QuestResult propri, una sessione per utente); il `guard` resta un attaccante di solo ruolo. RED «lets the adventurer read its own character (D-01)» (prima l'attaccante non aveva personaggio). Le righe ownership e owner-only restano `FORBIDDEN`. Evidenza del handoff aggiornata. |
| C-IN-04 | fixed | `1a45687` | `handler-fixtures.spec.ts` «puts the victim id of its target in the variables of every fixture (D-01)»: id della vittima del `target` dentro `JSON.stringify(variables(SAMPLE_VICTIMS))`, nessuno dei tre per `none`. Verde subito (le fixture erano giuste). |
| C-IN-03 | fixed | `cb2431f` | `INVALID_SOCKET_PAYLOADS` guadagna il JWT firmato con un altro secret; le righe della `connection_init` girano una volta per payload, col titolo «…with 4403, before any subscription (D-01)». Evidenza del handoff aggiornata. |
| C-IN-05 | fixed | `328fffa` | Controllo positivo «lets the innkeeper read the character of another user on behalf (D-01)». Verde subito. Handoff §5 aggiornato (l'esenzione ora è asserita). |
| C-IN-06 | fixed | `d17173a` | Controllo positivo «lets the owner subscribe to its own character over the socket (D-01)»: snapshot iniziale senza errori, poi `updateOne` su `status.coins.silver` e `next()` con il valore nuovo, `dispose()` nel `finally`. Verde subito. |
| C-IN-01 | fixed | `2faad73` (RED), `e2bbdf6` (GREEN) | `close()` fa `app.close()` → `stopRedis()` → `dropDatabase` su una connessione effimera `mongoose.createConnection(uri, { dbName })` chiusa subito (uri letto al boot, prima del ripristino di `process.env`). RED in una mini spec dell'harness `test/harness/real-app-boot-close.int-spec.ts` (spia su `Logger.prototype.error`: prima 8 righe «chiusura inattesa», ora 0). `test/app.int-spec.ts` 79/79, matrice 89/89. Handoff §5 aggiornato. |
| C-IN-02 | skipped | `dffc17e` (RED), `0e13cd8` (spec tolta) | Vedi sotto. |
| A-IN-06 | fixed (punti 1, 2) / not_needed (punto 3) | `bbdfa4a`, `6f6b77c` | (1) Subito dopo il logout il socket è `WebSocket.OPEN` e `registry.isRegistered(sid)` è `true`; la finestra di 300 ms resta come sanity check. (2) «closes a connection_init with the JWT of a session revoked for reuse with 4409 reuseDetected (D-03, D-05)»: token ritirato nel 2020 presentato al refresh → `SESSION_REVOKED` + `reuseDetected`, poi `{ code: 4409, reason: 'reuseDetected', acknowledged: false }`. Verdi subito. (3) `not_needed`: la reason su graphql-ws in produzione resta provata dalla unit `production-errors.spec.ts` («keeps the revoke reason over graphql-ws in production (D-13)»), che esercita `sanitizeExecutionErrors`, la stessa funzione cablata nel percorso WS. |
| B-IN-01 | fixed | `b9bb85f` | Unit: `onConnect` con sessione revocata poi `onClose(context)` → `unregister('session-1', socket)`. Int-spec: dopo il `4409 userLogout` della `connection_init`, `waitUntilUnregistered(registry, sid)` → `true`. Verdi subito (graphql-ws chiama `onClose` anche sulle connessioni rifiutate). |
| B-IN-03 | fixed (solo test) | `acfa502` | `test/harness/poll-until.ts` (`pollUntil(predicate, { intervalMs, attempts })`, budget fisso più un'ultima lettura) riusato da `waitUntilUnregistered` e `waitForRevocation` (quindi anche dal priming del watcher). `forgets a socket that closed by itself` spezzato in due `it`. Nessun cambio di comportamento. |

### C-IN-02 saltato: motivo

Il ruling presuppone che dopo un `compile()` fallito ci sia un `moduleRef` da chiudere: non c'è, `compile()` lancia senza restituire il modulo. Provato con un override che lancia (`overrideProvider(SessionRevocationService).useFactory` con `inject: [getConnectionToken()]`): con `finally` per env e Redis e chiusura delle connessioni Mongoose aperte nel frattempo, la spec passa ma jest resta appeso. La diagnosi (`process.getActiveResourcesInfo()` e lo stack dei timer vivi) indica cinque timer di riconnessione di `ioredis`, cioè i client Redis delle code Bull già creati prima del provider che lancia; solo gli hook di chiusura del modulo li rilasciano. Chiudere il container parziale attraverso gli interni di `TestingModuleBuilder` (`container`, `getRootModule()`) fallisce sugli hook dei provider mai istanziati («Cannot read properties of undefined (reading 'stop')»). L'harness è stato riportato com'era dopo C-IN-01 e la spec RED tolta in un commit dedicato. Resta la trappola 15-03 documentata: un boot reale rotto al `compile()` può lasciare jest appeso; il rimedio va nel provider che fallisce. Il punto minore del ruling (`stopRedis` e ripristino di `process.env` in un `finally` se `app.close()` lancia nel `catch`) non ha un RED osservabile senza il caso sopra ed è stato lasciato insieme al resto.

Prettier ed eslint puliti su ogni file `.ts` toccato, uno per uno. `tsc` a 0 su ogni commit di codice; i commit RED di B-WR-02 (`3e24dfd`), C-WR-01 (`50b6e3f`) e C-IN-02 (`dffc17e`) avevano errori di `tsc` limitati alle spec nuove (firma o campo non ancora esistenti), cioè il RED stesso, come nei RED «da tsc» della RESEARCH; il GREEN successivo torna a 0.

## Gate finale

| Controllo | Esito |
| --- | --- |
| `npx tsc --noEmit -p tsconfig.json` | exit 0 |
| `npx jest src/auth test/auth test/authz src/users src/graphql --selectProjects unit` | 35 suite / 357 test verdi |
| `npx jest src/auth test/auth src/users src/graphql --selectProjects integration --runInBand` (int-spec toccate: `session.service`, `session-revocation`, `ws-auth`, più watcher, fan-out, `auth-session`, `production-surface`) | 23 suite / 366 test verdi |
| `npx jest test/app.int-spec.ts --selectProjects integration --runInBand` | 79/79, nessuna riga ERROR |
| `npx jest test/authz/authorization-matrix.int-spec.ts --selectProjects integration --runInBand` | 89/89 |
| `npx jest test/harness/real-app-boot-close.int-spec.ts --selectProjects integration --runInBand` | 1/1 |
| `npx jest src/mongo src/characters/character-updates.publisher.spec.ts --selectProjects unit` (tipo `ChangeStreamEvent` esteso) | 6 suite / 90 test verdi |
| `git diff --exit-code src/schema.gql` | exit 0 |
| `git diff origin/develop -- src/schema.gql` | vuoto |
| `Math.random` / `Date.now` / `process.env.` aggiunti sotto `src/` | 0 |
| trailer vietati in `cdd1a7c..HEAD` | 0 su 27 commit |
| `git status --short` / `pgrep -fl 'bin/jest'` a fine lavoro | vuoti |
| processo BE dell'utente (pid 37908) | vivo; nessuna build lanciata |

## Note per il handoff FE

Tutte già scritte in `BACKEND-NOTES.md` negli stessi commit dei fix:

- **B-WR-02 (§1.4):** il cambio di ruolo revoca solo le sessioni create fino al secondo dell'evento (`clusterTime`): un evento in ritardo o in replay dopo una caduta dello stream non revoca più le sessioni emesse dopo il cambio. Limite noto: un login nello stesso secondo del cambio di ruolo viene revocato anch'esso con `roleChanged`; per la FE è un normale `4409 roleChanged`.
- **A-IN-01 (§1.4):** la reason sul socket coincide con quella scritta a DB anche con un logout concorrente; una sessione già revocata per un altro motivo non viene chiusa col motivo nuovo.
- **A-IN-04 (§1.3):** la `reason` esce solo con `code: SESSION_REVOKED` e solo coi quattro valori dell'enum (prima qualunque stringa). Nessun effetto osservabile oggi.
- Evidenza HARDEN-02 (§2) e §5: matrice a 89 casi (attaccanti con personaggio proprio, JWT con altro secret sul socket, controlli positivi on-behalf e WS); rumore dei log a fine suite risolto.

Contratto FE invariato: enum, `extensions.reason`, close code `4409`, JWT stateless, SDL.
