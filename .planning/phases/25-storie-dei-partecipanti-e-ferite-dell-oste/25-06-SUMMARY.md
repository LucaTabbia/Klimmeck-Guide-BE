---
phase: 25-storie-dei-partecipanti-e-ferite-dell-oste
plan: 06
subsystem: gm
tags: [injuries, innkeeper, overrides, complete-pending-request, sdl]
requires:
  - "applyWoundCorrection e planParticipant con l'origine (25-04)"
  - "QuestResult.injuriesRemoved su schema e SDL (25-05)"
provides:
  - "ParticipantOverrideInput.injuriesRemoved: [InjuryType!] (annullabile) sul filo"
  - "OverrideParticipant.injuries e validazione delle rimozioni in validateOverrides"
  - "asInnkeeperHand(effects) in innkeeper-injuries.ts"
  - "completePendingRequest toglie ferite e scrive le aggiunte come ferite dell'oste"
affects: [25-07, 25-08, 25-09, 25-13, 25-14]
tech-stack:
  added: []
  patterns:
    - "chiave degli effetti presente solo se non vuota (spread condizionale)"
    - "l'origine la marca il chiamante: validateOverrides resta condivisa fra i due flussi"
key-files:
  created: []
  modified:
    - src/models/request/complete-pending-request.model.ts
    - src/quests/outcomes/gm-overrides.ts
    - src/quests/outcomes/gm-overrides.spec.ts
    - src/quests/outcomes/injuries/innkeeper-injuries.ts
    - src/quests/outcomes/injuries/innkeeper-injuries.spec.ts
    - src/quests/outcomes/gm-completion.service.ts
    - src/quests/outcomes/gm-completion.service.int-spec.ts
    - src/quests/pending-requests/complete-pending-request.resolver.int-spec.ts
    - test/app.int-spec.ts
    - src/schema.gql
key-decisions:
  - "il caso esistente «applies the cure on top of the game master override (D-07)» è riscritto: la ferita dell'override resta e injuriesHealed è vuota (ruling 2 e 3, D-14)"
  - "la spec sul filo monta l'app con createCharactersTestApp per rileggere l'origine dalla query character(id)"
requirements: [BE-WOUND-04, BE-WOUND-05]
metrics:
  tasks: 3
  files: 10
  completed: 2026-11-21
---

# Phase 25 Plan 06: Correzioni del completamento semplice Summary

`completePendingRequest` impara a togliere: `ParticipantOverrideInput.injuriesRemoved` è sul filo, la convalida accetta solo ferite portate dal partecipante (altrimenti `OUTCOME_OVERRIDE_INVALID` prima di ogni scrittura) e ogni ferita aggiunta da un override del flusso semplice è scritta come ferita dell'oste, fuori dalla cura dello stesso esito (D-12, D-13, D-14, D-16).

## Commit

| Task | Commit | Messaggio |
|------|--------|-----------|
| 1 RED | fda67a57 | test(gm): expect overrides to remove wounds |
| 1 GREEN | 967d8906 | feat(gm): let overrides remove wounds |
| 2 RED | 045d6391 | test(gm): expect the plain completion to mark innkeeper wounds |
| 2 GREEN | 76a4ddd3 | feat(gm): mark the wounds of a plain completion as the innkeeper's |
| 3 | (questo commit) | docs(phase-25): record plan 06 progress |

## Contratto

Riga aggiunta allo SDL (una sola, in `input ParticipantOverrideInput`, dopo `injuries`):

```graphql
  injuriesRemoved: [InjuryType!]
```

Rispetto a `e87339bb` lo SDL ha 3 righe aggiunte (piani 01, 05, 06) e 0 tolte. `test/authz/expected-handlers.ts` senza diff.

- `OverrideParticipant.injuries`: ferite note e senza doppioni di `snapshot.status.injuries ?? []`.
- `effectsOf`: chiave `injuriesRemoved` solo se la lista (senza doppioni) non è vuota; voce ignota o non portata → `OUTCOME_OVERRIDE_INVALID`.
- `overrideWithinCap` conta `injuriesRemoved` (tetto contato prima dei doppioni).
- `asInnkeeperHand(effects)`: `null` resta `null`; senza ferite aggiunte restituisce lo stesso oggetto; altrimenti aggiunge `innkeeperInjuries` = copia di `injuriesAdded`.
- `GmCompletionService.complete`: `battle: asInnkeeperHand(...)` nel solo `outcomesOf` del completamento semplice; il ciclo condiviso `commit` e `GuidedCompletionService` non cambiano.

## Letterali `OverrideParticipant` toccati

Solo in `src/quests/outcomes/gm-overrides.spec.ts`: i due elementi di `participants` (A e B) ricevono `injuries: []`. `generous` e i letterali nuovi derivano da `participants[0]` per spread. Nessun letterale fuori da questa spec (il resto del codice passa da `overrideParticipantOf`).

## RED: fallimenti attesi e osservati

Task 1 (`gm-overrides.spec.ts`, 7 rossi osservati):

- `carries the wounds the correction removes (D-13)`, `reads a duplicated removal once (D-13)`, `accepts a wound removed and added again in the same correction (D-16)`: chiave `injuriesRemoved` assente dagli effetti.
- `refuses the removal of a wound the participant does not carry (D-13)`, `refuses an unknown wound type among the removals (D-13)`, `counts the removals in the override cap (D-13)`: nessun rifiuto.
- `reads the wounds of the participant from the snapshot (D-13)`: `participant.injuries` `undefined`.
- Pin dello SDL in `test/app.int-spec.ts`: non lanciato al RED (blocco pinnato diverso per costruzione); verde dopo la rigenerazione.
- Jest non fa il type-check: i rossi sono di comportamento, non di compilazione come scriveva il piano.

Verde al primo colpo: `carries no removal key without removals (D-13)` (tre casi). Motivo: prima del campo nessuna chiave veniva mai prodotta; restano come pin della regola «chiave solo se non vuota».

Task 2 (9 rossi osservati):

- `innkeeper-injuries.spec.ts`: i tre casi di `asInnkeeperHand` (funzione non esportata).
- `gm-completion.service.int-spec.ts`: `writes a wound of the override as an innkeeper wound (D-12)`, `turns an ordinary wound into an innkeeper wound when removed and added again (D-16)`, `keeps a wound inflicted by the innkeeper out of the cure of the title block (D-14)`, `still heals an ordinary wound with the cure of the title block (D-14)` (l'origine non veniva scritta e la cura guariva la ferita appena inflitta), più il caso esistente riscritto (vedi Deviations).
- `complete-pending-request.resolver.int-spec.ts` › `removes and inflicts wounds over the wire (D-12, D-13)`: `innkeeperInjuries` vuota alla rilettura.

Verdi al primo colpo, col motivo:

- `removes an ordinary wound listed among the removals (D-13)`, `removes an innkeeper wound listed among the removals (D-13)`, `refuses the removal of a wound the character does not carry (D-13)`: il task 1 porta le rimozioni negli effetti e `planParticipant` le applicava già dal piano 04.
- `keeps the origin of a wound already carried and listed again without removing it (D-16)`: `applyWoundCorrection` (04) marca solo le ferite davvero aggiunte.
- `leaves the origin untouched without overrides (D-12)`: senza override non c'è combattimento, il piano non scrive la chiave.

## Verifica

- unit `gm-overrides.spec.ts` + `input-decorators.spec.ts` + `src/quests/guided`: 195/195
- unit `innkeeper-injuries.spec.ts`: 33/33
- integration `gm-completion.service.int-spec.ts` + `complete-pending-request.resolver.int-spec.ts` (`--runInBand`): 47/47
- integration `test/app.int-spec.ts`: 107/107 (due giri: il primo rigenera lo SDL)
- regressione: intero progetto unit 4609/4609; integration `src/quests src/gm test/app.int-spec.ts test/authz`: 1111/1111 (49 suite)
- `npx tsc --noEmit -p tsconfig.json`: 0; `git diff --exit-code src/schema.gql` pulito dopo il commit
- prettier + eslint sui `.ts` toccati: nessun errore (warning preesistente `no-base-to-string` in `test/app.int-spec.ts:1282`, fuori scope)
- acceptance: `withinCap(override.injuriesRemoved)` 1; `asInnkeeperHand(` in `gm-completion.service.ts` 1; `innkeeperInjuries` in `gm-completion.service.ts` 0

## Deviations from Plan

**1. [Rule 1 - regola cambiata] Caso esistente riscritto nel RED del task 2**
- **Trovato in:** `gm-completion.service.int-spec.ts`, `applies the cure on top of the game master override (D-07)`.
- **Problema:** pinnava il comportamento superato: la cura del blocco guariva la ferita inflitta dall'override nello stesso completamento (`injuriesHealed: [deepCut]`).
- **Rimedio:** rititolato `applies the life cure on top of the game master override and leaves its wound (D-07, Phase 25 D-14)`; la cura della vita resta (1200), la ferita resta a DB e `injuriesHealed` è vuota (ruling 2 e 3).
- **Commit:** 045d6391

**2. [Rule 3 - blocco] Harness della spec sul filo**
- **Problema:** l'app di `complete-pending-request.resolver.int-spec.ts` non montava la query `character` (`Cannot query field "character"`), che il caso nuovo usa per rileggere l'origine.
- **Rimedio:** `createAuthTestApp` → `createCharactersTestApp` con gli stessi `imports` e `overrides`; i nove casi esistenti restano verdi. Il commit RED è stato emendato una volta (locale, mai pubblicato) perché il rosso fosse quello giusto.
- **Commit:** 045d6391

**3. Nota operativa:** la regressione d'integrazione larga ha superato il tempo del comando ed è stata spostata in background dall'ambiente (la regola del repo lo vieta); è stata attesa fino alla fine prima del commit di bookkeeping.

Nessun `npm run build`, nessun riavvio del BE, nessun accesso al DB reale, nessun `requirements mark-complete`.

## Per i piani successivi

- **Stato intermedio dichiarato:** `corrections` del flusso guidato riusa lo stesso input; fino al piano 07 una correzione guidata con `injuriesRemoved` è validata ma la rimozione non è salvata nella bozza.
- `validateOverrides` non decide l'origine: il flusso guidato la marca per conto suo (`handInflictedOf`, piano 09). `asInnkeeperHand` è solo del flusso semplice.
- Chi costruisce un `OverrideParticipant` a mano deve dare `injuries` (obbligatorio); per le rimozioni del guidato (07) vanno date le ferite all'inizio di QUELLO scontro, non quelle dello snapshot.
- Il tetto di difesa conta le rimozioni prima di togliere i doppioni (come `injuries`).
- Il pin `input ParticipantOverrideInput` di `test/app.int-spec.ts` ora contiene `injuriesRemoved`.

## Known Stubs

Nessuno.

## Self-Check: PASSED

- `complete-pending-request.model.ts`, `gm-overrides.ts`, `src/schema.gql` contengono `injuriesRemoved`; `gm-completion.service.ts` contiene `asInnkeeperHand(`
- commit `fda67a57`, `967d8906`, `045d6391`, `76a4ddd3` presenti in `git log`
