---
phase: 13-generazione-quest
plan: 17
subsystem: quests (manutenzione: leggendari, dungeon a tappe, corsa del generatore al boot)
tags: [quests, maintenance, migrations, dungeon, enemies, BE-QGEN-03, BE-QGEN-09, D-04, D-08, D-13, D-17]
requires: ["13-16"]
provides:
  - "`EnemyLegendaryMigrator.migrate(): Promise<EnemyLegendaryReport>` e `LEGENDARY_ENEMY_IDS` (22) in src/quests/maintenance/enemy-legendary.migrator.ts — UNA TANTUM"
  - "`dungeonStagesOf(input: DungeonStagesInput): DungeonStage[]` puro, `DUNGEON_STAGES_SEED`, `BANDIT_ID`, `BANDIT_CHIEF_ID`, `ADDED_STAGES` in src/quests/maintenance/dungeon-stages.ts — UNA TANTUM"
  - "`DungeonStagesMigrator.migrate(): Promise<DungeonStagesReport>` in src/quests/maintenance/dungeon-stages.migrator.ts — UNA TANTUM"
  - "`QuestMaintenanceBoot` completo: nemici → leggendari → gioielli → tappe delle dungeon → richiesta di corsa al generatore"
affects: [13-18, 13-19, 13-20]
tech-stack:
  added: []
  patterns:
    - "Migratore una tantum senza hook proprio, chiamato dall'orchestratore del boot; scrive solo dove il dato manca e ribadisce la condizione nel filtro dell'update"
    - "Sorteggio deterministico per id con `keyedChance(DUNGEON_STAGES_SEED, questId)`"
key-files:
  created:
    - src/quests/maintenance/enemy-legendary.migrator.ts
    - src/quests/maintenance/enemy-legendary.migrator.int-spec.ts
    - src/quests/maintenance/dungeon-stages.ts
    - src/quests/maintenance/dungeon-stages.spec.ts
    - src/quests/maintenance/dungeon-stages.migrator.ts
    - src/quests/maintenance/dungeon-stages.migrator.int-spec.ts
  modified:
    - src/quests/maintenance/quest-maintenance.boot.ts
    - src/quests/maintenance/quest-maintenance.boot.spec.ts
    - src/quests/maintenance/quest-maintenance.module.ts
decisions:
  - "La banda di paladin (Capo dei Banditi ×1 + Bandito ×2–7) occupa due voci anche quando il sorteggio delle tappe dà 1: le aggiunte restano comunque fra 1 e 3 (la banda è un'unica apertura, non si spezza)"
  - "La banda si apre solo se il Bandito (e per paladin anche il Capo) è nel pool di ZONA del POI (zona + city, non leggendario), mai dal ripiego `all`; mage, hero e legend non hanno banda"
  - "Le tappe ordinarie usano la forma (a) singolo in fascia o la forma (b) ridotta a un solo tipo più debole con la quantità minima che entra in fascia entro `MAX_PACK_UNITS`; l'ordine delle due forme dipende da un tiro contro `SINGLE_FORM_SHARE`, poi il pool di ripiego; una tappa non componibile si salta"
  - "Le dungeon con `minTitle` legend (o non generabile) si saltano con WARN di solo id; una dungeon che non riceve alcuna tappa conta come `skipped` senza WARN"
  - "Ordine del costruttore di `QuestMaintenanceBoot` = ordine dei passi: `(enemies, legendary, jewels, dungeons, trigger)`"
  - "Il migratore delle dungeon ha un proprio mapper lean → `EnemyCandidate` (il `enemyCandidateOf` del generatore è privato): duplicazione minima accettata perché il file esce dal repo dopo il primo boot reale"
metrics:
  duration: "~35 min"
  completed: 2026-11-04
  tasks: 2
  files: 9
---

# Phase 13 Plan 17: Leggendari e dungeon a tappe una tantum, corsa del generatore al boot Summary

Il boot di manutenzione ora marca una volta i 22 leggendari (`true`) e ogni altro nemico (`false`) solo dove il flag manca, arricchisce le dungeon fisse aperte con al più un nemico di 1–3 tappe nella fascia del loro `minTitle` e dal pool del loro POI (bande di briganti in apertura dove la zona ha il Bandito), in modo deterministico per id, e infine chiede una corsa al generatore; ogni passo è isolato in `step()` e non blocca il boot.

## File una tantum da rimuovere dopo il primo boot reale (Phase 12 D-25)

- `src/quests/maintenance/enemy-legendary.migrator.ts` + `enemy-legendary.migrator.int-spec.ts`
- `src/quests/maintenance/jewel-accessory.migrator.ts` + `jewel-accessory.migrator.int-spec.ts` (piano 13-16)
- `src/quests/maintenance/dungeon-stages.ts` + `dungeon-stages.spec.ts`
- `src/quests/maintenance/dungeon-stages.migrator.ts` + `dungeon-stages.migrator.int-spec.ts`
- In `QuestMaintenanceBoot`: i passi 2–5 (`flag dei leggendari (una tantum)`, `fasi d'uso dei gioielli (una tantum)`, `tappe delle dungeon (una tantum)`, `richiesta di corsa al generatore`) e i parametri `legendary`, `jewels`, `dungeons`, `trigger` del costruttore
- In `QuestMaintenanceModule`: i provider `EnemyLegendaryMigrator`, `JewelAccessoryMigrator`, `DungeonStagesMigrator`, le voci `Enemy`, `PointOfInterest`, `EquipmentItem` del forFeature e l'import di `QuestGenerationTriggerModule`
- In `quest-maintenance.boot.spec.ts`: i casi `(D-26)`, `(D-04, D-13, D-17)` e `(D-17)`; resta il migratore permanente dei nemici con i due casi `(D-28)`

## Commit

| Task | Tipo | Hash | Subject |
|------|------|------|---------|
| 1 | RED | 7e606b7 | test(migrations): pin the one-off legendary enemy flag |
| 1 | GREEN | 200cf0c | feat(migrations): mark the legendary enemies once |
| 2 | RED | 4049b61 | test(migrations): pin the one-off dungeon stages enrichment |
| 2 | GREEN | cafacbf | feat(migrations): enrich the fixed dungeons with stages once |

## Fallimenti RED osservati

- Task 1: `Cannot find module './enemy-legendary.migrator'` (suite in errore, 0 test eseguiti).
- Task 2: `Cannot find module './dungeon-stages'` e `Cannot find module './dungeon-stages.migrator'`; in quest-maintenance.boot.spec.ts 6 casi rossi su 8 (i tre `(D-26)` esistenti perché il mock dei gioielli è ora il terzo argomento, più i tre nuovi: ordine dei passi, passi successivi dopo un fallimento, richiesta di corsa fallita); i due casi `(D-28)` restano verdi (il primo argomento non cambia).

## Nomi e firme creati

- `enemy-legendary.migrator.ts`: `EnemyLegendaryReport { legendary: number; ordinary: number }`; `LEGENDARY_ENEMY_IDS` (tupla `as const` di 22 hex da `6ae80b5b2e7351b494ecc869` a `…87e`); `EnemyLegendaryMigrator(@InjectModel(Enemy.name) enemyModel)`, `migrate()` con due `updateMany` filtrati su `legendary` non booleano (`$nin: [true, false]`); log `Nemici: ${a} leggendari e ${b} ordinari marcati` solo se > 0.
- `dungeon-stages.ts`: `DUNGEON_STAGES_SEED = 13`, `BANDIT_ID = '6ae80bf6947d6a423521c70d'`, `BANDIT_CHIEF_ID = '6ae80bf6947d6a423521c70f'`, `ADDED_STAGES = { min: 1, max: 3 }`; `DungeonStage { enemy: string; quantity: number }`; `DungeonStagesInput { rank: GeneratedRank; current: readonly DungeonStage[]; poiTypes: readonly string[]; enemies: readonly EnemyCandidate[]; chance: ChanceSource }`; `dungeonStagesOf(input): DungeonStage[]` (voci attuali copiate + aggiunte). Ordine dei tiri: numero di tappe, quantità della banda, poi per ogni tappa forma + scelta.
- `dungeon-stages.migrator.ts`: `DungeonStagesReport { enriched: number; skipped: number }`; `DungeonStagesMigrator(@InjectModel(Quest.name) questModel, @InjectModel(Enemy.name) enemyModel, @InjectModel(PointOfInterest.name) poiModel)`, `migrate()`: dungeon `{ 'infos.type': 'dungeon', concludedAt: null }` per `_id` crescente con `validQuestEnemiesOf(infos).length <= 1`; nemici `{ legendary: false }`; tipi del POI `infos.markerLocation`; update con filtro `{ _id, concludedAt: null, 'infos.enemies.1': { $exists: false } }`; WARN `Dungeon ${id} con minTitle non generabile: saltata`; log `Dungeon: ${n} arricchite a tappe` solo se > 0.
- `QuestMaintenanceBoot(enemies: QuestEnemiesMigrator, legendary: EnemyLegendaryMigrator, jewels: JewelAccessoryMigrator, dungeons: DungeonStagesMigrator, trigger: QuestGenerationTrigger)`; etichette dei passi: `migrazione dei nemici delle missioni`, `flag dei leggendari (una tantum)`, `fasi d'uso dei gioielli (una tantum)`, `tappe delle dungeon (una tantum)`, `richiesta di corsa al generatore`.
- `QuestMaintenanceModule`: forFeature [Quest, QuestResult, EquipmentItem, Enemy, PointOfInterest]; imports + `QuestGenerationTriggerModule`; providers [QuestEnemiesMigrator, EnemyLegendaryMigrator, JewelAccessoryMigrator, DungeonStagesMigrator, QuestMaintenanceBoot].

## Verifica

- `npx jest src/quests/maintenance/dungeon-stages.spec.ts src/quests/maintenance/quest-maintenance.boot.spec.ts --selectProjects unit`: 2 suite / 12 test verdi.
- `npx jest src/quests/maintenance --selectProjects integration --runInBand`: 4 suite / 18 test verdi.
- `npx jest test/app.int-spec.ts --selectProjects integration --runInBand` (real boot): 72 test verdi; `git diff --exit-code src/schema.gql` esce 0.
- Regressione unit `src/quests src/models test/fixtures`: 66 suite / 892 test (885 + 7 nuovi).
- `npx tsc --noEmit -p tsconfig.json` esce 0; prettier `--check` ed eslint puliti sui 9 file toccati, uno per uno.
- Schema vs origin/develop: tolte solo le due righe `  enemy: Enemy`.
- Gate del piano: 22 id distinti nel migratore dei leggendari; `UNA TANTUM` in testa ai tre file nuovi di produzione; nessun file fuori da `src/quests/maintenance/` nomina `dungeon-stages` o `enemy-legendary.migrator`; `trigger.request` compare una volta nel boot; `D-13)` 4 volte e `D-08, D-13)` una volta in dungeon-stages.spec.ts.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Letterali di rango nella spec non assegnabili a `TitleType`**
- **Found during:** Task 2 (GREEN, tsc)
- **Issue:** la spec RED passava ranghi come stringhe (`'adventurer'`), verde in ts-jest ma rossa al type check (TS2345).
- **Fix:** la spec usa `TitleType.<rango>`; nessun cambio di comportamento.
- **Files modified:** src/quests/maintenance/dungeon-stages.spec.ts
- **Commit:** cafacbf

### Aggiunte di copertura

- Un caso in più nel boot spec, `logs a failed generation request by name and keeps booting (D-17)`, e nel caso «curata» del migratore delle dungeon una dungeon conclusa che resta intatta (filtro `concludedAt: null`).

## Note per il runbook del handoff

- Primo boot reale atteso: `Nemici: 22 leggendari e N ordinari marcati`, `Gioielli: 42 valorizzati`, `Dungeon: k arricchite a tappe` (k ≤ 40; i dati del discuss danno 40 dungeon fra rookie e hero, nessuna legend); secondo boot nessuna di queste righe.
- La richiesta di corsa del boot di manutenzione si somma a quella dello sweeper al boot: il generatore è single-flight con rerun, quindi al più una corsa in più.

## Self-Check: PASSED
