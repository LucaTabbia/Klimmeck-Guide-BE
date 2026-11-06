---
phase: 15
slug: imboscate-in-viaggio
audited: 2026-11-06T21:25:00Z
status: secured
asvs_level: 1
block_on: high
branch: feat/15-imboscate-in-viaggio
head: 3b37dfd
base: origin/develop (b492a46)
threats_total: 42
threats_mitigated: 40
threats_accepted: 2
threats_transferred: 0
threats_open: 0
threats_open_blocking: 0
threats_deferred: 0
open_ids: []
deferred_ids: []
transferred_ids: []
updated: 2026-11-06T21:25:00Z
---

# Audit di sicurezza — Phase 15 «Imboscate in viaggio» (BE)

Audit in sola lettura dei blocchi threat model dei piani `15-01`…`15-12` (42 ID `T-15-01`…`T-15-42`, tutti distinti) sul codice FINALE di `feat/15-imboscate-in-viaggio` a `3b37dfd`, cioè dopo i fix di `REVIEW-FIX.md` (7 fixed, 2 `not_needed`). Nessun file modificato oltre a questo, nessun commit, nessuna suite lanciata, nessuna lettura di `.env` o dell'ambiente, nessun comando sul database, nessun `npm run build`. Le spec citate sono verificate per nome e posizione; l'esito verde è quello registrato in `REVIEW-FIX.md` (gate finale: unit 110 suite / 1401 test, int-spec dei moduli toccati e `test/app.int-spec.ts` 76/76) e in `15-VERIFICATION.md`.

Disposizioni: `mitigated` 40, `accepted` 2 (T-15-05, T-15-33), `transferred` 0, `deferred` 0, `open` 0. Nessuna mitigazione dichiarata nei piani sta nella UAT FE 16-08 (verifica comportamenti di gioco, non mitigazioni): nessuna `deferred`.

## Registro delle minacce

| ID | STRIDE | Componente | Disposizione | Evidenza | Nota |
| --- | --- | --- | --- | --- | --- |
| T-15-01 | I | `parseAmbushConfig` | mitigated | `src/config/ambush-config.spec.ts:25` «rejects an unknown time zone without echoing the value (D-04)»; `:37` «rejects a fixed offset time zone (D-04)» | Messaggio fisso; `process.env.` solo in `src/config/` (controllo A) |
| T-15-02 | D | boot | mitigated | `src/config/env.validation.ts:1` (`parseAmbushConfig`/`readAmbushEnv` in `validateEnv`) | Fuso non valido = boot rifiutato, vuota = default |
| T-15-03 | T | `xpBandOf`, `hazardAt` | mitigated | `src/travel/ambush/level-bands.spec.ts`, `ambush-rules.spec.ts`; `Math.random`/`Date.now` = 0 (controllo B) | Costanti pinnate, nessun caso nel modulo |
| T-15-04 | T | `drawAmbush` | mitigated | `src/travel/ambush/ambush-draw.ts` + `ambush-draw.spec.ts` | Ciclo limitato, nessun `at ≥ endTime`, solo `ChanceSource` |
| T-15-05 | D | `pointAtFraction`, `nearestPoi` | accepted | piano 15-02: scansioni lineari su ≤ 642 POI, nessun input del client | Costo trascurabile |
| T-15-06 | I | `ActiveTravel` sul filo | mitigated | diff SDL: nessun campo aggiunto a `ActiveTravel` (controllo C); spec `Object.keys` in `ambush-lifecycle.int-spec.ts` | Campi interni senza `@Field` |
| T-15-07 | I | `travelPreview`, `questTravelPreview` | mitigated | `src/travel/travel.service.int-spec.ts:680`; `src/quests/acceptance/quest-acceptance.service.int-spec.ts:2687` («never draws on the … preview (D-15)») | Nessun tiro in anteprima |
| T-15-08 | T | dati del job | mitigated | `src/travel/ambush/ambush-job.ts:37-58` (`ambushJobDataOf`: id esadecimale, epoch interi, `startTime > at` rifiutato); `ambush-job.spec.ts` | |
| T-15-09 | T | retry della transazione di partenza | mitigated | `src/travel/travel.service.ts:93` (sorteggio fuori da `connection.transaction`); spec in `travel.service.int-spec.ts` | Nessun tiro in più nel retry |
| T-15-10 | T | pool dell'imboscata | mitigated | `src/travel/ambush/ambush-enemies.spec.ts:56` «never fights a legendary enemy (D-07)» | Fail-closed su `legendary` |
| T-15-11 | T | generazione delle quest | mitigated | `src/quests/generation/enemy-pool.spec.ts:108` «still excludes the animals … by default (D-22)» | Default `excluded` |
| T-15-12 | I | WARN delle voci orfane | mitigated | controllo F (log con soli id) | |
| T-15-13 | D | `nearestByTime` | mitigated | `src/roads/roads.service.int-spec.ts` (16/16 in `REVIEW-FIX.md`) | Un solo `singleSource`, null su grafo assente |
| T-15-14 | T | scelta della città | mitigated | `compareIds` in `src/roads/road-route.ts` (+ spec `road-route.spec.ts`), usata da `nearestByTime` e `ambush-point.ts`; `localeCompare` assente in `src/travel/ambush` e `src/roads` fuori spec | Parità deterministica per id |
| T-15-15 | T | doppio effetto (job + sweep) | mitigated | `src/travel/ambush/ambush.updates.ts:15-16` (`startTime`, `ambush.at` `$eq` + `$lte: now`); `ambush-resolution.service.ts:411-422` (transazione, `StaleResolution`); spec `ambush-resolution.int-spec.ts:334` | |
| T-15-16 | T | effetti del motore | mitigated | `src/travel/ambush/ambush-plan.ts` + `ambush-plan.spec.ts` (14/14) | HP clampati ≥ 1, consumi al posseduto |
| T-15-17 | T | saldo | mitigated | `ambush-resolution.service.ts:466` (`wallet.applyCharacterCoinsDelta` in sessione) | Guardia `status.xp` nel filtro |
| T-15-18 | T | caso consumato nei retry | mitigated | composizione/risorteggio prima della transazione (`ambush-resolution.service.ts:385` lettura, `:411` transazione); `ambush-resolution.int-spec.ts` | |
| T-15-19 | I | log della risoluzione | mitigated | controllo F: `ambush-resolution.service.ts:229,324,402,491,533,559` solo jobId, id, motivo fisso, nome città | |
| T-15-20 | S/I | push `ambushDefeat` | mitigated | `src/push/push-events.ts:68-75` (id = personaggio, corpo con il solo nome città); destinatario da `ownersOf` (`ambush-resolution.service.ts:226`); invio in `:526` | Data-only come gli altri |
| T-15-21 | T | posto del party | mitigated | `ambush-resolution.service.ts:512` (`unstartedSeatReleaseOf`, `startedAt: null`) nella stessa sessione | |
| T-15-22 | T | deviazione | mitigated | `ambush-resolution.int-spec.ts:572` «keeps the food eaten and charges nothing on the detour (D-11)»; `:633` «never draws an ambush on the detour (D-03)» | HP ≥ 1 |
| T-15-23 | D | rotta mancante | mitigated | `ambush-resolution.service.ts:324` (ripiego verso la meta) + `ambush-detour.ts`/spec | Il viaggio non resta senza meta |
| T-15-24 | T | SDL `ambushDefeat` | mitigated | controllo C: `ambushDefeat` solo riga aggiunta | |
| T-15-25 | T | `AmbushProcessor` | mitigated | `src/travel/ambush/ambush.processor.ts:29,35` (job malformato ignorato, anticipato rinviato allo sweep); `ambush.processor.spec.ts`, `ambush.processor.int-spec.ts` | |
| T-15-26 | D | viaggio bloccato | mitigated | `src/travel/ambush/ambush-sweeper.ts:122-164` (fail-open al terzo errore, `recordFailureSafely` dopo A-WR-01); `ambush-sweeper.int-spec.ts` (5/5) | |
| T-15-27 | D | scansione dello sweep | mitigated | indice `character_active_travel_ambush`: `src/models/character/character.model.ts:83`, `src/models/sweep-indexes.schema.spec.ts:41` | |
| T-15-28 | I | log dello sweep | mitigated | controllo F: `ambush-sweeper.ts:108,122,141,149,164` jobId, contatori, `describeError` | |
| T-15-29 | I | consegna dei report | mitigated | `EXPECTED_OWNER_ONLY_HANDLERS` (`test/app.int-spec.ts:155,1181`), nessuna query nuova per i report | `user` fissato all'istante |
| T-15-30 | R | completamento | mitigated | `src/travel/travel.updates.ts:90,166` (`'status.activeTravel.ambush': null` in `completionFilter` e in `dueTravelsFilter` dopo B-IN-03); `travel-completion.int-spec.ts:1013` | Inserimento report nella transazione d'arrivo (`travel-completion.service.ts:143`) |
| T-15-31 | T | doppio inserimento | mitigated | `src/travel/ambush/ambush-results.ts:63` (`_id: report.resultId`), `create(..., { ordered: true })` a `travel-completion.service.ts:143` e `travel.service.ts:206` | Chiave duplicata |
| T-15-32 | T | SDL (contratto) | mitigated | controllo C: una sola riga tolta (`  quest: QuestResultQuest!`) | `ActiveTravel` invariato |
| T-15-33 | D | `quest` nullable per FE vecchia | accepted | piano 15-09 (Pitfall 8), dichiarato nel handoff | La FE vecchia scarta i report elemento per elemento |
| T-15-34 | I | subscription dei report | mitigated | `ambush-lifecycle.int-spec.ts:431` «delivers the reports to the owner only and acknowledges them (D-13)» | |
| T-15-35 | T | concorrenza | mitigated | `ambush-lifecycle.int-spec.ts:514` «resolves one ambush once under two concurrent triggers (D-05)» | |
| T-15-36 | I | `ActiveTravel` sul filo | mitigated | `ambush-lifecycle.int-spec.ts` (`Object.keys` identico) e controllo C | |
| T-15-37 | T | `src/schema.gql` | mitigated | controllo C: 17 righe aggiunte, 1 tolta | |
| T-15-38 | I | repo e documenti | mitigated | controlli A, D | `.env.example` con la sola `AMBUSH_TIMEZONE=` (vuota, non segreta) |
| T-15-39 | R | commit | mitigated | controllo E = 0 | |
| T-15-40 | D | coverage e harness | mitigated | `REVIEW-FIX.md` gate; nessun diff alle soglie dichiarato in `15-VERIFICATION.md` | `test:cov` dell'orchestratore in corso al momento dell'audit |
| T-15-41 | I | handoff e UAT | mitigated | `BACKEND-NOTES.md` con soli segnaposto (controllo G) | |
| T-15-42 | T | storico delle decisioni | mitigated | emendamenti in coda; SDL del handoff coerente con `src/schema.gql` | |

## Controlli trasversali

| # | Comando | Esito |
| --- | --- | --- |
| A | `grep -rn "process\.env\." src \| grep -v spec` | vuoto: nessun accesso diretto fuori dai provider di config (le letture passano da `readAmbushEnv` in `src/config/`) |
| B | `grep -rn "Math\.random\|Date\.now" src/travel/ambush \| grep -v "spec.ts:"`; `grep -rn "Math\.random" src/travel` fuori spec | 0 / 0 |
| C | `git diff origin/develop -- src/schema.gql \| grep -E '^[-+][^-+]'` | una sola riga tolta, `-  quest: QuestResultQuest!`; 17 righe aggiunte: `AmbushCity` (3), `AmbushReport` (4), `ambushDefeat`, `ambush: AmbushReport`, `kind: QuestResultKind!`, `quest: QuestResultQuest`, enum `QuestResultKind` (3) |
| D | `git diff origin/develop --name-only -- .env.example`; `... \| grep -iE 'migrat\|seed'` | `.env.example`: aggiunte solo commento e `AMBUSH_TIMEZONE=` (nessun valore); nessun file di migrazione o seed |
| E | `git log origin/develop..HEAD --format=%B \| grep -ciE "co-authored-by\|generated with\|claude-session"` | 0 |
| F | `grep -rn "logger\.\(log\|warn\|error\)" src/travel src/quests/acceptance \| grep -v spec.ts:` e lettura dei messaggi in `src/travel/ambush` e `quest-acceptance.service.ts:382,392` | solo jobId, id, conteggi, tentativi, nomi di città, motivi fissi e `describeError`; nessun URI né documento intero |
| G | `grep -rn "TRAVEL_STARVING"` e la query `questTravelPreview` | `questTravelPreview` è gestita da `QuestAcceptanceResolver.questTravelPreview` ed elencata fra gli handler owner-only (`test/app.int-spec.ts:147,158`); i controlli sul codice `travelStarving` sono di Phase 14 (`14-SECURITY.md`), non toccati qui |
| H | scritture: filtri d'identità e transazione | `ambushFilter` (`ambush.updates.ts:15-16`) riaffermato dentro `connection.transaction` (`ambush-resolution.service.ts:411`); `dueTravelsFilter`/`completionFilter` con `ambush: null`; trasferimenti di monete solo via `WalletService` nella stessa sessione |
| I | push `ambushDefeat` | solo id del personaggio e nome della città (`push-events.ts:68-75`) |

## Open

Nessuna.

## Deferred

Nessuna.
