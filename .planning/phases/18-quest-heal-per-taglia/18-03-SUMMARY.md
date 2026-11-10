---
phase: 18-quest-heal-per-taglia
plan: 03
subsystem: quests-outcomes
tags: [heal, cure, outcome-plan, gm-completion, quest-result, tdd]
requires: ["18-02"]
provides:
  - "planParticipant legge `quest.prizes.cure` (cureOf) su ogni quest vinta, dopo combattimento e progressione (D-07, D-20)"
  - "OutcomeQuestSnapshot.prizes?: { cure?: unknown } | null"
  - "PrizesSnapshot.cure?: unknown"
affects: [18-07, 18-09, 18-11]
tech-stack:
  added: []
  patterns: ["cura come premio della vittoria, non come tipo di quest", "tetto della vita sul massimo dopo progressionAfter"]
key-files:
  created: []
  modified:
    - src/quests/outcomes/outcome-plan.ts
    - src/quests/outcomes/outcome-plan.spec.ts
    - src/quests/outcomes/rewards/quest-rewards.ts
    - src/quests/outcomes/quest-resolution.service.int-spec.ts
    - src/quests/outcomes/gm-completion.service.int-spec.ts
    - src/quests/results/quest-result.resolver.int-spec.ts
decisions:
  - "La regola della Phase 9 D-15 (heal vinta = ferite azzerate e HP al massimo) non esiste più: una heal senza `cure` a DB non cura (fail-safe D-01)"
  - "`InjuryType` in outcome-plan.ts diventa `import type` (usato solo come tipo dopo la rimozione di `Object.values(InjuryType)`)"
  - "STATE.md registra `Plan: 3 of 11` (formato del brief), non `Plan: 03 of 11` del verify del piano"
metrics:
  duration: "~25 min"
  completed: 2026-11-10
  tasks: 3
  files: 6
---

# Phase 18 Plan 03: cura nel piano d'esito — Summary

`planParticipant` non guarda più il tipo `heal`: su una quest vinta (`success` o `gmCompleted`) legge `cureOf(quest.prizes?.cure)`, applica `cureInjuries` alle ferite DOPO `woundsAfter` (ferite nuove comprese, D-20) e il tetto `lifePointsAfterCure` sugli HP finali col massimo DOPO `progressionAfter` (D-02). Sconfitta = nessuna cura (D-07); quota fuori scala = 0 con ferite curate lo stesso, cura malformata = nulla (D-23); filtro e chiavi del set invariati, `potionRecoveryUntil` mai scritta (D-16).

## Forma del codice

```typescript
// src/quests/outcomes/outcome-plan.ts (planParticipant, dopo progressionAfter)
const cure = won ? cureOf(quest.prizes?.cure) : null;
const fought = woundsAfter(snapshot.status.injuries ?? [], battle?.injuriesAdded ?? []);
const cured = cureInjuries(fought.injuries, cure?.canHeal ?? []);
const currentLifePoints = cure
    ? lifePointsAfterCure(progression.currentLifePoints, progression.maxLifePoints, cure.lifePointsShare)
    : progression.currentLifePoints;
// set: 'status.injuries': cured.injuries — risultato: injuriesAdded: fought.added, injuriesHealed: cured.healed
```

- `OutcomeQuestSnapshot.prizes?: { cure?: unknown } | null` (lo snapshot del loader porta già `prizes` con `RESOLUTION_QUEST_PROJECTION`: nessuna lettura nuova, nessun chiamante cambiato).
- `PrizesSnapshot.cure?: unknown` dopo `pet` in `src/quests/outcomes/rewards/quest-rewards.ts`.
- Helper spec: `questOf(type, minTitle = null, cure?: unknown)` in `outcome-plan.spec.ts` (aggiunge `prizes: { cure }` solo se definito).

## Task e commit

| Task | Commit | Descrizione |
|------|--------|-------------|
| 1 RED | f7bd137f | `test(outcomes): pin the cure of a won quest in the outcome plan` |
| 1 GREEN | ee0742ba | `feat(outcomes): cure from the quest prize after fight and progression` |
| 2 | b749d049 | `test(outcomes): pin the cure on the gm completion and on the wire` |
| 3 | (questo commit) | `docs(phase-18): record plan 03 progress` |

## Fallimenti RED osservati

- `outcome-plan.spec.ts`: 13 rossi su 77 (tutti i casi del `describe('the cure of a won quest')` tranne «cures nothing on a defeat (D-07)», «keeps the write filter unchanged when curing (D-07)» e «never writes the potion recovery from an outcome (D-16)», che erano già veri col codice della Phase 9: sono guardie di regressione). Motivi: la heal senza cura curava ancora tutto (HP al massimo), le job/story/study con cura non curavano, la cura malformata su una heal curava tutto.
- `quest-resolution.service.int-spec.ts`: 4 rossi su 19 (i quattro casi nuovi).
- Atteso dal piano ma NON osservato: l'errore di tipo su `prizes` nell'helper `questOf`. Lo spread condizionale `...(cure === undefined ? {} : { prizes: { cure } })` non passa dal controllo delle proprietà in eccesso, quindi `tsc` era già 0 al commit RED.

## Pin verdi al primo colpo (Task 2)

I tre casi del Task 2 sono passati al primo colpo, come previsto: la regola sta nel codice dal Task 1 (`planParticipant` è condiviso dal completamento del GM: l'override del GM entra come `battle`, quindi la cura si applica dopo, D-20) e `injuriesHealed` è sul modello con default vuoto dal piano 18-02 (anche un documento legacy senza il campo risponde `[]`).
- `applies the cure on top of the game master override (D-07)`: story con `xpPrize` 400 e cura piena, override `hpAfter` 300 + `deepCut` → a DB massimo 1200 e HP 1200, ferite `[]`; risultato `hpBefore` 1000, `hpAfter` 1200, `injuriesAdded` `['deepCut']`, `injuriesHealed` `['deepCut']`.
- `serves the injuries healed by the outcome (D-08)` e `serves an old result without healed injuries as an empty list (D-08)`: query nuova `QUEST_RESULT_HEALED` in `quest-result.resolver.int-spec.ts`.

## Verifica

- `npx jest src/quests/outcomes src/quests/results --selectProjects unit`: 30 suite, 533 test verdi.
- `npx jest src/quests --selectProjects integration --runInBand` (controllo di wave): 34 suite, 453 test verdi, 148 s.
- `npx tsc --noEmit -p tsconfig.json`: 0 a fine di ogni task.
- prettier `--write` + eslint sui sei file toccati, uno per uno: puliti (nessun file da formattare prima).
- `git diff --exit-code src/schema.gql`: 0; nessuna riga tolta rispetto a `origin/develop`.
- `git diff HEAD~2 --stat -- src/quests/outcomes/combat`: vuoto.

## Deviations from Plan

- **[Rule 1 - Boy Scout] `import type { InjuryType }`** in `outcome-plan.ts`: dopo la rimozione di `Object.values(InjuryType)` l'enum è usato solo come tipo. Commit ee0742ba.
- Il caso «computes the floor on the maximum after the level up (D-02)» verifica anche `status.maxLifePoints` 1200 (asserzione in più, stessa attesa del piano).
- Bookkeeping: `Plan: 3 of 11` (brief dell'orchestratore) invece di `Plan: 03 of 11` del verify del Task 3: il `grep -q "Plan: 03 of 11"` del piano non passa, innocuo (stesso caso dei piani 01 e 02). Spuntata anche la voce Wave 0 dell'helper `questOf` in VALIDATION.

## Known Stubs

Nessuno.

## Self-Check: PASSED

- Commit f7bd137f, ee0742ba, b749d049 presenti in `git log`.
- File modificati presenti; grep di accettazione: `QuestType.heal` 0, `cureOf(quest.prizes?.cure)` 1, `lifePointsAfterCure` 2, `cureInjuries` 2, `cure?: unknown` 1; spec D-20) 2, D-07) 5, D-02) 4, D-23) 2, D-16) 1; int-spec risoluzione D-02) 1, D-01) 1, D-07) 2; GM D-07) 1; foglio D-08) 2, `injuriesHealed` 5.
