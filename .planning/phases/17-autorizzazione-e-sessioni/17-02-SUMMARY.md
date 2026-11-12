---
phase: 17-autorizzazione-e-sessioni
plan: 02
subsystem: auth (sessioni: scrittura e lettura del motivo di revoca)
tags: [auth, session, BE-SESSION-02, BE-SESSION-03, BE-SESSION-04, D-02, D-03, D-05, D-06, D-07, D-11, D-12, D-13]
requires: ["17-01"]
provides:
  - "`SessionService.revoke(sessionId: string, reason: SessionRevokeReason | null): Promise<void>` (secondo parametro obbligatorio, idempotente)"
  - "`SessionService.revokeOthersOf(userId, keepSessionId, reason: SessionRevokeReason): Promise<string[]>` (solo sessioni attive con `_id` minore)"
  - "`SessionService.revokeAllOf(userId, reason: SessionRevokeReason): Promise<string[]>`"
  - "`SessionService.revokeReasonOf(sessionId): Promise<RevokedSessionState | null>`"
  - "`export interface RevokedSessionState { reason: SessionRevokeReason | null }` in src/auth/session/session.service.ts"
  - "reuse detection → `reuseDetected` scritto e restituito; rifiuto del refresh col motivo memorizzato (legacy/utente cancellato senza reason)"
  - "logout → `userLogout` sulla sola sessione corrente; utente cancellato al refresh → revoca con `null`"
affects: [17-03, 17-04, 17-05, 17-06, 17-07, 17-08, 17-09, 17-10]
tech-stack:
  added: []
  patterns:
    - "Revoca per utente in due passi: id candidati con il filtro attivo, poi update multiplo condizionato da `revokedAt: null` (mai read-modify-write)"
    - "Lettura lean con `?? null` sul campo del motivo per i documenti precedenti alla fase"
key-files:
  created: []
  modified:
    - src/auth/session/session.service.ts
    - src/auth/session/session.service.int-spec.ts
    - src/auth/auth-session.service.ts
    - src/auth/auth-session.service.int-spec.ts
    - src/graphql/production-surface.int-spec.ts
decisions:
  - "`revokeActive(owner: Record<string, unknown>, reason)` privato condiviso da `revokeOthersOf` e `revokeAllOf`; restituisce gli id dei candidati letti (fra la lettura e l'update una revoca concorrente può già averli scritti: l'update non li sovrascrive)"
  - "Helper di spec `rejectionOf(promise)` e `revokeAsLegacy(sessionId)` (toglie il campo del motivo via `SessionModel.collection.updateOne`) in session.service.int-spec.ts; `refreshRevokedByNewLogin(harness, twitchId)` in production-surface.int-spec.ts"
metrics:
  duration: "~25 min"
  completed: 2026-11-09
  tasks: 3
  files: 5
---

# Phase 17 Plan 02: SessionService unico scrittore del motivo di revoca Summary

`SessionService.revoke(id, reason | null)` scrive data e motivo insieme solo su una sessione attiva; la reuse detection scrive e restituisce `reuseDetected`; il rifiuto del refresh dice il motivo memorizzato (o tace per i documenti legacy e l'utente cancellato); `revokeOthersOf` (solo `_id` minore), `revokeAllOf` e `revokeReasonOf` sono pronti per i piani 04–06; logout → `userLogout`; la reason arriva sul filo HTTP in produzione e in sviluppo. SDL invariato.

## Commit

- `db36cb3` test(session): pin the revoke reason on every revocation path (RED)
- `6bd7e29` feat(session): record why a session was revoked (GREEN)
- `5ebcd63` test(session): pin the per-user revocation and its lookup (RED)
- `76c4a7f` feat(session): revoke the sessions of a user and read a revocation (GREEN)

## RED osservati

- Task 1: `npx tsc --noEmit -p tsconfig.json` esce 2 con 12 TS2554 «Expected 1 arguments, but got 2» (le sei chiamate esistenti più quelle dei casi nuovi). Jest: 6 rossi su 72 (`stores the reason with the revocation time (D-05)`, `keeps the first date and reason of an already revoked session (D-02)`, `reuse detection revokes with reuseDetected and answers it (D-05)`, `a token of a revoked session answers the stored reason (D-05)`, `a retired token of a revoked session answers the reason of the revocation (D-05)`, `logout revokes only the current session with userLogout (D-07)`).
- Verdi al primo colpo nel Task 1 (prove di assenza già soddisfatte dal comportamento precedente: `sessionRevoked()` senza motivo e campo con default null): `stores no reason when revoked without one (D-11)`, `a legacy revoked session without the field answers without a reason (D-11)`, `answers a token that was never issued without a reason (D-05)`, `revokes the session of a deleted user without a reason (D-11)`.
- Task 2: tsc esce 2 con 16 TS2339 «Property 'revokeOthersOf' / 'revokeAllOf' / 'revokeReasonOf' does not exist on type 'SessionService'». Jest: 17 rossi su 84 (i 15 casi dei tre describe nuovi più i due casi D-13 sulla reason di `newLogin`).
- Verde al primo colpo nel Task 2: `answers an expired refresh without a reason in production (D-13)` (prova di assenza; `SESSION_EXPIRED` non ha mai avuto reason).

## Note

- Il caso «un token mai emesso risponde `SESSION_EXPIRED` con `extensions` esattamente `{ code: 'SESSION_EXPIRED' }`» è un `it` nuovo (`answers a token that was never issued without a reason (D-05)`) accanto al caso esistente, non una modifica di quello.
- Prettier ha spezzato su più righe alcune chiamate `service.revoke(...)` a due argomenti; il grep `service\.revoke\([^,)]*\)` stampa comunque 0 (nessuna chiamata a un argomento).
- Il caso dell'utente cancellato è un `it` nuovo (`revokes the session of a deleted user without a reason (D-11)`) accanto al caso esistente, con il rifiuto catturato una sola volta.
- Nessun letterale di operatore Mongo nei titoli dei test.

## Deviations from Plan

1. **Bookkeeping: `Plan: 2 of 10`** in STATE.md (formato del brief dell'orchestratore e della riga esistente) invece di `Plan: 02 of 10` scritto nel piano: il verify automatico del Task 3 che cerca `Plan: 02 of 10` non combacia per questo motivo.

Nessun'altra deviazione.

## Gates

- `npx tsc --noEmit -p tsconfig.json`: 0
- `npx jest src/auth/session/session.service.int-spec.ts src/auth/auth-session.service.int-spec.ts --selectProjects integration --runInBand`: 2 suite, 72 test verdi
- `npx jest src/auth/session/session.service.int-spec.ts src/graphql/production-surface.int-spec.ts --selectProjects integration --runInBand`: 2 suite, 84 test verdi
- Controllo di wave unit `npx jest src/auth test/auth test/authz src/graphql --selectProjects unit`: 31 suite, 315 test verdi
- Controllo di wave integration `npx jest src/auth test/auth test/authz src/graphql --selectProjects integration --runInBand`: 14 suite, 206 test verdi
- prettier `--write` + eslint puliti sui 5 file `.ts` toccati
- `git diff --exit-code src/schema.gql` 0; nessun diff rispetto a `origin/develop`

## Self-Check: PASSED
