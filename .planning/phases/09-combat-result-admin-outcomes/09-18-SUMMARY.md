---
phase: 09-combat-result-admin-outcomes
plan: 18
subsystem: quest-outcomes
tags: [aid, rescue, boss, group, schema, user-decisions]

# Dependency graph
requires:
  - phase: 09-combat-result-admin-outcomes (09-12, 09-13, 09-17)
    provides: risoluzione standard/boss/soccorso, CharacterArchiver, porta CombatResolution con verdetto unico, battleOf, willEnd
provides:
  - Quest.rescue.characters (una aid per combattimento perso, riferita a tutti i feriti)
  - aidSeatsOf e buildAidQuest(original, injuredIds, aidId) con posti = posti della quest fallita
  - ResolutionLoader.readGroupRoster (roster condiviso da boss e soccorso) e tipi in group-roster.ts
  - soccorso di gruppo con un solo verdetto, timeout su tutti i feriti, sweep una volta per aid
  - QuestResult.rescuedCharacters: [ID!]! nello schema
affects: [09-19 (avvio di boss e aid di gruppo solo a party completo), FE Phase 9 (foglio esiti), BE Phase 10]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Claim della quest prima di liberazioni e morti: l'archivio non tocca una aid già conclusa nella stessa transazione"
    - "Roster di gruppo letto da un'unica implementazione nel loader, usata da boss e soccorso"

key-files:
  created:
    - src/quests/outcomes/group-roster.ts
    - .planning/phases/09-combat-result-admin-outcomes/09-18-SUMMARY.md
  modified:
    - src/models/quest/quest-rescue.model.ts
    - src/models/quest/quest-outcome-fields.schema.spec.ts
    - src/models/quest-result/quest-result.model.ts
    - src/models/quest-result/quest-result.schema.spec.ts
    - src/schema.gql
    - src/quests/outcomes/aid/aid-quest.ts
    - src/quests/outcomes/aid/aid-quest.spec.ts
    - src/quests/outcomes/aid/aid-timeout.ts
    - src/quests/outcomes/aid/aid-timeout.spec.ts
    - src/quests/outcomes/resolution-kind.ts
    - src/quests/outcomes/resolution-kind.spec.ts
    - src/quests/outcomes/resolution-loader.service.ts
    - src/quests/outcomes/boss-resolution.service.ts
    - src/quests/outcomes/boss-resolution.int-spec.ts
    - src/quests/outcomes/rescue-resolution.service.ts
    - src/quests/outcomes/aid-rescue.int-spec.ts
    - src/quests/outcomes/aid-timeout.int-spec.ts
    - src/quests/outcomes/quest-combat.int-spec.ts
    - src/quests/outcomes/quest-resolution.service.ts
    - src/quests/outcomes/quest-resolution.processor.int-spec.ts
    - src/quests/outcomes/quest-resolution.sweeper.ts
    - src/quests/outcomes/quest-resolution.sweeper.int-spec.ts
    - src/quests/outcomes/quest-outcome-plan.ts
    - src/quests/outcomes/combatant-plan.ts
    - src/quests/outcomes/outcome-plan.ts
    - src/quests/outcomes/outcome-plan.spec.ts
    - src/quests/outcomes/rescue-plan.ts
    - src/quests/outcomes/rescue-plan.spec.ts
    - src/quests/results/quest-result.resolver.int-spec.ts
    - src/characters/deletion/character-archiver.ts
    - src/characters/deletion/character-archiver.int-spec.ts
    - src/characters/deletion/character-deletion.resolver.int-spec.ts
    - test/app.int-spec.ts
    - test/quests/quest-result.fixture.ts
    - .planning/phases/09-combat-result-admin-outcomes/09-CONTEXT.md
    - .planning/phases/09-combat-result-admin-outcomes/BACKEND-NOTES.md
    - .planning/phases/09-combat-result-admin-outcomes/09-VALIDATION.md
    - .planning/phases/09-combat-result-admin-outcomes/09-VERIFICATION.md
    - .planning/ROADMAP.md
    - .planning/STATE.md

key-decisions:
  - "Decisione dell'utente (2026-10-25): una sola aid per combattimento perso, con tanti posti quanti la quest fallita"
  - "Posti della aid tutti jolly (title: null), somma dei count della quest fallita, minimo 1: default tecnico proposto all'utente, 2026-10-25"
  - "Il soccorso di gruppo si risolve quando tutti i soccorritori registrati sono scaduti: è un comportamento transitorio di 09-18. La regola dell'utente del 2026-10-25 (il party deve essere al completo per cominciare, anche per le aid del boss) arriva con il piano 09-19"
  - "rescuedCharacters li azzera planParticipant quando il verdetto non è success: la regola sta in un solo punto e combatant-plan li passa e basta"
  - "Una aid vecchia di un soccorso fallito conserva rescue.characters come storico: il claim la conclude prima che l'archivio passi, e l'archivio tocca solo le aid aperte"

patterns-established:
  - "Claim prima della morte nelle transazioni che archiviano personaggi legati alla quest in risoluzione"

requirements-completed: [BE-COMBAT-01, BE-COMBAT-03]

# Metrics
duration: 75min
completed: 2026-10-25
---

# Phase 9 Plan 18: una sola aid di gruppo per combattimento perso Summary

**Ora un combattimento perso genera una sola aid (`rescue.characters`), con tanti posti jolly quanti la quest fallita. Il soccorso è un combattimento di gruppo sul roster condiviso con il boss, con un solo verdetto: libera tutti i feriti o li uccide tutti. Timeout e archivio agiscono su tutti i feriti della aid. Nello schema `QuestResult.rescuedCharacters: [ID!]!` sostituisce il campo singolo.**

## Performance

- **Duration:** ~75 min
- **Started:** 2026-10-25T13:41:27Z
- **Completed:** 2026-10-25
- **Tasks:** 3
- **Files modified:** 41 (34 di codice/test/schema più 1 creato, 6 documenti) + questo SUMMARY

## Accomplishments

- Modello: `QuestRescue.characters: ObjectId[]` (required, `default: undefined`; la lista vuota lasciata dall'archivio è valida). `QuestResult.rescuedCharacters` (`default: []`).
- `aidSeatsOf` usa `slotsOf`/`slotRuleOf` (slot non validi ⇒ 1, T-09-86). `buildAidQuest(original, injuredIds, aidId)` copia la lista e conserva `failedQuest` e posti dell'originale anche nelle catene.
- `resolutionKindOf`: una aid è `rescue` solo con almeno un ferito con ref valido; una aid svuotata dall'archivio si risolve come individuale.
- Archivio: per ogni aid aperta che contiene il personaggio fa `$pull` da `rescue.characters`, e conclude la aid solo quando la lista resta vuota.
- Boss perso: un solo `aidQuestId` per il gruppo e UNA `createAid` con tutti i falliti, quindi un solo job `aid-timeout`.
- `ResolutionLoader.readGroupRoster` è l'unica implementazione del roster; `GroupSeat` non ha più `aidQuestId`.
- `RescueResolutionService`, soccorso: legge il roster dei soccorritori e attende (`waiting`) finché uno non è scaduto o è in viaggio. Fa uno snapshot in sessione di ogni soccorritore e dei feriti (con il loro proprietario), poi un solo combattimento. Seguono i piani dei soccorritori, poi il claim `$all` + `$size` in modalità `'claim'`, e solo dopo la liberazione o la morte di tutti i feriti. In caso di sconfitta nasce una sola nuova aid per i soccorritori. I feriti scollegati o non più in attesa finiscono in log con i soli id.
- `timeoutAid`: considera tutti i feriti attivi in attesa della aid e scade dal `since` più vecchio. Il claim avviene prima delle morti; lo sweep chiama `timeoutAid` una volta per aid distinta.
- Documenti, ROADMAP (18/18) e STATE allineati, con la regola dell'utente per 09-19.

## Task Commits

1. **Task 1 RED:** `1f5e6d0` test(outcomes): one aid per lost fight with the failed quest seats (66)
2. **Task 1 GREEN:** `52a55aa` feat(outcomes): aid quests rescue every wounded of a lost fight (63)
3. **Task 1 GREEN (archivio + schema):** `50b9690` feat(characters): keep an aid open while someone is left to rescue (66)
4. **Task 2 RED:** `2616320` test(outcomes): rescue every wounded with one group aid (55)
5. **Task 2 REFACTOR:** `65569dd` refactor(outcomes): share the group roster reader (49)
6. **Task 2 GREEN:** `5d34a8d` feat(outcomes): rescue a whole party with one group aid (55)
7. **Task 3:** `89220dd` docs(phase-9): document the group aid and rescuedCharacters (59)

## Gate (Task 2)

- `npm run test:unit`: **121 suite / 1790 test** passati
- `npm run test:int`: **72 suite / 924 test** passati (foreground, `--runInBand`; il flaky del boot reale non si è presentato)
- `npm run build`: exit 0; `git diff --exit-code src/schema.gql` pulito
- `git diff origin/develop -- src/schema.gql`: nessuna riga rimossa; letterali vietati assenti
- `grep -rn -E "rescue\.character\b|rescue\?\.character\b|rescuedCharacter\b|transitorio: 09-18" src test` vuoto; `createAid(` nel boss = 1, fuori da ogni ciclo

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `quest-outcome-fields.schema.spec.ts` ancora su `rescue.character`**
- **Found during:** Task 1 GREEN
- **Issue:** la spec del modello Quest controllava il path `rescue.character`, ma non era nella lista dei file del piano.
- **Fix:** ora verifica che `rescue.characters` sia un array di ObjectId e copre il caso "required", lista vuota inclusa.
- **Commit:** `52a55aa`

**2. [Incoerenza del piano] Caso 4 di aid-rescue: `rescue.characters` della aid vecchia**
- **Found during:** Task 2 RED
- **Issue:** il caso 4 si aspettava `rescue.characters = []` sulla aid vecchia "perché l'archivio toglie i morti DOPO il claim". Con il claim prima della morte (W1), però, la aid è già conclusa quando l'archivio passa, e l'archivio (interfaccia del Task 1) tocca solo le aid aperte.
- **Fix:** il test verifica che la aid vecchia sia conclusa a NOW e che conservi i feriti come storico; il commento del test spiega il motivo. L'ordine del claim e l'archivio restano quelli del piano.
- **Commit:** `2616320`

**3. Istruzione dell'orchestratore durante l'esecuzione (nuova decisione dell'utente, 2026-10-25)**
- **Issue:** l'utente ha detto: "Per quanto riguarda le missioni boss: per poterle cominciare il party dev'essere al completo, quindi tutti restano in attesa. Lo stesso vale per le missioni aid legate a chi fallisce la missione boss." Il piano 09-19 lo implementerà.
- **Fix:** codice e test dei Task 1 e 2 sono rimasti come da piano. Nei documenti il default "la aid di gruppo non aspetta che i posti si riempiano" non compare come scelta valida: è descritto come comportamento transitorio di 09-18, e si rimanda alla regola dell'utente che arriva con 09-19 (CONTEXT D-05/D-08 e citazioni, BACKEND-NOTES §5/§6/§16 con il punto aperto 09-19, VALIDATION, VERIFICATION, STATE). Il default dei posti tutti jolly resta "default tecnico proposto all'utente, 2026-10-25".
- **Commit:** `89220dd`

### Scelte minori

- `rescuedCharacters` lo azzera `planParticipant` quando il verdetto non è success, così la regola sta in un solo punto; `combatant-plan.ts` passa il valore senza toccarlo.
- I `rescuedCharacters` dei soccorritori sono i feriti attivi in attesa della aid **con un utente collegato** (quelli davvero liberati, caso 5).
- La citazione dell'utente in CONTEXT (riga delle citazioni) è stata riportata alla forma verbatim, con "Adesso che ci penso,".
- ROADMAP: "**Plans**: 16 plans (8 waves)" della Phase 9 aggiornato a "18 plans (10 waves)" (Boy Scout).
- Nella REFACTOR c'è stato un adattamento transitorio (gli id delle aid per posto calcolati in `commitGroup`), poi rimosso dal GREEN.

## Known Stubs

Nessuno nuovo. Il resolver di combattimento e le tabelle restano segnaposto per scelta dell'utente (A2, BACKEND-NOTES §11).

## Next Phase Readiness

- Piano 09-19: boss e aid di gruppo partono solo a party completo (countdown di gruppo).
- Dopo il push dell'orchestratore, la PR #13 riceve i sette commit di 09-18 più questo SUMMARY.

## Self-Check: PASSED
