---
phase: 19-revisione-dei-modelli
plan: 11
subsystem: lore
tags: [pet, lore, relatedLore, unlockedLore, negozio, pet in premio, D-26]
requires: [19-06, 19-10]
provides:
  - "`Pet.relatedLore: [Lore!]!` (modello, SDL additivo) risolto per viewer da `PetRelatedLoreResolver`"
  - "`VisibleLoreLoader` (provider di `LoreVisibilityModule`): caricamento per id delle sole lore visibili, condiviso da `LootItem` e `Pet`"
  - "`src/lore/related-lore-ids.ts` — `relatedLoreIdsOf` (lettore sanificante dei ref, condiviso)"
  - "`CatalogPricesReader.read` → `{ prices, petLifePoints, petLore }`; `boughtPetLore(lines, petLore)` e tipo `PetLore` in `trade-pets.ts`"
  - "`RewardCatalog.petLore?` (hex → lore) e `DrawnRewards.petLore` (vuota senza pet)"
  - "registro dei ref a 35 riferimenti in 11 collection (`pets:relatedLore`)"
affects: [19-12, 19-22, 19-23]
tech-stack:
  added: []
  patterns: [add-to-set delle sole lore nuove nella stessa scrittura della voce, loader condiviso fra resolver di tipo]
key-files:
  created:
    - src/lore/related-lore-ids.ts
  modified:
    - src/models/pet.model.ts
    - src/models/pet.schema.spec.ts
    - src/lore/related-lore.resolvers.ts
    - src/lore/lore-visibility.module.ts
    - src/lore/lore-related.int-spec.ts
    - src/migrations/mixed-refs/mixed-ref-paths.ts
    - src/migrations/mixed-refs/mixed-ref-paths.spec.ts
    - test/fixtures/pet.fixture.ts
    - test/app.int-spec.ts
    - src/schema.gql
    - src/characters/items/item-use.plan.ts
    - src/economy/trade/trade-pets.ts
    - src/economy/trade/trade-pets.spec.ts
    - src/economy/trade/catalog-prices.reader.ts
    - src/economy/trade/catalog-prices.reader.int-spec.ts
    - src/economy/trade/shop-transaction.service.ts
    - src/economy/trade/shop-transaction.service.int-spec.ts
    - src/quests/outcomes/rewards/quest-rewards.ts
    - src/quests/outcomes/rewards/quest-rewards.spec.ts
    - src/quests/outcomes/resolution-loader.service.ts
    - src/quests/outcomes/outcome-plan.ts
    - src/quests/outcomes/outcome-plan.spec.ts
    - src/quests/outcomes/quest-pet-prize.int-spec.ts
decisions:
  - Il corpo del resolver di `LootItem` è stato estratto in `VisibleLoreLoader` invece di essere copiato sul tipo `Pet`
  - Il lettore sanificante dei ref vive in `src/lore/related-lore-ids.ts` e lo usano bevuta, negozio e premio
  - `RewardCatalog.petLore` è una mappa a parte e opzionale: `RewardCatalog.pets` resta hex → `maxLifePoints`
  - `PetInput` non riceve `relatedLore` (come `LootItemInput`)
metrics:
  completed: 2026-11-11
  tasks: 3
  files: 24
---

# Phase 19 Plan 11: lore dei pet sbloccate quando il pet viene ottenuto — Summary

`Pet.relatedLore` è un campo additivo (lista di `ObjectId` ref `Lore`, default vuota) servito per viewer come quello di `LootItem`; comprare un pet o vincerlo in premio unisce le sue lore NUOVE a `status.unlockedLore` con un add-to-set nella stessa scrittura che aggiunge la voce di `ownedPets`; vendere non toglie nulla. Nessun passo del migratore, nessun contenuto nel repo.

## Commit

| Task | Commit | Subject |
|------|--------|---------|
| 1 RED | `db6630ea` | `test(lore): pin the related lore of a pet per viewer` |
| 1 GREEN | `379a92a6` | `feat(lore): link the pets to their lore per viewer` |
| 2 RED | `5eab6b10` | `test(economy): pin the pet lore unlocked on acquisition` |
| 2 GREEN | `3503af49` | `feat(economy): unlock the lore of a pet when it is obtained` |
| 3 | (questo e il successivo) | `docs(phase-19): summarize plan 11`, `docs(phase-19): record plan 11 progress` |

Nessun trailer in nessun commit (controllo a `0` dopo ognuno).

## Evidenza RED

- **Task 1, unit (3 rossi, 2 suite)** — `pet.schema.spec.ts`: il caso nuovo `stores the related lore of a pet as typed references, empty by default (D-26)` (path assente) e `declares no state on the catalogue pet (D-03)` (la lista dei path attende `relatedLore`); `mixed-ref-paths.spec.ts`: `counts 35 references in 11 collections (D-17d)` (34 in 10).
- **Task 1, integration (8 rossi su 112, 2 suite)** — i sei casi `(D-26)` di `lore-related.int-spec.ts` (il campo non esiste sullo SDL: errore di validazione della query) e i due casi di `test/app.int-spec.ts` che confrontano `CATALOGUE_PET_BLOCK`. Verdi al primo colpo: nessuno (l'asserzione `input PetInput` assente è dentro un caso rosso per il blocco).
- **Task 2, unit (7 rossi, 3 suite)** — `trade-pets.spec.ts`: i tre casi di `boughtPetLore` (funzione assente); `quest-rewards.spec.ts`: i due `toEqual` interi che attendono `petLore: []` e il caso nuovo `carries the lore of the won pet and none without the pet (D-26)`; `outcome-plan.spec.ts`: `unlocks the lore of the won pet with the knowledge of the outcome (D-26)`.
- **Task 2, verdi al primo colpo (attesi)** — `unlocks no pet lore when the pet is already owned (D-26)` e `keeps the update unchanged for a won pet without lore (D-26)`: pinnano l'assenza di un effetto, vera anche prima del codice; restano come guardia della regola «solo con la voce aggiunta». Lo stesso vale, sul replica set, per `keeps the unlocked lore when the pet is sold (D-26)` e `leaves the unlocked lore untouched when the bought pet has no lore (D-26)`.
- **Task 2, integration (3 rossi su 79, 3 suite)** — `unlocks the lore of a bought pet in the purchase write (D-26)`, `reads the related lore of the pets next to the prices, whatever the stored form (D-26)`, `unlocks the lore of the pet won as a prize and reports it on the result (D-26)`.
- Fra RED e GREEN del task 2 `tsc` è rosso per i soli nomi non ancora dichiarati (`boughtPetLore`, `petLore`).

## Cosa è cambiato

- **Modello e SDL:** `relatedLore` su `Pet` nella stessa forma di `LootItem`; nello SDL la sola riga `  relatedLore: [Lore!]!` nel blocco `type Pet`, fra `name` e `sellPrice` (Assumption A1 confermata). `PetInput` invariato; `input PetInput` resta fuori dallo SDL (asserzione aggiunta al boot reale).
- **Filo:** `PetRelatedLoreResolver` in `related-lore.resolvers.ts`, registrato in `LoreVisibilityModule` (che registra già `Lore` nel suo `forFeature`); `pets.module.ts` non toccato. Il corpo comune ai due tipi vive in `VisibleLoreLoader` (`@Injectable`, stesso file, provider del modulo, non esportato).
- **Registro:** `array('pets', 'relatedLore')` → 35 riferimenti in 11 collection.
- **Dove vive il lettore sanificante dei ref:** `src/lore/related-lore-ids.ts` (`relatedLoreIdsOf`): ObjectId o esadecimale a 24 letti, ogni altra voce scartata, campo assente o non lista = nessuna lore. Era privato di `item-use.plan.ts`, che ora lo importa.
- **Forma del ritorno del lettore dei prezzi:**

```typescript
export interface CatalogReading {
    prices: CatalogPrices;
    petLifePoints: PetLifePoints; // hex del pet → maxLifePoints non validato
    petLore: PetLore;             // hex del pet → lore già sanificate (lista vuota senza lore)
}
```

  `PET_PROJECTION` porta anche `relatedLore`. Unico chiamante: `ShopTransactionService.execute`.
- **Negozio:** lo snapshot in sessione proietta `status.unlockedLore`; `applyTrade` calcola `knowledgeUpdateOf(snapshot.status?.unlockedLore, boughtPetLore(lines, petLore)).addition` e `writeInventory` lo spande accanto al set dell'inventario. Senza lore nuove l'aggiunta è `{}` e l'update è quello di prima. Il risultato della transazione non guadagna campi.
- **Esito:** `readPrizePets` proietta `maxLifePoints` e `relatedLore` e ritorna `{ pets, petLore }` (spanso nel catalogo dei premi); `drawRewards` copia le lore del pet vinto in `DrawnRewards.petLore` (vuota se il tiro va male o il catalogo non le porta); in `planParticipant` entrano nella lista di `knowledgeUpdateOf` dopo vittoria e studio, solo con `petWon` non nullo, e finiscono in `result.loreUnlocked`. I tiri consumati da `drawRewards` non cambiano.

## Esito delle prove (dopo l'ultimo commit GREEN)

- `npx jest --selectProjects unit` → 268 suite, 3433 test verdi (eseguito prima di ognuno dei due commit GREEN: 3426 dopo il task 1).
- Progetto integration intero, a pezzi, in primo piano, un jest alla volta, nessun comando spostato in background — **142 suite, 1984 test, tutti verdi**:
  - `src/characters test/app.int-spec.ts` → 24 suite, 466 test (79 s); `git diff --exit-code src/schema.gql` → 0.
  - `src/travel src/shops src/economy src/cities src/lore src/models test/shops test/fixtures` → 29 suite, 416 test (102 s).
  - `src/quests` → 35 suite, 512 test (160 s).
  - resto (`src/auth`, `src/authz`, `src/eventsub`, `src/graphql`, `src/http`, `src/migrations`, `src/mongo`, `src/pendingQuests`, `src/pointsOfInterest`, `src/push`, `src/rest`, `src/roads`, `src/throttling`, `src/time`, `src/users`, `src/validation`, `test/auth`, `test/authz`, `test/harness`, `test/quests`) → 54 suite, 590 test (108 s).
  - `jest --listTests` del progetto integration elenca 142 file: i quattro pezzi li coprono tutti.
- `npx tsc --noEmit -p tsconfig.json` → 0 dopo ogni commit GREEN. Prettier ed eslint sui file toccati, uno per uno: puliti (resta il solo warning preesistente di `test/app.int-spec.ts`). `pgrep -fl 'bin/jest'` vuoto a fine di ogni task.

## Criteri di accettazione

| Criterio | Esito |
|----------|-------|
| riga `relatedLore: [Lore!]!` nel blocco `type Pet` dello SDL | 1 |
| `class PetRelatedLoreResolver` in `related-lore.resolvers.ts`; `PetRelatedLoreResolver` in `lore-visibility.module.ts` | 1; 2 |
| `'pets', 'relatedLore'` nel registro; `toHaveLength(35)` nella spec | 1; 1 |
| `D-26)` in `lore-related.int-spec.ts` | 6 |
| `git diff HEAD~1 --stat -- src/pets/pets.module.ts \| wc -l` | 0 |
| `export function boughtPetLore` in `trade-pets.ts` | 1 |
| `status.unlockedLore` ≥ 1 e `knowledgeUpdateOf(` = 1 in `shop-transaction.service.ts` | 1 e 1 |
| `petLore` ≥ 1 in `outcome-plan.ts` | 2 |
| `D-26)` in `shop-transaction.service.int-spec.ts` / `outcome-plan.spec.ts` | 3 / 3 |
| file sotto `src/migrations/model-review/` nei commit del piano | 0 |

## Deviazioni dal piano

**1. [Clean Code, CLAUDE.md] `VisibleLoreLoader` invece di un corpo copiato**
- Il piano chiedeva un resolver «dal corpo identico a quello di `LootItem`». Le otto righe (viewer, id visibili, query per id, ordine dei ref, orfani scartati) sono state estratte in un provider condiviso dai due resolver: stesso comportamento sul filo (i sette casi di `LootItem` e i sei del pet verdi), nessuna duplicazione.

**2. [Regola 3 - Blocco] file fuori da `files_modified`**
- `src/lore/related-lore-ids.ts` (nuovo) e `src/characters/items/item-use.plan.ts`: è la via indicata dal piano per riusare `relatedLoreIdsOf` senza duplicarlo (tolto anche l'import di `refIdOf` rimasto senza usi).
- `src/economy/trade/catalog-prices.reader.int-spec.ts` e `src/quests/outcomes/rewards/quest-rewards.spec.ts`: il ritorno del lettore e `DrawnRewards` cambiano forma; i loro attesi interi e un caso nuovo ciascuno sono nel commit RED.

**3. [Regola 2 - Copertura] casi in più**
- `trade-pets.spec.ts`: `collects the lore in the order of the lines without repeating a page (D-26)` (terzo caso oltre ai due del `<behavior>`).
- `catalog-prices.reader.int-spec.ts`: `reads the related lore of the pets next to the prices, whatever the stored form (D-26)` — id scritto come stringa, voce illeggibile, campo assente (T-19-48 sul percorso d'acquisto).
- `quest-rewards.spec.ts`: `carries the lore of the won pet and none without the pet (D-26)`.

**4. [Scelta dentro il contratto] `RewardCatalog.petLore` opzionale e separata**
- `RewardCatalog.pets` resta la mappa hex → `maxLifePoints` (il piano 19-22 ci conta); le lore viaggiano in una mappa accanto, opzionale come `studyLorePool`, così i cataloghi costruiti dalle spec esistenti non cambiano.

**5. [Ordine dei commit di chiusura e forma di STATE] come nei piani 01–10**
- SUMMARY in un commit suo prima del bookkeeping; `Plan: 11 of 23`.

Nessuna decisione architetturale (Regola 4).

## Note per i piani successivi

- **Registro dei ref:** oggi 35 in 11 collection. Sequenza attesa: 34 in 19-12, 34 in 19-15, 32 in 19-20, 33 con `pets:enemy` in 19-22 (`pets` è già fra le collection).
- **19-22 (D-28):** `readPrizePets` ritorna `Pick<RewardCatalog, 'pets' | 'petLore'>` ed è spanso nel catalogo: chi allarga la lettura dei pet candidati deve riempire anche `petLore` per ogni candidato, altrimenti il pet vinto non sblocca le sue lore. `drawRewards` legge `catalog.petLore?.get(hex)` del pet uscito.
- **Chi costruisce un `DrawnRewards` a mano** deve dare `petLore` (obbligatorio; `NO_REWARDS` lo porta vuoto). Chi usa `CatalogReading` trova `petLore` sempre presente.
- **Un nuovo modo di ottenere un pet** (oltre a negozio e premio) deve unire `relatedLoreIdsOf(pet.relatedLore)` con `knowledgeUpdateOf` nella stessa scrittura che aggiunge la voce.
- **Osservazione, non corretta:** il sorteggio della lore di studio esclude le lore già note e quelle della vittoria, non quelle del pet vinto nello stesso esito; se coincidono, la lista finale non ha doppioni (dedup di `knowledgeUpdateOf`) ma il tiro dello studio è «speso» su una lore che il pet avrebbe dato comunque. Caso raro (study con pet in premio); da decidere se vale una regola.
- **Handoff FE (19-23):** `Pet.relatedLore` è additivo e la FE non lo seleziona; l'acquisto non cambia risposta, la FE vede `unlockedLore` cambiare su `characterUpdated`; per il premio le lore del pet arrivano in `QuestResult.loreUnlocked` dopo quelle della vittoria e dello studio.
- **Contenuto (orchestratore, D-25):** i collegamenti dei 44 pet e la lore «Cavallo da viaggio» si scrivono a DB; un id scritto come stringa è letto correttamente sul filo, in negozio e nel premio. I pet già posseduti prima dei collegamenti non ricevono le lore a posteriori (a DB oggi nessun personaggio possiede pet).
- BE-MODEL-10 lato codice è completo: nessuna spunta in REQUIREMENTS (piano di chiusura).

## Stub noti

Nessuno.

## Threat flags

Nessuna superficie nuova fuori dal threat model: T-19-45 (resolver sul tipo con le sole lore visibili: casi giocatore, oste, senza personaggio, query singola), T-19-46 (lore unite solo nell'update che aggiunge la voce: `boughtPetLore` sulle sole righe d'acquisto, `petWon` non nullo; casi del pet già posseduto e della vendita), T-19-47 (solo add-to-set delle novità: casi della lore già nota, unit e replica set), T-19-48 (lettore sanificante e caricamento per id: casi dell'orfano e dell'id stringa su filo e lettore dei prezzi), T-19-49 (nessun file di contenuto, nessun passo del migratore) mitigati.

## Self-Check: PASSED

- `src/lore/related-lore-ids.ts` esiste; i quattro commit `db6630ea`, `379a92a6`, `5eab6b10`, `3503af49` sono in `git log`; `git status --short` vuoto prima di questo documento.
