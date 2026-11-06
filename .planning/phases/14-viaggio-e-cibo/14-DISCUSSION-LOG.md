# Phase 14: Viaggio e cibo - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-05
**Phase:** 14-viaggio-e-cibo (BE), discussa insieme alla FE Phase 15 dal repo FE
**Areas discussed:** Fabbisogno, arrotondamenti e soglia; Selezione del cibo a scarto minimo; Anteprima per l'accettazione quest; Rifiuto, codice e preview «affamata»
**Mode:** interattivo, 5 chiamate `AskUserQuestion` condivise con il discuss FE; fatti letti prima delle domande (due agenti Explore sul codice BE e FE, inventario DB di sola lettura: cibi `hunger`, strade, pet, personaggi; handoff Phase 8 §8 per le durate). La parte FE è in `../Klimmeck-Guide/.planning/phases/15-travel-food/15-DISCUSSION-LOG.md`.

---

## Area selection

L'utente ha selezionato tutte e quattro le aree BE e tutte e quattro le aree FE.

## Fondazione: scale

| Option | Description | Selected |
|--------|-------------|----------|
| 3 minuti per power (Recommended) | Decisione del 2026-10-29; power del catalogo tarati su questa scala; città vicina ≈ 1 razione da 100, attraversata ≈ 7 | ✓ |
| 5 minuti per power | Città vicina ≈ 33 power, attraversata ≈ 420 | |
| 10 minuti per power | Città vicina ≈ 16 power, attraversata ≈ 210 | |

| Option | Description | Selected |
|--------|-------------|----------|
| Triangolare n(n+1)/2 (Recommended) | Come nella ROADMAP: 16 km → 136 HP, 204 km → 20 910; rookie ≤ 44 km scoperti, legend ≤ 282 | ✓ |
| Lineare: 1 HP per km scoperto | 204 km → 204 HP: il cibo diventa quasi irrilevante | |
| Triangolare con tetto per km | Costo per km fino a un massimo, poi fisso | |

## Fabbisogno, arrotondamenti e soglia

| Option | Description | Selected |
|--------|-------------|----------|
| Per eccesso (Recommended) | 4,36 → 5 km → 15 HP: ogni km iniziato si paga intero | ✓ |
| Per difetto | 4,36 → 4 km → 10 HP | |
| Al più vicino | 4,36 → 4, 4,6 → 5 | |

| Option | Description | Selected |
|--------|-------------|----------|
| Mangia tutto, il resto è scoperto (Recommended) | Consuma i 20, perde HP sui km non coperti; rifiuto solo se non arriverebbe con ≥ 1 HP | ✓ |
| Non mangia nulla, tutto scoperto | Il cibo resta nello zaino se non copre l'intero fabbisogno | |
| Rifiuta sempre senza cibo sufficiente | Niente partenza finché il cibo non copre tutto | |

## Selezione del cibo a scarto minimo

| Option | Description | Selected |
|--------|-------------|----------|
| Meno pezzi (Recommended) | 50+10 batte 20+20+20; a parità di pezzi vince il minor valore di vendita | ✓ |
| Minor valore di vendita | Conserva il cibo pregiato | |
| Pezzi più piccoli prima | Tiene i pezzi grandi per le traversate | |

| Option | Description | Selected |
|--------|-------------|----------|
| Lo mangia comunque (Recommended) | Il server copre sempre se può; il giocatore vede l'anteprima e può rinunciare | ✓ |
| Tetto allo spreco | Se lo scarto supera il fabbisogno non mangia e i km restano scoperti | |
| Mangia solo se lo scarto è sotto una costante | Es. ≤ 50 power | |

## Anteprima per l'accettazione quest

| Option | Description | Selected |
|--------|-------------|----------|
| Query owner-only dedicata (Recommended) | es. `questTravelPreview(request: { id, questId })`, chiamata all'apertura del foglio, sempre fresca | ✓ |
| Campo sulla Quest | es. `Quest.travelCost` risolto per il viewer, fotografato al caricamento del Tabellone | |

## Rifiuto, codice e preview «affamata»

| Option | Description | Selected |
|--------|-------------|----------|
| Risponde coi numeri e un flag (Recommended) | cibo, HP persi e `arrivesAlive: false`; «Parti»/swipe spenti sul FE; `startTravel`/`acceptQuest` restano la difesa col codice | ✓ |
| Lancia il codice di rifiuto come la partenza | Coerente con Phase 8 D-11 ma il giocatore non vede quanto gli manca | |

| Option | Description | Selected |
|--------|-------------|----------|
| Parte con la nuova selezione (Recommended) | L'anteprima è informativa; il filtro riafferma le quantità ricalcolate | ✓ |
| Rifiuta e fa riaprire l'anteprima | Codice dedicato quando la selezione differisce; serve passare l'anteprima nella mutation | |

## Chiusura

- Frase di fame (free text dell'utente sul foglio FE): «Non hai cibo a sufficienza per il viaggio» — confermata «ovunque» (fogli, banner; usata anche come messaggio del codice `TRAVEL_STARVING`).
- «C'è altro da aggiungere?» → «No, scrivi i CONTEXT».

## Claude's Discretion (registrato)

Algoritmo della selezione, nomi del contratto (REPO-RULES), posizione del rifiuto per fame nell'ordine dei codici, gestione del filtro fallito per cibo/HP, populate di `food.item`, log, fixture.

## Deferred

Scelta manuale del cibo, tetto allo spreco, rimborso del cibo, fame fuori dal viaggio, `hpAfter` sul filo, HP sulla Mappa (FE).
