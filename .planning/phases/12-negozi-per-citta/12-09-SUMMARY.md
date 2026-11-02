---
phase: 12-negozi-per-citta
plan: 09
subsystem: shops
tags: [shops, seeding, pools, BE-SHOP-01, BE-SHOP-04, D-03, D-04, D-08, D-09, D-10, D-22, D-24]
requires: ["12-01", "12-05", "12-06", "12-08"]
provides:
  - "src/shops/maintenance/shop-pool.seeder.ts: ShopSeedReport, ShopPoolSeeder.seedAll"
  - "test/shops/shop-world.fixture.ts: ShopWorldModels, SHOP_WORLD_CITIES, persistShopCatalogue, persistShopCities"
affects: [12-10, 12-18]
tech-stack:
  added: []
  patterns:
    - "semina per campo: lettura delle città con almeno una lista assente, scrittura con un bulkWrite per lista e filtro di esistenza sul campo anche in scrittura"
    - "provider senza hook di boot proprio: lo chiamerà l'orchestratore del 12-10 dopo le due migrazioni dei pet"
key-files:
  created:
    - test/shops/shop-world.fixture.ts
    - test/shops/shop-world.fixture.int-spec.ts
    - src/shops/maintenance/shop-pool.seeder.ts
    - src/shops/maintenance/shop-pool.seeder.int-spec.ts
  modified: []
decisions:
  - "Con il catalogo pet vuoto anche shopPets si rinvia (conta in deferred): un catalogo pet caricato dopo il primo boot non deve lasciare liste vuote permanenti (scelta del piano)"
  - "Necrorian riceve le tre liste vuote esplicite anche con il catalogo vuoto, e contano come scritte nel report (D-04)"
  - "Le WARN delle garanzie mancanti riguardano solo le liste loot effettivamente scritte; oltre SHOP_REPORT_WARNINGS_LIMIT una sola riga riassuntiva con il numero delle liste omesse"
  - "Il controllo dei piazzamenti gira solo se il bulkWrite dei compagni modifica almeno una città (anche la lista vuota di Necrorian o Porto Saldo)"
metrics:
  duration: "~15 min"
  completed: 2026-11-02
  tasks: 2
  files: 4
---

# Phase 12 Plan 09: semina idempotente dei pool e mondo di prova Summary

`ShopPoolSeeder.seedAll()` riempie una volta sola, per campo, le liste del pool assenti di ogni città con il sorteggio deterministico del 12-06 (quote e fasce della taglia, due loot `hunger` e uno `heal`, nessun leggendario, nessun `sellable: false`, nessun oggetto senza prezzo), piazza i quattro compagni nelle loro due città per nome e `CityType`, dà a Necrorian tre liste vuote esplicite e non tocca mai una lista già presente, anche vuota. Con un catalogo senza candidati non scrive liste vuote e le rinvia al boot successivo con una sola WARN di riepilogo. Provato solo sull'harness `MongoMemoryReplSet`: il database reale non è stato toccato.

## Task e commit

| Task | Fase | Commit | Descrizione |
| ---- | ---- | ------ | ----------- |
| 1 | helper | 53cd482 | `test(shops): add the shop world fixture` — fixture + int-spec (2 test, verdi al primo colpo: è un helper di test) |
| 2 | RED | b5bd5ae | `test(shops): pin the shop pool seeding` — int-spec con 17 test |
| 2 | GREEN | 429fc33 | `feat(shops): seed the absent shop pools at boot` |

## RED osservato

La suite della semina falliva al caricamento: `Cannot find module './shop-pool.seeder'` (modulo inesistente), 0 test eseguiti. Al GREEN i 17 test sono passati al primo giro.

## Firme create

- `test/shops/shop-world.fixture.ts`: `export interface ShopWorldModels { city; equipment; loot; pet }` (tutti `Model<any>`); `export const SHOP_WORLD_CITIES` (9 voci `as const`: Fineglen valanVillage, Valantar valanCapital, Shadmus desertVillage, Croce Marina tropicalVillage, Bellport flameNorthCapital, Talmvere talmvereVillage, Cliffbreak drusteaCapital, Necrorian necrorianCity, Porto Saldo drusteaSeaCity); `export async function persistShopCatalogue(models: ShopWorldModels)` → `{ equipment, loot, pets }` (array di documenti); `export async function persistShopCities(model: Model<any>): Promise<Record<string, any>>` (città indicizzate per nome, senza campi del pool, create senza POI)
- Catalogo: equip `Equip <rarity> NN` (12 common, 10 uncommon, 6 rare, 3 ultrarare, 2 legendary) + `Equip vietato` (common, `sellable: false`) + `Equip senza prezzo` (common, `buyPrice: null`); loot `Loot <rarity> <effect> NN` (common 3 hunger / 2 heal / 7 none, uncommon 1 / 1 / 7, rare 6 none, ultrarare 3 none, legendary 1 none); pet con i 4 `_id` di `SELLABLE_PET_IDS` (`sellable: true`, speedModifier 2.5 / 2 / 1.2 / 2) più Pegaso e Grifone (`sellable: false`)
- `src/shops/maintenance/shop-pool.seeder.ts`: `export interface ShopSeedReport { equipment: number; loot: number; pets: number; deferred: number }`; `@Injectable() export class ShopPoolSeeder` — `constructor(@InjectModel(City.name) cityModel, @InjectModel(EquipmentItem.name) equipmentModel, @InjectModel(LootItem.name) lootModel, @InjectModel(Pet.name) petModel)`; `async seedAll(): Promise<ShopSeedReport>`
- Interni non esportati: `isAbsent`, `drawPool`, `planPools`, metodi privati `readCatalogue`, `citiesToSeed`, `writePools`, `warnGuaranteeGaps`, `checkPetPlacements`, `logReport`
- Log (solo nomi, tipi e conteggi): `Negozi: seminate <e> liste di equipaggiamenti, <l> di loot, <p> di compagni`; WARN `Negozi: <n> liste rinviate al prossimo boot, catalogo senza candidati`; WARN `Negozi: <città> (<tipo>) senza le garanzie di loot <effetti>` (al massimo `SHOP_REPORT_WARNINGS_LIMIT`, poi `Negozi: altre <n> liste di loot senza le garanzie non elencate`); WARN `Piazzamento del compagno <pet>: città <nome> (<tipo>) trovata <n> volte`. Nessun try/catch: l'errore propaga al chiamante del 12-10

## Test

`test/shops/shop-world.fixture.int-spec.ts` (2): builds a catalogue with enough candidates for a capital (D-08); builds the cities of the pet placements without pool fields (D-22).

`src/shops/maintenance/shop-pool.seeder.int-spec.ts` (17): quota per taglia (D-03, D-08); hunger e heal (D-09); rarità per taglia (D-08); veto legendary / sellable false / senza prezzo (D-05); piazzamento dei pet (D-10); Necrorian vuota (D-04); lista presente intatta anche vuota (D-03, D-22); idempotenza (D-03); ri-semina di una lista cancellata con gli stessi id (D-21, D-24); rinvio con catalogo vuoto (D-22); WARN per la città del piazzamento mancante (D-10); silenzio al riavvio (D-10); WARN delle garanzie mancanti (D-09); tetto delle WARN (D-24); conteggi separati per lista e riga di log (D-03); conteggio delle sole liste scritte, `loot: 8` (D-03); nessun messaggio con `mongodb` (D-24).

## Gate

- `npx tsc --noEmit -p tsconfig.json` esce 0
- prettier ed eslint puliti sui quattro file
- `npx jest src/config --selectProjects unit`: 14 suite, 223 test verdi (drift di `process.env.`)
- `src/schema.gql` invariato; contro origin/develop 11 righe aggiunte, 0 tolte
- `pgrep -fl jest` vuoto

## Deviations from Plan

**1. [Rule 2 - Mitigazione T-12-11c] Riga riassuntiva oltre il tetto delle WARN di garanzia**
- Il piano limita le WARN per città a `SHOP_REPORT_WARNINGS_LIMIT` senza dire cosa fare oltre: si emette una sola riga con il numero delle liste omesse, e c'è un test dedicato (`caps the guarantee warnings of a run (D-24)`).

**2. Due test in più rispetto al `<behavior>`**: `warns about the pools without the guaranteed food and cure (D-09)` e `caps the guarantee warnings of a run (D-24)` coprono le WARN delle garanzie prescritte dall'azione; il caso `loot: 8` del report sta in un test separato (`counts only the lists it writes (D-03)`) perché richiede un mondo diverso.

**3. Prova di assenza nella fixture**: le chiavi grezze delle città sono confrontate con `toEqual` sull'intero `Object.keys(...).sort()` (regola del repo), non con un controllo per chiave.

## Threat model

- T-12-11: filtro di esistenza per campo in lettura e in scrittura; test `never touches a pool list already present even when empty (D-03, D-22)` e idempotenza.
- T-12-12: nessuna lista equip/loot vuota fuori da Necrorian; rinvio con WARN di riepilogo, test dedicato.
- T-12-11b: log solo con nomi, tipi e conteggi; test che nessun messaggio contiene `mongodb`.
- T-12-11c: WARN delle garanzie limitate da `SHOP_REPORT_WARNINGS_LIMIT`, rinvii e piazzamenti silenziosi al riavvio.

## Self-Check: PASSED

- FOUND: test/shops/shop-world.fixture.ts, test/shops/shop-world.fixture.int-spec.ts
- FOUND: src/shops/maintenance/shop-pool.seeder.ts, src/shops/maintenance/shop-pool.seeder.int-spec.ts
- FOUND: 53cd482, b5bd5ae, 429fc33
