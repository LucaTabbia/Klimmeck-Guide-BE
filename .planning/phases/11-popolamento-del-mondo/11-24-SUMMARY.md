---
phase: 11-popolamento-del-mondo
plan: 24
subsystem: content
tags: [content, database, apply, graphql, BE-CONTENT-02, BE-CONTENT-03, BE-CONTENT-04, BE-CONTENT-05, BE-CONTENT-06]
requires: ["11-01", "11-02", "11-23", "11-27"]
provides:
  - "src/content/content-wire.int-spec.ts: prova sul filo GraphQL dell'albero reale (4 casi, replica set di test)"
  - "database reale dell'utente popolato: lore 405, spells 88, equipmentitems 172, lootitems 101, enemies 150, pets 13, quests 581; 167 città con `relatedLore`; 9 fix `done`"
  - ".planning/phases/11-popolamento-del-mondo/reports/11-24-{verify-before,dry-run,apply-1,verify-after,apply-2}.json"
affects: [11-25, 11-26]
tech-stack:
  added: []
  patterns:
    - "sequenza sul DB reale: `--check` → int-spec sul filo → `--dry-run` → `--apply` → `--verify` (exit 0) → seconda `--apply` (zero modifiche); ogni report controllato sui segreti prima del commit"
key-files:
  created:
    - src/content/content-wire.int-spec.ts
    - .planning/phases/11-popolamento-del-mondo/reports/11-24-verify-before.json
    - .planning/phases/11-popolamento-del-mondo/reports/11-24-dry-run.json
    - .planning/phases/11-popolamento-del-mondo/reports/11-24-apply-1.json
    - .planning/phases/11-popolamento-del-mondo/reports/11-24-verify-after.json
    - .planning/phases/11-popolamento-del-mondo/reports/11-24-apply-2.json
  modified: []
decisions:
  - "Il quadro autorevole «prima dell'apply» è il dry-run, non il verify-before: quest'ultimo precede 11-27 e le correzioni dell'utente del 2026-11-02 e resta come fotografia storica (non rigenerato)"
  - "La corsia bloccata del verify-before (`pendingQuest` del personaggio archiviato `6ae30a623a20a4350c47eda5` sulla quest `6ada3608b3dad669f2c257cf`) è stata liberata dall'orchestratore al checkpoint; nel dry-run il fix `delete-talmvere-test-quests` era `pending` con `blocked: []`"
  - "Nessun `--prune`: i 7 orfani delle quest del dry-run erano quest di prova di Talmvere, cancellate dal fix `deleteQuests`; dopo l'apply nessuna collezione ha orfani"
metrics:
  duration: "~10 min (ripresa dal Task 4; Task 1–2 nella sessione precedente)"
  completed: 2026-11-02
  tasks: 4
  files: 6
---

# Phase 11 Plan 24: caricamento del contenuto sul database reale — Summary

Il mondo di Klimmeck (1510 voci di catalogo e quest + `relatedLore` di 167 città + 9 fix) è nel database unico dell'utente: `--verify` esce 0 a zero differenze e la seconda `--apply` riporta `inserted: 0` e `modified: 0` in ogni collezione.

## Task

| Task | Nome | Commit | Esito |
| --- | --- | --- | --- |
| 1 | prova sul filo GraphQL dell'albero reale | `12925f1` | int-spec verde (aggiornata da 11-27 con il caso D-32) |
| 2 | `--verify` di sola lettura prima dell'apply | `61a3ade` | `exit 1` atteso, `probableIdDivergence: []`, 1 corsia bloccata |
| 3 | checkpoint: backup e corsie libere | — | chiuso: backup `mongodump` dell'utente («possiamo procedere»), corsia liberata dall'orchestratore |
| 4 | dry-run → apply → verify → apply sul DB reale | (commit di questo SUMMARY) | tutte le corse `exit 0`, verify-after a zero, apply-2 a zero |

## Task 1 — prova sul filo (VALIDATION 11-24-01)

`src/content/content-wire.int-spec.ts`: harness `createAuthTestApp` con Lore/Enemies/Pets/Spells/Quests/CitiesModule; `seedWorld` + `runContent(db, 'apply', loadContentTree(DEFAULT_CONTENT_DIR))` su un `MongoClient` a parte; query con le selezioni verbatim del FE (`lores` senza `unlocked`, `cities`, `QUEST_FIELDS`, `enemys`/`pets`/`spells` con tutti i campi non-null dello SDL).

Rieseguita sui file correnti prima del Task 4:

```
PASS integration src/content/content-wire.int-spec.ts
  ✓ serves every list of the real content without errors (BE-CONTENT-02) (455 ms)
  ✓ applies the real content a second time without changes (D-01) (358 ms)
  ✓ serves the notice description of every fixed quest (D-32) (164 ms)
  ✓ links every city to its lore on the wire (D-23) (35 ms)
Tests:       4 passed, 4 total
```

`pgrep -fl jest` vuoto dopo la corsa. `--check` prima del Task 4: `exit 0`, 0 errori, 1 warning (titolo doppio «Dungeon: Drago d'ombra giovane presso Necrorian», `6ae80db9da5c5f8cc552680c`).

## Task 2 — verify-before (fotografia storica)

`reports/11-24-verify-before.json` (preso prima di 11-27 e delle correzioni dell'utente): `probableIdDivergence: []`; 6 `errors` per tipi POI fuori enum (corretti dai fix `poi-type-*`); fix `delete-talmvere-test-quests` **blocked** su 1 id:

| questId | pendingQuest | character | lane |
| --- | --- | --- | --- |
| `6ada3608b3dad669f2c257cf` | `6ae30ca93a20a4350c47ef60` | `6ae30a623a20a4350c47eda5` | `pendingQuest` |

Gli altri 15 id erano cancellabili; `rename-flinas-north-village`, `lore-unset-unlocked` (12) e i 6 `poi-type-*` `pending`.

## Task 4 — corse sul database reale

Ogni report: `grep -ciE "mongodb(\+srv)?://|@[a-z0-9.-]+\.(net|com)"` = `0` (anche un controllo più largo su `MONGO|password|token` = `0`).

| Corsa | Report | Exit |
| --- | --- | --- |
| `--dry-run` | `11-24-dry-run.json` | 0 |
| `--apply` | `11-24-apply-1.json` | 0 |
| `--verify` | `11-24-verify-after.json` | 0 |
| `--apply` | `11-24-apply-2.json` | 0 |

### Dry-run (quadro autorevole «prima»)

`errors: []`, `probableIdDivergence: []`, tutti i 9 fix `pending`, `delete-talmvere-test-quests` con `blocked: []` e 16 quest da cancellare (`touched: 18`); orfani solo fra le quest (7, tutte quest di prova di Talmvere coperte dal fix); 14 warning = titolo doppio di Necrorian + 7 «snapshot non allineato» (6 tipi POI e il nome Flinas → Kliever, che i fix allineano) + 6 «valori fuori enum» a DB (gli stessi POI). I conteggi coincidono con la prima apply (tabella sotto).

### Prima apply e totale finale per collezione

| Collezione | Inserite | Modificate | Invariate | Totale finale (verify-after) | Orfani dopo |
| --- | --- | --- | --- | --- | --- |
| lore | 393 | 12 | 0 | 405 | 0 |
| spells | 11 | 0 | 77 | 88 | 0 |
| equipmentitems | 27 | 4 | 141 | 172 | 0 |
| lootitems | 18 | 4 | 79 | 101 | 0 |
| enemies | 149 | 1 | 0 | 150 | 0 |
| pets | 12 | 0 | 1 | 13 | 0 |
| quests | 581 | 0 | 0 | 581 | 0 |

Città: `relatedLore` modified 155, unchanged 12, `missing: []` → dopo: modified 0, unchanged 167, `missing: []`.

Rispetto al verify-before l'unica differenza nei conteggi è `spells`: 11 inserite invece di 10 (file di magie cambiati dopo il verify-before, con 11-27 e le correzioni dell'utente); le modifiche sulle collezioni esportate (lore 12, equip 4, loot 4, enemies 1) sono le normalizzazioni attese (Pitfall 3) e coincidono col verify-before.

### Esito dei fix (prima apply → verify-after)

| Fix | Kind | Prima apply | Dettaglio | Verify-after |
| --- | --- | --- | --- | --- |
| `delete-talmvere-test-quests` | `deleteQuests` | `applied` | 16 quest cancellate, `pendingQuestsDeleted: 2`, `poiBackLinksCleared: 0`, `questResultsKept: 24`, `aidReferences: []`, `blocked: []` | `done` |
| `rename-flinas-north-village` | `renameCity` | `applied` | 1 città (Flinas → Kliever) | `done` |
| `lore-unset-unlocked` | `unsetLoreUnlocked` | `applied` | 12 lore | `done` |
| `poi-type-690e4186108dbf02380d4c81` | `normalizePoiTypes` | `applied` | `belleholmIsand` → `belleholmIsland` | `done` |
| `poi-type-690e4186c26625d660983fea` | `normalizePoiTypes` | `applied` | `ValanPlains` → `valanPlains` | `done` |
| `poi-type-690e4186d116ef011e516635` | `normalizePoiTypes` | `applied` | `BelleholmIsland` → `belleholmIsland` | `done` |
| `poi-type-690e4186477fbde00a7c7a79` | `normalizePoiTypes` | `applied` | `vulcano ` → `vulcano` | `done` |
| `poi-type-690e418698ec3a87c4b7eb55` | `normalizePoiTypes` | `applied` | `NULLbelleholmIsland` → `belleholmIsland` | `done` |
| `poi-type-690e4186a2175881abee5979` | `normalizePoiTypes` | `applied` | `gounet` → `glounet` | `done` |

### Verify-after e seconda apply

- `11-24-verify-after.json`: ogni collezione `inserted: 0`, `modified: 0`, nessun orfano; `cities.relatedLore.modified: 0`, `missing: []`; 9 fix `done`; `errors: []`; `probableIdDivergence: []`; unico warning il titolo doppio di Necrorian.
- `11-24-apply-2.json`: ogni collezione `inserted: 0`, `modified: 0`; `cities.relatedLore.modified: 0`; fix tutti `done`; `errors: []`.
- Verify automatico del piano (controllo segreti sui 4 report + script node su apply-2/verify-after): `exit 0`.

### Quest fisse per tipo (a DB)

| heal | job | guard | crime | study | hunt | dungeon | Totale |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 166 | 166 | 68 | 34 | 30 | 77 | 40 | 581 |

Una sola study con `spellDraw` (Valantar, `6ae80db9da5c5f8cc5526781`).

## Dopo l'apply (da ripetere nel runbook 11-25)

- Il BE che serve il database unico deve girare dal branch `feat/11-popolamento-del-mondo` (un processo su `develop`, senza il populate di 11-01, risponderebbe `data: null` su `lores`/`enemys`, Pitfall 1). L'esecutore non ha avviato né riavviato processi: lo fa l'orchestratore.
- Il FE usato non deve più selezionare `unlocked` (quick task FE che sblocca il merge della PR BE).
- Rollback: `mongorestore` dal dump dell'utente.

## Deviations from Plan

Nessuna sul Task 4: eseguito esattamente come scritto. Note:
- Il Task 1 ha 4 casi invece dei 3 del piano: il quarto (`serves the notice description of every fixed quest (D-32)`) l'ha aggiunto il piano 11-27.
- La corsia bloccata del Task 2 è stata liberata dall'orchestratore (non dall'app) prima della ripresa; il dry-run lo conferma (`blocked: []`).

## Known Stubs

Nessuno.

## Threat Flags

Nessuno: nessuna superficie nuova; le mitigazioni T-11-80..T-11-84 sono state applicate (backup dell'utente, verify di sola lettura e prova sul filo prima, nessun fix `blocked` all'apply, `probableIdDivergence: []`, solo `node --env-file=.env`, controllo segreti su ogni report, report di ogni corsa nel repo).
