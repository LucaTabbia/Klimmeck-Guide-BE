---
phase: 12-negozi-per-citta
group: C
reviewed: 2026-11-03T12:00:00Z
depth: standard
files_reviewed: 18
files_reviewed_list:
  - src/characters/characters.module.ts
  - src/characters/characters.resolver.ts
  - src/characters/characters.service.ts
  - src/characters/creation/starting-character.ts
  - src/characters/pets/equip-pet.updates.ts
  - src/economy/economy.module.ts
  - src/economy/trade/catalog-prices.reader.ts
  - src/economy/trade/shop-transaction.service.ts
  - src/economy/trade/trade-inventory.ts
  - src/economy/trade/trade-line.ts
  - src/economy/trade/trade-pets.ts
  - src/economy/trade/trade-pool.ts
  - src/economy/trade/trade-pricing.ts
  - src/models/character/character-assets.model.ts
  - src/models/request/equip-pet-request.model.ts
  - src/models/request/transaction-items.model.ts
  - src/models/request/unequip-pet-request.model.ts
  - test/economy/place-in-city.ts
findings:
  critical: 0
  warning: 0
  info: 3
  total: 3
status: issues_found
---

# Phase 12: Code Review Report, gruppo C (trade e personaggi)

## Summary

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

Nessuno.

## Warning

Nessuno.

## Info

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
