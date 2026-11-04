---
phase: 13-generazione-quest
plan: 02
subsystem: models/quests
tags: [quests, schema, graphql, populate, BE-QGEN-01, D-01, D-12, D-21, D-28]
requires: ["13-01"]
provides:
  - "type QuestEnemy { enemy: Enemy!, quantity: Int! } (src/models/quest/quest-enemy.model.ts, QuestEnemySchema senza _id)"
  - "QuestInfos.enemies: [QuestEnemy!]! al posto di enemy; QuestInfosInput senza enemy"
  - "QuestResult.enemies: [QuestEnemy!]! al posto di enemy; QuestResult.stagesCleared / stagesTotal: Int nullable (default null)"
  - "QuestResultDraft.enemies: QuestEnemyDraft[] + stagesCleared/stagesTotal null (planParticipant, rescue-plan)"
  - "populate di infos.enemies.enemy e prizes.pet (catalogo), enemies.enemy e rewards.pet (risultato), orfani filtrati"
  - "isResolvedRef / isResolvedEnemyEntry / QuestEnemyEntry esportati da src/quests/quest-catalog.populate.ts"
  - "src/schema.gql: tolte solo le due righe `enemy: Enemy`"
affects: [13-03, 13-04, 13-05]
tech-stack:
  added: []
  patterns:
    - "lista di sottodocumenti `_id: false` con ref ObjectId + quantità (min 1)"
    - "filtro degli orfani prima della serializzazione per i campi non-null dentro liste"
key-files:
  created:
    - src/models/quest/quest-enemy.model.ts
    - src/models/quest/quest-enemies.schema.spec.ts
    - src/quests/results/quest-result.populate.spec.ts
  modified:
    - src/models/quest/quest-infos.model.ts
    - src/models/quest-result/quest-result.model.ts
    - src/models/quest-result/quest-result.schema.spec.ts
    - src/migrations/mixed-refs/mixed-ref-paths.ts
    - src/quests/outcomes/outcome-plan.ts
    - src/quests/outcomes/outcome-plan.spec.ts
    - src/quests/outcomes/rescue-plan.ts
    - src/quests/outcomes/rescue-plan.spec.ts
    - src/quests/quest-catalog.populate.ts
    - src/quests/quest-catalog.populate.spec.ts
    - src/quests/results/quest-result.populate.ts
    - src/quests/quests.module.ts
    - src/quests/results/quest-results-read.module.ts
    - src/quests/quests.resolver.int-spec.ts
    - src/quests/results/quest-result.resolver.int-spec.ts
    - test/app.int-spec.ts
    - src/schema.gql
decisions:
  - "Passaggio intermedio in planParticipant: `ParticipantPlanInput.enemy` resta singolo e il draft scrive `[{ enemy, quantity: 1 }]` o `[]` (la lista arriva in 13-04)"
  - "Pet registrato nel forFeature di QuestsModule e QuestResultsReadModule per il populate di prizes.pet / rewards.pet"
  - "Le int-spec coprono anche prizes.pet e rewards.pet (query separata QUEST_PETS sul catalogo; `pet { id name }` nella selezione del foglio esiti)"
metrics:
  duration: "~35 min"
  completed: 2026-11-04
  tasks: 3
  files: 20
---

# Phase 13 Plan 02: lista `enemies` al posto del nemico singolo Summary

Sostituzione secca del contratto: `QuestEnemy { enemy, quantity }` in `QuestInfos.enemies` e `QuestResult.enemies` (più `stagesCleared`/`stagesTotal` nullable), populate a profondità 1 di nemici e pet con filtro degli orfani, SDL rigenerato dal real boot con le sole due righe `enemy: Enemy` tolte.

## Task

| Task | Nome | Commit RED | Commit GREEN |
| ---- | ---- | ---------- | ------------ |
| 1 | `QuestEnemy`, modelli e SDL non additivo (D-01) | a9c620d | 2eccc46 |
| 2 | populate di `enemies` e `prizes.pet`, filtro degli orfani (D-01, D-28) | 6dfcf03 | 87778dc |
| 3 | prova sul filo di `quests` e `questResult` (D-01, D-28) | — | 6f18a05 (verde al primo colpo) |

## Fallimenti RED osservati

- Task 1 (unit): 9 falliti / 56 passati: i tre test di `quest-enemies.schema.spec.ts` (`enemies` non è un path dello schema), i due di `quest-result.schema.spec.ts` (`enemies` `undefined`), `planParticipant` (draft con `enemy` invece di `enemies`/`stagesCleared`/`stagesTotal`, sia «drafts the result sheet» sia il test D-01 dell'XP), `planRescued` e `deathResultOf` (stessa forma attesa).
- Task 1 (real boot): 2 falliti / 69 passati: `writes the quest enemies list in place of the single enemy (D-01)` e `writes the quest result contract into the generated schema`.
- Task 2 (unit): 6 falliti / 10 passati: liste attese di `QUEST_CATALOG_POPULATE` e `QUEST_RESULT_POPULATE`, filtro delle voci `enemies` orfane e annullamento del pet orfano (catalogo e risultato). `unpopulatedResultOf answers the fought enemies empty…` era già verde: il Task 1 aveva già portato `unpopulatedResultOf` a `enemies: []`.
- Task 3: verde al primo colpo (prova d'integrazione del populate dei Task 1–2): `quests.resolver.int-spec.ts` 12/12, `quest-result.resolver.int-spec.ts` + `test/app.int-spec.ts` (94/94 insieme).

## Nomi e firme creati

- `src/models/quest/quest-enemy.model.ts`: `class QuestEnemy { enemy: Types.ObjectId | Enemy; quantity: number }` (`@ObjectType`, `@Schema({ _id: false })`, `enemy` ref `Enemy.name` required, `quantity` `Number` required `min: 1`); `export const QuestEnemySchema`.
- `QuestInfos.enemies: QuestEnemy[]` (`@Prop({ type: [QuestEnemySchema], default: [] })`); `QuestResult.enemies` idem; `QuestResult.stagesCleared?: number | null`, `stagesTotal?: number | null` dopo `spellsUsed`.
- `src/quests/outcomes/outcome-plan.ts`: `export interface QuestEnemyDraft { enemy: Types.ObjectId; quantity: number }`; `QuestResultDraft.enemies`, `stagesCleared`, `stagesTotal`.
- `src/quests/quest-catalog.populate.ts`: `export interface QuestEnemyEntry { enemy?: unknown }`; `export const isResolvedRef(value)`; `export const isResolvedEnemyEntry(entry)`; `isResolvedItemEntry` riusa `isResolvedRef`; `CatalogRefsHolder.infos.enemies`, `CatalogRefsHolder.prizes.pet`.
- `src/quests/results/quest-result.populate.ts`: `ResultRefsHolder.enemies`, `ResultRefsHolder.rewards.pet`; `QUEST_RESULT_POPULATE` con `enemies.enemy` e `rewards.pet`.
- `src/migrations/mixed-refs/mixed-ref-paths.ts`: `subdocArray('quests', 'infos.enemies', 'enemy')` (34 voci invariate).

## Spec non toccate rimaste rosse per `infos.enemy` (da spazzare in 13-04/13-05)

`npx jest src/quests --selectProjects integration --runInBand`: 5 suite rosse, 25 test falliti su 336 (le unit di `src/quests` sono tutte verdi, 614/614):

- `src/quests/outcomes/aid-rescue.int-spec.ts`
- `src/quests/outcomes/boss-resolution.int-spec.ts`
- `src/quests/outcomes/gm-completion.service.int-spec.ts`
- `src/quests/outcomes/quest-resolution.service.int-spec.ts`
- `src/quests/outcomes/quest-combat.int-spec.ts`

Causa: scrivono `infos.enemy`, che lo schema ora scarta su `create`, e i lettori `resolution-loader.service.ts:474` (`refIdOf(quest.infos.enemy)`) e `aid/aid-quest.ts:103` (`enemy: refIdOf(infos.enemy)`) leggono ancora il campo singolo: senza nemico la quest si risolve come successo automatico. Atteso dal piano.

## Deviazioni dal piano

- **[Rule 2 - copertura] Prova sul filo di `prizes.pet` e `rewards.pet`.** Il piano popola i due pet ma le int-spec del Task 3 provavano solo `enemies`; aggiunti il test `populates prizes.pet and nulls an orphan pet without nulling the list (D-21, D-28)` (query `QUEST_PETS`) e `pet { id name }` nella selezione del foglio esiti (popolato nel caso completo, `null` nel caso orfano). Commit 6f18a05.
- **[Rule 3 - blocco] Enemy del catalogo con `persistEnemy`.** `quests.resolver.int-spec.ts` creava il nemico con solo `name`/`imagePath`; la selezione nuova chiede `xp` (`Int!`), quindi il nemico ora nasce da `persistEnemy` (xp 100). Commit 6f18a05.
- **Spec del RED con un errore tsc.** `quest-result.populate.spec.ts` (commit 6dfcf03) usava `type: 'enemy'` invece di `QuestType.enemy` (ts-jest non fa type check); corretto nel commit GREEN 87778dc insieme al codice.
- Test aggiuntivo in `quest-enemies.schema.spec.ts`: `rejects an enemy entry without a positive quantity (D-01)` (chiave d'errore `enemies.0.quantity`), a presidio di T-13-03.
- Titoli rinominati con la decisione: `adds the defeated enemy xp to the prize, keeps the fight hp and lists the enemy (D-01)` (outcome-plan), `populates the enemies, the lore and every catalog item on quests (D-01)`, `returns the populated result with the fought enemies to its owning user (D-01, D-21)`, `drops orphan items and enemies and nulls orphan spells and pet without nulling the result (D-28)`.

## Gate

- `npx tsc --noEmit -p tsconfig.json` → 0 a fine di ogni task.
- Task 1 unit: 103/103 (quest-enemies, quest-result.schema, mixed-ref-paths, outcome-plan, rescue-plan); real boot `test/app.int-spec.ts` 71/71.
- Task 2 unit: 16/16 (quest-catalog.populate, quest-result.populate).
- Task 3 integration: 94/94 (quests.resolver, quest-result.resolver, app.int-spec).
- Prettier `--write` ed ESLint sui soli file toccati, uno per uno: nessun errore (solo il warning preesistente `no-base-to-string` di `test/app.int-spec.ts`).
- `git diff --exit-code src/schema.gql` → 0; `git diff origin/develop -- src/schema.gql | grep -E '^-[^-]'` → esattamente due righe `-  enemy: Enemy`.

## Self-Check: PASSED
