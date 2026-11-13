---
phase: 20-cibo-e-vita-progressivi
reviewed: 2026-11-12
depth: deep
status: issues_found
findings:
  critical: 0
  warning: 2
  info: 13
  total: 15
---

# Phase 20 — Code review

Due revisori in sola lettura per area sul diff `466be7e7..bbb155e3` (A: logica pura del cibo, modello, sweep; B: cablaggio nei servizi). I ruling dell'orchestratore sono in fondo.

## Phase 20 BE — Review area A (logica pura del cibo, modello, sweep)

- Repo: `/Users/lucatabbia/Personale/Code/Klimmeck-Guide-BE/Klimmeck-Guide-BE`, branch `feat/20-cibo-e-vita-progressivi`, diff `466be7e7..HEAD`
- Profondità: deep (lettura integrale dei file dell'area + chiamanti: `travel-completion.service.ts`, `travel.updates.ts`, `ambush-food.ts`, `ambush.updates.ts`, `trade-inventory.ts`, `food-selection.ts`, `status-facts.ts`, `character-changes.pipeline.ts`)
- Sola lettura: nessun file del repo toccato, nessun jest/tsc/build/lint lanciato, `.env` mai letto. Nulla di quanto segue è stato eseguito: «VERIFICATO» significa «verificato leggendo il codice».
- Esito: **0 critici, 1 warning, 6 info**

---

## Warning

### A-WR-01 — Un documento malformato lancia fuori dal `try` e ferma la fame di tutti gli altri

**File:** `src/travel/food/travel-food.sweep.ts:83-93` (causa a `src/travel/travel-timing.ts:81`)

**VERIFICATO.** In `settleSafely` il `try` comincia alla riga 94, ma la riga 93 esegue già `reachedKmOf(travel, now)` → `travelKmAt` → `travel.startTime.getTime()`. `foodLegOf` (riga 85) valida `road.distance`, `duration` e il piano, **non** `startTime`. Se `startTime` non è un `Date` l'eccezione esce da `settleSafely`, attraversa il `for` di `settleDue` (righe 69-71, senza catch) e viene presa solo da `TravelSweeper.settleHungerSafely` (`travel-sweeper.ts:105-111`), che logga `Sweep della fame fallito: TypeError` senza id.

**Scenario:** un personaggio ha `status.activeTravel.food` valido e `startTime` salvato come stringa o assente (semina/spostamento via script DB durante la UAT, EJSON senza `$date`; la lettura è `lean`, quindi nessun cast di Mongoose). A ogni tick: `TypeError: travel.startTime.getTime is not a function` → tutti i viaggiatori che il cursore restituisce **dopo** quel documento non vengono assestati, ogni minuto, finché il documento resta così. Nessun log dice quale personaggio è rotto. La fame degli altri non si perde (si recupera all'arrivo o quando il documento sparisce), ma smette di essere progressiva e il pasto del confine non avviene: è proprio la regola D-15 «errore isolato per personaggio» che cade. La spec `isolates a failing traveller…` (`travel-food.sweep.int-spec.ts:323-347`) copre solo un errore dentro la transazione.

**Fix:** portare dentro il `try` tutto ciò che legge il documento, e/o far validare `startTime` a `foodLegOf` (così il caso ricade nel warn «piano non valido» col solo id):

```ts
private async settleSafely(traveller: FoodTraveller, now: Date): Promise<boolean> {
    const id = traveller._id.toHexString();
    try {
        const travel = traveller.status.activeTravel;
        const leg = foodLegOf(travel);
        if (!leg) { this.logger.warn(/* … */); return false; }
        if (!settlementIsDue(leg, reachedKmOf(travel, now))) return false;
        const outcome = await this.settleOne(traveller, now);
        this.logCurveChange(id, outcome.curve);
        return outcome.settled;
    } catch (error) {
        this.logger.error(`Fame del viaggio del personaggio ${id} fallita: ${describeError(error)}`);
        return false;
    }
}
```

più un caso di test con `startTime` stringa seminato via `characters.collection.updateOne` accanto a un viaggiatore sano.

---

## Info

### A-IN-01 — D-19: il fail-safe addebita in blocco i chilometri già percorsi (serve un ruling)

**File:** `src/travel/food/travel-food-settlement.ts:80-88`; pinnato da `travel-food-settlement.spec.ts:243-253` e `travel-food.sweep.int-spec.ts:258-279`

**VERIFICATO il comportamento, DA CONFERMARE l'intenzione.** D-19 dice «la fame prosegue da `settledKm` senza addebiti retroattivi». Il codice calcola `hungerBetween(curvaNuova, settledKm, bersaglio)`; ma prima del pasto `settledKm` è di fatto sempre 0 (nel tratto coperto lo sweep non scrive, D-15), quindi al confine si paga in un colpo tutta la fame della curva nuova per i chilometri già fatti.

**Scenario (quello della spec):** 20 km, piano 10 scoperti, alla dispensa restano 4 power → curva nuova 16 scoperti, confine nuovo km 4; al km 10 lo sweep toglie 21 HP (km scoperti 1..6, già percorsi). Caso estremo: 100 km, piano 10 scoperti, dispensa svuotata a mano → al km 90 `hpLostFor(90)` = 4095 HP in un colpo, vita a 1.

Il totale resta quello della Phase 14 sulla copertura reale (lettura coerente con D-13); la lettura letterale di «senza addebiti retroattivi» darebbe invece 0 HP al confine e curva nuova solo da lì in avanti. Stato irraggiungibile senza modifiche a mano del DB. **Fix:** nessuno al codice finché l'orchestratore non sceglie; se vale la lettura attuale, correggere la frase di D-19 e del handoff («il totale è quello della copertura reale, i chilometri già fatti si pagano al confine»).

### A-IN-02 — Due scritture senza cambi sul filo emettono comunque `characterUpdated`

**File:** `src/travel/food/travel-food-settlement.ts:90-95` e `:153-158`; `src/characters/character-changes.pipeline.ts:2-9`

**VERIFICATO.** Il change stream pubblica ogni `update` di un personaggio attivo, senza filtro sui campi. Lo sweep scrive solo `status.activeTravel.food.*` (interno) in due casi: (a) confine con dispensa vuota (`foodConsumedAt` + `settledKm`, una volta per viaggio, scelta accettata dal planner); (b) vita già a `MIN_LIFE_POINTS`: ogni chilometro scoperto riscrive `currentLifePoints: 1` e `settledKm`, un evento ogni chilometro con payload identico. Nessun guasto funzionale e la scrittura di `settledKm` serve; è solo la parte di D-15 «niente `characterUpdated` a vuoto» che vale «non ogni minuto», non «mai». **Fix:** nessuno necessario; dichiararlo nel handoff §2.

### A-IN-03 — Un piano malformato produce un warn al minuto per tutta la durata del viaggio

**File:** `src/travel/food/travel-food.sweep.ts:86-91`

**VERIFICATO.** Il filtro di selezione (`food.settledKm ≥ 0`) continua a restituire il documento e `foodLegOf` continua a scartarlo: una riga di warn a ogni tick (un viaggio di 40 h = 2 400 righe), e l'arrivo poi ignora il piano in silenzio (`travel-completion.service.ts:162-163`). **Fix (facoltativo):** tenere in memoria gli id già segnalati (`Set` per `id + startTime`) oppure abbassare a `debug` dopo la prima volta.

### A-IN-04 — Test che non provano ciò che il titolo o il commento dichiara

**VERIFICATO leggendo le spec.**

1. `travel-food.sweep.int-spec.ts:187-201` «charges the same kilometres once under repeated and concurrent sweeps (D-14)»: passerebbe anche togliendo la guardia su `settledKm` dal filtro di scrittura, perché il WriteConflict della transazione fa rieseguire la lettura in sessione. La guardia è pinnata solo nella forma (`travel-food-settlement.spec.ts:403-412`); il ramo `matchedCount !== 1` di `travel-food.sweep.ts:163` non è esercitato da nessun caso.
2. Identità per `startTime` (`foodTravellerFilter`, `travel-food.updates.ts:28-36`; ramo `!travel || !leg` di `travel-food.sweep.ts:136`): nessun caso sostituisce il viaggio fra la lettura fuori sessione e quella in sessione; togliendo `startTime` dal filtro la suite dell'area resta verde. Basta uno spy su `characterModel.find` che restituisce uno `startTime` vecchio.
3. `active-travel.schema.spec.ts` «keeps only the food plan fields, never on the wire type (D-10)»: asserisce solo i path Mongoose; il «mai sul filo» lo prova altrove lo SDL (verificato: `git diff 466be7e7..HEAD -- src/schema.gql` è vuoto). Titolo da restringere a «keeps only the food plan fields».
4. Nessuna prova che la query dello sweep usi davvero `character_active_travel_food` (le due spec degli indici ne provano nome e chiave). Coerenza indice/filtro verificata a mano, vedi sotto.

### A-IN-05 — Duplicazioni introdotte dalla fase

**VERIFICATO.**

- `FOOD_TRAVELLER_PROJECTION` (`src/travel/food/travel-food.updates.ts:39-45`) e `TELEPORT_FOOD_PROJECTION` (`src/travel/travel.updates.ts:165-171`) sono identiche campo per campo: sono entrambe «ciò che serve a `foodLegOf` + `reachedKmOf`». Una sola costante (es. `FOOD_LEG_PROJECTION` accanto a `foodLegOf`) evita che un campo aggiunto a una manchi all'altra.
- `src/travel/travel-sweeper.ts:109` logga il passo «fame» col `codeOf` locale (righe 27-33), mentre `TravelFoodSweep` e REPO-RULES usano `describeError`: due formati per lo stesso sweep (`…fallito: Error` contro `…fallita: MongoServerError, code 112`). Preesistente nel file; Boy Scout: sostituire `codeOf` con `describeError` (cambia la stringa attesa in `travel-sweeper.spec.ts`).

### A-IN-06 — Rami difensivi morti e un bordo ipotetico

- **VERIFICATO:** `mealNeedOf` (`travel-food-settlement.ts:227`) controlla `leg.distanceKm <= 0`, irraggiungibile in produzione perché `foodLegOf` (riga 132) scarta le distanze ≤ 0; la spec `…stop of a road without length` (`travel-food-settlement.spec.ts:234-241`) costruisce un `FoodLeg` che il codice vero non produce mai.
- **VERIFICATO:** `travel-food.sweep.ts:114` azzera `outcome` subito prima di riassegnarlo alla riga 115: se la riesecuzione lancia, `outcome` non viene letto; l'azzeramento non ha effetto.
- **IPOTETICO (da verificare se 0 è uno stato legale):** `lifeAfterHunger` (`travel-food-settlement.ts:249-251`) con vita letta ≤ 0 e fame > 0 scrive 1, cioè alza la vita. Con `MIN_LIFE_POINTS = 1` garantito altrove non succede.

---

## Controllato e trovato corretto (verificato sul codice)

**Curva e chilometri**
- `travelHungerAt`: il km scoperto n-esimo si paga a `km ≥ coveredKm + n` (al metro); cumulata monotona non decrescente; a `km ≥ distanceKm` vale esattamente `hpLostTotal`; con `uncoveredKm > distanceKm` (arrotondamento per eccesso, D-13) nessun valore negativo e totale invariato. `hungerBetween` è differenza di cumulate: somma sempre al totale, 0 se `toKm ≤ fromKm`.
- Nessuna fame può precedere il pasto: il primo HP cade a `coveredKm + 1`, il pasto è dovuto a `coveredKm`.
- `travelKmAt`: clamp `[0, distanza]`, durata ≤ 0 → distanza, prima della partenza → 0. Un `NaN` (data invalida) non produce scritture (`settlementIsDue` falso).
- `coveredKmOf` mai negativo; `foodPlanOf` salva tutti e sei i campi con `settledKm: 0`, `foodConsumedAt: null`.

**Assestamento**
- `settledKm` non regredisce (`Math.max`, `travel-food-settlement.ts:100`); bersaglio dietro all'assestato → incremento 0 → `null`.
- Vita: `Math.max(MIN_LIFE_POINTS, vita − fame)`, senza `lifePointsWithin`; `statusFactsOf` non clampa al massimo (una vita 1 200/1 000 scende solo della fame); vita legacy nulla letta come massimo e guardata con `null` (combacia anche col campo assente).
- Cibo una sola volta: `mealIsDue` è falso con `foodConsumedAt` valorizzato in tutti e tre i momenti; la scrittura del pasto riafferma `foodConsumedAt: null` nel filtro; con dispensa vuota il confine registra comunque l'istante (nessun ritentativo infinito).
- `stop`: fabbisogno `min(needed, foodNeededFor(durata × km / distanza))`.
- Niente scritture a vuoto nel tratto coperto: `settlementIsDue` fuori sessione e `settlementOf → null` in sessione concordano.

**Atomicità e gare**
- Sweep: lettura del viaggio e della dispensa nella stessa sessione, scrittura calcolata da quella lettura, mai dalla lettura fuori transazione (usata solo per scegliere chi assestare e come identità `_id + startTime`). `ownedItems` scritto come array intero solo dentro la transazione.
- Il callback rieseguito sui WriteConflict riparte da una lettura nuova; `now` è lo stesso fra i ritentativi.
- Nessuna collisione di `$and`: `settlementGuardsOf` produce una sola lista (guardie di quantità + vita + extra del chiamante) e il filtro dello sweep non ne contiene altre (`activeCharacterById` + `startTime`).
- Mai un path `status.activeTravel.food.*` su un viaggio senza piano: selezione per `food.settledKm ≥ 0`, `foodLegOf` nullo → nessuna scrittura, e il filtro di scrittura riafferma `food.settledKm` uguale al letto (un legacy o una deviazione non possono combaciare). Arrivo con `settlementGuardsOf(null, …)`: nessuna guardia né set sul piano.
- Imboscata pendente: `reachedKmOf` ferma lo sweep a `ambush.km`; dopo vittoria o annullamento `ambush` diventa la prossima o `null` (`ambush.updates.ts:24-28`), quindi il tetto non resta per sempre.
- Viaggio arrivato nello stesso tick: `activeTravel` è `null` prima del passo «fame» (`COMPLETION_UPDATE`), nessun doppio addebito; completamento fallito → lo sweep assesta fino a `distanceKm` e l'arrivo successivo trova incremento 0 e pasto già fatto.

**Sweep e modulo**
- Errore per personaggio isolato dentro la transazione (con l'eccezione di A-WR-01); errore dell'intero passo isolato dai completamenti (`settleHungerSafely`); single-flight invariato.
- Log: solo id del personaggio, conteggi, `describeError` (nome e codice); nessun messaggio grezzo, URI, token, twitchId.
- Nessun `Date.now`, `Math.random`, `process.env` nei file dell'area: l'ora arriva da `Clock.now()` in `TravelSweeper.runOnce` e passa come parametro.
- Indice `{ deletedAt: 1, 'status.activeTravel.food.settledKm': 1 }` coerente col filtro `{ deletedAt: null, 'status.activeTravel.food.settledKm': { $gte: 0 } }` (uguaglianza + intervallo, limiti stretti); nome e chiave presenti in `sweep-indexes.schema.spec.ts` e `sweep-index.verifier.int-spec.ts`.
- `TravelFoodSweep` registrato ed esportato da `TravelPlanningModule`, che fornisce già modello `Character`, `LootItem` e `TravelPantryReader`.

**Modello**
- `ActiveTravelFood`: `@Schema({ _id: false })`, nessun `@ObjectType`/`@Field`; `food` opzionale senza default (un legacy idratato resta senza `food`, provato dalla spec); SDL identico.
- Nessun residuo di `mealGuardsOf`, `mealSetOf`, `eatenAtDeparture` sotto `src/` e `test/`.

**Test**
- `travel-food.spec.ts`: 350 partizioni deterministiche (10 distanze × 7 coperture × 5 partizioni) con somma, non negatività e zero nel tratto coperto; i casi del confine `10.999 → 0`, `11 → 1` fallirebbero con un off-by-one.
- `travel-food.sweep.int-spec.ts`: 14 casi, tutti con `toEqual` sul documento grezzo per le prove di assenza; il caso della pozione fra la lettura e la scrittura verifica davvero il ritentativo (`read` chiamato ≥ 2 volte e pozione conservata).
- `travel-sweeper.spec.ts`: ordine completamenti → fame e stesso istante provati con `invocationCallOrder`.


## Phase 20 — Review area B: cablaggio nei servizi (arrivo, imboscata, teleport, partenze)

- Repo: `/Users/lucatabbia/Personale/Code/Klimmeck-Guide-BE/Klimmeck-Guide-BE`, branch `feat/20-cibo-e-vita-progressivi`, diff `466be7e7..HEAD`
- Profondità: deep (catene di chiamata fra servizi, helper puri, filtri e transazioni)
- Metodo: sola lettura (Read, grep, `git diff`). Nessun test, tsc, build o lint eseguito: ogni affermazione sul comportamento viene dalla lettura del codice, non da un'esecuzione.
- Esito: **0 critici, 1 warning, 7 info**. Nessun difetto di correttezza trovato nel codice di produzione dell'area; il warning riguarda due prove end-to-end che non dimostrano ciò che il titolo dichiara.

File letti per intero: `travel-completion.service.ts`, `travel.updates.ts`, `ambush-food.ts`, `ambush-plan.ts`, `ambush-resolution.service.ts`, `travel.service.ts`, `travel-food-settlement.ts`, `travel-food.ts`, `travel-pantry.reader.ts`, `travel-food.updates.ts`, `travel-food.sweep.ts`, `food-selection.ts`, `trade-inventory.ts`, `ambush.updates.ts`, `travel-timing.ts`, `active-travel-food.model.ts`. Letti in parte: `quest-acceptance.service.ts` (accettazione, `claimLane`, `fedOrReject`, `movementTo`), `quest-acceptance.updates.ts`, `travel-sweeper.ts`, `ambush-sweeper.ts` (fallimenti), `item-use.plan.ts`, `gm-completion.service.ts`, `resolution-loader.service.ts`. Int-spec: diff completo di arrivo, imboscata, teleport, accettazione; della partenza i casi di concorrenza e i due end-to-end.

---

## Warning

### B-WR-01 — Due prove end-to-end non dimostrano ciò che il titolo dichiara

**File:** `src/travel/travel.service.int-spec.ts:824-854` e `:856-879`

**Verificato leggendo il codice.**

1. `charges at the end of the road exactly the Phase 14 total, step by step (D-02, D-13)` (riga 824). La sola asserzione sul «passo per passo» è `life <= lives[i - 1]` (righe 851-853). Passa anche se tutta la fame venisse addebitata in blocco all'arrivo: una sequenza `[1000, 1000, …, 1000 − hpLost]` è non crescente. La dispensa si legge solo a fine strada (`ownedItems` `[]`, riga 850), quindi nemmeno il pasto al confine (a) è distinto dal pasto d'arrivo (b).
   - Scenario di guasto non rilevato: una regressione che spegne il passo «fame» dello sweep (per esempio `settleDue` non più chiamato da `runOnce`) lascia questo test verde, perché l'arrivo assesta comunque tutto il residuo.
   - Fix: asserire almeno uno scatto intermedio e il pasto al confine, per esempio
     ```ts
     const beforeArrival = lives.slice(0, -2);
     expect(beforeArrival.some((life) => life < HARDY_LIFE_POINTS)).toBe(true);
     expect(new Set(lives).size).toBeGreaterThan(2);
     ```
     e leggere `assets.ownedItems` e `activeTravel.food.foodConsumedAt` dopo il primo scatto oltre `coveredKm`, a viaggio ancora aperto.

2. `eats at the boundary the same food the Phase 14 ate at departure (D-03, D-13)` (riga 856). La dispensa è `f1 × needed + f5 × 2`, cioè copertura piena: `uncoveredKm = 0`, `coveredKm = distance`. Il «confine» coincide con la fine della strada e `runOnce` esegue i completamenti prima del passo «fame» (`travel-sweeper.ts:82-100`): il cibo lo toglie l'arrivo (momento `arrival`), non lo sweep al confine (momento `progress`). Il titolo dichiara il pasto (a), il percorso esercitato è il pasto (b).
   - Fix: rinominare in «eats on arrival the same food…» oppure usare una copertura parziale con cibo misto e leggere la dispensa a viaggio aperto dopo il confine.

Il pasto al confine dello sweep è coperto dalla int-spec dello sweep (area A): qui il rischio è la falsa sicurezza delle due prove «end to end», non un comportamento scoperto.

---

## Info

### B-IN-01 — Catalogo del cibo dell'imboscata letto fuori transazione

**File:** `src/travel/ambush/ambush-resolution.service.ts:289-291`, usato in `:435-439`; `src/travel/ambush/ambush-food.ts:43,53`

**Verificato:** `foodCatalog` nasce da `snapshot.assets.ownedItems` della lettura fuori sessione (riga 217) e viene riusato dentro il callback, anche nei retry per WriteConflict, per costruire gli stack dalla dispensa letta in sessione. Arrivo, teleport e sweep leggono invece dispensa e catalogo in sessione (`pantry.read(id, session)`). È l'unica deviazione dalla forma unica di D-14.

**Scenario (ipotetico, da verificare se un personaggio in viaggio può ricevere oggetti, per esempio dal completamento GM di una story o world mission):** un cibo di tipo nuovo entra in dispensa fra la prima lettura e la transazione. `stacksOf` non lo trova nel catalogo e lo tratta come non commestibile. L'effetto è nullo sul piano della partenza (quel cibo non era nel piano); si perde solo la riscrittura «in più» di D-19. Nessun danno ai dati.

**Fix:** leggere il catalogo dentro il callback dalla dispensa di `inSession`: `await this.pantry.foodCatalogFor(inSession.assets?.ownedItems ?? [], session)` e togliere `foodCatalog` da `Fight`.

### B-IN-02 — Il fail-safe del cibo lascia la riga di log solo nello sweep

**File:** `src/travel/ambush/ambush-resolution.service.ts:435-443`, `src/travel/travel.service.ts:305-314`, `src/travel/travel-completion.service.ts:165-174`

**Verificato:** D-19 («con una riga di log») e D-03 («consuma ciò che c'è… (log)») sono rispettati solo da `TravelFoodSweep.logCurveChange`. Quando il pasto del confine lo esegue l'imboscata (`food.progress.curve` non nullo) la curva viene riscritta in vittoria senza alcun log; in arrivo e teleport un pasto che copre meno del piano passa in silenzio.

**Scenario:** dispensa modificata a mano, imboscata oltre `coveredKm` prima dello sweep: `uncoveredKm`, `coveredKm` e `hpLostTotal` cambiano sul documento senza traccia nei log.

**Fix:** dopo il commit dell'imboscata, se `food?.progress?.curve` è presente, un `logger.warn` col solo id e i km scoperti prima e dopo (stesso testo dello sweep).

### B-IN-03 — Commenti stantii dopo il cablaggio

**Verificato:**
- `src/travel/travel.service.ts:220` — «un solo findOneAndUpdate in transazione»: ora il callback fa anche una lettura del viaggio e la lettura della dispensa (`closingFoodOf`).
- `src/travel/travel.service.ts:227` — «nella transazione solo scritture»: non più vero per lo stesso motivo.
- `src/travel/food/travel-pantry.reader.ts:97` — «in sessione dentro la transazione della partenza»: `read` serve ora anche arrivo, sweep e teleport.
- `src/travel/food/travel-pantry.reader.ts:174` — «imboscata e teleport costruiscono gli stack dalla dispensa letta in sessione»: il teleport usa `read`, non `foodCatalogFor`; l'imboscata chiama `foodCatalogFor` fuori sessione (B-IN-01).

**Fix:** riallineare i quattro commenti.

### B-IN-04 — `PlannedMeal.pantry` non è più letto in produzione

**File:** `src/travel/food/travel-pantry.reader.ts:35-38,140`

**Verificato con grep:** dopo la rimozione di `mealGuardsOf`/`mealSetOf`, `travel.service.ts:147` e `quest-acceptance.service.ts` leggono solo `meal.plan`; `pantry` è letto soltanto da `travel-pantry.reader.int-spec.ts:194`.

**Fix:** far restituire a `planFor` il solo piano, oppure lasciarlo e dichiararlo: scelta di pulizia, nessun effetto a runtime.

### B-IN-05 — `ambushFoodOf` non valida `ambush.km`, `reachedKmOf` sì

**File:** `src/travel/ambush/ambush-food.ts:34`; confronto con `src/travel/food/travel-food-settlement.ts:117-125`

**Verificato:** `reachedKmOf` accetta solo un `km` numerico finito; `ambushFoodOf` passa `travel.ambush.km` così com'è.

**Scenario (ipotetico: richiede un'imboscata salvata senza `km` numerico, che la Phase 15 non produce):** con `km` `NaN` o assente `settlementOf` restituisce un assestamento con `hpLoss` `NaN` e `settledKm` `NaN`; in vittoria `foodProgressSetOf` scriverebbe `food.settledKm: NaN`, da lì `foodLegOf` scarta il piano e la fame non viene più addebitata.

**Fix:** in `ambushFoodOf`, `if (!Number.isFinite(km)) return null;` subito dopo la lettura.

### B-IN-06 — Ramo «guardia mancata» dell'arrivo senza prova diretta

**File:** `src/travel/travel-completion.service.ts:185-187`

**Verificato:** nessuna spec cita `arrival food settlement lost its guards`. **Da verificare:** se un test lo copre senza citare il messaggio e se la soglia di coverage di `./src/travel/` regge (REPO-RULES: «i rami nuovi hanno una prova ciascuno»). Il ramo è irraggiungibile in condizioni normali: lettura e scrittura stanno nella stessa transazione, un cambio concorrente produce un WriteConflict e non un filtro mancato.

**Fix:** una prova con `TravelPantryReader.read` sostituito da una dispensa incoerente (cibo dichiarato ma assente) che attende il rigetto e il viaggio ancora aperto.

### B-IN-07 — Prove del teleport: un caso fissa un doppio pagamento, due lacune

**File:** `src/travel/teleport.resolver.int-spec.ts:434-443`, `:458`

**Verificato:**
- Riga 434, `eats only the pro-rata food past the covered kilometres with a plentiful pantry (D-17)`: piano con `coveredKm: 2` e 10 power posseduti (stato che nessuna partenza reale salva). Al km 5 il personaggio paga 6 HP di fame per i km 2-5 **e** mangia 5 unità, cioè il cibo degli stessi km. È l'effetto del momento `stop` che non applica la riconciliazione di D-19. Lo stato è raggiungibile solo con una dispensa più ricca del piano oltre il confine e prima del pasto dello sweep; il caso l'ha chiesto il checker, ma conviene che l'orchestratore confermi che il doppio pagamento è il comportamento voluto.
- Riga 458: il titolo cita D-04 (deviazione) ma il caso usa un viaggio legacy e un personaggio fermo; la deviazione è strutturalmente un viaggio senza `food`, quindi il codice è coperto, ma nessuna prova teletrasporta un personaggio in deviazione dopo una sconfitta vera.
- Manca il caso «pasto già consumato dallo sweep, teleport oltre il confine»: solo fame residua, nessun secondo pasto. L'arrivo ha l'equivalente (`charges only the kilometres after the settled ones…`), il teleport no; la regola è coperta dalle unit dell'assestamento.

**Fix:** aggiungere il caso con `settledKm` e `foodConsumedAt` valorizzati; rinominare o completare il caso di riga 458.

---

## Controllato e trovato corretto

Tutto verificato leggendo il codice, salvo dove indicato.

**Concorrenza fra i percorsi**
- Sweep, imboscata, arrivo e teleport scrivono tutti dentro `connection.transaction` con lettura in sessione di viaggio, vita e dispensa; il filtro riafferma `food.settledKm` e, a pasto dovuto, `food.foodConsumedAt: null`. Due percorsi concorrenti sullo stesso personaggio vanno in WriteConflict, il driver riesegue il callback e la rilettura trova `settledKm` avanzato: nessun doppio addebito di fame, nessun doppio pasto.
- `settledKm` dopo ogni scrittura è `max(settledKm, bersaglio)` e `hungerBetween` vale 0 con `toKm <= fromKm`: uno sweep con `now` vecchio dopo un'imboscata o un teleport non genera incrementi negativi né scritture.
- Arrivo: `COMPLETION_UPDATE` e assestamento nello stesso callback; se l'assestamento lancia, abortisce anche il completamento e lo riprende lo sweeper (o il job). Due `complete` concorrenti: uno `completed`, uno `stale`, cibo assestato una volta (provato in int-spec).
- Imboscata con guardia mancata: `StaleResolution` → `stale`; l'`AmbushSweeper` la ripropone al tick successivo, nessuna transazione persa.
- Gli altri scrittori di `assets.ownedItems` e `currentLifePoints` come array o valore intero (`item-use`, completamento GM, risoluzione quest, negozio) leggono in sessione dentro una transazione: una pozione bevuta in mezzo non viene cancellata e non cancella il pasto. Il negozio rifiuta in viaggio (`'status.activeTravel': null` nel filtro).

**Filtri e guardie**
- Nessuna collisione di `$and`: `ambushFilter`, `teleportFilter` (`STANDARD_LANE_FREE` è una sola chiave), `foodTravellerFilter`, `activeCharacterById` non contengono `$and`; l'unico `$and` è quello di `soldQuantityGuards`, che riceve anche la guardia della vita nella stessa lista.
- Nessun path `status.activeTravel.food.*` scritto o guardato su un viaggio senza piano: l'imboscata chiama `settlementGuardsOf` e `foodProgressSetOf` solo con `input.food` presente, arrivo e teleport passano da `foodLegOf` e scrivono solo vita e dispensa.
- Voci di inventario duplicate per lo stesso cibo: `selectFood` usa la prima occorrenza, la stessa che `applyTradeToInventory` scala; nessun `insufficientItemQuantity` possibile che blocchi l'arrivo.

**Bersaglio del chilometro**
- Sweep e teleport: `min(travelKmAt(now), ambush.km)`; imboscata: `km` salvato; arrivo: `distanceKm`, e `completionFilter` richiede `ambush: null`, quindi mai un arrivo con imboscata pendente.
- Teleport prima del primo metro: fabbisogno pro-rata 0, nessuna fame, `settlementOf` nullo, filtro semplice.

**Imboscata**
- Il combattimento parte da `fighter` (vita dopo la fame, dispensa dopo il pasto); `hpBefore` del report è la vita assestata (D-18); i consumabili del combattimento si calcolano sulla dispensa già senza pasto.
- Sconfitta dentro il tratto coperto: solo il pasto pro-rata; sconfitta oltre il confine: pasto (a) nel passo `progress`, nessun pasto (c); `defeatSettlementOf` unisce le guardie senza duplicare i consumi.
- Vittoria dentro il tratto coperto: nessun campo del piano scritto, resta la guardia su `settledKm`.
- Deviazione: `defeatTravelOf` costruisce un oggetto letterale senza `food`; `ActiveTravelFood` non ha default sul genitore, quindi Mongoose non lo ricrea (provato in int-spec con `Object.keys`). Vale anche per il ripiego verso la meta.
- `skip` e annullamento dopo i tentativi falliti non toccano il piano: la fame riprende dallo sweep da `settledKm`.

**Vita**
- `lifeAfterHunger` è `max(MIN_LIFE_POINTS, vita − fame)` in tutti i percorsi, senza `lifePointsWithin` e senza `$inc`; la vita si scrive solo con `hpLoss > 0`, con la guardia sul valore grezzo letto (`hpRaw ?? null`, che combacia anche col campo assente dei legacy).

**Partenze**
- Libera e da quest salvano lo stesso `foodPlanOf(plan, road.distance)` dalla dispensa letta in sessione, nello stesso update che scrive `activeTravel`; nessuna scrittura di inventario o vita; `TRAVEL_STARVING` e la precedenza del codice di corsa invariati; entrambe passano da `withAmbush`.
- Salto istantaneo, nessun movimento, story e world mission: `meal` è nullo fuori da `movement.kind === 'travel'`, `movementWithFoodPlan` restituisce il movimento intatto, nessun piano ereditato.
- Nessuna differenza di comportamento fra le due partenze oltre alla pre-verifica fuori sessione dell'accettazione, già presente.

**Legacy, orologio, codice morto, eventi**
- Viaggi legacy, deviazioni e personaggi fermi: una prova di integrazione per arrivo, imboscata e teleport; nel codice ogni percorso esce su `foodLegOf` nullo.
- Nessun `Date.now` né `new Date()` senza argomenti in `src/travel` e `src/quests/acceptance` (grep vuoto): arrivo, imboscata e teleport leggono `Clock`, il teleport fuori dal callback così i retry usano lo stesso istante.
- `mealGuardsOf`, `mealSetOf` ed `eatenAtDeparture` non compaiono più in `src/` né in `test/`.
- Nessuna emissione manuale di `characterUpdated`: imboscata e teleport restano una sola scrittura sul personaggio; l'arrivo ne aggiunge una quando c'è da assestare, col pattern già usato per la geografia.
- Commenti di partenza riscritti correttamente in `travel.service.ts:118`, `travel.updates.ts:66`, `quest-acceptance.service.ts:238,392,491`, `quest-acceptance.updates.ts:80`.

**Non controllato**
- Esecuzione delle suite e coverage (in corso da un altro agente).
- `travel-food.sweep.int-spec.ts`, le unit dell'assestamento e i modelli/indici (area A), letti solo per capire i contratti.
- `BACKEND-NOTES.md` e i documenti di pianificazione.


## Phase 20 — ruling dell'orchestratore sui finding della review (2026-11-12)

I report completi sono `review-A.md` e `review-B.md` in questa cartella (file:riga, scenari, fix proposti). Ogni fix di codice in TDD (RED `test(scope)` → GREEN `fix(scope)`/`refactor(scope)`), un commit per finding o coppia RED/GREEN. «VERIFY first» = prima prova con una sonda/lettura che il difetto esiste; se non esiste chiudi `not_needed` con il motivo.

| Id | Ruling |
|----|--------|
| A-WR-01 | **FIX.** Tutto ciò che legge il documento dentro il `try` di `settleSafely` E `foodLegOf` valida `startTime` (Date valida) così il caso ricade nel warn «piano non valido» col solo id. Caso int: `startTime` stringa seminato con `collection.updateOne` accanto a un viaggiatore sano, che viene assestato lo stesso. |
| A-IN-01 | **Codice invariato** (il totale resta quello della Phase 14 sulla copertura reale, coerente con D-13 e con l'arrivo). **FIX documentale:** in `20-CONTEXT.md` D-19 sostituisci «la fame prosegue da `settledKm` senza addebiti retroattivi» con una frase vera: il totale è quello della copertura reale; i chilometri scoperti della curva nuova già percorsi si pagano al pasto del confine; nota «Chiarito dopo la review (A-IN-01), 2026-11-12». Commit `docs(phase-20): …`. |
| A-IN-02 | `not_needed` nel codice. Lo dichiara l'handoff §2 (piano 11). |
| A-IN-03 | **FIX.** Warn una sola volta per viaggio: set in memoria limitato (chiave id + startTime, tetto di dimensione con svuotamento), come il precedente «warn-once bounded» del repo se esiste (cercalo), senza cancellare nulla a DB. Test unit/int: due tick, un solo warn. |
| A-IN-04.1 | **VERIFY first, poi FIX**: un caso che esercita il ramo `matchedCount !== 1` dello sweep (guardia su `settledKm` mancata) se ottenibile in modo deterministico con uno spy (niente sleep); se non ottenibile senza forzare il codice, `not_needed` motivato. |
| A-IN-04.2 | **FIX**: caso con viaggio sostituito fra la lettura fuori sessione e quella in sessione (spy su `find` con `startTime` vecchio) → nessuna scrittura. |
| A-IN-04.3 | **FIX**: titolo → «keeps only the food plan fields (D-10)». |
| A-IN-04.4 | `not_needed` (coerenza indice/filtro verificata dal revisore; niente `explain` nelle spec). |
| A-IN-05 | **FIX** entrambi: una sola proiezione condivisa accanto a `foodLegOf` (nome a tua scelta, es. `FOOD_LEG_PROJECTION`); `travel-sweeper.ts` usa `describeError` al posto del `codeOf` locale (rimuovi `codeOf` se resta senza usi; aggiorna la stringa attesa nella spec). |
| A-IN-06 | **FIX**: togli il ramo `distanceKm <= 0` di `mealNeedOf` e il suo caso di spec (irraggiungibile: `foodLegOf` lo scarta) — solo se `tsc` e la coverage di cartella non ne soffrono; togli l'azzeramento ridondante di `outcome`. Vita ≤ 0: `not_needed`. |
| B-WR-01 | **FIX** entrambe le prove: (1) asserisci almeno uno scatto intermedio prima dell'arrivo e leggi dispensa + `foodConsumedAt` a viaggio aperto dopo il confine; (2) rinomina in «eats on arrival …» oppure usa copertura parziale e leggi la dispensa a viaggio aperto. |
| B-IN-01 | **FIX**: catalogo del cibo dell'imboscata letto dentro il callback dalla dispensa in sessione (forma unica D-14); togli `foodCatalog` da `Fight` se resta senza usi. |
| B-IN-02 | **FIX**: stessa riga di log della curva riscritta (solo id e km scoperti prima/dopo) anche in imboscata, arrivo e teleport, DOPO il commit della transazione; un solo helper per il testo (niente tre copie). |
| B-IN-03 | **FIX**: riallinea i quattro commenti (dopo B-IN-01). |
| B-IN-04 | **FIX**: `planFor` non restituisce più `pantry` se nessun codice di produzione lo legge (aggiorna la int-spec); se il cambio si allarga oltre il lettore e i due chiamanti, fermati e chiudi `skipped` col motivo. |
| B-IN-05 | **FIX**: `ambushFoodOf` → `null` se `km` non è finito; caso unit. |
| B-IN-06 | **VERIFY first**: se il ramo «guardia mancata» dell'arrivo non ha una prova, aggiungila con override del provider `TravelPantryReader` (dispensa incoerente → rigetto, viaggio ancora aperto, lo riprende lo sweep). |
| B-IN-07 | Riga 434: **riscrivi il caso con uno stato coerente** (piano che una partenza reale salverebbe per quella dispensa): deve fissare che il teleport toglie solo il cibo pro-rata dei km percorsi, senza cementare il doppio pagamento di uno stato irraggiungibile. Codice di produzione invariato. Aggiungi il caso «pasto già consumato dallo sweep, teleport oltre il confine: solo fame residua, nessun secondo pasto». Riga 458: togli D-04 dal titolo o aggiungi davvero la deviazione (a tua scelta, la più economica). |
