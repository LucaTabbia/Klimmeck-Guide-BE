---
phase: 04-integrita-economica-atomics
plan: 04
subsystem: economy
tags: [trade, pricing, inventory, pure-functions, objectid, tdd]
requires:
  - 04-01 (toCopper, objectIdFromHex, GameRuleException con i 15 codici)
provides:
  - "src/economy/trade/trade-line.ts: TradeLine, TradeItemKind, TradeDirection, CatalogPrice(s), priceKey, INVENTORY_FIELD"
  - "src/economy/trade/trade-pricing.ts: planTradeLines, priceTrade, assertClientTotalMatches"
  - "src/economy/trade/trade-inventory.ts: applyTradeToInventory, soldQuantityGuards, InventoryEntry/Snapshot/Outcome"
affects: [04-06 (il service transazionale di doTransaction orchestra solo DB e sessione usando questi moduli), 04-09 (BACKEND-NOTES: ITEM_NOT_TRADABLE su prezzo nullo diverge dal FE)]
tech-stack:
  added: []
  patterns:
    - "Planner puro: request → righe tipizzate ObjectId → prezzo dal catalogo → stato finale degli array + guard $elemMatch da riaffermare nel filtro di scrittura"
    - "Il totale del client è solo cross-check: (isTotalPositive ? +1 : −1) × rame(total), zero indipendente dal segno"
key-files:
  created:
    - src/economy/trade/trade-line.ts
    - src/economy/trade/trade-pricing.ts
    - src/economy/trade/trade-pricing.spec.ts
    - src/economy/trade/trade-inventory.ts
    - src/economy/trade/trade-inventory.spec.ts
  modified: []
decisions:
  - "priceKey usa itemId.toString() invece di String(itemId): stesso risultato, evita la regola no-base-to-string come in 04-03"
  - "applyTradeToInventory confronta gli id con un sameId(unknown, ObjectId) via toString() (copre le voci legacy salvate come stringa, stesso pattern di active-spell.updates)"
  - "soldQuantityGuards è tipizzata Record<string, unknown> (nessuna dipendenza da FilterQuery: il modulo resta puro)"
  - "Nessuna mutazione dell'input: gli array dello snapshot sono copiati voce per voce prima di decrementi/splice"
metrics:
  duration: ~3 min
  completed: 2026-10-18
  tasks: 2
  files: 5
---

# Phase 4 Plan 04: Trade planner puro Summary

Il planner della transazione di negozio è ora un insieme di funzioni pure senza DB né Nest: `planTradeLines` valida e normalizza le quattro liste del `TransactionRequest` in righe `Types.ObjectId`, `priceTrade` calcola totali e netto in rame solo dal catalogo, `assertClientTotalMatches` usa il totale del client come semplice cross-check (regola FE `transaction_modal.dart`), `applyTradeToInventory` calcola lo stato finale degli array con la semantica D-08 e `soldQuantityGuards` produce le precondizioni `$elemMatch … $gte` da riaffermare nel filtro della scrittura in sessione (D-07).

## Tasks

| Task | Name | RED commit | GREEN commit |
| ---- | ---- | ---------- | ------------ |
| 1 | Righe di scambio, prezzi dal catalogo, cross-check del totale | bded6bf | 877b522 |
| 2 | Stato finale dell'inventario e guard delle quantità vendute | ca9789f | 545a3e1 |

Nessun commit REFACTOR necessario.

## RED evidence

- **Task 1:** `npx jest src/economy/trade --selectProjects unit` → 1 suite fallita, `Cannot find module './trade-pricing'` (il RED include `trade-line.ts`, i soli tipi necessari a compilare lo spec).
- **Task 2:** `npx jest src/economy/trade/trade-inventory --selectProjects unit` → 1 suite fallita, `Cannot find module './trade-inventory'`.

## Verification (GREEN)

- Task 1: `npx jest src/economy/trade --selectProjects unit` 1 suite / 28 test; `npx tsc --noEmit -p tsconfig.build.json` ok; `npx eslint src/economy/trade` pulito.
- Task 2: `npx jest src/economy --selectProjects unit` 4 suite / 63 test; tsc ok; eslint pulito.
- Plan verification: `npx jest src/economy src/gameRules --selectProjects unit` 5 suite / 79 test; `git diff --exit-code develop -- src/schema.gql` = 0.
- Acceptance: 3 export in `trade-pricing.ts`; `request.total` solo in `assertClientTotalMatches`; `amount === 0 ? 0` presente (prettier lo porta a capo su una riga dedicata, il grep la trova); nessun import `@nestjs` nei moduli trade; 6 occorrenze di `TRANSACTION_TOTAL_MISMATCH` nello spec; `grep -F 'quantity: { $gte: line.quantity }'` trova 1 riga; 4 righe ITEM_NOT_OWNED/INSUFFICIENT_ITEM_QUANTITY nello spec; test `does not mutate the snapshot` presente.

## Deviations from Plan

None - plan executed exactly as written (solo scelte di forma lint-safe elencate nelle decisions: `toString()` al posto di `String()`, helper `sameId`; il caso "negative or fractional denominations" è un `it.each` a due righe).

## Threat Flags

Nessuna nuova superficie: moduli puri, nessun endpoint né accesso a DB. T-04-04-01..06 mitigati come da threat model.

## Self-Check: PASSED

- FOUND: src/economy/trade/trade-line.ts, trade-pricing.ts, trade-pricing.spec.ts, trade-inventory.ts, trade-inventory.spec.ts
- FOUND commits: bded6bf, 877b522, ca9789f, 545a3e1
