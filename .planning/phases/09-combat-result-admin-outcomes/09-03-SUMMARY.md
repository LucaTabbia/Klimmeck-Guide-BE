---
phase: 09-combat-result-admin-outcomes
plan: 03
subsystem: game-rules
tags: [loot, rewards, aid, rescue-timeout, injuries, rng, tdd]

# Dependency graph
requires:
  - phase: 09-combat-result-admin-outcomes (09-01)
    provides: Quest.concludedAt / Quest.rescue, prizes.spell
  - phase: 04-integrita-economica-atomics
    provides: toCopper, priceKey, refIdOf / sameId
provides:
  - ChanceSource (porta RNG iniettabile) + MathChanceSource; fake di test SequenceChance
  - DROP_RATES / RARITY_ORDER / rollLoot (cascading rolls D-16, max un oggetto)
  - drawRewards / canLearnSpell / rewardRefsOf / NO_REWARDS (premi validati D-16, D-17)
  - AID_TITLE_PREFIX / buildAidQuest (clone della aid D-08, catena D-09)
  - AID_TIMEOUT_MS / AID_TIMEOUT_REQUIRES_NO_RESCUER / aidTimeoutClaimFilter / aidTimeoutSuspended / isAidTimeoutDue / aidTimeoutDueAt (D-10 + C5)
  - INJURY_EFFECTS / EFFECT_MODIFIERS / MIN_INJURY_FACTOR / injuryModifiersOf / travelSpeedFactorOf (segnaposto D-02, D-15)
affects: [09-04, 09-05, 09-08, 09-10, 09-11, FE Phase 9]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Porta RNG `ChanceSource.next()` in [0, 1) iniettata nelle regole pure; unico Math.random in MathChanceSource"
    - "Snapshot `unknown` validati in ingresso (premi scritti a mano): voci malformate o orfane scartate senza eccezioni"
    - "Regola tecnica da confermare isolata in una costante spread nel filtro + test nominato (C5)"

key-files:
  created:
    - src/quests/outcomes/chance-source.ts
    - test/quests/sequence-chance.ts
    - src/quests/outcomes/rewards/cascading-loot.ts
    - src/quests/outcomes/rewards/cascading-loot.spec.ts
    - src/quests/outcomes/rewards/quest-rewards.ts
    - src/quests/outcomes/rewards/quest-rewards.spec.ts
    - src/quests/outcomes/aid/aid-quest.ts
    - src/quests/outcomes/aid/aid-quest.spec.ts
    - src/quests/outcomes/aid/aid-timeout.ts
    - src/quests/outcomes/aid/aid-timeout.spec.ts
    - src/quests/outcomes/injuries/injury-rules.ts
    - src/quests/outcomes/injuries/injury-rules.spec.ts
  modified: []

key-decisions:
  - "drawRewards: prizeItem e loot passano entrambi dalla presenza nel catalogo (chiave priceKey); il loot estratto esce senza il campo rarity"
  - "rewardRefsOf(null) restituisce { items: [], spellId: null } (nessuna pre-lettura per quest senza premi)"
  - "buildAidQuest copia relatedLore e recommendedLoot in array nuovi; il titolo con prefisso 'Soccorso: ' non si raddoppia nelle catene"
  - "injuryModifiersOf: dedup delle stringhe prima del prodotto, floor MIN_INJURY_FACTOR 0.1 per ciascun fattore"

patterns-established:
  - "Fake SequenceChance con `drawn` e fallback 0.99 (sequenza esaurita = nessun drop) per tutti i test dell'esito"

requirements-completed: []  # contributo a BE-COMBAT-01, BE-COMBAT-03; traceability nel gate 09-16

# Metrics
duration: 12min
completed: 2026-10-24
---

# Phase 9 Plan 03: Regole pure di ricompensa, soccorso e ferite Summary

**Loot a cascata con `ChanceSource` iniettato, premi validati con scarto degli orfani, clone della aid "Soccorso: <titolo>" a un posto jolly gratuito, timeout di 7 giorni con la sospensione C5 isolata e tabella segnaposto delle ferite con fattore di viaggio**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-10-24T15:05:00Z
- **Completed:** 2026-10-24T15:17:00Z
- **Tasks:** 3 (3/3)
- **Files modified:** 12 (tutti creati)

## Accomplishments

- `chance-source.ts`: porta astratta `ChanceSource` + `MathChanceSource` (`@Injectable`), unico punto con `Math.random`; `test/quests/sequence-chance.ts` con `drawn`, `load()` e fallback 0.99.
- `cascading-loot.ts`: `DROP_RATES` provvisori (legendary 0.02 … common 0.6), `RARITY_ORDER` decrescente, `rollLoot` che tira solo sulle rarità presenti, estrae nella rarità vinta solo se ha più voci e restituisce al massimo un oggetto.
- `quest-rewards.ts`: `drawRewards` (rame da `toCopper`, xpPrize intero ≥ 0, prizeItem + loot estratto solo se presenti nel catalogo, magia candidata dalla mappa `spells`), `canLearnSpell` (soglia XP dopo xpPrize, magia già nota anche come stringa legacy), `rewardRefsOf` per le pre-letture.
- `aid-quest.ts`: `buildAidQuest` con `type: aid`, `requiredPoints: null`, `requiredAdventurers: [{ title: null, count: 1 }]`, premi copiati, `registeredAdventurers: []`, `concludedAt: null`, `rescue.failedQuest` che punta sempre all'originale.
- `aid-timeout.ts`: `AID_TIMEOUT_MS = 604 800 000`, `AID_TIMEOUT_REQUIRES_NO_RESCUER` (unica riga `registeredAdventurers: { $size: 0 }`) spread in `aidTimeoutClaimFilter`, test nominato "keeps the rescue timeout suspended while a rescuer is registered (C5)".
- `injury-rules.ts`: intestazione SEGNAPOSTO, 28 ferite → effetti, 10 effetti → `{ damageFactor, lifePointsFactor, speedFactor }`, `injuryModifiersOf` con dedup e floor 0.1, `travelSpeedFactorOf` pronto per 09-08.

## Task Commits

| # | Task | Commit | Tipo |
|---|------|--------|------|
| 1 | ChanceSource, loot a cascata e premi (RED) | `b4044ca` | test |
| 1 | ChanceSource, loot a cascata e premi (GREEN) | `cc070e4` | feat |
| 2 | clone della aid e timeout di soccorso C5 (RED) | `b91780c` | test |
| 2 | clone della aid e timeout di soccorso C5 (GREEN) | `9a91d94` | feat |
| 3 | tabella segnaposto delle ferite (RED) | `144a784` | test |
| 3 | tabella segnaposto delle ferite (GREEN) | `77a27da` | feat |

ChanceSource e SequenceChance sono entrati già completi nel commit RED del Task 1 (porta e fake sono infrastruttura delle spec, non comportamento sotto test).

## RED output

- Task 1: `npx jest src/quests/outcomes/rewards --selectProjects unit` → `Test Suites: 2 failed, 2 total; Tests: 18 failed, 10 passed, 28 total` (stub con firme; i 10 verdi sono casi "null/vuoto" soddisfatti per caso dallo stub)
- Task 2: `npx jest src/quests/outcomes/aid --selectProjects unit` → `Test Suites: 2 failed, 2 total; Tests: 4 failed, 4 total` (aid-quest.spec fallisce al caricamento: lo stub lancia `not implemented`)
- Task 3: `npx jest src/quests/outcomes/injuries --selectProjects unit` → `Test Suites: 1 failed, 1 total; Tests: 45 failed, 45 total`

## Verification

- `npx jest src/quests/outcomes --selectProjects unit` → 7 suite, 109 test verdi (incluse le progressioni di 09-02)
- `npm run build` esce 0 dopo ogni task; `npx eslint` pulito sui 12 file; Prettier applicato file per file
- Grep di accettazione: `legendary: 0.02` (1), nessun `Math.random` fuori da `chance-source.ts`, `rollLoot(` in quest-rewards (1), `@nestjs/mongoose` 0 in rewards, `AID_TITLE_PREFIX = 'Soccorso: '` (1), test C5 nominato (1), `grep -cF 'registeredAdventurers: { $size: 0 }'` = 1, `SEGNAPOSTO` (1), `InjuryType.` 28, `MIN_INJURY_FACTOR = 0.1` (1); nessun letterale vietato (`kind`, `grade`, `TravelKind`) nei file nuovi

## Decisions Made

- I premi ricevono snapshot `unknown` e si validano in ingresso (tipo dell'enum, ref ObjectId o esadecimale legacy, quantità intera ≥ 1): T-09-11/T-09-12 mitigati senza eccezioni.
- `drawRewards` restituisce il loot estratto come `RewardItem` puro (senza `rarity`), così `items` ha una sola forma.
- `AID_TIMEOUT_REQUIRES_NO_RESCUER` è scritto su più righe da Prettier; il grep `-F` di accettazione trova comunque l'unica riga della regola.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Nessuno. (Nota di tooling: in zsh una variabile con più percorsi non si espande in parole; usato un array `"${F[@]}"` per prettier/eslint.)

## Known Stubs

- `src/quests/outcomes/injuries/injury-rules.ts`: tabella e fattori intenzionalmente SEGNAPOSTO (D-02, D-15) finché l'utente non fornisce le regole delle ferite.
- `src/quests/outcomes/rewards/cascading-loot.ts` `DROP_RATES` e la regola C5 in `aid-timeout.ts`: default tecnici provvisori dichiarati nel codice (D-02, C5).

## Next Phase Readiness

- 09-04 (resolver segnaposto) può usare `ChanceSource`/`SequenceChance` e `injuryModifiersOf`; 09-05 consuma `drawRewards`, `canLearnSpell`, `buildAidQuest`, `aidTimeoutClaimFilter`; 09-08 moltiplica la velocità per `travelSpeedFactorOf`.

## Self-Check: PASSED
