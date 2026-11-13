---
phase: 21-premi-per-rango-e-soccorsi
verified: 2026-11-13T18:10:26Z
status: passed
score: 20/20 must-have verificati
overrides_applied: 0
human_verification_deferred:
  - test: "UAT su device (handoff BACKEND-NOTES.md §6, passi 1-6), insieme ai piani 20-03 e 20-04 della FE Phase 20, dopo il riavvio reale del BE dal ramo"
    expected: "Foglio del boss misto col blocco del proprio titolo per ogni viewer e blocco del minTitle senza personaggio; vittoria con il blocco di ciascuno negli esiti; aid di dungeon persa al 4° turno con metà premio sul foglio e contatori 8/4/4/fight per il soccorritore; job con nemici persa a vita 1 senza aid; cancellazione di un ferito che libera il soccorritore iscritto col push questCancelled; report dei premi per titolo nel log del boot"
    why_deferred: "Device, database reale e app della FE Phase 20 sono fuori dal verificatore; la pianifica l'orchestratore con l'utente subito dopo questa verifica. Nessuna osservazione è registrata qui."
---

# Phase 21: Premi per rango e soccorsi — Report di verifica

**Goal della fase (ROADMAP §Phase 21):** in una quest di gruppo ogni partecipante vince il premio del proprio titolo: un blocco per ogni titolo dei posti (monete, xp, loot, pet, cura e magia; pet sorteggiato una volta per blocco), la magia solo ai titoli ≥ mage; le solitarie restano col premio unico sul `minTitle`. Il generatore crea boss misti col titolo inferiore. Il flusso delle aid si allinea alla regola dell'utente: aid solo dalle quest elencate, aid della dungeon che percorre i turni fino a quello della sconfitta con premio proporzionale, archiviatore che libera i soccorritori.

**Verificato:** 2026-11-13T18:10:26Z
**Ramo / HEAD:** `feat/21-premi-per-rango-e-soccorsi` @ `3a28976b` (93 commit dalla base `fb59b545`; base dello SDL `1f9db973`)
**Status:** passed
**Re-verifica:** no, verifica iniziale

## Metodo e limiti

- Verifica goal-backward **per lettura del codice** della HEAD, non dei SUMMARY. Sola lettura: nessun file di codice toccato.
- **Nessun test eseguito da questo verificatore** (vincolo dell'orchestratore: `npm run test:cov` gira in background sullo stesso albero). I numeri dei test sono quelli del **gate dopo i fix registrato in `21-REVIEW-FIX.md`** (HEAD del gate `9f820dfb`): `tsc --noEmit` 0 / 0; unit 281 suite / 3 745 test; integration 144 suite / 2 106 test (boot reale `test/app.int-spec.ts` compreso); coverage `./src/quests/acceptance/` 99,08 / 92,87 / 99,74 (soglie 97 / 91 / 98) e `./src/quests/generation/` 98,9 / 88,73 / 99,68 (soglie 96 / 82 / 97). L'esito di `npm run test:cov` completo non è noto a questo report.
- Dopo il gate il ramo ha solo commit di documentazione: `git diff --stat 9f820dfb..HEAD` tocca solo `.planning/` (7 file). Il gate descrive quindi il codice della HEAD. La HEAD indicata dall'orchestratore era `1fb15127`; durante la verifica è arrivato `3a28976b` (una riga di `BACKEND-NOTES.md`, risposta dell'utente sul testo del push): nessun codice.
- Eseguito qui: `git diff 1f9db973..HEAD -- src/schema.gql` → 19 righe aggiunte, **0 rimosse** (`grep -cE '^-[^-]'` = 0), nessun hunk dentro `type QuestPrizes`; `package.json`, `package-lock.json`, `.env.example`, `src/config` senza diff dalla base; nessun trailer nei 93 commit (conteggio 0).
- Non letti `.env` né dati reali; BE non avviato.

## Raggiungimento del goal

### Verità osservabili

Le prime cinque sono i Success Criteria della ROADMAP (contratto); le altre vengono dai `must_haves` dei piani 01..14 e dalle decisioni D-18..D-30, nella forma dei ruling della review dove questi le hanno superate (vedi «Note»).

| # | Verità | Stato | Evidenza (file:riga) |
|---|--------|-------|----------------------|
| 1 | SC1 — Boss misto vinto: ognuno riceve il blocco del proprio titolo col suo tiro del pet; una solitaria dà il premio del `minTitle` a chiunque; nessun rookie impara una magia da nessun percorso | VERIFICATA | Blocco per titolo letto in sessione: `src/quests/outcomes/combatant-plan.ts:174-181`, chiamato dal boss (`boss-resolution.service.ts:161`), dal soccorso (`rescue-resolution.service.ts:430`) e dal percorso individuale (`conclusion/conclusion-plan.ts:45`, :99); completamento dell'oste `gm-completion.service.ts:317-321`. Tiro del pet dal blocco del vincitore: `rewards/quest-rewards.ts:238-247`. Solitaria: `prizes/rank-prizes.ts:57-70` (un tipo non di gruppo non legge blocchi → blocco unico sul `minTitle`). Magia: `quest-rewards.ts:303` e :318 (`isSpellCaster` primo cancello), unico punto che scrive una magia imparata `outcome-plan.ts:445-460` (`learnedSpellState` ha un solo chiamante di produzione). |
| 2 | SC2 — Il generatore produce boss misti solo col titolo inferiore e scrive i blocchi con le tabelle; una worldMission a mano usa i suoi blocchi; un posto a titolo null in una quest di gruppo è rifiutato e riportato | VERIFICATA | `generation/generation-rules.ts:115-129` (`MIXED_BOSS_SHARE = 0.5`, `lowerRankOf` solo il rango precedente, `mixedSeatsOf` da 1 a metà dei posti); `quest-generator.service.ts:310-330` (`mixedOf`: solo boss, `prizesOf` del rango inferiore solo se misto); `generated-quest-draft.ts:127-133` e :190-216 (blocco del rango + blocco inferiore, `minTitle` = inferiore, posti `[rango, inferiore]`). worldMission: stessa `prizeBlockFor` in `gm-completion.service.ts:318`. Rifiuto: `acceptance/quest-eligibility.ts:47-51`, :104-122; `quest-acceptance.service.ts:444-451` (`QUEST_NOT_ACCEPTABLE`). Report: `maintenance/group-prize.report.ts:79-90`, `group-prize-report.service.ts:28-58`, `quest-maintenance.boot.ts:21-23`. |
| 3 | SC3 — Hunt persa → aid, job persa → nessuna aid; boss perso → aid coi blocchi e i posti del boss; crime coll'arresto senza aid | VERIFICATA | `outcomes/aid/aid-opening.ts:4-14` (cinque tipi); `combatant-plan.ts:138-154` (sconfitta di un tipo che non apre soccorso → `planDefeatWithoutAid`, `aid: null`); `boss-resolution.service.ts:214` → `aid/aid-quest.ts:161-198` (posti da `aidSlotsOf`, blocchi da `clonedPrizesOf` :100-113, cura null :143). Arresto della crime: `conclusion/conclusion-plan.ts` (diff della fase solo sul ramo della sconfitta), prova `crime-guard-conclusion.int-spec.ts:136`. |
| 4 | SC4 — Dungeon da 4 gruppi (8 turni) persa al 5° turno (esplorazione): turno salvato, il soccorritore percorre 5 turni e salva il ferito con 5/8 dei premi già scritti sul foglio; persa al 4° (scontro) → metà; soccorso perso prima → regola dell'aid persa; heal, job, study, magic, crime, guard perse → vita 1 senza aid | VERIFICATA | Turni: `dungeon/dungeon-turns.ts:27-42` (E F E F…, 2 per gruppo). Turno salvato: `quest-battle.ts:76-82` → `quest-resolution.service.ts:146-153` → `aid-quest.ts:192-196` (`rescue.turn`), modello `models/quest/quest-rescue.model.ts:6-23`, :42-43. Percorso dalla stessa porta fino al turno salvato: `quest-battle.ts:54-75` (`lastTurnIndex: saved.index`), `placeholder-dungeon-resolver.ts:130-141`. Quota: `aid/rescue-share.ts:21-24` (`(index + 1) / total`), scritta alla nascita `aid-quest.ts:117-128` e `rescue-share.ts:64-84` (per difetto, oggetto a 0 → null). Aid persa: `rescue-resolution.service.ts:477-499` (feriti morti, nuova aid dall'originale col turno della caduta). Vita 1: `defeat-without-aid.ts:6-13`, `guard/guard-outcome.ts:24-28`, `unrewarded-plan.ts:47-125`. |
| 5 | SC5 — L'archiviatore che chiude un'aid con soccorritori iscritti libera corsie e PendingQuest; SDL al boot di test; handoff per la FE Phase 20 | VERIFICATA (esito dei test dal gate registrato; riavvio reale differito alla UAT) | `characters/deletion/character-archiver.ts:233-297` (aid non avviate che il passo conclude → `releaseRegisteredWithin`), :306-314; `quests/party/registered-release.ts:27-114`; push dopo il commit `character-deletion.service.ts:49-88`. SDL: `test/app.int-spec.ts:705`, :713 e diff additivo rieseguito qui. Handoff: `BACKEND-NOTES.md` §0-§7, confrontato col codice (nomi dei campi, log, matrice dei turni coincidono). |
| 6 | Una sola funzione di scelta del blocco per foglio e risoluzione, col ripiego D-18 (titolo esatto → il più alto non superiore → il più basso; senza titolo il `minTitle`) | VERIFICATA | `prizes/rank-prizes.ts:92-105`. `grep` di `prizeBlockFor(` in `src` (spec escluse): solo `combatant-plan.ts:176`, `gm-completion.service.ts:318`, `prizes/quest-prizes.resolver.ts:37`. `drawRewards(` ha solo le due porte (`combatant-plan.ts:175`, `gm-completion.service.ts:317`). |
| 7 | Premio unico per solitarie e boss legacy senza blocchi; nessun migratore (D-01, D-28) | VERIFICATA | `rank-prizes.ts:63-70` (senza blocchi validi → `soloBlockOf` sul `minTitle`, campo per campo); `GROUP_PRIZE_TYPES` :7-11. Nessun file di migrazione, seeder o contenuto fra i 105 file del diff `fb59b545..HEAD -- src test`. |
| 8 | Tutto il blocco per titolo: monete, xp, loot, pet, cura dal blocco (nessuna seconda scelta), magia dal blocco | VERIFICATA | `quest-rewards.ts:266-293` (`cure: prizes.cure` copiata dal blocco tirato, :291); `outcome-plan.ts:407` (`cureOf(rewards.cure)`, non più dalla quest); catalogo dei premi sull'unione dei blocchi `resolution-loader.service.ts:569` con `rewardRefsOf` (`quest-rewards.ts:160-176`). |
| 9 | Pet sorteggiato una volta per blocco nel generatore, tiri nuovi solo per i boss e in coda | VERIFICATA | `quest-generator.service.ts:310-330` (cancello → proporzione → `prizesOf` del rango inferiore, dopo `generatedQuestDraftOf`); `generation/generated-prizes.ts:119-131` (un `petPrizeOf` per chiamata di `prizesOf`); blocchi generati senza cura né magia `generated-quest-draft.ts:110-123`. |
| 10 | Magia col titolo **dopo** l'esito; study vinta da un non caster → ramo della lore dello studio (D-25) | VERIFICATA | `outcome-plan.ts:421-424` (`titleAfter`), :445-455 (passato a `drawLearnableSpell` e `canLearnSpell`), :487-493 (`!spellLearned` → `drawStudyLore`). I tiri restano consumati in `drawRewards` (`quest-rewards.ts:224-235`). |
| 11 | Boss misto: `minTitle` più basso, copertura del generatore sul titolo più alto dei posti (D-23) | VERIFICATA | `generated-quest-draft.ts:199` (`minTitle: mix.lower`); `generation-rules.ts:139-160` (`coverageRankOf`), usata in `quest-generator.service.ts:433-434`; select allargata :376-378. |
| 12 | Posto a titolo null: fail-closed anche per avvio e timeout del party; l'aid tiene il posto jolly della solitaria | VERIFICATA | `quest-eligibility.ts:115-122` (`hasUntitledGroupSeat` solo boss e worldMission); `party/quest-start.service.ts:173-174`; `party/party-timeout.service.ts:57-63`, :102-107, :143-147 (scioglimento alla scadenza con WARN di solo id, ruling B-WR-03). |
| 13 | Clone dei soli blocchi validi sull'aid: tipo di gruppo, titolo valido, primo per titolo; mai da una solitaria (ruling B-WR-02) | VERIFICATA | `aid-quest.ts:88-97` (`readBlocksOf` via `rankBlocksOf` + primo per titolo), :110-112 (nessuna chiave `rankPrizes` senza blocchi validi), :131-145. |
| 14 | Contratto della porta imposto in un punto; turno da salvare derivato in un solo modo (`savedTurnOf`, ruling C-WR-02); battaglia scelta da `questBattleOf` per ogni percorso (ruling C-WR-01) | VERIFICATA | `dungeon-turns.ts:60-86` (`checkedDungeonResolution`, `DungeonContractViolation`), :123-134 (`savedTurnOf`, sanificato da `rescueTurnOf` :48-58); `quest-battle.ts:45-83`, usata da `quest-resolution.service.ts:191` e `rescue-resolution.service.ts:412`; `rescueTurnFromStages`, `nextRescueTurnOf`, `archiveWithin(` → 0 occorrenze in `src`. La porta è cablata via DI: `quest-outcomes.module.ts:95`. |
| 15 | Contatori dei turni sugli esiti (D-21): dungeon vinta T/T/T/fight; persa al turno i → T/i/i+1/tipo; soccorritore fino al turno salvato; ferito morto sul turno salvato; `rescued` e ogni altro esito null | VERIFICATA | `dungeon-turns.ts:89-105`, :113-120; `combatant-plan.ts:115-128`; `outcome-plan.ts:164-189`, :567-569; `rescue-plan.ts:118-126` (`rescued` → `NO_TURN_COUNTERS`), :133-142 (`death` → `fallenCountersOf`); `rescue-resolution.service.ts:601`; `unrewarded-plan.ts:120-122`. Modello: `models/quest-result/quest-result.model.ts` (quattro campi nullable, `@Field` + `@Prop`). |
| 16 | Soglie di loot e pet scalate dalla quota alla risoluzione, con gli stessi tiri; xp e conoscenze dei soli gruppi affrontati | VERIFICATA | `combatant-plan.ts:179` (`rescueShareOf(rescueTurnOf(quest.rescue?.turn))`); `quest-rewards.ts:201` (`rollLoot(…, share)`), :246 (`QUEST_PET_WIN_CHANCE * share`); `quest-battle.ts:102-112` (`facedCatalogOf`), `dungeon-turns.ts:108-110`. |
| 17 | Catena delle aid: quota ricalcolata dall'originale; sorgente già scalata → rapporto delle quote (D-26, I3) | VERIFICATA | `aid-quest.ts:117-128`; `rescue-resolution.service.ts:489-494` (`context.original ?? context.loaded.quest`, `nextTurn`); `rescue-share.ts:68` (quota ≥ 1 → premi intatti). |
| 18 | Archiviatore e timeout con la stessa routine; push `questCancelled` dopo il commit, best-effort; un soccorritore già partito non viene toccato | VERIFICATA | `registered-release.ts:86-114` usata da `character-archiver.ts:287` e `party-timeout.service.ts:160`; `registered-release.ts:117-136` (try/catch, WARN con solo id); `character-deletion.service.ts:72` (fuori dal callback della transazione); `registered-release.ts:54-69` (`startDate: null` nel filtro, WARN di soli id); `character-archiver.ts:306-314` (aid avviata esclusa). |
| 19 | Filo additivo: `Quest.prizes` resta `QuestPrizes!` ed è risolto per viewer (HTTP e WS per sottoscrittore, memo per viewer nella chiave dell'evento, parent mai mutato); `Quest.rankPrizes`; `type QuestPrizes` identico | VERIFICATA | `prizes/quest-prizes.resolver.ts:29-47` (registrato in `quests.module.ts:63`); `no-effect/viewer-vitals.service.ts:55-67` (chiave `viewerCacheKeyOf` = `rootValue` dell'evento, poi mappa per `ruolo:userId`), :97 (titolo); `models/quest/quest-prizes.model.ts:58-60` e `quest-rank-prize.model.ts` (solo `@Prop`, nessun `@Field`); diff SDL: +`enum DungeonTurnKind`, +`Quest.rankPrizes`, +`type QuestRankPrizes`, +4 campi su `QuestResult`, 0 righe rimosse. |
| 20 | Nessun migratore, one-off, variabile d'ambiente, dipendenza o tiro non deterministico nuovo (D-28, REPO-RULES) | VERIFICATA | `grep` sulle righe aggiunte ai file di produzione di `TODO`, `FIXME`, `Math.random`, `Date.now`, `process.env`, `setTimeout`, `console.log` → 0; `package.json`, `package-lock.json`, `.env.example`, `src/config` senza diff. |

**Score:** 20/20 verità verificate.

### Artefatti richiesti

| Artefatto | Atteso | Stato | Dettaglio |
|-----------|--------|-------|-----------|
| `src/quests/prizes/rank-prizes.ts` | `GROUP_PRIZE_TYPES`, `rankBlocksOf`, `prizeBlocksOf`, `prizeBlockFor` | VERIFICATO | 105 righe; importato da risoluzione, completamento dell'oste, resolver, clone dell'aid, report, loader |
| `src/models/quest/quest-rank-prize.model.ts` | blocco a DB, solo Mongoose | VERIFICATO | `title` con enum, `refPath` assoluti, cablato su `QuestPrizes.rankPrizes` |
| `src/quests/prizes/quest-prizes.resolver.ts`, `quest-rank-prizes.type.ts` | `prizes` per viewer, `rankPrizes` | VERIFICATO | provider in `quests.module.ts` |
| `src/quests/outcomes/rewards/quest-rewards.ts` | cancello del titolo, cura nel premio tirato, quota | VERIFICATO | |
| `src/quests/acceptance/quest-eligibility.ts` | `hasUntitledGroupSeat`, regola `'invalid'` | VERIFICATO | usata da accettazione, avvio, timeout, report |
| `src/quests/maintenance/group-prize.report.ts`, `group-prize-report.service.ts` | report di sola lettura al boot | VERIFICATO | solo `find` lean; passo non bloccante in `quest-maintenance.boot.ts` |
| `src/quests/generation/generation-rules.ts`, `generated-quest-draft.ts`, `quest-generator.service.ts` | boss misti e blocchi | VERIFICATO | |
| `src/quests/outcomes/aid/aid-opening.ts` | `opensAid` | VERIFICATO | unico chiamante `combatant-plan.ts:138` |
| `src/quests/outcomes/defeat-without-aid.ts` | `planDefeatWithoutAid` | VERIFICATO | |
| `src/quests/outcomes/aid/aid-quest.ts`, `rescue-share.ts` | clone dei blocchi, turno, quota | VERIFICATO | |
| `src/quests/outcomes/dungeon/dungeon-turns.ts`, `dungeon-resolver.ts`, `placeholder-dungeon-resolver.ts` | turni, contratto, segnaposto | VERIFICATO | segnaposto dichiarato provvisorio per decisione (D-13, D-29) |
| `src/quests/outcomes/quest-battle.ts` | `questBattleOf`, `facedCatalogOf`, `savedTurnWarningOf` | VERIFICATO | nato dal ruling C-WR-01 |
| `src/models/quest/quest-rescue.model.ts` | `rescue.turn` | VERIFICATO | mai sul filo (nessun `@Field`) |
| `src/models/enums/dungeon-turn-kind.enum.ts`, `quest-result.model.ts` | enum e campi dei turni | VERIFICATO | |
| `src/quests/party/registered-release.ts`, `character-archiver.ts`, `character-deletion.service.ts` | liberazione e push | VERIFICATO | |
| `test/quests/turn-failing-dungeon-resolver.ts`, `swappable-dungeon-resolver.ts`, `dungeon-turns.fixture.ts` | porta di test | VERIFICATO | solo sotto `test/` |
| `.planning/phases/21-premi-per-rango-e-soccorsi/BACKEND-NOTES.md` | handoff §0-§7 | VERIFICATO | §6 «da eseguire», segnaposto al posto dei valori reali, nessun segreto |
| `21-VALIDATION.md`, `REQUIREMENTS.md` | validazione firmata, requisiti chiusi | VERIFICATO | `nyquist_compliant: true`; BE-RANKP-01..06 `[x]` |

### Key link

| Da | A | Via | Stato |
|----|---|-----|-------|
| `planCombatant` | `prizeBlockFor(quest, snapshot.status.title)` | `combatant-plan.ts:176` | CABLATO |
| `GmCompletionService` | `prizeBlockFor` | `gm-completion.service.ts:318` | CABLATO |
| `QuestPrizesResolver.prizes` | `ViewerVitalsService.of` + `prizeBlockFor` | `quest-prizes.resolver.ts:36-37` | CABLATO |
| `QuestPrizesResolver.rankPrizes` | `rankBlocksOf` | `quest-prizes.resolver.ts:43` | CABLATO |
| `ResolutionLoader` | `prizeBlocksOf` (unione dei ref) | `resolution-loader.service.ts:569` | CABLATO |
| `QuestPrizes.rankPrizes` | `QuestRankPrizeSchema` | `quest-prizes.model.ts:59` | CABLATO |
| `QUEST_CATALOG_POPULATE` | `prizes.rankPrizes.*` (4 percorsi) + `sanitizePrizeRefs` per blocco | `quest-catalog.populate.ts` | CABLATO |
| `planParticipant` | `canLearnSpell` / `drawLearnableSpell` con `titleAfter` | `outcome-plan.ts:447-454` | CABLATO |
| `registrationRuleOf` | `hasUntitledGroupSeat` | `quest-eligibility.ts:110` | CABLATO |
| `QuestMaintenanceBoot` | `GroupPrizeReportService.report()` | `quest-maintenance.boot.ts:22` | CABLATO |
| `QuestGenerator.createOn` | `mixedOf` → `mixedSeatsOf`, `prizesOf`, `mixedBossDraftOf` | `quest-generator.service.ts:284-296`, :310-330 | CABLATO |
| `planCombatant` | `planDefeatWithoutAid` | `combatant-plan.ts:140` | CABLATO |
| `buildAidQuest` | `proportionalPrizesOf` + `rescueShareOf` | `aid-quest.ts:124-127` | CABLATO |
| `QuestResolutionService` / `RescueResolutionService` | `questBattleOf` → `DungeonResolver.explore` | `quest-resolution.service.ts:191`, `rescue-resolution.service.ts:412`, `quest-battle.ts:63` | CABLATO |
| `questBattleOf.fallenTurn` | `buildAidQuest(…, turn)` | `quest-resolution.service.ts:151`, `rescue-resolution.service.ts:474`, :493 | CABLATO |
| `CharacterArchiver.releaseQuestsOf` | `releaseRegisteredWithin` | `character-archiver.ts:287` | CABLATO |
| `CharacterDeletionService` | `notifyQuestCancelled` dopo il commit | `character-deletion.service.ts:72`, :80 | CABLATO |
| Handoff §1 | `src/schema.gql` | diff da `1f9db973` rieseguito qui: solo aggiunte | CABLATO |

Tre key link dei piani hanno cambiato forma coi ruling della review senza perdere la sostanza (vedi «Note» 1-3).

### Flusso dei dati (Level 4)

La fase non rende nulla a schermo; i dati sono i blocchi a DB e gli esiti. Catena reale da capo a fondo: tabelle del generatore (`prizesOf`) → `prizes.rankPrizes` a DB → `rankBlocksOf` → (a) `prizeBlockFor` col titolo letto in sessione → `drawRewards` → `QuestResult.rewards` e scritture sul personaggio; (b) `prizeBlockFor` col titolo del viewer letto a DB (`viewer-vitals.service.ts:84-101`) → `Quest.prizes` sul filo. Turno: `DungeonResolution.failedTurn` → `savedTurnOf` → `rescue.turn` sull'aid → riletto da `rescueTurnOf` → percorso, quota e contatori. Nessun valore fisso né sorgente vuota; `EMPTY_PRIZES` del resolver serve solo un parent senza `prizes` caricati.

### Spot-check comportamentali

SALTATI per vincolo dell'orchestratore (nessun jest, tsc, build, lint; BE non avviato). Sostituiti dal gate registrato in `21-REVIEW-FIX.md` e dalla lettura dei casi di prova. Controlli fatti a mano sul codice: dungeon da 4 gruppi → `dungeonTurnsOf(4)` = 8 turni; caduta al 5° turno (indice 4, esplorazione) → quota (4 + 1) / 8 = 5/8, il soccorritore gioca gli indici 0..4 (2 scontri, `facedEnemyCountOf` = 2) e chiude con `turnsCompleted` 5, `lastTurn` 5, `lastTurnKind` exploration; caduta al 4° (indice 3, scontro) → 4/8 = metà, contatori 8/4/4/fight (coincide col passo 3 della UAT nel handoff §6); boss da 2 posti misto → `floor(2 / 2)` = 1 posto inferiore senza tiro di proporzione.

### Requisiti → codice → test

| Requisito | Codice | Test (file, caso principale) | Stato |
|-----------|--------|------------------------------|-------|
| BE-RANKP-01 — blocco per titolo sulle quest di gruppo; nessun posto null; solitarie col premio unico | `prizes/rank-prizes.ts`; `models/quest/quest-rank-prize.model.ts`; `acceptance/quest-eligibility.ts:104-122`; `maintenance/group-prize.report.ts`, `group-prize-report.service.ts` | `rank-prizes.spec.ts` (:73 boss legacy); `quest-prizes.schema.spec.ts`; `quest-eligibility.spec.ts:168`, :194; `quest-acceptance.service.int-spec.ts:2474` (boss e worldMission, nessuna scrittura); `group-prize.report.spec.ts`; `group-prize-report.service.int-spec.ts:71`; `quest-resolution.service.int-spec.ts:419` (solitaria); `party-timeout.int-spec.ts`, `quest-start.int-spec.ts` (D-24) | SODDISFATTO |
| BE-RANKP-02 — blocco del proprio titolo alla risoluzione; magia solo ai caster in ogni percorso | `combatant-plan.ts:174-181`; `gm-completion.service.ts:317-321`; `rewards/quest-rewards.ts:296-332`; `outcome-plan.ts:421-455` | `boss-resolution.int-spec.ts:664` (misto), :724 (legend sui posti hero), :790 (legacy); `gm-completion.service.int-spec.ts:367`, :407 (cura del blocco); `combatant-plan.spec.ts`; `quest-rewards.spec.ts:656`, :667, :673; `outcome-plan.spec.ts:1832` (rookie su ogni percorso), :1848 (titolo dopo l'esito), :1867 (non caster → lore); `study-spell-draw.int-spec.ts:262-266` | SODDISFATTO |
| BE-RANKP-03 — boss misti generati, blocchi dalle tabelle, nessuna semina, blocco del viewer sul filo | `generation/generation-rules.ts:115-160`; `generated-quest-draft.ts`; `quest-generator.service.ts:284-330`, :433; `prizes/quest-prizes.resolver.ts`; `no-effect/viewer-vitals.service.ts` | `generation-rules.spec.ts`; `generated-quest-draft.spec.ts`; `quest-generator.int-spec.ts:870`, :918 (enemy identiche tiro per tiro), «pins the draws of a mixed boss at the tail of its quest (A-IN-02, D-23)», :984, :1006; `quests.resolver.int-spec.ts:1090`, :1177, :1218, «shows a legend the hero block (D-18)», «populates two full blocks of mixed items…»; `quest-updated.subscription.int-spec.ts:651` (due sottoscrittori, payload condiviso non mutato); `viewer-vitals.service.spec.ts`; `quest-catalog.populate.spec.ts`, `.int-spec.ts` | SODDISFATTO |
| BE-RANKP-04 — aid solo dai cinque tipi; clone dei blocchi coi posti; aid persa invariata; crime com'è | `aid/aid-opening.ts`; `defeat-without-aid.ts`; `combatant-plan.ts:138-160`; `aid/aid-quest.ts:88-156` | `aid-opening.spec.ts`; `defeat-without-aid.spec.ts`; `combatant-plan.spec.ts:313` (`concludes a lost %s without aid at one life point (D-19)`, sei tipi); `quest-combat.int-spec.ts:412` (job), :445 (hunt); `crime-guard-conclusion.int-spec.ts:136`, :210; `boss-resolution.int-spec.ts:744`; `aid-quest.spec.ts` (blocchi validi, doppione, solitaria con blocchi a DB); `aid-rescue.int-spec.ts`, `aid-timeout.int-spec.ts` (regola dell'aid persa, non regressione) | SODDISFATTO |
| BE-RANKP-05 — dungeon a turni, turno salvato, percorso fino al turno, premio proporzionale, contatori | `dungeon/dungeon-turns.ts`; `dungeon-resolver.ts`; `placeholder-dungeon-resolver.ts`; `quest-battle.ts`; `aid/rescue-share.ts`; `quest-rescue.model.ts`; `quest-result.model.ts`; `rescue-plan.ts:118-142` | `dungeon-turns.spec.ts`; `placeholder-dungeon-resolver.spec.ts`; `quest-battle.spec.ts` (contratto: rifiuti e derivazioni, :110, :116, :123, :133); `rescue-share.spec.ts` (epsilon); `quest-dungeon.int-spec.ts:263`, :282 (esplorazione con la porta di test), «writes the turn counters of a cleared dungeon (D-21)»; `dungeon-aid.int-spec.ts:236`, :253, :306 (D-10, D-26), :472, :654 (5/8), :683 (metà), :713, «a dungeon aid left without wounded after the start»; `rescue-plan.spec.ts:187`; `combatant-plan.spec.ts:447`; `quest-rewards.spec.ts:402`; `quest-result.schema.spec.ts` | SODDISFATTO |
| BE-RANKP-06 — archiviatore che libera i soccorritori; unit + integration; SDL al boot; handoff | `party/registered-release.ts`; `character-archiver.ts:233-314`; `character-deletion.service.ts:49-88`; `party-timeout.service.ts:155-195` | `character-archiver.int-spec.ts:634`, «leaves a started rescuer untouched…», «keeps the rescuers of a started aid it concludes (B-WR-04, D-27)», «keeps an aid with other wounded open…»; `character-deletion.resolver.int-spec.ts:768`, «keeps a committed deletion when the cancellation push fails (B-IN-04, D-27)»; `test/app.int-spec.ts:705`, :713; gate di `21-REVIEW-FIX.md` (fonte dei numeri); diff SDL rieseguito qui | SODDISFATTO (riavvio reale del BE dal ramo: differito alla UAT) |

Nessun requisito orfano: `REQUIREMENTS.md` mappa alla Phase 21 solo BE-RANKP-01..06 e tutti e sei compaiono nei `requirements` dei piani.

### Anti-pattern

| File | Riga | Pattern | Gravità | Impatto |
|------|------|---------|---------|---------|
| — | — | `TODO`, `FIXME`, `Math.random`, `Date.now`, `process.env`, `setTimeout`, `console.log` nelle righe aggiunte ai file di produzione | nessuno trovato | — |
| `src/quests/outcomes/dungeon/placeholder-dungeon-resolver.ts` | 1 | Segnaposto dichiarato («PROVVISORIO») | Info | Voluto (D-13, D-29): il motore a turni è dell'utente e si collega via DI; il contratto è imposto da `checkedDungeonResolution`. Non è uno stub del goal. |
| `src/quests/party/registered-release.ts` | 65 | WARN scritto dentro la transazione | Info | Ruling B-IN-03 chiuso `not_needed` con motivo; il log porta solo id e resta vero se la transazione si ripete. |
| `src/quests/prizes/quest-prizes.resolver.ts` | 41-47 | `Quest.rankPrizes` elenca tutti i blocchi a ogni viewer autenticato | Info | Forma decisa in D-22 (lo userà il passo dei premi dell'oste); il blocco del viewer resta `Quest.prizes`. Nessuna azione richiesta. |

Nessun blocker, nessun warning.

### Note (non sono gap)

Verità dei piani superate dai ruling della review, **verificate nella forma del ruling, senza override**:

1. **Piano 09, key link `rescueTurnFromStages(` e piano 10 (`nextRescueTurnOf`):** rimosse dal ruling C-WR-02. Il turno da salvare viene solo da `savedTurnOf` (`dungeon-turns.ts:123-134`), dal `failedTurn` della porta verificato da `checkedDungeonResolution`. Sostanza della verità (l'aid nasce col turno della sconfitta) verificata alle righe della verità 4.
2. **Piano 10, key link `this.dungeon.explore(` in `rescue-resolution.service.ts`:** la chiamata alla porta sta ora in `questBattleOf` (`quest-battle.ts:63`), unica regola per soccorso e percorso individuale (ruling C-WR-01 + B-WR-01); `rescue-resolution.service.ts:412` la invoca passando `this.dungeon`.
3. **Piano 06, verità «`archiveWithin` resta un wrapper»:** `archiveWithin` è stato rimosso (ruling B-IN-02, nessun chiamante di produzione); resta `archiveWithinReporting`. Il giro dei liberati dentro la morte del soccorso è stato tolto (ruling B-IN-01): letto sul codice che in `timeoutAid` l'aid è conclusa dal claim prima di `dieWithin` (`rescue-resolution.service.ts:312-319`) e nel soccorso perso dal claim di `fightRescuers` (:455-471), quindi l'archiviatore non può concludere lì un'altra aid.
4. **Piano 12, verità «`rankPrizes` nell'ordine dei posti»:** il resolver serve l'ordine di `prizes.rankPrizes` a DB, che per le generate coincide coi posti (`generated-quest-draft.ts:206-212`); per le scritte a mano è l'ordine scritto dall'utente. Commento del resolver e handoff §2 lo dicono così.
5. **Ripiego D-18 con blocchi doppi a DB:** vince il primo per titolo (`Array.find`), riportato al boot come `invalidBlock` (ruling A-IN-03).
6. **worldMission con un posto senza titolo:** l'accettazione la rifiuta; avvio e timeout del party non la leggono (corsia dell'oste). Dichiarato nei limiti noti del handoff §7.
7. **Aid con turno salvato malformato a DB:** resta sul combattimento unico con WARN di solo id (ruling C-IN-02, `quest-battle.ts:86-99`).
8. La casella della Phase 21 nell'elenco in testa alla ROADMAP (riga 51) è ancora aperta: la chiude l'orchestratore alla chiusura della fase.
9. `21-REVIEW-FIX.md` ha `status: partial` nel frontmatter per il solo B-IN-03 `not_needed` (22 fixed, 1 not_needed, 0 skipped): nessun finding aperto.

### Verifica umana — differita alla UAT su device (handoff §6)

I passi qui sotto sono **differiti alla UAT su device (handoff `BACKEND-NOTES.md` §6)**, che l'orchestratore conduce con l'utente insieme ai piani 20-03 e 20-04 della FE Phase 20, dopo il riavvio reale del BE dal ramo. Nessuno è stato eseguito né osservato in questa verifica.

1. **Foglio del boss misto** — differito alla UAT su device (handoff §6, passo 1). Atteso: viewer mage e viewer paladin vedono blocchi diversi in «Ricompense»; l'utente senza personaggio vede il blocco del `minTitle`.
2. **Vittoria del boss misto** — differito alla UAT su device (handoff §6, passo 2). Atteso: ognuno riceve il proprio blocco in `QuestResult.rewards`; il pet solo se il suo blocco ne ha uno e il tiro lo concede.
3. **Aid di dungeon a metà premio** — differito alla UAT su device (handoff §6, passo 3). Atteso: foglio dell'aid con metà di monete, xp e oggetto fisso; esito del soccorritore con `turnsCompleted` 4 / `turnsTotal` 8, `lastTurn` 4, `lastTurnKind` fight, `stagesCleared` 2 / `stagesTotal` 4; ferito `rescued` senza riga dei turni e libero. La caduta in esplorazione non è riproducibile col segnaposto (D-29): resta provata dalle sole spec.
4. **Job con nemici persa** — differito alla UAT su device (handoff §6, passo 4). Atteso: vita 1, in città, nessuna aid, corsia libera, `outcome` `failure`.
5. **Cancellazione di un ferito con un soccorritore iscritto** — differito alla UAT su device (handoff §6, passo 5). Atteso: aid conclusa, push `questCancelled` al soccorritore, corsia libera e nessuna PendingQuest.
6. **Log del boot** — differito alla UAT su device (handoff §6, passo 6). Atteso: report dei premi per titolo con soli id e conteggi, muto se nessuna quest di gruppo aperta viola le regole.
7. **SDL al riavvio reale** — differito alla UAT su device (handoff §6, prerequisiti). Atteso: schema servito dal BE riavviato dal ramo con le sole aggiunte del §1.

Perché lo status è `passed` e non `human_needed`: ogni comportamento del goal ha una prova di integrazione sul replica set coi servizi veri (boss misto, completamento dell'oste, aid di dungeon con la porta di test, archiviatore, sottoscrizione a due viewer, boot reale di test per lo SDL) e il filo è solo additivo. La UAT conferma l'esperienza con l'app della FE Phase 20 e i dati reali, ma non è necessaria per dichiarare che il codice consegna il goal.

### Gap

Nessuno.

---

_Verificato: 2026-11-13T18:10:26Z_
_Verificatore: Claude (gsd-verifier)_
