---
phase: 22-completamento-guidato-missioni
plan: 14
subsystem: quests
tags: [guided-mission, rewards, graphql, authz]
requires: ["22-13"]
provides:
  - "PrizeCatalogueEntry, SpellCatalogueEntry, MissionPrizeCatalogue, MissionPrizeAllowance, MissionPrizeOptionsInput, ChosenPrizeRefs, ceilingTableOf, missionPrizeOptionsOf, assertPrizeAllowed (mission-prizes.ts)"
  - "chosenRewardsOf(prize, catalog): DrawnRewards (chosen-rewards.ts)"
  - "MissionPrizeOptionsService: optionsFor, readCatalogue, allowanceFor (mission-prize-options.service.ts)"
  - "query missionPrizeOptions(characterId: ID!, pendingQuestId: ID!): MissionPrizeOptions!"
affects: [22-15, 22-16, 22-17, 22-18]
tech-stack:
  added: []
  patterns: ["una sola funzione pura per opzioni e rivalidazione: voci del blocco ∪ catalogo sotto il tetto del titolo"]
key-files:
  created:
    - src/quests/guided/mission-prizes.ts
    - src/quests/guided/mission-prizes.spec.ts
    - src/quests/guided/chosen-rewards.ts
    - src/quests/guided/chosen-rewards.spec.ts
    - src/quests/guided/mission-prize-options.service.ts
  modified:
    - src/quests/guided/mission-draft.wire.ts
    - src/quests/guided/guided-mission.resolver.ts
    - src/quests/guided/guided-mission.resolver.int-spec.ts
    - src/quests/guided/guided-mission.module.ts
    - test/app.int-spec.ts
    - test/authz/expected-handlers.ts
    - test/authz/handler-fixtures.ts
    - test/authz/authorization-matrix.int-spec.ts
    - src/schema.gql
decisions:
  - "Tetto: petRarityCapOf(ceilingTableOf(type), rango); worldMission → tabella boss, story → tabella enemy; legend → hero, titolo assente o ignoto → rookie"
  - "Rarità fuori dall'enum o assente esclusa dal catalogo (fail-closed come isRarity del premio pet); minXpToLearn non numerico o non finito escluso"
  - "chosenRewardsOf scarta anche le voci di oggetto assenti dal catalogo delle rarità (come drawRewards), oltre a pet e magia orfani"
  - "Un id di personaggio malformato è OUTCOME_NOT_PARTICIPANT come un personaggio fuori dalla richiesta"
  - "Blocco vuoto locale al servizio (randomLoot [] perché QuestPrizes.randomLoot è non nullo) invece di esportare EMPTY_PRIZES dal resolver dei premi"
  - "Documenti dei cataloghi ordinati per id; equipaggiamenti con populate di addedSpell come EquipmentItemsService"
metrics:
  duration: "~40 min"
  completed: 2026-11-14
---

# Phase 22 Plan 14: catalogo dei premi per titolo Summary

Una sola funzione pura, `missionPrizeOptionsOf`, decide quali oggetti, pet e magie l'oste può assegnare a un partecipante: le voci del blocco del suo titolo sono sempre ammesse (anche sopra il tetto, anche la magia del blocco a un non caster), il resto del catalogo passa solo sotto il tetto di rarità del titolo (pet compresi) e le magie solo per un caster con `minXpToLearn ≤ xp` e non già note. `assertPrizeAllowed` rivalida un premio contro lo stesso insieme (`OUTCOME_OVERRIDE_INVALID`), e `MissionPrizeOptionsService.allowanceFor(request, character, catalogue)` è il solo punto che i piani 15 e 16 chiamano. `chosenRewardsOf` trasforma un premio scelto in `DrawnRewards` senza tiri. La query `missionPrizeOptions` (innkeeper, fuori dall'audit) serve blocco popolato e sanificato, cataloghi filtrati, tetto e titolo.

## Tetti per titolo e tabella

| Titolo | worldMission (tabella boss) | story (tabella enemy) |
|--------|-----------------------------|-----------------------|
| rookie | common | common |
| adventurer | uncommon | common |
| paladin | rare | uncommon |
| mage | ultrarare | rare |
| hero / legend | legendary | ultrarare |

## Commit

| Task | Commit | Subject |
|------|--------|---------|
| 1 RED | 6682e187 | test(rewards): pin the rank filtered prize options |
| 1 GREEN | e3b57b81 | feat(rewards): filter the mission prizes by rank |
| 2 RED | 14c51548 | test(gm): pin the mission prize options on the wire |
| 2 RED (matrice) | bd203e6e | test(authz): count the mission prize options in the matrix |
| 2 GREEN | daaa4287 | feat(gm): serve the mission prize options |

## Fallimenti attesi in RED

- Task 1: le due suite falliscono alla risoluzione dei moduli `mission-prizes` e `chosen-rewards` assenti.
- Task 2: `handler-fixtures.spec.ts` rosso su «validates every document against the schema (D-01)»; `app.int-spec.ts` rosso su «adds the mission prize options to the schema (D-17)» e sulla superficie pinnata (17 voci); i 5 casi nuovi del resolver rossi per la query assente.

Nessun caso verde al primo colpo prima del codice; dopo il GREEN tutti i casi sono passati alla prima esecuzione (un solo giro di `tsc` sul tipo del rango, corretto con `isGeneratedRank`).

## Esiti

- unit `src/quests/guided` 45/45 (8 suite); `handler-fixtures.spec.ts` + guided 52/52.
- integration `app.int-spec` + matrice + resolver 236/236; `mission-draft.service` + simulazione 20/20.
- `tsc` 0; `src/schema.gql` +12 righe (tipo `MissionPrizeOptions`, riga in `Query`), 0 tolte da `c6079ca3`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Spec fuori piano] Matrice di autorizzazione 15 → 16 righe HTTP**
- **Found during:** Task 2
- **Issue:** `authorization-matrix.int-spec.ts` pinna il numero di handler HTTP dell'oste; la query nuova lo porta a 16.
- **Fix:** conteggio aggiornato in un commit dedicato prima del GREEN.
- **Files modified:** test/authz/authorization-matrix.int-spec.ts
- **Commit:** bd203e6e

Nessun'altra deviazione.

## Threat Flags

Nessuna superficie nuova oltre a quella del threat model (T-22-34, T-22-35 mitigati: una regola sola con casi di rifiuto, `@Roles(innkeeper)`, superficie pinnata, matrice, FORBIDDEN dell'adventurer, nessun audit per la query).

## Self-Check: PASSED
