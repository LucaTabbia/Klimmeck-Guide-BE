# Phase 22: Completamento guidato delle missioni - Context

**Gathered:** 2026-11-12 (discuss fatto nella FE Phase 21, `Klimmeck-Guide/.planning/phases/21-innkeeper-mission-completion-flow/21-CONTEXT.md`, stessa numerazione D-01..D-10)
**Status:** Ready for planning — dopo la Phase 21 (blocchi premio per titolo)

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
- **D-10:** I giocatori vedono solo il teleport e l'esito finale: bozza e simulazioni mai esposte a loro (solo innkeeper, nessun evento sui loro stream).

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
