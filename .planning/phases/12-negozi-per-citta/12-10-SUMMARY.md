---
phase: 12-negozi-per-citta
plan: 10
subsystem: shops
tags: [shops, report, boot, maintenance, BE-SHOP-01, BE-SHOP-06, D-03, D-04, D-05, D-06, D-16, D-24]
requires: ["12-07", "12-08", "12-09"]
provides:
  - "src/shops/shop-pool.report.ts: ReportedItem, ShopPoolViolation, CatalogueEntry, ShopCatalogue, ReportedCity, isSeeded, violationsOf, hasViolations, describeViolation"
  - "src/shops/shop-pool-report.service.ts: ShopPoolReport, ShopPoolReportService.report"
  - "src/shops/shops.module.ts: ShopsModule (forFeature City/EquipmentItem/LootItem/Pet, esporta ShopPoolReportService e MongooseModule)"
  - "src/shops/maintenance/shop-boot.ts: ShopBoot (OnApplicationBootstrap)"
  - "src/shops/maintenance/shop-maintenance.module.ts: ShopMaintenanceModule (solo AppModule)"
affects: [12-12, 12-18]
tech-stack:
  added: []
  patterns:
    - "orchestratore di boot unico con un try/catch per passo e describeError: ordine fisso, mai bloccante"
    - "modulo di servizi senza hook (ShopsModule) separato dal modulo di manutenzione (ShopMaintenanceModule) importato solo da AppModule"
key-files:
  created:
    - src/shops/shop-pool.report.ts
    - src/shops/shop-pool.report.spec.ts
    - src/shops/shop-pool-report.service.ts
    - src/shops/shop-pool-report.service.int-spec.ts
    - src/shops/shops.module.ts
    - src/shops/maintenance/shop-boot.ts
    - src/shops/maintenance/shop-boot.spec.ts
    - src/shops/maintenance/shop-boot.int-spec.ts
    - src/shops/maintenance/shop-maintenance.module.ts
  modified:
    - src/app.module.ts
decisions:
  - "Una città senza nome è riportata con il proprio esadecimale come cityName (il report non resta mai senza etichetta)"
  - "I pet non hanno controllo di taglia: per i compagni il report segnala solo mancanti e vietati (sellable false)"
  - "La riga di riepilogo del report al boot si emette solo se ci sono violazioni o città non seminate: su un DB vuoto il boot resta silenzioso"
metrics:
  duration: "~20 min"
  completed: 2026-11-02
  tasks: 3
  files: 10
---

# Phase 12 Plan 10: report dei pool e manutenzione dei negozi al boot Summary

Report di sola lettura dei pool fuori regola (funzioni pure `violationsOf` / `hasViolations` / `describeViolation` più `ShopPoolReportService.report()`), orchestratore `ShopBoot` che al boot esegue nell'ordine `PetSellableMigrator.migrate` → `OwnedPetsMigrator.migrate` → `ShopPoolSeeder.seedAll` → WARN del report, ciascun passo nel proprio try/catch con `describeError`, e i due moduli: `ShopsModule` (servizi condivisi, importabile dagli harness) e `ShopMaintenanceModule` (importato solo da `AppModule`, subito dopo `CitiesModule`). Provato solo sull'harness `MongoMemoryReplSet` e sul real boot di `test/app.int-spec.ts`: il database reale non è stato toccato.

## Task e commit

| Task | Fase | Commit | Descrizione |
| ---- | ---- | ------ | ----------- |
| 1 | RED | 4c85dc3 | `test(shops): pin the shop pool report` — 11 test unit |
| 1 | GREEN | 0fc7356 | `feat(shops): report the shop pools out of the rules` |
| 2 | RED | 933bfa6 | `test(shops): pin the shop pool report service` — 3 test integration |
| 2 | GREEN | 43e63cc | `feat(shops): read the shop pool report` |
| 3 | RED | 6ae188f | `test(shops): pin the shop maintenance at boot` — 4 test unit + 3 integration |
| 3 | GREEN | 39c815c | `feat(shops): run the shop maintenance at boot` |

## RED osservato

- Task 1: `Cannot find module './shop-pool.report'`, 0 test eseguiti.
- Task 2: `Cannot find module './shop-pool-report.service'`, 0 test eseguiti.
- Task 3: `Cannot find module './shop-boot'` sia nella spec unit sia nella int-spec, 0 test eseguiti.

Al GREEN tutti i test sono passati al primo giro.

## Firme create

- `src/shops/shop-pool.report.ts`: `ReportedItem { id: string; name: string | null; rarity: string | null }`; `ShopPoolViolation { cityId: string; cityName: string; size: CitySize; emptyPool: boolean; outOfSize: ReportedItem[]; vetoed: ReportedItem[]; missing: string[] }`; `CatalogueEntry { _id: Types.ObjectId; name?; rarity?; sellable? }`; `ShopCatalogue { equipment; loot; pets: ReadonlyMap<string, CatalogueEntry> }` (chiave esadecimale); `ReportedCity { _id; name?; type: CityType; shopEquipment?; shopLoot?; shopPets?: readonly unknown[] | null }`; `isSeeded(city): boolean`; `violationsOf(city, catalogue): ShopPoolViolation`; `hasViolations(violation): boolean`; `describeViolation(violation): string` → `Negozio di <nome> (<hex>, <size>): <n> fuori taglia, <n> vietati, <n> mancanti[, pool vuoto]`.
- Classificazione per id, una sola volta: id non valido o assente dal catalogo → `missing` (`String(raw)` per i malformati); `!isShelfEligible` → `vetoed`; solo equip/loot con rarità fuori da `allowedRaritiesOf(citySizeOf(type))` (anche senza rarità) → `outOfSize`. `emptyPool` = tre liste vuote e tipo fuori da `NO_SHOP_CITY_TYPES`.
- `src/shops/shop-pool-report.service.ts`: `ShopPoolReport { entries: ShopPoolViolation[]; unseeded: number }`; `@Injectable() ShopPoolReportService` — `constructor(@InjectModel(City.name) cityModel, @InjectModel(EquipmentItem.name) equipmentModel, @InjectModel(LootItem.name) lootModel, @InjectModel(Pet.name) petModel)`; `async report(): Promise<ShopPoolReport>` (letture lean con proiezione, in parallelo, nessuna scrittura; `entries` ordinate per `cityName` con `localeCompare`).
- `src/shops/shops.module.ts`: `ShopsModule` — forFeature City, EquipmentItem, LootItem, Pet; providers `[ShopPoolReportService]`; exports `[ShopPoolReportService, MongooseModule]`.
- `src/shops/maintenance/shop-boot.ts`: `ShopBoot implements OnApplicationBootstrap` — `constructor(petSellable: PetSellableMigrator, ownedPets: OwnedPetsMigrator, seeder: ShopPoolSeeder, poolReport: ShopPoolReportService)`. Log: error `Negozi: <passo> fallita (<describeError>), il boot prosegue` con passi `valorizzazione di Pet.sellable`, `compagni posseduti`, `semina dei pool`, `report dei pool`; warn `describeViolation(...)` per le prime `SHOP_REPORT_WARNINGS_LIMIT` città; warn `Negozi: <n> città con pool fuori regola, <m> non seminate` se n o m > 0.
- `src/shops/maintenance/shop-maintenance.module.ts`: `ShopMaintenanceModule` — imports `[ShopsModule, forFeature Character]`; providers `[PetSellableMigrator, OwnedPetsMigrator, ShopPoolSeeder, ShopBoot]`; nessun export.
- `src/app.module.ts`: import di `ShopMaintenanceModule` e voce negli `imports` subito dopo `CitiesModule`.

## Test

- `src/shops/shop-pool.report.spec.ts` (11, unit): i 10 casi del piano più `tells a seeded city from an unseeded one (D-06)`.
- `src/shops/shop-pool-report.service.int-spec.ts` (3, integration): ordinamento per nome delle sole città seminate con violazioni; conteggio delle non seminate (una senza campi, una con una sola lista); nessuna scrittura (`toEqual` sulle quattro collezioni prima e dopo).
- `src/shops/maintenance/shop-boot.spec.ts` (4, unit): ordine dei passi; silenzio su un DB senza negozi; boot che prosegue con un passo in errore e log del solo nome e codice (il messaggio con l'URI finto non compare); 60 violazioni → 50 WARN + 1 di riepilogo.
- `src/shops/maintenance/shop-boot.int-spec.ts` (3, integration): primo boot che valorizza `sellable`, aggiunge il compagno equipaggiato ai posseduti e semina Fineglen (10/12, `[Cavallo leggero]`); WARN al boot per un ultrarare curato in un villaggio; `createAuthTestApp({ imports: [ShopsModule] })` → `app.get(ShopBoot)` lancia.

## Gate

- `npx tsc --noEmit -p tsconfig.json` esce 0
- prettier ed eslint puliti sui dieci file `.ts` (`src/app.module.ts` era già conforme: nessun commit `style`)
- unit: report + boot 15/15; integration: report service 3/3, boot 3/3, real boot `test/app.int-spec.ts` 68/68
- `src/config/env-example.drift.spec.ts` 3/3 (nessun `process.env.` nel codice di produzione; la int-spec del boot lo usa solo per `MONGO_TEST_URI`, come le altre int-spec)
- `src/schema.gql` invariato dopo il real boot; contro origin/develop 11 righe aggiunte, 0 tolte
- `pgrep -fl jest` vuoto

## Deviations from Plan

**1. [Rule 2 - Test in più] `tells a seeded city from an unseeded one (D-06)`** in `shop-pool.report.spec.ts`: `isSeeded` è esportata e guida il conteggio `unseeded`, quindi ha il suo caso unitario.

**2. [Rule 2 - Test in più] `stays silent on a database without shops (D-24)`** in `shop-boot.spec.ts`: il real boot su un DB vuoto non deve emettere WARN né errori; il test fissa il silenzio della riga di riepilogo.

**3. cityName di riserva**: una città senza nome usa il proprio esadecimale come `cityName` (il tipo del piano è `string`).

Nessun'altra deviazione.

## Threat model

- T-12-13: `describeViolation` con soli id, nomi e conteggi (test sul formato esatto); errori con `describeError` (test che il messaggio con l'URI finto non compare).
- T-12-14: un try/catch per passo, test `keeps booting when a step fails and logs the error code only (D-24)`.
- T-12-14b: `ShopMaintenanceModule` solo in `AppModule`; test `never seeds from the shops module used by the harnesses (D-24)`.
- T-12-14c: servizio di sola lettura; test `never writes to the database (D-06)` con `toEqual` sulle collezioni.

## Self-Check: PASSED

- FOUND: src/shops/shop-pool.report.ts, src/shops/shop-pool.report.spec.ts, src/shops/shop-pool-report.service.ts, src/shops/shop-pool-report.service.int-spec.ts, src/shops/shops.module.ts
- FOUND: src/shops/maintenance/shop-boot.ts, src/shops/maintenance/shop-boot.spec.ts, src/shops/maintenance/shop-boot.int-spec.ts, src/shops/maintenance/shop-maintenance.module.ts
- FOUND: 4c85dc3, 0fc7356, 933bfa6, 43e63cc, 6ae188f, 39c815c
