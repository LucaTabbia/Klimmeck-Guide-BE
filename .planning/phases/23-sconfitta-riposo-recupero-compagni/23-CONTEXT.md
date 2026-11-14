# Phase 23: Sconfitta, riposo e recupero dei compagni - Context

**Gathered:** 2026-11-14 (discuss interattivo fatto nella FE Phase 22, `Klimmeck-Guide/.planning/phases/22-companion-defeat-rest-and-recovery/22-CONTEXT.md`, stessa numerazione D-01..D-21: dove serve il verbatim dell'utente vale quel file)
**Status:** Ready for planning — ramo `feat/23-sconfitta-riposo-recupero-compagni` impilato su `feat/mission-start-push` (PR #41)

<domain>
## Phase Boundary

Il BE diventa l'unica fonte di verità per lo stato dei compagni: sconfitta (vita al minimo in uno scontro), riposo con recupero lineare nel tempo, pozioni sul compagno con attesa propria, nome del compagno, e le regole di viaggio dopo un'imboscata (strada residua a piedi, push per ogni imboscata, ridirezionamento per fame). Ambito esteso dall'utente nel discuss: nome del compagno (D-18..D-21) e regole di viaggio (D-13..D-16).

Fuori ambito: il motore di combattimento vero e il motore a piani delle dungeon (li scrive l'utente; resta il segnaposto dietro la stessa porta), ferite dei compagni.

</domain>

<decisions>
## Implementation Decisions

### Tempi di recupero
- **D-01 (utente):** ogni pet a catalogo ha il suo tempo di recupero pieno (dal minimo a vita piena) a DB. Semina da una tabella calcolata su **rarità + `maxXp` + `maxLifePoints`** (44 pet), rivista dall'utente su file prima della scrittura a DB dopo la merge; poi «la mano vince». Nessun migratore né seeder resta nel repo.
- **D-02 (utente):** un solo orologio, recupero lineare. Sconfitto = riposo forzato dal minimo; non equipaggiabile finché non è a vita piena (rifiuto con codice proprio).
- **D-03 (utente, «il compagno non è mai a vita 0, il minimo è 1 (non può morire un pet)»):** la vita del compagno non scende sotto 1; sconfitto = arrivato al minimo in uno scontro (marcatore esplicito sulla voce posseduta: vita 1 da sola non basta a distinguerlo). Vale in ogni punto in cui uno scontro si risolve: quest, boss, dungeon, imboscate, soccorsi, completamento guidato.
- **D-04 (utente):** recupera ogni compagno posseduto fuori dallo slot; quello equipaggiato mai. Il ferito non sconfitto si riequipaggia in ogni momento con la vita raggiunta (esempio dell'utente: 100 minuti da 1 a 100; a riposo da 20 per 20 minuti → 40).

### Pozioni
- **D-05 (utente):** `useItem` accetta un compagno come bersaglio; l'attesa è **del singolo compagno** (una data per voce posseduta), indipendente da `status.potionRecoveryUntil` del personaggio in entrambi i sensi. Stesse regole delle pozioni del personaggio (nessun consumo se non farebbe nulla, mai in missione in corso).
- **D-06 (utente):** il compagno sconfitto rifiuta le pozioni.
- **D-07 (utente):** bersagli = compagni posseduti sotto la vita piena e non sconfitti, equipaggiati o a riposo.

### Esiti, push, sequenze
- **D-10 (utente):** l'esito di uno scontro e il report di un'imboscata portano la vita del compagno dopo lo scontro e la sua sconfitta (con la data di ritorno).
- **D-11 (utente):** push nuova solo quando un compagno **sconfitto** torna a vita piena (categoria propria, col nome del compagno se c'è).
- **D-12 (utente):** in una dungeon il compagno sconfitto è fuori dai piani successivi; lo slot si svuota a fine missione.
- **D-13 (utente, «Resto del viaggio a piedi»):** cavalcatura sconfitta in un'imboscata vinta: esce subito dallo slot e la strada residua dal punto dell'imboscata si ricalcola a piedi (durata, arrivo, fabbisogno di cibo, lavoro di completamento ripianificato). Supera «velocità fotografata alla partenza» per questo caso.
- **D-14 (utente):** push per **ogni** imboscata subita, vinta o persa, con o senza compagno; se il compagno cade la push lo dice. Supera BE Phase 15 «nessun push in più».
- **D-15 (utente):** i report delle imboscate sono leggibili anche a viaggio in corso (la FE li mostra all'apertura della mappa); serve sapere quali sono già stati visti.
- **D-16 (utente):** dopo il ricalcolo, se con cibo e vita rimasti il personaggio non arriverebbe vivo alla meta (stesso controllo della partenza), viene ridiretto alla città più vicina per strada come dopo una sconfitta in imboscata; la quest verso cui viaggiava segue la regola della sconfitta (abbandonata).
- **D-17 (utente):** nel completamento guidato la simulazione propone la vita del compagno di ogni partecipante, l'oste la corregge (minimo = sconfitto), il completamento applica le stesse regole.

### Nome del compagno
- **D-18/D-19 (utente):** ogni compagno posseduto può avere un nome, dato all'acquisizione (acquisto o premio, saltabile) o più tardi, e modificabile; mutation dedicata.
- **D-20 (utente):** dove il BE scrive testi (push) usa il nome se c'è, altrimenti la specie.
- **D-21 (utente):** stesse regole del nome del personaggio: lunghezza, caratteri, stesso filtro dei contenuti; rifiuto con codice proprio.

(D-08 e D-09 sono solo FE: foglio della pozione, vita che sale dal vivo interpolata fra le date servite dal BE.)

### Claude's Discretion
- Forma sul filo (campi di `OwnedPet` e `Pet`, bersaglio di `useItem`, voci del compagno in `QuestResult` / report d'imboscata / bozza della missione, codici), decisa nel plan e riportata in `BACKEND-NOTES.md`.
- Calcolo della vita a riposo (pigro a lettura/scrittura o sweep), a patto che la FE riceva date da cui interpolare; pianificazione della push «in forze».
- Vendere un compagno a riposo o sconfitto resta ammesso.

</decisions>

<canonical_refs>
## Canonical References

- `../Klimmeck-Guide/.planning/phases/22-companion-defeat-rest-and-recovery/22-CONTEXT.md` — discuss completo, verbatim dell'utente
- `.planning/ROADMAP.md` §Phase 23 — regole dell'utente
- `.planning/phases/15-*/15-CONTEXT.md` (imboscate), `18-quest-heal-per-taglia/18-CONTEXT.md` D-15..D-19 (pozioni), `19-revisione-dei-modelli/19-CONTEXT.md` (`ownedPets`, xp), `20-cibo-e-vita-progressivi/20-CONTEXT.md` (piano del cibo sul viaggio), `22-completamento-guidato-missioni/22-CONTEXT.md` (bozza, simulazione, blocco)
- Codice: `src/characters/pets/`, `src/models/character/owned-pet.model.ts`, `src/models/pet.model.ts`, `src/characters/items/item-use.plan.ts`, `src/quests/outcomes/combat/combat-context.ts`, `src/travel/ambush/`, `src/travel/food/travel-food.ts`, `src/travel/travel-planner.service.ts`, `src/travel/travel-timing.ts`

</canonical_refs>

<specifics>
## Specific Ideas

- Il cibo dipende dalla durata (1 power ogni 3 minuti): il ricalcolo a piedi aumenta il fabbisogno, da qui D-16.

</specifics>

<deferred>
## Deferred Ideas

- Push per il compagno ferito che finisce il riposo (rifiutata, D-11).

</deferred>

---

*Phase: 23-sconfitta-riposo-recupero-compagni*
*Context gathered: 2026-11-14*
