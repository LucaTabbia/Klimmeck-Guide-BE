---
phase: 24-origini-delle-magie-quest-void-e-shamanic
plan: 14
subsystem: quests
tags: [spells, learning, research, pending-quest, outcome-writer, tdd]
requires: ["24-13"]
provides:
  - "PendingQuest.learningSpell e PendingQuest.researchResult (solo Mongoose, default null)"
  - "QuestResult.spellFound (solo @Prop, il filo arriva nel piano 17) e QuestResultDraft.spellFound"
  - "OutcomeWriter.closePendingQuest (cancella o riarma, filtro learningSpell nullo, StaleResolution)"
  - "recordParticipant e CommittedOutcome.learnings (CommittedLearning), deliver che pianifica la fine dell'apprendimento"
affects: ["24-15", "24-16", "24-17", "24-18"]
tech-stack:
  added: []
  patterns: ["chiusura condizionata della PendingQuest come guardia d'idempotenza", "un solo punto che smista foglio da notificare e apprendimento da pianificare"]
key-files:
  created: []
  modified:
    - src/models/pending-quest.model.ts
    - src/models/quest-lanes.schema.spec.ts
    - src/models/quest-result/quest-result.model.ts
    - src/quests/outcomes/outcome-plan.ts
    - src/quests/outcomes/outcome-plan.spec.ts
    - src/quests/outcomes/outcome-writer.service.ts
    - src/quests/outcomes/outcome-writer.spec.ts
    - src/quests/outcomes/quest-resolution.service.ts
    - src/quests/outcomes/study-spell-draw.int-spec.ts
    - src/quests/outcomes/boss-resolution.service.ts
    - src/quests/outcomes/boss-resolution.int-spec.ts
    - src/quests/outcomes/rescue-resolution.service.ts
    - src/quests/outcomes/aid-rescue.int-spec.ts
decisions:
  - "Il foglio della ricerca si scrive e si consegna subito con spellFound; la PendingQuest di chi ha trovato una magia è riarmata (startDate = fine della ricerca, waitingTime = tempo di apprendimento) invece di essere cancellata (D-26, D-31)"
  - "closePendingQuest filtra learningSpell nullo in entrambi i rami: un secondo trigger abortisce l'intera transazione, foglio compreso"
  - "Per il foglio della ricerca riuscita non parte questEnd: il push spellResearchSucceeded col suo id arriva nel piano 16 (CommittedLearning.resultId, spellName)"
metrics:
  completed: 2026-11-16
  tasks: 3
  commits: 5
---

# Phase 24 Plan 14: fine della «Fase di ricerca» sul database — Summary

Alla fine della ricerca con una magia trovata il `QuestResult` normale si scrive nella transazione dell'esito con `spellFound` = magia sorteggiata e `spellLearned` nullo; la `PendingQuest` del partecipante non è cancellata ma riarmata per l'apprendimento (`startDate` = `resolvedAt`, `waitingTime` = tempo di apprendimento, `learningSpell`, `researchResult` = id del foglio), il personaggio resta sulla corsia standard e dopo il commit parte un job `resolve` con l'id deterministico della nuova `startDate`. Individuale, gruppo boss e soccorso passano dalla stessa chiusura; senza magia trovata tutto resta come oggi.

## Commit

| Task | Commit | Subject |
|------|--------|---------|
| 1 (RED) | 4561d24d | test(quests): expect the research sheet and the re-armed pending quest |
| 1 (GREEN) | 3807663f | feat(quests): write the research sheet and re-arm the pending quest |
| 2 (RED) | dc16f48c | test(quests): expect a learning part per member of a group |
| 2 (GREEN) | a027f85e | feat(quests): open the learning part per member of a group |
| 3 | (questo) | docs(phase-24): record plan 14 progress |

## RED

- Task 1, unit: 14 falliti su 191. Atteso «compilazione di ts-jest»; osservato a runtime (diagnostica di ts-jest disattivata, come nel piano 13): path `learningSpell`/`researchResult` assenti dallo schema, `spellFound` indefinito nella bozza (6 casi), `closePendingQuest`/`recordParticipant` non funzioni (5 casi), `scheduleResolution` mai chiamato, `emptyCommitted()` senza `learnings`.
- Task 1, integration (`study-spell-draw.int-spec.ts`): 6 falliti su 32. `spellFound` scartato dallo schema strict (`undefined`), `PendingQuest` cancellata con la corsia ancora occupata, nessun job `resolve`, push `questEnd` inviato per il foglio della ricerca; il caso «second trigger» falliva sulla `PendingQuest` già cancellata.
- Task 2: 2 falliti su 41, entrambi con `PendingQuest` nulla mentre `quests.pendingQuest` puntava ancora al suo id (esattamente il fallimento atteso); le asserzioni precedenti (sequenza dei tiri, `spellFound` sul foglio) erano già verdi.
- Verdi al primo colpo: nessuno.

## Sequenze dei tiri dei casi di gruppo

- Boss (due mage, `prizes.spellDraw: true`, combattimento scritto): `chance.load([0, 0, 0.9, 0])`, verificato con `chance.drawn` = `[0, 0, 0.9, 0]`: per posto, nell'ordine dei posti, soglia e scelta del sorteggio; il primo posto (0, 0) trova la magia, il secondo (0.9) manca la soglia. Nessun altro tiro (nessun bottino né pet sulla quest).
- Soccorso (soccorritore mage, `prizes.spellDraw: true` scritto sull'aid): `chance.load([0, 0])`, `chance.drawn` = `[0, 0]`.

## Gate

- `npx jest src/models/quest-lanes.schema.spec.ts src/quests/outcomes/outcome-writer.spec.ts src/quests/outcomes/outcome-plan.spec.ts --selectProjects unit`: 191 / 191.
- `npx jest src/quests/outcomes/study-spell-draw.int-spec.ts src/quests/outcomes/quest-resolution.service.int-spec.ts src/quests/outcomes/quest-combat.int-spec.ts --selectProjects integration --runInBand`: 3 suite, 78 / 78.
- `npx jest src/quests/outcomes/boss-resolution.int-spec.ts src/quests/outcomes/aid-rescue.int-spec.ts src/quests/outcomes/aid-timeout.int-spec.ts src/quests/outcomes/dungeon-aid.int-spec.ts src/quests/outcomes/companion-defeat-rescue.int-spec.ts --selectProjects integration --runInBand`: 5 suite, 85 / 85.
- Controllo più largo: `npx jest src/quests --selectProjects unit` 1 627 / 1 627; `npx jest src/quests src/models --selectProjects unit` 1 823 / 1 823.
- `npx tsc --noEmit -p tsconfig.json`: 0. `git diff --exit-code src/schema.gql`: pulito. Prettier ed ESLint puliti sui file toccati.
- Accettazione: `async closePendingQuest` 1, `export function recordParticipant` 1, `closePendingQuest` in `quest-resolution.service.ts` 1 e `deletePendingQuest` 0, `researchResult` nel modello 1, `learningSpell|researchResult|spellFound` nello SDL 0, `D-31)` nell'int-spec dello studio 5 (uno è il caso preesistente «teaches a spell drawn … (D-31)» di una fase precedente), `D-26)` 4; `closePendingQuest` 1 nel boss e 1 nel soccorso, 0 in `gm-completion.service.ts`; `recordParticipant` 2 nel boss e 2 nel soccorso; `D-26, D-31)` ≥ 1 in entrambe le int-spec; nessun jest rimasto.

## Spec esistenti toccate

- `outcome-plan.spec.ts`, `drafts the result sheet`: il foglio intero ha ora `spellFound: null` (il piano lo scrive sempre).
- `outcome-writer.spec.ts`, `emptyCommitted › hands out fresh arrays…`: l'atteso include `learnings: []`; il fake del modello `PendingQuest` ha anche `updateOne` e lo scheduler finto `scheduleResolution`.

## Deviations from Plan

1. **[Rule 2] Tre casi unitari in più su `closePendingQuest`** (cancellazione con filtro `learningSpell: null`, riarmo col set esatto, `StaleResolution` in entrambi i rami): il piano li prova solo in integrazione; i casi pinnano filtro e set letterali della mitigazione T-24-44.
2. **[Rule 3] Due spec esistenti aggiornate** (sopra): asserzioni con `toEqual` sull'intero foglio e sull'intero `emptyCommitted()`.
3. Il caso «keeps the character engaged» confronta `status.spellStates` con `[]` (il quester di base non conosce magie): è l'«invariato» del piano.

## Nota per il piano 15

- Il job pianificato alla fine della ricerca porta `startDate` = fine della ricerca: il trigger della fine dell'apprendimento arriva su `loadStandardTrigger`, che oggi carica la `PendingQuest` e smista per tipo di quest (anche `group`/`rescue`). Il piano 15 deve deviare PRIMA dello smistamento ogni `PendingQuest` con `learningSpell` valorizzato: oggi quel trigger finirebbe in `closePendingQuest` e uscirebbe `stale` senza scrivere (nessun danno, ma la magia non si impara).
- `researchResult` dà quest e proprietario per il secondo foglio anche se la quest di gruppo è già conclusa.

## Threat Flags

Nessuna superficie nuova sul filo: due campi solo Mongoose sulla `PendingQuest`, uno sul foglio, SDL senza diff. T-24-44 (chiusura condizionata, caso «writes nothing on a second trigger»), T-24-46 (nessun `@Field`) e T-24-47 (riarmo nella transazione del gruppo) mitigati; T-24-45 trasferito allo sweep del piano 15.

## Self-Check: PASSED
