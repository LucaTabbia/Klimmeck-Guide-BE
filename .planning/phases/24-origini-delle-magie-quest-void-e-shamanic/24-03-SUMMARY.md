---
phase: 24-origini-delle-magie-quest-void-e-shamanic
plan: 03
subsystem: quests
tags: [spell-gate, min-level, quest-rewards, fail-closed]
requires: ["24-02"]
provides:
  - "SpellCandidate.minLevelToLearn e RewardCatalog.spells con minLevelToLearn"
  - "canLearnSpell / drawLearnableSpell giudicano levelAfter (progression.level), non più l'xp"
  - "LEARNABLE_SPELL_PROJECTION = { minLevelToLearn: 1, maxUsages: 1 }; learnableSpellOf fail-closed con isLearnLevel (intero >= 1)"
  - "chosenSpellOf (premio scelto dall'oste) copia minLevelToLearn"
affects: [24-04, 24-05, 24-07, 24-08, 24-10]
tech-stack:
  added: []
  patterns: ["cancello di livello dopo l'esito: progression.level dalla tabella unica, mai status.level salvato"]
key-files:
  created: []
  modified:
    - src/quests/outcomes/rewards/quest-rewards.ts
    - src/quests/outcomes/resolution-loader.service.ts
    - src/quests/outcomes/outcome-plan.ts
    - src/quests/guided/chosen-rewards.ts
    - src/quests/outcomes/rewards/quest-rewards.spec.ts
    - src/quests/outcomes/outcome-plan.spec.ts
    - src/quests/outcomes/resolution-loader.service.spec.ts
    - src/quests/guided/chosen-rewards.spec.ts
    - src/quests/guided/mission-draft-prefill.spec.ts
    - src/quests/outcomes/study-spell-draw.int-spec.ts
    - src/quests/outcomes/quest-resolution.service.int-spec.ts
decisions:
  - "Un solo ciclo RED -> GREEN per tutta la catena (SpellCandidate attraversa quattro moduli)"
  - "Livello del cancello = progression.level dopo i premi di xp; validità del livello letto lean = Number.isInteger && >= 1"
metrics:
  completed: 2026-11-15
  tasks: 2
  commits: 3
---

# Phase 24 Plan 03: cancello a livello nelle quest — Summary

Premio fisso, magia del blocco per titolo e sorteggio insegnano una magia solo se il livello del personaggio dopo l'esito (`progression.level`) raggiunge `minLevelToLearn`; il lettore lean scarta ogni magia senza un livello minimo intero >= 1. Nessun lettore sotto `src/quests/outcomes` né `chosen-rewards.ts` guarda più `minXpToLearn`; tiri e SDL invariati.

## Commit

| Task | Commit | Subject |
|------|--------|---------|
| 1 RED | 48e033fb | test(quests): expect the spell gate on the level after the outcome |
| 1 GREEN | c70e2785 | feat(quests): gate the learned spell on the character level |
| 2 | (questo) | docs(phase-24): record plan 03 progress |

## Fallimenti RED attesi e osservati

- **Unit** (29 rossi su 228, 4 suite su 5): ts-jest qui non segnala gli errori di tipo, quindi nessun errore di compilazione: tutti fallimenti a runtime. `minLevelToLearn` sconosciuto al codice → `candidate.minXpToLearn` undefined: i confronti con undefined sono sempre falsi, quindi `canLearnSpell` insegnava sotto soglia («refuses a spell one level below», «does not teach it below the minimum level», metà «non imparata» dei tre casi nuovi di `outcome-plan.spec.ts`) e `drawLearnableSpell` non trovava mai nulla (casi di sorteggio con attesa di una magia). `chosenRewardsOf` / `drawRewards` copiavano `minXpToLearn: undefined` (attese `toEqual` rosse). Loader: proiezione `{ minXpToLearn: 1, … }` e tutte le magie scartate da `isFiniteNumber(undefined)` (sette `it.each` fail-closed rossi perché anche la magia valida spariva). `mission-draft-prefill.spec.ts` verde (usa il catalogo solo come chiave).
- **Integration** (4 rossi su 37): la magia con `minLevelToLearn: 3` / `6` / `8` veniva insegnata perché il lettore guardava ancora `minXpToLearn` della fixture (0): «teaches nothing when the level after the prize is not enough», «… only from its minimum level (D-07, D-08): level 3», «teaches no spell when none is learnable at the level after the prizes (D-31)», «teaches no spell below its minimum level, whatever its old xp threshold (D-07)». Come atteso.

## Casi verdi al primo colpo (col motivo)

- `quest-rewards.spec.ts` «learns a spell when the level after the outcome equals its minimum level (D-07)» e il gemello «teaches the spell once the level reaches the minimum»: col codice vecchio `xpAfter < undefined` è falso, quindi la magia passava comunque.
- `study-spell-draw.int-spec.ts` «teaches a drawn spell exactly at its minimum level (D-07)»: la fixture ha `minXpToLearn: 0`, imparabile anche col cancello in xp.
- La metà «imparata» dei casi a coppia in `quest-resolution.service.int-spec.ts` (`level 2`): stessa ragione.

## Mappa xp → livello dei valori delle spec

Personaggio di prova a 0 xp + premio 300 xp = 300 xp = livello 2 (salvo dove indicato).

| Spec | Vecchio `minXpToLearn` | Nuovo `minLevelToLearn` | Significato conservato |
|------|------------------------|-------------------------|------------------------|
| quest-rewards.spec (pool) | 100 / 200 / 300 | 2 / 2 / 2 | imparabili a 400 xp → a livello 2; non a 50 xp → livello 1 |
| quest-rewards.spec (pool) | 5000 | 7 | non imparabile a livello 2 |
| quest-rewards.spec (fisso, catalogo) | 4000 | 6 | 4 000 xp = livello 6; 3 999 → livello 5 |
| quest-rewards.spec (argomenti) | xp 400 / 50 / 50000 / 4000 / 3999 | livello 2 / 1 / 20 / 6 / 5 | |
| outcome-plan.spec | 0 / 100 / 200 / 300 | 1 / 2 / 2 / 2 | imparabili a 300 xp |
| outcome-plan.spec (`studyWith`) | 300 / 400 / 0 | 2 / 3 / 1 | 400 non imparabile a 300 xp → livello 3 |
| resolution-loader.service.spec | 100 / 200 / 300 | 2 / 2 / 3 | solo passaggio del valore |
| chosen-rewards.spec | 300 | 2 | solo passaggio del valore |
| mission-draft-prefill.spec | 100 | 2 | solo passaggio del valore |
| study-spell-draw.int-spec | 0 / 200 / 9000 | 1 / 2 / 8 | 9 000 xp = livello 8, non imparabile a livello 2 |
| quest-resolution.service.int-spec | 200 / 5000 | 2 / 6 | 5 000 xp = livello 6, non imparabile a livello 2 |

## Casi nuovi

- `quest-rewards.spec.ts`: confine 6/5 di `canLearnSpell` (D-07) e sorteggio su pool a livelli 2, 6, 7 con livello 6 e 1 (D-07, D-08).
- `outcome-plan.spec.ts` (describe «spell gate on the level after the outcome»): 3 900 xp + 100 → livello 6 impara, + 49 → livello 5 no, per premio fisso (D-07), blocco per titolo (D-08, via `prizeBlockFor` + `drawRewards` su un boss con blocchi paladin/mage) e sorteggio (D-08, pool a 7 → niente, pool a 6 → imparata).
- `resolution-loader.service.spec.ts`: proiezione `toEqual({ minLevelToLearn: 1, maxUsages: 1 })` su entrambe le `find` (fisse + pool) e `it.each` fail-closed su `0`, `-1`, `2.5`, `'6'`, `null`, `undefined`, `NaN`.
- `chosen-rewards.spec.ts`: «carries the minimum level of the chosen spell (D-08)».
- `study-spell-draw.int-spec.ts`: due casi di confine al livello 2 (D-07); `quest-resolution.service.int-spec.ts`: `it.each` livello 2 imparata / 3 no sul premio fisso (D-07, D-08).

## Verifiche

- `npx jest src/quests/outcomes/rewards/quest-rewards.spec.ts src/quests/outcomes/outcome-plan.spec.ts src/quests/outcomes/resolution-loader.service.spec.ts src/quests/guided/chosen-rewards.spec.ts src/quests/guided/mission-draft-prefill.spec.ts --selectProjects unit`: 5 suite, 228/228.
- `npx jest src/quests/outcomes/study-spell-draw.int-spec.ts src/quests/outcomes/quest-resolution.service.int-spec.ts --selectProjects integration --runInBand`: 2 suite, 37/37.
- `npx tsc --noEmit -p tsconfig.json` 0; prettier ed eslint puliti sui file toccati; `git diff --exit-code src/schema.gql` pulito; nessun `chance.next(` toccato in `quest-rewards.ts`; `pgrep -fl 'bin/jest'` vuoto.
- Grep di accettazione: `grep -c "progression.level" outcome-plan.ts` stampa 5, non 4: il `.` della regex aggancia anche l'import `./progression/level-table`; con `grep -cF` sono 4 (i due cancelli + `status.level` + `levelAfter`).

## Deviations from Plan

- **[Rule 3 - Blocking] tipo del caso del blocco per titolo:** `OutcomeQuestSnapshot.prizes` ammette solo `cure`, quindi il boss con `rankPrizes` passato a `planParticipant` non compilava con `tsc` (ts-jest non lo segnalava al RED). Nel GREEN il caso usa il boss con i blocchi solo per `prizeBlockFor` e passa a `planParticipant` il boss senza blocchi (come fa il codice vero: il blocco arriva già tirato in `rewards`). Stesso significato e stesse attese.
- **Chiave esplicita `minXpToLearn: 0` tolta dai due casi int nuovi:** il piano la chiedeva esplicita ma il grep di accettazione vuole zero occorrenze sotto `src/quests/outcomes`; il valore 0 resta quello di default di `buildSpell` (commento nel caso). Il piano 05 toglie il campo dalla fixture.
- Titoli dei test esistenti che parlavano di xp («… the xp is not enough», «… the xp after the prizes can learn», «keeps the xp and known spell gates…») riscritti a livello (Boy Scout).

## Note per i piani seguenti

- Sotto `src/quests` restano `minXpToLearn` solo in `src/quests/guided/mission-prizes*.ts`, `mission-prize-options.service.ts`, nelle int-spec dell'oste (piano 04) e in `src/quests/quests.resolver.int-spec.ts` (piano 05).
- `isLearnLevel` è locale a `resolution-loader.service.ts`; il piano 04 ha bisogno dello stesso predicato in `mission-prizes.ts` (valutare se condividerlo).

## Self-Check: PASSED
