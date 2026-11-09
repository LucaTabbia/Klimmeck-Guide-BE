---
phase: quick-261109-inj
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/models/loot-item.model.ts
  - src/models/loot-item.model.spec.ts
  - src/schema.gql
autonomous: true
requirements: [BE-CONTENT-05]

must_haves:
  truths:
    - "LootItem has canHeal: an array of InjuryType, default [], validated by the Mongoose enum (an unknown value fails validateSync)"
    - "The GraphQL type LootItem exposes canHeal: [InjuryType!]! (sorted schema: right after buyPrice)"
    - "LootItemInput accepts an optional canHeal list (not emitted in schema.gql: the input is not used by any resolver today)"
    - "Nothing else changes on the wire; the loot items service keeps returning the documents as they are"
  artifacts:
    - path: "src/models/loot-item.model.ts"
      contains: "canHeal"
    - path: "src/models/loot-item.model.spec.ts"
      contains: "canHeal"
    - path: "src/schema.gql"
      contains: "canHeal: [InjuryType!]!"
---

# Quick 261109-inj: `canHeal` sui LootItem

Regola dell'utente (2026-11-09): i lootItem devono avere un campo, lista di InjuryType, che definisce quali ferite possono curare gli oggetti di tipo heal. Il quick task era partito con un nome nuovo per il campo; l'utente lo ha corretto lo stesso giorno («il campo esisteva già! Dobbiamo riusare quel campo, non aggiungerne uno nuovo»): il campo è `canHeal`, già presente a DB sui vecchi oggetti heal, e questo piano è aggiornato di conseguenza (la cartella del quick task e il ramo conservano il nome iniziale perché sono id). Solo il campo (modello, schema, input admin): la meccanica di cura arriva in una fase dedicata. Il contenuto degli oggetti heal viene scritto a DB dall'orchestratore dopo la revisione dell'utente. Quick task gemello nel repo FE sullo stesso nome di branch (`feat/loot-effected-injuries`): la FE legge il campo con lo stesso nome e mostra «Cura: …» sugli oggetti heal.

## Oggi
- `src/models/loot-item.model.ts`: `@ObjectType() @Schema() class LootItem extends AssetItem { power: number (Int); effect: EffectType (String) }`; `LootItemInput` (`@InputType`, non usato da alcun resolver → non emesso in `schema.gql`).
- `src/models/enums/injury-type.enum.ts`: 28 valori, già registrato come enum GraphQL (`enum InjuryType` in `schema.gql`, usato da `CharacterStatus.injuries: [InjuryType!]!`).
- `src/schema.gql` è generato code-first (`autoSchemaFile` in `app.module.ts`, `sortSchema: true`): i campi sono in ordine alfabetico; il file viene riscritto al boot dell'app. L'executor non avvia l'app: aggiorna il file a mano nella posizione ordinata e l'orchestratore conferma al boot reale che `git diff --exit-code src/schema.gql` resta vuoto.
- `src/lootItems/loot-items.service.ts` restituisce i documenti Mongoose così come sono: il campo passa da solo.

## Task
1. RED `src/models/loot-item.model.spec.ts` (nuovo, progetto `unit`): (a) `LootItemSchema.path('canHeal')` è un array di stringhe con `enumValues` = `Object.values(InjuryType)` e default `[]` (un documento costruito con `new (mongoose.model(...))` senza il campo vale `[]`); (b) `validateSync()` fallisce con un valore fuori enum (`'brokenWing'`) e passa con `['deepCut', 'infection']`; (c) contratto del file: `src/schema.gql` contiene la riga `  canHeal: [InjuryType!]!` dentro `type LootItem` subito dopo `  buyPrice: Coins` (leggi il blocco `type LootItem {…}` e verifica l'ordine). Esegui `npx jest src/models/loot-item.model.spec.ts --selectProjects unit` e incolla i fallimenti nel SUMMARY.
2. GREEN: in `LootItem` aggiungi `@Field(() => [InjuryType]) @Prop({ type: [String], enum: Object.values(InjuryType), default: [] }) canHeal: InjuryType[];` (commenti in italiano: «ferite che un oggetto heal può curare (regola utente 2026-11-09); la meccanica arriva in una fase dedicata» e «campo già presente a DB sui vecchi oggetti heal: riusato (utente 2026-11-09)»); in `LootItemInput` aggiungi `@Field(() => [InjuryType], { nullable: true }) canHeal?: InjuryType[] | null;`; in `src/schema.gql` inserisci `  canHeal: [InjuryType!]!` dopo `  buyPrice: Coins` nel blocco `type LootItem` (nessun altro cambiamento al file). Se il file del modello non passa già Prettier, formattalo in un commit `style(models)` separato PRIMA della modifica (precedente 261105-hea).
3. Gate: `npx tsc --noEmit` (0 errori); `npx prettier --check` ed `npx eslint` sui soli file toccati (mai `npm run lint`); `npx jest src/models --selectProjects unit` verde; `git status --short` vuoto dopo i commit.

## Commit
- `test(models): expect the injuries a heal item can cure` (RED)
- `feat(models): add the injuries a heal item can cure to loot items` (GREEN, modello + schema.gql)
- `docs(quick): record 261109-inj` (SUMMARY)

Correzione del nome (stesso giorno, in TDD): `test(models): expect the canHeal field on loot items` (RED), `refactor(models): reuse canHeal for the injuries a heal item cures` (GREEN, modello + schema.gql), `docs(quick): record the canHeal rename in 261109-inj` (PLAN + SUMMARY).
Subject ≤ 72 byte, nessun trailer, file aggiunti per nome.

## Fuori scope
Meccanica di cura (nessun uso oggetti oggi), contenuto a DB (orchestratore), resolver admin per i loot item, modifiche alla FE (quick task gemello).
