---
phase: 08-travel-lifecycle-travel-01
reviewed: 2026-10-21T21:38:55Z
depth: standard
files_reviewed: 84
files_reviewed_list:
  - .env.example
  - src/app.module.ts
  - src/authz/resource-not-found.exception.spec.ts
  - src/authz/resource-not-found.exception.ts
  - src/characters/deletion/character-deletion.module.ts
  - src/characters/deletion/character-deletion.resolver.int-spec.ts
  - src/characters/deletion/character-deletion.service.ts
  - src/config/env.validation.spec.ts
  - src/config/env.validation.ts
  - src/config/travel-config.spec.ts
  - src/config/travel-config.ts
  - src/gameRules/game-rule-error-code.enum.ts
  - src/gameRules/game-rule.exception.spec.ts
  - src/gameRules/game-rule.exception.ts
  - src/models/character/active-travel.model.ts
  - src/models/character/active-travel.schema.spec.ts
  - src/models/character/character-status.model.ts
  - src/models/common/asset-quantity.model.ts
  - src/models/pending-quest.model.ts
  - src/models/pet.model.ts
  - src/models/quest-lanes.schema.spec.ts
  - src/models/quest/quest-party-slot.model.ts
  - src/models/quest/quest-prizes.model.ts
  - src/models/quest/quest-registration.model.ts
  - src/models/quest/quest-requirements.model.ts
  - src/models/quest/quest.model.ts
  - src/models/request/travel-request.model.ts
  - src/models/travel-preview.model.ts
  - src/mongo/document-id.spec.ts
  - src/mongo/document-id.ts
  - src/quests/acceptance/accept-quest.resolver.int-spec.ts
  - src/quests/acceptance/quest-acceptance.module.ts
  - src/quests/acceptance/quest-acceptance.service.int-spec.ts
  - src/quests/acceptance/quest-acceptance.service.ts
  - src/quests/acceptance/quest-acceptance.updates.spec.ts
  - src/quests/acceptance/quest-acceptance.updates.ts
  - src/quests/acceptance/quest-capacity.spec.ts
  - src/quests/acceptance/quest-capacity.ts
  - src/quests/acceptance/quest-eligibility.spec.ts
  - src/quests/acceptance/quest-eligibility.ts
  - src/quests/quest-catalog.populate.spec.ts
  - src/quests/quest-catalog.populate.ts
  - src/quests/quests.module.ts
  - src/quests/quests.resolver.int-spec.ts
  - src/quests/quests.service.ts
  - src/roads/road-route.spec.ts
  - src/roads/road-route.ts
  - src/roads/roads.module.ts
  - src/roads/roads.resolver.ts
  - src/roads/roads.service.int-spec.ts
  - src/roads/roads.service.ts
  - src/schema.gql
  - src/travel/teleport.resolver.int-spec.ts
  - src/travel/travel-admin.resolver.ts
  - src/travel/travel-completion.int-spec.ts
  - src/travel/travel-completion.processor.int-spec.ts
  - src/travel/travel-completion.processor.ts
  - src/travel/travel-completion.service.ts
  - src/travel/travel-job.spec.ts
  - src/travel/travel-job.ts
  - src/travel/travel-planner.service.ts
  - src/travel/travel-planning.int-spec.ts
  - src/travel/travel-planning.module.ts
  - src/travel/travel-rules.spec.ts
  - src/travel/travel-rules.ts
  - src/travel/travel-scheduler.service.ts
  - src/travel/travel-sweeper.spec.ts
  - src/travel/travel-sweeper.ts
  - src/travel/travel-timing.spec.ts
  - src/travel/travel-timing.ts
  - src/travel/travel.module.ts
  - src/travel/travel.resolver.int-spec.ts
  - src/travel/travel.resolver.ts
  - src/travel/travel.service.int-spec.ts
  - src/travel/travel.service.ts
  - src/travel/travel.updates.spec.ts
  - src/travel/travel.updates.ts
  - test/app.int-spec.ts
  - test/fixtures/index.ts
  - test/fixtures/pet.fixture.ts
  - test/fixtures/quest.fixture.ts
  - test/travel/active-travel.fixture.ts
  - test/travel/fake-travel-queue.ts
  - test/travel/travel-world.ts
findings:
  critical: 0
  warning: 2
  info: 8
  total: 10
status: issues_found
---

# Phase 8: Code Review Report

**Reviewed:** 2026-10-21T21:38:55Z
**Depth:** standard
**Files Reviewed:** 84
**Status:** issues_found

## Summary

Revisione a profondità standard dei 84 file del branch `feat/08-travel-lifecycle-travel-01` rispetto a `develop` (`e5786eb`), letti per intero e confrontati con le decisioni bloccate D-01..D-32 del CONTEXT di fase. Priorità al codice di produzione del modulo `src/travel/`, all'estensione di `QuestAcceptanceService`, al populate del catalogo e al rilascio dei posti nella cancellazione; gli spec sono stati scorsi per pattern fragili e per copertura rispetto a D-22.

Valutazione complessiva: **solida**. Le regole di gioco sono riaffermate nei filtri degli update condizionali ("il filtro è la regola"): `startTravelFilter` (attivo, `activeTravel` nullo, `pendingQuest` nulla, posizione uguale allo snapshot), `completionFilter` (identità `startTime`+`endTime` e `endTime <= now`), `teleportFilter`, `laneClaimFilter` con la guard `TRAVEL_IN_PROGRESS` di D-06, `registrationFilter` con `$expr` specchio esatto di `hasSeatFor` (D-32). Le corse concorrenti sono coperte da test di integrazione reali (due `startTravel`, tre accettazioni, completamento vs sweep vs job). Il payload del job Bull è trattato come input non fidato (`travelJobDataOf`), il job anticipato non scrive nulla, il processor non ri-accoda. Nessun segreto in repo, `.env.example` aggiornato, `validateEnv` estesa. I log portano solo id, codici o nomi di errore (mai messaggi grezzi, mai nomi utente o token). Ownership e ruoli corretti: `startTravel`/`travelPreview` owner-only, `teleportCharacter` innkeeper con audit automatico, whitelist del boot reale aggiornate, SDL additivo con le tre eccezioni dichiarate (D-20) verificate in `test/app.int-spec.ts`. Nessuna mutation permette a un client di scrivere `status.activeTravel` (`CharacterInput` non è usato da alcun resolver; i Pet sono sola lettura).

Nessun rilievo critico. Due **warning** riguardano la robustezza verso dati di catalogo difettosi, scenario reale perché le quest a DB vengono adattate a mano (D-28): il filtro degli orfani del populate lascia passare un `item` non popolato quando `itemType` manca (annullando la lista `quests`, contro D-31), e il viaggio automatico "salta" su un POI inesistente se il `markerLocation` della quest è un riferimento pendente, rendendo il personaggio non serializzabile. Gli otto **info** sono miglioramenti di chiarezza, diagnostica e pulizia (semantica dello stesso nodo in `routeBetween`, job anticipato con sweep spento, `removeOnFail` senza TTL, duplicazioni di `Clock` e di `codeOf`, export inutilizzato, commenti legacy, codice di rifiuto fuorviante dopo un teleport concorrente).

## Warnings

### WR-01: `isResolved` accetta un `item` non popolato quando `itemType` manca, e la lista `quests` muore sul filo

**File:** `src/quests/quest-catalog.populate.ts:28`
**Issue:** `isResolved` controlla solo `entry.item != null`. Se un `AssetQuantity` a DB non ha `itemType` (campo `required` nello schema, ma le quest vengono editate a mano, D-28), Mongoose 8.18.1 non popola quel path: `modelNamesFromRefPath` restituisce `[undefined]`, il documento non entra in nessuna mappa di populate e `item` resta un `ObjectId` grezzo. Il filtro lo considera "risolto"; sul filo `ItemUnion.resolveType` lo classifica `LootItem` e la risoluzione dei campi non-null fallisce. Per `prizes.prizeItem` (nullable) l'effetto è un `errors[]` con `prizeItem: null`; per `requirements.recommendedLoot: [AssetQuantity!]!` (o `prizes.randomLoot`) l'errore risale fino a `quests: [Quest!]!` e **annulla l'intera lista**, esattamente ciò che D-31 vieta ("mai un errore che annulli la lista `quests`"). Il test `keeps the list alive on orphan refs` copre solo gli orfani con `itemType` valido.
**Fix:** considerare risolto solo un documento effettivamente popolato, e aggiungere il caso "senza `itemType`" allo spec e all'integration test:
```ts
import { Types } from 'mongoose';

// popolato = documento, non un ref grezzo rimasto tale perché itemType manca (refPath irrisolto)
const isResolved = (entry: CatalogItemEntry): boolean =>
    entry.item != null &&
    typeof entry.item === 'object' &&
    !(entry.item instanceof Types.ObjectId);
```

### WR-02: il viaggio automatico "salta" su un POI inesistente quando il `markerLocation` della quest è un riferimento pendente

**File:** `src/travel/travel-planner.service.ts:128-141` (chiamato da `src/quests/acceptance/quest-acceptance.service.ts:204-213`)
**Issue:** `planAuto` tratta allo stesso modo "nessuna strada" e "POI non trovato": se `poiLocationOf(request.to)` restituisce `null` (il marker è nei `pointsOfInterest` della città ma il documento `PointOfInterest` non esiste — `locationInQuestCity` verifica solo l'appartenenza alla città, non l'esistenza del POI), `route` è `null` e il chiamante produce un `LaneMovement` di tipo `jump` che scrive `status.location = marker` **inesistente**. D-03 riserva il salto istantaneo al caso "nessun percorso", non a un catalogo difettoso. Effetto: `status.location` pendente, `populate` lo risolve `null`, e `CharacterStatus.location: PointOfInterest!` fa fallire `character(id)` e `characterUpdated` per quel personaggio (stato invalido scritto da un percorso di gioco, contro "un rifiuto non scrive nulla" e il principio fail-closed di Phase 7 D-09). Il caso `from` mancante è invece benigno (il salto ripara una posizione pendente).
**Fix:** distinguere la meta mancante dall'assenza di strada e rifiutare senza scrivere, con WARN del solo id (stesso pattern di `costOrReject`/`seatRuleOrReject`):
```ts
// travel-planner.service.ts, planAuto
const [from, to] = await Promise.all([
    this.poiLocationOf(request.from),
    this.poiLocationOf(request.to),
]);
if (!to) {
    this.logger.warn(
        `Marker ${request.to.toHexString()} della missione ${request.questId.toHexString()} inesistente: accettazione rifiutata`,
    );
    throw GameRuleException.questNotAcceptable(); // oppure ResourceNotFoundException.pointOfInterest()
}
const route = from ? this.roads.routeBetween(from.location, to.location) : null;
```
Aggiungere l'integration test "marker della quest senza documento POI → `QUEST_NOT_ACCEPTABLE`, nessuna scrittura" in `quest-acceptance.service.int-spec.ts`.

## Info

### IN-01: `routeBetween` confonde "stesso nodo" con "nessun percorso"

**File:** `src/roads/roads.service.ts:204`
**Issue:** `if (!start || !end || start === end) return null;` — due POI distinti che agganciano (snap entro 5 km) lo stesso nodo del grafo producono `null`, cioè `TRAVEL_NO_PATH` per il viaggio libero ("Nessuna strada porta a questa meta", pur essendoci) e, per l'accettazione quest, un salto istantaneo con il WARN "Nessuna strada dal luogo…" a ogni accettazione. Sui dati reali i marker intra-città delle quest raramente sono nodi stradali, quindi il WARN di D-03 (pensato per un caso che "non dovrebbe esistere") rischia di diventare rumore sistematico. Comportamento dichiarato nel commento e nel test `answers null when start and end snap to the same node`, dunque non un bug: segnalato per il handoff (D-07, durate reali) e per la Phase 9.
**Fix:** restituire un esito distinto per lo stesso nodo (es. `{ kind: 'adjacent' }` o una `RoadRoute` a due punti con `baseHours: 0`) e nel planner trattarlo come "già arrivato" senza WARN; oppure documentare esplicitamente nel BACKEND-NOTES che i marker delle quest devono essere nodi stradali distinti dal marker della città.

### IN-02: job anticipato con `TRAVEL_SWEEP_INTERVAL_MS=0` lascia il viaggio in sospeso fino al prossimo boot

**File:** `src/travel/travel-completion.processor.ts:33-38`
**Issue:** un job che scatta prima di `endTime` viene chiuso con il log "lo completerà lo sweep" e, per scelta (C10), mai ri-accodato. Con lo sweep periodico spento il viaggio resta `activeTravel` oltre `endTime` fino al reconciler del boot successivo. Con `SystemClock` il caso è raro (il delay è calcolato dopo `clock.now()`, quindi il fire avviene a `>= endTime` salvo regressione dell'orologio), ma il contratto dichiarato in `.env.example` ("0 = sweep periodico spento") non avverte di questa dipendenza.
**Fix:** o ri-accodare una sola volta con `delay = endTime - now` e un `jobId` distinto (es. suffisso `-retry`), oppure aggiungere la riga in `.env.example` e nel BACKEND-NOTES: "con 0, un job anticipato viene completato solo al boot".

### IN-03: `removeOnFail: false` senza `attempts` né TTL accumula job falliti e blocca un `add` con lo stesso id

**File:** `src/travel/travel-scheduler.service.ts:43-44`
**Issue:** un job che fallisce (es. Mongo irraggiungibile al fire) resta nel set `failed` per sempre; con il `jobId` deterministico un successivo `queue.add` dello stesso id viene ignorato silenziosamente da Bull. In pratica un nuovo viaggio dello stesso personaggio ha un `startTime` diverso, quindi la collisione è teorica, ma l'accumulo in Redis è reale ed è lo stesso Redis con la policy di eviction segnalata come blocker in STATE.
**Fix:** `removeOnFail: { age: 7 * 24 * 3600 }` (Bull 4 accetta `KeepJobs`) oppure un `attempts: 2` con `backoff` fisso; in alternativa documentare la pulizia manuale della coda `travel` nel handoff.

### IN-04: lo scheduler scarta ogni dettaglio dell'errore; `codeOf` è un helper locale duplicabile

**File:** `src/travel/travel-scheduler.service.ts:47-51, 60-64`; `src/travel/travel-sweeper.ts:26-32`
**Issue:** i due `catch {}` dello scheduler loggano solo il `jobId`: un Redis in errore (`ECONNREFUSED`, `NOAUTH`, `OOM`) è indistinguibile nei log, mentre lo sweeper ha già un `codeOf(error)` che espone codice o nome senza messaggi grezzi. La funzione vive però come privata del file dello sweeper, accanto a `describeError` di `src/mongo/mongo-errors.ts` e `describePushError` di `src/push/push-delivery.ts`.
**Fix:** estrarre `codeOf` in `src/mongo/mongo-errors.ts` (o in un `src/common/error-code.ts`) e usarlo nei `catch (error)` dello scheduler: `` `Accodamento del viaggio ${jobId} fallito (${codeOf(error)}): lo completerà lo sweep` ``.

### IN-05: provider `Clock` registrato tre volte

**File:** `src/travel/travel.module.ts:43`; `src/travel/travel-planning.module.ts:39`; `src/quests/acceptance/quest-acceptance.module.ts:37`
**Issue:** `{ provide: Clock, useClass: SystemClock }` è ripetuto in tre moduli (e già in `ServerTimeModule`): tre istanze distinte, e ogni nuovo modulo che usa il tempo deve ricordarsi la riga. I test funzionano perché `overrideProvider(Clock)` sostituisce tutte le registrazioni, ma è un accoppiamento implicito.
**Fix:** un `ClockModule` (`@Global()` o importato esplicitamente) che esporta `Clock`, importato da `TravelModule`, `TravelPlanningModule`, `QuestAcceptanceModule`, `ServerTimeModule`.

### IN-06: `isFullForEveryone` non ha chiamanti in produzione

**File:** `src/quests/acceptance/quest-capacity.ts:55-62`
**Issue:** la funzione è esportata e testata ma usata solo da `quest-capacity.spec.ts`. Serve come riferimento condiviso con il FE per la regola "strappata per tutti" (D-29/D-32), ma come codice di produzione è morto.
**Fix:** o usarla in `classifyEligibility` come fast-path prima di `hasSeatFor` (stesso esito, intenzione più leggibile), o spostarla nel test/handoff con un commento che ne dichiari il ruolo di specifica per il FE.

### IN-07: commenti legacy sugli import in `RoadsService`

**File:** `src/roads/roads.service.ts:4, 10`
**Issue:** "Assicurati che questi import siano corretti per i tuoi modelli e librerie" e "Assumi che questo sia corretto" sono residui di generazione; il file è stato toccato in questa fase (formattazione, `routeBetween`), quindi vale la Boy Scout Rule del CLAUDE.md.
**Fix:** rimuovere i due commenti.

### IN-08: dopo un teleport concorrente `startTravel` risponde `TRAVEL_IN_PROGRESS` a chi non è in viaggio

**File:** `src/travel/travel.updates.ts:57`
**Issue:** `classifyUnstarted` ripiega su `travelInProgress()` quando la rilettura non mostra né viaggio né quest: è il caso della posizione cambiata da un teleport dell'innkeeper tra la pianificazione e la scrittura. Il messaggio "Sei già in viaggio" è falso per l'utente, che però al retry riesce. Scelta documentata nel commento ("movimento concorrente"), quindi solo una nota.
**Fix:** se si vuole un codice fedele senza nuovi codici FE: restituire `travelSameLocation()` quando `fresh.status.location` coincide con la meta richiesta, altrimenti mantenere `travelInProgress()`; richiede di passare `poiId` a `classifyUnstarted`.

---

_Reviewed: 2026-10-21T21:38:55Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
