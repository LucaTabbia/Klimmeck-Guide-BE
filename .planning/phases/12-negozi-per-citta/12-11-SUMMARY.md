---
phase: 12-negozi-per-citta
plan: 11
subsystem: shops
tags: [shops, graphql, cityShop, BE-SHOP-02, BE-SHOP-04, D-03, D-04, D-05, D-06, D-12, D-18]
requires: ["12-10"]
provides:
  - "src/shops/shop-pool.rules.ts: shelfInPoolOrder(poolIds, items)"
  - "src/models/shop/city-shop.model.ts: CityShop { city; equipment; loot; pets }"
  - "src/shops/city-shop.service.ts: CityShopService.read(cityId)"
  - "src/shops/city-shop.resolver.ts: CityShopResolver, query cityShop(cityId: ID!): CityShop!"
  - "src/shops/shops.module.ts: ShopsModule importa CitiesModule, provider CityShopService e CityShopResolver, montato da AppModule"
affects: [12-12, 12-13, 12-15, 12-18]
tech-stack:
  added: []
  patterns:
    - "veti di D-05 applicati in lettura su una lista curata a DB, nell'ordine della lista, senza ripetizioni"
    - "una lettura per lista con filtro su `_id` in `$in`, saltata se la lista è vuota"
key-files:
  created:
    - src/models/shop/city-shop.model.ts
    - src/shops/city-shop.service.ts
    - src/shops/city-shop.service.int-spec.ts
    - src/shops/city-shop.resolver.ts
    - src/shops/city-shop.resolver.int-spec.ts
  modified:
    - src/shops/shop-pool.rules.ts
    - src/shops/shop-pool.rules.spec.ts
    - src/shops/shops.module.ts
    - src/app.module.ts
    - src/schema.gql
decisions:
  - "shelfInPoolOrder scarta anche gli id ripetuti nella lista curata: il primo vince, l'ordine resta quello del DB"
  - "Nessun filtro di taglia in lettura: un ultrarare messo a mano in un villaggio viene servito (la mano vince, D-05)"
  - "ShopsModule è importato da AppModule subito dopo ShopMaintenanceModule; CitiesModule importato anche da ShopsModule per i ResolveField size/hasShop su CityShop.city (Nest deduplica il modulo)"
metrics:
  duration: "~20 min"
  completed: 2026-11-02
  tasks: 2
  files: 10
---

# Phase 12 Plan 11: query del negozio di una città Summary

La query `cityShop(cityId: ID!): CityShop!` (D-18) serve il pool curato a DB della città nell'ordine della lista, con quantità 1 (scorte infinite, D-12) e i soli veti di D-05 applicati in lettura (legendary, `sellable: false`, pet solo-quest): nessun filtro di taglia, un oggetto fuori taglia messo a mano viene servito. Id orfani e non validi sono scartati, gli id curati come stringa esadecimale sono tollerati (D-03). Città non seminata o Necrorian: liste vuote e `hasShop: false`; città inesistente `NOT_FOUND`, id malformato `BAD_USER_INPUT`, richiesta anonima `UNAUTHENTICATED`. Provato solo sull'harness `MongoMemoryReplSet` e sul real boot di `test/app.int-spec.ts`.

## Task e commit

| Task | Fase | Commit | Descrizione |
| ---- | ---- | ------ | ----------- |
| 1 | RED | 56fea75 | `test(shops): pin the city shop read` — 3 test unit + 8 integration |
| 1 | GREEN | e61e99e | `feat(shops): read the shop of a city` |
| 2 | RED | 9983197 | `test(shops): pin the cityShop query` — 4 test integration |
| 2 | GREEN | eb8055e | `feat(shops): expose the cityShop query` (codice + SDL dal real boot) |

## RED osservato

- Task 1 unit: `shelfInPoolOrder is not a function`, 3 falliti / 9 passati.
- Task 1 integration: `Cannot find module './city-shop.service'`, 0 test eseguiti.
- Task 2: 4/4 falliti con `GRAPHQL_VALIDATION_FAILED` («Cannot query field "cityShop" on type "Query"»), compreso il test anonimo.

## Nomi e firme

- `shelfInPoolOrder<T extends ShelfFlags & { _id: Types.ObjectId }>(poolIds: readonly unknown[] | null | undefined, items: readonly T[]): T[]` in `src/shops/shop-pool.rules.ts` (usa `refIdOf` di `src/mongo/document-id.ts`).
- `CityShop` (`@ObjectType`) in `src/models/shop/city-shop.model.ts`: `city: City`, `equipment: AssetQuantity[]`, `loot: AssetQuantity[]`, `pets: Pet[]`.
- `CityShopService` (`@InjectModel` City, EquipmentItem, LootItem, Pet in quest'ordine), `read(cityId: string): Promise<CityShop>`: `findById` idratato (nessun populate dei pool), tre letture in parallelo fuori transazione, `populate('addedSpell')` sugli equipaggiamenti, voci `{ itemType, item, quantity: 1 }`.
- `CityShopResolver` (`@Resolver()`), `cityShop(@Args('cityId', { type: () => ID }, ObjectIdPipe) cityId: string)`.
- SDL aggiunto: `type CityShop { city: City! equipment: [AssetQuantity!]! loot: [AssetQuantity!]! pets: [Pet!]! }` e `cityShop(cityId: ID!): CityShop!` in `type Query`.

## Deviations from Plan

- **[Rule 3 - Blocking] tipo dell'helper nella spec del servizio.** Il RED tipava `namesOf` su `{ item: { name: string } }[]`; tsc lo rifiutava contro `AssetQuantity[]` (`name` opzionale). Tipato su `AssetQuantity` nel commit GREEN e61e99e.
- Il generico `shelve<T extends ShelfFlags>(model: Model<any>, …)` del servizio converte con `as` il risultato di `exec()` (come `ShopPoolReportService` usa `Model<any>`): i tipi `XDocument` hanno `_id` non tipizzato come `ObjectId`.
- Test aggiunto oltre il piano: `serves nothing from an absent pool (D-04)` in `shop-pool.rules.spec.ts` (verde al GREEN).

## Gates

- `npx tsc --noEmit -p tsconfig.json` → 0 dopo ogni GREEN.
- Unit `src/shops` 53/53; integration `src/shops` + `src/cities` 51/51; `city-shop.resolver.int-spec.ts` + `test/app.int-spec.ts` 72/72 (i test dell'authorization surface invariati e verdi).
- prettier + eslint puliti sui file toccati, uno per uno.
- `src/schema.gql` contro origin/develop: 18 righe aggiunte, 0 tolte; `git diff --exit-code src/schema.gql` → 0.

## Known Stubs

Nessuno.

## Self-Check: PASSED

- File creati presenti: `src/models/shop/city-shop.model.ts`, `src/shops/city-shop.service.ts`, `src/shops/city-shop.service.int-spec.ts`, `src/shops/city-shop.resolver.ts`, `src/shops/city-shop.resolver.int-spec.ts`.
- Commit presenti: 56fea75, e61e99e, 9983197, eb8055e.
