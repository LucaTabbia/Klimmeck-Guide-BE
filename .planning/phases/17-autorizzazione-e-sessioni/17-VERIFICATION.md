---
phase: 17-autorizzazione-e-sessioni
verified: 2026-11-09T17:56:00Z
status: passed_with_gaps
score: 5/5 criteri di successo verificati nel codice (BE-SESSION-01..05 con evidenza, contratto FE rispettato; 1 gap documentale: handoff BACKEND-NOTES.md non ancora scritto, in corso nel piano 17-10)
overrides_applied: 0
re_verification: false
gaps:
  - truth: "Criterio 5 (parte documenti): handoff BACKEND-NOTES.md per la FE Phase 12 (close code, enum, finestra del JWT, evidenza HARDEN-02, note per le due UAT) e BE-SESSION-01..05 marcati completi"
    status: failed
    reason: "Al momento della verifica `.planning/phases/17-autorizzazione-e-sessioni/BACKEND-NOTES.md` non esiste: lo sta scrivendo l'executor del piano 17-10 in parallelo (ROADMAP 17-10 non spuntato, requisiti ancora Pending). Non è una mancanza del codice"
    artifacts:
      - path: ".planning/phases/17-autorizzazione-e-sessioni/BACKEND-NOTES.md"
        issue: "assente"
    missing:
      - "BACKEND-NOTES.md con il contratto (4409 + reason, enum, `extensions.reason`, 900 s, SDL invariato), l'evidenza HARDEN-02 con i conteggi per gruppo e le note per le UAT (piano 17-10)"
      - "`requirements mark-complete BE-SESSION-01..05`, ROADMAP e STATE (solo piano 17-10)"
human_verification:
  - test: "UAT dual-device della FE Phase 12 (differita, piano 12-17; passi e dati nel handoff BACKEND-NOTES.md)"
    expected: "Un solo processo BE, due dispositivi con twitchId dev distinti: il secondo login caccia il primo (socket chiuso con `4409` reason `newLogin`, refresh rifiutato `SESSION_REVOKED` con `extensions.reason = newLogin`, notice specifico lato FE); il dev bypass non partecipa alla revoca"
    why_human: "Esperienza su due device fisici: fuori dal perimetro della fase BE (nessun checkpoint umano), differita e non bloccante"
  - test: "UAT della release via tunnel TLS della FE Phase 12 (differita, piano 12-17)"
    expected: "Nessuna modifica BE; `TWITCH_REDIRECT_URI` del tunnel registrata su Twitch, `APP_AUTH_REDIRECT_URL` invariata, throttler per IP; login e WS sulla release"
    why_human: "Dipende da tunnel, Twitch reale e build di release: non verificabile dal repo"
---

# Phase 17: Autorizzazione e sessioni — Verification Report

**Phase Goal:** il server prova la propria autorizzazione (matrice table-driven sulle liste enumerate dal boot reale) e governa le sessioni per device: il login revoca le altre sessioni e chiude subito i loro WS (`4409`), JWT stateless 900 s, `SESSION_REVOKED` + `extensions.reason`, cambio di ruolo → revoca, logout sulla sola sessione corrente.
**Verified:** 2026-11-09T17:56:00Z (branch `feat/17-autorizzazione-e-sessioni`, HEAD `eb29f5a`, base `develop` `31dba96`)
**Re-verification:** No — verifica iniziale

## Goal Achievement

### Criteri di successo (ROADMAP §Phase 17)

| # | Criterio | Stato | Evidenza |
|---|----------|-------|----------|
| 1 | Matrice table-driven alimentata dalle liste condivise: 11 innkeeper × {adventurer, guard} FORBIDDEN e × {no bearer, non JWT, altro secret} UNAUTHENTICATED; 19 ownership / 8 owner-only FORBIDDEN sul personaggio altrui, subscription via WS; handler senza fixture fa fallire | VERIFIED | `test/authz/expected-handlers.ts` (11 + 19 + 8, tuple `as const`), `test/authz/handler-fixtures.ts` con `Record<ProtectedHandler, HandlerFixture>` (completezza imposta dal tipo, `tsc` 0) e `handler-fixtures.spec.ts` (completezza, validazione contro `src/schema.gql`, vittima reale). `test/authz/authorization-matrix.int-spec.ts` sul boot reale (`bootRealApp`, `listen: true`): `it.each` derivati dalle liste, `expectRejected` (un solo errore, `extensions` esatti, campo nullo), `expectSubscriptionForbidden` (FORBIDDEN alla subscribe), `4403` alla `connection_init` con payload invalidi, completezza (`Object.keys(HANDLER_FIXTURES)` = unione delle liste), controlli positivi. Il SUMMARY 17-08 riporta 85 casi verdi nel gate; la spec non è stata rieseguita da me (gate 17-09: 380 suite / 4849 test) |
| 2 | Login revoca le altre sessioni (`revokedAt` + `newLogin`, `_id` minore, idempotente) e chiude subito i WS con `4409` + reason; `connection_init` di sessione revocata rifiutata con lo stesso codice (una sola lettura); HTTP col JWT residuo passa | VERIFIED | `AuthSessionService.issueForUser`: `create` poi `await revocation.revokeOthersOnLogin` (nessun try/catch: revoca fallita → login fallito); `SessionService.revokeOthersOf` con filtro `_id: {$lt: keep}` e `revokeActive` (find id candidati + `updateMany` condizionato da `revokedAt: null`); `SessionRevocationService` (DB prima, socket dopo); `WsSessionRegistry.closeSessions` → `socket.close(4409, reason)`; `WsConnectionAuthenticator.onConnect` registra il socket e fa una sola `revokeReasonOf` (spec unit: chiamata una volta, ordine verificato), `socket.close(4409, reason ?? '')` + `false`, `onClose` fa `unregister`. Eseguito: `test/auth/session-revocation.int-spec.ts` 7/7 verdi (socket chiuso `4409 newLogin`, `connection_init` revocata, refresh `newLogin`, HTTP col JWT residuo, nuova sessione intatta, logout senza chiudere il socket, dev bypass senza revoca) |
| 3 | Refresh di sessione revocata → `SESSION_REVOKED` + `extensions.reason`; reuse → `reuseDetected`; `SESSION_EXPIRED` senza reason; `Session.revokeReason` additivo nullable, SDL invariato | VERIFIED | `AuthException.sessionRevoked(reason)` con `extensions: {code, reason}`; `formatDomainError`/`sanitizeFormattedError` conservano la sola chiave `reason` stringa (allowlist, produzione compresa); `SessionService.rejectRefresh` scrive `reuseDetected` e risponde col motivo memorizzato (`?? null` per le legacy); `Session.revokeReason` `@Prop` enum con `default: null`; `production-surface.int-spec.ts` (reason in produzione, `SESSION_EXPIRED` senza reason, reason fuori produzione). Gate: `git diff origin/develop -- src/schema.gql` stampa 0 righe |
| 4 | Cambio di `role` a DB (change stream filtrato, anche via `upsertWithRole`) → `roleChanged` su tutte le sessioni; logout → `userLogout` sulla sola corrente | VERIFIED | `UserRoleChangesPublisher` (pipeline `updateDescription.updatedFields.role` con `$exists`, id da `documentKey`, errori loggati col solo id) in `AuthModule`; `upsertWithRole` non modificato: passa dallo stream (`dev-auth.strategy.ts` lo usa). `user-role-changes.publisher.int-spec.ts`: modifica a mano, socket chiuso `4409 roleChanged`, `upsertWithRole` cambia/stesso valore, stesso ruolo a mano, altro campo, altri utenti e già revocate. `logout` → `revoke(identity.sessionId, userLogout)` |
| 5 | Integration complete, gate, handoff `BACKEND-NOTES.md` | PARTIAL | Integration e gate: 17-09 riporta `tsc` 0, `test:cov` 380 suite / 4849 test verdi, `./src/auth/` 99.86/87.47/100 sopra la soglia, boot reale 79 test, SDL identico, VALIDATION firmata. Da me: `tsc --noEmit` exit 0; 8 suite unit mirate 80/80; 1 int-spec mirata 7/7. Handoff non ancora scritto (piano 17-10 in corso): vedi gap |

**Score:** 5/5 criteri verificati nel codice (il quinto con il solo handoff pendente)

## Contratto FE (REPO-RULES §Contratto FE)

| Voce | Stato | Evidenza |
|------|-------|----------|
| `SessionRevokeReason` {newLogin, roleChanged, reuseDetected, userLogout} | OK | `session-revoke-reason.enum.ts`, valori stringa identici ai nomi, non registrato in GraphQL |
| `extensions.reason` solo su `SESSION_REVOKED`, anche in produzione | OK | solo `AuthException.sessionRevoked` lo imposta; `reasonOf` in `sanitizeFormattedError` lo copia solo se stringa; `SESSION_EXPIRED` e gli altri codici non lo portano (spec e int-spec di produzione). Nota informativa: il filtro di produzione non lega esplicitamente la reason al codice `SESSION_REVOKED`, la garanzia sta nel fatto che nessun altro produttore la imposta |
| Close WS `4409` + reason = enum (o `''` legacy) | OK | `WS_SESSION_REVOKED_CLOSE_CODE = 4409`; `closeSessions` con reason dell'enum; `connection_init` con `revoked.reason ?? ''` |
| `connection_init` di una sessione revocata chiusa con `4409` | OK | `closeIfRevoked`, una sola lookup, `4401`/`4403` invariati |
| `userLogout` e `reuseDetected` senza chiusura dei socket vivi | OK | solo `SessionRevocationService` (login, cambio ruolo) chiama il registro; test «does not close the live socket … at logout» |
| JWT stateless 900 s | OK | `ACCESS_TOKEN_TTL_SECONDS = 900`, nessuna lookup per richiesta, test HTTP col JWT residuo |
| SDL invariato | OK | diff contro `origin/develop` vuoto |

## Requirements Coverage

| Requisito | Stato | Evidenza |
|-----------|-------|----------|
| BE-SESSION-01 | SATISFIED | criterio 1 |
| BE-SESSION-02 | SATISFIED | criterio 2 |
| BE-SESSION-03 | SATISFIED | criterio 3 |
| BE-SESSION-04 | SATISFIED | criterio 4 |
| BE-SESSION-05 | SATISFIED nel codice e nei gate; handoff in corso nel piano 17-10 | criterio 5 |

I requisiti restano Pending in REQUIREMENTS.md: `mark-complete` è del piano 17-10.

## Regole provate

- Nessuna spec unit importa `src/app.module` (grep vuoto su `src/**/*.spec.ts`; il boot reale vive solo nelle int-spec via `test/harness/real-app-boot.ts`).
- Revoca per utente in due passi con update condizionato da `revokedAt: null`: nessuna sovrascrittura di una revoca già scritta.
- Registrazione del socket prima della lettura della sessione: chiude la corsa con un login concorrente.
- `onClose` svuota il registro e blocca timer e registrazione su socket già chiuso.

## Anti-Patterns

Nessun blocker. Nessun TODO/stub nei file di produzione della fase (letti enum, registro, servizio di revoca, authenticator, watcher, `SessionService`, formatter).

## Spot-check eseguiti

| Comando | Esito |
|---------|-------|
| `npx tsc --noEmit -p tsconfig.json` | exit 0 |
| `npx jest` su 8 suite unit (`ws`, `session`, `auth.exception`, formatter, produzione, fixture) | 8/8, 80 test |
| `npx jest test/auth/session-revocation.int-spec.ts --runInBand` | 1/1, 7 test (i log di riapertura dei change stream sono dal teardown) |
| `git diff origin/develop -- src/schema.gql` | vuoto |
| `pgrep -fl 'bin/jest'` | vuoto |

## Gaps Summary

Un solo gap, documentale: `BACKEND-NOTES.md` assente (piano 17-10 in corso, requisiti ancora Pending). Ricontrollare a chiusura che contenga contratto verbatim, evidenza HARDEN-02 con i conteggi per gruppo e le note per le due UAT. Nessun gap di codice. Le UAT dual-device e della release via tunnel appartengono alla FE Phase 12 (piano 12-17) e restano differite.

---

_Verified: 2026-11-09T17:56:00Z_
_Verifier: Claude (gsd-verifier)_

---

## Nota di ri-verifica dell'orchestratore (2026-11-09, dopo il piano 17-10)

L'unico gap del report («handoff `BACKEND-NOTES.md` non ancora scritto, in corso nel piano 17-10») è chiuso dai commit del piano 17-10: `621be74` (handoff `BACKEND-NOTES.md`, §0 TL;DR, §1 contratto con enum verbatim e payload d'esempio, §2 comportamenti provati con l'evidenza HARDEN-02 per gruppo = 85 casi, §3 note per le due UAT della FE Phase 12, §4 deploy, §5 domande), `b4c4459` (BE-SESSION-01..05 spuntati con la riga di tracciabilità, ROADMAP e STATE), `e909045` (SUMMARY e bookkeeping, VALIDATION senza righe pending). Nessun nuovo giro di verifica: il codice verificato (HEAD `eb29f5a`) non è cambiato con quei commit. I fix della code review per aree (`17-REVIEW.md`, ruling in `17-REVIEW-RULINGS.md`) seguono in commit successivi e sono coperti dal gate finale del fixer.
