# Phase 21: Premi per rango e soccorsi - Context

**Gathered:** 2026-11-12 (discuss fatto nella FE Phase 20, `Klimmeck-Guide/.planning/phases/20-rank-specific-prizes-for-group-quests/20-CONTEXT.md`; qui le stesse decisioni con la numerazione della FE)
**Status:** Ready for planning
**Amended:** 2026-11-13 dopo `21-RESEARCH.md` e le risposte dell'utente — decisioni nuove D-18..D-30 nella sezione «Aggiunte dopo la ricerca». Dove divergono dal testo sopra, vincono le aggiunte.

<domain>
## Phase Boundary

Blocchi premio per titolo sulle quest di gruppo, risolti sul titolo del personaggio; premio unico sul `minTitle` per le solitarie; boss generati misti col titolo inferiore; magia solo ai titoli ≥ mage. Correzioni del flusso aid: tipi che la generano, aid della dungeon a turni fino al turno della sconfitta con premio proporzionale, archiviatore che libera i soccorritori. La FE Phase 20 consuma il blocco del viewer; la futura fase dell'oste (FE Phase 21) userà i blocchi nel passo dei premi.

</domain>

<decisions>
## Implementation Decisions

### Quali quest e quale titolo
- **D-01:** Blocchi per titolo sulle **quest di gruppo**: `worldMission`, `boss` (anche misti, D-03) e l'`aid` clonata da una quest di gruppo. Le **solitarie** (`enemy`, `hunt`, `dungeon`, aid di una solitaria e i tipi senza registrazione) tengono **un premio unico calcolato sul `minTitle`** — utente: «riflette anche la difficoltà del mostro, rendendo il tutto più bilanciato».
- **D-02:** Nelle quest di gruppo **nessun posto a titolo null**: un blocco per ogni titolo dei posti. Un posto null in una quest di gruppo è contenuto non valido (planner: rifiuto o report di sola lettura, come le violazioni dei negozi).
- **D-03:** Boss generati **misti a caso**, non a regola fissa: posti anche del titolo **inferiore**, **mai superiore** («diventerebbe troppo facile»); frequenza e proporzione a discrezione dentro la formula esistente (⌈PE / media del rango⌉, 2–6 posti).
- **D-04:** Decide il **titolo del personaggio** alla risoluzione, non il titolo del posto.

### Contenuto dei blocchi
- **D-05:** **Tutto il blocco va per titolo**: monete e xp (`GENERATED_PRIZES` × `TIER_MULTIPLIER`), loot (`LOOT_POOLS` del titolo) e **anche pet, cura e magia**, così nessuno ottiene un premio troppo forte per il suo rango (utente, 2026-11-12, correggendo la prima risposta: «anche quelle vanno in base al rango. Così non rischiamo che qualcuno ottenga un pet troppo forte/ una cura troppo forte / una magia troppo forte per il suo livello/rango»).
- **D-05a:** Il **pet si sorteggia con la regola di sempre** (Phase 19 D-28: un tiro a fasce sommate 10 % pet dello stesso nemico, 5 % di zona, 5 % solo boss non vendibile; tetto di rarità dal loot del titolo; legendary solo dai boss hero) **una volta per blocco**: il blocco mage può avere il pet e quello paladin no. Nuovi tiri dopo quelli esistenti (ordine delle spec a seme fisso).
- **D-05c:** Cure e magie esistono in pratica **solo nei tipi in solitaria dedicati** (`heal` per le cure, `magic` e la study di Valantar per le magie): le quest di gruppo generate non ne portano; i campi per titolo restano per le quest di gruppo scritte a mano. La magia si impara **solo dai titoli ≥ mage**.
- **D-05b:** Lacuna: `canLearnSpell`/`drawLearnableSpell` (`src/quests/outcomes/rewards/quest-rewards.ts`) guardano solo `minXpToLearn`; la regola di titolo vive in `isSpellCaster` (`src/models/character/active-spell-slots.ts`), usata solo per gli slot. Va imposta in ogni percorso (solitarie, study di Valantar, gruppo), RED prima.
- **D-06:** Quest generate: blocchi dalle tabelle, poi ritoccabili a DB («la mano vince»). Quest scritte a mano: i blocchi li scrive l'utente, **nessuna semina** né ripiego sulle tabelle.

### Sul filo
- **D-07:** Il foglio della quest mostra al viewer **solo il blocco del suo titolo** (consiglio: `Quest.prizes` risolto per il viewer come `noEffect`, più l'elenco dei blocchi per l'oste quando servirà alla FE Phase 21). Forma decisa nel plan; cambio non additivo → FE gated.
- **D-08:** Esito invariato nella forma: `QuestResult.rewards` per partecipante.

### Aid
- **D-09:** Aid solo da `enemy`, `boss`, `hunt`, `dungeon`, `aid` perse (oggi `combatant-plan.ts:127-136` la crea per ogni sconfitta).
- **D-09b:** La `crime` resta com'è: la «sconfitta» è l'arresto del 20 % alla conclusione (quick 261110-cgd, 10 h `CRIME_PRISON_MS`, un quarto delle monete, nessuna aid); lo scontro con le guardie perso lascia a vita minima senza aid; nessuna crime a DB ha nemici (34/34).
- **D-10:** Aid persa **invariata** (Phase 9 D-09, confermata dall'utente): i feriti originali muoiono, una nuova aid per i soccorritori caduti clonata dall'originale, timer ripartito.
- **D-11:** L'aid di una quest di gruppo clona i **blocchi per titolo** con i posti; la cura non si eredita (Phase 18 D-23).
- **D-12:** **Aid della dungeon a turni.** Dungeon = turni «esplorazione → scontro col primo nemico/gruppo → esplorazione → scontro col secondo → … fino alla fine dei nemici». Si può cadere **in qualunque turno, anche di esplorazione**. Alla sconfitta si **salva sull'aid il turno** (indice e tipo); l'aid percorre i turni **fino a quello** e il soccorritore deve **completarlo** per salvare il ferito; poi l'aid finisce e il salvato torna libero (anche di rifare la dungeon).
- **D-13:** Il motore a turni (esplorazione e scontri) è dell'utente: qui **struttura + segnaposto attuale** (turno salvato, percorso con la stessa porta della dungeon — oggi l'aid passa da `combatContextOf` + `combat.resolve` in `rescue-resolution.service.ts:395-401`, il percorso a tappe solo per `type === dungeon` in `quest-resolution.service.ts:183` —, contatori nell'esito); la porta deve già ammettere una sconfitta in esplorazione.
- **D-14:** Premio del soccorritore di un'aid di dungeon **in proporzione ai turni completati** sul totale della dungeon (caduto al 4° di 8 → metà di monete, xp e loot; unità e arrotondamento a discrezione, documentati; consiglio: turni).
- **D-15:** Nessun blocco della dungeon per gli altri mentre l'aid è aperta (come oggi).
- **D-16:** `character-archiver.ts:221-247` conclude l'aid senza liberare corsie e PendingQuest dei soccorritori iscritti ma non partiti (dedotto dal codice, non riprodotto): RED che lo riproduce, poi `releaseRegistered` come il timeout (`party-timeout.service.ts:137-155`).

### Pulizia DB (fatta nel discuss, 2026-11-12)
- **D-17:** Le 3 aid concluse a DB erano avanzi delle UAT (sconfitte vere, chiuse a mano, nessun `QuestResult` sull'aid): backup EJSON nello scratchpad della sessione (`aid-cleanup-backup-2026-11-12.json`) e cancellazione su ordine dell'utente; 0 aid a DB.

### Aggiunte dopo la ricerca (2026-11-13)

Risposte dell'utente del 2026-11-13 (scelte fra opzioni proposte, non frasi sue) e default tecnici accettati dall'orchestratore. Riferimenti file:riga in `21-RESEARCH.md`.

- **D-18 (utente, P-1; completa D-04):** se manca il blocco del titolo del personaggio vale **il blocco più alto non superiore al suo titolo, altrimenti il più basso** (un legend seduto sui posti hero di un boss hero prende il blocco hero); chi apre il foglio **senza personaggio** vede il blocco del `minTitle`. **Una sola funzione** per foglio e risoluzione (`prizeBlockFor(quest, title)`).
- **D-19 (utente, P-2; completa D-09):** una sconfitta in combattimento in una quest che non apre soccorso (`heal`, `job`, `study`, `magic`, `crime`, `guard`) vale **come lo scontro con le guardie perso**: vita a 1, resta in città, corsia libera, ferite e consumi dello scontro tenuti, nessun premio, nessuna aid. Serve un piano d'esito dedicato (oggi `planParticipant` lancia su una sconfitta senza aid).
- **D-20 (utente, PQ2; completa D-14):** l'aid di una dungeon porta **la quota vera già sul foglio**: unità = turni, quota `(indice + 1) / totale`; monete, xp e quantità del `prizeItem` scritte **già in proporzione sull'aid alla nascita** (per difetto); `randomLoot` e pet restano sull'aid e la loro soglia di vittoria è moltiplicata per la quota alla risoluzione (nessun tiro nuovo). Turno salvato in `rescue.turn { index, kind, total }`; la sua presenza dice «aid di dungeon» (l'aid perde il tipo d'origine).
- **D-21 (utente, PQ3; completa D-12, D-13):** l'esito porta **i turni per dungeon e aid di dungeon** (la FE stampa una sola riga dei turni al posto della riga delle tappe): campi nuovi nullable su `QuestResult` — `turnsTotal`, `turnsCompleted`, `lastTurn` (1-based, ultimo turno giocato), `lastTurnKind: DungeonTurnKind { exploration, fight }` — `null` fuori da dungeon e aid di dungeon; `stagesCleared` / `stagesTotal` restano come sono (ripiego della FE) e si valorizzano anche per i soccorritori di un'aid di dungeon.
- **D-22 (C-9; fissa D-07): il filo resta ADDITIVO.** `Quest.prizes` tiene nome e tipo `QuestPrizes!` e diventa risolto per viewer (titolo del personaggio corrente del bearer, HTTP e WS per sottoscrittore con memo per evento come `noEffect`); `Quest.rankPrizes: [QuestRankPrizes!]!` con `QuestRankPrizes { title: String!, prizes: QuestPrizes! }` (lista vuota sulle solitarie; lo userà la Phase 22 / FE 21); `type QuestPrizes` invariato; nessun argomento nuovo su `quests`. SDL proposto verbatim in `21-RESEARCH.md` §Q7. Cambia solo la semantica di `prizes`.
- **D-23 (C-4; completa D-03):** il boss misto scrive **`minTitle` = titolo più basso dei posti** (l'accettazione controlla il titolo prima dei posti); posti in ordine `[rango, inferiore]`, mai null; **1 boss su 2 misto** (`MIXED_BOSS_SHARE = 0.5`), da 1 a metà dei posti al titolo inferiore; il generatore conta la copertura dei boss sul titolo più alto dei posti; i tiri nuovi in coda alla quest e solo per i boss; i campi di oggi di `prizes` restano uguali al blocco del rango del boss; blocchi a DB in `prizes.rankPrizes` (solo Mongoose).
- **D-24 (C-2; completa D-02):** un posto a titolo null in un `boss` o una `worldMission` rende la quest **non accettabile** (`QUEST_NOT_ACCEPTABLE`, fail-closed); il boot riporta in sola lettura le quest di gruppo aperte con posti null, titoli dei posti senza blocco o magie in blocchi sotto mage.
- **D-25 (C-11; completa D-05b):** il cancello della magia vive in `canLearnSpell` / `drawLearnableSpell` e usa **il titolo dopo l'esito**; una study di Valantar vinta da un non caster passa al ramo della lore dello studio.
- **D-26 (C-5; completa D-10):** la nuova aid nata da un'aid di dungeon persa salva il turno dove sono caduti i soccorritori.
- **D-27 (C-8; completa D-16):** l'archiviatore libera corsie e PendingQuest dei soccorritori non partiti con **la stessa routine del timeout** e i chiamanti mandano lo stesso push `questCancelled` dopo il commit (bug riprodotto dalla sonda 1 della ricerca).
- **D-28 (C-10): nessun migratore né one-off.** Un boss senza blocchi si legge come premio unico = blocco del suo `minTitle`; i 12 boss a DB restano come sono.
- **D-29 (default tecnico, D-13):** nel segnaposto l'esplorazione è sempre superata e non consuma tiri (i tiri di una dungeon intera restano identici a oggi); la sconfitta in esplorazione si prova con una porta di test. Ritmo dei turni: esplorazione, scontro, esplorazione, scontro… (una dungeon da 4 gruppi = 8 turni).
- **D-30 (C-1):** il criterio 4 della ROADMAP è corretto di conseguenza (il 4° turno è uno scontro, il 5° un'esplorazione).

### Claude's Discretion
- Forma sul filo del blocco del viewer e nomi dei campi (`rankPrizes`, turno salvato su `rescue`).
- Frequenza dei boss misti; unità e arrotondamento del premio proporzionale.
- Migrazione: oggi a DB 0 worldMission, 0 story, 12 boss a titolo unico, 0 aid → i boss esistenti possono ricevere i blocchi del loro titolo da un one-off al boot reale (rimosso prima della merge) o restare letti come premio unico; decidere nel plan.

</decisions>

<canonical_refs>
## Canonical References

- FE `../Klimmeck-Guide/.planning/phases/20-rank-specific-prizes-for-group-quests/20-CONTEXT.md` e `20-DISCUSSION-LOG.md` — discuss d'origine
- `.planning/phases/09-*/09-CONTEXT.md` — aid D-08/D-09/D-10
- `.planning/phases/13-*/13-CONTEXT.md` — generatore, boss, pool per rango, dungeon
- `.planning/phases/18-quest-heal-per-taglia/18-CONTEXT.md` — D-23 cura non ereditata
- `.planning/phases/19-revisione-dei-modelli/BACKEND-NOTES.md` — pet in premio D-28
- Codice: `src/models/quest/quest-prizes.model.ts`, `src/quests/outcomes/rewards/quest-rewards.ts`, `src/quests/generation/generated-prizes.ts`, `loot-pools.ts`, `pet-prize.ts`, `src/quests/acceptance/quest-capacity.ts`, `quest-eligibility.ts`, `src/quests/outcomes/aid/aid-quest.ts`, `combatant-plan.ts`, `rescue-resolution.service.ts`, `quest-resolution.service.ts`, `boss-resolution.service.ts`, `character-archiver.ts`, `party-timeout.service.ts`, `src/models/character/active-spell-slots.ts`, `src/quests/outcomes/conclusion/conclusion-plan.ts`, `src/quests/outcomes/crime/crime-arrest.ts`

</canonical_refs>

<code_context>
## Existing Code Insights
- `prizesOf` calcola già monete/xp/loot per un titolo: chiamarlo per ogni titolo dei posti.
- `drawRewards` tira il loot per vincitore: riceve il blocco del titolo del partecipante.
- Pattern per viewer: `Quest.noEffect` (Phase 18).
- Ordine dei tiri delle spec a seme fisso: ogni tiro nuovo va dopo quelli esistenti e solo quando serve (Pitfall delle fasi 13/16/19).

</code_context>

<specifics>
- Ritmo della dungeon detto dall'utente: esplorazione → scontro 1 → esplorazione → scontro 2 → …; caduta possibile anche in esplorazione.
- DB 2026-11-12: 0 story, 0 worldMission, 12 boss (5 paladin, 5 mage, 2 hero), 40 dungeon senza posti, 34 crime senza nemici, 0 aid.

</specifics>

<deferred>
- Motore a turni della dungeon: lo scrive l'utente.
- Passo dei premi dell'oste: fase gemella della FE Phase 21 (da aprire).

</deferred>

---

*Phase: 21-premi-per-rango-e-soccorsi*
*Context gathered: 2026-11-12*
