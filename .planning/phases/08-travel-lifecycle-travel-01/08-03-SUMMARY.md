---
phase: 08-travel-lifecycle-travel-01
plan: 03
subsystem: quests
tags: [quests, catalog, populate, mongoose, refPath, D-31]
requires: ["08-01"]
provides:
  - "assetQuantitySchemaAt(path): clone di AssetQuantitySchema con refPath assoluto `${path}.itemType` (solo catalogo quest)"
  - "src/quests/quest-catalog.populate.ts: QUEST_CATALOG_POPULATE (markerLocation, enemy, relatedLore, recommendedLoot.item, prizeItem.item, randomLoot.item) e dropOrphanCatalogRefs puro"
  - "QuestsService.findAll/findOne popolano tutti i ref selezionati dal FE e scartano gli orfani; quest(id) inesistente o malformato ⇒ NOT_FOUND 'Missione non trovata'"
  - "QuestsModule autosufficiente: forFeature Quest, PointOfInterest, Enemy, Lore, EquipmentItem, LootItem (C3)"
affects: [08-06, FE Phase 6]
tech-stack:
  added: []
  patterns:
    - "schema di sotto-documento clonato per uso con refPath assoluto quando il refPath relativo non risolve negli array annidati"
    - "pulizia in memoria degli orfani dopo il populate per proteggere liste non nulle sul filo"
key-files:
  created:
    - src/quests/quest-catalog.populate.ts
    - src/quests/quest-catalog.populate.spec.ts
    - src/quests/quests.resolver.int-spec.ts
  modified:
    - src/models/common/asset-quantity.model.ts
    - src/models/quest/quest-requirements.model.ts
    - src/models/quest/quest-prizes.model.ts
    - src/quests/quests.service.ts
    - src/quests/quests.module.ts
key-decisions:
  - "AssetQuantitySchema originale invariato (refPath 'itemType') per personaggi e negozio; il catalogo quest usa cloni con refPath assoluto (requirements.recommendedLoot, prizes.prizeItem, prizes.randomLoot)"
  - "Orfani: enemy ⇒ null (campo nullable), voci orfane di relatedLore/recommendedLoot/randomLoot scartate, prizeItem con item orfano ⇒ prizeItem null"
  - "quest(id): objectIdFromHex + ResourceNotFoundException.quest() al posto del NotFoundException grezzo (prima INTERNAL_SERVER_ERROR)"
metrics:
  duration: 6 min
  completed: 2026-10-21
  tasks: 2
  files: 8
---

# Phase 8 Plan 03: Populate del catalogo quest (D-31) Summary

`quests` e `quest(id)` popolano sul filo `enemy`, `relatedLore` e gli `item` di `recommendedLoot`, `prizeItem` e `randomLoot` (più `markerLocation`) con le selezioni FE verbatim, senza cambiare lo SDL; i ref orfani non fanno mai fallire la lista e `quest(id)` risponde `NOT_FOUND` tipizzato.

## Tasks

| # | Task | Commits |
|---|------|---------|
| 0 | Formattazione dei 4 file legacy (executor_rules) | f10b667 `style(quests): format the quest catalog files` |
| 1 | refPath assoluto per gli AssetQuantity del catalogo + `dropOrphanCatalogRefs` puro | 202879b (RED), 41a92c0 (GREEN) |
| 2 | Populate in QuestsService, NOT_FOUND tipizzato, int-spec sul filo | 71d1a0f (RED), 75b63fa (GREEN) |

## TDD evidence

**Task 1 RED** (`npx jest src/quests/quest-catalog.populate.spec.ts --selectProjects unit`, stub che restituiscono l'originale e una costante vuota):
```
✕ declares the absolute refPath of the given path
✓ leaves the original relative refPath untouched
✕ uses absolute refPaths in the prizes
✕ uses an absolute refPath in the recommended loot
✕ populates every ref the FE selects on the catalog
✕ drops orphan entries and nulls an orphan prize item
✓ keeps a resolved prize item
✓ tolerates missing sections
Tests: 5 failed, 3 passed, 8 total
```
GREEN: 8/8; `npx jest ... src/models --selectProjects unit` 6 suite / 58 test verdi.

**Task 2 RED** (`npx jest src/quests/quests.resolver.int-spec.ts --selectProjects integration --runInBand`):
```
✕ populates the enemy, the lore and every catalog item on quests
    "ID cannot represent value: { type: \"Buffer\", data: [Array] }" path quests.0.infos.enemy.id / relatedLore.0.id
✕ keeps the list alive on orphan refs
✕ populates the same refs on quest(id)
✕ answers NOT_FOUND for an unknown or malformed quest id
    code "INTERNAL_SERVER_ERROR", message "Quest with id 64b0000000000000000000ff not found"
✓ requires a bearer
Tests: 4 failed, 1 passed, 5 total
```
GREEN: 5/5; regressione AssetQuantity dei personaggi e negozio (`character-updated.subscription.int-spec.ts`, `shop-transaction.service.int-spec.ts`) verde: 3 suite / 33 test. Unit completi: 89 suite / 1336 test. `npm run build` ok, `git diff --exit-code src/schema.gql` 0, eslint pulito sui file toccati.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Boy Scout] Import inutilizzati in quest-prizes.model.ts**
- **Found during:** Task 1 (eslint sui file toccati)
- **Issue:** `Types` e `AssetItem` importati ma non usati (warning eslint preesistenti)
- **Fix:** rimossi
- **Files modified:** src/models/quest/quest-prizes.model.ts
- **Commit:** 41a92c0

**2. Commento in quests.service.ts riformulato**
- Il commento prescritto citava `NotFoundException` e faceva fallire il criterio `grep -n "NotFoundException" ... | grep -v ResourceNotFoundException`; riformulato in "eccezione Nest grezza", stesso significato.

**3. `quests.forEach((quest) => dropOrphanCatalogRefs(quest))`** invece di `forEach(dropOrphanCatalogRefs)` per non passare indice/array come argomenti extra; comportamento identico.

## Known Stubs

None.

## Threat Flags

None — superficie invariata (stesse query, AuthGuard globale, nessun @Public). T-08-11..T-08-14 mitigati e coperti dai test elencati sopra.

## Self-Check: PASSED

- FOUND: src/quests/quest-catalog.populate.ts, src/quests/quest-catalog.populate.spec.ts, src/quests/quests.resolver.int-spec.ts
- FOUND commits: f10b667, 202879b, 41a92c0, 71d1a0f, 75b63fa
