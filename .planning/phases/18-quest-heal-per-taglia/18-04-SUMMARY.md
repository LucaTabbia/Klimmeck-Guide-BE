---
phase: 18-quest-heal-per-taglia
plan: 04
subsystem: models
tags: [potion, loot-item, character-status, sdl, tdd]
requires: ["18-03"]
provides:
  - "LootRecovery { time, turns } + LootRecoverySchema (_id false, interi, min 0, obbligatori)"
  - "LootItem.recovery: LootRecovery | null (default null) e LootItem.relatedLore: Lore[] (ref Lore, default [])"
  - "LootRecoveryInput + LootItemInput.recovery, senza superficie SDL (D-24)"
  - "CharacterStatus.potionRecoveryUntil: Date | null (default null)"
affects: [18-05, 18-07, 18-08, 18-11]
tech-stack:
  added: []
  patterns: ["campi additivi con default sicuro, nessuna migrazione (D-14)", "ref a Lore copiato da Enemy.relatedLore"]
key-files:
  created:
    - src/models/character/character-status.schema.spec.ts
  modified:
    - src/models/loot-item.model.ts
    - src/models/loot-item.model.spec.ts
    - src/models/character/character-status.model.ts
    - test/app.int-spec.ts
    - src/schema.gql
decisions:
  - "STATE.md registra `Plan: 4 of 11` (formato del brief), non `Plan: 04 of 11` del verify del piano"
metrics:
  duration: "~20 min"
  completed: 2026-11-10
  tasks: 3
  files: 6
---

# Phase 18 Plan 04: modelli delle pozioni — Summary

Le pozioni portano `recovery` (sotto-documento `LootRecovery` con `time` in millisecondi e `turns`, interi non negativi obbligatori, default `null`) e `relatedLore` (lista di ref a `Lore`, default vuota); il personaggio porta una sola data `status.potionRecoveryUntil` nullable. Tutto additivo sullo SDL, nessun processor, nessuno sweep, nessuna migrazione.

## Forma del codice

- `src/models/loot-item.model.ts`: `export class LootRecovery` (`@ObjectType`, `@Schema({ _id: false })`, due `@Field(() => Int)` con `@Prop({ type: Number, required: true, min: 0, validate: Number.isInteger })`) dichiarata PRIMA di `LootItem`; `export const LootRecoverySchema`; in `LootItem` dopo `canHeal`: `recovery?: LootRecovery | null` (`@Field(() => LootRecovery, { nullable: true })` + `@Prop({ type: LootRecoverySchema, default: null })`) e `relatedLore: Lore[]` (`@Field(() => [Lore])` + `@Prop({ type: [MongooseSchema.Types.ObjectId], ref: Lore.name, default: [] })`); `export class LootRecoveryInput` (`@InputType`, `time`/`turns` Int) dopo `LootItemSchema`; `LootItemInput.recovery?: LootRecoveryInput | null`.
- `src/models/character/character-status.model.ts`: `potionRecoveryUntil?: Date | null` (`@Field(() => Date, { nullable: true })` + `@Prop({ type: Date, default: null })`) fra `maxLifePoints` e `maxActiveSpells`; `CharacterStatusInput` invariato.
- SDL aggiunto: `type LootRecovery { time: Int! turns: Int! }`, `LootItem.recovery: LootRecovery`, `LootItem.relatedLore: [Lore!]!`, `CharacterStatus.potionRecoveryUntil: DateTime`. Nessuna riga tolta rispetto a `origin/develop`.

## Commit

| Task | Commit | Messaggio |
|------|--------|-----------|
| 1 RED | 165ea0f1 | test(models): pin the loot recovery and the loot related lore |
| 1 GREEN | dd0ad003 | feat(models): add the recovery and the related lore to loot items |
| 2 RED | df71b9d3 | test(models): pin the potion recovery date on the character status |
| 2 GREEN | 7ecef868 | feat(models): add the potion recovery date to the character status |

## Fallimenti RED osservati

- Task 1: 8 casi rossi su 9 nuovi in `loot-item.model.spec.ts` (`recovery` e `relatedLore` `undefined` sul documento, path `relatedLore` assente); boot reale rosso sul solo caso `writes the potion contract of the FE Phase 18 …` (`type LootRecovery` assente). `tsc` rosso nel commit RED per la sola spec (`recovery`/`relatedLore` inesistenti sul tipo di `toObject()`).
- Verde al primo colpo: `accepts a recovery time of 0 in the schema (D-15)` — senza il campo la modalità strict di Mongoose scarta `recovery` e non ci sono errori; il caso pinna la regola dopo il GREEN.
- Task 2: entrambi i casi di `character-status.schema.spec.ts` rossi (valore `undefined`); boot reale rosso su `writes the travel contract into the generated schema` (blocco `type CharacterStatus` diverso). `tsc` verde anche nel RED.

## Spec dei Mixed

`src/migrations/mixed-refs/mixed-ref-paths.spec.ts` verde SENZA modifiche dopo il GREEN (il ref è dichiarato come `Enemy.relatedLore`).

## Verifiche

- `npx tsc --noEmit -p tsconfig.json` 0 dopo ogni GREEN.
- Suite unit completa: 251 suite / 3131 test verdi.
- Integration di wave (`src/characters src/shops src/lore src/economy src/models src/lootItems src/graphql test/shops test/quests test/authz test/fixtures test/harness`): 45 suite / 646 test verdi in 155 s.
- Boot reale 81/81; `git diff --exit-code src/schema.gql` 0 dopo ogni commit.
- prettier `--check`/`--write` ed eslint sui file `.ts` toccati: puliti (unico warning preesistente `no-base-to-string` in `test/app.int-spec.ts`, ora alla riga 938, non mio).

## Deviations from Plan

Nessuna deviazione sul codice. Solo bookkeeping: `Plan: 4 of 11` senza zero iniziale (formato del brief), quindi il verify del Task 3 che cerca `Plan: 04 of 11` non passa: innocuo.

## Known Stubs

`LootItem.relatedLore` usa il resolver di default (id grezzi) fino al piano 18-05, che aggiunge il field resolver filtrato per viewer; nessuna spec di questo piano lo seleziona sul filo.

## Self-Check: PASSED
