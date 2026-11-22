---
phase: 25-storie-dei-partecipanti-e-ferite-dell-oste
plan: 12
subsystem: gm
tags: [background, stories, guided-completion, quest-result, sdl, transaction]
requires:
  - "src/quests/guided/background-additions.ts: additionFor (piano 10)"
  - "MissionDraft.backgroundAdditions nella bozza letta (piano 11)"
  - "GmCommitPlan.afterSeats: scritture in più nella transazione del completamento"
provides:
  - "QuestResult.backgroundEntryAdded: Boolean! su schema e filo"
  - "ParticipantPlanInput.backgroundEntryAdded / QuestResultDraft.backgroundEntryAdded / GmSeatOutcome.backgroundEntryAdded"
  - "GuidedCompletionService.appendBackgroundAdditions: unico scrittore di infos.background fuori dalla creazione"
affects: [25-13, 25-14]
tech-stack:
  added: []
  patterns:
    - "flag del foglio e scrittura derivati dalla stessa funzione rivalidata sulla stessa bozza letta"
    - "scritture accessorie in afterSeats PRIMA della cancellazione della revisione letta: una corsa persa le annulla"
key-files:
  created: []
  modified:
    - src/models/quest-result/quest-result.model.ts
    - src/quests/results/quest-result.populate.ts
    - src/quests/results/quest-result.populate.spec.ts
    - src/quests/results/quest-result.resolver.int-spec.ts
    - src/quests/outcomes/outcome-plan.ts
    - src/quests/outcomes/outcome-plan.spec.ts
    - src/quests/outcomes/gm-completion.service.ts
    - src/quests/outcomes/gm-completion.service.int-spec.ts
    - src/quests/guided/guided-completion.service.ts
    - src/quests/guided/guided-completion.service.int-spec.ts
    - test/app.int-spec.ts
    - src/schema.gql
key-decisions:
  - "la scrittura cicla sui posti della richiesta (ordine dei posti): una voce della bozza per un personaggio fuori dalla richiesta non viene né scritta né rivalidata"
  - "il tetto si rivalida in seatOutcomeOf (in sessione, prima di ogni scrittura): BACKGROUND_ADDITION_TOO_LONG abortisce la transazione"
requirements: [BE-STORY-04, BE-STORY-05]
metrics:
  tasks: 3
  files: 12
  completed: 2026-11-21
---

# Phase 25 Plan 12: Scrittura delle storie al completamento e flag sul foglio Summary

`completeGuidedMission` aggiunge in coda a `infos.background` l'aggiunta di ogni partecipante (un `$push` per posto, nella transazione del completamento, prima della cancellazione della revisione letta) e il foglio di ciascuno lo dice con `QuestResult.backgroundEntryAdded`; `completePendingRequest` non scrive mai un background (D-05, D-06, D-08, D-09, D-10).

## Commit

| Task | Commit | Messaggio |
|------|--------|-----------|
| 1 RED | 293a2a1c | test(quests): expect the background entry flag on the quest result |
| 1 GREEN | 143f99e5 | feat(quests): serve the background entry flag on the quest result |
| 2 RED | 860d2b4a | test(gm): expect the guided completion to write the stories |
| 2 GREEN | a4b47755 | feat(gm): append the background additions at the guided completion |
| 3 | (questo commit) | docs(phase-25): record plan 12 progress |

## Cosa cambia

- **Foglio:** `QuestResult.backgroundEntryAdded` (`@Field(() => Boolean)`, `@Prop` con default `false`), dopo `arrested`. `planParticipant` lo scrive sempre da `input.backgroundEntryAdded ?? false`; `unpopulatedResultOf` lo legge con `?? false`. Il piano d'esito non conosce `infos.*`.
- **Ciclo condiviso:** `GmSeatOutcome.backgroundEntryAdded?` passa a `planParticipant`. `GmCompletionService.complete` (flusso semplice) non lo valorizza.
- **Completamento guidato:** `seatOutcomeOf` mette `backgroundEntryAdded: additionFor(draft.backgroundAdditions, snapshot._id) !== null`; `afterSeats` chiama `appendBackgroundAdditions` (per ogni posto con aggiunta non nulla un `characterModel.updateOne({ _id }, { $push: { 'infos.background': addition } }, { session })`, `matchedCount !== 1` → `OUTCOME_OVERRIDE_INVALID`) e POI `deleteReadRevision`. Nessuna lettura del background, nessuna riscrittura.
- **SDL:** una riga aggiunta in `type QuestResult` (`  backgroundEntryAdded: Boolean!`, dopo `arrested: Boolean!`). Dalla base `e87339bb`: 18 righe aggiunte, 0 tolte. `expected-handlers` senza diff.

## RED attesi e osservati

Task 1 (8 fallimenti):
- unit: `drafts the result sheet` (foglio intero senza il flag); i tre casi `marks the result…` / `marks no background entry by default…` (flag `undefined`); `carries the background entry flag on the unpopulated result` (falso mancante).
- int: i due casi del resolver con `Cannot query field "backgroundEntryAdded" on type "QuestResult"`; il pin `writes the quest result contract into the generated schema`.
- `never touches the background in the character update (D-08)` era verde già al RED (pin di un'assenza).

Task 2 (6 fallimenti, tutti nel completamento guidato): `appends the addition at the end…`, `marks the result of each participant…`, `writes each addition to its own participant`, `creates the list for a character written without a background`, `refuses at completion an addition over the limit…` (promessa risolta), `deletes the draft with its additions` (background invariato).
Verdi già al RED perché pinnano un'assenza di scrittura: `writes nothing for a participant without an addition`, `writes no background when the completion is refused`, `writes no background when the draft was saved after the read`, `ignores a blank addition…`, `writes nothing for an addition cleared…`, e il caso D-10 del flusso semplice. Dopo il GREEN il caso «saved after the read» prova davvero il rollback: il `$push` avviene prima della cancellazione della revisione che fallisce.

## Casi esistenti toccati per il flag sul foglio

- `outcome-plan.spec.ts` › `a won quest without a fight` › `drafts the result sheet`: `backgroundEntryAdded: false` nel `toEqual` dell'intero foglio. Nessun altro caso confronta l'intero foglio di `planParticipant`.
- `gm-completion.service.int-spec.ts`: il corpo di `deletes the guided draft of the request in its transaction (D-25)` è stato estratto nell'helper `draftedWorldMission(draft)` (Boy Scout), riusato dal caso D-10; asserzioni invariate.

## File che nominano `'infos.background'`

- Prima della fase (`git grep -l "'infos.background'" e87339bb -- src`): nessuno.
- Dopo, non spec: `src/quests/guided/guided-completion.service.ts` (unico scrittore).
- Dopo, spec: `src/characters/characters-ownership.int-spec.ts` (piano 10), `src/quests/guided/guided-completion.service.int-spec.ts`.
- `grep -c "infos.background"` su `gm-completion.service.ts` e `outcome-plan.ts`: 0.

## Deviazioni dal piano

1. **Caso in più (Rule 2):** `writes each addition to its own participant (D-06)` — due aggiunte salvate in ordine inverso ai posti, ognuna finisce sul proprio personaggio.
2. **Caso D-10 più stretto del piano:** il completamento semplice gira su una worldMission con una bozza guidata che PORTA un'aggiunta (seminata a DB): la bozza sparisce, nessun background cambia, flag falso su fogli e draft restituiti.
3. La scrittura cicla sui personaggi letti prima della transazione (stessi id e stesso ordine dei posti in sessione): serve solo l'`_id`.

Nessun `npm run build`, nessun `.env` letto, BE su `dist` non toccato.

## Verifica

- Unit intero: 4701 verdi.
- Integration largo (`src/quests src/gm test/app test/authz`, `--runInBand`): 49 suite, 1166 verdi.
- `npx tsc --noEmit -p tsconfig.json`: 0. Prettier + eslint sui file toccati: nessun errore (resta il warning preesistente `no-base-to-string` in `test/app.int-spec.ts:1286`).
- SDL rigenerato uguale al committato; 18 aggiunte / 0 tolte dalla base.

## Threat model

T-25-37 (transazione: casi «refused» e «saved after the read»), T-25-38 (solo `$push`: caso che confronta le voci di prima), T-25-39 (stessa `additionFor` per flag e scrittura), T-25-40 (bozza seminata a 1001 grafemi rifiutata), T-25-41 (caso «plain completion») mitigati. Nessuna superficie nuova fuori dal modello.

## Known Stubs

Nessuno.

## Per i piani successivi

- 25-13 (gate): il BE dal ramo serve `QuestResult.backgroundEntryAdded`; i fogli di prima rispondono `false` senza migrazione.
- 25-14 (handoff): dichiarare che la voce nuova è l'ULTIMA di `infos.background`, che il flag è vero solo dal completamento guidato e che `characterUpdated` esce per il `$push` come per ogni scrittura del personaggio (non provato in questo piano: il publisher ascolta il change stream).

## Self-Check: PASSED

Commit 293a2a1c, 143f99e5, 860d2b4a, a4b47755 presenti in `git log`; i dodici file elencati esistono e sono committati.
