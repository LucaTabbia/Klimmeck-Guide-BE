---
phase: 08-travel-lifecycle-travel-01
plan: 01
subsystem: models
tags: [graphql, mongoose, schema, travel, quests]
requires: []
provides:
  - "ActiveTravel / TravelPath ObjectType + schemi, TravelKind interno"
  - "CharacterStatus.activeTravel nullable (default null)"
  - "PendingQuest.startDate nullable, Pet.speedModifier nullable"
  - "QuestRequirements.requiredAdventurers a slot per rango (QuestPartySlot con title nullable)"
  - "Quest.registeredAdventurers a oggetti QuestRegistration { character: ID!, title: String! }"
affects: [08-02, 08-03, 08-04, 08-05, 08-06, 08-07, 08-08, 08-09, 08-10, 08-11, 08-12, 08-13, 08-14]
tech-stack:
  added: []
  patterns:
    - "sotto-documento nullable: @Prop({ type: XSchema, default: null }) → path Embedded, legacy idratato a null"
    - "campo persistito ma non esposto: @Prop senza @Field (TravelKind.kind)"
key-files:
  created:
    - src/models/character/active-travel.model.ts
    - src/models/character/active-travel.schema.spec.ts
  modified:
    - src/models/character/character-status.model.ts
    - src/models/pending-quest.model.ts
    - src/models/pet.model.ts
    - src/models/quest/quest-party-slot.model.ts
    - src/models/quest/quest-registration.model.ts
    - src/models/quest/quest-requirements.model.ts
    - src/models/quest/quest.model.ts
    - src/models/quest-lanes.schema.spec.ts
    - test/fixtures/quest.fixture.ts
    - test/app.int-spec.ts
    - src/schema.gql
    - .planning/ROADMAP.md
key-decisions:
  - "ActiveTravel.to esposto come ID! (esadecimale del POI di arrivo, nessun populate); kind persistito ma mai su GraphQL; duration in ms Float!; distance in km di gioco"
  - "requiredAdventurers è [QuestPartySlot!]! con title nullable (null = qualsiasi rango); party rimosso"
  - "registeredAdventurers è [QuestRegistration!]! { character: ID!, title: String! }; registrations rimosso; QuestInput.registeredAdventurers rimosso (mai dal client)"
  - "Diff SDL vs origin/develop: rimosse solo le 5 righe delle tre eccezioni D-20"
metrics:
  duration: 4 min
  completed: 2026-10-21
  tasks: 2
  files: 14
---

# Phase 8 Plan 01: Contratto di schema del viaggio e slot per rango Summary

SDL della Phase 8 pubblicato in Wave 1: `CharacterStatus.activeTravel: ActiveTravel` (polilinea `TravelPath`, `to: ID!`, `kind` interno), `PendingQuest.startDate` nullable, `Pet.speedModifier: Float`, `requiredAdventurers` a slot per rango con jolly `title: null` e `registeredAdventurers` a oggetti `{ character, title }`, con `party` e `registrations` eliminati.

## Tasks

| # | Task | Commits |
|---|------|---------|
| 1 | Contratto del viaggio (ActiveTravel, TravelPath, startDate nullable, Pet.speedModifier, riga Branch) | 8505165 (style), 879617c (RED), c2d719c (GREEN), 6f2236b (docs ROADMAP) |
| 2 | Slot per rango in requiredAdventurers, registeredAdventurers a oggetti | 4bb1ca7 (RED), 55cc0d3 (GREEN) |

## TDD evidence

**Task 1 RED** (`879617c`):
- `npx jest src/models/character/active-travel.schema.spec.ts --selectProjects unit` → 6 failed, 1 passed (solo `Object.values(TravelKind)` passava sullo stub): path `activeTravel`/`to`/`kind`/`coordinates`/`speedModifier` inesistenti (`TypeError: Cannot read properties of undefined (reading 'instance')`), `startDate` `undefined` invece di `null`, `validateSync()` senza errori sullo stub vuoto.
- `npx jest test/app.int-spec.ts --selectProjects integration --runInBand` → 2 failed / 28 passed: 'writes the quest lanes into the generated schema' (`startDate: DateTime!`) e 'writes the travel contract into the generated schema' (nessun `type ActiveTravel`). `src/schema.gql` non toccato dal RED.

**Task 1 GREEN** (`c2d719c`): unit 16/16 (con quest-lanes), real boot 30/30, `git diff src/schema.gql | grep -E '^-[^-]'` = `-  startDate: DateTime!`, `npm run build` ok, eslint pulito.

**Task 2 RED** (`4bb1ca7`):
- `npx jest src/models/quest-lanes.schema.spec.ts test/fixtures/fixtures.spec.ts --selectProjects unit` → 4 failed / 20 passed: `requiredAdventurers` ancora `Number`, `party`/`registrations` ancora presenti, slot con `title` null rifiutato (`required`), `registeredAdventurers` di stringhe senza sotto-schema.
- real boot → 1 failed / 29 passed: 'writes the quest rank slots into the generated schema'.

**Task 2 GREEN** (`55cc0d3`): unit 31/31 (schema spec + active travel + fixtures), `npx jest src/models` 50/50, `npx jest src/quests --selectProjects unit` 125/125 (regole pure con tipi strutturali propri), real boot 30/30, `npm run build` ok, eslint pulito.

## Diff SDL vs origin/develop (righe rimosse, D-20)

```
-  party: [QuestPartySlot!]!
-  registeredAdventurers: [String!]!
-  requiredAdventurers: Int!
-  startDate: DateTime!
-  title: String!
```

(`title: String!` è il vecchio `QuestPartySlot.title`, ora `title: String`.) Tutto il resto è additivo: `type ActiveTravel`, `type TravelPath`, `type QuestRegistration`, `activeTravel: ActiveTravel`, `speedModifier: Float`, `startDate: DateTime`, `requiredAdventurers: [QuestPartySlot!]!`, `registeredAdventurers: [QuestRegistration!]!`, `title: String`. Nessun `TravelKind`/`kind`/`party`/`registrations` in `src/schema.gql`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Boy Scout] Import `Types` inutilizzato in `src/models/pet.model.ts`**
- **Found during:** Task 1 (eslint dopo il commit `style`)
- **Issue:** warning `'Types' is defined but never used` preesistente
- **Fix:** import rimosso nel commit GREEN (insieme a `Float` aggiunto)
- **Commit:** c2d719c

Altrimenti piano eseguito come scritto. Il commit GREEN del Task 2 contiene i 4 modelli + `src/schema.gql`; i 3 file di test/fixture del task erano già nel commit RED.

## Known breakage (atteso, dichiarato nel piano)

Le int-spec in `src/quests/acceptance/` (`quest-acceptance.service.int-spec.ts`, `accept-quest.resolver.int-spec.ts`) e il codice di accettazione (`quest-eligibility.ts`, `quest-acceptance.updates.ts`, `quest-acceptance.service.ts`) usano ancora `party`/`registrations`/`registeredAdventurers` di stringhe: non eseguite qui, riscritte dal piano 08-06. Build e unit verdi (tipi strutturali propri).

## Threat model

- T-08-01: `activeTravel` non aggiunto a `CharacterStatusInput` (solo ObjectType).
- T-08-02: diff vs `origin/develop` limitato alle 5 righe sopra.
- T-08-03: `kind` senza `@Field`, nessun `registerEnumType`; real boot `not.toMatch(/TravelKind|\bkind\b/)`.
- T-08-04: `count` `required` + `min: 1`, `title` enum `TitleType` con null ammesso.
- T-08-05: `ActiveTravel.to` e `QuestRegistration.character` con `MongooseSchema.Types.ObjectId` (spec: `instance === 'ObjectId'`).

## Known Stubs

None.

## Self-Check: PASSED
