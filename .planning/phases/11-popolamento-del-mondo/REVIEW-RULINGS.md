# Ruling sui finding della code review — Phase 11

Legenda: **FIX** = correggere ora (fixer dell'area, TDD, un commit per finding); **DEFER** = rinviato con nota nell'handoff `BACKEND-NOTES.md` §11; **ASK** = decisione di prodotto da chiedere all'utente. I file generati `content/quests/*.yaml` si toccano solo rigenerando (`npm run content:generate-quests`) e verificando che gli id non cambino.

## Area sync (`REVIEW-sync.md`) — fixer 1

| Finding | Ruling | Indicazioni |
| --- | --- | --- |
| HI-01 `--prune` senza protezioni | **FIX** | in `pruneCollection`: `checkDatabase(db, tree, 'verify')` e rifiuto se ci sono errori; `divergencesOf` e rifiuto se non vuoto; rifiuto se gli id noti della collezione sono zero o se gli orfani superano gli id noti; ogni rifiuto in `errors` (exit 1). Casi nell'int-spec di `content-prune`. |
| ME-01 `--export` scrive tutte le quest in `deleteQuests` | **FIX** | togliere del tutto la generazione di `fixes/delete-test-quests.yaml` dall'export (l'export una tantum è fatto); aggiornare l'int-spec; README: `--export <dir>` serve a rinfrescare `world/cities.yaml` (copiare SOLO quel file) e al bootstrap iniziale. |
| ME-02 id di `deleteQuests` presente nei file quest | **FIX** | controllo offline in `check-content` (errore con file, riga, chiave della fix) + caso nello spec delle regole. |
| ME-03 snapshot senza `markerLocation`/appartenenza dei POI | **FIX** | in `db-checks`: confronto di `City.markerLocation`, dell'insieme `City.pointsOfInterest` (ordine indifferente) e di `PointOfInterest.city`; una differenza è un errore `snapshot non allineato` (rinfrescare lo snapshot con `--export`). Test nello spec/int-spec di `db-checks`. Lo snapshot reale deve restare allineato: l'orchestratore lo verifica con `--verify` dopo i fix. |
| ME-04 prune del catalogo senza guardie sui personaggi | **FIX** | restringere `PRUNABLE_COLLECTIONS` a `quests` e `lore` finché non esistono le guardie (exit 2 per le altre, messaggio chiaro); README e runbook aggiornati; nota nell'handoff §11 per la Phase 12. |
| LO-01 `PENDING_LANES` duplica `QUEST_LANES` | **FIX** | importare `QUEST_LANES`/`QuestLane`. |
| LO-02 `assertNoUndefined` solo nei test | **FIX** | chiamarla in `mapContentTree` su ogni documento. |
| LO-03 guardie ridondanti città→lore | **FIX** | togliere `firstLorePerCity`; lasciare `missing` con un commento di difesa in profondità. |
| LO-04 report = piano, non esito di `bulkWrite` | **FIX** | `bulkWriteOf` restituisce i conteggi; in apply, warning se differiscono dal piano. |
| LO-05 fix bloccate per sempre dopo un cambio legittimo | **FIX (doc)** | README e runbook: le fix si ritirano dai file dopo la prima `done` sull'unico DB. |
| LO-06 `FIX_COLLECTIONS` senza tipo, `quests.fixes` gonfiato | **FIX** | `Partial<Record<FixKind, ContentCollection>>`; `quests.fixes` = solo `deleted.length`. |
| LO-07 TOCTOU in `deleteQuests` | **FIX** | ripetere `laneBlockers` subito prima di ogni `deleteOne` (se bloccata ora → `blocked`); runbook: `--apply`/`--prune` a server fermo. |

## Area core (`REVIEW-core.md`) — fixer 2

| Finding | Ruling | Indicazioni |
| --- | --- | --- |
| ME-01 `images.yaml` non-mappa ignorato; `.yml` saltati | **FIX** | issue «il file deve essere una mappa lore/enemies/pets»; warning per file `.yml`/altre estensioni nelle cartelle delle collezioni; casi in `content-tree.spec.ts`. |
| ME-02 README promette controlli assenti | **FIX (a)** | in `questRuleIssues`: `infos.description` obbligatoria sulle quest fisse; rarità di ogni `recommendedLoot` ≤ `dungeonLootRarity[minTitle]`; test in `check-quest-rules.spec.ts`; il contenuto reale deve restare a `--check` exit 0 (se una regola fallisse sui file reali, FERMARSI e riportarlo invece di toccare i file). |
| ME-03 Valantar per nome, costante duplicata | **FIX** | una sola costante `SPELL_DRAW_CITY_TYPE = CityType.valanCapital` condivisa da check e generatore (confronto su `city.type`); errore se la study di Valantar non ha `spellDraw`; README riga 153. Le quest generate non devono cambiare (Valantar è l'unica `valanCapital`). Chiude anche `REVIEW-app.md` LO-03 (`COLLEGE_CITY` è un no-op: rimuoverla). |
| LO-01 eccezioni offline → exit 1 senza report | **FIX** | `try/catch` intorno a `runOffline` → `errorReportOf` + `CONTENT_EXIT.failure`; `.catch` sull'entry point. |
| LO-02 config accetta `legend` | **FIX** | `oneOf(RANKED_TIERS)` e tipo `RankedTier` per `minTitle.*` e `dungeonTierByCitySize`. |
| LO-03 chiavi sconosciute nelle sezioni del config | **FIX** | segnalare le chiavi fuori elenco in ogni sezione; `randomLootQuantity` ammessa solo su `prizes.dungeon`. `test/content-fixtures/config.yaml` resta byte-identico a `content/config.yaml`. |
| LO-04 `timeToComplete` senza minimo/tetto | **FIX** | override `IntBetween(60_000)`; tetto su `timeToCompleteHours` tale che `hours × 3_600_000 ≤ MAX_GRAPHQL_INT`. |
| LO-05 `Lore.image`/`imagePath` fuori dal vincolo Cloudinary | **FIX (parziale)** | `LoreEntry.image`: se non null deve rispettare `CLOUDINARY_URL` (i 12 valori reali lo rispettano); `imagePath` di nemici e pet: `assets/images/<nome>.png`, `pets/<nome>.png` oppure URL Cloudinary (verificare sui file reali prima di stringere); niente cloud name nella regex. |
| LO-06 chiave di dedup senza `entryId` | **FIX** | includere `entryId`. |
| LO-07 `prizes.spell` fisso ammesso sulle study | **FIX** | rifiutare `prizes.spell` su ogni quest fissa (D-17/D-31 rivisti); README riga 154. |
| LO-08 copertura D-17 non controllata | **FIX** | errore per ogni città dello snapshot non Necrorian senza almeno una `heal` e un `job` nei file. |
| LO-09 `key` delle fix non unica | **FIX** | controllo di unicità in `duplicateIssues`. |
| LO-10 id dei file contro id dello snapshot, POI doppi | **FIX** | `duplicateIssues` include `index.cities` e i POI; un POI in due città è un errore. |
| LO-11 `locations` con `dungeon`; pet `xp ≤ maxXp` | **FIX** | escludere `PoiType.dungeon` da `locations`; `NotAbove('maxXp')` sui pet. |
| LO-12 formula duplicata, HP cablati, funzioni morte, `isRecord` ×5 | **FIX** | esportare dal resolver di combattimento una funzione pura `winChanceOf(partyPower, lifePoints)` e riusarla in `catalog-stats`; `ENCOUNTERS` legge `lifePoints` dalle voci dei nemici per id; `catalogStats` usa `marchMinutesOf`; il generatore usa `dungeonLootRarity` (o si rimuove); un solo `isRecord` condiviso (`src/content/loading/records.ts` o simile). `--stats` offline deve dare gli stessi numeri del report `11-12-stats.json` per gli scontri esistenti (annotare eventuali differenze). |
| LO-13 import relativi; int-spec senza `stderr` | **FIX** | import `src/...` in `run-content.ts` e nell'int-spec; l'int-spec cattura anche `stderr` e verifica l'assenza dell'URI su entrambi; niente controllo `mtime`. |

## Area app (`REVIEW-app.md`) — fixer 3

| Finding | Ruling | Indicazioni |
| --- | --- | --- |
| ME-01 sorteggi su un flusso unico: una modifica sposta tutto | **DEFER** | correggerlo ora ri-sorteggerebbe il mondo appena rivisto dall'utente e caricato; va fatto in Phase 13 (generazione quest) con un piano di `--prune quests` esplicito. Nota nell'handoff §11 + README: «rigenerare dopo aver aggiunto animali/città/rarità cambia hunt e dungeon: pianificare un prune». |
| ME-02 `generate-quests` si blocca sui file che deve riscrivere | **FIX** | validare l'albero senza le voci dei `GENERATED_QUEST_FILES` prima di generare; validare l'albero completo dopo la scrittura; test in `run-generate-quests.spec.ts`. |
| ME-03 populate a un solo livello | **DEFER** | latente (il FE seleziona un livello); risolutore di campo in Phase 16 (lore per personaggio). Nota nell'handoff §1 e §11: «profondità supportata di `relatedLore` = 1, non selezionare `relatedLore { relatedLore }` né `infos.enemy.relatedLore`». |
| LO-01 «ad» eufonica solo nelle descrizioni e troppo larga | **FIX** | helper con nome parlante (es. `towardsCity(name)`) con `ad` SOLO davanti ad «a»/«A» (norma Crusca), usato da titoli e descrizioni; test esteso ai titoli; rigenerare le quest: cambiano solo `title`/`description`, mai id, città, marker, nemici (verificare con uno script di confronto e annotarlo nel commit). |
| LO-02 gruppi di una sola città senza hunt (Ko Shaeras, Talmvere, Ferrion) | **ASK** | decisione di prodotto dell'utente; fino ad allora nota nell'handoff §11. |
| LO-03 Valantar/Liberia per nome | **FIX** | insieme a core ME-03 (fixer 2); il fixer 3 verifica solo che sia fatto. |
| LO-04 `skipped` elenca città non saltate | **FIX** | campo `citiesWithoutLore` nel report; `skipped` solo per le dungeon senza mostro. |
| LO-05 test di Talmvere con l'id di Ferrion | **FIX** | `n: 15`; `addedCity` lancia se l'id esiste. |
| LO-06 la aid clonata perde `description` | **FIX** | copiare `description` in `buildAidQuest` (+ `AidSourceQuest`/`AidQuestDraft`), test unit. |
| LO-07 file generato rimasto vuoto non riscritto | **FIX** | scrivere il file con la sola intestazione per ogni path generato assente dai gruppi; caso in `run-generate-quests.spec.ts`. |
| LO-08 pulizia | **FIX** | unire gli import; togliere il commento del ripiego; import `src/lore/related-lore`; `dungeonHeroCityTypes` in `config.yaml` (fixture byte-identica) al posto della costante; togliere l'`export` di `KINGDOM_PREFIXES`. |
