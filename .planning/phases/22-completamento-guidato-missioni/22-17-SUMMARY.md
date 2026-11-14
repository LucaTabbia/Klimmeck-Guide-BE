---
phase: 22-completamento-guidato-missioni
plan: 17
subsystem: gate
tags: [gate, coverage, sdl, invarianti]
requires: ["22-16"]
provides: ["gate verde della Phase 22 per il piano 18 (handoff) e la PR verso develop"]
affects: [src/validation/input-decorators.spec.ts]
tech-stack:
  added: []
  patterns: []
key-files:
  created: []
  modified:
    - src/validation/input-decorators.spec.ts
    - .planning/phases/22-completamento-guidato-missioni/22-15-SUMMARY.md
decisions:
  - "Il pin dei decoratori degli input (D-01 della Phase 10) registra i sei input nuovi della fase: tutti i campi hanno già una regola vera e il @Type sugli annidati"
  - "La riga tolta in gm-completion.service.int-spec.ts rispetto a PHASE_BASE è l'import di mongoose riscritto (piano 07): nessuna asserzione rimossa, D-25 rispettato"
metrics:
  duration: 26min
  completed: 2026-11-14
---

# Phase 22 Plan 17: Gate della fase Summary

Gate verde della Phase 22: tsc 0, unit 295/295 suite (3934 test), integration 153/153 suite (2323 test) in cinque blocchi `--runInBand`, boot reale verde, SDL solo additivo e identico a RESEARCH §Q9 più le quattro aggiunte di D-17, cinque soglie di coverage rispettate per cartella, lint pulito su 107 file, invarianti verdi, D-01..D-26 tutte coperte. Un rosso trovato e chiuso come deviazione (pin dei decoratori degli input).

## Basi

- `PHASE_BASE` = `ee221ab8eadb8af2f5b1b9837dea5003520c216a` (padre del primo commit su `src`/`test` dopo `724bc096`, cioè `982624e1`); `724bc096` antenato di HEAD.
- Base dello SDL = `c6079ca3` (antenato di HEAD).
- HEAD di partenza `4088f419`.

## 1. Type check

`npx tsc --noEmit -p tsconfig.json` esce 0 (anche dopo la correzione della spec).

## 2. Unit completo

Primo giro: 1 rosso, `src/validation/input-decorators.spec.ts` › «covers exactly the inputs of the generated schema (D-01)»: lo schema elenca sei input che il registro `VALIDATED_INPUTS` non conosceva (`MissionEnemyInput`, `MissionFightInput`, `MissionPrizeInput`, `MissionPrizeItemInput`, `SaveMissionDraftInput`, `SimulateMissionFightInput`, nati nei piani 13 e 15, che avevano lanciato solo le spec mirate). Corretto in `f1aa06ec` (vedi Deviazioni). Dopo: `npx jest --selectProjects unit` → 295/295 suite, 3934/3934 test, ≈ 10 s.

## 3. Integration completa (senza coverage, `--runInBand`, foreground)

| Blocco | Comando | Suite | Test | Tempo |
|--------|---------|-------|------|-------|
| outcomes | `npx jest src/quests/outcomes --selectProjects integration --runInBand` | 14 | 206 | 66 s |
| resto di quests (compresa guided) | `npx jest <30 percorsi di src/quests meno outcomes> --selectProjects integration --runInBand` | 30 | 518 | 166 s |
| characters | `npx jest src/characters --selectProjects integration --runInBand` | 26 | 413 | 88 s |
| travel | `npx jest src/travel --selectProjects integration --runInBand` | 12 | 250 | 66 s |
| resto (test/, auth, authz, shops, economy, mongo, …) | `npx jest <71 percorsi> --selectProjects integration --runInBand` | 71 | 936 | 175 s |
| **Totale** | | **153** | **2323** | |

Somma delle suite 153 = `npx jest --selectProjects integration --listTests` (153 percorsi, intestazione esclusa). Nessuna spec appesa (trappola 15-03 non scattata); `pgrep -fl 'bin/jest'` vuoto dopo ogni blocco.

## 4. Boot reale e SDL (D-17, D-25)

- `npx jest test/app.int-spec.ts --selectProjects integration --runInBand` → 101/101; `git diff --exit-code src/schema.gql` esce 0.
- `git diff c6079ca3 -- src/schema.gql`: 147 righe aggiunte, 0 tolte.
- Conteggi a 1: `type MissionDraft {`, `type MissionPrizeOptions {`, `input SaveMissionDraftInput {`, `guidedMissionInProgress: Boolean!`, `consumablesAvailable: [MissionItemUsage!]!`, `missionDraftStartedAt` (solo `PendingRequest`), `completePendingRequest(input: CompletePendingRequestInput!)`.
- Confronto a mano col blocco di §Q9: ogni tipo, input, enum e riga di `Query`/`Mutation` coincide carattere per carattere; in più solo le quattro aggiunte di D-17 (`CharacterStatus.guidedMissionInProgress`, e su `MissionFightOutcome` `consumablesAvailable`, `injuriesBefore`, `spellsAvailable`), ordinate come le emette Apollo. Nessuna differenza non prevista.

## 5. Coverage per cartella (ripiego di `test:cov`, soglie lette da `package.json`, uguali al piano)

Comando per cartella: `npx jest <cartella> --coverage --coverageThreshold='{}' --collectCoverageFrom='<glob>' --collectCoverageFrom='!src/**/*.spec.ts' --collectCoverageFrom='!src/**/*.int-spec.ts' --coverageReporters=json-summary --coverageReporters=text-summary --selectProjects unit integration --runInBand`, poi un confronto `node` di `coverage/coverage-summary.json` con le soglie (esce 0 per tutte).

| Ambito | Statements | Branches | Lines | Soglia (s/b/l) | Esito |
|--------|-----------|----------|-------|----------------|-------|
| `./src/economy/` | 100 | 94.25 | 100 | 98/91/98 | OK |
| `./src/characters/characters.service.ts` | 98.54 | 90.32 | 100 | 96/88/98 | OK |
| `./src/quests/acceptance/` | 99.11 | 92.83 | 99.75 | 97/91/98 | OK |
| `./src/travel/` | 98.75 | 86.94 | 99.38 | 97/84/98 | OK |
| `./src/quests/generation/` | 98.9 | 88.73 | 99.68 | 96/82/97 | OK |
| `src/quests/guided` (senza soglia) | 98.52 | 81.13 | 99.44 | — | riportato |
| `src/characters/mission-lock` (senza soglia) | 100 | 87.87 | 100 | — | riportato |
| `src/quests/outcomes` (senza soglia) | 97.29 | 87.59 | 98.99 | — | riportato |

Le misure per cartella sono un limite inferiore di quelle di `test:cov` (lì contano anche le spec di altre cartelle). `git diff $PHASE_BASE --stat -- package.json | wc -l` = 0. `npm run test:cov` resta all'orchestratore.

## 6. Lint mirato

`npx prettier --check` + `npx eslint` file per file sui 107 `.ts` aggiunti o modificati da `PHASE_BASE`: nessun `FAIL`.

## 7. Invarianti

| Invariante | Atteso | Ottenuto |
|------------|--------|----------|
| un solo predicato (D-12): file di produzione con `missionInProgressOf(` / `guidedMissionInProgressOf(` | resolver dello stato, reader, `mission-lock.ts` | esattamente i tre |
| `missionLock.assertFree(` in `characters.service.ts` | 6 | 6 |
| `missionLock.isLocked(` in `item-use.service.ts` | 1 | 1 |
| `missionLock.assertFree(` in `shop-transaction.service.ts` | 1 | 1 |
| `missionLock.assertFree(` in `travel.service.ts` | 2 | 2 |
| `missionLock.assertFree(` / `hasOpenDraft(` in `quest-acceptance.service.ts` | 3 / 1 | 3 / 1 |
| `missionLock` in `travel-admin.resolver.ts` (D-01) | 0 | 0 |
| handler dell'oste in `EXPECTED_INNKEEPER_HANDLERS` (D-26) | 19 | 19 |
| `@Roles(RoleType.innkeeper)` / `@AuditTarget(` nel resolver guidato | 8 / 5 | 8 / 5 |
| `@Field` nel modello della bozza / sopra il marcatore (D-10, D-18) | 0 / 0 | 0 / 0 |
| `this.chance` nella simulazione; `ChanceSource` nel completamento e in `chosen-rewards.ts` (D-04) | 0 / 0 | 0 / 0 |
| operatore di rimozione del campo in guided e mission-lock (D-23) | 0 | 0 |
| diff di publisher esistenti e segnaposto | 0 | 0 |
| righe tolte in `gm-completion.service.int-spec.ts` (D-25) | 0 | **1, falso positivo**: è la riga di import di mongoose riscritta in `import { type Model, Types }` dal piano 07 (`44cd0208`); nessuna asserzione tolta, la spec ha solo un caso D-25 in più |
| diff dell'archivio e della cancellazione (D-27) | 0 | 0 |
| migratori o file di contenuto; file aggiunti con nomi da migrazione o semina | 0 / 0 | 0 / 0 |
| `.env.example` e `src/config`; `process.env.` aggiunto | 0 / 0 | 0 / 0 |
| `Math.random` / `Date.now` aggiunti | 0 | 0 |
| `jest.mock(` aggiunti | 0 | 0 |
| trailer nei commit della fase; subject oltre 72 caratteri | 0 / 0 | 0 / 0 |
| file `.env` nel diff; URI Mongo in fase, quests, characters | 0 / 0 | 0 / 0 |
| operatori Mongo nei SUMMARY fuori da code span | nessuno | una riga di `22-15-SUMMARY.md` (frontmatter, decisione «un solo `$set` per salvataggio») corretta in `a8ee4ada`; le altre due (22-03, 22-09) già in code span |
| operatori nei titoli dei test nuovi | 0 | 0 |
| `dist/` nel diff | 0 | 0 |
| albero pulito, nessun jest residuo | vuoto | vuoto |

## 8. Copertura delle decisioni

Conteggio dei titoli `it`/`describe` aggiunti da `PHASE_BASE` che citano `D-NN` seguito da virgola o parentesi.

| Decisione | Casi | Spec d'esempio |
|-----------|------|----------------|
| D-01 | 2 | `src/quests/guided/guided-mission.resolver.int-spec.ts` |
| D-02 | 3 | `src/quests/guided/draft-invalidation.spec.ts` |
| D-03 | 7 | `src/quests/guided/guided-mission.resolver.int-spec.ts` |
| D-04 | 6 | `src/quests/guided/fight-state.spec.ts` |
| D-05 | 2 | `src/quests/guided/guided-completion.service.int-spec.ts` |
| D-06 | 6 | `src/quests/guided/fight-state.spec.ts` |
| D-07 | 15 | `src/quests/guided/chosen-rewards.spec.ts` |
| D-08 | 8 | `src/quests/guided/chosen-rewards.spec.ts` |
| D-09 | 6 | `src/quests/guided/guided-mission.resolver.int-spec.ts` |
| D-10 | 5 | `src/quests/guided/guided-mission.resolver.int-spec.ts` |
| D-11 | 13 | `src/characters/items/item-use.plan.spec.ts` |
| D-12 | 16 | `src/characters/items/item-use.plan.spec.ts` |
| D-13 | 4 | `src/quests/acceptance/quest-acceptance.service.int-spec.ts` |
| D-14 | 4 | `src/quests/guided/fight-state.spec.ts` |
| D-15 | 6 | `src/quests/guided/chosen-rewards.spec.ts` |
| D-16 | 9 | `src/characters/character-status.resolver.spec.ts` |
| D-17 | 15 | `src/quests/guided/fight-state.spec.ts` |
| D-18 | 12 | `src/characters/mission-lock/mission-lock.spec.ts` |
| D-19 | 9 | `src/quests/guided/guided-mission.resolver.int-spec.ts` |
| D-20 | 9 | `src/quests/guided/mission-simulation.service.int-spec.ts` |
| D-21 | 2 | `src/quests/guided/draft-invalidation.spec.ts` |
| D-22 | 12 | `src/quests/guided/guided-mission.resolver.int-spec.ts` |
| D-23 | 23 | `src/characters/items/item-use.plan.spec.ts` |
| D-24 | 21 | `src/quests/guided/draft-invalidation.spec.ts` |
| D-25 | 4 | `src/quests/guided/guided-completion.service.int-spec.ts` |
| D-26 | 5 | `src/quests/guided/guided-mission.resolver.int-spec.ts` |

D-27 fuori scope (nessun diff all'archivio, invariante sopra).

### Criteri della ROADMAP §Phase 22

1. Lista nemici: `guided-mission.resolver.int-spec.ts` «lists the ruins and city enemies of the mage band plus the legendaries (D-03, D-19)», «lists the whole bestiary with show all (D-03)», «refuses an adventurer (D-03)».
2. Due scontri in sequenza senza scritture: `mission-simulation.service.int-spec.ts` «starts the second fight from the corrected state of the first (D-02)», «simulates a fight without writing characters, quests or results (D-04)», «draws only from the simulation chance (D-04)».
3. Bozza ripresa e orfana: `mission-draft.service.int-spec.ts` «reads the draft from any pending quest of the group and null without one (D-09)», «drops an orphan draft whose pending quests are gone (D-09)»; `guided-mission.resolver.int-spec.ts` «starts, reads and discards a draft over the wire (D-09)».
4. Completamento in una transazione: `guided-completion.service.int-spec.ts` «writes the corrected state, the merged enemies, the knowledge and the chosen prizes in one transaction (D-07, D-08)», «refuses a prize no longer allowed without writing (D-07)», «completes a lost simulation as a gm completion with no aid (D-05)».
5. Blocco dall'avvio del flusso: `travel.service.int-spec.ts` «refuses to start a travel during a guided draft without writing (D-11)»; `quest-acceptance.service.int-spec.ts` «refuses a standard quest during a guided draft of a world mission (D-13)»; `mission-in-progress.int-spec.ts` «emits both flags when a guided draft starts and ends (D-23)»; sblocco: `mission-draft.service.int-spec.ts` «discards the draft and frees the participants (D-11)», `guided-completion.service.int-spec.ts` «deletes the draft and frees the participants (D-11, D-25)».
6. Hunt e boss: `character-mutations-lock.int-spec.ts` «refuses to change the equipment while the hunt waits on the marker (D-12)», «refuses to swap or use spells while the boss party has started (D-12)», «allows the same changes while travelling to the quest (D-12)»; `do-transaction.int-spec.ts` «refuses a purchase while the hunt waits on the city marker (D-12)»; pozioni: `item-use.plan.spec.ts` (D-11, D-12) e la int-spec di `useItem` del piano 03.
7. SDL al boot reale: `test/app.int-spec.ts` (101/101, casi `(D-17)`); handoff nel piano 18.

### Requisiti

- BE-GMFLOW-01 → criterio 1. BE-GMFLOW-02 → criterio 2. BE-GMFLOW-03 → criterio 3 e «never serves the draft to a player (D-10)».
- BE-GMFLOW-04 → `mission-draft-save.service.int-spec.ts` (correzioni validate come gli override, ferite di prima, D-06, D-14) e «saves a correction and a prize over the wire (D-06, D-07)».
- BE-GMFLOW-05 → `mission-prizes.spec.ts`, «serves the block and the filtered catalogue of a mage (D-07, D-22)», «serves no catalogue spell to a paladin (D-07)», premi rivalidati in `mission-draft-save.service.int-spec.ts`.
- BE-GMFLOW-06 → criterio 4 e «never draws from the shared chance (D-08)».
- BE-GMFLOW-07 → «audits the draft mutations and not the read (D-26)», gli `audits …` di ogni mutation, matrice di autorizzazione (19 handler), boot reale; handoff nel piano 18.
- BE-GMFLOW-08 → criterio 5. BE-GMFLOW-09 → criterio 6 e `mission-lock.reader.int-spec.ts` «locks a character whose standard mission has started (D-12)».

## Deviazioni dal piano

### Auto-fixed Issues

**1. [Rule 1 - Bug di test] Pin dei decoratori degli input rosso**
- **Trovato durante:** punto 2 (unit completo)
- **Problema:** `src/validation/input-decorators.spec.ts` confronta gli input dello schema generato con il registro `VALIDATED_INPUTS`; i sei input nuovi della fase (piani 13 e 15) non erano registrati, quindi il caso «covers exactly the inputs of the generated schema (D-01)» era rosso dal piano 13 (i piani lanciavano solo le spec mirate).
- **Correzione:** sei voci aggiunte al registro con l'import da `src/quests/guided/mission-draft.inputs`. Con le voci registrate, i casi `validates every schema field of …` e `declares @Type on every nested input of …` dei sei input sono verdi al primo colpo: nessun difetto di produzione, nessun file di `src` non di test toccato.
- **File:** `src/validation/input-decorators.spec.ts`
- **Commit:** `f1aa06ec`

**2. [Rule 1 - Documento] Operatore fuori da code span in `22-15-SUMMARY.md`**
- **Trovato durante:** punto 7 (operatori nei `.md`)
- **Correzione:** operatore racchiuso in backtick nella decisione del frontmatter.
- **Commit:** `a8ee4ada`

### Note

- Invariante D-25 su `gm-completion.service.int-spec.ts`: conteggio 1 invece di 0 per la riga di import riscritta (vedi tabella); nessuna correzione possibile né necessaria senza riscrivere la storia.
- Il ciclo del lint (107 file) è stato spostato in background dallo strumento dopo 180 s; nessun jest lanciato finché non è terminato (exit 0, nessun `FAIL`).

## Known Stubs

Nessuno.

## Restano all'orchestratore

`npm run test:cov`, la build vera, il riavvio reale del BE dal branch e la UAT su device.

## Self-Check: PASSED

- Commit `f1aa06ec` e `a8ee4ada` presenti; nessun file atteso dal piano; albero pulito dopo il commit di bookkeeping.
