---
phase: 22-completamento-guidato-missioni
plan: 03
subsystem: characters, shop
tags: [mission-lock, potions, shop, guards]
requires: ["22-01", "22-02"]
provides:
  - "refuseWhileOnMission nel piano puro della bevuta (ItemUsePlanInput.missionInProgress obbligatorio), letto in sessione da ItemUseService.drinkWithin"
  - "guardia MissionLockReader.assertFree in ShopTransactionService.shopOrReject, dopo la prigione e prima della città, per scambio pieno e scambio vuoto"
  - "MissionLockModule importato da ItemUseModule ed EconomyModule"
affects: [22-04, 22-05, 22-17]
tech-stack:
  added: []
  patterns: ["blocco letto nella stessa sessione della scrittura e passato al piano puro (useItem)", "guardia nel punto comune dei due rami del negozio (shopOrReject)"]
key-files:
  created: []
  modified:
    - src/characters/items/item-use.plan.ts
    - src/characters/items/item-use.plan.spec.ts
    - src/characters/items/item-use.service.ts
    - src/characters/items/item-use.module.ts
    - src/characters/items/use-item.int-spec.ts
    - src/economy/trade/shop-transaction.service.ts
    - src/economy/economy.module.ts
    - src/economy/trade/do-transaction.int-spec.ts
decisions:
  - "MissionLockReader è l'ultimo parametro del costruttore di ItemUseService e di ShopTransactionService"
  - "shopOrReject(characterId, snapshot, now, session): characterId in testa, assertFree riceve la sessione (null nello scambio vuoto)"
metrics:
  duration: "~25 min"
  completed: 2026-11-14
---

# Phase 22 Plan 03: guardie di `useItem` e del negozio Summary

Pozioni e compravendite rifiutate con `MISSION_IN_PROGRESS` a missione in corso (corsia standard avviata o bozza guidata aperta), con la precedenza dei codici di oggi: `AWAITING_AID` resta il primo rifiuto della bevuta, `CHARACTER_IMPRISONED` il primo del negozio; la missione precede possesso, ricarica ed effetto della pozione e il controllo «in città» del negozio. In viaggio verso la quest la pozione resta bevibile; con una story accettata e nessuna bozza il negozio resta aperto.

## Task e commit

| Task | Commit | Descrizione |
|------|--------|-------------|
| 1 RED | `301df81f` | `test(characters): pin the mission lock on potions` |
| 1 GREEN | `fd24aad9` | `feat(characters): lock potions during a mission` |
| 2 RED | `b35a0225` | `test(shop): pin the mission lock on trades` |
| 2 GREEN | `b3900f4a` | `feat(shop): lock trades during a mission` |
| 3 | commit di bookkeeping | `docs(phase-22): record plan 03 progress` |

## Fallimenti RED attesi

- Task 1 unit: 2 casi rossi su 3 nuovi (`refuses a potion during a mission with its own code (D-11, D-12)`, `refuses a mission before ownership and recovery (D-23)`): il piano ignora `missionInProgress` (nessun errore di tipo con ts-jest `isolatedModules`) e risponde rispettivamente con la bevuta riuscita e con `ITEM_NOT_OWNED`. Verde al primo colpo `keeps the aid refusal first (D-23)`: `AWAITING_AID` è già il primo rifiuto, il caso pinna la precedenza.
- Task 1 int-spec: 2 casi rossi su 3 (`extensions.code` `undefined`: la bevuta riesce). Verde al primo colpo `allows a potion while travelling to the quest (D-12)`: caso di permesso, verde per costruzione.
- Task 2 int-spec: 3 casi rossi su 5 — acquisto con hunt avviata e scambio vuoto con bozza story riescono; personaggio in missione su un POI interno esce con `SHOP_NOT_IN_CITY`. Verdi al primo colpo `keeps the prison refusal first (D-23)` (precedenza già vera) e `keeps the shop open to a character with a story accepted and no draft (D-12)` (permesso).

## Letterali di spec aggiornati

- `item-use.plan.spec.ts`: l'unico costruttore dell'input (`planWith`) passa `missionInProgress` (default `false`); `refusalOf` inoltra il terzo parametro. Nessun altro letterale di `ItemUsePlanInput` nel repo.
- `use-item.int-spec.ts`: `PlayerShape.quests` opzionale e helper `laneOf(lane, dates)` che crea la PendingQuest della corsia.
- `do-transaction.int-spec.ts`: `describe('mission lock')` con helper `putOnLane(player, lane, dates)` (PendingQuest + `$set` della corsia sul documento) e `expectRefusal`.

## Verifica

- `npx jest src/characters/items --selectProjects unit`: 63/63; `--selectProjects integration --runInBand`: 30/30.
- `npx jest src/economy --selectProjects unit`: 101/101; `--selectProjects integration --runInBand`: 122/122.
- Coverage di `src/economy` (comando del gate, unit + integration): **100 / 94.25 / 100** (statements / branches / functions; lines 100), sopra la soglia 98/91/98.
- Controllo allargato per la DI di `EconomyModule`: `npx jest test/app.int-spec.ts src/eventsub src/travel/ambush --selectProjects integration --runInBand` 190/190.
- `npx tsc --noEmit -p tsconfig.json` 0; `src/schema.gql` invariato; grep di accettazione: `refuseWhileOnMission(` 2, `missionLock.isLocked(` 1, `missionLock.assertFree(` 1, `MissionLockModule` in `economy.module.ts` 2, `D-23)` 17 (plan spec) e 2 (do-transaction).

## Deviations from Plan

None - plan executed exactly as written. (Commento d'intestazione dell'ordine dei rifiuti di `ShopTransactionService` aggiornato con prigione e missione: Boy Scout, stesso commit GREEN.)

## Known Stubs

Nessuno.

## Self-Check: PASSED

- File modificati presenti; commit `301df81f`, `fd24aad9`, `b35a0225`, `b3900f4a` nel log.
