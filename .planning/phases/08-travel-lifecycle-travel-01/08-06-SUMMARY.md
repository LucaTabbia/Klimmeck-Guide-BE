---
phase: 08-travel-lifecycle-travel-01
plan: 06
subsystem: quests
tags: [quests, acceptance, capacity, travel-guard, fail-closed, transactions]
requires:
  - "08-01: QuestRequirements.requiredAdventurers a slot (title null = jolly), Quest.registeredAdventurers { character, title }, status.activeTravel"
  - "08-02: quest-capacity.ts (slotsOf, slotRuleOf, hasSeatFor, seatAvailableExpr), refIdOf condiviso, GameRuleException.travelInProgress"
provides:
  - "quest-eligibility.ts: REGISTERED_TYPES { worldMission, boss, enemy, aid }, isRegistered, registrationRuleOf (SlotRule | null | 'invalid'), classifyEligibility(quest, character, lane, rule) con TRAVEL_IN_PROGRESS per primo e capienza D-32"
  - "quest-acceptance.updates.ts: laneClaimFilter con 'status.activeTravel': null su ogni corsia e status.location solo se presente (standard), registrationFilter/Update su registeredAdventurers a oggetti con $expr = seatAvailableExpr, classifyUnclaimed con TRAVEL_IN_PROGRESS e NOT_IN_CITY solo con location attesa"
  - "quest-acceptance.service.ts: seatRuleOrReject (WARN con solo id), città del marker solo per QuestLane.standard, refIdOf condiviso, proiezione status.activeTravel.endTime"
affects: [08-07, 08-11, 08-14]
tech-stack:
  added: []
  patterns:
    - "regola pura di capienza (hasSeatFor) e suo specchio $expr provati equivalenti sul replica set con una tabella di casi"
    - "dati di catalogo difettosi simulati con collection.insertOne (bypass della validazione Mongoose)"
key-files:
  created: []
  modified:
    - src/quests/acceptance/quest-eligibility.ts
    - src/quests/acceptance/quest-eligibility.spec.ts
    - src/quests/acceptance/quest-acceptance.updates.ts
    - src/quests/acceptance/quest-acceptance.updates.spec.ts
    - src/quests/acceptance/quest-acceptance.service.ts
    - src/quests/acceptance/quest-acceptance.service.int-spec.ts
    - src/quests/acceptance/accept-quest.resolver.int-spec.ts
key-decisions:
  - "Ordine della pre-verifica: NOT_FOUND quest → QUEST_NOT_ACCEPTABLE (costo, poi slot) → NOT_FOUND personaggio → TRAVEL_IN_PROGRESS → ALREADY_TAKEN → TITLE_MISMATCH → SLOT_BUSY → QUEST_FULL → (solo standard) QUEST_NOT_IN_CITY"
  - "classifyUnclaimed dopo un claim fallito: NOT_FOUND → TRAVEL_IN_PROGRESS → SLOT_BUSY → ALREADY_TAKEN → TITLE_MISMATCH → NOT_IN_CITY (solo se la location era attesa) → SLOT_BUSY di fallback"
  - "registrationFilter senza più il ramo legacy a stringhe: anti-duplicato su 'registeredAdventurers.character' $ne e capienza nello stesso $expr"
  - "Proiezione del personaggio limitata a status.activeTravel.endTime: basta la presenza, la polilinea non si legge"
  - "Task 3 GREEN è un commit test(quests) (solo harness: QuestsModule negli imports), nessun codice di produzione necessario"
metrics:
  duration: 9 min
  completed: 2026-10-21
  tasks: 3
  files: 7
---

# Phase 8 Plan 06: Acceptance amendments (rank slots, any-city lanes, travel guard) Summary

L'accettazione delle quest usa ora gli slot per rango D-32 (esatti prima dei jolly) sia nella pre-verifica sia nel filtro `$expr` della registrazione, registra anche enemy e aid, accetta story e worldMission da qualunque città, rifiuta chi è in viaggio con `TRAVEL_IN_PROGRESS` (anche se il viaggio parte fra pre-verifica e transazione) e tratta gli slot non validi come `QUEST_NOT_ACCEPTABLE` fail-closed con WARN del solo id.

## Tasks

| # | Task | Commits |
|---|------|---------|
| 1 | Regole pure: tipi registrati, slot, guard del viaggio, città solo per lo standard | 02db3e7 (RED), 6182927 (GREEN) |
| 2 | Service: slot validati fail-closed, città solo standard, concorrenza sul replica set | 4394081 (RED), f67474e (GREEN) |
| 3 | Filo: matrice dei codici aggiornata e registeredAdventurers a oggetti su quests | f10b876 (RED), 35f4f0b (GREEN, harness) |

## TDD evidence (RED)

- **Task 1:** `npx jest quest-eligibility.spec.ts quest-acceptance.updates.spec.ts --selectProjects unit` → 2 suite fallite, **41 failed / 65 passed** (export mancanti `isRegistered`/`registrationRuleOf`, forme nuove di `laneClaimFilter`/`registrationFilter`/`registrationUpdate`, `TRAVEL_IN_PROGRESS` assente, `classifyUnregistered` sugli oggetti).
- **Task 2:** `npx jest quest-acceptance.service.int-spec.ts --selectProjects integration --runInBand` → **9 failed / 44 passed**: i 2 casi del travel guard (proiezione senza `activeTravel` ⇒ la pre-verifica passava e il filtro dava `QUEST_SLOT_BUSY`), story e worldMission da un'altra città (`QUEST_NOT_IN_CITY`), i 5 casi `it.each` sugli slot non validi (WARN mai chiamato; il rifiuto `QUEST_NOT_ACCEPTABLE` del Task 1 c'era già). I casi di concorrenza (enemy jolly, hero/paladin, canonico, esatti prima dei jolly, specchio `$expr`/`hasSeatFor`) erano già verdi grazie al Task 1: caratterizzazione.
- **Task 3:** `npx jest accept-quest.resolver.int-spec.ts --selectProjects integration --runInBand` → **1 failed / 19 passed**: solo 'exposes the registered adventurers and the rank slots on quests', RED per l'harness (`Cannot query field "quests" on type "Query"`: `QuestsModule` assente). Le righe nuove della matrice (`TRAVEL_IN_PROGRESS`, enemy senza slot, hunt da altra città, `QUEST_FULL` a slot) e 'accepts a story from another city on the wire' passavano già dopo i Task 1-2: caratterizzazione sul filo, ammessa dal piano.

## Verification

- `npx jest src/quests/acceptance --selectProjects unit` → 4 suite, 159 test verdi
- `npx jest src/quests/acceptance --selectProjects integration --runInBand` → 2 suite, 73 test verdi (fine della rottura temporanea dichiarata in 08-01)
- `npx jest --selectProjects unit` → 94 suite, 1408 test verdi
- `npm run build` verde; `git diff --exit-code src/schema.gql` pulito; `npx eslint` sui 7 file pulito
- Grep dei criteri di accettazione: nessun `registrations|capacityRuleOf|hasCapacity|takenCountExpr|isShared|SHARED_TYPES` fuori dalle int-spec; `QuestType.enemy`/`QuestType.aid` 1 riga ciascuno; `'status.activeTravel': null` e `seatAvailableExpr(` 1 riga ciascuno in updates; `travelInProgress()` 2 righe; nessuna `function refIdOf` privata nel service; `TRAVEL_IN_PROGRESS` 5 e `QUEST_FULL` 6 occorrenze nella int-spec del service

## Deviations from Plan

None - plan executed exactly as written. Precisazioni:
- Nel Task 1 `seatRuleOrReject` è stato introdotto senza WARN (adattamento meccanico consentito dal piano); il WARN col messaggio esatto è arrivato nel GREEN del Task 2, dopo il suo RED.
- Nella int-spec del service sono stati rimossi i casi Phase 7 sui dati legacy a stringhe (`requiredAdventurers` numerico come totale, `registrations` assente) perché il modello a slot li rende `QUEST_NOT_ACCEPTABLE`: coperti dall'`it.each` fail-closed. `interleaveBeforeTransaction` è salito allo scope del describe esterno per servire sia la concorrenza sia il travel guard.
- 'never registers story adventurers' usa ora uno slot jolly su una story (un `requiredAdventurers: 1` non passa più la validazione Mongoose).

## Known Stubs

None.

## Threat Flags

None: nessuna superficie nuova oltre al threat model del piano (T-08-26..T-08-31 tutti mitigati e coperti dai test indicati).

## Self-Check: PASSED
