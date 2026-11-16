---
phase: 24-origini-delle-magie-quest-void-e-shamanic
plan: 17
subsystem: quests
tags: [spells, learning, research, graphql, sdl, tdd]
requires: ["24-16"]
provides:
  - "PendingQuest.learningSpell: Spell (resolver sul tipo PendingQuestLearningSpellResolver)"
  - "QuestResult.spellFound: Spell (popolata come spellLearned) e QuestResult.spellResearchFailed: Boolean! (Prop con default falso)"
  - "QuestPrizes.spellDraw: Boolean! (QuestPrizesSpellDrawResolver, vero solo col booleano esplicito)"
affects: ["24-18"]
tech-stack:
  added: []
  patterns: ["campo risolto sul tipo invece che sulla query: copre ogni percorso che serve il tipo"]
key-files:
  created:
    - src/characters/pending-quest-learning-spell.resolver.ts
  modified:
    - src/characters/characters.module.ts
    - test/authz/characters-test-app.ts
    - src/characters/character-quest-lanes.int-spec.ts
    - src/characters/pending-quest-start.publisher.int-spec.ts
    - src/models/quest-result/quest-result.model.ts
    - src/quests/results/quest-result.populate.ts
    - src/quests/results/quest-result.populate.spec.ts
    - src/quests/results/quest-result.resolver.int-spec.ts
    - src/quests/outcomes/study-spell-draw.int-spec.ts
    - src/models/quest/quest-prizes.model.ts
    - src/quests/prizes/quest-prizes.resolver.ts
    - src/quests/quests.module.ts
    - src/quests/quests.resolver.int-spec.ts
    - test/app.int-spec.ts
    - src/schema.gql
decisions:
  - "learningSpell da un resolver sul tipo PendingQuest: una findById della magia per PendingQuest in apprendimento che la seleziona; id assente o magia sparita → null (D-26, D-29)"
  - "QuestPrizes.spellDraw pubblico, risolto con === true sul blocco del viewer: un blocco senza il campo o il premio vuoto rispondono false (D-26)"
  - "researchResult resta solo Mongoose (D-31)"
metrics:
  completed: 2026-11-16
  tasks: 3
  commits: 5
---

# Phase 24 Plan 17: il filo della ricerca e dell'apprendimento — Summary

Quattro righe additive allo SDL: la FE legge in sessione la magia in apprendimento e la sua fine (`PendingQuest.learningSpell`, `startDate + waitingTime`), la magia scoperta sul foglio della ricerca (`QuestResult.spellFound`), la ricerca fallita (`QuestResult.spellResearchFailed`) e quali quest hanno una «Fase di ricerca» (`QuestPrizes.spellDraw`). Il riarmo della `PendingQuest` ripubblica il personaggio su `characterUpdated` col publisher esistente. Nessun handler nuovo.

## Commit

| Task | Commit | Subject |
|------|--------|---------|
| 1 (RED) | dee838da | test(characters): expect the learning spell on the pending quest |
| 1 (GREEN) | 98f09667 | feat(characters): serve the spell being learned on the pending quest |
| 2 (RED) | 7cf41a19 | test(quests): expect the research flags on the wire |
| 2 (GREEN) | 7a205321 | feat(quests): serve the research flags on the wire |
| 3 | (questo) | docs(phase-24): record plan 17 progress |

## SDL

Quattro righe aggiunte nel piano, nessuna tolta (`git diff HEAD~4 -- src/schema.gql` dopo il task 2: 4 `+`, 0 `-`); l'ordine di `sortSchema` coincide con i pin del piano:

```
type PendingQuest   +  learningSpell: Spell
type QuestPrizes    +  spellDraw: Boolean!
type QuestResult    +  spellFound: Spell
type QuestResult    +  spellResearchFailed: Boolean!
```

Blocchi finali (verbatim da `src/schema.gql`):

```graphql
type PendingQuest {
  arrivedAt: DateTime
  id: ID!
  learningSpell: Spell
  pointsSpent: Int!
  quest: Quest!
  startDate: DateTime
  waitingTime: Float!
}

type QuestPrizes {
  cure: QuestCure
  pet: Pet
  prizeCoins: Coins
  prizeItem: AssetQuantity
  randomLoot: [AssetQuantity!]!
  spell: Spell
  spellDraw: Boolean!
  xpPrize: Int
}
```

`type QuestResult`: il blocco di prima con `  spellFound: Spell` prima di `  spellLearned: Spell` e `  spellResearchFailed: Boolean!` fra `  spellLearned: Spell` e `  spellsUsed: [SpellUsage!]!`.

## RED

- Task 1: attesi e osservati «Cannot query field "learningSpell" on type "PendingQuest"» (GRAPHQL_VALIDATION_FAILED, 5 casi delle corsie) e il blocco SDL senza la riga (1 caso del boot).
- Task 2: 10 falliti su 227 in integration (validazione GraphQL per `spellFound`, `spellResearchFailed`, `spellDraw`; due blocchi SDL; a DB `spellResearchFailed` assente, quindi `undefined` invece di `true`/`false` nei due casi dello studio) e 2 su 31 in unit (populate senza `spellFound`, `unpopulatedResultOf` senza il campo).
- Verdi al primo colpo (motivo):
  - `sends characterUpdated when a pending quest is re-armed for the learning part (D-29)`: `PendingQuestStartPublisher` ripubblica già i detentori di ogni update con `startDate` non nulla in `updatedFields`; il riarmo scrive una `startDate` nuova.
  - `keeps the research sheet id of the learning part off the pending quest type (D-31)`: `researchResult` non aveva `@Field` dal piano 14 (il caso pinna l'assenza).

## Gate

- `npx jest src/characters/character-quest-lanes.int-spec.ts src/characters/pending-quest-start.publisher.int-spec.ts test/app.int-spec.ts test/authz/authorization-matrix.int-spec.ts --selectProjects integration --runInBand`: 4 suite, 251 / 251.
- `npx jest src/quests/results src/quests/prizes --selectProjects unit`: 31 / 31.
- `npx jest src/quests/results/quest-result.resolver.int-spec.ts src/quests/outcomes/study-spell-draw.int-spec.ts src/quests/outcomes/spell-learning.int-spec.ts src/quests/quests.resolver.int-spec.ts src/quests/guided/guided-mission.resolver.int-spec.ts test/app.int-spec.ts --selectProjects integration --runInBand`: 6 suite, 265 / 265.
- `npx tsc --noEmit -p tsconfig.json`: 0. SDL committato uguale al rigenerato. Prettier ed ESLint puliti sui file toccati (in `test/app.int-spec.ts` resta il warning preesistente `no-base-to-string`, non toccato).
- Accettazione: `export class PendingQuestLearningSpellResolver` 1; `PendingQuestLearningSpellResolver` nel modulo 2; `test/authz/expected-handlers.ts` senza diff; `D-26` nelle corsie 3; `D-29)` nel publisher 1; `export class QuestPrizesSpellDrawResolver` 1; nel modulo delle quest 2; `spellResearchFailed` nel modello 1; `spellFound` nella populate 2; `D-31)` 2 e `D-29)` 2 nell'int-spec dei risultati; `D-26)` 2 nell'int-spec delle quest; nessun jest rimasto.

## Deviations from Plan

1. **[Rule 3] `test/authz/characters-test-app.ts`:** l'harness dei personaggi registra i resolver a mano (non importa `CharactersModule`, che porta Bull): senza il resolver nuovo il campo non esisteva nello schema di test. Aggiunto accanto a `OwnedPetResolver`.
2. **[Rule 3] `unpopulatedResultOf`:** `QuestResultDraft.spellResearchFailed` è opzionale (piano 13) e il tipo `QuestResult` lo vuole obbligatorio: il foglio non popolato risponde `draft.spellResearchFailed ?? false`.
3. **`dropOrphanResultRefs` non toccata:** la magia orfana di un ref singolo la annulla già la populate di Mongoose (`spellLearned` non ha una regola lì); il caso unitario `nulls an orphan found spell without nulling the result (D-31)` prova che il path è nella populate e che il foglio non popolato serve `null`; la prova sul filo è nell'int-spec dei risultati.
4. **Caso «premio vuoto»** di `spellDraw` provato con `pendingQuests { quest { prizes { spellDraw } } }` dell'oste (quest non popolata → `EMPTY_PRIZES`), nello stesso caso dei blocchi per titolo.

## Threat Flags

Nessuna superficie oltre al piano: T-24-58 (`researchResult` fuori dal filo, caso dedicato), T-24-60 (quattro righe aggiunte, matrice verde, handler invariati) e T-24-61 (`=== true`, casi sul blocco per titolo e sul premio vuoto) mitigati; T-24-57 e T-24-59 accettati come nel piano.

## Self-Check: PASSED
