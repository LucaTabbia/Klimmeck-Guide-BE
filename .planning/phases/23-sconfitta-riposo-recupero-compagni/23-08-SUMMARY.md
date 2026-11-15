---
phase: 23-sconfitta-riposo-recupero-compagni
plan: 08
subsystem: characters
tags: [characters, pets, authz, graphql, sdl]
requires: ["23-07"]
provides:
  - "codice PET_NAME_INVALID e GameRuleException.petNameInvalid()"
  - "petNameOf (src/characters/pets/pet-name.ts): una sola regola di forma per i nomi di personaggi e compagni"
  - "planRenamePet (puro, in equip-pet.plan.ts): prima scrittura della voce con nome, livello e vita letta"
  - "renamePet(request: RenamePetRequest!): CommonResponse! owner-only, nelle liste e nella matrice di autorizzazione"
affects: ["23-17", "23-18"]
tech-stack:
  added: []
  patterns: ["la rinomina riusa writePetSlot (transazione, snapshot in sessione, catalogo, guardia sullo slot letto) con un planner nuovo"]
key-files:
  created:
    - src/characters/pets/pet-name.ts
    - src/characters/pets/pet-name.spec.ts
    - src/models/request/rename-pet-request.model.ts
    - src/characters/pets/rename-pet.int-spec.ts
  modified:
    - src/gameRules/game-rule-error-code.enum.ts
    - src/gameRules/game-rule.exception.ts
    - src/gameRules/game-rule.exception.spec.ts
    - src/characters/pets/equip-pet.plan.ts
    - src/characters/pets/equip-pet.plan.spec.ts
    - src/characters/characters.resolver.ts
    - src/characters/characters.service.ts
    - src/validation/input-decorators.spec.ts
    - test/authz/expected-handlers.ts
    - test/authz/handler-fixtures.ts
    - test/authz/handler-fixtures.spec.ts
    - test/authz/authorization-matrix.int-spec.ts
    - test/app.int-spec.ts
    - src/schema.gql
decisions:
  - "La scrittura della rinomina è un planner puro planRenamePet accanto a planEquipPet (riusa settledFields, slotFilterOf, normalisedOwnedPets) e passa da writePetSlot: nessuna copia della transazione"
  - "Il nome nullo toglie la chiave name dalla voce; la voce scelta conserva ancora del riposo, sconfitta e attesa della pozione"
  - "Nessun controllo della sconfitta né del lucchetto della missione sulla rinomina (cosmetica, D-31)"
metrics:
  duration: "~30 min"
  completed: 2026-11-14
---

# Phase 23 Plan 08: Nome del compagno Summary

`renamePet` owner-only che normalizza e valida il nome con le stesse funzioni del nome del personaggio (`normalizeCharacterName` + `isValidCharacterName`, codice `PET_NAME_INVALID`), toglie il nome con `null`, non è bloccata dalla missione in corso e scrive la voce come «prima scrittura» (livello salvato, vita piena per una voce legacy, vita invariata per una voce già toccata).

## Task

| Task | Commit | Esito |
|------|--------|-------|
| 1 RED | f1d8fbe7 `test(pets): pin the companion name rules` | rosso: modulo `./pet-name` assente, `petNameInvalid` assente |
| 1 GREEN | e3b90e31 `feat(pets): validate the companion name like a character name` | unit gameRules + pet-name 2 suite / 58 test |
| 2 RED | 040f5b44 `test(pets): pin renamePet and its authorization` | rosso: unit 3 suite / 8 test (planRenamePet assente, input non nello SDL, fixture senza handler); int 14 test (9 di rename-pet, 2 righe della matrice per renamePet, 3 di app.int-spec: SDL e le due liste) |
| 2 GREEN | 87b77cfa `feat(pets): let the owner rename a companion` | unit pets/validation/gameRules/handler-fixtures 16 suite / 300; int rename-pet + matrice + boot reale 3 suite / 242; tsc 0 |

## Verifiche

- `npx jest src/characters src/models --selectProjects unit`: 60 suite / 753 verdi.
- `npx jest src/characters/pets/equip-pet.int-spec.ts --selectProjects integration --runInBand`: 15/15 (writePetSlot invariato).
- Boot reale `test/app.int-spec.ts` 102/102 (101 + il nuovo pin dello SDL).
- Codice d'errore dell'ownership osservato per l'attaccante e per l'oste su `renamePet`: `FORBIDDEN`; personaggio archiviato: `NOT_FOUND` già dalla guardia.
- SDL: solo aggiunte (`renamePet` in `type Mutation`, `input RenamePetRequest`); il gate delle righe tolte rispetto a `2c462cbe` (esclusa la riga di `useItem` del piano 07) stampa 0.
- Grep di accettazione tutti verdi. Il grep del piano su `Plan: 08 of 18` NON combacia: lo STATE usa `Plan: 8 of 18` (senza zero) per istruzione dell'orchestratore.

## Deviazioni dal piano

**1. [Rule 2 - Clean Code/SoC] Planner puro `planRenamePet` in `equip-pet.plan.ts` con 6 casi unitari in `equip-pet.plan.spec.ts`**
- Il piano descriveva la scrittura dentro il servizio; per non duplicare transazione, snapshot, catalogo e guardia la rinomina è un planner puro accanto a equip/unequip, passato al `writePetSlot` esistente. File fuori da `files_modified`: `src/characters/pets/equip-pet.plan.ts` e la sua spec.
- Commit: 040f5b44 (RED), 87b77cfa (GREEN).

**2. [Rule 3 - Blocking] Conteggi delle liste aggiornati**
- `authorization-matrix.int-spec.ts` (ownership 17 → 18, owner-only 7 → 8) e `handler-fixtures.spec.ts` (bersagli personaggio 16 → 17) pinnano la lunghezza delle liste: aggiornati nel commit RED.

## Casi verdi al primo colpo

- Matrice «runs one row per listed handler» e «fixtures cover the lists»: verdi già in RED perché conteggi e fixture sono stati aggiornati insieme alle liste.
- `refuses a species the character does not own` e `answers NOT_FOUND for an archived character` in GREEN senza codice dedicato: li coprono il planner (voce assente) e la guardia di ownership esistente.

## Known Stubs

Nessuno.

## Self-Check: PASSED
