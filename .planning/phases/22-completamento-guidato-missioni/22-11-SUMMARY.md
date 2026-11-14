---
phase: 22-completamento-guidato-missioni
plan: 11
subsystem: combat
tags: [guided-mission, combat, companion, pets]
requires: ["22-10"]
provides:
  - "CombatCompanion e CombatParticipant.companion: CombatCompanion | null (combat-resolver.ts)"
  - "CombatPetSnapshot, CombatHydration.pets obbligatorio, companionOf(snapshot, pets) (combat-context.ts)"
  - "ResolutionCatalog.pets / CombatCatalog.pets da readCombatPets (stessa lettura dei tetti di xp)"
affects: [22-12, 22-13, 22-17, 22-18]
tech-stack:
  added: []
  patterns: ["compagno fail-closed: senza pet equipaggiato, voce posseduta o voce del catalogo → null"]
key-files:
  created: []
  modified:
    - src/quests/outcomes/combat/combat-resolver.ts
    - src/quests/outcomes/combat/combat-context.ts
    - src/quests/outcomes/combat/combat-context.spec.ts
    - src/quests/outcomes/combat/placeholder-combat-resolver.spec.ts
    - src/quests/outcomes/resolution-loader.service.ts
    - src/quests/outcomes/resolution-loader.service.spec.ts
    - src/quests/outcomes/combatant-plan.ts
    - src/quests/outcomes/combatant-plan.spec.ts
    - src/quests/outcomes/conclusion/conclusion-plan.ts
    - src/quests/outcomes/guard/guard-outcome.spec.ts
    - src/quests/outcomes/dungeon/dungeon-context.spec.ts
    - src/quests/outcomes/dungeon/placeholder-dungeon-resolver.spec.ts
    - src/travel/ambush/ambush-resolution.service.ts
    - src/travel/ambush/ambush-resolution.int-spec.ts
decisions:
  - "pets contiene l'intero catalogo dei pet (anche quelli senza tetto valido): la normalizzazione dei numeri e dei danni avviene in companionOf"
  - "currentLifePoints del compagno = voce posseduta, ripiego sulla vita massima del catalogo; xp ripiego 0; vita massima ripiego 0"
  - "Nella conclusione (scontro con la guardia) i pet arrivano da encounter.pets, come equipaggiamento, magie e loot dello stesso catalogo"
metrics:
  duration: "~35 min"
  completed: 2026-11-14
---

# Phase 22 Plan 11: compagno nel contesto del combattimento Summary

Il partecipante del combattimento porta il compagno equipaggiato (`CombatCompanion`: id, attacco e difesa normalizzati, vita corrente dalla voce posseduta, vita massima dal catalogo, xp), letto dalla stessa `find` dei tetti di xp e passato al motore da quest, boss, soccorso, dungeon, conclusione e imboscata; il segnaposto lo ignora (D-20).

## Commit

| Task | Commit | Subject |
|------|--------|---------|
| 1 RED | 31e39618 | test(combat): pin the pet catalogue of the combat |
| 1 GREEN | 0c0dea67 | feat(combat): read the pet combat stats with the xp caps |
| 2 RED | d058075e | test(combat): pin the companion in the combat context |
| 2 GREEN | dcd32088 | feat(combat): carry the equipped companion into the quest context |
| 3 RED | 160042c1 | test(travel): pin the companion in the ambush context |
| 3 GREEN | 3c9e441c | feat(travel): hand the companion to the engine in ambushes |

## Fallimenti attesi in RED

- Task 1: i due casi D-20 falliscono per `pets` assente dal catalogo; anche il caso D-17 dei tetti (proiezione della `find` aggiornata a `{ maxXp, attack, defense, maxLifePoints }`).
- Task 2: `companion` assente dal contesto (`toEqual` sul campo mancante e `toBeNull` su `undefined`); `combatantPlan` idem.
- Task 3: l'imboscata andava in `TypeError` (`hydration.pets` indefinito) perché l'idratazione non passava i pet.

## Casi verdi al primo colpo

- `ignores the companion and draws the same sequence (D-20)` (`placeholder-combat-resolver.spec.ts`): verde in RED per costruzione, il segnaposto non legge il compagno e non è stato toccato; pinna che resti così (stesso esito, stessa `drawn` della `SequenceChance`).

## Letterali delle spec aggiornati (F9 e catalogo)

- `pets: new Map()`: `combatant-plan.spec.ts` (`catalogWith`), `guard/guard-outcome.spec.ts` (catalogo dello scontro con la guardia), `combat-context.spec.ts` (`hydration()`), `resolution-loader.service.spec.ts` (catalogo atteso del caso D-09 e chiavi del caso D-07).
- `companion: null`: `combat-context.spec.ts` (due partecipanti attesi), `placeholder-combat-resolver.spec.ts` (`participant()`), `dungeon/dungeon-context.spec.ts`, `dungeon/placeholder-dungeon-resolver.spec.ts` (correzioni meccaniche, nessun comportamento né asserzione cambiati).

## Proiezioni

Nessuna proiezione estesa: conclusione, quest e imboscata leggono lo snapshot con `OUTCOME_CHARACTER_PROJECTION` (`assets: 1`), che contiene già `assets.pet` e `assets.ownedPets`.

## Deviazioni dal piano

- **Eccezione approvata dall'orchestratore:** il task 2 si è chiuso con `tsc` non a 0 per i soli letterali di `ambush-resolution.service.ts`, `dungeon-context.spec.ts` e `placeholder-dungeon-resolver.spec.ts`; `tsc` = 0 a fine task 3.
- **Grep di accettazione su `conclusion-plan.ts`:** `pets: catalog.pets` stampa 0 perché nel ramo dello scontro con la guardia la variabile del catalogo si chiama `encounter` (come `equipment: encounter.equipment`): la riga è `pets: encounter.pets`. Stesso catalogo completo dei pet, nessun effetto sul comportamento.
- **Grep `D-20)` nell'int-spec dell'imboscata:** stampa 2 perché il caso «enqueues the spell recoveries at the ambush instant (D-20)» di una fase precedente usa la stessa sigla.
- Nessuna spec fuori dai file del piano corretta.

## Esiti

- Unit `src/quests/outcomes src/travel/ambush`: 918/918.
- Integration `ambush-resolution`, `quest-combat`, `boss-resolution`, `quest-dungeon`, `crime-guard-conclusion`: 89/89 (spec a seme fisso verdi).
- Integration aggiuntiva `aid-rescue`, `ambush-lifecycle`, `ambush.processor` (leggono `combat.contexts`): 41/41.
- `npx tsc --noEmit -p tsconfig.json` 0; `src/schema.gql` invariato; `placeholder-combat-resolver.ts` invariato.

## Threat model

- T-22-27: segnaposto invariato, caso «draws the same sequence», spec a seme fisso verdi.
- T-22-28: pet assente dal catalogo o non posseduto → `null`; numeri e danni normalizzati.

## Self-Check: PASSED
