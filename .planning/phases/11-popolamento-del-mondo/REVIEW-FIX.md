# Correzioni della code review — Phase 11

## Area sync (`REVIEW-sync.md`) — fixer 1

Base `380b750`, 12 finding con ruling FIX, un commit per finding (TDD: test rosso prima della correzione, salvo i due refactor senza cambio di comportamento LO-01 e LO-03 e la sola documentazione LO-05).

| Finding | Esito | Commit |
| --- | --- | --- |
| HI-01 `--prune` senza protezioni | fixed: `pruneCollection` rifiuta (in `errors`, exit 1) se `checkDatabase(db, tree, 'verify')` ha errori, se `divergencesOf` non è vuoto, se i file non hanno voci della collezione o se gli orfani superano le voci note; 4 casi nuovi nell'int-spec; runbook aggiornato | `aea912a` |
| ME-01 `--export` scrive tutte le quest in `deleteQuests` | fixed: l'export non genera più `fixes/delete-test-quests.yaml` e non legge più le quest (`counts.quests` sparisce dal report di export); int-spec aggiornata; README: `--export` serve a rinfrescare `world/cities.yaml` (copiare solo quel file) e al bootstrap | `c678836` |
| ME-02 id di `deleteQuests` presente nei file quest | fixed: errore offline in `checkContent` con file, riga e `key` della fix (`path: ids`); caso in `check-quest-rules.spec.ts` | `c6cae4d` |
| ME-03 snapshot senza `markerLocation`/appartenenza dei POI | fixed: `db-checks` confronta `City.markerLocation`, l'insieme di `City.pointsOfInterest` (ordine indifferente, ref stringa legacy ammessi) e `PointOfInterest.city`; una differenza è un errore «snapshot non allineato … rinfrescare world/cities.yaml con --export»; nuova `db-checks.int-spec.ts` (4 casi); runbook aggiornato | `53f64eb` |
| ME-04 prune del catalogo senza guardie | fixed: `PRUNABLE_COLLECTIONS = ['quests', 'lore']`; le altre collezioni escono 2 (uso errato) con l'uso `--prune <quests\|lore>`; README, runbook e handoff §11 (Phase 12) aggiornati | `38425f0` |
| LO-01 `PENDING_LANES` duplica `QUEST_LANES` | fixed: `QUEST_LANES` importato nel fix e nell'int-spec; `BlockedLane = QuestLane \| 'awaitingAid'` in `fix-report.ts` | `e4ab55a` |
| LO-02 `assertNoUndefined` solo nei test | fixed: `mapContentTree` la chiama su ogni documento con percorso `<collezione>.<id>`; il contenuto reale (405 lore, 581 quest, …) si mappa senza errori | `1bef19a` |
| LO-03 guardie ridondanti città→lore | fixed: tolto `firstLorePerCity`; `missing` resta con il commento di difesa in profondità | `716769a` |
| LO-04 report = piano, non esito di `bulkWrite` | fixed: `bulkWriteOf` restituisce `upsertedCount`/`modifiedCount`; in apply un esito diverso dal piano è un warning «esito della scrittura diverso dal piano» (collezioni e `relatedLore` delle città) | `15f5b17` |
| LO-05 fix bloccate per sempre dopo un cambio legittimo | documented: README e runbook dicono di ritirare le fix dai file dopo la prima `--verify` con tutte `done` | `8b0e44a` |
| LO-06 `FIX_COLLECTIONS` senza tipo, `quests.fixes` gonfiato | fixed: `Partial<Record<FixKind, ContentCollection>>`, `FixReport.kind: FixKind`; `collections.quests.fixes` somma solo `deleted.length` | `8996c8f` |
| LO-07 TOCTOU in `deleteQuests` | fixed: in apply ogni quest libera si ripianifica (pending, corsie, soccorso) subito prima di scrivere; se ora è occupata finisce in `blocked` senza scritture; runbook: `--apply`/`--prune` a backend fermo | `93e938b` |

Gate finali:

- `npm run build` → exit 0
- `npx tsc --noEmit -p tsconfig.json` → exit 0
- `node dist/content/run-content.js --check` → exit 0, 0 errori, 1 warning (titolo doppio della dungeon di Necrorian, atteso)
- `npx jest src/content --selectProjects unit` → 36 suite, 405 test verdi
- int-spec (`--selectProjects integration --runInBand`, una chiamata ciascuna): `content-prune` 11/11, `export-content` 5/5, `db-checks` 4/4, `content-sync` 19/19, `delete-quests.fix` 15/15, `fixes` 10/10, `run-content.cli` 7/7, `content-wire` 4/4
- `git diff --exit-code src/schema.gql` → pulito; diff SDL contro `origin/develop` = `-  unlocked: Boolean!` / `+  description: String`
- `git status --short` vuoto, `pgrep -fl jest` vuoto
- Quest generate non toccate (nessuna rigenerazione); `content/config.yaml` non toccato.

Da sapere per il `--verify` sul database reale: ME-03 rende errori le differenze di marker e di appartenenza dei POI che prima non si vedevano. Se lo snapshot reale non è allineato (per esempio un POI che una città non elenca ma che punta a lei con `city`, attribuito dall'export alla città tramite il campo), `--verify` esce 1 con «snapshot non allineato» e va rinfrescato `world/cities.yaml` con `--export`. Le quattro fix di `content/fixes/` sono già `done` dal piano 11-24: secondo LO-05 vanno ritirate dai file (decisione dell'orchestratore, non fatta qui).
