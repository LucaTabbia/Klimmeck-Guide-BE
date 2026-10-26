---
phase: 09-combat-result-admin-outcomes
plan: 05
subsystem: quests
tags: [outcomes, pure-functions, progression, rewards, aid, tdd]

# Dependency graph
requires:
  - phase: 09-combat-result-admin-outcomes (09-01)
    provides: QuestOutcome, QuestResult (campi del foglio), AwaitingAid { quest, aidQuest, since }
  - phase: 09-combat-result-admin-outcomes (09-02)
    provides: progressionAfter, levelRowFor, MIN_LIFE_POINTS, nextTitleAfterStory
  - phase: 09-combat-result-admin-outcomes (09-03)
    provides: DrawnRewards, RewardItem, canLearnSpell, NO_REWARDS
  - phase: 09-combat-result-admin-outcomes (09-04)
    provides: ParticipantOutcome (porta CombatResolver)
  - phase: 04-integrita-economica-atomics
    provides: applyTradeToInventory, TradeLine, fromCopper
provides:
  - planParticipant(input) → { filter, update: { $set }, coinsDelta, result: QuestResultDraft, spellRecoveries } per successo, fallimento e completamento GM
  - OUTCOME_CHARACTER_PROJECTION, OutcomeCharacterSnapshot, OutcomeQuestSnapshot, QuestResultDraft, ParticipantPlanInput, ParticipantPlan, SpellRecovery
  - statusFactsOf(snapshot), questFactsOf(quest) (valori "prima" e fotografia della quest condivisi)
  - planRescued(input) → { filter, update, result } e deathResultOf(input) → QuestResultDraft
  - questUpdateOf({ type, verdicts, now }) → $pull dei falliti / $set concludedAt / null; questClaimFilter(questId, ids | null)
affects: [09-12, 09-13, 09-15, 09-16]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Piano dell'esito puro: snapshot letto in sessione → stato finale completo → un solo $set condizionale con XP attesa nel filtro (pattern applyTrade di Phase 4)"
    - "Consumi e premi riusano applyTradeToInventory come righe sell/buy; consumi e usi di magie clampati al posseduto prima di generare le righe"

key-files:
  created:
    - src/quests/outcomes/outcome-plan.ts
    - src/quests/outcomes/outcome-plan.spec.ts
    - src/quests/outcomes/rescue-plan.ts
    - src/quests/outcomes/rescue-plan.spec.ts
    - src/quests/outcomes/quest-outcome-plan.ts
    - src/quests/outcomes/quest-outcome-plan.spec.ts
  modified: []

key-decisions:
  - "result.xpGained è il guadagno effettivo dopo il clamp a MAX_XP (xpAfter − xpBefore, mai negativo): sul foglio vale sempre xpAfter = xpBefore + xpGained"
  - "Ferite aggiunte filtrate sui valori di InjuryType e deduplicate; le esistenti restano invariate"
  - "Il fallimento scrive comunque level/maxLifePoints dalla tabella (deterministici, stesso unico scrittore)"
  - "Magie: usi scalati anche senza tempo di recupero noto (orfano di catalogo), nessun job; la voce resta in activeSpells con usi 0"

patterns-established:
  - "I servizi degli esiti (09-12/09-13/09-15) eseguono solo filter/update/result del piano dentro la transazione; 0 match = no-op"

requirements-completed: []  # contributo a BE-COMBAT-01, BE-COMBAT-03, BE-ADMIN-02; traceability nel gate 09-16

# Metrics
duration: 8min
completed: 2026-10-24
---

# Phase 9 Plan 05: Piano puro dell'esito Summary

**`planParticipant` traduce ogni esito individuale (successo, fallimento, completamento GM) in filtro con corsia e XP attesa, un solo `$set` dello stato finale (XP/livello/HP dalla tabella, ferite, inventario via `applyTradeToInventory`, magie, titolo, `completedQuests`, `awaitingAid`), delta delle monete, foglio del risultato e job di recupero; `planRescued`/`deathResultOf` e `questUpdateOf`/`questClaimFilter` coprono ferito e quest registrata**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-10-24T15:54:30Z
- **Completed:** 2026-10-24T16:02:30Z
- **Tasks:** 2 (2/2)
- **Files modified:** 6 (6 creati)

## Accomplishments

- `planParticipant`: `won = verdict !== failure`; fallimento senza aid → `Error('failure outcome requires an aid quest')`; HP del combattimento clampati a `1..maxBefore` prima della ricompensa; `progressionAfter` unico calcolo di XP (clamp 50 000), livello, HP massimi; heal vinta → ferite azzerate e HP al nuovo massimo; titolo esatto solo per la story vinta; consumi (solo `LootItem`) clampati al posseduto e venduti, premi comprati, tutto in `applyTradeToInventory`; usi delle magie mai sotto 0 con un recupero per uso; magia appresa con `canLearnSpell` sull'XP dopo il premio; `completedQuests` solo se vinta e non già presente (anche come stringa legacy); corsia sempre `null`; `awaitingAid { quest, aidQuest, since: now }` solo al fallimento.
- `planRescued`: filtro `activeCharacterById` + `'status.awaitingAid.aidQuest': { $in: idForms(aid) }`, `$set` di `awaitingAid: null` e `status.location` al marker della città se noto; foglio `rescued` senza cura.
- `deathResultOf`: foglio `death` con valori prima = dopo, `user` dal chiamante (letto prima dell'archivio).
- `questUpdateOf`: `null` per le non registrate; `$pull` dei falliti; `concludedAt` se almeno un vincitore (success o gmCompleted) o se aid. `questClaimFilter`: `{ _id, concludedAt: null }` + `$all` dei partecipanti per il gruppo.

## Task Commits

| # | Task | Commit | Tipo |
|---|------|--------|------|
| 1 | planParticipant (RED) | `78e6b6d` | test |
| 1 | planParticipant (GREEN) | `ef87add` | feat |
| 2 | soccorso, morte, update della quest (RED) | `d5e1b7d` | test |
| 2 | soccorso, morte, update della quest (GREEN) | `9e413f1` | feat |

**Plan metadata:** commit `docs(phase-9): complete plan 09-05 ...` (SUMMARY, VALIDATION, STATE, ROADMAP)

## RED evidence

- **Task 1:** `npx jest src/quests/outcomes/outcome-plan.spec.ts --selectProjects unit` → 29 falliti / 30 su `not implemented` (passava solo "refuses a failure without an aid quest", poi ristretto al messaggio esatto).
- **Task 2:** `npx jest src/quests/outcomes/rescue-plan.spec.ts src/quests/outcomes/quest-outcome-plan.spec.ts --selectProjects unit` → 20/20 falliti su `not implemented`.

## Verification

- `npx jest src/quests/outcomes --selectProjects unit`: 12 suite, 180/180 (outcome-plan 30, rescue-plan 5, quest-outcome-plan 15 inclusi).
- `npm run build`: 0; `src/schema.gql` invariato. Prettier e ESLint puliti sui 6 file.
- Grep di accettazione: `progressionAfter(` e `applyTradeToInventory(` 1 riga ciascuno in `outcome-plan.ts`; `$inc` = 0; `new Date(`/`new Types.ObjectId(` = 0; nessun altro scrittore di `'status.level'`/`'status.maxLifePoints'` in `src` fuori dagli spec; `isRegistered(` 1 riga; `$all` 1; `'status.awaitingAid.aidQuest'` 1.

## Decisions Made

- Vedi `key-decisions` nel frontmatter. In più: i ref dei consumi e delle magie arrivano come esadecimali dal resolver e si convertono con `objectIdFromHex` (id malformati ignorati); più voci per lo stesso oggetto o magia si cumulano rispettando il posseduto.
- `statusFactsOf`/`questFactsOf` esportati da `outcome-plan.ts` e riusati da `rescue-plan.ts` (helper privato `unchangedResult` per soccorso e morte), nessuna duplicazione.

## Deviations from Plan

### Scostamenti minori

**1. `xpGained` del foglio = guadagno effettivo**
- Il piano dà `xpGained = xpPrize + Enemy.xp`; al clamp di 50 000 il foglio mostrerebbe un guadagno superiore a `xpAfter − xpBefore`. Il calcolo della progressione usa il valore nominale; il foglio registra il guadagno effettivo (identico in ogni caso non clampato, casi 1 e 2).

**2. Spec: piani calcolati in `beforeAll` nei `describe`**
- Calcolarli nel corpo del `describe` faceva fallire la raccolta della suite in RED invece dei singoli casi; spostati in `beforeAll`.

**3. Progress Table della ROADMAP**
- Il piano indica `5/16`; l'orchestratore prescrive `9/16` (9 piani completati): applicato `9/16`.

Nessuna regola 1–4 attivata.

## Issues Encountered

None.

## Known Stubs

None.

## Threat Flags

Nessuna superficie nuova (moduli puri, nessun I/O): T-09-21..T-09-26 mitigati e coperti dagli spec (filtro con corsia e XP attesa, clamp HP/XP, consumi e usi clampati, titolo solo dalla story vinta, nessun premio al fallito, aid sempre conclusa).

## Self-Check: PASSED

- FOUND: src/quests/outcomes/outcome-plan.ts, rescue-plan.ts, quest-outcome-plan.ts e i 3 spec
- FOUND: 78e6b6d, ef87add, d5e1b7d, 9e413f1
