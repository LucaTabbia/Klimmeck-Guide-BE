---
phase: 24-origini-delle-magie-quest-void-e-shamanic
plan: 02
subsystem: spells
tags: [spell-origin, min-level, schema, fixture, sdl]
requires: ["24-01"]
provides:
  - "enum TS SpellOrigin { void, arcane, shamanic } in src/models/enums/spell-origin.enum.ts (nessun registerEnumType)"
  - "Spell.origin: String! sul filo, stringa obbligatoria con validazione enum su Mongoose"
  - "Spell.minLevelToLearn: Int! sul filo, numero obbligatorio con min 1 su Mongoose"
  - "fixture buildSpell con origin 'arcane' e minLevelToLearn 1"
affects: [24-03, 24-04, 24-05, 24-07, 24-10, 24-12]
tech-stack:
  added: []
  patterns: ["origine come String! sul filo (come useType) con enum solo su Mongoose"]
key-files:
  created:
    - src/models/enums/spell-origin.enum.ts
    - src/models/enums/spell-origin.enum.spec.ts
    - src/spells/spell-fields.int-spec.ts
  modified:
    - src/models/spell.model.ts
    - test/fixtures/spell.fixture.ts
    - test/app.int-spec.ts
    - src/schema.gql
decisions:
  - "Nessun default Mongoose su origin e minLevelToLearn: required su entrambi, il non nullo dei documenti di oggi lo garantisce il migratore del piano 10"
  - "minXpToLearn resta su modello, SDL e fixture fino al piano 05"
metrics:
  completed: 2026-11-15
  tasks: 3
  commits: 8
---

# Phase 24 Plan 02: modello della magia, origine e livello minimo — Summary

Ogni magia porta ora `origin` (`void` / `arcane` / `shamanic`, `String!` sul filo, enum validato da Mongoose) e `minLevelToLearn` (`Int!`, obbligatorio, minimo 1), dichiarati in un solo punto e serviti ovunque una magia è servita; `minXpToLearn` è ancora lì; l'input morto `SpellInput` è uscito.

## Commit

| Task | Commit | Subject |
|------|--------|---------|
| 1 RED | 31ef1e4b | test(spells): pin the three spell origins |
| 1 GREEN | 38222c20 | feat(spells): add the spell origin enum |
| 2 | 5ba690f2 | style(spells): format spell.model.ts |
| 2 RED | 426ed01d | test(spells): expect the origin and the minimum level on a spell |
| 2 GREEN | 23362f22 | feat(spells): carry the origin and the minimum level on a spell |
| 2 REFACTOR | 14dc49a4 | refactor(spells): drop the dead spell input |
| 3 | (questo) | docs(phase-24): record plan 02 progress |

## Fallimenti RED attesi e osservati

- **Task 1** (`spell-origin.enum.spec.ts`): «Cannot find module './spell-origin.enum'» (suite non avviata). Come atteso.
- **Task 2** (integration, 7 rossi su 110): lettura lean senza `origin`/`minLevelToLearn` (schema strict li scarta); tre casi di rifiuto con «Received promise resolved instead of rejected» (nessun `ValidationError`); query `spells { id origin minLevelToLearn }` con `errors` definito (campo sconosciuto su `Spell`); fixture senza i due campi; boot reale con il blocco `type Spell` senza le due righe. Come atteso.

## Casi verdi al primo colpo

Nessuno.

## SDL

`git diff src/schema.gql` al GREEN del Task 2: solo due righe aggiunte in `type Spell`:

```
+  minLevelToLearn: Int!
+  origin: String!
```

Nessuna riga tolta (`git diff 5ba690f2 -- src/schema.gql` senza righe `-`); dopo il REFACTOR `git diff --exit-code src/schema.gql` pulito (`SpellInput` non è mai stato nello SDL).

## Verifiche

- `npx jest src/models/enums/spell-origin.enum.spec.ts --selectProjects unit`: 2/2.
- `npx jest src/spells/spell-fields.int-spec.ts test/app.int-spec.ts --selectProjects integration --runInBand`: 110/110 (6 casi nuovi + il pin del blocco `type Spell`).
- Controllo mirato del Task 3 sulla fixture nuova: `npx jest src/quests/outcomes/rewards src/quests/guided src/characters/spells --selectProjects unit` 20 suite, 261/261; `npx jest src/quests/outcomes/study-spell-draw.int-spec.ts src/quests/quests.resolver.int-spec.ts src/quests/guided/guided-mission.resolver.int-spec.ts src/lore/lore-related.int-spec.ts --selectProjects integration --runInBand` 4 suite, 119/119. Nessuna spec corretta (tutte scrivono le magie dalla fixture).
- `npx tsc --noEmit -p tsconfig.json`: 0 a fine di ogni task di codice; prettier ed eslint puliti sui file toccati; `grep -rn SpellInput src test` vuoto.

## Deviations from Plan

- **[Boy Scout, nel REFACTOR]** tolto anche l'import morto `Types` da `spell.model.ts` (warning `no-unused-vars` preesistente segnalato da eslint). `EnergyDamageInput` resta in `energy-damage.ts`: lo usa ancora `damages.model.ts`; è uscito solo l'import da `spell.model.ts`.
- La prova di `ValidationError` usa `rejects.toMatchObject({ name: 'ValidationError' })`.

Nessun'altra deviazione.

## Note per i piani seguenti

- Ogni scrittura via modello di una magia senza `origin` o `minLevelToLearn` ora fallisce: le spec devono passare da `buildSpell` / `persistSpell` (oggi lo fanno tutte quelle controllate).
- I documenti di oggi a DB non hanno i due campi: fino al migratore del piano 10 una lettura servita sul filo di una magia vecchia darebbe errore di non nullo; i lettori lean dei piani 03/04/07 devono restare fail-closed.
- `minXpToLearn` ancora in modello, SDL e fixture: lo toglie il piano 05.

## Self-Check: PASSED
