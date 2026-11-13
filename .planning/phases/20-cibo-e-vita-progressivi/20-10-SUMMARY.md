---
phase: 20-cibo-e-vita-progressivi
plan: 10
subsystem: travel
tags: [gate, travel, quests, food, hunger, coverage, sdl, invariants]
requires:
  - 20-01..20-09 (modello, assestamento, arrivo, sweep, imboscata, teleport, partenza libera e da quest)
provides:
  - fase misurata verde: type check, unit e integration complete, boot reale, SDL identico alla base, coverage per cartella, lint mirato, invarianti
affects: [20-11]
tech-stack:
  added: []
  patterns: []
key-files:
  created:
    - .planning/phases/20-cibo-e-vita-progressivi/20-10-SUMMARY.md
  modified: []
decisions:
  - "Gate verde senza correzioni: nessun commit di codice, test o stile in questo piano"
metrics:
  duration: ~14 min
  completed: 2026-11-12
---

# Phase 20 Plan 10: Gate della fase Summary

La fase è verde e misurata: `tsc` 0 su entrambe le configurazioni, unit 274 suite / 3590 test, integration completa 141 suite / 2028 test in quattro blocchi senza coverage, boot reale 91/91, SDL identico alla base, coverage di `./src/travel/` e `./src/quests/acceptance/` sopra soglia, lint mirato pulito su 40 file, tutti gli invarianti a zero. Nessuna correzione è servita.

## Base della fase

`PHASE_BASE` = `466be7e7ffe88cedc77af2d2299fdba40d460408` (`docs(phase-20): begin phase execution`), genitore del primo commit della fase che tocca `src`/`test`; `ceab7f2c` è antenato di HEAD (`git merge-base --is-ancestor` esce 0). Commit della fase da `PHASE_BASE` a `bbb155e3`: 43.

## Esito dei punti 1–7

1. **Type check:** `npx tsc --noEmit -p tsconfig.json` esce 0 (~3 s); anche `-p tsconfig.build.json` esce 0.
2. **Unit completo:** `npx jest --selectProjects unit` → 274 suite, 3590 test verdi, 10 s.
3. **Integration completa (senza coverage, `--runInBand`, foreground):**

| Blocco | Comando | Suite | Test | Tempo |
|--------|---------|-------|------|-------|
| travel | `npx jest src/travel --selectProjects integration --runInBand` | 12 | 235 | 58,6 s |
| quests | `npx jest src/quests --selectProjects integration --runInBand` | 35 | 529 | 162,9 s |
| resto `src/` | `npx jest <77 int-spec fuori da src/travel e src/quests> --selectProjects integration --runInBand` | 77 | 992 | 185,5 s |
| `test/` | `npx jest <17 int-spec sotto test/> --selectProjects integration --runInBand` | 17 | 272 | 42,8 s |
| **totale** | | **141** | **2028** | |

   `--listTests` del progetto integration elenca 141 file (12 travel, 35 quests, 77 resto di `src/`, 17 sotto `test/`): la somma coincide. Nessuna spec appesa (trappola 15-03 mai scattata); `quest-resolution.processor.int-spec.ts` verde al primo giro. `pgrep -fl 'bin/jest'` vuoto dopo ogni blocco.

4. **Boot reale e SDL (D-10):** `npx jest test/app.int-spec.ts --selectProjects integration --runInBand` → 91/91 (4,3 s); `git diff --exit-code src/schema.gql` esce 0; `git diff $PHASE_BASE --stat -- src/schema.gql | wc -l` = 0; grep dei nomi del piano nello SDL = 0.
5. **Coverage per cartella** (soglie lette da `package.json`, identiche a quelle del piano; `--coverageThreshold='{}'`, unit + integration):

| Cartella | Statements | Branches | Lines | Soglie | Suite / test |
|----------|-----------|----------|-------|--------|--------------|
| `./src/travel/` | 98,59 % | 86,55 % | 99,29 % | 97 / 84 / 98 | 36 / 486 (66 s) |
| `./src/quests/acceptance/` | 99,06 % | 92,79 % | 99,73 % | 97 / 91 / 98 | 6 / 393 (23 s) |

   Confronto `node -e` su `coverage/coverage-summary.json` esce 0 per entrambe. `git diff $PHASE_BASE --stat -- package.json | wc -l` = 0.
6. **Lint mirato:** prettier `--check` + eslint sui 40 file `.ts` aggiunti o modificati dalla base: nessun `FAIL`.
7. **Invarianti:**

| Invariante | Atteso | Esito |
|------------|--------|-------|
| migratori, `.mjs/.json/.yaml/.csv` nel diff | 0 | 0 |
| seed / content / one-off sotto `src` e `test` | 0 | 0 |
| `.env.example` e `src/config` nel diff | 0 | 0 |
| `process.env.` aggiunto fuori dalle spec | 0 | 0 |
| `Math.random` / `Date.now` aggiunti fuori dalle spec | 0 | 0 |
| `jest.mock(` aggiunto | 0 | 0 |
| `$inc` aggiunto fuori dalle spec (D-14) | 0 | 0 |
| `lifePointsWithin` in `travel-food-settlement.ts` | 0 | 0 |
| `mealGuardsOf` / `mealSetOf` in `src` e `test` | 0 | 0 |
| `foodPlanOf(` in `travel.service.ts` / `quest-acceptance.service.ts` | 1 / 1 | 1 / 1 |
| `status.activeTravel.food` in `travel-completion.service.ts` / `travel.service.ts` | 0 / 0 | 0 / 0 |
| resolver admin e liste authz nel diff | 0 | 0 |
| indice `character_active_travel_food` nel modello | 1 | 1 |
| trailer vietati nei commit della fase | 0 | 0 |
| subject oltre 72 caratteri | 0 | 0 |
| file `.env*` nel diff | 0 | 0 |
| URI Mongo nei documenti della fase e in `src/travel` | 0 | 0 |
| operatori Mongo nei SUMMARY fuori da code span | nessuno | l'unica riga (`20-09-SUMMARY.md:54`) ha l'operatore in code span |
| titoli dei test nuovi con un operatore | 0 | 0 |
| `dist/` nel diff | 0 | 0 |
| `git status --short` / `pgrep -fl 'bin/jest'` | vuoti | vuoti |

## Deviazioni dal piano

- **Esecuzione del blocco «resto di `src/`»:** lo strumento Bash ha spostato da sé il comando in background dopo 180 s (non è stato lanciato in background); è terminato con exit 0 e l'esito è stato letto dal file di output prima di lanciare altri jest. Nessun effetto sul risultato.
- Il resto delle integration è stato diviso in due comandi (`src/` e `test/`) invece di uno: il piano lo consente («uno o più comandi»).

Nessuna correzione di codice, test o stile: gate verde al primo giro.

## Restano all'orchestratore

`npm run test:cov` completo, la build, il riavvio reale del BE dal ramo e la UAT su device (handoff del piano 11).

## Self-Check: PASSED

- `.planning/phases/20-cibo-e-vita-progressivi/20-10-SUMMARY.md` presente; HEAD di partenza `bbb155e3` presente nel log; nessun commit di codice atteso in questo piano.
