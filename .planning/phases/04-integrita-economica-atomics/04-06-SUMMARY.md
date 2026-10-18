---
phase: 04-integrita-economica-atomics
plan: 06
subsystem: economy
tags: [trade, shop, transactions, concurrency, catalog, fixtures, tdd]
requires:
  - 04-02 (WalletService.applyCharacterCoinsDelta con session, EconomyModule)
  - 04-03 (requireCharacterObjectId)
  - 04-04 (planTradeLines, priceTrade, assertClientTotalMatches, applyTradeToInventory, soldQuantityGuards)
provides:
  - "test/fixtures/catalog-item.fixture.ts: buildEquipmentItem / persistEquipmentItem / buildLootItem / persistLootItem con prezzi deterministici"
  - "CatalogPricesReader.read(lines): CatalogPrices (query lean per tipo, sola proiezione prezzi, niente DB senza righe)"
  - "ShopTransactionService.execute(request): Promise<CommonResponse> (fattibilità prima, inventario + coins in un'unica connection.transaction)"
  - "EconomyModule: forFeature EquipmentItem + LootItem, providers [WalletService, CatalogPricesReader, ShopTransactionService], exports [WalletService, ShopTransactionService]"
affects: [04-08 (collega il resolver a ShopTransactionService), 04-09 (BACKEND-NOTES / requirements)]
tech-stack:
  added: []
  patterns:
    - "Pattern 3: letture del catalogo e controlli puri fuori dalla transazione; nel callback snapshot in sessione → inventario con le quantità vendute riaffermate nel filtro → delta coins via wallet nella stessa session"
    - "Callback della transazione senza side effect né Promise.all: il driver può rieseguirlo sui WriteConflict"
key-files:
  created:
    - test/fixtures/catalog-item.fixture.ts
    - src/economy/trade/catalog-prices.reader.ts
    - src/economy/trade/catalog-prices.reader.int-spec.ts
    - src/economy/trade/shop-transaction.service.ts
    - src/economy/trade/shop-transaction.service.int-spec.ts
  modified:
    - test/fixtures/index.ts
    - test/fixtures/fixtures.spec.ts
    - src/economy/economy.module.ts
decisions:
  - "readPrices è una funzione di modulo generica (Model<T>): tsc la accetta senza Model<any> né duplicazione per tipo"
  - "Il delta coins va al wallet solo se netCopper !== 0 e l'inventario si scrive solo se ci sono righe: lo scambio vuoto a totale zero non scrive nulla (A2)"
  - "Il matchedCount 0 della scrittura dell'inventario risponde INSUFFICIENT_ITEM_QUANTITY (snapshot superato da una vendita concorrente)"
metrics:
  duration: ~15 min
  completed: 2026-10-18
  tasks: 2
  files: 8
---

# Phase 4 Plan 06: Shop transaction atomica Summary

`ShopTransactionService.execute` porta a termine uno scambio di negozio tutto-o-niente. Fuori dal DB: righe validate (`planTradeLines`), prezzi autorevoli letti da `CatalogPricesReader` (query lean per tipo, sola proiezione `buyPrice`/`sellPrice`, nessun populate), netto calcolato dal catalogo e totale del client usato solo come cross-check. Dentro un unico `connection.transaction`: snapshot del personaggio attivo in sessione, stato finale dell'inventario (`applyTradeToInventory`), fast-fail sui fondi, `updateOne` dell'inventario con `soldQuantityGuards(lines)` nel filtro e infine `wallet.applyCharacterCoinsDelta(characterId, netCopper, session)`. I coins li scrive solo il wallet (D-04). Resolver e `CharactersService` non sono stati toccati (il cablaggio arriva con il plan 04-08).

## Tasks

| Task | Name | RED commit | GREEN commit |
| ---- | ---- | ---------- | ------------ |
| 1 | Fixture di catalogo con prezzi e CatalogPricesReader | 25d43c1 | 6a61e58 |
| 2 | ShopTransactionService: inventario + coins in un'unica transazione | f39bc6c | 5fe8f1e |

Nessun commit REFACTOR necessario.

## RED evidence

- **Task 1:** `npx jest test/fixtures --selectProjects unit` → 3 failed / 15 (`TypeError: (0 , index_1.buildEquipmentItem) is not a function`, idem `buildLootItem`); `npx jest src/economy/trade/catalog-prices.reader.int-spec.ts --selectProjects integration --runInBand` → suite fallita, `Cannot find module 'src/economy/trade/catalog-prices.reader'`.
- **Task 2:** `npx jest src/economy/trade/shop-transaction.service.int-spec.ts --selectProjects integration --runInBand` → 16 failed / 16, tutti con `Error: execute: not implemented (<id>)` (stub registrato in `EconomyModule`, providers + exports).

## Verification (GREEN)

- Task 1: fixtures unit 15/15; `npx jest src/economy --selectProjects integration --runInBand` 2 suite / 24; tsc ok; eslint pulito sui 6 file.
- Task 2: shop int-spec 16/16, rieseguito 5 volte di fila sempre 16/16 (nessun test instabile sulla concorrenza); `npx jest src/economy --selectProjects integration --runInBand` 3 suite / 40; `npx jest src/economy --selectProjects unit` 4 suite / 63; tsc ok; eslint pulito sui 3 file.
- Plan verification: `npx jest src/economy test/fixtures --selectProjects integration --runInBand` 4 suite / 45; `npx jest src/economy test/fixtures --selectProjects unit` 5 suite / 78; `git diff --exit-code develop -- src/schema.gql` = 0.
- SC2:
  - 4 acquisti concorrenti con fondi per uno solo (150 rame, spada a 150): 1 fulfilled, 3 rejected `INSUFFICIENT_FUNDS`; saldo `{0,0,0}`; `ownedEquipments` = 1 spada ×1.
  - 3 vendite concorrenti dell'unica spada posseduta: 1 fulfilled, 2 rejected (`ITEM_NOT_OWNED` / `INSUFFICIENT_ITEM_QUANTITY`); coins `{0,0,75}` accreditati una volta sola; `ownedEquipments` `[]`.
  - Fallimento indotto: lo spy sul wallet esegue il vero `applyCharacterCoinsDelta` nella sessione ricevuta (definita) e poi lancia `induced failure`. La promise rifiuta con quel messaggio e il documento grezzo resta `toEqual(before)`: coins e inventario invariati, quindi nessuno stato parziale.
- Acceptance grep: `this.connection.transaction(` 1; `soldQuantityGuards(lines)` 1; nessun `$set`/`$inc` su `status.coins` (`grep -F`); nessun `Promise.all` nel service; nessun `request.total` nel service; `induced failure` 2 nello spec; `Promise.allSettled` 2; `exports: [WalletService, ShopTransactionService]` 1; spec di 630 righe (≥ 200). Task 1: export fixture 1, 4 funzioni build/persist, `{ buyPrice: 1, sellPrice: 1 }` 1, `populate` 0, `CatalogPricesReader` nel modulo 2.

## Deviations from Plan

### Auto-fixed Issues

None nel comportamento. Note di forma:

1. **Grep `applyCharacterCoinsDelta(characterId, netCopper, session)` su una riga.** Prettier (printWidth 80, tabWidth 4) porta gli argomenti a capo, quindi il grep letterale su una riga restituisce 0. La chiamata è presente con esattamente quegli argomenti nella stessa session: la verifica fatta con le righe unite (`tr -s ' \n' ' ' | grep -o "applyCharacterCoinsDelta( characterId, netCopper, session, )"`) dà 1. Non ho piegato il codice per adattarlo al grep.
2. **Commento con la parola "populate" nel reader.** Violava il criterio "`grep populate` vuoto": l'ho riformulato e ho corretto il commit GREEN del Task 1 prima di andare avanti (commit locale, mai pushato; hash finale 6a61e58).
3. **Forma del service.** La scrittura dell'inventario è estratta in un metodo privato `writeInventory` (funzioni piccole, Clean Code) e il tipo dell'esito è `InventoryOutcome` invece di un tipo inline. La logica e l'ordine dei rifiuti sono identici al plan.
4. **Spec.** Il caso 3 verifica in più il saldo residuo (`{0,0,60}`). I casi sono raggruppati in tre describe (successi / rifiuti / SC2) e il catalogo è creato in un `beforeEach`.

## Known Stubs

None.

## Threat Flags

None: nessun resolver né tipo GraphQL nuovo, schema invariato. T-04-06-01..06 mitigati e provati (casi 14, 16, 15, 6–8, 13, 7).

## Self-Check: PASSED

- FOUND: test/fixtures/catalog-item.fixture.ts, src/economy/trade/catalog-prices.reader.ts, src/economy/trade/catalog-prices.reader.int-spec.ts, src/economy/trade/shop-transaction.service.ts, src/economy/trade/shop-transaction.service.int-spec.ts
- FOUND commits: 25d43c1, 6a61e58, f39bc6c, 5fe8f1e
