---
phase: 22-completamento-guidato-missioni
plan: 07
subsystem: quests
tags: [guided-mission, draft, transactions, prizes]
requires: ["22-06"]
provides:
  - "MissionDraft (collection missiondrafts, solo Mongoose), enum MissionDraftStep e MissionFightVerdict, tipo lean MissionDraftRecord, indici MISSION_DRAFT_PENDING_QUEST_INDEX (unico) e MISSION_DRAFT_CHARACTER_INDEX"
  - "prefilledPrizeOf({ characterId, block, catalog }) → MissionPrizeRecord e MAX_PRIZE_ITEM_QUANTITY = 99"
  - "MissionDraftService: start, read, requireFor, discard, write (export di GuidedMissionModule)"
  - "ResourceNotFoundException.missionDraft() → 'Bozza della missione non trovata'"
  - "completePendingRequest cancella la bozza della richiesta nella sua transazione (afterSeats)"
affects: [22-08, 22-12, 22-13, 22-14, 22-15, 22-16]
tech-stack:
  added: []
  patterns: ["indice unico multikey su participants.pendingQuest + rilettura dopo E11000 per l'idempotenza degli avvii concorrenti"]
key-files:
  created:
    - src/quests/guided/mission-draft.model.ts
    - src/quests/guided/mission-draft-prefill.ts
    - src/quests/guided/mission-draft-prefill.spec.ts
    - src/quests/guided/mission-draft.service.ts
    - src/quests/guided/mission-draft.service.int-spec.ts
    - src/quests/guided/guided-mission.module.ts
  modified:
    - src/authz/resource-not-found.exception.ts
    - src/authz/resource-not-found.exception.spec.ts
    - src/app.module.ts
    - src/quests/outcomes/gm-completion.service.ts
    - src/quests/outcomes/quest-outcomes.module.ts
    - src/quests/outcomes/gm-completion.service.int-spec.ts
decisions:
  - "`MissionDraftParticipant.name` ha default stringa vuota invece di required: un required di Mongoose rifiuterebbe la stringa vuota di un personaggio senza nome"
  - "`start` rilegge sempre la bozza dopo la transazione (vincitore o perdente della gara): la risposta è la forma lean della collection, non il documento creato"
  - "Le sotto-forme monete e cura dei premi sono sotto-schemi nominati (`MissionPrizeCoinsRecord`, `MissionPrizeCureRecord`), strutturalmente uguali al contratto del piano"
  - "`discard` include sempre anche l'id della PendingQuest chiamante nell'insieme dei marcatori da azzerare"
metrics:
  duration: "~35 min"
  completed: 2026-11-14
---

# Phase 22 Plan 07: bozza nel BE Summary

La bozza del flusso guidato vive nella collection `missiondrafts`: una per story o per gruppo della stessa worldMission (indice unico multikey su `participants.pendingQuest`), avviata in transazione insieme al marcatore `missionDraftStartedAt` su tutte le PendingQuest del gruppo, con i premi precompilati dal blocco del titolo di ogni partecipante; lettura con cancellazione pigra delle bozze orfane, scarto che azzera i marcatori anche senza documento, scrittura delle sezioni last-write-wins; il vecchio `completePendingRequest` cancella la bozza nella sua transazione.

## Forma finale della bozza

```typescript
// src/quests/guided/mission-draft.model.ts (solo @Prop, nessun @Field)
export enum MissionDraftStep { teleport, fights, prizes, recap }   // valori = nomi
export enum MissionFightVerdict { success, failure }
MissionDraftParticipant { character; pendingQuest; name (default ''); title; maxLifePoints }
MissionItemUsageRecord { item; quantity }   MissionSpellUsageRecord { spell; usages }
MissionFightEffectsRecord { hpAfter; injuriesAdded; consumablesUsed; spellsUsed }
MissionFightOutcomeRecord { character; hpBefore; injuriesBefore; consumablesAvailable; spellsAvailable; simulated | null; corrected | null }
MissionFightEnemyRecord { enemy; quantity }
MissionFightRecord { enemies; verdict | null; outcomes }
MissionPrizeItemRecord { itemType: 'EquipmentItem' | 'LootItem'; item; quantity }
MissionPrizeCoinsRecord { gold; silver; copper }   MissionPrizeCureRecord { lifePointsShare; canHeal }
MissionPrizeRecord { character; coins; xp; items; pet | null; spell | null; cure | null }
@Schema({ collection: 'missiondrafts' }) MissionDraft { quest; questType; participants; step = teleport; place = null; fights = []; prizes = []; startedBy | null; startedAt; updatedAt }
export type MissionDraftRecord = MissionDraft & { _id: Types.ObjectId };
```

Ogni sotto-classe esporta anche il suo `…Schema` (`SchemaFactory.createForClass`); `MissionDraftSchema` porta i due indici nominati.

## Gestione dell'E11000

`start` legge la richiesta, restituisce subito una bozza esistente su uno qualunque degli id dei posti, poi `assertNoBusyParticipant` e la costruzione del documento (nomi da `infos.name`, blocchi `prizeBlockFor`, catalogo `readRewardCatalogFor(rewardRefsOf(blocchi), null)`). Nella transazione: `create([draft], { session })` + `updateMany` dei marcatori con controllo di `matchedCount`. Due avvii concorrenti collidono sull'indice unico: il perdente riceve un WriteConflict (ritentato dal driver) o un errore di chiave duplicata; il secondo è assorbito e in ogni caso la bozza si rilegge dopo la transazione. Il caso con `Promise.all` è verde.

## Task e commit

| Task | Nome | Commit |
|------|------|--------|
| 1 RED | precompilazione e fabbrica `missionDraft()` | `3646b13b` test(quests): pin the mission draft prefill |
| 1 GREEN | modello, precompilazione, fabbrica | `e3c90528` feat(quests): model the mission draft and prefill its prizes |
| 2 RED | ciclo di vita della bozza e cancellazione nel vecchio completamento | `44cd0208` test(quests): pin the mission draft lifecycle |
| 2 GREEN | `MissionDraftService`, `GuidedMissionModule`, gancio `afterSeats` | `2642cafc` feat(quests): keep the guided mission draft in the backend |

RED atteso e visto: task 1 `Cannot find module 'src/quests/guided/mission-draft-prefill'` e `ResourceNotFoundException.missionDraft is not a function`; task 2 `Cannot find module './guided-mission.module'` e, nel caso D-25, `missionDrafts.countDocuments()` = 1 invece di 0.

## Guardie eseguite

- Task 1: unit `src/quests/guided` + `src/authz` 107/107; `tsc` 0; `schema.gql` invariato.
- Task 2: unit `src/quests/guided` 5/5; integration `src/quests/guided` + `gm-completion.service.int-spec.ts` + `complete-pending-request.resolver.int-spec.ts` 47/47; boot reale `test/app.int-spec.ts` 95/95 con SDL invariato; `tsc` 0.
- Tutti i casi nuovi sono partiti RED (moduli assenti); nessun caso verde al primo colpo per altri motivi.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `name` del partecipante senza `required`**
- **Found during:** Task 2
- **Issue:** con `required: true` Mongoose rifiuta la stringa vuota: un personaggio senza `infos.name` avrebbe fatto fallire l'avvio.
- **Fix:** `@Prop({ type: String, default: '' })`.
- **Files modified:** `src/quests/guided/mission-draft.model.ts`
- **Commit:** `2642cafc`

Nessuna spec fuori piano corretta. La int-spec del vecchio completamento registra il modello della bozza con `connection.models[name] ?? connection.model(name, schema)` e chiama `init()` nel `beforeAll` (Pitfall 9).

## Known Stubs

Nessuno: nessun handler espone la bozza (il filo arriva nel piano 08).

## Self-Check: PASSED
