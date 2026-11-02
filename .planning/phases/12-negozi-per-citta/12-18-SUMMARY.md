---
phase: 12-negozi-per-citta
plan: 18
subsystem: shops
tags: [shops, gate, e2e, coverage, schema, BE-SHOP-05, D-03, D-04, D-08, D-11, D-12, D-13, D-14, D-15, D-19, D-20]
requires: ["12-09", "12-16", "12-17"]
provides:
  - "test/shops/city-shops.e2e.int-spec.ts: integration del gate BE-SHOP-05 su un mondo seminato da ShopPoolSeeder.seedAll()"
  - "test/app.int-spec.ts: test del contratto SDL della FE Phase 13 nel real boot"
  - "package.json jest.coverageThreshold './src/shops/' = { statements 97, branches 82, lines 98 }"
  - "12-VALIDATION.md firmata (status complete, nyquist_compliant true, wave_0_complete true); BE-SHOP-01..06 completi in REQUIREMENTS"
affects: [12-19]
tech-stack:
  added: []
  patterns:
    - "gate end-to-end: catalogo + città del mondo di prova, semina chiamata a mano sui modelli di harness.connection (D-24), personaggio posto sul markerLocation della città"
key-files:
  created:
    - test/shops/city-shops.e2e.int-spec.ts
  modified:
    - test/app.int-spec.ts
    - package.json
    - .planning/phases/12-negozi-per-citta/12-VALIDATION.md
    - .planning/REQUIREMENTS.md
decisions:
  - "Soglia di coverage di `src/shops/` = baseline − 2 per difetto: 97 / 82 / 98 (baseline 99.5 / 84.5 / 100.0)"
  - "La riga di tracciabilità `BE-SHOP-01..06` di REQUIREMENTS passa a Complete insieme alle sei caselle (il tool marca solo le caselle)"
metrics:
  duration: "~45 min (due `test:cov` da ~6 min ciascuno)"
  completed: 2026-11-03
  tasks: 3
  files: 5
---

# Phase 12 Plan 18: gate dei negozi per città Summary

Gate BE-SHOP-05 chiuso: integration end-to-end su un mondo seminato (tre pool per taglia, rifiuti senza scritture, vendita libera, compagno comprato → equipaggiato → venduto altrove), contratto SDL della FE Phase 13 fissato nel real boot, suite completa con coverage verde e nuova soglia `./src/shops/`, VALIDATION firmata, BE-SHOP-01..06 completi.

## Task

| # | Task | Commit | File |
|---|------|--------|------|
| 1 | integration end-to-end dei negozi per città | 58f0cc3 | test/shops/city-shops.e2e.int-spec.ts |
| 2 | contratto SDL della FE Phase 13 nel real boot | fd5c42e | test/app.int-spec.ts |
| 3a | soglia di coverage `./src/shops/` | ec9eb61 | package.json |
| 3b | VALIDATION firmata e requisiti completi | 0f84a7b | 12-VALIDATION.md, REQUIREMENTS.md |

### Casi della spec `city shops end to end on a seeded world (BE-SHOP-05)`

- `seeds a village, a city and a capital with three different pools (D-03, D-08)`: Fineglen 10 + 12, Porto Saldo 16 + 18, Valantar 24 + 24 (`[hasShop, equipment.length, loot.length]` con `toEqual`), insiemi di id diversi a due a due, nessuna rarità `legendary` sugli scaffali
- `refuses a purchase outside the pool of the city without writes (D-19)`: a Fineglen un equipaggiamento del solo pool di Valantar → `ITEM_NOT_IN_SHOP`, documento grezzo invariato
- `refuses a duplicate pet without writes (D-14)`: a Talmvere con il Cavallo da viaggio già posseduto → `PET_ALREADY_OWNED`, documento grezzo invariato
- `sells outside the pool and sells an owned legendary (D-11, D-12)`: a Fineglen vende `Equip legendary 01` e un loot fuori dal pool di Fineglen → monete `(0, 5, 0)` → `(0, 5, 85)` (75 + 10 del catalogo), inventari svuotati
- `buys a companion, equips it and sells it elsewhere emptying the slot (D-13, D-15, D-14)`: compra a Talmvere (`ownedPets: [horse]`, `pet: null`), `equipPet` → `pet = horse`, sposta `status.location` sul marker di Porto Saldo (pool pet `[]`), vende → `ownedPets: []`, `pet: null`, monete `(0, 4, 50)`
- `keeps Necrorian closed (D-04)`: `cityShop` → `{ hasShop: false, equipment: [], loot: [], pets: [] }`; un acquisto lì → `ITEM_NOT_IN_SHOP`

## Fallimenti RED osservati

Nessuno: entrambi i task di test sono verdi al primo colpo, come atteso dal piano. Il codice esiste già (12-01..12-17); la spec end-to-end è il gate di integrazione richiesto da BE-SHOP-05 e il test di contratto fissa i nomi che la FE Phase 13 seleziona, a protezione contro regressioni future. Nessun bug trovato.

## Gate

- `npx tsc --noEmit -p tsconfig.json` → 0 dopo ogni task
- Spec mirate: `test/shops/city-shops.e2e.int-spec.ts` 6/6; real boot `test/app.int-spec.ts` 70/70 (69 + 1)
- `npm run test:cov` (due esecuzioni, prima e dopo la soglia): 307 suite (193 unit, 114 integration), 4006 test, tutti verdi; totale Statements 97.04 %, Branches 85.43 %, Functions 92.92 %, Lines 97.59 %; nessun test instabile
- Coverage per cartella con soglia (statements / branches / lines): auth 99.8 / 86.7 / 100.0; economy 100.0 / 95.0 / 100.0; characters/spells 99.3 / 90.0 / 99.4; characters/equipment 100 / 100 / 100; characters.service.ts 98.5 / 91.4 / 100.0; quests/acceptance 99.4 / 93.3 / 100.0; eventsub 99.4 / 94.0 / 99.5; travel 99.5 / 87.0 / 100.0; **shops 99.5 (432/434) / 84.5 (180/213) / 100.0 (383/383)** → soglia 97 / 82 / 98
- Gate C2: `git diff origin/develop -- src/schema.gql | grep -E '^-[^-]'` stampa esattamente le due righe di D-20 (`equipmentAssetsQuantity(sellable: Boolean): [AssetQuantity!]!`, `lootAssetsQuantity: [AssetQuantity!]!`); 45 righe aggiunte; `git diff --exit-code src/schema.gql` → 0
- Prettier `--check` sugli 85 file `.ts` aggiunti/modificati vs `origin/develop` → tutti formattati; eslint sugli stessi → 0 errori, 1 warning preesistente (`no-base-to-string`, test/app.int-spec.ts:874); riproduzione del gate CI (`npx eslint "{src,apps,libs,test}/**/*.ts" --quiet`) → solo 291 `prettier/prettier` preesistenti in file non della fase, 0 altre regole
- Drift: `npx jest src/config --selectProjects unit` → 14 suite, 223 test verdi
- Segreti: nessun `.env` nel diff; nessuna URI Mongo nei documenti della fase; nessun `process.env.` sotto `src/` fuori dalle spec; nessun letterale vietato nei file del diff (l'unico riscontro di `@IsMongoId(` è in una riga di REQUIREMENTS preesistente, fuori dal diff)
- Operatori Mongo nei `.md`: nessuno fuori dai code span nelle righe aggiunte dalla fase (quelli trovati stanno in blocchi di codice recintati; i quattro di STATE.md sono righe preesistenti di Phase 04/08, fuori dal diff)
- Trailer: `git log origin/develop..HEAD --format=%B | grep -ciE "co-authored-by|generated with"` → 0; nessun subject del branch supera 72 caratteri
- `pgrep -fl jest` vuoto; `git status --short` vuoto

## Deviations from Plan

- Il test di contratto usa `new RegExp(\`type ${type} \\{[^}]*\\}\`)` in un ciclo sui tre tipi invece di tre `schema.match(/type Pet \{[^}]*\}/)` letterali: stesso blocco estratto, meno duplicazione.
- [Rule 2] La riga aggregata di tracciabilità `| BE-SHOP-01..06 | Phase 12 | Pending … |` di REQUIREMENTS.md passa a `Complete (gate 12-18, 2026-11-03; …)`: `requirements mark-complete` marca solo le caselle.
- L'harness ha spostato in background le due `test:cov` dopo 180 s: atteso il termine con un ciclo su `pgrep`, nessuna esecuzione sovrapposta.

## Self-Check: PASSED

- FOUND: test/shops/city-shops.e2e.int-spec.ts
- FOUND: 58f0cc3, fd5c42e, ec9eb61, 0f84a7b
