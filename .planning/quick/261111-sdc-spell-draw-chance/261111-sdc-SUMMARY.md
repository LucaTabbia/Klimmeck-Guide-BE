---
phase: quick-261111-sdc
plan: 01
subsystem: quests
tags: [quests, rewards, spells, chance, magic]
key-files:
  modified:
    - src/quests/outcomes/rewards/quest-rewards.ts
    - src/quests/outcomes/rewards/quest-rewards.spec.ts
    - src/quests/outcomes/outcome-plan.spec.ts
    - src/quests/outcomes/study-spell-draw.int-spec.ts
commits:
  - { hash: 37454063, message: "test(quests): expect a 30% gate before the spell draw pick" }
  - { hash: 5134cc5b, message: "feat(quests): teach a drawn spell only on a 30% gate roll" }
---

# Quick 261111-sdc: probabilità del 30 % per la magia sorteggiata

## Parole dell'utente (2026-11-11)

- «vorrei che ci fosse il 30% di probabilità di ottenere una magia»

## Decisioni

1. **Costante `SPELL_DRAW_CHANCE = 0.3`** in `src/quests/outcomes/rewards/quest-rewards.ts`, con le parole dell'utente nel commento, nello stile di `QUEST_PET_WIN_CHANCE`. Non configurabile da env (come il pet).
2. **`SpellDraw { pool, gate, roll }`**: `gate` decide se si impara, `roll` sceglie fra le magie imparabili. Stesso schema di `LoreDraw` (`gate`/`pick`) dello studio.
3. **Ordine dei tiri:** loot → **gate** → **scelta** → pet → studio. Gate e scelta si consumano solo con `prizes.spellDraw === true` (D-31): le quest senza il booleano consumano gli stessi tiri di prima. Le quest col booleano consumano un tiro in più, quindi il tiro del pet e quelli dello studio scorrono di uno.
4. **Confine:** `gate >= 0.3` → nessuna magia (0.3 esatto perde), come `drawStudyLore` (`gate >= chance`). Gate riuscito ma nessuna magia imparabile → nessuna magia (come prima).
5. **Magia fissa (`prizes.spell`) senza gate:** `spellCandidate` vince ancora sul sorteggio (`outcome-plan.ts`, D-31) e non passa dal 30 %; una quest con la sola magia fissa non consuma tiri del sorteggio.
6. Nessun cambio SDL, nessuna migrazione, nessuna scrittura a DB. `outcome-plan.ts` invariato: chiama `drawLearnableSpell`, che applica il gate.

## RED osservati

- `37454063`: unit `Tests: 11 failed, 120 passed` (quest-rewards + outcome-plan: forma di `SpellDraw`, costante assente, gate ignorato, tiri del pet/studio spostati); integration `study-spell-draw.int-spec.ts` `Tests: 3 failed, 3 passed`.

## Gate

- `npx tsc --noEmit -p tsconfig.json`: 0.
- `npx jest src/quests/outcomes --selectProjects unit`: 32 suite / 561 test verdi.
- `npx jest src/quests/outcomes --selectProjects integration --runInBand --forceExit`: 13 suite / 153 test verdi.
- `npx prettier --write` e `npx eslint` sui file toccati: puliti. Subject 58 e 57 byte, nessun trailer. `pgrep -fl 'bin/jest'` vuoto.

## Deviazioni

- Nessuna sul codice. La int-spec `study-spell-draw.int-spec.ts` ora carica esplicitamente `[gate, pick]` anche nel caso «nessuna magia imparabile» (prima si affidava al fallback 0.99 della `SequenceChance`, che con il gate avrebbe reso il caso banale).
