---
phase: 04-integrita-economica-atomics
plan: 07
subsystem: quests
tags: [quests, acceptance, transactions, concurrency, single-flight, tdd]
requires:
  - 04-01 (GameRuleException.questSlotBusy, ResourceNotFoundException.quest)
  - 04-02 (WalletService.applyCharacterCoinsDelta con session, EconomyModule)
provides:
  - "QuestAcceptanceService.accept(characterId, questId, costCopper): Promise<Types.ObjectId> (claim condizionale dello slot, insert PendingQuest e debito nella stessa connection.transaction)"
  - "QuestAcceptanceModule (forFeature Character, Quest, PendingQuest + EconomyModule), esporta QuestAcceptanceService per la Phase 7"
  - "AppModule monta QuestAcceptanceModule: il boot reale ne valida la DI, nessuna superficie GraphQL (D-09)"
affects: [Phase 7 (mutation lane-aware e cost model per tipologia), 04-09 (BACKEND-NOTES / requirements)]
tech-stack:
  added: []
  patterns:
    - "Single-flight: lookup quest fuori dalla transazione → nel callback claim condizionale { ...activeCharacterById, 'quests.pendingQuest': null } con _id pre-generato → insert PendingQuest → debito wallet nella stessa session; ogni errore annulla tutto"
    - "Claim nullo → rilettura in sessione: personaggio attivo esistente = QUEST_SLOT_BUSY, altrimenti NOT_FOUND"
key-files:
  created:
    - src/quests/acceptance/quest-acceptance.module.ts
    - src/quests/acceptance/quest-acceptance.service.ts
    - src/quests/acceptance/quest-acceptance.service.int-spec.ts
  modified:
    - src/app.module.ts
    - test/app.int-spec.ts
decisions:
  - "La validazione del costo è estratta in assertValidCost (RangeError prima di qualunque lettura o scrittura), come assertPositiveAmount del wallet"
  - "waitingTime = quest.infos.timeToComplete ?? 0 in un solo punto (waitingTimeOf, A1); startDate = new Date() del server"
  - "Debito saltato per costo 0: una quest gratuita non scrive il borsellino"
metrics:
  duration: ~12 min
  completed: 2026-10-18
  tasks: 2
  files: 5
---

# Phase 4 Plan 07: Accettazione quest single-flight Summary

`QuestAcceptanceService.accept(characterId, questId, costCopper)` è la primitiva interna che accetta una quest in modo atomico. Prima della transazione valida il costo (intero sicuro, non negativo, altrimenti `RangeError`) e legge la quest con la sola proiezione `infos.timeToComplete` (se manca risponde `NOT_FOUND 'Missione non trovata'`). Dentro un unico `connection.transaction` esegue tre passi: il claim condizionale dello slot `{ ...activeCharacterById(characterId), 'quests.pendingQuest': null }`, che scrive il `Types.ObjectId` pre-generato (Pitfall 1); l'insert del `PendingQuest` con quell'`_id`, `startDate` = ora del server e `waitingTime` = `timeToComplete ?? 0` (A1); infine `wallet.applyCharacterCoinsDelta(characterId, -costCopper, session)` se il costo è positivo. Il callback non ha `Promise.all` né side effect. Il modulo non ha resolver (D-09) ed è montato in `AppModule`, quindi il boot reale ne valida la DI. `src/schema.gql` è byte-identico a `develop`. Resolver e `CharactersService.doTransaction` non sono stati toccati.

## Tasks

| Task | Name | RED commit | GREEN commit |
| ---- | ---- | ---------- | ------------ |
| 1 | QuestAcceptanceService: claim dello slot, PendingQuest e debito in un'unica transazione | d584615 | aa37955 |
| 2 | Montaggio in AppModule e prova di boot reale senza superficie GraphQL | f3155d2 | 4dedf74 |

Non è servito nessun commit REFACTOR.

## RED evidence

- **Task 1:** `npx jest src/quests/acceptance --selectProjects integration --runInBand` → 10 failed / 10. Il modulo era già completo e il service era uno stub che rifiutava con `Error: accept: not implemented (...)`. Anche il caso 9 (`RangeError`) falliva: `Expected constructor: RangeError / Received constructor: Error`. Il caso SC3 falliva con `Expected length: 1, Received length: 0`.
- **Task 2:** `npx jest test/app.int-spec.ts --selectProjects integration --runInBand` → 1 failed / 17, `Nest could not find QuestAcceptanceService element (this provider does not exist in the current context)`. Dopo il run `git diff --exit-code src/schema.gql` = 0.

## Verification (GREEN)

- Task 1: int-spec 10/10, rieseguito altre 12 volte e sempre 10/10, senza test instabili sulla concorrenza. `npx tsc --noEmit -p tsconfig.build.json` ok, eslint pulito su `src/quests/acceptance`.
- Task 2: `test/app.int-spec.ts` 17/17; `git diff --exit-code src/schema.gql` = 0; eslint pulito su `test/app.int-spec.ts` e `src/app.module.ts`.
- Plan verification: `npx jest src/quests src/economy test/app.int-spec.ts --selectProjects integration --runInBand` → 5 suite / 67 passed; `git diff --exit-code develop -- src/schema.gql` = 0; tsc ok. Regressione unit: `npx jest --selectProjects unit` → 54 suite / 625 passed.
- **SC3:** il personaggio ha coins `{0,1,0}` e lancia 3 `accept(charId, questId, 30)` concorrenti con `Promise.allSettled`. Risultato: 1 fulfilled e 2 rejected, entrambi con `code === 'QUEST_SLOT_BUSY'`. Resta un solo `PendingQuest` (`countDocuments` = 1) e i coins sono `{0,0,70}` (un solo debito). Lo slot grezzo è `toEqual` l'id restituito al vincitore.
- **Nessun orfano:** saldo insufficiente (`{0,0,10}`, costo 30) → `INSUFFICIENT_FUNDS`. Il debito fallisce dopo claim e insert, quindi l'abort li annulla entrambi: lo slot grezzo torna `null`, `pendingquests` ha 0 documenti e i coins sono invariati. Con lo slot occupato → `QUEST_SLOT_BUSY`, 0 PendingQuest, coins e slot invariati.
- Codici: quest sconosciuta → `NOT_FOUND 'Missione non trovata'`, slot null, 0 PendingQuest. Personaggio inesistente o archiviato → `NOT_FOUND`, 0 PendingQuest. Costo `-1` / `1.5` → `RangeError`, nessuna scrittura.
- Acceptance grep:
  - `'quests.pendingQuest': null` → 1
  - `timeToComplete ?? 0` → 1
  - `status.coins` nel service → 0 (D-04)
  - `@Resolver`/`@Mutation` in `src/quests/acceptance` → vuoto (D-09)
  - `exports: [QuestAcceptanceService]` → 1
  - `'QUEST_SLOT_BUSY'` nello spec → 2
  - spec di 305 righe (≥ 150)
  - `QuestAcceptanceModule` in `app.module.ts` → 2
  - test di boot presente; whitelist `EXPECTED_*` invariate rispetto a `develop`
  - `Co-Authored-By` nei commit → 0

## Deviations from Plan

### Auto-fixed Issues

Nessuna nel comportamento. Note di forma:

1. **Grep `applyCharacterCoinsDelta(characterId, -costCopper, session)` su una riga.** Prettier manda gli argomenti a capo (stessa nota del 04-06). Con le righe unite, `tr -s ' \n' ' ' | grep -o "applyCharacterCoinsDelta( *characterId, -costCopper, session,* *)"` trova 1 occorrenza.
2. **`assertValidCost`.** La guardia sul costo è una funzione di modulo invece di un `if` inline. Il comportamento è identico: `RangeError` prima di qualunque I/O.
3. **Spec.** Il caso 1 verifica in più che i PendingQuest siano 1; il caso 4 che lo slot occupato resti invariato; i casi 7 e 9 che lo slot resti null. I casi sono raggruppati in tre describe (successi / rifiuti / SC3) con l'helper `questTaking(timeToComplete)`. `init()` è chiamato su characters, quests e pendingquests: la User collection non viene scritta da questa primitiva.

## Known Stubs

Nessuno. Il costo è un parametro per scelta del plan: il cost model per tipologia e le corsie story/worldMission sono della Phase 7.

## Threat Flags

Nessuno: nessun resolver né tipo GraphQL nuovo, schema invariato. T-04-07-01..05 mitigati e provati (casi 8, 4/5/8, 9, 7 e test di boot).

## Self-Check: PASSED

- FOUND: src/quests/acceptance/quest-acceptance.module.ts, src/quests/acceptance/quest-acceptance.service.ts, src/quests/acceptance/quest-acceptance.service.int-spec.ts
- FOUND commits: d584615, aa37955, f3155d2, 4dedf74
