---
phase: 09-combat-result-admin-outcomes
plan: 02
subsystem: game-rules
tags: [progression, level-table, title, starting-character, error-codes, tdd]

# Dependency graph
requires:
  - phase: 07-quest-lanes-quest-04
    provides: TITLE_RANK in quest-eligibility (unica fonte dell'ordine dei titoli)
  - phase: 02.1-character-creation-contract
    provides: buildStartingCharacter e STARTING_LIFE_POINTS
  - phase: 04-integrita-economica-atomics
    provides: GameRuleException / GameRuleErrorCode (D-15)
provides:
  - MAX_XP (50 000), MIN_LIFE_POINTS (1), LEVEL_TABLE (20 righe D-12), levelRowFor(xp), progressionAfter(before, xpGained, hpAfterOutcome)
  - TITLE_ORDER (derivato da TITLE_RANK) e nextTitleAfterStory(current, storyTitle) (D-14)
  - HP iniziali 1000 e livello iniziale letti da LEVEL_TABLE[0] (una sola fonte)
  - codici AWAITING_AID, SHOP_NOT_IN_CITY, OUTCOME_NOT_PARTICIPANT, OUTCOME_OVERRIDE_INVALID con factory e messaggi italiani fissi
affects: [09-05, 09-06, 09-08, 09-09, 09-15, FE Phase 9, FE Phase 10]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Progressione come funzione pura su snapshot: XP clampata, livello/max dalla tabella, HP clampati in 1..max senza cura"

key-files:
  created:
    - src/quests/outcomes/progression/level-table.ts
    - src/quests/outcomes/progression/level-table.spec.ts
    - src/quests/outcomes/progression/title-progression.ts
    - src/quests/outcomes/progression/title-progression.spec.ts
  modified:
    - src/characters/creation/starting-character.ts
    - src/characters/creation/starting-character.spec.ts
    - src/characters/creation/character-creation.resolver.int-spec.ts
    - src/gameRules/game-rule-error-code.enum.ts
    - src/gameRules/game-rule.exception.ts
    - src/gameRules/game-rule.exception.spec.ts

key-decisions:
  - "progressionAfter: hpAfterOutcome non finito (NaN/Infinity) vale MIN_LIFE_POINTS, testato esplicitamente"
  - "TITLE_ORDER derivato da TITLE_RANK ordinando per rango: nessuna seconda tabella dei titoli"

patterns-established:
  - "Tabella `as const` + funzione pura nello stile di ACTIVE_SPELL_SLOT_THRESHOLDS per livello/HP"

requirements-completed: []  # contributo a BE-COMBAT-01, BE-COMBAT-03, BE-ADMIN-02; traceability nel gate 09-16

# Metrics
duration: 6min
completed: 2026-10-24
---

# Phase 9 Plan 02: Tabelle di progressione e codici di rifiuto Summary

**`LEVEL_TABLE` a 20 righe con `progressionAfter` (XP clampata a 50 000, HP in 1..max senza cura), `nextTitleAfterStory` derivato da `TITLE_RANK`, personaggi nuovi a 1000 HP dalla stessa tabella e quattro codici di rifiuto nuovi con messaggi italiani**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-10-24T14:55:00Z
- **Completed:** 2026-10-24T15:01:00Z
- **Tasks:** 2 (2/2)
- **Files modified:** 10

## Accomplishments

- `level-table.ts`: soglie XP e HP massimi di D-12 verbatim (L1 0/1000 … L10 11850/10250 … L20 50000/40000), `levelRowFor`, `progressionAfter` con negativi a 0, clamp a `MAX_XP`, HP mai sotto 1 né sopra il nuovo massimo, nessuna cura al level up.
- `title-progression.ts`: avanzamento solo con la story del titolo esatto, `legend` resta `legend`, ordine dalla stessa `TITLE_RANK` dell'accettazione.
- `starting-character.ts`: `STARTING_LIFE_POINTS = LEVEL_TABLE[0].maxLifePoints` (1000) e `STARTING_LEVEL = LEVEL_TABLE[0].level`.
- `GameRuleErrorCode` + factory `awaitingAid`, `shopNotInCity`, `outcomeNotParticipant`, `outcomeOverrideInvalid`; la spec "covers every GameRuleErrorCode exactly once" resta verde.

## Task Commits

| # | Task | Commit | Tipo |
|---|------|--------|------|
| 1 | tabella livelli/HP e progressione del titolo (RED) | `92124c2` | test |
| 1 | tabella livelli/HP e progressione del titolo (GREEN) | `758b0e1` | feat |
| 2 | HP iniziali 1000 e codici di rifiuto nuovi (RED) | `5f6079e` | test |
| 2 | HP iniziali 1000 e codici di rifiuto nuovi (GREEN) | `17abb31` | feat |

**Plan metadata:** commit `docs(phase-9): complete plan 09-02 ...` (SUMMARY, VALIDATION, STATE, ROADMAP)

## RED evidence

- **Task 1:** `npx jest src/quests/outcomes/progression --selectProjects unit` → 2 suite fallite, 22 falliti / 26 (stub con tabella vuota e `MAX_XP = 0`; passavano solo i 4 casi "nessun avanzamento" che lo stub soddisfa per costruzione).
- **Task 2:** unit 6 falliti / 34 (`builds the backend-owned starting state` sui 100 HP, le quattro factory inesistenti, `covers every GameRuleErrorCode exactly once`); integration `character-creation.resolver.int-spec.ts` 1 fallito / 20 (`creates the character with the backend-owned starting state`).

### Test esistenti modificati (D-12, dichiarati)

- `src/characters/creation/starting-character.spec.ts` e `src/characters/creation/character-creation.resolver.int-spec.ts`: `currentLifePoints`/`maxLifePoints` da 100 a 1000; `level: 1`, `xp: 0` invariati.

## Verification

- `npx jest src/quests/outcomes/progression src/characters/creation src/gameRules --selectProjects unit`: verde (progression 26/26; creation + gameRules 146/146).
- `npx jest src/characters/creation/character-creation.resolver.int-spec.ts --selectProjects integration --runInBand`: 20/20.
- `npm run build`: 0. Prettier/ESLint puliti sui 10 file.
- Grep di accettazione: 22 righe `maxLifePoints:` (≥ 20), `MAX_XP = 50_000`, righe L10/L20 esatte, `TITLE_RANK` in `title-progression.ts`, `LEVEL_TABLE[0].maxLifePoints` presente e 0 righe `= 100;`, 4 codici nell'enum, messaggi del negozio e del soccorso presenti.

## Decisions Made

- `hpAfterOutcome` non finito → `MIN_LIFE_POINTS` (indicazione del piano), coperto da un caso di test in più.
- `levelRowFor` usa un `for` con blocco esplicito al posto dell'`if` senza graffe su una riga (stesso comportamento, formattazione Prettier stabile).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## Known Stubs

None. I moduli puri non sono ancora consumati dal motore degli esiti (previsto: 09-05/09-06); i codici nuovi non sono ancora lanciati (09-08, 09-09, 09-15).

## Threat Flags

None: le superfici sono quelle del threat model (T-09-07..T-09-10), mitigate dai test citati.

## Next Phase Readiness

- 09-03 può partire; 09-05/09-06 trovano `progressionAfter` e `nextTitleAfterStory` pronti; 09-08/09-09/09-15 trovano i codici.
- I personaggi già a DB con 100 HP li adatta l'utente (D-12).

## Self-Check: PASSED

- File creati presenti: `level-table.ts`, `level-table.spec.ts`, `title-progression.ts`, `title-progression.spec.ts`.
- Commit presenti: `92124c2`, `758b0e1`, `5f6079e`, `17abb31`; nessun trailer.
