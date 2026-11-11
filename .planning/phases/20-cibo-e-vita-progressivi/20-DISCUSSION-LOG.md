# Phase 20: Cibo e vita progressivi in viaggio - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-09
**Phase:** 20-cibo-e-vita-progressivi (BE, nessuna companion FE), discussa dal repo FE nella stessa sessione delle Phase 18 e 19 (branch impilato sulla 19)
**Areas discussed:** Metronomo; Curva; Pasti; Deviazione · Conferma delle risposte libere; Collocazione; In app
**Mode:** interattivo, 2 chiamate `AskUserQuestion` (4 + 3 domande). Il tema era stato esplorato e poi rinviato all'inizio della sessione («rischia di complicare tutto di molto»); riaperto dall'utente a fine sessione («serve la fase sul consumo progressivo del cibo e della vita… Dobbiamo capire come farla funzionare»). Fatti letti prima: `travel-food.ts` (regole, piano, funzioni), `travel-food.updates.ts` (consumo alla partenza), `travel-sweeper.ts` (passo ogni 60 s), `ambush-sweeper.ts` (`at`/`km`), `travel-completion.service.ts`, `active-travel.model.ts`, BE-AMBUSH-05, Phase 14 D-01..D-12.

---

## Metronomo

| Option | Description | Selected |
|--------|-------------|----------|
| Sweep ogni minuto + eventi esatti (Recommended) | Funzione pura «stato al km», sweep scrive pasti e vita, eventi esatti, FE mostra il DB | |
| Solo agli eventi | Nessuna scrittura periodica | |
| Curva sul filo, la FE interpola | Logica duplicata nell'app | |
| Other (utente) | «La vita avviene allo sweep, una volta superato il chilometro scoperto dal cibo posseduto. il cibo lo rimuoviamo quando vieni sconfitto, quando arrivi a destinazione e quando hai finito i chilometri coperti» | ✓ |

## Curva

| Option | Selected |
|--------|----------|
| Cibo prima, fame in coda (Recommended) | ✓ |
| Fame spalmata su tutto il percorso | |

## Pasti

| Option | Selected |
|--------|----------|
| Dal pezzo più piccolo al più grande (Recommended) | |
| Dal più grande al più piccolo | |
| Nell'ordine del piano | |
| Other (utente) | «Calcoliamo come oggi la combinazione più efficiente e con meno sprechi» ✓ → selezione a scarto minimo al momento del consumo sul fabbisogno dei km percorsi, nessuna lista di unità salvata |

## Deviazione

| Option | Selected |
|--------|----------|
| Resta senza cibo e senza fame (Recommended) | ✓ |
| Consuma e affama come il viaggio | |

## Conferma (interpretazione delle risposte libere)

Vita incrementale allo sweep solo nel tratto scoperto, esatta all'imboscata e all'arrivo, mai sotto 1; cibo in blocco in tre momenti (confine dei km coperti, arrivo, sconfitta con selezione sul fabbisogno dei km percorsi) → **«Sì, è corretto»** ✓ (alternativa «pezzo per pezzo» scartata).

## Collocazione

| Option | Selected |
|--------|----------|
| BE 20 da sola, dopo la 19 (Recommended) | ✓ |
| Coppia BE 20 + FE 20 | |
| Prima della 19 | |

## In app

| Option | Selected |
|--------|----------|
| Niente di nuovo (Recommended) | ✓ |
| Una riga sul viaggio («Cibo per altre 3 h, poi fame») | |
