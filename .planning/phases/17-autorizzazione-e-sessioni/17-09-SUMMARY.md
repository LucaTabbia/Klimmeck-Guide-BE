---
phase: 17-autorizzazione-e-sessioni
plan: 09
subsystem: gate della fase (tsc, test:cov, boot reale, SDL, lint, invarianti)
tags: [gate, coverage, real-boot, sdl, BE-SESSION-05, D-10, D-15]
requires: ["17-08"]
provides:
  - "fase verde e misurata: test:cov 380 suite / 4849 test, exit 0, nessuna soglia violata"
  - "coverage di `./src/auth/` 99.86 / 87.47 / 100 (soglia 97/84/98 invariata)"
  - "`17-VALIDATION.md` firmata (`status: complete`, `nyquist_compliant: true`, `wave_0_complete: true`)"
affects: [17-10]
tech-stack:
  added: []
  patterns: []
key-files:
  created: []
  modified:
    - .planning/phases/17-autorizzazione-e-sessioni/17-VALIDATION.md
decisions:
  - "Nessun ripiego: `npm run test:cov` completo in 560.4 s (563 s di parete), sotto il tetto di 600 s; lo strumento lo ha spostato in background a 180 s ed è stato atteso fino alla notifica senza rilanci"
  - "La coverage di `./src/auth/` è stata letta da `coverage/coverage-summary.json` sommando i file sotto `src/auth/` (esclusi gli spec), lo stesso perimetro della soglia"
metrics:
  duration: "~20 min"
  completed: 2026-11-09
  tasks: 3
  files: 1
---

# Phase 17 Plan 09: Gate della fase Summary

Gate della BE Phase 17: `tsc` pulito, `npm run test:cov` verde al primo colpo (380 suite / 4849 test, exit 0, nessuna soglia violata), boot reale verde con 79 test, SDL identico a `origin/develop`, whitelist invariate (38 voci), lint mirato pulito sui 37 `.ts` della fase, tutti gli invarianti rispettati, VALIDATION firmata. Nessun file di codice toccato.

## Task 1: suite, boot reale, invarianti

### 1. Type check e controllo di wave
- `npx tsc --noEmit -p tsconfig.json`: exit 0.
- `npx jest src/auth test/auth test/authz src/users src/graphql --selectProjects unit integration --runInBand`: **58 suite / 701 test verdi**, 41.5 s.

### 2. Suite completa con coverage
- `npm run test:cov` in foreground con timeout 600000; spostato in background dallo strumento a 180 s, atteso fino alla notifica. Esito: **Test Suites 380 passed / 380, Tests 4849 passed / 4849, Time 560.432 s, exit 0**, nessun messaggio di soglia non raggiunta. Ripiego per cartella non necessario.
- Totali: statements 97.32 % (12798/13150) · branches 85.81 % (5518/6430) · functions 93.91 % (2703/2878) · lines 97.88 % (11452/11699).
- `./src/auth/` (somma dei file non spec sotto `src/auth/` da `coverage/coverage-summary.json`): **statements 99.86 % (700/701) · branches 87.47 % (328/375) · functions 100 % (137/137) · lines 100 % (617/617)**. Soglia 97/84/98: margine sui branch 13 (328 contro i 315 richiesti).
- Soglia letta da `package.json`: `{"statements":97,"branches":84,"lines":98}`; `git diff origin/develop -- package.json | wc -l` = 0.
- Nessun test instabile osservato.

### 3. Boot reale, SDL, whitelist
- `npx jest test/app.int-spec.ts --selectProjects integration --runInBand`: **1 suite / 79 test verdi**, 4.2 s.
- `git diff --exit-code src/schema.gql`: 0; `git diff origin/develop -- src/schema.gql | wc -l`: 0 (D-08).
- Whitelist: `git diff origin/develop -- test/app.int-spec.ts | grep -cE "^\+\s+'[A-Za-z]+\.[A-Za-z]+',"` = 0; il diff delle voci di `develop` contro `test/authz/expected-handlers.ts` non stampa nulla (38 voci in entrambi).

### 4. Lint mirato
- `prettier --check` + `eslint` file per file sui 37 `.ts` aggiunti o modificati rispetto a `origin/develop`: nessun `FAIL`. Resta il warning preesistente `no-base-to-string` in `test/app.int-spec.ts` (non bloccante, già annotato nei piani 06–07).

### 5. Invarianti
| Invariante | Esito |
|---|---|
| enum mai stringa (`reason: string` fuori dagli spec in `src/auth`) | vuoto |
| `registerEnumType` in `src/auth/session` | vuoto |
| `.env.example` e `src/config` vs develop | 0 righe |
| `process.env.` aggiunto in `src` (non spec) | vuoto |
| `Math.random` / `Date.now` aggiunti in `src` (non spec) | vuoto |
| log nuovi con token/hash/twitch | vuoto |
| perimetro `users.module.ts`, `users.service.ts`, `auth.guard.ts`, `auth-config.ts` | 0 righe |
| `WS_SESSION_REVOKED_CLOSE_CODE = 4409` | 1 |
| quattro valori dell'enum | 4 |
| `package.json` vs develop | 0 righe |
| trailer vietati su `origin/develop..HEAD` | 0 |
| `.env` nel diff | 0 |
| URI Mongo nei `.md` della fase | vuoto |
| operatori Mongo nei SUMMARY | nessuna riga |
| operatori nei titoli dei test aggiunti | vuoto |
| one-off (`migrat`/`seed`/`backfill`) in `src` | vuoto |
| `dist/` nel diff | 0 |
| `git status --short` / `pgrep -fl 'bin/jest'` | vuoti |

## Task 2: VALIDATION firmata
- Frontmatter `status: complete`, `nyquist_compliant: true`, `wave_0_complete: true`; righe `17-09-01`/`17-09-02` → `✅ green`; Wave 0 e Sign-Off spuntati; `**Approval:** approved 2026-11-09`. Commit `67c8cc4` `docs(phase-17): sign the validation`.

## Task 3: bookkeeping
- ROADMAP `| 17. Autorizzazione e sessioni | 9/10 | In Progress | - |`, `- [x] 17-09-PLAN.md`; STATE `Plan: 9 of 10`; VALIDATION `17-09-03` → `✅ green`.

## Deviations from Plan
- Il piano chiede `Plan: 09 of 10` in STATE.md; il formato del file è `Plan: N of 10` (non zero-padded) e il brief dell'orchestratore prescrive `Plan: 9 of 10`: scritto `Plan: 9 of 10`, il verify automatico del task 3 che cerca `Plan: 09 of 10` non trova riscontro (annotato, come nei piani precedenti).

Nessun altro scostamento: nessun fix, nessun RED (piano di sola verifica).

## Self-Check: PASSED
- `.planning/phases/17-autorizzazione-e-sessioni/17-VALIDATION.md` firmata; commit `67c8cc4` presente.
