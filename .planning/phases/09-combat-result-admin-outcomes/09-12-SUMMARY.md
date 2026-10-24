---
phase: 09-combat-result-admin-outcomes
plan: 12
subsystem: quests
tags: [outcomes, combat, transactions, push, bull, idempotency, tdd]

# Dependency graph
requires:
  - phase: 09-combat-result-admin-outcomes (09-03)
    provides: drawRewards, rewardRefsOf, NO_REWARDS, buildAidQuest
  - phase: 09-combat-result-admin-outcomes (09-04)
    provides: CombatResolver, buildCombatContext, combatCatalogRefsOf, PlaceholderCombatResolver, ChanceSource
  - phase: 09-combat-result-admin-outcomes (09-05)
    provides: planParticipant, OUTCOME_CHARACTER_PROJECTION, questUpdateOf
  - phase: 09-combat-result-admin-outcomes (09-06)
    provides: modello QuestResult e change stream che pubblica i risultati inseriti (qui nessun publish a mano)
  - phase: 09-combat-result-admin-outcomes (09-10)
    provides: QuestResolutionScheduler.scheduleAidTimeout, QuestResolutionSchedulingModule, QUEST_CONFIG
  - phase: 09-combat-result-admin-outcomes (09-11)
    provides: CharacterArchiveModule (importato per 09-13)
provides:
  - OutcomeWriter (writeParticipant, writeCharacterUpdate, writeResult, deletePendingQuest, updateQuest claim|bestEffort, createAid, deliver) + StaleResolution + CommittedOutcome + EMPTY_COMMITTED
  - QuestResolutionService.resolveIndividual(trigger) → 'resolved' | 'stale' | 'waiting'; loadStandardTrigger / readCatalog protetti per 09-13
  - QuestOutcomesModule (nessun change stream, non montato in AppModule: 09-14)
  - questEnd(resultId) (D-20)
  - costanti SPELL_RECOVERY_QUEUE / RECOVER_SPELL_JOB
  - test/quests/outcome-world.ts: QUIET_OUTCOME_OVERRIDES, outcomeModels, persistQuester, createOutcomeHarness, registerDevice
affects: [09-13, 09-14, 09-15, 09-16, FE Phase 9]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Sentinella StaleResolution lanciata dentro connection.transaction: abort senza scritture, il trigger diventa un no-op 'stale' (nessuna etichetta TransientTransactionError, nessun retry)"
    - "Stato dell'esito in un oggetto contenitore azzerato all'inizio del callback; OutcomeWriter.deliver chiamato una volta, solo dopo il commit e solo da chi ha committato"
    - "Consegna best-effort per voce: una push o un add fallito logga un WARN con soli id e non blocca le consegne successive"

key-files:
  created:
    - src/characters/spells/spell-recovery-queue.ts
    - src/quests/outcomes/outcome-writer.service.ts
    - src/quests/outcomes/outcome-writer.spec.ts
    - src/quests/outcomes/quest-outcomes.module.ts
    - src/quests/outcomes/quest-resolution.service.ts
    - src/quests/outcomes/quest-resolution.service.int-spec.ts
    - src/quests/outcomes/quest-combat.int-spec.ts
    - test/quests/outcome-world.ts
  modified:
    - src/push/push-events.ts
    - src/push/push-events.spec.ts

key-decisions:
  - "L'esito del combattimento si prende per characterId dall'output del resolver (non [0]): il risultato resta legato al partecipante giusto quando 09-13 riusa lo stesso percorso per i gruppi"
  - "Una magia premio senza minXpToLearn numerico non si insegna mai (nessuna soglia 0 implicita)"
  - "I cataloghi del combattimento (equipaggiamento, magie, loot, tempi di recupero) si leggono solo se la quest ha un nemico non orfano"
  - "createOutcomeHarness e registerDevice vivono in test/quests/outcome-world.ts e sono condivisi dalle due int-spec (nessun harness duplicato)"

patterns-established:
  - "Ogni harness che monta QuestOutcomesModule passa ...QUIET_OUTCOME_OVERRIDES (createOutcomeHarness lo fa già)"
  - "Push e job di un esito solo da OutcomeWriter.deliver (grep di sendToUser/scheduleAidTimeout nel servizio = 0)"

requirements-completed: []

# Metrics
duration: 11min
completed: 2026-10-24
---

# Phase 9 Plan 12: Risoluzione standard individuale Summary

**OutcomeWriter con scritture in sessione, sentinella StaleResolution e consegna dopo il commit, più `resolveIndividual`. Una quest senza nemico (o con nemico orfano, C6) riesce in automatico. Una quest con nemico passa dalla porta CombatResolver: la vittoria conclude la quest, la sconfitta imposta awaitingAid e clona una aid. La push questEnd ora porta l'id del risultato.**

## Performance

- **Duration:** ~11 min
- **Started:** 2026-10-24T16:29:40Z
- **Completed:** 2026-10-24T16:40:30Z
- **Tasks:** 3 (3/3)
- **Files modified:** 10 (8 creati, 2 modificati)

## Accomplishments

- `questEnd(resultId)`: l'id è quello del risultato (D-20); il commento registra l'emendamento al handoff Phase 5 §2.
- `OutcomeWriter`:
  - `writeParticipant`: `findOneAndUpdate` condizionale; se non trova nulla lancia `StaleResolution`. Le monete passano solo da `WalletService.applyCharacterCoinsDelta(…, session)`, nessun `$inc`. Il `QuestResult` si inserisce nella stessa session.
  - `deletePendingQuest`: `deletedCount === 0` lancia `StaleResolution`.
  - `updateQuest`: in modalità `claim` 0 match lancia `StaleResolution`; in `bestEffort` logga un WARN con l'id e prosegue.
  - `createAid` scrive la aid clonata.
  - `deliver` lavora in ordine: push `questEnd` per ogni risultato, `aid-timeout` per ogni aid, poi un job `recover` per ogni uso di magia nel formato di `useSpell`, con `withinTimeout`.
- `QuestOutcomesModule`:
  - importa 10 modelli, Economy, Push, CharacterArchive, QuestResolutionScheduling e la coda `spell-recovery`;
  - fornisce Clock, timeout e le porte `CombatResolver` → Placeholder e `ChanceSource` → Math;
  - non ha change stream e non è montato in `AppModule`.
- `resolveIndividual`:
  - **Prima della transazione**, letture lean: PendingQuest (assente, `startDate` null o diversa → `'stale'`; scadenza futura → `'waiting'`), personaggio attivo in corsia, quest, proprietario e catalogo.
  - **Nella transazione**: rilettura del personaggio in sessione, combattimento dalla porta, piano del partecipante, poi le scritture in serie (personaggio + wallet + risultato, eliminazione della PendingQuest, `questUpdateOf` sulla quest, creazione della aid se sconfitta).
  - **Dopo il commit**: `deliver`.

## Task Commits

| # | Task | Commit | Tipo |
|---|------|--------|------|
| 1 | consegna dell'outcome writer (RED) | `eafb6c3` | test |
| 1 | outcome writer e modulo (GREEN) | `066cecb` | feat |
| 2 | risoluzione individuale senza nemico (RED) | `dcb1d28` | test |
| 2 | risoluzione individuale senza nemico (GREEN) | `c998a90` | feat |
| 3 | combattimento individuale (RED) | `9929849` | test |
| 3 | combattimento dalla porta (GREEN) | `a136947` | feat |

**Plan metadata:** commit `docs(phase-9): complete plan 09-12 ...` (SUMMARY, VALIDATION, STATE, ROADMAP)

## RED evidence

- **Task 1:** `npx jest src/push/push-events.spec.ts src/quests/outcomes/outcome-writer.spec.ts --selectProjects unit` → 14 falliti / 28. Tutti i 14 casi del writer fallivano su `not implemented` (firme stub); push-events restava verde (cambia il titolo, l'asserzione è la stessa).
- **Task 2:** `npx jest src/quests/outcomes/quest-resolution.service.int-spec.ts --selectProjects integration --runInBand` → 15/15 falliti su `not implemented`. L'harness con `QuestOutcomesModule` partiva già.
- **Task 3:** `npx jest src/quests/outcomes/quest-combat.int-spec.ts --selectProjects integration --runInBand` → 9/9 falliti sul comportamento: HP rimasti a 1000 invece di 700/300/1, `scripted.contexts` vuoto, nessuna aid, magie e consumi non scalati.

## Verification

- `npx jest src/push src/quests/outcomes --selectProjects unit` → 26 suite, 372/372 (outcome-writer 14).
- `npx jest src/quests/outcomes --selectProjects integration --runInBand` → 2 suite, 24/24. resolution ha 15 casi: i 12 comportamenti del piano, con i casi 4 e 10 divisi in due test ciascuno e il caso 8 alle 11:59. combat ha 9 casi: gli 8 del piano, con il caso 4 diviso.
- `npm run build` → 0. `src/schema.gql` invariato.
- Prettier ed ESLint puliti sui 10 file.
- Grep di accettazione:
  - `questEnd = (resultId: string)`: 1;
  - `applyCharacterCoinsDelta(` nel writer: 1; `$inc`: 0;
  - moduli vietati negli import del modulo degli esiti: 0;
  - `QuestOutcomesModule` in `app.module.ts`: vuoto;
  - `QUIET_OUTCOME_OVERRIDES` e `sweepIntervalMs: 0`: 1 ciascuno;
  - nel servizio: `characterModel.findById` vuoto, il letterale NOW di Mongo vuoto, `sendToUser(`/`scheduleAidTimeout(` vuoti;
  - nel servizio: `planParticipant(` 1, `this.combat.resolve(` 1, `buildAidQuest(` 1;
  - formule di combattimento nel servizio: vuoto;
  - letterali `kind`/`grade`/`TravelKind` nei file nuovi: 0.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Grep di accettazione] `this.combat.resolve(` spezzato da Prettier**
- **Found during:** Task 3 (GREEN)
- **Issue:** la chiamata stava dentro un ternario inline, e Prettier la spezzava in `this.combat` / `.resolve(`.
- **Fix:** estratto un metodo privato `fight(input)` con early return se non c'è nemico; ora la chiamata sta su una riga. Stesso comportamento, test verdi.
- **Files modified:** src/quests/outcomes/quest-resolution.service.ts
- **Commit:** a136947

### Scostamenti minori

**1. Harness condiviso in `test/quests/outcome-world.ts` (Task 2)**
- Il piano descrive lo stesso harness per le due int-spec. Per non duplicarlo ho aggiunto all'helper del Task 1 `createOutcomeHarness` (push e code finte, `PUSH_CONFIG`, `...QUIET_OUTCOME_OVERRIDES`, porte, `init()` delle collection, `pushdevices` compresa) e `registerDevice`. L'helper è tra i `files_modified` del piano; è stato toccato nel commit RED del Task 2.

**2. `persistQuester` fonde `status`, `quests` e `assets` con il fixture**
- `createPlayer` sostituisce l'intero sotto-documento, quindi l'helper fonde con `buildCharacter()` e forza la corsia sulla PendingQuest creata. Ritorna anche `characterId` e la quest riletta dopo la registrazione.

**3. Casi in più nello spec unit del writer**
- Oltre a `deliver`, lo spec copre le scritture in sessione con modelli finti: `StaleResolution` con personaggio, PendingQuest o claim mancanti; `bestEffort` con WARN; update null senza scritture; monete a 0 senza wallet.

**4. Progress Table della ROADMAP**
- Applicato `12/16 | In Progress`, come prescrive l'orchestratore.

Nessuna regola 4 attivata.

## Issues Encountered

None.

## Known Stubs

- Nessun trigger chiama ancora `QuestResolutionService`, e `QuestOutcomesModule` non è montato in `AppModule`. Lo prevede il piano: `resolveStandard` (boss di gruppo, catena di soccorso) arriva in 09-13; processor, sweeper e montaggio in 09-14.
- `PlaceholderCombatResolver` (da 09-04) resta l'implementazione di default della porta finché non arrivano le regole di combattimento dell'utente (D-02).

## Threat Flags

Nessuna superficie fuori dal threat model.
- T-09-54..T-09-60 mitigati e testati:
  - trigger concorrenti o duplicati → un risultato e una push (casi 6, 7);
  - trigger in anticipo, obsoleto o con countdown mai partito → nessuna scrittura (casi 8, 9);
  - consegna solo dopo il commit, mai su abort (casi 11, 12 con gli spy);
  - destinatario = `result.user` (caso 1);
  - nemico orfano → WARN con soli id (caso 2);
  - Redis giù → `'resolved'` con WARN (combat caso 7);
  - HP 0 → 1 (combat caso 3).

## Self-Check: PASSED

- FOUND: src/characters/spells/spell-recovery-queue.ts, src/quests/outcomes/outcome-writer.service.ts, outcome-writer.spec.ts, quest-outcomes.module.ts, quest-resolution.service.ts, quest-resolution.service.int-spec.ts, quest-combat.int-spec.ts, test/quests/outcome-world.ts
- FOUND: eafb6c3, 066cecb, dcb1d28, c998a90, 9929849, a136947
