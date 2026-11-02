---
phase: 12-negozi-per-citta
group: B
reviewed: 2026-11-03T12:00:00Z
depth: standard
files_reviewed: 7
files_reviewed_list:
  - src/app.module.ts
  - src/shops/maintenance/owned-pets.migrator.ts
  - src/shops/maintenance/pet-sellable.migrator.ts
  - src/shops/maintenance/shop-boot.ts
  - src/shops/maintenance/shop-maintenance.module.ts
  - src/shops/maintenance/shop-pool.seeder.ts
  - test/shops/shop-world.fixture.ts
findings:
  critical: 0
  warning: 1
  info: 3
  total: 4
status: issues_found
---

## Summary

Gruppo B pulito sulle regole trasversali: nessun `process.env` sotto `src/`, nessun nuovo `Mixed`, log con soli conteggi/nomi, `ShopMaintenanceModule` importato solo da `AppModule`, `ShopsModule` esporta `ShopPoolReportService` e `MongooseModule` (City, EquipmentItem, LootItem, Pet), nessun ciclo (`CitiesModule` non importa `ShopsModule`). Migratori e semina scrivono solo con filtro di esistenza (`sellable` fuori da `true`/`false`, `ownedPets` con `$nin` sulle due forme dell'id, pool con `$exists: false` ripetuto in scrittura); ordine e try/catch per passo di `ShopBoot` corretti. Un solo caso concreto di pool bloccato per sempre (WR-01) e tre rilievi di qualità.

## Critical

Nessuno.

## Warning

### B-WR-01: pool compagni congelato a `[]` se il compagno del piazzamento non è ancora a DB

**File:** `src/shops/maintenance/shop-pool.seeder.ts:83-86`
**Issue:** per `shopPets` la semina rinvia solo se `catalogue.pets.length === 0`. Se il catalogo ha almeno un compagno ma manca quello del piazzamento (es. `Cavallo leggero`), `petsFor` (`shop-pool.draw.ts:199-212`) restituisce `[]`, che viene scritto come lista presente. Dal boot dopo il campo non è più assente (D-03/D-22: «la mano vince»), quindi il compagno aggiunto in seguito non entra mai nella città. `checkPetPlacements` avvisa solo se manca la città, non se manca il pet.
**Why it matters:** su un DB popolato a pezzi (città e qualche pet prima, gli altri dopo) le città dei piazzamenti restano senza compagni in vendita senza alcun segnale; l'unica cura è la scrittura a mano. Va contro lo spirito di D-22 (mai congelare una lista vuota per un catalogo incompleto).
**Suggested fix:** in `drawPool`, per una città con piazzamento (`SELLABLE_PET_PLACEMENTS` contiene nome+tipo) trattare `petsFor(...).length === 0` come rinviato (`undefined`), contando in `deferred`; le città senza piazzamento continuano a ricevere `[]`. Spec RED prima (in `shop-pool.seeder.int-spec.ts`): catalogo con solo `Pegaso` e `Fineglen` presente, `seedAll()` non scrive `shopPets` di Fineglen e `deferred` la conta; dopo aver creato `Cavallo leggero` un secondo `seedAll()` la semina.

## Info

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
