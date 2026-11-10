---
phase: 18-quest-heal-per-taglia
plan: 07
subsystem: characters
tags: [characters, items, potions, pure-plan, tdd]
requires: ["18-06", "18-04", "18-01"]
provides:
  - "planItemUse({ snapshot, itemId, item, now }): piano puro della bevuta con filtro, update a cinque path e risultato, oppure il primo rifiuto nell'ordine di D-17"
  - "recoveryTimeOf(recovery): millisecondi di ricarica validi (intero sicuro > 0) oppure null"
  - "ITEM_USE_CHARACTER_PROJECTION, ITEM_USE_CATALOG_PROJECTION e i tipi ItemUseCharacterSnapshot, ItemUseCatalogSnapshot, ItemUsePlanInput, ItemUseOutcome, ItemUsePlan"
affects: [18-08, 18-10, 18-11]
tech-stack:
  added: []
  patterns: ["piano puro dallo snapshot in sessione con rifiuti come early return (modello del negozio, Phase 4)"]
key-files:
  created:
    - src/characters/items/item-use.plan.ts
    - src/characters/items/item-use.plan.spec.ts
  modified: []
decisions:
  - "Possesso verificato prima del catalogo con una funzione propria (pila con sameId e quantità intera ≥ 1): applyTradeToInventory lancerebbe ITEM_NOT_OWNED solo dopo, nell'ordine sbagliato"
  - "ITEM_NO_EFFECT valutato sull'oggetto DrinkEffect già calcolato per l'esito (nessun secondo calcolo)"
  - "STATE.md registra `Plan: 7 of 11` (formato del brief), non `Plan: 07 of 11` del verify del piano"
metrics:
  duration: "~20 min"
  completed: 2026-11-10
  tasks: 3
  files: 2
---

# Phase 18 Plan 07: piano puro della bevuta `planItemUse` — Summary

`planItemUse` decide dallo snapshot del personaggio e dall'oggetto di catalogo letto lean i cinque rifiuti nell'ordine di D-17 (`AWAITING_AID`, `ITEM_NOT_OWNED`, `ITEM_NOT_USABLE`, `POTION_RECOVERING` con la data, `ITEM_NO_EFFECT`) e, se la bevuta è permessa, restituisce filtro, update e risultato senza database. Il servizio del piano 18-08 resta sottile e rieseguibile dal driver dentro la transazione.

## Cosa è stato costruito

`src/characters/items/item-use.plan.ts` (modulo puro, nessun I/O, nessun Clock):

- `export const ITEM_USE_CHARACTER_PROJECTION = { status: 1, assets: 1 } as const`
- `export const ITEM_USE_CATALOG_PROJECTION = { effect: 1, power: 1, canHeal: 1, recovery: 1, relatedLore: 1 } as const`
- `export interface ItemUseCharacterSnapshot`, `ItemUseCatalogSnapshot`, `ItemUsePlanInput`, `ItemUseOutcome`, `ItemUsePlan` esattamente come nel blocco `<interfaces>` del piano (update a tipo letterale: oggetto con set obbligatorio e add-to-set facoltativo, `KnowledgeAddition['$addToSet']`)
- `export function recoveryTimeOf(recovery: unknown): number | null` — oggetto non lista con `time` numero, `Number.isSafeInteger` e > 0
- `export function planItemUse(input: ItemUsePlanInput): ItemUsePlan`
- private: `isRecord`, `powerOf` (numero finito > 0, altrimenti 0), `canHealOf` (lista o []), `relatedLoreIdsOf` (`refIdOf` sulle voci, null scartati), `drinkLineOf` (riga di vendita LootItem quantità 1), `recoveryOver(now)` (disgiunzione nullo / minore o uguale a now), `refuseWhileAwaitingAid`, `refuseUnlessOwned`, `usablePotionOf` (→ `UsablePotion { power, canHeal, recoveryTime, relatedLore }`), `refuseWhileRecovering`, `refuseWithoutEffect`, `drinkEffectOf` (→ `DrinkEffect { hpBefore, hpAfter, cured }`), `quantityLeftOf`, `writeGuardOf`

Update: set di `status.currentLifePoints`, `status.injuries`, `assets.ownedItems`, `status.potionRecoveryUntil` più `...knowledgeUpdateOf(...).addition` (add-to-set di `status.unlockedLore` solo per le novità). Filtro: `activeCharacterById`, `status.awaitingAid` null, HP grezzi dello snapshot o null, copia della lista delle ferite, `soldQuantityGuards([riga], [guardiaRicarica])`.

## Commit

| Task | Commit | Messaggio |
|------|--------|-----------|
| 1 RED | a8d29d2b | test(characters): pin the plan of a drunk potion |
| 1 GREEN | 02ef4a58 | feat(characters): plan the drink of a potion from a snapshot |
| 2 RED | e51cce1c | test(characters): pin the ordered refusals of a drink |
| 2 GREEN | 05c494c1 | feat(characters): refuse a drink in the order of the rules |
| 3 | (questo commit) | docs(phase-18): record plan 07 progress |

## Fallimenti RED osservati

- Task 1: suite rossa per modulo assente (`Cannot find module 'src/characters/items/item-use.plan'`), 0 test eseguiti. tsc rosso per il solo import della spec (atteso).
- Task 2: 14 falliti su 49. Verdi al primo colpo, con motivo:
  - `answers ITEM_NOT_OWNED before ITEM_NOT_USABLE`, `refuses an item that is not owned: no stack`, `… only among the owned equipments`: `applyTradeToInventory` del Task 1 lancia già `ITEM_NOT_OWNED` quando la pila manca (il caso «quantità 0» invece era rosso: la vendita lanciava `INSUFFICIENT_ITEM_QUANTITY`);
  - `drinks again at the exact millisecond the recovery ends`, `treats a recovery that is not a date as over`, `drinks a potion of power 0 that cures an injury`, `drinks at full life points when an injury is curable`: casi positivi, il Task 1 non rifiutava nulla.
  - tsc verde al RED del Task 2 (le factory esistono dal 18-06).

## Verifica

- `npx jest src/characters/items/item-use.plan.spec.ts --selectProjects unit`: 49 test verdi
- suite unit completa: 252 suite / 3202 test verdi in ~10 s
- `npx tsc --noEmit -p tsconfig.json`: 0; prettier e eslint puliti sui due file
- Conteggi titoli: D-17) 14, D-23) 10, D-22) 2, D-19) 1
- Grep d'accettazione: `applyTradeToInventory`, `soldQuantityGuards`, `knowledgeUpdateOf`, `recoveryDueAt`, `cureInjuries` 2 ciascuno; `ownedEquipments`, `Date.now`, `activeTravel` 0; le quattro factory 1 ciascuna
- `src/schema.gql` invariato (nessuna superficie nuova in questo piano)

## Deviations from Plan

None - plan executed exactly as written. Unica nota di bookkeeping: `Plan: 7 of 11` senza zero iniziale (formato del brief); il verify del Task 3 che cerca `07` non passa, innocuo.

## Note per il piano 18-08

- Un `potionRecoveryUntil` a DB che non è una `Date` (es. stringa scritta col driver nativo) vale come ricarica finita per il piano, ma la guardia del filtro (nullo oppure minore o uguale a now) non lo prende: la scrittura avrebbe `matchedCount` 0. Mongoose casta a Date sugli update del modello, quindi il caso nasce solo da script esterni; se serve, il servizio lo tratta come gli altri `matchedCount` 0 (A3).
- `item: null` (posseduto ma assente dal catalogo) → `ITEM_NOT_USABLE` (A4), solo dopo il controllo di possesso.

## Known Stubs

Nessuno.

## Threat Flags

Nessuna superficie nuova: modulo puro senza I/O. T-18-27..T-18-31 mitigate come da piano (casi `D-23)`, `D-17)`, `D-22)` a tabella).

## Self-Check: PASSED
