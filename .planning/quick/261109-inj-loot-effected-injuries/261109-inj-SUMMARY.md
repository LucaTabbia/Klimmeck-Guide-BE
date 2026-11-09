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
  - { hash: 5838f91, message: "test(models): expect the canHeal field on loot items" }
  - { hash: 1e1999a, message: "refactor(models): reuse canHeal for the injuries a heal item cures" }
---

# Quick 261109-inj: `canHeal` sui LootItem

`LootItem` ha il campo `canHeal: InjuryType[]` (Mongoose `[String]` con `enum: Object.values(InjuryType)`, default `[]`): un valore fuori enum fa fallire `validateSync()`, `['deepCut', 'infection']` passa. Sul filo `type LootItem` espone `canHeal: [InjuryType!]!` subito dopo `buyPrice: Coins` (schema ordinato, riga inserita a mano: l'orchestratore conferma al boot reale che `git diff --exit-code src/schema.gql` resta vuoto). `LootItemInput` accetta `canHeal` opzionale (non emesso: l'input non è usato da alcun resolver). Il servizio dei loot item restituisce i documenti così come sono: il campo passa da solo. La meccanica di cura arriva in una fase dedicata; il contenuto dei 28 oggetti heal è scritto a DB dall'orchestratore.

## Correzione dell'utente (2026-11-09)
Il quick task era nato con un nome nuovo per il campo. L'utente ha corretto lo stesso giorno: «il campo esisteva già! Dobbiamo riusare quel campo, non aggiungerne uno nuovo». A DB 19 vecchi oggetti heal portavano già `canHeal`, come lista mista di ferite ed effetti (il campo era fuori schema: l'export della Phase 11 lo scartava fra i `droppedFields`). Il campo del modello è quindi `canHeal`, stesso tipo e stessa semantica; l'orchestratore ha riscritto `canHeal` su tutti i 28 oggetti heal con liste di soli `InjuryType` (37 valori, nove nuovi dal quick 261109-inj2 su questo ramo). La cartella del quick task e il ramo (`feat/loot-effected-injuries`, gemello FE con lo stesso nome) conservano il nome iniziale perché sono id. Commit della correzione: `5838f91` (RED), `1e1999a` (GREEN), più il commit docs di questo file.

## Modifiche
- `loot-item.model.ts`: `@Field(() => [InjuryType]) @Prop({ type: [String], enum: Object.values(InjuryType), default: [] }) canHeal` su `LootItem` (commento con la regola utente 2026-11-09 e la nota sul campo riusato); `@Field(() => [InjuryType], { nullable: true }) canHeal?: InjuryType[] | null` su `LootItemInput`; import `ID` morto rimosso (Boy Scout, warning eslint pre-esistente). File formattato con Prettier in un commit di stile separato prima della prima modifica (solo la riga vuota finale), come da regola.
- `loot-item.model.spec.ts` (nuovo, progetto `unit`, 5 casi, sonda `CanHealLootItemProbe`): path dello schema (`Array` di `String` con `enumValues` = `Object.values(InjuryType)`), default `[]` su un documento costruito dalla fixture `buildLootItem`, `validateSync()` rosso su `'brokenWing'` (errore su `canHeal.0`) e verde su `['deepCut', 'infection']`, contratto del file `src/schema.gql` (la riga `  canHeal: [InjuryType!]!` segue `  buyPrice: Coins` nel blocco `type LootItem`).
- `schema.gql`: una sola riga nel blocco `type LootItem` (prima inserita dopo `effect: String!` col nome iniziale, poi spostata nella posizione ordinata di `canHeal`, dopo `buyPrice: Coins`); nessun newline finale aggiunto (il file non lo aveva).

## RED
Prima stesura (nome iniziale), `npx jest src/models/loot-item.model.spec.ts --selectProjects unit` prima della modifica: `Tests: 5 failed, 5 total` — path assente (`TypeError: Cannot read properties of undefined (reading 'instance')`), default `Expected: []  Received: undefined`, validazione `Received []` (campo ignorato dallo strict mode), valori noti `Received: undefined`, SDL `Received: "  id: ID!"`.

Correzione (`canHeal`), stesso comando prima del rename: `Tests: 5 failed, 5 total`.
- `declares the injuries…`: `TypeError: Cannot read properties of undefined (reading 'instance')` (path `canHeal` assente).
- `defaults canHeal to an empty list`: `Expected: []  Received: undefined`.
- `rejects an injury outside the enum`: `Expected ["canHeal.0"]  Received []` (campo ignorato dallo strict mode).
- `accepts known injuries`: `Expected: ["deepCut", "infection"]  Received: undefined`.
- `exposes canHeal right after buyPrice…`: `Expected: "  canHeal: [InjuryType!]!"  Received: "  description: String!"`.

## Gate
Dopo il rename:
- `npx jest src/models/loot-item.model.spec.ts --selectProjects unit`: 5/5.
- `npx jest src/models --selectProjects unit`: 17 suite, 132/132 (16 suite, 129/129 alla prima stesura, prima del quick 261109-inj2).
- `npx tsc --noEmit`: 0 errori.
- `npx prettier --check` ed `npx eslint` su `loot-item.model.ts` e `loot-item.model.spec.ts`: puliti.
- `git diff 7722bc0..1e1999a -- src/schema.gql`: una riga aggiunta (`+  canHeal: [InjuryType!]!` dopo `buyPrice: Coins`) e una rimossa (la riga col nome iniziale); byte finali del file intatti. `grep -rn` del nome iniziale in `src` e in questa cartella: 0 hit. `git status --short` vuoto dopo i commit. Nessun trailer nei commit; `dist/` non toccato (nessun build eseguito).

## Deviazioni
- Boy Scout: rimosso l'import `ID` inutilizzato da `loot-item.model.ts` nel commit GREEN della prima stesura (warning `@typescript-eslint/no-unused-vars` pre-esistente, file già in modifica).
- Correzione del nome del campo su richiesta dell'utente (vedi sopra), fatta in TDD (RED `5838f91`, GREEN `1e1999a`). Il subject suggerito per il GREEN superava i 72 byte: accorciato a `refactor(models): reuse canHeal for the injuries a heal item cures` (66 byte), stesso significato.
