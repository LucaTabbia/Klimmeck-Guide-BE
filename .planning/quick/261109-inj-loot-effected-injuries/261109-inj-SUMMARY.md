---
phase: quick-261109-inj
plan: 01
subsystem: models
tags: [loot-item, injuries, heal, schema]
requirements: [BE-CONTENT-05]
key-files:
  created:
    - src/models/loot-item.model.spec.ts
  modified:
    - src/models/loot-item.model.ts
    - src/schema.gql
commits:
  - { hash: 39ca629, message: "test(models): expect the injuries a heal item can cure" }
  - { hash: d2a7b99, message: "style(models): format loot-item.model.ts" }
  - { hash: 9d8dd33, message: "feat(models): add the injuries a heal item can cure to loot items" }
---

# Quick 261109-inj: `effectedInjuries` sui LootItem

`LootItem` ha il campo `effectedInjuries: InjuryType[]` (Mongoose `[String]` con `enum: Object.values(InjuryType)`, default `[]`): un valore fuori enum fa fallire `validateSync()`, `['deepCut', 'infection']` passa. Sul filo `type LootItem` espone `effectedInjuries: [InjuryType!]!` subito dopo `effect: String!` (schema ordinato, riga inserita a mano: l'orchestratore conferma al boot reale che `git diff --exit-code src/schema.gql` resta vuoto). `LootItemInput` accetta `effectedInjuries` opzionale (non emesso: l'input non è usato da alcun resolver). Il servizio dei loot item restituisce i documenti così come sono: il campo passa da solo. La meccanica di cura arriva in una fase dedicata; il contenuto dei 25 oggetti heal viene scritto a DB dall'orchestratore dopo la revisione dell'utente.

## Modifiche
- `loot-item.model.ts`: `@Field(() => [InjuryType]) @Prop({ type: [String], enum: Object.values(InjuryType), default: [] }) effectedInjuries` su `LootItem` (commento con la regola utente 2026-11-09); `@Field(() => [InjuryType], { nullable: true }) effectedInjuries?: InjuryType[] | null` su `LootItemInput`; import `ID` morto rimosso (Boy Scout, warning eslint pre-esistente). File formattato con Prettier in un commit di stile separato prima della modifica (solo la riga vuota finale), come da regola.
- `loot-item.model.spec.ts` (nuovo, progetto `unit`, 5 casi): path dello schema (`Array` di `String` con `enumValues` = `Object.values(InjuryType)`), default `[]` su un documento costruito dalla fixture `buildLootItem`, `validateSync()` rosso su `'brokenWing'` (errore su `effectedInjuries.0`) e verde su `['deepCut', 'infection']`, contratto del file `src/schema.gql` (la riga `  effectedInjuries: [InjuryType!]!` segue `  effect: String!` nel blocco `type LootItem`).
- `schema.gql`: una sola riga inserita nel blocco `type LootItem`; nessun newline finale aggiunto (il file non lo aveva).

## RED
`npx jest src/models/loot-item.model.spec.ts --selectProjects unit` prima della modifica: `Tests: 5 failed, 5 total`.
- `declares the injuries…`: `TypeError: Cannot read properties of undefined (reading 'instance')` (path assente).
- `defaults effectedInjuries to an empty list`: `Expected: []  Received: undefined`.
- `rejects an injury outside the enum`: `Expected ["effectedInjuries.0"]  Received []` (campo ignorato dallo strict mode).
- `accepts known injuries`: `Expected: ["deepCut", "infection"]  Received: undefined`.
- `exposes effectedInjuries right after effect…`: `Expected: "  effectedInjuries: [InjuryType!]!"  Received: "  id: ID!"`.

## Gate
- `npx jest src/models/loot-item.model.spec.ts --selectProjects unit`: 5/5.
- `npx jest src/models --selectProjects unit`: 16 suite, 129/129.
- `npx tsc --noEmit`: 0 errori.
- `npx prettier --check` ed `npx eslint` su `loot-item.model.ts` e `loot-item.model.spec.ts`: puliti (0 warning dopo la rimozione di `ID`).
- `git diff b3c7923..HEAD -- src/schema.gql`: una sola riga aggiunta (`+  effectedInjuries: [InjuryType!]!`). `git status --short` vuoto dopo i commit. Nessun trailer nei commit; `dist/` non toccato (nessun build eseguito).

## Deviazioni
- Boy Scout: rimosso l'import `ID` inutilizzato da `loot-item.model.ts` nel commit GREEN (warning `@typescript-eslint/no-unused-vars` pre-esistente, file già in modifica). Nessun'altra deviazione dal piano.
