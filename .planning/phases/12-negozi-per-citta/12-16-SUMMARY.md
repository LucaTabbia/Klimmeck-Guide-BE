---
phase: 12-negozi-per-citta
plan: 16
subsystem: trade
tags: [trade, shop, pets, PET_ALREADY_OWNED, BE-SHOP-06, BE-SHOP-03, D-12, D-14, D-17, D-19]
requires: ["12-03", "12-04", "12-14", "12-15"]
provides:
  - "src/economy/trade/trade-pets.ts: PetSnapshot, PetOutcome, assertPetsNotOwned, applyTradeToPets, petOwnershipGuards (destino puro dei pet in uno scambio)"
  - "src/economy/trade/trade-inventory.ts: soldQuantityGuards(lines, extra = []) con le guardie extra nella stessa lista"
  - "src/economy/trade/shop-transaction.service.ts: doppione pet dopo il pool, posseduti e slot svuotato nella stessa scrittura, guardie dei pet nel filtro"
affects: [12-17, 12-18]
tech-stack:
  added: []
  patterns:
    - "esito puro calcolato sullo snapshot in sessione + guardia riaffermata nel filtro della scrittura (rete di sicurezza contro il write skew)"
key-files:
  created:
    - src/economy/trade/trade-pets.ts
    - src/economy/trade/trade-pets.spec.ts
  modified:
    - src/economy/trade/trade-inventory.ts
    - src/economy/trade/trade-inventory.spec.ts
    - src/economy/trade/shop-transaction.service.ts
    - src/economy/trade/shop-transaction.service.int-spec.ts
    - src/economy/trade/do-transaction.int-spec.ts
decisions:
  - "`writeInventory` riceve un `TradeOutcome { inventory; pets }` invece di due parametri separati (firma a quattro argomenti, nessun parametro in più)"
  - "Una guardia dei pet fallita al momento della scrittura (pet comprato o venduto da uno scambio concorrente) risponde `INSUFFICIENT_ITEM_QUANTITY` come le quantità vendute: è il ramo `matchedCount === 0` esistente; al retry del WriteConflict lo snapshot fresco dà `PET_ALREADY_OWNED` o `ITEM_NOT_OWNED`"
  - "Il pet comprato si aggiunge in coda ad `assets.ownedPets`; il venduto si toglie confrontando con `sameId` (id legacy salvati come stringa tollerati)"
metrics:
  duration: "~25 min"
  completed: 2026-11-02
  tasks: 2
  files: 7
---

# Phase 12 Plan 16: pet nella transazione unica del negozio Summary

Comprare un pet del pool lo aggiunge ad `assets.ownedPets` senza mai equipaggiarlo; un pet già posseduto è rifiutato con `PET_ALREADY_OWNED` subito dopo il guard del pool e prima di possesso e fondi; vendere un pet lo toglie dai posseduti e, se era il compagno equipaggiato, mette `assets.pet` a `null` nella stessa scrittura delle monete; le guardie (`$nin` sul comprato, `$in` sul venduto) sono riaffermate nel filtro dell'update in sessione; uno scambio senza righe pet non scrive i campi pet (D-14, D-19, Pitfall 5).

## Task

| Task | Nome | Commit | File |
|------|------|--------|------|
| 1 RED | spec pura dei pet e delle guardie extra | 8701158 | src/economy/trade/trade-pets.spec.ts, src/economy/trade/trade-inventory.spec.ts |
| 1 GREEN | `trade-pets.ts` + guardie extra in `soldQuantityGuards` | cced3e2 | src/economy/trade/trade-pets.ts, src/economy/trade/trade-inventory.ts |
| 2 RED | int-spec dei pet nel negozio e sul filo | c241dac | src/economy/trade/shop-transaction.service.int-spec.ts, src/economy/trade/do-transaction.int-spec.ts |
| 2 GREEN | pet nella transazione unica | 4c8e0f8 | src/economy/trade/shop-transaction.service.ts |

## Nomi e firme creati

- `export interface PetSnapshot { ownedPets?: readonly unknown[] | null; pet?: unknown }`
- `export interface PetOutcome { ownedPets: unknown[]; unequip: boolean }`
- `export function assertPetsNotOwned(lines: readonly TradeLine[], snapshot: PetSnapshot): void` (solo righe `Pet` + `buy`; `GameRuleException.petAlreadyOwned()`)
- `export function applyTradeToPets(snapshot: PetSnapshot, lines: readonly TradeLine[]): PetOutcome | null` (`null` senza righe pet; venduto non posseduto → `GameRuleException.itemNotOwned()`; `unequip` vero se il venduto è `snapshot.pet`)
- `export function petOwnershipGuards(lines: readonly TradeLine[]): Record<string, unknown>[]` (per riga pet: `{ 'assets.ownedPets': { $nin | $in: idForms(id) } }`)
- `soldQuantityGuards(lines, extra: readonly Record<string, unknown>[] = [])`: `{ $and: [...vendite, ...extra] }` o `{}`
- `ShopTransactionService`: `TRADE_SNAPSHOT_PROJECTION` + `'assets.ownedPets': 1`, `'assets.pet': 1`; `TradeSnapshot.assets: InventorySnapshot & PetSnapshot`; `interface TradeOutcome { inventory: InventoryOutcome; pets: PetOutcome | null }`; `inventoryChanges(inventory, pets)`; `writeInventory(trader, lines, { inventory, pets }: TradeOutcome, session)` con filtro `...soldQuantityGuards(lines, petOwnershipGuards(lines))`
- Ordine dei rifiuti nel commento del service: id e quantità → catalogo → cross-check del totale → personaggio → città (D-18) → pool della città (D-19) → doppione pet (D-14) → possesso → fondi
- Spec: shop-transaction.service.int-spec.ts `TradeInput.buyPets?/sellPets?` (`petAssets` inviato solo se passato), `TraderInventory.ownedPets?/pet?`, modello `pets` (`getModelToken(Pet.name)`), describe `pets in the shop transaction` con `petPool()` (= `catalogPool()` + horse, camel), `buyPet(id, doc)` (1 oro), `sellPet(id, doc)` (50 argento), `expectRefused(id, request, code)`; do-transaction.int-spec.ts `TradeInput.buyPets?/sellPets?` (sempre inviati come `petAssets`, default `[]`), `Inventory.ownedPets?`, describe `pets` con `playerAtPetShop(twitchId, purse, inventory)` (pool `{ pets: [horse] }`)

## Fallimenti RED osservati

- Task 1: trade-pets.spec non si carica (`Cannot find module './trade-pets'`); in trade-inventory.spec fallisce `adds the extra guards to the same and-list (D-14)` (il secondo argomento era ignorato); 21 test verdi preesistenti.
- Task 2: 12 fallimenti su 78. Service: acquisto nei posseduti, doppione (due casi), vendite (tre casi), vendita non posseduta, le due gare di scrittura, la concorrenza sullo stesso pet; filo: compra/vendi con `petAssets` e `PET_ALREADY_OWNED`. Verdi al primo colpo, per costruzione: `refuses a pet outside the pool before checking a duplicate (D-19)` e `refuses a quest-only pet curated in the pool (D-05)` (guard del pool di 12-15, già prima del doppione), `leaves the pet fields out of a trade without pet lines (Pitfall 5)` (prima di questo piano nessun campo pet era scritto: il test protegge la regressione).

## Prova del write skew

Con il filtro della scrittura privato delle guardie dei pet (`petOwnershipGuards([])` al posto di `petOwnershipGuards(lines)`, modifica temporanea mai committata) falliscono `refuses a pet bought meanwhile at write time and pays nothing (D-14)` e `refuses a pet sold meanwhile at write time and pays nothing (D-14)` (lo snapshot falsificato via spy su `findOne` non vede il pet comprato o vede ancora quello venduto); ripristinato il file, 54/54 verdi.

## Deviations from Plan

### Casi in più rispetto al piano

**1. [Rule 2 - Critico] Gare di scrittura e concorrenza sui pet (T-12-24, T-12-25b)**
- **Found during:** Task 2 RED
- **Issue:** il piano non aveva un test che provasse le guardie nel filtro.
- **Fix:** `refuses a pet bought meanwhile at write time and pays nothing (D-14)`, `refuses a pet sold meanwhile at write time and pays nothing (D-14)` (rispondono `INSUFFICIENT_ITEM_QUANTITY`, nessuna moneta mossa, documento invariato) e `lets exactly one of concurrent buys of the same pet through (D-14)` (tre acquisti concorrenti, uno passa; gli altri `PET_ALREADY_OWNED` o `INSUFFICIENT_ITEM_QUANTITY`).
- **Commit:** c241dac

**2. Firma di `writeInventory`**
- Il piano indicava `writeInventory(trader, lines, inventory, pets, session)`; i due esiti viaggiano invece in un solo oggetto `TradeOutcome` (cinque parametri posizionali evitati, Clean Code). Comportamento identico.

Nessun'altra deviazione; nessun file preesistente non conforme a Prettier.

## Note

- La vendita di un pet non controlla il pool (D-12): `sells an owned pet in any city (D-12, D-14)` usa il pool di default senza pet.
- `buys for a legacy character stored without an inventory` resta verde invariato: senza righe pet `assets` contiene solo `ownedItems` e `ownedEquipments`.
- SDL invariato (`git diff --exit-code src/schema.gql` = 0); contro origin/develop 40 righe aggiunte, 2 tolte (le due di D-20).

## Self-Check: PASSED

- File creati presenti: src/economy/trade/trade-pets.ts, src/economy/trade/trade-pets.spec.ts
- Commit presenti: 8701158, cced3e2, c241dac, 4c8e0f8
