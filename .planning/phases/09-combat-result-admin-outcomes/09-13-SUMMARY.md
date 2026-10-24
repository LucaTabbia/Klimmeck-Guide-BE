---
phase: 09-combat-result-admin-outcomes
plan: 13
subsystem: quests
tags: [outcomes, boss, rescue, aid, death, timeout, transactions, tdd]

# Dependency graph
requires:
  - phase: 09-combat-result-admin-outcomes (09-03)
    provides: buildAidQuest, AID_TIMEOUT_MS, isAidTimeoutDue, aidTimeoutClaimFilter, aidTimeoutSuspended (C5)
  - phase: 09-combat-result-admin-outcomes (09-05)
    provides: planParticipant, planRescued, deathResultOf, questUpdateOf, questClaimFilter
  - phase: 09-combat-result-admin-outcomes (09-10)
    provides: AidTimeoutTrigger, aid-timeout job (consegnato da OutcomeWriter.deliver)
  - phase: 09-combat-result-admin-outcomes (09-11)
    provides: CharacterArchiver.archiveWithin ('archived' | 'unlinked' | 'not-linked')
  - phase: 09-combat-result-admin-outcomes (09-12)
    provides: OutcomeWriter, StaleResolution, resolveIndividual, createOutcomeHarness, QUIET_OUTCOME_OVERRIDES
provides:
  - QuestResolutionService.resolveStandard(trigger), unico ingresso dei trigger standard (individuale | gruppo | soccorso)
  - resolutionKindOf / ResolutionKind (modulo puro)
  - ResolutionLoader (loadStandardTrigger, readCatalog, ownersOf, snapshotInSession) + tipi StandardTrigger, StandardLoad, ResolutionCatalog, ResolutionOutcome
  - combatant-plan.ts (combatContextOf, battleOf, planCombatant), piano puro di un combattente condiviso dai tre rami
  - BossResolutionService.resolveGroup (D-05, D-21, Pitfall 8)
  - RescueResolutionService.resolveRescue (D-09, C1) e timeoutAid({ aidQuestId }) (D-10, C5)
  - questUpdateOf({ …, dropped }) ($pull dei registrati incoerenti insieme ai falliti)
  - persistQuester({ quest }) per registrare più personaggi sulla stessa quest
affects: [09-14, 09-15, 09-16, FE Phase 9]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Claim di gruppo = scrittura della Quest nella stessa transazione: questClaimFilter con $all + registeredAdventurers.$size, modalità 'claim' (0 match o WriteConflict ⇒ StaleResolution ⇒ 'stale')"
    - "Log del callback raccolti in note e scritti solo dopo il commit: una riesecuzione sui WriteConflict non li duplica"
    - "Morte unica (dieWithin): proprietario letto in sessione, archiveWithin(…, DeletionReason.death), risultato 'death' del suo utente solo se 'archived'"

key-files:
  created:
    - src/quests/outcomes/resolution-loader.service.ts
    - src/quests/outcomes/combatant-plan.ts
    - src/quests/outcomes/resolution-kind.ts
    - src/quests/outcomes/resolution-kind.spec.ts
    - src/quests/outcomes/boss-resolution.service.ts
    - src/quests/outcomes/boss-resolution.int-spec.ts
    - src/quests/outcomes/rescue-resolution.service.ts
    - src/quests/outcomes/aid-rescue.int-spec.ts
    - src/quests/outcomes/aid-timeout.int-spec.ts
  modified:
    - src/quests/outcomes/quest-resolution.service.ts
    - src/quests/outcomes/quest-outcomes.module.ts
    - src/quests/outcomes/quest-outcome-plan.ts
    - src/quests/outcomes/quest-outcome-plan.spec.ts
    - test/quests/outcome-world.ts

key-decisions:
  - "Il piano per partecipante (verdetto, premi solo ai vincitori, aid riferita alla quest originale) vive in un modulo puro condiviso (combatant-plan.ts); ogni servizio chiama this.combat.resolve( da sé, nessun servizio dipende da un altro per combattere"
  - "Il $pull dei registrati incoerenti è un'opzione di questUpdateOf (dropped), non un update costruito a mano nel servizio del boss"
  - "Un registrato senza proprietario è trattato come incoerente (rimosso con WARN), come uno senza PendingQuest coerente; il WARN si scrive dopo il commit, solo se la rimozione è avvenuta"
  - "rescuedCharacter sul risultato del soccorritore solo se il ferito è stato davvero liberato (ferito già archiviato ⇒ null)"
  - "Il WARN 'marker in nessuna città' si scrive solo quando un ferito viene liberato senza città, non a ogni lettura"
  - "timeoutAid con il proprietario già scollegato conclude la aid e ritorna 'resolved' senza risultato né push, con un LOG di no-op (C1)"

patterns-established:
  - "I trigger di 09-14 chiamano solo resolveStandard (corsia standard) e timeoutAid (aid-timeout)"
  - "Le tre int-spec di 09-13 usano createOutcomeHarness (quindi ...QUIET_OUTCOME_OVERRIDES)"

requirements-completed: []

# Metrics
duration: 17min
completed: 2026-10-24
---

# Phase 9 Plan 13: Boss di gruppo, catena di soccorso e timeout Summary

**`resolveStandard` diventa l'unico ingresso dei trigger e smista su tre rami. Il boss si risolve una volta sola per tutto il gruppo, in una transazione con il claim `$all` + `$size`. L'aid riuscita libera il ferito nella città del marker; quella fallita lo uccide con `archiveWithin` nella stessa transazione e passa al soccorritore una nuova aid clonata dall'originale. Dopo 7 giorni senza soccorritore registrato il ferito muore (C5).**

## Performance

- **Duration:** ~17 min
- **Started:** 2026-10-24T16:43:42Z
- **Completed:** 2026-10-24T17:00:00Z
- **Tasks:** 3 (3/3)
- **Files modified:** 14 (9 creati, 5 modificati)

## Accomplishments

- **Refactor (suite di 09-12 verdi):**
  - `ResolutionLoader` raccoglie le letture comuni: trigger, catalogo, `ownersOf` e `snapshotInSession`.
  - `combatant-plan.ts` contiene il piano puro di un combattente.
  - `QuestResolutionService` si appoggia su entrambi e mantiene `resolveIndividual` e il suo `fight()`.
- **`resolutionKindOf`:**
  - `boss` → `group`;
  - `aid` con `rescue.character` → `rescue`;
  - tutto il resto → `individual`, comprese le aid fatte a mano e un `rescue` messo su una quest che non è una aid.
- **`resolveStandard`:** carica il trigger una volta sola. Un trigger obsoleto o in anticipo diventa un no-op loggato; altrimenti `switch` su `resolutionKindOf`.
- **`BossResolutionService.resolveGroup`:**
  - **Pre-letture:**
    - registrati attivi con la corsia standard;
    - le loro PendingQuest di questo boss;
    - i proprietari.
    - Uno ancora in viaggio (`startDate` null) o nel countdown ⇒ `'waiting'`, senza scritture. Zero partecipanti ⇒ `'stale'`.
  - **Una transazione per il gruppo:**
    - snapshot in sessione di ciascuno;
    - un solo `combat.resolve` con tutti i partecipanti, esito per `characterId`;
    - per ciascuno `writeParticipant` e `deletePendingQuest`;
    - claim della Quest `{ ...questClaimFilter(questId, ids), registeredAdventurers: { $size: n } }` in modalità `'claim'`, con `$pull` dei falliti e degli incoerenti e `concludedAt` se almeno uno vince (A3);
    - una aid per ogni fallito.
  - **Dopo il commit:** WARN per gli incoerenti rimossi, poi `deliver`.
- **`RescueResolutionService.resolveRescue`:**
  - Il soccorritore passa per lo stesso percorso del ramo individuale. Il ferito viene riletto in sessione (attivo, `awaitingAid.aidQuest` = aid).
  - **Successo:** `planRescued` → `writeCharacterUpdate` + `writeResult` (`rescued`, `user` = utente del ferito). Il ferito torna al marker della città se esiste, altrimenti resta dov'è con un WARN. HP invariati.
  - **Fallimento:** `dieWithin` (proprietario in sessione, `archiveWithin(…, DeletionReason.death)`, risultato `death`). Il soccorritore va in `awaitingAid` con la nuova aid `buildAidQuest(original ?? aid, …)`.
  - **Ferito già scollegato:** LOG di no-op (C1).
- **`RescueResolutionService.timeoutAid({ aidQuestId })`:**
  - Aid assente, conclusa o senza `rescue` ⇒ `'stale'`.
  - `aidTimeoutSuspended` ⇒ `'waiting'` (C5). Ferito assente ⇒ `'stale'`. Meno di 7 giorni ⇒ `'waiting'`.
  - **Transazione:** claim con `aidTimeoutClaimFilter` (`findOneAndUpdate` → `concludedAt`), poi `dieWithin`.
  - Dopo il commit, `deliver` (push `questEnd` al defunto).

## Task Commits

| # | Task | Commit | Tipo |
|---|------|--------|------|
| 1 | gruppo boss (RED) | `7741017` | test |
| 1 | estrazione del loader (REFACTOR) | `fe4c2ed` | refactor |
| 1 | `$pull` dei registrati incoerenti (RED) | `642e29c` | test |
| 1 | boss di gruppo + dispatcher (GREEN) | `534a15c` | feat |
| 2 | catena di soccorso (RED) | `4b8f5ad` | test |
| 2 | liberazione o morte (GREEN) | `8fd72e8` | feat |
| 3 | timeout di soccorso (RED) | `212efb2` | test |
| 3 | morte dopo 7 giorni (GREEN) | `ad1a209` | feat |

**Plan metadata:** commit `docs(phase-9): complete plan 09-13 ...` (SUMMARY, VALIDATION, STATE, ROADMAP)

## RED evidence

- **Task 1:**
  - `npx jest src/quests/outcomes/resolution-kind.spec.ts --selectProjects unit` → 10/10 falliti su `not implemented` (firma stub).
  - `npx jest src/quests/outcomes/boss-resolution.int-spec.ts --selectProjects integration --runInBand` → 7/7 falliti su `not implemented` (`resolveStandard` stub).
  - `quest-outcome-plan.spec.ts` → 2 falliti / 17 (opzione `dropped` ignorata).
- **Task 2:** `aid-rescue.int-spec.ts` → 8 falliti / 9. I fallimenti sono comportamentali: il dispatcher mandava ancora le aid al ramo individuale (ferito non liberato, nessuna morte, `resolveRescue` mai chiamato, abort non simulabile). Il caso 5 (aid clonata dalla aid stessa, titolo non raddoppiato) era già vero anche nel ramo individuale.
- **Task 3:** `aid-timeout.int-spec.ts` → 7/7 falliti su `not implemented`.

## Verification

- `npx jest src/quests/outcomes --selectProjects unit` → 17 suite, 239/239.
- `npx jest src/quests/outcomes src/characters/deletion --selectProjects integration --runInBand` → 7 suite, 71/71:
  - resolution 15 e combat 9 (09-12, invariati);
  - boss 7 (i 6 casi del piano, con il caso 1 diviso in countdown e viaggio);
  - rescue 9 (gli 8 casi, con il caso 7 diviso in `rescued` e `death`);
  - timeout 7 (i 5 casi, con il caso 4 diviso in tre test);
  - suite di `src/characters/deletion`.
- La suite del boss rilanciata 3 volte: 7/7 ogni volta (caso concorrente stabile).
- `npm run build` → 0. `src/schema.gql` invariato.
- Prettier `--check` pulito su tutti i 14 file; ESLint pulito sui file toccati.
- Grep di accettazione:
  - `questClaimFilter(` nel servizio del boss: 1; `'claim'`: 1;
  - `resolutionKindOf(` nel servizio di risoluzione: 1;
  - `archiveWithin(` nel servizio del soccorso: 1; `DeletionReason.death`: 1;
  - `archiveCurrentCharacter` in `src/quests`: vuoto;
  - `sendToUser(`/`scheduleAidTimeout(` nei servizi del boss e del soccorso: vuoto;
  - `aidTimeoutClaimFilter(` e `aidTimeoutSuspended(`: 1 riga ciascuno;
  - test nominato C5: 1;
  - il letterale NOW di Mongo nei file nuovi: 0.
- Nessun processo jest residuo.

## Deviations from Plan

### Auto-fixed Issues

Nessuna correzione di bug.

### Scostamenti minori (Rule 2/3, nessuna decisione utente toccata)

**1. `combatant-plan.ts` (file nuovo, fuori da `files_modified`)**
- Il piano per partecipante di 09-12 (`planIndividual`) serviva identico al boss e al soccorso. È stato spostato in un modulo puro condiviso nel commit di refactor, per non scriverlo tre volte (Clean Code / nessuna duplicazione). Ogni servizio conserva la propria chiamata `this.combat.resolve(` su una riga.

**2. `snapshotInSession` nel `ResolutionLoader`**
- Oltre ai tre metodi elencati nel piano, il loader espone la rilettura in sessione con il filtro della corsia, usata dai tre rami. Prima era un metodo privato di `QuestResolutionService`.

**3. `questUpdateOf({ dropped })` (file `quest-outcome-plan.ts` fuori da `files_modified`)**
- Il piano chiede un "`$pull` esteso agli incoerenti". È stato reso un'opzione del modulo puro, con due casi unit scritti prima: niente update costruito a mano nel servizio. Il commit RED dedicato è `642e29c`.

**4. `persistQuester({ quest })` in `test/quests/outcome-world.ts`**
- Il gruppo boss richiede più registrati sulla stessa quest; l'helper ora accetta una quest già persistita. Modifica toccata nel commit RED del Task 1.

**5. Rami di soccorso di dettaglio**
- Il WARN "marker in nessuna città" si scrive dopo il commit e solo quando il ferito viene liberato senza città (il piano lo collocava alla lettura). `rescuedCharacter` è valorizzato solo se il ferito viene davvero liberato.

**6. Progress Table della ROADMAP**
- Applicato `13/16 | In Progress`, come prescrive l'orchestratore.

Nessuna regola 4 attivata. C5 e A3 sono implementati come default tecnici già sanzionati: C5 è isolato in `aidTimeoutSuspended`/`aidTimeoutClaimFilter` con il test nominato; A3 vive in `questUpdateOf`.

## Issues Encountered

- Il trasporto push finto registra i token (`tok-<userId>`), non lo userId: le asserzioni dei destinatari nelle int-spec confrontano i token. Corretto prima del commit RED.
- Il termine `kind` compare nel nome di file e nel tipo `resolution-kind.ts` / `ResolutionKind` / `resolutionKindOf`, imposti dal piano. Nessun campo o letterale `kind` nel codice nuovo.

## Known Stubs

- Nessun trigger chiama ancora `resolveStandard`/`timeoutAid`, e `QuestOutcomesModule` non è montato in `AppModule`. Processor, sweeper e montaggio arrivano in 09-14, come da piano.
- `PlaceholderCombatResolver` resta l'implementazione di default della porta (D-02, regole di combattimento dell'utente).

## Threat Flags

Nessuna superficie fuori dal threat model. T-09-61..T-09-66 mitigati e testati:
- **T-09-61:** boss risolto una volta sola (boss casi 2 e 4, con trigger concorrenti).
- **T-09-62:** registrato incoerente rimosso con WARN (boss caso 5).
- **T-09-63:** archivio nella stessa sessione dell'esito (rescue caso 3, timeout caso 1). Su abort nessun archivio, risultato, aid o push (rescue caso 8, spy su `archiveWithin`).
- **T-09-64:** ferito scollegato ⇒ no-op loggato (rescue caso 4, timeout caso 5).
- **T-09-65:** timeout sospeso con un soccorritore registrato (test nominato C5).
- **T-09-66:** HP invariati alla liberazione (rescue caso 1).

## Self-Check: PASSED

- FOUND: resolution-loader.service.ts, combatant-plan.ts, resolution-kind.ts, resolution-kind.spec.ts, boss-resolution.service.ts, boss-resolution.int-spec.ts, rescue-resolution.service.ts, aid-rescue.int-spec.ts, aid-timeout.int-spec.ts
- FOUND: 7741017, fe4c2ed, 642e29c, 534a15c, 4b8f5ad, 8fd72e8, 212efb2, ad1a209
