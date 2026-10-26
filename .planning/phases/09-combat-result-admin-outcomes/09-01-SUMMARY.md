---
phase: 09-combat-result-admin-outcomes
plan: 01
subsystem: database
tags: [mongoose, graphql, code-first, schema, spells, quest-result]

# Dependency graph
requires:
  - phase: 08-travel-lifecycle-travel-01
    provides: modello del sotto-documento nullable (ActiveTravel), catalogo quest popolato con orfani tollerati (D-31), divieto di `kind` nel real boot
  - phase: 04-integrita-economica-atomics
    provides: ACTIVE_SPELL_SLOT_THRESHOLDS, maxActiveSpellsExpression nel filtro $expr di equipSpell (D-10/D-11)
provides:
  - CharacterStatus.awaitingAid (AwaitingAid { aidQuest, quest, since }) esposto e nullable (D-07)
  - Quest.concludedAt e Quest.rescue (QuestRescue) interni, default null, mai sul filo (D-06, D-08)
  - QuestPrizes.spell esposto, popolato dal catalogo, Spell registrato in QuestsModule (D-17)
  - modello QuestResult (collection questresults) + enum QuestOutcome, pronti per 09-06 (D-19, C2)
  - gate mage sugli slot magia: SPELL_CASTER_TITLES, isSpellCaster, maxActiveSpellsFor(xp, title), espressione $cond (D-13, C3)
  - BE-COMBAT-03 / BE-ADMIN-02 e success criteria della Phase 9 emendati (D-03, D-04)
affects: [09-02, 09-05, 09-06, 09-08, 09-12, 09-15, FE Phase 9, FE Phase 10]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Sotto-documento interno: @Schema senza @Field e senza import di @nestjs/graphql (QuestRescue)"
    - "Gate di rango nell'espressione $expr: $cond su $in del titolo vivo attorno allo $switch delle soglie"

key-files:
  created:
    - src/models/character/awaiting-aid.model.ts
    - src/models/character/awaiting-aid.schema.spec.ts
    - src/models/quest/quest-rescue.model.ts
    - src/models/quest/quest-outcome-fields.schema.spec.ts
    - src/models/enums/quest-outcome.enum.ts
    - src/models/quest-result/quest-result.model.ts
    - src/models/quest-result/quest-result.schema.spec.ts
  modified:
    - src/models/character/character-status.model.ts
    - src/models/quest/quest.model.ts
    - src/models/quest/quest-prizes.model.ts
    - src/quests/quest-catalog.populate.ts
    - src/quests/quest-catalog.populate.spec.ts
    - src/quests/quests.module.ts
    - src/models/character/active-spell-slots.ts
    - src/models/character/active-spell-slots.spec.ts
    - src/characters/spells/active-spell.updates.ts
    - src/characters/spells/active-spell.updates.spec.ts
    - src/characters/spells/equip-spell.int-spec.ts
    - src/characters/characters-ownership.int-spec.ts
    - src/characters/archived-character-visibility.int-spec.ts
    - src/characters/characters.service.spec.ts
    - test/fixtures/fixtures.spec.ts
    - test/fixtures/character.fixture.ts
    - test/app.int-spec.ts
    - src/schema.gql
    - .planning/REQUIREMENTS.md
    - .planning/ROADMAP.md

key-decisions:
  - "QuestResultQuest dichiara il path `id` nel sotto-documento _id:false: Mongoose lo accetta (nessun ripiego su questId), quest.id è un ObjectId castato"
  - "Nella spec di equipSpell playerWith gioca da mage per default (title opzionale nel Loadout): le suite delle magie passano title mage, il default del fixture resta rookie (C3)"
  - "QuestPrizesInput.spell aggiunto ma non stampato nello SDL: QuestInput non è referenziato da alcun resolver (schema invariato su quel lato)"

patterns-established:
  - "Contratto SDL di Wave 1: blocchi type esatti asseriti nel real boot prima di montare i moduli che li consumano"

requirements-completed: []  # contributo a BE-COMBAT-01, BE-COMBAT-03, BE-ADMIN-02; la traceability è del piano di gate 09-16

# Metrics
duration: 9min
completed: 2026-10-24
---

# Phase 9 Plan 01: Contratto dei modelli degli esiti Summary

**SDL additivo di Wave 1 (`status.awaitingAid`, `prizes.spell`), campi interni `concludedAt`/`rescue`, modello `QuestResult` con enum `QuestOutcome` sulla collection `questresults` e slot magia aperti solo dal rango mage in virtual, filtro `$expr` e classificatore**

## Performance

- **Duration:** ~9 min (commit 16:39 → 16:46 +0200, più verifica e documenti)
- **Started:** 2026-10-24T14:37:30Z
- **Completed:** 2026-10-24T14:48:00Z
- **Tasks:** 3 (3/3)
- **Files modified:** 27

## Accomplishments

- Lo schema generato espone `type AwaitingAid { aidQuest: ID! quest: ID! since: DateTime! }`, `CharacterStatus.awaitingAid: AwaitingAid` e `QuestPrizes.spell: Spell`; il diff di `src/schema.gql` è solo additivo (8 righe aggiunte, 0 rimosse); `concludedAt`, `rescue`, `grade`, `kind` assenti dallo schema.
- `QuestsModule` registra `Spell`: il populate `prizes.spell` non lancia `MissingSchemaError` (`quests.resolver.int-spec.ts` verde).
- `QuestResult` è un modello Mongoose valido con 7 ref `MongooseSchema.Types.ObjectId`, `AssetQuantity` con refPath assoluti (`consumablesUsed.itemType`, `rewards.items.itemType`), enum di esito e di ferite validati; non entra ancora nello schema (nessun resolver lo referenzia: arriva con 09-06).
- D-13: sotto `mage` 0 slot qualunque sia l'XP, da `mage` in su le soglie 20k/25k/30k/40k; parità DB `maxActiveSpellsExpression` vs `maxActiveSpellsFor` verificata sulla matrice 9 xp × 6 titoli.
- REQUIREMENTS (BE-COMBAT-01/02/03, BE-ADMIN-02) e ROADMAP (Goal, criteri 2/3/5 della Phase 9) emendati; nessuna checkbox spuntata, Traceability e riga Branch intatte.

## Task Commits

| # | Task | Commit | Tipo |
|---|------|--------|------|
| 1 | awaitingAid, concludedAt, rescue, prizes.spell e SDL esatto (RED) | `f1a5701` | test |
| 1 | awaitingAid, concludedAt, rescue, prizes.spell e SDL esatto (GREEN) | `439b563` | feat |
| 2 | modello QuestResult ed enum QuestOutcome (RED) | `9274261` | test |
| 2 | modello QuestResult ed enum QuestOutcome (GREEN) | `9de1571` | feat |
| 2 | emendamenti BE-COMBAT-03 / BE-ADMIN-02 e ROADMAP | `091c25d` | docs |
| 3 | slot magia dal rango mage (RED, test esistenti modificati C3) | `13dfcba` | test |
| 3 | slot magia dal rango mage (GREEN) | `d2fee52` | feat |

**Plan metadata:** commit `docs(phase-9): complete plan 09-01 ...` (SUMMARY, VALIDATION, STATE, ROADMAP)

## RED evidence

- **Task 1:** unit 8 falliti / 16 (path `awaitingAid`, `quest`/`aidQuest`/`since`, `concludedAt`, `rescue`, `prizes.spell` inesistenti; voce `prizes.spell` mancante in `QUEST_CATALOG_POPULATE`); real boot 2 falliti / 36 (`writes the travel contract …` per la riga `awaitingAid` e il nuovo `writes the quest outcome fields …`). `src/schema.gql` non toccato dal real boot rosso.
- **Task 2:** 8 falliti / 8 in `quest-result.schema.spec.ts` (enum vuoto, classi senza path, collection di default).
- **Task 3:** unit 15 falliti / 62 (firma senza titolo, `SPELL_CASTER_TITLES` assente, espressione senza `$cond`, proiezione senza `status.title`, fixture con 1 slot); integration 1 fallito / 15 (`rejects equipSpell below the mage rank with MAX_ACTIVE_SPELLS_REACHED`: il rookie con 40000 xp equipaggiava).

### Test esistenti modificati (C3, dichiarati)

- `src/models/character/active-spell-slots.spec.ts` — riscritto su matrice `[xp, title, slots]`, espressione `$cond`, `SPELL_CASTER_TITLES`.
- `src/characters/spells/active-spell.updates.spec.ts` — helper `snapshot(..., title)`; "returns undefined" ora con `title: mage`; nuovi casi proiezione `status.title` e rookie 40000 → `MAX_ACTIVE_SPELLS_REACHED`.
- `src/characters/spells/equip-spell.int-spec.ts` — `Loadout.title` (default `mage`), nuovo caso rookie, parità rinominata in `… across xp and titles` con matrice xp × titolo.
- `test/fixtures/fixtures.spec.ts` — `defaults to a rookie with 20000 xp: no spell slot until the mage rank` (virtual 0, 1 con `title: 'mage'`).
- `src/characters/characters-ownership.int-spec.ts`, `src/characters/archived-character-visibility.int-spec.ts` — `title: 'mage'` nel `richCharacter` usato dalle righe `equipSpell`.
- `src/characters/characters.service.spec.ts` — vedi Deviazione 2.
- `src/authz/audit/admin-audit.int-spec.ts` — verde senza modifiche (usa solo `unequipSpell`).

## Files Created/Modified

- `src/models/character/awaiting-aid.model.ts` — `AwaitingAid` ObjectType + schema (ref castati, tutti required).
- `src/models/quest/quest-rescue.model.ts` — `QuestRescue` interno (`character`, `failedQuest`).
- `src/models/quest-result/quest-result.model.ts` — `QuestResult`, `QuestResultQuest`, `SpellUsage`, `QuestRewards` + schemi, `QuestResultDocument`.
- `src/models/enums/quest-outcome.enum.ts` — `QuestOutcome` registrato su GraphQL.
- `src/models/character/active-spell-slots.ts` — `SPELL_CASTER_TITLES`, `isSpellCaster`, `maxActiveSpellsFor(xp, title)`, espressione `$cond`.
- `src/models/character/character-status.model.ts` — `awaitingAid`, virtual con titolo.
- `src/models/quest/quest.model.ts`, `quest-prizes.model.ts` — `concludedAt`, `rescue`, `prizes.spell` (+ `QuestPrizesInput.spell`).
- `src/quests/quest-catalog.populate.ts`, `src/quests/quests.module.ts` — populate `prizes.spell`, registrazione `Spell`.
- `src/characters/spells/active-spell.updates.ts` — proiezione e snapshot con `status.title`.
- `test/fixtures/character.fixture.ts` — solo commenti (default invariati).
- `test/app.int-spec.ts`, `src/schema.gql` — asserzioni SDL e schema rigenerato.

## Decisions Made

- `QuestResultQuest.id` dichiarato direttamente: Mongoose accetta il path `id` nel sotto-documento `_id: false` (la spec `get('quest.id') instanceof Types.ObjectId` è verde), nessun ripiego su `questId`.
- `playerWith` della spec di `equipSpell` gioca da `mage` per default: un solo punto di modifica invece di ogni caso di successo; il caso rookie passa `title` esplicito.
- Le magie già attive di un non-mage restano (discrezione D-13, nessuna rimozione).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug di piano] Commento di `quest-outcome.enum.ts` in conflitto con l'acceptance**
- **Found during:** Task 2
- **Issue:** il commento prescritto ("mai kind") faceva fallire `grep -nw "kind" … quest-outcome.enum.ts` (deve essere vuoto).
- **Fix:** commento riformulato in "il campo si chiama outcome, mai col nome vietato dal real boot (C2)".
- **Files modified:** `src/models/enums/quest-outcome.enum.ts`
- **Commit:** `9de1571`

**2. [Rule 3 - Blocking] `characters.service.spec.ts` rompeva col gate mage**
- **Found during:** Task 3 (GREEN)
- **Issue:** tre snapshot mock `{ status: { spells: [s], xp: 20000 } }` senza titolo, pensati per "nessuna guard violata", con il gate diventavano `MAX_ACTIVE_SPELLS_REACHED` e sfasavano la sequenza dei mock (7 falliti, inclusi casi `useSpell` che condividono i mock). Il file non era nell'elenco del piano.
- **Fix:** `title: 'mage'` nei tre snapshot (stessa modifica dichiarata C3); 48/48 verdi.
- **Files modified:** `src/characters/characters.service.spec.ts`
- **Commit:** `d2fee52`

**3. [Rule 3 - Import] Percorso del fixture nella spec dei campi quest**
- **Found during:** Task 1 (RED)
- **Issue:** le spec del repo importano i fixture con percorso relativo (`../../../test/fixtures/...`), non con `test/...`.
- **Fix:** import relativo in `quest-outcome-fields.schema.spec.ts`.
- **Commit:** `f1a5701`

Nessun'altra deviazione; nessuna decisione utente modificata.

## Issues Encountered

None.

## Known Stubs

None. `QuestResult` non è ancora referenziato da un resolver (previsto: 09-06 lo porta nello schema).

## Threat Flags

None: le superfici nuove sono quelle del threat model (T-09-01..T-09-06). `awaitingAid` non è in nessun `@InputType`; `concludedAt`/`rescue` senza `@Field` e assenti dallo schema.

## Next Phase Readiness

- 09-02 (tabella livelli/HP, `STARTING_LIFE_POINTS` 1000) e 09-03 possono partire; 09-06 trova `QuestResult`/`QuestOutcome` pronti.
- FE Phase 9 può leggere `status.awaitingAid` e `prizes.spell` dallo schema committato.

## Self-Check: PASSED

- File creati presenti: `awaiting-aid.model.ts`, `awaiting-aid.schema.spec.ts`, `quest-rescue.model.ts`, `quest-outcome-fields.schema.spec.ts`, `quest-outcome.enum.ts`, `quest-result.model.ts`, `quest-result.schema.spec.ts`.
- Commit presenti: `f1a5701`, `439b563`, `9274261`, `9de1571`, `091c25d`, `13dfcba`, `d2fee52`; nessun trailer.
- Verifica di piano: unit 115/115 (`src/models`, populate, `src/characters/spells`, fixtures), integration 51/51 (real boot + equip-spell), `git diff --exit-code src/schema.gql` pulito, `npm run build` 0.
