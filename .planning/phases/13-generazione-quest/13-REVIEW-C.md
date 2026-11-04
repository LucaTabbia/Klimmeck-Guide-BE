---
phase: 13-generazione-quest
group: C
reviewed: 2026-11-04T12:00:00Z
depth: standard
files_reviewed: 24
files_reviewed_list:
  - src/app.module.ts
  - src/config/env.validation.ts
  - src/config/sweep-interval.ts
  - src/migrations/mixed-refs/mixed-ref-paths.ts
  - src/models/enemy.model.ts
  - src/models/enums/accessory-use-type.enum.ts
  - src/models/equipment-item.model.ts
  - src/models/quest-result/quest-result.model.ts
  - src/models/quest/generate-quests-result.model.ts
  - src/models/quest/quest-enemy.model.ts
  - src/models/quest/quest-infos.model.ts
  - src/models/quest/quest-prizes.model.ts
  - src/models/quest/quest.model.ts
  - src/quests/maintenance/dungeon-stages.migrator.ts
  - src/quests/maintenance/dungeon-stages.ts
  - src/quests/maintenance/enemy-legendary.migrator.ts
  - src/quests/maintenance/jewel-accessory.migrator.ts
  - src/quests/maintenance/quest-enemies.migration.ts
  - src/quests/maintenance/quest-enemies.migrator.ts
  - src/quests/maintenance/quest-maintenance.boot.ts
  - src/quests/maintenance/quest-maintenance.module.ts
  - src/quests/quests.module.ts
  - src/schema.gql
  - test/fixtures/quest.fixture.ts
findings:
  critical: 0
  warning: 1
  info: 3
  total: 4
status: issues_found
---

# Phase 13: Code Review Report, gruppo C

## Summary

Modelli, SDL, config, modulo di manutenzione e migratori sono solidi e aderenti a CONTEXT e REPO-RULES. Verificato per lettura: ref `{ type: ObjectId, ref }` ovunque (nessun `Mixed`), `QuestEnemy` con `_id: false` e `quantity` min 1, `generated` e `rescue` senza `@Field`, indice unico parziale `quest_generated_open_marker` con `generated: true` e `concludedAt: null`, `Enemy.legendary` default false con lettori lean fail-closed (`legendary: false` nel filtro), `accessoryUseTypes` con `default: undefined`, `pet` con `default: null`, `QuestInfosInput` senza `enemies`, `EquipmentItemInput` non esposto nello SDL generato, SDL additivo salvo le due righe `enemy` sostituite da `enemies`, `mixed-ref-paths` a 34 con `infos.enemies.enemy`, `parseSweepIntervalMs` senza eco del valore, nessun `process.env.` nei file del gruppo, `QuestMaintenanceModule` prima di `QuestGenerationModule` in `app.module.ts` e nessun altro importatore (isolamento dei one-off confermato con grep), passi del boot nell'ordine voluto con try/catch e log di nome/codice. Tabelle: 22 id leggendari e 42 gioielli (nessun duplicato). `QuestEnemiesMigrator` e `EnemyLegendaryMigrator` e `JewelAccessoryMigrator` sono idempotenti (filtro campo assente, `$nin: [true, false]`, `$exists: false`). Le scelte dell'executor sul `DungeonStagesMigrator` (legend saltate con WARN, bande solo dal pool di zona, seme per id, filtro `'infos.enemies.1'`) sono accettabili. Un solo punto di idempotenza non coperto (warning) e tre rilievi minori.

## Critical

Nessuno.

## Warning

### C-WR-01: `DungeonStagesMigrator` non è idempotente su una dungeon aperta senza nemici

**File:** `src/quests/maintenance/dungeon-stages.migrator.ts:102-129` (con `src/quests/maintenance/dungeon-stages.ts:121-135`)
**Issue:** il filtro di ammissione è `validQuestEnemiesOf(...).length <= 1`, ma il guard di scrittura è `stages.length <= current.length` → skip. Per una dungeon aperta con 0 voci valide (campo vuoto, voci scartate da `validQuestEnemiesOf`, o legacy `enemy` nullo) il conteggio delle tappe aggiunte è 1–3 (`ADDED_STAGES`) e, con `count = 1` (o con la banda di briganti rookie/adventurer che da sola copre il conteggio), il risultato è UNA sola tappa: `stages.length (1) > current.length (0)`, quindi scrive `infos.enemies` con 1 voce. Al boot successivo quella dungeon ha di nuovo ≤ 1 voce, passa il filtro, `current` ora è 1 e il seme per id è lo stesso: ne aggiunge altre 1–3. La seconda corsa NON è 0, contro il requisito del brief (idempotenza, seconda corsa 0) e contro il «mai ritoccare ciò che è già a tappe» di T-13-18.
**Why it matters:** finché il migratore resta nel repo (uscita prevista dopo il primo boot reale) ogni riavvio può far crescere una dungeon senza nemici; il risultato non è deterministico rispetto al DB di partenza e viola la promessa di idempotenza dichiarata nell'handoff. Raggiungibile solo con dungeon a 0 nemici, quindi probabilità bassa sui 40 fissi (che hanno un nemico), ma non provata da alcun test.
**Suggested fix:** una dungeon arricchita deve uscire con ≥ 2 tappe, altrimenti non si scrive. Spec RED prima (`dungeon-stages.migrator.int-spec.ts`, o unit su `dungeonStagesOf` + guard): dungeon aperta con `infos.enemies: []`, seme/mock che dà `count = 1`; asserire che dopo `migrate()` due corse consecutive producano lo stesso `infos.enemies` e la seconda riporti `enriched: 0`. Poi in `enrich`:
```ts
const MIN_STAGES = 2;
if (stages.length < MIN_STAGES || stages.length <= current.length) return false;
```
(alternativa: ammettere solo dungeon con esattamente 1 voce, `=== 1`, lasciando le vuote alla cura a DB).

## Info

### C-IN-01: l'indice unico di guardia è costruito da `SweepIndexVerifier` fire-and-forget con messaggio d'errore fuorviante

**File:** `src/models/quest/quest.model.ts:82-91` (costruzione in `src/mongo/sweep-index.verifier.ts:34-52`, fuori gruppo)
**Issue:** `quest_generated_open_marker` è la guardia di concorrenza di D-28 (secondo insert → E11000), ma viene creato solo dal verifier degli indici di sweep, avviato con `void this.verifyAll()`, e un fallimento (per esempio doppioni preesistenti) viene loggato come «lo sweep resta corretto ma più lento». Per questo indice il fallimento non è un semplice rallentamento: la unicità non c'è e il log lo nasconde. Inoltre la prima corsa del generatore al boot può partire prima che `createIndexes` abbia finito.
**Why it matters:** il rischio reale è basso (single-flight in-process, il generatore controlla comunque le aperte), ma un errore di build dell'indice passerebbe come un warning di performance.
**Suggested fix:** nel verifier distinguere il messaggio per modello/indice (per `Quest`: «guardia di unicità delle generate non costruita»), con una spec che fa fallire `createIndexes` e asserisce il testo; opzionale attendere `verifyAll()` prima della richiesta al generatore.

### C-IN-02: `JewelAccessoryMigrator` segnala solo gli id assenti, non quelli presenti con `equipType` diverso da ring/necklace

**File:** `src/quests/maintenance/jewel-accessory.migrator.ts:96-118`
**Issue:** `missingJewels` cerca per `_id` senza filtro su `equipType`, mentre la scrittura richiede `equipType: { $in: [ring, necklace] }`. Un id della tabella presente a DB ma con altro `equipType` (cura a mano) viene silenziosamente non scritto e non compare nel WARN.
**Why it matters:** il gioiello resta senza `accessoryUseTypes` senza alcun segnale al boot (il brief chiede il WARN con gli id mancanti).
**Suggested fix:** in `missingJewels` aggiungere `equipType: { $in: JEWEL_EQUIP_TYPES }` al filtro, con una spec int che inserisce un item della tabella con `equipType` non gioiello e attende l'id nel WARN.

### C-IN-03: `DungeonStagesMigrator` ammette anche dungeon già avviate

**File:** `src/quests/maintenance/dungeon-stages.migrator.ts:157-165` e `:129-141`
**Issue:** il filtro è `concludedAt: null` ma non `startedAt: null`: una dungeon con party già partito (risoluzione in corso) potrebbe vedersi allungare la lista tappe a metà esplorazione se il boot capita in quella finestra.
**Why it matters:** scenario raro (boot con una dungeon in corso), ma cambia le tappe sotto un party; il prezzo del guard è una riga.
**Suggested fix:** aggiungere `startedAt: null` sia alla `find` di `openDungeons` sia al filtro dell'`updateOne`, con una spec int che verifica che una dungeon con `startedAt` valorizzato resti intatta.

---

_Reviewed: 2026-11-04T12:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
