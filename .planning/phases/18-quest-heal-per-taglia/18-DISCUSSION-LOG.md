# Phase 18: Quest heal per taglia - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-09
**Phase:** 18-quest-heal-per-taglia (BE), discussa insieme alla FE Phase 18 dal repo FE; worktree da `develop` `31dba96` perché la Phase 17 era in pianificazione in un'altra sessione
**Areas discussed:** Vita (HP); Ferite; Lore; Ore (regole BE) · Scheda quest; Descrizioni; Ordine delle fasi (FE e pianificazione) · conferma del foglio
**Mode:** interattivo. Il disegno è nato in una conversazione di consiglio precedente nella stessa sessione (regola attuale Phase 9 D-15, 166 heal identiche a DB, taglia derivata da `citySizeOf`, gravità delle ferite solo nella FE), in cui l'utente ha fissato le regole di prodotto: separare la vita dalle ferite con liste per luogo, heal gratuite, ore per taglia; ha messo in stand-by l'uso delle cure dal Diario e ha rinviato tutta la parte del cibo in viaggio (fame graduale, pasti progressivi, debito di fame). Poi 2 chiamate `AskUserQuestion` (4 + 3 domande) e 1 conferma dell'interpretazione di una risposta libera. Fatti letti prima delle domande: modelli Quest/QuestPrizes/QuestResult, `outcome-plan.ts`, `injury-rules.ts`, `level-table.ts`, `quest-eligibility.ts`, `city-size.ts`, tre inventari DB di sola lettura (heal per taglia 98/59/9 tutte sul marker della città; 28 oggetti heal e copertura per ferita; città per `CityType`).

---

## Vita (HP)

Dati nella domanda: oggi tutte le 166 heal riportano gli HP al massimo; «tetto» = la quest porta gli HP almeno a quella quota del massimo, mai sopra.

| Option | Description | Selected |
|--------|-------------|----------|
| Tetto 50 / 80 / 100 % (Recommended) | Villaggio almeno 50 % del massimo, città 80 %, capitale 100 %; per il pieno serve la città | ✓ |
| Tetto 100 % ovunque | La taglia differenzia solo le ferite | |
| Incremento +50 / +80 % / pieno | Ripetendo la heal si arriva al pieno ovunque | |

## Ferite

Dati nella domanda: 37 ferite con gravità FE 5–80; ≤15 = 10, ≤20 = 19, ≤30 = 23, ≤40 = 28, ≤50 = 32; sopra 50 gambe mancanti, costola fratturata, paralisi, lesione spinale.

| Option | Description | Selected |
|--------|-------------|----------|
| ≤20 / ≤50 / tutte (Recommended) | Villaggio 19, città 32, capitale 37 | |
| ≤15 / ≤40 / tutte | Villaggio 10, città 28, capitale 37 | |
| ≤20 / ≤40 / tutte | Villaggio 19, città 28 (niente cecità, trauma cranico, braccia mancanti), capitale 37 | ✓ |

## Lore

Dati nella domanda: 12 villaggi di montagna/nord, 7 del deserto, 8 tropicali, 12 città di mare; Necrorian senza heal.

| Option | Description | Selected |
|--------|-------------|----------|
| Sì, con la tabella proposta (Recommended) | Montagna/nord + congelamento, assideramento; deserto + ustione grave, sfinimento; tropicale + infezione, iniezione velenosa; mare + assideramento, infezione | ✓ |
| No, solo le liste per taglia | Eccezioni a mano a DB | |
| Sì, ma propongo io la tabella | Ritocchi dell'utente | |

## Ore

| Option | Description | Selected |
|--------|-------------|----------|
| 2 / 5 / 8 ore (Recommended) | Villaggio rapido e leggero, città come oggi, capitale completa ma lunga | ✓ |
| 1 / 3 / 6 ore | Tutto più rapido | |
| 8 / 5 / 2 ore | Capitali più rapide | |
| 5 ore fisse | Nessuna differenza | |

## Scheda quest (FE)

Default dichiarato nel testo e accettato: la cura vale per ogni quest vinta che porta `prizes.cure`, non solo per il tipo heal; la riga della vita compare sempre; l'esito elenca le ferite guarite davvero.

| Option | Description | Selected |
|--------|-------------|----------|
| Le tue ferite curabili + conteggio (Recommended) | «Cura le tue ferite: …» più «guarisce 19 tipi di ferite» | |
| Lista completa | Tutte le ferite della lista come sugli oggetti | |
| Solo etichetta per taglia | «Cure leggere» / «Cure del tempio» / «Cure complete» | |
| Other: «Dice solo le tue ferite curabili» | Solo le ferite del personaggio presenti in lista, niente conteggio | ✓ |

Conferma: senza ferite curabili nessuna riga di cura, solo la vita (Recommended) ✓ · alternativa «Qui non curano le tue ferite» scartata.

## Descrizioni

| Option | Description | Selected |
|--------|-------------|----------|
| Tre varianti per taglia (Recommended) | Piccola clinica / infermeria del tempio / grande tempio con guaritori esperti; titoli invariati; revisione su file prima dell'applicazione | ✓ |
| Lasciare le descrizioni attuali | Solo liste, vita e ore | |
| Le scrivo io | Varianti dell'utente | |

## Ordine delle fasi

Dati nella domanda: FE 12 Hardening discussa e ricercata sul suo ramo («ultima fase della v1.0»), BE 17 in pianificazione in un'altra sessione.

| Option | Description | Selected |
|--------|-------------|----------|
| 18 prima della 12, Hardening resta ultima (Recommended) | Le heal entrano prima dell'hardening | |
| 12 Hardening prima, poi la 18 | La 18 si pianifica ora, si esegue dopo la merge dell'hardening (BE: dopo la 17) | ✓ |

## Decisioni prese prima delle domande (conversazione di consiglio, stessa sessione)

- Separare la vita dalle ferite: `prizes.cure { lifePointsShare, canHeal }` con liste esplicite per luogo (utente).
- Heal gratuite (utente). Ore per taglia (utente).
- Uso degli oggetti heal dal Diario: stand-by (utente, «ci voglio ripensare bene»).
- Cibo in viaggio (fame graduale, pasti progressivi, debito di fame): rinviato (utente, «rischia di complicare tutto di molto»).
- Le cure restano in combattimento, nel motore dell'utente; la cura consigliata nelle quest non si tocca (utente).

## Riapertura delle pozioni dal Diario (2026-11-09 sera, dopo il discuss, in chat)

- Utente: le pozioni consumabili tornano con una **ricarica globale** («Ogni oggetto heal ha un suo recoveryTime, come per le magie… non posso più prendere pozioni di qualsiasi tipo»); minimo 30 min, massimo 24 h; in combattimento funzionano in modo diverso (motore suo, forse `recoveryTurns`); forma del modello scelta dall'utente: `recovery { time: int; turns: int }` («così teniamo il modello pulito»).
- Claude: parere favorevole; un solo timestamp sul personaggio invece della macchina delle magie; onestà sul limite (la ricarica frena le raffiche, non il recupero su un viaggio di ore → tempi crescenti con la potenza); tabella dei 28 tempi proposta per potenza, rarità e ferita più grave (D-18), accettata come base da rivedere a DB.
- Utente: «aggiungiamo anche la creazione di una nuova lore che spieghi come mai le pozioni non si possono bere in sequenza» → D-19: lore `knowledge` «Il limite del corpo», collegata dalle pozioni con `LootItem.relatedLore` e sbloccata alla prima pozione bevuta (alternative scartate: alla nascita, tiro di studio).

