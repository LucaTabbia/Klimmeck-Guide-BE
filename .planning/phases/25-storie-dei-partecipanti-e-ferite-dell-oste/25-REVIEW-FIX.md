---
phase: 25-storie-dei-partecipanti-e-ferite-dell-oste
fixed_at: 2026-11-21T19:05:00Z
review_path: .planning/phases/25-storie-dei-partecipanti-e-ferite-dell-oste/25-REVIEW.md
iteration: 1
findings_in_scope: 4
fixed: 4
skipped: 0
status: all_fixed
---

# Phase 25: Code Review Fix Report

**Fixed at:** 2026-11-21T19:05:00Z
**Source review:** .planning/phases/25-storie-dei-partecipanti-e-ferite-dell-oste/25-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 4 (WR-01, IN-01 secondo D-19, IN-04, IN-05; ruling dell'orchestratore)
- Fixed: 4
- Skipped: 0
- Fuori scope per ruling, accettati come sono: IN-02, IN-03, IN-06, IN-07

## Fixed Issues

### WR-01: Le aggiunte ai background hanno un tetto di 50 voci e la sezione si sostituisce per intero

**Files modified:** `src/quests/guided/background-additions.ts`, `src/quests/guided/mission-draft-save.service.ts`, `src/quests/guided/mission-draft.inputs.ts` (solo commento), `src/quests/guided/background-additions.spec.ts`, `src/quests/guided/mission-draft-save.service.int-spec.ts`
**Commit:** 241e2cac (RED), 01d426a5 (GREEN)
**Status:** fixed: requires human verification (cambio di regola)
**Applied fix:** `additionEntriesOf` sostituita da `mergedAdditions(saved, sent)`: fusione per personaggio come `mergedPrizes`. Una voce sostituisce solo l'aggiunta del suo personaggio (al suo posto; i personaggi nuovi in coda), un testo vuoto o di soli spazi cancella solo quella salvata, gli omessi restano, una sezione `[]` non cambia nulla, la sezione assente resta invariata. Personaggio fuori dalla bozza e doppione ancora rifiutati, prima di ogni scrittura. `@ArrayMaxSize(50)` resta, per chiamata: i blocchi non si cancellano più.

### IN-01 / D-19: una ferita già portata e riproposta non viene aggiunta

**Files modified:** `src/quests/outcomes/injuries/innkeeper-injuries.ts`, `src/quests/guided/fight-state.ts`, `src/quests/guided/mission-draft-save.service.ts`, `src/quests/guided/mission-simulation.service.ts`, `src/quests/guided/guided-completion.service.ts` (solo commento), più le spec `innkeeper-injuries.spec.ts`, `fight-state.spec.ts`, `mission-draft-save.service.int-spec.ts`, `guided-completion.service.int-spec.ts`, `mission-simulation.service.int-spec.ts`
**Commit:** 905af942 (RED), c208595d (GREEN)
**Status:** fixed: requires human verification (cambio di regola)
**Applied fix:** `assertWoundCorrectionAllowed` controlla solo le rimozioni: non rifiuta più una ferita ancora portata. Funzione pura nuova `withoutCarriedAgain(carried, effects)` nel modulo dell'origine: toglie da `injuriesAdded` le ferite portate e non rimosse. La usano la simulazione (il simulato salvato non elenca una ferita già portata) e il salvataggio della correzione (il corretto salvato non la elenca, quindi la bozza servita non la marca come ferita dell'oste). Al completamento la piega la ignora già: nessun doppione in `status.injuries`, assente da `QuestResult.injuriesAdded`, origine invariata, anche se lo stato reale è cambiato dopo il salvataggio. Togli-e-riaggiungi nella stessa correzione resta ferita dell'oste. Tre casi della regola vecchia riscritti (rifiuto al salvataggio, rifiuto al completamento, «passes through… (D-14)»).

### IN-04: «Chiave assente se la lista è vuota» scritta quattro volte

**Files modified:** `src/quests/outcomes/injuries/innkeeper-injuries.ts`, `src/quests/guided/fight-state.ts`, `src/quests/guided/guided-outcome.ts`, `src/quests/outcomes/injuries/innkeeper-injuries.spec.ts`
**Commit:** 4ffc4a02
**Applied fix:** una sola `removalsOf(list)` esportata da `innkeeper-injuries.ts`, con i suoi casi, usata nei quattro punti. `injuriesRemovedOf` di `gm-overrides.ts` non è toccata: valida e deduplica, non è una copia.

### IN-05: Il tetto di 1000 è ripetuto a mano nel messaggio d'errore

**Files modified:** `src/characters/creation/grapheme-count.ts`, `src/gameRules/game-rule.exception.ts`, `src/quests/guided/background-additions.ts`, `src/gameRules/game-rule.exception.spec.ts`, `src/quests/guided/background-additions.spec.ts`
**Commit:** ed9b0f42
**Applied fix:** `BACKGROUND_ADDITION_MAX_GRAPHEMES` spostata accanto a `exceedsGraphemeLimit` (nessun ciclo fra `gameRules` e `quests/guided`) e interpolata nel messaggio; il testo servito non cambia.

## Handoff

`BACKEND-NOTES.md` allineato (commit 3e557f38): §0, §2c, §2d, §2g, §3, §4.4, Q1, Q4, §6, §7.

## Verifica finale

- `npx tsc --noEmit -p tsconfig.json`: 0 errori.
- Unit, progetto intero: 313 suite / 4 715 test verdi.
- Integration `src/quests` (`--runInBand --forceExit`): 47 suite / 935 test verdi.
- Integration `test/app.int-spec.ts` + `test/authz`: 2 suite / 238 test verdi al primo giro, albero pulito dopo il boot (SDL rigenerato identico). `src/gm` non esiste nel repo: nessuna suite da quel percorso.
- `git diff e87339bb..HEAD -- src/schema.gql`: nessuna riga tolta.
- `prettier` ed `eslint` puliti sui soli file toccati.

---

_Fixed: 2026-11-21T19:05:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
