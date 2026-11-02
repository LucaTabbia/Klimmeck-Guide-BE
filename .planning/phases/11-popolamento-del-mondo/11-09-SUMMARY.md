---
phase: 11-popolamento-del-mondo
plan: 09
subsystem: content
tags: [content, sync, bson-diff, upsert, orphans, prune, BE-CONTENT-02]
requires: ["11-05", "11-06", "11-07"]
provides:
  - "src/content/sync/bson-diff.ts: sameBson(a, b), changedFields(stored | null, next) — unica definizione di sameBson, importata anche da poi-and-city-fixes.ts"
  - "src/content/sync/upsert-ops.ts: upsertOp(id, set, onInsert | null), cityLoreOp(cityId, relatedLore) (senza upsert)"
  - "src/content/sync/content-report.ts: ContentMode, OrphanRef, CollectionReport, DivergenceRef, CityLoreReport, ContentReport, emptyCollectionReport, emptyContentReport(mode), hasErrors, hasDrift"
  - "src/content/sync/db-checks.ts: checkDatabase(db, tree, mode) → ContentCheck, DATABASE_SOURCE = '(database)'"
  - "src/content/sync/orphans.ts: knownIdsOf(tree, collection), findOrphans(db, collection, knownIds), orphanRefOf(collection, doc), divergencesOf(index, collection, orphans)"
  - "src/content/sync/content-sync.ts: runContent(db, mode, tree) → ContentReport"
  - "src/content/sync/content-prune.ts: PRUNABLE_COLLECTIONS, PruneReport, pruneCollection(db, collection, tree)"
  - "test/content/seed-world.ts: seedWorld(db, world) — città e POI dello snapshot con gli stessi id"
affects: [11-10, 11-11, 11-24]
tech-stack:
  added: []
  patterns:
    - "diff BSON byte a byte su documenti letti con `promoteValues: false` (Double resta Double, Int32 resta Int32): il diff prevede esattamente il `modifiedCount` del server"
    - "corsa in due tempi: tutti i controlli (file + DB) e tutti i piani di scrittura prima, poi le scritture solo in apply e solo senza errori"
    - "orfani calcolati con un perimetro per collezione (quest: solo fisse aperte) e mai cancellati fuori da pruneCollection"
key-files:
  created:
    - src/content/sync/bson-diff.ts
    - src/content/sync/bson-diff.spec.ts
    - src/content/sync/upsert-ops.ts
    - src/content/sync/content-report.ts
    - src/content/sync/content-report.spec.ts
    - src/content/sync/db-checks.ts
    - src/content/sync/orphans.ts
    - src/content/sync/content-sync.ts
    - src/content/sync/content-sync.int-spec.ts
    - src/content/sync/content-prune.ts
    - src/content/sync/content-prune.int-spec.ts
    - test/content/seed-world.ts
  modified:
    - src/content/fixes/poi-and-city-fixes.ts
decisions:
  - "I documenti a DB si leggono con `promoteValues: false`: con la promozione di default un `Double(300)` scritto da mongosh torna come numero JS e si riserializza int32, quindi il diff lo darebbe uguale mentre il server lo riscrive (Pitfall 3, scoperto dal test int)"
  - "Un campo assente dal documento a DB conta come modificato anche se il valore scritto è null (BSON serializza `undefined` come null, il server invece aggiunge il campo)"
  - "Errori nei file → report senza alcun accesso al DB (nessun mapping, `fixes: []`); errori lato DB → diff e orfani calcolati comunque (sola lettura), nessuna scrittura, fix eseguiti in modalità dry-run"
  - "Valori fuori enum (`pointsofinterest.type`, `cities.type`, `quests.infos.type`) con `file: '(database)'`, `path: '<collezione>.<campo>'`, `entryId` = id del documento: errori in verify, warning in dry-run e apply"
  - "Snapshot: città o POI assente a DB → errore (`file: world/cities.yaml`, `entryId` = id); nome/tipo della città o tipi del POI diversi → warning `snapshot non allineato: …`"
  - "Una sola lore per città nel link `cities.relatedLore`: vince la prima in ordine di file, come nel generatore"
  - "`CollectionReport.fixes` = somma dei `touched` dei fix sulla collezione (`deleteQuests` → quests, `unsetLoreUnlocked` → lore); `CollectionReport.errors` = errori il cui `file` inizia con la cartella della collezione"
  - "`probableIdDivergence`: orfano non-quest con lo stesso nome di una voce dei file e lo stesso campo di tipo a DB (`type`, `useType`, `equipType`, `effect`); per nemici e pet, che a DB non hanno il campo di tipo dei file, basta il nome"
  - "`pruneCollection` su una collezione fuori elenco non lancia: restituisce un errore con `path: 'collection'` (il CLI di 11-11 esce 2 prima)"
  - "Prune delle quest = `deleteQuests(db, { key: 'prune-quests', kind: 'deleteQuests', ids }, 'apply')`: stesse guardie delle corsie, stesso azzeramento dei back-link dei POI"
metrics:
  duration: "~35 min"
  completed: 2026-11-02
  tasks: 3
  files: 13
---

# Phase 11 Plan 09: sync idempotente file → DB Summary

Motore di `--dry-run/--apply/--verify/--prune` provato sul replica set di test col mini-albero: diff BSON identico a quello del server (su documenti letti senza promozione dei numeri), upsert per `_id` dei soli documenti diversi nell'ordine lore → città → magie → equipaggiamento/loot → nemici → pet → quest → fix, campi runtime delle quest solo all'inserimento, controlli su file e DB prima della prima scrittura, orfani perimetrati e mai cancellati da apply, prune esplicito per collezione con le guardie del fix delle quest, report JSON con conteggi, orfani, fix, errori, warning e probabili divergenze di id.

## Commit

| Task | Fase TDD | Commit | Subject |
|------|----------|--------|---------|
| 1 | RED | `796f271` | `test(content): expect the binary diff and the content report` |
| 1 | GREEN | `7d92df3` | `feat(content): diff documents like the server does` |
| 2 | RED | `b6c542c` | `test(content): expect the idempotent content sync` |
| 2 | GREEN | `29df88c` | `feat(content): sync the content files into the database` |
| 3 | RED | `f3a8e28` | `test(content): expect the scoped prune` |
| 3 | GREEN | `526e07f` | `feat(content): prune the orphans of one collection on request` |

Nessun commit di REFACTOR: le funzioni sono già piccole e separate (piano, scrittura, conteggi, orfani).

Fallimenti attesi del RED: Task 1 → 2 suite non caricabili (`Cannot find module './bson-diff'`, `'./content-report'`); Task 2 → `Cannot find module './content-sync'`; Task 3 → `Cannot find module './content-prune'`.

## Verifiche

- Task 1: `npx jest src/content/sync src/content/fixes --selectProjects unit` → `Test Suites: 3 passed`, `Tests: 23 passed`; `tsc` exit 0; `pgrep -fl jest` vuoto. Acceptance: `Buffer.compare(BSON.serialize` 1 riga in `bson-diff.ts`; definizioni di `sameBson` fuori dalle spec = `1`.
- Task 2: `npx jest src/content/sync/content-sync.int-spec.ts --selectProjects integration --runInBand` → `Tests: 17 passed, 17 total`; `tsc` exit 0. Acceptance: `export async function runContent` 1 riga; `it('` = 17 (≥ 12); nessuna riga con `replaceOne`/`deleteMany`/`deleteOne` in `content-sync.ts`.
- Task 3: `npx jest src/content/sync --selectProjects integration --runInBand` → `Test Suites: 2 passed`, `Tests: 23 passed`; `npx jest src/content --selectProjects unit` → `Test Suites: 29 passed`, `Tests: 311 passed`; `tsc` exit 0; `pgrep -fl jest` vuoto. Acceptance: `export const PRUNABLE_COLLECTIONS` 1 riga; `D-05|Pitfall 2` nella spec = 5 (≥ 3).
- Regressione dei fix (import di `sameBson` spostato): `npx jest src/content/fixes --selectProjects integration --runInBand` → `Tests: 24 passed`.
- `npx prettier --write` ed `npx eslint` puliti su ogni `.ts` toccato; `git diff --exit-code src/schema.gql` → 0; gate SDL contro `origin/develop`: righe `-` = 1, righe `+` = 0; nessun `process.env.` sotto `src/content` fuori dalle spec.

## Test (titoli)

- bson-diff: double contro int32 (Pitfall 3); ordine delle chiavi; stringa esadecimale contro ObjectId; null e null; id e sottodocumenti uguali; solo i campi cambiati; documento assente = tutti i campi; campo assente a DB = cambiato anche se null; campi a DB non scritti dai file ignorati.
- content-report: nessuna deriva con tutto invariato/done; deriva con modified, inserted, link di città, fix pending, fix blocked (anche errore), errore nel report; orfani e warning non sono deriva (D-05); report vuoto con le 7 collezioni.
- content-sync (int): dry-run senza scritture (D-27); apply → verify senza deriva → seconda apply a zero (D-01); double di mongosh riscritto una volta (Pitfall 3); campi runtime della quest intatti (Pattern 3); quest nuova con campi runtime vuoti; link città → lore senza toccare area/POI/marker (D-23); file invalido → nessuna scrittura (D-28); città dello snapshot assente → nessuna scrittura; POI dello snapshot assente → nessuna scrittura; città con altro nome → warning; orfani elencati e non cancellati (D-05); orfani delle quest solo fisse aperte (D-05); probabile divergenza di id (Pitfall 7); tipi POI fuori enum errori in verify e warning in dry-run (Pitfall 5); fix dopo il contenuto (`renameCity` applied → done); conteggio dei fix per collezione; voce aggiunta = insert in verify.
- content-prune (int): solo gli orfani della collezione scelta (D-05); mai quest generate/aid/story/worldMission/concluse (D-05); back-link del POI azzerato (D-05); quest occupata da una corsia bloccata (Pitfall 2); niente prune con file invalidi; collezione fuori elenco rifiutata (D-05).

Casi in più rispetto al piano (stesso perimetro): campo assente a DB, campi a DB non scritti, quest nuova con campi runtime vuoti, POI dello snapshot assente, warning di città rinominata, conteggio dei fix, voce aggiunta in verify, back-link azzerato dal prune, collezione rifiutata.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Diff falsato dalla promozione dei numeri del driver**
- **Trovato durante:** Task 2 (test `rewrites a mongosh double once, then leaves it alone (Pitfall 3)` rosso: `modified` 0 invece di 1)
- **Problema:** il driver promuove `Double(300)` a numero JS; `BSON.serialize` lo riscrive come int32, quindi `sameBson` lo trovava uguale al valore dei file mentre il server lo riscrive
- **Fix:** lettura dei documenti da confrontare con `promoteValues: false` (costante `STORED_AS_SENT` in `content-sync.ts`); provato a mano che deserializzare senza promozione e riserializzare dà gli stessi byte
- **File:** `src/content/sync/content-sync.ts` — **Commit:** `29df88c`

**2. [Rule 1 - Bug] Campo assente a DB contro null scritto**
- **Trovato durante:** Task 1 (stesura del diff)
- **Problema:** `BSON.serialize({ v: undefined })` produce null: un campo mancante a DB e un null nei file sarebbero risultati uguali, ma il server aggiunge il campo (`modifiedCount` 1)
- **Fix:** `changedFields` considera cambiato ogni campo che il documento a DB non ha (`Object.hasOwn`); test dedicato
- **File:** `src/content/sync/bson-diff.ts` — **Commit:** `7d92df3`

## Known Stubs

Nessuno.

## Threat Flags

Nessuna superficie nuova oltre al registro del piano: T-11-32 (nessuna cancellazione né sostituzione in `content-sync.ts`, `$set` dei soli campi di catalogo), T-11-33 (`$setOnInsert` per i campi runtime, test dedicati), T-11-34 (`PRUNABLE_COLLECTIONS` chiuso, perimetro, guardie, nessun prune con file invalidi), T-11-35 (validazione completa prima della prima scrittura), T-11-36 (il modulo riceve un `Db`, il report contiene solo id, nomi, conteggi e messaggi), T-11-37 (errori per città/POI mancanti + `probableIdDivergence`) coperti dai test.

## Note per i piani 11-10, 11-11, 11-24

- Il CLI chiama `runContent(db, mode, tree)` per `--dry-run/--apply/--verify` e `pruneCollection(db, collection, tree)` per `--prune <collezione>` (prima controlla `PRUNABLE_COLLECTIONS` ed esce 2); `--verify` esce 1 con `hasDrift(report)`, `--apply` esce 1 con `hasErrors(report)`.
- I warning (snapshot non allineato, tipi fuori enum fuori da verify, città senza lore) e gli orfani non fanno mai uscire con errore.
- Dopo `renameCity` applicato lo snapshot resta col vecchio nome finché `--export` non lo riscrive: ogni corsa successiva riporta il warning `snapshot non allineato`.
- `seedWorld(db, tree.world ?? [])` semina città (`area: []`) e POI (`quest: null`) con ObjectId: base delle int-spec dei piani successivi.

## Self-Check: PASSED

- File creati presenti: gli 11 file di `src/content/sync/` e `test/content/seed-world.ts`; modificato `src/content/fixes/poi-and-city-fixes.ts`
- Commit presenti: `796f271`, `7d92df3`, `b6c542c`, `29df88c`, `f3a8e28`, `526e07f`
