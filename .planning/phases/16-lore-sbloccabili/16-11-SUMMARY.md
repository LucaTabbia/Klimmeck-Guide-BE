---
phase: 16-lore-sbloccabili
plan: 11
subsystem: gate della fase (tsc, test:cov, boot reale, SDL, lint, invarianti)
tags: [gate, coverage, schema, BE-LORE-01, BE-LORE-02, BE-LORE-03, BE-LORE-04, BE-LORE-05, BE-LORE-06, D-12, D-15]
requires: [16-10]
provides:
  - "fase verde e misurata: test:cov 373 suite / 4649 test, exit 0, nessuna soglia violata"
  - "SDL vs origin/develop: 3 righe aggiunte, 0 tolte"
  - "16-VALIDATION.md firmata (status complete, nyquist_compliant true, wave_0_complete true)"
affects: [16-12]
tech-stack:
  added: []
  patterns: []
key-files:
  created:
    - .planning/phases/16-lore-sbloccabili/16-11-SUMMARY.md
  modified:
    - .planning/phases/16-lore-sbloccabili/16-VALIDATION.md
key-decisions:
  - "Nessun ripiego: test:cov completo in 576.5 s, sotto il tetto di 600 s del tool (spostato in background a 180 s dallo strumento, atteso fino alla notifica senza rilanci)"
  - "Nessuna correzione di codice né test: tutte le soglie già verdi alla prima run"
duration: ~17 min
completed: 2026-11-07
---

# Phase 16 Plan 11: gate della fase — Summary

Gate della BE Phase 16. La prima `npm run test:cov` è verde con tutte le soglie (373 suite / 4649 test, 576.5 s, exit 0). Il boot reale è verde e lo SDL è solo additivo con le tre righe attese. Lint mirato pulito sui 97 `.ts` della fase. Tutti gli invarianti rispettati, VALIDATION firmata. Nessun file di codice toccato.

## Task 1: suite, boot reale, invarianti

### 1. Type check e suite
- `npx tsc --noEmit -p tsconfig.json`: exit 0.
- `npm run test:cov` in foreground con timeout 600000. Lo strumento lo ha spostato in background a 180 s e l'ho atteso fino alla notifica. Esito: **Test Suites 373 passed / 373, Tests 4649 passed / 4649, Time 576.469 s, exit 0**, nessun messaggio «coverage threshold … not met». Ripiego per cartella non necessario.
- Totali: statements 97.32 % (12754/13105) · branches 85.73 % (5463/6372) · functions 93.94 % (2699/2873) · lines 97.89 % (11418/11664).
- Coverage per cartella (da `coverage/coverage-summary.json` con `node -e`):
  - `src/travel/`: 98.57 % (1172/1189) · 84.48 % (604/715) · 99.34 % (1060/1067). Soglia 97/84/98; margine sui branch 3 (604 contro i 601 richiesti).
  - `src/quests/acceptance/`: 99.26 % (405/408) · 92.81 % (310/334) · 100 % (361/361). Soglia 97/91/98.
  - `src/lore/`: 96.72 % (236/244) · 84.14 % (122/145) · 97.54 % (198/203). Nessuna soglia.
  - `src/migrations/lore-backfill/`: 100 % · 85.71 % (24/28) · 100 %.
  - `src/quests/outcomes/`: 96.80 % · 85.87 % · 98.73 %.
- `npx jest src/config --selectProjects unit`: 17 suite / 259 test verdi.
- Soglie: `git diff origin/develop -- package.json | grep -c coverageThreshold` = 0; controllo `node -e` su `./src/travel/` 97/84/98 e `./src/quests/acceptance/` 97/91/98: exit 0.

### 2. Boot reale e SDL
- `npx jest test/app.int-spec.ts --selectProjects integration --runInBand`: 76/76 in 4.1 s. Dopo il boot, `git diff --exit-code src/schema.gql` esce 0.
- Righe tolte rispetto a `origin/develop`: **0**.
- Righe aggiunte: **3**, esattamente quelle attese: `  unlockedLore: [ID!]!` (CharacterStatus), `  known: Boolean!` (QuestEnemy), `  loreUnlocked: [Lore!]!` (QuestResult).

### 3. Lint mirato
- `prettier --check` più `eslint`, file per file, sui 97 `.ts` aggiunti o modificati rispetto a `origin/develop`: nessun FAIL. Resta solo il warning di baseline `test/app.int-spec.ts:977:38` `no-base-to-string` (preesistente, non corretto).

### 4. Invarianti
| Invariante | Esito |
|---|---|
| trailer vietati su `origin/develop..HEAD` | 0 |
| `.env` nel diff | 0 |
| URI Mongo con credenziali nei `.md` della fase | nessuna |
| `.env.example` | solo `+LORE_STUDY_CHANCE=` |
| `process.env.` nuovo fuori dalle spec | vuoto |
| determinismo (`Math.random`/`Date.now` nei file di produzione della fase) | vuoto |
| operatori Mongo nei `.md` della fase fuori dai code span | 0: le 15 righe del grep sulle SUMMARY hanno tutte l'operatore in un code span; verificato con uno script che salta i blocchi delimitati e i code span su tutti i `.md` della fase |
| titoli dei test con operatori | vuoto |
| `LoreBackfillModule` fuori da `src/migrations/lore-backfill/` e dalle spec | solo `src/app.module.ts` |
| `LoreVisibilityModule` nei 6 moduli | presente in tutti (0 file a `:0`) |
| `EXPECTED_OWNER_ONLY_HANDLERS` | invariato (0) |
| `COMPLETION_UPDATE` | invariato (0) |
| `combatant-plan.spec.ts` (`enemyFactsOf`) | 0 righe di diff |
| seeder/migrazioni fuori dal backfill | vuoto |
| `dist/` nel diff | 0 |
| `pgrep -fl 'bin/jest'` | vuoto |
| processo `node dist/main.js` pid 99707 | vivo |

## Task 2: VALIDATION firmata
- Frontmatter `status: complete`, `nyquist_compliant: true`, `wave_0_complete: true`; righe `16-11-01`/`16-11-02` `✅ green`; Sign-Off spuntato; `**Approval:** approved 2026-11-07`. Commit `7bf050d`.

## Task 3: bookkeeping
- ROADMAP `11/12`, `- [x] 16-11-PLAN.md`; STATE `Plan: 11 of 12`; VALIDATION `16-11-03` `✅ green`.

## Deviations from Plan
Nessuna. Una sola nota operativa: il primo giro del lint aveva un percorso di redirect sbagliato e ha dato falsi FAIL. L'ho rilanciato corretto: 97 file, nessun FAIL.

## Self-Check: PASSED
- `16-11-SUMMARY.md` e `16-VALIDATION.md` presenti; commit `7bf050d` presente.
