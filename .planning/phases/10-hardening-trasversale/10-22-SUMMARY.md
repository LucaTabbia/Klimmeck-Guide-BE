---
phase: 10-hardening-trasversale
plan: 22
subsystem: quest-start
tags: [solo-start, arrival, change-stream, characterUpdated, D-22, C15, BE-HARD-07]
requires:
  - "10-18: `CharacterUpdatesPublisher.requestPublish(characterId)`"
  - "10-19: indice `character_standard_lane` su `{ deletedAt: 1, 'quests.pendingQuest': 1 }`"
  - "10-20: gate `npx tsc --noEmit -p tsconfig.json`"
provides:
  - "builder puro `soloStartDateOf(type, arrivedAt)` e `QuestStartService.scheduleStarted(trigger)`"
  - "arrivo sul marker in fine viaggio con `startDate` nella stessa scrittura di `arrivedAt` per le quest da soli"
  - "claim sul marker (accettazione senza viaggio o con salto) che inserisce la PendingQuest già avviata"
  - "`PendingQuestStartPublisher`: update di `startDate` sulle PendingQuest ⇒ `requestPublish` dei personaggi attivi che le tengono sulla corsia standard"
affects: [10-23, 10-25, 10-30]
tech-stack:
  added: []
  patterns:
    - "publisher su change stream che delega la ripubblicazione al single-flight di `CharacterUpdatesPublisher`"
    - "lettura in sessione + update con lo stesso filtro d'identità nella transazione dell'arrivo"
key-files:
  created:
    - src/characters/pending-quest-start.publisher.ts
    - src/characters/pending-quest-start.publisher.spec.ts
    - src/characters/pending-quest-start.publisher.int-spec.ts
    - src/quests/party/quest-start.service.spec.ts
  modified:
    - src/quests/party/quest-start.service.ts
    - src/quests/party/quest-start.int-spec.ts
    - src/travel/travel.updates.ts
    - src/travel/travel.updates.spec.ts
    - src/travel/travel-completion.service.ts
    - src/travel/travel.module.ts
    - src/travel/travel-completion.int-spec.ts
    - src/quests/acceptance/quest-acceptance.service.ts
    - src/quests/acceptance/quest-acceptance.service.int-spec.ts
    - src/characters/characters.module.ts
    - test/authz/characters-test-app.ts
    - test/app.int-spec.ts
decisions:
  - "`scheduleStarted` accetta il `ResolutionTrigger` esistente (`pendingQuestId`, `startDate`, `waitingTime`) invece di un'interfaccia gemella"
  - "Nell'arrivo il tipo della quest si legge con `findOne({ _id })` in sessione, non con `findById`: la spec «start fails after the commit» spia `findById` una volta sola per far fallire `tryStart` dopo il commit"
  - "Quest assente o ref della quest illeggibile ⇒ `startDate` non scritto e percorso `tryStart` invariato (WARN «inesistente»)"
  - "L'arrivo da soli scrive anche `startDate` in un update ⇒ il publisher degli avvii chiede una ripubblicazione in più dello stesso personaggio, fusa dal single-flight: innocua"
metrics:
  duration: "~45 min"
  completed: "2026-10-30"
  tasks: 3
  files: 16
---

# Phase 10 Plan 22: avvio da soli atomico e visibile (D-22) Summary

Una quest da soli (hunt, dungeon, job, heal, study, crime, guard) parte nella stessa scrittura del suo arrivo sul marker (fine viaggio) o del claim sul marker (accettazione senza viaggio), così il `characterUpdated` dell'arrivo porta già la corsia avviata e il FE non resta su «arrivato, non avviato»; gli avvii di party e dello sweep, che scrivono solo le PendingQuest, ripubblicano ogni membro attivo tramite `PendingQuestStartPublisher`.

## Commit

| Task | Nome | Commit | Tipo |
| ---- | ---- | ------ | ---- |
| 1 | RED dell'avvio da soli atomico e dell'evento degli avvii di party | 294bad5 | test |
| 2 | GREEN dell'avvio da soli nell'arrivo e nell'accettazione | c8a8d49 | fix |
| 3 | publisher dell'avvio della corsia standard e montaggio | 50cd536 | feat |

## Task 1 — RED

- `quest-start.service.spec.ts` (nuovo): `it.each(SOLO_TYPES)('starts a solo %s quest at its arrival (D-22)')` (7 tipi), `it.each(PARTY_TYPES)('leaves the start of a %s party to the full party (D-22)')` (boss, enemy, aid), story/worldMission ⇒ `null`, `starts nothing before the arrival (D-22)` — **rossi** (14): `soloStartDateOf` non esportata (TypeError a runtime, ts-jest non tipa).
- `travel.updates.spec.ts`: `writes the solo start with the arrival (D-22)` — **rosso**: il secondo argomento era ignorato.
- `travel-completion.int-spec.ts` (harness passato a `createCharactersTestApp` per avere i publisher dei personaggi): `starts a solo quest in the same write as the arrival (D-22)` — **rosso**: `startDate` `null` con `tryStart` spento dopo il commit; `emits one characterUpdated whose lane is already started (D-22)` — **rosso**: il primo evento del personaggio arrivato aveva `quests.pendingQuest.startDate` `null`; `still leaves a party quest waiting for the full party` — verde al primo colpo (regola dei party invariata).
- `quest-acceptance.service.int-spec.ts`: `starts a solo quest accepted on its marker at the commit (D-22)` — **rosso**: `startDate` `null` con `tryStart` spento.
- `quest-start.int-spec.ts`: `still recovers a legacy solo quest arrived but never started (D-22)` — verde al primo colpo (lo sweep passa ancora da `tryStart`/`startSingle`).
- `pending-quest-start.publisher.spec.ts` (scheletro non registrato): 5 rossi su 6 (pipeline, ripubblicazione singola e di party, lettura senza titolari, log dell'errore); `ignores an event without a document key` verde al primo colpo.
- `pending-quest-start.publisher.int-spec.ts`: `sends characterUpdated to every member when a full party starts (D-22)` — **rosso**: «subscription result timed out after 3000 ms».
- `test/app.int-spec.ts`: `mounts the pending quest start publisher` — **rosso**: «Nest could not find PendingQuestStartPublisher element».

## Task 2 — GREEN

- `soloStartDateOf(type: QuestType, arrivedAt: Date | null): Date | null` e `async scheduleStarted(started: ResolutionTrigger): Promise<void>` in `quest-start.service.ts`; `startSingle` riusa `scheduleStarted`.
- `questArrivalUpdate(endTime, startDate = null)`.
- `TravelCompletionService`: modello `Quest` iniettato (registrato in `TravelModule`); `arriveOnMarker(pendingQuestId, endTime, session)` legge in sessione la PendingQuest (`quest`, `waitingTime`) e il tipo della quest, scrive arrivo e avvio da soli con `updateOne` sullo stesso filtro; dopo il commit `startAfterCommit` ⇒ `scheduleStarted` (da soli) o `tryStart` (party, quest assente).
- `QuestAcceptanceService`: `startDate = laneDates.startDate ?? soloStartDateOf(type, laneDates.arrivedAt)` nell'insert della PendingQuest; dopo il commit `startOnMarker` ⇒ `scheduleStarted` (da soli) o `tryStart` (party).
- Verdi: unit `src/quests src/travel` 36 suite / 648; integration `src/travel src/quests/acceptance src/quests/party src/quests/outcomes` 19 suite / 333; `npm run build` 0; `tsc` 0.

## Task 3 — GREEN del publisher

- `PendingQuestStartPublisher extends ChangeStreamPublisher<PendingQuestDocument>` (subject «degli avvii delle missioni»), `onChange` ⇒ id dalla `documentKey` ⇒ `republishHolders` con `find` sui personaggi attivi la cui corsia standard punta alla PendingQuest (entrambe le forme dell'id) ⇒ `characterUpdates.requestPublish(hex)`; errore ⇒ ERROR con id e `describeError`.
- Registrato nei provider di `CharactersModule` e di `createCharactersTestApp`.
- Verdi: unit `src/characters` 283; integration `src/characters` + boot reale 20 suite / 355; `npm run test:int` **95 suite / 1223 test** (252 s); `npm run build` 0; `tsc` 0; `src/schema.gql` invariato.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] harness della int-spec del viaggio**
- **Found during:** Task 1
- **Issue:** `createAuthTestApp` con il solo `TravelModule` non monta `CharacterUpdatesPublisher`: il caso dell'evento dell'arrivo non poteva osservare `characterUpdated`.
- **Fix:** l'harness principale di `travel-completion.int-spec.ts` usa `createCharactersTestApp` (stesso schema di `travel.resolver.int-spec.ts`); il boot di prova del reconciler resta su `createAuthTestApp`.
- **Commit:** 294bad5

**2. [Rule 3 - Blocking] lettura del tipo della quest con `findOne`**
- **Found during:** Task 2
- **Issue:** il piano indicava `questModel.findById(...)` nella transazione; la spec esistente «completes the travel when the start fails after the commit» spia `findById` una volta per far fallire `tryStart` dopo il commit, e la spia avrebbe colpito la lettura in transazione.
- **Fix:** `findOne({ _id: questId }, { 'infos.type': 1 }).session(session)`.
- **Commit:** c8a8d49

**3. Scelte minori**
- La PendingQuest dell'arrivo si legge con `findOne` in sessione e si scrive con `updateOne` sullo stesso `questArrivalFilter` (serve il tipo prima della scrittura), non più con un solo `findOneAndUpdate`.
- `scheduleStarted` usa `ResolutionTrigger` (nessuna interfaccia duplicata).
- Unit spec del publisher con due casi in più (party a due membri, evento senza `documentKey`) e uno sul log d'errore.

## Known Stubs

Nessuno.

## Threat Flags

Nessuna superficie nuova: il publisher riusa il topic `characterUpdated` e il suo filtro d'accesso (T-10-81).

## Self-Check: PASSED
