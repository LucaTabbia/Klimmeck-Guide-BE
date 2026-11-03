---
phase: 12-negozi-per-citta
plan: 13
subsystem: shops
tags: [shops, graphql, deprecation, equipmentAssetsQuantity, lootAssetsQuantity, BE-SHOP-02, D-20]
requires: ["12-02", "12-11", "12-12"]
provides:
  - "src/equipmentItems/equipment-items.resolver.ts: equipmentAssetsQuantity con deprecationReason 'Phase 12: use cityShop'"
  - "src/lootItems/loot-items.resolver.ts: lootAssetsQuantity con deprecationReason 'Phase 12: use cityShop'"
  - "test/app.int-spec.ts: test di schema «deprecates the global catalogue queries for cityShop (D-20)»"
  - "test/shops/catalog-sellable.int-spec.ts: «keeps serving lootAssetsQuantity after its deprecation (D-20)»"
affects: [12-15, 12-18]
tech-stack:
  added: []
  patterns:
    - "deprecazione additiva di una query GraphQL con `deprecationReason` nelle opzioni di `@Query`, riga SDL riscritta in place"
key-files:
  created: []
  modified:
    - test/app.int-spec.ts
    - test/shops/catalog-sellable.int-spec.ts
    - src/equipmentItems/equipment-items.resolver.ts
    - src/lootItems/loot-items.resolver.ts
    - src/schema.gql
decisions:
  - "Le due query di catalogo globali restano con firma e comportamento invariati; solo la direttiva `@deprecated` è aggiunta (D-20)"
metrics:
  duration: "~8 min"
  completed: 2026-11-02
  tasks: 1
  files: 5
---

# Phase 12 Plan 13: deprecazione delle query di catalogo globali Summary

`equipmentAssetsQuantity(sellable)` e `lootAssetsQuantity` restano nello schema per compatibilità con la FE fino alla Phase 13, marcate `@deprecated(reason: "Phase 12: use cityShop")`; lo SDL contro origin/develop toglie esattamente le loro due righe e le riaggiunge con la direttiva (D-20, gate C2).

## Task

| Task | Nome | Commit | File |
| ---- | ---- | ------ | ---- |
| 1 (RED) | test di schema della deprecazione | b78599c | test/app.int-spec.ts |
| 1 (GREEN) | deprecationReason sulle due query, SDL dal real boot, prova che loot risponde | 81489b6 | src/equipmentItems/equipment-items.resolver.ts, src/lootItems/loot-items.resolver.ts, src/schema.gql, test/shops/catalog-sellable.int-spec.ts |

## Fallimenti RED osservati

- `npx jest test/app.int-spec.ts --selectProjects integration --runInBand` → 1 fallito, 68 passati; fallisce SOLO «deprecates the global catalogue queries for cityShop (D-20)» con `Expected substring: "equipmentAssetsQuantity(sellable: Boolean): [AssetQuantity!]! @deprecated(reason: \"Phase 12: use cityShop\")"`. Schema rigenerato identico (`git diff --exit-code src/schema.gql` → 0).

## GREEN

- `npx jest test/app.int-spec.ts test/shops/catalog-sellable.int-spec.ts --selectProjects integration --runInBand` → 73/73 (69 + 4).
- SDL: le due righe cambiano in place:
  - `  equipmentAssetsQuantity(sellable: Boolean): [AssetQuantity!]! @deprecated(reason: "Phase 12: use cityShop")`
  - `  lootAssetsQuantity: [AssetQuantity!]! @deprecated(reason: "Phase 12: use cityShop")`
- Gate C2: `git diff origin/develop -- src/schema.gql | grep -E '^-[^-]'` stampa esattamente `-  equipmentAssetsQuantity(sellable: Boolean): [AssetQuantity!]!` e `-  lootAssetsQuantity: [AssetQuantity!]!`.
- Le query rispondono ancora: «keeps filtering equipmentAssetsQuantity by sellable true (D-20)» (già del 12-02) e il nuovo «keeps serving lootAssetsQuantity after its deprecation (D-20)», verde al primo colpo perché la deprecazione non cambia il comportamento (è una prova di non regressione, non una regola nuova).

## Firme

- `@Query(() => [AssetQuantity], { deprecationReason: 'Phase 12: use cityShop' }) equipmentAssetsQuantity(@Args('sellable', { type: () => Boolean, nullable: true }) sellable?: boolean)`
- `@Query(() => [AssetQuantity], { deprecationReason: 'Phase 12: use cityShop' }) lootAssetsQuantity()`

## Deviations from Plan

**1. [Rule 2 - Prova mancante] Test di risposta di `lootAssetsQuantity`**
- **Trovato durante:** Task 1
- **Problema:** il piano prova la deprecazione solo nello SDL; per `lootAssetsQuantity` non esisteva una spec che provasse che la query risponde ancora (l'orchestratore la richiede).
- **Correzione:** test in `test/shops/catalog-sellable.int-spec.ts` (file fuori da `files_modified`), committato col GREEN.
- **Commit:** 81489b6

## Gate

- `npx tsc --noEmit -p tsconfig.json` → 0.
- `npx prettier --write` + `npx eslint` sui quattro `.ts` toccati: tutti già conformi (nessun commit `style`); eslint su `test/app.int-spec.ts` stampa solo il warning preesistente `no-base-to-string` (riga 848).
- `grep -c "Phase 12: use cityShop" src/schema.gql` → 2; `deprecationReason` 1 per resolver.
- `git diff --exit-code src/schema.gql` → 0 dopo ogni commit; nessun trailer; `pgrep -fl jest` vuoto.

## Threat Flags

Nessuna superficie nuova; T-12-19 mitigata (nessuna rimozione né cambio di firma, gate C2 esatto).

## Self-Check: PASSED
