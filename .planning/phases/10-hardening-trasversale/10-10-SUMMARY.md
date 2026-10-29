---
phase: 10-hardening-trasversale
plan: 10
subsystem: validation
tags: [validation, catalog, ObjectIdPipe, ObjectIdListPipe, NOT_FOUND, BAD_USER_INPUT, D-02, D-04, F2, BE-HARD-01, BE-HARD-02]
requires:
  - "10-05: ObjectIdPipe / ObjectIdListPipe (MAX_ID_LIST = 100), BadUserInputException"
  - "10-09: modello @Args('<nome>', ObjectIdPipe) e scalar-ids.int-spec"
provides:
  - "ResourceNotFoundException.lore() / pet() / city() / enemy() / lootItem() / equipmentItem()"
  - "ObjectIdPipe sulle 8 query singole del catalogo; ObjectIdListPipe su lootItemsByIds ed equipmentItemsByIds"
  - "nessun NotFoundException grezzo nei service del catalogo"
  - "src/validation/catalog-ids.int-spec.ts"
affects: [10-11, 10-12, 10-30]
tech-stack:
  added: []
  patterns:
    - "voce di catalogo mancante = factory NOT_FOUND con messaggio italiano fisso, mai l'id"
key-files:
  created:
    - src/validation/catalog-ids.int-spec.ts
  modified:
    - src/authz/resource-not-found.exception.ts
    - src/authz/resource-not-found.exception.spec.ts
    - src/lore/lore.resolver.ts
    - src/lore/lore.service.ts
    - src/pets/pets.resolver.ts
    - src/pets/pets.service.ts
    - src/pointsOfInterest/point-of-interest.resolver.ts
    - src/pointsOfInterest/point-of-interest.service.ts
    - src/spells/spells.resolver.ts
    - src/spells/spells.service.ts
    - src/lootItems/loot-items.resolver.ts
    - src/lootItems/loot-items.service.ts
    - src/cities/cities.resolver.ts
    - src/cities/cities.service.ts
    - src/equipmentItems/equipment-items.resolver.ts
    - src/equipmentItems/equipment-items.service.ts
    - src/enemies/enemies.resolver.ts
    - src/enemies/enemies.service.ts
key-decisions:
  - "Un solo commit style(catalog) per i 16 file (come dice il piano), i *.module.ts restano non formattati e intoccati"
  - "Il caso del tetto prova anche il bordo: 100 id ben formati sono accettati"
  - "Boy Scout nei file toccati: import inutilizzati (Mutation, AssetQuantity) rimossi, let → const segnalati da eslint"
requirements-completed: []
duration: ~15 min
completed: 2026-10-29
---

# Phase 10 Plan 10: Id del catalogo validati e NOT_FOUND codificati Summary

**Le otto query singole del catalogo validano l'id con `ObjectIdPipe` (malformato → `BAD_USER_INPUT`), le due liste di item con `ObjectIdListPipe` (≤ 100 id), e gli otto service lanciano `ResourceNotFoundException.<voce>()` con messaggio italiano fisso al posto del `NotFoundException` grezzo che usciva come `INTERNAL_SERVER_ERROR` con l'id nel messaggio.**

## Performance

- **Durata:** ~15 min
- **Completato:** 2026-10-29
- **Task:** 2 (formattazione + RED, GREEN)
- **File:** 1 creato, 18 modificati

## Accomplishments

- D-02 completa sugli argomenti scalari del catalogo; D-04 sulle liste di id degli item.
- F2 Boy Scout: nessun 404 grezzo resta nei service del catalogo, quindi il sanitizer di produzione (10-11) può lasciar passare solo gli errori codificati senza nascondere i `NOT_FOUND` del catalogo.
- Fuga di dettaglio chiusa: prima un id malformato arrivava a Mongoose e il messaggio di cast (`Cast to ObjectId failed … for model "Lore"`) usciva sul filo come `INTERNAL_SERVER_ERROR` (T-10-34); il messaggio di `lore` diceva perfino «Quest with id … not found».
- Effetto collaterale voluto: `RoadsService.getShortestPath` usa `PointOfInterestsService.findOne`, quindi `getPath` con un luogo ben formato inesistente risponde ora `NOT_FOUND` (`Luogo non trovato`) invece di `INTERNAL_SERVER_ERROR`; `src/roads` resta verde (1 suite / 10).

## Task Commits

1. **Task 1 (style):** `8d875a5` — `style(catalog): format the catalog resolvers and services` (16 file, solo Prettier)
2. **Task 1 (RED):** `2d5da6d` — `test(catalog): expect coded catalog lookups`
3. **Task 2 (GREEN):** `d275057` — `feat(catalog): validate catalog ids and code missing entries`

## Fallimenti RED osservati

- Unit `resource-not-found.exception.spec.ts`: 6 rossi su 13 (le sei factory nuove non esistono: `factory()` lancia `is not a function`); i 7 casi esistenti verdi.
- Integration `catalog-ids.int-spec.ts`: 17 rossi su 17.
  - 8 × malformato: ricevuto `INTERNAL_SERVER_ERROR` con il messaggio di cast di Mongoose (`Cast to ObjectId failed for value "abc" … for model "<Modello>"`).
  - 8 × inesistente: ricevuto `INTERNAL_SERVER_ERROR` con il messaggio inglese con l'id (`Pet with id 64b0…ff not found`, e per `lore` `Quest with id … not found`).
  - tetto: 101 id accettati senza errore (`extensions: undefined`).

## Codici spostati sul filo (prima → dopo)

| Operazione | Argomento | Prima | Dopo | Messaggio | Spec / caso |
|---|---|---|---|---|---|
| `lore`, `pet`, `pointOfInterest`, `spell`, `lootItem`, `city`, `equipmentItem`, `enemy` | `id` malformato | `INTERNAL_SERVER_ERROR` (cast di Mongoose) | `BAD_USER_INPUT` | `Input non valido: id` | `catalog-ids.int-spec.ts` › `rejects a malformed id on $name with BAD_USER_INPUT (D-02)` |
| `lore` | `id` inesistente | `INTERNAL_SERVER_ERROR` (`Quest with id … not found`) | `NOT_FOUND` | `Lore non trovata` | `answers a coded NOT_FOUND on $name for a missing id (F2)` |
| `pet` | idem | `INTERNAL_SERVER_ERROR` | `NOT_FOUND` | `Compagno non trovato` | idem |
| `pointOfInterest` (e `getPath` con luogo inesistente) | idem | `INTERNAL_SERVER_ERROR` | `NOT_FOUND` | `Luogo non trovato` | idem |
| `spell` | idem | `INTERNAL_SERVER_ERROR` | `NOT_FOUND` | `Magia non trovata` | idem |
| `lootItem` | idem | `INTERNAL_SERVER_ERROR` | `NOT_FOUND` | `Oggetto non trovato` | idem |
| `city` | idem | `INTERNAL_SERVER_ERROR` | `NOT_FOUND` | `Città non trovata` | idem |
| `equipmentItem` | idem | `INTERNAL_SERVER_ERROR` | `NOT_FOUND` | `Equipaggiamento non trovato` | idem |
| `enemy` | idem | `INTERNAL_SERVER_ERROR` | `NOT_FOUND` | `Nemico non trovato` | idem |
| `lootItemsByIds`, `equipmentItemsByIds` | `ids` > 100 | accettato | `BAD_USER_INPUT` | `Input non valido: ids` | `caps the item id lists at 100 (D-04)` |
| `lootItemsByIds`, `equipmentItemsByIds` | un id malformato nella lista | `INTERNAL_SERVER_ERROR` (cast) | `BAD_USER_INPUT` | `Input non valido: ids` | idem |

## Test

- Unit `src/authz`: 8 suite / 100 test verdi (`resource-not-found.exception.spec.ts` 13/13).
- Integration `src/validation src/lore src/pets src/pointsOfInterest src/spells src/lootItems src/cities src/equipmentItems src/enemies src/economy src/characters test/app.int-spec.ts`: 26 suite / 441 test verdi (boot reale incluso; `catalog-ids.int-spec.ts` 17/17).
- Integration `src/roads` (chiamante interno di `PointOfInterestsService.findOne`): 1 suite / 10 verdi.
- `npm run build` 0; `git diff --exit-code src/schema.gql` 0; contro `origin/develop` lo SDL aggiunge solo `+  pendingQuest: ID` e non rimuove nulla.
- Accettazione: nessun `new NotFoundException` nelle otto cartelle; 8 file con le pipe; 6 factory nuove.

## Deviations from Plan

**1. [Rule 2 - Boy Scout] Pulizia nei file toccati** — rimossi gli import inutilizzati `Mutation` (6 resolver) e `AssetQuantity` (`point-of-interest.resolver.ts`); `let loots` / `let equipments` → `const` (errori `prefer-const` di `npx eslint` sui file toccati). Commit `d275057`.

**2. Test del tetto esteso al bordo** — oltre a 101 id e all'id malformato, il caso prova che 100 id ben formati passano (verde già prima, vincolo di non regressione del limite).

Nota: le istruzioni dell'orchestratore parlavano di un commit `style` per modulo, il piano di un solo commit `style(catalog)` per i 16 file: seguito il piano (tutti i 16 file fallivano `prettier --check`).

## Issues Encountered

Nessuno.

## Next Phase Readiness

- 10-11: nei moduli del catalogo restano solo errori codificati (`BAD_USER_INPUT`, `NOT_FOUND`); il sanitizer può nascondere tutto il resto.
- 10-30: la tabella sopra va nei handoff (id malformato del catalogo → `BAD_USER_INPUT`, voce mancante → `NOT_FOUND` con messaggio italiano).

## Self-Check: PASSED

- Commit `8d875a5`, `2d5da6d`, `d275057` presenti; `src/validation/catalog-ids.int-spec.ts` esiste; `grep -cE "static (lore|pet|city|enemy|lootItem|equipmentItem)\(\)"` sulla factory = 6.
