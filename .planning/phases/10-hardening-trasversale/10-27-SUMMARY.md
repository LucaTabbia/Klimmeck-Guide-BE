---
phase: 10-hardening-trasversale
plan: 27
subsystem: models
tags: [mongo, mongoose, mixed-refs, objectid, D-17d, C14, BE-HARD-06]
requires:
  - "10-26: `MIXED_REF_PATHS`, `runMixedRefsMigration(db, mode)` e la spec d'inventario sugli schemi reali"
provides:
  - "19 ref condivisi e di catalogo tipizzati `MongooseSchema.Types.ObjectId` (SDL invariato)"
  - "spec d'inventario che sonda l'`instance` di ogni percorso: ObjectId per i condivisi, `Mixed` ammesso solo sui 15 campi propri di `characters`"
  - "helper di test `migrateLegacyRefs(connection)` per il percorso «dato legacy → migrazione → comportamento»"
affects: [10-28, 10-29, 10-30]
tech-stack:
  added: []
  patterns:
    - "test legacy nell'ordine di deploy reale: inserimento grezzo del ref stringa, `migrateLegacyRefs`, poi la stessa asserzione attraverso il codice di produzione"
key-files:
  created:
    - test/migrations/migrate-legacy-refs.ts
  modified:
    - src/migrations/mixed-refs/mixed-ref-paths.spec.ts
    - src/models/user.model.ts
    - src/models/pending-quest.model.ts
    - src/models/common/asset-quantity.model.ts
    - src/models/quest/quest-infos.model.ts
    - src/models/city.model.ts
    - src/models/point-of-interest.model.ts
    - src/models/enemy.model.ts
    - src/models/lore.model.ts
    - src/models/equipment-item.model.ts
    - src/economy/trade/shop-transaction.service.int-spec.ts
    - src/characters/deletion/character-archiver.int-spec.ts
decisions:
  - "Cambia solo il `type` del `@Prop`: i tipi TypeScript dei campi (oggetti popolati come `Character | null`, `Quest`, `Lore[]`, `EquipmentItem | LootItem`) e i `@Field` restano invariati"
  - "`City.pointsOfInterest` (già ObjectId, non nell'inventario) passa alla stessa forma `MongooseSchema.Types.ObjectId` per coerenza e per il grep di accettazione: nessun cambio di comportamento"
  - "Il `connection.db` di mongoose è tipizzato `Db | undefined`: l'helper `migrateLegacyRefs` lo scarta con un errore esplicito, niente cast"
  - "Un solo commit `refactor(models)` per modelli e test legacy: i test riscritti dipendono dalla ritipizzazione"
metrics:
  duration: "~25 min"
  completed: "2026-10-30"
  tasks: 2
  files: 13
---

# Phase 10 Plan 27: Ritipizzazione dei ref condivisi e di catalogo Summary

I 19 ref condivisi e di catalogo (utenti, quest in attesa, `AssetQuantity`, infos delle quest, città, punti d'interesse, nemici, lore, equipaggiamenti) sono ora `MongooseSchema.Types.ObjectId`; lo SDL è identico, i lettori tolleranti restano, e i tre test che provavano ref stringa legacy attraverso un filtro Mongoose passano dal percorso reale «dato legacy → migrazione del 10-26 → comportamento».

## Commit

| Task | Commit | Tipo | Descrizione |
| ---- | ------ | ---- | ----------- |
| 1 | 5ce478a | test (RED) | spec d'inventario: ObjectId attesi sui percorsi condivisi e di catalogo |
| 2 | 9579139 | style | Prettier su `quest-infos`, `city`, `lore`, `equipment-item` (nessuna logica) |
| 2 | 2aee22b | refactor (GREEN) | ritipizzazione dei nove modelli + test legacy sul percorso migrato |

## Task 1 — RED

`mixed-ref-paths.spec.ts` ora raccoglie ogni ref (`ref`/`refPath`) degli schemi con la sua `instance` (`caster.instance` per gli array):

- `keeps every migrated reference path in the schemas (D-17d)` — ogni voce di `MIXED_REF_PATHS` esiste come ref negli schemi (verde al primo colpo: è l'invariante preesistente).
- `it.each(SHARED_AND_CATALOG_PATHS)('types the reference $label as ObjectId (D-17d)')` — 19 casi.
- `leaves no Mixed reference outside the character fields` — l'insieme dei ref `Mixed` è `toEqual` a `CHARACTER_FIELD_LABELS` (15 etichette del 10-28).

Rossi attesi visti (20): tutti i 19 `types the reference …` (Expected `ObjectId`, Received `Mixed`) per `users:currentCharacter`, `pendingquests:quest`, `characters:assets.ownedEquipments.item`, `characters:assets.ownedItems.item`, `quests:infos.enemy`, `quests:infos.markerLocation`, `quests:infos.relatedLore`, `quests:requirements.recommendedLoot.item`, `quests:prizes.prizeItem.item`, `quests:prizes.randomLoot.item`, `cities:markerLocation`, `cities:relatedLore`, `pointsofinterest:city`, `pointsofinterest:quest`, `enemies:relatedLore`, `lore:relatedLore`, `equipmentitems:addedSpell`, `questresults:consumablesUsed.item`, `questresults:rewards.items.item`; più `leaves no Mixed …` (+19 etichette in eccesso). `counts 34 references in 10 collections (D-17d)` resta: `MIXED_REF_PATHS` è sempre l'inventario completo della migrazione.

## Task 2 — GREEN

- Ritipizzazione con `import { Schema as MongooseSchema } from 'mongoose'`; `refPath: 'itemType'` di `AssetQuantity.item`, default, `required` e `@Field` invariati. Rimossi gli import inutilizzati dei file toccati (`Types`, `raw`, `SpellSchema`, `Int`, `Float`: Boy Scout).
- Primo `npm run test:int` dopo la ritipizzazione: 3 rossi su 1269, tutti ref stringa legacy letti da un filtro Mongoose; nessun'altra regressione.
- Test legacy riscritti (titolo + suffisso `after the reference migration (D-17d)`, arrange grezzo invariato, poi `migrateLegacyRefs`):
  - `src/economy/trade/shop-transaction.service.int-spec.ts` › `sells a legacy entry whose item id was stored as a string …` (l'asserzione finale sull'inventario confronta ora `idOf(potion)`: il dato migrato è ObjectId)
  - `src/economy/trade/shop-transaction.service.int-spec.ts` › `matches a legacy marker stored as a hex string …`
  - `src/characters/deletion/character-archiver.int-spec.ts` › `matches a legacy current character saved as a hex string …`
- Candidati di `files_modified` rimasti verdi e quindi non toccati (regola delle plan_notes): `quest-acceptance.service.int-spec.ts`, `quests.resolver.int-spec.ts`, `party-timeout.int-spec.ts`, `quest-resolution.sweeper.int-spec.ts`, `quest-result-maintenance.int-spec.ts`, `starting-location.service.int-spec.ts`, `test/auth/ws-auth.int-spec.ts` (i loro casi legacy passano dai lettori in memoria o da filtri a driver grezzo).

## Verifica

- `npx jest src/migrations src/models --selectProjects unit`: 13 suite / 119 test verdi.
- `npm run test:unit`: 179 suite / 2377 test verdi (~8 s).
- `npm run test:int`: 98 suite / 1269 test verdi (~275 s), incluso il boot reale `test/app.int-spec.ts`.
- `npx tsc --noEmit -p tsconfig.json` 0; `npm run build` 0; `git diff --exit-code src/schema.gql` 0; `git diff origin/develop -- src/schema.gql` aggiunge solo `+  pendingQuest: ID` e non rimuove righe.
- Grep di accettazione sui nove modelli (forma `Types.ObjectId` non qualificata): 0.
- Lettori tolleranti (`refIdOf`/`idForms` in `src`): 148 sul branch contro 138 su `origin/develop` (nessuno rimosso).

## Deviazioni dal piano

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Spec fuori lista: `src/characters/deletion/character-archiver.int-spec.ts`**
- **Trovato durante:** Task 2, primo `npm run test:int`
- **Problema:** il caso del `currentCharacter` legacy esadecimale non trovava più l'utente (`not-linked`) col filtro castato a ObjectId.
- **Fix:** stessa procedura delle plan_notes (migrazione prima dell'archiviazione); il file non era in `files_modified`.

**2. [Rule 3 - Blocking] Helper condiviso nuovo `test/migrations/migrate-legacy-refs.ts`**
- **Problema:** `connection.db` è `Db | undefined` e non soddisfa `ReferenceDatabase` senza cast.
- **Fix:** `migrateLegacyRefs(connection: Connection): Promise<MixedRefsReport>` lancia se la connessione non è aperta ed esegue `runMixedRefsMigration(db, 'apply')`. Non è un'estrazione degli helper locali del 10-26 (che restano locali), quindi nessun commit `refactor(test)` separato.

**3. `City.pointsOfInterest`** — fuori inventario (già ObjectId su disco e nello schema), portato alla forma `MongooseSchema.Types.ObjectId` perché il grep di accettazione lo contava; nessun cambio di comportamento.

Nessun file di produzione toccato oltre ai nove modelli.

## Known Stubs

Nessuno.

## Self-Check: PASSED
