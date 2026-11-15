---
phase: 23-sconfitta-riposo-recupero-compagni
plan: 05
subsystem: quests
tags: [quests, pets, outcomes, quest-result, sdl]
requires: ["23-04"]
provides:
  - "companionAfterFight: una regola sola per vita, sconfitta, riposo, xp e livello del compagno dopo uno scontro"
  - "planParticipant e planUnrewarded scrivono il compagno (Pitfall 8), lo sconfitto esce dallo slot con guardia sullo slot letto"
  - "catalogo dei pet degli esiti con name e recoveryTime"
  - "QuestResult.companion: CompanionOutcome a DB e sul filo"
affects: ["23-06", "23-10", "23-15", "23-16", "23-17"]
tech-stack:
  added: []
  patterns: ["helper companionSlotSet/companionSlotFilter condivisi dai due piani d'esito", "voce del compagno scritta solo se cambia (o se sconfitto)"]
key-files:
  created:
    - src/quests/outcomes/pets/companion-after-fight.ts
    - src/quests/outcomes/pets/companion-after-fight.spec.ts
    - src/models/quest-result/companion-outcome.model.ts
  modified:
    - src/quests/outcomes/pets/companion-xp.ts
    - src/quests/outcomes/outcome-plan.ts
    - src/quests/outcomes/unrewarded-plan.ts
    - src/quests/outcomes/combat/combat-context.ts
    - src/quests/outcomes/resolution-loader.service.ts
    - src/quests/outcomes/combatant-plan.ts
    - src/quests/outcomes/conclusion/conclusion-plan.ts
    - src/quests/outcomes/gm-completion.service.ts
    - src/quests/guided/guided-completion.service.ts
    - src/models/quest-result/quest-result.model.ts
    - test/quests/quest-result.fixture.ts
    - test/quests/unrewarded-plan-input.ts
    - test/app.int-spec.ts
    - src/schema.gql
decisions:
  - "ownedPets del compagno che ha combattuto: scritto se la voce cambia (vita, xp, livello, ancora, data di sconfitta) o se è sconfitto; illeso, non legacy e senza xp → null (concilia D-27 «ownedPets null se l'xp non cambia» con D-23/D-38 «voce legacy scritta al primo scontro»)"
  - "La voce del compagno che ha combattuto e resta nello slot perde un eventuale lifeAsOf residuo; lo sconfitto riceve lifeAsOf = istante e defeatedUntil (chiave tolta se recoveryTime non curato)"
  - "Tetto di xp per il livello: quello del catalogo (petCatalog.maxXp), altrimenti quello della mappa petMaxXp"
  - "QuestResultDraft.companion sempre valorizzato (outcome o null) dai due piani d'esito; opzionale per gli altri draft (rescue, imboscata)"
  - "CompanionAssets spostato in companion-after-fight.ts; companion-xp.ts lo importa (resta per l'imboscata fino al piano 10)"
metrics:
  duration: "~16 min"
  completed: 2026-11-14
---

# Phase 23 Plan 05: esiti del compagno Summary

`companionAfterFight` (puro) decide il compagno dopo ogni scontro: vita al massimo del livello di partenza clampata a `[1, max]`, sconfitto ⇔ vita 1 a fine scontro, poi xp e livello nuovo, massimo riletto dopo. `planParticipant` e `planUnrewarded` lo usano entrambi: lo sconfitto esce dallo slot (`'assets.pet': null`) con la guardia `'assets.pet': { $in: idForms(slot letto) }` nel filtro (T-23-13), e la sua voce riceve `lifeAsOf` e `defeatedUntil`. Il foglio dell'esito porta `QuestResult.companion: CompanionOutcome`, a DB (sotto-schema `_id: false`, default null) e sul filo.

## Task e commit

| Task | Nome | Commit |
|------|------|--------|
| 1 RED | spec di `companionAfterFight` (19 casi) | 9419c026 |
| 1 GREEN | `companion-after-fight.ts`, `CompanionAssets` spostato | c16d22e2 |
| 2 RED | casi nei piani d'esito + attese col `level` | d5cbeec1 |
| 2 GREEN | piani d'esito, catalogo e chiamanti collegati | c324bb28 |
| 3 RED | pin SDL in `test/app.int-spec.ts` + caso dello schema | 3fa91d98 |
| 3 GREEN | `CompanionOutcome`, `QuestResult.companion`, SDL rigenerato | 48a0cf03 |

## Fallimenti RED attesi

- Task 1: modulo `companion-after-fight` assente (`Cannot find module`).
- Task 2: 13 casi rossi in `outcome-plan.spec`, `unrewarded-plan.spec`, `combatant-plan.spec` (voce senza `level`, `result.companion` assente, slot non svuotato); le int-spec aggiornate sarebbero rosse sullo stesso motivo.
- Task 3: `quest result schema › stores the companion outcome…` (campo assente) e `AppModule › writes the quest result contract into the generated schema` (blocchi SDL).

## Chiamanti aggiornati

`combatant-plan.ts` (`planParticipant` e `planDefeatWithoutAid` ricevono `petCatalog: catalog.pets`), `conclusion/conclusion-plan.ts` (`unrewardedInputOf` copia `input.catalog.pets`: arresto e guardia persa), `gm-completion.service.ts` (`GmCommitPlan.petCatalog`, da `catalog.pets`), `guided-completion.service.ts` (da `combat.pets`). `defeat-without-aid.ts`, `crime/crime-arrest.ts`, `guard/guard-outcome.ts` non hanno avuto bisogno di modifiche: passano l'input intero a `planUnrewarded`.

## Chiavi pinnate aggiornate

- `test/app.int-spec.ts`: blocco `type QuestResult` con `companion: CompanionOutcome`; blocco nuovo `type CompanionOutcome`.
- `outcome-plan.spec.ts` «drafts the result sheet»: `companion: null` nel foglio intero.
- Attese con `level` (e la vita letta per le voci legacy, D-23/D-38): `outcome-plan.spec.ts` (6 attese), `combatant-plan.spec.ts` (1), `guard/guard-outcome.spec.ts` (1), `quest-resolution.service.int-spec.ts` (3 casi: voce legacy letta piena a 40 o 49), `gm-completion.service.int-spec.ts` (1: solo xp, voce legacy scritta piena a 10 e livello 2), `quest-pet-prize.int-spec.ts` (2: livello 6 vita 12, livello 10 vita 18).
- `resolution-loader.service.spec.ts`: proiezione con `name: 1, recoveryTime: 1` (2 punti) e mappa `pets` con `name`/`recoveryTime`.

## Casi verdi al primo colpo

- `boss-resolution.int-spec.ts` e `guided-completion.service.int-spec.ts`: verdi senza modifiche (nessuna attesa sull'array intero del compagno che ha combattuto: il boss pinna solo gli id dei posseduti, il guidato solo le coppie id/xp).
- Int-spec vicine verdi: aid-rescue, quest-combat, quest-dungeon, crime-guard-conclusion, dungeon-aid, mission-simulation, guided-mission.resolver, quest-result.resolver (e `src/quests/results`), ambush-resolution, ambush-lifecycle.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Spec fuori elenco con attese sul catalogo e sull'array**
- **Trovato durante:** Task 2
- **Problema:** `resolution-loader.service.spec.ts` pinna la proiezione e la mappa `pets`; `guard/guard-outcome.spec.ts` pinna l'array del compagno dopo la guardia vinta.
- **Fix:** attese aggiornate (chiavi aggiunte, titolo del caso del loader con `D-26`), nel commit RED.
- **Commit:** d5cbeec1

**2. [Rule 3 - Blocking] `conclusion/conclusion-plan.ts` fuori elenco**
- **Trovato durante:** Task 2 (tsc)
- **Problema:** `unrewardedInputOf` costruisce l'`UnrewardedPlanInput` di arresto e guardia persa; senza `petCatalog` non compila.
- **Fix:** `petCatalog: input.catalog.pets`.
- **Commit:** c324bb28

**3. Ordine di lavoro del Task 2**
- Le attese delle int-spec (valori della voce legacy letta piena) sono state ricavate eseguendo il GREEN in albero e verificate a mano contro la regola prima del commit RED; il commit RED contiene solo spec ed è rosso su `c16d22e2`.

**4. Caso in più nella spec di Task 1**
- `awards only the xp without a fight, with the level of the new xp (D-27, D-39)` e `awards only the xp for a pet without a valid base life (D-37)`: coprono il ramo «solo xp» dichiarato nelle regole dell'`<interfaces>`.

## Known Stubs

Nessuno.

## Note

- `Plan: 5 of 18` in STATE.md (senza zero iniziale, per il brief): il grep della verify del Task 4 su `Plan: 05 of 18` non combacia, atteso.
- SDL: rispetto a `2c462cbe` nessuna riga tolta; in questo piano +10 righe (`type CompanionOutcome`, `companion: CompanionOutcome`).
- Verifiche: tsc 0; unit `src/models src/quests src/travel` 135 suite / 1 887 test; boot reale `test/app.int-spec.ts` 101/101; int-spec di esiti, completamenti, imboscate 18 suite / 294 test.

## Self-Check: PASSED
