---
phase: 11-popolamento-del-mondo
area: sync (mapping, fixes, sync, export)
reviewed: 2026-11-02T13:35:05Z
depth: standard
base: origin/develop
files_reviewed: 34
findings:
  critical: 0
  high: 1
  medium: 4
  low: 7
  total: 12
status: issues_found
---

# Phase 11 — Code review, area sync

**Revisione:** 2026-11-02 · sola lettura (nessuna modifica, nessun jest, nessun DB) · diff contro `origin/develop` (tutti i 34 file sono nuovi)

## Sintesi

I mapper producono documenti canonici: ho confrontato una per una le chiavi di `mapLore`, `mapSpell`, `mapEquipment`, `mapLoot`, `mapPet`, `mapEnemy` (copia embedded della magia compresa) e `mapQuest` (`infos`, `requirements`, `prizes`, `AssetQuantity` con `itemType` prima di `item`) con l'ordine dei `@Prop` dei modelli (`AssetItem` → `EquipmentItem`/`LootItem`, `Coins`, `Damages`, `QuestInfos`, `QuestRequirements`, `QuestPrizes`) e coincidono tutte. I sottoschemi delle quest sono `_id: false`, quindi Mongoose non aggiunge chiavi che il diff vedrebbe. `$setOnInsert` compare solo sulle quest e non condivide percorsi con `$set`. `promoteValues: false` fa vedere al diff gli stessi tipi numerici che vede il server.

**Nessuna scrittura raggiungibile in `--dry-run` o `--verify`.** `runContent` scrive solo con `mode === 'apply'` e senza errori; ogni fix (`normalizePoiTypes`, `renameCity`, `unsetLoreUnlocked`, `deleteQuests`) scrive solo con `mode === 'apply'`, e con un errore `fixModeOf` declassa l'apply a dry-run. `--export` legge soltanto e rifiuta una cartella non vuota. Le guardie delle corsie di `deleteQuests` (Pitfall 2) coprono le tre corsie, `awaitingAid.quest|aidQuest` e i ref stringa legacy, e la quest si cancella per ultima.

I difetti veri stanno ai margini distruttivi: `--prune` non ha le protezioni contro la cancellazione di massa che l'apply invece ha (snapshot, divergenza), l'export rigenera una lista di cancellazione che conterrebbe tutte le quest, e non c'è un controllo che impedisca a una fix `deleteQuests` di colpire una quest dei file.

## HIGH

### HI-01: `--prune` può svuotare una collezione intera: niente controllo dello snapshot, della divergenza o di un perimetro vuoto

**File:** `src/content/sync/content-prune.ts:75-102` (e `:38-49`)
**Cosa non va:** `pruneCollection` esegue solo `checkContent(tree)` (controlli offline) e poi cancella tutti i documenti il cui `_id` non è nei file. Mancano le due protezioni che l'apply ha in `runContent`:
- `checkDatabase` (`db-checks.ts:240`), che in un ambiente con id diversi blocca subito l'apply perché le città e i POI dello snapshot mancano;
- `probableIdDivergence` (`orphans.ts:96`), il segnale del Pitfall 7, che qui non viene neanche calcolato.

Inoltre nessun controllo rifiuta un insieme di id noti vuoto o quasi vuoto.
**Perché conta (scenari concreti):**
1. Runbook, «eventuale ambiente separato» (D-26): su un dump di produzione con `_id` di catalogo diversi, `--prune lore` (o `spells`, `equipmentitems`…) trova orfani tutti i documenti e li cancella tutti. L'apply sullo stesso DB sarebbe stato fermato dagli errori dello snapshot.
2. `--prune lore --content-dir <cartella sbagliata o parziale>`: se la cartella ha un `config.yaml` valido ma nessun file `lore/`, `checkContent` non segnala errori, `knownIdsOf` è vuoto e `$nin: []` corrisponde a tutta la collezione.

Il ripristino passa solo dal `mongodump`.
**Correzione suggerita:** in `pruneCollection`, prima di cancellare:
- eseguire `checkDatabase(db, tree, 'verify')` e rifiutare il prune se ci sono errori;
- calcolare `divergencesOf(indexContent(tree), collection, orphans)` e rifiutare il prune se la lista non è vuota;
- rifiutare se `knownIdsOf(tree, collection)` è vuoto, oppure se gli orfani superano una soglia (es. più degli id noti) senza un flag esplicito di conferma.

Ogni rifiuto va riportato in `errors`, così l'uscita resta 1. Aggiungere i casi all'int-spec di `content-prune`.

## MEDIUM

### ME-01: `--export` mette tutte le quest del DB nella lista `deleteQuests`

**File:** `src/content/export/export-content.ts:257-265` (proiezione `:40-45`)
**Cosa non va:** `deleteQuestsFile` scrive in `fixes/delete-test-quests.yaml` gli id di **tutte** le quest presenti, con la stessa `key` fissa `delete-talmvere-test-quests`. Era corretto per l'export una tantum, quando esistevano solo le 16 quest di prova. Oggi però `--export` è anche il modo documentato per rigenerare `world/cities.yaml` (README: «snapshot di sola lettura… scritto da `--export`»). La proiezione non legge `concludedAt` né `rescue`, quindi non può distinguere niente. L'int-spec lo conferma: dopo il seed, la lista contiene le due quest fisse dei file (`export-content.int-spec.ts:106-112`).
**Perché conta:** quando la Phase 12 cambia città o POI, chi riesporta per aggiornare lo snapshot e copia la cartella (o solo `fixes/`) dentro `content/` si ritrova una fix che cancella le ~centinaia di quest fisse e anche le story/worldMission/aid e le concluse. Le guardie del Pitfall 2 proteggono solo le corsie occupate. Le quest generate della Phase 13 sarebbero cancellate anche loro: D-05 dice che non sono mai orfane, ma questa lista le prende per id. Si combina con ME-02.
**Correzione suggerita:** la lista di cancellazione non va più generata. Basta toglierla dall'export, oppure scriverla solo se richiesta con un'opzione esplicita, in un file con un nome che non collida e limitandola alle quest fuori dai file con tipo fisso e `concludedAt: null`. Va anche aggiunto un percorso «solo snapshot» (`--export-world <dir>`), così si aggiorna `world/cities.yaml` senza toccare il catalogo né le fix.

### ME-02: una fix `deleteQuests` può colpire una quest presente nei file, e l'apply non converge più

**File:** `src/content/fixes/delete-quests.fix.ts:155-168`, `src/content/sync/content-sync.ts:253-262`
**Cosa non va:** `runContent` prima esegue l'upsert delle quest dei file, poi lancia le fix. Nessun controllo, né in `checkContent` né qui, verifica che gli `ids` di una fix `deleteQuests` siano assenti da `quests/*.yaml`.
**Perché conta:** se un id è in entrambi i posti (per esempio dopo ME-01, o per un copia-incolla), ogni `--apply` inserisce la quest e subito la cancella insieme alle `PendingQuest` libere che la riferiscono. Il report dice `inserted: 1` e `applied` a ogni corsa, `--verify` trova sempre deriva e il gate «seconda apply con `modified: 0`» non si raggiunge mai. In un ambiente vivo, nella finestra fra le due scritture un giocatore può vedere la quest e accettarla.
**Correzione suggerita:** aggiungere un controllo offline in `check-content`: un id di `deleteQuests` presente fra le voci di `quests` è un errore, con file, riga e chiave della fix. Coprirlo con un caso nello spec delle regole.

### ME-03: il controllo dello snapshot ignora `markerLocation` e l'appartenenza dei POI alla città

**File:** `src/content/sync/db-checks.ts:94-155`
**Cosa non va:** `cityCheck` confronta solo `name` e `type`; `poiCheck` confronta solo l'esistenza e `type`. Non vengono verificati `City.markerLocation`, `City.pointsOfInterest` né `PointOfInterest.city`, cioè proprio i dati su cui si basano le regole offline delle quest («marker delle quest di servizio = marker della città», «hunt non sul marker», «il `markerLocation` è un POI della **sua** città»).
**Perché conta:** se a DB si sposta il marker di una città o si riassegna un POI a un'altra città (lavoro previsto nella Phase 12), lo snapshot resta valido per `--verify`. Le quest di servizio finiscono su un POI che non è più il marker (la mappa FE nasconde solo le quest sul marker, D-21), oppure una hunt finisce su un POI di un'altra città. Il tutto senza nemmeno un warning.
**Correzione suggerita:** in `cityCheck` aggiungere il confronto `sameBson` di `markerLocation` (ObjectId) e del set di `pointsOfInterest`, e in `poiCheck` quello di `city`. Le differenze diventano warning `snapshot non allineato`, oppure errori quando toccano un marker usato da una quest dei file.

### ME-04: il prune del catalogo non controlla i riferimenti dei personaggi

**File:** `src/content/sync/content-prune.ts:38-49`
**Cosa non va:** per `quests` il prune passa dalle guardie di `deleteQuests`, ma per `equipmentitems`, `lootitems`, `spells`, `pets` ed `enemies` esegue un `deleteMany` secco. Non controlla:
- `characters.assets.ownedEquipments`/`ownedLoot` (`AssetQuantity`), gli slot di `assets.equipment`, `activeSpells.spell`, `assets.pet` e `status.spells`;
- `infos.enemy` / `recommendedLoot` delle quest aid/story/concluse.
**Perché conta:** un oggetto aggiunto a mano con mongosh e poi posseduto da un personaggio sparisce dall'inventario senza traccia. Le liste popolate scartano gli orfani, ma i campi singoli come `pet` o gli slot equipaggiati restano ref pendenti verso documenti inesistenti, e la perdita non compare in nessun report.
**Correzione suggerita:** come per le quest, prima di cancellare contare i riferimenti per collezione. Gli id ancora referenziati vanno in `blocked` (con personaggio e campo) e non si cancellano. In alternativa, ammettere `--prune` solo per `quests` e `lore` finché le guardie non esistono.

## LOW

### LO-01: `PENDING_LANES` duplica `QUEST_LANES`

**File:** `src/content/fixes/delete-quests.fix.ts:6-10`
**Cosa non va:** l'elenco delle corsie è ricopiato come letterali invece di importare `QUEST_LANES` / `QuestLane` da `src/quests/acceptance/quest-lanes.ts`, che è anche la fonte di `CHARACTER_QUESTS_POPULATE`.
**Perché conta:** una quarta corsia aggiunta in futuro verrebbe popolata dalla query `character`, ma la guardia del Pitfall 2 non la vedrebbe: la quest verrebbe cancellata mentre è occupata.
**Correzione suggerita:** `const PENDING_LANES = QUEST_LANES;` e `QuestLane` come tipo di `lane` in `fix-report.ts`.

### LO-02: `assertNoUndefined` esiste solo nei test

**File:** `src/content/mapping/canonical.ts:40-54`
**Cosa non va:** la funzione è esportata dal codice di produzione ma la usano solo gli spec. `mapContentTree` non la chiama, quindi un `undefined` che arrivasse da un cast `as XxxEntry` su un campo opzionale non sarebbe intercettato prima del `$set` (RESEARCH §Pattern 3, regola 2).
**Correzione suggerita:** chiamarla una volta su ogni `MappedDocument` dentro `mapContentTree`, così diventa una garanzia a runtime, oppure spostarla in `test/`.

### LO-03: guardie ridondanti nel collegamento città→lore

**File:** `src/content/sync/content-sync.ts:105-116`, `:139-140`
**Cosa non va:** `firstLorePerCity` deduplica le lore di una stessa città, ma `checkContent` dà già errore se due lore `city` puntano alla stessa città, quindi il filtro non scatta mai. Allo stesso modo `missing` in `planCityLore` è irraggiungibile: una città dello snapshot assente dal DB è già un errore di `checkDatabase`, e senza errori non si arriva lì con città mancanti. Il commento «come nel generatore delle quest» suggerisce una regola che in realtà non esiste.
**Correzione suggerita:** rimuovere il filtro, oppure lasciarlo come asserzione che lancia un errore. Documentare che `missing` è una difesa in profondità.

### LO-04: in apply il report riporta il piano, non l'esito di `bulkWrite`

**File:** `src/content/sync/content-sync.ts:151-158`, `:195-206`
**Cosa non va:** `inserted`/`modified` vengono dal diff calcolato in anticipo. Il `BulkWriteResult` (`upsertedCount`, `modifiedCount`, `matchedCount`) viene scartato.
**Perché conta:** il gate della fase («seconda apply con `modified: 0`») misura la previsione del client, non il server. Una scrittura concorrente fra il piano e il `bulkWrite`, o una differenza fra `sameBson` e la semantica del server, non verrebbe mai notata.
**Correzione suggerita:** restituire i conteggi da `bulkWriteOf` e, in apply, segnalare un warning se differiscono dal piano.

### LO-05: le fix restano valutate per sempre e diventano errori permanenti

**File:** `src/content/fixes/poi-and-city-fixes.ts:59`, `:84-90`
**Cosa non va:** `normalizePoiTypes` restituisce `blocked` se il POI non esiste più. `renameCity` restituisce `blocked` se la città ha un nome diverso sia da `from` sia da `to`.
**Perché conta:** una rinomina o una cancellazione legittima fatta in futuro (Phase 12) trasforma una fix storica, già `done`, in `blocked`. `hasErrors` diventa vero, e `--verify`/`--apply` escono con 1 finché qualcuno non toglie la voce dai file.
**Correzione suggerita:** documentare nel README/runbook che le fix vanno ritirate dopo la prima `done` sull'unico DB. In alternativa, distinguere «target sparito dopo `done`» con un warning invece di `blocked`.

### LO-06: conteggio delle fix per collezione impreciso e senza tipo

**File:** `src/content/sync/content-sync.ts:43-46`, `:187-193`
**Cosa non va:** `FIX_COLLECTIONS` è indicizzato da `string` e non da `FixKind`, quindi una fix nuova non viene segnalata come mancante. Inoltre per `deleteQuests` il campo `touched` include anche le `pendingquests` cancellate e i back-link dei POI, e tutto finisce in `collections.quests.fixes`, che così sovrastima le quest toccate.
**Correzione suggerita:** usare `Partial<Record<FixKind, ContentCollection>>` e sommare a `quests.fixes` solo `deleted.length`.

### LO-07: `deleteQuests` pianifica e poi scrive senza ricontrollare (TOCTOU)

**File:** `src/content/fixes/delete-quests.fix.ts:163-168`, `:113-124`
**Cosa non va:** le guardie sono valutate in `planQuest`, poi `applyPlan` cancella senza ricontrollare. Se il server è acceso e un personaggio accetta la quest fra le due fasi, la `PendingQuest` appena creata non è nel piano: la quest viene cancellata e la query `character` si rompe (Pitfall 2).
**Correzione suggerita:** finestra piccola. Basta indicare nel runbook di eseguire `--apply`/`--prune` con il server fermo, oppure ripetere `laneBlockers` subito prima di `deleteOne`.

## Tabella riassuntiva

| Severità | Conteggio |
| --- | --- |
| CRITICAL | 0 |
| HIGH | 1 |
| MEDIUM | 4 |
| LOW | 7 |
| **Totale** | **12** |

## File revisionati

- src/content/export/entry-from-document.spec.ts
- src/content/export/entry-from-document.ts
- src/content/export/export-content.int-spec.ts
- src/content/export/export-content.ts
- src/content/export/yaml-writer.spec.ts
- src/content/export/yaml-writer.ts
- src/content/fixes/delete-quests.fix.int-spec.ts
- src/content/fixes/delete-quests.fix.ts
- src/content/fixes/fix-report.ts
- src/content/fixes/fix-runner.spec.ts
- src/content/fixes/fix-runner.ts
- src/content/fixes/fixes.int-spec.ts
- src/content/fixes/poi-and-city-fixes.ts
- src/content/mapping/canonical.spec.ts
- src/content/mapping/canonical.ts
- src/content/mapping/catalog.mapper.spec.ts
- src/content/mapping/catalog.mapper.ts
- src/content/mapping/enemy.mapper.spec.ts
- src/content/mapping/enemy.mapper.ts
- src/content/mapping/map-content.spec.ts
- src/content/mapping/map-content.ts
- src/content/mapping/quest.mapper.spec.ts
- src/content/mapping/quest.mapper.ts
- src/content/sync/bson-diff.spec.ts
- src/content/sync/bson-diff.ts
- src/content/sync/content-prune.int-spec.ts
- src/content/sync/content-prune.ts
- src/content/sync/content-report.spec.ts
- src/content/sync/content-report.ts
- src/content/sync/content-sync.int-spec.ts
- src/content/sync/content-sync.ts
- src/content/sync/db-checks.ts
- src/content/sync/orphans.ts
- src/content/sync/upsert-ops.ts

Contesto consultato (sola lettura): `11-CONTEXT.md`, `11-REPO-RULES.md`, `11-RESEARCH.md` §Common Pitfalls, `content/README.md`, i modelli in `src/models/**`, `src/quests/acceptance/quest-lanes.ts`, `src/characters/character-quests.populate.ts`, `src/content/run-content.ts` (flusso del prune), `content/fixes/*.yaml`, `content/world/cities.yaml` (voci di Kliever e dei POI corretti).

---

_Reviewer: Claude (gsd-code-reviewer) · depth: standard_
