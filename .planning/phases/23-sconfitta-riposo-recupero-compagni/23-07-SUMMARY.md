---
phase: 23-sconfitta-riposo-recupero-compagni
plan: 07
subsystem: characters
tags: [characters, pets, items, potion, graphql, sdl]
requires: ["23-06"]
provides:
  - "codice PET_POTION_RECOVERING con extensions.recoveryUntil, allowlist del formatter estesa (insieme RECOVERY_UNTIL_CODES)"
  - "planPetPotion (puro), gemello di planItemUse per il compagno"
  - "useItem(itemId: ID!, petId: ID): UseItemResult! sul filo, con OptionalObjectIdPipe"
affects: ["23-17", "23-18"]
tech-stack:
  added: []
  patterns: ["planner iniettato in drinkWithin: planItemUse o planPetPotion, stessa transazione e stessa scrittura"]
key-files:
  created: []
  modified:
    - src/gameRules/game-rule-error-code.enum.ts
    - src/gameRules/game-rule.exception.ts
    - src/gameRules/game-rule.exception.spec.ts
    - src/graphql/format-domain-error.ts
    - src/graphql/format-domain-error.spec.ts
    - src/characters/items/item-use.plan.ts
    - src/characters/items/item-use.plan.spec.ts
    - src/characters/items/item-use.service.ts
    - src/characters/items/item-use.resolver.ts
    - src/characters/items/item-use.module.ts
    - src/characters/items/use-item.int-spec.ts
    - src/characters/pets/equip-pet.plan.ts
    - src/validation/object-id.pipe.ts
    - src/validation/object-id.pipe.spec.ts
    - test/app.int-spec.ts
    - src/schema.gql
decisions:
  - "petId annullabile validato da una pipe nuova OptionalObjectIdPipe (omesso/null → null, malformato → BAD_USER_INPUT col nome dell'argomento): ObjectIdPipe rifiuta null"
  - "La guardia dello slot si condivide: slotGuardOf di equip-pet.plan.ts esportato come petSlotGuardOf, niente copia"
  - "refuseWhileRecovering riceve la fabbrica del rifiuto: una sola funzione per l'attesa del personaggio e del compagno"
  - "potionRecoveryUntil del compagno scritto sempre: usablePotionOf garantisce una ricarica ≥ 1 ms, quindi il ramo «ricarica non valida» del piano è già ITEM_NOT_USABLE"
metrics:
  duration: "~35 min"
  completed: 2026-11-14
---

# Phase 23 Plan 07: Pozione sul compagno Summary

`useItem(itemId, petId)` cura il compagno equipaggiato o a riposo con le regole delle pozioni del personaggio e un'attesa propria per voce (`potionRecoveryUntil`), rifiuti nell'ordine del contratto e data dell'attesa nelle `extensions` tramite `PET_POTION_RECOVERING` (D-05, D-06, D-07, D-23, D-32, D-38).

## Task

| Task | Nome | Commit | File |
|------|------|--------|------|
| 1 RED | casi di codice, allowlist e piano puro | `3f7caee6` | game-rule.exception.spec, format-domain-error.spec, item-use.plan.spec |
| 1 GREEN | codice, fabbrica, allowlist, `planPetPotion` | `922df442` | enum, exception, format-domain-error, item-use.plan, equip-pet.plan |
| 2 RED | riga SDL e casi sul filo | `535731f6` | test/app.int-spec.ts, use-item.int-spec.ts |
| 2 RED (pipe) | pipe dell'id annullabile | `d590d78a` | src/validation/object-id.pipe.spec.ts |
| 2 GREEN | argomento `petId`, servizio, modulo, SDL | `6554efca` | resolver, service, module, object-id.pipe, src/schema.gql |
| 3 | bookkeeping | (commit docs) | ROADMAP, STATE, VALIDATION, questo SUMMARY |

## Semantica di `UseItemResult` col compagno

- `hpBefore` = vita del compagno ADESSO (vita salvata letta con `companionStoredLifeOf`, più il recupero a riposo di `companionLifeAt` se fuori dallo slot); `hpAfter` = `min(massimo del compagno, hpBefore + power)`; massimo = `companionMaxLifeOf` (livello salvato o ricalcolato + base), mai `Pet.maxLifePoints` diretto.
- `injuriesHealed` sempre `[]`; `quantityLeft` dello stack della pozione; `recoveryUntil` = attesa del compagno (now + `recovery.time`); `loreUnlocked` = lore della pozione sbloccate al PERSONAGGIO.
- Voce scritta: `currentLifePoints: hpAfter`, `level` scritto, `potionRecoveryUntil`, `lifeAsOf: now` se a riposo (chiave tolta se nello slot); le altre voci passano da `normalisedOwnedPets` e conservano nome e date. `status.potionRecoveryUntil` mai toccato né guardato.
- Ordine dei rifiuti: `AWAITING_AID` → `MISSION_IN_PROGRESS` → `ITEM_NOT_OWNED` → `ITEM_NOT_USABLE` → `PET_NOT_OWNED` → `PET_DEFEATED` → `PET_POTION_RECOVERING` (`recoveryUntil` ISO) → `ITEM_NO_EFFECT` (vita piena, voce legacy mai toccata = piena, o specie senza vita base leggibile). Nessun consumo in ogni rifiuto.
- Filtro: `activeCharacterById`, `status.awaitingAid` null, lo slot come letto (`petSlotGuardOf`), la voce con `$elemMatch` su `pet` (due forme), `currentLifePoints`, `lifeAsOf`, `potionRecoveryUntil`, `defeatedUntil` come letti (assente = null, forma «non data» per tipo) e la guardia dello stack.

## SDL

Unica riga tolta rispetto a `develop` (`2c462cbe`) in tutta la fase, ammessa: `-  useItem(itemId: ID!): UseItemResult!` sostituita da `+  useItem(itemId: ID!, petId: ID): UseItemResult!` (argomento opzionale, compatibile con ogni client di oggi). `git diff 2c462cbe -- src/schema.gql | grep -E '^-[^-]'` stampa solo quella riga.

## Fallimenti RED attesi

- Task 1: 18 test rossi (15 di `pet potion plan` per `planPetPotion` assente, `covers every GameRuleErrorCode` e `carries the companion wait` per la fabbrica assente, `lets the companion wait out` per l'allowlist).
- Task 2: 9 casi di `useItem (wire) › on a companion` rossi (argomento `petId` sconosciuto allo schema); il boot reale rosso sul solo pin di `useItem`; la spec della pipe rossa per `OptionalObjectIdPipe` assente.

## Verde al primo colpo

- `drops recoveryUntil for any other code (Pitfall 7)`: il formatter già scartava `recoveryUntil` per ogni codice diverso da `POTION_RECOVERING`; il caso pinna che resti così con l'insieme esteso.
- `keeps the character drink unchanged without petId (D-05)`: comportamento di oggi; rosso impossibile senza rompere il filo esistente.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `ObjectIdPipe` non accetta null**
- **Trovato durante:** Task 2
- **Fix:** nuova `OptionalObjectIdPipe` in `src/validation/object-id.pipe.ts` (RED dedicato `d590d78a`), così un `petId` malformato è `BAD_USER_INPUT` prima di ogni lettura (T-23-20), con caso sul filo `rejects a malformed pet id with BAD_USER_INPUT (D-32)`.
- **File fuori da files_modified:** `src/validation/object-id.pipe.ts`, `src/validation/object-id.pipe.spec.ts`.

**2. [Boy Scout] Guardia dello slot condivisa**
- `slotGuardOf` privato di `src/characters/pets/equip-pet.plan.ts` esportato come `petSlotGuardOf` e riusato dal piano della pozione (zero duplicazione). Spec di `src/characters/pets` verdi.

**3. Riga della fabbrica in `cases`**
- Il piano chiedeva la riga di `petPotionRecovering` in `cases`, ma `cases` asserisce `extensions` = `{ code }`: la fabbrica è entrata nella lista di `covers every GameRuleErrorCode exactly once` accanto a `potionRecovering` e `characterImprisoned`, con il caso dedicato per le extensions.

**4. Casi in più**
- `refuses a companion whose species has no readable life (D-38)` e `guards the slot and the ended dates of the companion as read (D-23)` nel piano puro; `rejects a malformed pet id` sul filo.

### Note sui grep

- `grep -q "Plan: 07 of 18"` (verifica del task 3) non combacia: STATE porta `Plan: 7 of 18` come da brief dell'orchestratore (k senza zero). Atteso.

## Known Stubs

Nessuno.

## Threat Flags

Nessuna superficie nuova oltre al registro del piano (T-23-17..T-23-20 coperti: bearer-only con `PET_NOT_OWNED` per il pet di un altro personaggio, bevute concorrenti serializzate, allowlist a due codici, pipe dell'id).

## Test eseguiti

- Unit `src/gameRules src/graphql src/validation src/characters/items`: 16 suite / 324 test verdi; `src/characters/pets` verdi.
- Integration `src/characters/items` + `test/app.int-spec.ts` (runInBand): 3 suite / 141 test verdi (use-item 32, item-use.service, boot reale 101/101).
- `npx tsc --noEmit -p tsconfig.json` 0.

## Self-Check: PASSED
