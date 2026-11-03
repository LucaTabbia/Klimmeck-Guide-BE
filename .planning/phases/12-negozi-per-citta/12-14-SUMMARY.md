---
phase: 12-negozi-per-citta
plan: 14
subsystem: trade
tags: [trade, pets, transaction, petAssets, catalogue, BE-SHOP-06, BE-SHOP-03, D-17, D-23]
requires: ["12-02", "12-03", "12-13"]
provides:
  - "src/economy/trade/trade-line.ts: TradeItemKind = ItemReferenceType | 'Pet', InventoryTradeLine, isInventoryLine, CatalogPrice con rarity e sellable"
  - "src/economy/trade/trade-pricing.ts: righe Pet in coda a tradeSources, quantità 1 obbligatoria"
  - "src/economy/trade/trade-inventory.ts: applyLines e soldQuantityGuards ignorano le righe Pet"
  - "src/models/request/transaction-items.model.ts: petAssets nullable con decoratori completi"
  - "src/economy/trade/catalog-prices.reader.ts: legge anche il catalogo Pet, proiezione con rarity e sellable"
  - "src/schema.gql: input TransactionItems con petAssets: [AssetQuantityInput!]"
affects: [12-15, 12-16, 12-18]
tech-stack:
  added: []
  patterns:
    - "type guard `isInventoryLine` per separare le righe che toccano l'inventario degli AssetQuantity da quelle dei pet"
key-files:
  created: []
  modified:
    - src/economy/trade/trade-line.ts
    - src/economy/trade/trade-pricing.ts
    - src/economy/trade/trade-pricing.spec.ts
    - src/economy/trade/trade-inventory.ts
    - src/economy/trade/trade-inventory.spec.ts
    - src/models/request/transaction-items.model.ts
    - src/validation/input-rules.spec.ts
    - src/economy/trade/catalog-prices.reader.ts
    - src/economy/trade/catalog-prices.reader.int-spec.ts
    - src/schema.gql
decisions:
  - "`ItemReferenceType` resta invariato (enum del refPath a DB); il tipo `'Pet'` vive solo in `TradeItemKind` (D-17)"
  - "`petAssets` è nullable nello SDL, il default `[]` solo nel codice con `?? []` (D-17, C3)"
  - "Il campo `petAssets` del modello è entrato già nel GREEN del Task 1 perché `trade-pricing.ts` lo legge (tsc)"
metrics:
  duration: "~20 min"
  completed: 2026-11-02
  tasks: 2
  files: 10
---

# Phase 12 Plan 14: righe pet nello scambio Summary

Le righe pet entrano nello scambio D-17: input `TransactionItems.petAssets` nullable e validato, righe `kind: 'Pet'` pianificate dopo le quattro liste esistenti con quantità 1 obbligatoria, ignorate dall'inventario degli oggetti e dalle sue guardie, prezzate solo dal catalogo `Pet`; il lettore del catalogo porta anche `rarity` e `sellable` dei tre cataloghi per il veto (D-23).

## Task

| Task | Nome | Commit | File |
| ---- | ---- | ------ | ---- |
| 1 (RED) | spec delle righe pet in pricing e inventario | bfefcdf | src/economy/trade/trade-pricing.spec.ts, src/economy/trade/trade-inventory.spec.ts |
| 1 (GREEN) | tipo Pet, quantità 1, isInventoryLine, CatalogPrice con veto, petAssets + SDL | a2fb33b | src/economy/trade/trade-line.ts, src/economy/trade/trade-pricing.ts, src/economy/trade/trade-inventory.ts, src/models/request/transaction-items.model.ts, src/schema.gql |
| 2 (RED) | spec dell'input petAssets e del catalogo pet | 3cdab50 | src/validation/input-rules.spec.ts, src/economy/trade/catalog-prices.reader.int-spec.ts |
| 2 (GREEN) | lettore con il modello Pet, rarity e sellable | 891a338 | src/economy/trade/catalog-prices.reader.ts |

## Fallimenti RED osservati

- Task 1: `npx jest src/economy/trade/trade-pricing.spec.ts src/economy/trade/trade-inventory.spec.ts --selectProjects unit` → 5 falliti, 49 passati: «plans the pet lines of a purchase and a sale (D-17)» (righe pet assenti), «refuses a pet line with a quantity other than 1 …» e «refuses the same pet bought and sold …» (Received undefined), «leaves the owned items and equipment untouched by pet lines (D-13)» (`TypeError: Cannot read properties of undefined (reading 'findIndex')`), «never guards a sold quantity for a pet line (D-13)» (guardia su un campo inesistente). Verdi al primo colpo: «treats an omitted petAssets as no pet line (D-17)» (senza il campo non c'erano righe pet comunque) e «prices a pet from the catalogue (D-17)» (`priceTrade` è indipendente dal tipo: la chiave `Pet:<id>` funziona già); restano come prova di non regressione.
- Task 2: `catalog-prices.reader.int-spec.ts` → 3 falliti, 5 passati: «reads the pet prices from the pet catalogue (D-17)», «carries rarity and sellable with the prices (D-23)» e il preesistente «reads a legacy catalog entry stored without prices as untradable», la cui attesa `toEqual` sull'intera voce ora include `rarity: null, sellable: null`.
- Task 2: le tre spec di `input-rules.spec.ts` erano verdi al commit RED perché il campo era già entrato nel Task 1 (deviazione 1); il RED è stato osservato ripristinando temporaneamente il modello di `f3e23ab`: 3 falliti, 17 passati (id malformato, cap a 100, whitelist), poi il file è stato riportato alla versione committata.

## GREEN

- Unit: `npx jest src/validation/input-decorators.spec.ts src/validation/input-rules.spec.ts src/economy/trade/trade-pricing.spec.ts src/economy/trade/trade-inventory.spec.ts --selectProjects unit` → 110/110.
- Integration: `npx jest src/economy/trade/catalog-prices.reader.int-spec.ts test/app.int-spec.ts src/economy/trade/do-transaction.int-spec.ts src/economy/trade/shop-transaction.service.int-spec.ts --selectProjects integration --runInBand` → 129/129 (real boot 69/69).
- SDL: unica riga nuova `  petAssets: [AssetQuantityInput!]` in `input TransactionItems` (dopo `lootAssets`), generata dal real boot e committata in a2fb33b.

## Firme

- `export type TradeItemKind = ItemReferenceType | 'Pet';`
- `export interface CatalogPrice { buyPrice?: CoinPurse | null; sellPrice?: CoinPurse | null; rarity?: string | null; sellable?: boolean | null }`
- `INVENTORY_FIELD ... as const satisfies Record<ItemReferenceType, string>`
- `export type InventoryTradeLine = TradeLine & { readonly kind: ItemReferenceType };`
- `export const isInventoryLine = (line: TradeLine): line is InventoryTradeLine => line.kind !== 'Pet';`
- `InventoryEntry.itemType: ItemReferenceType`; `buy(entries, index, line: InventoryTradeLine)` (necessario perché la voce nuova prende `itemType: line.kind`)
- `TransactionItems.petAssets?: AssetQuantityInput[] | null` con `@Field(() => [AssetQuantityInput], { nullable: true }) @IsOptional() @IsArray() @ArrayMaxSize(MAX_TRANSACTION_LINES) @ValidateNested({ each: true }) @Type(() => AssetQuantityInput)`
- `CatalogPricesReader` costruttore: `equipmentItemModel`, `lootItemModel`, `@InjectModel(Pet.name) petModel: Model<PetDocument>`; il catalogo `Pet` non ha `rarity`, quindi per i pet `rarity` è sempre `null`.

## Deviations from Plan

**1. [Rule 3 - Blocco] `petAssets` nel modello già nel Task 1**
- **Trovato durante:** Task 1 (GREEN)
- **Problema:** `tradeSources` legge `request.boughtItems.petAssets`; senza il campo nel modello `npx tsc --noEmit` falliva con TS2339, e il gate tsc vale a fine di ogni task.
- **Correzione:** il campo con i decoratori completi del piano e la riga SDL dal real boot sono entrati nel commit GREEN del Task 1; il commit GREEN del Task 2 contiene solo il lettore. Il subject del Task 2 è quindi `feat(trade): read pet prices and veto flags from the catalogue` al posto di `feat(trade): accept pet assets in a transaction`, e il subject del Task 1 resta quello del piano.
- **Commit:** a2fb33b, 891a338

**2. [Rule 1 - Spec] attesa della voce legacy del lettore**
- **Trovato durante:** Task 2 (RED)
- **Problema:** il test preesistente fissa l'intera voce del catalogo con `toEqual`; con i flag di veto la voce guadagna `rarity: null, sellable: null`.
- **Correzione:** attesa aggiornata nel commit RED.
- **Commit:** 3cdab50

## Gate

- `npx tsc --noEmit -p tsconfig.json` → 0 a fine di ogni task.
- `npx prettier --write` + `npx eslint` sui nove `.ts` toccati, uno per uno: tutti già conformi prima e dopo, nessun commit `style`, nessun warning.
- `git diff --exit-code src/schema.gql` → 0 dopo ogni commit; `git diff origin/develop -- src/schema.gql | grep -cE '^-[^-]'` → 2 (solo le query deprecate di D-20); righe aggiunte 36.
- Grep di accettazione: `isInventoryLine` 1, `petAssets` in trade-pricing.ts 2, `D-17)` nella spec di pricing 5, `petAssets: [AssetQuantityInput!]` a fine riga nello SDL 1, `@IsOptional()` 1, `Pet.name` 1.
- Nessun trailer nei quattro commit; `pgrep -fl jest` vuoto.

## Threat Flags

Nessuna superficie nuova oltre al registro: T-12-20 mitigata (prezzo del pet solo da `CatalogPricesReader`, cross-check del totale invariato), T-12-21 mitigata (quantità 1 nel dominio, id esadecimale, cap a 100, whitelist provata). T-12-21b accettata: fino al 12-16 una riga pet è prezzata ma non aggiunta ai posseduti.

## Self-Check: PASSED
