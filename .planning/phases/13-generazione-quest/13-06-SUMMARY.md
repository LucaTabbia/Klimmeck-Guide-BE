---
phase: 13-generazione-quest
plan: 06
subsystem: quests (aid, soccorso, completamento del GM)
tags: [quests, aid, rescue, gm, BE-QGEN-01, BE-QGEN-10, D-01, D-02, D-12, D-17, D-21, D-28]
requires: ["13-05"]
provides:
  - "buildAidQuest clona `infos.enemies` (ordine e quantità, da `validQuestEnemiesOf`) e `prizes.pet` (ObjectId o null)"
  - "La aid non porta mai `generated` (lo schema scrive false di default)"
  - "Int-spec: sconfitta multi-nemico → aid con gli stessi nemici e lo stesso pet; soccorso in un solo combattimento aggregato; GM worldMission con XP sommata"
affects: [13-10, 13-12, 13-13]
tech-stack:
  added: []
  patterns:
    - "prova di assenza del flag sulla aid con `Object.keys(aid).sort()` sull'intero draft"
key-files:
  created: []
  modified:
    - src/quests/outcomes/aid/aid-quest.ts
    - src/quests/outcomes/aid/aid-quest.spec.ts
    - src/quests/outcomes/aid-rescue.int-spec.ts
    - src/quests/outcomes/gm-completion.service.int-spec.ts
decisions:
  - "`AidSourceQuest.prizes.pet?: unknown`, `AidQuestDraft.prizes.pet: Types.ObjectId | null`, `clonedPrizesOf` scrive `pet: refIdOf(prizes?.pet)`"
  - "`AidSourceQuest.infos.enemy?: unknown` resta per il lettore tollerante (ResolutionQuest lo eredita)"
  - "Il pet di prova nell'int-spec del soccorso è un ObjectId nudo: l'harness degli esiti non espone il modello Pet e il piano non tocca la consegna del pet"
metrics:
  duration: "~15 min"
  completed: 2026-11-04
  tasks: 2
  files: 4
---

# Phase 13 Plan 06: aid, soccorso e GM sulla lista dei nemici Summary

La aid nata da una sconfitta clona ora anche `prizes.pet` oltre alla lista `enemies` (già clonata dal 13-04) e non porta mai `generated`; soccorso e completamento del GM sono coperti con più nemici.

## Commit

| Task | Commit | Descrizione |
|------|--------|-------------|
| 1 RED | 996dd3b | `test(quests): pin the aid clone of the enemies list` |
| 1 GREEN | aa6c2e2 | `feat(quests): clone the enemies and the pet prize into the aid` |
| 2 | 5d40c00 | `test(quests): cover rescue and gm completion with several enemies` |

## RED osservati

- Task 1: 3 rossi su 24 in aid-quest.spec.ts: `clones the pet prize (D-21)` (`aid.prizes.pet` undefined), `copies the prizes without sharing references` (l'originale ora ha `pet`, la copia no), `fills the missing fields with empty defaults` (atteso `pet: null`). Verdi al primo colpo, come previsto dal piano: `clones the enemies list in order with the quantities (D-01, D-12)`, `clones a legacy single enemy as a one-entry list (D-28)`, `clones no enemies for a quest without enemies (D-01)` (la clone della lista è del 13-04) e `never marks the aid as generated (D-17)` (il draft non ha mai avuto il campo: il caso fissa l'elenco esatto delle chiavi). Dopo il GREEN 24/24.
- Task 2: tutti verdi al primo colpo (codice del 13-04 + Task 1): aid-rescue `opens an aid with the same enemies after losing a multi-enemy quest (D-01)` (lista, pet, `generated: false` a DB), `rescues against every enemy of the aid in one aggregated fight (D-02)` (un solo contesto, voci 3 e 1, xpGained = 50 + 3×20 + 120); gm-completion `completes a multi-enemy quest with the summed enemy xp (D-02)` (worldMission, 400 + 2×100 + 50, `result.enemies` uguale alla lista).

## Gate

- `npx tsc --noEmit -p tsconfig.json` esce 0 dopo ogni task.
- `npx jest src/quests/outcomes/aid/aid-quest.spec.ts --selectProjects unit` → 24/24.
- `npx jest src/quests/outcomes/aid-rescue.int-spec.ts src/quests/outcomes/gm-completion.service.int-spec.ts --selectProjects integration --runInBand` → 36/36.
- `npx jest src/quests/outcomes --selectProjects integration --runInBand` → 9 suite, 109/109; `npx jest src/quests --selectProjects unit` → 37 suite, 635/635.
- Prettier ed eslint per file sui quattro `.ts` toccati: puliti.
- Accettazione: `validQuestEnemiesOf(infos)` 1, `generated` 1 (il commento) in aid-quest.ts; `D-21)` e `D-17)` 1 ciascuno in aid-quest.spec.ts; `D-02)` 1 in ciascuna int-spec.
- `git diff origin/develop -- src/schema.gql | grep -E '^-[^-]'` → solo le due righe `  enemy: Enemy`; `git diff --exit-code src/schema.gql` esce 0.

## Deviations from Plan

None - plan executed exactly as written.

## Threat Model

T-13-07 mitigata: la aid non ha `generated` (caso `(D-17)` con l'elenco esatto delle chiavi, `generated: false` a DB nell'int-spec); le voci dei nemici passano da `validQuestEnemiesOf`.

## Known Stubs

Nessuno.

## Self-Check: PASSED

- File modificati presenti; commit 996dd3b, aa6c2e2, 5d40c00 presenti in `git log`.
