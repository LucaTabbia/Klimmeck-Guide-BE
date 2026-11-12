---
phase: 17-autorizzazione-e-sessioni
plan: 03
subsystem: auth (fan-out della revoca: close code, registro dei socket, servizio DB poi socket)
tags: [auth, ws, session, BE-SESSION-02, BE-SESSION-04, D-02, D-03, D-06, D-12]
requires: ["17-02"]
provides:
  - "`export const WS_SESSION_REVOKED_CLOSE_CODE = 4409` in src/auth/ws/ws-close-codes.ts (4401/4403 invariati)"
  - "`export type RegisteredSocket = Pick<Extra['socket'], 'close'>` e `@Injectable() export class WsSessionRegistry` in src/auth/ws/ws-session-registry.ts: `register(sessionId, socket)`, `unregister(sessionId, socket)`, `isRegistered(sessionId)`, `closeSessions(sessionIds: readonly string[], reason: SessionRevokeReason)`"
  - "`@Injectable() export class SessionRevocationService` in src/auth/session/session-revocation.service.ts: `constructor(sessions: SessionService, registry: WsSessionRegistry)`, `revokeOthersOnLogin(userId, keepSessionId): Promise<void>` (newLogin), `revokeAllForRoleChange(userId): Promise<void>` (roleChanged)"
  - "`WsSessionRegistry` e `SessionRevocationService` nei `providers` di `AuthModule` (nessun export nuovo)"
affects: [17-04, 17-05, 17-06, 17-07, 17-08, 17-09, 17-10]
tech-stack:
  added: []
  patterns:
    - "Fan-out della revoca: `await` della revoca a DB, poi `closeSessions` con gli id restituiti; un errore del DB si propaga prima di toccare i socket"
    - "Registro in memoria `Map<sessionId, Set<socket>>` per processo, voce rimossa quando resta vuota o dopo la chiusura"
key-files:
  created:
    - src/auth/ws/ws-session-registry.ts
    - src/auth/ws/ws-session-registry.spec.ts
    - src/auth/session/session-revocation.service.ts
    - src/auth/session/session-revocation.service.int-spec.ts
  modified:
    - src/auth/ws/ws-close-codes.ts
    - src/auth/auth.module.ts
decisions:
  - "Nella int-spec il registro è un finto `{ closeSessions: jest.fn }` via `useValue`; le revoche a DB sono osservate con `jest.spyOn(sessions, 'revokeOthersOf' | 'revokeAllOf').mockImplementation` che chiama l'originale legato e poi registra `['database']` in `events`"
  - "`closeSessions` usa sempre la reason dell'enum (mai stringa vuota): la reason `''` delle revoche legacy riguarda solo la `connection_init` del piano 04"
metrics:
  duration: "~15 min"
  completed: 2026-11-09
  tasks: 3
  files: 6
---

# Phase 17 Plan 03: fan-out della revoca dal DB ai socket Summary

Close code `4409` dedicato alla sessione revocata, registro `WsSessionRegistry` dei socket vivi per sessione nel processo, e `SessionRevocationService` che revoca a DB (`newLogin` al login, `roleChanged` al cambio di ruolo) e solo dopo chiude i socket delle sessioni revocate; entrambi provider di `AuthModule`. `userLogout` e `reuseDetected` non passano da qui. SDL invariato.

## Commit

- `091ae1b` test(ws): pin the registry of live sockets per session (RED)
- `e0cb871` feat(ws): add the registry of live sockets per session (GREEN)
- `938515d` test(session): pin the database-first session revocation fan-out (RED)
- `351d496` feat(session): fan out a revocation from the database to the sockets (GREEN)

## RED osservati

- Task 1: la suite `src/auth/ws/ws-session-registry.spec.ts` non parte («Could not locate module src/auth/ws/ws-session-registry»), 0 test eseguiti; anche la costante `WS_SESSION_REVOKED_CLOSE_CODE` era assente.
- Task 2: la suite `src/auth/session/session-revocation.service.int-spec.ts` non parte («Could not locate module src/auth/session/session-revocation.service»), 0 test eseguiti.
- Nessun caso verde al primo colpo (ogni suite dipendeva da un modulo nuovo).

## Note

- Il caso `forgets a socket that closed by itself (D-03)` usa due istanze del registro: la prima prova che dopo `unregister` di un socket `closeSessions` chiude solo l'altro (e quindi dimentica la sessione), la seconda che `unregister` dell'ultimo socket toglie la voce (`isRegistered` false).
- La int-spec usa id utente propri (`...c1`, `...c2`) e un harness bare senza `MongooseModule.forRoot` (nessun rischio della trappola 15-03).
- Prettier spezza la firma di `closeSessions` su più righe: il grep `reason: SessionRevokeReason` stampa comunque 1.

## Deviations from Plan

1. **Bookkeeping: `Plan: 3 of 10`** in STATE.md (formato del brief dell'orchestratore e della riga esistente) invece di `Plan: 03 of 10` scritto nel piano: il verify automatico del Task 3 che cerca `Plan: 03 of 10` non combacia per questo motivo.

Nessun'altra deviazione.

## Gates

- `npx tsc --noEmit -p tsconfig.json`: 0
- `npx jest src/auth/ws --selectProjects unit`: 2 suite, 17 test verdi
- `npx jest src/auth/session/session-revocation.service.int-spec.ts test/auth/auth-test-app.int-spec.ts --selectProjects integration --runInBand`: 2 suite, 13 test verdi (5 + 8)
- Controllo di wave unit `npx jest src/auth test/auth test/authz src/graphql --selectProjects unit`: 32 suite, 321 test verdi
- Controllo di wave integration `npx jest src/auth test/auth test/authz src/graphql --selectProjects integration --runInBand`: 15 suite, 211 test verdi
- prettier `--write` + eslint puliti sui 6 file `.ts` toccati
- `git diff --exit-code src/schema.gql` 0; nessun diff rispetto a `origin/develop`

## Self-Check: PASSED
