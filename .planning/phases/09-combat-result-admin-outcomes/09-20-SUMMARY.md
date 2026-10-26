---
phase: 09-combat-result-admin-outcomes
plan: 20
subsystem: quest-party
tags: [aid, party, subscription, change-stream, schema, user-decisions]

# Dependency graph
requires:
  - phase: 09-combat-result-admin-outcomes (09-18, 09-19)
    provides: aid di gruppo con rescue.characters, buildAidQuest, avvio a party completo, abbandono, scioglimento a 24 ore
provides:
  - aidSlotsOf: la aid copia gli slot della quest fallita (fallback a un posto jolly)
  - subscription questUpdated(questId: String!): Quest! con snapshot alla subscribe
  - QuestsPublisher: change stream su quests (update/replace) → pubSub questUpdated
affects: [FE branch feat/party-waiting (contatore k/N live), PR #13, BE Phase 10 (indici, carico del change stream)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Change stream per collection → PubSub con rilettura popolata (come QuestResultsPublisher), nessun publish manuale nei servizi"
    - "subscribeWithSnapshot + filtro per documentIdOf sul payload"

key-files:
  created:
    - src/quests/quests.publisher.ts
    - src/quests/quest-updated.subscription.int-spec.ts
    - .planning/phases/09-combat-result-admin-outcomes/09-20-SUMMARY.md
  modified:
    - src/quests/outcomes/aid/aid-quest.ts
    - src/quests/outcomes/aid/aid-quest.spec.ts
    - src/quests/outcomes/boss-resolution.int-spec.ts
    - src/pubsub.module.ts
    - src/quests/quests.resolver.ts
    - src/quests/quests.module.ts
    - src/schema.gql
    - test/app.int-spec.ts
    - .planning/phases/09-combat-result-admin-outcomes/09-CONTEXT.md
    - .planning/phases/09-combat-result-admin-outcomes/BACKEND-NOTES.md
    - .planning/phases/09-combat-result-admin-outcomes/09-VALIDATION.md
    - .planning/phases/09-combat-result-admin-outcomes/09-VERIFICATION.md
    - .planning/ROADMAP.md
    - .planning/STATE.md

key-decisions:
  - "Decisione dell'utente (2026-10-26): \"I posti della aid sono identici a quelli della missione da cui è nata.\" ⇒ aidSlotsOf copia requiredAdventurers (oggetti nuovi); senza slot validi [{ title: null, count: 1 }]; il default jolly di 09-18 è superato"
  - "Decisione dell'utente (2026-10-26): \"il counter degli avventurieri mancanti deve aggiornarsi nel momento in cui qualcuno accetta la missione, non quando arriva sul marker.\" ⇒ questUpdated(questId) con snapshot e change stream su quests"
  - "Decisione dell'utente (2026-10-26): \"L'abbandono solo sul marker mi va bene.\" ⇒ default confermato, solo documentazione"
  - "questUpdated senza decoratori di ruolo/ownership: la board è pubblica per ogni utente autenticato; l'autenticazione è alla connection_init (4403)"

patterns-established:
  - "Publisher su change stream: ResourceNotFoundException ⇒ debug con l'id e nessun publish; altri errori ⇒ error con soli id e nome dell'errore"

requirements-completed: [BE-COMBAT-03]

# Metrics
duration: ~75min
completed: 2026-10-26
---

# Phase 9 Plan 20: posti della aid identici e subscription questUpdated Summary

**La aid copia gli slot della quest fallita (`aidSlotsOf`), e il contatore del party segue ogni accettazione tramite `questUpdated(questId: String!): Quest!`: snapshot alla subscribe, poi eventi da un change stream su `quests`.**

## Performance

- **Duration:** ~75 min (la suite unit da sola ha impiegato 914 s su una macchina carica)
- **Completed:** 2026-10-26
- **Tasks:** 3/3
- **Files modified:** 17 (2 creati nel codice, più il SUMMARY)

## Accomplishments

- `aidSlotsOf(requiredAdventurers)` restituisce una copia degli slot (stessi titoli e count, nuovi array e oggetti). Con slot assenti, vuoti o non validi restituisce `[{ title: null, count: 1 }]` (T-09-86). `buildAidQuest` lo usa, una catena conserva gli slot e `aidSeatsOf` non esiste più.
- `QuestsPublisher` apre un change stream su `quests` (`update`/`replace`), rilegge la quest con `QuestsService.findOne` (stesso populate della board) e pubblica `questUpdated`. Se la quest è conclusa o sparita, logga in debug con l'id e non pubblica. Gli altri errori finiscono in `logger.error` con soli id.
- `QuestsResolver.questUpdated` usa `subscribeWithSnapshot` con un filtro `documentIdOf(questUpdated) === questId`. Su un id malformato o su una quest conclusa risponde `NOT_FOUND`. `QuestsModule` registra il publisher senza import nuovi: `PubSubModule` è `@Global`.
- Lo schema è stato rigenerato dal boot reale. L'unica riga aggiunta è `questUpdated(questId: String!): Quest!` in `type Subscription`.
- Aggiornati CONTEXT (D-05, D-08 e citazioni), BACKEND-NOTES (TL;DR, §1, §5, §6, §10, §16), VALIDATION, VERIFICATION, ROADMAP (20/20) e STATE (107/107).

## Task Commits

1. **Task 1: posti della aid identici** — `edc5b52` (test), `edce0d1` (feat)
2. **Task 2: subscription questUpdated** — `54506cd` (test), `33f5774` (feat, con lo schema)
3. **Task 3: documenti e bookkeeping** — `93a9f72` (docs)

## Verification

- `npx jest src/quests/outcomes/aid --selectProjects unit`: 24/24.
- Integration di boss-resolution, aid-rescue, aid-timeout e `src/quests/party`: 6 suite / 56 test.
- Integration di `quest-updated.subscription`, `quests.resolver` e del boot reale: 3 suite / 62 test.
- Gate completo: `npm run test:unit` **122 suite / 1832 test**, `npm run test:int` **76 suite / 983 test** (`--runInBand`, foreground, 170 s, nessun flaky), `npm run build` exit 0, `git diff --exit-code src/schema.gql` pulito.
- `git diff origin/develop -- src/schema.gql | grep '^-' | grep -v '^---'`: vuoto. Il conteggio dei letterali vietati nello schema è 0.
- Grep di accettazione:
  - `aidSeatsOf` non compare in `src` né in `test`.
  - `title: null, count: 1` compare una sola volta in `aid-quest.ts` (il fallback).
  - `pubSub.publish('questUpdated'` compare una sola volta (in `quests.publisher.ts`).
  - Nei documenti: una sola riga `- [Phase 09]: 09-20` in STATE e nessun «tutti jolly» residuo.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug nel test] `expectSilence` consuma l'evento successivo**
- **Found during:** Task 2 GREEN
- **Issue:** quando la finestra di silenzio scade, `withTimeout` lascia pendente il `next()` dell'iteratore graphql-ws, e quel `next()` riceve l'evento seguente. Il caso «altra quest» proseguiva dopo il silenzio con un update della propria quest e restava appeso.
- **Fix:** il caso termina con `expectSilence`. Prima del silenzio il test aspetta, sul PubSub interno, che l'evento dell'altra quest sia stato davvero pubblicato. Così il silenzio prova che il filtro ha scartato l'evento, non che l'evento non era ancora arrivato.
- **Files modified:** `src/quests/quest-updated.subscription.int-spec.ts`
- **Commit:** `33f5774` (raffinamento del test nel commit GREEN)

### Scelte minori

- Il priming del change stream delle quest è definito dentro la int-spec (`primeQuestsChangeStream`), non in `test/quests/`, perché il file non era nella lista del piano. Gira una volta in `beforeAll`: la `deleteMany` di `clearDatabase` non invalida lo stream.
- Il caso «quest conclusa» verifica anche che il publisher abbia loggato in debug con l'id e che non ci siano errori.
- Nella int-spec del boss, il caso della aid di gruppo usa `bossQuest(RANKED_SEATS)` (`[{ rookie, 2 }, { null, 1 }]`). La fixture dei personaggi ha titolo `rookie`.

## Known Stubs

Nessuno nuovo.

## Threat Flags

Nessuna superficie fuori dal threat model. `questUpdated` è T-09-97: 4403 senza bearer, `NOT_FOUND` sulle quest concluse, nessuna ripubblicazione delle concluse. Il change stream è T-09-98 (accettato).

## Next Phase Readiness

- Dopo il push dell'orchestratore, la PR #13 riceve i cinque commit di 09-20 più questo SUMMARY.
- Il branch FE `feat/party-waiting` può consumare `questUpdated(questId: String!): Quest!` così com'è nello schema.

## Self-Check: PASSED
