# Phase 15: Imboscate in viaggio - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-06
**Phase:** 15-imboscate-in-viaggio (BE), discussa insieme alla FE Phase 16 dal repo FE
**Areas discussed:** Probabilità e soglia; Nemici dell'imboscata; Esito: vittoria e sconfitta; Consegna e notifiche
**Mode:** interattivo, 7 chiamate `AskUserQuestion` condivise con il discuss FE; fatti letti prima delle domande (due agenti Explore sul codice BE e FE, inventario DB di sola lettura: nemici per zona e xp, POI per tipo, città, strade, personaggi, risultati; tabella Facile/Medio del world building; handoff Phase 8 §8 per le distanze). La parte FE è in `../Klimmeck-Guide/.planning/phases/16-travel-ambushes/16-DISCUSSION-LOG.md`.

---

## Area selection

L'utente ha selezionato tutte e quattro le aree BE e tutte le aree FE.

## Fondazione 1: calibrazione della probabilità

Modello proposto: rischio indipendente per km, p = 1 − (1 − h)^km, h pesato sulla quota notturna (22–06 Europe/Rome).

| Option | Description | Selected |
|--------|-------------|----------|
| Media: 0,4%/km giorno, 0,8% notte (Recommended) | 16 km 6%/12%, 50 km 18%/33%, 204 km 56%/81%, 506 km 87%/98% | |
| Morbida: 0,2%/km giorno, 0,6% notte | 16 km 3%/9%, 50 km 10%/26%, 204 km 34%/71%, 506 km 64%/95% | ✓ |
| Dura: 0,8%/km giorno, 1,6% notte | 16 km 12%/23%, 50 km 33%/55%, 204 km 81%/96% | |

## Fondazione 2: nemici dell'imboscata

| Option | Description | Selected |
|--------|-------------|----------|
| Composizione della Phase 13 nella fascia [Facile, Medio] (Recommended) | Singolo nella fascia o branco di deboli con somma nella fascia, pool di zona + `all` | ✓ |
| Solo singolo con PE ≤ Medio, nessun minimo | Una Iena può tendere un'imboscata a un legend | |
| Singolo nella fascia [Facile, Medio] | Dai gradi alti nessun singolo adatto | |

Correzione nel blocco successivo: i conteggi mostrati nella prima domanda confrontavano i PE del world building con `Enemy.xp` già scalato (× 0,1408); i numeri corretti (livello 1 → 4–7 xp, 19 singoli; 5 → 35–70, 31; 13 → 155–310, 26; 20 → 394–803, 17) sono stati esposti e la scelta è stata confermata.

## Probabilità e soglia

| Option | Description | Selected |
|--------|-------------|----------|
| 10 km (Recommended) | Tratte brevissime sicure; marker (12 km) e città vicine (16 km) a rischio basso | ✓ |
| 20 km | Quasi tutti i viaggi verso i marker sicuri | |
| Nessuna soglia | Solo la probabilità per km | |

| Option | Description | Selected |
|--------|-------------|----------|
| Al massimo una (Recommended) | Un solo sorteggio alla partenza | |
| Una ogni 100 km | Un sorteggio indipendente per tratto di 100 km | ✓ (poi precisata) |

Prima lettura proposta (tratti fissi di 100 km con sorteggio e istante propri) **respinta** dall'utente in free text: «No, semplicemente vorrei che ci fosse la possibilità di avere più imboscate. Ti faccio un esempio: Su un percorso di 300km, i primi 100 non avviene nulla, poi hai un'imboscata. Finita l'imboscata si risorteggia e passano altri 130 km prima della successiva. Poi il personaggio riceve un'imboscata dopo 50km (l'ultimo sorteggio è andato male) e nell'ultimo tratto non ne riceve».

Seconda lettura (sorteggio km per km dalla partenza, risorteggio dal punto dopo ogni vittoria, deviazione sicura, 10 km di soglia su viaggio e residuo, una sola imboscata pendente):

| Option | Description | Selected |
|--------|-------------|----------|
| Sì, così | Modello km per km con risorteggio | ✓ |
| Sì, ma anche la deviazione può essere tesa | Si può perdere due volte di fila | |
| Spiega meglio | | |

## Nemici dell'imboscata

| Option | Description | Selected |
|--------|-------------|----------|
| Unione dei tipi dei POI entro 10 km (Recommended) | Tutti i POI entro 10 km, poi il più vicino, poi `all` | |
| Solo il POI più vicino | I tipi del singolo POI più vicino; `all` di riserva | ✓ |
| Tipi di tutta la rotta | Unione lungo l'intera polilinea | |

| Option | Description | Selected |
|--------|-------------|----------|
| Animali inclusi + `city` + zona (Recommended) | Zona + animali della zona + habitat `city`; mai leggendari | ✓ |
| Come la Phase 13 (senza animali) | Stesso pool delle quest generate | |
| Solo animali e banditi (`city`) | Niente mostri di zona salvo `all` | |

## Esito: vittoria e sconfitta

| Option | Description | Selected |
|--------|-------------|----------|
| Come una quest enemy del rango (Recommended) | 150 rame + 40 xp × moltiplicatore del rango + Σ xp dei nemici | ✓ |
| Metà della quest enemy | 75 rame + 20 xp × moltiplicatore + Σ xp | |
| Solo gli xp dei nemici | Nessuna moneta | |

| Option | Description | Selected |
|--------|-------------|----------|
| HP e ferite del motore applicati subito (Recommended) | Gli HP cambiano all'istante, il report lo racconta all'arrivo | ✓ |
| Vittoria senza danni | Solo la sconfitta ferisce | |

| Option | Description | Selected |
|--------|-------------|----------|
| Sì, meta compresa (Recommended) | Città più vicina per strada, anche la meta o la partenza | ✓ |
| Mai la meta: si torna sempre indietro | | |
| Sempre la città di partenza | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Nessun costo in più (Recommended) | Né cibo né HP per la tratta deviata | ✓ |
| La tratta deviata paga come un viaggio | Regola della Phase 14 sul tratto nuovo | |

## Consegna e notifiche

| Option | Description | Selected |
|--------|-------------|----------|
| Tutto all'arrivo (decisione del 29/10) | Nessun push al momento; un foglio per imboscata in coda all'arrivo | ✓ |
| Ogni report subito (Recommended) | Foglio e push «Imboscata!» appena risolta | |
| Push al momento, foglio all'arrivo | | |

Push all'arrivo: alla prima proposta l'utente ha chiesto «Spiega meglio»; riproposta con la spiegazione del flusso odierno (`travelEnd` solo per i viaggi liberi, arrivo al marker muto, `questEnd` dei risultati):

| Option | Description | Selected |
|--------|-------------|----------|
| Solo `travelEnd` come oggi (Recommended) | I report non mandano push propri; dopo una vittoria verso un marker nessun push | ✓ |
| `travelEnd` + un push per report | 1 + N push | |
| Push dedicato «Imboscate» | Categoria nuova al posto di `travelEnd` | |

Avviso di sconfitta (dalla domanda FE sulla Mappa, free text dell'utente: «Nel caso in cui tu venga sconfitto (e quindi deviato verso un paese diverso da quello della metà) vorrei una notifica e un banner nuovo»); lettura proposta: push di categoria nuova + banner solo con deviazione verso una città diversa dalla meta:

| Option | Description | Selected |
|--------|-------------|----------|
| Sì, così | Solo sulla sconfitta con deviazione | |
| Sì, ma anche quando la città più vicina è la meta | Ogni sconfitta avvisa | ✓ |
| Spiega meglio | | |

## Claude's Discretion

Nomi, granularità del percorso km per km, id dell'imboscata, forma dello snapshot interno, collocazione del sorteggio (builder o post-commit), variante del pool con gli animali, innesto della fascia per livello nella composizione.

## Deferred Ideas

Imboscate sulla deviazione, costi sulla tratta deviata, push per report o categoria d'arrivo, loot dagli assalitori, lore da vittoria in imboscata (BE Phase 16), visibilità GM, calibrazione per zona, fascia «Difficile» di notte.
