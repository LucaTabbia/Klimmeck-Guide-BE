---
phase: 26-eliminazione-account-e-consenso
plan: 01
subsystem: models, characters
tags: [account-deletion, character-owner, mongoose-index]
requires: []
provides:
  - "campo interno Character.user (ObjectId dell'utente, default null, solo @Prop)"
  - "indice { user: 1 } col nome character_user (CHARACTER_USER_INDEX)"
  - "proprietario scritto alla creazione nella transazione del claim di currentCharacter"
affects: [26-06, 26-07]
tech-stack:
  added: []
  patterns:
    - "prova dell'assenza dal filo in una spec unitaria con LazyMetadataStorage.load + TypeMetadataStorage.compileClassMetadata"
key-files:
  created: []
  modified:
    - src/models/character/character.model.ts
    - src/models/character/character.model.spec.ts
    - src/characters/creation/character-creation.service.ts
    - src/characters/creation/character-creation.resolver.int-spec.ts
decisions:
  - "Character.user con ref a stringa 'User' (import inverso circolare con user.model.ts)"
  - "Assenza dal filo provata sia in unità (campi GraphQL di Character con toEqual) sia sul filo (selezione di user rifiutata) e con lo SDL rigenerato invariato"
metrics:
  duration: "3 min"
  completed: 2026-11-25
  tasks: 3
  files: 4
---

# Phase 26 Plan 01: proprietario del personaggio Summary

Campo interno `Character.user` (ObjectId, default `null`, mai `@Field`) con indice `character_user`, scritto da `claimUserAndInsertCharacter` nella stessa transazione del claim di `currentCharacter`; `src/schema.gql` invariato, nessun migratore (D-24, D-11).

## Task

| Task | Nome | Commit |
|------|------|--------|
| 1 RED | spec dello schema: indice, fuori dal filo, assente = null | `e30e3dca` |
| 1 GREEN | campo, costante e indice sul modello | `22b522d3` |
| 2 RED | int-spec della creazione: proprietario a DB, mai sul filo | `ea05d3a6` |
| 2 GREEN | `user: userId` nella create della transazione | `c5d8c413` |
| 3 | bookkeeping | commit `docs(phase-26): record plan 01 progress` |

## RED attesi e osservati

- `declares the owner index of a character (D-24)`: rosso, l'array di `CharacterSchema.indexes()` non conteneva `{ user: 1 }` (atteso).
- `reads a character without owner as owner null (D-11)`: rosso, `user` era `undefined` (atteso: campo assente).
- `keeps the owner out of GraphQL (D-24)`: **verde al primo colpo**, è una guardia: prima del GREEN il campo non esisteva affatto. Nessuna spec del repo leggeva `TypeMetadataStorage`; la spec carica i metadati pigri con `LazyMetadataStorage.load([Character])` (import da `@nestjs/graphql/dist/schema-builder/storages/lazy-metadata.storage`, non esportato dall'indice del pacchetto) e confronta con `toEqual` l'elenco intero dei campi GraphQL (`assets`, `id`, `infos`, `quests`, `status`).
- `records the owner on the created character (D-24)`: rosso, `user` del documento a DB era `null` (default del Task 1).
- `serves the created character without its owner (D-24)`: **verde al primo colpo**, come previsto dal piano: il campo non ha `@Field`, quindi la risposta ha solo le chiavi selezionate (`id`, `infos`) e la mutation che seleziona `currentCharacter { id user }` è rifiutata in validazione con `Cannot query field "user"`.

## Verifiche

- `npx jest src/models/character/character.model.spec.ts --selectProjects unit`: 12/12 verdi.
- `npx jest src/characters/creation/character-creation.resolver.int-spec.ts test/app.int-spec.ts --selectProjects integration --runInBand`: 2 suite, 134/134 verdi.
- SDL rigenerato dal boot reale di test: `git diff --exit-code src/schema.gql` esce 0; `git diff 9a084248 -- src/schema.gql` vuoto.
- `CharacterInput` non è cambiato (`awk '/class CharacterInput/,/^}/' … | grep -c user` = 0).
- `npx tsc --noEmit -p tsconfig.json` esce 0; prettier ed eslint puliti sui quattro file; `pgrep -fl 'bin/jest'` vuoto.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] cast dell'id utente nella int-spec**
- **Found during:** Task 2 GREEN (`tsc`)
- **Issue:** `user._id` di `UserDocument` è `unknown` per il compilatore: il caso RED girava con ts-jest ma `tsc --noEmit` falliva.
- **Fix:** `user._id as Types.ObjectId` nel confronto; incluso nel commit GREEN `c5d8c413`.

### Bookkeeping

- La riga della Phase 26 nella Progress Table esisteva già (`0/14 | Planned`): aggiornata a `1/14 | In Progress` invece di aggiungerla (istruzione dell'orchestratore).
- STATE `Plan: 01 of 14` (due cifre, come vogliono il piano e le REPO-RULES ereditate; il brief dell'orchestratore scriveva `1 of 14`).

## Known Stubs

Nessuno.

## Self-Check: PASSED

- File modificati presenti; commit `e30e3dca`, `22b522d3`, `ea05d3a6`, `c5d8c413` nel log.
