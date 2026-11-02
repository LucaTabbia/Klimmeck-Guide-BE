---
phase: 12-negozi-per-citta
plan: 12
subsystem: shops
tags: [shops, graphql, shopPoolReport, innkeeper, BE-SHOP-01, D-06, D-21]
requires: ["12-10", "12-11"]
provides:
  - "src/models/shop/shop-pool-report.model.ts: ShopPoolReportItem { id; name; rarity }, ShopPoolReportEntry { cityId; cityName; size; emptyPool; outOfSize; vetoed; missing }"
  - "src/shops/shop-admin.resolver.ts: ShopAdminResolver, query innkeeper shopPoolReport: [ShopPoolReportEntry!]!"
  - "src/shops/shops.module.ts: ShopAdminResolver nei providers"
  - "test/app.int-spec.ts: 'ShopAdminResolver.shopPoolReport' in EXPECTED_INNKEEPER_HANDLERS"
affects: [12-13, 12-15, 12-18]
tech-stack:
  added: []
  patterns:
    - "query admin di sola lettura con `@Roles(RoleType.innkeeper)`, enumerata nel real boot in RED prima di montarla"
key-files:
  created:
    - src/models/shop/shop-pool-report.model.ts
    - src/shops/shop-admin.resolver.ts
    - src/shops/shop-admin.resolver.int-spec.ts
  modified:
    - test/app.int-spec.ts
    - src/shops/shops.module.ts
    - src/schema.gql
decisions:
  - "Il report espone solo `entries` del servizio (le città seminate con violazioni); il conteggio delle non seminate resta nel log di boot"
metrics:
  duration: "~10 min"
  completed: 2026-11-02
  tasks: 2
  files: 6
---

# Phase 12 Plan 12: query innkeeper shopPoolReport Summary

Query GraphQL `shopPoolReport` riservata all'innkeeper che restituisce le stesse violazioni delle WARN al boot (fuori taglia, vietati, mancanti, pool vuoti) leggendo `ShopPoolReportService.report().entries`, senza alcuna scrittura (D-06, D-21).

## Task

| Task | Nome | Commit | File |
| ---- | ---- | ------ | ---- |
| 1 | RED dell'enumerazione innkeeper-only | ae312ed | test/app.int-spec.ts |
| 2 (RED) | int-spec della query | 14995e6 | src/shops/shop-admin.resolver.int-spec.ts |
| 2 (GREEN) | modelli, resolver, modulo, SDL | d6839af | src/models/shop/shop-pool-report.model.ts, src/shops/shop-admin.resolver.ts, src/shops/shops.module.ts, src/schema.gql |

## Fallimenti RED osservati

- Task 1: `npx jest test/app.int-spec.ts --selectProjects integration --runInBand` → 1 fallito, 67 passati; fallisce SOLO «exposes exactly the enumerated innkeeper-only handlers» (come atteso). Schema invariato.
- Task 2: `src/shops/shop-admin.resolver.int-spec.ts` → 4/4 falliti con `GRAPHQL_VALIDATION_FAILED` «Cannot query field "shopPoolReport" on type "Query"».

## GREEN

- `npx jest src/shops/shop-admin.resolver.int-spec.ts test/app.int-spec.ts --selectProjects integration --runInBand` → 72/72 (4 + 68), compresa l'enumerazione innkeeper-only.
- Test: «lets the innkeeper read the pools out of the rules (D-06)» (Fineglen con un ultrarare fuori taglia e un leggendario vietato, Porto Saldo con le tre liste vuote = `emptyPool: true`, Necrorian vuota assente, Valantar in regola assente), «answers an empty list when every seeded pool follows the rules (D-06)» (una città non seminata non compare), «refuses an adventurer and a guard with FORBIDDEN (D-06)», «never writes while reporting (D-06)» (collection `cities` grezza identica prima e dopo).
- SDL: `shopPoolReport: [ShopPoolReportEntry!]!` in `type Query` (dopo `serverTime`), `type ShopPoolReportEntry` e `type ShopPoolReportItem` (17 righe aggiunte). Contro origin/develop: 33 righe aggiunte, 0 tolte.

## Firme create

- `@ObjectType() ShopPoolReportItem { @Field(() => ID) id: string; @Field(() => String, { nullable: true }) name: string | null; @Field(() => String, { nullable: true }) rarity: string | null }`
- `@ObjectType() ShopPoolReportEntry { cityId: ID; cityName: String; size: CitySize; emptyPool: Boolean; outOfSize: [ShopPoolReportItem]; vetoed: [ShopPoolReportItem]; missing: [ID] }`
- `@Resolver() ShopAdminResolver { constructor(private readonly poolReport: ShopPoolReportService); @Roles(RoleType.innkeeper) @Query(() => [ShopPoolReportEntry]) shopPoolReport(): Promise<ShopPoolReportEntry[]> }`

## Deviations from Plan

None - plan executed exactly as written.

## Gate

- `npx tsc --noEmit -p tsconfig.json` → 0 dopo RED e GREEN.
- `npx prettier --write` + `npx eslint` sui quattro `.ts` toccati: puliti; `test/app.int-spec.ts` era già conforme a Prettier (nessun commit `style`).
- `git diff --exit-code src/schema.gql` → 0 dopo ogni commit; nessun trailer nei commit; `pgrep -fl jest` vuoto.

## Threat Flags

Nessuna superficie nuova oltre T-12-18 / T-12-18b / T-12-18c del piano (mitigate dal ruolo, dall'enumerazione e dal test di sola lettura).

## Self-Check: PASSED
