---
phase: 09-combat-result-admin-outcomes
plan: 08
subsystem: api
tags: [travel, quests, acceptance, guards, awaiting-aid, injuries, concluded-quests, tdd]

# Dependency graph
requires:
  - phase: 09-combat-result-admin-outcomes (09-01)
    provides: CharacterStatus.awaitingAid, Quest.concludedAt (default null), prizes.spell popolato nel catalogo
  - phase: 09-combat-result-admin-outcomes (09-02)
    provides: GameRuleException.awaitingAid() / codice AWAITING_AID
  - phase: 09-combat-result-admin-outcomes (09-03)
    provides: travelSpeedFactorOf (fattori segnaposto delle ferite, D-15)
  - phase: 08-travel-lifecycle
    provides: classifyFreeTravel, startTravelFilter/classifyUnstarted, teleportFilter, TravelPlanner (velocità fotografata alla partenza, D-09)
  - phase: 07-quest-acceptance
    provides: classifyEligibility, laneClaimFilter/classifyUnclaimed, registrationFilter/classifyUnregistered, readQuest
provides:
  - AWAITING_AID su startTravel / travelPreview (pre-verifica in classifyFreeTravel + 'status.awaitingAid': null in startTravelFilter + classifyUnstarted)
  - AWAITING_AID su acceptQuest per ogni corsia (prima regola di classifyEligibility + laneClaimFilter + classifyUnclaimed)
  - teleport del GM invariato anche in attesa di soccorso (awaitingAid intatto)
  - velocità del viaggio = velocità del pet × travelSpeedFactorOf(injuries), libero e automatico (AutoTravelRequest.injuries)
  - quest concluse fuori da quests / quest(id) (NOT_FOUND) e non accettabili (readQuest + registrationFilter con concludedAt null, classifyUnregistered → NOT_FOUND)
  - prova sul filo di prizes.spell popolata e della magia orfana a null
affects: [09-05, 09-09, 09-12, 09-15, 09-16, FE Phase 9]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Guard di stato del personaggio: fatto booleano nel classificatore puro + campo null nel filtro dell'update + ramo nella rilettura, nello stesso ordine"
    - "Fattore di velocità composto: speedFor(pet, injuries) = petSpeedOf(pet) × travelSpeedFactorOf(injuries), fotografato in buildActiveTravel"
    - "concludedAt: null come filtro di visibilità del catalogo: matcha anche i documenti legacy senza campo"

key-files:
  created: []
  modified:
    - src/travel/travel-rules.ts
    - src/travel/travel.updates.ts
    - src/travel/travel.service.ts
    - src/travel/travel-planner.service.ts
    - src/quests/acceptance/quest-eligibility.ts
    - src/quests/acceptance/quest-acceptance.updates.ts
    - src/quests/acceptance/quest-acceptance.service.ts
    - src/quests/quests.service.ts
    - src/travel/travel-rules.spec.ts
    - src/travel/travel.updates.spec.ts
    - src/travel/travel-planning.int-spec.ts
    - src/travel/travel.resolver.int-spec.ts
    - src/travel/teleport.resolver.int-spec.ts
    - src/quests/acceptance/quest-eligibility.spec.ts
    - src/quests/acceptance/quest-acceptance.updates.spec.ts
    - src/quests/acceptance/quest-acceptance.service.int-spec.ts
    - src/quests/acceptance/accept-quest.resolver.int-spec.ts
    - src/quests/quests.resolver.int-spec.ts

key-decisions:
  - "AWAITING_AID si inserisce nel viaggio subito dopo la meta ammessa (meta → soccorso → viaggio → quest standard → stessa posizione → percorso) e nell'accettazione come prima regola, prima del viaggio"
  - "La rilettura dopo un update fallito nomina AWAITING_AID prima di TRAVEL_IN_PROGRESS (classifyUnstarted, classifyUnclaimed)"
  - "movementTo riceve lo snapshot del personaggio (pet + ferite) invece del solo pet"
  - "Una quest standard senza registrazione conclusa fra pre-verifica e transazione non ha un filtro sulla Quest: la guard è readQuest (pre-verifica); la riaffermazione nel filtro vale per le quest registrate (registrationFilter), come prescrive il piano"

patterns-established:
  - "Guard nuove sul personaggio: pre-verifica pura + filtro dell'update + rilettura che sceglie solo il codice (Phase 4)"

requirements-completed: []

# Metrics
duration: 25min
completed: 2026-10-24
---

# Phase 9 Plan 08: Guard di soccorso, quest concluse e rallentamento da ferite Summary

**Il personaggio in attesa di soccorso riceve AWAITING_AID da startTravel, travelPreview e acceptQuest (pre-verifica e filtro dell'update), il GM lo può ancora teletrasportare; le ferite moltiplicano la velocità di ogni viaggio per travelSpeedFactorOf, e le quest concluse spariscono dalla board e non si accettano più**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-10-24T15:12:00Z
- **Completed:** 2026-10-24T15:38:00Z
- **Tasks:** 2
- **Files modified:** 18 (8 di produzione, 10 spec)

## Accomplishments

- Viaggio: `FreeTravelFacts.awaitingAid`, `classifyFreeTravel` rifiuta con `AWAITING_AID` subito dopo la meta; `startTravelFilter` riafferma `'status.awaitingAid': null`; `classifyUnstarted` e `UNSTARTED_PROJECTION` leggono e nominano l'attesa. `teleportFilter` invariato (commento D-07).
- Velocità: `TravelPlanner.speedFor(pet, injuries)` = `petSpeedOf(pet) × travelSpeedFactorOf(injuries)`; `planFree` legge `status.injuries` e `status.awaitingAid` nello snapshot, `planAuto` riceve `injuries` nella richiesta. Una gamba rotta: durata = `durationMsOf(baseHours, BASE_SPEED × 0.8)`; due gambe mancanti: fattore 0,64.
- Accettazione: `classifyEligibility` rifiuta con `AWAITING_AID` come prima regola per ogni corsia; `laneClaimFilter` riafferma `'status.awaitingAid': null` e `classifyUnclaimed` lo nomina prima del viaggio; `CHARACTER_PROJECTION` legge attesa e ferite; `movementTo` passa le ferite a `planAuto`.
- Quest concluse: `readQuest` usa `findOne({ _id, concludedAt: null })`, `registrationFilter` aggiunge `concludedAt: null`, `classifyUnregistered` risponde `NOT_FOUND` su una quest conclusa nel frattempo (la rilettura proietta `concludedAt`); `QuestsService.findAll`/`findOne` filtrano `concludedAt: null` (legacy senza campo inclusa).
- Filo: `prizes.spell { id name minXpToLearn }` popolata, magia orfana → `spell: null` senza `errors`.

## Task Commits

| Task | Nome | Commit | Tipo |
| ---- | ---- | ------ | ---- |
| 1 | AWAITING_AID sul viaggio, teleport invariato, rallentamento (RED) | `fcc8d70` | test |
| 1 | AWAITING_AID sul viaggio, teleport invariato, rallentamento (GREEN) | `ac054dd` | feat |
| 2 | accettazione, quest concluse, prizes.spell sul filo (RED) | `29e1cd6` | test |
| 2 | accettazione, quest concluse, prizes.spell sul filo (GREEN) | `236192e` | feat |

## Verification

- RED Task 1: unit 4 falliti / 32 (`rejects awaiting aid`, ordine con l'attesa, filtro e rilettura); integration 5 falliti / 61 (rallentamento libero, pet × ferite, `AWAITING_AID` del planner, `planAuto` con 0,64, rifiuto sul filo). Il caso del teleport passa già in RED: è una prova di invarianza (D-07), non una funzionalità nuova.
- RED Task 2: unit 9 falliti / 117; integration 7 falliti / 100. `prizes.spell` popolata e la quest legacy su `quest(id)` passano già in RED (populate di 09-01, nessun filtro prima): prove di regressione sul filo.
- GREEN: `npx jest src/travel --selectProjects unit` 70/70; `npx jest src/travel --selectProjects integration --runInBand` 90/90; `npx jest src/quests --selectProjects unit` 309/309; `npx jest src/quests --selectProjects integration --runInBand` 114/114; `npm run build` 0; prettier e eslint puliti sui 18 file.
- Grep di accettazione: `'status.awaitingAid': null` in travel.updates.ts (1) e quest-acceptance.updates.ts (1); `awaitingAid` nelle 6 righe di `teleportFilter` = 0; `travelSpeedFactorOf(` nel planner (1); `GameRuleException.awaitingAid()` in travel-rules + travel.updates (2); `concludedAt: null` in quests.service.ts (2) e in updates + acceptance service (2); `findById(questId` vuoto; nessun letterale vietato nelle righe nuove.

## Files Created/Modified

- `src/travel/travel-rules.ts` — `awaitingAid` nei fatti e nell'ordine dei rifiuti.
- `src/travel/travel.updates.ts` — filtro di avvio, snapshot e rilettura con l'attesa; teleport invariato.
- `src/travel/travel.service.ts` — `UNSTARTED_PROJECTION` con `status.awaitingAid`.
- `src/travel/travel-planner.service.ts` — proiezione con attesa e ferite, `AutoTravelRequest.injuries`, `speedFor`/`petSpeedOf`.
- `src/quests/acceptance/quest-eligibility.ts` — prima regola `AWAITING_AID`.
- `src/quests/acceptance/quest-acceptance.updates.ts` — `laneClaimFilter`, `classifyUnclaimed`, `registrationFilter`, `classifyUnregistered`, `UnregisteredSnapshot`.
- `src/quests/acceptance/quest-acceptance.service.ts` — `readQuest` con `concludedAt: null`, proiezione e snapshot del personaggio, ferite a `planAuto`, rilettura con `concludedAt`.
- `src/quests/quests.service.ts` — board e `quest(id)` senza le quest concluse.
- Spec: casi nuovi in `travel-rules.spec`, `travel.updates.spec`, `travel-planning.int-spec`, `travel.resolver.int-spec`, `teleport.resolver.int-spec`, `quest-eligibility.spec`, `quest-acceptance.updates.spec`, `quest-acceptance.service.int-spec` (attesa, corse con `interleaveBeforeTransaction`, quest concluse, viaggio del ferito), `accept-quest.resolver.int-spec`, `quests.resolver.int-spec`.

## Decisions Made

- Ordine dei rifiuti del viaggio: `meta ammessa → in attesa di soccorso (D-07) → viaggio in corso → quest standard → stessa posizione → percorso`; nell'accettazione l'attesa precede il viaggio.
- `movementTo(quest, characterId, location, character)`: lo snapshot del personaggio porta pet e ferite, un parametro in meno da far crescere.
- Il controllo della quest conclusa sulle corsie senza registrazione resta in `readQuest` (pre-verifica); il filtro di scrittura sulla Quest esiste solo per le registrate (`registrationFilter`), come da piano.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug nel test] Rapporto delle durate del viaggio automatico ferito**
- **Found during:** Task 2 (GREEN)
- **Issue:** la spec RED confrontava `injured.duration / healthy.duration` con `toBeCloseTo(1.25, 6)`; le durate sono arrotondate al millisecondo (`durationMsOf`), quindi il rapporto vale 1,2499984 e il test falliva con l'implementazione corretta.
- **Fix:** confronto esatto con `durationMsOf(route.baseHours, BASE_SPEED)` e `durationMsOf(route.baseHours, BASE_SPEED * 0.8)` sulla stessa tratta, rapporto a precisione 4.
- **Files modified:** src/quests/acceptance/quest-acceptance.service.int-spec.ts
- **Commit:** `236192e`

### Modifiche ad asserzioni esistenti (richieste dal piano)

- `travel.updates.spec.ts`: il `toEqual` di `startTravelFilter` include ora `'status.awaitingAid': null`.
- `quest-acceptance.updates.spec.ts`: i tre `toEqual` di `laneClaimFilter` includono `'status.awaitingAid': null`; il `toEqual` di `registrationFilter` include `concludedAt: null`.
- Sono la conseguenza diretta delle guard prescritte nel filtro; nessun'altra asserzione esistente è cambiata.

### Subject oltre i 72 caratteri

- I subject prescritti dal piano `feat(travel): block travel while awaiting aid and slow injured travellers` (73) e `feat(quests): hide concluded quests and block acceptance while awaiting aid` (75) superano il limite; nessuna riscrittura della storia, commit `ac054dd` e `236192e` lasciati com'è.

### Nota sul piano

- Il piano indica nella Progress Table `8/16`; l'orchestratore ha prescritto `6/16` (09-01..09-04, 09-06, 09-08 completi): applicato `6/16`.

## Issues Encountered

- Nessuno oltre al test arrotondato sopra. `deferred-items.md` invariato (il bug di `Enemy.locations` resta fuori scope).

## Known Stubs

- Nessuno nuovo. I fattori delle ferite restano i SEGNAPOSTO di `injury-rules.ts` (09-03, D-02/D-15) finché l'utente non fornisce le regole.

## Threat Flags

None: le superfici toccate sono quelle del threat model (T-09-37..T-09-41); nessun endpoint, campo di schema o input nuovo (`src/schema.gql` non toccato).

## User Setup Required

None.

## Next Phase Readiness

- 09-05 (motore dell'esito) può scrivere `status.awaitingAid` e `concludedAt`: viaggio, accettazione e board reagiscono già.
- FE Phase 9 riceve `AWAITING_AID` su `startTravel`/`travelPreview`/`acceptQuest` e non vede più le quest concluse.

## Self-Check: PASSED

- File modificati presenti; commit `fcc8d70`, `ac054dd`, `29e1cd6`, `236192e` presenti nella storia del branch.
