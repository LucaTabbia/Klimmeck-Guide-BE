---
phase: quick-261109-cap
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/cities/city-size.ts
  - src/cities/city-size.spec.ts
  - src/shops/city-shop.resolver.int-spec.ts
autonomous: true
requirements: [BE-SHOP-01]

must_haves:
  truths:
    - "citySizeOf(ferrionCity) and citySizeOf(necrorianCity) are capital; talmvereVillage stays village"
    - "CITY_SIZE_BY_TYPE counts 13 villages, 9 cities and 11 capitals"
    - "Necrorian keeps no shop: NO_SHOP_CITY_TYPES unchanged, hasShop false, empty lists"
    - "No SDL change: git diff --exit-code src/schema.gql stays clean"
  artifacts:
    - path: "src/cities/city-size.ts"
      contains: "ferrionCity: CitySize.capital"
    - path: "src/cities/city-size.spec.ts"
      contains: "quick 261109-cap"
---

# Quick 261109-cap: Ferrion e Necrorian sono capitali

Regola di prodotto dell'utente (UAT FE Phase 12, 2026-11-09, controllo DB-1): «Ad eccezione di Talmvere, il resto conta come capitale perché lo è». `ferrionCity` e `necrorianCity` passano da `CitySize.city` a `CitySize.capital` nella tabella esaustiva `CITY_SIZE_BY_TYPE` (`src/cities/city-size.ts`); `talmvereVillage` resta `village` (la FE le tiene il marker sempre visibile con un flag proprio). Il BE è la fonte di verità della taglia.

## Task
1. RED `src/cities/city-size.spec.ts`: i due tipi → `capital`; conteggio 13 / 9 / 11; titoli `(D-NN)` esistenti lasciati, casi nuovi o modificati con `(quick 261109-cap)`. Commit `test(cities): expect Ferrion and Necrorian sized as capitals`.
2. GREEN `src/cities/city-size.ts`: le due righe. Impatto verificato con `npx jest src/cities src/shops --selectProjects unit`, `npx jest src/shops --selectProjects integration --runInBand`, `npx tsc --noEmit -p tsconfig.json`; le spec che pinnano Necrorian/Ferrion come `city` si aggiornano solo se è conseguenza diretta della taglia; «Necrorian senza negozio» (`NO_SHOP_CITY_TYPES`) da conservare. Commit `fix(cities): size Ferrion and Necrorian as capitals`.
3. Record del quick task e riga nello STATE. Commit `docs(quick): record quick task 261109-cap`.

## Fuori scope
Dati a DB (nessuna esecuzione sul database reale), FE, cure per taglia (fase dedicata).
