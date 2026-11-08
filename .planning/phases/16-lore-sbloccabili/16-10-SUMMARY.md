---
phase: 16-lore-sbloccabili
plan: 10
subsystem: migrations (backfill una tantum delle lore al boot)
tags: [lore, migrations, boot, one-off, BE-LORE-01, D-11]
requires: ["16-09", "16-05", "16-03"]
provides:
  - "`WON_RESULT_OUTCOMES`, `wonEnemyIdsOf`, `loreBackfillOf` (puri) in `src/migrations/lore-backfill/lore-backfill.ts`"
  - "`LoreBackfillMigrator.backfillAll(): Promise<LoreBackfillReport>` in `src/migrations/lore-backfill/lore-backfill.migrator.ts`"
  - "`LoreBackfillBoot` (`OnApplicationBootstrap`, mai bloccante) e `LoreBackfillModule`, importato solo da `AppModule`"
affects: [16-11, 16-12]
tech-stack:
  added: []
  patterns:
    - "One-off al boot sul modello `QuestMaintenanceBoot`: driver nativo, idempotenza per unione, log di soli conteggi"
key-files:
  created:
    - src/migrations/lore-backfill/lore-backfill.ts
    - src/migrations/lore-backfill/lore-backfill.spec.ts
    - src/migrations/lore-backfill/lore-backfill.migrator.ts
    - src/migrations/lore-backfill/lore-backfill.migrator.int-spec.ts
    - src/migrations/lore-backfill/lore-backfill.boot.ts
    - src/migrations/lore-backfill/lore-backfill.boot.spec.ts
    - src/migrations/lore-backfill/lore-backfill.module.ts
  modified:
    - src/app.module.ts
decisions:
  - "Le tre collection (personaggi, risultati, nemici) si leggono da `this.connection.model(<Model>.name).collection`; `LoreBackfillModule` registra con `forFeature` Character, QuestResult ed Enemy perché `connection.model(name)` senza schema lancia `MissingSchemaError`"
  - "Personaggi e risultati letti ordinati per `_id`: report e ordine delle novità deterministici"
metrics:
  duration: "~20 min"
  completed: 2026-11-07
  tasks: 3
  files: 8
---

# Phase 16 Plan 10: backfill una tantum delle lore Summary

Al boot reale ogni personaggio attivo riceve per unione (operatore `$addToSet` con `$each`, mai `$set`) la geografia della città del suo marker (`LoreGeographyReader.ofMarker`, la stessa della nascita e degli arrivi) più le `Enemy.relatedLore` e gli id dei nemici dei suoi `questresults` vinti (`success` e `gmCompleted`, forma lista `enemies.enemy` e forma legacy `enemy`, ref del personaggio in entrambe le forme con `idForms`). Gli archiviati non si toccano, i `loreUnlocked` dei vecchi risultati nemmeno; il secondo giro non cambia nulla e fa da verifica. Il passo non ferma mai il boot e logga soli conteggi. Codice temporaneo: va rimosso in TDD dopo il boot reale.

## Commit

| Task | Commit | Subject |
|------|--------|---------|
| 1 RED | b4dc64b | test(migrations): pin the one-off lore backfill by union (D-11) |
| 1 GREEN | 6aa0604 | feat(migrations): add the one-off lore backfill migrator |
| 2 RED | 54022c7 | test(migrations): pin the never blocking lore backfill boot (D-11) |
| 2 GREEN | 79d0fc9 | feat(migrations): run the one-off lore backfill at boot |
| 3 | (questo) | docs(phase-16): record plan 10 progress |

## Fallimenti RED osservati

- `lore-backfill.spec.ts`: suite fallita, «Cannot find module './lore-backfill'» (0 test eseguiti).
- `lore-backfill.migrator.int-spec.ts`: suite fallita, «Cannot find module './lore-backfill.migrator'».
- `lore-backfill.boot.spec.ts`: suite fallita, «Cannot find module './lore-backfill.boot'» (anche il caso dei metadati di `AppModule` è rosso per lo stesso motivo).

## Harness del migrator

`createAuthTestApp({ imports: [LoreGeographyModule, MongooseModule.forFeature([Character, QuestResult, Enemy, PointOfInterest])], providers: [LoreBackfillMigrator] })` + `harness.app.get(LoreBackfillMigrator)`; i modelli si leggono da `harness.connection.models[...]`, i documenti grezzi col driver nativo (`collection.findOne`). Geografia da `persistGeography(harness.connection)` (`world.marker`, `world.geography`); POI del territorio = `persistPoi(pois)` (POI senza città che lo abbia come `markerLocation`); `afterEach` → `harness.clearDatabase()`. 7 casi in ~1 s.

## Log al boot (formato fisso)

- Successo: `Backfill delle lore: personaggi <characters>, aggiornati <updated>, lore aggiunte <loreAdded>, nemici aggiunti <enemiesAdded>, senza città <withoutCity>`
- Errore: `Backfill delle lore fallito (<describeError>), il boot prosegue`

Al primo boot reale ci si aspetta `personaggi 4`; al secondo boot `aggiornati 0, lore aggiunte 0, nemici aggiunti 0` (verifica). **Esito reale (2026-11-08):** `personaggi 3` (uno dei 4 documenti è archiviato e il filtro dei personaggi attivi lo esclude), `aggiornati 2, lore aggiunte 8, nemici aggiunti 1, senza città 1`; secondo boot `aggiornati 0, lore aggiunte 0, nemici aggiunti 0`.

## Procedura di rimozione (per il handoff)

Dopo il boot reale e il report dei conteggi, in un piano fuori da questa fase (modello `3bdf65a`/`64ef914` della 13.1):
1. RED in `test/app.int-spec.ts`: il caso `mounts the one-off lore backfill at boot (16 D-11)` viene sostituito da un caso che legge i nomi dei moduli dal `ModulesContainer` del boot reale e non trova più `LoreBackfillModule`; commit `test(migrations): …`.
2. `refactor(migrations): drop the 16 one-off lore backfill after its run`: cancella `src/migrations/lore-backfill/` (7 file) e l'import + il commento in `src/app.module.ts`.
3. `npx tsc --noEmit -p tsconfig.json` 0, `npx jest test/app.int-spec.ts --selectProjects integration --runInBand` verde, `git diff --exit-code src/schema.gql` 0.

Eseguita il 2026-11-08: `80c3bf7` (RED sul boot reale: `ModulesContainer` senza `LoreBackfillModule`) → `0125058` (rimozione); terzo boot dalla build finale senza riga del backfill. Dettaglio nel handoff §5.

## Deviazioni dal piano

- **[Rule 3 - Blocco] `forFeature` in `LoreBackfillModule`**: il piano prevedeva `imports: [LoreGeographyModule]` soltanto; il migrator legge i nomi delle collection da `this.connection.model(<Model>.name)`, che senza schema registrato lancia `MissingSchemaError`. Il modulo registra quindi Character, QuestResult ed Enemy (innocuo in `AppModule`, dove sono già registrati) ed è autosufficiente. Stesso registro nell'harness dell'int-spec.
- **Collection lette dal modello per tutte e tre** (non solo per i nemici): nessun nome di collection scritto a mano.
- **[Rule 1 - Bug nella spec RED] POI del territorio**: `persistPoi(pois, { type: 'quest' })` non passa la validazione (`quest` non è un `PoiType`); nel commit GREEN i due casi usano `persistPoi(pois)` (POI senza città collegata).
- Il caso `never touches an archived character (D-11)` usa `toMatchObject` sui due insiemi (vuoti in partenza) più `characters: 0`, `updated: 0`.
- **Post-chiusura (CI della PR #25, 2026-11-08)**: il caso dei metadati di `AppModule` nella spec unitaria importava `src/app.module`, che al caricamento esegue `ConfigModule.forRoot` → `validateEnv`; senza `.env` (CI) il `JWT_SECRET` mancante usciva come eccezione non catturata e jest moriva senza riepilogo (in locale il `.env` lo copriva). Il controllo del cablaggio è passato a `test/app.int-spec.ts` (`mounts the one-off lore backfill at boot (16 D-11)`, boot reale con ambiente finto); la spec unitaria tiene solo i moduli feature (`is imported by no feature module (D-11)`). Commit `5fd6190`.

## Gate

- `npx jest src/migrations/lore-backfill --selectProjects unit`: 2 suite, 8/8.
- `npx jest src/migrations/lore-backfill --selectProjects integration --runInBand`: 1 suite, 7/7.
- `npx jest test/app.int-spec.ts --selectProjects integration --runInBand`: 76/76 (il passo gira sul replica set di test).
- `npx tsc --noEmit -p tsconfig.json` 0; prettier ed eslint puliti sugli 8 file `.ts` toccati.
- `git diff --exit-code src/schema.gql` 0; vs `origin/develop` ancora 3 righe `+` (`unlockedLore: [ID!]!`, `known: Boolean!`, `loreUnlocked: [Lore!]!`), 0 righe `-`.
- Nessun `process.env`, `Math.random`, `Date.now` sotto `src/migrations/lore-backfill` fuori dalle spec; nessun `$set` nel migrator.

## Known Stubs

Nessuno.

## Threat Flags

Nessuno: la scrittura sul database reale (T-16-38..41) è nel threat model del piano.

## Self-Check: PASSED

Commit b4dc64b, 6aa0604, 54022c7, 79d0fc9 nel log; i 7 file di `src/migrations/lore-backfill/` presenti; `LoreBackfillModule` importato solo da `src/app.module.ts`.
