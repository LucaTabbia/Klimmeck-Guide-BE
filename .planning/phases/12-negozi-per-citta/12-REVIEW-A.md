---
phase: 12-negozi-per-citta
group: A
reviewed: 2026-11-03T12:00:00Z
depth: standard
files_reviewed: 23
files_reviewed_list:
  - src/cities/cities.resolver.ts
  - src/cities/city-size.ts
  - src/equipmentItems/equipment-items.resolver.ts
  - src/gameRules/game-rule-error-code.enum.ts
  - src/gameRules/game-rule.exception.ts
  - src/lootItems/loot-items.resolver.ts
  - src/models/city.model.ts
  - src/models/enums/city-size.enum.ts
  - src/models/interfaces/asset-item.model.ts
  - src/models/pet.model.ts
  - src/models/shop/city-shop.model.ts
  - src/models/shop/shop-pool-report.model.ts
  - src/schema.gql
  - src/shops/city-shop.resolver.ts
  - src/shops/city-shop.service.ts
  - src/shops/seeded-random.ts
  - src/shops/shop-admin.resolver.ts
  - src/shops/shop-pool-report.service.ts
  - src/shops/shop-pool.constants.ts
  - src/shops/shop-pool.draw.ts
  - src/shops/shop-pool.report.ts
  - src/shops/shop-pool.rules.ts
  - src/shops/shops.module.ts
findings:
  critical: 0
  warning: 1
  info: 2
  total: 3
status: issues_found
---

## Summary

Il nucleo è solido: sorteggio deterministico (seme sha256 per lista, candidati ordinati per id, resto maggiore con pareggi alla fascia più bassa), garanzie di loot dentro la quota, veti D-05 applicati in lettura e nel report, ordine del pool a DB rispettato con id stringa tollerati, duplicati e orfani scartati. `size`/`hasShop` sono `@ResolveField` senza populate dei pool, `CITY_SIZE_BY_TYPE` è esaustivo (`satisfies Record<CityType, CitySize>`), i ref dei `@Prop` sono nella forma `[{ type: ObjectId, ref }]`, `shopPoolReport` è innkeeper-only e di sola lettura, i log descrivono solo id, nomi e conteggi. Le deprecazioni D-20 lasciano invariato il comportamento e nello SDL cambiano solo le due righe attese. Nessun `process.env` sotto `src/` nei file del gruppo, nessun Mixed nuovo. Trovati un warning (città di `cityShop` non popolata) e due info.

## Critical

Nessuno.

## Warning

### A-WR-01: `cityShop.city` non popola `markerLocation` (campo non nullable dello SDL)

**File:** `src/shops/city-shop.service.ts:32`
**Issue:** `read` carica la città con `findById(cityId).exec()` senza `populate`, mentre `CitiesService.findOne`/`findAll` popolano `markerLocation` (e `relatedLore`). `CityShop.city` è di tipo `City!` e `City.markerLocation` è `PointOfInterest!`: un client che seleziona `cityShop(cityId) { city { markerLocation { id name } } }` riceve un `ObjectId` al posto di un POI, quindi errore di non-null (`name`/`id` non risolvibili) e, risalendo, `cityShop` intero nullo. Lo spec di integrazione seleziona solo `city { id name size hasShop }`, quindi il buco non è coperto.
**Why it matters:** il tipo `City` espone campi che in questa query non sono mantenuti; l'FE della Phase 13 potrebbe riusare un fragment `City` completo e rompere l'intera schermata del negozio per un campo che non gli serve.
**Suggested fix:** spec RED in `city-shop.resolver.int-spec.ts` che interroga `city { id markerLocation { id } relatedLore { id } }` e si aspetta nessun errore. Poi popolare in `read` come negli altri percorsi (`findById(cityId).populate('markerLocation').populate('relatedLore')`), oppure riusare `CitiesService.findOne` (già importato via `CitiesModule`), tenendo i pool leggibili sul documento. In alternativa, restringere `CityShop.city` a un tipo ridotto (`id`, `name`, `type`, `size`, `hasShop`).

## Info

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
