---
phase: 12-negozi-per-citta
plan: 01
subsystem: cities/shops
tags: [cities, shops, graphql, schema, BE-SHOP-01, D-01, D-02, D-03, D-04, D-22, D-23]
requires: []
provides:
  - "enum CitySize (village | city | capital) registrato in src/models/enums/city-size.enum.ts"
  - "src/cities/city-size.ts: CITY_SIZE_BY_TYPE (satisfies Record<CityType, CitySize>) e citySizeOf(type)"
  - "City.shopEquipment / shopLoot / shopPets: solo Mongoose, ref tipati, default undefined"
  - "src/shops/shop-pool.rules.ts: ShopPoolLists e hasShopOf(city)"
  - "City.size: CitySize! e City.hasShop: Boolean! come @ResolveField di CitiesResolver"
  - "12-VALIDATION.md compilata per i 19 piani (38 righe)"
affects: [12-02, 12-06, 12-09, 12-10, 12-11, 12-15, 12-18]
tech-stack:
  added: []
  patterns:
    - "mappa esaustiva con `as const satisfies Record<Enum, Valore>`: un valore nuovo dell'enum non compila"
    - "liste opzionali Mongoose con `default: undefined` per distinguere assente da vuoto (D-22)"
    - "campi calcolati con @ResolveField sul resolver esistente, classe del modello senza @Field"
key-files:
  created:
    - src/models/enums/city-size.enum.ts
    - src/cities/city-size.ts
    - src/cities/city-size.spec.ts
    - src/models/shop-fields.schema.spec.ts
    - src/shops/shop-pool.rules.ts
    - src/shops/shop-pool.rules.spec.ts
    - src/cities/cities.resolver.int-spec.ts
  modified:
    - .planning/phases/12-negozi-per-citta/12-VALIDATION.md
    - src/models/city.model.ts
    - src/cities/cities.resolver.ts
    - test/app.int-spec.ts
    - src/schema.gql
decisions:
  - "Il test per suffisso calcola l'atteso con un helper locale `sizeFromSuffix` (Village → village, Capital → capital, altrimenti city), indipendente dalla mappa"
  - "La prova dei ref legge `caster.instance` e `caster.options.ref` del path array (Mongoose 8)"
  - "cities.resolver.int-spec crea un marker POI reale (`persistCity(cities, overrides, pointsOfInterest)`) per i populate di CitiesService"
metrics:
  duration: "~25 min"
  completed: 2026-11-02
  tasks: 3
  files: 12
---

# Phase 12 Plan 01: taglia della città e flag del negozio Summary

`City.size` dedotto dal `CityType` con una mappa esaustiva tipizzata e `City.hasShop` calcolato dalle tre liste del pool, che esistono solo a DB con `default: undefined`; VALIDATION della fase compilata.

## Task e commit

| Task | Nome | Commit |
|------|------|--------|
| 1 | VALIDATION compilata (38 righe, 19 piani) | `6d6744e` docs(phase-12): fill the validation strategy |
| 2 RED | spec di `citySizeOf` | `60cdfb2` test(cities): pin the city size of every CityType |
| 2 GREEN | `CitySize`, `CITY_SIZE_BY_TYPE`, `citySizeOf` | `6ac11c9` feat(cities): derive the city size from the CityType |
| 3 RED | spec di schema, regole, resolver, real boot | `ffadb35` test(cities): pin the pool fields and the computed shop flags |
| 3 GREEN | campi del pool, `hasShopOf`, `@ResolveField`, SDL | `4985cae` feat(cities): expose the city size and the shop flag |

## Fallimenti RED osservati

- Task 2: `src/cities/city-size.spec.ts` non carica (`Cannot find module 'src/models/enums/city-size.enum'`), 0 test eseguiti.
- Task 3 unit: `shop-pool.rules.spec.ts` non carica (`Cannot find module './shop-pool.rules'`); in `shop-fields.schema.spec.ts` falliscono i 3 casi `stores the pool lists as typed references (D-03)` (path assente).
- Task 3 integration: falliscono i 4 test di `cities.resolver.int-spec.ts` (campi `size`/`hasShop` assenti dallo schema) e `writes the city size and the shop flag into the generated schema without the pool lists (D-01, D-18)` del real boot (72 test, 5 rossi).
- Verdi al primo colpo (annotati): `leaves the three pool lists absent on create (D-22)` — senza i campi lo strict mode di Mongoose scarta già le chiavi; `keeps a stored empty pool list empty (D-03)` — `hydrate` non applica lo strict e conserva `[]`. Restano come guardie di regressione: dopo il GREEN provano che `default: undefined` non scrive `[]` su create.

## Nomi e firme creati

- `export enum CitySize { village = 'village', city = 'city', capital = 'capital' }` + `registerEnumType(CitySize, { name: 'CitySize' })` — `src/models/enums/city-size.enum.ts`
- `export const CITY_SIZE_BY_TYPE = { … } as const satisfies Record<CityType, CitySize>` (13 village, 11 city, 9 capital) e `export function citySizeOf(type: CityType): CitySize` — `src/cities/city-size.ts`
- `City.shopEquipment?: Types.ObjectId[]` (ref `'EquipmentItem'`), `City.shopLoot?` (ref `'LootItem'`), `City.shopPets?` (ref `'Pet'`), tutti `@Prop({ type: [{ type: MongooseSchema.Types.ObjectId, ref }], default: undefined })` senza `@Field` — `src/models/city.model.ts`
- `export interface ShopPoolLists { shopEquipment?; shopLoot?; shopPets?: readonly unknown[] | null }` e `export function hasShopOf(city: ShopPoolLists): boolean` — `src/shops/shop-pool.rules.ts`
- `CitiesResolver.size(@Parent() city: City): CitySize` (`@ResolveField('size', () => CitySize)`) e `CitiesResolver.hasShop(@Parent() city: City): boolean` (`@ResolveField('hasShop', () => Boolean)`)
- SDL: `enum CitySize { capital city village }`, `type City` con `hasShop: Boolean!` e `size: CitySize!` (diff vs `origin/develop`: 0 righe tolte)

## Gate

- `npx tsc --noEmit -p tsconfig.json` → 0
- unit: `city-size.spec.ts` 36/36; `shop-fields.schema.spec.ts` + `shop-pool.rules.spec.ts` 8/8
- integration: `cities.resolver.int-spec.ts` + `test/app.int-spec.ts` 72/72 (`--runInBand`)
- prettier + eslint sui file `.ts` toccati: puliti; un warning `no-base-to-string` preesistente a `test/app.int-spec.ts:836`, non toccato
- `git diff --exit-code src/schema.gql` → 0; `git diff origin/develop -- src/schema.gql | grep -cE '^-[^-]'` → 0

## Deviations from Plan

Nessuna: piano eseguito come scritto.

## Known Stubs

Nessuno. I campi del pool restano assenti finché la semina (12-09) non li scrive: è il comportamento voluto (D-22).

## Self-Check: PASSED

File creati presenti; commit `6d6744e`, `60cdfb2`, `6ac11c9`, `ffadb35`, `4985cae` presenti in `git log`.
