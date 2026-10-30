---
phase: 10-hardening-trasversale
plan: 28
subsystem: models
tags: [mongoose, migration, objectid, d-17d, be-hard-06]
requires:
  - phase: 10-27
    provides: ref condivisi e di catalogo tipizzati, helper migrateLegacyRefs, spec d'inventario con sonda del tipo
provides:
  - ref propri dei personaggi tipizzati ObjectId; nessun ref Mixed negli schemi
affects: [10-29, 10-30, 10-31]
tech-stack:
  added: []
  patterns: ["@Prop({ type: MongooseSchema.Types.ObjectId, ref }) con @Field e tipi TS invariati"]
key-files:
  created: []
  modified:
    - src/models/character/character-status.model.ts
    - src/models/character/character-quests.model.ts
    - src/models/character/character-assets.model.ts
    - src/models/common/equipment.model.ts
    - src/models/common/active-spell.model.ts
    - src/migrations/mixed-refs/mixed-ref-paths.spec.ts
    - src/models/quest-lanes.schema.spec.ts
    - src/characters/spells/equip-spell.int-spec.ts
    - src/characters/spells/use-spell.int-spec.ts
key-decisions:
  - "Ritipizzazione dei ref dei personaggi completata: a fine fase nessun ref Mixed resta negli schemi (D-17d)"
requirements-completed: []
duration: ~45 min
completed: 2026-10-30
---

# Phase 10 Plan 28: Ritipizzazione dei ref dei personaggi Summary

I 15 percorsi di ref propri di `characters` (posizione, magie conosciute, quest completate, corsia standard, 9 slot dell'equipaggiamento, magie attive, pet) passano da `Mixed` a `MongooseSchema.Types.ObjectId`; la spec d'inventario prova che nessun ref `Mixed` resta in alcuno schema, SDL invariato e lettori tolleranti intatti.

## Commit

| Task | Commit | Descrizione |
| ---- | ------ | ----------- |
| 1 RED | 4eb0ce3 | `test(models): expect no Mixed reference left` |
| 2 style | 3b8596c | `style(models): format the character models` (solo Prettier su assets, equipment, active-spell) |
| 2 test legacy | 166eaa8 | `test(spells): exercise legacy references after the migration` |
| 2 GREEN | 1fc8f85 | `refactor(models): type character references as ObjectId` |

## `@Prop` ritipizzati

- `character-status.model.ts`: `location` (required), `spells` (array)
- `character-quests.model.ts`: `completedQuests` (array), `pendingQuest` (default null)
- `character-assets.model.ts`: `pet` (default null)
- `common/equipment.model.ts`: `head`, `chest`, `arms`, `legs`, `foots`, `leftHand`, `rightHand`, `firstAccessory`, `secondAccessory`
- `common/active-spell.model.ts`: `spell`

`@Field` e tipi TS invariati; `Types` resta importato solo dove serve ai tipi TS (status, equipment, active-spell). Il piano parla di 17 percorsi: l'inventario reale ne conta 15 (i 9 slot contano singolarmente, `ownedEquipments`/`ownedItems` erano già tipizzati via `AssetQuantity` nel 10-27).

## Spec d'inventario finale

- `it.each(LABELLED_PATHS)` `types the reference $label as ObjectId (D-17d)` su tutte le 34 voci di `MIXED_REF_PATHS`
- `leaves no Mixed reference in the schemas (D-17d)` con atteso `toEqual([])`
- invariati: `keeps every migrated reference path in the schemas (D-17d)`, `labels a reference …`, `counts 34 references in 10 collections (D-17d)`
- `CHARACTER_FIELD_LABELS` e `SHARED_AND_CATALOG_PATHS` rimossi

RED visto: 16 fallimenti (15 percorsi `Expected "ObjectId" / Received "Mixed"` + il caso «nessun Mixed» con 15 etichette ricevute). GREEN: 38/38.

## Test legacy riscritti (dato legacy → `migrateLegacyRefs` → comportamento)

Rossi dopo la ritipizzazione (il filtro Mongoose ora casta l'id esadecimale a ObjectId e non trova più la stringa grezza), riscritti:

- `equip-spell.int-spec.ts`: `equips a known spell stored with a legacy string id after the reference migration (D-17d)`; `rejects re-equipping a spell active with a legacy string id with SPELL_ALREADY_ACTIVE after the reference migration (D-17d)` (lo stato `before` si legge dopo la migrazione); `removes an active spell stored with a legacy string id after the reference migration (D-17d)`
- `use-spell.int-spec.ts`: `uses an active spell whose mirror stores a legacy string id after the reference migration (D-17d)`

Verdi al primo colpo e non toccati (lettori in memoria tolleranti): `archived-character-visibility.int-spec.ts`, `character-quest-lanes.int-spec.ts`, `deletion/character-archiver.int-spec.ts`, `spell-state.migrator.int-spec.ts`, `spell-state.wire.int-spec.ts`, e l'altro caso legacy di `equip-spell.int-spec.ts` (riga ~256).

## Verifiche

- `npm run test:unit`: 179 suite / 2392 test verdi (~8 s)
- `npm run test:int`: 98 suite / 1269 test verdi (276 s); il test instabile del boot reale non si è presentato
- `npm run test:cov`: exit 0, 277 suite / 3661 test, soglie per cartella del 10-25 rispettate (438 s)
- boot reale `test/app.int-spec.ts` 65/65; `git diff --exit-code src/schema.gql` 0; rispetto a `origin/develop` l'unica riga aggiunta è `+  pendingQuest: ID`, 0 righe rimosse
- `npx tsc --noEmit -p tsconfig.json` 0; `npm run build` 0
- grep di `type: Types.ObjectId` (anche array) in `src/models` fuori dagli spec: vuoto
- lettori tolleranti `refIdOf`/`idForms`: 148 occorrenze (138 su `origin/develop`, stesso conteggio del 10-27); nessun lettore o filtro di produzione toccato

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Spec fuori lista che fissava il vecchio tipo**
- **Found during:** Task 2
- **Issue:** `src/models/quest-lanes.schema.spec.ts` › `keeps the legacy pending quest ref untouched` asseriva `Mixed` su `pendingQuest`.
- **Fix:** riscritto come `types the pending quest ref as ObjectId after the reference migration (D-17d)` con atteso `ObjectId` (nessun caso perso).
- **Commit:** 1fc8f85

**2. Commit per area**: i test legacy rotti erano solo nell'area spells, quindi un solo commit `test(spells): …`; gli altri file in lista restano invariati (verdi).

Nessun codice di produzione toccato oltre ai 5 modelli.

## Note per il runbook (10-29) e l'handoff (10-30)

- Ordine di deploy: eseguire la migrazione `apply` dei ref PRIMA di avviare il codice ritipizzato; con il codice ritipizzato un id legacy in stringa non viene più trovato dai filtri castati (equip/unequip/use delle magie lo provano), quindi la corsia standard e le magie attive legacy sarebbero invisibili a sweep e risoluzioni (T-10-96).
- Il verificatore `MixedRefsVerifier` al boot segnala i residui; le stringhe non esadecimali restano intatte e i lettori tolleranti restano (T-10-97).
- Rollback: il codice precedente legge sia ObjectId sia stringhe, quindi tornare indietro dopo la migrazione è sicuro; la migrazione non va annullata.

## Self-Check: PASSED
