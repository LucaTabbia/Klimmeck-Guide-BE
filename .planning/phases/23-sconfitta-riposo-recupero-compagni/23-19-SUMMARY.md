---
phase: 23-sconfitta-riposo-recupero-compagni
plan: 19
subsystem: quests
tags: [companion, dungeon, guided-mission, corrections, xp]
branch: fix/23-dungeon-xp-and-innkeeper-corrections
requires: [23-18]
provides: [companion xp from fought fights only, guided corrections merged with the simulation]
key-files:
  created:
    - src/quests/outcomes/pets/companion-enemies-xp.ts
    - src/quests/outcomes/pets/companion-enemies-xp.spec.ts
  modified:
    - src/quests/outcomes/combat/combat-resolver.ts
    - src/quests/outcomes/dungeon/placeholder-dungeon-resolver.ts
    - src/quests/outcomes/dungeon/dungeon-resolver.ts
    - src/quests/outcomes/outcome-plan.ts
    - src/quests/outcomes/combatant-plan.ts
    - src/quests/outcomes/gm-overrides.ts
    - src/models/request/complete-pending-request.model.ts
    - src/quests/guided/guided-outcome.ts
    - src/quests/guided/guided-completion.service.ts
    - src/quests/guided/mission-draft-save.service.ts
decisions:
  - "D-13 xp: il compagno caduto prima dell'ultimo scontro di una sequenza prende gli xp dei soli scontri combattuti, quello della caduta compreso; xp del personaggio invariato"
  - "A-08: nella bozza guidata un campo omesso o null della correzione vale il simulato; un valore esplicito, anche [], vince; il record corrected salva gli effetti fusi; il completamento senza bozza non cambia"
completed: 2026-11-15
---

# Phase 23 Plan 19: xp del compagno nel dungeon e correzioni dell'oste

Due decisioni dell'utente dopo la merge della fase 23, senza PLAN.md (brief dell'orchestratore).

## Cosa

1. **xp del compagno (D-13).** `ParticipantEffects.companionEnemiesXp?` porta gli xp dei nemici degli scontri combattuti dal compagno quando cade prima dell'ultimo (assente = tutti i nemici). La regola unica è `companionEnemiesXpOf(fights)` in `pets/companion-enemies-xp.ts`. Il dungeon segnaposto la applica tappa per tappa (`ParticipantTrack`). Il completamento guidato la applica con `guidedBattleOf(fights, hex, enemyXp)`, sulla vita effettiva (corretta se corretta) del compagno a fine scontro; gli xp per nemico vengono da `enemyXpByIdOf(catalog)`, che usa la stessa formula di `enemyFactsOf`. `planParticipant` passa a `companionAfterFight` `battle.companionEnemiesXp ?? enemiesXp` (0 in sconfitta). L'xp del personaggio non cambia. Contratto GraphQL invariato.
2. **Correzioni dell'oste (A-08).** `correctionOverSimulated(correction, simulated)` in `guided-outcome.ts` fonde la correzione col simulato del suo scontro prima di `validateOverrides`: omesso o `null` = simulato, esplicito vince (anche `[]` e `0`, che poi la convalida rifiuta come prima). `MissionDraftSaveService.corrected` la usa tramite `overSimulated(correction, fight)`. Il record `corrected` contiene gli effetti fusi: `sameCorrections`/`effectsKeyOf` e la riconvalida al completamento lavorano sui fusi e non rileggono il simulato. Il completamento senza bozza (`gm-overrides.ts`) non cambia. Il gap G-1 è chiuso.

## Commit

- `70a1f9ab` test(quests): expect companion xp from the fights it fought only
- `8f005f5c` fix(quests): give a fallen companion the xp of its fights only
- `e0e4788a` test(quests): expect omitted correction fields to keep the simulation
- `9106b66e` fix(quests): fill omitted innkeeper corrections with the simulation

## Pin cambiati

- `companion-defeat.int-spec.ts` «keeps a companion defeated on a stage out of the later stages…»: xp del compagno da `2 * FIGHT_PET_XP` a `FIGHT_PET_XP`, più `xpGained: 250` e `petXpGained: 10` sul risultato.
- `mission-draft-save.service.int-spec.ts` «corrects a fight within the bounds at its start (D-06)», caso `highest` (`{ hpAfter: 1000 }`): da liste vuote a `{ ...simulated, hpAfter: 1000 }`.
- `mission-draft-save.service.int-spec.ts` «saves the innkeeper correction of the companion life (D-17)»: `hpAfter` da 900 (vita d'inizio scontro) a `{ ...simulated, companionLifeAfter: 1 }`.

## Prove nuove

- `companion-enemies-xp.spec.ts` (4), `placeholder-dungeon-resolver.spec.ts` (+1 caso, +1 asserzione di assenza), `outcome-plan.spec.ts` (+1), `guided-outcome.spec.ts` (+4, describe `correctionOverSimulated`).
- `guided-completion.service.int-spec.ts`: +1 (compagno caduto nel primo scontro → xp 5 invece di 15, personaggio 150), +1 asserzione (vita omessa = simulata 900).
- `mission-draft-save.service.int-spec.ts`: +2 (compagno omesso = simulato, G-1; valori espliciti che vincono).

## Verifica

- `npx tsc --noEmit -p tsconfig.json`: 0. eslint e prettier puliti sui file toccati.
- Unit `src/quests`: 88 suite / 1 465 test verdi.
- Integration `src/quests/outcomes` + `src/quests/guided`: 21 suite / 318 test verdi; tutta `src/quests` dopo l'ultimo fix: 46 suite / 762 test verdi. Boot reale `test/app.int-spec.ts`: 102/102, `src/schema.gql` invariato (nessun decoratore cambiato).

## Deviazioni

Nessuna rispetto al brief. Fuori perimetro: la guardia dopo lo scontro della quest (`guard-outcome.ts` `mergedEffects`) non porta `companionEnemiesXp`: un compagno caduto nello scontro della quest prende ancora gli xp della guardia (regola non chiesta, da decidere).
