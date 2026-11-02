---
phase: 12-negozi-per-citta
reviewed: 2026-11-02T23:13:11Z
depth: standard (tre reviewer paralleli per area: A core, B maintenance, C trade)
files_reviewed: 48
files_reviewed_list:
  - src/app.module.ts
  - src/characters/characters.module.ts
  - src/characters/characters.resolver.ts
  - src/characters/characters.service.ts
  - src/characters/creation/starting-character.ts
  - src/characters/pets/equip-pet.updates.ts
  - src/cities/cities.resolver.ts
  - src/cities/city-size.ts
  - src/economy/economy.module.ts
  - src/economy/trade/catalog-prices.reader.ts
  - src/economy/trade/shop-transaction.service.ts
  - src/economy/trade/trade-inventory.ts
  - src/economy/trade/trade-line.ts
  - src/economy/trade/trade-pets.ts
  - src/economy/trade/trade-pool.ts
  - src/economy/trade/trade-pricing.ts
  - src/equipmentItems/equipment-items.resolver.ts
  - src/gameRules/game-rule-error-code.enum.ts
  - src/gameRules/game-rule.exception.ts
  - src/lootItems/loot-items.resolver.ts
  - src/models/character/character-assets.model.ts
  - src/models/city.model.ts
  - src/models/enums/city-size.enum.ts
  - src/models/interfaces/asset-item.model.ts
  - src/models/pet.model.ts
  - src/models/request/equip-pet-request.model.ts
  - src/models/request/transaction-items.model.ts
  - src/models/request/unequip-pet-request.model.ts
  - src/models/shop/city-shop.model.ts
  - src/models/shop/shop-pool-report.model.ts
  - src/schema.gql
  - src/shops/city-shop.resolver.ts
  - src/shops/city-shop.service.ts
  - src/shops/maintenance/owned-pets.migrator.ts
  - src/shops/maintenance/pet-sellable.migrator.ts
  - src/shops/maintenance/shop-boot.ts
  - src/shops/maintenance/shop-maintenance.module.ts
  - src/shops/maintenance/shop-pool.seeder.ts
  - src/shops/seeded-random.ts
  - src/shops/shop-admin.resolver.ts
  - src/shops/shop-pool-report.service.ts
  - src/shops/shop-pool.constants.ts
  - src/shops/shop-pool.draw.ts
  - src/shops/shop-pool.report.ts
  - src/shops/shop-pool.rules.ts
  - src/shops/shops.module.ts
  - test/economy/place-in-city.ts
  - test/shops/shop-world.fixture.ts
findings:
  critical: 0
  warning: 2
  info: 8
  total: 10
status: issues_found
---
# Code review — Phase 12 Negozi per città (fusione dei gruppi A, B, C)

I tre report di gruppo (`12-REVIEW-A.md`, `12-REVIEW-B.md`, `12-REVIEW-C.md`) restano la fonte; questo file li fonde per severità.

## Summary

### Gruppo A
Il nucleo è solido: sorteggio deterministico (seme sha256 per lista, candidati ordinati per id, resto maggiore con pareggi alla fascia più bassa), garanzie di loot dentro la quota, veti D-05 applicati in lettura e nel report, ordine del pool a DB rispettato con id stringa tollerati, duplicati e orfani scartati. `size`/`hasShop` sono `@ResolveField` senza populate dei pool, `CITY_SIZE_BY_TYPE` è esaustivo (`satisfies Record<CityType, CitySize>`), i ref dei `@Prop` sono nella forma `[{ type: ObjectId, ref }]`, `shopPoolReport` è innkeeper-only e di sola lettura, i log descrivono solo id, nomi e conteggi. Le deprecazioni D-20 lasciano invariato il comportamento e nello SDL cambiano solo le due righe attese. Nessun `process.env` sotto `src/` nei file del gruppo, nessun Mixed nuovo. Trovati un warning (città di `cityShop` non popolata) e due info.

### Gruppo B
Gruppo B pulito sulle regole trasversali: nessun `process.env` sotto `src/`, nessun nuovo `Mixed`, log con soli conteggi/nomi, `ShopMaintenanceModule` importato solo da `AppModule`, `ShopsModule` esporta `ShopPoolReportService` e `MongooseModule` (City, EquipmentItem, LootItem, Pet), nessun ciclo (`CitiesModule` non importa `ShopsModule`). Migratori e semina scrivono solo con filtro di esistenza (`sellable` fuori da `true`/`false`, `ownedPets` con `$nin` sulle due forme dell'id, pool con `$exists: false` ripetuto in scrittura); ordine e try/catch per passo di `ShopBoot` corretti. Un solo caso concreto di pool bloccato per sempre (WR-01) e tre rilievi di qualità.

### Gruppo C
Rivisti per intero i 18 file del gruppo C a profondità standard, con lettura incrociata di D-05, D-11, D-14, D-15, D-17, D-19, D-23 e delle regole di `shop-pool.rules.ts`. Nessun finding critical o warning.

Punti verificati e corretti:

- **Transazione unica.** Snapshot del personaggio e `findOne` della città (pool) sono letti con la stessa sessione. L'ordine dei rifiuti è quello di D-19: città, pool, doppione pet, possesso, fondi. Le scritture (inventario, pet, coins) stanno tutte nella transazione.
- **Guardie nel filtro di scrittura.** Città, assenza di viaggio e di soccorso, quantità vendute e possesso pet (`$nin` in acquisto, `$in` in vendita) sono riaffermate nel filtro. Una scrittura concorrente (anche `equipPet` fuori transazione) su un documento già modificato dopo lo snapshot dà un conflitto di scrittura, che il driver ritenta. Per questo `assets.pet` non serve nel filtro.
- **Veto.** Si applica solo agli acquisti, via `isShelfEligible`. La vendita di legendary resta libera (D-11).
- **Righe pet.** Quantità 1, dedup su `kind:id` anche tra compra e vendi, prezzi dal catalogo. `ownedPets` e `assets.pet` entrano nel `$set` solo con righe pet. `unequip` scatta solo se il pet venduto era quello equipaggiato.
- **`equipPet` e `unequipPet`.** Hanno `@OwnsCharacter`. Il filtro usa `activeCharacterById` più possesso con `idForms`. Un `petId` malformato dà `PET_NOT_OWNED`. Sono idempotenti perché `matchedCount` conta anche i documenti non modificati. Un archiviato risponde NOT_FOUND.
- **`findOne`.** Popola `assets.pet` e `assets.ownedPets` con `model: 'Pet'`, quindi `character` e `characterUpdated` sono coperti (il publisher passa da `findOne`).
- **Input.** `petAssets` è nullable senza `defaultValue`, con `@IsOptional`, `@IsArray`, `@ArrayMaxSize` e `@ValidateNested`/`@Type` completi. `EquipPetRequest` e `UnequipPetRequest` usano `@IsObjectIdHex`.
- **Trasversali.** Nessun `process.env` sotto `src/`. I ref sono nella forma `[{ type: ObjectId, ref }]`. Nessun nuovo `Mixed`. I codici d'errore vengono da `GameRuleException`. Nessuna rete nei test.
- **Default di `ownedPets`.** Il default implicito `[]` contro `default: undefined` dei pool di `City` è coerente. Per un personaggio un elenco vuoto è il valore corretto e la lettura non cambia, mentre le città non seminate devono restare distinguibili da quelle con pool vuoto (idempotenza della semina). Nessun rischio, solo da tenere distinto.

Restano tre osservazioni di qualità.

## Critical

### Gruppo A

Nessuno.

### Gruppo B

Nessuno.

### Gruppo C

Nessuno.

## Warning

### Gruppo A

### A-WR-01: `cityShop.city` non popola `markerLocation` (campo non nullable dello SDL)

**File:** `src/shops/city-shop.service.ts:32`
**Issue:** `read` carica la città con `findById(cityId).exec()` senza `populate`, mentre `CitiesService.findOne`/`findAll` popolano `markerLocation` (e `relatedLore`). `CityShop.city` è di tipo `City!` e `City.markerLocation` è `PointOfInterest!`: un client che seleziona `cityShop(cityId) { city { markerLocation { id name } } }` riceve un `ObjectId` al posto di un POI, quindi errore di non-null (`name`/`id` non risolvibili) e, risalendo, `cityShop` intero nullo. Lo spec di integrazione seleziona solo `city { id name size hasShop }`, quindi il buco non è coperto.
**Why it matters:** il tipo `City` espone campi che in questa query non sono mantenuti; l'FE della Phase 13 potrebbe riusare un fragment `City` completo e rompere l'intera schermata del negozio per un campo che non gli serve.
**Suggested fix:** spec RED in `city-shop.resolver.int-spec.ts` che interroga `city { id markerLocation { id } relatedLore { id } }` e si aspetta nessun errore. Poi popolare in `read` come negli altri percorsi (`findById(cityId).populate('markerLocation').populate('relatedLore')`), oppure riusare `CitiesService.findOne` (già importato via `CitiesModule`), tenendo i pool leggibili sul documento. In alternativa, restringere `CityShop.city` a un tipo ridotto (`id`, `name`, `type`, `size`, `hasShop`).

### Gruppo B

### B-WR-01: pool compagni congelato a `[]` se il compagno del piazzamento non è ancora a DB

**File:** `src/shops/maintenance/shop-pool.seeder.ts:83-86`
**Issue:** per `shopPets` la semina rinvia solo se `catalogue.pets.length === 0`. Se il catalogo ha almeno un compagno ma manca quello del piazzamento (es. `Cavallo leggero`), `petsFor` (`shop-pool.draw.ts:199-212`) restituisce `[]`, che viene scritto come lista presente. Dal boot dopo il campo non è più assente (D-03/D-22: «la mano vince»), quindi il compagno aggiunto in seguito non entra mai nella città. `checkPetPlacements` avvisa solo se manca la città, non se manca il pet.
**Why it matters:** su un DB popolato a pezzi (città e qualche pet prima, gli altri dopo) le città dei piazzamenti restano senza compagni in vendita senza alcun segnale; l'unica cura è la scrittura a mano. Va contro lo spirito di D-22 (mai congelare una lista vuota per un catalogo incompleto).
**Suggested fix:** in `drawPool`, per una città con piazzamento (`SELLABLE_PET_PLACEMENTS` contiene nome+tipo) trattare `petsFor(...).length === 0` come rinviato (`undefined`), contando in `deferred`; le città senza piazzamento continuano a ricevere `[]`. Spec RED prima (in `shop-pool.seeder.int-spec.ts`): catalogo con solo `Pegaso` e `Fineglen` presente, `seedAll()` non scrive `shopPets` di Fineglen e `deferred` la conta; dopo aver creato `Cavallo leggero` un secondo `seedAll()` la semina.

### Gruppo C

Nessuno.

## Info

### Gruppo A

### A-IN-01: `petsFor` non applica il controllo del prezzo che `isSeedCandidate` impone agli oggetti

**File:** `src/shops/shop-pool.draw.ts:207`
**Issue:** per gli oggetti la semina scarta chi non ha `buyPrice` (`isSeedCandidate`, "darebbe ITEM_NOT_TRADABLE"), mentre `petsFor` ammette un pet con il solo `isShelfEligible`. `Pet.buyPrice` ha `default: null` ed è `Coins!` nello SDL: un pet piazzato ma privo di prezzo finirebbe sullo scaffale non acquistabile e, in `cityShop`, farebbe fallire il non-null sul campo `buyPrice`.
**Why it matters:** oggi i 4 pet di D-24 hanno prezzo, quindi è latente; basta un seme su un DB dove il prezzo è stato azzerato per avere uno scaffale rotto.
**Suggested fix:** spec RED in `shop-pool.draw.spec.ts` ("un pet piazzato senza `buyPrice` non entra nello scaffale"), poi `pet !== undefined && pet.buyPrice != null && isShelfEligible(pet)`.

### A-IN-02: voci del pool non-ObjectId finiscono nel report come `String(raw)`

**File:** `src/shops/shop-pool.report.ts:109`
**Issue:** per una voce che `refIdOf` non riconosce (non ObjectId né esadecimale a 24) `missing` riceve `String(raw)`; per un oggetto o un `null` il valore diventa `"[object Object]"`/`"null"`, che non è un `ID` utile per l'oste e viene esposto così nel campo `missing: [ID!]!`.
**Why it matters:** il report serve a guidare la cura a DB; un identificativo inutilizzabile rende la voce non rintracciabile.
**Suggested fix:** spec RED in `shop-pool.report.spec.ts` con una voce `{}` e una `null`; poi mappare le voci illeggibili a un marcatore stabile (ad esempio `'<invalid>'` con la posizione, `invalid@<indice>`), senza mai stampare il contenuto.

---

_Reviewed: 2026-11-03T12:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

### Gruppo B

### B-IN-01: `OwnedPetsMigrator` si ferma al primo `ownedPets: null`

**File:** `src/shops/maintenance/owned-pets.migrator.ts:42-46`
**Issue:** il filtro `$nin` su `assets.ownedPets` seleziona anche un valore `null`, e il `$push` su `null` fa errore del server; l'eccezione interrompe il ciclo (il passo viene loggato da `ShopBoot` ma i personaggi successivi non sono migrati, a ogni boot).
**Why it matters:** improbabile (schema con default `[]`, i legacy hanno il campo assente), ma un solo documento anomalo bloccherebbe l'intera migrazione.
**Suggested fix:** aggiungere un `try/catch` per personaggio che logga solo `_id`, oppure una prima `updateMany` con `{ 'assets.ownedPets': null }` e `$set: { 'assets.ownedPets': [] }`. Spec RED: personaggio con `ownedPets: null` e un secondo valido, il secondo viene migrato.

### B-IN-02: nome della città `null` nel log delle garanzie

**File:** `src/shops/maintenance/shop-pool.seeder.ts:203`
**Issue:** `SeedCity.name` è `string | null` e il template stampa `null` letterale; il log non indica quale città.
**Why it matters:** WARN poco utile per la cura a DB.
**Suggested fix:** includere l'id (`city._id.toHexString()`) accanto al nome, come già consentito dalla regola sui log (solo id/conteggi/nomi).

### B-IN-03: id reali di produzione nella fixture e doppio import di `ShopsModule`

**File:** `test/shops/shop-world.fixture.ts:105`, `src/app.module.ts:97-98`
**Issue:** la fixture assegna ai compagni di prova gli id di produzione (`SELLABLE_PET_IDS`), mentre il brief chiede nessun id reale; è però necessario perché la semina piazza per id, quindi è accettabile se documentato con un commento. In `app.module.ts` `ShopsModule` è importato sia direttamente sia da `ShopMaintenanceModule`: la riga diretta serve ai resolver, ma è la sola ragione per cui compare e non è spiegata.
**Why it matters:** solo leggibilità.
**Suggested fix:** commento di una riga nella fixture («id dei piazzamenti, non dati reali») e, in `AppModule`, tenere un solo import oppure annotare perché sono due.

---

_Reviewed: 2026-11-03T12:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

### Gruppo C

### C-IN-01: `writeInventory` risponde sempre INSUFFICIENT_ITEM_QUANTITY, anche se la guardia fallita è di città o di pet

**File:** `src/economy/trade/shop-transaction.service.ts:226`
**Issue:** se `matchedCount === 0`, il codice è sempre `insufficientItemQuantity()`, anche quando a fallire sarebbe la guardia `petOwnershipGuards` (`PET_ALREADY_OWNED` o `ITEM_NOT_OWNED`) o quella di città (`SHOP_NOT_IN_CITY`).
**Why it matters:** sotto isolamento snapshot lo snapshot letto e il filtro di scrittura vedono lo stesso stato, e una contesa vera produce un conflitto di scrittura ritentato dal driver, non `matchedCount 0`. Il ramo è quindi quasi irraggiungibile e il codice approssimato è accettabile come rete di sicurezza. Se un giorno diventasse raggiungibile, un acquisto di un pet già posseduto direbbe «quantità insufficiente», fuorviante per il FE.
**Suggested fix:** nessun intervento obbligatorio. Se si vuole rigore, riclassificare con una rilettura in sessione, come `classifyEquipPetFailure`. Spec RED da scrivere prima: un'unit con il modello mockato che restituisce `matchedCount 0` per uno scambio di sole righe pet e si aspetta `PET_ALREADY_OWNED` (acquisto) o `ITEM_NOT_OWNED` (vendita). In alternativa, un commento che dichiari il ramo difensivo.

### C-IN-02: `characters` (`findAll`) non popola `assets.pet` e `assets.ownedPets`

**File:** `src/characters/characters.service.ts:90`
**Issue:** D-23 popola i pet solo in `findOne`. `findAll`, usato dalla query `characters` riservata all'oste, restituisce `ownedPets` come lista di ObjectId, mentre il campo GraphQL è `[Pet!]!`. Una selezione di `assets { ownedPets { name } }` da parte dell'oste darebbe errori di campo non-null. Lo stesso vale già per `ownedItems`, `ownedEquipments` e `assets.pet`, quindi è coerente con lo stato precedente della query.
**Why it matters:** raggiungibile solo se un client admin seleziona i pet su `characters`. Nessun impatto sul gameplay.
**Suggested fix:** se serve, estrarre il blocco di populate di `findOne` in una costante condivisa e applicarla anche a `findAll`. Spec RED prima: un'unit su `findAll` con query mockata che si aspetta `populate` con `{ path: 'assets.ownedPets', model: 'Pet' }`. Altrimenti documentare in BACKEND-NOTES che la query admin non risolve i campi di `assets`.

### C-IN-03: il `findOne` della città per marker non è deterministico se due città condividono lo stesso `markerLocation`

**File:** `src/economy/trade/shop-transaction.service.ts:130`
**Issue:** `markerLocation` non ha indice unico (`src/models/city.model.ts:27`) e il `findOne` non ha ordinamento. Con due città sullo stesso marker, il pool servito dal negozio dipende dall'ordine naturale di Mongo.
**Why it matters:** oggi i dati del mondo non lo prevedono e la stessa assunzione c'è nel resto del codice. È comunque una dipendenza implicita, ricadente su un'autorità di vendita.
**Suggested fix:** nessun intervento. Per irrobustire: aggiungere `.sort({ _id: 1 })` al `findOne` oppure un indice unico su `markerLocation`. Spec RED prima: un'integration che crei due città sullo stesso marker con pool diversi e verifichi un esito stabile.

---

_Reviewed: 2026-11-03T12:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
