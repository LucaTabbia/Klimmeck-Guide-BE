---
phase: 19-revisione-dei-modelli
plan: 06
subsystem: economy
tags: [pet, posseduti, OwnedPetEntry, negozio, pet in premio, D-03]
requires: [19-05]
provides:
  - helper puro `src/characters/pets/owned-pet-entry.ts` (`OwnedPetEntry`, `NewOwnedPetEntry`, `newOwnedPetEntry`, `ownsPet`)
  - `applyTradeToPets(snapshot, lines, petLifePoints)` e tipo `PetLifePoints` in `trade-pets.ts`
  - `CatalogPricesReader.read` → `CatalogReading { prices, petLifePoints }`
  - `RewardCatalog.pets` come mappa esadecimale → `maxLifePoints`; `DrawnRewards.petLifePoints`
  - `petWonBy` che ritorna una voce intera
affects: [19-07, 19-08, 19-09, 19-10, 19-11, 19-22]
tech-stack:
  added: []
  patterns: [voce costruita da un solo helper condiviso, valore del catalogo portato non validato fino al punto che lo sanifica]
key-files:
  created:
    - src/characters/pets/owned-pet-entry.ts
    - src/characters/pets/owned-pet-entry.spec.ts
  modified:
    - src/economy/trade/trade-pets.ts
    - src/economy/trade/trade-pets.spec.ts
    - src/economy/trade/catalog-prices.reader.ts
    - src/economy/trade/catalog-prices.reader.int-spec.ts
    - src/economy/trade/shop-transaction.service.ts
    - src/economy/trade/shop-transaction.service.int-spec.ts
    - src/economy/trade/do-transaction.int-spec.ts
    - src/economy/trade/trade-inventory.spec.ts
    - test/shops/city-shops.e2e.int-spec.ts
    - src/quests/outcomes/rewards/quest-rewards.ts
    - src/quests/outcomes/rewards/quest-rewards.spec.ts
    - src/quests/outcomes/resolution-loader.service.ts
    - src/quests/outcomes/outcome-plan.ts
    - src/quests/outcomes/outcome-plan.spec.ts
    - src/quests/outcomes/combatant-plan.spec.ts
    - src/quests/outcomes/quest-pet-prize.int-spec.ts
decisions:
  - Il lettore dei prezzi ritorna un oggetto `{ prices, petLifePoints }` invece della sola mappa dei prezzi
  - `maxLifePoints` viaggia non validato (`unknown`) dal catalogo fino a `newOwnedPetEntry`, unico punto che lo sanifica (non intero o negativo = 0, ruling dell'orchestratore)
  - `ownsPet` accetta l'id come ObjectId o esadecimale e risponde `false` per un id non valido
metrics:
  completed: 2026-11-11
  tasks: 3
  files: 18
---

# Phase 19 Plan 06: scrittori delle voci dei pet — Summary

Negozio e pet in premio scrivono e tolgono voci intere `{ pet, xp, currentLifePoints }`: il comprato e il vinto partono da `xp` 0 e dalla `maxLifePoints` del catalogo (0 se il valore non è valido), le altre voci conservano il loro stato, «già posseduto» confronta `pet` delle voci sullo snapshot e nel filtro della scrittura. Il rosso noto del piano 19-05 è chiuso: l'intero progetto integration è verde.

## Commit

| Task | Commit | Subject |
|------|--------|---------|
| 1 RED | `6a16e13b` | `test(economy): pin the pet trade on owned pet entries` |
| 1 GREEN | `3d083e5b` | `feat(economy): trade pets as owned pet entries` |
| 2 RED | `99341150` | `test(outcomes): pin the pet prize as an owned pet entry` |
| 2 GREEN | `ae021d1e` | `feat(outcomes): award a quest pet as an owned pet entry` |
| 3 | (questo e il successivo) | `docs(phase-19): summarize plan 06`, `docs(phase-19): record plan 06 progress` |

Nessun trailer in nessun commit (controllo a `0` dopo ognuno).

## Evidenza RED

- **Task 1, unit (5 rossi, una suite non caricata)** — `owned-pet-entry.spec.ts`: `Cannot find module './owned-pet-entry'` (0 test eseguiti); `trade-pets.spec.ts`: rossi `refuses to buy a pet already owned as an entry`, `adds a whole entry for a bought pet`, `removes the whole entry of a sold pet and keeps the others untouched`, `unequips the companion when its entry is sold`, `guards the write on the entry reference` (il codice confrontava e scriveva id nudi, guardie sulla lista intera).
- **Task 1, verde al primo colpo** — `refuses to sell a pet that is in no entry (D-03)`: una voce non è mai uguale a un id, quindi il vecchio confronto rifiutava già con lo stesso codice (per il motivo sbagliato); dopo il GREEN il confronto è su `entry.pet`. Verde anche `trade-inventory.spec.ts` (la guardia è un valore opaco passato in lista: cambia solo il path dell'esempio).
- **Task 1, integration (24 rossi su 124, 4 suite)** — i 15 casi del rosso noto nelle tre suite del negozio (ora seminati con `buildOwnedPet` e ancora rossi: gli scrittori salvavano id nudi), i due casi nuovi `stores a bought pet as an entry with the catalogue life points` e `removes the entry and keeps the state of the other pets on a sale`, e i casi di `catalog-prices.reader.int-spec.ts` (il lettore ritornava la sola mappa: `prices` e `petLifePoints` indefiniti).
- **Task 2, unit (12 rossi, 2 suite)** — `outcome-plan.spec.ts`: i casi del pet (id nudo al posto della voce, le cinque varianti del valore non valido) ; `quest-rewards.spec.ts`: `NO_REWARDS` e il risultato pieno senza `petLifePoints`, il caso nuovo sulla vita portata dal catalogo.
- **Task 2, integration (5 rossi su 6)** — `quest-pet-prize.int-spec.ts`: i tre casi del rosso noto più i due nuovi; verde il solo `leaves a winner without the pet on an unlucky roll` (nessuna scrittura dei posseduti).
- Fra il RED e il GREEN del task 2 `tsc` è rosso per il solo campo `petLifePoints` non ancora dichiarato e per `Map` al posto di `Set`.

## Forma del ritorno del lettore dei prezzi

`CatalogPricesReader.read(lines)` ritorna `CatalogReading`:

```typescript
export interface CatalogReading {
    prices: CatalogPrices;          // invariata: chiave `priceKey(kind, id)`
    petLifePoints: PetLifePoints;   // ReadonlyMap<esadecimale del pet, maxLifePoints non validato>
}
```

La lettura dei pet usa una proiezione sua (prezzi e veto più `maxLifePoints`); equipaggiamento e loot tengono la proiezione di prima. `CatalogPrice` non cambia (nessun campo dei pet sui prezzi degli oggetti). Unico chiamante: `ShopTransactionService.execute`, che passa la mappa ad `applyTradeToPets` dentro la transazione. Un pet a catalogo senza `maxLifePoints` compare nella mappa con valore indefinito e la voce parte da 0.

## Rosso noto del piano 19-05: chiuso

Le quattro int-spec sono verdi: `shop-transaction.service.int-spec.ts`, `do-transaction.int-spec.ts`, `test/shops/city-shops.e2e.int-spec.ts`, `quest-pet-prize.int-spec.ts`. Nessun rosso noto resta nel progetto.

## Esito delle prove (dopo l'ultimo commit GREEN)

- `npx jest --selectProjects unit` → 265 suite, 3354 test verdi (eseguito prima di ognuno dei due commit GREEN).
- Progetto integration intero, a pezzi, un jest alla volta — **141 suite, 1956 test, tutti verdi**:
  - `src/characters test/app.int-spec.ts` → 24 suite, 466 test (boot reale: 88).
  - `src/travel src/shops src/economy src/cities src/lore src/models test/shops test/fixtures` → 29 suite, 403 test.
  - `src/quests` → 35 suite, 503 test.
  - resto (`src/auth`, `src/authz`, `src/eventsub`, `src/graphql`, `src/http`, `src/migrations`, `src/mongo`, `src/pendingQuests`, `src/pointsOfInterest`, `src/push`, `src/rest`, `src/roads`, `src/throttling`, `src/time`, `src/users`, `src/validation`, `test/auth`, `test/authz`, `test/harness`, `test/quests`) → 53 suite, 584 test.
  - `jest --listTests` del progetto integration elenca 141 file: i quattro pezzi li coprono tutti.
- `npx tsc --noEmit -p tsconfig.json` → 0 dopo ogni commit GREEN. `git diff --exit-code src/schema.gql` → 0 (nessun cambio di SDL).
- Prettier ed eslint sui file toccati, uno per uno: puliti. `pgrep -fl 'bin/jest'` vuoto a fine di ogni task. Nessun comando spostato in background.

## Criteri di accettazione

| Criterio | Esito |
|----------|-------|
| `newOwnedPetEntry(` in `trade-pets.ts` | 1 |
| `assets.ownedPets.pet` in `trade-pets.ts` | 1 |
| `maxLifePoints` in `catalog-prices.reader.ts` | 3 |
| `D-03)` in `trade-pets.spec.ts` / `owned-pet-entry.spec.ts` | 6 / 3 |
| `newOwnedPetEntry(` e `ownsPet(` in `outcome-plan.ts` | 1 e 1 |
| `maxLifePoints` in `resolution-loader.service.ts` | 3 |
| `D-03)` in `quest-pet-prize.int-spec.ts` | 2 |
| `git diff HEAD~2 --stat -- src/quests/outcomes/combat \| wc -l` | 0 |

## Deviazioni dal piano

**1. [Regola 3 - Blocco] spec fuori da `files_modified` aggiornate nei commit RED**
- `catalog-prices.reader.int-spec.ts` (il ritorno del lettore cambia forma: `const { prices } = …`, più il caso nuovo `reads the max life points of the pets next to the prices (D-03)`), `quest-rewards.spec.ts` (`pets` come mappa, `petLifePoints` negli attesi pieni, caso nuovo sulla vita portata dal catalogo) e `combatant-plan.spec.ts` (`pets: new Map()`): sono le spec «indicate da `tsc`» del piano, portate nel RED perché i loro attesi devono fallire prima.

**2. [Regola 2 - Copertura del ruling] casi in più sul valore non valido**
- Oltre ai casi del `<behavior>`: `quest-pet-prize.int-spec.ts` → `stores a won pet at 0 life points when the catalogue has no valid amount (D-03)` (pet inserito col driver senza `maxLifePoints`), e in `owned-pet-entry.spec.ts` il valore `NaN`. Prova di integrazione del ruling «vita non valida = 0» sul percorso del premio.

**3. [Scelta dentro il contratto] tipi in più accanto al contratto**
- `NewOwnedPetEntry` (tipo del ritorno di `newOwnedPetEntry`, usato da `petWonBy`) e `PetLifePoints` (alias della mappa, in `trade-pets.ts`); `readPrices` è generica sul tipo letto e riceve la proiezione.

**4. [Titoli] casi esistenti rinominati invece di doppioni**
- In `trade-pets.spec.ts` e `outcome-plan.spec.ts` i casi (D-14)/(D-21) che pinnavano la stessa regola sulla forma vecchia sono stati riscritti coi titoli del `<behavior>`; restano coi titoli di prima `accepts buying a pet not owned (D-14)`, il caso Pitfall 5, `never gives the pet on a defeat (D-21)` e `starts the owned pets from an empty list when the sheet has none (D-21)` (attesi nella forma nuova).

**5. [Verifica oltre il piano, chiesta dall'orchestratore] intero progetto integration**
- Il controllo di wave del piano chiede economia, negozi, personaggi e quest: sono stati eseguiti tutti i pezzi.

**6. [Ordine dei commit di chiusura e forma di STATE] come nei piani 01–05**
- SUMMARY in un commit suo prima del bookkeeping; `Plan: 6 of 23`: il `grep -q "Plan: 06 of 23"` del piano non trova la riga, è atteso.

Nessuna decisione architetturale (Regola 4).

## Note per i piani successivi

- **Un solo costruttore di voci:** chi aggiunge un pet a un personaggio passa da `newOwnedPetEntry(petId, maxLifePoints)`; chi chiede «lo possiede?» da `ownsPet(entries, petId)` (`src/characters/pets/owned-pet-entry.ts`, puro, senza Nest). `OwnedPetEntry` è la forma lean per gli snapshot.
- **19-07 (passo dei personaggi):** la voce dell'orfano (D-23) si ottiene con `newOwnedPetEntry(id, undefined)` → vita 0.
- **19-08..19-10 (xp del compagno):** `OutcomeCharacterSnapshot.assets.ownedPets` è `OwnedPetEntry[]`; l'esito scrive `assets.ownedPets` come array intero una volta sola (`[...voci dello snapshot, voce vinta]` in `planParticipant`): l'xp del compagno deve entrare nello stesso valore finale, non in una seconda chiave.
- **19-11 (D-26, lore del pet ottenuto):** i due punti in cui nasce una voce sono `applyTradeToPets` (acquisto; la scrittura è `inventoryChanges` in `shop-transaction.service.ts`) e `petWonBy` in `outcome-plan.ts`. Il lettore dei prezzi ha già una proiezione dedicata ai pet (`PET_PROJECTION`) e un ritorno a oggetto: `relatedLore` può viaggiare accanto a `petLifePoints`; `readPrizePets` legge già il documento del pet in premio.
- **19-22 (D-28):** `RewardCatalog.pets` è una mappa esadecimale → `maxLifePoints`; `petDrawOf` consuma gli stessi tiri di prima (casi di `quest-rewards.spec.ts` invariati sui tiri).
- **Rosso/verde:** nessun rosso noto in eredità. Il boot reale conta 88 test.
- BE-MODEL-03 resta aperto per il solo passo del migratore (19-07); la spunta in REQUIREMENTS è del piano di chiusura.

## Stub noti

Nessuno.

## Threat flags

Nessuna superficie nuova fuori dal threat model: T-19-21 (rifiuti sullo snapshot più guardie sul path `assets.ownedPets.pet`, casi dei rifiuti e della scrittura concorrente verdi), T-19-22 (`xp` 0 e vita dal solo catalogo, nessun argomento li porta), T-19-23 (`newOwnedPetEntry` sanifica, casi unit e di integrazione) mitigati; T-19-24 accettato (filtro e transazione invariati, `ownedPets` un solo valore nell'update).

## Self-Check: PASSED

- I due file creati esistono; i quattro commit `6a16e13b`, `3d083e5b`, `99341150`, `ae021d1e` sono in `git log`.
