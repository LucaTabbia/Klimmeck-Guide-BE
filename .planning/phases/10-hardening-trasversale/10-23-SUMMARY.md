---
phase: 10-hardening-trasversale
plan: 23
subsystem: refactor-interni
tags: [refactor, audit, change-stream, test-harness, D-17c, BE-HARD-06]
requires:
  - "10-21: `commitRescue` con i seat holder (`snapshotSeatHolderInSession`, `roster.seatHolders`)"
  - "10-22: `PendingQuestStartPublisher` e `pending-quest-start.publisher.int-spec.ts`; priming in `travel-completion.int-spec.ts`"
  - "10-20: gate `npx tsc --noEmit -p tsconfig.json`"
provides:
  - "`RescueResolutionService.fightRescuers(context, session, rescuable)` e `settleWounded(step, fallen)`; `commitRescue` è la loro composizione"
  - "`AuditTarget(type, idOf)` / `AUDIT_TARGET_KEY` / `AuditTargetRule` in `src/authz/audit/audit-target.decorator.ts`, letti dall'interceptor prima del ripiego"
  - "`completePendingRequest` registra l'audit con target `{ type: 'PendingQuest', id: <input.pendingQuestId> }`, anche per i rifiuti"
  - "`test/harness/prime-change-stream.ts`: `primeChangeStream(harness, topic, touch)`, `waitForQuiet(live)`, `PrimingTouch`, fabbriche `characterTouch`, `questResultTouch`, `pendingQuestTouch`, `questTouch`"
affects: [10-24, 10-25, 10-30]
tech-stack:
  added: []
  patterns:
    - "metadato di handler (`SetMetadata`) letto con `reflector.get` nell'interceptor globale, con ripiego invariato"
    - "priming dei change stream parametrizzato da un «touch» (setup/write/cleanup) per collection"
key-files:
  created:
    - src/authz/audit/audit-target.decorator.ts
    - src/authz/audit/audit-target.decorator.spec.ts
    - test/harness/prime-change-stream.ts
    - test/harness/prime-change-stream.spec.ts
  modified:
    - src/quests/outcomes/rescue-resolution.service.ts
    - src/authz/audit/admin-audit.interceptor.ts
    - src/quests/pending-requests/pending-requests.resolver.ts
    - src/quests/pending-requests/complete-pending-request.resolver.int-spec.ts
    - src/characters/archived-character.realtime.int-spec.ts
    - src/characters/character-quest-lanes.int-spec.ts
    - src/characters/character-updated.subscription.int-spec.ts
    - src/characters/pending-quest-start.publisher.int-spec.ts
    - src/quests/acceptance/accept-quest.resolver.int-spec.ts
    - src/quests/pending-requests/pending-requests.resolver.int-spec.ts
    - src/quests/pending-requests/standard-lane-liveness.int-spec.ts
    - src/quests/quest-updated.subscription.int-spec.ts
    - src/quests/results/quest-result-received.subscription.int-spec.ts
    - src/travel/teleport.resolver.int-spec.ts
    - src/travel/travel.resolver.int-spec.ts
    - src/travel/travel-completion.int-spec.ts
  removed:
    - test/characters/characters-change-stream.ts
    - test/quests/pending-requests-change-stream.ts
    - test/quests/quest-results-change-stream.ts
    - test/quests/quests-change-stream.ts
decisions:
  - "`fightRescuers` riceve un terzo argomento `rescuable` (ids dei feriti con proprietario): i feriti si leggono in sessione PRIMA del combattimento, perché i piani dei soccorritori ne hanno bisogno; le scritture restano identiche e nello stesso ordine"
  - "Il claim della aid resta in `fightRescuers` (registra i verdetti dei soccorritori); `settleWounded` restituisce `results` e `aids` che `commitRescue` accoda al `CommittedOutcome`"
  - "`primeChangeStream` attende `waitForQuiet` dopo ogni consegna (prima solo per `questUpdated`), poi chiude la sottoscrizione e chiama `cleanup()`; `pendingQuestTouch.cleanup` apre una sottoscrizione propria per attendere le liste tardive del `clearDatabase`"
  - "Il touch dei personaggi crea la sentinella nel `setup` e restituisce `undefined` (topic senza chiave); solo `questTouch` restituisce l'id per `questUpdated`"
metrics:
  duration: "~15 min"
  completed: "2026-10-30"
  tasks: 3
  files: 24
---

# Phase 10 Plan 23: refactor interni a comportamento invariato (D-17c) Summary

Il commit del soccorso di gruppo è spezzato in `fightRescuers` (combattimento ed esiti dei soccorritori, claim della aid) e `settleWounded` (liberazione o morte dei feriti e nuova aid); il target dell'audit di `completePendingRequest` è dichiarato con `@AuditTarget('PendingQuest', …)` e diventa `{ type: 'PendingQuest', id: <pendingQuestId> }`; un solo `primeChangeStream(harness, topic, touch)` sostituisce i quattro helper di priming in 12 spec.

## Commit

| Task | Nome | Commit | Tipo |
| ---- | ---- | ------ | ---- |
| 1 | `commitRescue` in `fightRescuers` + `settleWounded` | 40ef30f | refactor |
| 2 | RED del target dichiarato dell'audit | 4c9c5ab | test |
| 2 | GREEN di `@AuditTarget` letto dall'interceptor | 30925c2 | feat |
| 3 | RED dell'helper unico di priming | 67b4d6a | test |
| 3 | helper unico, 12 spec migrati, 4 helper rimossi | 88f9e2a | refactor |

## Task 1 — refactor del soccorso

- Rete prima: `aid-rescue` + `aid-timeout` + `boss-resolution` 3 suite / **40** verdi. Dopo: 3 suite / **40** verdi, nessuna modifica agli spec (`git diff` sugli `*.int-spec.ts` di `src/quests/outcomes` vuoto).
- `commitRescue` legge i feriti in sessione, chiama `fightRescuers(context, session, rescuableOf(wounded))` (snapshot dei soccorritori vivi e dei seat holder, combattimento unico, `writeParticipant` + `deletePendingQuest` per posto, `deletePendingQuest` dei seat holder, claim della aid) e poi `settleWounded({ context, wounded, session, notes }, fallen)` (`liberate` se nessun caduto, altrimenti `kill` + `createAid`).
- `npm run build` 0, `tsc` 0.

## Task 2 — `@AuditTarget`

- RED: `audit-target.decorator.spec.ts` `declares the audit target type and the id reader of a handler (D-17c)` — **rosso** (modulo mancante). `complete-pending-request.resolver.int-spec.ts`: nuovo `audits the completion with the pending quest as target (D-17c)` (completamento ok + rifiuto `OUTCOME_OVERRIDE_INVALID`, `toEqual` sui target) e tre casi esistenti aggiornati da `{ type: 'QuestResult', id: null }` al target della PendingQuest — **4 rossi** su 9 (Expected/Received sul target).
- GREEN: decoratore `AuditTarget(type, idOf)` = `SetMetadata(AUDIT_TARGET_KEY, { type, idOf })`; nell'interceptor `target: onBehalf ?? this.declaredTargetOf(context, args) ?? <ripiego>`, con `stringOrNull` condiviso fra dichiarato e ripiego. Resolver decorato su una riga propria sotto `@Roles`; commento del resolver aggiornato (Boy Scout).
- Verdi: unit `src/authz` 9 suite / 101; integration `src/quests/pending-requests` + teleport + `src/authz` 7 suite / 58; `npm run build` 0; `tsc` 0.

## Task 3 — un solo helper di priming

- RED (deviazione richiesta dall'orchestratore, il piano non prevedeva test nuovi): `test/harness/prime-change-stream.spec.ts` (unit, `createPubSub` reale e harness minimo) con 3 casi `(D-17c)` — consegna al terzo tocco + un solo cleanup, topic con chiave dal `setup`, errore che nomina il topic dopo 25 tentativi + cleanup — **rosso** (`Cannot find module './prime-change-stream'`). Poi 3/3 verdi.
- Conteggi dei 12 chiamanti: prima **12 suite / 135**, dopo **12 suite / 135**.
- Verifica del piano: `npx jest src/characters src/quests src/travel --selectProjects integration --runInBand` **50 suite / 724** (185 s); boot reale `test/app.int-spec.ts` **64** verdi; `tsc` 0; `npm run build` 0; `src/schema.gql` invariato; `grep` dei quattro helper vecchi in `src`/`test` vuoto.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `travel-completion.int-spec.ts` migrato fuori lista**
- **Found during:** Task 3
- **Issue:** lo spec (aggiunto dal piano 10-22) importava `primeCharactersChangeStream`; rimuovendo l'helper la suite non avrebbe compilato.
- **Fix:** migrato a `primeChangeStream(harness, 'characterUpdated', characterTouch(harness))`.
- **Commit:** 88f9e2a

**2. Firma di `fightRescuers` con un terzo argomento**
- **Found during:** Task 1
- **Issue:** i piani dei soccorritori usano gli ids dei feriti con proprietario (`rescuedCharacters`), che dipendono dalla lettura dei feriti con le note.
- **Fix:** `fightRescuers(context, session, rescuable)`; la lettura dei feriti in sessione precede gli snapshot dei soccorritori (letture nella stessa transazione, scritture identiche e nello stesso ordine).
- **Commit:** 40ef30f

**3. Test RED dell'helper di priming**
- **Found during:** Task 3
- **Issue:** il piano non prevedeva test per l'helper; l'orchestratore chiede che nasca RED.
- **Fix:** spec unit `test/harness/prime-change-stream.spec.ts` committato rosso prima dell'helper.
- **Commit:** 67b4d6a

**4. Scelte minori**
- `primeChangeStream` attende sempre `waitForQuiet` dopo la consegna (prima solo il priming delle quest): ~300 ms in più per suite, nessun evento tardivo che scavalca il `cleanup`.
- Spec del decoratore: handler letto con `Object.getOwnPropertyDescriptor(...).value` per la regola eslint `unbound-method`.
- `AuditTarget` (decoratore) ha lo stesso nome della classe del sotto-schema `AuditTarget` in `admin-audit-log.model.ts`: moduli diversi, l'interceptor importa solo `AUDIT_TARGET_KEY` e `AuditTargetRule`.

## Known Stubs

Nessuno.

## Threat Flags

Nessuna superficie nuova. T-10-82 mitigata (target con id anche per i rifiuti); T-10-83 mitigata (rete del soccorso invariata e verde).

## Self-Check: PASSED
