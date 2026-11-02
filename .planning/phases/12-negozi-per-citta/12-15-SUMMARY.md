---
phase: 12-negozi-per-citta
plan: 15
subsystem: trade
tags: [trade, shop, pool, ITEM_NOT_IN_SHOP, BE-SHOP-03, BE-SHOP-04, D-05, D-11, D-12, D-19, D-23]
requires: ["12-04", "12-06", "12-14"]
provides:
  - "src/economy/trade/trade-pool.ts: CityPool, CityPoolDocument, poolOfCity, assertBuysInShop (guard puro del pool + veto D-05)"
  - "src/economy/trade/shop-transaction.service.ts: shopOrReject legge città e pool in un solo findOne in sessione; assertBuysInShop subito dopo la città"
  - "test/economy/place-in-city.ts: ShopPoolFixture e parametro pool opzionale di placeInCity"
affects: [12-16, 12-18]
tech-stack:
  added: []
  patterns:
    - "pool letto con la stessa query che riafferma la città (proiezione dei tre campi del pool, lean, sessione della transazione)"
key-files:
  created:
    - src/economy/trade/trade-pool.ts
    - src/economy/trade/trade-pool.spec.ts
  modified:
    - test/economy/place-in-city.ts
    - src/economy/trade/shop-transaction.service.ts
    - src/economy/trade/shop-transaction.service.int-spec.ts
    - src/economy/trade/do-transaction.int-spec.ts
decisions:
  - "`CityPoolDocument` è un alias di `ShopPoolLists` di src/shops/shop-pool.rules.ts invece di una seconda interfaccia identica (zero duplicazione)"
  - "Un acquisto il cui id è nel pool ma manca dal catalogo letto è rifiutato con `ITEM_NOT_IN_SHOP` (ramo `!entry`; in pratica `ITEM_NOT_FOUND` del catalogo arriva prima)"
  - "Il catalogo letto in `execute` passa a `applyTrade` come parametro: nessuna seconda lettura dentro la transazione"
metrics:
  duration: "~10 min"
  completed: 2026-11-02
  tasks: 2
  files: 6
---

# Phase 12 Plan 15: guard del pool del negozio Summary

Ogni acquisto di `doTransaction` (equip, loot, pet) deve stare nel pool della città del marker e superare il veto di D-05 (né `legendary` né `sellable: false`), altrimenti `ITEM_NOT_IN_SHOP`; il pool si legge dentro la transazione con la sessione, nella stessa `findOne` che riafferma `SHOP_NOT_IN_CITY` (sostituisce l'`exists`, D-23); la vendita resta libera ovunque, leggendari inclusi (D-11, D-12).

## Task

| Task | Nome | Commit | File |
|------|------|--------|------|
| 1 RED | spec pura del guard | 016fc7f | src/economy/trade/trade-pool.spec.ts |
| 1 GREEN | `assertBuysInShop` puro | 3818018 | src/economy/trade/trade-pool.ts |
| 2 RED | int-spec del pool del negozio | 11f94d7 | test/economy/place-in-city.ts, shop-transaction.service.int-spec.ts, do-transaction.int-spec.ts |
| 2 GREEN | pool riletto in sessione | 35c7fd3 | src/economy/trade/shop-transaction.service.ts, shop-transaction.service.int-spec.ts |

## Nomi e firme creati

- `export interface CityPool { equipment: readonly unknown[]; loot: readonly unknown[]; pets: readonly unknown[] }`
- `export type CityPoolDocument = ShopPoolLists` (`shopEquipment?/shopLoot?/shopPets?: readonly unknown[] | null`)
- `export function poolOfCity(city: CityPoolDocument): CityPool` (liste assenti o null valgono `[]`)
- `export function assertBuysInShop(lines: readonly TradeLine[], pool: CityPool, catalogue: CatalogPrices): void`: salta le righe `sell`; per le `buy` confronta con `sameId` (id curati come stringa tollerati) nella lista del proprio tipo (`POOL_LIST` EquipmentItem → equipment, LootItem → loot, Pet → pets), poi `isShelfEligible` sulla voce `catalogue.get(priceKey(kind, id))`
- `ShopTransactionService`: `private async shopOrReject(snapshot, session: ClientSession | null): Promise<ShopAtMarker>` con `ShopAtMarker { location; pool: CityPool }`; costante `CITY_POOL_PROJECTION = { shopEquipment: 1, shopLoot: 1, shopPets: 1 }`; `applyTrade(characterId, lines, netCopper, catalogue, session)`
- `test/economy/place-in-city.ts`: `export interface ShopPoolFixture { equipment?; loot?; pets? }`, `placeInCity(harness, character, pool: ShopPoolFixture = {})`: una lista passata (anche vuota) finisce nel campo del pool, una assente resta assente

## Fallimenti RED osservati

- Task 1: la suite non si carica (`Cannot find module './trade-pool'`), 0 test eseguiti.
- Task 2: 6 fallimenti, tutti casi nuovi: 4 rifiuti `ITEM_NOT_IN_SHOP` del service (equip fuori pool, loot fuori pool, leggendario curato, loot `sellable: false` curato) con «Received promise resolved instead of rejected», `checks the pool before the possession and the funds` (arrivava `ITEM_NOT_OWNED`), `reads the pool with the session of the transaction` (proiezione dell'`exists` invece dei tre campi del pool) e il caso di filo di do-transaction. Verdi al primo colpo, per costruzione: ultrarare curato, vendita fuori pool, vendita del leggendario, `SHOP_NOT_IN_CITY` prima del pool (regole già vere senza il guard).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Test] La prova della sessione era verde in RED**
- **Found during:** Task 2 RED
- **Issue:** `Model.exists` di Mongoose delega a `findOne`, quindi lo spy su `findOne` vedeva già una query con sessione col codice vecchio.
- **Fix:** il test verifica anche `query.projection()` = i tre campi del pool: prova che è la stessa lettura a portare il pool.
- **Commit:** 11f94d7

**2. [Rule 3 - Blocking] Spy della gara fra città e scrittura su `exists`**
- **Found during:** Task 2 GREEN
- **Issue:** `rejects a travel that starts between the city check and the write` spiava `cities.exists`, che non viene più chiamato; e il `findOne` sovraccaricato non accetta una implementazione a due argomenti nello spy tipizzato (tsc).
- **Fix:** lo spy passa su `findOne` (cast a `jest.SpyInstance`, commento sul sovraccarico), committato col GREEN perché legato al dettaglio implementativo.
- **Commit:** 35c7fd3

**3. [Rule 3] Test legacy del marker esadecimale**
- **Found during:** Task 2 RED
- **Issue:** `matches a legacy marker stored as a hex string` inserisce la città a mano senza pool e compra la spada: col guard diventerebbe `ITEM_NOT_IN_SHOP`.
- **Fix:** la città inserita ha `shopEquipment: [sword]`.
- **Commit:** 11f94d7

**4. Casi in più rispetto al piano** (stessa regola, rami da coprire per la coverage di `./src/economy/`): `refuses an item of the pool of another kind`, `refuses a pool item missing from the catalogue`, `reads null pool lists as empty` (unit); `refuses a loot outside the pool with ITEM_NOT_IN_SHOP (D-19)` (int-spec).

## Note

- Nessun int-spec di 12-14 né di questo piano compra con successo un pet attraverso `ShopTransactionService` (`petAssets` compare solo in trade-pricing.spec.ts e input-rules.spec.ts): le righe pet qui compaiono solo nel test puro di `assertBuysInShop`.
- `persistTrader` del service int-spec ha un quinto parametro `pool` con default `catalogPool()` (sword; potion, relic); `playerWith` di do-transaction mette nel pool `catalog.sword`, `catalog.potion`, `catalog.relic`.
- La policy di accesso esistente (owner-only, `SHOP_NOT_IN_CITY`, `AWAITING_AID`, `TRAVEL_IN_PROGRESS`) è invariata; SDL invariato.

## Self-Check: PASSED

- File creati presenti: src/economy/trade/trade-pool.ts, src/economy/trade/trade-pool.spec.ts
- Commit presenti: 016fc7f, 3818018, 11f94d7, 35c7fd3
