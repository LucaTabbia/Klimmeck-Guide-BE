---
phase: 17-autorizzazione-e-sessioni
plan: 06
subsystem: auth (watcher del ruolo sul change stream di users, revoca roleChanged)
tags: [auth, session, change-stream, ws, BE-SESSION-04, D-03, D-06, D-10, D-14]
requires: ["17-05"]
provides:
  - "`UserRoleChangesPublisher` in `src/auth/session/user-role-changes.publisher.ts` (provider di `AuthModule`, `forFeature User`), `onChange` → `SessionRevocationService.revokeAllForRoleChange(userId)`"
  - "`export const USER_ROLE_CHANGES: ChangeStreamSpec` (pipeline sul solo `updateDescription.updatedFields.role`, nessuna opzione)"
  - "Helper di test `test/harness/role-watcher.ts`: `waitForRevocation`, `primeRoleWatcher`, `flushRoleWatcher`"
affects: [17-07, 17-08, 17-09, 17-10]
tech-stack:
  added: []
  patterns:
    - "Watcher senza publish sul modello `ArchivedCharacterQueueRefresher`, id dell'utente da `documentKey` (nessun `updateLookup`)"
    - "Priming e barriera del watcher osservando la revoca di una sessione sentinella (poll su `sessions`)"
key-files:
  created:
    - src/auth/session/user-role-changes.publisher.ts
    - src/auth/session/user-role-changes.publisher.spec.ts
    - src/auth/session/user-role-changes.publisher.int-spec.ts
    - test/harness/role-watcher.ts
  modified:
    - src/auth/auth.module.ts
    - src/auth/auth-session.service.int-spec.ts
    - src/users/user-updated.subscription.int-spec.ts
    - test/app.int-spec.ts
decisions:
  - "Nessun `onHistoryLost` nel watcher: il default no-op basta, il ruolo stantio è coperto dalla rilettura al refresh (D-10)"
  - "Spec D-10 protetta con l'override del watcher (`useValue: {}`); spec del ruolo in `userUpdated` riscritta col bearer dev (identità senza sessione)"
metrics:
  duration: "~35 min"
  completed: 2026-11-09
  tasks: 3
  files: 8
---

# Phase 17 Plan 06: il cambio di ruolo revoca le sessioni Summary

`UserRoleChangesPublisher` osserva il change stream di `users` filtrato sui soli update che toccano `role` e, per ogni evento, chiama `SessionRevocationService.revokeAllForRoleChange(userId)`: tutte le sessioni attive dell'utente diventano `roleChanged` e i loro socket vivi si chiudono con `4409 roleChanged`. Il percorso `UsersService.upsertWithRole` passa dallo stesso stream (nessuna modifica a `UsersModule`/`UsersService`). Una revoca fallita è loggata con il solo id dell'utente e `describeError`. SDL invariato.

## Task

| Task | Nome | Commit | File |
|------|------|--------|------|
| 1 RED | spec unit del watcher | e79f9de | `src/auth/session/user-role-changes.publisher.spec.ts` |
| 1 GREEN | watcher | 6ff5c60 | `src/auth/session/user-role-changes.publisher.ts` |
| 2 RED | helper, int-spec D-06, spec D-14 stabilizzate, test di montaggio | 279e2dc | `test/harness/role-watcher.ts`, `src/auth/session/user-role-changes.publisher.int-spec.ts`, `src/auth/auth-session.service.int-spec.ts`, `src/users/user-updated.subscription.int-spec.ts`, `test/app.int-spec.ts` |
| 2 GREEN | registrazione in `AuthModule` | 65a0ccd | `src/auth/auth.module.ts` |
| 3 | bookkeeping | (questo commit) | ROADMAP, STATE, VALIDATION, SUMMARY |

## Fallimenti RED osservati

- Task 1: suite non caricabile, `Cannot find module './user-role-changes.publisher'`.
- Task 2: `user-role-changes.publisher.int-spec` 7/7 rossi con `role watcher never revoked the sentinel session` nel `beforeAll` (watcher non registrato); `test/app.int-spec.ts` 1 rosso su 79 (`mounts the user role changes publisher`: «Nest could not find UserRoleChangesPublisher element»); `mounts the session revocation` già verde (provider registrati dal piano 03). `auth-session.service.int-spec` + `user-updated.subscription.int-spec` verdi (32/32) già prima della registrazione.

## Override prima della registrazione (richiesto dal piano)

`overrides: [{ token: UserRoleChangesPublisher, useValue: {} }]` con il provider non ancora registrato: Nest lo IGNORA in silenzio (nessun errore al `compile`), la spec è rimasta verde; l'override è quindi entrato nel commit RED come previsto.

## Stabilità D-14 (richiesto dal piano)

Dopo il GREEN, `npx jest src/auth/auth-session.service.int-spec.ts src/users/user-updated.subscription.int-spec.ts --selectProjects integration --runInBand` eseguito due volte di fila: 32/32 verdi entrambe le volte.

## Gate

- `npx tsc --noEmit -p tsconfig.json` 0 dopo ogni task di codice.
- Unit spec del watcher: 4/4. Int-spec D-06: 7/7 (ogni caso < 150 ms dopo il priming).
- `auth-session.service.int-spec` + `user-updated.subscription.int-spec` + `user-updates.publisher.int-spec`: 3 suite / 38 test.
- Boot reale `test/app.int-spec.ts`: 79/79; `git diff --exit-code src/schema.gql` 0, nessuna differenza dello schema rispetto a `origin/develop`.
- Controllo di wave: unit `src/auth test/auth test/authz src/users src/graphql` = 34 suite / 337 test; integration stesse cartelle = 22 suite / 273 test.
- Prettier `--write` + eslint su ognuno degli 8 file `.ts` toccati: puliti (l'unico warning, `no-base-to-string` a `test/app.int-spec.ts:1001`, è preesistente e non in righe toccate).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Timeout del `beforeAll` della int-spec D-06**
- **Found during:** Task 2 (RED)
- **Issue:** boot dell'harness + priming nel caso peggiore (25 tentativi da 200 ms) superano il timeout di default di jest (5 s): il RED compariva come «Exceeded timeout of 5000 ms for a hook» invece del messaggio del priming.
- **Fix:** costante `SETUP_TIMEOUT_MS = 15_000` passata al `beforeAll` della sola int-spec nuova; il RED mostra ora `role watcher never revoked the sentinel session`.
- **Files modified:** `src/auth/session/user-role-changes.publisher.int-spec.ts`
- **Commit:** 279e2dc

**2. [Nota] Formato di STATE.md**
- Il verify del Task 3 cerca `Plan: 06 of 10`; STATE.md usa `Plan: N of 10` non zero-padded (come nei piani 01–05 e come prescrive il brief dell'orchestratore): scritto `Plan: 6 of 10`.

## Known Stubs

Nessuno.

## Threat Flags

Nessuna superficie nuova oltre il threat model del piano (T-17-23..T-17-28 coperti: pipeline sul solo ruolo, `.catch` con `describeError`, log col solo id).

## Self-Check: PASSED

- File creati presenti: `src/auth/session/user-role-changes.publisher.ts`, `src/auth/session/user-role-changes.publisher.spec.ts`, `src/auth/session/user-role-changes.publisher.int-spec.ts`, `test/harness/role-watcher.ts`.
- Commit presenti: e79f9de, 6ff5c60, 279e2dc, 65a0ccd.
