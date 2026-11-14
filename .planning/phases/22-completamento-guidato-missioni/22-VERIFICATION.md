---
phase: 22-completamento-guidato-missioni
verified: 2026-11-14T00:00:00Z
status: human_needed
score: 43/43 must-have verificati (7 criteri ROADMAP, 9 requisiti, 27 decisioni D-01..D-26 e D-31)
overrides_applied: 0
gaps: []
deferred: []
human_verification:
  - test: "Riavvio reale del BE dal ramo contro il DB e boot dello schema"
    expected: "Il BE parte, `src/schema.gql` resta identico (nessun diff dopo il boot), i due change stream nuovi (`MissionDraftLockPublisher`, `MissionDraftQueueRefresher`) si agganciano senza errori nei log"
    why_human: "Il boot reale richiede il DB (replica set con change stream) e il processo del BE; la verifica non ha potuto avviarlo. Il boot di test (`test/app.int-spec.ts`, 101/101 al gate 22-17) lo copre solo su Mongo di test"
  - test: "UAT su device, BACKEND-NOTES.md §6 passi 1..11 (worldMission + story seminate a DB)"
    expected: "Avviso «Missione in corso» senza toccare nulla sui telefoni dei giocatori, rifiuto di viaggio/negozio/equip/pozione/accettazione, lista nemici col leggendario seminato, due scontri in sequenza, correzioni, premi, ripresa da un altro dispositivo, completamento con foglio dell'esito, scarto che libera i partecipanti, blocco della hunt nel tempo d'attesa"
    why_human: "Comportamento in tempo reale (subscription `characterUpdated`, push, FE Phase 21) e dati reali del DB (0 story e 0 worldMission a DB al 2026-11-12): non verificabile da lettura del codice"
  - test: "`npm run test:cov` completo e build vera"
    expected: "Soglie di coverage del `package.json` rispettate su tutto l'albero, build pulita"
    why_human: "In corso a cura dell'orchestratore sullo stesso albero; qui si cita solo il ripiego per cartella del gate 22-17 (tutte sopra soglia)"
---

# Phase 22: Completamento guidato delle missioni — Verification Report

**Phase Goal:** Il completamento di story e worldMission diventa un flusso guidato posseduto dal BE: lista dei nemici per luogo e titolo, simulazioni a secco degli scontri in sequenza, correzioni, premi per personaggio dal blocco del titolo, bozza ripresa da qualunque dispositivo, scrittura finale in una transazione.
**Verified:** 2026-11-14
**Status:** human_needed
**Re-verification:** No — verifica iniziale
**Branch:** `feat/22-completamento-guidato-missioni` (base di fase `ee221ab8`, base SDL `c6079ca3`, 109 commit)
**Metodo:** sola lettura di codice e spec; nessun jest, tsc, eslint o build lanciato (l'orchestratore ha la suite in corso). L'esecuzione è provata dai risultati registrati in `22-17-SUMMARY.md` (gate: tsc 0, unit 295/295 suite 3934 test, integration 153/153 suite 2323 test, boot reale 101/101, coverage per cartella sopra soglia) e in `22-REVIEW-FIX.md` (dopo i fix: unit 296 suite 3944 test, integration `characters` 26/417, guided+gm-completion+pending-requests+app+authz 12/366, `git diff --exit-code src/schema.gql` vuoto).

## Criteri di successo della ROADMAP

| # | Criterio | Stato | Evidenza nel codice | Spec che lo prova |
|---|----------|-------|---------------------|-------------------|
| 1 | Lista nemici per una worldMission mage presso rovine: nemici delle rovine o `city` nella fascia mage più i leggendari; «mostra tutti» il bestiario; adventurer `FORBIDDEN` | VERIFIED | `mission-enemies.service.ts:60-76` (`list`: `showAll` → bestiario ordinato, altrimenti `missionEnemyPoolOf` con `poiTypes` del luogo, `band` da `missionBandOf`, `legendaries: lane === worldMission`); `mission-enemy-pool.ts:63-89` (zona + ripiego `livesAnywhere`; leggendari solo con `rule.legendaries`, senza fascia); `livesIn` include `city` (`enemy-pool.ts:33-42`); `@Roles(RoleType.innkeeper)` su `missionEnemies` (`guided-mission.resolver.ts:80-93`) | `guided-mission.resolver.int-spec.ts:390` «lists the ruins and city enemies of the mage band plus the legendaries (D-03, D-19)», `:409` «lists the whole bestiary with show all (D-03)», `:467` «refuses an adventurer (D-03)»; `mission-enemy-pool.spec.ts` |
| 2 | Due scontri simulati in sequenza: il secondo parte dallo stato corretto del primo; nessun documento di personaggio, quest o risultato cambia | VERIFIED | `mission-simulation.service.ts:83-100` (`overlaidParticipants` con `previousEffectsOf` = effetti corretti o simulati dei precedenti), `:176-189` e `:149-164` (l'unica scrittura è `drafts.write` sulla bozza); `fight-state.ts:55-58` (`stateBeforeFight` non muta lo snapshot); sorgente di caso dedicata `mission-simulation.chance.ts:6-12` | `mission-simulation.service.int-spec.ts:255` «starts the second fight from the corrected state of the first (D-02)», `:194` «simulates a fight without writing characters, quests or results (D-04)», `:206` «draws only from the simulation chance (D-04)» |
| 3 | La bozza sopravvive alla chiusura dell'app, si riprende da un altro dispositivo, sparisce con la richiesta | VERIFIED | Bozza persistita in collection (`mission-draft.model.ts`, `MissionDraftService.start` in transazione `mission-draft.service.ts:67-93`); lettura da qualunque PendingQuest del gruppo (`draftOf` con `participants.pendingQuest $in`, `:219-226`); orfana cancellata alla lettura (`:97-107`); cancellata dal completamento guidato (`guided-completion.service.ts:135-148`) e dal vecchio `completePendingRequest` (`gm-completion.service.ts:106-120`); `missionDraftStartedAt` sulla coda per la carta «Riprendi» (`pending-requests.builder.ts`, SDL `PendingRequest.missionDraftStartedAt`) | `mission-draft.service.int-spec.ts:274` «reads the draft from any pending quest of the group and null without one (D-09)», `:288` «drops an orphan draft whose pending quests are gone (D-09)», `:220`, `:234`; `guided-mission.resolver.int-spec.ts:157` |
| 4 | Il completamento scrive stato corretto, nemici, xp, lore e premi in una transazione; premio fuori filtro rifiutato; esito sempre `gmCompleted` | VERIFIED | `guided-completion.service.ts:94-130` → `GmCompletionService.completeWith` (`gm-completion.service.ts:127-137`, transazione unica `:140-232`); `verdict: QuestOutcome.gmCompleted`, `aid: null` (`:187-198`); nemici fusi `mergedEnemiesOf`; conoscenza/lore `victoryKnowledgeOf`; premi `chosenRewardsOf` senza tiri (`chosen-rewards.ts:55-77`); rivalidazione in sessione `assertPrizeAllowed` + `assertSequenceAllowed` (`guided-completion.service.ts:67-82, 192-205`) | `guided-completion.service.int-spec.ts:323` «writes the corrected state, the merged enemies, the knowledge and the chosen prizes in one transaction (D-07, D-08)», `:547` «refuses a prize no longer allowed without writing (D-07)», `:422` «completes a lost simulation as a gm completion with no aid (D-05)», `:444` «never draws from the shared chance (D-08)» |
| 5 | Dall'avvio del flusso un partecipante non può partire né accettare; vede «missione in corso»; il blocco cade a completamento o scarto | VERIFIED | Predicato unico `mission-lock.ts:19-33`; guardie `travel.service.ts:118,129` (`preview`, `startTravel`) e `quest-acceptance.service.ts:206-211, 333, 337`; campi risolti `character-status.resolver.ts` (`missionInProgress`, `guidedMissionInProgress`); emissione su avvio/scarto senza scritture sul personaggio `mission-draft-lock.publisher.ts`; rilascio: scarto (`mission-draft.service.ts:109-134`, marcatore a `null`), completamento (PendingQuest cancellate + bozza cancellata) | `travel.service.int-spec.ts:319`, `quest-acceptance.service.int-spec.ts:1154`, `mission-in-progress.int-spec.ts:232` «emits both flags when a guided draft starts and ends (D-23)», `mission-draft.service.int-spec.ts:299`, `guided-completion.service.int-spec.ts:503` |
| 6 | Hunt in attesa (e boss avviato): equip, compagno, magie, pozione, acquisto rifiutati con lo stesso codice; durante il viaggio permessi | VERIFIED | `characters.service.ts:178,206,228,239,274,326` (6 × `assertFree`: `equipItem`, `equipPet`, `unequipPet`, `equipSpell`, `unequipSpell`, `useSpell`); `item-use.service.ts` + `item-use.plan.ts` (`refuseWhileOnMission`, dopo `AWAITING_AID`); `shop-transaction.service.ts` (`assertFree` dopo la prigione, prima della città); corsia standard bloccata solo con `startDate` valorizzata (`mission-lock.ts:30-33`), quindi il viaggio verso la quest resta libero; stesso codice `MISSION_IN_PROGRESS` (`game-rule.exception.ts`) | `character-mutations-lock.int-spec.ts:191, 225, 361`, `use-item.int-spec.ts` (hunt, bozza, viaggio), `do-transaction.int-spec.ts:723`, `mission-lock.reader.int-spec.ts` |
| 7 | SDL al boot reale; handoff per la FE Phase 21 | VERIFIED (boot reale = human) | `git diff c6079ca3 --numstat -- src/schema.gql` = 147 aggiunte, 0 tolte; `BACKEND-NOTES.md` (422 righe) presente e coerente col codice (vedi sotto) | `test/app.int-spec.ts` casi `(D-17)`, 101/101 al gate; boot su DB reale → human verification |

## Requisiti BE-GMFLOW

| Requisito | Stato | Evidenza | Spec |
|-----------|-------|----------|------|
| BE-GMFLOW-01 lista nemici innkeeper (tipi POI + `city`, fascia titolo, leggendari worldMission, «mostra tutti») | SATISFIED | `mission-enemies.service.ts:60-76`, `mission-enemy-pool.ts`, resolver `:80-93` | criterio 1 |
| BE-GMFLOW-02 simulazione a secco, `CombatResolver`, stato corrente o lasciato dal precedente, nessuna scrittura | SATISFIED | `mission-simulation.service.ts` (`this.combat.resolve(context, this.simulationChance)`); scrive solo la bozza | criterio 2, «serves the start of the fight and the simulated effects (D-17, D-21)» |
| BE-GMFLOW-03 bozza sulla richiesta, ripresa multi-dispositivo, invisibile ai giocatori, invalidata se la richiesta sparisce | SATISFIED | modello bozza senza alcun `@Field` (0 occorrenze), marcatore `PendingQuest.missionDraftStartedAt` solo `@Prop` (`pending-quest.model.ts:37`), tutti gli handler `@Roles(innkeeper)` | criterio 3, `guided-mission.resolver.int-spec.ts:199` «never serves the draft to a player (D-10)» |
| BE-GMFLOW-04 correzioni per personaggio validate come gli override | SATISFIED | `mission-draft-save.service.ts` `corrected()` → `validateOverrides` sullo stato a inizio scontro + `assertAddsOnlyNewInjuries`; riverifica al completamento `assertSequenceAllowed` | `mission-draft-save.service.int-spec.ts` (correzioni, D-14), `guided-completion.service.int-spec.ts:684, 695, 711, 727` |
| BE-GMFLOW-05 premi dal blocco del titolo + catalogo filtrato, rivalidati (tetto rarità, pet, magie caster con `minXpToLearn`) | SATISFIED | `mission-prizes.ts:114-171` (`missionPrizeOptionsOf`: tetto da tabella boss/enemy, `learnableSpells` solo `isSpellCaster` e `minXpToLearn <= xp`, voci del blocco sempre ammesse), `mission-prize-options.service.ts`, prefill `mission-draft.service.ts:158-173` | `mission-prizes.spec.ts`, `guided-mission.resolver.int-spec.ts:816, 857` |
| BE-GMFLOW-06 completamento in una transazione, xp nemici e compagno, conoscenza e lore, premi scelti, sempre `gmCompleted`, nessuna aid | SATISFIED | `gm-completion.service.ts:165-198` (`planParticipant` con `gmCompleted`, `aid: null`, `petMaxXp`), `guided-completion.service.ts` | criterio 4, `:463` story senza scontri |
| BE-GMFLOW-07 ruolo innkeeper e audit su ogni mutation; unit + integration; SDL al boot reale; handoff | SATISFIED (boot reale = human) | 8 handler `@Roles(RoleType.innkeeper)`, 5 mutation con `@AuditTarget('PendingQuest', …)` (`guided-mission.resolver.ts`); `test/authz/expected-handlers.ts` +8 voci (19 handler dell'oste); fixture in `test/authz/handler-fixtures.ts` | `guided-mission.resolver.int-spec.ts:226` «audits the draft mutations and not the read (D-26)», `:596, :1039, :1223`, `:910`; matrice `test/authz` |
| BE-GMFLOW-08 stato «missione in corso» e blocco di partenze, accettazioni, negozio, equip, compagno, magie, pozioni dal flusso guidato; sblocco a completamento o scarto | SATISFIED | come criteri 5 e 6; codice proprio `MISSION_IN_PROGRESS` | criteri 5 e 6 |
| BE-GMFLOW-09 stesso blocco per ogni missione dall'inizio effettivo; `equipItem`, `equipPet`, `unequipPet`, `equipSpell`, `unequipSpell`, `useSpell`, `useItem`, negozio; stato esposto sul personaggio | SATISFIED | `lanesOf`/`isLocked` con `startDate` (`mission-lock.reader.ts:48-99`); sei guardie in `characters.service.ts`; campi su `CharacterStatus` | `mission-lock.reader.int-spec.ts` «locks a character whose standard mission has started (D-12)», `character-mutations-lock.int-spec.ts:361` (boss avviato) |

Nessun requisito orfano: `REQUIREMENTS.md` mappa solo BE-GMFLOW-01..09 alla Phase 22 e tutti compaiono nei piani.

## Decisioni D-01..D-26 e D-31 (D-27 fuori scope)

| D | Esito | Evidenza (codice) | Spec |
|---|-------|-------------------|------|
| D-01 teleport anche sui POI interni, luogo → tipi POI | VERIFIED | `teleportCharacter` non toccato né bloccato (`travel-admin.resolver.ts`: 0 `missionLock`); luogo da `MissionDraft.place` o primo partecipante (`mission-enemies.service.ts:89-96`); `saveMissionDraft.place` valida il POI (`mission-draft-save.service.ts:placeOf`) | `guided-mission.resolver.int-spec.ts:429` |
| D-02 uno o più scontri in sequenza | VERIFIED | `overlaidParticipants` + `reconcileFights` | `mission-simulation.service.int-spec.ts:255` |
| D-03 lista nemici con leggendari per worldMission, «mostra tutti» | VERIFIED | `mission-enemy-pool.ts` | `:390, :409, :440` |
| D-04 simulazione a secco, nessuna scrittura, sorgente di caso dedicata | VERIFIED | `MissionSimulationChance` (token distinto); `this.chance` non usato nella simulazione | `:194, :206` |
| D-05 sconfitta simulata → comunque `gmCompleted`, nessuna aid | VERIFIED | `gm-completion.service.ts:187-198` | `guided-completion.service.int-spec.ts:422` |
| D-06 correzioni per personaggio (vita 1..max, consumabili, magie, ferite) | VERIFIED | `validateOverrides` su overlay a inizio scontro (`mission-draft-save.service.ts` `corrected`) e al completamento | `mission-draft-save.service.int-spec.ts`, `guided-completion.service.int-spec.ts:727` |
| D-07 premi dal blocco, rivalidati contro il filtro | VERIFIED | `assertPrizeAllowed` al salvataggio (`prizeRecordOf`) e al completamento (`seatOutcomeOf`) | `guided-completion.service.int-spec.ts:547`, `mission-draft-save.service.int-spec.ts` |
| D-08 una transazione come oggi, esito ai giocatori | VERIFIED | `completeWith` condiviso, `writer.deliver` dopo il commit | `guided-completion.service.int-spec.ts:762` |
| D-09 bozza nel BE, ripresa, orfana invalidata | VERIFIED | `mission-draft.service.ts` | criterio 3 |
| D-10 bozza e simulazioni mai ai giocatori | VERIFIED | nessun `@Field` nel modello bozza; query/mutation tutte `innkeeper`; marcatore fuori dal filo | `guided-mission.resolver.int-spec.ts:199, :580, :894, :1025, :1207` |
| D-11 blocco dei partecipanti dall'avvio al risultato, rilascio a completamento/scarto | VERIFIED | guardie + `mission-draft.service.ts:109-134` | criterio 5 |
| D-12 stesso blocco per ogni missione, un solo predicato | VERIFIED | `missionInProgressOf` usato solo da `mission-lock.ts`, reader e resolver dello stato (invariante del gate 22-17: esattamente i tre); 6+1+1+2+3 punti `missionLock.*` | `mission-lock.spec.ts`, `mission-lock.reader.int-spec.ts` |
| D-13 ogni accettazione/iscrizione rifiutata a missione in corso, dopo i rifiuti esistenti | VERIFIED | `quest-acceptance.service.ts:205-211` | `quest-acceptance.service.int-spec.ts:477` (riscritta: story con hunt non avviata passa), `:1112, :1129, :1154, :1170` |
| D-14 ferite togliibili solo se della missione | VERIFIED | `assertAddsOnlyNewInjuries` (`fight-state.ts:70-77`) su salvataggio e completamento (solo effetti corretti) | `mission-draft-save…`: «refuses a correction that adds an injury the character already had (D-14)», `guided-completion…:684, :619` |
| D-15 monete e xp liberi, quantità oggetto 1..99 | VERIFIED | `coinsOf`/`amountOf` senza legame col blocco, `isPrizeQuantity` 1..99 (`mission-draft-save.service.ts`); tetto tecnico 9 999 999 da B-03 (dichiarato non di prodotto) | `mission-draft-save…`: «saves a prize inside the rank filter with free coins and xp (D-07, D-15)», «caps every coin and the xp at the technical ceiling (D-15, D-31)»; `mission-draft.inputs.spec.ts` |
| D-16 due campi risolti | VERIFIED | `character-status.resolver.ts` (`missionInProgress`, `guidedMissionInProgress`), SDL `CharacterStatus` | `character-status.resolver.spec.ts`, `mission-in-progress.int-spec.ts:286` |
| D-17 SDL = §Q9 verbatim + 4 aggiunte, solo additivo | VERIFIED | confronto riga per riga col blocco §Q9 (`22-RESEARCH.md:218-396`): tipi, enum, input, righe `Query`/`Mutation` coincidono; extra solo `CharacterStatus.guidedMissionInProgress` e su `MissionFightOutcome` `consumablesAvailable`, `injuriesBefore`, `spellsAvailable`; 147/0 | `test/app.int-spec.ts` `(D-17)` |
| D-18 una bozza per gruppo, marcatore solo Mongoose, last-write-wins, passi senza ordine | VERIFIED | indice unico + `isDuplicateKeyError` (`mission-draft.service.ts:67-89`), `write` con `$set`+`$inc rev` | `mission-draft.service.int-spec.ts:220, :234`, `mission-draft-save…`: «keeps the last write of two devices (D-18)» |
| D-19 variante `missionEnemyPoolOf`, leggendari senza fascia, fascia unione, ordine stabile | VERIFIED | `mission-enemy-pool.ts:30-45, 63-89` | `mission-enemy-pool.spec.ts` |
| D-20 compagno nel contesto, ignorato dal segnaposto | VERIFIED | `combat-context.ts` `companionOf`, `CombatParticipant.companion` additivo | `placeholder-combat-resolver.spec.ts` «ignores the companion and draws the same sequence (D-20)», `mission-simulation.service.int-spec.ts:362` |
| D-21 un verdetto per scontro | VERIFIED | `MissionFight.verdict` | `:215` |
| D-22 tetto da tabella boss/enemy; prefill del blocco; una funzione per opzioni e rivalidazione | VERIFIED | `ceilingTableOf` (`mission-prizes.ts:86-90`), `prefilledPrizeOf`, `allowanceFor` condivisa da query, salvataggio e completamento | `mission-draft.service.int-spec.ts:140`, `mission-prizes.spec.ts` |
| D-23 confini del blocco (ferito in soccorso libero, delete permessa, teleport permesso, `travelPreview` rifiuta, precedenza dei cinque codici, `QUEST_NOT_ACCEPTABLE` con bozza aperta, `characterUpdated` senza scritture) | VERIFIED | `item-use.plan.ts` (dopo `AWAITING_AID`), `shop-transaction.service.ts`, `quest-acceptance.service.ts:207-211`, `MissionDraftLockPublisher` + base `PendingQuestHoldersPublisher` (con recupero della storia persa, A-01) | `mission-in-progress.int-spec.ts:266`, `character-deletion.resolver.int-spec.ts`, `quest-acceptance…:1192, :1220`, `mission-draft-lock.publisher.spec.ts` |
| D-24 zero scontri, ordine, invalidazione a valle | VERIFIED | `assertSimulable` (`mission-simulation.service.ts:44-56`), `reconcileFights`/`resetFrom` | `draft-invalidation.spec.ts`, `mission-simulation…:295, :336`, `mission-draft-save…`: «saves a draft with no fights (D-24)» |
| D-25 completamento legge la bozza, scrive nemici di tutti gli scontri, cancella la bozza; `completePendingRequest` convive e cancella la bozza | VERIFIED | `guided-completion.service.ts` (`deleteReadRevision` in `afterSeats`, B-01), `gm-completion.service.ts:106-120` (`deleteMany` della bozza nella sua transazione); SDL `completePendingRequest` ancora presente (conteggio 1 al gate) | `gm-completion.service.int-spec.ts:337`, `guided-completion…:503, :586, :735` |
| D-26 audit sulle mutation, non sulle query | VERIFIED | `@AuditTarget` su 5 mutation, nessuno su 3 query | `guided-mission.resolver.int-spec.ts:226, :910` |
| D-31 `questTravelPreview` rifiuta; tetti tecnici; fuori ordine → `OUTCOME_OVERRIDE_INVALID`; ripiego zona vuota; `cure` solo se nel blocco; controllo D-14 solo sugli effetti corretti | VERIFIED | `quest-acceptance.service.ts:331-337`; costanti `MAX_MISSION_FIGHTS=10`, `MAX_FIGHT_ENEMIES=10`, `MAX_ENEMY_QUANTITY=20`, `MAX_PRIZE_ITEMS=500` (`mission-draft.inputs.ts:21-28`), `MAX_OVERRIDE_ENTRIES=50`; `cureFor` rifiuta senza cura nel blocco; `missionEnemyPoolOf` ripiego `livesAnywhere` | `quest-acceptance…:1246`, `mission-simulation…:317`, `mission-draft-save…`: «refuses a cure the block does not have and a quantity over 99 (D-15, D-22)» |

D-27 fuori scope: nessun diff all'archivio né a `archived-character-queue.refresher.ts` (invariante del gate).

## Artifact, wiring e key link dei piani

- **Artifact:** `gsd-tools verify artifacts` su `22-01..22-16-PLAN.md`: `all_passed: true` per tutti e 16 i piani; i 41 percorsi `path:` dei `must_haves` esistono sul ramo.
- **Wiring (livello 3), verificato a mano:**
  - `GuidedMissionModule` importato in `app.module.ts`; `GuidedMissionResolver` e tutti i servizi sono nei `providers` (`guided-mission.module.ts:50-61`); `QuestOutcomesModule` esporta `GmCompletionService`/`GmRequestReader`.
  - Publisher registrati: `MissionDraftLockPublisher` e `PendingQuestStartPublisher` in `characters.module.ts:53-54`, `MissionDraftQueueRefresher` in `pending-requests.module.ts:42`, `CharacterStatusResolver` in `characters.module.ts:51`.
  - `MissionLockModule` importato da characters, economy, travel, acceptance e item-use.
  - Ogni guardia è sul percorso della mutation: 6 in `characters.service.ts`, 1 `isLocked` in `item-use.service.ts`, 1 in `shop-transaction.service.ts`, 2 in `travel.service.ts`, 3 `assertFree` + 1 `hasOpenDraft` in `quest-acceptance.service.ts`.
  - Bozza cancellata da entrambi i completamenti (vedi D-25) e marcatore azzerato dallo scarto.
- **Key link:** 25 link dei piani verificati con script (pattern presente nel file `from`, file `to` esistente); i due non corrispondenti sono rinomine volute, non difetti: `requestPublish(` è finito nella base astratta `pending-quest-holders.publisher.ts` dopo il refactor A-03 (verificato: `characterUpdates.requestPublish` alla riga di `republishHolders`), `pets: catalog.pets` sta in `combatant-plan.ts:76` e il loader popola `pets` (`resolution-loader.service.ts:455-519`). Il tool `verify key-links` segnala falso negativo per i pattern con doppia escape nel frontmatter (errore di regex del tool, non del codice).
- **Data-flow (livello 4):** nessun componente UI; i dati della bozza arrivano da `findOneAndUpdate`/`create` su Mongo e dal catalogo reale (`readCatalogue`, `readRewardCatalogFor`), nessuna risposta statica. FLOWING.

## Handoff `BACKEND-NOTES.md` rispetto al codice dopo i fix della review

| Punto del handoff | Codice | Coerente |
|-------------------|--------|----------|
| Tetti §2 (10 / 10 / 20 / 50 / 500 / 99 / 9 999 999) | `mission-draft.inputs.ts:21-28`, `mission-draft-prefill.ts` (`MAX_PRIZE_ITEM_QUANTITY = 99`), `MAX_OVERRIDE_ENTRIES` | sì |
| Codici per operazione (tabella §2) | `NOT_FOUND` da `GmRequestReader`/bozza, `QUEST_IN_PROGRESS` da `assertNoBusyParticipant` e `lostCompletionError`, `OUTCOME_OVERRIDE_INVALID`/`OUTCOME_NOT_PARTICIPANT` da salvataggio, simulazione e completamento | sì |
| Rifiuto per `rev` (B-01): completamento cancella solo la revisione letta, altrimenti `OUTCOME_OVERRIDE_INVALID` senza scritture | `guided-completion.service.ts:135-148` (`deleteOne {_id, rev}`, `deletedCount === 0` → `outcomeOverrideInvalid`), `mission-draft.service.ts:151-155` (`$inc rev`), `rev` non esposto (0 `@Field`) | sì |
| Regola delle correzioni (lista completa, non elencato torna al simulato, `hpAfter` omesso = vita a inizio scontro, ferite di prima rifiutate, solo su scontro simulato) | `mission-draft-save.service.ts` `corrected()` (`verdict == null` → rifiuto, `entry ?? null`, `assertAddsOnlyNewInjuries`) | sì |
| Operazioni bloccate e precedenze (§3, A-02 dichiarata) | vedi guardie sopra; `PET_NOT_OWNED`/`SHOP_NOT_IN_CITY` dopo `MISSION_IN_PROGRESS` come descritto | sì |
| `extensions = { code }` soltanto | `game-rule.exception.ts` + `game-rule.exception.spec.ts` | sì |
| Subscription (§4): avvio/scarto senza scritture sul personaggio, recupero storia persa (A-01) | `mission-draft-lock.publisher.ts:onHistoryLost` | sì |
| Titoli di spec citati (§5) | grep dei titoli: presenti nei file indicati | sì |
| SDL §1 | uguale a `src/schema.gql` (additivo, 147/0) | sì |

## Anti-pattern

Nessun `TODO`/`FIXME`/segnaposto nei file nuovi di `src/quests/guided`, `src/characters/mission-lock`, `pending-quest-holders.publisher.ts`. Nessun return vuoto che arrivi al filo. Invarianti del gate 22-17 verdi (nessun migratore o seeder, nessun `Math.random`/`Date.now` aggiunto, nessun `jest.mock`, nessun `process.env` aggiunto, `.env.example` e `src/config` intatti). `Step 7b` (spot-check eseguibili): SKIPPED per il vincolo del mandato (niente jest/tsc/build, niente avvio del BE); il risultato registrato dal gate lo sostituisce.

## Osservazioni non bloccanti (nessun gap)

1. **Leggendari nella lista di default solo se vivono nella zona** (D-19, che vince su D-03 e sul testo del criterio 1 della ROADMAP: «più i leggendari»). Il handoff §6(c) lo dice e chiede una semina coerente; non è un difetto del codice, ma la UAT passa solo con un leggendario con `locations` concrete.
2. **Minimo di un nemico per scontro** (`ArrayMinSize(1)`, `enemies.length >= 1` in `enemiesWithinCaps`): il handoff elenca i massimi ma non il minimo. Omissione documentale; il caso «zero scontri» resta ammesso come lista vuota di scontri.
3. **Copertura di `src/quests/guided` a 81,13 % di branch** (riportata senza soglia nel gate): non c'è soglia di progetto per quella cartella; i cinque ambiti con soglia sono sopra.
4. **`22-SECURITY` non presente** in cartella: audit di sicurezza a cura dell'orchestratore (ROADMAP: «test:cov, verifica e audit»). Non è un requisito del codice.
5. **Rischio accettato e documentato (D-23):** corsa di millisecondi fra controllo e scrittura delle guardie; `abandonQuest` di una corsia GM con bozza aperta lascia una bozza orfana ripulita alla prima lettura (D-09).

## Human Verification Required

1. **Boot reale del BE dal ramo contro il DB** — avviarlo (a cura dell'orchestratore), controllare l'assenza di errori dei change stream nuovi e `git diff --exit-code src/schema.gql` dopo il boot. *Perché umano:* richiede DB con change stream e il processo del BE.
2. **UAT su device, BACKEND-NOTES.md §6 passi 1..11** con worldMission mage+paladin e story seminate a DB, leggendario con habitat concreto, FE Phase 21 installata. *Perché umano:* tempo reale, subscription, push e dati reali (a DB 0 story e 0 worldMission).
3. **`npm run test:cov` completo e build** — in corso dell'orchestratore.

## Gaps Summary

Nessun gap. Tutti e 7 i criteri della ROADMAP, i 9 requisiti BE-GMFLOW e le decisioni D-01..D-26 e D-31 trovano riscontro nel codice (artifact esistenti, sostanziali e cablati: guardie sul percorso di ogni mutation, publisher registrati in un modulo, resolver registrato con handler protetti `innkeeper` e mutation in audit, bozza cancellata da entrambi i completamenti) e in una spec che li prova; lo SDL è solo additivo (147 aggiunte, 0 rimozioni) e coincide con `22-RESEARCH.md` §Q9 più le quattro aggiunte di D-17; l'handoff è coerente col codice dopo i fix della review. Lo stato è `human_needed` solo per il boot reale contro il DB e la UAT su device.

---

_Verified: 2026-11-14_
_Verifier: Claude (gsd-verifier)_
