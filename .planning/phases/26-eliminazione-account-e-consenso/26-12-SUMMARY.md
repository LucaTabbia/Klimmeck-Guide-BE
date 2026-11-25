---
phase: 26-eliminazione-account-e-consenso
plan: 12
subsystem: users, account, push, cloudinary
tags: [account-deletion, after-commit, fcm-topic, outbox, push]
requires: ["26-05", "26-07", "26-08", "26-10", "26-11"]
provides:
  - "PushService.unsubscribeFromStreamerLive(tokens): una chiamata al trasporto per l'intero elenco, vuoto → nulla, errore → WARN col solo conteggio"
  - "notifyQuestCancelled(..., logger, message = questCancelled(questId)): parametro opzionale in coda, chiamanti di oggi invariati"
  - "AccountEraser: ritratti caricati dei personaggi dell'account accodati con enqueueWithin nella transazione, esclusi quelli il cui imagePath è ancora usato da un personaggio che resta"
  - "AccountDeletionService.afterCommit asincrono, atteso da erase dentro afterCommitSafely: nulla risale alle due mutation"
  - "AccountDeletionModule: PushModule, forFeature PortraitDeletion, questConfigProvider, CloudinaryService (classe sola), PortraitStore via useFactory, PortraitDeletionService, PortraitDeletionSweeper"
affects: [26-13, 26-14]
tech-stack:
  added: []
  patterns:
    - "effetti esterni solo dopo il commit, ciascuno best-effort, con un trasporto finto che legge il DB nell'istante della chiamata per provarlo"
key-files:
  created: []
  modified:
    - src/push/push.service.ts
    - src/push/push.service.spec.ts
    - src/quests/party/registered-release.ts
    - src/account/deletion/account-eraser.ts
    - src/account/deletion/account-eraser.int-spec.ts
    - src/account/deletion/account-deletion.module.ts
    - src/account/deletion/account-deletion.service.ts
    - src/account/deletion/account-deletion.resolver.int-spec.ts
decisions:
  - "PortraitStore con useFactory (inject CloudinaryService) che adatta destroy → destroyPortrait (ruling dell'orchestratore): useExisting darebbe un'istanza senza destroy"
  - "La guardia dei sopravvissuti confronta l'imagePath esatto (lettura in sessione di ogni personaggio fuori dall'elenco, archiviati altrui compresi)"
  - "afterCommit: ogni passo è già best-effort da sé (notifyQuestCancelled, unsubscribeFromStreamerLive, flush non lanciano); la chiusura dei socket ha un try/catch suo e tutto il metodo è avvolto da afterCommitSafely"
  - "L'harness della int-spec del resolver passa a createCharactersTestApp con AccountDeletionModule e QuestsModule (publisher di personaggi e quest, AuthzModule incluso): i 20 casi dei piani 08 e 10 restano verdi senza modifiche"
metrics:
  duration: "~45 min"
  completed: 2026-11-25
  tasks: 3
  files: 8
---

# Phase 26 Plan 12: effetti dopo il commit della cancellazione Summary

Ritratti accodati nell'outbox nella stessa transazione della cancellazione (solo quelli caricati e non più mostrati da nessuno), poi, dopo il commit e senza mai far fallire la mutation: socket chiusi, push `startedQuestCancelled` ai compagni rientrati, `questCancelled` di oggi ai soccorritori liberati dall'archivio, token dell'utente fuori dal topic `streamer-live`, `flush` dei ritratti su Cloudinary; stessa sequenza per la via dell'oste (D-13, D-14, D-15, D-25, D-26, N6, regola dura 5).

## Commit

| Task | Commit | Subject |
|------|--------|---------|
| 1 RED | 906a7014 | test(users): expect portraits queued and tokens unsubscribed |
| 1 GREEN | 11744197 | feat(users): queue portraits and unsubscribe push tokens on deletion |
| 2 RED | 8bf494e5 | test(users): expect the after-commit effects of an account deletion |
| 2 GREEN | 0361e19d | feat(users): notify, unsubscribe and clean up after an account deletion |
| 3 | (questo commit) | docs(phase-26): record plan 12 progress |

## Fallimenti RED

- Task 1: `push.service.spec.ts` 3 rossi su 34 (`TypeError: service.unsubscribeFromStreamerLive is not a function`); `account-eraser.int-spec.ts` 1 rosso (`queues the uploaded portraits …`: outbox vuoto, attesi due righe). **Verdi già nel RED** (prove di assenza, guardie di non-regressione): `queues no preset or foreign image`, `queues no portrait still used by a surviving character`, `leaves no outbox row when the erasure is refused (D-16)`: senza l'accodamento l'outbox è comunque vuoto. Gli override di `PUSH_CONFIG`, `PushTransport`, `PortraitStore`, `QUEST_CONFIG` sono entrati negli harness già nel RED (ignorati da Nest finché i provider non esistono), così i due file sono rimasti verdi a ogni commit.
- Task 2: 7 rossi su 28 nel resolver: nessun push ai compagni né ai soccorritori (`[]`), nessuna disiscrizione, ritratto non distrutto (riga dell'outbox con `attempts` 0), caso dei fallimenti rosso sul ritratto non distrutto, via dell'oste senza push. **Verde già nel RED:** `publishes the companions sent back and the quest back on the board (D-26)`: le pubblicazioni vengono dai change stream esistenti sulle scritture della transazione (piano 07), il caso è una guardia sul filo.

## Ordine finale dei passi dopo il commit

`erase` → `connection.transaction(eraseWithin)` → `await afterCommitSafely(report)`:
1. `revocation.closeDeletedAccountSessions` (try/catch suo);
2. per ogni `report.cancelled`: `notifyQuestCancelled(users, push, questId, characterIds, logger, startedQuestCancelled(questId))`;
3. per ogni `report.released`: `notifyQuestCancelled(...)` col testo di oggi;
4. `push.unsubscribeFromStreamerLive(report.pushTokens)`;
5. `portraits.flush()`.

La risposta HTTP parte dopo il `flush` (attesa), quindi i casi sono deterministici; un fallimento di Cloudinary lascia la riga con `attempts` 1 allo sweeper.

## Harness delle pubblicazioni

`createCharactersTestApp({ imports: [AccountDeletionModule, QuestsModule], clock, overrides })` con `FakeTwitchUserDirectory`, un `CommitObservingPushTransport` locale (estende `FakePushTransport`: `observe` letto a ogni invio e a ogni disiscrizione, `failSends` per far lanciare l'invio), `FakePortraitStore`, `PUSH_CONFIG` `{ serviceAccount: null }`, `QUEST_CONFIG` `{ sweepIntervalMs: 0 }`. Change stream innescati in `beforeAll` con `primeChangeStream` (`characterTouch`, `questTouch`). Subscription WS reali: `characterUpdated(id)` col bearer del compagno A (`status { location { id } } quests { pendingQuest { id } }`) e `questUpdated(questId)`; si legge fino al primo evento che soddisfa l'attesa (le scritture della transazione arrivano in raffica).

## WARN osservati

- Topic: `unsubscribe streamer-live failed for 2 token(s) of a deleted account: <describePushError>` (nessun token, nemmeno il suffisso).
- Invio: `Push questCancelled not sent: …` da `sendToUser` (di oggi).
- Ritratto: `Cancellazione del ritratto <id riga> fallita: …` (piano 11, mai il public id).
- Il caso `keeps the deletion when the topic or a push fails (D-25)` verifica che nessun WARN contenga un token (`tok-`).

## Verifiche

- Task 1: `push.service.spec.ts` 34/34; integration (eraser, resolver, character-deletion resolver, party-timeout) 4 suite / 83 test; `tsc` 0.
- Task 2: resolver 28/28; poi eraser + character-deletion resolver + party-timeout + outbox dei ritratti 4 suite / 68 test; `test/app.int-spec.ts` 109/109 (boot di `AppModule` col modulo cablato, `src/schema.gql` senza diff); `tsc` 0.
- Accettazione: `async unsubscribeFromStreamerLive` 1; `enqueueWithin(` nell'eraser 1; `useFactory` nel modulo 1, `CloudinaryModule` 0, `questConfigProvider` 2; `startedQuestCancelled(` 1, `unsubscribeFromStreamerLive(` 1, `flush()` 1 nel servizio; `D-(13|14|15|25|26)[,)]` 16 righe e `portrait default)` 2 nel resolver; `git diff 9a084248 --stat -- src/characters/deletion` vuoto; nessun `chance.next(`.
- Prettier ed eslint puliti sui file toccati; `pgrep -fl 'bin/jest'` vuoto a fine task.

## Deviations from Plan

- **[Ruling dell'orchestratore] `PortraitStore` via `useFactory`** (`inject: [CloudinaryService]`, `destroy: (id) => cloudinary.destroyPortrait(id)`) invece di `useExisting: CloudinaryService`; il grep di accettazione `useExisting: CloudinaryService` = 1 è sostituito da `useFactory` = 1.
- **`questUpdated` sul filo senza `startedAt`:** il campo è interno (mai nello SDL); il caso prova la quest tornata sul tabellone con `registeredAdventurers: []` sull'evento e `startedAt` nullo letto a DB.
- **Harness del resolver** da `createAuthTestApp` a `createCharactersTestApp` (porta `AuthzModule` e i publisher dei personaggi) con `QuestsModule`: necessario per le pubblicazioni sul filo; i casi esistenti invariati.
- Prettier lanciato una volta su due file nella stessa riga di comando (spec del Task 1), invece che uno per uno; nessun effetto sul risultato.

## Known Stubs

Nessuno.

## Threat Flags

Nessuna superficie nuova oltre al registro del piano (T-26-47..T-26-51 coperti dai casi).

## Note per i piani successivi

- `AccountDeletionModule` ora monta l'unico `PortraitDeletionSweeper` dell'app e un `QUEST_CONFIG` locale; ogni nuovo harness che importa il modulo deve sovrascrivere `PushTransport`, `PUSH_CONFIG`, `PortraitStore` (fake) e `QUEST_CONFIG` (`sweepIntervalMs: 0`).
- Lo sweeper fa un `flush` al boot anche nei test: con `FakePortraitStore` è innocuo.
- `FakePortraitStore` non ha `reset()`: la spec del resolver svuota `destroyed` in `afterEach`.

## Self-Check: PASSED

- Commit 906a7014, 11744197, 8bf494e5, 0361e19d presenti nella storia del ramo.
- File modificati presenti; nessun file creato oltre a questo SUMMARY.
