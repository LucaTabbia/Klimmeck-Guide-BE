---
phase: 25-storie-dei-partecipanti-e-ferite-dell-oste
plan: 11
subsystem: gm
tags: [background, stories, mission-draft, sdl, validation]
requires:
  - "src/quests/guided/background-additions.ts: additionEntriesOf, BACKGROUND_ADDITION_MAX_FORM_LENGTH (piano 10)"
  - "MissionDraftService.write: unica scrittura della bozza, incrementa rev"
provides:
  - "MissionDraftStep.stories"
  - "MissionDraft.backgroundAdditions a DB (MissionBackgroundAdditionRecord) e sul filo (MissionBackgroundAddition)"
  - "MissionBackgroundAdditionInput e SaveMissionDraftInput.backgroundAdditions"
  - "ramo del salvataggio: MissionDraftSaveService.backgroundAdditionsOf"
affects: [25-12, 25-13, 25-14]
tech-stack:
  added: []
  patterns:
    - "sezione della bozza validata dalle regole pure prima dell'unica scrittura; il servizio controlla solo l'appartenenza alla bozza"
key-files:
  created: []
  modified:
    - src/quests/guided/mission-draft.model.ts
    - src/quests/guided/mission-draft.inputs.ts
    - src/quests/guided/mission-draft.inputs.spec.ts
    - src/quests/guided/mission-draft.wire.ts
    - src/quests/guided/mission-draft.mapper.ts
    - src/quests/guided/mission-draft.mapper.spec.ts
    - src/quests/guided/mission-draft.service.ts
    - src/quests/guided/mission-draft-save.service.ts
    - src/quests/guided/mission-draft-save.service.int-spec.ts
    - src/quests/guided/guided-mission.resolver.int-spec.ts
    - src/validation/input-decorators.spec.ts
    - test/app.int-spec.ts
    - src/schema.gql
key-decisions:
  - "l'appartenenza alla bozza si controlla su TUTTE le voci prima delle regole pure: un estraneo vince su doppione e tetto"
  - "nessuna tabella esaustiva sui passi nel repo: `stories` entra solo nell'enum"
requirements: [BE-STORY-02, BE-STORY-03]
metrics:
  tasks: 3
  files: 13
  completed: 2026-11-21
---

# Phase 25 Plan 11: Aggiunte ai background nella bozza e passo `stories` Summary

La bozza del flusso guidato ha il passo `stories` e la sezione `backgroundAdditions` (un testo per partecipante) su schema, input e filo; `saveMissionDraft` la salva sostituendo l'intera lista, lascia cadere i testi vuoti e rifiuta oltre 1000 grafemi con `BACKGROUND_ADDITION_TOO_LONG` (D-05, D-06, D-07).

## Commit

| Task | Commit | Messaggio |
|------|--------|-----------|
| 1 RED | 3731d504 | test(gm): expect the background additions on the mission draft |
| 1 GREEN | b2cc7ca8 | feat(gm): add the stories step and the background additions section |
| 2 RED | f377c256 | test(gm): expect the draft to save the background additions |
| 2 GREEN | 4b849d41 | feat(gm): save the background additions in the mission draft |
| 3 | (questo commit) | docs(phase-25): record plan 11 progress |

## Cosa cambia

- **`mission-draft.model.ts`**: `MissionDraftStep.stories`; `MissionBackgroundAdditionRecord` (`character`, `text`, `_id: false`) e il suo schema; `MissionDraft.backgroundAdditions` con default lista vuota.
- **`mission-draft.service.ts`**: `MissionDraftSections` comprende `backgroundAdditions`; `draftDocumentOf` nasce con `backgroundAdditions: []`.
- **`mission-draft.inputs.ts`**: `MissionBackgroundAdditionInput` (`@IsObjectIdHex` sull'id; `@IsString` + `@MaxLength(BACKGROUND_ADDITION_MAX_FORM_LENGTH)` sul testo, nessun `@IsNotEmpty`); `SaveMissionDraftInput.backgroundAdditions` annullabile con `@ArrayMaxSize(MAX_OVERRIDE_ENTRIES)`, `@ValidateNested`, `@Type`.
- **`mission-draft.wire.ts` / `mission-draft.mapper.ts`**: tipo `MissionBackgroundAddition`, campo sulla vista, mapper con `?? []` (bozze di prima).
- **`mission-draft-save.service.ts`**: ramo `if (input.backgroundAdditions != null)` e metodo privato `backgroundAdditionsOf(request, draft, incoming)`: ogni voce passa da `participantIn(draftCharactersOf(...))`, poi `additionEntriesOf`. Nessuna regola di testo nel servizio. Commento di testa aggiornato.

## Le undici righe aggiunte dello SDL

```graphql
type MissionBackgroundAddition {
  character: ID!
  text: String!
}

input MissionBackgroundAdditionInput {
  characterId: ID!
  text: String!
}

# in type MissionDraft
  backgroundAdditions: [MissionBackgroundAddition!]!
# in enum MissionDraftStep
  stories
# in input SaveMissionDraftInput
  backgroundAdditions: [MissionBackgroundAdditionInput!]
```

`git diff e87339bb -- src/schema.gql`: 17 righe aggiunte, 0 tolte. `test/authz/expected-handlers.ts` senza diff (nessun handler nuovo).

## Tabella esaustiva dei passi

Nessuna. Il grep di `MissionDraftStep` in `src/` e `test/` trova solo l'enum, il suo `registerEnumType`, l'input, la vista, il valore iniziale `teleport` e le spec: nessuno `switch` né mappa sui passi. `stories` entra solo nell'enum (e, per `enum: Object.values(MissionDraftStep)`, nello schema Mongoose).

## Fallimenti RED attesi e osservati

**Task 1** — unit, 10 rossi: i cinque casi nuovi dell'input che dipendono dalle classi e dal passo (`MissionBackgroundAdditionInput` e `MissionDraftStep.stories` inesistenti), i due casi nuovi del mapper più il caso esistente «maps a draft record to the wire» (campo `backgroundAdditions` atteso nella vista), due del pin degli input (`covers exactly the inputs of the generated schema`, `validates every schema field of MissionBackgroundAdditionInput`). Integrazione `test/app.int-spec.ts`: 2 rossi, i due pin («adds the guided mission draft to the schema», «adds the guided mission draft save to the schema»).

**Task 2** — 16 rossi: 13 nel `describe('background additions')` del servizio (nulla a DB, nessun rifiuto) e 3 sul filo.

**Verdi al primo colpo (dichiarati):**
- Task 1: i casi «accepts … empty text», «accepts a background addition of the form cap» e «accepts a save without the additions section» passano anche senza la classe (un oggetto senza decoratori non ha errori): diventano vincolanti col GREEN.
- Task 2: `saves the stories step (D-05)` (il passo è del task 1: il caso pinna il salvataggio), `accepts a section with an empty text for every participant (D-06)` (con la sezione ignorata la lista resta comunque vuota: verde per la ragione sbagliata nel RED, giusta nel GREEN) e, sul filo, `answers a form error for an addition over the wire cap (D-07)` (il `@MaxLength` è del task 1).

## Casi nuovi

- `mission-draft.inputs.spec.ts`: i casi del piano più `validates each background addition of the section (D-06)` (una voce senza personaggio dentro la sezione → errore su `backgroundAdditions`, istanza della classe annidata: pinna `@ValidateNested` + `@Type`).
- `mission-draft.mapper.spec.ts`: i due del piano; il caso d'insieme esistente attende `backgroundAdditions: []`.
- `mission-draft-save.service.int-spec.ts`, `describe('background additions')`: i quattordici del piano (il rifiuto a 1001 grafemi manda anche una voce valida prima di quella troppo lunga: niente scrittura parziale, `rev` invariata).
- `guided-mission.resolver.int-spec.ts`, `describe('mission draft save') › describe('background additions')`: i quattro del piano; il primo manda anche una voce vuota per il secondo partecipante.

## Deviations from Plan

Nessuna deviazione di sostanza. Un caso unit in più (vedi sopra). Lo SDL si è rigenerato verde alla prima esecuzione di `test/app.int-spec.ts` dopo il GREEN (nessun bisogno della seconda).

## Verifica

- Unit del task 1 (tre spec): 86 verdi. Unit `src/quests/guided`: 143 verdi. Unit, intero progetto: 4696 verdi.
- Integrazione `test/app.int-spec.ts` + matrice: 238 verdi. Integrazione del salvataggio, del resolver guidato e del servizio della bozza: 95 verdi.
- Integrazione larga (`src/quests src/gm test/app test/authz`): 1152 verdi (eseguita da sola; oltre i 180 s il comando è passato in background ed è stato atteso fino alla fine).
- `npx tsc --noEmit -p tsconfig.json` esce 0 dopo ogni GREEN; `src/schema.gql` rigenerato uguale al committato.
- Accettazione: `MaxLength(BACKGROUND_ADDITION_MAX_FORM_LENGTH)` 1; `additionEntriesOf(` 1 nel servizio; `countGraphemes|exceedsGraphemeLimit|.trim()` 0 nel servizio; nessun jest rimasto vivo.
- Prettier ed eslint sui file toccati, uno per uno (solo l'avviso preesistente `no-base-to-string` in `test/app.int-spec.ts:1286`). Nessun `npm run build`, nessun riavvio del BE, nessuna lettura di `.env`.

## Threat Flags

Nessuna superficie fuori dal modello. T-25-32: `@MaxLength(8000)`, `@ArrayMaxSize` e tetto di dominio provati. T-25-33: nessun handler nuovo, matrice verde. T-25-34: `participantIn` provato dal caso dell'estraneo. T-25-35 accettata (da dichiarare nel handoff, piano 14). T-25-36: `MissionBackgroundAdditionInput` in `VALIDATED_INPUTS`.

## Per i piani successivi

- **12:** la bozza letta `lean` porta `backgroundAdditions` (voci `{ character: ObjectId, text }`, già ripulite; `undefined` sulle bozze di prima): al completamento `additionFor(draft.backgroundAdditions, characterId)`. Ogni salvataggio della sezione passa da `drafts.write` e incrementa `rev` (provato): la guardia di revisione del completamento vale anche per le aggiunte. `QuestResult.backgroundEntryAdded` va nel blocco pinnato di `test/app.int-spec.ts`.
- **12 (ordine dei rifiuti):** estraneo (`OUTCOME_NOT_PARTICIPANT`) → doppione (`OUTCOME_OVERRIDE_INVALID`) → tetto (`BACKGROUND_ADDITION_TOO_LONG`).
- **14 (handoff):** undici righe di SDL; il testo vuoto è accettato e cancella l'aggiunta salvata; i testi finiscono nel log di audit di `saveMissionDraft`.

## Known Stubs

Nessuno. Le aggiunte salvate non vengono ancora scritte su `infos.background`: lo fa il piano 12 (dichiarato dal piano).

## Self-Check: PASSED

File modificati presenti e commit 3731d504, b2cc7ca8, f377c256, 4b849d41 nel log.
