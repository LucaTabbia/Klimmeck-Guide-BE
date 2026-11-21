# Phase 25: Storie dei partecipanti e ferite dell'oste - Context

**Raccolto:** 2026-11-21 (discuss interattivo, congiunto con la FE Phase 24 «Participants' Stories and Innkeeper Wounds»). Il file autorevole è `Klimmeck-Guide/.planning/phases/24-participants-stories-and-innkeeper-wounds/24-CONTEXT.md`: stessa numerazione D-01..D-17; qui la parte che tocca il BE.
**Stato:** pronto per la pianificazione — ramo `feat/25-storie-dei-partecipanti-e-ferite-dell-oste` da `develop`.

<domain>
## Confine della fase

Il completamento guidato di `story` e `worldMission` (Phase 22) serve all'oste i background dei partecipanti e, alla chiusura, scrive un'aggiunta facoltativa al background di ciascuno. Le ferite che l'oste infligge di suo pugno portano la loro origine: nessuna cura le tocca, solo l'oste le toglie.

Fuori ambito: modifica o cancellazione delle voci di background esistenti, malus delle ferite, motore di combattimento vero.

</domain>

<decisions>
## Decisioni

### Lettura dei background
- **D-01/D-02 (utente):** l'oste legge il background di ogni partecipante **prima** di avviare la missione, coi giocatori ancora liberi; la lettura non crea la bozza. Serve quindi una lettura riservata all'oste dei background dei partecipanti di una richiesta in sospeso, disponibile senza bozza (forma a discrezione: campo su `missionParticipants` o query dedicata).

### Aggiunte ai background
- **D-05 (utente):** le aggiunte si scrivono nell'ultimo passo, dopo il riepilogo; vivono nella bozza (salvate e riservite come il resto) e la chiusura le scrive nella **stessa transazione** del completamento.
- **D-06 (utente, verbatim):** «Le aggiunte sono per partecipante, non una sola per tutti»: una per partecipante, facoltativa; vuota = nessuna scrittura.
- **D-07 (utente):** al massimo 1000 caratteri per aggiunta, stessa regola di conteggio del background della creazione (che resta a 400); validazione sul BE, codice d'errore proprio.
- **D-08:** l'aggiunta diventa una voce nuova in coda a `infos.background`; le voci esistenti non si toccano.
- **D-09 (utente):** il `QuestResult` del partecipante dice se il suo background ha ricevuto un'aggiunta (nome del campo nel plan): il FE ne ricava la riga del foglio del risultato. Nessuna push dedicata.
- **D-10:** solo flusso guidato (`story`, `worldMission`).

### Ferite dell'oste
- **D-11 (utente, verbatim):** «Le ferite applicate dall'innkeeper sono rimuovibili solo dall'innkeeper, non sono influenzabili da quest heal, pozioni o premi».
- **D-12 (utente):** è dell'oste la ferita aggiunta a mano nelle correzioni di una risoluzione, di qualunque tipo di quest (flusso guidato o richiesta in sospeso semplice). Nel flusso guidato: le ferite dell'esito corretto che la simulazione non ha prodotto. Le ferite simulate lasciate come sono restano normali.
- **D-13 (utente; emendata il 2026-11-21, verbatim: «Le correzioni possono rimuovere qualsiasi tipo di ferita, quelle dell'oste e non»):** le correzioni di ogni risoluzione (flusso guidato e richieste in sospeso semplici) possono togliere qualunque ferita del partecipante, dell'oste o normale: l'input delle correzioni impara a togliere (oggi porta solo aggiunte) e la lettura dell'oste dice quali ferite del partecipante sono dell'oste.
- **D-14:** nessuna cura raggiunge una ferita dell'oste: cura della quest heal, pozione dal Diario, cura dentro un premio (blocco del titolo, premio guidato `cure`) e ogni altra via trovata dalla ricerca. `injuriesHealed` non la elenca mai; una cura che troverebbe solo ferite dell'oste è senza effetto, e gli avvisi e i rifiuti «senza effetto» esistenti la trattano così.
- **D-15 (utente):** il giocatore la riconosce («Troppo grave per essere curata»): il personaggio servito dice quali sue ferite sono dell'oste.
- **D-16 (default tecnico):** il personaggio conserva l'origine delle ferite; forma nel plan, additiva sul filo se possibile (per esempio una seconda lista col sottoinsieme dell'oste: le ferite già a DB restano normali, nessuna migrazione). I malus non dipendono dall'origine. **Emendata il 2026-11-21 (utente, verbatim: «l'oste per rendere non curabile una ferita curabile già presente deve prima rimuoverla e poi aggiungerla di nuovo»):** una ferita già presente non si aggiunge di nuovo e non cambia origine da sola; per farla diventare dell'oste la si toglie e la si riaggiunge nella stessa correzione.
- **D-17 (superata il 2026-11-21 dall'emendamento di D-13):** l'assunzione è ritirata: ogni ferita si toglie dalle correzioni.

</decisions>

<canonical_refs>
## Riferimenti

`src/quests/guided/` (bozza, salvataggio, `guided-outcome.ts`, `guided-completion.service.ts`), `src/quests/outcomes/gm-overrides.ts`, `src/quests/outcomes/injuries/`, `src/quests/outcomes/outcome-plan.ts`, `src/characters/items/item-use.plan.ts`, `src/travel/ambush/ambush-plan.ts`, `src/models/character/character-status.model.ts`, `src/models/character/character-infos.model.ts`, `src/characters/creation/create-character-input.validator.ts`.

</canonical_refs>
