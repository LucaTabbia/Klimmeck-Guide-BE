---
phase: 11-popolamento-del-mondo
plan: 02
subsystem: quests/outcomes
tags: [quests, rewards, spells, study, BE-CONTENT-06, D-31]
requires: []
provides:
  - "QuestPrizes.spellDraw: booleano solo Mongoose (default false, nessun `@Field`, SDL invariato)"
  - "src/quests/outcomes/rewards/quest-rewards.ts: SpellDraw, DrawnRewards.spellDraw, RewardCatalog.spellPool, drawLearnableSpell"
  - "ResolutionLoader.readRewardCatalog carica il pool di tutte le magie valide solo per prizes.spellDraw === true"
  - "planParticipant: magia fissa della study, altrimenti magia sorteggiata fra le apprendibili"
affects: [11-08, 11-23, 11-25]
tech-stack:
  added: []
  patterns:
    - "tiro aggiuntivo del ChanceSource consumato DOPO il loot e solo col flag: l'ordine dei tiri delle altre quest non cambia"
    - "stessa guardia (isFiniteNumber + isUsageCount) per magia fissa e pool, estratta in learnableSpellOf"
key-files:
  created:
    - src/quests/outcomes/study-spell-draw.int-spec.ts
  modified:
    - src/models/quest/quest-prizes.model.ts
    - src/models/quest/quest-outcome-fields.schema.spec.ts
    - src/quests/outcomes/rewards/quest-rewards.ts
    - src/quests/outcomes/rewards/quest-rewards.spec.ts
    - src/quests/outcomes/outcome-plan.ts
    - src/quests/outcomes/outcome-plan.spec.ts
    - src/quests/outcomes/resolution-loader.service.ts
decisions:
  - "Solo il booleano `true` attiva il sorteggio: stringa `'true'`, `1` o `null` non consumano tiri"
  - "La magia fissa (`prizes.spell`) vince sul sorteggio: il pool si consulta solo se `spellCandidate` è null"
  - "Pool ordinato per id esadecimale crescente (riproducibilità del tiro), voci malformate escluse con la guardia della magia fissa"
  - "Il tiro si consuma anche se il pool o le magie apprendibili sono vuoti: un tiro per partecipante col flag, sempre"
metrics:
  duration: "~25 min"
  completed: 2026-11-02
  tasks: 2
  files: 8
---

# Phase 11 Plan 02: la study di Valantar sorteggia una magia apprendibile (D-31) Summary

Il flag interno `QuestPrizes.spellDraw: true` (solo Mongoose, SDL invariato) fa sorteggiare alla risoluzione, per ogni partecipante, una magia fra quelle del catalogo non conosciute e con `minXpToLearn ≤ xp` dopo i premi; la magia segue il percorso di apprendimento esistente (`status.spells`, `status.spellStates` a usi pieni, `QuestResult.spellLearned`) oppure l'esito resta senza magia.

## Commit

| Task | Fase TDD | Commit | Subject |
| ---- | -------- | ------ | ------- |
| 1 | RED | 58e09f0 | `test(quests): expect the study spell drawn among the learnable ones` |
| 1 | GREEN | 0836841 | `feat(quests): draw a learnable spell for spell-draw studies` |
| 2 | RED | b00fc3c | `test(quests): expect the drawn spell learned on resolution` |
| 2 | GREEN | 407f481 | `feat(quests): learn the spell drawn by the Valantar study` |

Ogni commit verificato con `git log -1 --format=%B | grep -ciE "co-authored-by|generated with"` → `0`; subject fra 57 e 67 caratteri.

## Fallimenti attesi (RED)

- Task 1: `npx jest src/quests/outcomes/rewards src/models/quest --selectProjects unit` → `Tests: 14 failed, 51 passed, 65 total`: `drawLearnableSpell is not a function` sui casi del sorteggio, `Cannot read properties of undefined (reading 'instance')` sul caso di schema (`spellDraw` assente), `spellDraw` mancante nelle uguaglianze di `drawRewards`.
- Task 2: `outcome-plan.spec.ts` → 1 failed (`learns the drawn spell when the quest draws one (D-31)`); `study-spell-draw.int-spec.ts` → 2 failed (`teaches a spell drawn among the unknown learnable ones (D-31)` e `leaves a catalog spell without max usages out of the draw (D-31)`, `spellLearned` = `null` perché il loader restituiva il pool vuoto).
- Verdi al primo colpo (attesi, descrivono comportamento invariato o il ramo «nessuna magia»): `keeps the fixed spell of the study when present (D-31)`, `learns no drawn spell from a lost fight (D-31)`, `teaches no spell when none is learnable after the prizes (D-31)`, `ignores the spell catalog for a study without the flag`.

## Verifiche (GREEN)

- `npx jest src/quests/outcomes/rewards src/models/quest --selectProjects unit` → `Test Suites: 5 passed`, `Tests: 65 passed, 65 total`.
- `npx jest src/quests/outcomes --selectProjects unit` → `Test Suites: 20 passed`, `Tests: 353 passed, 353 total`.
- `npx jest src/quests/outcomes/study-spell-draw.int-spec.ts src/quests/outcomes/quest-resolution.service.int-spec.ts src/quests/outcomes/gm-completion.service.int-spec.ts --selectProjects integration --runInBand` → `Test Suites: 3 passed`, `Tests: 37 passed, 37 total`.
- Boot reale `npx jest test/app.int-spec.ts --selectProjects integration --runInBand` → `Tests: 66 passed, 66 total`; `git diff --exit-code src/schema.gql` esce 0; `grep -c spellDraw src/schema.gql` → `0`; rispetto a `origin/develop` righe `-` = 1, righe `+` = 0.
- `npx tsc --noEmit -p tsconfig.json` esce 0 a fine di ogni task; `npx eslint` e `npx prettier --check` puliti sui file toccati (tutti già conformi, nessun commit `style`); `pgrep -fl jest` vuoto.
- Criteri di accettazione: `spellDraw: boolean` 1 riga senza `@Field` nelle 3 righe precedenti (`0`); `export function drawLearnableSpell` 1 riga; `D-31` in `quest-rewards.spec.ts` = 6, in `study-spell-draw.int-spec.ts` = 3; `drawLearnableSpell(` in `outcome-plan.ts` = 1.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `spellPool: []` nel loader già nel Task 1**
- **Found during:** Task 1
- **Issue:** `tsc` segnalava `RewardCatalog` senza `spellPool` in `resolution-loader.service.ts`.
- **Fix:** come previsto dal piano (punto 4), `spellPool: []` aggiunto subito; il caricamento vero nel Task 2.
- **Commit:** 0836841

**2. [Rule 2 - Correttezza] caso di int-spec per il pool con una magia malformata (T-11-05)**
- **Found during:** Task 2
- **Issue:** il piano mitiga T-11-05 con le guardie della magia fissa ma non prevedeva un test end-to-end.
- **Fix:** caso `leaves a catalog spell without max usages out of the draw (D-31)` (tiro 0.99 su pool valido+malformato → la sola valida). Aggiunti anche `treats a known spell stored as a legacy string as known (D-31)` (unit) e `learns no drawn spell from a lost fight (D-31)`.
- **Commit:** b00fc3c

### Note

- Boy Scout: la guardia della magia fissa (`isFiniteNumber` + `isUsageCount`) è stata estratta in `learnableSpellOf` e riusata dal pool; proiezione condivisa `LEARNABLE_SPELL_PROJECTION`.
- Il criterio «`grep -n "spellPool"` nel loader ≥ 2 righe» dà 1 riga case-sensitive (`spellPool: await this.readSpellPool(prizes)`): il caricamento sta nel metodo `readSpellPool` (`grep -ci spellpool` → 2). Il key-link `pattern: spellPool` è soddisfatto.
- `drawRewards` è condiviso da `combatant-plan.ts` e `gm-completion.service.ts`: anche il completamento GM di una study col flag sorteggia (stesso `readCatalog`); nessun caso dedicato, `gm-completion.service.int-spec.ts` resta verde senza modifiche.

## Threat model

- T-11-04: filtro `minXpToLearn ≤ xp dopo i premi` + magie non note; nessun input del client; provato da `returns no spell when nothing is learnable (D-31)` e dall'int-spec.
- T-11-05: voci senza soglia o usi validi fuori dal pool; provato end-to-end.
- T-11-06: la magia sorteggiata è riportata in `QuestResult.spellLearned`.
- T-11-07: nessun `@Field`; boot reale + `grep -c spellDraw src/schema.gql` = 0.

## Self-Check: PASSED

- File creato presente: `src/quests/outcomes/study-spell-draw.int-spec.ts`.
- Commit presenti: 58e09f0, 0836841, b00fc3c, 407f481.
