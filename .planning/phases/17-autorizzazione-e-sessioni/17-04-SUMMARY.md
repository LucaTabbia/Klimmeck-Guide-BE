---
phase: 17-autorizzazione-e-sessioni
plan: 04
subsystem: auth (verifica della sessione alla connection_init WS, registrazione e pulizia dei socket)
tags: [auth, ws, session, BE-SESSION-02, D-03]
requires: ["17-03"]
provides:
  - "`WsConnectionAuthenticator` con `constructor(identityResolver: AuthIdentityResolver, sessions: SessionService, registry: WsSessionRegistry)` (iniettati da `AuthModule`, nessun export nuovo)"
  - "`onConnect`: bearer → `extra.closed` → `registry.register(sessionId, socket)` → una sola `sessions.revokeReasonOf(sessionId)` → revocata: `socket.close(4409, reason ?? '')` + `false`; secondo controllo di `extra.closed` prima del timer 4401"
  - "`onClose`: `extra.closed = true`, `clearTimeout`, poi `registry.unregister(sessionId, socket)` se l'identità ha `sessionId`"
  - "Prova sul filo graphql-ws in `test/auth/ws-auth.int-spec.ts` (describe `connection_init of a revoked session (D-03)`)"
affects: [17-05, 17-06, 17-07, 17-08, 17-09, 17-10]
tech-stack:
  added: []
  patterns:
    - "Registrazione del socket prima della lettura dello stato della sessione: una revoca concorrente o trova il socket nel registro o viene vista dalla lettura"
    - "Errore della lettura → `catch` → `false` → 4403 di graphql-ws (fail-closed, nessun messaggio interno); il socket registrato esce dal registro in `onClose`"
key-files:
  created: []
  modified:
    - src/auth/ws/ws-connection-authenticator.ts
    - src/auth/ws/ws-connection-authenticator.spec.ts
    - test/auth/ws-auth.int-spec.ts
decisions:
  - "Il controllo dev/contesto senza identità per `unregister` è nello stesso test `unregisters the socket of its session on close (D-03)` (dopo `mockClear`), così i titoli con `D-03)` restano esattamente 9"
  - "La logica di registrazione + lettura + chiusura vive nel metodo privato `closeIfRevoked(sessionId, socket: RegisteredSocket): Promise<boolean>`, come nello skeleton del piano"
metrics:
  duration: "~20 min"
  completed: 2026-11-09
  tasks: 3
  files: 3
---

# Phase 17 Plan 04: verifica della sessione alla connection_init Summary

La `connection_init` di graphql-ws registra il socket nel `WsSessionRegistry` e poi legge una sola volta lo stato della sessione (`revokeReasonOf`): una sessione revocata è chiusa con `4409` e il motivo (stringa vuota per le revoche legacy senza motivo) e la connessione è rifiutata con `false`; `onClose` toglie il socket dal registro. Sessione assente a DB accettata (OQ1), identità dev senza `sessionId` né registrata né letta, errore della lettura → 4403. SDL invariato.

## Task

| Task | Nome | Commit | File |
|------|------|--------|------|
| 1 RED | casi D-03 e costruttore a tre argomenti nella spec unit | 473240c | src/auth/ws/ws-connection-authenticator.spec.ts |
| 1 GREEN | `onConnect` con registrazione prima della lettura, `4409` + `false`, pulizia in `onClose` | 6a48496 | src/auth/ws/ws-connection-authenticator.ts |
| 2 | cinque casi sul filo reale | ed1d133 | test/auth/ws-auth.int-spec.ts |
| 3 | bookkeeping | (commit docs) | ROADMAP, STATE, VALIDATION, questo SUMMARY |

## RED osservato (Task 1)

- `tsc`: `src/auth/ws/ws-connection-authenticator.spec.ts(61,13): error TS2554: Expected 1 arguments, but got 3.`
- jest (ts-jest senza type check): 6 falliti / 14 verdi su 20 — rossi `registers the socket … (D-03)`, i due `closes with 4409 … (D-03)`, `does not arm the expiry timer … during the session lookup (D-03)`, `refuses the connection when the session lookup fails (D-03)`, `unregisters the socket of its session on close (D-03)`. Verdi già al RED (comportamento negativo coincidente col codice vecchio, che non registrava né leggeva nulla): `accepts a session whose document is missing`, `neither registers nor reads when the socket closed while the bearer was resolving`, `neither registers nor reads a dev identity without session`.

## Task 2 verde al primo colpo

I cinque casi sul filo sono passati al primo lancio: comportamento implementato e provato unitariamente nel task 1; qui si prova il filo reale graphql-ws (logout → `{ code: 4409, reason: 'userLogout', acknowledged: false }`, revoca senza motivo → `reason: ''`, sessione assente → ack, `closeSessions` → due socket `{ 4409, 'roleChanged', true }` e il terzo di un altro utente ancora `OPEN`, socket chiuso dal client tolto dal registro entro il poll).

## Deviations from Plan

- **Criterio del diff del Task 2:** `git diff HEAD~1 -- test/auth/ws-auth.int-spec.ts | grep -cE "^-[^-]"` non stampa `0` ma `2`: le sole righe tolte sono due import (`import type WebSocket from 'ws'` diventa import di valore per `WebSocket.OPEN`; l'import da `./auth-test-app` aggiunge `graphqlRequest` e Prettier lo spezza su più righe). Nessun caso `4403`/`4401` toccato.
- **STATE.md:** scritto `Plan: 4 of 10` (formato reale del file, istruzione dell'orchestratore); il verify del piano che cerca `Plan: 04 of 10` non trova riscontro.
- Nessun'altra deviazione; nessuna Rule 1–4 applicata.

## Verifiche

- `npx jest src/auth/ws --selectProjects unit`: 2 suite / 26 test verdi (la spec dell'authenticator passa da 11 a 20 test).
- `npx jest test/auth/ws-auth.int-spec.ts --selectProjects integration --runInBand`: 18 test verdi (13 + 5).
- Controllo di wave: unit `src/auth test/auth test/authz src/graphql` = 32 suite / 330 test; integration sulle stesse cartelle = 15 suite / 216 test; in più `src/users` integration = 5 suite / 38 test.
- `npx tsc --noEmit -p tsconfig.json` 0; prettier `--check` ed eslint puliti sui tre file; `git diff origin/develop -- src/schema.gql` vuoto.

## Known Stubs

Nessuno.

## Self-Check: PASSED

- File modificati presenti; commit 473240c, 6a48496, ed1d133 presenti in `git log`.
