---
phase: 12-negozi-per-citta
verified: 2026-11-02T23:35:00Z
status: passed
score: 7/7 success criteria verified (6/6 requisiti BE-SHOP, nessun gap)
overrides_applied: 0
re_verification: false
gaps: []
human_verification:
  - test: "UAT su device, differita alla UAT FE (FE Phase 13, piano 13-11)"
    expected: "Percorso di BACKEND-NOTES.md §7: Fineglen (10 equip / 12 loot, solo common e uncommon, Cavallo leggero), una `*SeaCity` (16 / 18, fino a rare, nessun compagno), Valantar (24 / 24, fino a ultrarare, Cavallo leggero e Cammello), nessun legendary in vendita; acquisto a Talmvere del Cavallo da viaggio (1 oro), equipaggiamento dal Journal, vendita in un'altra città; Necrorian con `hasShop: false` e acquisto forzato rifiutato con ITEM_NOT_IN_SHOP"
    why_human: "Esperienza di gioco sul device e sul DB reale dopo il primo boot col runbook di BACKEND-NOTES.md §9; fuori dal perimetro della fase BE (nessun checkpoint umano)"
---

# Phase 12: Negozi per città — Verification Report

**Phase Goal:** ogni città vende un proprio pool di equipaggiamenti, loot e compagni coerente con la taglia, seminato al boot da una migrazione idempotente e poi curato a DB; il server rifiuta gli acquisti fuori pool; vendita ovunque, scorte infinite, prezzi del catalogo; pet posseduti vs compagno equipaggiato con `equipPet` / `unequipPet`.
**Verified:** 2026-11-03 (branch `feat/12-negozi-per-citta`, HEAD `7f901d3`, base `develop` `65ba3d7`)
**Status:** passed (nessun gap; UAT su device differita alla FE)
**Re-verification:** No

## Metodo

Sola lettura del codice e di `src/schema.gql` contro ROADMAP §Phase 12, REQUIREMENTS BE-SHOP-01..06 e il contratto FE delle REPO-RULES. Eseguiti: `npx tsc --noEmit -p tsconfig.json` (exit 0); 10 suite unit mirate (`src/shops`, `trade-pool`, `trade-pets`, `city-size`, `equip-pet.updates`: 112 test verdi); una suite integration mirata `test/shops/city-shops.e2e.int-spec.ts --runInBand` (6/6 verdi); `pgrep -fl jest` vuoto. Suite completa e coverage non rilanciate: sono il gate 12-18 (307 suite / 4006 test). Nessun accesso a `.env` né al DB reale.

## Success Criteria

| # | Criterio | Stato | Evidenza |
|---|----------|-------|----------|
| 1 | `City.size` / `City.hasShop` a schema, pool persistito sulla città | VERIFIED | `src/cities/city-size.ts`: `CITY_SIZE_BY_TYPE` esaustiva (`satisfies Record<CityType, CitySize>`), tabella come da ROADMAP (`elfCapital` capital, `talmvereVillage` village, `ferrionCity`/`necrorianCity` city, `*SeaCity` city); `@ResolveField` `size` e `hasShop` in `cities.resolver.ts`; campi `shopEquipment`/`shopLoot`/`shopPets` su `City`; SDL: `size: CitySize!`, `hasShop: Boolean!`, enum `CitySize` |
| 2 | Migrazione idempotente al boot, solo città senza pool | VERIFIED | `shop-pool.seeder.ts`: `isAbsent` (chiave mancante, mai lista vuota), Necrorian `[]` esplicito (`NO_SHOP_CITY_TYPES`), costanti `SHOP_POOL_SIZES` 10+12 / 16+18 / 24+24 e pesi 75-25 / 50-35-15 / 35-35-20-10, garanzie 2 `hunger` + 1 `heal`, sorteggio deterministico (`seeded-random.ts`, `shop-pool.draw.ts`), 4 pet in 2 città ciascuno (`SELLABLE_PET_PLACEMENTS`); `shop-boot.ts` ordina `Pet.sellable` → `ownedPets` → semina → report, ogni passo non bloccante; test `shop-pool.seeder.int-spec.ts`, `shop-boot.int-spec.ts`, e2e «seeds a village, a city and a capital…» verde |
| 3 | `cityShop(cityId)` con veti in lettura; `sellable` su EquipmentItem / LootItem / Pet; query vecchie deprecate | VERIFIED | `city-shop.service.ts` (`shelfInPoolOrder`, veti legendary / `sellable: false`), `cityShop(cityId: ID!): CityShop!`; `sellable: Boolean` nei soli tipi `EquipmentItem`, `LootItem`, `Pet`; `equipmentAssetsQuantity` e `lootAssetsQuantity` con `@deprecated(reason: "Phase 12: use cityShop")` |
| 4 | `ITEM_NOT_IN_SHOP` prima di scritture e riaffermato in transazione; `petAssets`; `PET_ALREADY_OWNED`; vendita ovunque; vendita del pet equipaggiato svuota lo slot | VERIFIED | `shop-transaction.service.ts`: `shopOrReject` legge il pool del marker in sessione (`SHOP_NOT_IN_CITY` invariato), `assertBuysInShop` (solo acquisti; fuori pool, assente dal catalogo o non eleggibile → `ITEM_NOT_IN_SHOP`), `assertPetsNotOwned`, `petOwnershipGuards` nel filtro della scrittura, `'assets.pet': null` nello stesso `$set` quando il venduto è l'equipaggiato; prezzi dal catalogo; `TransactionItems.petAssets: [AssetQuantityInput!]`; e2e: rifiuto fuori pool e doppione senza scritture, vendita di un leggendario posseduto fuori pool, compagno comprato → equipaggiato → venduto altrove |
| 5 | `assets.ownedPets`; `equipPet` / `unequipPet`; nessun equip automatico; migrazione | VERIFIED | `CharacterAssets.ownedPets: [Pet!]!`; `characters.service.ts` `equipPet` (filtro su `assets.ownedPets`, `PET_NOT_OWNED` se posseduto assente, 404 se personaggio assente) e `unequipPet`; resolver con `@OwnsCharacter` come `equipItem`; `applyTradeToPets` non tocca `assets.pet` in acquisto; `owned-pets.migrator.ts`, `pet-sellable.migrator.ts`; personaggio iniziale con `ownedPets: []`; `findOne` popola `assets.pet` e `ownedPets` |
| 6 | Report di sola lettura (WARN al boot + query innkeeper) | VERIFIED | `shop-pool-report.service.ts` / `shop-pool.report.ts`; `shopPoolReport` con `@Roles(RoleType.innkeeper)`, nessuna scrittura; `ShopBoot.warnViolations` con limite `SHOP_REPORT_WARNINGS_LIMIT` |
| 7 | Integration, real boot con SDL additivo, handoff | VERIFIED | `test/shops/city-shops.e2e.int-spec.ts` (6/6 rilanciata), `test/app.int-spec.ts` (contratto FE e enumerazione innkeeper-only aggiornata); `BACKEND-NOTES.md` §0-§12 con SDL, `cityShop`, pet, `doTransaction`, città per la UAT, runbook del primo boot (§9) |

**Score:** 7/7.

## Gate SDL

`git diff origin/develop -- src/schema.gql | grep -E '^-[^-]'` stampa esattamente le due righe di D-20 (`equipmentAssetsQuantity(sellable: Boolean): [AssetQuantity!]!` e `lootAssetsQuantity: [AssetQuantity!]!`), riaggiunte con `@deprecated` sulla stessa riga; tutto il resto è additivo.

## Contratto FE (REPO-RULES §Schema GraphQL)

Presenti a schema e nel codice: `cityShop`, `CityShop { city, equipment, loot, pets }`, `CitySize`, `City.size`, `City.hasShop`, `CharacterAssets.ownedPets`, `TransactionItems.petAssets`, `sellable` su `Pet`, `EquipmentItem`, `LootItem`, `EquipPetRequest { id, petId }`, `UnequipPetRequest { id }`, `equipPet` / `unequipPet` → `CommonResponse!`, codici `ITEM_NOT_IN_SHOP`, `PET_ALREADY_OWNED`, `PET_NOT_OWNED` in `game-rule-error-code.enum.ts`.

## Requirements Coverage

| Requisito | Stato | Evidenza |
|-----------|-------|----------|
| BE-SHOP-01 | SATISFIED | SC1, SC2, SC6 |
| BE-SHOP-02 | SATISFIED | SC3 |
| BE-SHOP-03 | SATISFIED | SC4 |
| BE-SHOP-04 | SATISFIED | costanti per taglia, veto legendary, «la mano vince» (nessun filtro di taglia in lettura: `city-shop.service.ts`), scorte infinite (quantità 1 solo forma), prezzi dal catalogo |
| BE-SHOP-05 | SATISFIED | SC7 |
| BE-SHOP-06 | SATISFIED | SC4, SC5 |

Nessun requisito orfano: REQUIREMENTS.md mappa sulla Phase 12 solo BE-SHOP-01..06.

## Anti-Patterns

Nessun blocker rilevato nei file di produzione letti (service, resolver, seeder, boot, trade-pool, trade-pets, equip-pet). Nessun file toccato oltre a questo report; i file `12-REVIEW-*.md` dei reviewer non sono stati modificati.

## Human Verification (differita alla UAT FE)

UAT su device nella FE Phase 13, piano 13-11, dopo il primo boot sul DB reale con il runbook di `BACKEND-NOTES.md` §9. Passi e dati esatti in `BACKEND-NOTES.md` §7 (4 pet in vendita con prezzi e città: Cavallo leggero 40 ag a Fineglen e Valantar; Cammello del Mar Sabbioso 35 ag a Shadmus e Valantar; Tartaruga gigante delle isole 1 oro a Croce Marina e Bellport; Cavallo da viaggio 1 oro a Talmvere e Cliffbreak). Non richiede `human_needed` per la fase BE.

---

_Verified: 2026-11-03_
_Verifier: Claude (gsd-verifier)_
