---
phase: 13-generazione-quest
plan: 03
subsystem: quests/maintenance
tags: [quests, migrations, boot, BE-QGEN-01, D-01, D-28]
requires: ["13-02"]
provides:
  - "questEnemiesOf / validQuestEnemiesOf: lettore tollerante puro delle due forme salvate (src/quests/outcomes/quest-enemies.ts)"
  - "QuestEnemiesMigrator.migrateAll(): migrazione permanente e idempotente del nemico singolo alla lista su quests e questresults"
  - "QuestMaintenanceBoot: orchestratore dei passi di manutenzione al boot, passi mai bloccanti"
  - "QuestMaintenanceModule importato solo da AppModule"
affects: [13-04, 13-05, 13-16, 13-17]
tech-stack:
  added: []
  patterns:
    - "update a pipeline a due stadi con filtro sui documenti senza lista (idempotente)"
    - "orchestratore `step(label, work)` con errore loggato solo per nome e codice"
key-files:
  created:
    - src/quests/outcomes/quest-enemies.ts
    - src/quests/outcomes/quest-enemies.spec.ts
    - src/quests/maintenance/quest-enemies.migration.ts
    - src/quests/maintenance/quest-enemies.migrator.ts
    - src/quests/maintenance/quest-enemies.migrator.int-spec.ts
    - src/quests/maintenance/quest-maintenance.boot.ts
    - src/quests/maintenance/quest-maintenance.boot.spec.ts
    - src/quests/maintenance/quest-maintenance.module.ts
  modified:
    - src/app.module.ts
decisions:
  - "`questEnemiesOf` restituisce `(StoredQuestEnemy | null)[]` (interfaccia esportata) invece del tipo inline dello skeleton: le voci nulle scritte a mano sono tollerate da `validQuestEnemiesOf`"
  - "`isPositiveInteger` esiste in outcome-numbers.ts con la firma attesa (type guard): usato direttamente, niente cast"
  - "Il migratore non ha un hook di boot proprio: lo chiama solo QuestMaintenanceBoot"
metrics:
  duration: "~20 min"
  completed: 2026-11-04
  tasks: 3
  files: 9
---

# Phase 13 Plan 03: migrazione permanente del nemico singolo alla lista Summary

Lettore tollerante `validQuestEnemiesOf` per entrambe le forme salvate, `QuestEnemiesMigrator` permanente e idempotente su quest e risultati (pipeline a due stadi, seconda corsa 0) e `QuestMaintenanceBoot` mai bloccante, importato solo da `AppModule` tramite `QuestMaintenanceModule`.

## Task

| Task | Nome | Commit | File |
| ---- | ---- | ------ | ---- |
| 1 RED | lettore tollerante | 79eaed3 | src/quests/outcomes/quest-enemies.spec.ts |
| 1 GREEN | lettore tollerante | 647f829 | src/quests/outcomes/quest-enemies.ts |
| 2 RED | migrazione | ca00ea3 | src/quests/maintenance/quest-enemies.migrator.int-spec.ts |
| 2 GREEN | migrazione | d1b9f1a | quest-enemies.migration.ts, quest-enemies.migrator.ts, int-spec (helper `withoutEnemy`) |
| 3 RED | boot di manutenzione | 7e03b25 | src/quests/maintenance/quest-maintenance.boot.spec.ts |
| 3 GREEN | boot di manutenzione | 2fccdc8 | quest-maintenance.boot.ts, quest-maintenance.module.ts, src/app.module.ts |

## Fallimenti RED osservati

- Task 1: `Cannot find module './quest-enemies'` (modulo assente).
- Task 2: `Cannot find module './quest-enemies.migrator'` (classe assente).
- Task 3: `Cannot find module './quest-maintenance.boot'` (classe assente).

## Nomi e firme creati

- `src/quests/outcomes/quest-enemies.ts`: `interface StoredQuestEnemies { enemies?: unknown; enemy?: unknown }`, `interface StoredQuestEnemy { enemy?: unknown; quantity?: unknown }`, `interface QuestEnemyRef { enemy: Types.ObjectId; quantity: number }`, `questEnemiesOf(infos: StoredQuestEnemies | null | undefined): (StoredQuestEnemy | null)[]`, `validQuestEnemiesOf(infos: StoredQuestEnemies | null | undefined): QuestEnemyRef[]`. La lista vince sulla forma vecchia anche se vuota; ref stringa esadecimale convertiti in `ObjectId` da `refIdOf`.
- `src/quests/maintenance/quest-enemies.migration.ts`: `UNMIGRATED_QUEST_FILTER`, `UNMIGRATED_RESULT_FILTER`, `enemiesPipeline(listPath, legacyPath): Record<string, unknown>[]`.
- `src/quests/maintenance/quest-enemies.migrator.ts`: `interface QuestEnemiesMigrationReport { quests: number; results: number }`, `@Injectable() class QuestEnemiesMigrator` (costruttore `(questModel, questResultModel)` con `@InjectModel(Quest.name)` / `@InjectModel(QuestResult.name)`), `migrateAll(): Promise<QuestEnemiesMigrationReport>`; log `Nemici delle missioni: <q> missioni e <r> risultati migrati alla lista` solo se almeno uno dei due è > 0.
- `src/quests/maintenance/quest-maintenance.boot.ts`: `class QuestMaintenanceBoot implements OnApplicationBootstrap`, costruttore `(enemies: QuestEnemiesMigrator)`, passo `migrazione dei nemici delle missioni`; errore loggato come `Manutenzione missioni: <label> fallita (<describeError>), il boot prosegue`.
- `src/quests/maintenance/quest-maintenance.module.ts`: `QuestMaintenanceModule` con `MongooseModule.forFeature` di Quest e QuestResult, providers `[QuestEnemiesMigrator, QuestMaintenanceBoot]`; in `src/app.module.ts` subito dopo `QuestOutcomesModule`.

## Verifiche

- `npx jest src/quests/outcomes/quest-enemies.spec.ts --selectProjects unit`: 5/5.
- `npx jest src/quests/maintenance/quest-enemies.migrator.int-spec.ts --selectProjects integration --runInBand`: 5/5 (solo harness in memoria).
- `npx jest src/quests/maintenance/quest-maintenance.boot.spec.ts --selectProjects unit`: 2/2.
- Real boot `npx jest test/app.int-spec.ts --selectProjects integration --runInBand`: 71/71; `git diff --exit-code src/schema.gql` 0; rispetto a origin/develop tolte solo le due righe `enemy: Enemy`.
- `npx tsc --noEmit -p tsconfig.json` 0; prettier ed eslint puliti su ogni file toccato.
- Accettazione: `QuestMaintenanceModule` compare 2 volte in app.module.ts e in nessun altro file fuori dal proprio modulo; `D-28)` 4/2/2 nelle tre spec; `OnApplicationBootstrap` assente dal migratore.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Warning eslint `no-unused-vars` nella int-spec del migratore**
- **Trovato durante:** Task 2 (GREEN)
- **Problema:** la destrutturazione `{ enemy: _dropped, ...rest }` usata per togliere il campo dalle fixture generava tre warning.
- **Fix:** helper locale `withoutEnemy(document)` (copia e cancella la chiave), stesso comportamento; incluso nel commit GREEN d1b9f1a.

**2. Test aggiuntivi oltre il behavior del piano**
- Lettore: caso `reads a legacy single enemy through the validating reader (D-28)` e voce `null` nella lista; migratore: risultato con `enemy` nullo → lista vuota e risultato già migrato intatto nello stesso test. Nessun cambio di comportamento.

Nessun caso verde al primo colpo: ogni RED fallisce per il modulo assente.

## Known Stubs

Nessuno.

## Self-Check: PASSED

- File creati presenti (8) e `src/app.module.ts` modificato.
- Commit 79eaed3, 647f829, ca00ea3, d1b9f1a, 7e03b25, 2fccdc8 presenti in `git log`.
