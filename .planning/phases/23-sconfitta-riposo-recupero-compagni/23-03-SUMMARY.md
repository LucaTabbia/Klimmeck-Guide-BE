---
phase: 23-sconfitta-riposo-recupero-compagni
plan: 03
subsystem: pets
tags: [equip, riposo, sconfitta, transazione, PET_DEFEATED]
requires: ["23-01", "23-02"]
provides: [planEquipPet, planUnequipPet, PET_SLOT_PROJECTION, GameRuleException.petDefeated, PET_DEFEATED]
affects: [characters.service equipPet/unequipPet, test/authz/characters-test-app]
tech-stack:
  added: []
  patterns: ["transazione con snapshot in sessione → piano puro → updateOne guardato sullo slot letto (come item-use.service)"]
key-files:
  created:
    - src/characters/pets/equip-pet.plan.ts
    - src/characters/pets/equip-pet.plan.spec.ts
  modified:
    - src/gameRules/game-rule-error-code.enum.ts
    - src/gameRules/game-rule.exception.ts
    - src/gameRules/game-rule.exception.spec.ts
    - src/characters/characters.service.ts
    - src/characters/characters.service.spec.ts
    - src/characters/pets/equip-pet.int-spec.ts
    - test/authz/characters-test-app.ts
  deleted:
    - src/characters/pets/equip-pet.updates.ts
    - src/characters/pets/equip-pet.updates.spec.ts
decisions:
  - "Equip e unequip in transazione: snapshot dello slot e delle voci, catalogo del compagno scelto e di quello nello slot letto nella stessa sessione, piano puro, scrittura guardata sullo slot letto; matchedCount 0 → PET_NOT_OWNED (codice stabile)"
  - "PET_DEFEATED giudicato solo dalla data defeatedUntil (isPetDefeated); l'equip dopo la data non azzera il marcatore (resta allo sweeper)"
  - "Slot illeggibile ma non nullo: la guardia usa il valore letto così com'è (l'equip resta possibile e l'unequip lo svuota)"
metrics:
  duration: "~35 min"
  completed: 2026-11-14
---

# Phase 23 Plan 03: Equip e riposo con assestamento Summary

`equipPet`/`unequipPet` passano da un update cieco a una transazione con piano puro: l'entrante prende la vita raggiunta a riposo (20 → 40 nell'esempio dell'utente) e perde l'ancora, l'uscente riposa da adesso, lo sconfitto con `defeatedUntil` futura è rifiutato con il nuovo `PET_DEFEATED`; ogni voce toccata esce con `level` scritto e vita letta con la regola legacy.

## Commit

| Task | Commit | Subject |
|------|--------|---------|
| 1 RED | df8743a4 | test(pets): pin the defeated refusal and the equip plan |
| 1 GREEN | 6cf1968b | feat(pets): plan the equip and the rest of a companion |
| 2 RED | 65ab8e95 | test(pets): pin the equip and rest writes |
| 2 GREEN | ac43309e | feat(pets): settle the companion life on equip and unequip |

## Fallimenti RED attesi

- Task 1: `equip-pet.plan.spec.ts` → `Cannot find module './equip-pet.plan'`; `game-rule.exception.spec.ts` → 3 test rossi (riga `petDefeated` di `cases`, «covers every GameRuleErrorCode exactly once», «refuses a defeated companion … (D-02)»): fabbrica e codice assenti.
- Task 2: `equip-pet.int-spec.ts` → 6 rossi su 15: «unequips the companion idempotently (D-15)» (ora l'uscente ha `level` e `lifeAsOf`), rifiuto `PET_DEFEATED`, equip dopo la data (D-24), esempio 20 → 40, scambio, ancora dell'unequip.

## Verdi al primo colpo (con motivo)

- `checks the mission lock before the defeat (D-02)`: `assertFree` era già il primo controllo di `equipPet`.
- `keeps the name of every companion across equip and unequip (D-23)`: l'update cieco non toccava l'array.
- `equips a pet owned as an entry and keeps the state of a full companion (D-03, D-04)`: la voce seminata è già piena e con `level`, quindi resta identica anche con la scrittura nuova.

## Test eseguiti

- Unit `src/characters/pets src/gameRules src/characters/characters.service.spec.ts`: 8 suite / 209 test verdi (`equip-pet.plan.spec.ts` 13 test nuovi).
- Integration `equip-pet.int-spec.ts` (15) + `character-mutations-lock.int-spec.ts` (8): 23/23 verdi.
- In più (cambio dei provider di `CharactersService`): `test/app.int-spec.ts` + `character-updated.subscription.int-spec.ts` 121/121 verdi.
- `tsc` 0; `git diff --exit-code src/schema.gql` pulito (SDL invariato: `PET_DEFEATED` è solo un codice d'errore).

## Deviations from Plan

### Scelte dichiarate

**1. [Rule 2 - Correttezza] Guardia sullo slot illeggibile**
- Il piano prescrive slot letto `null` → `null`, altrimenti `{ $in: idForms(id) }`. Uno slot non nullo ma senza id leggibile avrebbe dato un filtro `null` mai corrispondente (equip impossibile per sempre): la guardia usa il valore letto così com'è. File: `equip-pet.plan.ts` (`slotGuardOf`).

**2. Caso unitario del pet id malformato conservato**
- Dei casi `companion` di `characters.service.spec.ts` sono stati tolti quelli dell'update cieco (equip/unequip con `equipPetFilter`/`equipPetUpdate`, PET_NOT_OWNED e NOT_FOUND dopo l'update), ora coperti da `equip-pet.plan.spec.ts` e `equip-pet.int-spec.ts`. Il caso del pet id malformato resta, riscritto: rifiuta `PET_NOT_OWNED` senza chiamare `transaction`. I casi del lucchetto verificano anche `connection.transaction` mai chiamato.

**3. Bookkeeping**
- `Plan: 3 of 18` senza zero iniziale (regola dell'orchestratore, vince sul piano): il grep del piano su `Plan: 03 of 18` non combacia, atteso.

### Note

- `NOT_FOUND` del personaggio arriva ora dallo snapshot in sessione (`ResourceNotFoundException.character()`), dopo `assertFree` e prima di `PET_NOT_OWNED` / `PET_DEFEATED`, come vuole l'ordine dei rifiuti.
- `Pet` aggiunto al `forFeature` di `test/authz/characters-test-app.ts` (richiesto dal costruttore di `CharactersService`).
- `grep -rn "equip-pet.updates" src test` → 0 righe.

## Self-Check: PASSED

- File creati presenti: `equip-pet.plan.ts`, `equip-pet.plan.spec.ts`; file cancellati assenti.
- Commit df8743a4, 6cf1968b, 65ab8e95, ac43309e presenti in `git log`.
