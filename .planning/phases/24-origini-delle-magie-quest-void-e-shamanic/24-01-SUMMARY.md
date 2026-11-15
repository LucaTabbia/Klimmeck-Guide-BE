---
phase: 24-origini-delle-magie-quest-void-e-shamanic
plan: 01
subsystem: cities, characters, shop
tags: [city-type, city-size, home-city, shop-report, requirements]
requires: []
provides:
  - "CityType.aarakocraCapital, dragonbornCapital (capital), dragonbornVillage (village) su enum, tabella delle taglie e SDL"
  - "RACE_HOME_CITY_TYPES: dragonborn → dragonbornCapital, aarakocra → aarakocraCapital"
  - "CITY_TIER_SHOP_TYPES e shopTierOf(type) per il report dei negozi"
  - "Requisiti BE-ORIGIN-01..12 in REQUIREMENTS.md"
affects: [24-02, 24-11, 24-12]
tech-stack:
  added: []
  patterns: ["fascia del negozio separata dalla taglia della città (funzione pura sopra la tabella esaustiva)"]
key-files:
  created: []
  modified:
    - .planning/REQUIREMENTS.md
    - src/models/enums/city-type.enum.ts
    - src/cities/city-size.ts
    - src/schema.gql
    - src/characters/creation/race-traits.ts
    - src/shops/shop-pool.constants.ts
    - src/shops/shop-pool.rules.ts
    - src/shops/shop-pool.report.ts
decisions:
  - "Il campo `size` della violazione e la riga di log del report dei negozi portano la FASCIA usata per giudicare (`city` per Murnborim e Thengran), non la taglia della città"
  - "`aarakocraVillage` e `mountainVillage` restano nell'enum; cambiano solo le città di nascita"
metrics:
  completed: 2026-11-15
  tasks: 5
  commits: 9
---

# Phase 24 Plan 01: tipi di città, città di nascita e fascia dei negozi — Summary

Tre tipi di città nuovi (`aarakocraCapital`, `dragonbornCapital`, `dragonbornVillage`) nell'enum, nella tabella esaustiva delle taglie e sullo SDL, così la query `cities` torna a servire le città già scritte a DB; dragonborn e aarakocra nuovi nascono nella loro capitale; il report dei negozi giudica le due capitali nuove con la fascia `city` tramite `shopTierOf`.

## Commit

| Task | Commit | Subject |
|------|--------|---------|
| 1 | c56ce073 | docs(phase-24): add the spell origin requirements |
| 2 | 19ccb0d9 | style(cities): format city-type.enum.ts |
| 2 RED | afb621fe | test(cities): expect the three new city types to be served |
| 2 GREEN | 7c0ae7de | feat(cities): add the aarakocra and dragonborn city types |
| 3 RED | 9ba1e293 | test(characters): expect dragonborn and aarakocra born in their capital |
| 3 GREEN | cc3ba578 | feat(characters): start dragonborn and aarakocra in their capital |
| 4 RED | 109400b1 | test(shop): expect the city tier for the two new capitals |
| 4 GREEN | efec3263 | feat(shop): judge the two new capitals with the city tier |

## Fallimenti RED attesi e osservati

- **Task 2, unit** (`city-size.spec.ts`): 3 rossi — `citySizeOf` → `undefined` (atteso `capital`), `isCityType` → `false`, conteggi 13/9/11 invece di 14/9/13. Come atteso.
- **Task 2, integration**: 3 rossi — `cities` con `errors` «Enum "CityType" cannot represent value: "aarakocraCapital"» (il guasto del BE vero), `city(id)` su Thengran in errore (taglia `undefined` su `CitySize!`), boot reale: il blocco `enum CityType` senza i tre valori. Come atteso.
- **Task 3**: 4 rossi unit (tabella di `race-traits`, `racesWithoutHomeCity` con le capitali nuove, caso nuovo dei vecchi villaggi, reporter che avverte) e 3 rossi integration (`starts a aarakocra in a aarakocraCapital`, `starts a dragonborn in a dragonbornCapital`, caso nuovo D-18). Come atteso.
- **Task 4**: 36 rossi con `TypeError: shopTierOf is not a function` invece del fallimento di compilazione previsto dal piano (ts-jest qui non blocca sui tipi: stesso significato, la funzione non esiste) e 1 rosso di asserzione nel report (`outOfSize` vuoto per l'ultrarare in `aarakocraCapital`).

## Casi verdi al primo colpo (con motivo)

- `accepts a rare item in the shop of a new capital (D-22)`: oggi la capitale ammette già `rare`; il caso fissa che la fascia `city` non lo escluda.
- `character-creation.resolver.int-spec.ts` (`seedCity('dragonbornCapital', 'Thengran')`): nessun caso della spec crea un dragonborn, la città serve solo alla copertura del seme; resta verde prima e dopo.
- `shopTierOf` per `drusteaCapital` e `dragonbornVillage` (caso esplicito aggiunto oltre all'`it.each`): rossi solo per la funzione assente.

## SDL

`git diff src/schema.gql` al GREEN del Task 2 mostra solo tre righe aggiunte dentro `enum CityType`:

```
+  aarakocraCapital
+  dragonbornCapital
+  dragonbornVillage
```

Il blocco ha 36 valori; nessun'altra riga cambia (verificato `git diff --exit-code src/schema.gql` dopo i Task 3 e 4).

## Verifiche

- `npx jest src/cities/city-size.spec.ts --selectProjects unit`: 43/43.
- `npx jest src/cities/cities.resolver.int-spec.ts test/app.int-spec.ts --selectProjects integration --runInBand`: 113/113.
- `npx jest src/characters/creation/race-traits.spec.ts src/characters/creation/starting-cities.reporter.spec.ts --selectProjects unit`: 23/23; int-spec di avvio e creazione: 43/43.
- `npx jest src/shops/shop-pool.rules.spec.ts src/shops/shop-pool.report.spec.ts src/shops/shop-pool.constants.spec.ts --selectProjects unit`: 65/65; `shop-pool-report.service.int-spec.ts`: 3/3.
- `npx tsc --noEmit -p tsconfig.json`: 0 a fine di ogni task di codice; prettier ed eslint puliti sui file toccati (l'unico warning, `test/app.int-spec.ts:1242` `no-base-to-string`, è preesistente e fuori dal piano).
- ROADMAP §Phase 24: riga **Requirements** con i 12 ID e 12 voci dei piani già presenti (verificato, non modificato).
- `citySizeOf(` fuori dalle spec resta solo in `city-size.ts`, `cities.resolver.ts`, `quest-generator.service.ts`, `shop-pool.rules.ts`.

## Deviations from Plan

- **Task 4, fallimento RED**: runtime `TypeError` invece del fallimento di compilazione di ts-jest previsto (la config di ts-jest non riporta la diagnostica dei tipi); nessun impatto sul GREEN.
- **Task 4, caso aggiuntivo**: `keeps an old capital and the dragonborn village on their size (D-22)` esplicito oltre all'`it.each`, per nominare i due esempi citati dal piano.

Nessun'altra deviazione.

## Note per i piani seguenti

- `aarakocraVillage` e `mountainVillage` restano tipi validi (Balkuldir, Lamstone); non sono più città di nascita.
- Heal e pool dei negozi di Murnborim e Thengran restano contenuto a DB dell'orchestratore: il report da ora li giudica con la fascia `city`, quindi al boot reale un pool scritto da capitale (ultrarare) comparirà come «fuori taglia».

## Self-Check: PASSED
