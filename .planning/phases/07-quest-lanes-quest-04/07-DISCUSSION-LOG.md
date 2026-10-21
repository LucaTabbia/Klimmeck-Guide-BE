# Phase 7: Quest Lanes (QUEST-04) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-21
**Phase:** 7-quest-lanes-quest-04
**Areas discussed:** Semantica delle corsie story/worldMission, Cost model ed eleggibilità, Contratto della mutation e del Character, Countdown e tempi delle quest
**Mode:** interattivo (AskUserQuestion a blocchi di 4), nessun `--auto`

---

## Semantica delle corsie story/worldMission

| Option | Description | Selected |
|--------|-------------|----------|
| Richiesta in attesa del GM con stato `requested` | Punti debitati subito, quest sparita dalla board, campo stato sul PendingQuest per la Phase 9 | |
| Quest in corso senza stato | La corsia si riempie e basta; la coda di approvazione sarà un'entità separata | |
| Richiesta senza debito | Punti debitati solo all'approvazione | |

**User's choice:** free text — "Sono le quest che sono in attesa di essere eseguite dal GM durante le live. Il GM può vedere chi ha fatto la richiesta, eseguirle in live e poi segnarle come completate. Non c'è bisogno di specificare lo stato perché ne hanno solo uno, ovvero lo stato prima di essere completate dal GM." → D-02 (nessuno stato), punti debitati all'accettazione (D-09).

| Option | Description | Selected |
|--------|-------------|----------|
| Condivisa fino al limite | `registeredAdventurers` + capienza `requiredAdventurers`, `QUEST_FULL` | |
| Condivisa senza limite | Capienza informativa | |
| Esclusiva | Un solo personaggio per quest | |

**User's choice:** free text — "le story sono quest per un singolo utente, le worldMission e le missioni boss invece sono condivise fra più avventurieri. Le world mission e boss sono le uniche quest che possono essere condivise e mi piacerebbe poter indicare non solo la quantità di avventurieri, ma poter specificare la quantità di avventurieri di un rango rispetto ad un altro. Ad esempio 5 eroi, 4 paladini e così via" → D-03, D-04.

| Option | Description | Selected |
|--------|-------------|----------|
| Story non ripetibili | story/worldMission rifiutate se già completate o richieste; le altre ripetibili | |
| Nessuna quest ripetibile | Qualunque quest in `completedQuests` rifiutata | |
| Tutte ripetibili | Nessun controllo | |

**User's choice:** free text — "Story, worldMission, enemy, boss e aid non sono ripetibili. Story è progressivo. Tutti fanno prima una quest avventurieri, poi paladino, poi mago, poi eroe, poi leggenda. Ognuna di queste fa progredire il personaggio al titolo successivo" → D-05, D-06.

| Option | Description | Selected |
|--------|-------------|----------|
| Sì, rimborso al rifiuto | Il PendingQuest memorizza il costo pagato | ✓ |
| Nessun rimborso | Il costo è il biglietto della richiesta | |
| Decidere in Phase 9 | Salvare comunque il costo | |

**User's choice:** Sì, rimborso al rifiuto → D-07 (`pointsSpent`).

### Follow-up (chiarimenti sulle risposte libere)

| Option | Description | Selected |
|--------|-------------|----------|
| Sì, in Phase 7 | Campo party per rango sul Quest, `QUEST_FULL` per rango | ✓ |
| Solo il totale ora | Capienza = `requiredAdventurers` | |
| Per rango, solo informativo | Nessun rifiuto | |

**User's choice:** Sì, in Phase 7 → D-04.

| Option | Description | Selected |
|--------|-------------|----------|
| No, slot esatti | 5 eroi = cinque personaggi hero | ✓ |
| Sì, verso il basso | Un eroe può coprire un posto da paladino | |

**User's choice:** No, slot esatti → D-04.

| Option | Description | Selected |
|--------|-------------|----------|
| Sì, corsia standard | Boss in `pendingQuest`, condivisa con capienza per rango; tre corsie restano | ✓ |
| No, corsia dedicata alle boss | Quarta corsia `activeBossQuest` | |

**User's choice:** Sì, corsia standard → D-01, D-03.

| Option | Description | Selected |
|--------|-------------|----------|
| Titolo esatto | Story solo con `status.title == minTitle`; altre `>= minTitle` | ✓ |
| Almeno minTitle per tutte | `>=` anche per le story | |
| Nessun controllo di titolo | minTitle informativo | |

**User's choice:** Titolo esatto → D-06.

**Notes (messaggio dell'utente durante l'area 3, registrato qui):** "le code per story e worldMission separate servono a me per poter visualizzare più facilmente chi è in attesa di cosa, ma servono anche per non bloccare l'esperienza di gioco dell'utente, in quanto dovrebbe attendere che io completi la missione durante una live per poterne accettare un'altra. Così facendo invece possono essere gestite separatamente e la storia di un personaggio può proseguire, così come la storia del mondo, così come le missioni private di un utente, senza andare in conflitto le une con le altre" → Phase Boundary e D-01.

---

## Cost model ed eleggibilità

| Option | Description | Selected |
|--------|-------------|----------|
| Nuovo campo sul Quest | `requirements.cost: Coins` additivo, debito via WalletService | |
| Gratis in v1 | Nessun debito di monete finché non c'è l'admin CRUD | |
| Riusare requiredPoints come rame | Stesso campo con due semantiche | |

**User's choice:** free text — "Le quest non hanno un costo in monete" → D-08 (emenda BE-QUEST-03, ROADMAP criterio 3, FE QUEST-05 via handoff).

| Option | Description | Selected |
|--------|-------------|----------|
| Gratis | `requiredPoints` nullo = nessun debito | |
| Rifiuto | Errore di catalogo, fail-closed | |

**User's choice:** free text — "Non possono esistere. Le worldMission vengono create da me personalmente, mentre le missioni story sono le stesse 5 riutilizzate per tutti gli utenti e hanno un costo fisso" → D-09 (`requiredPoints` obbligatorio e positivo, rifiuto fail-closed).

| Option | Description | Selected |
|--------|-------------|----------|
| No, da ovunque | Nessun vincolo di posizione | |
| Sì, solo al marker | `status.location == markerLocation` | |
| Solo per le standard | Vincolo solo per hunt/enemy/boss… | |

**User's choice:** free text — "Il personaggio ci deve trovare nella città che contiene dentro pointsOfInterest il markerLocation della quest. In pratica l'utente può solo spostarsi liberamente da una città all'altra, ogni città ha dei POI di influenza. Le missioni che appaiono in quei POI possono essere accettate solo in quella città. Il personaggio poi si sposta verso il punto della missione e a missione terminata può poi decidere dove spostarsi partendo dal punto della missione (potendo scegliere solo città). Al momento nel FE questo spostamento tra città avviene già [...]. A DB le città non hanno ancora relatedLore (bisogna aggiornare i dati a DB), ma hanno già pointsOfInterest (una lista di id)" → D-10.

| Option | Description | Selected |
|--------|-------------|----------|
| Paga il proprietario | L'innkeeper accetta per conto altrui, paga l'owner, auditato | |
| Solo il proprietario può accettare | Eccezione al bypass innkeeper | |
| GM accetta gratis | Regalo senza debito | |

**User's choice:** free text — "Io non posso accettare missioni per conto di qualcun altro" → D-11 (owner-only).

---

## Contratto della mutation e del Character

| Option | Description | Selected |
|--------|-------------|----------|
| CommonResponse | Come doTransaction/equipItem; stato da `characterUpdated`/`userUpdated` | ✓ |
| Ritorna il PendingQuest | Dati del countdown nella risposta | |
| Ritorna il Character | Payload intero | |

**User's choice:** CommonResponse — "Perché servirebbe ritornare l'id del pendingQuest? La subscription del Character è sempre attiva, quindi una volta aggiornato il dato durante la richiesta della missione anche quel dato verrebbe aggiornato in automatico" → D-12.

| Option | Description | Selected |
|--------|-------------|----------|
| Dentro quests | `Character.quests.activeStoryQuest` / `activeWorldMissionQuest` | ✓ |
| Top level sul Character | Accanto a `quests` | |

**User's choice:** Dentro quests → D-01.

| Option | Description | Selected |
|--------|-------------|----------|
| PendingQuest + quest completa | Popolata anche la `quest` con marker ed enemy | |
| Solo il PendingQuest | `startDate`, `waitingTime`, `pointsSpent`, `quest` come id | ✓ |

**User's choice:** Solo il PendingQuest → D-13.

| Option | Description | Selected |
|--------|-------------|----------|
| Unico QUEST_SLOT_BUSY | Un codice per ogni corsia + QUEST_FULL, QUEST_ALREADY_TAKEN, QUEST_TITLE_MISMATCH, QUEST_NOT_IN_CITY, INSUFFICIENT_POINTS | ✓ |
| Un codice per corsia | STORY_SLOT_BUSY, WORLD_MISSION_SLOT_BUSY | |

**User's choice:** Unico QUEST_SLOT_BUSY — "La recommended va bene, ma INSUFFICIENT_POINTS è un errore per mancanza di punti richiesti, non perché già esistente" (chiarimento: "già esistente" si riferiva al codice già definito in Phase 4; la semantica è "punti canale insufficienti") → D-14.

---

## Countdown e tempi delle quest

| Option | Description | Selected |
|--------|-------------|----------|
| waitingTime = 0 | Quest istantanea (comportamento Phase 4 A1) | ✓ |
| Rifiuto | Errore di catalogo | |
| Durata di default | Costante | |

**User's choice:** waitingTime = 0 → D-16.

| Option | Description | Selected |
|--------|-------------|----------|
| Stessa regola | `timeToComplete ?? 0` anche per story/worldMission | |
| waitingTime sempre 0 | Il tempo lo decide il GM in live | ✓ |

**User's choice:** free text — "Non è che ignoriamo il timeToComplete. Le story e le worldMission avranno sempre settato il waitingTime a 0, perché non ci può essere un waitingTime fissato dato che dipendono dalla mia presenza e disponibilità in live" → D-16.

| Option | Description | Selected |
|--------|-------------|----------|
| Sì, resta Phase 9 | Nessuna azione alla scadenza | ✓ |
| No, anticipare la fine quest | Job a scadenza in Phase 7 | |

**User's choice:** Sì, resta Phase 9 → D-17.

| Option | Description | Selected |
|--------|-------------|----------|
| Query serverTime | `serverTime: DateTime!` per l'offset del FE | ✓ |
| Nessun riferimento | Orologio del device | |
| serverTime in ogni evento | Campo nel payload di `characterUpdated` | |

**User's choice:** Query serverTime → D-15.

---

## Claude's Discretion

Vedi `07-CONTEXT.md` § Claude's Discretion: collocazione di `acceptQuest`, forma del campo party e del guard owner-only, come esporre `quest { id }` senza populate, ordine dei controlli, strategia della capienza per rango, `requiredAdventurers` derivato o meno, split in wave.

## Deferred Ideas

Vedi `07-CONTEXT.md` § Deferred Ideas: fine quest e coda del GM (Phase 9, complete/reject con rimborso), guard "non in viaggio" (Phase 8), admin CRUD quest, `registeredAdventurers` come `[Character]`, abbandono di una quest, emendamento FE QUEST-05, dati a DB (`relatedLore`, `pointsOfInterest`), gating sullo stato live.
