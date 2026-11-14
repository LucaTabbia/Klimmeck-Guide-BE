---
phase: 23-sconfitta-riposo-recupero-compagni
plan: 02
subsystem: pets
tags: [pets, graphql, sdl, companion, recovery]
requires: ["23-01"]
provides:
  - "Pet.recoveryTime: Int annullabile (ms) a DB e sul filo"
  - "PetRecoveryCatalogReporter: WARN al boot col solo conteggio"
  - "OwnedPet sul filo: name, lifeAsOf, potionRecoveryUntil (@Field) + defeated, fullLifeAt, level, maxLifePoints (OwnedPetResolver)"
  - "ownedPetsOnTheWire(entries, equippedPet, now)"
affects: [characters.service findOne, characterUpdated stream, schema.gql]
tech-stack:
  added: []
  patterns: ["@ResolveField con porta Clock (pattern CharacterStatusResolver)", "reporter d'avvio OnApplicationBootstrap che non blocca mai il boot"]
key-files:
  created:
    - src/characters/pets/pet-recovery-catalog.reporter.ts
    - src/characters/pets/pet-recovery-catalog.reporter.spec.ts
    - src/characters/pets/owned-pet.resolver.ts
    - src/characters/pets/owned-pet-state.int-spec.ts
  modified:
    - src/models/pet.model.ts
    - src/models/pet.schema.spec.ts
    - src/models/character/owned-pet.model.ts
    - src/characters/pets/owned-pets.mapper.ts
    - src/characters/pets/owned-pets.mapper.spec.ts
    - src/characters/characters.service.ts
    - src/characters/characters.module.ts
    - test/authz/characters-test-app.ts
    - test/app.int-spec.ts
    - src/schema.gql
    - src/characters/character-updated.subscription.int-spec.ts
decisions:
  - "Il mapper scrive solo chiavi dello schema della voce; defeated e fullLifeAt sono campi risolti con l'ora della risoluzione"
  - "name vuoto servito come null; lo slot equipaggiato si riconosce sia come ref nudo sia come pet popolato"
  - "Senza un massimo leggibile (pet senza maxLifePoints) la vita servita ha il minimo 1 (COMPANION_LIFE_FLOOR), non più 0"
metrics:
  duration: "~10 min"
  completed: 2026-11-14
---

# Phase 23 Plan 02: Catalogo e filo del compagno Summary

`Pet.recoveryTime` annullabile in millisecondi con reporter d'avvio a soli conteggi, e `OwnedPet` sul filo con ancora del riposo, date future, sconfitta e livello calcolati da `companion-life.ts` / `companion-level.ts` tramite un `OwnedPetResolver` con la porta `Clock`; SDL solo additivo.

## Commit

| Task | Commit | Subject |
|------|--------|---------|
| 1 RED | d14880bf | test(pets): pin the pet recovery time and its boot report |
| 1 GREEN | dcff7811 | feat(pets): add the pet recovery time and its boot report |
| 2 RED | 988303ae | test(pets): pin the companion state on the wire |
| 2 GREEN | 55d8a510 | feat(pets): serve the companion rest and defeat state |

## Fallimenti RED attesi

- Task 1: `pet.schema.spec.ts` 4 casi rossi (`recoveryTime` assente: resta `undefined`, nessun errore di validazione, path non nello schema); `pet-recovery-catalog.reporter.spec.ts` «Cannot find module».
- Task 2: `owned-pets.mapper.spec.ts` 13 rossi su 14 (firma nuova, chiavi del filo assenti; «reads a missing list as empty» verde al primo colpo perché la lista vuota non cambia); `owned-pet-state.int-spec.ts` 12 rossi con `GRAPHQL_VALIDATION_FAILED` («Cannot query field defeated/fullLifeAt/level/lifeAsOf/maxLifePoints/name/potionRecoveryUntil on type OwnedPet»). `test/app.int-spec.ts` NON eseguito in RED per non rigenerare `src/schema.gql` fuori dal commit GREEN (rosso per costruzione: blocchi `Pet` e `OwnedPet` attesi diversi dallo SDL generato).

## Blocchi SDL rigenerati (boot reale 101/101)

`git diff 2c462cbe -- src/schema.gql`: solo 8 righe aggiunte — in `type OwnedPet` `defeated: Boolean!`, `fullLifeAt: DateTime`, `level: Int!`, `lifeAsOf: DateTime`, `maxLifePoints: Int!`, `name: String`, `potionRecoveryUntil: DateTime`; in `type Pet` `recoveryTime: Int` dopo `rarity`. `defeatedUntil` assente dallo SDL (T-23-04).

## Test eseguiti

- Unit `src/characters/pets` + `src/models`: 29 suite / 303 test verdi; unit `src/characters`: 36 suite / 529 verdi.
- Int: `owned-pet-state.int-spec.ts` 12/12; `test/app.int-spec.ts` 101/101; regressione `character-updated.subscription`, `characters-ownership`, `equip-pet`, `archived-character-visibility`, `owned-pet-fields`, `do-transaction`, `character-creation.resolver` verdi (dopo l'allineamento sotto).
- `npx tsc --noEmit -p tsconfig.json` 0.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Allineamento atteso] `character-updated.subscription.int-spec.ts` pinnava la vita grezza di voci legacy**
- **Found during:** Task 2 (regressione dopo il GREEN)
- **Issue:** 5 casi seminavano voci senza `level` né `lifeAsOf` (legacy) e si aspettavano la vita salvata (80, 0); con D-23/D-38 la voce legacy esce piena al massimo del compagno (base 10: xp 0 → 10, xp 12 → 11, xp 120 → 20).
- **Fix:** aggiornate le attese con un commento che cita D-23, D-38; il controllo che il documento a DB resti intatto è invariato.
- **Files modified:** src/characters/character-updated.subscription.int-spec.ts (fuori da `files_modified`)
- **Commit:** 55d8a510

**2. [Nota] Spec del mapper: voce rotta senza massimo leggibile**
- Nei casi esistenti il pet popolato non ha `maxLifePoints`: la vita servita ora passa da `companionLifeAt`, che applica il minimo 1 senza massimo (NaN/assente → 1 invece di 0). Attese aggiornate; in produzione ogni pet a catalogo ha la base.

**3. [Aggiunta] casi in più nel mapper**: «recognises the equipped companion when the slot is populated (D-04)», «serves the name of a named companion and null otherwise (D-18)», «keeps the saved level and drops an invalid one (D-39)».

### Note di bookkeeping
- STATE porta `Plan: 2 of 18` (regola dell'orchestratore, senza zero): il grep del piano su `Plan: 02 of 18` non combacia, atteso.
- Handoff: la query dell'oste `characters` (`findAll`) non popola `assets.ownedPets.pet`; la FE non vi seleziona i compagni (il resolver regge un ref nudo: `level` dal ricalcolo, `maxLifePoints` 0, `fullLifeAt` null).

## Known Stubs

Nessuno.

## Self-Check: PASSED

File creati presenti; commit d14880bf, dcff7811, 988303ae, 55d8a510 presenti in `git log`.
