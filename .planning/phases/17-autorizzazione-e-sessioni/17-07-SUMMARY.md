---
phase: 17-autorizzazione-e-sessioni
plan: 07
subsystem: test (fondazioni della matrice di autorizzazione)
tags: [authz, test, real-boot, fixtures, BE-SESSION-01, D-01, C-2]
requires: ["17-06"]
provides:
  - "`test/authz/expected-handlers.ts`: `EXPECTED_INNKEEPER_HANDLERS` (11), `EXPECTED_OWNERSHIP_HANDLERS` (19), `EXPECTED_OWNER_ONLY_HANDLERS` (8) come tuple `as const`, tipi `InnkeeperHandler`, `OwnershipHandler`, `ProtectedHandler`"
  - "`test/harness/real-app-boot.ts`: `bootRealApp({ dbName, listen? })`, `RealAppBoot`, `RealAppBootOptions`, `REAL_BOOT_TIMEOUT_MS`, `REAL_BOOT_JWT_SECRET`"
  - "`test/authz/handler-fixtures.ts`: `HANDLER_FIXTURES: Record<ProtectedHandler, HandlerFixture>` (30 voci), `HandlerFixture`, `MatrixVictims`, `FixtureTarget`, `MATRIX_ANY_ID`"
affects: [17-08, 17-09, 17-10]
tech-stack:
  added: []
  patterns:
    - "Boot reale di AppModule in un helper unico con import differito dopo la scrittura dell'ambiente e pulizia degli handle sul boot fallito"
    - "Fixture per handler validate contro `src/schema.gql` con graphql-js (`buildSchema`, `validate`, `getVariableValues`) in una spec unit senza boot"
key-files:
  created:
    - test/authz/expected-handlers.ts
    - test/harness/real-app-boot.ts
    - test/authz/handler-fixtures.ts
    - test/authz/handler-fixtures.spec.ts
  modified:
    - test/app.int-spec.ts
decisions:
  - "Le 10 mutation della forma `request` → `successful` sono costruite da un helper privato `requestMutation(field, inputType, variables)` (target `character`) invece di 10 letterali ripetuti"
  - "`process.env` fotografato e ripristinato dentro `bootRealApp` (in `close()` e sul boot fallito), non più nella spec"
metrics:
  duration: "~20 min"
  completed: 2026-11-09
  tasks: 3
  files: 5
---

# Phase 17 Plan 07: fondazioni della matrice di autorizzazione Summary

Le tre liste enumerate di autorizzazione vivono ora in `test/authz/expected-handlers.ts` (stesse 38 voci nello stesso ordine di `origin/develop`), il boot reale di `AppModule` è un helper unico `bootRealApp` in `test/harness/real-app-boot.ts` (con `listen(0)` opzionale per la matrice del piano 08) e `test/authz/handler-fixtures.ts` dà una fixture valida per lo SDL a ognuno dei 30 handler protetti, imposta dal tipo `Record<ProtectedHandler, HandlerFixture>` e da una spec unit di completezza che non avvia nulla. SDL invariato.

## Task

| Task | Nome | Commit | File |
|------|------|--------|------|
| 1 | liste condivise e boot reale estratto | bb2954e | `test/authz/expected-handlers.ts`, `test/harness/real-app-boot.ts`, `test/app.int-spec.ts` |
| 2 RED | spec delle fixture | 407443d | `test/authz/handler-fixtures.spec.ts` |
| 2 GREEN | tabella delle 30 fixture | 9013a30 | `test/authz/handler-fixtures.ts` |
| 3 | bookkeeping | (questo commit) | ROADMAP, STATE, VALIDATION, SUMMARY |

## Boot reale prima e dopo

`npx jest test/app.int-spec.ts --selectProjects integration --runInBand`: 79/79 verdi prima del refactor, 79/79 dopo (nessun titolo né asserzione cambiati).

## Fallimenti RED osservati

- Task 2: suite non caricabile, `Cannot find module './handler-fixtures'`.

## Selezioni sostituite con `__typename`

Nessuna oltre a quella già prescritta dal piano per `equipment` (union): tutti i 30 documenti passano `validate` al primo colpo.

## Gate

- `npx tsc --noEmit -p tsconfig.json` 0 dopo i task 1 e 2.
- `test/app.int-spec.ts`: 79/79. `test/authz/handler-fixtures.spec.ts`: 6/6.
- Controllo di wave: unit `src/auth test/auth test/authz` = 27 suite / 273 test; integration stesse cartelle = 16 suite / 219 test.
- Prettier `--write`/`--check` + eslint sui 5 file `.ts`: puliti; unico warning il preesistente `no-base-to-string` di `test/app.int-spec.ts` (ora riga 917, prima 1001: righe spostate dal refactor, non toccate).
- `git diff --exit-code src/schema.gql` 0; `git diff origin/develop -- src/schema.gql` vuoto. `test/setup/redis.ts` non toccato.
- `handler-fixtures.spec.ts` non importa `AppModule` (lezione CI).

## Deviations from Plan

### Auto-fixed Issues

**1. [Boy Scout] Import `Test` di `@nestjs/testing` rimosso da `test/app.int-spec.ts`**
- **Found during:** Task 1 — dopo l'estrazione del boot era inutilizzato (warning eslint `no-unused-vars`); tolti anche `getConnectionToken`, `Connection`, `startRedis`/`stopRedis`, `BOOT_TIMEOUT_MS`, `envSnapshot`. Commento JSDoc del `describe` aggiornato («bootRealApp sets process.env BEFORE AppModule is imported»).
- **Commit:** bb2954e

**2. [Nota] Helper `requestMutation` e grep di accettazione**
- Le 10 mutation `request` → `successful` (target `character`) sono costruite da `requestMutation(field, inputType, variables)` per non ripetere 10 volte lo stesso letterale (Clean Code). Il grep `^\s+'…Resolver.…': \{` conta quindi 20; il conteggio di ripiego previsto dal piano `grep -cE "Resolver\.[A-Za-z]+'"` dà 30.

**3. [Nota] Formato di STATE.md**
- Il verify del Task 3 cerca `Plan: 07 of 10`; STATE.md usa `Plan: N of 10` non zero-padded (come nei piani 01–06 e come prescrive il brief dell'orchestratore): scritto `Plan: 7 of 10`.

## Known Stubs

Nessuno.

## Threat Flags

Nessuna superficie nuova: solo codice di test (T-17-29, T-17-30, T-17-31 mitigati come da piano).

## Self-Check: PASSED

- File creati presenti: `test/authz/expected-handlers.ts`, `test/harness/real-app-boot.ts`, `test/authz/handler-fixtures.ts`, `test/authz/handler-fixtures.spec.ts`.
- Commit presenti: bb2954e, 407443d, 9013a30.
