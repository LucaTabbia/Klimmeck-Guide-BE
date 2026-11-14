---
phase: 22-completamento-guidato-missioni
plan: 16
subsystem: quests
tags: [guided-mission, completion, transaction, graphql, authz]
requires: ["22-15"]
provides:
  - "EffectiveFight, effectiveSequenceOf, aggregateEffectsOf, mergedEnemiesOf, assertFightsComplete, overrideInputOf (guided-outcome.ts)"
  - "GuidedCompletionService.complete(pendingQuestHex): Promise<QuestResultDraft[]> (guided-completion.service.ts)"
  - "mutation completeGuidedMission(pendingQuestId: ID!): [QuestResult!]!"
affects: [22-17, 22-18]
tech-stack:
  added: []
  patterns: ["GmCommitPlan del ciclo condiviso: outcomesOf rivalida in sessione, afterSeats cancella la bozza", "effetto aggregato puro dalla sequenza degli effetti effettivi"]
key-files:
  created:
    - src/quests/guided/guided-outcome.ts
    - src/quests/guided/guided-outcome.spec.ts
    - src/quests/guided/guided-completion.service.ts
    - src/quests/guided/guided-completion.service.int-spec.ts
  modified:
    - src/quests/guided/guided-mission.module.ts
    - src/quests/guided/guided-mission.resolver.ts
    - src/quests/guided/guided-mission.resolver.int-spec.ts
    - test/app.int-spec.ts
    - test/authz/expected-handlers.ts
    - test/authz/handler-fixtures.ts
    - test/authz/authorization-matrix.int-spec.ts
    - src/schema.gql
decisions:
  - "assertFightsComplete conta come mancante anche un outcome senza effetti effettivi (simulated e corrected entrambi null), non solo l'outcome assente"
  - "Il controllo D-14 delle ferite di prima vale solo sugli scontri corretti; gli effetti simulati passano da woundsAfter (ruling W5)"
  - "recoveryTimes = recoveryTimesOf delle sole magie usate negli aggregati dei posti; nessun tempo dal catalogo della quest"
  - "Catalogo dei premi letto con readRewardCatalogFor sulle voci scelte di tutti i premi della bozza, sorgente del pool null"
  - "Un posto senza voce nella bozza resta senza esito in outcomesOf: il ciclo condiviso rifiuta l'intera richiesta con OUTCOME_OVERRIDE_INVALID"
metrics:
  duration: "~40 min"
  completed: 2026-11-14
  tasks: 3
  files: 12
---

# Phase 22 Plan 16: Completamento guidato in una transazione Summary

`completeGuidedMission` legge solo la bozza e la scrive come esito in una transazione col ciclo condiviso di `GmCompletionService.completeWith`: sequenza degli scontri e premi rivalidati sugli snapshot in sessione, nemici di tutti gli scontri fusi in `QuestResult.enemies`, xp dei nemici e del compagno, conoscenza e lore di vittoria, premi scelti senza tiri, esito sempre `gmCompleted`; la bozza muore nella stessa transazione e il blocco cade.

## Esito aggregato

- `effectiveSequenceOf(fights, hex)`: per scontro l'effetto effettivo del personaggio (`corrected ?? simulated`) con `corrected: outcome.corrected != null`; outcome o effetto assente saltato.
- `aggregateEffectsOf`: vita = `hpAfter` dell'ultimo effetto, ferite unite senza doppioni nell'ordine di comparsa, consumi e usi sommati per id nell'ordine della prima comparsa; zero scontri → `null` (nessun combattimento).
- `mergedEnemiesOf`: nemici fusi per id nell'ordine della prima comparsa, quantità sommate.
- `assertFightsComplete`: ogni scontro con verdetto e con un effetto per ogni posto, altrimenti `OUTCOME_OVERRIDE_INVALID`.
- `overrideInputOf`: effetti → `ParticipantOverrideInput` (id esadecimali).

## Rivalidazioni in sessione

Per ogni snapshot riletto in transazione: per ogni scontro i lo stato sovrapposto `stateBeforeFight(snapshot, effetti 0..i-1)`, `validateOverrides([overrideInputOf(...)], [overrideParticipantOf(overlay)])` e, solo se lo scontro è corretto, `assertAddsOnlyNewInjuries(fightStartOf(overlay).injuriesBefore, ...)`; premio del posto → `assertPrizeAllowed(refs esadecimali, allowanceFor(request, snapshot, catalogue))`. Un errore abortisce la transazione: nessuna scrittura (provato con `toEqual` sul dump di characters, missiondrafts, pendingquests, questresults, quests).

Ordine dei rifiuti: `requests.read` (`NOT_FOUND`) → `assertNoBusyParticipant` (`QUEST_IN_PROGRESS`) → `requireFor` (`NOT_FOUND`) → `assertFightsComplete` (`OUTCOME_OVERRIDE_INVALID`) → letture dei cataloghi → transazione.

## Commit

| Task | Commit | Messaggio |
|------|--------|-----------|
| 1 RED | d60f35c2 | test(gm): pin the guided mission completion |
| 1 GREEN | 14e61947 | feat(gm): complete a guided mission from its draft |
| 2 RED | 7d28b420 | test(gm): pin the guided mission completion on the wire |
| 2 GREEN | aa190511 | feat(gm): expose the guided mission completion |

Fallimenti attesi del RED: task 1, modulo `guided-outcome` / `guided-completion.service` assente (Cannot find module); task 2, `Cannot query field "completeGuidedMission" on type "Mutation"` (GRAPHQL_VALIDATION_FAILED) in resolver, matrice e boot reale, più `handler-fixtures.spec` (fixture senza handler).

## Esiti

- unit `src/quests/guided` + `handler-fixtures.spec`: 58/58
- integration `guided-completion.service.int-spec` + `gm-completion.service.int-spec`: 38/38
- integration `test/app.int-spec.ts` + matrice + `src/quests/guided`: 304/304
- `tsc --noEmit` 0; `src/schema.gql` +1 riga (`completeGuidedMission`), 0 righe tolte da `c6079ca3`

Casi verdi al primo colpo dopo il GREEN: tutti tranne uno (vedi deviazioni). Nessun caso verde già nel RED (moduli e mutation assenti).

## Deviazioni dal piano

1. **[Rule 1 - Bug nel test] Usi della magia nel caso principale** — Trovato nel task 1 GREEN: il copione del secondo scontro non usava la magia, quindi la somma attesa (5 → 3) era sbagliata nel test (risultato reale 4, corretto). Aggiunto un uso della magia al secondo scontro simulato, così il caso prova davvero la somma degli usi fra uno scontro corretto e uno simulato. File: `guided-completion.service.int-spec.ts`, nel commit GREEN 14e61947.
2. **[Rule 1] Matrice 17 → 18 righe HTTP** — `test/authz/authorization-matrix.int-spec.ts` aggiornata nel commit RED del task 2 (7d28b420), come da nota dell'orchestratore.
3. **Lint** — la prima versione di `guided-outcome.ts` usava un helper generico che ESLint rifiutava (`restrict-plus-operands`); riscritto con `totalsById` prima del commit GREEN.
4. **STATE.md** — aggiornata anche la riga `Last activity` (ferma al piano 14) oltre a `Plan: 16 of 18`.

Nessuna spec fuori dai file del piano diventata rossa.

## Known Stubs

Nessuno.

## Threat Flags

Nessuna superficie nuova oltre al registro del piano (T-22-39..42 mitigate: nessun input di stato, rivalidazione in sessione, transazione unica, `@Roles(innkeeper)` + `@AuditTarget` + 19 handler pinnati + FORBIDDEN dell'adventurer).

## Self-Check: PASSED
