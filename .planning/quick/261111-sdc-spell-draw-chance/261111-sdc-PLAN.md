---
phase: quick-261111-sdc
plan: 01
type: tdd
autonomous: true
files_modified:
  - src/quests/outcomes/rewards/quest-rewards.ts
  - src/quests/outcomes/rewards/quest-rewards.spec.ts
  - src/quests/outcomes/outcome-plan.spec.ts
  - src/quests/outcomes/study-spell-draw.int-spec.ts
---

# Quick 261111-sdc: probabilità del 30 % per la magia sorteggiata

## Parole dell'utente (2026-11-11)

- «vorrei che ci fosse il 30% di probabilità di ottenere una magia»

## Obiettivo

Oggi una quest vinta con `prizes.spellDraw === true` (le `magic`) insegna sempre una magia se almeno una è imparabile (xp dopo i premi ≥ `minXpToLearn`, magia non nota), scelta uniforme. Regola nuova: la magia si impara con probabilità 30 %; nel 70 % nessuna magia, il resto dei premi invariato. Con il 30 % riuscito ma nulla di imparabile, nessuna magia (come oggi).

## Task

1. **RED** — spec che falliscono:
   - `quest-rewards.spec.ts`: `SpellDraw` con `gate` tirato prima di `roll`, entrambi solo col booleano; costante `SPELL_DRAW_CHANCE` = 0.3; gate 0.29 → magia; gate 0.3 / 0.31 / 0.99 → `null` con pool imparabile; senza `spellDraw` nessun tiro in più; `prizes.spell` fisso fuori dai tiri del sorteggio; tiri del pet e dello studio spostati di uno.
   - `outcome-plan.spec.ts`: gate mancato → nessuna magia; magia fissa che vince anche con gate 0.99.
   - `study-spell-draw.int-spec.ts`: sequenze `[gate, pick]`, nuovo caso gate 0.3 su quest `magic` con pool imparabile.
2. **GREEN** — `quest-rewards.ts`: `SpellDraw { pool, gate, roll }`, `spellDrawOf` tira prima il gate e poi la scelta (solo con `spellDraw === true`), `drawLearnableSpell` esce con `null` se `gate >= SPELL_DRAW_CHANCE`, come `drawStudyLore`.
3. **Docs** — SUMMARY, riga in STATE.md, nota per la FE nel handoff della Phase 18 (§1.7).

## Vincoli

- Nessun cambio SDL, nessuna migrazione, nessun accesso al DB.
- Il BE gira da `dist/` sulla porta 3001: niente `npm run build/lint/start*/test:cov`; solo `npx jest` sui file toccati e su `src/quests/outcomes`, `npx tsc --noEmit -p tsconfig.json`.
