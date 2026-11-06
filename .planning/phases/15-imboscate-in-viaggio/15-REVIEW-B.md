---
phase: 15-imboscate-in-viaggio
group: B
reviewed: 2026-11-06T20:58:00Z
depth: standard
files_reviewed: 11
files_reviewed_list:
  - src/roads/game-distance.ts
  - src/roads/road-route.ts
  - src/roads/roads.service.ts
  - src/travel/travel-completion.service.ts
  - src/travel/travel-planner.service.ts
  - src/travel/travel-planning.module.ts
  - src/travel/travel-scheduler.service.ts
  - src/travel/travel-timing.ts
  - src/travel/travel.module.ts
  - src/travel/travel.service.ts
  - src/travel/travel.updates.ts
findings:
  critical: 0
  warning: 0
  info: 3
  total: 3
status: issues_found
---

# Phase 15: Code Review Report, gruppo B (viaggio e strade)

## Summary

Rivisti per intero gli 11 file del gruppo (diff `b492a46..d9e0f5f` più contesto di `AmbushPlanner`, `ambush.updates.ts`, `ambush-job.ts`, `enqueue-trigger.ts`, `travel-sweeper.ts`, modello `ActiveTravel`, SDL). Nessun difetto di correttezza o sicurezza raggiungibile. Verificato:

- Partenza (D-05): `withAmbush` è chiamato in `startTravel` dopo `planFree` e fuori dal callback della transazione (un retry per conflitto di scrittura riscrive la stessa imboscata); `preview` non tocca mai `ChanceSource`. `ambush` viaggia nello stesso `startTravelUpdate` (un solo `findOneAndUpdate` condizionale con le guardie del cibo). `schedule` e `scheduleAmbush` partono dopo il commit; un viaggio senza imboscata non scrive il campo (`withAmbush` restituisce il viaggio invariato, nessuna chiave `undefined`).
- Completamento (D-02, D-13): `'status.activeTravel.ambush': null` combacia anche col campo assente; i report diventano `QuestResult` con `create(..., { session, ordered: true })` nella stessa transazione; `travelEnd` invariato e nessun `questEnd`; `COMPLETION_UPDATE` azzera l'intero `activeTravel`, quindi `ambush` e `ambushReports` spariscono insieme.
- Teleport: transazionale, consegna i report, dopo il commit rimuove per identità il `complete` (`travelJobId`) e l'imboscata pendente (`ambushJobId`); la quest standard in corso continua a rifiutare (`STANDARD_LANE_FREE` nel filtro).
- Strade: `gameDistanceKm` è identica alla vecchia `haversineDistance` (R = 127,42, stessa formula), `RoadsService` ne ha tolto il duplicato; `nearestByTime` fa un solo `dijkstra.singleSource`, ordina per id, ripiega sui vertici, restituisce lunghezza e ore zero sullo stesso nodo e `null` senza grafo/nodo/marker raggiungibile; le int-spec coprono parità, ripiego, zero e `null`.
- Scheduler: `scheduleAmbush`/`cancelAmbush` idempotenti per jobId deterministico (Bull ignora il secondo `add`); `cancel` ricostruisce l'id dal solo `startTime`, quindi non può toccare il job dell'imboscata né un altro viaggio.
- Modello e SDL: `ambush`/`ambushReports` sono `@Prop` senza `@Field` con sottoschemi snapshot; `type ActiveTravel` in `src/schema.gql` identico a `develop`.
- Trasversali: nessun `Math.random`/`Date.now()` in `src/travel` e `src/roads` fuori dai test (il caso passa da `ChanceSource`, l'ora da `Clock`); log con soli id/conteggi; rifiuto di fame prima di ogni scrittura (invariato dalla Phase 14).

Restano tre osservazioni di qualità.

## Critical

Nessuno.

## Warning

Nessuno.

## Info

### B-IN-01: consegna dei report trattenuti duplicata fra completamento e teleport

**File:** `src/travel/travel.service.ts:202-208` e `src/travel/travel-completion.service.ts:134-145`
**Issue:** lo stesso blocco (leggi `ambushReports ?? []`, esci se vuoto, `questResultModel.create(ambushResultDraftsOf(reports, characterId), { session, ordered: true })`) vive in due servizi; `TravelService` inietta `QuestResult` solo per questo.
**Why it matters:** la regola D-13 («i report diventano `QuestResult` in transazione, `ordered: true`») deve restare identica nei due percorsi; oggi un cambio in uno solo (per esempio un nuovo campo del draft) divergerebbe in silenzio. Boy Scout Rule.
**Suggested fix:** estrarre in `src/travel/ambush/` (o accanto a `ambush-results.ts`) una funzione `deliverAmbushReports(model, reports, characterId, session)` usata da entrambi; i test esistenti dei due percorsi restano la rete di sicurezza, nessuna spec nuova serve oltre a una unit sulla funzione estratta (RED: «non scrive nulla con zero report, scrive in ordine con `ordered: true`»).

### B-IN-02: `localeCompare` per la parità di `nearestByTime` dipende dal locale

**File:** `src/roads/roads.service.ts:213-215`
**Issue:** l'ordinamento per id usa `a.id.localeCompare(b.id)`. Con id esadecimali minuscoli l'esito è oggi deterministico, ma `localeCompare` dipende dall'ICU/locale del processo e il contratto D-11 è «parità per id».
**Why it matters:** una parità di ore è una regola di gioco (quale città raggiunge il personaggio dopo la sconfitta); un confronto indipendente dal locale la rende riproducibile fra ambienti e con id non esadecimali nei test.
**Suggested fix:** `(a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)`; la spec «breaks a road time tie by id» (`src/roads/roads.service.int-spec.ts:298`) copre già il comportamento.

### B-IN-03: `TravelSweeper` logga «non più valido» a ogni tick per i viaggi con imboscata pendente

**File:** `src/travel/travel-completion.service.ts:119-123` (effetto del filtro a `src/travel/travel.updates.ts:90` con `dueTravelsFilter` a `:161`)
**Issue:** `dueTravelsFilter` non esclude i viaggi con `ambush` pendente, ma `completionFilter` li rifiuta: finché l'imboscata non è risolta (job perso, tentativi in corso) ogni sweep richiama `complete`, apre una transazione e logga «non più valido o non ancora scaduto» con esito `'stale'`. Nessun errore di correttezza.
**Why it matters:** rumore nei log e una transazione a vuoto per tick proprio quando l'operatore sta indagando su un'imboscata bloccata; il messaggio non dice che la causa è l'imboscata.
**Suggested fix:** aggiungere `'status.activeTravel.ambush': null` a `dueTravelsFilter` (la spec di `travel-sweeper` ha già il caso «viaggio scaduto»: aggiungere prima il RED «non seleziona un viaggio con imboscata pendente»), così lo sweep dei viaggi lascia quei casi all'`AmbushSweeper`.

---

_Reviewed: 2026-11-06T20:58:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
