---
phase: 19-revisione-dei-modelli
plan: 20
subsystem: models
tags: [spellStates, contrazione, SDL, registro dei ref, populate, D-07, D-16, D-22, D-24]
requires: [19-19]
provides:
  - "`CharacterStatus` e `CharacterAssets` senza le due liste vecchie su modello, input e SDL; `type ActiveSpell` e `src/models/common/active-spell.model.ts` non esistono più"
  - "`spellStatesOnTheWire(states)`: le sole voci con la magia popolata, nell'ordine di apprendimento"
  - "`CharactersService.findOne` popola solo `status.spellStates.spell`"
  - "registro dei ref a 32 path in 11 collection"
  - "fixture `buildCharacter` senza le due liste; `spellBook(entries)` ritorna solo `{ spellStates }`"
affects: [19-21, 19-22, 19-23]
tech-stack:
  added: []
  patterns: [prova d'assenza con la lista esatta delle chiavi (schema, documento grezzo, SDL)]
key-files:
  created: []
  modified:
    - src/models/character/character-status.model.ts
    - src/models/character/character-assets.model.ts
    - src/characters/characters.service.ts
    - src/characters/spells/spell-state.mapper.ts
    - src/migrations/mixed-refs/mixed-ref-paths.ts
    - src/schema.gql
    - test/fixtures/character.fixture.ts
    - test/app.int-spec.ts
  deleted:
    - src/models/common/active-spell.model.ts
decisions:
  - "Le due spec del registro dei ref usavano il path della lista dei conosciuti come ESEMPIO letterale: passate a `quests.completedQuests` (path che resta), anche nella semina della spec del CLI compilato"
  - "I casi dell'int-spec del migratore permanente sui documenti pre-revisione non seminano più le due liste vecchie: restano le voci senza flag o assenti (il nome delle liste vive solo sotto `src/migrations/model-review/`)"
  - "Helper di spec `activeSpellsOf` di `equip-spell.int-spec.ts` rinominato `equippedSpellsOf`: il grep non ancorato del gate stampa così solo il vocabolario del motore"
metrics:
  duration: 23 min
  completed: 2026-11-11
  tasks: 3
  files: 31
---

# Phase 19 Plan 20: contrazione delle liste di magie su modello, populate, registro e SDL — Summary

Il personaggio ha una sola lista di magie: `status.spellStates [{ spell, usages, recoveries, active }]`. La lista dei conosciuti e la lista delle equipaggiate sono tolte da modello, input, populate, mapper, registro dei ref (34 → 32) e SDL; `type ActiveSpell` è sparito e il suo file è cancellato. Quarto e ultimo piano di BE-MODEL-06 (D-07, D-16, D-24): da qui esce lo SDL finale delle magie per la FE Phase 19.

## Commit

| Task | Commit | Subject (caratteri) |
|------|--------|---------------------|
| 1 | `ce786733` | `test(characters): seed and read the spells from the spell states only` (69) |
| 2 RED | `3df5a166` | `test(models): pin the contracted spell lists of the character` (61) |
| 2 GREEN | `eeb6b740` | `refactor(models): keep the spell states as the only spell list` (62) |
| 2 (spec) | `c51dd193` | `test(characters): name the equipped spells helper after the states` (66) |
| 2 (spec) | `a689d83c` | `test(characters): tag the wire mapper purity case with its decision` (67) |
| 3 | (questo e il successivo) | `docs(phase-19): summarize plan 20`, `docs(phase-19): record plan 20 progress` |

Ogni subject contato PRIMA del commit; nessun trailer (controllo a `0` dopo ognuno).

## Eccezione TDD del Task 1

Il Task 1 è un refactor di soli test col modello ancora largo: nessun RED possibile né voluto (le semine e i documenti sul filo passano alla forma finale mentre il codice serve ancora entrambe le forme). Verde prima e dopo: unit 273 suite / 3458 test; integration `src/characters src/migrations src/authz src/economy` più le due spec degli esiti toccate → 43 suite / 621 test. `git diff HEAD~1 --stat -- src ':!*spec.ts'` a 0 righe (nessun file di produzione).

## Evidenza RED (Task 2, `3df5a166`)

- **Unit, 7 rossi in 4 suite:** `character-status.schema.spec.ts` › `keeps the spell states as the only spell list of the character (D-07)` (lo schema ha ancora i due path); `mixed-ref-paths.spec.ts` › `counts 32 references in 11 collections (D-17d)` (34); `characters.service.spec.ts` › `populates the spell of every spell state and no other spell list (D-07)` (populate della lista dei conosciuti e lista derivata assegnata agli asset); `spell-state.mapper.spec.ts` i 4 casi (la funzione nuova non esiste). `tsc` rosso solo sulla spec del mapper, come atteso a RED.
- **Integration, 6 rossi in 3 suite:** `test/app.int-spec.ts` (4: `writes the single spell state list and drops the two old spell lists (D-07)`, più i tre casi che confrontano i blocchi `CharacterStatus` e `CharacterAssets`); `character-creation.resolver.int-spec.ts` › `creates the character with the backend-owned starting state` (il documento appena creato ha ancora la lista delle equipaggiate fra le chiavi degli asset); `shop-transaction.service.int-spec.ts` › `leaves the pet fields out of a trade without pet lines (Pitfall 5)` (stessa chiave nella lista esatta).
- Nessun caso verde al primo colpo.

## Cosa è cambiato

### Task 1 — fixture, semine, documenti sul filo (`ce786733`)

- **`test/fixtures/character.fixture.ts`:** `buildCharacter` senza le due liste; `spellBook(entries)` ritorna solo `{ spellStates }` (via `spellStatesOf`); JSDoc riscritto. `fixtures.spec.ts` pinna la forma (`Object.keys(spellBook([...])).sort()` = `['spellStates']`, chiavi esatte di `status` e `assets` di `buildCharacter`).
- **Semine con le sole voci:** `admin-audit.int-spec.ts`, `characters-ownership.int-spec.ts`, `archived-character-visibility.int-spec.ts`.
- **Documenti sul filo nella forma finale** (`status { spellStates { active spell { … } usages recoveries } }`): `spell-state.wire.int-spec.ts` (helper `equippedOf(character)` = voci attive come `{ usages, spell { id } }`: stesso significato delle asserzioni vecchie), `equip-spell.int-spec.ts` (`usages` sulla voce), `character-updated.subscription.int-spec.ts`.
- **Insert grezzi:** via i `delete` delle due chiavi (ormai senza effetto) da `spell-recovery.service/sweeper/processor.int-spec.ts` e `spell-state.migrator.int-spec.ts`; via le letture `?? []` delle liste vecchie da `study-spell-draw.int-spec.ts` e `ambush-resolution.int-spec.ts` (nota del 19-19).
- **Spec del registro dei ref:** entrambe usavano il path vecchio come ESEMPIO letterale (non derivato da `MIXED_REF_PATHS`): `mixed-ref-pipelines.spec.ts` e `mixed-refs.verifier.int-spec.ts` passano a `quests.completedQuests`; stessa semina in `run-mixed-refs.cli.int-spec.ts` (gira contro `dist/`: col path nuovo è verde sia col `dist/` di oggi sia con quello ricostruito dopo la contrazione). `mixed-refs.migration.int-spec.ts` deriva i casi dal registro: non toccata.
- Le spec che costruiscono un `CombatParticipant` o un `OverrideParticipant` non sono cambiate.

### Task 2 — contrazione (`eeb6b740`, un solo commit di produzione)

- **`character-status.model.ts`:** via il campo della lista dei conosciuti, la riga dell'input e l'import di `Spell`; commento della lista unica aggiornato (D-07, D-16).
- **`character-assets.model.ts`:** via campo, riga dell'input e import; **`active-spell.model.ts` cancellato** (`git rm`).
- **`spell-state.mapper.ts`:** `export function spellStatesOnTheWire(states: readonly SpellState[] | null | undefined): SpellState[]`; via la funzione di transizione e il suo tipo.
- **`characters.service.ts` (`findOne`):** via il populate della lista dei conosciuti e l'assegnazione della lista derivata; `character.status.spellStates = spellStatesOnTheWire(character.status.spellStates)`. Modello e populate nello stesso commit (Pitfall 7: nessun `StrictPopulateError`).
- **`mixed-ref-paths.ts`:** via le due righe → 32 path in 11 collection (Pitfall 12).
- **`src/schema.gql`** rigenerato dal boot reale: 7 righe in meno, nessuna in più.

### SDL finale (ordine reale dei blocchi)

Nel file i tipi sono in ordine alfabetico: `ActiveTravel` (il blocco `ActiveSpell` che lo precedeva è sparito) … `CharacterAssets` … `CharacterStatus` … `SpellState`.

```graphql
type CharacterAssets {
  ownedEquipments: [AssetQuantity!]!
  ownedItems: [AssetQuantity!]!
  ownedPets: [OwnedPet!]!
  pet: Pet
  wornEquipment: Equipment!
}

type CharacterStatus {
  activeTravel: ActiveTravel
  awaitingAid: AwaitingAid
  coins: Coins!
  currentLifePoints: Int!
  imprisonedUntil: DateTime
  injuries: [InjuryType!]!
  level: Int!
  location: PointOfInterest!
  maxActiveSpells: Int!
  maxLifePoints: Int!
  potionRecoveryUntil: DateTime
  spellStates: [SpellState!]!
  title: String!
  unlockedLore: [ID!]!
  xp: Int!
}

type SpellState {
  active: Boolean!
  recoveries: [DateTime!]!
  spell: Spell!
  usages: Int!
}
```

Assumption A1 confermata: i tre blocchi coincidono con quelli attesi dal piano. Gli input `CharacterStatusInput` e `CharacterAssetsInput` non sono nello SDL (nessuna riga di input nel diff).

## Residui del nome del motore (D-22) — elenco per il gate 19-23

Dopo questo piano `grep -rn "activeSpells" src test --include='*.ts' | grep -v "^src/migrations/model-review/"` stampa SOLO queste righe (35), tutte vocabolario del motore (`CombatParticipant.activeSpells`, `OverrideParticipant.activeSpells`, l'helper privato `activeSpellsOf` del contesto) o spec che costruiscono/leggono quei tipi:

| File | Righe |
|------|-------|
| `src/quests/outcomes/combat/combat-resolver.ts` | 52 (`CombatParticipant.activeSpells`) |
| `src/quests/outcomes/combat/combat-context.ts` | 135, 164, 215 |
| `src/quests/outcomes/combat/combat-context.spec.ts` | 238, 306, 387, 436, 449, 456, 464, 474 |
| `src/quests/outcomes/combat/placeholder-combat-resolver.ts` | 47, 162 |
| `src/quests/outcomes/combat/placeholder-combat-resolver.spec.ts` | 54, 253, 267 |
| `src/quests/outcomes/dungeon/placeholder-dungeon-resolver.ts` | 76 |
| `src/quests/outcomes/dungeon/placeholder-dungeon-resolver.spec.ts` | 79, 153, 164 |
| `src/quests/outcomes/dungeon/dungeon-context.spec.ts` | 41 |
| `src/quests/outcomes/gm-overrides.ts` | 24, 53, 57, 64, 125 (`OverrideParticipant.activeSpells`) |
| `src/quests/outcomes/gm-overrides.spec.ts` | 33, 40, 193, 299, 333, 346, 361, 385 |

Esclusione precisa per il gate: `grep -v "^src/migrations/model-review/" | grep -v "^src/quests/outcomes/combat/" | grep -v "^src/quests/outcomes/dungeon/" | grep -v "^src/quests/outcomes/gm-overrides"` → nessuna riga.

## Esito delle prove

- `npx jest --selectProjects unit` → **273 suite, 3457 test** verdi prima del commit GREEN (3458 dopo il Task 1; 3459 a RED; −2 perché `it.each` sulle etichette del registro ha due path in meno).
- Progetto integration intero dalla HEAD di codice, a pezzi, in primo piano, un jest alla volta, nessun comando spostato in background — **147 suite, 2026 test, tutti verdi** (come dopo il piano 19):
  - `src/characters test/app.int-spec.ts` → 24 suite, 471 test (77 s); boot reale 90 test; `git diff --exit-code src/schema.gql` a 0.
  - `src/travel src/shops src/economy src/cities src/lore src/models test/shops test/fixtures` → 29 suite, 420 test (103 s).
  - `src/quests` → 35 suite, 516 test (158 s); `quest-resolution.processor.int-spec.ts` («real Redis») verde in questa corsa.
  - resto → 59 suite, 619 test (113 s).
- **Rete finale dopo la contrazione:** nessuna semina dimenticata (i due blocchi `src/quests` e «mondo» verdi al primo colpo).
- `npx tsc --noEmit -p tsconfig.json` → 0 dopo il Task 1 e dopo il GREEN. Prettier ed eslint sui file toccati, uno per uno: puliti (resta il solo warning pre-esistente `no-base-to-string` di `test/app.int-spec.ts`). `pgrep -fl 'bin/jest'` vuoto a fine di ogni task.

## Criteri di accettazione

| Criterio | Esito |
|----------|-------|
| `activeSpells` o `\bspells:` in `character.fixture.ts` | 0 |
| `activeSpells` in `spell-state.wire.int-spec.ts` / `character-updated.subscription.int-spec.ts` | 0 / 0 |
| `spellStates { active` in `spell-state.wire.int-spec.ts` | 1 |
| file di produzione toccati dal Task 1 | 0 |
| `type ActiveSpell` nello SDL; `  spells:` in `CharacterStatus`; `activeSpells` in `CharacterAssets` | 0 / 0 / 0 |
| grep dei due path vecchi, dell'input e del file cancellato in `src test` fuori da `model-review` | nessuna riga |
| grep `-w` della lista delle equipaggiate fuori da `model-review`, `combat/`, `dungeon/`, `gm-overrides` | nessuna riga |
| `toHaveLength(32)` in `mixed-ref-paths.spec.ts` | 1 |
| `status.spells` / `spellStatesOnTheWire(` in `characters.service.ts` | 0 / 1 |
| `D-07)` in `spell-state.mapper.spec.ts` | 3 (vedi deviazione 5) |
| `src/models/common/active-spell.model.ts` | cancellato |

## Deviazioni dal piano

**1. [Regola 3] due asserzioni sulla forma del documento spostate nel RED del Task 2**
- `shop-transaction.service.int-spec.ts` (lista esatta delle chiavi degli asset dopo uno scambio) dipende dal default del modello: non può essere verde prima E dopo la contrazione. Aggiornata nel RED (rossa davvero) invece che nel Task 1. Stessa cosa per il caso nuovo di `character-creation.resolver.int-spec.ts` (chiavi esatte degli asset e path `spell*` dello stato del documento appena creato).

**2. [Regola 1] casi pre-revisione dell'int-spec del migratore permanente senza le liste vecchie**
- `leaves a character still carrying the old lists as stored, in whatever state` è diventato `leaves a character written before the review as stored, in whatever state` (voci assenti, voci senza flag, voce di una magia fuori catalogo); `trims a state stored without the flag and adds no flag to it` non rilegge più le due liste. Il helper `oldShapeCharacter` è diventato `preReviewCharacter(spellStates?)`. Motivo: il nome delle due liste deve vivere solo sotto `src/migrations/model-review/` (gate); non ho importato `legacy-fixtures.ts` perché quel modulo viene rimosso dopo il boot reale. Copertura persa: «le due liste vecchie restano come scritte» sul migratore permanente (che scrive solo `status.spellStates`); il passo D-07 del migratore una tantum resta coperto dalle sue spec.

**3. [Regola 1] `spell-state.wire.int-spec.ts`: il caso D-16 non scrive più una lista vecchia grezza**
- `serves the active spells in the learning order, whatever the old equipped list says (D-16)` → `serves the active spell states in the learning order (D-16)`: con lo strict del modello contratto una lista vecchia sul documento non è nemmeno letta.

**4. [Regola 2] casi in più rispetto al `<behavior>`**
- `characters.service.spec.ts` › `populates the spell of every spell state and no other spell list (D-07)` (path di populate `status.spell*` esatti e chiavi degli asset serviti: T-19-82); il caso del documento appena creato (deviazione 1); `fixtures.spec.ts` › `carries the spell states as the only spell list (D-07)`; mapper › `returns a new list and leaves its input untouched (D-07)`.

**5. [Regola dei grep] `D-07)` nella spec del mapper**
- Coi tre titoli del `<behavior>` il grep stampa 2 (il primo titolo chiude con `D-16)`). Il criterio chiede 3: il quarto caso (purezza) porta il tag `(D-07)` (`a689d83c`).

**6. [Boy Scout] helper di spec rinominato (`c51dd193`)**
- `activeSpellsOf` → `equippedSpellsOf` in `equip-spell.int-spec.ts` (legge le voci attive, non il motore): il grep non ancorato del gate lo avrebbe stampato fuori dalle cartelle del motore. `spellsOnTheWireOf` → `spellStatesOnTheWireOf` nello stesso file (Task 1).

**7. `test/app.int-spec.ts`: costante nuova `CHARACTER_STATUS_BLOCK`**
- Il blocco esatto di `CharacterStatus` è ora una costante accanto a `CHARACTER_ASSETS_BLOCK`, usata dal caso del viaggio e dal caso D-07. Nessuna asserzione nomina l'input del tipo cancellato.

Nessuna decisione architetturale (Regola 4).

## Problemi rimandati (fuori scope, non corretti)

- `quest-resolution.processor.int-spec.ts` instabile (19-19): verde in questa corsa.
- `run-mixed-refs.cli.int-spec.ts` gira contro `dist/` (non ricostruito in questa fase): verde col `dist/` di oggi; dopo la build dell'orchestratore il CLI compilato avrà 32 path e la semina (che usa path rimasti) resta valida.
- Restano dai piani precedenti: `CLAUDE.md` del repo BE con i nomi vecchi nella sezione generata (anche `activeSpells` fra gli esempi di naming); `cities { pointsOfInterest { id } }` non popolato da `findAll`.

## Note per i piani successivi

- **19-22 (`pets:enemy`):** il registro dei ref è a **32**; il prossimo conteggio pinnato è 33.
- **19-23 (gate):** l'elenco dei residui del motore è nella tabella sopra, con la catena di `grep -v` esatta. Il grep dei due path, dell'input e del file cancellato è a zero su `src` e `test` fuori da `src/migrations/model-review/`. `legacy-fixtures.ts` scrive ancora la forma pre-19 di proposito.
- **19-23 (handoff FE):** SDL verbatim dei tre blocchi qui sopra. Per la FE: `CharacterStatus.spells` e `CharacterAssets.activeSpells` non esistono più (una query che li seleziona fallisce la validazione); le equipaggiate sono le voci con `active: true`, nell'ordine di `spellStates` (D-16), con gli usi della voce; una voce di una magia cancellata dal catalogo non arriva sul filo.
- **19-23 (runbook):** da questa HEAD lo strict di Mongoose ignora le due liste vecchie ancora presenti a DB finché il passo D-07 non le toglie: nessun errore di populate (T-19-82), ma un documento non migrato con voci senza flag risulta senza magie equipaggiate. Il passo D-07 al boot reale resta obbligatorio prima di ogni uso (T-19-86, trasferita al runbook); mai codice pre-19 sul database migrato.
- **Fixture:** `spellBook(entries)` è ormai un involucro di `spellStatesOf`; i tre utenti rimasti (`admin-audit`, `characters-ownership`, `archived-character-visibility`) leggono `book.spellStates`.
- **Conteggi:** unit 273 suite / 3457 test; integration 147 suite / 2026 test (pezzi 24/471, 29/420, 35/516, 59/619); boot reale 90 test; registro dei ref 32.

## Stub noti

Nessuno.

## Threat flags

Nessuna superficie nuova fuori dal threat model. T-19-82 (modello e populate nello stesso commit; caso unit sui path di populate; int-spec dei personaggi e boot reale verdi), T-19-83 (`spellStatesOnTheWire` dopo il populate; caso unit dedicato e caso sul filo con magie cancellate dal catalogo), T-19-84 (tre blocchi esatti e assenza di `ActiveSpell` nel boot reale; `git diff --exit-code src/schema.gql` a 0), T-19-85 (grep dei path vecchi a zero; rete finale di `src/quests` e del blocco mondo verde; elenco dei residui del motore) mitigati. T-19-86 trasferita al runbook del 19-23.

## Self-Check: PASSED

- `src/models/common/active-spell.model.ts` non esiste; i commit `ce786733`, `3df5a166`, `eeb6b740`, `c51dd193`, `a689d83c` sono in `git log`; `git status --short` vuoto prima di questo documento.
