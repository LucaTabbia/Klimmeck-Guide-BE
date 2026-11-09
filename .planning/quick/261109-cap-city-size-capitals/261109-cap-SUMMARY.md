---
phase: quick-261109-cap
plan: 01
subsystem: cities
tags: [cities, city-size, shops, quest-generation]
requirements: [BE-SHOP-01]
key-files:
  modified:
    - src/cities/city-size.ts
    - src/cities/city-size.spec.ts
    - src/shops/city-shop.resolver.int-spec.ts
    - src/cities/cities.resolver.int-spec.ts
commits:
  - { hash: e0b18f18, message: "test(cities): expect Ferrion and Necrorian sized as capitals" }
  - { hash: 616d9141, message: "fix(cities): size Ferrion and Necrorian as capitals" }
  - { hash: e641099c, message: "test(cities): expect Necrorian sized as a capital on cities" }
---

# Quick 261109-cap: Ferrion e Necrorian sono capitali

`citySizeOf(ferrionCity)` e `citySizeOf(necrorianCity)` valgono `capital` (regola dell'utente, UAT FE Phase 12, 2026-11-09: «Ad eccezione di Talmvere, il resto conta come capitale perché lo è»). `talmvereVillage` resta `village`. La tabella esaustiva conta ora 13 villaggi, 9 città e 11 capitali. Nessun cambio SDL: `City.size` era già un enum `CitySize` con `capital` (`git diff --exit-code src/schema.gql` pulito).

## Modifiche
- `city-size.ts`: le due righe spostate dal blocco `CitySize.city` al blocco `CitySize.capital` (diff 2+/2-).
- `city-size.spec.ts`: l'`it.each` per suffisso diventa «Ferrion and Necrorian aside (quick 261109-cap)» con la lista `CAPITALS_WITHOUT_SUFFIX`; il caso «special types (D-01)» resta su elf/Talmvere; caso nuovo «sizes Ferrion and Necrorian as capitals (quick 261109-cap)»; conteggio «13 villages, 9 cities and 11 capitals (quick 261109-cap)».
- `city-shop.resolver.int-spec.ts` (conseguenza diretta della taglia): «serves Necrorian closed with empty lists (D-04)» si aspetta `size: 'capital'`; `hasShop: false` e le liste vuote invariati.
- `cities.resolver.int-spec.ts` (conseguenza diretta della taglia, commit a parte): «serves hasShop false … (D-04)» si aspetta Necrorian `size: 'capital'`, `hasShop: false` invariato.

## RED
`npx jest src/cities/city-size --selectProjects unit` prima della modifica: `Tests: 4 failed, 34 passed, 38 total` — l'`it.each` su `ferrionCity` e `necrorianCity`, «sizes Ferrion and Necrorian as capitals», il conteggio 13/9/11.
Dopo la GREEN, `npx jest src/shops --selectProjects integration --runInBand`: 1 rosso atteso, `city-shop.resolver.int-spec.ts` «serves Necrorian closed» (`- "size": "city"` / `+ "size": "capital"`). Lo stesso in `cities.resolver.int-spec.ts`, trovato estendendo il giro di integration a `src/cities`.

## Gate
- `npx jest src/cities src/shops --selectProjects unit`: 5 suite, 67/67.
- `npx jest src/shops --selectProjects integration --runInBand`: 5 suite, 24/24.
- `npx jest src/quests/generation src/cities --selectProjects integration --runInBand`: 4 suite, 35/35.
- `npx jest src/quests/generation --selectProjects unit`: 13 suite, 98/98.
- `npx jest test/shops --selectProjects integration --runInBand`: 3 suite, 13/13.
- `npx tsc --noEmit -p tsconfig.json`: 0 errori. Prettier ed eslint puliti sui file toccati. `src/schema.gql` invariato.

## Impatto
**Negozi.** La taglia guida solo il report di sola lettura (`violationsOf` in `src/shops/shop-pool.report.ts` → `SHOP_ALLOWED_RARITIES`): `city` ammette common/uncommon/rare, `capital` aggiunge ultrarare. «Necrorian senza negozio» resta intatta: `NO_SHOP_CITY_TYPES` è per `CityType`, non per taglia, e la lettura del negozio non guarda la taglia. Per Ferrion il pool già seminato (regola `city`, D-25) è un sottoinsieme delle rarità `capital`: il report non segnala nulla. **I pool a DB non vanno rigenerati**: nessuno strumento li rigenera (la semina è uscita dal repo, D-25; `shopPoolReport` è una query di sola lettura; non esiste una mutation admin di rigenerazione) e «la mano vince» (D-05). Se l'utente vuole un negozio da capitale a Ferrion (taglia 24 + 24 e ultrarare), è cura a mano a DB, poi `shopPoolReport` per controllarla. Nessuna esecuzione sul DB reale in questo quick task.

**Generazione delle quest** (non citata nel brief, trovata con `grep citySizeOf`): `src/quests/generation/city-picker.ts` usa la taglia per `GENERATED_CAP_BY_SIZE` e `SIZE_WEIGHT_BY_SIZE` (13.1 D-04). Ferrion e Necrorian passano da tetto 2 / peso 2 a tetto 4 / peso 4: più quest generate attive possibili e più attrazione nel sorteggio. Nessuna spec la pinna su questi due tipi (98/98 e 35/35 verdi).

**Cure per taglia** (fase futura FE 18 / BE 18): Ferrion e Necrorian avranno le regole della capitale.

## Deviazioni
- **Quarto commit** (`e641099c`): `cities.resolver.int-spec.ts` pinnava Necrorian `size: 'city'`; il brief faceva girare l'integration solo su `src/shops`, il rosso è emerso estendendo il giro a `src/cities` dopo il commit della GREEN. Aggiornata come conseguenza diretta della taglia, in un commit separato (niente amend).
- **Riga dello STATE**: la riga di `261109-inj2` non è nello STATE di questo ramo (c'è solo quella di `261109-inj`): la riga di questo quick task va subito dopo `261109-inj`.
