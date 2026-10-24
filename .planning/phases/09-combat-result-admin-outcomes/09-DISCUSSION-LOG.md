# Phase 9: Combat Result & Admin Outcomes - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-24
**Phase:** 09-combat-result-admin-outcomes
**Areas discussed:** Chi decide l'esito e modello di combattimento; Fallimento, quest aid e morte; Progressione e ricompense; Contratto di consegna e coda del GM
**Mode:** interactive (AskUserQuestion, 4 questions per block), discussed in the same session as FE Phase 7

---

## Chi decide l'esito e modello di combattimento

| Option | Description | Selected |
|--------|-------------|----------|
| Algoritmo server-side alla scadenza del countdown; GM solo per story/worldMission (Recommended) | Motore come capacità nuova | ✓ |
| GM-mediato per tutto | Nessun motore; fuori dalle live nulla si risolve | |
| Ibrido: job/heal/study automatici; combattimenti e story/worldMission al GM | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Grado di difficoltà che scala il nemico (Recommended) | | |
| Valutazione dell'esito (S/A/B/C) che scala i premi | | |
| Non serve: togliamo il grade dal contratto | ADMIN-05 e BE-COMBAT-03 emendati | ✓ |

| Option | Description | Selected |
|--------|-------------|----------|
| Il motore con regole semplici; il GM li indica negli esiti manuali (Recommended) | Consumabili e magie usate | ✓ |
| Sempre il GM nel form | | |
| Non tracciati in v1.0 | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Tre verdetti: completata / fallita / rifiutata con rimborso (Recommended) | | |
| Due: completata o rifiutata con rimborso | | |
| Due passi: presa in carico, poi esito | | |

**User's choice:** first "Due: completata o fallita", then corrected: "Ho sbagliato, l'esito delle quest story e worldMission può essere solo positiva."

**Scope follow-up:** proposed split Phase 9 (contratto + GM + esiti senza combattimento) / Phase 9.1 (motore, ferite, aid, morte). User: "Il motore di combattimento sarà a mia discrezione, così come le ferite. Tu predisponi soltanto in modo che poi io possa dirti l'algoritmo e le regole in futuro. Inoltre worldMission e boss devono poter restituire un risultato diverso ad ogni personaggio che ha partecipato" → single phase with a pluggable resolver port and placeholder rules.

---

## Fallimento, quest aid e morte

| Option | Description | Selected |
|--------|-------------|----------|
| Sì: rifiuto con rimborso, corsia liberata (Recommended) | | |
| No: la richiesta resta in coda finché il GM non la completa | | ✓ |

| Option | Description | Selected |
|--------|-------------|----------|
| Bloccato sul marker, "in attesa di soccorso": corsia svuotata, niente viaggi né quest (Recommended) | Stato esplicito sul Character | ✓ |
| La corsia resta occupata dalla quest fallita | | |
| Libero | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Mai morte diretta: HP minimo 1, morte solo dalla catena aid (Recommended) | | ✓ |
| HP zero = morte immediata | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Clone della quest fallita, un posto qualsiasi rango, "Soccorso: <titolo>", premi originali (Recommended) | | ✓ |
| Clone con premi ridotti | | |
| Template aid a catalogo | | |

Follow-ups:

| Option | Description | Selected |
|--------|-------------|----------|
| Nessun timeout (Recommended) | | |
| Timeout: dopo N giorni senza soccorso muore | | ✓ (N = 7, chosen later) |
| Timeout: dopo N giorni viene liberato | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Liberato con gli HP che ha, nessuna cura; soccorritore premiato (Recommended) | | ✓ + "il ferito sarà automaticamente in città" |
| Liberato e curato al massimo | | |
| Liberato con HP a metà | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Di gruppo: quando tutti i registrati hanno finito il countdown; esito comune, premi a ciascuno (Recommended) | | ✓ (amended: results may differ per participant) |
| Individuale alla propria scadenza | | |
| Di gruppo solo a party completa | | |

---

## Progressione e ricompense

| Option | Description | Selected |
|--------|-------------|----------|
| xpPrize + xp del nemico sconfitto (Recommended) | | ✓ |
| Solo xpPrize | | |
| Solo xp del nemico; xpPrize per le quest senza combattimento | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Tabella di soglie XP, +10 HP a livello e cura completa (Recommended) | | |
| Tabella di soglie senza cura | | |
| Il livello non avanza in v1.0 | | |

**User's choice (Other):** "Il livello massimo è 20, la vita massima è 40000. Il punto di partenza è 1000. Il massimo di xp accumulabili da un utente è 100000 [corrected to 50000], al termine del quale raggiunge il livello 20. Proponi una scala per livello e punti vita". Proposed curves: HP same curve as XP (chosen), linear, geometric; XP triangular (chosen) vs linear. Notes: "Gli slot magia sono utilizzabili solo dopo aver raggiunto il rango mage", "Il personaggio non si cura al level up".

| Option | Description | Selected |
|--------|-------------|----------|
| Solo completando la story del titolo esatto (Recommended) | | ✓ |
| Story oppure soglia di XP | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Dal motore e dal GM; heal toglie le ferite; nessun effetto meccanico (Recommended) | | |
| Solo dal GM | | |
| Dal motore e dal GM, e le ferite pesano nel combattimento | | ✓ (first pick) |
| Tabella per tipo, e alcune ferite rallentano anche il viaggio (movementImpairment) | | ✓ (final pick) |
| Malus uniforme -5% | | |

| Option | Description | Selected |
|--------|-------------|----------|
| 3 giorni (Recommended) | Timeout aid | |
| 7 giorni | | ✓ |
| 1 giorno | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Sì, in questa fase: prizes.spell, magia appresa se xp ≥ minXpToLearn (Recommended) | Study | ✓ (as "Puoi studiare ovunque, ma solo a Valantar puoi imparare magie. Studiare altrimenti dà come reward xp") |
| No: rinviata | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Sotto mage maxActiveSpells = 0; da mage in su valgono le soglie XP (Recommended) | | ✓ |
| Slot legati al titolo | | |
| Slot per livello | | |

| Option | Description | Selected |
|--------|-------------|----------|
| prizes.spell sulle study di Valantar; il BE insegna se xp ≥ minXpToLearn (Recommended) | | ✓ |
| Flag sulla città e prima magia non conosciuta | | |
| Entrambi | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Un solo oggetto estratto a caso (Recommended) | randomLoot | |
| Ogni oggetto con probabilità 50% | | |
| Tutti gli oggetti | | |

**User's choice (Other):** "In base alla rarità ogni oggetto ha una possibilità di essere ottenuto. Parliamone meglio" → then "Un solo tiro: al massimo un oggetto, pesato dalla rarità" and the cascading-rolls description (highest rarity present first, descend on failure, random pick within the rarity); quantity: whole amount.

---

## Contratto di consegna e coda del GM

| Option | Description | Selected |
|--------|-------------|----------|
| Un solo tipo di risultato per ogni esito, subscription dedicata owner-only (Recommended) | | ✓ |
| Risultato solo per i combattimenti | | |
| Un solo tipo senza subscription dedicata | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Riusare questEnd con id = id del risultato (Recommended) | | ✓ |
| Nuovo tipo combatResult | | |
| questEnd con id = pendingQuestId archiviato | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Query pendingRequests + subscription pendingRequestsUpdated con lista completa (Recommended) | | ✓ |
| Query + subscription a eventi | | |
| Solo query | | |

| Option | Description | Selected |
|--------|-------------|----------|
| pendingQuestId + override opzionali per personaggio; una chiamata chiude la worldMission per tutti (Recommended) | | ✓ |
| Solo pendingQuestId | | |
| Una chiamata per personaggio | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Sì, in Phase 9: SHOP_NOT_IN_CITY, il FE resta il primo filtro (Recommended) | Guard negozio | ✓ |
| No: solo lato FE | | |
| Sì, ma in Phase 10 | | |

**Closing:** "Pronto: scrivi i CONTEXT di FE Phase 7 e BE Phase 9".

## Claude's Discretion

Resolver segnaposto, tabella malus e fattore di rallentamento, drop rate per rarità (legendary 2% come esempio), ordine XP→spell learning, nomi di entità/campi/codici, eliminazione vs archivio del PendingQuest, change stream vs publish per i risultati, raggruppamento delle voci della coda, env opzionali, split in wave.

## Deferred Ideas

Formula del combattimento e regole delle ferite (utente, in seguito); rifiuto con rimborso; timeout su story/worldMission; cura al level up; slot per titolo/livello; combat log; admin CRUD; indici e validazione (Phase 10); loot multiplo.
