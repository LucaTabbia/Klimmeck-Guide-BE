---
phase: 08-travel-lifecycle-travel-01
plan: 12
subsystem: travel
tags: [travel, graphql, authz, owner-only, bull, schema]
requires:
  - "08-05: startTravelFilter / startTravelUpdate / classifyUnstarted / UnstartedSnapshot"
  - "08-08: TravelPlanner.planFree, TravelScheduler.schedule, TravelPlanningModule, FakeTravelQueue, persistTravelWorld"
  - "08-10: TravelModule (completamento, sweep, processor) montato in AppModule"
  - "08-11: viaggio automatico all'accettazione della corsia standard"
provides:
  - "src/models/request/travel-request.model.ts: input TravelRequest { id: String!, poiId: String! } (riusabile dal teleport 08-13)"
  - "src/models/travel-preview.model.ts: type TravelPreview { distance: Float!, duration: Float!, road: TravelPath! }"
  - "src/travel/travel.service.ts: TravelService.startTravel (un solo update condizionale + job best-effort) e TravelService.preview (stesso planFree, nessuna scrittura); esportato da TravelModule"
  - "src/travel/travel.resolver.ts: startTravel (Mutation) e travelPreview (Query) owner-only, poiId malformato ⇒ NOT_FOUND 'Luogo non trovato'"
  - "src/schema.gql: startTravel, travelPreview, input TravelRequest, type TravelPreview (solo aggiunte)"
affects: [08-13, 08-14]
tech-stack:
  added: []
  patterns:
    - "avvio del viaggio = planFree (letture lean) → findOneAndUpdate condizionale → rilettura solo per il codice → schedule best-effort"
    - "preview e avvio condividono lo stesso piano: stessi numeri, stessi codici"
key-files:
  created:
    - src/models/request/travel-request.model.ts
    - src/models/travel-preview.model.ts
    - src/travel/travel.service.ts
    - src/travel/travel.resolver.ts
    - src/travel/travel.service.int-spec.ts
    - src/travel/travel.resolver.int-spec.ts
  modified:
    - src/travel/travel.module.ts
    - test/app.int-spec.ts
    - src/schema.gql
key-decisions:
  - "startTravel risponde CommonResponse { response: 'Viaggio iniziato', successful: true }: lo stato arriva su characterUpdated"
  - "travelPreview è una Query owner-only (D-18): anche la sola lettura del percorso è riservata al proprietario"
  - "TravelModule importa AuthzModule per il guard owner-only ed esporta TravelService"
  - "poiId malformato o inesistente ⇒ NOT_FOUND 'Luogo non trovato' (poiIdOf nel resolver, mai new Types.ObjectId su input non validato)"
metrics:
  duration: 10 min
  completed: 2026-10-21
  tasks: 2
  files: 9
---

# Phase 8 Plan 12: startTravel e travelPreview owner-only Summary

`TravelService` avvia il viaggio libero con un solo `findOneAndUpdate` condizionale (`startTravelFilter`: personaggio attivo, `activeTravel` null, `pendingQuest` null, posizione = snapshot del piano), rilegge solo per scegliere il codice (`classifyUnstarted`) e poi accoda il job con `TravelScheduler.schedule` (fallimento ⇒ WARN, viaggio valido); `preview` usa lo stesso `planFree` e non scrive nulla. `TravelResolver` espone `startTravel` (Mutation) e `travelPreview` (Query), entrambe `@OwnsCharacter(…, { ownerOnly: true })`; il real boot le enumera nelle whitelist ownership e owner-only e lo SDL cresce solo di `startTravel`, `travelPreview`, `input TravelRequest`, `type TravelPreview`.

Base del piano (HEAD all'inizio): `5a11b57`. `git diff 5a11b57 -- src/schema.gql | grep -E '^-[^-]'` → vuoto (diff solo additivo).

## Tasks

| # | Task | Commits |
|---|------|---------|
| 1 | TravelService: avvio condizionale con job e preview senza scritture | ec6e450 (RED), 0454ca9 (GREEN) |
| 2 | TravelResolver owner-only, whitelist e SDL del boot reale, prova sul filo | 37be209 (RED), 72e3bee (GREEN, con `src/schema.gql`) |

## TDD evidence (RED)

- **Task 1:** `npx jest src/travel/travel.service.int-spec.ts --selectProjects integration --runInBand` → `Tests: 10 failed, 10 total` (`not implemented` dallo stub del service; modelli e registrazione nel modulo già presenti).
- **Task 2 wire:** `npx jest src/travel/travel.resolver.int-spec.ts --selectProjects integration --runInBand` → `Tests: 12 failed, 1 passed, 13 total`. Il caso passato è `completes a quest travel without a push and starts the countdown at the planned arrival`: è la prova end-to-end D-13/D-14 di comportamento già consegnato da 08-10/08-11 (acceptQuest + sweep), quindi caratterizzazione/regressione, non codice nuovo.
- **Task 2 real boot:** `npx jest test/app.int-spec.ts --selectProjects integration --runInBand` → `Tests: 4 failed, 29 passed, 33 total` (SDL del viaggio libero, guard senza bearer, whitelist ownership, whitelist owner-only). `src/schema.gql` non modificato dal run RED.

## Verification

- `npx jest src/travel/travel.resolver.int-spec.ts src/travel/travel.service.int-spec.ts --selectProjects integration --runInBand` → 23/23
- `npx jest test/app.int-spec.ts --selectProjects integration --runInBand` → 33/33
- `npx jest src/travel --selectProjects integration --runInBand` → 64/64; `npx jest src/travel --selectProjects unit` → 61/61
- `npm run build` exit 0; `git diff --exit-code src/schema.gql` exit 0 dopo il commit; `npx eslint` pulito sui file toccati
- Criteri di accettazione: `startTravelFilter(` ×1, `classifyUnstarted(` ×1, `planFree(` ×2, `findOneAndUpdate` ×1 nel service; 8 `it(` + 1 `it.each` (3 casi) nell'int-spec del service; `ownerOnly: true` ×2 nel resolver; le 4 righe SDL attese trovate una volta ciascuna; `'TravelResolver.startTravel'` ×2 e `'TravelResolver.travelPreview'` ×2 in `test/app.int-spec.ts`; `TravelKind|kind` ×0 nello schema; nessun `Co-Authored-By`

## Deviations from Plan

None - plan executed exactly as written. Precisazioni:
- Gli harness delle due int-spec sovrascrivono anche `PUSH_CONFIG` (`{ serviceAccount: null }`) come `travel-completion.int-spec.ts`, per non dipendere da credenziali Firebase.
- Il commento del service dice "un solo update condizionale" (non "findOneAndUpdate") perché il criterio `grep -n "findOneAndUpdate"` richiede una sola riga.
- La matrice dei rifiuti sul filo verifica ogni codice su **entrambe** le operazioni (`startTravel` e `travelPreview`) e che il documento raw resti identico e `queue.added` vuoto.
- Il commento del modulo è stato aggiornato (Boy Scout) per citare avvio e anteprima owner-only.

## Known Stubs

None.

## Threat Flags

None: la superficie nuova (`startTravel`, `travelPreview`) è quella del threat model; T-08-56..T-08-60 coperti da 'forbids the innkeeper on another character without auditing', 'lets exactly one of two concurrent starts win', i casi di corsa del Task 1, 'rejects both operations without a bearer' (filo e real boot) e la matrice `poiId: 'abc'` / `id: 'abc'`.

## Self-Check: PASSED
