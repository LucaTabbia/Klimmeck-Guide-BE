---
phase: 21-premi-per-rango-e-soccorsi
status: passed
executed: 2026-11-13
device: Samsung SM-S938B via USB, app dal ramo della FE Phase 20 (`feat/20-rank-specific-prizes`)
backend: `develop` con la Phase 21 (riavvio reale dal ramo, poi da `develop`), più il ramo del quick 261113-aql durante la UAT; Redis locale spento (coprono gli sweep)
steps_total: 12
steps_passed: 12
---

# Phase 21 — UAT su device (insieme alla FE Phase 20)

Guidata dall'orchestratore un passo alla volta. Due utenti: l'oste con un legend e un secondo utente il cui personaggio è stato portato temporaneamente a mage senza armi né magie (backup e ripristino a fine UAT). L'identità di sviluppo del BE è stata scambiata riavviando il processo con la variabile del solo processo, senza toccare i file di ambiente. Semine con script fuori repo, tutte al POI città dei personaggi e con durata di 30 secondi: un boss misto (posti hero 1 + mage 1, due blocchi premio), una dungeon da 4 gruppi, una da 2 gruppi, un lavoro artificiale con un nemico. Le risposte dell'utente sono verbatim; i valori «a DB» li ha letti l'orchestratore.

**Boot reale:** avvio pulito, tipi nuovi serviti, `src/schema.gql` invariato dopo il boot, report dei premi di gruppo muto (nessuna quest di gruppo da correggere).

| # | Passo | A DB | Utente | Esito |
|---|-------|------|--------|-------|
| 1 | Foglio del boss misto visto dal legend: posti per titolo, blocco hero (ripiego D-18) | — | «pass» | pass |
| 2 | Il legend si iscrive: attesa del gruppo 1/2 | iscrizione col titolo `legend` | «pass» | pass |
| 3 | Lo stesso boss visto dal mage: blocco mage | — | «vedo Eroe 0/1», poi «pass» dopo il fix dell'app (la riga dei posti non ripiegava il legend sul posto hero; il BE era corretto) | pass |
| 4 | Party completo, boss vinto | il mage riceve 1 oro + 1 oggetto del suo blocco; il legend 5 oro + 2 oggetti del blocco hero; «Boss … risolto per 2 partecipanti» | «pass» | pass |
| 5 | Sconfitta senza soccorso (D-19) su un lavoro artificiale con un nemico | `failure`, vita 1, corsia libera, nessuna aid | «pass» | pass |
| 6 | Dungeon da 4 gruppi persa al 2° turno | esito 8 / 1 / 2 / `fight`; aid con `rescue.turn { 1, fight, 8 }` e un quarto del premio (25 argento, 20 xp, 1 oggetto su 4) | «Pass su tutto» | pass |
| 7 | Dal legend: dungeon bloccata, foglio dell'aid con la quota, esito del boss col blocco hero | — | «pass su tutto, ma nella quest aid vedo 4 arbusto maligno. Non dovrei vederne solo 1?» | pass (nemici corretti dal quick 261113-aql) |
| 8 | Soccorso vinto | soccorritore 8 / 2 / 2 / `fight`, tappe 1 su 4, 25 argento + 1 oggetto; ferito `rescued` senza turni; aid conclusa | «pass tutto il resto+» | pass |
| 9 | Il mage cade di nuovo (BE col quick task) | aid nuova: durata 7 500 ms su 30 000, un quarto del premio, 4 gruppi a DB | «pass» | pass |
| 10 | Foglio dell'aid nuova: un solo nemico, dungeon bloccata | — | «Su Tempo richiesto vedo ",7" secondi», «Tutto il resto pass» (formato della durata corretto nell'app) | pass |
| 11 | Durata corretta e soccorso vinto | secondo soccorso riuscito, nessuna aid aperta | «pass» | pass |
| 12 | Dungeon intera vinta | esito 8 / 8 / 8 / `fight`, tappe 4 su 4, premio pieno | «pass per i piani e ricompense» | pass |

## Regole nate nella UAT (utente, verbatim)

- «Quando un personaggio attiva una aid a partire da una hunt o da un dungeon (quindi le uniche quest ripetibili che possono creare una aid) la quest che le ha generate deve risultare strappata e quindi non accettable, finché il soccorso non va a buon fine.» → quick 261113-aql (supera D-15): bloccata per tutti, torna libera quando l'aid si chiude.
- «nella quest aid vedo 4 arbusto maligno. Non dovrei vederne solo 1?» → l'aid di dungeon mostra sul filo solo i gruppi affrontati.
- «Naturalmente anche il tempo richiesto per il soccorso dev'essere corretto in base a quanto dungeon è stato completato. Se sei al secondo turno su 8, allora dev'essere un quarto. 1 ora dungeon completo -> 15 minuti aid» → durata dell'aid di dungeon in proporzione.
- «Nelle quest boss e dungeon vorrei che il nemico presnete sul foglio della quest fosse il nemico più forte. Nel caso del dungeon bisogna anche asssicurarsi che il nemico più forte sia presente nell'ultimo turno di combattimento (come un boss di un dungeon)» → il foglio va già bene (ritratto del più forte per xp); dati riordinati a DB (40 dungeon su 40) e report al boot.
- «Perché il lavoro finisce in una sconfitta? Il lavoro non ha possibilità di fallire, puoi solo ottenere una vittoria» → nessun lavoro reale ha nemici; il BE resta com'è (decide il contenuto).
- Sul testo del push dell'archiviatore: «No, va bene così».

## Non osservato su device (coperto dalla suite)

Rilascio dell'archiviatore (D-27), magia a un non caster (D-25), sconfitta in esplorazione (il segnaposto la supera sempre, D-29), esito `rescued` visto sul telefono dal ferito (verificato a DB), viewer senza personaggio.

## Pulizia

Personaggio del secondo utente ripristinato dal backup; quest di prova, esiti e riferimenti rimossi; nessuna aid a DB. Il personaggio dell'oste conserva i guadagni dei test.
