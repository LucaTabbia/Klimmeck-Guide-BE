---
phase: 15-imboscate-in-viaggio
group: A
reviewed: 2026-11-06T21:00:00Z
depth: standard
files_reviewed: 16
files_reviewed_list:
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
findings:
  critical: 0
  warning: 1
  info: 3
  total: 4
status: issues_found
---

# Phase 15: Code Review Report, gruppo A (`src/travel/ambush/`)

## Summary

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

## Critical

Nessuno.

## Warning

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

## Info

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
