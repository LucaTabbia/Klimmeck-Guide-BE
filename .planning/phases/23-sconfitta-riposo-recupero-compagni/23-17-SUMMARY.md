---
phase: 23-sconfitta-riposo-recupero-compagni
plan: 17
subsystem: gate
tags: [gate, sdl, coverage, invariants]
requires: ["23-16"]
provides:
  - "fase verde e misurata: tsc, unit completa, integration completa a blocchi, boot reale, SDL additivo, coverage per cartella, lint mirato, invarianti, copertura delle decisioni"
affects: [plan 23-18, PR verso develop]
tech-stack:
  added: []
  patterns: []
key-files:
  created: []
  modified:
    - src/characters/characters.service.spec.ts
decisions:
  - "Coverage dei rami di `characters.service.ts` sotto soglia (86.84 < 88): coperti con due casi unitari i due rami nuovi della fase (`renamePet` con pet id malformato, scrittura guardata sullo slot che non combacia); i due rami di metadata dei decoratori del costruttore restano scoperti (irraggiungibili); soglie mai toccate"
  - "Falso positivo del controllo dei trailer sul corpo di d13697bc («SDL regenerated with ambush»): annotato, storia non riscritta"
metrics:
  duration: "~40 min"
  completed: 2026-11-14
---

# Phase 23 Plan 17: Gate della fase Summary

Gate verde: `tsc` 0, unit 304/4 193, integration 160 suite / 2 442 test in cinque blocchi `--runInBand`, boot reale e matrice 233/233, SDL additivo con la sola riga di `useItem` sostituita, tre soglie di coverage rispettate (una riportata sopra soglia con due casi unitari nuovi), invarianti e decisioni coperte.

## Basi

- `PHASE_BASE` = `5874efe661bf652136ad91bc19b13c1d47ec3726` (padre del primo commit su `src`/`test` dopo `1b13b9a2`; `git merge-base --is-ancestor 1b13b9a2 HEAD` esce 0).
- Base dello SDL `2c462cbe` (`git merge-base --is-ancestor 2c462cbe HEAD` esce 0).
- HEAD di partenza `d54045cf`.

## 1. Type check

`npx tsc --noEmit -p tsconfig.json` esce 0 (anche dopo il commit di test).

## 2. Unit completo

`npx jest --selectProjects unit`: 304 suite / 4 193 test verdi (≈ 10 s). Baseline prima della fase 296 / 3 944 (+8 suite, +249 test); dopo il commit di test 4 195.

## 3. Integration completa senza coverage

`npx jest --selectProjects integration --listTests` = 160 file. Ogni blocco in foreground, `--runInBand`, `pgrep -fl 'bin/jest'` vuoto dopo ciascuno, nessun `--forceExit`, nessuna spec appesa.

| Blocco | Comando (percorsi prima di `--selectProjects integration --runInBand`) | Suite | Test | Tempo |
|--------|------------------------------------------------------------------------|-------|------|-------|
| 1 | `src/quests/outcomes` | 16 | 222 | 67 s |
| 2 | i 30 file di `src/quests` fuori da `src/quests/outcomes` (da `--listTests`) | 30 | 537 | 164 s |
| 3 | `src/characters` | 30 | 472 | 96 s |
| 4 | `src/travel` | 13 | 271 | 74 s |
| 5 | i 71 file restanti (`test/app.int-spec.ts`, `test/quests`, `test/auth`, `test/authz`, `test/shops`, `src/shops`, `src/economy`, `src/mongo`, `src/auth`, …) | 71 | 940 | 165 s |
| Totale | | 160 | 2 442 | |

Somma delle suite = 160 = conteggio di `--listTests`. Baseline 22: 153 suite / 2 327 test.

## 4. Boot reale e SDL

- `npx jest test/app.int-spec.ts test/authz/authorization-matrix.int-spec.ts --selectProjects integration --runInBand`: 2 suite / 233 test verdi (10 s).
- `git diff --exit-code src/schema.gql` esce 0.
- `git diff 2c462cbe -- src/schema.gql | grep -E '^-[^-]'` stampa solo `-  useItem(itemId: ID!): UseItemResult!`.
- Righe attese, tutte al conteggio indicato: `type CompanionOutcome` 1, `type MissionCompanion` 1, `input RenamePetRequest` 1, riga `renamePet` 1, riga `useItem(itemId: ID!, petId: ID)` 1, `defeated: Boolean!` 2 (in `OwnedPet` 1), `recoveryTime: Int` 1, `AmbushReport.onFoot` 1, `QuestResult.companion` 1, `MissionFightOutcome.companion` 1, `PushEventType` `ambush`/`petRecovered`/`ambushDefeat` 1/1/1, `lifeBefore: Int!` 2, `OwnedPet.level` 1, `OwnedPet.maxLifePoints` 1, `Pet.maxLifePoints` 1, `companionLifeAfter: Int` 2 (in `ParticipantOverrideInput` 1).
- `defeatedUntil` 0; `mount` (parola) 0; `kind` 1 = 1 della base.
- Confronto a mano con RESEARCH §Q12: blocchi `OwnedPet`, `CompanionOutcome`, `MissionCompanion`, `RenamePetRequest`, `AmbushReport`, `MissionFightEffects`, `MissionFightOutcome`, `ParticipantOverrideInput`, `Pet`, `PushEventType`, `QuestResult`, `Mutation` coincidono con §Q12 più `CompanionOutcome.lifeBefore`, `AmbushReport.onFoot` e i due campi di D-37/D-38 su `OwnedPet` (`level: Int!`, `maxLifePoints: Int!`) previsti dall'interfaccia del piano. Nessun'altra riga aggiunta.

## 5. Coverage per cartella

Comando: `npx jest <percorso> --coverage --coverageThreshold='{}' --collectCoverageFrom='<glob>' --collectCoverageFrom='!src/**/*.spec.ts' --collectCoverageFrom='!src/**/*.int-spec.ts' --coverageReporters=json-summary --coverageReporters=text-summary --selectProjects unit integration --runInBand`, poi `node -e` sul `coverage/coverage-summary.json` contro le soglie lette da `package.json` (uguali al piano).

| Ambito | Statements | Branches | Lines | Soglia (s/b/l) | Esito |
|--------|-----------:|---------:|------:|----------------|-------|
| `./src/economy/` | 100 | 94.25 | 100 | 98/91/98 | OK |
| `./src/characters/characters.service.ts` (prima) | 97.59 | 86.84 | 100 | 96/88/98 | SOTTO (branches) |
| `./src/characters/characters.service.ts` (dopo 0f04e943) | 98.79 | 89.47 | 100 | 96/88/98 | OK |
| `./src/travel/` | 98.83 | 87.91 | 99.42 | 97/84/98 | OK |
| `src/characters/pets` (senza soglia) | 99.22 | 91.9 | 99.7 | — | — |
| `src/characters/items` (senza soglia) | 99.54 | 85.82 | 100 | — | — |
| `src/quests/outcomes` (senza soglia) | 97.32 | 88.11 | 98.99 | — | — |
| `src/quests/guided` (senza soglia) | 98.6 | 81.41 | 99.38 | — | — |

Rami scoperti di `characters.service.ts` prima del fix (reporter `json`, anche con `test/authz`): due nuovi della fase raggiungibili — `if (!petId)` di `renamePet` (pet id malformato: il filo lo rifiuta prima con `IsObjectIdHex`, il servizio lo difende comunque) e `if (written.matchedCount === 0)` di `writePetSlot`; due nuovi di metadata dei decoratori del costruttore (`Pet` model, `Connection`), irraggiungibili come quelli preesistenti; due `if` preesistenti (`unequipSpell`, `useSpell`). Fix in `characters.service.spec.ts` (describe `companion`): due casi con `D-21` e `D-04` nel titolo, mock `mockPetModel.find` e mock `Once` (nessuna perdita fra i casi). Prova di sensibilità: `=== 0` → `=== 99` nel servizio fa fallire il secondo caso; servizio ripristinato byte per byte (diff vuoto). Le misure per cartella sono un limite inferiore di `test:cov`.

`git diff $PHASE_BASE --stat -- package.json | wc -l` = 0. `npm run test:cov` resta all'orchestratore.

## 6. Lint mirato

`for f in $(git diff --name-only --diff-filter=AM $PHASE_BASE -- '*.ts'); do npx prettier --check "$f" && npx eslint "$f" || echo "FAIL $f"; done` sui 144 file `.ts` aggiunti o modificati dalla fase (compreso lo spec del fix): nessun `FAIL`.

## 7. Invarianti

| Invariante | Atteso | Esito |
|------------|--------|-------|
| `export function (companionLifeAt\|companionLifeNow\|isPetDefeated)` | solo `companion-life.ts` | solo `companion-life.ts` |
| altri lettori di `defeatedUntil` fuori dai file ammessi | nessuno | nessuno |
| `export function` dei livelli | solo `companion-level.ts` | solo `companion-level.ts` |
| `level: 1` in `owned-pet-entry.ts` / `companionLevelFromXp(` in `companion-after-fight.ts` | ≥ 1 / ≥ 1 | 1 / 1 |
| letture della base `maxLifePoints` nei moduli del compagno | solo base passata a `companionMaxLifeOf`/`companionLevelOf` o ripiego | una riga: `owned-pet.resolver.ts:54` `ownedPetCountOf(pet?.maxLifePoints)`, ripiego dopo `companionMaxLifeOf(...) ??` (ammesso) |
| `maxLifePoints` in `owned-pet.model.ts` | 0 | 0 |
| `export function (companionStoredLifeOf\|isLegacyCompanionEntry)` | solo `companion-life.ts` | solo `companion-life.ts` |
| chiamanti di `companionStoredLifeOf(` | mapper, resolver, equip-pet.plan, combat-context, companion-after-fight, item-use.plan, fight-state, gm-overrides, servizio della rinomina | tutti tranne `fight-state.ts` e `characters.service.ts`: annotato sotto |
| `owned-pet-entry` in `companion-level.ts` | 0 | 0 |
| chiamanti di `companionAfterFight(` | outcome-plan, unrewarded-plan, ambush-plan (+ definizione) | esattamente quelli |
| `companion-xp.ts` | assente | assente |
| `ambushDefeat(` fuori dagli spec / valore dell'enum | 0 / 1 | 0 / 1 |
| `modifiedCount === 1` nel servizio / `PetRecoverySweeper` in `outcome-world.ts` | ≥ 1 / ≥ 1 | 1 / 2 |
| `PET_POTION_RECOVERING` in `format-domain-error.ts` | ≥ 1 | 1 |
| `'CharactersResolver.renamePet'` / `missionLock` in `renamePet` / `missionLock.assertFree(` | 2 / 0 / 6 | 2 / 0 / 6 |
| tiri nuovi nei segnaposto e in `ambush-on-foot.ts` | 0 | 0 |
| `defeatedUntil` nello SDL / `@Field` in `mission-draft.model.ts` | 0 / 0 | 0 / 0 |
| migratori o contenuti | 0 / 0 | 0 / 0 |
| ambiente (`.env.example`, `src/config`, `process.env.` aggiunti) | 0 / 0 | 0 / 0 |
| `Math.random`/`Date.now`, `jest.mock(`, `setTimeout(` aggiunti | 0 / 0 / 0 | 0 / 0 / 0 |
| trailer / subject > 72 | 0 / 0 | 1 / 0: falso positivo noto, sotto |
| `.env` nel diff / URI Mongo | 0 / 0 | 0 / 0 |
| operatori Mongo nei SUMMARY fuori da code span / nei titoli dei test nuovi | 0 / 0 | 0 / 0 (controllo con code span tolti via script) |
| `dist/` nel diff | 0 | 0 |
| albero pulito, `pgrep` vuoto | sì | sì |

Annotazioni:
- **Chiamanti di `companionStoredLifeOf(`.** `fight-state.ts` non lo chiama più direttamente dal piano 16: `fightCompanionOf` prende `lifeBefore` dai limiti di `overrideParticipantOf(state, petCatalog)` in `gm-overrides.ts`, che lo chiama (una sola regola dei limiti). La rinomina in `characters.service.ts` passa da `planRenamePet` → `renamedEntry` in `equip-pet.plan.ts`, che lo chiama. La regola unica della voce legacy vale per entrambi, per via indiretta.
- **Trailer.** L'unica occorrenza è il corpo di `d13697bc` («temporary ambushDefeat builder removed, SDL regenerated with ambush»): nessun trailer reale; storia non riscritta.

## 8. Copertura delle decisioni

Conteggio dei titoli `it`/`describe` aggiunti dalla fase (`git diff $PHASE_BASE -- src test`) che portano `D-NN` seguito da `,` o `)`:

| D-NN | Casi | Spec d'esempio |
|------|-----:|----------------|
| D-01 | 1 | `src/characters/pets/pet-recovery-catalog.reporter.spec.ts` |
| D-02 | 9 | `src/characters/pets/companion-life.spec.ts` |
| D-03 | 22 | `src/characters/pets/companion-life.spec.ts` |
| D-04 | 21 | `src/characters/characters.service.spec.ts` |
| D-05 | 9 | `src/characters/items/item-use.plan.spec.ts` |
| D-06 | 3 | `src/characters/items/item-use.plan.spec.ts` |
| D-07 | 5 | `src/characters/items/item-use.plan.spec.ts` |
| D-10 | 9 | `src/models/quest-result/quest-result.schema.spec.ts` |
| D-11 | 9 | `src/characters/pets/pet-recovery.int-spec.ts` |
| D-12 | 10 | `src/quests/guided/fight-state.spec.ts` |
| D-13 | 15 | `src/models/quest-result/quest-result.schema.spec.ts` |
| D-14 | 10 | `src/travel/ambush/ambush-lifecycle.int-spec.ts` |
| D-15 | 5 | `src/characters/characters.service.spec.ts` |
| D-16 | 9 | `src/travel/ambush/ambush-on-foot.int-spec.ts` |
| D-17 | 17 | `src/quests/guided/fight-state.spec.ts` |
| D-18 | 4 | `src/characters/pets/owned-pet-entry.spec.ts` |
| D-19 | 5 | `src/characters/pets/equip-pet.plan.spec.ts` |
| D-20 | 10 | `src/characters/pets/companion-life.spec.ts` |
| D-21 | 2 | `src/characters/characters.service.spec.ts` |
| D-23 | 39 | `src/characters/items/item-use.plan.spec.ts` |
| D-24 | 22 | `src/characters/pets/companion-life.spec.ts` |
| D-25 | 8 | `src/characters/pets/companion-life.spec.ts` |
| D-26 | 24 | `src/quests/guided/fight-state.spec.ts` |
| D-27 | 10 | `src/models/quest-result/quest-result.schema.spec.ts` |
| D-28 | 13 | `src/models/quest-result/quest-result.schema.spec.ts` |
| D-29 | 17 | `src/models/character/active-travel.schema.spec.ts` |
| D-30 | 5 | `src/push/push-events.spec.ts` |
| D-31 | 10 | `src/characters/pets/equip-pet.plan.spec.ts` |
| D-32 | 11 | `src/characters/items/item-use.plan.spec.ts` |
| D-33 | 6 | `src/quests/guided/fight-state.spec.ts` |
| D-37 | 8 | `src/characters/pets/companion-level.spec.ts` |
| D-38 | 23 | `src/characters/items/item-use.plan.spec.ts` |
| D-39 | 13 | `src/characters/pets/companion-level.spec.ts` |

D-08, D-09, D-22, D-34, D-35 solo FE. Nessuna decisione senza caso.

Requisiti e prove (dalla VALIDATION e dai SUMMARY 01..16):

| Requisito | Prova |
|-----------|-------|
| BE-PET-01 | `companion-life.spec.ts`, `owned-pet-fields.int-spec.ts` |
| BE-PET-02 | `pet-recovery-catalog.reporter.spec.ts`, `owned-pet-state.int-spec.ts`, `pet.schema.spec.ts` |
| BE-PET-03 | `equip-pet.plan.spec.ts`, `equip-pet.int-spec.ts` |
| BE-PET-04 | `placeholder-combat-resolver.spec.ts`, `placeholder-dungeon-resolver.spec.ts`, `guard-outcome.spec.ts`, `companion-defeat.int-spec.ts` |
| BE-PET-05 | `companion-after-fight.spec.ts`, `outcome-plan.spec.ts`, `companion-defeat.int-spec.ts`, `companion-defeat-rescue.int-spec.ts` |
| BE-PET-06 | `item-use.plan.spec.ts` (pet potion plan), `use-item.int-spec.ts` (on a companion) |
| BE-PET-07 | `pet-name.spec.ts`, `rename-pet.int-spec.ts`, matrice authz |
| BE-PET-08 | `pet-recovery.spec.ts`, `pet-recovery.sweeper.spec.ts`, `pet-recovery.int-spec.ts` |
| BE-PET-09 | `ambush-plan.spec.ts`, `ambush-push.spec.ts`, `ambush-resolution.int-spec.ts`, `ambush-lifecycle.int-spec.ts` |
| BE-PET-10 | `travel-timing.spec.ts`, `travel-planning.int-spec.ts`, `ambush-on-foot.spec.ts`, `ambush-on-foot.int-spec.ts` |
| BE-PET-11 | `ambush-plan.spec.ts` (hunger redirection), `ambush-on-foot.int-spec.ts` (the hunger redirection) |
| BE-PET-12 | `fight-state.spec.ts`, `mission-simulation.service.int-spec.ts`, `gm-overrides.spec.ts`, `guided-completion.service.int-spec.ts` |
| BE-PET-13 | questo gate (handoff nel piano 18) |
| BE-PET-14 | `companion-level.spec.ts`, `owned-pet-entry.spec.ts`, `owned-pet-state.int-spec.ts` |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Coverage sotto soglia] Rami di `characters.service.ts`**
- **Trovato durante:** punto 5
- **Problema:** branches 86.84 < 88 di `package.json`
- **Fix:** due casi unitari sui rami nuovi della fase (D-21, D-04), nessuna soglia toccata
- **File:** `src/characters/characters.service.spec.ts`
- **Commit:** `0f04e943`

Annotazioni senza correzione: falso positivo dei trailer su `d13697bc`; chiamanti indiretti di `companionStoredLifeOf` (sopra); il grep di bookkeeping `Plan: 0K of 18` delle VALIDATION dei piani precedenti non combacia col formato senza zero (atteso).

## Restano all'orchestratore

`npm run test:cov`, la semina della tabella dei tempi di recupero, il riavvio reale del BE dal branch, la UAT su device.

## Self-Check: PASSED
