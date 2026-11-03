---
phase: 12-negozi-per-citta
fixed: 2026-11-02T23:39:30Z
source: 12-REVIEW.md
review_path: .planning/phases/12-negozi-per-citta/12-REVIEW.md
iteration: 1
fix_scope: all
findings_total: 10
findings_in_scope: 10
fixed_count: 7
skipped_count: 0
not_needed_count: 3
status: all_fixed
---

# Phase 12: report dei fix della code review

**Data dei fix:** 2026-11-02T23:39:30Z
**Review di partenza:** `.planning/phases/12-negozi-per-citta/12-REVIEW.md` (gruppi A/B/C, dettagli in `12-REVIEW-A/B/C.md`)
**Ruling applicati:** `.planning/phases/12-negozi-per-citta/REVIEW-RULINGS.md`
**Base:** `984356e` su `feat/12-negozi-per-citta`
**Iterazione:** 1

**Esito:** 10 finding (0 critical, 2 warning, 8 info) → 7 corretti (6 in TDD con coppia `test`/`fix`, B-IN-03 solo commenti), 3 `not_needed` per ruling senza modifiche al codice, 0 saltati. 15 commit, più questo report.

## Gate finale

| Controllo | Esito |
| --- | --- |
| `npx tsc --noEmit -p tsconfig.json` | exit 0 |
| `npx jest --selectProjects unit` | 193 suite / 2589 test verdi |
| `npx jest --selectProjects integration --runInBand` | 114 suite / 1423 test verdi (seconda esecuzione; la prima ha trovato i 2 rossi della e2e descritti in A-WR-01, corretti con `5cb04ef`) |
| `git diff --exit-code src/schema.gql` | exit 0 |
| `git diff origin/develop -- src/schema.gql`, righe tolte | solo le due di D-20 (`equipmentAssetsQuantity(sellable: Boolean): [AssetQuantity!]!` e `lootAssetsQuantity: [AssetQuantity!]!`) |
| `process.env.` nuovo sotto `src/` | 0 |
| trailer vietati in `984356e..HEAD` | 0 |
| `pgrep -fl jest` a fine lavoro | vuoto |

Nessun test instabile osservato.

## Fixed

### A-WR-01: `cityShop.city` non popola `markerLocation`, `relatedLore`, `pointsOfInterest`

**Ruling:** FIX, una sola catena di populate condivisa con `CitiesService.findOne`.
**RED osservato (`968e6dc`):** int-spec nuova in `src/shops/city-shop.resolver.int-spec.ts` che seleziona `city { markerLocation { id } relatedLore { id } pointsOfInterest { id } }`. Risposta: `data: null` con «ID cannot represent value: { type: "Buffer", … }» sul percorso `cityShop.city.markerLocation.id`. Il marker arrivava come ObjectId non popolato.
**Fix (`03304fb`):** nuovo `src/cities/city-relations.ts` con `cityRelations()`. La funzione restituisce a ogni chiamata un array nuovo di `PopulateOptions`: `relatedLore`, `markerLocation`, `pointsOfInterest` con `quest`. La usano `CitiesService.findOne` e `CityShopService.read` (`.populate(cityRelations())`). `findAll` delle città resta com'era, perché non popola i POI. `src/shops/city-shop.service.int-spec.ts` registra sulla connessione globale i modelli dei ref (Lore, PointOfInterest, Quest), altrimenti dà `MissingSchemaError`.
**Seguito (`5cb04ef`):** la suite integration completa ha trovato due rossi in `test/shops/city-shops.e2e.int-spec.ts` («Schema hasn't been registered for model Lore»). Quell'harness monta `ShopsModule` senza il modello Lore. Ora lo registra con `MongooseModule.forFeature`. È solo una modifica di test: in produzione `AppModule` registra già tutti i modelli.
**File:** `src/cities/city-relations.ts` (nuovo), `src/cities/cities.service.ts`, `src/shops/city-shop.service.ts`, `src/shops/city-shop.service.int-spec.ts`, `src/shops/city-shop.resolver.int-spec.ts`, `test/shops/city-shops.e2e.int-spec.ts`.

### B-WR-01: pool compagni congelato a lista vuota se il compagno piazzato non è ancora a DB

**Ruling:** FIX. Una città con piazzamenti per cui `petsFor` restituisce meno id dei piazzamenti resta rinviata. Una città senza piazzamenti riceve la lista vuota come oggi.
**RED osservato (`9bd3d23`):** int-spec in `shop-pool.seeder.int-spec.ts`. Il catalogo pet contiene il solo Pegaso. Primo `seedAll()`: atteso `{ equipment: 1, loot: 1, pets: 2, deferred: 23 }`, ricevuto `pets: 9, deferred: 16`. Fineglen riceveva `[]` e anche dopo l'aggiunta del Cavallo leggero restava `[]`. Valantar riceveva `[]` invece di restare assente.
**Fix (`707aed5`):** `placementsOf(city)` estratta ed esportata in `src/shops/shop-pool.draw.ts`, e `petsFor` la riusa. `placedPets` in `shop-pool.seeder.ts` restituisce `undefined` quando gli id sono meno dei piazzamenti. Restano invariati Necrorian (lista vuota esplicita) e la regola «catalogo pet vuoto → tutte rinviate», quindi il caso «catalogo vuoto + 9 città» conta ancora 24 liste rinviate e la sua aspettativa non cambia. La WARN «liste rinviate al prossimo boot» copre il nuovo caso. Dopo il fix il secondo `seedAll()` semina Fineglen (`pets: 1, deferred: 22`), mentre Valantar resta assente finché manca il Cammello.
**File:** `src/shops/shop-pool.draw.ts`, `src/shops/maintenance/shop-pool.seeder.ts`, `src/shops/maintenance/shop-pool.seeder.int-spec.ts`.

### B-IN-01: `OwnedPetsMigrator` si ferma al primo `ownedPets` null

**Ruling:** FIX, normalizzare le liste null prima del ciclo, senza try/catch per personaggio.
**RED osservato (`f400735`):** due personaggi con il pet equipaggiato, il primo con `ownedPets: null`. Il push fallisce con `MongoServerError` («The field 'assets.ownedPets' must be an array but is of type null»).
**Fix (`fc24eb5`):** `normalizeNullLists()` lancia un `updateMany` con filtro `{ 'assets.ownedPets': { $type: 'null' } }` e `$set` a `[]` prima del ciclo, e il ciclo resta com'è. Il ruling chiedeva un filtro di uguaglianza a null, ma quel filtro seleziona anche il campo assente: avrebbe scritto la lista vuota sui personaggi legacy senza pet equipaggiato e rotto lo spec «leaves the characters without an equipped pet untouched». Per questo il filtro usa il tipo null. Esito: entrambi migrati, `owned` = 2.
**File:** `src/shops/maintenance/owned-pets.migrator.ts`, `src/shops/maintenance/owned-pets.migrator.int-spec.ts`.

### A-IN-01: `petsFor` non scarta i pet senza prezzo

**Ruling:** FIX, condizione sul prezzo accanto a `isShelfEligible` e `buyPrice` nella proiezione dei pet.
**RED osservato (`a60309d`):** caso unit in `shop-pool.draw.spec.ts`: Cavallo leggero con `buyPrice: null` e Cammello con prezzo a Valantar. Ricevuti due id invece del solo Cammello. Nello stesso commit i pet già presenti nella spec ricevono un prezzo, altrimenti il fix li escluderebbe.
**Fix (`35b4ad8`):** `pet.buyPrice != null && isShelfEligible(pet)` in `petsFor`. `PET_PROJECTION` del seeder ora legge anche `buyPrice`: senza quel campo nessun pet entrerebbe più. Con B-WR-01, una città con un pet piazzato ma senza prezzo resta rinviata invece di ricevere una lista incompleta.
**File:** `src/shops/shop-pool.draw.ts`, `src/shops/maintenance/shop-pool.seeder.ts`, `src/shops/shop-pool.draw.spec.ts`.

### A-IN-02: voci illeggibili del pool nel report come `String(raw)`

**Ruling:** FIX, marcatore stabile `invalid@<indice>`.
**RED osservato (`b09cbac`):** caso nuovo con `shopLoot: [id mancante, {}, null]`. Attesi `invalid@1` e `invalid@2`, ricevuti `"[object Object]"` e `"null"`. Il caso esistente con la stringa `'not-an-id'` passa da `'not-an-id'` a `'invalid@0'`: anche una stringa che non è un id non va stampata.
**Fix (`9086fa8`):** `classifyList` scorre `list.ids.entries()` e una voce che `refIdOf` non legge diventa `invalidEntryOf(index)`. L'indice è la posizione nella sua lista, non nell'insieme delle tre liste.
**File:** `src/shops/shop-pool.report.ts`, `src/shops/shop-pool.report.spec.ts`.

### B-IN-02: nome `null` nella WARN delle garanzie di loot

**Ruling:** FIX, `name ?? _id.toHexString()`.
**RED osservato (`ee96dc1`):** int-spec con una città senza nome e loot senza fame. La WARN diceva «Negozi: null (valanVillage) senza le garanzie di loot hunger, hunger».
**Fix (`0cbb514`):** il template usa `city.name ?? city._id.toHexString()`.
**File:** `src/shops/maintenance/shop-pool.seeder.ts`, `src/shops/maintenance/shop-pool.seeder.int-spec.ts`.

### B-IN-03: id dei compagni nella fixture e doppio import di `ShopsModule`

**Ruling:** FIX con soli commenti, nessuna spec.
**Fix (`049b33b`):** commento in `test/shops/shop-world.fixture.ts`: gli id dei 4 pet sono quelli di `SELLABLE_PET_IDS` perché la semina piazza per id, e la fixture non porta altri dati reali. Commento in `src/app.module.ts`: `ShopsModule` è elencato anche dopo `ShopMaintenanceModule` per tenere montati i resolver `cityShop`/`shopPoolReport` anche senza la manutenzione, e Nest deduplica.
**File:** `src/app.module.ts`, `test/shops/shop-world.fixture.ts`.

## Not needed

### C-IN-01: guardia fallita in scrittura → `INSUFFICIENT_ITEM_QUANTITY`

**Ruling:** NOT_NEEDED. Sotto isolamento snapshot una contesa reale dà un WriteConflict, che viene ritentato con uno snapshot fresco e restituisce il codice specifico. Il caso residuo è documentato nel handoff §6. Nessuna modifica.

### C-IN-02: `characters` (`findAll`) non popola `assets.pet`/`ownedPets`

**Ruling:** NOT_NEEDED, va nel backlog. Il comportamento c'era già su `develop` per tutti i campi di `assets` e l'app non usa la lista. Nessuna modifica.

### C-IN-03: `markerLocation` senza indice unico

**Ruling:** NOT_NEEDED, accettato. L'invariante «una città per marker» è dei dati, c'era già prima ed è controllata dalla cura a DB. Nessuna modifica.

## Note per handoff e runbook

- **Rinvio dei `shopPets` (B-WR-01, A-IN-01).** Una città dei piazzamenti resta senza `shopPets`, rinviata e contata in `deferred` con la WARN «liste rinviate», finché tutti i suoi compagni piazzati non sono a catalogo, vendibili (non legendary e con `sellable` diverso da false) e con un prezzo. Se un compagno piazzato è a DB ma viene messo a mano `sellable: false` o senza prezzo, la città resta rinviata a ogni boot. `cityShop` la serve comunque con la lista vuota. Le città senza piazzamenti ricevono la lista vuota come prima.
- **Liste null nel migratore (B-IN-01).** Al boot `OwnedPetsMigrator` converte prima ogni `assets.ownedPets` null esplicito nella lista vuota (`updateMany` sul tipo null; il campo assente non viene toccato), poi aggiunge il compagno equipaggiato.
- **`cityShop.city` completo (A-WR-01).** La città del negozio ora risolve `markerLocation`, `relatedLore` e `pointsOfInterest` (con `quest`), come la query `city`. L'FE della Phase 13 può riusare un fragment `City` completo. Un harness che monta `ShopsModule` da solo deve registrare i modelli Lore, PointOfInterest e Quest.
- **Report del pool (A-IN-02).** Nel campo `missing` di `shopPoolReport` una voce che non è un id compare come `invalid@<indice>`, con l'indice nella sua lista (equipaggiamenti, loot o compagni). La lista si trova dal confronto con il documento della città.

---

_Fixed: 2026-11-03_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
