---
phase: 19-revisione-dei-modelli
plan: 19
subsystem: quests
tags: [spellStates, active, esiti, combattimento, override, imboscata, D-07, D-16, D-22]
requires: [19-18]
provides:
  - "`spellsSpent(characterId, states, requested, recoveryTimes, now)` → `{ spellStates, used, recoveries }`: entra solo una voce con `active === true`, l'array scritto conserva `active` e l'ordine"
  - "`learnedSpellState` con `active: false`; «già conosciuta» decisa sulle voci in `planParticipant`"
  - "`activeSpellsOf` del contesto di combattimento e i limiti degli override del GM dalle sole voci attive, in ordine di apprendimento"
  - "catalogo del combattimento senza `spellMaxUsages`; `spell-state.snapshot.ts` senza la base migrata in memoria"
affects: [19-20, 19-23]
tech-stack:
  added: []
  patterns: [voce senza flag letta come non attiva (`=== true`) in ogni lettore lean]
key-files:
  created:
    - src/quests/outcomes/unrewarded-plan.spec.ts
  modified:
    - src/quests/outcomes/outcome-plan.ts
    - src/quests/outcomes/unrewarded-plan.ts
    - src/travel/ambush/ambush-plan.ts
    - src/quests/outcomes/combat/combat-context.ts
    - src/quests/outcomes/gm-overrides.ts
    - src/characters/spells/spell-state.snapshot.ts
    - src/quests/outcomes/resolution-loader.service.ts
    - src/quests/outcomes/combatant-plan.ts
    - src/quests/outcomes/gm-completion.service.ts
    - src/quests/outcomes/conclusion/conclusion-plan.ts
    - src/travel/ambush/ambush-resolution.service.ts
decisions:
  - "Il contesto di combattimento è passato alle voci attive nello stesso commit GREEN dei piani d'esito (non nel Task 2): i tempi di recupero del catalogo si leggono dalle magie che entrano in combattimento, quindi le int-spec degli esiti seminate con le sole voci dipendono da entrambi"
  - "Una voce senza `active` vale non attiva anche per spesa, combattimento e override (`=== true`), come nel 19-18"
  - "Usi di una voce attiva mai sotto 0 nel contesto e nei limiti degli override (stessa regola di `usagesFromState`)"
metrics:
  completed: 2026-11-11
  tasks: 3
  files: 28
---

# Phase 19 Plan 19: esiti, combattimento, override e imboscata sulla sola lista delle voci — Summary

Spesa delle magie, apprendimento, combattimento, override del GM e imboscata leggono e scrivono soltanto `status.spellStates`: entra in gioco solo una voce con `active` vero, con i suoi usi e nell'ordine di apprendimento; una magia imparata nasce come voce `active: false` in coda. Nessun codice di produzione fuori da modello, populate e registro dei ref nomina più le due liste vecchie; gli helper della base migrata in memoria e l'impianto `spellMaxUsages` non esistono più. Terzo di quattro piani di BE-MODEL-06 (D-07, D-16, D-22): chiude lo stato intermedio dichiarato nel 19-18.

## Commit

| Task | Commit | Subject (caratteri) |
|------|--------|---------------------|
| 1 RED | `acf0f5ae` | `test(outcomes): pin the outcome plans on the single spell state list` (68) |
| 1 RED (contesto) | `e075c2e5` | `test(outcomes): pin the fight on the active spell states` (56) |
| 1 GREEN | `329d6fa1` | `feat(outcomes): spend and learn spells on the spell states` (58) |
| 2 RED | `796ab94b` | `test(outcomes): pin the overrides on the active spell states` (60) |
| 2 GREEN | `a240a85c` | `refactor(outcomes): read the override limits from active spell states` (69) |
| 3 | (questo e il successivo) | `docs(phase-19): summarize plan 19`, `docs(phase-19): record plan 19 progress` |

Ogni subject contato PRIMA del commit; nessun trailer (controllo a `0` dopo ognuno).

## Evidenza RED

**`acf0f5ae` (piani d'esito):**
- Unit, 27 rossi in 4 suite: `outcome-plan.spec.ts` (18: con le sole voci seminate il codice vecchio non spende nulla perché decide dalla lista delle equipaggiate; la voce imparata ha tre campi; `spellsSpent` ha la firma vecchia; «già conosciuta» letta dalla lista vecchia), `ambush-plan.spec.ts` (6), `unrewarded-plan.spec.ts` (2 su 3), `spell-state.snapshot.spec.ts` (1: `starts a learned spell as not active (D-07)`).
- Integration, 8 rossi in 3 suite: `quest-combat.int-spec.ts` (3), `study-spell-draw.int-spec.ts` (3: il caso grezzo `adds the learned spell as a state that is not active (D-07)` trova la lista vecchia scritta; il sorteggio pesca una magia che ha già una voce), `ambush-resolution.int-spec.ts` (2).
- Verdi al primo colpo: i casi «niente da spendere» (`spends nothing from a known spell whose state is not active`, `…without the flag…`, `…without spell states`, `writes no spell state when no active spell is spent`): col codice vecchio e senza lista delle equipaggiate non si spende comunque nulla; pinnano la forma nuova.
- `quest-resolution.service.int-spec.ts`: verde già a RED. I due attesi `toEqual` sulla voce imparata (`study-spell-draw` e `quest-resolution`) avevano `active: false` dal commit `6e6d03f2` del 19-17 (default dello schema): qui cambia chi lo scrive, non l'atteso.

**`e075c2e5` (contesto di combattimento):** 7 rossi in `combat-context.spec.ts` (le voci attive non entrano, i ref del catalogo vengono dalla lista vecchia). Verdi al primo colpo `brings no spell for a character without spell states (D-07)` e `reads a spell state stored without the flag as not active (D-07)` (senza lista vecchia il codice vecchio non porta nulla).

**`796ab94b` (override e codice morto):**
- Unit, 6 rossi in 2 suite: `gm-overrides.spec.ts` (4: limiti letti dalla lista vecchia) e `resolution-loader.service.spec.ts` (2: il catalogo porta ancora la chiave degli usi massimi).
- Integration, 1 rosso: `gm-completion.service.int-spec.ts` › `schedules a recovery for every spell use the game master reports` (con le sole voci il limite vecchio è vuoto e l'override è rifiutato).
- Verdi al primo colpo: i due rifiuti nuovi dell'int-spec (`rejects a game master override beyond the usages of an active spell state (D-07)`, `…on a spell whose state is not active (D-07)`) e i due unit corrispondenti: senza lista vecchia il codice vecchio rifiuta tutto. Diventano significativi col GREEN (il primo rifiuta 2 usi su una voce attiva da 1 mentre il caso accanto ne accetta 1).

## Cosa è cambiato

### Spesa e apprendimento (`329d6fa1`)

- **`outcome-plan.ts`:** `SpellsSpent { spellStates, used, recoveries }`; `spellsSpent` riceve le sole voci e salta una magia la cui voce manca o non ha `active === true`; `planParticipant` usa `knownStates = snapshot.status.spellStates ?? []` e `knownSpells = knownStates.map((state) => state.spell)` per `drawLearnableSpell` e `canLearnSpell`; nel set resta la sola chiave `status.spellStates`.
- **`unrewarded-plan.ts`, `ambush-plan.ts`:** stessa chiamata, una sola chiave nel set (`commonSetOf` non scrive più la lista delle equipaggiate).
- **`spell-state.snapshot.ts`:** `learnedSpellState` ritorna `active: false` (tipo `LearnedSpellState` compreso).
- **`combat/combat-context.ts`:** `activeSpellsOf` = voci con `active === true` e ref leggibile, usi della voce (mai sotto 0), nell'ordine delle voci; da qui anche i ref del catalogo (`combatCatalogRefsOf`) e quindi i tempi di recupero. `CombatParticipant.activeSpells` invariato (D-22): `combat-resolver.ts` e `placeholder-combat-resolver.ts` senza diff.

### Override e pulizia (`a240a85c`)

- **`gm-overrides.ts`:** limiti dalle voci attive; `OverrideParticipant.activeSpells` resta col suo nome.
- **Simboli rimossi da `spell-state.snapshot.ts`:** `spellStatesOrMigrated`, `mirrorFromStates`, `NO_SPELL_MAX_USAGES`, `ActiveSpellEntry`, `SpellStateSnapshot`, l'helper privato `knownSpellIds` e l'import di `refIdOf`. Restano `SpellStateEntry`, `LearnedSpellState`, `isUsageCount`, `stateEntryOf`, `usagesFromState`, `recoveryDueAt`, `spendFromState`, `learnedSpellState`.
- **Impianto `spellMaxUsages` rimosso da:** `ParticipantPlanInput` (`outcome-plan.ts`), `UnrewardedPlanInput`, `AmbushPlanInput`, i chiamanti `combatant-plan.ts`, `gm-completion.service.ts`, `conclusion/conclusion-plan.ts`, `ambush-resolution.service.ts`, il tipo `ResolutionCatalog` e `readCombatCatalog` (`readSpellMaxUsages` cancellato: una lettura dell'intero catalogo delle magie in meno per ogni esito). `isUsageCount` resta nel loader per i candidati della study.
- **`OutcomeCharacterSnapshot` e `CombatCharacterSnapshot`:** senza `status.spells` e `assets.activeSpells`.
- **Spec e helper:** `test/quests/unrewarded-plan-input.ts` e gli snapshot letterali di `outcome-plan.spec.ts`, `combatant-plan.spec.ts`, `rescue-plan.spec.ts`, `guard-outcome.spec.ts`, `ambush-plan.spec.ts` senza le due liste e senza il parametro; `spell-state.snapshot.spec.ts` senza i `describe` degli helper tolti (7 casi); le cinque int-spec seminano con `spellStatesOf` (sole voci).

## Esito delle prove

- `npx jest --selectProjects unit` → **273 suite, 3457 test** verdi prima di ogni commit GREEN (272 / 3445 dopo il piano 18: +1 suite `unrewarded-plan.spec.ts`).
- Progetto integration intero dalla HEAD di codice (`a240a85c`), a pezzi, in primo piano, un jest alla volta, nessun comando spostato in background — **147 suite, 2026 test, tutti verdi** (2021 dopo il piano 18):
  - `src/characters test/app.int-spec.ts` → 24 suite, 471 test (78 s); boot reale 90 test; `git diff --exit-code src/schema.gql` a 0.
  - `src/travel src/shops src/economy src/cities src/lore src/models test/shops test/fixtures` → 29 suite, 420 test (103 s).
  - `src/quests` → 35 suite, 516 test (164 s).
  - resto → 59 suite, 619 test (118 s).
- Prima del GREEN del Task 1: `src/quests` (35 / 514, vedi nota sul test instabile), `src/travel` (11 / 206, 55 s), `src/characters` (23 / 381, 74 s) verdi.
- `npx tsc --noEmit -p tsconfig.json` → 0 dopo ogni commit GREEN. Prettier ed eslint sui file toccati, uno per uno: puliti. `pgrep -fl 'bin/jest'` vuoto a fine di ogni task.
- **Coverage di `src/characters/spells`** (comando del 19-18 con `test/app.int-spec.ts` fra i percorsi): 99,12 / 89,1 / 99,33 (soglia 97 / 88 / 97). `package.json` senza diff.

**Test instabile osservato (fuori scope, non corretto):** nella prima corsa di `src/quests` del Task 1 la suite `quest-resolution.processor.int-spec.ts` («real Redis», 6 casi) è fallita per intero; rilanciata da sola è verde (6/6) e verde nelle due corse complete successive. Non tocca file del piano; usa il Redis locale vero, lo stesso del processo BE dell'utente: possibile contesa sui job. Da tenere d'occhio nel gate.

## Criteri di accettazione

| Criterio | Esito |
|----------|-------|
| `assets.activeSpells` in `outcome-plan.ts`, `unrewarded-plan.ts`, `ambush-plan.ts` | 0 / 0 / 0 |
| `'status.spells'` in `outcome-plan.ts` | 0 |
| `active: false` in `spell-state.snapshot.ts`; `unrewarded-plan.spec.ts` esiste | 2; sì |
| `D-07)` in `outcome-plan.spec.ts` / `ambush-plan.spec.ts` / `unrewarded-plan.spec.ts` | 16 / 2 / 3 |
| grep dei cinque simboli morti in `src test` | nessuna riga |
| grep dei due path vecchi in `src` non-spec fuori da modello, `characters.service.ts`, registro e migratore | nessuna riga |
| `activeSpells` in `combat-resolver.ts`; diff dei due file del motore dall'inizio del piano | 1; 0 righe |
| `D-16)` in `combat-context.spec.ts`; `D-07)` in `study-spell-draw.int-spec.ts` | 1; 1 |
| `git diff --exit-code src/schema.gql` | 0 |

## Deviazioni dal piano

**1. [Regola 3] taglio dei task rifatto: il contesto di combattimento nel GREEN del Task 1, con un RED suo (`e075c2e5`)**
- **Trovato durante:** corsa di `src/quests` prima del GREEN del Task 1.
- **Problema:** `readCombatCatalog` legge i tempi di recupero dalle magie che `combatCatalogRefsOf` trova «attive». Con i piani d'esito sulle voci e il contesto ancora sulla lista vecchia, una int-spec seminata con le sole voci spende gli usi ma senza istante di recupero né job: `quest-combat.int-spec.ts` rossa. I due pezzi non si possono committare verdi separatamente.
- **Fix:** RED dedicato al contesto (`combat-context.spec.ts`: i tre casi del `<behavior>` del Task 2 più tre), poi un solo GREEN con piani d'esito e contesto. Il Task 2 resta con override, codice morto e `gm-completion`. Il subject del RED e del GREEN del Task 2 è stato adattato al contenuto reale.
- **Conseguenza:** i casi int di `quest-combat`, `study-spell-draw` e `ambush-resolution` che il piano metteva nel Task 2 sono nel RED del Task 1 (dove sono rossi davvero); nel Task 2 resta `gm-completion`.

**2. [Regola 3] le due liste vecchie restano sul tipo `OutcomeCharacterSnapshot` fino al GREEN del Task 2**
- `gm-overrides.ts` le leggeva attraverso quel tipo: toglierle nel Task 1 avrebbe lasciato `tsc` rosso. Tolte in `a240a85c` insieme al lettore.

**3. [Regola 1] asserzioni sulla lista vecchia tolte o riscritte nelle int-spec**
- `quest-combat` e `gm-completion`: via `expect(character.assets.activeSpells)…` (gli esiti non la scrivono più). `study-spell-draw` (5 punti) e `quest-resolution` (4 punti): `character.status.spells` → le magie delle voci o `spellStates` vuoto.

**4. Casi tolti perché la regola non esiste più (annotati, non sostituiti)**
- `outcome-plan.spec.ts`: `takes the usages from the spell state, never from the slots`, `keeps the slot reference in its stored legacy form`, i due casi «not migrated yet» (base migrata in memoria). `combat-context.spec.ts` e `gm-overrides.spec.ts`: i due «not migrated yet» e i due «never from the slots». `spell-state.snapshot.spec.ts`: 7 casi di `mirrorFromStates` e `spellStatesOrMigrated`.
- `does not learn a spell already known as a legacy string` è diventato `does not learn a spell whose state holds a legacy string ref` (il ref della voce).

**5. [Regola 2] casi in più rispetto al `<behavior>`**
- Voce senza flag = non attiva in spesa, contesto e override; usi negativi e ref illeggibile nel contesto e nei limiti; `returns the spent states, the usages and the triggers, nothing else (D-07)` e `returns no states when nothing is spent (D-07)` direttamente su `spellsSpent`; `never draws a spell that already has a state (D-07, D-31)`; `collects the catalogue refs of the active spell states only (D-07)`; `rejects an override that spends a spell whose state is not active (D-07)` (unit e int: T-19-77); `carries no spell usages catalogue in the combat catalog (D-07)` sui due ritorni di `readCombatCatalog`.
- In `ambush-plan.spec.ts` la prova «nessun'altra lista» è sulle chiavi del set filtrate per `spell` (`toEqual(['status.spellStates'])`); il piano della sconfitta ha già la lista esatta delle chiavi.

**6. [Numeri di riga del piano]** gli attesi indicati a `outcome-plan.spec.ts ≈ :1001` erano nel `describe` `spell learning on a won study` (≈ :1326); i due delle int-spec avevano già `active: false` (vedi evidenza RED).

Nessuna decisione architetturale (Regola 4).

## Problemi rimandati (fuori scope, non corretti)

- `quest-resolution.processor.int-spec.ts` instabile una volta su tre corse complete (vedi sopra).
- Restano dai piani precedenti: `CLAUDE.md` del repo BE con il nome vecchio dell'equipaggiamento nella sezione generata; `cities { pointsOfInterest { id } }` non popolato da `findAll`.

## Note per i piani successivi

- **19-20 (contrazione):** nessun codice di produzione fuori da `src/models/`, `characters.service.ts` (populate di `status.spells`, assegnazione di `character.assets.activeSpells`), `spell-state.mapper.ts` (`activeSpells` derivato) e `mixed-ref-paths.ts` nomina più le due liste. In `test/`: `buildCharacter` e `spellBook` (`test/fixtures/character.fixture.ts`, pinnati in `fixtures.spec.ts`) le scrivono ancora; `spellBook` ora è usato solo da `src/authz/audit/admin-audit.int-spec.ts` e dalle spec di `src/characters` rimaste (verificare con grep prima di toglierlo). Due casi nuovi leggono le liste vecchie con `?? []` proprio per restare verdi dopo la contrazione: `study-spell-draw.int-spec.ts` (`adds the learned spell as a state that is not active (D-07)`) e `ambush-resolution.int-spec.ts` (`spends the active spell states in a won ambush (D-07)`): dopo il 19-20 quelle due righe si possono togliere o lasciare.
- **19-20:** il commento del JSDoc di `test/fixtures/character.fixture.ts` cita ancora la semina a tre liste.
- **19-23 (runbook e handoff):** lo stato intermedio del 19-18 è chiuso: da questa HEAD una magia equipaggiata con `equipSpell` entra in combattimento. Resta valida l'avvertenza: build e boot solo dalla HEAD della fase, mai codice pre-19 sul database migrato. Comportamento da dichiarare alla FE: le magie in combattimento seguono l'ordine di apprendimento (D-16); una magia imparata arriva sempre non equipaggiata.
- **Gate:** una lettura dell'intero catalogo delle magie in meno per esito (`readSpellMaxUsages` tolto): nessun effetto sulle soglie; `src/characters/spells` a 99,12 / 89,1 / 99,33.
- **Conteggi:** unit 273 suite / 3457 test; integration 147 suite / 2026 test (pezzi 24/471, 29/420, 35/516, 59/619); boot reale 90 test; registro dei ref invariato (34).

## Stub noti

Nessuno.

## Threat flags

Nessuna superficie nuova fuori dal threat model. T-19-77 (solo voci attive in `spellsSpent`, contesto e override; int-spec del combattimento, dell'imboscata e del GM), T-19-78 (array scritto confrontato per intero con `active` e ordine; `spendFromState` per spread), T-19-79 (grep dei due path e dei cinque simboli morti a zero su `src` e `test`, tipi degli snapshot senza le liste), T-19-80 («già conosciuta» sulle voci, anche per il sorteggio), T-19-81 (file del motore senza diff) mitigati.

## Self-Check: PASSED

- `src/quests/outcomes/unrewarded-plan.spec.ts` esiste; i commit `acf0f5ae`, `e075c2e5`, `329d6fa1`, `796ab94b`, `a240a85c` sono in `git log`; `git status --short` vuoto prima di questo documento.
