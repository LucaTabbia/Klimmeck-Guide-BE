---
phase: 16-lore-sbloccabili
plan: 05
subsystem: quests/outcomes (conoscenza delle vittorie)
tags: [quests, outcomes, lore, enemies, BE-LORE-03, D-06, D-09, D-14]
requires: ["16-01", "16-02", "16-04"]
provides:
  - "`src/quests/outcomes/victory-knowledge.ts`: `VictoryKnowledge { enemyIds; loreIds }`, `VictoryCatalog`, `victoryKnowledgeOf(catalog)` (null senza nemici, dedup per esadecimale, ref malformati scartati con `refIdOf`), `KnowledgeUpdate { fresh; addition }`, `knowledgeUpdateOf(known, lore, enemies = [])`"
  - "`ParticipantPlanInput.victory?: VictoryKnowledge | null`; `ParticipantPlan.update: { $set; $addToSet? }` (tipo letterale); `QuestResultDraft.loreUnlocked?: Types.ObjectId[]` scritto sempre da `planParticipant`"
  - "`OutcomeCharacterSnapshot.status.unlockedLore?/knownEnemies?: unknown[]`; `CombatEnemySnapshot.relatedLore?: unknown[]`; `COMBAT_ENEMY_PROJECTION` + `relatedLore: 1`"
  - "`planCombatant` passa `victory: victoryKnowledgeOf(catalog)` (individuale, party, dungeon, soccorritori)"
affects: [16-06, 16-07, 16-11]
tech-stack:
  added: []
  patterns:
    - "Conoscenza nello stesso update del piano, add-to-set solo con qualcosa da imparare (D-14)"
    - "Diff contro lo snapshot in sessione per il foglio (D-09, RESEARCH Pattern 3)"
key-files:
  created:
    - src/quests/outcomes/victory-knowledge.ts
    - src/quests/outcomes/victory-knowledge.spec.ts
  modified:
    - src/quests/outcomes/outcome-plan.ts
    - src/quests/outcomes/outcome-plan.spec.ts
    - src/quests/outcomes/combatant-plan.ts
    - src/quests/outcomes/combat/combat-context.ts
    - src/quests/outcomes/resolution-loader.service.ts
    - src/quests/outcomes/resolution-loader.service.spec.ts
    - src/quests/outcomes/quest-combat.int-spec.ts
    - src/quests/outcomes/boss-resolution.int-spec.ts
    - src/quests/outcomes/quest-dungeon.int-spec.ts
decisions:
  - "`ParticipantPlan.update` è un tipo letterale `{ $set; $addToSet?: KnowledgeAddition['$addToSet'] }` e non l'intersezione con l'interfaccia `KnowledgeAddition`: un'interfaccia non è assegnabile a `Record<string, unknown>` (firma di `OutcomeWriter.writeCharacterUpdate`)"
  - "Gli id dei nemici vanno nell'add-to-set anche quando tutte le pagine sono già aperte (`fresh` vuoto): `knownEnemies` è un insieme separato e idempotente"
  - "Gli id dei nemici sono deduplicati per esadecimale come le lore (una voce ripetuta compare una volta)"
metrics:
  duration: "~15 min"
  completed: 2026-11-07
  tasks: 3
  files: 11
---

# Phase 16 Plan 05: conoscenza delle vittorie delle quest Summary

Ogni vincitore di una quest con nemici (individuale, ogni membro di un party, dungeon superata, soccorritori vincenti) impara nello stesso update del piano le `Enemy.relatedLore` di tutti i nemici del contesto e gli id esatti dei nemici, con un add-to-set che compare solo se c'è qualcosa da imparare; il foglio porta in `loreUnlocked` le sole lore nuove rispetto allo snapshot in sessione. La sconfitta e la quest senza nemici lasciano l'update con il solo operatore set. `enemyFactsOf` non cambia: la conoscenza esce da `victoryKnowledgeOf`.

## Commit

| Task | Commit | Subject |
|------|--------|---------|
| 1 RED | 896348b | test(quests): pin the knowledge taught by a victory (D-06) |
| 1 GREEN | bf9e038 | feat(quests): teach the enemies and their lore to the winners |
| 2 RED | 9a13e9a | test(quests): expect every winner to learn the enemies (D-06) |
| 2 GREEN | 8710c61 | feat(quests): read the enemy lore and teach the winners |
| 3 | (questo) | docs(phase-16): record plan 05 progress |

## Fallimenti RED osservati

- Task 1: `victory-knowledge.spec.ts` non parte («Could not locate module src/quests/outcomes/victory-knowledge mapped as»); `outcome-plan.spec.ts` 5 falliti su 56: `drafts the result sheet` (manca `loreUnlocked: []`), `teaches the enemies and their lore to a winner (D-06, D-09)`, `teaches nothing on a defeat (D-06)` e `writes only the set when the victory is null (D-06, D-14)` (`loreUnlocked` undefined), `teaches a game master completion with enemies like a success (D-06)`. Verde in RED per costruzione: `keeps the filter unchanged when teaching (D-06)` (il filtro non dipende da `victory`; resta come guardia).
- Task 2 unit: 1 fallito su 3 in `resolution-loader.service.spec.ts` (proiezione senza `relatedLore: 1`).
- Task 2 integration: 5 falliti su 35 — `teaches the winner the enemies and their lore (D-06)`, `lists only the new lore on the sheet (D-09)`, `marks known only the exact enemy defeated (D-06)`, `teaches every winner of the party (D-06)`, `teaches every enemy of a cleared dungeon (D-06)`. Verdi in RED per costruzione (default `[]` di `@Prop` del 16-02): `teaches nothing on a defeat (D-06)`, `teaches nobody when the party loses (D-06)` e l'estensione di `stops at the first defeat … teaching nothing (D-12, D-06)`; restano come guardie della sconfitta.

## Casi aggiunti oltre al `<behavior>`

- `victory-knowledge.spec.ts`: `lists a repeated enemy once (D-06)`, `compares the known lore by hex in every stored form (D-09)` (era il secondo punto del caso D-09 del piano, separato), `still marks the enemies known when every page is already open (D-06)`.
- `outcome-plan.spec.ts`: `writes only the set when the victory is null (D-06, D-14)`.
- Il party di tre è costruito con `quester({ quest: a.quest })` sulla quest del boss a `THREE_SEATS`; il terzo membro conosce già la prima pagina e il suo foglio elenca solo la seconda. `bossQuest(seats, enemyOverrides = {})` guadagna il secondo parametro; in `quest-dungeon.int-spec.ts` `enemy(name, xp, relatedLore = [])` e `threeStages(lore = [])` (una pagina per tappa).

## Deviazioni dal piano

- **[Rule 3 - Blocco] Tipo di `ParticipantPlan.update`.** L'intersezione `{ $set } & KnowledgeAddition` del blocco `<interfaces>` rompe tsc in `outcome-writer.service.ts:99` (un'interfaccia non ha la firma d'indice di `Record<string, unknown>`). Risolto con un tipo letterale `{ $set: Record<string, unknown>; $addToSet?: KnowledgeAddition['$addToSet'] }` nello stesso commit GREEN; `knowledge-addition.ts` e il writer non cambiano.
- **Grep di accettazione:** `grep -c "D-06)" quest-combat.int-spec.ts` stampa `4` (non `3`): il caso preesistente `concludes a hand-made aid without rescue once won (D-06)` (Phase 9) combacia. `boss-resolution.int-spec.ts` = 2, `quest-dungeon.int-spec.ts` = 2 (≥ 1). Il caso della dungeon persa ha cambiato titolo in `stops at the first defeat and opens an aid with the same enemies, teaching nothing (D-12, D-06)`.
- **Bookkeeping:** `Plan: 5 of 12` in STATE.md (formato del brief dell'orchestratore) invece di `Plan: 05 of 12` del piano; il grep di verifica del Task 3 del piano quindi non passa per scelta.
- Nessuna asserzione fuori dall'elenco RESEARCH F9 è diventata rossa: le altre 25 suite unit di `src/quests/outcomes` sono rimaste verdi senza modifiche.

## Gate

- `npx jest src/quests/outcomes --selectProjects unit`: 26 suite, 428/428.
- `npx jest src/quests/outcomes src/travel/ambush --selectProjects integration --runInBand`: 15 suite, 171/171 (~66 s); `aid-rescue`, `study-spell-draw`, `quest-pet-prize` e le int-spec d'imboscata verdi senza modifiche.
- `npx tsc --noEmit -p tsconfig.json` 0; prettier e eslint puliti sugli 11 file `.ts` toccati (nessun file sporco in partenza, nessun commit style).
- `combatant-plan.spec.ts` invariato (diff 0), `enemyFactsOf` non toccato; `git diff --exit-code src/schema.gql` 0; schema vs origin/develop: 2 righe aggiunte (`unlockedLore: [ID!]!`, `loreUnlocked: [Lore!]!`, dal 16-02), 0 tolte.

## Known Stubs

Nessuno. `GmCompletionService` e l'imboscata non passano ancora `victory` (piano 16-06).

## Self-Check: PASSED

Commit 896348b, bf9e038, 9a13e9a, 8710c61 nel log; `victory-knowledge.ts` e `victory-knowledge.spec.ts` presenti.
