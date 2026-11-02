# Ruling dell'orchestratore sui finding di `12-REVIEW.md` (2026-11-03)

Ordine di applicazione: A-WR-01, B-WR-01, B-IN-01, A-IN-01, A-IN-02, B-IN-02, B-IN-03; poi i tre `not_needed`. Ogni FIX = coppia RED (`test(<scope>)`) → GREEN (`fix(<scope>)`), spec mirata verde, `npx tsc --noEmit -p tsconfig.json` = 0, prettier/eslint sui soli file toccati. SDL invariato (nessuna di queste correzioni tocca lo schema: `git diff --exit-code src/schema.gql` = 0 e, contro `origin/develop`, le righe tolte restano le due di D-20).

## A-WR-01 — FIX
`CityShopService.read` carica la città con `findById` senza popolare `markerLocation` (`PointOfInterest!` nello SDL), `relatedLore` e `pointsOfInterest`: una selezione di quei campi su `cityShop { city { … } }` annulla la query. Direzione: riusare la stessa catena di populate di `CitiesService.findOne` (relatedLore, markerLocation, pointsOfInterest con quest) — estrarre un helper condiviso (es. `populateCityRelations(query)` accanto al modello o in `src/cities/`) usato da entrambi i service per non duplicare la catena. RED: int-spec in `src/shops/city-shop.resolver.int-spec.ts` che seleziona `city { markerLocation { id } relatedLore { id } pointsOfInterest { id } }` e si aspetta dati senza `errors` (oggi `errors` non-null). Le spec esistenti di `cities` restano verdi.

## B-WR-01 — FIX
`drawPool` scrive `shopPets: []` quando il catalogo pet non è vuoto ma manca (anche solo in parte) il compagno piazzato; da quel boot la lista non è più assente e il compagno aggiunto dopo non entra mai. Direzione: contare i piazzamenti attesi per la città (`SELLABLE_PET_PLACEMENTS` filtrati per nome+tipo); se la città ha piazzamenti e `petsFor(...)` restituisce meno id del numero di piazzamenti → `undefined` (rinviata, conta in `deferred`, copre la WARN «liste rinviate»); una città senza piazzamenti → `[]` come oggi; Necrorian invariato. RED in `shop-pool.seeder.int-spec.ts`: catalogo pet con il solo Pegaso → `seedAll()` non scrive `shopPets` di Fineglen e `deferred` la conta; dopo `persistPet` del Cavallo leggero il secondo `seedAll()` la semina; Valantar con un solo pet dei due presenti → rinviata. Aggiornare l'aspettativa del caso «catalogo vuoto + 9 città» solo se cambia il conteggio (verificare).

## B-IN-01 — FIX
`OwnedPetsMigrator`: un personaggio con `assets.ownedPets: null` fa fallire il push e interrompe il ciclo. Direzione: prima del ciclo normalizzare con un `updateMany` che imposta a `[]` le liste `null` (filtro di uguaglianza a null sul campo), poi il ciclo com'è; nessun try/catch per personaggio. RED: spec con due personaggi, il primo con `ownedPets: null` → entrambi migrati, `owned` = 2.

## A-IN-01 — FIX
`petsFor` non scarta i pet senza `buyPrice` (a differenza di `isSeedCandidate`): un pet piazzato senza prezzo finirebbe sullo scaffale e `Pet.buyPrice` è `Coins!`. Direzione: condizione `pet.buyPrice != null` accanto a `isShelfEligible(pet)`; i candidati pet della semina portano già `buyPrice` nella proiezione? verificare la proiezione lean dei pet in `shop-pool.seeder.ts` (oggi `name/sellable`): aggiungere `buyPrice`. RED in `shop-pool.draw.spec.ts`: pet piazzato con `buyPrice: null` → escluso.

## A-IN-02 — FIX
`violationsOf`: una voce di pool non riconducibile a un id finisce in `missing` come `String(raw)` (`[object Object]`/`null`). Direzione: marcatore stabile `invalid@<indice>` (indice nella lista), senza stampare il contenuto. RED in `shop-pool.report.spec.ts`.

## B-IN-02 — FIX
WARN delle garanzie di loot stampa `null` per una città senza nome: usare `name ?? _id.toHexString()` come già fa il report. RED: spec del seeder con città senza nome → la WARN contiene l'hex.

## B-IN-03 — FIX (solo commenti, nessuna spec)
Un commento nella fixture del mondo (`test/shops/shop-world.fixture.ts`) che spiega perché gli id dei 4 pet coincidono con `SELLABLE_PET_IDS` (la semina piazza per id) e un commento in `src/app.module.ts` sul perché `ShopsModule` è elencato esplicitamente dopo `ShopMaintenanceModule` (resolver `cityShop`/`shopPoolReport` montati anche se la manutenzione venisse tolta; Nest deduplica). Un solo commit `docs(shops): explain the pet ids of the fixture and the module order`.

## C-IN-01 — NOT_NEEDED
Guardia fallita in scrittura → `INSUFFICIENT_ITEM_QUANTITY`: sotto isolamento snapshot la contesa reale dà un WriteConflict ritentato con snapshot fresco, che restituisce il codice specifico; il caso residuo è documentato nel handoff §6. Nessuna modifica.

## C-IN-02 — NOT_NEEDED (backlog)
`findAll` della query innkeeper `characters` non popola `assets.pet`/`ownedPets`, come già non popola gli altri campi di `assets` (comportamento preesistente a `develop`, l'app non usa la lista). Va nel backlog, non in questa fase.

## C-IN-03 — NOT_NEEDED (accettato)
`markerLocation` senza indice unico: l'invariante «una città per marker» è dei dati (preesistente, `cities.exists` aveva la stessa semantica) ed è controllato dalla cura a DB. Nessuna modifica.
