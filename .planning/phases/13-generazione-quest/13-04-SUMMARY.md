---
phase: 13-generazione-quest
plan: 04
subsystem: quests/outcomes
tags: [quests, combat, BE-QGEN-01, D-01, D-02, D-28]
requires: ["13-03"]
provides:
  - "CombatContext.enemies: CombatEnemy[] (con quantity, nell'ordine della quest)"
  - "Segnaposto aggregato: HP = Σ lifePoints × quantity, danno = Σ potenza × quantity, nessun tiro aggiunto"
  - "ResolutionCatalog.enemies: CatalogEnemy[] letto da readEnemies con validQuestEnemiesOf"
  - "EnemyFacts { entries, xp }: XP della vittoria = xpPrize + Σ xp × quantity; il risultato elenca i nemici affrontati"
  - "La aid clonata porta infos.enemies"
affects: [13-05, 13-06, 13-10, 13-12]
tech-stack:
  added: []
  patterns:
    - "un solo find con l'operatore `$in` sui nemici della quest, mappa per hex, ordine della quest conservato"
key-files:
  created:
    - src/quests/outcomes/combatant-plan.spec.ts
  modified:
    - src/quests/outcomes/combat/combat-resolver.ts
    - src/quests/outcomes/combat/combat-context.ts
    - src/quests/outcomes/combat/combat-context.spec.ts
    - src/quests/outcomes/combat/placeholder-combat-resolver.ts
    - src/quests/outcomes/combat/placeholder-combat-resolver.spec.ts
    - src/quests/outcomes/combatant-plan.ts
    - src/quests/outcomes/outcome-plan.ts
    - src/quests/outcomes/outcome-plan.spec.ts
    - src/quests/outcomes/resolution-loader.service.ts
    - src/quests/outcomes/gm-completion.service.ts
    - src/quests/outcomes/aid/aid-quest.ts
    - src/quests/outcomes/aid/aid-quest.spec.ts
    - src/quests/outcomes/quest-combat.int-spec.ts
decisions:
  - "GREEN dei Task 1 e 2 in un solo commit `feat(combat): fight several enemies with quantities` (tsc rosso dopo il solo Task 1, come previsto dal piano)"
  - "`CatalogEnemy { snapshot; quantity }` esportata da resolution-loader.service.ts al posto del tipo inline dello skeleton"
  - "`enemyOf` di combat-context.ts restituisce `Omit<CombatEnemy, 'quantity'>`: la quantità la aggiunge `buildCombatContext`"
  - "Il WARN dell'orfano cambia testo: «Nemico <id> della missione <id> inesistente: voce scartata»"
metrics:
  duration: "~25 min"
  completed: 2026-11-04
  tasks: 3
  files: 14
---

# Phase 13 Plan 04: Combattimento multi-nemico Summary

Il `CombatResolver` riceve `enemies: CombatEnemy[]` con `quantity`, il segnaposto aggrega HP e danni per quantità senza tiri nuovi, il loader legge la lista con il lettore tollerante `validQuestEnemiesOf` scartando gli orfani con un WARN di soli id, e l'XP della vittoria somma `xpPrize` + Σ (xp × quantity); il risultato e la aid clonata portano la lista.

## Commit

| Task | Commit | Tipo | Messaggio |
| ---- | ------ | ---- | --------- |
| 1 RED | d739807 | test | test(combat): pin the multi-enemy context and aggregation |
| 2 RED | 1b61b12 | test | test(quests): pin the enemy facts and the summed xp |
| 1+2 GREEN | 9b83012 | feat | feat(combat): fight several enemies with quantities |
| 3 | f319ed1 | test | test(combat): cover the multi-enemy fight end to end |

## RED osservati

- Task 1: 23 test su 30 rossi in `src/quests/outcomes/combat` (`TypeError: Cannot read properties of undefined (reading '_id')` da `enemyOf(hydration.enemy)`, e `context.enemy` indefinito nel segnaposto).
- Task 2: 5 rossi su 51: `builds the context with every enemy and its quantity (D-02)`, `sums the enemy xp by quantity (D-02)`, `counts a non numeric enemy xp as 0 (D-02)`, `adds the defeated enemy xp …` (xpGained 150 invece di 250), `lists the fought enemies even on a defeat (D-01)` (lista vuota). Verdi al primo colpo: `returns no combat context without valid enemies (D-02)` e `returns no enemy facts for an empty catalog (D-02)` (con `catalog.enemy` indefinito il vecchio codice restituiva già `null`).
- Task 3: i tre casi nuovi verdi al primo colpo (il codice dei Task 1–2 li copre, come previsto dal piano).

## Nomi e firme creati

- `src/quests/outcomes/combat/combat-resolver.ts`: `CombatEnemy.quantity: number`; `CombatContext.enemies: CombatEnemy[]`.
- `src/quests/outcomes/combat/combat-context.ts`: `CombatHydration.enemies: readonly { snapshot: CombatEnemySnapshot; quantity: number }[]`.
- `src/quests/outcomes/combat/placeholder-combat-resolver.ts`: `enemyLifePoints(context)`, `enemyDamagePower(context)` (privati); `winChanceOf(partyPower, lifePoints)` invariata.
- `src/quests/outcomes/outcome-plan.ts`: `export interface EnemyFacts { entries: QuestEnemyDraft[]; xp: number }`; `ParticipantPlanInput.enemies: EnemyFacts | null`.
- `src/quests/outcomes/combatant-plan.ts`: `combatContextOf(quest, catalog, participants)` nullo con `catalog.enemies.length === 0`; `enemyFactsOf(catalog): EnemyFacts | null`.
- `src/quests/outcomes/resolution-loader.service.ts`: `export interface CatalogEnemy { snapshot: CombatEnemySnapshot; quantity: number }`; `ResolutionCatalog.enemies: CatalogEnemy[]`; `private readEnemies(quest): Promise<CatalogEnemy[]>`.
- `src/quests/outcomes/aid/aid-quest.ts`: `AidSourceQuest.infos.enemies?: unknown` (accanto a `enemy?: unknown`); `AidQuestDraft.infos.enemies: QuestEnemyRef[]`; `buildAidQuest` scrive `enemies: validQuestEnemiesOf(infos)`.
- `src/quests/outcomes/quest-combat.int-spec.ts`: helper locali `questWithEnemies(type, enemies, prizes?)`, `combatQuest(type, enemyId, prizes?)` (una voce con quantità 1), `enemiesOf(holder)`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Riga di `quest-combat.int-spec.ts` nel commit GREEN**
- **Found during:** Task 2
- **Issue:** `context.enemy.lifePoints` (riga 174) rompeva tsc dopo il cambio della porta.
- **Fix:** `context.enemies[0].lifePoints` nel commit GREEN 9b83012; il resto della spec nel Task 3.
- **Commit:** 9b83012

**2. Grep di accettazione del Task 3**
- `grep -c "enemies: \[{ enemy:"` stampa `0`: le scritture passano dall'helper `questWithEnemies(type, [{ enemy: …, quantity }])` (riga `combatQuest`) e dalle liste a più voci che Prettier mette su righe separate. Le scritture nella forma lista sono tre (`combatQuest`, caso multi-nemico, caso orfano). Il solo documento con `enemy:` singolo è quello legacy scritto con `collection.insertOne` nel caso `fights a legacy quest stored with the single enemy (D-28)`.

Il subject del GREEN del Task 2 previsto dal piano (`feat(quests): sum the xp of every enemy fought`) non esiste: GREEN unico come da istruzione del piano.

## Stato noto

- Restano rosse 16 int-spec in `src/quests/outcomes` (aid-rescue 9, boss-resolution 5, gm-completion.service 1 `adds the enemy experience to the catalog prize`, quest-resolution.service 1 `treats an orphan enemy as no enemy and warns with ids only (C6)`): scrivono ancora `infos.enemy` con `persistQuest`/`create` (lo schema strict lo scarta) o asseriscono `enemy` nel risultato (il caso C6 scrive `infos.enemy` e attende `enemy: null`; il suo WARN ora termina con «voce scartata»). Spazzata del piano 13-05.

## Self-Check: PASSED

- File creati/modificati presenti; commit d739807, 1b61b12, 9b83012, f319ed1 in `git log`.
