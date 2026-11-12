---
phase: 19-revisione-dei-modelli
plan: 18
subsystem: characters
tags: [spellStates, active, SpellStateMigrator, equipSpell, useSpell, recupero, D-07, D-16, D-21]
requires: [19-17]
provides:
  - "`SpellStateMigrator` ridotto al solo taglio (`SpellStateMigrationReport { trimmed }`), che conserva `active` sulla voce ricostruita"
  - "`equipSpell` / `unequipSpell` / `useSpell` e i crediti di recupero sulla sola voce di `status.spellStates`, con un solo filtro d'array (`s`)"
  - "`spellsOnTheWire(status)`: `assets.activeSpells` derivato dalle voci attive in ordine di apprendimento (fino alla contrazione del 19-20)"
  - "fixture `spellStatesOf(entries)` (sole voci con `active`); `spellBook` scrive `active` sulle voci"
affects: [19-19, 19-20, 19-23]
tech-stack:
  added: []
  patterns: [flag sulla voce scritto con filtro d'array + capacità come espressione sul documento vivo nello stesso update]
key-files:
  created: []
  modified:
    - src/characters/spells/spell-state.migration.ts
    - src/characters/spells/spell-state.migrator.ts
    - src/characters/spells/spell-state.snapshot.ts
    - src/characters/spells/active-spell.updates.ts
    - src/characters/spells/spell-state.updates.ts
    - src/characters/spells/spell-state.mapper.ts
    - src/characters/characters.service.ts
    - src/characters/creation/starting-character.ts
    - test/fixtures/character.fixture.ts
decisions:
  - "Una voce senza `active` (lettura lean o documento non ancora migrato) vale non equipaggiata ovunque: filtro di equip con «diverso da true», classificatori e filo con `=== true`"
  - "Il taglio non aggiunge il flag a una voce che non lo aveva: copia `active` solo se presente"
  - "`spellBook` scrive `active` sulle voci (come da piano): due attesi di `src/quests/outcomes` passano da `false` a `true` nello stesso commit GREEN"
  - "Le int-spec della cartella delle magie seminano con `spellStatesOf` (sole voci); gli insert grezzi non hanno più né `status.spells` né `assets.activeSpells`"
metrics:
  completed: 2026-11-11
  tasks: 3
  files: 28
---

# Phase 19 Plan 18: migratore permanente ridotto al taglio, mutation e recupero sulla sola voce — Summary

Il migratore permanente delle magie (Phase 9.1) non può più ricostruire né azzerare nulla: taglia soltanto gli istanti fuori dai limiti e conserva `active`. Nello stesso piano `equipSpell`, `unequipSpell`, `useSpell` e i crediti di recupero leggono e scrivono la sola voce di `status.spellStates`; sul filo la lista delle equipaggiate è derivata dalle voci attive, in ordine di apprendimento. Secondo di quattro piani di BE-MODEL-06 (D-07, D-16, D-21).

## Commit

| Task | Commit | Subject (caratteri) |
|------|--------|---------------------|
| 1 RED | `fccc9be1` | `test(characters): pin the spell state trim that keeps the active flag` (69) |
| 1 GREEN | `8ce3d073` | `refactor(characters): reduce the spell state migrator to the trim` (65) |
| 2 RED | `13196541` | `test(characters): pin the spell mutations on the single spell state list` (72) |
| 2 GREEN | `ca0a3d7e` | `feat(characters): equip, use and recover spells on the spell state` (66) |
| 3 | (questo e il successivo) | `docs(phase-19): summarize plan 18`, `docs(phase-19): record plan 18 progress` |

Ogni subject contato PRIMA del commit; nessun trailer (controllo a `0` dopo ognuno).

## Evidenza RED

**`fccc9be1` (Task 1):**
- Unit, 2 rossi: `keeps the active flag of a trimmed spell state (D-21)` (la voce ricostruita ha tre campi) e `starts a character with the single empty list of spell states (D-07)` (le due liste vecchie fra le chiavi).
- Integration, 3 rossi su 19 in `spell-state.migrator.int-spec.ts`: `trims the instants of an active spell state and keeps it active (D-21)` e `never rebuilds the spell states of a character without the old lists (D-21)` (la riparazione svuota le voci di un personaggio senza le liste vecchie: è il Pitfall 1 riprodotto), `reports only the trimmed characters (D-21)` (il report ha ancora tre conteggi).
- Verde al primo colpo, previsto dal piano: `keeps the active flag when spending usages (D-07)` (`spendFromState` copia la voce per spread).

**`13196541` (Task 2):**
- Unit, 35 rossi in 5 suite (`active-spell.updates.spec.ts`, `spell-state.updates.spec.ts`, `spell-state.mapper.spec.ts`, `characters.service.spec.ts`, `test/fixtures/fixtures.spec.ts`): forme vecchie dei filtri, lista delle equipaggiate ancora scritta, due filtri d'array, mapper a due argomenti, `spellBook` senza `active`. `tsc` rosso solo sulle spec (firme nuove di `equipSpellUpdate`, `unequipSpellUpdate`, `spellsOnTheWire`), come atteso a RED.
- Integration, 40 rossi in 7 suite (equip, use, recovery service/processor/sweeper, wire, subscription): con le sole voci seminate le mutation rispondono coi codici della forma vecchia e i crediti falliscono sul path delle equipaggiate che non esiste (Pitfall 2 visto dal lato opposto).
- Verde al primo colpo: `refuses to use a known spell that is not active (D-07)` (anche il codice vecchio rispondeva `SPELL_NOT_ACTIVE` senza la lista delle equipaggiate; il caso pinna che il documento resta identico e che nessun job parte).

## Cosa è cambiato

### Task 1 — migratore permanente (D-21)

- **`spell-state.migration.ts`** (297 → 145 righe): tolti `spellStatesConsistentExpr`, `spellStatesRepairPipeline`, `unmigratedFilter`, `inconsistentFilter` e gli helper privati `arr`, `KNOWN`, `stateOf`; restano `SpellCatalogEntry`, `outOfRangeFilter`, `spellStatesTrimPipeline`, `isSpellStateOutOfRange`. La voce ricostruita dal taglio ha il quarto campo `active: '$$state.active'` (una voce senza flag resta senza flag: un campo mancante non viene scritto).
- **`spell-state.migrator.ts`**: `SpellStateMigrationReport { trimmed }`; `migrateAll()` = solo taglio; `migrateOne(id)` = solo taglio sul personaggio → `boolean`; via `reportRun` e i tre log della riparazione; il messaggio d'errore del boot hook parla del solo taglio. Classe e nome invariati; `spell-recovery.service.ts` chiama ancora `migrateOne` prima di ogni credito.
- **`spell-state.snapshot.ts`**: solo `active?: boolean` su `SpellStateEntry`. `learnedSpellState`, `mirrorFromStates`, `spellStatesOrMigrated`, `NO_SPELL_MAX_USAGES` invariati (piano 19-19).
- **`starting-character.ts`**: via le due liste vecchie da tipo e valore.
- **Spec:** dalla unit tolti i casi della riparazione e della coerenza (6), tenuto il caso del catalogo come letterale (ora sulla pipeline del taglio); l'int-spec del migratore riscritta sulla forma nuova (18 casi più la tabella dei 14 stati): helper `rawCharacter(spellStates, deletedAt?)` senza le liste vecchie e `oldShapeCharacter` per i documenti pre-revisione.

### Task 2 — mutation, crediti, filo (D-07, D-16)

- **`active-spell.updates.ts`:** `equipSpellFilter` = una voce di quella magia non attiva + numero di voci attive sotto `maxActiveSpellsExpression()` valutata sul documento vivo; `equipSpellUpdate()` / `unequipSpellUpdate()` impostano il solo flag della voce `s`; `unequipSpellFilter` = voce attiva; proiezione e snapshot con le sole voci; classificatori: conosciuta = esiste la voce, attiva = `active === true`, slot pieni = voci attive ≥ `maxActiveSpellsFor`. Codici e precedenza identici.
- **`spell-state.updates.ts`:** `spellStateArrayFilters` con il solo filtro `s`; `useSpellFilter` = una voce attiva con almeno un uso; spesa e due crediti solo sulla voce.
- **`spell-state.mapper.ts`:** `spellsOnTheWire(status)`: voci con la magia popolata; equipaggiate = voci attive come `{ spell, usages }` nell'ordine della lista. Non legge più né la lista delle conosciute né quella delle equipaggiate.
- **`characters.service.ts`:** `equipSpell` conserva la lettura di `maxUsages` come controllo di esistenza (stesso `NOT_FOUND`); equip e unequip passano `spellStateArrayFilters`; `findOne` usa il mapper a un argomento (il populate di `status.spells` resta fino al 19-20).
- **Fixture:** `spellStatesOf(entries)` nuovo; `spellBook` lo usa per le voci (quindi `active` vero per le equipaggiate) e tiene le due liste vecchie fino al 19-20.

## Esito delle prove

- `npx jest --selectProjects unit` → **272 suite, 3445 test** verdi prima di ogni commit GREEN (3447 dopo il piano 17: nel Task 1 +3 casi nuovi e −6 della riparazione → 3444; nel Task 2 il saldo delle spec riscritte → 3445).
- Progetto integration intero, a pezzi, in primo piano, un jest alla volta — **147 suite, 2021 test, tutti verdi** (2022 dopo il piano 17):
  - `src/characters test/app.int-spec.ts` → 24 suite, 471 test (78 s); boot reale 90 test; `git diff --exit-code src/schema.gql` a 0.
  - `src/travel src/shops src/economy src/cities src/lore src/models test/shops test/fixtures` → 29 suite, 419 test (104 s).
  - `src/quests` → 35 suite, 512 test (161 s), eseguito prima di ENTRAMBI i commit GREEN (lezione del 19-17).
  - resto (`src/migrations`, `src/authz` compresi) → 59 suite, 619 test (118 s).
- Spot-check del piano: `npx jest src/quests/outcomes src/travel/ambush --selectProjects unit` → 47 suite, 704 test; `quest-combat.int-spec.ts` e `ambush-resolution.int-spec.ts` verdi dentro i pezzi.
- `npx tsc --noEmit -p tsconfig.json` → 0 dopo ogni commit GREEN. Prettier ed eslint sui file toccati, uno per uno: puliti. `pgrep -fl 'bin/jest'` vuoto a fine di ogni task. Nessun comando spostato in background.
- **Coverage di `src/characters/spells`:** 99,16 / 89,47 / 99,36 (statements / branches / lines; soglia 97 / 88 / 97). Vedi deviazione 3 per il comando. `package.json` senza diff.

## Criteri di accettazione

| Criterio | Esito |
|----------|-------|
| grep dei quattro simboli della riparazione in `src test` fuori da `model-review` | nessuna riga |
| `status.spells` / `activeSpells` in `spell-state.migration.ts` | 0 / 0 |
| `active: '$$state.active'` in `spell-state.migration.ts` | 1 (con `grep -cF`, vedi deviazione 4) |
| `class SpellStateMigrator`; `D-21)` nell'int-spec del migratore | 1; 3 |
| `activeSpells` in `active-spell.updates.ts` / `spell-state.updates.ts`; `status.spells'` | 0 / 0; 0 |
| `'a.spell'` in `spell-state.updates.ts` | 0 |
| `maxActiveSpellsExpression()` in `active-spell.updates.ts` | 1 |
| `SPELL_NOT_KNOWN` o `spellNotKnown` in `active-spell.updates.ts`; diff di `src/gameRules` | 1; nessuno |
| `D-16)` nella spec del mapper; `D-07)` in `equip-spell.int-spec.ts` | 1; 4 |

## Deviazioni dal piano

**1. [Regola 1] due attesi di `src/quests/outcomes` aggiornati nel commit GREEN del Task 2 (`ca0a3d7e`)**
- **Problema:** il piano chiede che `spellBook` scriva `active` sulle voci E che le spec di `src/quests` non cambino. Le due cose non stanno insieme: `quest-combat.int-spec.ts` (`spends the spell usages and schedules their recovery`) e `gm-completion.service.int-spec.ts` (`schedules a recovery for every spell use the game master reports`) seminano con `spellBook([{ …, active: true }])` e confrontano con `toEqual` la voce riletta, che gli esiti riscrivono per spread.
- **Fix:** `active: false` → `active: true` nelle due voci attese (è il valore vero: la magia era equipaggiata). Nessun codice di produzione di `src/quests`. Stesso commit del cambio della fixture: nessun commit lascia rosse int-spec fuori dai file dichiarati. Gli altri due attesi del 19-17 (`quest-resolution`, `study-spell-draw`) restano `false`: sono magie imparate o non equipaggiate.

**2. [Regola 1] due casi di `spell-recovery.service.int-spec.ts` tolti già nel Task 1 (`8ce3d073`)**
- `credits a character whose slots array was never written` e `migrates a character without spell states before the credit` provavano la riparazione prima del credito: col migratore ridotto al taglio diventavano rossi. Tolti col codice che provavano (il file è del Task 2 nel piano). Il Task 2 aggiunge al loro posto `credits a recovered usage on the spell state of a character without the old lists (D-07, D-21)`.

**3. [Regola 3] comando della coverage esteso al boot reale**
- Il comando del piano (solo `src/characters/spells`) dà 94,72 / 89,47 / 94,95: mancano `spell-recovery.module.ts` (0 %, 16 istruzioni) e `sleeper.ts`, file NON toccati da questo piano che nella suite completa sono coperti dal boot reale. Con `test/app.int-spec.ts` aggiunto ai percorsi dello stesso comando: 99,16 / 89,47 / 99,36. Nessun caso aggiunto solo per la soglia, nessuna soglia toccata. Il gate vero resta `test:cov` dell'orchestratore.

**4. [Regola dei grep] `grep -c` con `$$` stampa 0 su macOS**
- Il criterio `grep -c "active: '\$\$state.active'"` stampa `0` con il grep BSD (il `$` è letto come àncora); con `grep -cF` stampa `1`. Nessuna riformattazione.

**5. [Regola 2] casi in più rispetto al `<behavior>`**
- Migratore: `leaves a character still carrying the old lists as stored, in whatever state` (un documento pre-revisione, anche mai migrato o incoerente, non viene più toccato), `trims a state stored without the flag and adds no flag to it`, `leaves an archived character alone` anche su `migrateAll`.
- Classificatori e filo: voce senza flag = non attiva (`reads a spell state stored without the flag as not active`, `equips a spell whose state was stored without the flag`, `serves a spell state stored without the flag as not active`), precedenza dei codici pinnata caso per caso.
- Filo: `serves the active spells in the learning order, whatever the old equipped list says (D-16)` (una lista vecchia rimasta sul documento non conta più).

**6. Casi tolti perché la regola non esiste più (annotati, non sostituiti)**
- `equip-spell.int-spec.ts`: `falls back to the catalog maxUsages when the spell has no state entry` (senza voce la magia non è conosciuta) e i due casi D-17d sul ref a stringa nelle liste vecchie; `removes an active spell stored with a legacy string id…` dell'unequip; `use-spell.int-spec.ts`: il caso D-17d sul mirror a stringa. Il ref della voce è castato dallo schema: nessuna forma a stringa da coprire. `test/migrations/migrate-legacy-refs` resta usato dalle altre suite.
- `spell-state.wire.int-spec.ts`: il documento non seleziona più `status { spells }` (resta nello SDL fino al 19-20) e seleziona `active`.

**7. [Fixture] `spellStatesOf` aggiunto nel commit RED del Task 2**
- Helper di test additivo usato dalle int-spec riscritte; il cambio di `spellBook` (che muove gli attesi di `src/quests`) è nel GREEN come da piano.

Nessuna decisione architetturale (Regola 4).

## Stato intermedio dichiarato (fino al 19-19)

- `equipSpell` scrive `active` sulla voce; gli esiti (`outcome-plan`, `unrewarded-plan`, `ambush-plan`, `combat-context`, `gm-overrides`) leggono ancora la lista delle equipaggiate e la riscrivono insieme a quella delle conosciute. Una magia equipaggiata con la mutation di questo commit non entrerebbe in combattimento: innocuo perché il branch non si costruisce né si avvia a metà fase (**build e boot solo dalla HEAD della fase**).
- `learnedSpellState` è ancora a tre campi: la voce imparata prende `active: false` dal default dello schema.
- Il modello dichiara ancora `status.spells` e `assets.activeSpells` (default lista vuota): un personaggio creato via Mongoose li ha ancora a DB, vuoti, fino alla contrazione del 19-20.

## Problemi rimandati (fuori scope, non corretti)

- Restano dai piani precedenti: `CLAUDE.md` del repo BE con il nome vecchio dell'equipaggiamento nella sezione generata; `cities { pointsOfInterest { id } }` non popolato da `findAll`.

## Note per i piani successivi

- **19-19 (esiti):** `spellBook` scrive già `active` sulle voci: gli attesi con `toEqual` sulle voci rilette valgono `true` per le magie seminate come equipaggiate (già così in `quest-combat` e `gm-completion`). Per seminare le sole voci c'è `spellStatesOf(entries)`. `SpellStateEntry` ha già `active?: boolean`; una voce senza flag va letta come non attiva (`=== true`). `mirrorFromStates` e `spellStatesOrMigrated` non hanno più usi in `src/characters`.
- **19-19 / 19-20:** `ActiveSpellSnapshot` non ha più `assets`; `ACTIVE_SPELL_SNAPSHOT_PROJECTION` ha tre path. `spellsOnTheWire` ritorna ancora `activeSpells` (derivato): è il solo produttore della lista sul filo, da togliere con lo SDL.
- **19-20 (contrazione):** restano da togliere il populate di `status.spells` in `CharactersService.findOne`, l'assegnazione di `character.assets.activeSpells`, le due liste vecchie in `buildCharacter` e `spellBook` (`test/fixtures/character.fixture.ts`, pinnate in `fixtures.spec.ts`), l'import di `ActiveSpell` nel mapper. I documenti sul filo di `spell-state.wire.int-spec.ts`, `equip-spell.int-spec.ts` (`CHARACTER_SPELLS`) e `character-updated.subscription.int-spec.ts` selezionano ancora `assets { activeSpells }`.
- **19-23 (runbook):** dopo questo piano il boot non scrive più le righe «Stati delle magie: migrati…» / «riparati…»: l'unico log del migratore permanente è l'avviso per voce fuori dai limiti. L'avvertenza del 19-17 resta: mai codice pre-19 (né un commit 19-17) sul database migrato.
- **Conteggi:** unit 272 suite / 3445 test; integration 147 suite / 2021 test (pezzi 24/471, 29/419, 35/512, 59/619); boot reale 90 test; registro dei ref invariato (34).

## Stub noti

Nessuno.

## Threat flags

Nessuna superficie nuova fuori dal threat model. T-19-71 (riparazione tolta, grep di assenza, caso «never rebuilds…» su `migrateAll` e `migrateOne`), T-19-72 (capacità sul documento vivo, due casi di concorrenza verdi), T-19-73 (filtro con voce attiva e usi ≥ 1, classificatori coi codici invariati), T-19-74 (update e filtro d'array nello stesso commit, int-spec di uso e crediti verdi), T-19-75 (quarto campo nella voce ricostruita, caso sul replica set), T-19-76 (misura per cartella, `package.json` senza diff) mitigati.

## Self-Check: PASSED

- I file modificati esistono; i commit `fccc9be1`, `8ce3d073`, `13196541`, `ca0a3d7e` sono in `git log`; `git status --short` vuoto prima di questo documento.
