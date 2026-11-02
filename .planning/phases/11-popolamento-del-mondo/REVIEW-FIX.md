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

## Area core (`REVIEW-core.md`) — fixer 2

Base `38cd6ec`, 16 finding tutti con ruling FIX, un commit per finding. TDD: test rosso prima della correzione, salvo LO-12 (refactor: i casi nuovi su `winChanceOf`, lifePoints per id e arrotondamento della marcia erano rossi, i numeri restano gli stessi) e LO-13 (refactor degli import; il controllo su `stderr` è verde da subito perché dopo LO-01 il CLI non stampa stack).

| Finding | Esito | Commit |
| --- | --- | --- |
| ME-01 `images.yaml` non-mappa ignorato; `.yml` saltati | fixed: issue «il file deve essere una mappa lore/enemies/pets» (un file vuoto resta ammesso); i file senza estensione `.yaml` nelle cartelle del contenuto e in `fixes/` diventano warning del loader (`ContentTree.warnings`), riportati da `checkContent`; casi in `loading/content-tree.spec.ts`; README | `820099a` |
| ME-02 README promette controlli assenti | fixed (a): `infos.description` obbligatoria su ogni quest fissa (D-32) e rarità di ogni `recommendedLoot` ≤ `dungeonLootRarity[minTitle]` (D-33); `rarityRankOf` spostata in `rules/quest-prizes` e usata anche dal generatore (quest rigenerate identiche); il contenuto reale passa (581 quest, 0 errori); le due quest della fixture ricevono una `description`; README (la composizione resta garantita dal generatore) | `2b27630` |
| ME-03 Valantar per nome, costante duplicata | fixed: una sola `SPELL_DRAW_CITY_TYPE = CityType.valanCapital` in `city-profile.ts`, confronto su `city.type` nel check e nel generatore; errore se la study `valanCapital` non ha `spellDraw`; README riga 155; `COLLEGE_CITY` rimossa (chiude anche app LO-03); quest non rigenerate (Valantar è l'unica `valanCapital`) | `a6b49de` |
| LO-01 eccezioni offline → exit 1 senza report | fixed: `runOffline` in `try/catch` → `errorReportOf` + `CONTENT_EXIT.failure`; `.catch` sull'entry point; caso nell'int-spec (cartella `lore/cartella.yaml` → exit 3, `{"error":"Error, code EISDIR"}`) | `827e5f3` |
| LO-02 config accetta `legend` | fixed: `oneOf(RANKED_TIERS)` e tipo `RankedTier` per `minTitle.*` e `dungeonTierByCitySize` | `7fd34b1` |
| LO-03 chiavi sconosciute nelle sezioni del config | fixed: «chiave sconosciuta» con il percorso completo in ogni sezione (anche `tiers`, `hunt`, `generator`, i tipi di `prizes`); `randomLootQuantity` solo su `prizes.dungeon`; `content/config.yaml` non toccato (fixture identica, `cmp` ok) | `aca9b96` |
| LO-04 `timeToComplete` senza minimo/tetto | fixed: override `IntBetween(60_000)`; `timeToCompleteHours` ≤ 596 (`MAX_GRAPHQL_INT / 3_600_000`); `MS_PER_HOUR` in `content-config`; README | `5dc13c0` |
| LO-05 `Lore.image`/`imagePath` fuori dal vincolo Cloudinary | fixed (parziale): `LoreEntry.image` non null → `CLOUDINARY_URL` (i 12 valori reali passano); `imagePath` di nemici e pet → `assets/images/<nome>.png`, `pets/<nome>.png` o URL Cloudinary; verificato prima sui file reali: 162 percorsi conformi più `arbustoMaligno.png`, quindi i nomi ammettono `[A-Za-z0-9-]`; nessun cloud name nella regex (il commento non lo promette più); `CLOUDINARY_URL` in `common.content` | `9ffab9e` |
| LO-06 chiave di dedup senza `entryId` | fixed: `entryId` nella chiave di `withoutRepeats` (loader e validazione danno lo stesso `entryId` per lo stesso difetto, quindi si fondono ancora) | `2d2b0bc` |
| LO-07 `prizes.spell` fisso ammesso sulle study | fixed: rifiutato su ogni quest fissa (D-17/D-31 rivisti); README righe 99 e 156; nessuna quest reale lo usa | `5dc8d86` |
| LO-08 copertura D-17 non controllata | fixed: errore su `world/cities.yaml` (id della città) per ogni città fuori da `NO_SERVICE_CITY_TYPES` senza `heal` o senza `job`; il generatore usa `checkGenerationInput` (stesso check senza la copertura, che è il suo output), e così il round-trip dell'export; fixture: + job al Borgo, + heal e job alla Capitale (conteggi quest 2 → 5 nelle spec); il prune di una cartella quest vuota ora si ferma su questa regola prima della guardia «nessuna voce» (test riscritto) | `2e2f4da` |
| LO-09 `key` delle fix non unica | fixed: `duplicateIssues` segnala «key doppia nelle fix» | `2ec7f89` |
| LO-10 id dei file contro id dello snapshot, POI doppi | fixed: `duplicateIssues` rifiuta un id del contenuto uguale a una città o a un POI dello snapshot, id ripetuti nello snapshot e un POI in due città; vale per ogni `--content-dir` | `74e0163` |
| LO-11 `locations` con `dungeon`; pet `xp ≤ maxXp` | fixed: `locations` accetta ogni `PoiType` tranne `dungeon`; `NotAbove('maxXp')` sui pet (stesso decoratore di `maxLifePoints`); README | `db0f393` |
| LO-12 formula duplicata, HP cablati, funzioni morte, `isRecord` ×5 | fixed: `winChanceOf(partyPower, lifePoints)` esportata dal resolver e riusata da `catalog-stats`; `ENCOUNTERS` per id del nemico, lifePoints dalla voce (override o `pf × hpScale`), uno scontro senza nemico nei file non dà esempio; `marchMinutesOf` in `catalogStats`; il generatore passa da `dungeonLootRarity`; un solo `isRecord` in `loading/records.ts`. `--stats` offline: lifePoints 1100/8400/25600/67600 e winChance 0.21/0.78/0.87 come `11-12-stats.json`; Troll 0.44 invece di 0.45 perché la mediana rare è passata da 2250 a 2200 col catalogo cresciuto dopo l'11-12 (pezzi rare 30 → 40), non per questa modifica | `4801da8` |
| LO-13 import relativi; int-spec senza `stderr` | fixed: import `src/...` in `run-content.ts` e nell'int-spec; l'int-spec raccoglie `stderr` e verifica l'assenza dell'URI su entrambi i flussi; nessun controllo `mtime` | `db8b578` |

Gate finali:

- `npm run build` → exit 0
- `npx tsc --noEmit -p tsconfig.json` → exit 0
- `node dist/content/run-content.js --check` → exit 0, 0 errori, 1 warning (titolo doppio della dungeon di Necrorian, atteso); conteggi lore 405, spells 88, equipmentitems 172, lootitems 101, enemies 150, pets 13, quests 581
- `npx jest src/content --selectProjects unit` → 36 suite, 448 test verdi; `npx jest src/quests/outcomes --selectProjects unit` → 20 suite, 355 test verdi (resolver toccato da LO-12)
- int-spec (`--selectProjects integration --runInBand`, una chiamata ciascuna): `run-content.cli` 8/8, `content-sync` 19/19, `content-prune` 11/11, `export-content` 5/5, `content-wire` 4/4, `db-checks` 4/4, `fixes` 10/10, `delete-quests.fix` 15/15, `quest-combat` 9/9
- `git diff --exit-code src/schema.gql` → pulito; diff SDL contro `origin/develop` = `-  unlocked: Boolean!` / `+  description: String`
- `git status --short` vuoto, `pgrep -fl jest` vuoto
- Quest generate: nessuna modifica (ME-02 e LO-12 toccano il generatore: `content:generate-quests` rieseguito, `git status content/` vuoto); `content/config.yaml` non toccato.

Da sapere per il `--verify` sul database reale e per i prossimi ritocchi: i controlli nuovi sono tutti offline e il contenuto reale li passa; nessuna ricarica serve per queste correzioni (nessun dato mappato cambia). Un `--export` di bootstrap senza quest ora fallisce `content:check` per la copertura D-17 finché non si esegue `content:generate-quests` (che invece accetta l'albero).

## Area app (`REVIEW-app.md`) — fixer 3

Base `fc71fbb`, 7 finding con ruling FIX (LO-03 già chiuso dal fixer 2), 2 DEFER e 1 ASK documentati. Un commit per finding, nell'ordine ME-02, LO-05, LO-07, LO-04, LO-06, LO-08, LO-01, poi le note. TDD: test rosso prima di ogni correzione; il caso «errori dell'albero appena scritto» di ME-02 è stato scritto dopo la correzione (rosso sul codice precedente, che restituiva sempre `errors: []`).

| Finding | Esito | Commit |
| --- | --- | --- |
| ME-01 sorteggi su un flusso unico | documented (DEFER → Phase 13): handoff §11 + README «rigenerare dopo aver aggiunto animali/città/rarità sposta hunt e dungeon: pianificare un `--prune quests`» | `5e2f9b8` |
| ME-02 `generate-quests` si blocca sui file che deve riscrivere | fixed: `checkGenerationInput` su un albero senza le voci dei `GENERATED_QUEST_FILES` (`withoutGeneratedQuests`); le voci esistenti servono solo al riuso degli id; dopo la scrittura `checkContent` sull'albero completo, i suoi errori finiscono nel report (exit 1); casi in `run-generate-quests.spec.ts`: hunt con nemico tolto dal catalogo → rigenerata, exit 0; heal a mano sullo stesso marker → errore riportato dopo la scrittura | `6205ed7` |
| ME-03 populate a un solo livello | documented (DEFER → Phase 16): handoff §1 «profondità supportata di `relatedLore` = 1, non selezionare `relatedLore { relatedLore }` né `infos { enemy { relatedLore } }`» | `5e2f9b8` |
| LO-01 «ad» eufonica | fixed: `towardsCity(name)` in `src/content/generation/italian.ts` («ad» solo davanti ad a/à/á), usato dai titoli `job`, `guard`, `crime`, `study`, `spellStudy` e dalle descrizioni; `italian.spec.ts` + titoli in `quest-descriptions.spec.ts`; quest rigenerate: 581 prima e dopo, stessi `id`, file, `city`, `infos.type`, `infos.markerLocation`, `infos.enemy`, `infos.relatedLore`, `requirements`, `prizes` (script di confronto in sola lettura); 23 quest cambiate: 18 titoli («a A…» → «ad A…») e 5 descrizioni («ad U…/ad I…» → «a U…/a I…») | `31cd1ee` |
| LO-02 gruppi di una sola città senza hunt | documented (ASK): handoff §11, Ko Shaeras, Talmvere e Ferrion senza hunt in attesa della decisione dell'utente | `5e2f9b8` |
| LO-03 Valantar/Liberia per nome | verificato: chiuso dal fixer 2 (`a6b49de`): `SPELL_DRAW_CITY_TYPE = CityType.valanCapital`, `COLLEGE_CITY` assente | — |
| LO-04 `skipped` elenca città non saltate | fixed: `citiesWithoutLore` in `GeneratorResult` e nel report di `generate-quests`; `skipped` solo per le voci non generate (dungeon senza mostro); `CITY_WITHOUT_LORE` rimossa | `9b6738c` |
| LO-05 test di Talmvere con l'id di Ferrion | fixed: `n: 15`; `addedCity` lancia se l'id della città esiste già (`test/content/generator-world.fixture.spec.ts`) | `1cbf0f6` |
| LO-06 la aid clonata perde `description` | fixed: `description` in `AidSourceQuest`/`AidQuestDraft`, copiata da `buildAidQuest` (`null` se assente); casi in `aid-quest.spec.ts` | `e758a0a` |
| LO-07 file generato vuoto non riscritto | fixed: ogni file generato esistente che la corsa non riempie viene riscritto con la sola intestazione e compare nel report con 0 voci; caso in `run-generate-quests.spec.ts` | `3a7bcec` |
| LO-08 pulizia | fixed: `dungeonHeroCityTypes: [necrorianCity]` in `content/config.yaml` (fixture byte-identica, `cmp` ok), lista di `CityType` validata e obbligatoria (`validateEnumList`, condivisa con `dungeonHeroZones`), costante `HERO_DUNGEON_CITY_TYPES` rimossa; import uniti; commento del ripiego tolto; import `src/lore/related-lore`; `KINGDOM_PREFIXES` non più esportato; quest rigenerate identiche (`git diff --stat content/quests` vuoto); copia del config nel §6 dell'handoff aggiornata | `c2651a4` |

Gate finali:

- `npm run build` → exit 0
- `npx tsc --noEmit -p tsconfig.json` → exit 0
- `node dist/content/run-content.js --check` → exit 0, 0 errori, 1 warning (titolo doppio della dungeon di Necrorian, atteso); quests 581
- `npx jest src/content --selectProjects unit` → 37 suite, 463 test verdi; `npx jest test/content src/quests/outcomes/aid src/lore --selectProjects unit` → 3 suite, 26 test verdi
- int-spec (`--selectProjects integration --runInBand`, una chiamata ciascuna): `lore-related` 4/4, `content-wire` 4/4, `run-content.cli` 8/8, `content-sync` 19/19; per LO-06 `quest-combat` + `boss-resolution` + `aid-rescue` 37/37
- `git diff --exit-code src/schema.gql` → pulito; diff SDL contro `origin/develop` = `-  unlocked: Boolean!` / `+  description: String`; nessun `process.env.` nuovo in `src/`
- `git status --short` vuoto, `pgrep -fl jest` vuoto

Da sapere per la ricarica: LO-01 cambia `infos.title` di 18 quest e `infos.description` di 5 (stessi id): un `--verify` sul database reale le segnala come differenze finché non si esegue `--apply`. LO-06 vale solo per le aid create da ora in poi. Il corpo del commit `31cd1ee` contiene «regenerated with», che il controllo `grep -ciE "co-authored-by|generated with"` conta come 1: non è un trailer (nessun `Co-Authored-By`/`Generated with` nel messaggio), e la storia non è stata riscritta (niente amend).
