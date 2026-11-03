---
phase: 12-negozi-per-citta
plan: 17
subsystem: pets
tags: [pets, companion, equipPet, unequipPet, PET_NOT_OWNED, BE-SHOP-06, D-15, C1]
requires: ["12-03", "12-04", "12-16"]
provides:
  - "src/characters/pets/equip-pet.updates.ts: equipPetFilter, equipPetUpdate, classifyEquipPetFailure (aggiornamenti puri del compagno)"
  - "src/models/request/equip-pet-request.model.ts: input EquipPetRequest { id, petId }"
  - "src/models/request/unequip-pet-request.model.ts: input UnequipPetRequest { id }"
  - "CharactersService.equipPet / unequipPet e mutation equipPet / unequipPet (CommonResponse) con @OwnsCharacter come equipItem"
affects: [12-18, 12-19]
tech-stack:
  added: []
  patterns:
    - "possesso affermato nel filtro dell'updateOne atomico; matchedCount 0 → exists sul personaggio attivo → classificazione (stesso schema di equipItem)"
key-files:
  created:
    - src/characters/pets/equip-pet.updates.ts
    - src/characters/pets/equip-pet.updates.spec.ts
    - src/models/request/equip-pet-request.model.ts
    - src/models/request/unequip-pet-request.model.ts
    - src/characters/pets/equip-pet.int-spec.ts
  modified:
    - src/characters/characters.service.ts
    - src/characters/characters.service.spec.ts
    - src/characters/characters.resolver.ts
    - src/validation/input-rules.spec.ts
    - src/validation/input-decorators.spec.ts
    - src/characters/characters-ownership.int-spec.ts
    - src/characters/archived-character-visibility.int-spec.ts
    - test/app.int-spec.ts
    - src/schema.gql
decisions:
  - "Un `petId` malformato che arriva al service (difesa oltre `@IsObjectIdHex`) risponde `PET_NOT_OWNED` senza scrivere, come `equipItem` con `ITEM_NOT_OWNED`"
  - "`unequipPet` non ha guardia di possesso: svuota lo slot di un personaggio attivo, idempotente; `NOT_FOUND` solo se il personaggio manca o è archiviato"
  - "Risposte: `Compagno equipaggiato` e `Compagno lasciato a riposo`"
metrics:
  duration: "~25 min"
  completed: 2026-11-02
  tasks: 3
  files: 14
---

# Phase 12 Plan 17: mutation del compagno Summary

`equipPet(request: EquipPetRequest!)` e `unequipPet(request: UnequipPetRequest!)` restituiscono `CommonResponse` con le forme del contratto FE: si equipaggia come compagno (`assets.pet`) solo un pet presente in `assets.ownedPets` (filtro atomico con le due forme dell'id), altrimenti `PET_NOT_OWNED` senza scritture; entrambe idempotenti, ammesse in viaggio senza toccare `status.activeTravel`, valide anche per un pet con `speedModifier` null; protette da `@OwnsCharacter` con il bypass dell'oste come `equipItem` (C1, nessun `ownerOnly`), `NOT_FOUND` sugli archiviati (D-15).

## Task

| Task | Nome | Commit RED | Commit GREEN |
| ---- | ---- | ---------- | ------------ |
| 1 | aggiornamenti puri del compagno | 616a556 | 07cc821 |
| 2 | input e metodi del servizio | a7ee6a9 | 3d3df0b |
| 3 | mutation, enumerazioni e filo | 8868433 | 26f449f |

## Fallimenti RED osservati

- Task 1: `equip-pet.updates.spec.ts` → suite non eseguita, modulo `./equip-pet.updates` non trovato.
- Task 2: `input-rules.spec.ts` → suite non eseguita (modulo `equip-pet-request.model` non trovato); `characters.service.spec.ts` → 6 casi `(D-15)` rossi con `service.equipPet is not a function` / `service.unequipPet is not a function` (gli import dei due input sono solo di tipo e ts-jest li elide).
- Task 3: `input-decorators.spec.ts` → 3 rossi (copertura dello SDL, `EquipPetRequest`, `UnequipPetRequest` assenti dallo schema); integration 32 rossi su 194: `test/app.int-spec.ts` solo `exposes exactly the enumerated ownership-protected handlers`, più le operazioni `equipPet`/`unequipPet` in ownership e archived e i 7 casi di `equip-pet.int-spec.ts` (validazione GraphQL: mutation e input sconosciuti). `src/schema.gql` invariato nel RED.

## Gate

- `npx tsc --noEmit -p tsconfig.json` → 0 dopo ogni task.
- Unit: input-decorators + input-rules + equip-pet.updates + characters.service = 97 verdi.
- Integration: equip-pet + characters-ownership + archived-character-visibility = 125 verdi; `test/app.int-spec.ts` (real boot) 69 verdi.
- Prettier/eslint sui soli file toccati: puliti (warning preesistente `no-base-to-string` in `test/app.int-spec.ts`).
- SDL vs `origin/develop`: 45 righe aggiunte, tolte solo le due di D-20; `ownerOnly` nel resolver 0 come su `origin/develop`; `EXPECTED_OWNER_ONLY_HANDLERS` invariato.

## Deviations from Plan

**1. [Rule 3 - Blocking] Id dei pet tipizzati nell'int-spec di filo**
- **Found during:** Task 3 (RED)
- **Issue:** `PetDocument = Pet & Document` dà `_id: unknown`; `tsc` rifiutava `[horse._id]` dove serve `Types.ObjectId[]`.
- **Fix:** `horseId`/`catId` ricavati in `beforeEach` con `as Types.ObjectId`.
- **Files modified:** src/characters/pets/equip-pet.int-spec.ts
- **Commit:** 8868433

Per il resto il piano è stato eseguito come scritto.

## Self-Check: PASSED

- File creati presenti; commit 616a556, 07cc821, a7ee6a9, 3d3df0b, 8868433, 26f449f presenti in `git log`.
