---
phase: 19-revisione-dei-modelli
plan: 10
subsystem: travel
tags: [pet, compagno, xp, imboscata, report trattenuto, petXpGained, D-04, D-18, D-19]
requires: [19-08, 19-09]
provides:
  - "`AmbushPlanInput.petMaxXp` e premio del compagno in `planAmbushOutcome` (array intero di `assets.ownedPets` nella scrittura della vittoria)"
  - "`AmbushReportDraft.petXpGained` e `AmbushReportSnapshot.petXpGained` (`@Prop` solo Mongoose, default 0)"
  - "`AmbushResultDraft.petXpGained` (ripiego a 0 per i report trattenuti prima del deploy)"
affects: [19-23]
tech-stack:
  added: []
  patterns: [array intero dallo snapshot in sessione, campo additivo con default sul sotto-schema del report]
key-files:
  created: []
  modified:
    - src/travel/ambush/ambush-plan.ts
    - src/travel/ambush/ambush-results.ts
    - src/travel/ambush/ambush-resolution.service.ts
    - src/models/character/ambush-snapshot.model.ts
    - src/travel/ambush/ambush-plan.spec.ts
    - src/travel/ambush/ambush-results.spec.ts
    - src/models/character/active-travel.schema.spec.ts
    - src/travel/ambush/ambush-resolution.int-spec.ts
    - src/travel/ambush/ambush-lifecycle.int-spec.ts
decisions:
  - La quota si calcola sulla somma grezza degli `Enemy.xp` dell'imboscata (`input.enemies.xp`), non sul premio di grado che riceve il personaggio
  - Sulla sconfitta la primitiva riceve 0 xp dei nemici (un solo predicato, come in `planParticipant`)
metrics:
  completed: 2026-11-11
  tasks: 3
  files: 9
---

# Phase 19 Plan 10: Xp del compagno nell'imboscata vinta — Summary

Un'imboscata vinta dà al compagno equipaggiato `round(Σ Enemy.xp × 0,10)` col tetto `maxXp`, nella stessa scrittura della vittoria e come array intero di `assets.ownedPets`; il guadagno effettivo viaggia nel report trattenuto (`petXpGained`, `@Prop` con default 0) e arriva nel `QuestResult` `kind: ambush` creato all'arrivo. Una sconfitta non premia; un report trattenuto prima del deploy consegna 0. `AmbushReport` sullo SDL non cambia.

## Commit

| Task | Commit | Subject |
|------|--------|---------|
| 1 RED | `c14e4b4e` | `test(travel): pin the companion xp of a won ambush` |
| 1 GREEN | `715c1ed4` | `feat(travel): give the companion its share on a won ambush` |
| 2 | `4c1bc17b` | `test(travel): pin the ambush companion xp up to the arrival` |
| 3 | (questo e il successivo) | `docs(phase-19): summarize plan 10`, `docs(phase-19): record plan 10 progress` |

Nessun trailer in nessun commit (controllo a `0` dopo ognuno).

## Evidenza RED (Task 1)

`npx jest src/travel/ambush/ambush-plan.spec.ts src/travel/ambush/ambush-results.spec.ts src/models/character/active-travel.schema.spec.ts --selectProjects unit` → 3 suite rosse, 11 test rossi su 41:

- `ambush-plan.spec.ts` (7): i sei casi del blocco nuovo `the companion xp of an ambush` (premio non scritto, `report.petXpGained` indefinito; `petMaxXp` non è ancora una chiave dell'input) e il caso esistente `holds the report in the travel with the owner and no reached city (D-13)`, il cui `toEqual` sull'intero report ora attende `petXpGained: 0`.
- `ambush-results.spec.ts` (3): `maps a held report to an ambush quest result (D-13, D-14)` (chiave assente dal draft e dalla lista ordinata delle chiavi) e i due casi `(D-19)` (dal report al risultato; report vecchio a 0).
- `active-travel.schema.spec.ts` (1): `keeps the companion xp of a held report through the schema (D-19)` (la strict mode scarta il campo: `[undefined, undefined]` invece di `[30, 0]`).

Verdi al primo colpo nel RED: nessuno. Fra RED e GREEN `tsc` è rosso per i soli campi non ancora dichiarati.

## Cosa è cambiato

- **`ambush-plan.ts`:** `petMaxXp` nell'input; `FoughtOutcome.companion` = `companionXpAward(snapshot.assets, won ? input.enemies.xp : 0, input.petMaxXp)`; `commonSetOf` aggiunge `assets.ownedPets` solo quando il premio c'è (la chiave resta fuori dalla scrittura altrimenti, sconfitta compresa); `AmbushReportDraft.petXpGained?` e `reportOf` lo scrive sempre. Tolta l'intersezione `assets … & { pet?: unknown }` di `AmbushCharacterSnapshot`, ridondante da quando `OutcomeCharacterSnapshot.assets.pet` esiste (19-09).
- **Base della quota:** la somma grezza degli `Enemy.xp` (`input.enemies.xp`), non `ambushPrizesOf(...).xp` (che aggiunge il premio di grado). Pinnato dal caso `shares the raw enemies xp, not the rank prize of the character (D-04)`: nemici da 300 xp → personaggio +340, compagno +30.
- **`ambush-snapshot.model.ts`:** `@Prop({ type: Number, default: 0 }) petXpGained` con il commento che nomina la strict mode, come `loreUnlocked`.
- **`ambush-results.ts`:** `AmbushResultDraft.petXpGained` e `report.petXpGained ?? 0`.
- **`ambush-resolution.service.ts`:** `petMaxXp: catalog.petMaxXp` accanto a `spellMaxUsages`.
- **Helper di spec:** `inputWith` di `ambush-plan.spec.ts` riceve `petMaxXp: new Map()`; `snapshotWith` accetta un secondo argomento per gli assets. `buildAmbushReport` (`test/travel/ambush-report.fixture.ts`) non è stato toccato: senza override resta il «report vecchio» senza il campo.

## Task 2 — pin d'integrazione verdi al primo colpo

Tutti e tre i casi sono verdi alla prima esecuzione perché la regola è nel codice dal Task 1 (pin sul replica set, come previsto dal piano):

- `ambush-resolution.int-spec.ts` — `raises the equipped companion and holds its gain in the report on a won ambush (D-04, D-19)`: compagno equipaggiato (voce a 0, vita 7, tetto 100) accanto a un altro pet posseduto; a DB la voce del compagno sale a 1 con la stessa vita, l'altra voce è identica, l'ultimo report trattenuto porta `petXpGained` 1. `awards no companion xp on a lost ambush (D-04)` (nel `describe` `defeat`): voci invariate, report con 0.
- `ambush-lifecycle.int-spec.ts` — `delivers the companion xp of the ambush in the result created at arrival (D-19)`: **il caso dell'arrivo vive qui** (helper `startTravel` → `resolvePendingAmbush` → `arrive` già presenti); il `QuestResult` `kind: ambush` ha `petXpGained` uguale a quello del report trattenuto (1) e la voce del compagno resta a 1 dopo l'arrivo.

Nel mondo delle imboscate i nemici valgono 5–6 xp (fascia 4–7 del livello 1): la quota è 1. Nel caso della vittoria di `ambush-resolution.int-spec.ts` il lupo è portato a 7 xp (ancora in fascia) per stare lontano dal mezzo punto dell'arrotondamento (`5 × 0,10 = 0,5`).

## Esito delle prove

- `npx jest --selectProjects unit` → 268 suite, 3424 test verdi (prima del commit GREEN e a fine piano).
- Integration, in primo piano e in sequenza, nessun comando spostato in background:
  - `src/travel/ambush/ambush-resolution.int-spec.ts src/travel/ambush/ambush-lifecycle.int-spec.ts` → 2 suite, 45 test (17 s)
  - boot reale `test/app.int-spec.ts` → 88 test (4 s), `git diff --exit-code src/schema.gql` → 0
  - `src/travel src/shops src/economy src/cities src/lore src/models test/shops test/fixtures` → 29 suite, 406 test (**100 s**, tempo del blocco che contiene `src/travel`)
  - `src/quests` → 35 suite, 511 test (160 s)
  - `src/characters` → 23 suite, 378 test (75 s; in più rispetto al piano: il sotto-schema del report è parte del modello del personaggio)
  - Non rieseguito il resto del progetto integration (auth, migratore, push…): il piano non tocca quei moduli né lo SDL.
- `npx tsc --noEmit -p tsconfig.json` → 0 dopo il GREEN e dopo il Task 2. Prettier ed eslint sui file toccati, uno per uno: puliti. `pgrep -fl 'bin/jest'` vuoto a fine di ogni task.

## Criteri di accettazione

| Criterio | Esito |
|----------|-------|
| `companionXpAward(` in `ambush-plan.ts` | 1 |
| `petXpGained` in `ambush-snapshot.model.ts` = 1; in `ambush-results.ts` ≥ 2 | 1 e 2 |
| `D-19)` = 2 in `ambush-results.spec.ts`; `D-04)` ≥ 5 in `ambush-plan.spec.ts` | 2 e 6 |
| `petXpGained` nel blocco `type AmbushReport` dello SDL | 0 |
| `D-19)` ≥ 2 nei due int-spec (somma) | 2 |
| `petXpGained` ≥ 2 in `ambush-resolution.int-spec.ts` | 2 |

## Deviazioni dal piano

**1. [Regola 3 - Blocco] `src/models/character/active-travel.schema.spec.ts` fuori da `files_modified`**
- Il caso dello schema `keeps the companion xp of a held report through the schema (D-19)` vive nella spec esistente dello schema del viaggio (alternativa prevista dal `<behavior>`): lì ci sono già `heldReport()` e i casi dei report trattenuti. In `ambush-plan.spec.ts` avrebbe mescolato lo schema al piano puro.

**2. [Scelta dentro il contratto] forma di `FoughtOutcome.companion`**
- Lo skeleton aveva un ternario attorno a `companionXpAward` con il letterale `{ ownedPets: null, gained: 0 }`. Il codice passa alla primitiva `won ? input.enemies.xp : 0`: con 0 non premia e ritorna il suo `NO_AWARD`. Stesso comportamento (caso della sconfitta, unit e replica set), nessun letterale duplicato; è la forma già usata in `planParticipant` (19-09, deviazione 1).

**3. [Caso in più] base della quota**
- `shares the raw enemies xp, not the rank prize of the character (D-04)` pinna il ruling dell'orchestratore sulla base (somma grezza degli `Enemy.xp`, non il premio di grado).

**4. [Boy Scout] intersezione ridondante tolta**
- `assets?: OutcomeCharacterSnapshot['assets'] & { pet?: unknown }` in `AmbushCharacterSnapshot` (il campo è nel tipo base dal 19-09).

**5. [Ordine dei commit di chiusura e forma di STATE] come nei piani 01–09**
- SUMMARY in un commit suo prima del bookkeeping; `Plan: 10 of 23`.

Nessuna decisione architetturale (Regola 4).

## Note per i piani successivi

- **Chi costruisce un `AmbushPlanInput`** deve dare `petMaxXp` (obbligatorio): oggi solo `ambush-resolution.service.ts` e `inputWith` della spec.
- **Chi costruisce un `AmbushResultDraft` a mano** deve dare `petXpGained`; `AmbushReportDraft.petXpGained` è opzionale di proposito (report vecchi) e `buildAmbushReport` senza override non lo porta.
- **Fixture d'integrazione con compagno equipaggiato in viaggio:** un'imboscata vinta alza la voce del compagno (1 xp coi nemici del mondo delle imboscate): le attese su `assets.ownedPets` vanno scritte di conseguenza.
- **Piano del modello delle magie (D-07):** `commonSetOf` di `ambush-plan.ts` scrive ancora `assets.activeSpells`; il blocco del compagno è subito sotto e non dipende da quello.
- **Handoff FE (19-23):** il `QuestResult` d'imboscata porta `petXpGained` solo all'arrivo (D-19); `AmbushReport` sullo SDL è invariato; i report trattenuti prima del deploy consegnano 0.
- BE-MODEL-04 lato codice è completo; resta la parte di contenuto (`maxXp` dei 44 pet, D-25, orchestratore): nessuna spunta in REQUIREMENTS.

## Stub noti

Nessuno.

## Threat flags

Nessuna superficie nuova fuori dal threat model: T-19-38 (premio solo con la vittoria: caso della sconfitta, unit e replica set), T-19-39 (`@Prop` sul sotto-schema: caso dello schema e lettura grezza del report sul replica set), T-19-40 (ripiego a 0: caso del report vecchio), T-19-41 (SDL invariato: `git diff --exit-code`, grep nel blocco a 0, boot reale verde) mitigati.

## Self-Check: PASSED

- I commit `c14e4b4e`, `715c1ed4`, `4c1bc17b` sono in `git log`; i file modificati esistono; `git status --short` vuoto prima di questo documento.
