---
phase: 19-revisione-dei-modelli
plan: 13
subsystem: models
tags: [negozi, pool, sotto-documento, City.shop, migratore, D-10, D-12]
requires: [19-12]
provides:
  - "`City.shop { equipment, loot, pets }` solo Mongoose (`CityShopPool`, `_id: false`, tre liste e sotto-documento con `default: undefined`)"
  - "sei lettori sul sotto-documento (`hasShopOf`, `hasPool`/`violationsOf`, proiezione del report, `CityShopService.read`, `poolOfCity`, proiezione dell'acquisto)"
  - "`CityShopStep` (sesto in `STEPS`), builder `legacyCity` in `legacy-fixtures.ts`"
affects: [19-14, 19-23]
tech-stack:
  added: []
  patterns: [passo del migratore col driver nativo e sola rinomina dei campi]
key-files:
  created:
    - src/models/city-shop-pool.model.ts
    - src/migrations/model-review/city-shop.step.ts
    - src/migrations/model-review/city-shop.step.int-spec.ts
  modified:
    - src/models/city.model.ts
    - src/models/shop-fields.schema.spec.ts
    - src/shops/shop-pool.rules.ts
    - src/shops/shop-pool.report.ts
    - src/shops/shop-pool-report.service.ts
    - src/shops/city-shop.service.ts
    - src/economy/trade/trade-pool.ts
    - src/economy/trade/shop-transaction.service.ts
    - test/economy/place-in-city.ts
    - test/shops/shop-world.fixture.ts
    - src/migrations/model-review/legacy-fixtures.ts
    - src/migrations/model-review/model-review.module.ts
decisions:
  - "`ReportedCity` estende `ShopPoolLists`: un solo tipo lean del pool per regole, report e acquisto"
  - "`placeInCity` scrive `shop` solo se almeno una lista è data: senza pool la città resta senza sotto-documento"
metrics:
  completed: 2026-11-11
  tasks: 3
  files: 27
---

# Phase 19 Plan 13: il pool dei negozi in `City.shop` — Summary

I tre array del pool sono ora il sotto-documento `City.shop { equipment, loot, pets }`, solo Mongoose: `src/schema.gql` è identico, `cityShop`, `City.hasShop`, il report dei pool e l'acquisto leggono il sotto-documento, assente e vuota restano distinte; il passo `CityShopStep` sposta i tre campi vecchi con una sola scrittura di rinomina per città e alla seconda corsa non scrive nulla.

## Commit

| Task | Commit | Subject |
|------|--------|---------|
| 1 RED | `4b3ef546` | `test(shops): pin the city shop pool sub-document` |
| 1 GREEN | `aca16604` | `refactor(shops): move the city shop pool into one sub-document` |
| 2 RED | `34445280` | `test(migrations): pin the city shop pool step` |
| 2 GREEN | `1c0bd55b` | `feat(migrations): add the city shop pool step` |
| 3 | (questo e il successivo) | `docs(phase-19): summarize plan 13`, `docs(phase-19): record plan 13 progress` |

Nessun trailer in nessun commit (controllo a `0` dopo ognuno).

## Evidenza RED

- **Task 1, unit (16 rossi su 47, 4 suite)**
  - `shop-fields.schema.spec.ts` (4): `keeps a stored empty pool list empty and the others absent (D-10)` (lo strict scarta `shop` alla creazione) e i tre `stores the pool lists as typed references (D-10): shop.equipment | shop.loot | shop.pets` (path inesistenti).
  - `shop-pool.rules.spec.ts` (1): `opens the shop when one pool list has an item (D-04)`.
  - `shop-pool.report.spec.ts` (10): i nove casi che leggono liste valorizzate o il pool vuoto e `judges only a city whose three pool lists are present, even empty (D-10)`.
  - `trade-pool.spec.ts` (1): `reads pool ids curated as hex strings (D-19)`.
- **Verdi al primo colpo (annotati):** `leaves the shop pool absent on create (D-10)` (anche col modello vecchio una città nuova non ha chiavi `shop*`: il caso diventa una rete solo dopo il GREEN, contro un default sbagliato — Pitfall 8); `keeps a city without the shop sub-document closed (D-10)` e i casi «senza pool»/«liste nulle» di regole e acquisto (assente = chiuso/vuoto in entrambe le forme; jest non fa il type check).
- **Task 2, integration** — la suite `city-shop.step.int-spec.ts` non si carica (`Cannot find module './city-shop.step'`): sei casi non eseguiti. Fra RED e GREEN del task 2 `tsc` è rosso per il solo modulo non ancora scritto.

## Cosa è cambiato

- **Modello:** `src/models/city-shop-pool.model.ts` — `CityShopPool` con `@Schema({ _id: false })`, nessun decoratore GraphQL, tre liste di ref (`EquipmentItem`, `LootItem`, `Pet`) con `default: undefined`; su `City` il campo `shop?: CityShopPool` con `default: undefined` (il commento sul pool resta, riferito al sotto-documento).
- **Lettori (sei):** `ShopPoolLists` = `{ shop?: { equipment?, loot?, pets? } | null }`; `hasShopOf` (almeno una lista non vuota); `ReportedCity extends ShopPoolLists`, `hasPool` (le tre liste di `city.shop` tutte presenti, anche vuote), `violationsOf`; `CITY_PROJECTION = { name: 1, type: 1, shop: 1 }`; `CityShopService.read` (scaffali da `city.shop`); `poolOfCity`; `CITY_POOL_PROJECTION = { shop: 1 }`.
- **Fixture:** `placeInCity(…, pool)` scrive `shop` con le sole liste date (nessuna lista = nessun `shop`); `persistShopPools` scrive `shop: { equipment, loot, pets }`; gli helper `persistPooledCity` delle int-spec scrivono il pool dentro `shop`.
- **Spec toccate (15):** unit `shop-fields.schema.spec.ts`, `shop-pool.rules.spec.ts`, `shop-pool.report.spec.ts`, `trade-pool.spec.ts`; integration `shop-pool-report.service.int-spec.ts`, `city-shop.service.int-spec.ts`, `city-shop.resolver.int-spec.ts`, `shop-admin.resolver.int-spec.ts`, `maintenance/shop-boot.int-spec.ts`, `shop-transaction.service.int-spec.ts` (semina legacy e proiezione attesa `{ shop: 1 }`), `cities.resolver.int-spec.ts`, `test/shops/shop-world.fixture.int-spec.ts`, `test/shops/city-shops.e2e.int-spec.ts`; nuova `city-shop.step.int-spec.ts`. Nessun atteso sul filo è cambiato.
- **Passo:** `CityShopStep`, label `pool dei negozi`, driver nativo; guardia «almeno uno dei tre campi vecchi presente» (anche vuoto); una sola scrittura di rinomina verso `shop.equipment`, `shop.loot`, `shop.pets`; `found` = città della collection, `migrated` = documenti modificati, `unmatched` sempre 0. Sesto in `STEPS`; `forFeature` del modulo con `City`.

## Righe attese al boot reale (runbook, orchestratore)

Inventario dell'11 novembre: 167 città, tutte con i tre array, nessuna con `shop`.

- Primo boot: `Revisione dei modelli, pool dei negozi: trovati 167, migrati 167, già a posto 0, senza corrispondenza 0`
- Secondo boot: `Revisione dei modelli, pool dei negozi: trovati 167, migrati 0, già a posto 167, senza corrispondenza 0`
- Prova a secco equivalente: conteggio delle città con almeno uno dei tre campi vecchi presente = 167 prima, 0 dopo; città con `shop` = 0 prima, 167 dopo; per ogni città le tre liste di `shop` uguali (stessi id, stesso ordine, vuote comprese) ai tre array del backup. Backup di `cities` prima del boot (T-19-52).
- Dopo il boot la riga del report dei negozi (`Negozi: … città con pool fuori regola, … senza pool`) deve dare gli stessi conteggi di prima della migrazione: è la controprova che `hasPool` legge il sotto-documento.

## Esito delle prove (dopo l'ultimo commit GREEN)

- `npx jest --selectProjects unit` → 269 suite, 3434 test verdi (prima di ognuno dei due commit GREEN; +1 caso rispetto al piano 12).
- Verifica del task 1: `npx jest src/models src/shops src/economy --selectProjects unit` → 32 suite, 304 test; integration `src/shops src/cities test/shops` → 9 suite, 44 test; `src/economy test/app.int-spec.ts` → 5 suite, 204 test (comando del piano spezzato in due per restare in primo piano).
- Progetto integration intero, a pezzi, in primo piano, un jest alla volta, nessun comando spostato in background — **144 suite, 1996 test, tutti verdi** (143 / 1990 dopo il piano 12; +1 suite e +6 casi del passo):
  - `src/characters test/app.int-spec.ts` → 24 suite, 467 test (82 s); `git diff --exit-code src/schema.gql` → 0.
  - `src/travel src/shops src/economy src/cities src/lore src/models test/shops test/fixtures` → 29 suite, 417 test (103 s).
  - `src/quests` → 35 suite, 512 test (158 s).
  - resto (`src/auth src/authz src/eventsub src/graphql src/http src/migrations src/mongo src/pendingQuests src/pointsOfInterest src/push src/rest src/roads src/throttling src/time src/users src/validation test/auth test/authz test/harness test/quests`) → 56 suite, 600 test (109 s).
  - `jest --listTests` del progetto integration elenca 144 file, tutti dentro i quattro pezzi.
- `npx tsc --noEmit -p tsconfig.json` → 0 dopo ogni commit GREEN. Prettier ed eslint sui file toccati, uno per uno: puliti (nessun file da toccare era fuori formato). `pgrep -fl 'bin/jest'` vuoto a fine di ogni task.

## Criteri di accettazione

| Criterio | Esito |
|----------|-------|
| Gate: `grep -rnwE 'shopEquipment\|shopLoot\|shopPets' src test --include='*.ts'` fuori da `src/migrations/model-review/` | 0 righe (dopo il task 1: nessuna riga in assoluto; dopo il task 2: solo `city-shop.step.ts` e `legacy-fixtures.ts`) |
| `grep -c "default: undefined" src/models/city-shop-pool.model.ts` | 3 |
| `grep -c "CityShopPoolSchema, default: undefined" src/models/city.model.ts` | 1 (riga unica, nessun `-A3`) |
| `grep -c "ObjectType" src/models/city-shop-pool.model.ts` | 0 |
| `grep -c "D-10)" src/models/shop-fields.schema.spec.ts` | 3 |
| `git diff --exit-code src/schema.gql` | 0 |
| `grep -c "D-10)" src/migrations/model-review/city-shop.step.int-spec.ts` | 5 |
| `grep -c "CityShopStep" src/migrations/model-review/model-review.module.ts` | 2 |
| `grep -L "UNA TANTUM (Phase 19 D-12)" src/migrations/model-review/*.ts` | nessuna riga |

## Deviazioni dal piano

**1. [Regola 2 - rete più stretta] il caso «vuota resta vuota» prova anche la creazione**
- Con il solo `hydrate` chiesto dal piano il caso era verde anche sul modello vecchio (`hydrate` non scarta i campi fuori schema). Aggiunta nello stesso caso la creazione col costruttore (`new CityProbe({ shop: { loot: [] } })` → `shop` uguale a `{ loot: [] }`): rosso prima, verde dopo, e pinna che le altre due liste non nascono vuote per default (T-19-51).

**2. [Forma delle spec] `village(pool, overrides)` e casi rinominati**
- In `shop-pool.report.spec.ts` il builder prende il pool come primo argomento (tre liste vuote di base) e il resto come secondo; il caso `tells a city with a pool from one without (D-06)` è sostituito da quello del piano `judges only a city whose three pool lists are present, even empty (D-10)`. In `shop-pool.rules.spec.ts` il caso D-04 «senza pool» diventa `keeps the shop closed on a city without pool lists (D-04)` (`shop: {}`) accanto al nuovo caso D-10.

**3. [Comando di verifica spezzato] integration del task 1 in due comandi**
- `src/shops src/cities test/shops` e `src/economy test/app.int-spec.ts` separati, stessi file del comando del piano.

**4. [Ordine dei commit di chiusura e forma di STATE] come nei piani 01–12**
- SUMMARY in un commit suo prima del bookkeeping; `Plan: 13 of 23`.

Nessuna decisione architetturale (Regola 4). Nessun file fuori da `files_modified`.

## Problemi rimandati (fuori scope, non corretti)

- Resta quello registrato nel piano 12: `cities { pointsOfInterest { id } }` (`findAll` non popola la lista). Non toccato, come da istruzione.
- `TRADE_SNAPSHOT_PROJECTION` in `shop-transaction.service.ts` nomina ancora `assets.wearedEquipment`: è il nome di D-06, del piano 19-15.

## Note per i piani successivi

- **`STEPS`** oggi: `EnemyWeaknessesStep, EnemySpellsStep, PetCatalogStep, OwnedPetsStep, PoiQuestStep, CityShopStep`; `forFeature`: `Enemy`, `Spell`, `Pet`, `Character`, `PointOfInterest`, `City`. Il boot reale di `test/app.int-spec.ts` logga ora sei righe a zero.
- **`legacyCity(pool, overrides)`** in `legacy-fixtures.ts`: città grezza coi tre campi vecchi presi da `pool { equipment?, loot?, pets? }` (una lista non data resta assente); tipo `LegacyCityPool` esportato.
- **Pool nelle fixture:** chi semina una città con negozio scrive `shop: { equipment?, loot?, pets? }`; `placeInCity(harness, character, pool)` non cambia firma. Chi legge il pool lean usa `ShopPoolLists` di `src/shops/shop-pool.rules.ts`.
- **Molosso in negozio (D-27, contenuto dell'orchestratore):** gli script di contenuto dopo il boot devono scrivere su `shop.pets`, non più sul campo sciolto.
- **Handoff FE (19-23):** nessun cambio sul filo per D-10 (`CityShop` e `City.hasShop` identici). BE-MODEL-07 ha ora entrambe le metà nel codice (D-09 nel 19-12, D-10 qui): la spunta in REQUIREMENTS resta al piano di chiusura.
- **Conteggi:** unit 269 suite / 3434 test; integration 144 suite / 1996 test.

## Stub noti

Nessuno.

## Threat flags

Nessuna superficie nuova fuori dal threat model: T-19-50 (`poolOfCity` sul sotto-documento, spec dell'economia ed e2e dei negozi verdi, gate dei tre nomi vecchi a zero), T-19-51 (`default: undefined` su `shop` e sulle tre liste; casi «assente alla creazione», «vuota resta vuota» anche alla creazione, `hasPool`), T-19-52 (sola rinomina, liste conservate tali e quali anche vuote, città senza pool intatta, seconda corsa a zero; backup nel runbook), T-19-53 (classe senza decoratori GraphQL, SDL identico) mitigati.

## Self-Check: PASSED

- `src/models/city-shop-pool.model.ts`, `src/migrations/model-review/city-shop.step.ts`, `src/migrations/model-review/city-shop.step.int-spec.ts` esistono; i quattro commit `4b3ef546`, `aca16604`, `34445280`, `1c0bd55b` sono in `git log`; `git status --short` vuoto prima di questo documento.
