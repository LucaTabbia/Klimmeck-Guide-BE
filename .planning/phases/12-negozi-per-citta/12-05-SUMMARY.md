---
phase: 12-negozi-per-citta
plan: 05
subsystem: shops
tags: [shops, seeding, prng, constants, BE-SHOP-04, BE-SHOP-01, D-04, D-08, D-09, D-10, D-24]
requires: ["12-04"]
provides:
  - "src/shops/shop-pool.constants.ts: SHOP_SEED_VERSION, SHOP_POOL_SIZES, SHOP_RARITY_WEIGHTS, SHOP_LOOT_GUARANTEES, SELLABLE_PET_PLACEMENTS, SELLABLE_PET_IDS, NO_SHOP_CITY_TYPES, SHOP_REPORT_WARNINGS_LIMIT"
  - "src/shops/seeded-random.ts: seedOf(...parts) e mulberry32(seed)"
affects: [12-06, 12-09]
tech-stack:
  added: []
  patterns:
    - "costanti della semina come `as const satisfies Record<CitySize, …>`: una taglia nuova non compila senza quota e pesi"
    - "seme per città e per lista = primi 4 byte di sha256 delle parti unite da `:`; PRNG mulberry32 senza dipendenze"
key-files:
  created:
    - src/shops/shop-pool.constants.ts
    - src/shops/shop-pool.constants.spec.ts
    - src/shops/seeded-random.ts
    - src/shops/seeded-random.spec.ts
  modified: []
decisions:
  - "Nessuna decisione nuova: valori, nomi e firme come prescritti dal piano (D-04, D-08, D-09, D-10, D-24)"
metrics:
  duration: "~5 min"
  completed: 2026-11-02
  tasks: 2
  files: 4
---

# Phase 12 Plan 05: costanti della semina e PRNG deterministico Summary

Le quote per taglia (10+12, 16+18, 24+24), i pesi di rarità interi (75/25, 50/35/15, 35/35/20/10, mai legendary), le garanzie di loot (2 hunger, 1 heal), i 4 pet in vendita con le loro due città (una capitale ciascuno) e Necrorian senza negozio sono costanti TypeScript tipizzate in `src/shops/shop-pool.constants.ts`; `src/shops/seeded-random.ts` dà un seme a 32 bit stabile da sha256 e un flusso mulberry32 riproducibile, verificato sui valori golden.

## Task e commit

| Task | Nome | Commit |
|------|------|--------|
| 1 RED | spec delle costanti (7 test) | `54b921c` test(shops): pin the shop seeding constants |
| 1 GREEN | `shop-pool.constants.ts` | `b7ccc1d` feat(shops): add the shop seeding constants |
| 2 RED | spec di `seedOf`/`mulberry32` (4 test) | `2d042bb` test(shops): pin the seeded random stream |
| 2 GREEN | `seeded-random.ts` | `7b2f482` feat(shops): add the seeded random stream |

## Fallimenti RED osservati

- Task 1: `Cannot find module './shop-pool.constants' from 'src/shops/shop-pool.constants.spec.ts'` (suite fallita, 0 test eseguiti).
- Task 2: `Cannot find module './seeded-random' from 'src/shops/seeded-random.spec.ts'` (suite fallita, 0 test eseguiti).

## Nomi e firme creati

- `SHOP_SEED_VERSION = 'v1'`
- `interface ShopPoolQuota { readonly equipment: number; readonly loot: number }`; `SHOP_POOL_SIZES` `as const satisfies Record<CitySize, ShopPoolQuota>`
- `interface TierWeight { readonly rarity: RarityType; readonly percent: number }`; `SHOP_RARITY_WEIGHTS` `as const satisfies Record<CitySize, readonly TierWeight[]>`, ordine common → uncommon → rare → ultrarare
- `interface LootGuarantee { readonly effect: EffectType; readonly count: number }`; `SHOP_LOOT_GUARANTEES: readonly LootGuarantee[]` = hunger 2, heal 1
- `interface PetPlacementCity { readonly name: string; readonly type: CityType }`, `interface PetPlacement { readonly petId: string; readonly name: string; readonly cities: readonly PetPlacementCity[] }`; `SELLABLE_PET_PLACEMENTS: readonly PetPlacement[]` (Cavallo leggero `6ae8070540e5e6676b7d6f8d` Fineglen/Valantar; Cammello del Mar Sabbioso `6ae8070540e5e6676b7d6f90` Shadmus/Valantar; Tartaruga gigante delle isole `6ae8070540e5e6676b7d6f94` Croce Marina/Bellport; Cavallo da viaggio `6adfa18e6c2f93eb0b76d34a` Talmvere/Cliffbreak)
- `SELLABLE_PET_IDS: readonly string[]`, `NO_SHOP_CITY_TYPES: readonly CityType[] = [CityType.necrorianCity]`, `SHOP_REPORT_WARNINGS_LIMIT = 50`
- `seedOf(...parts: readonly (string | number)[]): number`; `mulberry32(seed: number): () => number`

## Gate

- `npx jest src/shops/seeded-random.spec.ts src/shops/shop-pool.constants.spec.ts --selectProjects unit`: 11/11 verdi
- `npx jest src/config --selectProjects unit` (drift test, T-12-07): 223/223 verdi
- `npx tsc --noEmit -p tsconfig.json`: 0
- prettier (già conforme) ed eslint (0 problemi) sui quattro file, uno per uno
- `src/schema.gql` invariato; contro origin/develop 11 righe aggiunte, 0 tolte

## Deviazioni dal piano

Nessuna: piano eseguito come scritto. Unica aggiunta: una riga di commento in `seeded-random.ts` che dichiara sha256 come hash di seme e non come primitiva di sicurezza (T-12-07, già nel testo del piano).

## Self-Check: PASSED

- File creati presenti: `src/shops/shop-pool.constants.ts`, `src/shops/shop-pool.constants.spec.ts`, `src/shops/seeded-random.ts`, `src/shops/seeded-random.spec.ts`
- Commit presenti: `54b921c`, `b7ccc1d`, `2d042bb`, `7b2f482`
