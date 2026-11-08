---
phase: 16-lore-sbloccabili
plan: 07
subsystem: quests/outcomes (soccorso, premi, loader, piano del partecipante)
tags: [quests, rescue, study, lore, BE-LORE-02, BE-LORE-03, BE-LORE-04, D-05, D-06, D-08, D-09]
requires: ["16-01", "16-03", "16-05", "16-06"]
provides:
  - "`RescuedPlanInput.geography?: readonly Types.ObjectId[]`; `RescuedPlan.update: { $set; $addToSet?: KnowledgeAddition['$addToSet'] }` (tipo letterale); `planRescued` aggiunge la geografia solo con `cityMarker`; `unchangedResult` (fogli `rescued` e `death`) con `loreUnlocked: []`"
  - "`RescueResolutionService` inietta `LoreGeographyReader` (ultimo parametro); `ReturnCity.geography`; `returnCityOf` legge `ofMarker(cityMarker)` fuori transazione"
  - "`QuestOutcomesModule`: `forFeature` + `Lore`, import di `LoreGeographyModule`, provider `loreConfigProvider`"
  - "`LoreDraw { pool; chance; gate; pick }`, `DrawnRewards.loreDraw`, `NO_REWARDS.loreDraw = null`, `RewardCatalog.studyLorePool?` / `studyLoreChance?`, `drawStudyLore(draw, excluded)`; `loreDrawOf` privato chiamato in `drawRewards` dopo `petDrawOf`"
  - "`planParticipant`: `studyLore = won && !spellLearned ? drawStudyLore(rewards.loreDraw, [...unlockedLore, ...victoryLore]) : null`, lore candidate `[...victoryLore, studyLore]`"
  - "`ResolutionLoader`: costruttore + `@InjectModel(Lore.name) loreModel`, `@Optional() @Inject(LORE_CONFIG) loreConfig?`; `readStudyLorePool(quest)` privato (solo study, ordinato per hex); `readCatalog` compone `studyLorePool` e `studyLoreChance`"
affects: [16-11, 16-12]
tech-stack:
  added: []
  patterns:
    - "Tiri nuovi in coda e solo con pool non vuoto: le sequenze `chance.drawn` delle altre quest non cambiano (Pitfall 5)"
    - "Pool intero letto fuori transazione, filtrato nel piano puro contro lo snapshot in sessione e le lore dello stesso esito (C-3, Pitfall 6)"
key-files:
  created:
    - src/quests/outcomes/study-lore-draw.int-spec.ts
  modified:
    - src/quests/outcomes/rescue-plan.ts
    - src/quests/outcomes/rescue-plan.spec.ts
    - src/quests/outcomes/rescue-resolution.service.ts
    - src/quests/outcomes/aid-rescue.int-spec.ts
    - src/quests/outcomes/quest-outcomes.module.ts
    - src/quests/outcomes/rewards/quest-rewards.ts
    - src/quests/outcomes/rewards/quest-rewards.spec.ts
    - src/quests/outcomes/outcome-plan.ts
    - src/quests/outcomes/outcome-plan.spec.ts
    - src/quests/outcomes/resolution-loader.service.ts
    - src/quests/outcomes/resolution-loader.service.spec.ts
decisions:
  - "`RescuedPlan.update` è un tipo letterale con `$addToSet?: KnowledgeAddition['$addToSet']` invece dell'intersezione del blocco interfaces: stessa ragione del 16-05/16-06 (`writeCharacterUpdate` vuole `Record<string, unknown>`)"
  - "Il gate dello studio passa con `gate < chance` (con `chance = 1` passa sempre, con `chance = 0` mai); gli esclusi si confrontano con `refHexOf`, quindi anche le stringhe legacy contano come note"
  - "Lo studio non controlla il tipo della quest nel piano: il pool esiste solo per una study (loader), quindi `loreDraw` è null per ogni altro tipo"
metrics:
  duration: "~15 min"
  completed: 2026-11-07
  tasks: 3
  files: 12
---

# Phase 16 Plan 07: soccorso come arrivo e studio al LORE_STUDY_CHANCE Summary

Il ritorno del soccorso sul marker della città è il quinto arrivo: `planRescued` scrive la geografia della città (letta fuori sessione con `LoreGeographyReader.ofMarker(cityMarker)`) nello stesso update che libera il ferito, mentre i fogli `rescued` e di morte portano `loreUnlocked: []`. La `study` vinta senza magia imparata apprende, con probabilità `LORE_STUDY_CHANCE` (default 0.5 dal `LORE_CONFIG`), una lore casuale fra quelle dei `STUDY_LORE_TYPES` non ancora sbloccate e non sbloccate dai nemici dello stesso esito; i due tiri `gate`/`pick` arrivano in coda dopo loot, magia e pet e solo con pool non vuoto, quindi nessuna sequenza di tiri esistente cambia.

## Commit

| Task | Commit | Subject |
|------|--------|---------|
| 1 RED | ba341b9 | test(quests): expect the rescued return to teach the city (D-05) |
| 1 GREEN | ba7038b | feat(quests): unlock the return city geography on a rescue |
| 2 RED | cd456b1 | test(quests): pin the study lore draw at the configured chance (D-08) |
| 2 GREEN | 90de1f5 | feat(quests): learn a study lore at the configured chance |
| 3 | (questo) | docs(phase-16): record plan 07 progress |

## Fallimenti RED osservati

- Task 1 unit (`rescue-plan.spec.ts`): 3 falliti su 7 — `adds the city geography to the rescued return (D-05)` (manca l'add-to-set), `drafts a rescued sheet without healing` e `drafts a death sheet owned by the user, values unchanged` (manca `loreUnlocked: []`). Verde in RED: `adds no geography when no city holds the marker (D-05)` (oggi c'è solo l'operatore set; resta come guardia del ramo `cityMarker: null`).
- Task 1 integration (`aid-rescue.int-spec.ts`): 1 fallito su 21 — `unlocks the return city geography for the rescued (D-05)`. Verdi in RED: `unlocks nothing for a rescued freed where they stand (D-05)` (prova d'assenza: il default `[]` di `@Prop` del 16-02) e `teaches the winning rescuers the enemies of the aid (D-06)` (già cablato dal 16-05 tramite `planCombatant`; resta come prova che il ferito non impara i nemici).
- Task 2 unit: 15 falliti su 111 — `drawStudyLore is not a function` (6 casi), i due `toEqual` con `loreDraw: null`, i 4 casi di `drawRewards with a study lore pool` e i casi di `the study lore draw` di `outcome-plan.spec.ts` che si aspettano una lore. `resolution-loader.service.spec.ts` verde in RED (ts-jest non controlla l'arità del costruttore).
- Task 2 integration (`study-lore-draw.int-spec.ts`): 4 falliti su 8 — `learns a random unknown study lore when the roll passes (D-08)`, `never draws a city or a bestiary page (D-08)`, `learns nothing when every study lore is known (D-08)` (i tiri non venivano consumati), `always learns with the chance set to one (D-08)`. Verdi in RED: i casi d'assenza (`learns nothing when the roll fails`, `consumes no roll without study lore in the catalog`, `ignores the study lore for another quest type`) e la guardia sui `STUDY_LORE_TYPES`.

## Sequenze di tiri ri-derivate

- La study delle spec (`randomLoot: []`, nessuna magia, nessun pet, nessun nemico) consuma **0 tiri** prima dei due dello studio: misurato dal caso `consumes no roll without study lore in the catalog` (verde in RED con `chance.drawn` = `[]`); la costante della spec `STUDY_ROLLS_BEFORE_LORE = []`. Con lore dello studio a DB la sequenza diventa `[gate, pick]`.
- Unit: con loot + magia sorteggiata + pet la sequenza è `[loot, spell, pet, gate, pick]` (`queues the study draws after the loot, spell and pet draws (D-08)`).
- La `job` vinta con lore dello studio a DB consuma `[]`: il loader non legge il pool fuori dalla study.

## Override del provider per `studyChance: 1`

`createOutcomeHarness({ clock, chance, overrides: [{ token: LORE_CONFIG, useValue: { studyChance: 1 } }] })` in un secondo `describe` con il proprio harness (helper `studyWorld({ studyChance })` della spec); gate `0.99` → la lore è appresa.

## Deviazioni dal piano

- **[Rule 3 - Blocco] Tipo di `RescuedPlan.update`.** Il blocco `<interfaces>` chiedeva `{ $set } & KnowledgeAddition`; come nel 16-05/16-06 l'intersezione non è assegnabile a `Record<string, unknown>` di `writeCharacterUpdate`: tipo letterale con `$addToSet?` opzionale.
- **Casi aggiunti oltre il `<behavior>`:** unit `adds no geography when no city holds the marker (D-05)`, `queues the study draws after the loot, spell and pet draws (D-08)`, `falls back to the default study chance when the catalog has none (D-08)`, `treats a known lore stored as a legacy string as known (D-08)`, `learns a study lore the character does not know (D-08)`, `learns no study lore when the gate fails (D-08)`; integration `never draws a city or a bestiary page (D-08)` e `draws the pool from the study lore types only (D-08)`.
- **Grep di accettazione:** `grep -c "loreConfigProvider" quest-outcomes.module.ts` stampa `2` (non `1`): conta anche la riga dell'import; il provider compare una sola volta nell'array `providers`. `grep -rn "Math.random" src/quests/outcomes … | grep -v spec` stampa la riga preesistente `src/quests/outcomes/chance-source.ts:12` (`MathChanceSource`, l'adattatore della porta, non codice della fase); il grep mirato sui tre file della fase è vuoto. `grep -c "D-08" study-lore-draw.int-spec.ts` = 8.
- **Bookkeeping:** `Plan: 7 of 12` in STATE.md (formato del brief dell'orchestratore) invece di `Plan: 07 of 12` del piano; il grep di verifica del Task 3 del piano quindi non passa per scelta.
- In più rispetto alla verifica del piano: `npx jest test/app.int-spec.ts` (boot reale in memoria) per provare che `loreConfigProvider` e il reader si risolvono in `AppModule`; schema invariato.

## Gate

- `npx jest src/quests/outcomes --selectProjects unit`: 26 suite, 446/446.
- `npx jest src/quests/outcomes/aid-rescue.int-spec.ts src/quests/outcomes/aid-timeout.int-spec.ts --selectProjects integration --runInBand`: 2 suite, 33/33.
- `npx jest src/quests/outcomes src/travel/ambush --selectProjects integration --runInBand`: 16 suite, 186/186 (~68 s; `study-spell-draw` e `quest-pet-prize` invariate).
- `npx jest test/app.int-spec.ts --selectProjects integration --runInBand`: 76/76.
- `npx tsc --noEmit -p tsconfig.json` 0; prettier e eslint puliti sui 12 file `.ts` toccati (nessun file sporco in partenza, nessun commit style).
- `git diff --exit-code src/schema.gql` 0; schema vs origin/develop: 2 righe aggiunte (`unlockedLore: [ID!]!`, `loreUnlocked: [Lore!]!`, dal 16-02), 0 tolte.

## Known Stubs

Nessuno.

## Self-Check: PASSED

Commit ba341b9, ba7038b, cd456b1, 90de1f5 nel log; `src/quests/outcomes/study-lore-draw.int-spec.ts` presente.
