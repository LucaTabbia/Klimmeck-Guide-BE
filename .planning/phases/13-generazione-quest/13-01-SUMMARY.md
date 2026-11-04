---
phase: 13-generazione-quest
plan: 01
subsystem: models/quests
tags: [quests, schema, graphql, BE-QGEN-02, BE-QGEN-03, BE-QGEN-10, BE-QGEN-11, D-04, D-17, D-21, D-24, D-28]
requires: []
provides:
  - "Quest.generated: flag interno (Boolean, default false), nessun @Field"
  - "QUEST_GENERATED_OPEN_MARKER_INDEX = 'quest_generated_open_marker': indice unico parziale su infos.markerLocation per generated true e concludedAt null"
  - "enum AccessoryUseType { attack, defense } in src/models/enums/accessory-use-type.enum.ts (registerEnumType)"
  - "Enemy.legendary: Boolean! (default false); EnemyInput invariato"
  - "EquipmentItem.accessoryUseTypes: [AccessoryUseType!] nullable, default undefined (assente finché non scritto); anche su EquipmentItemInput"
  - "QuestPrizes.pet: Pet e QuestRewards.pet: Pet (ref Pet, default null)"
  - "src/schema.gql additivo (9 righe aggiunte, 0 tolte)"
affects: [13-02, 13-12, 13-13, 13-14, 13-16]
tech-stack:
  added: []
  patterns:
    - "indice unico parziale come garanzia di concorrenza (E11000 sul secondo insert)"
    - "lista opzionale Mongoose con `default: undefined` per distinguere assente da vuoto"
key-files:
  created:
    - src/models/enums/accessory-use-type.enum.ts
    - src/models/quest-generation-fields.schema.spec.ts
  modified:
    - src/models/quest/quest.model.ts
    - src/models/sweep-indexes.schema.spec.ts
    - src/models/enemy.model.ts
    - src/models/equipment-item.model.ts
    - src/models/quest/quest-prizes.model.ts
    - src/models/quest-result/quest-result.model.ts
    - test/app.int-spec.ts
    - src/schema.gql
decisions:
  - "Nessun cambio a SweepIndexVerifier: questModel.createIndexes() al boot costruisce già l'indice nuovo (sweep-index.verifier.int-spec verde)"
  - "QuestPrizesInput ed EnemyInput invariati come da piano; EquipmentItemInput riceve accessoryUseTypes ma l'input non compare nello SDL (non usato da alcun resolver)"
metrics:
  duration: "~15 min"
  completed: 2026-11-04
  tasks: 2
  files: 10
---

# Phase 13 Plan 01: campi additivi della generazione quest Summary

Flag interno `Quest.generated` con indice unico parziale `quest_generated_open_marker` sul POI, più i campi additivi del contratto FE (`Enemy.legendary`, `AccessoryUseType`/`EquipmentItem.accessoryUseTypes`, `QuestPrizes.pet`, `QuestRewards.pet`) con lo SDL rigenerato dal real boot senza righe tolte.

## Task

| Task | Nome | Commit RED | Commit GREEN |
| ---- | ---- | ---------- | ------------ |
| 1 | flag `generated` e indice unico parziale (D-17, D-28) | b16104a | ea1eedb |
| 2 | `legendary`, `accessoryUseTypes`, `prizes.pet`, `rewards.pet` e SDL (D-04, D-21, D-24) | 7b0226c | b50803b |

## Fallimenti RED osservati

- Task 1: `quest-generation-fields.schema.spec.ts` + `sweep-indexes.schema.spec.ts` → 3 falliti / 8 passati: `generated` `undefined` invece di `false`; l'indice `quest_generated_open_marker` assente da `QuestSchema.indexes()` (sia nel test D-28 sia nella riga nuova di `SWEEP_INDEXES`).
- Task 2 (unit): 3 falliti / 2 passati: `legendary` `undefined`, `accessoryUseTypes` non conservato (`undefined` invece di `['attack', 'defense']`), `pet` `undefined` su premi e ricompense.
- Task 2 (real boot): 3 falliti / 68 passati: stringhe esatte di `type QuestPrizes` e `type QuestRewards` e il test nuovo `writes the additive quest generation fields into the generated schema (D-04, D-24)`.

## Nomi e firme creati

- `src/models/quest/quest.model.ts`: `generated: boolean` (`@Prop({ type: Boolean, default: false })`, senza `@Field`); `export const QUEST_GENERATED_OPEN_MARKER_INDEX = 'quest_generated_open_marker'`; `QuestSchema.index({ 'infos.markerLocation': 1 }, { unique: true, name, partialFilterExpression: { generated: true, concludedAt: null } })`.
- `src/models/enums/accessory-use-type.enum.ts`: `export enum AccessoryUseType { attack = 'attack', defense = 'defense' }`.
- `src/models/enemy.model.ts`: `legendary: boolean` dopo `imagePath`.
- `src/models/equipment-item.model.ts`: `accessoryUseTypes?: AccessoryUseType[] | null` (classe e `EquipmentItemInput`).
- `src/models/quest/quest-prizes.model.ts`: `pet?: Types.ObjectId | Pet | null`.
- `src/models/quest-result/quest-result.model.ts` (`QuestRewards`): `pet?: Types.ObjectId | Pet | null`.

## Deviazioni dal piano

Nessuna: piano eseguito come scritto. Nessun letterale tipizzato `QuestRewards`/`QuestResult` ha richiesto modifiche (tsc 0). `npx eslint test/app.int-spec.ts` segnala un warning preesistente (`no-base-to-string` su `url`, codice non toccato), nessun errore.

## Gate

- `npx tsc --noEmit -p tsconfig.json` → 0 a fine di ogni task.
- `quest-generation-fields.schema.spec.ts` 5/5, `sweep-indexes.schema.spec.ts` verde (11/11 insieme nel task 1), `test/app.int-spec.ts` 71/71, `src/mongo/sweep-index.verifier.int-spec.ts` 2/2.
- `git diff --exit-code src/schema.gql` → 0; `git diff origin/develop -- src/schema.gql | grep -cE '^-[^-]'` → `0`.

## Self-Check: PASSED
