---
phase: 09-combat-result-admin-outcomes
plan: 15
subsystem: quests
tags: [outcomes, game-master, innkeeper, audit, graphql, transactions, tdd]

# Dependency graph
requires:
  - phase: 09-combat-result-admin-outcomes (09-02)
    provides: GameRuleException.outcomeNotParticipant / outcomeOverrideInvalid, nextTitleAfterStory
  - phase: 09-combat-result-admin-outcomes (09-05)
    provides: planParticipant (verdetto gmCompleted, battle come override del GM), questUpdateOf
  - phase: 09-combat-result-admin-outcomes (09-06)
    provides: QuestResultsReadModule, QuestResultsService.findOne, change stream che consegna i risultati
  - phase: 09-combat-result-admin-outcomes (09-07)
    provides: PendingRequestsResolver/Module, whitelist innkeeper, change stream della coda
  - phase: 09-combat-result-admin-outcomes (09-12..09-14)
    provides: OutcomeWriter + StaleResolution + deliver, ResolutionLoader, createOutcomeHarness, QUIET_OUTCOME_OVERRIDES, persistQuester({ quest }), initOutcomeCollections
provides:
  - "completePendingRequest(input: CompletePendingRequestInput!): [QuestResult!]! (innkeeper-only, audit automatico)"
  - CompletePendingRequestInput, ParticipantOverrideInput, ItemUsageInput, SpellUsageInput
  - validateOverrides / overrideParticipantOf / OverrideParticipant (modulo puro)
  - GmCompletionService.complete (story e worldMission, una transazione)
  - ResolutionLoader.laneFilter, snapshotInSession(…, lane), recoveryTimesOf, readQuest pubblico
  - enemyFactsOf in combatant-plan.ts
affects: [09-16, FE Phase 10]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Override del GM validati due volte: sui dati pre-letti (rifiuto senza side effect) e sugli snapshot in sessione (errore tipizzato = abort)"
    - "Il racconto del GM entra come ParticipantOutcome nella stessa porta di planParticipant: nessun calcolo nuovo di HP, ferite, consumi o magie"

key-files:
  created:
    - src/models/request/complete-pending-request.model.ts
    - src/quests/outcomes/gm-overrides.ts
    - src/quests/outcomes/gm-overrides.spec.ts
    - src/quests/outcomes/gm-completion.service.ts
    - src/quests/outcomes/gm-completion.service.int-spec.ts
    - src/quests/pending-requests/complete-pending-request.resolver.int-spec.ts
  modified:
    - src/quests/outcomes/quest-outcomes.module.ts
    - src/quests/outcomes/resolution-loader.service.ts
    - src/quests/outcomes/combatant-plan.ts
    - src/quests/pending-requests/pending-requests.resolver.ts
    - src/quests/pending-requests/pending-requests.module.ts
    - src/quests/pending-requests/pending-requests.resolver.int-spec.ts
    - test/app.int-spec.ts
    - src/schema.gql

key-decisions:
  - "Il racconto del GM è un ParticipantOutcome con outcome 'success': planParticipant resta l'unico calcolo di HP, ferite, consumi e magie"
  - "Gli override si rifiutano invece di clamparli: consumi e magie oltre il posseduto, hpAfter fuori da 1..maxLifePoints, voci duplicate, ferite fuori catalogo → OUTCOME_OVERRIDE_INVALID"
  - "Le magie usate secondo il GM ricevono il job di recupero anche senza nemico: i tempi di recupero si leggono con recoveryTimesOf"
  - "I registrati della worldMission si cercano dalle PendingQuest della quest verso le corsie; partecipante senza proprietario escluso con un WARN di soli id"
  - "Una sola transazione per l'intera richiesta (story o worldMission): un completamento concorrente perde con StaleResolution, che diventa NOT_FOUND"

patterns-established:
  - "Ogni harness che importa PendingRequestsModule passa push e code finte, PUSH_CONFIG e ...QUIET_OUTCOME_OVERRIDES"

requirements-completed: []

# Metrics
duration: 13min
completed: 2026-10-24
---

# Phase 9 Plan 15: Completamento del GM (completePendingRequest) Summary

**Mutation `completePendingRequest`, riservata all'innkeeper e registrata in automatico dall'audit. Chiude una story o tutta la worldMission con esito `gmCompleted`; premi e XP vengono dal catalogo. Gli override per personaggio (HP, ferite, consumi, magie) sono validati due volte: prima di ogni scrittura e sugli snapshot in sessione. Ogni personaggio riceve il proprio risultato, e lo schema cresce solo per aggiunta.**

## Performance

- **Duration:** ~13 min
- **Started:** 2026-10-24T17:11:00Z
- **Completed:** 2026-10-24T17:24:00Z
- **Tasks:** 3 (3/3)
- **Files modified:** 14 (6 creati, 8 modificati)

## Accomplishments

- **Input GraphQL** (`complete-pending-request.model.ts`): `CompletePendingRequestInput { pendingQuestId, outcomes? }`, `ParticipantOverrideInput { characterId, hpAfter?, injuries?, consumablesUsed?, spellsUsed? }`, `ItemUsageInput`, `SpellUsageInput`. Nessun campo che fissi XP, premi, livello, titolo o grade.
- **`validateOverrides` (puro):**
  - Senza override, ogni partecipante va a `null`: nessun combattimento, HP intatti, nessuna ferita.
  - Con un override nasce un `ParticipantOutcome` di successo:
    - `hpAfter`: intero in `1..maxLifePoints` dello snapshot (prima della ricompensa); se manca, restano gli HP attuali;
    - `injuries`: duplicati rimossi, fuori dal catalogo → rifiuto;
    - consumi e magie: sommati per id, entro il posseduto o gli usi rimasti.
  - Personaggio non partecipante o id malformato → `OUTCOME_NOT_PARTICIPANT`. Qualsiasi altra violazione → `OUTCOME_OVERRIDE_INVALID`.
  - `overrideParticipantOf` ricava i limiti dallo snapshot: `LootItem` sommati per id, usi delle magie attive, fallback alla tabella dei livelli per i personaggi legacy.
- **`GmCompletionService.complete`:**
  - **Lettura:** id malformato, PendingQuest inesistente, nessun personaggio attivo con quella PendingQuest in una corsia del GM, quest assente o di corsia standard → `NOT_FOUND` (`Missione in attesa non trovata`).
  - **Partecipanti:** la story ha il solo titolare. Per la worldMission partecipano tutti i personaggi attivi la cui corsia punta a una PendingQuest della stessa quest.
  - **Prima della transazione:** `validateOverrides`, poi lettura del catalogo (premi, nemico per l'XP) e dei tempi di recupero delle magie negli override.
  - **Una transazione:**
    - per ciascuno, snapshot in sessione sulla propria corsia (mancante ⇒ `StaleResolution`);
    - di nuovo `validateOverrides`;
    - per ciascuno, `planParticipant` con `gmCompleted` e `aid: null`, poi `writeParticipant` (monete via wallet, risultato in sessione) e `deletePendingQuest`;
    - infine `updateQuest(…, 'bestEffort')` con `questUpdateOf` (`concludedAt` per la worldMission, nulla per la story).
  - **Esito:** `StaleResolution` ⇒ `NOT_FOUND`. Dopo il commit `deliver` (push `questEnd` a ciascuno, job di recupero). Ritorna gli id dei risultati.
- **Mutation:** `@Roles(RoleType.innkeeper) @Mutation(() => [QuestResult]) completePendingRequest(input)` su `PendingRequestsResolver`; ogni risultato si rilegge con `QuestResultsService.findOne`. `PendingRequestsModule` importa `QuestOutcomesModule` e `QuestResultsReadModule`. L'interceptor registra `action: 'completePendingRequest'`, `target: { type: 'QuestResult', id: null }`, gli args con l'input e l'esito.

## Task Commits

| # | Task | Commit | Tipo |
|---|------|--------|------|
| 1 | override del GM (RED) | `3bdf21e` | test |
| 1 | validazione degli override (GREEN) | `a8e8a5e` | feat |
| 2 | completamento del GM (RED) | `8a6c2e7` | test |
| 2 | story e worldMission (GREEN) | `8828c7d` | feat |
| 3 | mutation, whitelist, SDL (RED) | `1275cd9` | test |
| 3 | mutation montata + schema (GREEN) | `39461c9` | feat |

**Plan metadata:** commit `docs(phase-9): complete plan 09-15 ...` (SUMMARY, VALIDATION, STATE, ROADMAP)

## RED evidence

- **Task 1:** `npx jest src/quests/outcomes/gm-overrides.spec.ts --selectProjects unit` → 28/28 falliti su `not implemented` (firme stub, input già dichiarato).
- **Task 2:** `npx jest src/quests/outcomes/gm-completion.service.int-spec.ts --selectProjects integration --runInBand` → 12/12 falliti su `not implemented` (stub registrato nel modulo, l'harness parte).
- **Task 3:**
  - `complete-pending-request.resolver.int-spec.ts` → 4/4 falliti. `PendingRequestsModule` non montava ancora `QuestOutcomesModule`: `Nest could not find CityModel` nel setup.
  - `test/app.int-spec.ts` → 3 falliti / 43: whitelist innkeeper, SDL del completamento, caso senza bearer. `src/schema.gql` non toccato.

## Verification

- `npx jest src/quests/outcomes --selectProjects unit` → 19 suite, 272/272 (gm-overrides 28).
- `npx jest src/quests/outcomes src/quests/pending-requests test/app.int-spec.ts --selectProjects integration --runInBand` → 12 suite, 126/126:
  - completamento 12;
  - wire 4;
  - suite 09-07 invariate con il nuovo harness;
  - real boot 43.
- `git diff --exit-code src/schema.gql` → 0 dopo il commit. Diff rispetto a `develop` senza righe rimosse; il blocco aggiunto è di 24 righe.
- `npm run build` → 0. Prettier ed ESLint puliti su tutti i file toccati.
- Grep di accettazione:
  - campi di premio, progressione o grade nell'input: 0;
  - in `gm-overrides.ts`: `outcomeOverrideInvalid()` 6, `outcomeNotParticipant()` 1;
  - nel servizio: `validateOverrides(` 2, `QuestOutcome.gmCompleted` 2 righe, `creditUserPoints|QuestOutcome.failure` vuoto;
  - schema: riga della mutation 1, `input ParticipantOverrideInput {` 1, `grade|kind|concludedAt|rescue` 0, `approve/rejectPendingRequest` 0, `CombatResolver|TravelKind` 0;
  - `@Roles(RoleType.innkeeper)` nel resolver: 3; whitelist con `'PendingRequestsResolver.completePendingRequest'`: 1.
- Nessun processo jest o redis residuo.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Correttezza] Recupero delle magie usate secondo il GM**
- **Found during:** Task 2
- **Issue:** `readCatalog` legge i tempi di recupero solo se la quest ha un nemico. Una story o worldMission senza nemico con `spellsUsed` nell'override avrebbe scalato gli usi senza mai accodare il job di recupero: magie consumate per sempre.
- **Fix:** `ResolutionLoader.recoveryTimesOf(spellIds)` legge i tempi delle sole magie degli override, e il servizio li unisce a quelli del catalogo. La conversione è stata estratta in `recoveryTimesFrom`, condivisa con `readCatalog`. Caso int-spec dedicato: `schedules a recovery for every spell use the game master reports`.
- **Files modified:** src/quests/outcomes/resolution-loader.service.ts, src/quests/outcomes/gm-completion.service.ts
- **Commit:** 8828c7d

### Scostamenti minori (nessuna decisione utente toccata)

**1. File fuori da `files_modified`: `resolution-loader.service.ts`, `combatant-plan.ts`** (commit 8828c7d)
- `snapshotInSession` accetta la corsia (default `standard`, i chiamanti di 09-12/09-13 sono invariati). `standardLaneFilter` delega al nuovo `laneFilter`.
- `readQuest` diventa pubblico: legge la quest con la proiezione della risoluzione e logga un WARN se manca.
- `enemyFactsOf` è estratto da `planCombatant` e riusato dal completamento, per non duplicarlo.

**2. Partecipanti della worldMission**
- La ricerca parte dalle PendingQuest della quest (`quest ∈ idForms(questId)`) e arriva ai personaggi attivi con quella corsia. Il piano descrive il percorso inverso; il risultato è lo stesso, ma la query non scorre tutti i personaggi con una corsia worldMission.

**3. Override più severi del minimo del piano**
- Rifiutati anche una ferita fuori dal catalogo e un `hpAfter` negativo (casi unit in più). Due voci della stessa pozione entro il posseduto vengono sommate.

**4. Audit `outcome: 'ok'`**
- Il piano scrive `'OK'`, ma la costante del modello è `AUDIT_OUTCOME_OK = 'ok'`. Il test importa la costante.

**5. Nessun priming del change stream nel wire test**
- Il wire test non apre subscription e non fa asserzioni sulla coda live, quindi il priming non serviva. Pre-crea le collection con `initOutcomeCollections` e `audits.init()`.

**6. Harness di `pending-requests.resolver.int-spec.ts` (09-07)**
- Aggiunti push e code finte, `PUSH_CONFIG` e `...QUIET_OUTCOME_OVERRIDES`, come prescrive il piano. Nessuna asserzione cambiata.

**7. Progress Table della ROADMAP**
- Applicato `15/16 | In Progress`, come prescrive l'orchestratore.

Nessuna regola 4 attivata.

## Issues Encountered

None.

## Known Stubs

- `PlaceholderCombatResolver` resta l'implementazione di default della porta (D-02). Il completamento del GM non la usa: il racconto del GM sostituisce il combattimento.

## Threat Flags

Nessuna superficie fuori dal threat model. T-09-72..T-09-77 mitigati e testati:
- **T-09-72:** `@Roles(innkeeper)` + whitelist enumerata (wire FORBIDDEN, real boot).
- **T-09-73:** l'input porta solo HP, ferite, consumi e magie, limitati al posseduto (gm-overrides.spec).
- **T-09-74:** validazione prima della transazione e in sessione (int-spec: estraneo e `hpAfter: 0` senza alcuna scrittura).
- **T-09-75:** audit con args ed esito, `ok` o codice (wire).
- **T-09-76:** completamenti concorrenti → uno solo riesce, l'altro riceve `NOT_FOUND` (int-spec).
- **T-09-77:** id malformato, inesistente o della corsia standard → `NOT_FOUND` (int-spec).

## Self-Check: PASSED

- FOUND: src/models/request/complete-pending-request.model.ts, src/quests/outcomes/gm-overrides.ts, gm-overrides.spec.ts, gm-completion.service.ts, gm-completion.service.int-spec.ts, src/quests/pending-requests/complete-pending-request.resolver.int-spec.ts
- FOUND: 3bdf21e, a8e8a5e, 8a6c2e7, 8828c7d, 1275cd9, 39461c9
