---
phase: 23-sconfitta-riposo-recupero-compagni
plan: 06
subsystem: quests
tags: [quests, pets, outcomes, int-spec, copertura]
requires: ["23-05"]
provides:
  - "copertura su MongoMemoryReplSet della regola del compagno su quest, boss, dungeon, sconfitta senza soccorso, soccorso, guardia vinta e persa, crime con arresto, completamento GM legacy"
  - "ScriptedCombatResolver che restituisce companionLifeAfter (solo se il compagno è entrato nello scontro) ed effetti in funzione del contesto"
affects: ["23-10", "23-15", "23-16", "23-17"]
tech-stack:
  added: []
  patterns: ["effetti scriptati per scontro: willResolve(id, (context) => effects)"]
key-files:
  created:
    - src/quests/outcomes/companion-defeat.int-spec.ts
    - src/quests/outcomes/companion-defeat-rescue.int-spec.ts
  modified:
    - test/quests/scripted-combat-resolver.ts
decisions:
  - "Lo ScriptedCombatResolver restituisce companionLifeAfter solo per un partecipante con compagno nel contesto (assente = nessun compagno, come il contratto della porta): così la seconda tappa del dungeon e lo scontro della guardia senza compagno non riportano una vita fittizia"
  - "willResolve accetta anche una funzione del contesto, per dare vite diverse a scontri in sequenza (quest e guardia) senza API nuove"
metrics:
  duration: "~25 min"
  completed: 2026-11-14
---

# Phase 23 Plan 06: Copertura dei percorsi di combattimento Summary

Due int-spec nuove (14 test) provano su DB in memoria che ogni percorso di scontro non di viaggio applica la stessa regola del compagno: a 1 esce dallo slot con `lifeAsOf` = istante e `defeatedUntil` = istante + `recoveryTime`, ferito resta nello slot con la vita nuova, e il `QuestResult.companion` lo racconta (D-03, D-10, D-12, D-26, D-27, D-37, D-39, Pitfall 8).

## Task

| Task | Nome | Commit | File |
|------|------|--------|------|
| 1 | quest standard, boss, dungeon, sconfitta senza soccorso | `4a52f91c` | `src/quests/outcomes/companion-defeat.int-spec.ts`, `test/quests/scripted-combat-resolver.ts` |
| 2 | soccorso, guardia, crime, completamento GM legacy | `0ea1ed17` | `src/quests/outcomes/companion-defeat-rescue.int-spec.ts` |
| 3 | bookkeeping | (commit docs) | ROADMAP, STATE, VALIDATION, questo SUMMARY |

## Verde al primo colpo

Tutti i 14 casi sono verdi al primo colpo: i piani d'esito (`planParticipant`, `planUnrewarded`, `planDefeatWithoutAid`) sono collegati a `companionAfterFight` nel piano 05, e dungeon e guardia fondono la vita dell'ultimo scontro dal piano 04. Nessun `fix(...)` necessario. L'unico intervento è sul fake della porta (`ScriptedCombatResolver`), che prima non propagava `companionLifeAfter` (key link del piano).

Casi e cosa provano:
- `companion-defeat.int-spec.ts` (7): quest vinta a 1 (voce intera e foglio intero con `toEqual`), ferito a 35 (voce senza `lifeAsOf`, slot invariato), illeso a 60 (`lifeBefore` = `lifePoints`), boss a due posti (il compagno di A sconfitto, B senza compagno ha `companion` null), dungeon a due tappe (contesto della seconda tappa senza compagno, UNA sola `findOneAndUpdate` sul personaggio, slot vuoto a fine missione, xp delle due tappe), livello 7 → 8 con l'xp dello scontro (vita 147 tenuta, massimo 162, voce senza `name` → nome del catalogo «Worg»), job perso senza soccorso (nessuna aid, voce sconfitta, xp 0).
- `companion-defeat-rescue.int-spec.ts` (7): soccorritore a 1 (soccorso riuscito, xp 10), quest di guardia con scontro della quest a 1 e guardia vinta (secondo contesto senza compagno, voce sconfitta, xp del compagno 11 = 10 % di 105 arrotondato), guardia persa dopo uno scontro della quest a 35 e guardia a 20 (il secondo contesto entra con 35, voce a 20, slot invariato, xp 0), crime vinto con arresto (`planUnrewarded`, voce sconfitta, xp 0), completamento GM legacy con override `hpAfter` e compagno a 1 (sconfitto, `lifeBefore` 1), override e compagno a 60 (voce invariata, foglio 60/60), nessun override (nessuno scontro: `companion` null, voce invariata).

## Deviazioni dal piano

### Auto-fix

**1. [Rule 3 - Blocking] `ScriptedCombatResolver` esteso**
- **Trovato durante:** Task 1
- **Problema:** il fake non restituiva `companionLifeAfter`; con uno script statico per personaggio non si potevano dare vite diverse a scontri in sequenza (quest e guardia).
- **Fix:** `companionLifeAfter` restituito solo se il partecipante ha un compagno nel contesto; `willResolve` accetta anche `(context) => ScriptedEffects`. Retrocompatibile: nessuna spec esistente scriptava `companionLifeAfter` (verificato con grep); verdi senza modifiche quest-combat, quest-dungeon, boss-resolution, crime-guard-conclusion, aid-rescue, gm-completion.service, dungeon-aid, ambush-resolution, guided-completion.service, quest-pet-prize.
- **File:** `test/quests/scripted-combat-resolver.ts`
- **Commit:** `4a52f91c`

### Note

- Il piano nomina `completePendingRequest`: il metodo del servizio è `GmCompletionService.complete` (la mutation si chiama così sul resolver); usato quello.
- Il grep del piano su `Plan: 06 of 18` non combacia: per istruzione dell'orchestratore STATE porta `Plan: 6 of 18` (senza zero). Atteso.

## Verifiche

- `npx jest src/quests/outcomes/companion-defeat-rescue.int-spec.ts src/quests/outcomes/companion-defeat.int-spec.ts --selectProjects integration --runInBand`: 2 suite / 14 test verdi.
- Regressione del fake: 10 int-spec che usano lo `ScriptedCombatResolver` verdi (vedi sopra; 3 suite / 46, 5 suite / 71 comprese le nuove, 4 suite / 84).
- `npx tsc --noEmit -p tsconfig.json` 0; `git diff --exit-code src/schema.gql` pulito (SDL invariato).
- Grep di accettazione: `D-26` 3, `D-39)` 1, `D-12)` 1, `D-27)` 1 in companion-defeat; `D-26)` 3, `Pitfall 8)` 2 in companion-defeat-rescue.

## Known Stubs

Nessuno.

## Self-Check: PASSED

- FOUND: `src/quests/outcomes/companion-defeat.int-spec.ts`, `src/quests/outcomes/companion-defeat-rescue.int-spec.ts`
- FOUND: `4a52f91c`, `0ea1ed17`
