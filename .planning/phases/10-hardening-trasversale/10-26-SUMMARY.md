---
phase: 10-hardening-trasversale
plan: 26
subsystem: migrations
tags: [mongo, migration, mixed-refs, boot-verifier, cli, D-17d, BE-HARD-06]
requires:
  - "10-19: `SweepIndexVerifier` come modello di verificatore al boot non bloccante"
  - "10-20: `PointOfInterest.type` lista (lo scalare legacy su disco va normalizzato qui)"
  - "10-15: spec di drift di `.env.example` (nessuna lettura `process.env.X` nuova)"
provides:
  - "inventario `MIXED_REF_PATHS` verificato contro gli schemi reali (34 percorsi in 10 collection)"
  - "builder puri delle pipeline di conversione e dei filtri residui"
  - "`runMixedRefsMigration(db, mode)` a driver nativo con modalità dry-run, apply, verify e gate di versione 4.2"
  - "CLI `dist/migrations/run-mixed-refs.js` per l'utente"
  - "`MixedRefsVerifier` di sola lettura montato in `MongoModule`"
affects: [10-27, 10-28, 10-29, 10-30]
tech-stack:
  added: []
  patterns:
    - "porta strutturale minima del database (`ReferenceDatabase`/`ReferenceCollection`) al posto del tipo `Db`: la soddisfano sia il driver diretto 6.19 sia quello 6.18 annidato in mongoose"
    - "seed legacy per ogni percorso dell'inventario con coppia prima/dopo e confronto `toEqual` del documento intero"
key-files:
  created:
    - src/migrations/mixed-refs/mixed-ref-paths.ts
    - src/migrations/mixed-refs/mixed-ref-paths.spec.ts
    - src/migrations/mixed-refs/mixed-ref-pipelines.ts
    - src/migrations/mixed-refs/mixed-ref-pipelines.spec.ts
    - src/migrations/mixed-refs/mixed-refs.migration.ts
    - src/migrations/mixed-refs/mixed-refs.migration.int-spec.ts
    - src/migrations/run-mixed-refs.ts
    - src/migrations/mixed-refs/mixed-refs.verifier.ts
    - src/migrations/mixed-refs/mixed-refs.verifier.int-spec.ts
  modified:
    - src/mongo/mongo.module.ts
    - test/app.int-spec.ts
decisions:
  - "L'inventario reale è di 34 percorsi in 10 collection, non 33 in 9 come nel RESEARCH: la collection delle lore si chiama `lore` (non `lores`) e conta come decima; `prizes.prizeItem` è un sottodocumento singolo, quindi `prizes.prizeItem.item` è un percorso scalare"
  - "La migrazione accetta una porta strutturale `ReferenceDatabase` invece di `Db`: il `connection.db` di mongoose viene dalla copia annidata del driver (6.18) ed è nominalmente incompatibile col `Db` 6.19; nessun cast"
  - "Exit code del CLI: 0 ok, 1 verify con residui, 2 uso errato o MongoDB sotto 4.2, 3 errore di esecuzione (connessione, ecc.); il codice 3 è un'aggiunta al piano"
  - "Il report ha un campo in più rispetto all'interfaccia del piano, `poiTypeNormalized` (documenti normalizzati dalla apply), accanto a `poiTypeScalars` (scalari rimasti); verify fallisce anche se restano scalari di `type`"
  - "Il verificatore al boot conta solo i ref (non gli scalari di `type`, che lo schema legge già come lista)"
  - "La spec di drift resta invariata: il CLI passa l'intero `process.env` a `runCli`, nessuna lettura per chiave"
metrics:
  duration: "~35 min"
  completed: "2026-10-30"
  tasks: 3
  files: 11
---

# Phase 10 Plan 26: migrazione dei ref Mixed (inventario, script, CLI, verificatore) Summary

Migrazione idempotente a driver nativo dei 34 ref `Mixed` (10 collection) da stringa esadecimale minuscola a ObjectId, con dry-run/apply/verify, gate di versione MongoDB 4.2, CLI per l'utente e verificatore di sola lettura al boot che logga ERROR con i conteggi per percorso senza bloccare.

## Cosa è stato fatto

- **Task 1 — inventario e pipeline.** `MIXED_REF_PATHS` (forma `{ collection, path, shape: 'scalar' | 'array' | 'subdocArray', key? }`, helper `mixedRefLabel` → `collection:path[.key]`). La spec percorre ricorsivamente gli schemi Mongoose reali di 14 collection (sottoschemi e array di sottoschemi compresi) e confronta l'insieme dei percorsi `Mixed` con `ref`/`refPath` con l'inventario intero (oggetti ordinati per etichetta, `toEqual`). Builder puri in `mixed-ref-pipelines.ts`: `OBJECT_ID_HEX_PATTERN`, `convertValue(expr)` (conversione condizionale annidata: prima il tipo stringa, poi la regex, poi la conversione), `conversionStage(ref)` (scalare diretto; liste e liste di sottodocumenti mappate solo se il valore è davvero una lista, nei sottodocumenti si riscrive solo `key` con un merge), `convertibleFilter(ref)` e `residualFilter(ref)` (identici), `POI_TYPE_SCALAR_FILTER` e `poiTypeNormalization`.
- **Task 2 — migrazione e CLI.** `runMixedRefsMigration(db, mode)` legge la versione dal `serverInfo`, si ferma sotto 4.2 prima di qualunque scrittura, poi per ogni percorso: in apply un update a pipeline filtrato sui soli documenti convertibili, in ogni modalità il conteggio dei residui. `countResidualRefs(db)` e `hasResidualRefs(report)` esportati. CLI `run-mixed-refs.ts` con `runCli(argv, env, out)`.
- **Task 3 — verificatore al boot.** `MixedRefsVerifier` (provider di `MongoModule`, `@InjectConnection()`, `onApplicationBootstrap(): void { void this.verify(); }`, `verify()` pubblico e attendibile) usa `countResidualRefs` e logga un solo ERROR riassuntivo; ogni errore di lettura diventa un ERROR con `describeError`.

## TDD: RED e GREEN

| Task | RED (fallimento atteso visto) | GREEN |
|------|-------------------------------|-------|
| 1 | `Cannot find module './mixed-ref-paths'` / `'./mixed-ref-pipelines'` | 8/8 unit |
| 2 | `Cannot find module '../run-mixed-refs'` | 11/11 integration; unit `src/migrations src/config` 230/230 |
| 3 | `Cannot find module './mixed-refs.verifier'` (spec del verificatore e boot reale) | integration `src/migrations` + `test/app.int-spec.ts` 79/79 |

Nessun caso verde al primo colpo.

## Verifiche

- `npx tsc --noEmit -p tsconfig.json` → 0; `npm run build` → 0, emette `dist/migrations/run-mixed-refs.js` (import relativi risolti).
- Prova del CLI senza connessione: `node dist/migrations/run-mixed-refs.js` senza modalità e con `--help` stampano l'uso ed escono con 2 prima di aprire qualunque connessione. Il CLI NON è mai stato eseguito con una modalità contro un database: la prova sui dati è solo nell'int-spec sul replica set dell'harness (database dedicato `mixed-refs-test`).
- `git diff --exit-code src/schema.gql` → 0 dopo ogni commit; nessuna riga rimossa rispetto a `origin/develop`.
- `src/mongo/document-id.ts` invariato rispetto a `origin/develop` (lettori tolleranti intatti); nessun `@Prop` ritipizzato.
- Il verificatore non scrive (nessun update/insert/delete nel file); `EXPECTED_THROTTLED_HANDLERS` resta a 8 voci.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Inventario: 34 percorsi in 10 collection, collection `lore`**
- **Found during:** Task 1
- **Issue:** il RESEARCH elenca 33 percorsi in 9 collection e il nome `lores`; il probe sugli schemi reali dà 34 percorsi (il conteggio del RESEARCH era sbagliato di uno) e la collection delle lore è `lore` (`@Schema({ collection: "lore" })`). `prizes.prizeItem` è un sottodocumento singolo, non una lista.
- **Fix:** inventario derivato dagli schemi, test aggiuntivo che fissa 34 percorsi e l'elenco delle 10 collection.
- **Commit:** c3f605c

**2. [Rule 3 - Blocking] Tipo `Db` incompatibile fra le due copie del driver**
- **Found during:** Task 3
- **Issue:** `connection.db` di mongoose è il `Db` del driver annidato 6.18, non assegnabile al `Db` 6.19 (membri privati separati): `tsc` falliva.
- **Fix:** la migrazione dichiara la porta strutturale minima `ReferenceDatabase` (`collection(name)` con `updateMany`/`countDocuments`, `admin().serverInfo()`); la firma diventa `runMixedRefsMigration(db: ReferenceDatabase, mode)`. Nessun cast.
- **Commit:** 23d10bf

**3. [Rule 2 - Missing critical] Exit code 3 ed errore senza URI**
- **Found during:** Task 2
- **Issue:** il piano prevede solo 0/1/2; un errore di connessione non aveva un codice e il suo messaggio del driver può contenere l'host.
- **Fix:** errori di esecuzione → riga JSON con soli nome e codice (`describeError`) ed exit 3; anche la costruzione del client è dentro il try.
- **Commit:** d9d7984

**4. [Rule 2] Campo `poiTypeNormalized` nel report**
- **Found during:** Task 2 — senza, una apply non diceva quanti punti d'interesse aveva normalizzato (`poiTypeScalars` è il conteggio residuo dopo l'operazione).
- **Commit:** d9d7984

**5. Subject del commit d9d7984 di 73 caratteri**
- Il subject imposto dal piano, `feat(migrations): migrate Mixed references with dry-run, apply and verify`, è di 73 caratteri: l'ho misurato ma non ho bloccato il commit. Nessuna riscrittura della storia (vietata); dai commit successivi il conteggio blocca il commit.

### Altre note
- Due test in più rispetto al piano nell'int-spec della migrazione (exit 2 sotto 4.2 senza scrivere; report JSON di soli conteggi), uno in più nella spec dell'inventario (etichette) e uno in più in quella delle pipeline (residuo uguale al convertibile).
- Warning eslint preesistente in `test/app.int-spec.ts` riga 808 (`no-base-to-string`): fuori scope.

## Known Stubs

Nessuno.

## Threat Flags

Nessuna superficie nuova oltre al threat model (T-10-90..93 mitigati: solo esadecimali minuscoli a 24, non esadecimali e maiuscoli intatti, idempotenza provata, gate di versione prima di ogni scrittura, report di soli conteggi, verificatore al boot).

## Self-Check: PASSED
