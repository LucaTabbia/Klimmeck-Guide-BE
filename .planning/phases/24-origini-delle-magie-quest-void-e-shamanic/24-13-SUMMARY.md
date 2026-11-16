---
phase: 24-origini-delle-magie-quest-void-e-shamanic
plan: 13
subsystem: quests
tags: [spells, learning, research, outcome-plan, tdd]
requires: ["24-12"]
provides:
  - "learnTimeOf: tempo di apprendimento fail-closed (intero sicuro > 0 in ms)"
  - "SpellCandidate.name e SpellCandidate.learnTime letti dal pool del sorteggio"
  - "SpellLearningPlan, ParticipantPlan.learning, QuestResultDraft.spellResearchFailed"
affects: ["24-14", "24-15", "24-16", "24-17", "24-18"]
tech-stack:
  added: []
  patterns: ["spread condizionale per i campi validi letti lean", "funzione pura locale learningOf con early return"]
key-files:
  created: []
  modified:
    - .planning/REQUIREMENTS.md
    - .planning/phases/24-origini-delle-magie-quest-void-e-shamanic/24-VALIDATION.md
    - src/quests/outcomes/rewards/quest-rewards.ts
    - src/quests/outcomes/rewards/quest-rewards.spec.ts
    - src/quests/outcomes/resolution-loader.service.ts
    - src/quests/outcomes/resolution-loader.service.spec.ts
    - src/quests/outcomes/outcome-plan.ts
    - src/quests/outcomes/outcome-plan.spec.ts
decisions:
  - "La parte di apprendimento nasce solo dal sorteggio, nella corsia standard e con un tempo valido; ogni altra via resta immediata (D-26, D-30)"
  - "learningOf rilegge il tempo con learnTimeOf anche sul candidato (doppia cintura oltre al lettore)"
metrics:
  completed: 2026-11-16
  tasks: 3
  commits: 4
---

# Phase 24 Plan 13: magia trovata e magia imparata nel piano d'esito — Summary

Il piano d'esito distingue la magia TROVATA dal sorteggio dalla magia IMPARATA: con un `requiredLearnTime` valido (intero sicuro > 0) la magia sorteggiata nella corsia standard non entra in `status.spellStates`, non sblocca la sua lore, non compare in `result.spellLearned`, la corsia standard resta occupata e il piano la consegna in `plan.learning { spellId, spellName, learnTime }`; `result.spellResearchFailed` dice se un sorteggio vinto non ha dato nulla. Nessun tiro toccato.

## Commit

| Task | Commit | Subject |
|------|--------|---------|
| 1 | 22ebd714 | docs(phase-24): add the research and learning requirements |
| 2 (RED) | a1128508 | test(quests): expect a learning part after a drawn spell |
| 2 (GREEN) | 81c430c8 | feat(quests): split the found spell from the learned spell |
| 3 | (questo) | docs(phase-24): record plan 13 progress |

## Firma finale di `learningOf`

```typescript
function learningOf(
    spellFound: Types.ObjectId | null,
    drawn: SpellCandidate | null,
    lane: QuestLane,
): SpellLearningPlan | null
```
Null se nessuna magia trovata, se la magia non viene dal sorteggio (`drawn` è null quando c'è `rewards.spellCandidate`), su una corsia GM (`isGmLane`) o se `learnTimeOf(drawn.learnTime)` è null.

## RED

- Atteso: compilazione di ts-jest e asserzioni. Osservato: ts-jest di questo repo non blocca sui tipi (diagnostica disattivata), quindi i fallimenti sono a runtime: `learnTimeOf is not a function` (10 casi), `plan.learning` indefinito, `status.spellStates` presente e corsia liberata nei casi del nuovo describe, `spellResearchFailed` indefinito, proiezione senza `name`/`requiredLearnTime`. Totale 31 falliti su 292.
- Verdi al primo colpo (motivo):
  - `carries no learn time into the fixed spell candidate (D-30)`: `spellCandidateOf` copia già a mano i soli campi noti.
  - `settles xp, coins and items at the end of the research (D-26)`: oggi entrambi gli esiti sono immediati e identici sui premi; il caso pinna che il cambio non li sposta.

## GREEN e gate

- `npx jest src/quests/outcomes/rewards src/quests/outcomes/outcome-plan.spec.ts src/quests/outcomes/resolution-loader.service.spec.ts src/quests/guided --selectProjects unit`: 374 / 374.
- `npx jest src/quests --selectProjects unit` (controllo più largo): 1 615 / 1 615.
- `npx jest src/quests/outcomes/study-spell-draw.int-spec.ts src/quests/outcomes/quest-resolution.service.int-spec.ts --selectProjects integration --runInBand`: 2 suite, 53 / 53, senza modifiche (fixture con tempo 0).
- `npx tsc --noEmit -p tsconfig.json`: 0. `src/schema.gql` senza diff. Prettier ed ESLint puliti sui file toccati.
- Accettazione: `learnTimeOf` 1, `SpellLearningPlan` 1, `requiredLearnTime: 1` 1, `isGmLane` 3, `D-26)` 11, `D-30)` 2, `D-29)` 2, righe con `chance.next(` nel diff del codice 0, nessun jest rimasto.

## Spec esistenti toccate

- `resolution-loader.service.spec.ts`: le due attese sulla proiezione esatta (`projects the minimum level of the learnable spells (D-07)` e `reads the related lore … (D-24)`) aggiungono `name: 1` e `requiredLearnTime: 1`: la proiezione cambia per contratto del piano.
- `outcome-plan.spec.ts`, `drafts the result sheet`: il foglio intero ha ora `spellResearchFailed: false` (il piano lo scrive sempre).

## Deviations from Plan

1. **[Rule 3] Due spec esistenti aggiornate** (sopra): il piano diceva «le attese esistenti restano valide» per i candidati, ma le asserzioni con `toEqual` sulla proiezione e sul foglio intero cambiano per forza; nessuna logica di quei casi è cambiata.
2. **Doppia cintura in `learningOf`:** il tempo si rilegge con `learnTimeOf` anche nel piano (il caso `learnTime: 0` sul candidato lo richiede), oltre allo spread condizionale del lettore.

## Nota per i piani 14–18 (D-31, ruling del 2026-11-16 arrivato durante l'esecuzione)

L'orchestratore ha cambiato la decisione di disegno 1 di questo piano: il `QuestResult` della fine della ricerca si scrive e si consegna SUBITO (con `spellLearned` nullo e il nuovo `spellFound`), nessun foglio trattenuto; un secondo foglio piccolo alla fine dell'apprendimento. Questo piano non codifica il foglio trattenuto né «nessun `QuestResult`»: il calcolo puro resta valido così com'è (`result.spellLearned` nullo e `plan.learning.spellId` per la magia trovata). Il campo `spellFound` della bozza NON è stato aggiunto qui: lo aggiunge il piano riscritto (valore naturale `learning?.spellId ?? null`). Il piano 24-14 non è stato eseguito.

## Threat Flags

Nessuna superficie nuova: nessun campo sul filo, nessun handler, nessuna scrittura a DB nuova. T-24-41 (`learnTimeOf` fail-closed, `it.each` sui valori sporchi), T-24-42 (`spellLearned`, `learnedState`, `spellLore` dipendono dalla sola magia imparata) e T-24-43 (nessun tiro) mitigati.

## Self-Check: PASSED
