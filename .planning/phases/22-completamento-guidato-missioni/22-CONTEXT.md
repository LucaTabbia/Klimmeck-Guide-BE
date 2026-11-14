# Phase 22: Completamento guidato delle missioni - Context

**Gathered:** 2026-11-12 (discuss fatto nella FE Phase 21, `Klimmeck-Guide/.planning/phases/21-innkeeper-mission-completion-flow/21-CONTEXT.md`, stessa numerazione D-01..D-12)
**Status:** Ready for planning — dopo la Phase 21 (blocchi premio per titolo)
**Amended:** 2026-11-14 dopo `22-RESEARCH.md` e le risposte dell'utente (D-13..D-27; D-03, D-04, D-06, D-07, D-09 e D-12 riviste dalle decisioni nuove: dove divergono vincono le nuove)

<domain>
## Phase Boundary

L'oste completa una `story` o `worldMission` con un flusso guidato al posto del solo `completePendingRequest` con override: teleport → scontri (nemici da una lista filtrata, uno o più scontri in sequenza) → simulazione col motore senza scritture sui personaggi → correzioni manuali → premi per personaggio dal blocco del titolo → completamento. Il BE possiede liste dei nemici, simulazione, bozza e scrittura finale; tutto `@Roles(innkeeper)` e nel log di audit (Phase 3).

</domain>

<decisions>
## Implementation Decisions

- **D-01:** `teleportCharacter` accetta già qualunque POI: la FE ora lascia cadere anche sui POI interni. Passo saltabile se il gruppo è già sul posto; il luogo dà i tipi di POI del passo 2.
- **D-02:** **Uno o più scontri in sequenza**, ognuno con uno o più nemici (tipo + quantità); ogni scontro parte dallo stato lasciato dal precedente dopo le correzioni.
- **D-03:** Query della lista nemici: di default i tipi del POI + habitat `city` (stessa regola di `zonePoolOf`) nella fascia xp del titolo della missione (`RANK_XP_BANDS`), **i 22 leggendari ammessi per le worldMission** (riservati alle missioni del GM); con «mostra tutti» l'intero bestiario.
- **D-04:** **Simulazione a secco** col `CombatResolver` (segnaposto oggi, motore dell'utente domani) sullo stato reale dei personaggi (equipaggiamento, compagno, magie, consumabili), **nessuna scrittura** su personaggi, quest o risultati; ritorna per personaggio esito, HP dopo, ferite aggiunte, consumabili e magie usati. Il tiro non deve consumare la sorgente di caso delle risoluzioni reali in modo osservabile (planner).
- **D-05:** Sconfitta simulata → rilancio o nemici cambiati, poi correzioni; la missione finisce **sempre completata** (`gmCompleted`, nessuna aid, nessun rifiuto — regola della Phase 9).
- **D-06:** Correzioni per personaggio dopo ogni scontro: togliere ferite, vita (1..max), consumabili e magie usati; aggiungere una ferita resta possibile; validazione come `validateOverrides` oggi.
- **D-07:** Premi per personaggio: si parte dal **blocco del titolo** (Phase 21) e l'oste toglie o aggiunge voci dal catalogo filtrato per titolo (tetto di rarità del loot del titolo, pet con lo stesso tetto, magie solo `isSpellCaster` e con `minXpToLearn`); il BE **rivalida** ogni premio contro il filtro (mai fidarsi del client). Xp dei nemici, xp del compagno (10 %, Phase 19), conoscenza e lore di vittoria (Phase 16/17) dai nemici scelti, come una vittoria.
- **D-08:** Completamento in **una transazione** come `GmCompletionService` oggi: stato finale corretto, scontri e nemici (in `QuestResult.enemies`), premi scelti; foglio dell'esito ai giocatori come oggi.
- **D-09:** **Bozza salvata nel BE** sulla richiesta (passo, luogo, scontri e nemici, risultati simulati, correzioni, premi), ripresa da qualunque dispositivo dell'oste; si invalida se la richiesta sparisce; nessun effetto sui personaggi finché non si completa (il teleport è già reale).
- **D-10:** I giocatori vedono il teleport, un **avviso «Missione in corso»** (stato esposto sul loro personaggio) e l'esito finale; bozza e simulazioni mai esposte a loro (utente, 2026-11-12, correggendo la prima risposta).
- **D-11:** Dall'**avvio del flusso** (bozza creata) all'**arrivo del risultato** i partecipanti sono **bloccati**: niente partenza di viaggi né accettazione di quest, rifiuto nel BE con un codice proprio — utente: «Vorrei che avessero anche l'avviso "Missione in corso" e che fossero bloccati (così non rischio che inizino viaggi o quest mentre eseguo la loro quest) fino all'arrivo del risultato». Sblocco al completamento o allo scarto della bozza da parte dell'oste. **Bloccati anche acquisti e vendite, cambio di equipaggiamento e compagno, equip delle magie e pozioni** (cambiano lo stato su cui si simula; utente, 2026-11-12: «Blocchiamo anche quelle azioni»).

### Stesso blocco per ogni missione (aggiunta 2026-11-12)
- **D-12:** Lacuna trovata nel discuss: nelle missioni normali il personaggio si legge **solo alla risoluzione** (`resolution-loader.service.ts:382`) e `equipItem`/`equipPet`/`equipSpell`, `useItem` (rifiutata solo in attesa di soccorso) e il negozio (solo «in città») non controllano la missione in corso: si può cambiare arma o bere una pozione un minuto prima dello scontro. Scelta dell'utente (opzione 1 di 2, scartato lo snapshot all'inizio): **il blocco di D-11 vale per ogni missione** dall'**inizio effettivo** (corsia standard: arrivo alla quest, cioè il tempo d'attesa; boss e quest registrate: party avviato, `startedAt`) **fino all'esito**: niente cambi di equipaggiamento, compagno o magie, niente `useSpell` fuori combattimento, niente pozioni, niente negozio, con lo stesso stato «missione in corso»; viaggi e accettazioni sono già bloccati dalla corsia occupata. Una sola guardia nel BE (un predicato «personaggio bloccato» condiviso dalle mutation) e un solo avviso nella FE.

### Aggiunte dopo la ricerca (2026-11-14)

Stessa numerazione nella FE (`21-CONTEXT.md`; D-28..D-30 riguardano solo la FE). Riferimenti file:riga in `22-RESEARCH.md`.

**Risposte dell'utente (2026-11-14, AskUserQuestion):**
- **D-13 (rivede D-12, conflitto C-1):** «viaggi e accettazioni già bloccati dalla corsia occupata» è falso per story e worldMission (corsie separate, `quest-eligibility.ts:184-185`). Utente: «Sì, blocca tutto» — con una missione in corso **ogni accettazione o iscrizione è rifiutata** con `MISSION_IN_PROGRESS`, dopo i rifiuti esistenti; la spec `quest-acceptance.service.int-spec.ts:476` (story accettata con una hunt in corso) si riscrive RED con una missione standard non ancora avviata.
- **D-14 (precisa D-06, C-9):** utente: «Solo quelle della missione» — l'oste toglie solo le ferite **aggiunte in questa missione** (dal motore o a mano); le ferite già possedute restano (guarirle è il premio `cure`). Sul filo `corrections[].injuries` è la lista completa delle ferite che lo scontro aggiunge dopo la correzione (sostituisce `simulated.injuriesAdded`).
- **D-15 (precisa D-07, contro la raccomandazione):** utente: «Liberi, senza tetto» — **monete e xp dei premi sono numeri liberi** (interi ≥ 0, nessun tetto legato al blocco). Il filtro per titolo e la rivalidazione restano per oggetti, pet e magie; quantità per voce di oggetto `1..99` (limite tecnico dell'orchestratore).
- **D-16 (precisa D-10):** utente: «Pedina solo per la guidata» — la FE mostra l'etichetta sulla pedina solo durante il flusso dell'oste e le righe su Diario e Tabellone in ogni missione. Perché la FE non lo deduca da sola, il BE espone **due campi risolti**: `CharacterStatus.missionInProgress: Boolean!` (ogni missione in corso, flusso guidato compreso) e `CharacterStatus.guidedMissionInProgress: Boolean!` (solo bozza aperta su una richiesta del personaggio).

**Ruling dell'orchestratore sulla ricerca (raccomandazioni accolte; l'utente può ribaltarle prima dell'esecuzione):**
- **D-17 (filo):** lo SDL è quello VERBATIM di `22-RESEARCH.md` §Q9 (nomi di bozza confermati; aggiunte accolte: query `missionDraft`, `PendingRequest.missionDraftStartedAt`, tipo `MissionPrizeOptions`) più: `CharacterStatus.guidedMissionInProgress: Boolean!` (D-16) e, su `MissionFightOutcome`, `consumablesAvailable: [MissionItemUsage!]!`, `injuriesBefore: [InjuryType!]!`, `spellsAvailable: [MissionSpellUsage!]!` (stato all'inizio dello scontro: la FE non calcola i limiti degli scontri successivi al primo). Solo aggiunte, nessuna rimozione.
- **D-18 (bozza, C-6, C-7, T-1, T-3):** una bozza per richiesta (story) o per gruppo di richieste della stessa worldMission, raggiunta da qualunque PendingQuest del gruppo; marcatore `PendingQuest.missionDraftStartedAt` solo Mongoose (i campi del filo restano risolti); concorrenza last-write-wins; passi `teleport` / `fights` / `prizes` / `recap` salvati senza imporre l'ordine.
- **D-19 (nemici, C-8, P-2, P-9):** variante `missionEnemyPoolOf` che riusa `livesIn` (animali inclusi); leggendari offerti solo per la worldMission se vivono nella zona, **senza filtro di fascia**; fascia di una worldMission mista = unione delle fasce da `minTitle` al titolo più alto dei posti; ordine stabile.
- **D-20 (compagno, C-2, T-2):** `CombatParticipant.companion` additivo, ignorato dal segnaposto (nessun tiro in più), valido per tutti i percorsi.
- **D-21 (C-5):** il verdetto è uno per scontro (`MissionFight.verdict`).
- **D-22 (premi, P-3, P-5):** tetto di rarità dalla tabella boss per la worldMission e dalla tabella enemy per la story; **il BE precompila `MissionDraft.prizes` all'avvio** con tutto il blocco del titolo di ogni partecipante (pool `randomLoot` intero e pet compresi; l'oste toglie); una sola funzione per opzioni e rivalidazione; le voci del blocco sono sempre ammesse.
- **D-23 (confini del blocco, P-6, P-8, T-4):** il ferito in attesa di soccorso NON è «missione in corso»; `deleteCharacter` resta permessa; `teleportCharacter` di un partecipante resta permesso; anche `travelPreview` rifiuta; i codici esistenti (`QUEST_IN_PROGRESS`, `QUEST_SLOT_BUSY`, `AWAITING_AID`, `CHARACTER_IMPRISONED`, `TRAVEL_IN_PROGRESS`) hanno la precedenza; iscrizione a una worldMission con bozza aperta → `QUEST_NOT_ACCEPTABLE`; `characterUpdated` si emette per ogni partecipante quando uno dei due campi cambia senza una scrittura sul personaggio (avvio e scarto della bozza, avvio del party); la finestra di millisecondi fra controllo e scrittura è accettata.
- **D-24 (scontri, T-5):** zero scontri ammessi (story narrativa: solo premi); `simulateMissionFight` rifiuta lo scontro k se il k-1 non è simulato; cambiare i nemici dello scontro k annulla simulazione e correzioni di k e dei successivi; rilanciare k annulla le simulazioni successive.
- **D-25 (completamento, T-6):** `completeGuidedMission` legge la bozza, scrive i nemici di tutti gli scontri in `QuestResult.enemies`, cancella la bozza e libera il blocco; `completePendingRequest` con gli override convive in questa fase e cancella la bozza nella sua transazione; si rimuove dopo la merge della FE Phase 21.
- **D-26 (C-3, P-7):** nel log di audit entrano le **mutation** nuove; le query dell'oste no, come `pendingRequests`. `Quest.rankPrizes` resta leggibile da ogni utente autenticato (nota N-21-01 chiusa).
- **D-27 (fuori scope):** bug latente trovato dalla ricerca — le PendingQuest delle corsie GM dei personaggi archiviati non vengono mai cancellate (`archived-character-queue.refresher.ts:13`, `gm-completion.service.ts:215-234`): annotato in STATE, non si corregge in questa fase.

### Claude's Discretion
- Forma SDL (query `missionEnemies`, mutation di simulazione, documento bozza vs campo sulla PendingQuest, completamento esteso vs mutation nuova), rimozione o convivenza del vecchio `completePendingRequest` con override (consiglio: il nuovo flusso lo sostituisce, FE gated).
- Invalidazione delle simulazioni a valle quando cambiano i nemici di uno scontro.

</decisions>

<canonical_refs>
## Canonical References
- FE `../Klimmeck-Guide/.planning/phases/21-innkeeper-mission-completion-flow/21-CONTEXT.md`, FE Phase 10 `10-CONTEXT.md` e `BACKEND-NOTES.md`
- `.planning/phases/21-premi-per-rango-e-soccorsi/21-CONTEXT.md` — blocchi per titolo
- `.planning/phases/09-*/09-CONTEXT.md` — `completePendingRequest`, nessun rifiuto; Phase 8 `teleportCharacter`; Phase 3 ruoli e audit
- Codice: `src/quests/outcomes/gm-completion.service.ts`, `combat/combat-resolver.ts`, `combat/placeholder-combat-resolver.ts`, `combat/combat-context.ts`, `src/quests/generation/enemy-pool.ts`, `generation-rules.ts`, `src/quests/outcomes/rewards/quest-rewards.ts`, `src/models/character/active-spell-slots.ts`
</canonical_refs>

<specifics>
- DB 2026-11-12: 0 story, 0 worldMission → per l'UAT servono una worldMission scritta a mano coi blocchi per titolo e una story.
</specifics>

<deferred>
- Motore a turni dell'utente: si innesta dietro lo stesso `CombatResolver`.
</deferred>

---

*Phase: 22-completamento-guidato-missioni*
*Context gathered: 2026-11-12*
