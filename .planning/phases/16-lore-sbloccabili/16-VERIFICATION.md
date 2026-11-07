---
phase: 16-lore-sbloccabili
verified: 2026-11-07T13:50:00Z
status: passed_with_gaps
score: 5/5 success criteria verified (requisiti BE-LORE-01..06 con evidenza nel codice, contratto FE rispettato; 1 gap documentale: handoff BACKEND-NOTES.md non ancora scritto)
overrides_applied: 0
re_verification: false
gaps:
  - truth: "Criterio 5 (parte documenti): handoff BACKEND-NOTES.md per la FE Phase 17 con SDL finale, identità di prova per la UAT, trucchi a DB e runbook del boot"
    status: failed
    reason: "Al momento della verifica il file .planning/phases/16-lore-sbloccabili/BACKEND-NOTES.md non esiste: lo sta scrivendo l'executor del piano 16-12 (ROADMAP riga 16-12 ancora non spuntata). Non è una mancanza del codice"
    artifacts:
      - path: ".planning/phases/16-lore-sbloccabili/BACKEND-NOTES.md"
        issue: "assente"
    missing:
      - "BACKEND-NOTES.md con §contratto verbatim, §identità di prova (DEV_AUTH_ROLE giocatore + DEV_AUTH_TWITCH_ID via env del processo, LORE_STUDY_CHANCE=1), §trucchi a DB, §runbook del backfill e della rimozione (16-12-PLAN)"
      - "Emendamenti in coda agli handoff 11 e 9.2 e requirements mark-complete BE-LORE-01..06 (solo piano 16-12)"
human_verification:
  - test: "UAT su device della FE Phase 17 (differita, piano 17-10; passi e dati del handoff BACKEND-NOTES.md, da `17-HUMAN-UAT.md` lato FE)"
    expected: "Dopo la merge, build e riavvio del BE a BE fermo. Seconda identità sul processo del BE (variabili d'ambiente del processo, non nel file `.env`): ruolo giocatore e twitchId del personaggio di prova al posto del bypass dev innkeeper, che vede tutto; `LORE_STUDY_CHANCE=1` sullo stesso processo per un tiro dello studio sempre riuscito. Dati a DB scritti dall'orchestratore fuori dal repo: (a) svuotare `status.unlockedLore` e `status.knownEnemies` del personaggio (il `characterUpdated` riparte); (b) una `study` vinta senza magia con `LORE_STUDY_CHANCE=1` apprende una lore; (c) l'arrivo si prova col teleport del GM sul marker della città oppure con un viaggio con `status.activeTravel.endTime` nel passato e lo sweep (spostare `status.location` a DB non sblocca nulla); (d) città sconosciuta in mappa: togliere da `unlockedLore` l'id della lore della città; (e) ritratto oscurato: togliere da `knownEnemies` l'id del nemico. Casi: nuova pagina del Bestiario e conoscenza appresa sul foglio (`loreUnlocked { id name type }`), ritratti oscurati con `known`, Biblioteca filtrata, «Non conosci ancora questa città.»"
    why_human: "Esperienza di gioco su device, change stream, filtri per identità e dati sul DB reale: fuori dal perimetro della fase BE (nessun checkpoint umano), differita e non bloccante"
  - test: "Boot reale con il backfill one-off (16-10), differito all'orchestratore"
    expected: "Al primo boot dal branch il log riporta i soli conteggi (personaggi, aggiornati, lore aggiunte, nemici aggiunti, senza città); il secondo boot a zero modifiche fa da verifica; poi rimozione in TDD fuori da questa fase e PR in draft fino ad allora"
    why_human: "Gira solo contro il database reale, a carico dell'orchestratore: non un gap"
---

# Phase 16: Lore sbloccabili — Verification Report

**Phase Goal:** la conoscenza è per personaggio: `status.unlockedLore` (id sul filo) e `status.knownEnemies` (interno), geografia della città alla nascita e a ogni arrivo sul marker di una città, nemici alla vittoria (tutti i vincitori), lore di studio al 50 %, query di lore filtrate per il bearer, `known` per viewer sulle voci di `enemies`, `loreUnlocked` sugli esiti, innkeeper vede tutto.
**Verified:** 2026-11-07T13:50:00Z (branch `feat/16-lore-sbloccabili`, HEAD `b0533fc`, base `develop` `9103440`)
**Status:** passed_with_gaps (nessun gap di codice; manca solo l'handoff, in scrittura dal piano 16-12)
**Re-verification:** No — verifica iniziale

## Metodo

Lettura di codice e spec contro ROADMAP §Phase 16 (5 criteri), REQUIREMENTS BE-LORE-01..06 (la ROADMAP ne elenca sei), `16-CONTEXT.md` D-01..D-15, `16-REPO-RULES.md` (contratto FE) e piani/SUMMARY. Nessuna scrittura oltre a questo file, nessun accesso a `.env` né al DB reale, nessun `npm run build`. I finding dei reviewer non sono ripetuti come gap.

- `npx tsc --noEmit -p tsconfig.json` → exit 0.
- Unit mirate (16 suite: `src/lore`, `src/migrations/lore-backfill`, `lore-config`, `victory-knowledge`, `outcome-plan`, `rescue-plan`, `rewards`, `travel.updates`, `ambush-plan`, `quest-acceptance.updates`, `starting-character`) → 16 suite / 237 test verdi.
- Integration, una suite con `--runInBand`: `src/lore/viewer-knowledge.service.int-spec.ts` 6/6 (cache per contesto/rootValue, innkeeper tutto senza lettura, personaggio corrente, nessuno nulla, morto in attesa del foglio nulla). Le altre int-spec sono state lette, non rilanciate: il gate 16-11 ha eseguito `test:cov` (373 suite / 4649 test, soglie rispettate, 576 s).
- Gate SDL: `git diff origin/develop -- src/schema.gql | grep -E '^-[^-]'` non stampa nulla; le sole righe aggiunte sono `unlockedLore: [ID!]!` (CharacterStatus), `known: Boolean!` (QuestEnemy), `loreUnlocked: [Lore!]!` (QuestResult). `City.relatedLore: Lore` resta nullable, `Lore.type: String!` invariato, nessuna operazione nuova.
- `pgrep -fl 'bin/jest'` vuoto a fine verifica.

## Goal Achievement — Success Criteria

| # | Criterio | Stato | Evidenza |
|---|----------|-------|----------|
| 1 | `unlockedLore`/`knownEnemies` additivi e idempotenti; nascita con la geografia della città natale; nessun flag globale; backfill dei personaggi esistenti | VERIFIED | `character-status.model.ts` (`unlockedLore` con `@Field(() => [ID])`, `knownEnemies` solo `@Prop`, default `[]`); `lore-geography.ts` (`geographyOf` = lore della città + `relatedLore` di tipo `region`/`state`, deduplicata, nessuna cascata); `LoreGeographyReader.ofMarker` (solo `City.markerLocation` con `idForms`, driver nativo, orfani scartati); `CharacterCreationService` legge la geografia fuori transazione e `buildStartingCharacter(…, unlockedLore)` la scrive nell'inserimento con `knownEnemies: []`; int-spec «starts the character knowing its home city, regions and state and nothing else», città senza lore, cancellazione e ricreazione → insieme nuovo (altra città, solo la sua geografia). Backfill: `lore-backfill.ts` pura per unione, migrator col driver nativo su personaggi attivi, `OnApplicationBootstrap` mai bloccante (try/catch, log di soli conteggi), `LoreBackfillModule` importato solo da `AppModule`; int-spec: da posizione ed esiti vinti, unione, seconda run a zero, archiviati intatti, ref legacy stringa, `loreUnlocked` dei vecchi risultati intatti. Esecuzione sul DB reale: differita all'orchestratore |
| 2 | Sblocchi idempotenti nella stessa transazione: arrivo su marker (completamento `free`/`quest`, deviazione, salto, teleport, ritorno del soccorso), vittorie di ogni percorso, studio al 50 %, nessuna cascata | VERIFIED | Arrivo: `TravelCompletionService.unlockArrivalGeography` (secondo `updateOne` con add-to-set nello stesso callback, meta da `COMPLETION_PROJECTION` `status.activeTravel.to`; `COMPLETION_UPDATE` e `completionFilter` invariati); `teleportUpdate(poiId, geography)`; `laneClaimUpdate` con `movement.kind === 'jump'` e `geography`; `planRescued` con `cityMarker ? geography : []`. `knowledgeAdditionOf` aggiunge `$addToSet` solo se non vuoto, mai il set dell'intero insieme. Int-spec: arrivo libero, da quest, deviazione d'imboscata, POI del territorio ignorato (si muove, nulla sbloccato), seconda volta idempotente, completamento stantio non scrive, salto e salto su POI, quest con viaggio nulla, teleport e teleport su POI, soccorso con e senza città. Vittorie: `victoryKnowledgeOf` (lore dei nemici del contesto + id esatti, separata da `enemyFactsOf`) passata a `planParticipant` da `planCombatant` (individuale, party/boss, dungeon, soccorritori), `GmCompletionService` (`gmCompleted` con nemici come un `success`) e `planAmbushOutcome`; `won = verdict !== failure`, sconfitta → `victory = null` (nulla). Int-spec: individuale, solo novità sul foglio, solo il nemico esatto, sconfitta nulla, party (ogni vincitore, nessuno se perde), dungeon completa e interrotta alla prima sconfitta, soccorritori, GM con e senza nemici, imboscata vinta (report con `loreUnlocked`, sconfitta nulla). Studio: `ResolutionLoader.readStudyLorePool` (solo `quest.infos.type === study`, `STUDY_LORE_TYPES`, ordinato per id, fuori transazione), `drawRewards` accoda `gate`/`pick` dopo il pet solo con pool non vuoto, `drawStudyLore` (soglia `gate < chance`, pool filtrato contro `unlockedLore` e contro le lore dello stesso esito, clamp del tiro), `LORE_STUDY_CHANCE` solo da `parseLoreConfig` (default 0,5, validato in [0, 1], provider con `ConfigService` opzionale, validato anche in `validateEnv`), `ChanceSource` unica fonte. Int-spec: tiro riuscito, mai città/bestiario, tiro fallito, pool esaurito, nessun tiro consumato senza pool o per altri tipi, chance a 1 |
| 3 | `lores`/`lore(id)` filtrate, `relatedLore` filtrate, `NOT_FOUND` per lore chiusa, `City.relatedLore` null, `Enemy.relatedLore` filtrata, `Quest.infos.relatedLore` intera, innkeeper tutto, `characterUpdated` riemette | VERIFIED | `LoreService.findAll(visibility)` (`_id in` l'insieme; vuoto → `[]`; innkeeper senza filtro) e `findOne` che lancia `ResourceNotFoundException.lore()` prima della query (nessun oracolo); `related-lore.resolvers.ts` (field resolver su `Lore`, `City` → `null` se non visibile o non popolata, `Enemy`; `isResolvedRef` prima della visibilità) registrati in `LoreVisibilityModule`, importato da `LoreModule`, `CitiesModule`, `EnemiesModule`, `QuestsModule`, `QuestResultsModule`, `PendingRequestsModule`; nessun filtro sotto `Quest.infos.relatedLore`. `ViewerKnowledgeService`: innkeeper tutto, nessun personaggio nulla, `activeCharacterById` (morto in attesa del foglio nulla, D-13). Int-spec: giocatore, annidate, NOT_FOUND identico a inesistente, innkeeper, nessun personaggio, enemy; `cities.resolver` e `city-shop.resolver` aggiornati; `character-updated.subscription`: id sul filo, `knownEnemies` mai esposto, personaggio legacy → `[]`, riemissione quando l'insieme cresce |
| 4 | `QuestEnemy.known` per viewer (exact id, innkeeper true), cache per richiesta anche sotto WS; `QuestResult.loreUnlocked: [Lore!]!` sole novità | VERIFIED | `KnownEnemiesResolver` (`knowsEnemy` sull'id esatto, `@CurrentUser`), cache `WeakMap` con chiave `rootValue`-o-contesto (`viewerCacheKeyOf`); int-spec: nemici esatti, innkeeper, nessun personaggio, morto, voci del risultato, una sola lettura per richiesta con molte voci, due eventi WS dello stesso socket con la conoscenza del momento. `loreUnlocked` = `fresh` di `knowledgeUpdateOf` (differenza contro lo snapshot in sessione, deduplicata, ordine nemici poi studio), `@Prop` default `[]`, populate con `Lore`, orfani tolti in place da `dropOrphanResultRefs`, `@Prop` anche in `AmbushReportSnapshot` (i report trattenuti prima della fase → `[]`); int-spec sul foglio con selezione FE `loreUnlocked { id name type }`, vecchio risultato → `[]` |
| 5 | Integration complete, SDL verbatim della FE, handoff `BACKEND-NOTES.md` con l'identità di prova | PARTIAL | Integration e SDL verbatim presenti (elenco sopra; `test/app.int-spec.ts` aggiornato nei blocchi `CharacterStatus`, `QuestEnemy`, `QuestResult`); gate 16-11 verde. L'handoff non esiste ancora (gap documentale) |

**Score:** 5/5 criteri verificati nel codice (il quinto con il solo handoff pendente)

## Contratto FE (REPO-RULES §Schema GraphQL)

| Voce | Stato | Evidenza |
|------|-------|----------|
| `CharacterStatus.unlockedLore: [ID!]!` | OK | SDL + modello |
| `knownEnemies` interno | OK | nessun `@Field`, assente dallo SDL |
| `QuestEnemy.known: Boolean!` per viewer | OK | field resolver su `QuestEnemy` (quest e risultati) |
| `QuestResult.loreUnlocked: [Lore!]!` popolato | OK | populate + int-spec |
| `City.relatedLore` null finché chiusa | OK | `CityRelatedLoreResolver` |
| `lores`/`lore(id)` filtrate con `NOT_FOUND` | OK | `LoreService` |
| `Lore.type: String!` | OK | invariato |
| Nessuna operazione nuova | OK | SDL additivo, 3 righe |

## Requirements Coverage

| Requisito | Stato | Evidenza |
|-----------|-------|----------|
| BE-LORE-01 | SATISFIED (backfill sul DB reale differito) | criterio 1 |
| BE-LORE-02 | SATISFIED | criterio 2, arrivi |
| BE-LORE-03 | SATISFIED | criterio 2, vittorie; `loreUnlocked` criterio 4 |
| BE-LORE-04 | SATISFIED | criterio 2, studio |
| BE-LORE-05 | SATISFIED | criterio 3 |
| BE-LORE-06 | SATISFIED | criterio 4 (`known`) |

I requisiti restano «Pending» in REQUIREMENTS.md: `mark-complete` è del piano 16-12.

## Anti-Patterns

Nessun blocker. Nessun TODO/stub nei file di produzione della fase (letti i moduli lore, il piano dei partecipanti, i servizi di viaggio e il backfill).

## Gaps Summary

Un solo gap, documentale: `BACKEND-NOTES.md` assente (piano 16-12 in corso). Ricontrollare a chiusura del piano che contenga contratto verbatim, identità di prova, trucchi a DB e runbook del boot. Nessun gap di codice; backfill sul DB reale e UAT su device sono differiti e non bloccanti.

---

_Verified: 2026-11-07T13:50:00Z_
_Verifier: Claude (gsd-verifier)_

---

**Nota di ri-verifica dell'orchestratore (2026-11-07T13:49:22Z):** il gap 1 (handoff assente al momento della verifica) è chiuso dai commit del piano 16-12 (`3a6a3ae` handoff, `c5ad3c6` emendamenti e requisiti): `BACKEND-NOTES.md` ha 8 sezioni, il contratto verbatim (`known: Boolean!`, `loreUnlocked { id name type }`, `enemies { quantity known enemy { id name imagePath xp } }`), l'identità di prova (`DEV_AUTH_ROLE=adventurer`), `LORE_STUDY_CHANCE=1`, i trucchi a DB e il runbook del backfill (`Backfill delle lore: `); gli handoff 11 e 9.2 portano l'emendamento del 2026-11-07; BE-LORE-01..06 sono `[x]`. Il criterio 5 passa a VERIFIED; status effettivo: `passed` (la UAT su device FE 17-10 e il boot reale col backfill restano differiti all'orchestratore).
