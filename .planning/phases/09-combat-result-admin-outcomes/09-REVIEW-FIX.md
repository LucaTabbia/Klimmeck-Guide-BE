---
phase: 09-combat-result-admin-outcomes
fixed_at: 2026-10-24T18:05:07Z
review_path: .planning/phases/09-combat-result-admin-outcomes/09-REVIEW.md
iteration: 1
findings_in_scope: 12
fixed: 9
skipped: 0
not_needed: 3
skipped_subpoints: 1
status: partial
---

# Phase 9: Code Review Fix Report

**Fixed at:** 2026-10-24T18:05:07Z
**Source review:** `.planning/phases/09-combat-result-admin-outcomes/09-REVIEW.md`
**Iteration:** 1
**Fix scope:** `all` (WR-01..03 e IN-01..09, su indicazione dell'orchestratore).

**Summary:**
- Findings in scope: 12 (3 warning, 9 info)
- Fixed: 9 (WR-01, WR-02, WR-03, IN-01, IN-02, IN-03, IN-05, IN-07, IN-08)
- Not needed: 3 (IN-04, IN-06, IN-09), motivazione per ciascuno qui sotto
- Skipped: 0 finding interi; un sotto-punto saltato (**IN-08 (a)**, target dell'audit), per cui `status: partial`
- Sotto-punti `not_needed` dentro finding fixed: IN-07 (b) (`removeOnFail`)

Ogni fix comportamentale è passato per TDD: commit `test(outcomes)` con lo spec rosso (RED verificato), poi commit `fix(outcomes)` che lo porta a verde. I refactor (IN-01, IN-02, IN-05) sono coperti dalle suite esistenti, rimaste verdi. Conventional Commits, nessun trailer. `src/schema.gql` invariato.

## Tabella dei rilievi

| ID | Esito | Commit | Test |
|----|-------|--------|------|
| WR-01 | fixed | `b2646d1` (test) → `fc3df24` (fix) | unit `combat-context.spec.ts`: `reads the life points of a legacy character from the level table, like the outcome plan` (+ aggiornato `fills missing numbers with safe defaults`) |
| WR-02 | fixed | `7ad6d0c` (test) → `9e84e10` (fix) | unit `quest-resolution.sweeper.spec.ts`: 3 casi (attesa dello sweep in corso, shutdown pulito se lo sweep fallisce, nessuna nuova risoluzione dopo lo stop) |
| WR-03 | fixed | `c258feb` (test) → `ff4edd2` (fix) | int `complete-pending-request.resolver.int-spec.ts`: `answers with the committed results when reading them back fails after the commit` |
| IN-01 | fixed (refactor) | `dacd26d` | suite esistenti (unit `src/quests` 26/468 verdi) |
| IN-02 | fixed (refactor) | `3dfbbe1` | le due int-spec dell'individuale passano ora da `resolveStandard` (24/24) |
| IN-03 | fixed | `3dfabfb` (test) → `5672108` (fix) | unit `outcome-writer.spec.ts`: `hands out fresh arrays so one outcome never leaks into the next` |
| IN-04 | not_needed | — | D-29 |
| IN-05 | fixed (refactor) | `eccb89b` | `queue-call-timeout.spec.ts` spostato con il modulo; unit `src/queues src/travel scheduling` 103/103 |
| IN-06 | not_needed | — | (a) pattern preesistente → Phase 10; (b) D-22 |
| IN-07 | fixed (a) / not_needed (b) | `88b9532` (test) → `7d0b930` (fix) | int `aid-timeout.int-spec.ts`: `logs a suspended timeout at debug level only, since the sweep retries it every tick` |
| IN-08 | fixed (b) / skipped (a) | `d461479` (test) → `f184803` (fix); handoff `aa8dbbb` | unit `gm-overrides.spec.ts`: `caps every override list` (5 casi) |
| IN-09 | not_needed | — | push e countdown mutuamente esclusivi (vedi sotto) |

Commit di documentazione: `3d6211c` — `docs(phase-9): note deferred review items`; `aa8dbbb` — `docs(phase-9): note the GM override list cap in the handoff`.

## Fixed Issues

### WR-01: i default del contesto di combattimento divergono da `statusFactsOf`

**Files modified:** `src/quests/outcomes/progression/status-facts.ts` (nuovo), `src/quests/outcomes/combat/combat-context.ts`, `src/quests/outcomes/outcome-plan.ts`, `src/quests/outcomes/rescue-plan.ts`, `src/quests/outcomes/gm-overrides.ts`, `src/quests/outcomes/combat/combat-context.spec.ts`
**Commits:** `b2646d1` — `test(outcomes): WR-01 prove a legacy combatant reads life points from the level table`; `fc3df24` — `fix(outcomes): WR-01 build combatants from the outcome plan status facts`
**Decisione e fix applicato:**
- `StatusFacts`/`statusFactsOf` estratti in `progression/status-facts.ts` (dipende solo da `level-table.ts`, nessun ciclo con `outcome-plan.ts`); `outcome-plan.ts`, `rescue-plan.ts` e `gm-overrides.ts` li importano da lì.
- `participantOf` legge `level`, `currentLifePoints` e `maxLifePoints` da `statusFactsOf(snapshot)`: un legacy senza HP entra in combattimento con il massimo della riga del livello (prima `max = 0` → `hpAfter = 1` a ogni scontro). `CombatCharacterSnapshot.status` dichiara ora `xp?` (già presente nella proiezione `OUTCOME_CHARACTER_PROJECTION`, `status: 1`).
- Test: personaggio con sola `xp: 900` → livello 3, HP 1600/1600; con `currentLifePoints: 400` → 400/1600; entrambi uguali a `statusFactsOf` dello stesso snapshot. Il caso "fills missing numbers" ora si aspetta L1 1000/1000 invece di 0/1/0. RED verificato (`level 0, current 1, max 0`).

### WR-02: `QuestResolutionSweeper.onModuleDestroy` non attende lo sweep in corso

**Files modified:** `src/quests/outcomes/quest-resolution.sweeper.ts`, `src/quests/outcomes/quest-resolution.sweeper.spec.ts`
**Commits:** `7ad6d0c` — `test(outcomes): WR-02 prove the sweeper shutdown waits for the sweep in flight`; `9e84e10` — `fix(outcomes): WR-02 await the sweep in flight when the sweeper stops`
**Decisione e fix applicato:**
- `onModuleDestroy` è `async`: alza un flag `stopping`, spegne il timer e fa `await this.inFlight?.catch(() => undefined)`. Single-flight, `unref()` e reconciler al boot invariati.
- Flag `stopping` controllato nei due cicli (`resolveDueQuests`, `timeOutDueAids`) e prima della query delle aid: dopo lo stop non parte nessuna nuova transazione, quella in corso finisce.
- Test (fake timer, promesse differite): lo shutdown non si risolve finché lo sweep pendente non finisce; uno sweep che rigetta non fa fallire lo shutdown; con due quest dovute e lo stop durante la prima, la seconda e le aid non partono. RED verificato (3/3 rossi).
- Deviazione registrata: nella stesura rossa il primo caso asseriva `find` chiamato dopo lo shutdown; con il flag `stopping` (opzione suggerita dal reviewer) le aid non si interrogano più, quindi l'asserzione è diventata "lo sweep era concluso quando lo shutdown si è risolto" (stesso invariante). Rosso anche sul codice originale.
- Annotato in `deferred-items.md` come **ipotesi non provata** per il flaky del boot reale (09-14).

### WR-03: `completePendingRequest` rilegge i risultati dopo il commit

**Files modified:** `src/quests/outcomes/gm-completion.service.ts`, `src/quests/results/quest-results.service.ts`, `src/quests/results/quest-result.populate.ts`, `src/quests/pending-requests/pending-requests.resolver.ts`, `src/quests/outcomes/gm-completion.service.int-spec.ts`, `src/quests/pending-requests/complete-pending-request.resolver.int-spec.ts`
**Commits:** `c258feb` — `test(outcomes): WR-03 prove a failed read-back never errors a committed completion`; `ff4edd2` — `fix(outcomes): WR-03 answer a GM completion from the committed drafts`
**Decisione e fix applicato:**
- `GmCompletionService.complete` restituisce le bozze `QuestResultDraft[]` scritte nell'ultima esecuzione del callback della transazione (raccolte in `GmCommit { outcome, drafts }`, azzerate a ogni retry come il resto dello stato di uscita), non più i soli id.
- `QuestResultsService.readCommitted(drafts)`: una sola query `find({ _id: { $in } })` popolata, ordinata come le bozze. Se la rilettura fallisce: un WARN con i soli id e il nome dell'errore (`describeError`) e la risposta si costruisce dalle bozze con `unpopulatedResultOf` (ref non risolvibili sul filo resi vuoti/nulli: `consumablesUsed: []`, `rewards.items: []`, `spellsUsed[].spell: null`, `spellLearned: null`, `enemy: null`; il documento a DB resta completo e `questResult(id)` lo rilegge per intero). Un risultato mancante dalla rilettura usa la stessa bozza. Mai un errore GraphQL dopo il commit.
- Il resolver è ora `complete` → `readCommitted`; `findOne` resta per `questResult(id)` e per il publisher.
- Int-spec (wire): spy che lancia su `findById`/`findOne`/`find` del modello `QuestResult` durante la mutation → nessun `errors`, il risultato con l'id del documento a DB, `outcome`/`hpAfter`/`titleAfter`/`quest.type` corretti, PendingQuest eliminata, corsia story svuotata, audit `ok`. RED verificato (`INTERNAL_SERVER_ERROR: transient read failure`). `gm-completion.service.int-spec.ts` adattato al nuovo tipo di ritorno (`drafts[i]._id`).

### IN-01: duplicazioni fra i piani e i moduli di supporto

**Files modified:** `src/quests/outcomes/progression/level-table.ts`, `src/quests/outcomes/outcome-plan.ts`, `src/quests/outcomes/gm-overrides.ts`, `src/quests/outcomes/injuries/injury-rules.ts`, `src/quests/outcomes/outcome-numbers.ts` (nuovo), `src/quests/acceptance/quest-lanes.ts`, `src/quests/pending-requests/pending-requests.builder.ts`, `src/quests/outcomes/gm-completion.service.ts`, `src/quests/outcomes/boss-resolution.service.ts`, `src/quests/outcomes/resolution-loader.service.ts`
**Commit:** `dacd26d` — `refactor(outcomes): IN-01 keep one copy of the shared outcome helpers`
**Fix applicato:** `lifePointsWithin` esportato da `level-table.ts` e usato in `outcome-plan.ts` (via `hpWithin`); `isInjuryType` esportato da `injury-rules.ts` e usato da piano e override (via le due copie di `KNOWN_INJURIES`); `isPositiveInteger` in `outcome-numbers.ts`; `GmLane`/`GM_LANES`/`isGmLane` in `quest-lanes.ts` (builder e GM completion); `LaneCharacter<L extends QuestLane>` esportato da `resolution-loader.service.ts` (boss: `LaneCharacter<QuestLane.standard>`, GM: `LaneCharacter<GmLane>`).

### IN-02: `resolveIndividual` senza chiamanti in produzione

**Files modified:** `src/quests/outcomes/quest-resolution.service.ts`, `src/quests/outcomes/quest-resolution.service.int-spec.ts`, `src/quests/outcomes/quest-combat.int-spec.ts`
**Commit:** `3dfbbe1` — `refactor(outcomes): IN-02 drop the unused resolveIndividual entry point`
**Decisione:** verificato con grep: gli unici chiamanti erano le due int-spec; processor e sweeper passano da `resolveStandard`, che smista su `resolveLoadedIndividual` per `resolutionKindOf(...) === 'individual'`. Metodo rimosso, le spec usano `resolveStandard` (le loro quest sono tutte individuali: 24/24 verdi, stesso comportamento).

### IN-03: `EMPTY_COMMITTED` condivide array mutabili

**Files modified:** `src/quests/outcomes/outcome-writer.service.ts`, `src/quests/outcomes/rescue-resolution.service.ts`, `src/quests/outcomes/boss-resolution.service.ts`, `src/quests/outcomes/gm-completion.service.ts`, `src/quests/outcomes/outcome-writer.spec.ts`
**Commits:** `3dfabfb` — `test(outcomes): IN-03 prove an empty committed outcome never shares arrays`; `5672108` — `fix(outcomes): IN-03 build each empty committed outcome from a factory`
**Fix applicato:** la costante diventa la factory `emptyCommitted()`; usata anche da boss e GM completion al posto dei due letterali vuoti (Boy Scout). Test: si mutano i tre array di un'istanza, la successiva è vuota. RED verificato (`emptyCommitted is not a function`).

### IN-05: utility generiche delle code sotto `travel/`

**Files modified:** `src/queues/queue-call-timeout.ts` (+ spec, spostati da `src/travel/`), `src/queues/epoch-ms.ts` (nuovo), `src/travel/travel-job.ts`, `src/queues/enqueue-trigger.ts`, `src/quests/outcomes/outcome-writer.service.ts`, `src/quests/outcomes/quest-outcomes.module.ts`, `src/quests/outcomes/scheduling/*` (job, scheduler, module), `src/travel/travel-scheduler.service.ts`, `src/travel/travel-planning.module.ts`, tre int-spec che importavano il token
**Commit:** `eccb89b` — `refactor(queues): IN-05 move the generic queue helpers out of travel`
**Decisione:** refactor piccolo (11 import), quindi fatto senza re-export dal vecchio percorso: `git mv` di `queue-call-timeout.ts` e della sua spec in `src/queues/`, `isEpochMs` in `src/queues/epoch-ms.ts` (importato da `travel-job.ts` e `quest-resolution-job.ts`). Nessun modulo di `quests/` o `queues/` importa più utilità generiche da `travel/`.

### IN-07: rumore operativo da timeout sospesi (a) e job falliti (b)

**Files modified:** `src/quests/outcomes/rescue-resolution.service.ts`, `src/quests/outcomes/aid-timeout.int-spec.ts`
**Commits:** `88b9532` — `test(outcomes): IN-07 prove a suspended rescue timeout logs at debug`; `7d0b930` — `fix(outcomes): IN-07 log a suspended rescue timeout at debug level`
**Fix applicato (a):** il messaggio `Soccorso <id>: un soccorritore è registrato, timeout sospeso` passa da `log` a `debug`. Test: due timeout su una aid sospesa → 0 righe `log`, 2 righe `debug`. RED verificato.
**(b) not_needed:** `removeOnFail: false` è il criterio della Phase 8 (08-REVIEW IN-03, già rinviato all'hardening della coda); annotato in `deferred-items.md` per la Phase 10.

### IN-08: audit senza target (a) e override senza tetto (b)

**Files modified:** `src/quests/outcomes/gm-overrides.ts`, `src/quests/outcomes/gm-overrides.spec.ts`, `.planning/phases/09-combat-result-admin-outcomes/BACKEND-NOTES.md`
**Commits:** `d461479` — `test(outcomes): IN-08 prove the GM override lists are capped`; `f184803` — `fix(outcomes): IN-08 cap each GM override list at 50 entries`; `aa8dbbb` — `docs(phase-9): note the GM override list cap in the handoff`
**Fix applicato (b):** `MAX_OVERRIDE_ENTRIES = 50`; `validateOverrides` rifiuta con `OUTCOME_OVERRIDE_INVALID` per primo (prima della ricerca dei partecipanti) se `outcomes` o `injuries`/`consumablesUsed`/`spellsUsed` di un override superano il tetto. `validateOverrides` gira in `complete` prima della transazione, quindi nessuna scrittura. Controllo applicativo (nessun `@ArrayMaxSize`): SDL invariato. Test: liste a 50 accettate; 51 ferite, 51 consumi, 51 magie, 51 override su estranei (prima `OUTCOME_NOT_PARTICIPANT`) → `OUTCOME_OVERRIDE_INVALID`. RED verificato (4/4 rossi). Handoff aggiornato (vedi sotto).
**(a) skipped:** il target dell'audit resta `{ type: 'QuestResult', id: null }`, come documentato nel handoff (`BACKEND-NOTES.md` §9); la PendingQuest resta cercabile in `args.input.pendingQuestId`. Mettere il `pendingQuestId` in `target.id` sotto `type: 'QuestResult'` darebbe all'id il tipo sbagliato, e cambiare `type` cambia il contratto dell'audit di Phase 3 (D-17). Un `@AuditTarget` letto dall'interceptor è un'estensione da decidere con l'utente: annotato in `deferred-items.md`.

## Not needed

### IN-04: nessuna migrazione HP 100 → 1000

**D-29 (default tecnico): nessuna migrazione e nessun seed.** L'utente adatta a mano i dati (HP iniziali/attuali a 1000, ecc.) con i comandi `mongosh` del handoff (§12), già previsti. Nessuna modifica.

### IN-06: change stream non riaperti (a) e coda del GM stantia (b)

- **(a)** Pattern preesistente di tutti i publisher (Phase 3/6): su `error` si logga e basta. Correggerlo solo qui creerebbe due comportamenti diversi; va fatto per tutti insieme nella Phase 10 (hardening). Annotato in `deferred-items.md`.
- **(b)** **D-22:** la coda è alimentata dal change stream delle `pendingquests` (insert/delete) e ricalcolata per intero; i cambi di `activeTravel`/`awaitingAid` arrivano con il populate all'emissione successiva o dalla `characters` dell'innkeeper, che il FE incrocia (`characterUpdated`). Scelta dell'utente, già documentata.

### IN-09: il countdown ritarda la push `travelEnd`

Verificato in `src/travel/travel-completion.service.ts`: `outcome.countdown` si valorizza solo per `activeTravel.kind === TravelKind.quest` (dentro la transazione), mentre `notifyOwner` (push `travelEnd`) parte solo per `kind === TravelKind.free`. I due rami sono mutuamente esclusivi: nessun viaggio attende l'accodamento prima della propria push. Nessun ritardo possibile, nessuna modifica.

## Documentazione

- `deferred-items.md` (`3d6211c`): ipotesi WR-02 sul flaky del boot reale, IN-06 (a), IN-07 (b), IN-08 (a).
- `BACKEND-NOTES.md` (`aa8dbbb`): **un fatto reso falso da un fix**. La riga `OUTCOME_OVERRIDE_INVALID` della tabella dei codici (§2) elencava tutte le cause ("validare lato FE con gli stessi limiti"); ora include anche "più di 50 voci in `outcomes` o in `injuries`/`consumablesUsed`/`spellsUsed` di un override (controllato per primo, prima di `OUTCOME_NOT_PARTICIPANT`)". Nessun'altra sezione toccata.

## Verifica

Per ogni fix: rilettura del file, `npx prettier --write` + `npx eslint` sui soli file toccati (0 errori), `tsc --noEmit -p tsconfig.build.json` pulito, suite interessate rieseguite (percorsi prima di `--selectProjects`, integration `--runInBand`).

**Gate finale dopo tutti i fix:**

| Check | Esito |
|-------|-------|
| `npm run test:unit` | **121 suite / 1775 test** passati (prima: 1765; +10: WR-01 ×1, WR-02 ×3, IN-03 ×1, IN-08 ×5) |
| `npm run test:int` | **72 suite / 915 test** passati (prima: 913; +2: WR-03 ×1, IN-07 ×1), nessun timeout |
| `npm run build` | exit 0 |
| `npx eslint "{src,apps,libs,test}/**/*.ts" --quiet` filtrato da `prettier/prettier` e `prefer-const` | 0 problemi (restano solo le intestazioni dei file con errori Prettier preesistenti) |
| `npx jest test/app.int-spec.ts --selectProjects integration --runInBand` | 43/43 |
| `git diff --exit-code src/schema.gql` | exit 0 (SDL invariato) |
| `pgrep -fl 'jest\|redis-server'` | vuoto |

**Note operative:**
- Commit con `git add` + `git commit -m` (non `gsd-tools commit`), come in Phase 8: nessun cambio di branch, nessun trailer (verificato con `git log --format=%B`).
- Letterali vietati: nessun `kind`/`grade`/`TravelKind` nuovo sul filo; nessun `Math.random`; nessun nuovo scrittore di saldi, `level` o `maxLifePoints`.

---

_Fixed: 2026-10-24T18:05:07Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
