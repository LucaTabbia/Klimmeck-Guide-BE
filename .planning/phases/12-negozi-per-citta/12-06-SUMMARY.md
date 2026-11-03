---
phase: 12-negozi-per-citta
plan: 06
subsystem: shops
tags: [shops, seeding, draw, veto, BE-SHOP-04, BE-SHOP-01, D-05, D-08, D-09, D-10, D-24, A1]
requires: ["12-05"]
provides:
  - "src/shops/shop-pool.rules.ts: ShelfFlags, isShelfEligible, allowedRaritiesOf, SeedCandidate, isSeedCandidate"
  - "src/shops/shop-pool.draw.ts: tierQuotas, takeWithoutReplacement, drawEquipment, LootDraw, drawLoot, PetShopCity, petsFor"
affects: [12-09, 12-10, 12-11, 12-15]
tech-stack:
  added: []
  patterns:
    - "quote per fascia col resto maggiore su interi (nessuna virgola mobile), pareggi alla fascia più bassa grazie al sort stabile nell'ordine dei pesi"
    - "candidati ordinati per id esadecimale prima del sorteggio: lo stesso catalogo in qualunque ordine dà lo stesso pool"
    - "un flusso mulberry32 per città e per lista (`seedOf(SHOP_SEED_VERSION, cityHex, list)`)"
key-files:
  created:
    - src/shops/shop-pool.draw.ts
    - src/shops/shop-pool.draw.spec.ts
  modified:
    - src/shops/shop-pool.rules.ts
    - src/shops/shop-pool.rules.spec.ts
decisions:
  - "allowedRaritiesOf annota i pesi come `readonly TierWeight[]` prima del map: sull'unione di tuple `as const` eslint segnalava due no-unsafe-return"
  - "petsFor riceve una città `PetShopCity { name?: string | null; type: CityType }` (interfaccia esportata) e restituisce gli `_id` del catalogo nell'ordine di SELLABLE_PET_PLACEMENTS"
  - "drawLoot restituisce prima i garantiti (nell'ordine hunger, hunger, heal) e poi il resto in ordine common → ultrarare"
metrics:
  duration: "~10 min"
  completed: 2026-11-02
  tasks: 2
  files: 4
---

# Phase 12 Plan 06: regole di scaffale e sorteggio deterministico dei pool Summary

Il veto assoluto (`legendary` o `sellable: false` mai sullo scaffale, `sellable` assente o null vale vendibile) e le fasce per taglia vivono in `src/shops/shop-pool.rules.ts`; `src/shops/shop-pool.draw.ts` sorteggia in modo puro e riproducibile i pool di equipaggiamento e loot (quote col resto maggiore, completamento con la fascia inferiore, 2 hunger + 1 heal dentro la quota con `missingGuarantees` al posto di un'eccezione) e piazza i pet solo per nome + CityType.

## Task e commit

| Task | Nome | Commit |
|------|------|--------|
| 1 RED | spec di veto, fasce e candidati alla semina (6 test nuovi) | `c909db2` test(shops): pin the shelf and seeding rules |
| 1 GREEN | `isShelfEligible`, `allowedRaritiesOf`, `isSeedCandidate` | `8b50706` feat(shops): add the shelf and seeding rules |
| 2 RED | spec del sorteggio (15 test) | `e913388` test(shops): pin the deterministic pool draw |
| 2 GREEN | `tierQuotas`, `takeWithoutReplacement`, `drawEquipment`, `drawLoot`, `petsFor` | `d15e931` feat(shops): draw the shop pools deterministically |

## Fallimenti RED osservati

- Task 1: 6 test falliti, 3 passati (i 3 di `hasShopOf`): `TypeError: (0 , shop_pool_rules_1.isShelfEligible / allowedRaritiesOf / isSeedCandidate) is not a function`.
- Task 2: `Test suite failed to run — Cannot find module './shop-pool.draw' from 'src/shops/shop-pool.draw.spec.ts'`.

## Firme create

```typescript
// src/shops/shop-pool.rules.ts
export interface ShelfFlags { rarity?: string | null; sellable?: boolean | null }
export function isShelfEligible(item: ShelfFlags): boolean
export function allowedRaritiesOf(size: CitySize): RarityType[]
export interface SeedCandidate extends ShelfFlags { _id: Types.ObjectId; buyPrice?: unknown; effect?: string | null }
export function isSeedCandidate(item: SeedCandidate, size: CitySize): boolean

// src/shops/shop-pool.draw.ts
export function tierQuotas(total: number, weights: readonly TierWeight[]): Map<RarityType, number>
export function takeWithoutReplacement<T>(candidates: readonly T[], count: number, next: () => number): T[]
export function drawEquipment(cityId: Types.ObjectId, size: CitySize, candidates: readonly SeedCandidate[]): Types.ObjectId[]
export interface LootDraw { ids: Types.ObjectId[]; missingGuarantees: EffectType[] }
export function drawLoot(cityId: Types.ObjectId, size: CitySize, candidates: readonly SeedCandidate[]): LootDraw
export interface PetShopCity { name?: string | null; type: CityType }
export function petsFor(city: PetShopCity, pets: readonly SeedCandidate[]): Types.ObjectId[]
```

## Verifiche

- `npx jest src/shops/shop-pool.draw.spec.ts src/shops/shop-pool.rules.spec.ts --selectProjects unit`: 24/24 verdi (rules 9, draw 15).
- `npx tsc --noEmit -p tsconfig.json`: 0 dopo ogni GREEN.
- Prettier e eslint sui quattro file, uno per uno: conformi, 0 errori, 0 warning.
- `src/schema.gql` invariato (nessun cambio SDL): contro origin/develop 11 righe aggiunte, 0 tolte.
- Grep di accettazione: `isShelfEligible` 1, `isSeedCandidate` 1, `A1)` 1, `tierQuotas` 1, `drawLoot` 1, `petsFor` 1, `D-09)` 3, `D-24)` 4.

## Deviations from Plan

Nessuna deviazione di sostanza. Due dettagli:

- **[Rule 1 - Lint] `allowedRaritiesOf`**: il corpo del piano (`SHOP_RARITY_WEIGHTS[size].map(...)`) faceva emettere a eslint due warning `no-unsafe-return` (map su un'unione di tuple `as const`); risolto annotando una variabile `readonly TierWeight[]`, stesso comportamento. Commit `8b50706`.
- **`PetShopCity`**: il piano scriveva il tipo in linea (`{ name?: string | null; type: CityType }`); è stato esportato come interfaccia con la stessa forma, per riusarlo nella semina (12-09).

I casi verdi al primo colpo nel GREEN sono tutti quelli del piano: il RED fallisce per l'assenza delle funzioni, non per casi singoli.

## Known Stubs

Nessuno.

## Threat Flags

Nessuna superficie nuova: codice puro, nessun accesso a DB, nessun `Math.random`. T-12-08 e T-12-08b mitigati come da piano (spec «never draws a legendary, a sellable false or a priceless item» e completamento + `missingGuarantees`).

## Self-Check: PASSED

- File creati presenti: `src/shops/shop-pool.draw.ts`, `src/shops/shop-pool.draw.spec.ts`.
- Commit presenti: `c909db2`, `8b50706`, `e913388`, `d15e931`.
