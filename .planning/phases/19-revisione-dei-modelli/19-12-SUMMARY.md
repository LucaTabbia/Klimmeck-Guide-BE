---
phase: 19-revisione-dei-modelli
plan: 12
subsystem: models
tags: [poi, back-link, cityRelations, registro dei ref, migratore, D-09, D-12]
requires: [19-11]
provides:
  - "`PointOfInterest` senza `quest` su modello e SDL (blocco esatto nel boot reale)"
  - "`cityRelations()` popola `pointsOfInterest` senza populate annidato"
  - "registro dei ref a 34 riferimenti in 11 collection (via `pointsofinterest:quest`)"
  - "`PoiQuestStep` (quinto in `STEPS`), builder `legacyPoi` in `legacy-fixtures.ts`"
affects: [19-13, 19-14, 19-23]
tech-stack:
  added: []
  patterns: [passo del migratore col driver nativo e guardia «campo presente»]
key-files:
  created:
    - src/models/point-of-interest.schema.spec.ts
    - src/migrations/model-review/poi-quest.step.ts
    - src/migrations/model-review/poi-quest.step.int-spec.ts
  modified:
    - src/models/point-of-interest.model.ts
    - src/cities/city-relations.ts
    - src/cities/cities.resolver.int-spec.ts
    - src/migrations/mixed-refs/mixed-ref-paths.ts
    - src/migrations/mixed-refs/mixed-ref-paths.spec.ts
    - src/migrations/model-review/legacy-fixtures.ts
    - src/migrations/model-review/model-review.module.ts
    - test/app.int-spec.ts
    - test/fixtures/poi.fixture.ts
    - src/schema.gql
decisions:
  - Il caso sul filo del populate dei POI interroga `city(id)`, non `cities` — `findAll` non usa `cityRelations()` e non popola la lista
  - La query `cities` che serve `pointsOfInterest` non popolati è un difetto preesistente, registrato e non corretto
metrics:
  completed: 2026-11-11
  tasks: 3
  files: 13
---

# Phase 19 Plan 12: via il back-link morto dei POI — Summary

`PointOfInterest.quest` non esiste più su modello, populate (`cityRelations`), registro dei ref e SDL (cambio non additivo dichiarato: la sola riga `quest: ID` tolta dal blocco `type PointOfInterest`); il passo `PoiQuestStep` del migratore toglie il campo dai documenti dove è presente, anche nullo, e alla seconda corsa non scrive nulla.

## Commit

| Task | Commit | Subject |
|------|--------|---------|
| 1 RED | `08c322fc` | `test(models): pin the point of interest without the back link` |
| 1 GREEN | `df08f14d` | `refactor(models): drop the dead quest back link of the poi` |
| 2 RED | `ca3894b9` | `test(migrations): pin the poi back link step` |
| 2 GREEN | `d77d8998` | `feat(migrations): add the poi back link step` |
| 3 | (questo e il successivo) | `docs(phase-19): summarize plan 12`, `docs(phase-19): record plan 12 progress` |

Nessun trailer in nessun commit (controllo a `0` dopo ognuno).

## Evidenza RED

- **Task 1, unit (2 rossi, 2 suite)** — `point-of-interest.schema.spec.ts`: `declares no back link to a quest on the point of interest (D-09)` (la lista dei path contiene ancora `quest`); `mixed-ref-paths.spec.ts`: `counts 34 references in 11 collections (D-17d)` (35 ricevuti).
- **Task 1, integration (2 rossi, 2 suite)** — `test/app.int-spec.ts`: `writes the point of interest without the quest back link (D-09)` (il blocco porta ancora `quest: ID`); `cities.resolver.int-spec.ts`: `serves the points of interest of a city without the quest back link (D-09)` — rosso con `Schema hasn't been registered for model "Quest"`: l'harness della spec non registra `Quest` e il populate annidato del back-link lo pretendeva; col populate piatto passa senza registrare il modello.
- **Task 2, integration** — la suite `poi-quest.step.int-spec.ts` non si carica (`Cannot find module './poi-quest.step'`): quattro casi non eseguiti. Fra RED e GREEN del task 2 `tsc` è rosso per il solo modulo non ancora scritto.
- Verdi al primo colpo: nessuno.

## Cosa è cambiato

- **Modello:** via il campo `quest` e l'import di `Quest`. **Lista dei path dello schema** (pinnata con `toEqual`): `_id`, `city`, `location`, `type` (`__v` non è fra i path dello schema finché non si compila un modello: la spec legge `PointOfInterestSchema.paths` direttamente).
- **Populate:** `cityRelations()` → `{ path: 'pointsOfInterest' }`; lo usano `CitiesService.findOne` e `CityShopService.read`. Stesso commit del modello (T-19-42).
- **Registro dei ref:** tolta `scalar('pointsofinterest', 'quest')` → **34 riferimenti in 11 collection** (`pointsofinterest` resta fra le collection per `pointsofinterest:city`).
- **SDL:** `git diff` del commit GREEN = la sola riga `  quest: ID` tolta; blocco ora `type PointOfInterest {\n  city: City\n  id: ID!\n  location: [Float!]!\n  type: [PoiType!]!\n}`.
- **Fixture:** `buildPoi` non scrive più `quest: null` (lo strict lo scartava comunque).
- **Passo:** `PoiQuestStep`, label `back-link dei POI`, driver nativo; filtro «campo presente» (anche nullo), una scrittura che rimuove il campo; `found` = POI della collection, `migrated` = documenti modificati, `unmatched` sempre 0. Quinto in `STEPS`; `forFeature` del modulo con `PointOfInterest`.

## Righe attese al boot reale (runbook, orchestratore)

Inventario dell'11 novembre: 642 POI, campo presente su tutti, valorizzato su 0.

- Primo boot: `Revisione dei modelli, back-link dei POI: trovati 642, migrati 642, già a posto 0, senza corrispondenza 0`
- Secondo boot: `Revisione dei modelli, back-link dei POI: trovati 642, migrati 0, già a posto 642, senza corrispondenza 0`
- Prova a secco equivalente: conteggio dei documenti di `pointsofinterest` con il campo `quest` presente = 642 prima, 0 dopo. Backup di `pointsofinterest` prima del boot (T-19-43).

## Esito delle prove (dopo l'ultimo commit GREEN)

- `npx jest --selectProjects unit` → 269 suite, 3433 test verdi (eseguito prima di ognuno dei due commit GREEN). Nota: il SUMMARY del piano 11 riportava 268 suite / 3433 test; qui la suite in più c'è, il totale dei test è quello letto dall'output.
- Progetto integration intero, a pezzi, in primo piano, un jest alla volta, nessun comando spostato in background — **143 suite, 1990 test, tutti verdi** (142 / 1984 dopo il piano 11; +1 suite e +4 casi del passo, +1 caso in `cities.resolver.int-spec.ts`, +1 nel boot reale):
  - `src/characters test/app.int-spec.ts` → 24 suite, 467 test (78 s); `git diff --exit-code src/schema.gql` → 0.
  - `src/travel src/shops src/economy src/cities src/lore src/models test/shops test/fixtures` → 29 suite, 417 test (104 s).
  - `src/quests` → 35 suite, 512 test (161 s).
  - resto (stessa lista di cartelle del piano 11) → 55 suite, 594 test (109 s).
  - `jest --listTests` del progetto integration elenca 143 file, tutti dentro i quattro pezzi.
- `npx tsc --noEmit -p tsconfig.json` → 0 dopo ogni commit GREEN. Prettier ed eslint sui file toccati, uno per uno: puliti (resta il solo warning preesistente di `test/app.int-spec.ts`). `pgrep -fl 'bin/jest'` vuoto a fine di ogni task.

## Criteri di accettazione

| Criterio | Esito |
|----------|-------|
| `quest` nel blocco `type PointOfInterest` dello SDL | 0 |
| `grep -ci "quest" src/models/point-of-interest.model.ts`; `grep -c "quest" src/cities/city-relations.ts` | 0; 0 |
| `toHaveLength(34)` in `mixed-ref-paths.spec.ts` | 1 |
| `grep -c "'pointsofinterest'" src/migrations/mixed-refs/mixed-ref-paths.ts` | **1, non 0** (vedi deviazione 2) |
| `git diff HEAD~1 --stat -- src/pointsOfInterest/point-of-interest.module.ts \| wc -l` | 0 |
| `D-09)` in `poi-quest.step.int-spec.ts` | 3 |
| `PoiQuestStep` in `model-review.module.ts` | 2 |
| `grep -L "UNA TANTUM (Phase 19 D-12)" src/migrations/model-review/*.ts` | nessuna riga |

## Deviazioni dal piano

**1. [Regola 1 - premessa del piano errata] il caso sul filo interroga `city(id)`, non `cities`**
- Il piano indicava `cityRelations` come «usato da `cities.service.ts`» e chiedeva il caso su `cities`. In realtà `CitiesService.findAll` (query `cities`) popola solo `relatedLore` e `markerLocation`; `cityRelations()` è usato da `findOne` (query `city`) e da `CityShopService.read`. Il caso `serves the points of interest of a city without the quest back link (D-09)` usa quindi `city(id)`, che è il percorso esposto a `StrictPopulateError` (T-19-42); `cityShop` è coperto dal blocco `src/shops` verde.

**2. [Criterio del piano non raggiungibile] `'pointsofinterest'` resta una volta nel registro**
- Il criterio voleva `0`, ma la riga `scalar('pointsofinterest', 'city')` deve restare (lo stesso piano dice «stesse 11 collection»). Tolta la sola riga del back-link.

**3. [Boy Scout, fuori da `files_modified`] `test/fixtures/poi.fixture.ts`**
- Tolto `quest: null` da `buildPoi` nel commit GREEN del task 1: il campo non esiste più.

**4. [Ordine dei commit di chiusura e forma di STATE] come nei piani 01–11**
- SUMMARY in un commit suo prima del bookkeeping; `Plan: 12 of 23`.

Nessuna decisione architetturale (Regola 4).

## Problemi rimandati (fuori scope, non corretti)

- **`cities { pointsOfInterest { id } }` fallisce da prima di questo piano**: `findAll` non popola `pointsOfInterest`, quindi il filo riceve degli ObjectId al posto dei documenti e risponde `ID cannot represent value: { type: "Buffer", … }` con `pointsOfInterest: null` (il campo è nullable, il resto della risposta arriva). Visto scrivendo il RED del task 1 con una città che ha un POI in lista. La FE non seleziona `pointsOfInterest` su `cities` (selezione verbatim nella spec), quindi oggi è latente. Da decidere a parte: popolare anche in `findAll` (642 POI in una query in più) oppure lasciare il campo solo a `city(id)`.

## Note per i piani successivi

- **Registro dei ref:** oggi 34 in 11 collection. Sequenza attesa: 34 in 19-15, 32 in 19-20, 33 con `pets:enemy` in 19-22.
- **`STEPS`** oggi: `EnemyWeaknessesStep, EnemySpellsStep, PetCatalogStep, OwnedPetsStep, PoiQuestStep`; `forFeature`: `Enemy`, `Spell`, `Pet`, `Character`, `PointOfInterest`. Il boot reale di `test/app.int-spec.ts` logga ora cinque righe a zero.
- **19-13 (`City.shop`):** `cityRelations()` è l'unico punto dei populate di una `City` intera per `city(id)` e `cityShop`; `cities` ha la sua lista a parte in `CitiesService.findAll`. `cities.resolver.int-spec.ts` ha ora la costante `CITY_WITH_POINTS` e importa `persistPoi`.
- **`legacyPoi(overrides)`** in `legacy-fixtures.ts`: POI grezzo con `quest: null`; un override `undefined` toglie il campo.
- **Lista dei path di uno schema senza modello compilato:** `Schema.paths` non contiene `__v` (la spec del pet lo vede perché compila un modello di prova).
- **Handoff FE (19-23):** `PointOfInterest.quest` tolto dallo SDL; `PointOfInterestInput` non esiste (D-24). BE-MODEL-07 è a metà (resta `City.shop`, 19-13): nessuna spunta in REQUIREMENTS.

## Stub noti

Nessuno.

## Threat flags

Nessuna superficie nuova fuori dal threat model: T-19-42 (modello e populate nello stesso commit `df08f14d`; caso sul filo di `city(id)`, blocchi `src/cities` e `src/shops` verdi), T-19-43 (rimozione del solo campo, guardia «campo presente», seconda corsa a zero, documenti senza campo intatti; backup nel runbook), T-19-44 (blocco esatto `type PointOfInterest` nel boot reale) mitigati.

## Self-Check: PASSED

- `src/models/point-of-interest.schema.spec.ts`, `src/migrations/model-review/poi-quest.step.ts`, `src/migrations/model-review/poi-quest.step.int-spec.ts` esistono; i quattro commit `08c322fc`, `df08f14d`, `ca3894b9`, `d77d8998` sono in `git log`; `git status --short` vuoto prima di questo documento.
