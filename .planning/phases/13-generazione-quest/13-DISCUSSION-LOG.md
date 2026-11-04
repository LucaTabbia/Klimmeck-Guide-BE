# Phase 13: Generazione quest - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-04
**Phase:** 13-generazione-quest (BE), discussa insieme alla FE Phase 14 dal repo FE
**Areas discussed:** Fondazione (boss, scadenza), Nemici/boss/party, Dungeon: esplorazione, Ritmo e scadenza, Premi/titoli/annunci, Gioielli `accessoryUseTypes` (area nuova dell'utente)
**Mode:** interattivo, 9 chiamate `AskUserQuestion` (FE + BE), fatti letti prima delle domande (codice dei due repo via Explore, inventario DB di sola lettura, handoff Phase 11, world building riga 1090)

---

## Fondazione

| Option | Description | Selected |
|--------|-------------|----------|
| Boss per ogni rango (Recommended) | Un solo nemico più forte del rango, posti dalla formula, leggendari boss di hero/legend | |
| Solo i 22 leggendari | Boss = leggendari soltanto | |
| Boss = branco dello stesso nemico | Quantità, party fisso | |
| **Other (free text)** | «Boss è un nemico molto forte per il rango e livello richiesto dagli avventurieri. I mostri leggendari sono ad uso esclusivo delle worldMission» | ✓ |

**Conferma della lettura:** un solo nemico di fascia superiore, posti = ⌈PE / media del rango⌉ fra 2 e 6, leggendari mai generati, ranghi senza candidati solo enemy → **Confermo (Recommended)** (alternative: tetto 10 posti; spiega meglio).
**Correzione dell'orchestratore durante il discuss:** anche hero ha candidati da 2 posti (Beholder, Arcimago, Drago d'ombra giovane, Djinni); solo legend resta senza boss.

| Option | Description | Selected |
|--------|-------------|----------|
| Scade dopo N giorni (Recommended) | Scadenza configurabile delle generate non accettate | |
| Nessuna scadenza | Resta finché completata | ✓ |
| Scadenza breve (24–48 h) | Tabellone giornaliero | |

## Nemici, boss e party

| Option | Description | Selected |
|--------|-------------|----------|
| Budget XP della fascia (Recommended) | 1–3 tipi, quantità fino al budget | |
| Schema fisso per rango | Conteggi fissi | |
| Un nemico, quantità 1 | Nemico singolo | |
| **Other (free text)** | «O nemico singolo della fascia selezionata o più nemici deboli.» | ✓ |

**Conferma della lettura:** forma (a) nemico singolo della fascia, forma (b) branco di nemici più deboli anche misti con somma xp nella fascia → **Confermo (Recommended)** (alternativa: branco di un solo tipo).

| Option | Description | Selected |
|--------|-------------|----------|
| Zona del POI + nemici city (Recommended) | Zona + habitat city, all di riserva, animali inclusi | ✓ |
| Solo zona del POI | Compatibilità stretta | |
| Zona + city, senza animali | Animali solo nelle hunt | |

| Option | Description | Selected |
|--------|-------------|----------|
| Un posto del rango R (Recommended) | Quest individuale | ✓ |
| 1–2 posti, budget scalato | Party piccolo | |
| Posto jolly | Senza vincolo di titolo | |

## Dungeon: esplorazione

| Option | Description | Selected |
|--------|-------------|----------|
| Tappe in sequenza (Recommended) | Scontri in ordine con HP residui | |
| Scontro unico aggregato | Un solo tiro | |
| Tappe + prove di esplorazione | Scontri alternati a prove | (≈) |
| **Other (free text)** | «La risposta 3 è la più simile, ma all'algoritmo di esplorazione e di combattimento sto lavorando io, quindi per adesso quelle sezioni saranno un placeholder finché non darò io la versione finale» | ✓ |

| Option | Description | Selected |
|--------|-------------|----------|
| Consigliati e basta (Recommended) | Solo consigli | |
| Consumati con bonus | Bonus al tiro | |
| Obbligatori | Rifiuto senza oggetti | |
| **Other (free text)** | «Gli oggetti recommended servono nelle fasi di esplorazione (se mancanti ti potrebbero far perdere vita, causare ferite e così via) o nelle fasi enemy (consigliati perché ottimi contro una debolezza o per proteggersi da un nemico)» — regola del motore finale | ✓ |

| Option | Description | Selected |
|--------|-------------|----------|
| Solo enemies, prove implicite (Recommended) | Ogni voce = tappa, prova implicita, stages futuro | ✓ |
| Lista di tappe tipizzate | infos.stages ora | |

| Option | Description | Selected |
|--------|-------------|----------|
| Tappe reali, prove neutre (Recommended) | CombatResolver per tappa, prova sempre superata, contesto con gli oggetti posseduti | ✓ |
| Prove con costo fisso | HP fissi senza oggetti | |
| Scontro unico per ora | Somma dei nemici | |

| Option | Description | Selected |
|--------|-------------|----------|
| Arricchite al boot, poi cura a DB (Recommended) | nemico attuale + 1–3 tappe, deterministico, bande N × Bandito | ✓ |
| Solo enemy → enemies, un nemico | Migrazione minima | |
| Nemico attuale × N | Un tipo, più esemplari | |

## Ritmo e scadenza

| Option | Description | Selected |
|--------|-------------|----------|
| Riempi fino a un target globale (Recommended) | Target ≈ 1 per città, 0–3 non concentrate | ✓ |
| Una alla volta | Sostituzione 1:1 | |
| Target per regno | Un target per gruppo regionale | |

| Option | Description | Selected |
|--------|-------------|----------|
| Una corsa normale (Recommended) | generateQuests senza argomenti, risponde con il conteggio | ✓ |
| Forza N quest | Argomento count | |
| Rigenera il mondo | Annulla e ricrea | |

## Premi, titoli, annunci

| Option | Description | Selected |
|--------|-------------|----------|
| 1 boss ogni 5 (Recommended) | 20% | |
| 1 boss ogni 10 | 10% | ✓ |
| Boss solo nelle città grandi | Per taglia | |

| Option | Description | Selected |
|--------|-------------|----------|
| Tabella come le fisse (Recommended) | enemy 150+40, boss 600+120 × moltiplicatore, 1 randomLoot | |
| Proporzionali agli xp dei nemici | Fattore per fascia | |
| Dimmi tu i numeri | Verbatim | |
| **Other (free text)** | «Va bene la tabella come le fisse per adesso, ma i randomLoot sono un pool ampio. Rarità più alte su missioni per ranghi più alti. Legendary solo da hero in su. Una missione boss per grado hero -> 1 oggetto legendary -> 2 oggetti ultrare -> 4 oggetti rare (l'oggetto legendary può essere ottenuto da tutti, non è limitato ad una sola persona, dipende solo dalla fortuna)» | ✓ |

**Conferma della lettura dei pool** (boss hero 1L+2U+4R … rookie 2C; enemy un gradino sotto; tiro per partecipante; legendary mai sotto hero) → **Confermo (Recommended)** (alternativa: enemy senza loot).

| Option | Description | Selected |
|--------|-------------|----------|
| Template con annuncio (Recommended) | Titolo per tipo + annuncio nella voce del committente, relatedLore città + nemici | ✓ |
| Solo titolo | description nulla | |
| Titolo con la zona | Zona del POI nel titolo | |

| Option | Description | Selected |
|--------|-------------|----------|
| Premio possibile, assegnato a DB (Recommended) | Pet come itemType, generatore non assegna | |
| Il generatore li dà ai boss | 1 boss su 10 | |
| Fuori da questa fase | Rinviato | |
| **Other (free text)** | «Come risposta 1, ma farei un field apposito, in più può essere dato da generatore, ma con probabilità estremamente bassa» | ✓ |

**Conferma della lettura** (prizes.pet, 1% sui boss, 20% per vincitore, pool sellable false) → **Other:** «Confermo. Nel tempo verranno aggiunti altri pet a DB. Per rendere più chiaro che pet sono vendibili e quali no, mettiamo nel modello pet la voce sellable, come avviene per gli oggetti. Inoltre, le quest hanno un percentuale bassissima di avere un pet ottenibile e la percentuale di possibilità per ottenerlo è bassa a sua volta (ma non in modo eccessivo. un 20% può andare bene» — `Pet.sellable` esiste già dalla Phase 12 (comunicato); seconda conferma della doppia probabilità → **Confermo (Recommended)** (alternativa: 100% a DB).

## Gioielli: `accessoryUseTypes` (area nuova, utente, alla domanda di chiusura)

Regola dettata in free text (verbatim nel CONTEXT D-23). Fatti letti prima delle domande: 42 gioielli (21 ring, 21 necklace), 13 con `addedSpell` (attack 4, control 3, defense 1, infuse 1, enhance 1, illusion 1, charm 1, confuse 1), tutti con `damages`; `UseType` delle magie a 8 valori.

| Option | Description | Selected |
|--------|-------------|----------|
| Confermo (Recommended) | Campo solo sui gioielli, enum attack/defence, semantica al motore, contesto pronto | |
| Confermo, su tutti gli equipaggiamenti | Lista vuota = sempre utilizzabile | |
| **Other (free text)** | «Ho sbagliato a scrivere, è defense il tipo. Tu avresti un'altra soluzione che non sia aggiungere un nuovo campo, ma sfruttarne uno già esistente per specificare questa cosa? Ad esempio estendere il tipo a necklaceDefense, necklaceAttack, necklaceDefenceAttack o cose simili? Altrimenti Va bene la tua risposta» | ✓ |

**Domanda di follow-up (campo o enum):** Campo `accessoryUseTypes` (Recommended) ✓ · EquipType esteso (6 valori, non additivo) · Spiega meglio. Motivazione data: lo slot e l'uso sono assi diversi; `equipType` guida slot del Diario, filtri e pool nei due repo; il campo è additivo ed estendibile.

| Option | Description | Selected |
|--------|-------------|----------|
| Mappa A (Recommended) | attack→attack; defense→defense; control/illusion/charm/confuse→attack; enhance/infuse→entrambi; senza magia→defense salvo descrizione offensiva | (≈) |
| Mappa B | control…→entrambi; enhance/infuse→defense | |
| Dimmi tu la mappa | Verbatim | |
| **Other (free text)** | «La mappa A è corretta per le magie, ma se la descrizione parla anche di protezione e la spell è di attacco, allora il gioiello avrà entrambi i tipi e viceversa. Se invece la descrizione parla solo di attacco e non ha spell difensive, il tipo di gioiello è solo attacco» | ✓ |

| Option | Description | Selected |
|--------|-------------|----------|
| Tabella rivista da te + migratore una tantum (Recommended) | Revisione dell'utente, migratore al boot poi fuori dal repo, cura a DB | ✓ |
| Regola automatica senza revisione | Solo la mappa | |
| Script a mano, niente nel repo | Script DB | |

## Chiusura

«Scrivi i CONTEXT (Recommended)» ✓ (prima volta: «è sorta una nuova necessità…» → area gioielli; seconda volta: confermato).

## Claude's Discretion

Nomi, indici, claim sul POI, vicinanza delle città, tie-break del rango, quota a/b, trigger via coda o chiamata diretta, publisher sugli insert, campo del pet nel risultato, `timeToComplete` di enemy/boss, varianti dei template, forma dell'`Enemy.legendary`.

## Deferred Ideas

Motore e algoritmo di esplorazione (utente), `stages` tipizzate, scadenza, argomenti di `generateQuests`, pet sulle enemy, descrizioni LLM (v2), allineamento crime/guard (v2), live insert sul tabellone, ref annidati non popolati (FE 13 §5.1), rimozione delle query deprecate del negozio, nemici da calibrare.
