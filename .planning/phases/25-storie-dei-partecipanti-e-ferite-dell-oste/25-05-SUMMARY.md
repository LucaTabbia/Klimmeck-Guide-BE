---
phase: 25-storie-dei-partecipanti-e-ferite-dell-oste
plan: 05
subsystem: quests
tags: [injuries, innkeeper, quest-result, sdl]
requires:
  - "QuestResultDraft.injuriesRemoved (25-04)"
provides:
  - "QuestResult.injuriesRemoved: [InjuryType!]! su schema Mongoose e SDL, default lista vuota"
  - "unpopulatedResultOf: injuriesRemoved della bozza, lista vuota se assente"
affects: [25-06, 25-09, 25-12, 25-13, 25-14]
tech-stack:
  added: []
  patterns:
    - "campo additivo non nullo con default dello schema: i fogli di prima si leggono senza migrazione"
key-files:
  created: []
  modified:
    - src/models/quest-result/quest-result.model.ts
    - src/quests/results/quest-result.populate.ts
    - src/quests/results/quest-result.populate.spec.ts
    - src/quests/results/quest-result.resolver.int-spec.ts
    - test/app.int-spec.ts
    - src/schema.gql
key-decisions:
  - "nessuna: campo, decoratori e default come da ruling 6 e dall'<interfaces> del piano"
requirements: [BE-WOUND-04]
metrics:
  tasks: 2
  files: 6
  completed: 2026-11-21
---

# Phase 25 Plan 05: `QuestResult.injuriesRemoved` Summary

Il foglio del risultato porta le ferite tolte dalle correzioni dell'oste in un campo suo, `injuriesRemoved: [InjuryType!]!`, a DB e sul filo; `injuriesHealed` resta delle sole cure (D-13, D-14). I fogli scritti prima della fase rispondono lista vuota grazie al default dello schema, senza migrazione.

## Commit

| Task | Commit | Messaggio |
|------|--------|-----------|
| 1 RED | 2680004b | test(quests): expect the removed wounds on the quest result |
| 1 GREEN | 22ab71e6 | feat(quests): serve the wounds removed by the innkeeper |
| 2 | (questo commit) | docs(phase-25): record plan 05 progress |

## Contratto

```typescript
// src/models/quest-result/quest-result.model.ts, subito dopo injuriesHealed
@Field(() => [InjuryType])
@Prop({ type: [String], enum: Object.values(InjuryType), default: [] })
injuriesRemoved: InjuryType[];
```

Riga aggiunta allo SDL (una sola, in `type QuestResult`, dopo `injuriesHealed`):

```graphql
  injuriesRemoved: [InjuryType!]!
```

Rispetto a `e87339bb` lo SDL ha 2 righe aggiunte (piani 01 e 05) e 0 tolte.

## RED: fallimenti attesi e osservati

- `test/app.int-spec.ts` › `writes the quest result contract into the generated schema`: blocco pinnato diverso (riga mancante). Osservato.
- `quest-result.resolver.int-spec.ts` › `serves the wounds removed by the innkeeper (D-13)` e `serves no removed wound for a result written before the field (D-13)`: `Cannot query field "injuriesRemoved" on type "QuestResult"`. Osservato su entrambi.
- `quest-result.populate.spec.ts` › `reads no removed wound from a draft that carries none (D-13)`: `undefined` invece di `[]`. Osservato.

Verde al primo colpo: `carries the wounds removed by the innkeeper on the unpopulated result (D-13)`. Motivo: `unpopulatedResultOf` spalma la bozza (`...draft`), quindi un `injuriesRemoved` valorizzato passava già; il caso resta come pin del contratto.

## Verifica

- unit `quest-result.populate.spec.ts`: 12/12
- integration `quest-result.resolver.int-spec.ts` + `test/app.int-spec.ts` (`--runInBand`): 135/135
- regressione: unit `src/quests src/gm src/models` 1908/1908; integration `src/quests src/gm` 863/863
- `npx tsc --noEmit -p tsconfig.json`: 0; `git diff --exit-code src/schema.gql` pulito dopo il commit
- prettier + eslint sui `.ts` toccati: nessun errore (un warning preesistente `no-base-to-string` in `test/app.int-spec.ts:1282`, fuori scope)

## Deviations from Plan

Nessuna sul codice. Due note operative:

- **Primo giro GREEN con un rosso spurio:** nella stessa esecuzione che rigenera lo SDL il pin di `test/app.int-spec.ts` ha letto il file non ancora riscritto (1 fallito su 135); al secondo giro, con `src/schema.gql` rigenerato, 135/135. Nessuna modifica al codice fra i due giri.
- **Jest finito in background una volta:** la regressione d'integrazione `src/quests src/gm` ha superato il tempo del comando ed è stata spostata in background dall'ambiente (la regola del repo lo vieta). È stata attesa fino alla fine (863/863) prima di ogni altro passo; `pgrep -fl 'bin/jest'` vuoto a fine piano.

Nessun `npm run build`, nessun riavvio del BE, nessun accesso al DB reale.

## Per i piani successivi

- Nessuno valorizza ancora `injuriesRemoved` da un input: `planParticipant` lo scrive dalla correzione (04), ma le correzioni con rimozioni entrano dal piano 06 (flusso semplice) e 09 (guidato).
- Soccorso, fine dell'apprendimento, esiti senza premio e imboscate non valorizzano il campo: a DB vale il default dello schema.
- Il pin del blocco `type QuestResult` in `test/app.int-spec.ts` ora contiene `injuriesRemoved`: il piano 12 (`backgroundEntryAdded`) aggiunge la sua riga in ordine alfabetico (dopo `arrested`).
- Rigenerazione dello SDL: lanciare due volte `test/app.int-spec.ts` (il primo giro riscrive il file, il secondo verifica il pin).

## Known Stubs

Nessuno.

## Self-Check: PASSED

- `src/models/quest-result/quest-result.model.ts`, `src/quests/results/quest-result.populate.ts`, `src/schema.gql`: contengono `injuriesRemoved`
- commit `2680004b` e `22ab71e6` presenti in `git log`
