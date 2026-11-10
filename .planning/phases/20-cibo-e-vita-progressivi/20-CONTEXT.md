# Phase 20: Cibo e vita progressivi in viaggio - Context

**Gathered:** 2026-11-09 (discuss condotto dal repo FE nella stessa sessione delle Phase 18 e 19; branch `feat/20-cibo-e-vita-progressivi` impilato su `feat/19-revisione-dei-modelli`; worktree `Klimmeck-Guide-BE-wt18`). **Fase solo BE**: nessuna companion FE, nessun cambio allo SDL, l'app mostra il DB come oggi (D-12).
**Status:** Ready for planning — fase di regole del viaggio: il cibo e la vita si pagano **mentre si cammina**, non alla partenza. Supera la Phase 14 D-04 («tutto alla partenza, l'arrivo non tocca nulla») e la lettura «nessun rimborso» della Phase 15 BE-AMBUSH-05 (non è un rimborso: è cibo mai mangiato). Totali, anteprima e rifiuto per fame restano identici. **Si esegue dopo la Phase 19** (D-12).

<domain>
## Phase Boundary

Oggi il server sceglie e mangia tutto il cibo alla partenza e scala subito la vita dei chilometri scoperti: chi fallisce un'imboscata al chilometro 30 di 400 ha pagato cibo e fame di tutto il viaggio, e chi combatte all'inizio del percorso combatte «come se avesse percorso 100 km senza cibo». Da questa fase il piano del cibo si calcola alla partenza come oggi (stessa selezione, stessa anteprima, stesso rifiuto se non si arriva vivi) ma **si applica lungo la strada**: la vita cala solo nel tratto scoperto, scritta dallo sweep ogni minuto come perdita incrementale dei chilometri fatti dall'ultimo passaggio ed esatta al chilometro dell'imboscata e all'arrivo; il cibo si toglie in blocco in tre momenti, alla fine dei chilometri coperti, all'arrivo e alla sconfitta, con la stessa selezione a scarto minimo sul fabbisogno dei chilometri percorsi. Pozioni (Phase 18) e danni d'imboscata si sommano alla fame, nulla li cancella. La deviazione dopo una sconfitta resta senza cibo e senza fame.

Fuori scope (decisioni dell'utente): un debito di fame o un tetto alle cure («in battaglia le cure non superano la vita d'ingresso»), la fame fuori dal viaggio, una riga in app durante il viaggio, cambi all'anteprima, alla selezione del cibo (Phase 14 D-06) o alla curva (Phase 14 D-02), la deviazione che consuma, le regole di combattimento.

</domain>

<decisions>
## Implementation Decisions

### Vita (BE-FOODP-01, BE-FOODP-02)
- **D-01 (utente, «La vita avviene allo sweep, una volta superato il chilometro scoperto dal cibo posseduto»; confermato):** la vita cala **solo nel tratto scoperto** (oltre i chilometri che il cibo del piano copre). Lo **sweep del viaggio** (`TravelSweeper`, già ogni `TRAVEL_SWEEP_INTERVAL_MS`, default 60 s) scrive a ogni passaggio la **perdita incrementale** dei chilometri fatti dall'ultimo passaggio (`hungerBetween(settledKm, nowKm)`), mai un valore assoluto: così una pozione bevuta in viaggio (Phase 18) o i danni di un'imboscata si sommano e nulla li cancella. `currentLifePoints` mai sotto 1 (`MIN_LIFE_POINTS`): la fame non uccide, come oggi il rifiuto alla partenza garantisce. Scrittura atomica con filtro su `settledKm` (idempotenza fra sweep, imboscata e arrivo concorrenti).
- **D-02 (utente, «Cibo prima, fame in coda»):** la curva è quella della Phase 14 D-02: i chilometri coperti sono i primi, i chilometri scoperti gli ultimi e il chilometro scoperto n-esimo costa n HP; **totali, anteprima (`travelPreview`, anteprima dell'accettazione) e rifiuto «arrivi vivo» restano identici**, cambia solo il momento in cui si paga. Chilometro corrente dal tempo: `nowKm = distanceKm × (now − startTime) / duration` (velocità uniforme sulla polilinea, la stessa che la Phase 15 usa per il `km` dell'imboscata), limitato a `[0, distanceKm]`.
- **D-05 (Claude):** il piano della partenza viene **salvato** su `activeTravel.food` (interno, mai sul filo): `{ needed, coveredKm, hpLostTotal, settledKm: 0, foodConsumedAt: null }` (nomi default tecnico in `20-REPO-RULES.md`); alla partenza non si scrive più né inventario né vita (la Phase 14 D-04 è superata), il rifiuto resta nella stessa transazione della partenza con lo stesso `planTravelFood`. I viaggi iniziati **prima del deploy** non hanno `food`: hanno già pagato tutto alla partenza con la regola vecchia e lo sweep li ignora (nessun migratore, D-11).

### Cibo (BE-FOODP-03)
- **D-03 (utente, «il cibo lo rimuoviamo quando vieni sconfitto, quando arrivi a destinazione e quando hai finito i chilometri coperti»; «Calcoliamo come oggi la combinazione più efficiente e con meno sprechi»; confermato):** il cibo si toglie **in blocco** in tre momenti, una sola volta per viaggio (`foodConsumedAt`): (a) **fine dei chilometri coperti** (`nowKm ≥ coveredKm`, allo sweep o all'evento che lo supera per primo): tutto il cibo che li copriva, cioè la selezione del piano della partenza ricalcolata sul posseduto in quel momento (stesso `selectFood`, stesso fabbisogno totale); (b) **arrivo**: come oggi, selezione sul fabbisogno totale, se non già consumato in (a); (c) **sconfitta** in imboscata: selezione a **scarto minimo sul fabbisogno dei soli chilometri percorsi** (`foodNeededFor(durata × km/distanza)`), sul posseduto in quel momento, se non già consumato in (a). Nessun ordine dei pasti da decidere e nessuna lista di unità salvata: la regola della Phase 14 D-06 gira al momento del consumo. Il consumo è una vendita senza incasso con le guardie di quantità (Phase 14 D-12); se nel frattempo il cibo è sparito (vendita impossibile in viaggio, ma fail-safe) il blocco consuma ciò che c'è e il resto è scoperto da lì in avanti (log).
- **D-04 (utente, «Resta senza cibo e senza fame»):** la **deviazione** dopo una sconfitta (Phase 15, `kind: free` riscritto dal punto) non ha piano del cibo: né consumo né fame, come oggi; il tratto già percorso è stato pagato dal consumo (c).
- **D-06 (Claude, default dichiarato):** il **teleport dell'oste a viaggio iniziato** chiude il viaggio come una sconfitta: cibo per i chilometri percorsi (c) e fame fino al chilometro del momento (D-01), nella stessa transazione del teleport; il **salto istantaneo** dell'accettazione resta esente (nessun viaggio).

### Imboscata e arrivo (BE-FOODP-04)
- **D-07 (Claude):** l'**imboscata** (risoluzione del job o dello sweep al suo `km`) prima del combattimento setta la fame esatta fino a quel chilometro (`settledKm = km`) e, se il chilometro supera `coveredKm`, consuma il cibo (a); il combattimento parte dalla vita così aggiornata (è il «vita vera di quel punto» chiesto dall'utente). In **vittoria** il viaggio continua sulla stessa polilinea con lo stesso piano; in **sconfitta** si applica (c) e la deviazione nasce senza piano. L'**arrivo** (`TravelCompletionService.complete`) setta la fame fino a `distanceKm` e il cibo (b) nella stessa transazione del completamento.
- **D-08 (Claude):** una sola funzione pura in `src/travel/food/` (`travelHungerAt`/`hungerBetween` con la curva triangolare spostata sui chilometri scoperti) riusata da sweep, imboscata, arrivo, sconfitta e teleport; nessun processor o job nuovo: lo sweep esistente guadagna un passo «fame» che seleziona solo i personaggi in viaggio con `food` presente, `settledKm < nowKm` e `nowKm > coveredKm` (indice sui campi del piano se il filtro lo richiede).

### Pozioni, FE, prove e ordine (BE-FOODP-05)
- **D-09 (utente, conversazione precedente):** le pozioni in viaggio (Phase 18, ricarica globale) restano la sola mitigazione della fame: nessun debito di fame né tetto alle cure; la fame continua a mordere dopo il sorso (perdita incrementale).
- **D-10 (utente, «Niente di nuovo» in app):** nessun campo nuovo sul filo, nessuna companion FE: vita e dispensa arrivano dallo stream del personaggio (change stream) a ogni scrittura dello sweep o degli eventi; l'anteprima resta la sola informazione esplicita. Il handoff emenda la nota della FE Phase 15 («inventario e HP cambiano solo via subscription»: ora anche durante il viaggio, a scatti di un minuto nel tratto scoperto e in blocco al confine).
- **D-11 (Claude):** nessun migratore: i viaggi legacy senza piano sono ignorati; nessun one-off; la spec del boot reale conferma lo SDL identico.
- **D-12 (utente, «BE 20 da sola, dopo la 19»):** fase solo BE, impilata sulla 19, eseguita dopo la sua merge; UAT su device con l'app com'è.
- **Prove (default tecnico):** unit sulla funzione pura (0 km, confine, oltre il confine, tratto intero, incrementi che sommano al totale della Phase 14, clamp a 1), sul chilometro dal tempo, sulla selezione parziale alla sconfitta (30 km su 400 → solo il fabbisogno di 30 km; tutto il cibo se 400); integration sul replica set con orologio finto: partenza senza scritture di inventario/vita; sweep che non scrive prima del confine, consuma il cibo al confine e scala la vita ogni passaggio dopo; pozione bevuta fra due sweep che resta nel conto; imboscata al km 290 con vita esatta; sconfitta al km 30 con cibo pro-rata e deviazione senza piano; arrivo con totali identici a oggi; teleport a metà; viaggio legacy ignorato; handoff `BACKEND-NOTES.md` per la FE (nessun cambio, semantica nuova) e per la UAT (viaggio lungo con poco cibo, sconfitta seminata a 30 km).

### Claude's Discretion
- Nomi dei campi del piano salvato e della funzione pura in `20-REPO-RULES.md`; soglia di «chilometro percorso» frazionario (il km n-esimo si paga quando lo si completa).
- Dove vive il passo «fame» dello sweep (dentro `TravelSweeper.runOnce` o un servizio dedicato chiamato da lì) e l'eventuale indice.

</decisions>

<canonical_refs>
## Canonical References

### Roadmap e requisiti
- `.planning/ROADMAP.md` — Phase 20; `.planning/REQUIREMENTS.md` — BE-FOODP-01..05

### Regole superate o riusate
- `.planning/phases/14-viaggio-e-cibo/14-CONTEXT.md` — D-01 (1 power = 3 min), D-02 (curva triangolare), D-04 (**superata**: tutto alla partenza), D-05/D-06 (selezione), D-09 (anteprima), D-12 (cibo = vendita senza incasso, guardie)
- `.planning/phases/15-imboscate-in-viaggio/15-CONTEXT.md` — `km` dell'imboscata dal tempo, deviazione «nessun costo in più» (**lettura emendata**: non rimborso, cibo mai mangiato), riscrittura di `activeTravel`
- `.planning/phases/18-quest-heal-per-taglia/18-CONTEXT.md` — D-15..D-17 (pozioni in viaggio con ricarica: la mitigazione della fame)

### Codice
- `src/travel/food/travel-food.ts` (`FOOD_RULES`, `TravelFoodPlan`, `foodNeededFor`, `uncoveredKmOf`, `hpLostFor`, `planTravelFood`), `src/travel/food/food-selection.ts` (`selectFood`), `src/travel/food/travel-food.updates.ts` (`mealLinesOf`, `mealGuardsOf`, `mealSetOf`: da spostare dalla partenza ai tre momenti), `src/travel/food/travel-pantry.reader.ts`
- `src/travel/travel.service.ts`, `src/quests/acceptance/quest-acceptance.service.ts` (partenza libera e da quest: rifiuto per fame, oggi anche consumo e vita), `src/travel/travel.updates.ts` (`COMPLETION_UPDATE`), `src/travel/travel-completion.service.ts` (`complete`), `src/travel/travel-sweeper.ts` (`runOnce`, `sweepSafely`), `src/travel/travel-timing.ts`
- `src/travel/ambush/ambush-point.ts`, `ambush-clock.ts`, `ambush-resolution.service.ts`, `ambush-plan.ts` (`hpFought`), `ambush-detour.ts`, `ambush.updates.ts` — chilometro dell'imboscata, vita d'ingresso, deviazione
- `src/models/character/active-travel.model.ts` — `ActiveTravel` (sede del piano `food` interno), `TravelPath.distance`
- `src/characters/` teleport (`teleport.resolver.int-spec.ts` come mappa del flusso) — teleport a viaggio iniziato
- `src/quests/outcomes/progression/level-table.ts` — `MIN_LIFE_POINTS`, `lifePointsWithin`

### Regole del repo
- `CLAUDE.md`, `.planning/PROJECT.md` (Key Decisions), `.planning/phases/16-lore-sbloccabili/16-REPO-RULES.md` (pattern; «mai intersezioni con interfacce negli update di Mongoose»)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `planTravelFood` e `selectFood`: il piano della partenza e la selezione a scarto minimo, da richiamare sul fabbisogno dei chilometri percorsi alla sconfitta.
- `mealLinesOf`/`mealGuardsOf`/`mealSetOf`: il consumo come vendita senza incasso con guardie, oggi nella partenza, domani nei tre momenti.
- `TravelSweeper` e `AmbushSweeper`: passi periodici con `runOnce` e filtri «dovuti» sul modello del personaggio.
- Il `km` dell'imboscata dal tempo (Phase 15): la stessa proporzione per `nowKm`.

### Established Patterns
- Il DB decide: job come trigger, reconciler al boot, sweep periodico, scritture atomiche con filtro di guardia (Phase 8/9/14/15).
- Campi interni su `activeTravel` mai sul filo (`ambush`, `ambushReports`, `kind`).
- Regola di casa: nessun one-off se non serve (qui i viaggi legacy sono semplicemente ignorati).

### Integration Points
- Partenza (libera e da quest): salva il piano, non consuma, rifiuta come oggi.
- Sweep: passo «fame» con filtro sui viaggi oltre il confine.
- Imboscata: fame esatta prima del combattimento; sconfitta → cibo pro-rata; vittoria → stesso piano.
- Arrivo e teleport: fame fino al chilometro e cibo (b)/(c).

</code_context>

<specifics>
## Specific Ideas

- Verbatim dell'utente: «è ingiusto buttare un personaggio in uno scontro come se avesse percorso 100 km senza cibo, se è solo all'inizio del percorso. Anche la vita del personaggio si dovrebbe modificare gradualmente»; «il cibo non viene consumato finché non serve. Se il viaggio prevede 400 km ma io ne faccio solo 30 perché fallisco l'imboscata, devo avere consumato il cibo necessario solo per i 30»; «La vita avviene allo sweep, una volta superato il chilometro scoperto dal cibo posseduto. il cibo lo rimuoviamo quando vieni sconfitto, quando arrivi a destinazione e quando hai finito i chilometri coperti»; «Calcoliamo come oggi la combinazione più efficiente e con meno sprechi».
- Scartato dall'utente nella conversazione precedente perché troppo complesso: pasti pianificati con il chilometro di ciascuno, debito di fame con tetto «massimo meno debito», interpolazione della vita e della dispensa nella FE, dispensa «riservata». Il disegno di questa fase è la versione in tre righe: piano salvato, perdita incrementale allo sweep, cibo in blocco in tre momenti.
- Numeri della Phase 14 (invariati): fabbisogno = ⌈durata / 180 000⌉ power; senza cibo 16 km → 136 HP, 50 → 1275, 100 → 5050; un rookie (1000 HP) regge ≤ 44 km scoperti.

</specifics>

<deferred>
## Deferred Ideas

- **Debito di fame / cure che non superano la vita d'ingresso in battaglia**: rinviato dall'utente, la ricarica delle pozioni basta per ora.
- **Riga in app «Cibo per altre 3 h, poi fame»**: non voluta («Niente di nuovo»).
- **Deviazione che consuma e affama**: non scelta.
- **Fame fuori dal viaggio**: fuori scope dalla Phase 14.

</deferred>

---

*Phase: 20-cibo-e-vita-progressivi*
*Context gathered: 2026-11-09*
