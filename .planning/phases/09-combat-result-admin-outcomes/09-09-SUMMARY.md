---
phase: 09-combat-result-admin-outcomes
plan: 09
subsystem: economy
tags: [shop, doTransaction, guards, city, awaiting-aid, travel, tdd]

# Dependency graph
requires:
  - phase: 09-combat-result-admin-outcomes (09-01)
    provides: CharacterStatus.awaitingAid
  - phase: 09-combat-result-admin-outcomes (09-02)
    provides: GameRuleException.shopNotInCity() / codice SHOP_NOT_IN_CITY con messaggio italiano
  - phase: 04-integrita-economica-atomics
    provides: ShopTransactionService.applyTrade (snapshot in sessione, filtro della scrittura come regola, D-10/D-11)
  - phase: 08-travel-lifecycle
    provides: status.activeTravel, buildActiveTravelDoc
provides:
  - doTransaction rifiuta con SHOP_NOT_IN_CITY fuori dal marker di una città, in viaggio o in attesa di soccorso (D-18), scambio vuoto incluso
  - pre-verifica in sessione + riaffermazione nel filtro della scrittura dell'inventario ('status.location', 'status.activeTravel': null, 'status.awaitingAid': null)
  - EconomyModule registra City (C4)
  - helper di test placeInCity(harness, character) e cityModelOf(harness) in test/economy/place-in-city.ts
affects: [09-16, FE Phase 7 (negozio solo in città), FE Phase 9]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Guard di posizione del negozio: pre-verifica sullo snapshot letto in sessione + stessa regola riaffermata nel filtro dell'updateOne condizionale"
    - "Helper di test che registra un modello sulla connessione dell'harness solo se il modulo non lo fa (cityModelOf)"

key-files:
  created:
    - test/economy/place-in-city.ts
  modified:
    - src/economy/trade/shop-transaction.service.ts
    - src/economy/economy.module.ts
    - src/economy/trade/do-transaction.int-spec.ts
    - src/economy/trade/shop-transaction.service.int-spec.ts
    - src/characters/characters-ownership.int-spec.ts

key-decisions:
  - "Solo il markerLocation della città abilita il negozio: un POI in pointsOfInterest non basta (D-18), il marker legacy salvato come stringa esadecimale vale (idForms)"
  - "Lo scambio vuoto legge lo snapshot con la stessa proiezione senza sessione e applica la stessa guard: stesso esito per il FE, nessuna transazione aperta"
  - "writeInventory riceve { characterId, location } (TraderAtShop): la posizione verificata entra nel filtro della scrittura"

patterns-established:
  - "Suite del negozio: il creatore comune del personaggio (playerWith / persistTrader) lo mette in città; playerOutsideCity / persistTraderOutsideCity per i rifiuti di posizione"

requirements-completed: []  # contributo a BE-COMBAT-03 (D-18); traceability nel gate 09-16

# Metrics
duration: 6min
completed: 2026-10-24
---

# Phase 9 Plan 09: Guard del negozio SHOP_NOT_IN_CITY Summary

**`doTransaction` risponde solo sul marker di una città, fuori dal viaggio e dal soccorso: pre-verifica sullo snapshot letto in sessione e riaffermazione di `status.location`, `activeTravel: null`, `awaitingAid: null` nel filtro della scrittura dell'inventario; lo scambio vuoto applica la stessa regola; `EconomyModule` registra `City`**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-10-24T15:41:42Z
- **Completed:** 2026-10-24T15:47:30Z
- **Tasks:** 2 (2/2)
- **Files modified:** 6 (1 creato, 5 modificati)

## Accomplishments

- `ShopTransactionService`: `TRADE_SNAPSHOT_PROJECTION` legge `status.location`, `status.activeTravel.endTime`, `status.awaitingAid`; `shopLocationOrReject(snapshot, session)` rifiuta senza posizione, in viaggio, in attesa di soccorso o se nessuna `City` ha `markerLocation` fra `idForms(location)`; in `applyTrade` gira dopo il controllo del personaggio e prima di possesso e fondi.
- `writeInventory` riafferma la guard nel filtro: `{ ...activeCharacterById, 'status.location': { $in: idForms(location) }, 'status.activeTravel': null, 'status.awaitingAid': null, ...soldQuantityGuards }`.
- Scambio vuoto: `assertCharacterExists` → `assertCharacterCanTrade` (stessa proiezione, `NOT_FOUND` se assente, poi la guard con session `null`); nessuna transazione aperta.
- Ordine dei rifiuti documentato: id e quantità → catalogo → cross-check del totale → personaggio → città (D-18) → possesso → fondi.
- `WalletService` resta l'unico scrittore dei saldi (`$inc` assente nel servizio).

## Task Commits

| # | Task | Commit | Tipo |
|---|------|--------|------|
| 1 | helper placeInCity e casi del negozio in città (C4) | `9ef7ddd` | test |
| 2 | guard SHOP_NOT_IN_CITY (RED) | `537dbf9` | test |
| 2 | guard SHOP_NOT_IN_CITY (GREEN) | `a981ed5` | feat |

**Plan metadata:** commit `docs(phase-9): complete plan 09-09 ...` (SUMMARY, VALIDATION, STATE, ROADMAP)

## RED evidence

- **Task 1:** nessun RED atteso (la guard non esisteva): le 6 suite integration verdi 131/131 dopo lo spostamento in città.
- **Task 2:** `npx jest src/economy/trade/do-transaction.int-spec.ts src/economy/trade/shop-transaction.service.int-spec.ts --selectProjects integration --runInBand` → 2 suite fallite, **12 falliti / 44**: wire (POI senza città, marker in viaggio, marker in attesa di soccorso, POI di città non marker, scambio vuoto fuori città) e servizio (gli stessi più la corsa "viaggio iniziato fra la verifica e la scrittura" e lo scambio vuoto in attesa di soccorso). Passavano già in RED, per costruzione: `keeps ITEM_NOT_FOUND ahead of the city guard` (wire), `keeps ITEM_NOT_FOUND and NOT_FOUND ahead of the city guard` e `matches a legacy marker stored as a hex string` (servizio): sono prove d'ordine e di compatibilità legacy, non funzionalità nuove.

### Test esistenti modificati (C4, dichiarati)

Nessuna asserzione cambiata; solo la posizione dei personaggi:

- `src/economy/trade/do-transaction.int-spec.ts` — `playerWith` mette ogni giocatore in città (`buys at catalog prices on the wire`, i 7 `answers $code on the wire and writes nothing`, `lets exactly one of concurrent wire buys through`, `keeps an empty zero-total trade a valid no-op for the owner`); in Task 2 estratto `playerOutsideCity` e aggiunto il parametro `status`.
- `src/economy/trade/shop-transaction.service.int-spec.ts` — `persistTrader` mette ogni trader in città (tutti i `successful trades`, i `rejections`, i 3 casi `all-or-nothing under concurrency (SC2)`); `afterEach` svuota anche le città; in Task 2 estratti `persistCharacterOutsideCity` / `persistTraderOutsideCity` e il tipo `TraderInventory`.
- `src/characters/characters-ownership.int-spec.ts` — `alice` in città nel `beforeEach` (`doTransaction succeeds for the owner`, `doTransaction lets the innkeeper act on behalf of the owner`).
- `src/characters/archived-character-visibility.int-spec.ts` — **non modificato** (vedi Deviazioni).

## Verification

- `npx jest src/economy --selectProjects unit`: 69/69.
- `npx jest src/economy src/characters/characters-ownership.int-spec.ts src/characters/archived-character-visibility.int-spec.ts src/authz/audit/admin-audit.int-spec.ts --selectProjects integration --runInBand`: 7 suite, 157/157.
- Controllo extra sugli altri consumatori di `EconomyModule` (registrazione doppia di `City` con `QuestAcceptanceModule`): `npx jest src/quests/acceptance src/eventsub/eventsub-ledger.int-spec.ts --selectProjects integration --runInBand` 102/102.
- `npm run build`: 0. Prettier e ESLint puliti sui file toccati.
- Grep di accettazione: `GameRuleException.shopNotInCity()` = 2; `'status.awaitingAid': null` e `'status.activeTravel': null` 1 riga ciascuno; `City.name` in `economy.module.ts` 1 riga; `$inc` = 0; `placeInCity` ≥ 2 in entrambe le suite del negozio; `export async function placeInCity` 1 riga.

## Decisions Made

- Caso in più rispetto al piano: marker legacy salvato come stringa esadecimale → successo (copre `idForms` sul path Mixed `markerLocation`).
- Caso in più: corsa con un viaggio scritto fuori sessione fra la verifica della città e la scrittura → `SHOP_NOT_IN_CITY`, monete e inventario invariati, viaggio del rivale intatto (T-09-43: il WriteConflict fa rieseguire il callback, la pre-verifica in sessione rifiuta).
- `cityModelOf(harness)` esportato dall'helper: le suite creano città "di disturbo" (POI non marker) senza dipendere dalla registrazione di `City` nel modulo di test, così il RED falliva solo sui casi nuovi.

## Deviations from Plan

### Scostamenti minori

**1. `archived-character-visibility.int-spec.ts` non modificato**
- **Found during:** Task 1
- **Issue:** il piano la elenca fra i file del Task 1, ma tutti i suoi casi `doTransaction` colpiscono un personaggio archiviato: `NOT_FOUND` precede la guard della città (snapshot assente), anche per lo scambio vuoto.
- **Fix:** nessuna modifica (aggiungere città sarebbe stato rumore); la suite è nella verifica di entrambi i task ed è verde.
- **Commit:** documentato nel corpo di `9ef7ddd`.

**2. Progress Table della ROADMAP**
- Il piano indica `9/16`; l'orchestratore prescrive `7/16` (7 piani completati): applicato `7/16`.

Nessun'altra deviazione: nessuna regola 1–4 attivata.

## Issues Encountered

None.

## Known Stubs

None.

## Threat Flags

Nessuna superficie nuova oltre il threat model del piano (T-09-42 e T-09-43 mitigati e testati, T-09-44 accettato con il caso `ITEM_NOT_FOUND` fuori città).

## Self-Check: PASSED

- FOUND: test/economy/place-in-city.ts
- FOUND: 9ef7ddd, 537dbf9, a981ed5
