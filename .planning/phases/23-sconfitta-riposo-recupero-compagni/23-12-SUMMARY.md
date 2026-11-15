---
phase: 23-sconfitta-riposo-recupero-compagni
plan: 12
subsystem: travel
tags: [travel, mount, pet, schema]
requires: ["23-11"]
provides: ["activeTravel.mount interno scritto alla partenza", "mountOf", "TravelPlanner.rideOf"]
affects: ["23-13 (strada a piedi dopo la cavalcatura sconfitta)"]
tech-stack:
  added: []
  patterns: ["sotto-schema interno senza @Field", "una sola lettura del catalogo per velocità e cavalcatura"]
key-files:
  created: []
  modified:
    - src/models/character/active-travel.model.ts
    - src/models/character/active-travel.schema.spec.ts
    - src/travel/travel-timing.ts
    - src/travel/travel-timing.spec.ts
    - src/travel/travel-planner.service.ts
    - src/travel/travel-planning.int-spec.ts
    - src/travel/travel.service.int-spec.ts
decisions:
  - "factor = speedModifier del pet (rapporto fra velocità con la cavalcatura e a piedi a parità di ferite)"
  - "speedOf e mountOf condividono il predicato privato isSpeedModifier (numero finito > 0); il modificatore nullo non è una cavalcatura"
  - "Il caso Pitfall 4 sta in travel.service.int-spec.ts (describe dell'imboscata alla partenza, harness con CharactersService): l'harness del pianificatore non scrive a DB"
metrics:
  duration: "~25 min"
  completed: 2026-11-14
---

# Phase 23 Plan 12: Cavalcatura fotografata alla partenza Summary

Il viaggio salva alla partenza il campo interno `activeTravel.mount = { pet, factor }` (factor = `speedModifier` valido del compagno equipaggiato), calcolato con una sola lettura del catalogo insieme alla velocità; mai sul filo, assente a piedi, con un compagno non cavalcabile e sui viaggi in volo al deploy.

## Cosa è stato fatto

- **Task 1** — `ActiveTravelMount` / `ActiveTravelMountSchema` (`_id: false`, `pet` ObjectId ref Pet obbligatorio, `factor` Number min 0) e `ActiveTravel.mount?` senza `@Field`. In `travel-timing.ts`: `ActiveTravelMountDraft`, `ActiveTravelDraft.mount?`, `mountOf(petId, modifier)`, `buildActiveTravel({ ..., mount })` con spread condizionale (nessuna chiave senza cavalcatura). Boy Scout: la validazione del modificatore estratta nel predicato privato `isSpeedModifier`, condiviso da `speedOf` e `mountOf`.
- **Task 2** — `TravelPlanner`: `rideOf(pet, injuries): Promise<Ride>` (`Ride = { speed, mount }`) e il privato `mountedRideOf(pet)` che sostituisce `petSpeedOf` (stessa lettura `findById(petId, { speedModifier: 1 })`, stesso WARN). `planFree` e `autoRoute` passano `...ride` a `buildActiveTravel`; `speedOfCharacter` ha la stessa firma e lo stesso risultato (`rideOf(...).speed`), quindi la deviazione dell'imboscata non scrive `mount`. `withAmbush` fa lo spread e conserva il campo.

## Fallimenti RED attesi

- Task 1: 3 casi rossi (sotto-schema, `buildActiveTravel` con `mount`, `mountOf` assenti). `writes no mount on a travel without one` e `writes no mount key without a mount` verdi al primo colpo: pinnano un'assenza che era già vera.
- Task 2: 3 casi rossi (`mount` undefined su viaggio libero, viaggio automatico e dopo il cambio di compagno). `saves no mount on foot or with a companion that is not a mount` verde al primo colpo per lo stesso motivo.

## Verifiche

- Unit `src/travel` + `src/models/character`: 32 suite / 332 test verdi.
- Int `travel-planning` + `travel.service` + boot reale `test/app.int-spec.ts`: 3 suite / 172 verdi.
- Non regressione int: equip-pet, character-mutations-lock, characters-ownership, archived-character-visibility, character-updated.subscription, city-shop.resolver, quest acceptance (2), ambush-resolution: 9 suite / 396 verdi.
- `tsc` 0; `git diff --exit-code src/schema.gql` pulito; `grep -cw mount src/schema.gql` = 0.

## Deviations from Plan

- Il caso Pitfall 4 vive in `src/travel/travel.service.int-spec.ts` (previsto dal piano come alternativa annotata), file fuori dai `files_modified`.
- Il grep del brief su `Plan: 0K of 18` non combacia: STATE usa `Plan: 12 of 18` (atteso).

Nessun'altra deviazione.

## Threat Flags

Nessuna superficie nuova: T-23-35 mitigata (nessun `@Field`, SDL invariato), T-23-36 mitigata (caso Pitfall 4 verde).

## Self-Check: PASSED

Commit 9d884527, 67aa4d16, 10975417, 369ccb1b presenti; file modificati presenti.
