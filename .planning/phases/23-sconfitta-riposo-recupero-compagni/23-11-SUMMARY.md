---
phase: 23-sconfitta-riposo-recupero-compagni
plan: 11
subsystem: push, travel/ambush
tags: [imboscate, push, compagni, fcm]
requires: [23-09 (pin del blocco enum PushEventType, push.exception.spec), 23-10 (QuestResult dell'imboscata con resultId, AmbushReportDraft.companion)]
provides: [PushEventType.ambush, builder ambush(resultId, body), ambushPushOf / ambushPushFactsOf (src/travel/ambush/ambush-push.ts), push dopo il commit di ogni imboscata vinta o persa]
affects: [src/push/push-events.ts, src/travel/ambush/ambush-resolution.service.ts, src/schema.gql]
tech-stack:
  added: []
  patterns: [compositore puro del testo della push separato dal builder del catalogo]
key-files:
  created:
    - src/travel/ambush/ambush-push.ts
    - src/travel/ambush/ambush-push.spec.ts
  modified:
    - src/push/push-event-type.enum.ts
    - src/push/push-events.ts
    - src/push/push-events.spec.ts
    - src/push/push.exception.spec.ts
    - src/travel/ambush/ambush-resolution.service.ts
    - src/travel/ambush/ambush-resolution.int-spec.ts
    - src/travel/ambush/ambush-lifecycle.int-spec.ts
    - test/app.int-spec.ts
    - src/schema.gql
decisions:
  - "PushEventType.ambush in coda all'enum TS (dopo petRecovered); nello SDL esce prima di ambushDefeat perché lo SDL ordina alfabeticamente"
  - "Sconfitta senza città raggiunta (non dovrebbe accadere: la deviazione la dà sempre): il corpo ripiega sulla città vicina all'imboscata"
  - "Il builder ambushDefeat è tolto; il tipo resta nell'enum e la voce di catalogo resta per sendTestPush"
metrics:
  duration: ~35 min
  completed: 2026-11-14
---

# Phase 23 Plan 11: push `ambush` per ogni imboscata Summary

Ogni imboscata risolta, vinta o persa, con o senza compagno, manda dopo il commit una push `ambush` al solo proprietario, con `id` = id del `QuestResult` dell'imboscata e un testo composto dal BE che nomina il compagno caduto; `ambushDefeat` resta nell'enum ma non parte più.

## Testi delle push (copy provvisoria, la rivede l'utente in UAT)

Titolo sempre «Imboscata!», TTL 1 h. Corpo di catalogo (sendTestPush): «Hai subito un'imboscata.»

| Caso | Corpo |
|------|-------|
| vinta | `Imboscata presso ${near}: hai respinto gli assalitori` |
| vinta, compagno caduto | `Imboscata presso ${near}: ${nome} è stato sconfitto` |
| ... a piedi (piano 13, `onFoot`) | `…: ${nome} è stato sconfitto, prosegui a piedi` |
| ... ridiretta dalla fame (piano 14, vinta con `reachedCity`) | corpo vinto + `; la fame ti porta verso ${reached}` |
| persa | `Sei stato sconfitto: la via torna verso ${reached}` |
| persa, compagno caduto | `… verso ${reached}. ${nome} è stato sconfitto` |

`ambushPushFactsOf(report)`: `won` = outcome success; `fallenCompanion` = `companion.name` (già il nome mostrato, `companionDisplayName`) se `companion.defeated`; `onFoot` = `report.onFoot === true` (campo non ancora sul report: lo accende il piano 13); `hungerRedirect` = `won && reachedCity !== null` (oggi una vittoria ha sempre `reachedCity: null`: lo accende il piano 14).

## Commit

- b5ecc2c9 test(push): pin the push of every ambush
- ea42d287 feat(push): compose the push of every ambush
- d4e3c567 test(travel): pin a push for every ambush
- d13697bc feat(travel): push every ambush to its owner

## Spec

- Nuova `ambush-push.spec.ts` (10 test: 6 varianti `it.each` con `toEqual` sul messaggio intero, id = risultato, 3 su `ambushPushFactsOf`).
- `push-events.spec.ts`: `ambush` in BUILDERS / IDENTIFIED_TYPES / COMPOSED_BODY_TYPES e nella tabella delle chiavi; `builds the ambush push with the result id (D-30)` e `keeps a generic ambush body for the test push (D-30)`; tolto il caso del builder `ambushDefeat` (BUILDERS usa `testPushMessage` per quel tipo; il caso del corpo generico di `ambushDefeat` resta). `ambushDefeat` tolto da COMPOSED_BODY_TYPES.
- `push.exception.spec.ts`: `'ambush'` in coda al pin di `Object.values(PushEventType)`.
- `ambush-resolution.int-spec.ts`: «never pushes on a victory (D-12)» → `pushes a won ambush to the owner after the commit with the result id (D-14, D-30)`; «pushes every defeat…» → `pushes a lost ambush as an ambush, never as ambushDefeat (D-14, D-30)`; nuovi `names the fallen companion in the push (D-14, D-20)` (voce rinominata «Fenrir» via `$set 'assets.ownedPets.1.name'`, `companionLifeAfter: 1`) e `sends no push for a skipped or stale ambush (D-14)`.
- `ambush-lifecycle.int-spec.ts`: «pushes every defeat and never a victory (D-12)» → `pushes every ambush, won or lost (D-14)` ([ambush], [ambush, ambush], poi + travelEnd); aggiornati anche gli altri 4 punti che attendevano `ambushDefeat` o solo `travelEnd` dopo un'imboscata vinta (D-13 completamento dopo l'imboscata, detour a Crocevia/Borgo, sconfitta su viaggio di quest).
- `test/app.int-spec.ts`: pin del blocco `enum PushEventType` con `  ambush` in testa.

Verdi al primo colpo, col motivo:
- `sends no push for a skipped or stale ambush (D-14)`: è una guardia di non regressione, skip e stale già non inviavano nulla.
- Il pin SDL di `test/app.int-spec.ts`: il boot reale rigenera `src/schema.gql` prima di leggerlo e il valore `ambush` era già nell'enum dal Task 1; il RED vale contro lo SDL committato (`git show HEAD:src/schema.gql` nel blocco PushEventType: 0 righe `  ambush`).

Esiti: unit `src/travel/ambush src/push` 25 suite / 271; integration `src/travel/ambush` + boot reale 5 suite / 167 (boot 102/102); non regressione travel-completion, travel-completion.processor, teleport.resolver, travel.resolver 4 / 98. `tsc` 0. SDL vs 2c462cbe: righe tolte solo quella di `useItem`; nel blocco PushEventType `ambush` = 1, `ambushDefeat` = 1. `grep -rn "ambushDefeat(" src | grep -v spec.ts` = 0.

## Deviations from Plan

1. **[Rule 3 - Blocking] builder `ambushDefeat` lasciato temporaneamente nel Task 1** (previsto dal piano): `tsc` segnalava l'import nel servizio; tolto nel commit d13697bc insieme al cambio dell'invio.
2. **[Rule 3] Altri punti di `ambush-lifecycle.int-spec.ts`** oltre al caso indicato (righe che attendevano `ambushDefeat` o la sola `travelEnd` dopo un'imboscata vinta): aggiornati nello stesso commit RED.
3. **Falso positivo del controllo anti-trailer su d13697bc**: il corpo del commit dice «SDL regenerated with ambush», che combacia con la regex `generated with`. Nessun trailer presente (verificato con `git log -1 --format=%B`); niente amend per regola. Il `<verify>` automatico del Task 2 eseguito su quel commit darebbe falso negativo per questo solo motivo.
4. Grep del brief su `Plan: 0K of 18`: si usa `Plan: 11 of 18` (K a due cifre, combacia comunque).

## Threat model

T-23-32: invio al solo `fight.userId`. T-23-33: `notifyAmbush` solo dopo il commit e solo nei rami vinta/persa (spec skip/stale). T-23-34: accettato.

## Self-Check: PASSED
