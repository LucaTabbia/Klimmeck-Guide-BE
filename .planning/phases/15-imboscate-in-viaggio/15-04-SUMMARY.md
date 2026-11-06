---
phase: 15-imboscate-in-viaggio
plan: 04
subsystem: quests/generation + quests/outcomes + travel/ambush (assalitori e catalogo del combattimento)
tags: [quests, ambush, refactor, BE-AMBUSH-03, BE-AMBUSH-04, D-06, D-07, D-08, D-09, D-22]
requires: [15-01, 15-03]
provides:
  - "`composeEnemies(budget, cap, pools, chance)` esportata da src/quests/generation/quest-composition.ts"
  - "`PoolOptions`, `GENERATED_POOL_OPTIONS` e terzo parametro di `zonePoolOf`/`fallbackPoolOf` in src/quests/generation/enemy-pool.ts"
  - "`AMBUSH_POOL_OPTIONS`, `AmbushCompositionInput`, `composeAmbushEnemies` in src/travel/ambush/ambush-enemies.ts"
  - "`CombatCatalog` e `ResolutionLoader.readCombatCatalog(entries, participants, subject)`"
  - "`enemyFactsOf(catalog: Pick<ResolutionCatalog, 'enemies'>)`; `woundsAfter`, `consumablesSpent`, `sellLine`, `SpellsSpent`, `spellsSpent` esportati da outcome-plan.ts"
  - "`QuestOutcomesModule` esporta anche `CombatResolver`, `ChanceSource`, `ResolutionLoader`"
affects: [15-06, 15-07]
tech-stack:
  added: []
  patterns:
    - "Variante del pool per parametro con default che conserva il comportamento delle quest"
    - "Estrazione di una funzione con lo stesso ordine dei tiri (spec a seme fisso come rete)"
key-files:
  created:
    - src/travel/ambush/ambush-enemies.ts
    - src/travel/ambush/ambush-enemies.spec.ts
  modified:
    - src/quests/generation/quest-composition.ts
    - src/quests/generation/quest-composition.spec.ts
    - src/quests/generation/enemy-pool.ts
    - src/quests/generation/enemy-pool.spec.ts
    - src/quests/outcomes/resolution-loader.service.ts
    - src/quests/outcomes/resolution-loader.service.spec.ts
    - src/quests/outcomes/combatant-plan.ts
    - src/quests/outcomes/outcome-plan.ts
    - src/quests/outcomes/quest-outcomes.module.ts
key-decisions:
  - "Il caso esistente «projects the enemies on the fields of the combat snapshot (D-10)» ora passa dal metodo pubblico `readCombatCatalog` invece che dal privato `readEnemies(quest)`: l'asserzione è invariata"
  - "STATE.md scritto `Plan: 4 of 12` (formato del file e del brief dell'orchestratore), non `Plan: 04 of 12` del piano"
metrics:
  duration: "~15 min"
  completed: 2026-11-06
---

# Phase 15 Plan 04: assalitori e catalogo del combattimento Summary

`composeEnemies` estratta dalla quest a nemici con l'ordine dei tiri invariato, pool con gli animali come parametro (`animals: 'included'` solo per le imboscate), `composeAmbushEnemies` nella fascia [Facile, Medio] del livello e `readCombatCatalog` come cuore di `readCatalog`, con gli helper dell'esito e le porte del motore esportati.

## Task

| Task | Commit | Descrizione |
| ---- | ------ | ----------- |
| 1 | 5eaa7ed, a3f0e5d, 8ea4595 | refactor `composeEnemies`; RED pool/composizione; GREEN `PoolOptions` |
| 2 | 9313793, d8458e5 | RED/GREEN `composeAmbushEnemies` |
| 3 | e5e8776, 9349299 | RED/GREEN `readCombatCatalog` + export |
| 4 | (questo commit) | bookkeeping |

## Spec a seme fisso invariate (Pitfall 7)

- Prima dell'estrazione: `src/quests/generation` unit 13 suite / 93 test verdi; `test/quests` integration 2 / 14 verdi.
- Dopo l'estrazione (stesse attese, nessun file di spec toccato): 93/93 e 14/14 verdi. Dopo il GREEN del pool: 98/98 e 14/14.
- `budgetOf` è pura (nessun tiro): calcolarla dopo il tiro della forma, dentro la chiamata, non sposta la sequenza.

## RED osservati

- Task 1: dei cinque casi nuovi falliva solo `includes the animals of the zone when asked (D-07, D-22)` (Expected -1: il terzo parametro era ignorato). Verdi al primo colpo, per costruzione: i due casi di `composeEnemies` (funzione già estratta nel passo A), `still excludes the animals from generated quests by default (D-22)` e `never includes legendary enemies, animals or not (D-07)` (comportamento già vero prima: sono la rete del default e del fail-closed sui leggendari).
- Task 2: suite intera rossa per modulo assente (`Configuration error … createNoMappedModuleFoundError` su `src/travel/ambush/ambush-enemies`).
- Task 3: tre casi rossi con `TypeError: loader.readCombatCatalog is not a function` (compreso il caso D-10 portato sul metodo pubblico).

## Sequenze di tiri (verificate sul codice, nessuna ri-derivazione necessaria)

- Singolo: `SequenceChance([0.1, 0])` → 0.1 < `SINGLE_FORM_SHARE` 0.5 sceglie singolo per primo, 0 sceglie il primo candidato.
- Branco: `SequenceChance([0.9], 0)` → branco per primo, 1 tipo, unità aggiunte fino al minimo della fascia: xp 2 con fascia 4–7 → quantità 2; xp 2 con livello 3 (11–21) → quantità 6 (xp 12).
- Riserva `all` (D-06): con la zona a xp 50 il primo pool non compone nessuna forma senza consumare tiri di scelta (filtri vuoti), quindi il tiro 0 sceglie il candidato `all`.
- Fasce reali: `xpBandOf(1)` = 4–7, `xpBandOf(3)` = 11–21, `xpBandOf(5)` = 35–70 (asserite nella spec).

## Deviations from Plan

1. **[Rule 3 - Blocco] caso esistente del loader sul metodo pubblico.** `readEnemies` privata ora prende `(entries, subject)`: il caso D-10 che la chiamava con un oggetto quest via cast non avrebbe più senso. L'atto ora è `readCombatCatalog([{ enemy, quantity: 2 }], [], 'della missione x')` con un `fakeModel` per enemy/loot/equipment/spell; l'asserzione sulla proiezione è identica. Commit e5e8776.
2. **Prova di assenza dei leggendari** scritta con `toEqual` sull'intero elenco di id (regola di repo) invece di un controllo sul singolo id.
3. **Ordine delle letture di `readCatalog`**: ora nemici → usi massimi → oggetti del combattimento → premi (prima i premi stavano fra nemici e usi massimi). Letture lean fuori dalla transazione e indipendenti: nessun cambio di esito; tutte le spec di `src/quests/outcomes` (unit 25/414, integration 11/117) verdi senza toccare le attese.
4. **STATE.md** `Plan: 4 of 12` (formato esistente e brief), il verify del Task 4 del piano cercava `Plan: 04 of 12`.

## Gates

- `npx tsc --noEmit -p tsconfig.json` 0 a fine di ogni task.
- Unit `src/quests/generation src/quests/outcomes src/travel/ambush`: 46 suite / 550 test verdi. Integration `src/quests/outcomes`: 11 / 117; `test/quests`: 2 / 14.
- Prettier e eslint puliti sui file toccati (nessun file era già fuori formato).
- `git diff --exit-code src/schema.gql` 0; `git diff origin/develop -- src/schema.gql` vuoto.
- Nessun `Math.random`/`Date.now` in `src/travel/ambush` fuori dalle spec.

## Threat model

- T-15-10: `isPoolable` tiene `legendary === false` fail-closed anche con gli animali inclusi; caso «never fights a legendary enemy (D-07)».
- T-15-11: estrazione in commit `refactor` separato (5eaa7ed) con le spec a seme fisso verdi prima e dopo; default `GENERATED_POOL_OPTIONS` provato.
- T-15-12: il WARN delle voci orfane contiene solo id e soggetto (`Nemico <id> <subject> inesistente: voce scartata`), asserito per intero.

## Known Stubs

Nessuno.

## Self-Check: PASSED

- File creati presenti: src/travel/ambush/ambush-enemies.ts, src/travel/ambush/ambush-enemies.spec.ts.
- Commit presenti: 5eaa7ed, a3f0e5d, 8ea4595, 9313793, d8458e5, e5e8776, 9349299.
