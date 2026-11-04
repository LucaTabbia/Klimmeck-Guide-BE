---
phase: 13-generazione-quest
plan: 05
subsystem: quests (dati di prova)
tags: [quests, fixtures, BE-QGEN-01, D-01, D-28]
requires: ["13-04"]
provides:
  - "buildQuest scrive `infos.enemies: []` e nessun `enemy`"
  - "buildQuestResult scrive `enemies: []`, `stagesCleared: null`, `stagesTotal: null` e nessun `enemy`"
  - "Int-spec degli esiti e del migratore sulla nuova forma: suite di src/quests verdi"
affects: [13-06, 13-10, 13-12, 13-16, 13-17]
tech-stack:
  added: []
  patterns:
    - "documento legacy nelle int-spec = copia del builder + delete della lista (e dei campi delle tappe per i risultati)"
key-files:
  created: []
  modified:
    - test/fixtures/quest.fixture.ts
    - test/quests/quest-result.fixture.ts
    - test/fixtures/fixtures.spec.ts
    - src/quests/outcomes/quest-resolution.service.int-spec.ts
    - src/quests/outcomes/quest-resolution.sweeper.int-spec.ts
    - src/quests/outcomes/boss-resolution.int-spec.ts
    - src/quests/outcomes/gm-completion.service.int-spec.ts
    - src/quests/outcomes/aid-rescue.int-spec.ts
    - src/quests/maintenance/quest-enemies.migrator.int-spec.ts
decisions:
  - "Aggiunto in fixtures.spec.ts il caso `starts with an empty enemies list and no single enemy (D-01)` (prova di assenza con `Object.keys(...).sort()`): nessuna asserzione esistente citava il vecchio campo"
  - "fixtures.int-spec.ts non toccata: non asserisce la forma di buildQuest/buildQuestResult"
  - "Il migratore int-spec costruisce i documenti legacy con `legacyInfos` (senza lista) e il nuovo `legacyResult` (senza lista né tappe)"
  - "Nessun codice di produzione toccato: nessun caso è rimasto rosso dopo l'aggiornamento dei dati"
metrics:
  duration: "~10 min"
  completed: 2026-11-04
  tasks: 3
  files: 9
---

# Phase 13 Plan 05: spazzata del vecchio `enemy` nei dati di prova Summary

I builder `buildQuest`/`buildQuestResult` e le int-spec degli esiti scrivono ora `enemies: [{ enemy, quantity }]` al posto del campo singolo; le 16 int-spec rosse dal piano 13-02 sono tornate verdi senza toccare il codice di produzione.

## Commit

| Task | Commit | Descrizione |
|------|--------|-------------|
| 1 | e560eed | `test(quests): build quests and results with the enemies list` |
| 2 | fe7f026 | `test(quests): fight the outcome scenarios with the enemies list` |
| 3 | 63188bc | `test(quests): finish the enemies list sweep` (migratore int-spec) |

## RED osservati

- Task 1: il caso nuovo di fixtures.spec.ts falliva con `Expected: []` / `Received: undefined` prima della modifica di `buildQuest` (1 rosso su 22); poi 22/22 verdi.
- Task 2: prima della modifica, 16 rossi su 61 nelle quattro int-spec degli esiti (aid-rescue 9, boss-resolution 5, gm-completion.service 1, quest-resolution.service 1), già noti dal 13-04. Dopo: `src/quests/outcomes` integration 9 suite, 106/106 verdi.
- Task 3: il cambio dei fixture del Task 1 ha reso rossi 4 casi su 5 di `quest-enemies.migrator.int-spec.ts` (i documenti legacy contenevano anche `enemies: []`, quindi il filtro dei non migrati non li trovava). Corretti costruendo i legacy senza la lista: 5/5 verdi.

## Controllo d'insieme (Task 3)

`grep -rnE "enemy: |infos\.enemy\b|result\.enemy\b" src test --include='*.ts'`, righe residue classificate:

- (a) voci dentro `enemies: [{ enemy: …, quantity }]` o forme di risposta GraphQL annidate nella lista: quest-catalog.populate.spec.ts:120-123,129; quests.resolver.int-spec.ts:69,115 (tipi/variabili locali),143,172,291-292,305,314,328-329,373; quest-combat.int-spec.ts:84,110,114 (helper `enemiesOf`),184,241,282-283,293-294,327,338-339,348; outcome-plan.spec.ts:247,257,313,324; combatant-plan.spec.ts:73-74,89-90; quest-result.populate.spec.ts:61-64,69,98; quest-result.resolver.int-spec.ts:165,225,297; quest-enemies.migrator.int-spec.ts:120; quest-enemies.schema.spec.ts:46; test/app.int-spec.ts:447 (SDL `type QuestEnemy`); le cinque int-spec degli esiti di questo piano. Codice di produzione con la stessa forma: outcome-plan.ts:88, combatant-plan.ts:75, combat/combat-context.ts:214 (parametro), quest-enemy.model.ts:16.
- (b) documenti legacy scritti apposta: quest-combat.int-spec.ts:310 (insertOne con `delete infos.enemies`); quest-enemies.migrator.int-spec.ts:27 (`legacyInfos`) e il nuovo `legacyResult`; quest-enemies.schema.spec.ts:33 (prova che lo schema scarta il campo singolo).
- (c) lettore tollerante e migratore: quest-enemies.ts:16,26; quest-enemies.spec.ts:16,19,26,54,57; quest-enemies.migration.ts:22; quest-enemies.migrator.ts:41.
- (d) aid (piano 13-06): aid/aid-quest.spec.ts:31,139 (verde: il sorgente legacy è tollerato da `validQuestEnemiesOf`).

Nessun'altra riga residua.

## Gate

- `npx tsc --noEmit -p tsconfig.json` esce 0 dopo ogni task.
- Unit: `npx jest src/models src/quests src/lore src/characters/deletion src/validation src/authz test/fixtures --selectProjects unit` → 70 suite, 957/957 verdi.
- Integration: `npx jest src/lore src/quests src/characters/deletion src/validation test/fixtures --selectProjects integration --runInBand` → 34 suite, 422/422 verdi (superinsieme della lista del piano: tutto `src/quests`).
- Integration degli altri consumatori dei builder (src/authz/ownership/quest-result-access, src/characters/character-quest-lanes, src/characters/pending-quest-start.publisher, src/travel/travel.resolver, src/travel/travel-completion, src/migrations) → 8 suite, 77/77 verdi.
- Prettier ed eslint per file su tutti i `.ts` toccati: puliti.
- `git diff origin/develop -- src/schema.gql | grep -E '^-[^-]'` → solo le due righe `  enemy: Enemy`; `git diff --exit-code -- src/schema.gql` esce 0.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Documenti legacy del migratore int-spec non più legacy**
- **Found during:** Task 3
- **Issue:** con `buildQuest`/`buildQuestResult` sulla lista, i documenti legacy della spec del migratore portavano sia `enemy` sia `enemies: []`, quindi `UNMIGRATED_QUEST_FILTER`/`UNMIGRATED_RESULT_FILTER` non li selezionavano (4 rossi su 5).
- **Fix:** `legacyInfos` toglie `enemies`; nuovo helper `legacyResult(enemy)` (copia di `buildQuestResult({ enemy })` senza `enemies`, `stagesCleared`, `stagesTotal`).
- **Files modified:** src/quests/maintenance/quest-enemies.migrator.int-spec.ts (fuori da `files_modified` del piano)
- **Commit:** 63188bc

**2. [Rule 2] Caso nuovo in fixtures.spec.ts** — nessuna asserzione esistente citava il vecchio campo; aggiunto un caso `(D-01)` per avere un RED sul cambio del fixture (commit e560eed).

## Known Stubs

Nessuno.

## Self-Check: PASSED

- File modificati presenti; commit e560eed, fe7f026, 63188bc presenti in `git log`.
