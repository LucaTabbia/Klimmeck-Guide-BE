---
phase: 10-hardening-trasversale
plan: 04
subsystem: mongo/change-streams
tags: [change-stream, resilienza, backoff, D-17a, BE-HARD-06]
requires: []
provides:
  - "src/mongo/reopen-backoff.ts: reopenDelayMs(attempt: number): number, REOPEN_BASE_DELAY_MS = 1_000, REOPEN_MAX_DELAY_MS = 30_000"
  - "ChangeStreamPublisher: riapertura dopo error o close inattesa con backoff, startAfter sul token di ripresa, ripartenza senza token sul codice 286 con WARN, chiusura senza timer"
  - "test/harness/change-stream-reopen.int-spec.ts: prova della riapertura dopo il drop della collection osservata"
affects: [10-18, 10-23, 10-30]
tech-stack:
  added: []
  patterns:
    - "token di ripresa preso sia da change._id sia dall'evento resumeTokenChanged del driver (inoltrato da Mongoose), solo per lo stream corrente"
    - "listener protetti dall'identità dello stream: un error o un token di uno stream abbandonato non fa nulla"
    - "un solo timer di riapertura per publisher, .unref(), cancellato in onModuleDestroy"
key-files:
  created:
    - src/mongo/reopen-backoff.ts
    - src/mongo/reopen-backoff.spec.ts
    - src/mongo/change-stream-publisher.spec.ts
    - test/harness/change-stream-reopen.int-spec.ts
    - .planning/phases/10-hardening-trasversale/10-04-SUMMARY.md
  modified:
    - src/mongo/change-stream-publisher.ts
decisions:
  - "Il token di ripresa segue anche resumeTokenChanged: dopo un drop il driver chiude lo stream senza consegnare l'invalidate come change, e riprendere dall'ultimo insert rivede l'invalidate a ogni riapertura (ciclo infinito osservato sul replica set)"
  - "Il tentativo n. del log è attempt + 1; il contatore cresce a ogni riapertura e torna a 0 al primo change"
  - "Lo stream abbandonato perde i listener change/close/resumeTokenChanged e viene chiuso ignorando l'errore; il listener error resta ma è inerte (controllo d'identità)"
metrics:
  duration: "~25 min"
  completed: 2026-10-29
  tasks: 2
  files: 5
---

# Phase 10 Plan 04: riapertura dei change stream con backoff e ripresa Summary

La base `ChangeStreamPublisher` riapre il proprio stream dopo un `error` o una `close` inattesa con backoff 1 s → 30 s (azzerato dal primo evento), riprende con `startAfter` dall'ultimo token visto (anche quello che il driver avanza oltre gli eventi filtrati), riparte senza token sulla storia persa (286) con un WARN e non riapre mai durante la chiusura; le quattro sottoclassi esistenti e `ArchivedCharacterQueueRefresher` ereditano il comportamento senza modifiche.

## Task eseguiti

| Task | Nome | Commit | File |
|------|------|--------|------|
| 1 (RED) | spec del backoff e del ciclo di vita | `2e01146` | `src/mongo/reopen-backoff.spec.ts`, `src/mongo/change-stream-publisher.spec.ts` |
| 1 (GREEN) | backoff puro e riapertura della base | `eff3867` | `src/mongo/reopen-backoff.ts`, `src/mongo/change-stream-publisher.ts` |
| 2 (RED, deviazione) | ripresa dal token del driver | `c312265` | `src/mongo/change-stream-publisher.spec.ts` |
| 2 (GREEN, deviazione) | ascolto di `resumeTokenChanged` | `a98488e` | `src/mongo/change-stream-publisher.ts` |
| 2 | int-spec della riapertura dopo un invalidate | `81f716f` | `test/harness/change-stream-reopen.int-spec.ts` |

## TDD

- **RED Task 1:** `reopen-backoff.spec.ts` falliva per modulo mancante (`Cannot find module './reopen-backoff'`); in `change-stream-publisher.spec.ts` 8 casi su 10 rossi (backoff, close inattesa, chiusura dello stream abbandonato, ripresa, storia persa, reset del backoff, timer cancellato alla chiusura, formato del log: il vecchio messaggio era `Errore nel change stream delle sonde: MongoServerError, code 43`).
- **Verdi al primo colpo nel RED:** `forwards the changes of the open stream to the subclass` (comportamento già esistente, guardia) e `never reopens while the application is closing (D-17a)` (la vecchia base non riapriva mai: la guardia diventa significativa solo con la riapertura).
- **GREEN Task 1:** 16/16 (spec mirate); poi `npx jest src/mongo src/users src/quests --selectProjects unit` 34 suite / 645 verdi; `npm run build` esce 0.
- **Task 2, prima esecuzione della int-spec: ROSSA** con il codice del Task 1. Osservato: dopo `dropCollection` il driver chiude lo stream (`close`) senza consegnare l'invalidate come `change`; la base riapriva con `startAfter` sul token dell'ultimo insert, rivedeva l'invalidate e si richiudeva (riaperture n. 1…4 a 1/2/4/8 s, nessun insert pubblicato in 10 s).
- **RED della correzione (`c312265`):** `resumes after the token the driver reports past filtered events (D-17a)` rosso (startAfter era `tok-1` invece di `tok-batch`); `ignores the tokens of an abandoned stream (D-17a)` verde al primo colpo (nessun listener del token esisteva ancora: guardia di regressione per il controllo d'identità).
- **GREEN (`a98488e`):** 12/12 nella spec della base; unit `src/mongo src/users src/quests` 34 suite / 645; int-spec 1/1 con latenza osservata ≈ 1,6 s (una riapertura a 1 s, primo insert dopo il drop pubblicato).
- Regressioni integration (foreground, `--runInBand`): `src/quests/pending-requests src/users src/characters/archived-character.realtime.int-spec.ts` 10 suite / 66; `src/quests/results test/harness` 9 suite / 58; `src/quests/quest-updated.subscription.int-spec.ts test/app.int-spec.ts` 2 suite / 61.

## Deviazioni dal piano

### Auto-fixed Issues

**1. [Rule 1 - Bug] La riapertura dopo un drop riprendeva prima dell'invalidate**
- **Trovato durante:** Task 2 (int-spec rossa)
- **Problema:** il piano salva il token solo da `change._id`; con la pipeline filtrata l'invalidate non arriva come `change`, quindi il token restava quello dell'ultimo insert e ogni riapertura rivedeva l'invalidate (ciclo di riaperture, publisher muto).
- **Correzione:** listener `resumeTokenChanged` (già inoltrato da Mongoose, come suggeriva il RESEARCH §F7) che aggiorna il token dello stream corrente; rimosso nel `detach`. Il caso «se il driver non consegna l'invalidate la riapertura parte senza token» previsto dal piano non si verifica: il token c'è ma è quello sbagliato, quindi senza questa correzione il caso restava rosso.
- **File:** `src/mongo/change-stream-publisher.ts`, `src/mongo/change-stream-publisher.spec.ts`
- **Commit:** `c312265` (RED), `a98488e` (GREEN)

**2. Casi unit in più rispetto al `<behavior>`:** `forwards the changes…`, `closes the stream it abandons before reopening (D-17a)`, `cancels a pending reopen when the application closes (D-17a)` e i due casi del token del driver (12 casi in tutto, il piano ne chiede almeno 7).

## Comportamento osservato da ricordare

- Il `dropDatabase` di `harness.close()` invalida tutti gli stream aperti prima di `app.close()`: ogni publisher logga un `Change stream … chiuso (chiusura inattesa): riapertura n. 1 fra 1000 ms` e pianifica un timer (unref), che `onModuleDestroy` cancella subito dopo. È rumore di teardown atteso, non un errore; una spec che conta le chiamate a `Logger.prototype.error` durante la chiusura dell'harness deve tenerne conto.

## Threat model

- T-10-12: mitigata (riapertura con backoff e ripresa; spec unit + int-spec dell'invalidate).
- T-10-13: mitigata (tetto 30 s, un solo timer per publisher, `.unref()`, cancellato in chiusura).
- T-10-14: mitigata (`logs only the subject, the attempt and the error description (D-17a)`: messaggio esatto con soggetto, tentativo, ritardo e `describeError`, nessun `errmsg` dell'errore).

## Known Stubs

Nessuno.

## Self-Check: PASSED

- FOUND: `src/mongo/reopen-backoff.ts`, `src/mongo/reopen-backoff.spec.ts`, `src/mongo/change-stream-publisher.spec.ts`, `test/harness/change-stream-reopen.int-spec.ts`
- FOUND: commit `2e01146`, `eff3867`, `c312265`, `a98488e`, `81f716f`
- Sottoclassi intatte: `git diff ca3aa92 --stat` su `src/users`, `quests.publisher.ts`, `src/quests/pending-requests`, `quest-results.publisher.ts` vuoto
- `git diff --exit-code src/schema.gql` esce 0; righe rimosse rispetto a `origin/develop`: 0
