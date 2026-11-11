---
phase: 19-revisione-dei-modelli
plan: 09
subsystem: outcomes
tags: [pet, compagno, xp, esito, petXpGained, SDL, D-04, D-17, D-18]
requires: [19-08]
provides:
  - "`QuestResult.petXpGained: Int!` (Mongoose default 0, SDL additivo) e `QuestResultDraft.petXpGained`"
  - "`ParticipantPlanInput.petMaxXp` e premio del compagno in `planParticipant` (un solo valore finale di `assets.ownedPets`)"
  - "`OutcomeCharacterSnapshot.assets.pet` (compagno equipaggiato letto dallo snapshot in sessione)"
affects: [19-10, 19-23]
tech-stack:
  added: []
  patterns: [array intero dallo snapshot in sessione, campo additivo con default sullo schema]
key-files:
  created: []
  modified:
    - src/models/quest-result/quest-result.model.ts
    - src/quests/outcomes/outcome-plan.ts
    - src/quests/outcomes/unrewarded-plan.ts
    - src/quests/outcomes/rescue-plan.ts
    - src/quests/outcomes/combatant-plan.ts
    - src/quests/outcomes/gm-completion.service.ts
    - src/schema.gql
    - test/quests/quest-result.fixture.ts
    - test/app.int-spec.ts
decisions:
  - Il premio si calcola sugli xp dei nemici già azzerati dalla sconfitta (`enemiesXp`), lo stesso valore sommato agli xp del personaggio
  - Funzione privata `ownedPetsAfterOutcome` per l'unico valore finale dei posseduti (compagno premiato + pet vinto)
metrics:
  completed: 2026-11-11
  tasks: 3
  files: 18
---

# Phase 19 Plan 09: Xp del compagno negli esiti delle quest — Summary

A ogni vittoria che somma xp di nemici in `planParticipant` il compagno equipaggiato riceve `round(xp dei nemici × 0,10)` col tetto `maxXp`, nella stessa scrittura dell'esito e come valore unico di `assets.ownedPets` (insieme all'eventuale pet in premio); il `QuestResult` porta `petXpGained` (guadagno effettivo, 0 in ogni altro caso e sui risultati precedenti).

## Commit

| Task | Commit | Subject |
|------|--------|---------|
| 1 RED | `c4163585` | `test(outcomes): pin the companion xp in the outcome plan` |
| 1 GREEN | `4a7cfa43` | `feat(outcomes): give the equipped companion a share of the enemy xp` |
| 2 | `ac191bcc` | `test(outcomes): pin the companion xp on the replica set and wire` |
| 3 | (questo e il successivo) | `docs(phase-19): summarize plan 09`, `docs(phase-19): record plan 09 progress` |

Nessun trailer in nessun commit (controllo a `0` dopo ognuno).

## Evidenza RED (Task 1)

`npx jest src/models/quest-result src/quests/outcomes src/quests/results --selectProjects unit` → 6 suite rosse, 20 test rossi su 661:

- `quest-result.schema.spec.ts`: `defaults the companion xp gain to 0 (D-04)` (campo assente dal modello).
- `outcome-plan.spec.ts`: 12 rossi — `drafts the result sheet` (il `toEqual` sull'intero draft attende `petXpGained: 0`) e 11 casi del blocco `the xp of the equipped companion` (premio non scritto, `petXpGained` indefinito).
- `combatant-plan.spec.ts`: i due casi `(D-18)` del soccorso (vinto e perso).
- `guard-outcome.spec.ts`: `awards the companion on a won guard encounter with the merged enemies (D-18)` e il caso esistente della guardia sconfitta (ora attende `petXpGained: 0`).
- `rescue-plan.spec.ts` (`planRescued` e `deathResultOf`, foglio intero) e `crime-arrest.spec.ts` (arresto): `petXpGained: 0` assente.
- Boot reale `test/app.int-spec.ts`: 1 rosso su 88 (`writes the quest result contract into the generated schema`, riga assente dal blocco esatto).

**Verde al primo colpo nel RED:** `leaves the snapshot entries untouched (D-04)` — pin di non mutazione: senza codice nulla tocca la voce dello snapshot; resta come guardia sul GREEN.

## Cosa è cambiato

- **Modello:** `petXpGained` (`@Field(() => Int)`, `@Prop({ type: Number, default: 0 })`) accanto a `xpGained`.
- **`outcome-plan.ts`:** `petXpGained` nel draft; `petMaxXp` nell'input; `pet` nello snapshot degli assets; `enemiesXp` (0 se sconfitta) usato sia dagli xp del personaggio sia da `companionXpAward(snapshot.assets, enemiesXp, input.petMaxXp)`; `ownedPetsAfterOutcome` compone il valore finale (base = array premiato, altrimenti i posseduti dello snapshot; il pet vinto in coda; `null` = chiave fuori dalla scrittura).
- **Draft senza premio:** `petXpGained: 0` in `unrewarded-plan.ts` (arresto, guardia sconfitta), `rescue-plan.ts` (soccorso subito, morte) e nella fixture `buildQuestResult`.
- **Chiamanti di `planParticipant` aggiornati (elenco completo da `tsc`):** `combatant-plan.ts` (quest, party, dungeon, boss, soccorso vinto, scontro di guardia vinto tramite `planCombatant`) e `gm-completion.service.ts`. `encounterCatalogOf` porta già `petMaxXp` del catalogo della quest con lo spread: nessuna modifica a `guard-outcome.ts` né a `conclusion-plan.ts` (`UnrewardedPlanInput` non riceve il campo).
- **Helper di spec aggiornati:** `inputWith` di `outcome-plan.spec.ts` (`petMaxXp: new Map()`), `draftWith` di `quest-result.populate.spec.ts` (`petXpGained: 0`, indicato da `tsc`). `test/quests/unrewarded-plan-input.ts` non è stato toccato (non costruisce un `ParticipantPlanInput`).
- **SDL:** `git diff src/schema.gql` = la sola riga `  petXpGained: Int!` fra `outcome` e `quest` nel `type QuestResult`.

## Task 2 — pin d'integrazione verdi al primo colpo

Tutti i casi nuovi sono verdi alla prima esecuzione perché la regola è nel codice dal Task 1 (pin sul replica set e sul filo, come previsto dal piano):

- `quest-resolution.service.int-spec.ts`, nuovo `describe` `… with an equipped companion (replSet)` con harness a combattimento sceneggiato: quota del solo nemico con `xpPrize` 5000 (voce a 20, vita invariata, `petXpGained` 20), party da due con compagni diversi (quota piena a ognuno), quest vinta senza nemici (0, voce invariata), sconfitta (0, voce invariata).
- `gm-completion.service.int-spec.ts`: `awards the companion on a game master completion with enemies (D-18)`.
- `quest-pet-prize.int-spec.ts`: `stores the won pet and the companion xp in the same outcome (D-04)` (tre voci: altra invariata, compagno al tetto 35 con guadagno 5, pet nuovo in coda).
- `quest-result.resolver.int-spec.ts`: `petXpGained` sul filo (20) e risultato vecchio col campo tolto a DB (0, nessun errore).

**Attesa esistente aggiornata:** `stores the won pet as an entry next to the existing ones (D-03)` in `quest-pet-prize.int-spec.ts` ha un compagno equipaggiato e un nemico da 100 xp: con la regola nuova la voce passa da 30 a 40 (sarebbe stato rosso dopo il GREEN del Task 1; corretto nello stesso commit dei pin).

## Esito delle prove

- `npx jest --selectProjects unit` → 268 suite, 3415 test verdi (prima del commit GREEN).
- Integration, intero progetto a blocchi sequenziali, in primo piano, nessun comando spostato in background:
  - `src/characters test/app.int-spec.ts` → 24 suite, 466 test (79 s)
  - `src/travel src/shops src/economy src/cities src/lore src/models test/shops test/fixtures` → 29 suite, 403 test (102 s)
  - `src/quests` → 35 suite, 511 test (160 s)
  - il resto (`src/auth src/authz src/eventsub src/graphql src/http src/migrations src/mongo src/pendingQuests src/pointsOfInterest src/push src/rest src/roads src/throttling src/time src/users src/validation test/auth test/authz test/harness test/quests`) → 54 suite, 590 test (108 s)
  - **Totale: 142 suite, 1970 test verdi.** Boot reale: 88 test.
- `npx tsc --noEmit -p tsconfig.json` → 0 dopo il GREEN e dopo il Task 2 (rosso fra RED e GREEN per i soli campi non ancora dichiarati). `git diff --exit-code src/schema.gql` → 0 dopo il commit. Prettier ed eslint sui file toccati, uno per uno: puliti (resta il solo warning preesistente di `test/app.int-spec.ts`). `pgrep -fl 'bin/jest'` vuoto a fine di ogni task.

## Criteri di accettazione

| Criterio | Esito |
|----------|-------|
| `companionXpAward(` in `outcome-plan.ts` | 1 |
| `'assets.ownedPets'` in `outcome-plan.ts` | 1 |
| filtri d'array o path posizionali in `outcome-plan.ts` | 0 |
| `petXpGained: Int!` nel blocco `type QuestResult` dello SDL | 1 |
| `D-04)` ≥ 7, `D-17)` ≥ 2, `D-18)` ≥ 1 in `outcome-plan.spec.ts` | 9, 2, 1 |
| `D-18)` ≥ 1 in `combatant-plan.spec.ts` e `guard-outcome.spec.ts` | 2 e 1 |
| nessun cambio sotto `src/quests/outcomes/combat` e `src/travel` | 0 righe |
| `D-04)` ≥ 3 in `quest-resolution.service.int-spec.ts`; `D-18)` ≥ 1 in `gm-completion.service.int-spec.ts` | 4 e 1 |
| `petXpGained` ≥ 3 in `quest-result.resolver.int-spec.ts` | 5 |

## Deviazioni dal piano

**1. [Scelta dentro il contratto] forma del blocco in `planParticipant`**
- Lo skeleton dell'`<interfaces>` aveva un ternario su `won` attorno a `companionXpAward`. Il codice passa `enemiesXp` (già 0 senza vittoria) alla primitiva, che con 0 non premia: un solo predicato per xp del personaggio e xp del compagno (T-19-33), e la composizione dei posseduti in una funzione nominata. Stesso comportamento, pinnato dai casi sconfitta / senza nemici.

**2. [Regola 3 - Blocco] `pet?: unknown` in `OutcomeCharacterSnapshot.assets`**
- Il compagno equipaggiato non era nel tipo dello snapshot (la proiezione `assets: 1` lo carica già): aggiunto per leggerlo senza cast.

**3. [Regola 3 - Blocco] file fuori da `files_modified`**
- `src/quests/outcomes/rescue-plan.spec.ts`, `src/quests/outcomes/crime/crime-arrest.spec.ts` (il `0` di soccorso subito, morte e arresto pinnato nel RED) e `src/quests/results/quest-result.populate.spec.ts` (costruttore del draft indicato da `tsc`).

**4. [Collocazione dei casi] `guard-outcome.spec.ts` e `outcome-plan.spec.ts`**
- I casi `writes the companion xp and the won pet as a single list (D-04)` e `never changes the life points of the companion (D-04)` sono in `outcome-plan.spec.ts` (provano `planParticipant`, e il conteggio `D-04)` ≥ 7 è di quel file); `guard-outcome.spec.ts` tiene il caso `(D-18)` dello scontro vinto, provato con `encounterCatalogOf` + `planCombatant` nella forma di `planGuardEncounter` (funzione privata di `conclusion-plan.ts`). Il caso «leaves the owned pets out…» è spezzato in tre titoli (senza compagno, già al tetto, senza nemici).

**5. [Casi in più]**
- `awards no companion xp to a rescuer who lost the fight (D-18)` (unit), `leaves the snapshot entries untouched (D-04)` (unit), `awards no companion xp on a lost fight (D-04)` (replica set).

**6. [Harness] secondo `describe` in `quest-resolution.service.int-spec.ts`**
- L'harness esistente del file non sostituisce il combattimento: i casi con nemici vivono in un `describe` loro con `ScriptedCombatResolver` (verdetto deciso dal test, indipendente dal motore).

**7. [Ordine dei commit di chiusura e forma di STATE] come nei piani 01–08**
- SUMMARY in un commit suo prima del bookkeeping; `Plan: 9 of 23`: il `grep -q "Plan: 09 of 23"` del piano non trova la riga, è atteso.

Nessuna decisione architetturale (Regola 4).

## Note per i piani successivi

- **19-10 (imboscata):** `AmbushResultDraft` e `planAmbushOutcome` non sono stati toccati; i risultati d'imboscata prendono oggi il default 0 dello schema. `companionXpAward` va chiamata con gli xp dei nemici dell'imboscata vinta e `catalog.petMaxXp` (`ambush-resolution.service.ts:456`); il valore entra in `commonSetOf` come array intero e nel report trattenuto (D-19). `OutcomeCharacterSnapshot.assets.pet` esiste già.
- **Chi costruisce un `QuestResultDraft` a mano** deve dare `petXpGained` (campo obbligatorio del draft): `tsc` lo segnala.
- **Chi costruisce un `ParticipantPlanInput`** deve dare `petMaxXp` (obbligatorio): oggi solo `combatant-plan.ts` e `gm-completion.service.ts`.
- **Fixture d'integrazione con compagno equipaggiato e nemici:** la voce del compagno sale del 10 % degli xp dei nemici (tetto `maxXp`, 100 in `buildPet`): le attese sulle voci di `ownedPets` vanno scritte di conseguenza.
- **Handoff FE (piano di chiusura):** `QuestResult.petXpGained: Int!` è sullo SDL; un risultato salvato prima del campo risponde 0.
- BE-MODEL-04 resta aperto (imboscata in 19-10, contenuto a DB): nessuna spunta in REQUIREMENTS.

## Stub noti

Nessuno.

## Threat flags

Nessuna superficie nuova fuori dal threat model: T-19-33 (premio solo con vittoria e sui soli xp dei nemici: casi sconfitta, senza nemici, `xpPrize` escluso), T-19-34 (un solo valore di `assets.ownedPets`, grep di assenza a 0, caso sul replica set col pet in premio), T-19-35 (default 0 e caso del risultato vecchio sul filo), T-19-37 (blocco esatto nel boot reale) mitigati; T-19-36 accettato (filtro e transazione invariati).

## Self-Check: PASSED

- I commit `c4163585`, `4a7cfa43`, `ac191bcc` sono in `git log`; i file modificati esistono; `git status --short` vuoto prima di questo documento.
