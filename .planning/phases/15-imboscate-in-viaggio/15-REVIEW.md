---
phase: 15-imboscate-in-viaggio
reviewed: 2026-11-06T21:00:13Z
depth: standard (tre reviewer paralleli per area: A modulo delle imboscate, B viaggio e strade, C quest, modelli, push, config)
files_reviewed: 50
files_reviewed_list:
  - src/app.module.ts
  - src/config/ambush-config.ts
  - src/config/env.validation.ts
  - src/models/character/active-travel.model.ts
  - src/models/character/ambush-snapshot.model.ts
  - src/models/character/character.model.ts
  - src/models/enums/quest-result-kind.enum.ts
  - src/models/quest-result/quest-result.model.ts
  - src/push/push-event-type.enum.ts
  - src/push/push-events.ts
  - src/quests/acceptance/quest-acceptance.service.ts
  - src/quests/generation/enemy-pool.ts
  - src/quests/generation/quest-composition.ts
  - src/quests/outcomes/combatant-plan.ts
  - src/quests/outcomes/outcome-plan.ts
  - src/quests/outcomes/quest-outcomes.module.ts
  - src/quests/outcomes/resolution-loader.service.ts
  - src/quests/results/quest-result.populate.ts
  - src/roads/game-distance.ts
  - src/roads/road-route.ts
  - src/roads/roads.service.ts
  - src/schema.gql
  - src/travel/ambush/ambush-clock.ts
  - src/travel/ambush/ambush-detour.ts
  - src/travel/ambush/ambush-draw.ts
  - src/travel/ambush/ambush-enemies.ts
  - src/travel/ambush/ambush-job.ts
  - src/travel/ambush/ambush-plan.ts
  - src/travel/ambush/ambush-planner.service.ts
  - src/travel/ambush/ambush-point.ts
  - src/travel/ambush/ambush-resolution.service.ts
  - src/travel/ambush/ambush-results.ts
  - src/travel/ambush/ambush-rules.ts
  - src/travel/ambush/ambush-sweeper.ts
  - src/travel/ambush/ambush.module.ts
  - src/travel/ambush/ambush.processor.ts
  - src/travel/ambush/ambush.updates.ts
  - src/travel/ambush/level-bands.ts
  - src/travel/travel-completion.service.ts
  - src/travel/travel-planner.service.ts
  - src/travel/travel-planning.module.ts
  - src/travel/travel-scheduler.service.ts
  - src/travel/travel-timing.ts
  - src/travel/travel.module.ts
  - src/travel/travel.service.ts
  - src/travel/travel.updates.ts
  - test/quests/outcome-world.ts
  - test/quests/quest-result.fixture.ts
  - test/travel/ambush-report.fixture.ts
  - test/travel/ambush-world.ts
findings:
  critical: 0
  warning: 1
  info: 8
  total: 9
status: issues_found
---
# Code review — Phase 15 Imboscate in viaggio (fusione dei gruppi A, B, C)

I due report di gruppo (`15-REVIEW-A.md`, `15-REVIEW-B.md`) restano la fonte; questo file li fonde per severità.

## Summary

### Gruppo A
Rivisti per intero i 16 file del modulo (HEAD `d9e0f5f`), con lettura incrociata di `outcome-writer.service`, `wallet.service`, `enqueue-trigger`, `travel-scheduler.service`, `travel-planning.module`, `party-abandon.service`, `active-travel.model`, `push.service`. Il modulo è solido e aderente a D-01..D-25.

Verificato senza trovare difetti:
- Sorteggio: km interi `fromKm+1 … ⌈distance⌉−1`, un solo `chance.next()` per km, nessun tiro con `durationMs ≤ 0` o sotto soglia (10 km alla partenza, 10 km residui dopo una vittoria), `at < endTime` garantito da `km < distance`. L'ora locale viene solo dal formatter `Intl` con `hourCycle h23`, senza `Date.now` né `Math.random`.
- Punto: `pointAtFraction` planare come il FE, con tratti di lunghezza zero gestiti (niente NaN). `nearestPoi` con parità per id. La polilinea residua `[point, ...slice(max(segment,1))]` non perde né duplica vertici.
- Nemici: pool zona + animali + `all` di riserva, fascia e tetto da `xpBandOf`, pool non componibile → `skip` con risorteggio.
- Risoluzione: filtro d'identità (`startTime` + `ambush.at` con `at ≤ now`) in ogni update, anche nello skip. Composizione, catalogo, proprietario, rotta e risorteggio stanno fuori dalla transazione. Combattimento e scritture stanno in una sola transazione, con `outcome.plan` azzerato a ogni retry. HP fra 1 e il massimo via `lifePointsWithin`, titolo fermo, monete in sessione. Push, job e recuperi delle magie vengono dopo il commit; in vittoria non parte alcun push.
- Sconfitta: `activeTravel` riscritto `kind: free` con i report trattenuti più il nuovo, senza `ambush`, `awaitingAid` mai scritto, corsia abbandonata nella stessa transazione, `cancel` del vecchio `complete` e nuovo `schedule`, push a ogni sconfitta (non lancia: `sendToUser` cattura).
- Trigger: il processor valida i dati non fidati (`isEpochMs`, `startTime ≤ at`) e scarta gli `at` futuri. Lo sweeper è single-flight, in serie, non atteso al boot. `AmbushModule` è montato in `AppModule` e non è importato da `TravelModule`. Gli errori di accodamento sono inghiottiti da `enqueueTrigger`, quindi i post-commit non producono falsi tentativi.
- Report: mappatura pura corretta (`kind: ambush`, `quest: null`, `stagesCleared/stagesTotal: null`, `rescuedCharacters: []`, `resolvedAt = at`).

Un warning (poison pill nello sweeper) e tre info di manutenibilità. Nessun critical.

### Gruppo B
Rivisti per intero gli 11 file del gruppo (diff `b492a46..d9e0f5f` più contesto di `AmbushPlanner`, `ambush.updates.ts`, `ambush-job.ts`, `enqueue-trigger.ts`, `travel-sweeper.ts`, modello `ActiveTravel`, SDL). Nessun difetto di correttezza o sicurezza raggiungibile. Verificato:

- Partenza (D-05): `withAmbush` è chiamato in `startTravel` dopo `planFree` e fuori dal callback della transazione (un retry per conflitto di scrittura riscrive la stessa imboscata); `preview` non tocca mai `ChanceSource`. `ambush` viaggia nello stesso `startTravelUpdate` (un solo `findOneAndUpdate` condizionale con le guardie del cibo). `schedule` e `scheduleAmbush` partono dopo il commit; un viaggio senza imboscata non scrive il campo (`withAmbush` restituisce il viaggio invariato, nessuna chiave `undefined`).
- Completamento (D-02, D-13): `'status.activeTravel.ambush': null` combacia anche col campo assente; i report diventano `QuestResult` con `create(..., { session, ordered: true })` nella stessa transazione; `travelEnd` invariato e nessun `questEnd`; `COMPLETION_UPDATE` azzera l'intero `activeTravel`, quindi `ambush` e `ambushReports` spariscono insieme.
- Teleport: transazionale, consegna i report, dopo il commit rimuove per identità il `complete` (`travelJobId`) e l'imboscata pendente (`ambushJobId`); la quest standard in corso continua a rifiutare (`STANDARD_LANE_FREE` nel filtro).
- Strade: `gameDistanceKm` è identica alla vecchia `haversineDistance` (R = 127,42, stessa formula), `RoadsService` ne ha tolto il duplicato; `nearestByTime` fa un solo `dijkstra.singleSource`, ordina per id, ripiega sui vertici, restituisce lunghezza e ore zero sullo stesso nodo e `null` senza grafo/nodo/marker raggiungibile; le int-spec coprono parità, ripiego, zero e `null`.
- Scheduler: `scheduleAmbush`/`cancelAmbush` idempotenti per jobId deterministico (Bull ignora il secondo `add`); `cancel` ricostruisce l'id dal solo `startTime`, quindi non può toccare il job dell'imboscata né un altro viaggio.
- Modello e SDL: `ambush`/`ambushReports` sono `@Prop` senza `@Field` con sottoschemi snapshot; `type ActiveTravel` in `src/schema.gql` identico a `develop`.
- Trasversali: nessun `Math.random`/`Date.now()` in `src/travel` e `src/roads` fuori dai test (il caso passa da `ChanceSource`, l'ora da `Clock`); log con soli id/conteggi; rifiuto di fame prima di ogni scrittura (invariato dalla Phase 14).

Restano tre osservazioni di qualità.

### Gruppo C
Gruppo C riletto per intero contro il diff `b492a46..d9e0f5f`. Nessun finding critico né warning. Verificato punto per punto:

- **Composizione e pool (D-06..D-08, D-22):** `composeEnemies` estratta senza cambiare l'ordine dei tiri (il tiro della forma resta il primo, `budgetOf` non tira); `composeEnemyQuest` è un wrapper. `PoolOptions` ha default `GENERATED_POOL_OPTIONS` (animali esclusi) quindi le quest generate non cambiano; i leggendari restano esclusi in `isPoolable` anche con `animals: 'included'`.
- **Catalogo (D-09):** `readCombatCatalog` è il cuore di `readCatalog`; l'unica differenza è l'ordine delle letture (catalogo premi dopo `readSpellMaxUsages`), innocua perché sono letture. `woundsAfter`, `consumablesSpent`, `sellLine`, `spellsSpent` sono solo esportate, nessuna duplicazione. `QuestOutcomesModule` esporta `CombatResolver`, `ChanceSource`, `ResolutionLoader`.
- **Modello e SDL (D-14, D-23):** `kind` con default `quest`, `quest` required se `kind !== 'ambush'`, `ambush` required se `kind === 'ambush'`; i risultati sono letti idratati (mai `lean`, tranne l'acknowledgement che non legge `kind`), quindi un documento legacy senza `kind` si legge `quest`. `src/schema.gql` differisce da `develop` per la sola riga tolta `quest: QuestResultQuest!` e per le righe attese; `test/app.int-spec.ts` ha la stringa esatta aggiornata. Nessun consumatore in `src/` assume `quest` non nullo sui risultati.
- **Push (D-12):** voce di catalogo con corpo generico per `testPushMessage`, builder che sovrascrive `body`, `IDENTIFIED_TYPES` aggiornato, `ttlSeconds` uguale a `travelEnd`; payload con solo id del personaggio e nome della città; `PushService.sendToUser` non lancia mai, quindi `scheduler.cancel/schedule` dopo il push non sono a rischio.
- **Config (D-04):** valore non valido rifiuta il boot con messaggio che non ripete il valore; canonica via `resolvedOptions`; `ambushConfigProvider` registrato una sola volta (`TravelPlanningModule`); `.env.example` ha solo il blocco nuovo; nessun `process.env` nuovo sotto `src/` (l'unico residuo, `src/migrations/run-mixed-refs.ts`, non è nel diff).
- **Indici (D-19):** `character_active_travel_ambush` nel modello, nello spec degli sweep a stringa esatta e in `EXPECTED_INDEXES` del verifier; nessun duplicato.
- **Accettazione:** il sorteggio avviene solo sul viaggio reale (`movementTo`), dopo `classifyEligibility`/città e prima della transazione; un rifiuto non scrive nulla (il caso mangia-niente su rifiuto resta come in Phase 14: `fedOrReject` prima dei punti, pasto in sessione dentro la transazione). Il job dell'imboscata è accodato dopo il commit, best effort, come il job di fine viaggio.
- **`app.module.ts`:** `AmbushModule` in `AppModule`, non in `TravelModule`; nessun import circolare nuovo a livello di file (`ambush-snapshot.model` importa da `quest-result.model`, che non importa il modello del personaggio).
- **Fixture:** nessun `jest.mock(`, nessuna rete, nessun `Math.random`/`Date.now`/URI; builder deterministici; `buildQuestResult` ha `kind: 'quest'`. Le strade R2 (4,4 km) e R3 (8,9 km) sono sotto i 10 km per scelta dichiarata (D-03), R1 è 20 km.

Restano due note di qualità, nessuna raggiungibile come bug.

## Critical

### Gruppo A

Nessuno.

### Gruppo B

Nessuno.

### Gruppo C

Nessuno.

## Warning

### Gruppo A

### A-WR-01: `recordFailure` fuori dal try/catch interrompe lo sweep per tutti i personaggi successivi

**File:** `src/travel/ambush/ambush-sweeper.ts:97-106`
**Issue:** Il `try/catch` del ciclo protegge solo `resolution.resolve`. Se `recordFailure` lancia a sua volta (riga 104), l'eccezione esce da `runOnce` e abbandona il ciclo: i personaggi rimasti in `due` non vengono risolti in quel tick. `sweepSafely` la logga come «Sweep delle imboscate fallito», ma non ha contato nulla sul personaggio responsabile.
**Why it matters:** Scenario concreto: un documento con `status.activeTravel.ambush.attempts` non numerico (dato corrotto o scritto a mano). `resolve` lancia, poi `AMBUSH_ATTEMPT_UPDATE` (`$inc`) fallisce con errore Mongo sul tipo non numerico. Il personaggio resta in testa a `due` a ogni sweep, quindi tutte le imboscate successive nell'elenco non si risolvono più. Questo contraddice il fail-open di D-18 («un errore non transitorio non blocca il viaggio per sempre»): il contatore dei tentativi non può avanzare proprio dove serve. Lo stesso vale per un `updateOne` del terzo errore che fallisce.
**Suggested fix:** Isolare il fallimento della registrazione, così il ciclo prosegue sempre:
```ts
} catch (error) {
    try {
        await this.recordFailure(character, error, now);
    } catch (recordError) {
        this.logger.error(
            `Imboscata ${jobIdOf(identityOf(character))}: registrazione del fallimento non riuscita: ${describeError(recordError)}`,
        );
    }
}
```
Spec RED da scrivere prima, in `ambush-sweeper` (unit con `characterModel` e `resolution` finti): due imboscate scadute, `resolve` lancia per la prima e `updateOne` lancia a sua volta; atteso che `resolve` venga comunque chiamato per la seconda e che `sweep()` si risolva (non rifiuti). Per chiudere il caso corrotto serve anche una via d'uscita dal dato corrotto: nel ramo `attempts < 3`, se `$inc` non è applicabile, il contatore non potrà salire mai. Valutare di scrivere `$set` di `attempts` con il valore calcolato (`attempts`) invece di `$inc`, già con identità riaffermata nel filtro.

### Gruppo B

Nessuno.

### Gruppo C

Nessuno.

## Info

### Gruppo A

### A-IN-01: lo skip per pool non componibile o senza città vicina è silenzioso

**File:** `src/travel/ambush/ambush-resolution.service.ts:234-236` e `:242-244`
**Issue:** I tre rami che portano a `skip` senza effetto (composizione `null`, `nearCity` assente, catalogo senza nemici) non loggano il motivo; solo il ramo «senza proprietario» (riga 229) lo fa. Il log finale dice soltanto `risolta: skipped`.
**Why it matters:** Una zona con bestiario vuoto o con i POI senza città produce imboscate sorteggiate che non succedono mai, e dai log non si distingue dal ramo «senza proprietario». Costo di diagnosi in produzione, nessun effetto sui dati.
**Suggested fix:** Un `logger.warn` per ramo con soli id/conteggi (`jobId`, `place.poiTypes.length`, `catalog.enemies.length`), mai documenti interi. Oppure un parametro `reason` a `skip` che entra nel log finale.

### A-IN-02: `ambush-resolution.service.ts` concentra troppe responsabilità (532 righe, `fight` ~85 righe)

**File:** `src/travel/ambush/ambush-resolution.service.ts:97-165` e `:374-461`
**Issue:** Nello stesso file convivono le funzioni pure di geografia (`nearCityOf`, `markerTargetsOf`, `cityOf`, `enemyEntriesOf`), il servizio, il sotto-flusso di deviazione (`detourOf`) e la transazione di combattimento. `fight` fa lettura in sessione, costruzione del contesto, combattimento, piano, scrittura, abbandono della corsia e wallet in un callback unico.
**Why it matters:** Manutenibilità (SoC, Boy Scout): le funzioni pure di geografia sono testabili senza Nest ma oggi si raggiungono solo via servizio, e un callback lungo rende fragile il vincolo «tutto ripartibile dal retry».
**Suggested fix:** Estrarre `nearCityOf`/`markerTargetsOf`/tipi `Lean*` in `ambush-geography.ts` con spec unit proprie; opzionale un metodo privato `fightInSession(session, fight)` che restituisce il piano. Refactor solo dopo che il gate è verde (nessuna modifica di comportamento).

### A-IN-03: controllo ridondante e throw generico in `planAmbushOutcome`

**File:** `src/travel/ambush/ambush-plan.ts:315-322`
**Issue:** Dopo il guard `if (!won && !input.detour) throw …` la condizione `if (!won && input.detour)` a riga 320 è sempre vera per `!won`; è solo un narrowing per TypeScript. Inoltre l'errore è un `Error` generico senza il contesto del personaggio.
**Why it matters:** Lieve confusione di lettura (sembra un ramo con un'alternativa che non esiste) e diagnosi povera se il chiamante sbaglia.
**Suggested fix:** Riscrivere in forma lineare:
```ts
if (won) return victoryPlanOf(input, fought, report);
if (!input.detour) throw new Error('ambush defeat needs the reached city');
return defeatPlanOf(input, input.detour, fought, report);
```
con `victoryPlanOf` estratta dal blocco finale.

---

_Reviewed: 2026-11-06T21:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

### Gruppo B

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

### Gruppo C

### C-IN-01: `ChanceSource` legato due volte con istanze diverse in produzione

**File:** `src/travel/travel-planning.module.ts:57` (provider) e `src/quests/outcomes/quest-outcomes.module.ts:98` (commento + export)
**Issue:** il commento aggiunto in `QuestOutcomesModule` dice «la stessa porta del motore per quest e imboscate: il binding cambia in un solo posto», ma `AmbushPlanner` (sorteggio alla partenza, iniettato in `QuestAcceptanceService` e nel viaggio libero) riceve il `ChanceSource` di `TravelPlanningModule`, cioè un secondo `{ provide: ChanceSource, useClass: MathChanceSource }`, mentre risoluzione e composizione dei nemici usano quello di `QuestOutcomesModule`. In produzione sono due istanze di `MathChanceSource` senza stato, quindi nessun effetto; il binding però vive in due posti e il commento è inesatto. Nei test l'override per token li copre entrambi, per questo non emerge.
**Why it matters:** chi un giorno sostituisse il binding in `QuestOutcomesModule` (per esempio una sorgente seedabile) lascerebbe il sorteggio della partenza sul vecchio, e le spec a seme fisso dell'imboscata sarebbero parziali senza accorgersene.
**Suggested fix:** o correggere il commento («il motore di combattimento e la composizione; il sorteggio della partenza ha il suo binding in `TravelPlanningModule`»), o far importare a `TravelPlanningModule` un modulo piccolo che possieda `ChanceSource` e lo esporti. Nessuna spec RED necessaria per la correzione del commento; per il refactor basta lo spec esistente sull'override.

### C-IN-02: `AMBUSH_TIMEZONE` accetta anche un offset fisso, non solo un nome IANA

**File:** `src/config/ambush-config.ts:25-33`
**Issue:** `new Intl.DateTimeFormat('en-US', { timeZone: raw })` su Node recenti accetta anche offset come `+02:00`; `resolvedOptions().timeZone` restituisce l'offset così com'è. Il messaggio d'errore e il commento parlano di «IANA time zone», ma un offset passa la validazione e produrrebbe una notte (22–06) senza ora legale.
**Why it matters:** configurazione sbagliata che sposta silenziosamente la fascia notturna di un'ora per metà anno; non è un bug raggiungibile con il default.
**Suggested fix:** rifiutare i valori che non sono nomi di regione, per esempio con `if (/^[+-]\d/.test(timeZone)) throw`, scrivendo prima la spec RED in `src/config/ambush-config.spec.ts` (`AMBUSH_TIMEZONE='+02:00'` deve lanciare con il messaggio senza il valore); oppure documentare in `.env.example` che gli offset sono ammessi.

---

_Reviewed: 2026-11-06T20:58:30Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
