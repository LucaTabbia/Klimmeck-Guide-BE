---
phase: 17
slug: autorizzazione-e-sessioni
audited: 2026-11-09T00:00:00Z
status: secured
asvs_level: 1
block_on: high
branch: feat/17-autorizzazione-e-sessioni
head: 4beabe0
base: origin/develop (31dba96)
threats_total: 44
threats_mitigated: 34
threats_accepted: 6
threats_transferred: 2
threats_open: 0
threats_open_blocking: 0
threats_deferred: 2
open_ids: []
deferred_ids: [T-17-18, T-17-44]
transferred_ids: [T-17-27, T-17-43]
updated: 2026-11-09T00:00:00Z
---

# Audit di sicurezza — Phase 17 «Autorizzazione e sessioni» (BE)

Audit in sola lettura dei blocchi threat model dei piani `17-01`…`17-10` (44 ID `T-17-01`…`T-17-44`, tutti distinti) sul codice FINALE di `feat/17-autorizzazione-e-sessioni` a `4beabe0`, dopo i fix di `REVIEW-FIX.md` (17 corretti, 1 saltato: C-IN-02, solo harness di test). Nessun file modificato oltre a questo, nessun commit, nessuna suite lanciata, nessuna lettura di `.env` o dell'ambiente. L'esito verde delle spec è quello registrato in `REVIEW-FIX.md` (gate finale: 357 unit, 366 + 79 + 89 + 1 integration) e `17-VERIFICATION.md`; qui le spec sono verificate per nome tramite i blocchi dei piani, `REVIEW-FIX.md` e i controlli trasversali sul codice.

Disposizioni: `mitigated` 34, `accepted` 6 (T-17-02, 08, 12, 17, 19, 28), `transferred` 2 (T-17-27, T-17-43), `deferred` 2 (T-17-18, T-17-44), `open` 0.

## Registro delle minacce

| ID | STRIDE | Componente | Disposizione | Evidenza | Nota |
| --- | --- | --- | --- | --- | --- |
| T-17-01 | Information disclosure | `formatDomainError`, `sanitizzazione` | mitigated | `src/graphql/format-domain-error.ts:47-60` (`extensionsOf` + `revokeReasonOf`, mai spread delle extensions), `production-errors.ts:24`; casi con `toEqual` (chiave `secret` e `reason` non stringa escluse); fix A-IN-04 (`probe`/`zzz` scartate) | piano 17-01 |
| T-17-02 | Information disclosure | `reason` sul filo | accepted | enum a 4 valori senza dati utente (D-05, D-13); `SESSION_EXPIRED` e altri codici senza `reason` (`format-domain-error.ts:53-60`) | piano 17-01 |
| T-17-03 | Tampering | `Session.revokeReason` | mitigated | `src/auth/session/session.model.ts` (enum su schema), tipo `SessionRevokeReason`; grep `reason: string` in `src/auth` = nessuna occorrenza; caso «rejects a value outside the enum» | piano 17-01 |
| T-17-04 | Tampering (contratto) | `src/schema.gql` | mitigated | `git diff origin/develop -- src/schema.gql` = 0 righe | piano 17-01 |
| T-17-05 | Denial of service | `revokeOthersOf` | mitigated | `session.service.ts:115-131` filtro `_id` `$lt` della sessione tenuta; casi «keeps the new one», «a concurrent later login is not revoked by an earlier one» | piano 17-02 |
| T-17-06 | Tampering | revoche ripetute | mitigated | filtro `revokedAt: null` in `revokeActive`; fix A-IN-01 rilegge solo gli id con la reason scritta; casi «keeps the first date and reason» | piano 17-02 |
| T-17-07 | Information disclosure | rifiuto del refresh | mitigated | `session.service.ts:313-` `AuthException.sessionRevoked(reuseDetected)`; log reuse solo con id sessione (`:306`); nessun hash o data nelle extensions | piano 17-02 |
| T-17-08 | Spoofing | `revokeReasonOf` | accepted | sessione assente a DB non chiude il WS (OQ1, D-03); JWT unica prova per 900 s (D-04) | piano 17-02 |
| T-17-09 | Denial of service | `WsSessionRegistry.closeSessions` | mitigated | `ws-session-registry.ts:30-48`; spec `ws-session-registry.spec.ts` («never closes the sockets of another session», «…of the kept session»); fix B-IN-02 (`closeQuietly`) | piano 17-03 |
| T-17-10 | Spoofing | ordine revoca/chiusura | mitigated | `session-revocation.service.ts:22-28` revoca a DB poi `closeSessions`; errore della revoca propagato (nessun try/catch) | piano 17-03 |
| T-17-11 | Denial of service | memoria del registro | mitigated | `unregister` elimina la voce vuota (`ws-session-registry.ts:19-24`); `closeSessions` dimentica la sessione; registrazione vietata dopo `extra.closed` | piano 17-03 |
| T-17-12 | Repudiation | più processi BE | accepted | registro per processo (commento in `ws-session-registry.ts:8`, D-03, D-16); handoff «un solo processo BE in UAT» | piano 17-03 |
| T-17-13 | Spoofing | `onConnect` | mitigated | `ws-connection-authenticator.ts:80-87` lettura di `revokeReasonOf` e `4409` + `false`; casi unit e sul filo | piano 17-04 |
| T-17-14 | Elevation of privilege | corsa login/connessione | mitigated | `registry.register` (riga 83) prima della lettura a DB (riga 84); caso con `invocationCallOrder` | piano 17-04 |
| T-17-15 | Denial of service | registro | mitigated | `unregister` in `onClose` (riga 75); fix B-IN-01 (unit e int-spec «forgets a socket closed by the client») | piano 17-04 |
| T-17-16 | Information disclosure | reason del close | mitigated | `socket.close(4409, revoked.reason ?? '')` (riga 86): solo enum o `''`; errore di lettura → `catch` → `4403` di graphql-ws | piano 17-04 |
| T-17-17 | Denial of service | sessione assente a DB | accepted | OQ1, D-04: i JWT di test e le sessioni scadute non vengono cacciati | piano 17-04 |
| T-17-18 | Spoofing | token rubato dopo un nuovo login | deferred | codice e spec di filo presenti (`revokeOthersOnLogin`, `connection_init` e refresh rifiutati, `ws-auth` int-spec, riga A-IN-06 reuseDetected); conferma su due device reali nella UAT dual-device FE 12-17 | residuo solo UAT |
| T-17-19 | Spoofing | JWT residuo su HTTP | accepted | finestra di 900 s accettata dall'utente (D-04); nessun `SessionService` nei guard (grep vuoto); caso D-04 | piano 17-05 |
| T-17-20 | Denial of service | revoca della sessione nuova | mitigated | `auth-session.service.ts:33-34` `create` poi `revokeOthersOnLogin(user.id, sessionId)`; filtro `_id` `$lt`; casi «never touches the session it has just created» | piano 17-05 |
| T-17-21 | Denial of service | login con revoca fallita | mitigated | nessun try/catch attorno alla revoca (l'unico `catch` in `auth-session.service.ts:120` è `findUserOrNull`); sanitizzazione di produzione (Phase 10); sessione orfana scade col TTL | piano 17-05 |
| T-17-22 | Information disclosure | log | mitigated | log in `src/auth/session` e `src/auth/ws`: solo `session.service.ts:266,306` (id sessione) e `user-role-changes.publisher.ts:58` (id utente + `describeError`) | piano 17-05 |
| T-17-23 | Elevation of privilege | JWT col ruolo stantio | mitigated | `user-role-changes.publisher.ts:53` `revokeAllForRoleChange`; `session-revocation.service.ts:31-41` reason `roleChanged` e socket chiusi; fix B-WR-02 (`createdBefore` da `clusterTime`); finestra HTTP 900 s (D-04), rilettura al refresh (D-10) | piano 17-06 |
| T-17-24 | Denial of service | watcher che revoca a ogni update | mitigated | pipeline sul solo `updateDescription.updatedFields.role` con `operationType: 'update'` (`user-role-changes.publisher.ts:23-27`); casi «leaves the sessions intact …» | piano 17-06 |
| T-17-25 | Denial of service | rifiuto non gestito | mitigated | `.catch` con log (`:56-61`); fix B-WR-01 (catena `tail`, una revoca fallita non spezza le successive) | piano 17-06 |
| T-17-26 | Information disclosure | log del watcher | mitigated | solo `userId` e `describeError` (`:59`); caso unit con `not.toContain` | piano 17-06 |
| T-17-27 | Tampering | dev bypass col twitchId reale | transferred | handoff `BACKEND-NOTES.md` §3 (twitchId dev distinto), configurazione a carico dell'utente (Pitfall 6) | proprietà dell'operatore |
| T-17-28 | Repudiation | evento perso a BE spento | accepted | nessun token di ripresa; ruolo riletto a ogni refresh (D-10): ruolo stantio al massimo un TTL del JWT | piano 17-06 |
| T-17-29 | Repudiation | liste che divergono dai metadati | mitigated | `test/authz/expected-handlers.ts` importato dal boot reale e confrontato coi metadati; diff delle voci vuoto | piano 17-07 |
| T-17-30 | Repudiation | matrice per fixture vuote/invalide | mitigated | `Record<ProtectedHandler, HandlerFixture>`, `handler-fixtures.spec.ts` (validate SDL, variabili con id della vittima, fix C-IN-04) | piano 17-07 |
| T-17-31 | Information disclosure | boot reale nei test | mitigated | `test/harness/real-app-boot.ts` scrive segreti finti prima dell'import di `AppModule`; `grep -rlE "app\.module'" --include='*.spec.ts' src test` = 0 file; fix C-IN-01 (chiusura pulita) | piano 17-07 |
| T-17-32 | Elevation of privilege | 11 handler innkeeper | mitigated | `test/authz/authorization-matrix.int-spec.ts`: `adventurer`/`guard` → `FORBIDDEN`, senza bearer → `UNAUTHENTICATED`/`4403`; 89/89 verdi (`REVIEW-FIX.md`) | piano 17-08 |
| T-17-33 | Elevation of privilege | 19 handler ownership | mitigated | righe `adventurer` su risorsa altrui → `FORBIDDEN`; 8 owner-only anche per l'innkeeper; fix C-WR-01 (attaccanti con personaggio proprio) | piano 17-08 |
| T-17-34 | Repudiation | matrice per il motivo sbagliato | mitigated | `toEqual({ code })`, un solo errore, vittime vere, controlli positivi (C-IN-05, C-IN-06, C-IN-03 JWT con altro secret) | piano 17-08 |
| T-17-35 | Repudiation | handler protetto nuovo senza prova | mitigated | righe derivate dalle liste confrontate col boot reale; voce senza fixture non compila | piano 17-08 |
| T-17-36 | Tampering | `src/schema.gql` | mitigated | diff contro `origin/develop` = 0 righe | piano 17-09 |
| T-17-37 | Information disclosure | codice e documenti | mitigated | `grep process.env. src` (non spec) vuoto; `.env.example` non toccato; nessuna URI Mongo aggiunta nei `.md` del diff | piano 17-09 |
| T-17-38 | Repudiation | commit | mitigated | grep dei trailer vietati su `origin/develop..HEAD` = 0 (77 commit) | piano 17-09 |
| T-17-39 | Denial of service (qualità) | coverage e harness | mitigated | nessun diff su `package.json`; `pgrep` vuoto a fine lavoro (`REVIEW-FIX.md`); coverage in verifica dell'orchestratore | piano 17-09 |
| T-17-40 | Elevation of privilege | perimetro | mitigated | diff senza `src/users` (non spec), senza guard né `src/config/`; solo `src/auth`, `src/graphql`, `src/mongo/change-stream-publisher.ts` | piano 17-09 |
| T-17-41 | Information disclosure | handoff | mitigated | segnaposto nel `BACKEND-NOTES.md`; nessuna URI Mongo nel diff dei `.md` | piano 17-10 |
| T-17-42 | Tampering | contratto FE | mitigated | enum e close code verbatim dal codice (`ws-close-codes.ts:5` = 4409, `session-revoke-reason.enum.ts`); contratto FE invariato dopo i fix | piano 17-10 |
| T-17-43 | Tampering | UAT con dev bypass sul twitchId reale | transferred | nota del handoff (Pitfall 6, D-16); configurazione a carico dell'utente | proprietà dell'operatore |
| T-17-44 | Denial of service | UAT con due processi BE | deferred | la nota «un solo processo BE» è nel handoff §3; l'osservanza si verifica solo durante la UAT dual-device FE 12-17 | residuo solo UAT |

## Controlli trasversali

Tutti lanciati da `cd /Users/lucatabbia/Personale/Code/Klimmeck-Guide-BE/Klimmeck-Guide-BE` a HEAD `4beabe0`, working tree pulito.

| Controllo | Esito |
| --- | --- |
| `grep -rn "process\.env\." src \| grep -v spec` | vuoto (nessun accesso diretto fuori dai provider) |
| `git diff origin/develop -- src` righe `Math.random`/`Date.now` aggiunte (non spec) | vuoto |
| `git diff origin/develop -- src/schema.gql` | 0 righe |
| `git diff origin/develop --name-only -- .env.example` | vuoto |
| `reason` in `format-domain-error.ts`/`production-errors.ts` | solo `revokeReasonOf` con allowlist su `SESSION_REVOKED` e enum; mai spread |
| `getResponse\|statusCode` in `auth.exception.ts` | riga 19: body Nest `{ statusCode: 401, error, message, code }` senza `reason` |
| `revokeReasonOf\|findRevokedByToken` fuori spec | `ws-connection-authenticator.ts:84`, `session.service.ts` (definizione e refresh) più i formatter, che usano una funzione omonima di sola allowlist; `grep SessionService\|revokeReasonOf src/auth/guards/` = 0 (JWT stateless, D-04) |
| registro in `ws-connection-authenticator.ts` | `register` riga 83 prima della lettura riga 84; `unregister` in `onClose` riga 75; `4409` da `ws-close-codes.ts:5` |
| revoca al login | `auth-session.service.ts:34` dopo `create`; `_id` `$lt` in `session.service.ts:115-131`; nessun try/catch sulla revoca |
| watcher | `$match` sul solo `updatedFields.role`; `describeError` a riga 59; `grep UserRoleChangesPublisher src/users/*.ts` = 0 (nessun ciclo) |
| log in `src/auth/session`, `src/auth/ws` | 3 righe: id sessione, id utente + `describeError`; nessun token, hash, URI, twitchId |
| matrice | 15 occorrenze di `D-01)` in `authorization-matrix.int-spec.ts`; spec che importano `app.module` = 0 file |
| trailer vietati su `origin/develop..HEAD` | 0 |

## Open

Nessuna minaccia `open`.

## Deferred

- T-17-18 (Spoofing, token rubato dopo un nuovo login): mitigazione di codice e spec di filo presenti; resta la conferma su due device reali nella UAT dual-device della FE Phase 12 (piano 12-17).
- T-17-44 (Denial of service, due processi BE in UAT): nota nel handoff; l'osservanza (un solo processo BE) si controlla durante la UAT dual-device della FE Phase 12 (piano 12-17).

## Transferred

- T-17-27, T-17-43: configurazione del twitchId dev distinto in UAT, a carico dell'utente; notice, teardown lato client e redirect URI Twitch della release via tunnel restano della FE (12-CONTEXT D-09, D-11, D-12) e non sono minacce BE di questa fase.
