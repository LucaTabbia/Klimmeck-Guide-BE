---
phase: 20-cibo-e-vita-progressivi
status: passed
executed: 2026-11-13
device: Samsung SM-S938B via USB, app installata com'è (nessun cambio FE)
backend: ramo `feat/20-cibo-e-vita-progressivi` (HEAD `42a16777`), build e riavvio reale sulla porta 3001, Redis locale spento (coprono gli sweep)
steps_total: 7
steps_passed: 6
steps_skipped: 1
---

# Phase 20 — UAT su device

Guidata dall'orchestratore un passo alla volta sul piano del handoff (`BACKEND-NOTES.md` §4). Personaggio di prova: il legend dell'utente, senza pet, con la gamba destra rotta (malus di movimento). Le risposte dell'utente sono riportate verbatim; i valori «a DB» li ha letti l'orchestratore con script di sola lettura fuori dal repo. I tempi dei viaggi sono stati spostati a DB (`startTime` ed `endTime` dello stesso intervallo, `duration` invariata), mai i campi del piano del cibo.

**Boot reale:** avvio pulito dal ramo, indice `character_active_travel_food` presente sul DB reale dopo il boot. Nessun migratore.

| # | Passo | A DB | Utente | Esito |
|---|-------|------|--------|-------|
| 1 | Partenza con poco cibo: Valantar → Glilrid, 18,255 km, 248 min, 1 cibo da 50 comprato al negozio | piano salvato `needed` 83, `uncoveredKm` 8, `coveredKm` 10,255, `hpLostTotal` 36, `settledKm` 0, `foodConsumedAt` nullo; vita 36376 e cibo invariati | «pass» | pass |
| 2 | Confine dei km coperti (viaggio portato al km 10,4) | entro un minuto `Sweep della fame: 1 viaggi assestati`; cibo tolto, `foodConsumedAt` valorizzato, vita ancora 36376 | «pass» | pass |
| 3 | Fame a scatti e pozione in viaggio (km 11,3 → 12,3 → cura → 13,3) | 36375 (−1), 36373 (−2); dopo la cura da 500 fatta dall'utente 36873; scatto successivo 36870 (−3 dal valore curato) | «36873 pass» | pass |
| 4 | Arrivo | viaggio completato dallo sweep, posizione Glilrid, vita 36840: fame totale 1 + 2 + 3 + 30 = 36, uguale all'anteprima della partenza | «pass» | pass |
| 5 | Sconfitta in un'imboscata seminata al km 14 (Glilrid → Valantar, 1 cibo da 45, confine al km 9,255; potere del personaggio azzerato a DB per la sola durata dello scontro, con backup) | lo sweep della fame assesta fino al km dell'imboscata pendente: cibo tolto, −10 (36840 → 36830); imboscata `lost verso Valantar`, report con `hpBefore` 36830 e `hpAfter` 30830; deviazione di 7,255 km senza `food`; all'arrivo vita ancora 30830 | «pass» (avviso, pedina, Diario, vita) e «oass» (foglio d'esito con la barra da 36830, arrivo) | pass |
| 6 | Teleport dell'oste a metà viaggio (Valantar → Glilrid, 4 cibi da 15, confine al km 12,255; viaggio portato al km 5, `teleportCharacter` verso Valantar) | tolti 2 cibi su 4 (fabbisogno pro-rata dei 5 km: 23), nessuna fame, viaggio chiuso, posizione Valantar, vita 36830 | «pass» | pass |
| 7 | Viaggio già in corso prima del riavvio | nessun viaggio era in corso al riavvio | — | skipped (coperto dalle spec dei viaggi legacy) |

## Note

- **Variante del passo 5:** provato il caso con `coveredKm` minore del km dell'imboscata (pasto al confine più fame fino al km). Il caso con `coveredKm` maggiore (solo cibo pro-rata, nessuna fame) è lo stesso percorso del passo 6 col teleport.
- **Ordine osservato al passo 5:** lo sweep della fame è passato cinque secondi prima dello sweep delle imboscate e ha assestato fino al km dell'imboscata; l'imboscata ha trovato tutto pagato e non ha addebitato di nuovo.
- **Ripristino dopo il passo 5:** equipaggiamento, magie attive, ferite e vita (36830, cioè la vita prima dello scontro) riportati dal backup; la ferita aggiunta dallo scontro è stata tolta.
- **Durata dei viaggi (domanda dell'utente durante la UAT):** «come mai un viaggio di soli 18.3 km dura 4 ore e 9 minuti? La velocità base del personaggio dovrebbe essere 10 km in un'ora, con i modificatori dovuti a velocità di percorrenza della strada e velocità del pet». Risposta: lo `speedFactor` della strada vale come km/h del terreno (Phase 8 D-07, valori a DB da 3 a 7) e la gamba rotta pesa per 0,8. Decisione dell'utente: «Per adesso teniamo com'è».
- **Combattimento (utente, verbatim):** «Il sistema di combattimento non funziona davvero, è praticamente un tiro di dado. Spesso vengo sconfitto anche da nemici base per questo motivo. IL motore di comabttimento è un'implementazione che farò in futuro».
