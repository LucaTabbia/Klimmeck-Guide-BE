---
phase: quick-261111-enm
plan: 01
type: tdd
autonomous: true
files_modified:
  - src/quests/acceptance/quest-capacity.ts
  - src/quests/acceptance/quest-eligibility.ts
  - src/quests/generation/generated-quest-draft.ts
  - src/quests/outcomes/aid/aid-quest.ts
  - src/quests/acceptance/quest-capacity.spec.ts
  - src/quests/acceptance/quest-eligibility.spec.ts
  - src/quests/generation/generated-quest-draft.spec.ts
  - src/quests/outcomes/aid/aid-quest.spec.ts
  - src/quests/acceptance/quest-acceptance.service.int-spec.ts
  - src/quests/party/quest-start.int-spec.ts
  - src/quests/outcomes/quest-combat.int-spec.ts
  - src/quests/generation/quest-generator.int-spec.ts
  - test/quests/generation-world.ts
  - test/quests/quest-generation.e2e.int-spec.ts
---

# Quick 261111-enm: le quest `enemy` si prendono da soli, col rango ≥ quello richiesto

## Parole dell'utente (UAT su device, 2026-11-11)

- «Non posso accettare né boss né enemy, il mio rango non va bene. Perché la enemy ha uno slot però? Le enemy non dovrebbero avere slot, possono essere prese solo dal giocatore e solo se il rango è adatto (più alto o uguale a quello richiesto)»

## Stato di partenza

- `generated-quest-draft.ts` scrive per ogni quest generata `requiredAdventurers: [{ title: composition.rank, count }]` («posti a titolo esatto», Phase 13 D-09 emendata): una `enemy` di rango rookie la accetta solo un rookie; solo i legend scalano, e solo sui posti hero (13.1 D-08).
- `quest-eligibility.ts`: `enemy` è in `REGISTERED_TYPES` (la registrazione con capienza è il lucchetto che la rende di un solo giocatore); `meetsTitle` applica già rango ≥ `minTitle` ai tipi non story.
- A DB: 155 quest `enemy` generate aperte, tutte con un posto a titolo esatto.

## Obiettivo

Una quest `enemy` la prende UN solo giocatore, di rango ≥ `minTitle`, senza posto a titolo. I `boss` restano com'erano (posti a titolo esatto): la regola dell'utente riguarda le sole `enemy`.

## Task

1. **RED** — spec che falliscono:
   - `quest-capacity.spec.ts`: `soloSlots()` e `questSlotsOf(type, value)` (enemy → un posto senza titolo qualunque posto porti; posti non validi restano `'invalid'`; boss, worldMission, aid come scritti).
   - `quest-eligibility.spec.ts`: `registrationRuleOf` di una `enemy` = `{ seats: {}, wildcard: 1, total: 1 }` anche col posto a titolo; ogni rango ≥ rookie prende una `enemy` rookie (posto nuovo e posto vecchio); secondo giocatore `QUEST_FULL`; rookie su `enemy` paladin `QUEST_TITLE_MISMATCH`; `boss` a titolo esatto.
   - `generated-quest-draft.spec.ts`: `enemy` → `[{ title: null, count: 1 }]` con `minTitle` = rango; `boss` → posti esatti della formula.
   - `aid-quest.spec.ts`: la aid di una `enemy` porta un posto senza titolo anche se la quest fallita ne portava uno a titolo.
   - int-spec sul replica set: accettazione di una `enemy` rookie da parte di un paladin (forma nuova e forma vecchia) con avvio immediato e secondo giocatore rifiutato; corsa fra adventurer, hero e legend con un solo vincitore; avvio all'arrivo di una `enemy` con posti in eccesso; aid di una `enemy` persa.
   - Spec che fissavano il posto a titolo esatto delle `enemy` aggiornate (`quest-generator.int-spec.ts`, `seatViolationsOf` in `test/quests/generation-world.ts`, e2e di generazione).
2. **GREEN** — `questSlotsOf` in `quest-capacity.ts` come unica lettura dei posti per tipo; `registrationRuleOf` e `aidSlotsOf` la usano; il generatore scrive `soloSlots()` per le `enemy`.
3. **Docs** — SUMMARY, riga in STATE.md.

## Vincoli

- Nessun cambio SDL, nessuna migrazione, nessun accesso al DB reale.
- Il BE gira da `dist/`: niente `npm run build/lint`; prettier ed eslint solo sui file toccati; `npx tsc --noEmit -p tsconfig.json` a 0.
