---
phase: 21-premi-per-rango-e-soccorsi
plan: 13
subsystem: quests
tags: [gate, quests, rewards, aid, dungeon, generation, coverage, sdl, invariants]
requires:
  - 21-01..21-12 (magia ai caster, blocchi per titolo, report D-24, aid per tipo, archiviatore, boss misti, dungeon a turni, quota, filo additivo)
provides:
  - fase misurata verde: type check, unit e integration complete, boot reale, SDL additivo e verbatim, coverage per cartella, lint mirato, invarianti, tabella di copertura
affects: [21-14]
tech-stack:
  added: []
  patterns: []
key-files:
  created:
    - .planning/phases/21-premi-per-rango-e-soccorsi/21-13-SUMMARY.md
  modified:
    - .planning/phases/21-premi-per-rango-e-soccorsi/21-VALIDATION.md
decisions:
  - "Gate verde senza correzioni di codice, test o stile"
  - "Tabella di copertura: il titolo abbreviato del caso della crime (criterio 3) riscritto per intero in VALIDATION, la prova esisteva"
metrics:
  duration: ~20 min
  completed: 2026-11-13
---

# Phase 21 Plan 13: Gate della fase Summary

La fase è verde e misurata: `tsc` 0 su entrambe le configurazioni, unit 280 suite / 3725 test, integration completa 144 suite / 2091 test in sei blocchi senza coverage, boot reale 93/93, SDL solo additivo rispetto a `1f9db973` e identico a RESEARCH §Q7, coverage di `./src/quests/acceptance/` e `./src/quests/generation/` sopra soglia, lint mirato pulito su 97 file, invarianti tutti rispettati, tabella di copertura verificata riga per riga. Nessuna correzione di codice è servita.

## Basi

- `PHASE_BASE` = `fb59b545fc02f5a343d885b3d80e02316d9e8a4c` (`docs(phase-21): begin phase execution`), genitore del primo commit della fase che tocca `src`/`test` (`2f8fdd18`, RED del piano 01); `e7ebbe45` è antenato di HEAD (`git merge-base --is-ancestor` esce 0). Commit della fase da `PHASE_BASE` a `3517dff1`: 58.
- Base dello SDL: `1f9db973` (merge di `develop`), antenato di HEAD (verificato).

## Esito dei punti 1–8

1. **Type check:** `npx tsc --noEmit -p tsconfig.json` esce 0 (~3 s); anche `-p tsconfig.build.json` esce 0.
2. **Unit completo:** `npx jest --selectProjects unit` → 280 suite, 3725 test verdi, 12,7 s.
3. **Integration completa** (senza coverage, `--runInBand`, foreground; `pgrep -fl 'bin/jest'` vuoto dopo ogni blocco):

| Blocco | Comando | Suite | Test | Tempo |
|--------|---------|-------|------|-------|
| `src/quests/outcomes` | `npx jest src/quests/outcomes --selectProjects integration --runInBand` | 14 | 192 | 54,1 s |
| resto di `src/quests` | `npx jest <24 int-spec di src/quests fuori da outcomes> --selectProjects integration --runInBand` | 24 | 384 | 124,8 s |
| `src/characters` | `npx jest src/characters --selectProjects integration --runInBand` | 23 | 388 | 77,5 s |
| `src/travel` | `npx jest src/travel --selectProjects integration --runInBand` | 12 | 244 | 63,7 s |
| resto di `src/` | `npx jest <54 int-spec fuori da quests, characters, travel> --selectProjects integration --runInBand` | 54 | 609 | 113,9 s |
| `test/` | `npx jest <17 int-spec sotto test/> --selectProjects integration --runInBand` | 17 | 274 | 47,3 s |
| **totale** | | **144** | **2091** | **481 s** |

   `npx jest --selectProjects integration --listTests` elenca 144 file: la somma coincide. Nessuna spec appesa (trappola 15-03 mai scattata); `quest-resolution.processor.int-spec.ts` verde al primo giro (7,1 s); nessun flaky visto.

4. **Boot reale e SDL (D-22):** `npx jest test/app.int-spec.ts --selectProjects integration --runInBand` → 93/93 (4,5 s); `git diff --exit-code src/schema.gql` esce 0; `git diff 1f9db973 -- src/schema.gql | grep -cE '^-[^-]'` = 0 (diff: 15 righe aggiunte, nessuna tolta); `enum DungeonTurnKind` = 1; `type QuestRankPrizes` = 1; `type QuestPrizes` identica a `develop` (`diff` esce 0, nessun output); intestazione `type QuestPrizes {` aggiunta o tolta = 0; `QuestRescue` nello SDL = 0. Le aggiunte (`enum DungeonTurnKind`, `Quest.rankPrizes`, `type QuestRankPrizes`, `lastTurn`, `lastTurnKind`, `turnsCompleted`, `turnsTotal` su `QuestResult`) coincidono con RESEARCH §Q7.
5. **Coverage per cartella** (`--coverageThreshold='{}'`, unit + integration, soglie rilette da `package.json`, identiche a quelle del piano):

| Cartella | Statements | Branches | Lines | Soglie | Suite / test |
|----------|-----------|----------|-------|--------|--------------|
| `./src/quests/acceptance/` | 99,08 % | 92,87 % | 99,74 % | 97 / 91 / 98 | 6 / 397 (25 s) |
| `./src/quests/generation/` | 98,9 % | 88,73 % | 99,68 % | 96 / 82 / 97 | 18 / 184 (25 s) |

   Confronto con `node` su `coverage/coverage-summary.json` esce 0 per entrambe. `git diff $PHASE_BASE --stat -- package.json | wc -l` = 0.

   Cartelle senza soglia toccate (misurate, nessuna soglia da rispettare):

| Cartella | Statements | Branches | Lines | Suite / test |
|----------|-----------|----------|-------|--------------|
| `src/quests/prizes` (solo le spec della cartella) | 53,84 % | 57,69 % | 54,54 % | 1 / 13 |
| `src/quests/prizes` (+ `quests.resolver.int-spec.ts`, `quest-updated.subscription.int-spec.ts`, che provano il resolver) | 98,46 % | 88,46 % | 98,18 % | 3 / 58 |
| `src/quests/outcomes` | 97,07 % | 87,2 % | 98,89 % | 53 / 934 |
| `src/quests/maintenance` | 90,74 % | 87,5 % | 91,39 % | 4 / 18 |
| `src/quests/party` | 92,61 % | 79,67 % | 94,79 % | 6 / 55 |
| `src/characters/deletion` | 99,43 % | 81,7 % | 99,37 % | 4 / 54 |

6. **Lint mirato:** `npx prettier --check` + `npx eslint` file per file sui 97 file `.ts` aggiunti o modificati da `PHASE_BASE`: nessun `FAIL`. Il ciclo (≈ 7 min) è stato spostato in background dallo strumento dopo 180 s (non lanciato in background); esito letto dal file di output a fine comando (`files=97`, exit 0) prima di qualsiasi altro comando.
7. **Invarianti:**

| Invariante | Atteso | Esito |
|------------|--------|-------|
| migratori, `.mjs/.json/.yaml/.csv` nel diff (D-28) | 0 | 0 |
| migrat / seed / content / one-off aggiunti sotto `src` e `test` | 0 | 0 |
| `.env.example` e `src/config` nel diff | 0 | 0 |
| `process.env.` aggiunto fuori dalle spec | 0 | 0 |
| `Math.random` / `Date.now` aggiunti fuori dalle spec | 0 | 0 |
| `jest.mock(` aggiunto | 0 | 0 |
| chiamanti di `rankBlocksOf(` fuori dalle spec (W7) | `group-prize.report.ts`, `quest-prizes.resolver.ts`, `rank-prizes.ts` | esattamente quei tre |
| chiamanti di `prizeBlockFor(` fuori dalle spec (D-18) | `combatant-plan.ts`, `gm-completion.service.ts`, `quest-prizes.resolver.ts`, `rank-prizes.ts` | esattamente quei quattro |
| `drawRewards(quest.prizes` in `src` | nessuna riga | nessuna riga |
| `isSpellCaster` in `quest-rewards.ts` (D-25) | ≥ 2 | 3 |
| `planDefeatWithoutAid(` in `combatant-plan.ts` (D-09) | 1 | 1 |
| `releaseRegisteredWithin(` in `character-archiver.ts` (D-27) | ≥ 1 | 1 |
| `sendToUser` / `notifyQuestCancelled` in `character-archiver.ts` | 0 | 0 |
| scritture in `group-prize-report.service.ts` (D-24) | 0 | 0 |
| `QuestRescue` nello SDL | 0 | 0 |
| trailer vietati nei commit della fase | 0 | 0 |
| subject oltre 72 caratteri | 0 | 0 |
| file `.env*` nel diff | 0 | 0 |
| URI Mongo nei documenti della fase, `src/quests`, `src/characters` | 0 | 0 |
| operatori Mongo nei SUMMARY della fase | solo in code span | nessuna riga trovata |
| titoli dei test nuovi con un operatore | 0 | 0 |
| `dist/` nel diff | 0 | 0 |
| `git status --short` / `pgrep -fl 'bin/jest'` | vuoti | vuoti |

8. **Tabella di copertura** (`grep -cF "<titolo intero>" <spec>` per ogni riga di `21-VALIDATION.md`):

   §Decision Coverage: D-01, D-02, D-03, D-04, D-05, D-05a, D-05b, D-05c, D-06, D-07, D-08, D-09, D-09b, D-10, D-11, D-12, D-13, D-14, D-15, D-16, D-18, D-19, D-20, D-21, D-22, D-23, D-24, D-25, D-26, D-27, D-28, D-29, D-30 → 1 occorrenza del titolo intero nella spec indicata ciascuna (33/33). D-17 verificata sul CONTEXT (pulizia delle 3 aid fatta nel discuss, nessun codice; la riga di `BACKEND-NOTES.md` §6 la scrive il piano 14). D-30 verificata anche sulla ROADMAP (criterio 4: 5° turno esplorazione → 5/8, 4° scontro → metà).

   §Success Criteria Coverage: criterio 1 (3 casi), 2 (4 casi), 4 (4 casi), 5 (3 casi più `BACKEND-NOTES.md` del piano 14) → 1 occorrenza ciascuno. Criterio 3: «creates no aid for a lost job…» e «opens an aid with the seats and the rank blocks…» = 1; «keeps the crime arrest as it is (D-09b)» = 0 col testo abbreviato della tabella: il caso esiste in `crime-guard-conclusion.int-spec.ts:136` col titolo intero `keeps the crime arrest as it is: ten hours of prison, a quarter of the coins lost, no prize (D-09b)` (rinominato così nel piano 05, vedi `21-05-SUMMARY.md`). La riga della VALIDATION è stata riscritta col titolo intero (ora 1 occorrenza); nessun caso aggiunto.

## Deviazioni dal piano

- **Tabella di copertura, criterio 3:** titolo del caso della crime abbreviato nella VALIDATION; corretto il documento col titolo intero nel commit di bookkeeping. Nessun test toccato.
- **Blocchi integration:** sei comandi invece di cinque (il «resto» diviso fra `src/` e `test/`, come nella Phase 20) per stare sotto i 180 s dopo cui lo strumento sposta i comandi in background.
- **Lint mirato:** spostato in background dallo strumento dopo 180 s; nessun altro comando lanciato prima della sua fine. Nessun effetto sull'esito.

Nessuna correzione di codice, test o stile.

## Restano all'orchestratore

`npm run test:cov` completo, la build, il riavvio reale del BE dal ramo e la UAT su device (handoff del piano 14).

## Self-Check: PASSED

- `.planning/phases/21-premi-per-rango-e-soccorsi/21-13-SUMMARY.md` presente; HEAD di partenza `3517dff1` presente nel log; nessun commit di codice atteso in questo piano; righe `21-13-01`, `21-13-02` della VALIDATION a ✅ green.
