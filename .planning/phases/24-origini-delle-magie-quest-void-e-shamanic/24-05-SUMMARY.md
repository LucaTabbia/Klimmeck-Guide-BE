---
phase: 24-origini-delle-magie-quest-void-e-shamanic
plan: 05
subsystem: spells
tags: [spell-model, sdl, min-level, boot-reporter]
requires: ["24-04"]
provides:
  - "Spell senza minXpToLearn in modello, SDL, fixture e lettori (resta solo a DB, schema strict)"
  - "Pin SDL type Spell: dieci campi, minLevelToLearn: Int! e origin: String!"
  - "SpellCatalogueReporter (OnApplicationBootstrap) in SpellsModule, isServableSpell, unservableSpellCount"
affects: [24-07, 24-10, 24-12]
tech-stack:
  added: []
  patterns: ["reporter d'avvio a sola lettura: un WARN col solo conteggio, errore con describeError, il boot non si ferma"]
key-files:
  created:
    - src/spells/spell-catalogue.reporter.ts
    - src/spells/spell-catalogue.reporter.spec.ts
  modified:
    - src/models/spell.model.ts
    - test/fixtures/spell.fixture.ts
    - src/schema.gql
    - src/spells/spells.module.ts
    - src/quests/quests.resolver.int-spec.ts
    - src/spells/spell-fields.int-spec.ts
    - test/app.int-spec.ts
decisions:
  - "Cambio SDL NON additivo: tolta la riga minXpToLearn da type Spell (da dichiarare nel handoff del piano 12, finestra FE)"
  - "isServableSpell riusa isLearnLevel di quest-rewards.ts: una sola regola di validità del livello minimo per quest, oste e reporter"
metrics:
  completed: 2026-11-15
  tasks: 3
  commits: 6
---

# Phase 24 Plan 05: via `minXpToLearn`, reporter delle magie — Summary

Il campo `minXpToLearn` è uscito da modello, SDL, fixture e spec: lo SDL dice una cosa sola (`minLevelToLearn: Int!`). Al boot `SpellCatalogueReporter` legge il catalogo proiettando solo `origin` e `minLevelToLearn` e, se qualche magia non ha un'origine fra le tre o un livello minimo intero ≥ 1, scrive UN WARN col solo numero; un errore di lettura finisce in un `error` con `describeError` e il boot prosegue.

## Commit

| Task | Commit | Subject |
|------|--------|---------|
| 1 RED | bfa4d2fd | test(spells): expect the minimum xp gone from the spell |
| 1 GREEN | 32ba248e | feat(spells): drop the minimum xp from the spell |
| 2 style | ca2b389e | style(spells): format spells.module.ts |
| 2 RED | 54df5be3 | test(spells): expect the boot count of the unservable spells |
| 2 GREEN | f7ca9dcd | feat(spells): count the unservable spells at boot |
| 3 | (questo) | docs(phase-24): record plan 05 progress |

## Riga tolta dallo SDL

`git diff src/schema.gql` del GREEN del Task 1 mostra SOLO `-  minXpToLearn: Int!` dentro `type Spell` (blocco ora di 12 righe: dieci campi più le graffe). Cambio NON additivo: la FE di `develop` che seleziona `minXpToLearn` è rifiutata in validazione da un BE avviato dal ramo (T-24-14, da dichiarare in testa al handoff del piano 12; riavvio del BE e build della FE Phase 23 insieme, a cura dell'orchestratore).

## Fallimenti RED attesi e osservati

- **Task 1** (integration, 2 rossi su 165): il pin di `type Spell` in `test/app.int-spec.ts` riceveva ancora la riga `minXpToLearn: Int!`; in `spell-fields.int-spec.ts` «no longer stores a minimum xp on a spell (D-07)» trovava `minXpToLearn` fra le chiavi del documento salvato (schema che conserva il campo). L'attesa sull'elenco delle chiavi di `buildSpell()` non è stata raggiunta perché la prima `expect` del caso falliva già.
- **Task 2**: `spell-catalogue.reporter.spec.ts` → «Cannot find module './spell-catalogue.reporter'» (suite non eseguita); `test/app.int-spec.ts` → «Test suite failed to run» per lo stesso import mancante. Come atteso.

## Casi verdi al primo colpo (col motivo)

- `quests.resolver.int-spec.ts` «populates prizes.spell and tolerates an orphan spell (D-07)»: il documento GraphQL nuovo (`spell { id name minLevelToLearn origin }`) è valido dal piano 02, e `minLevelToLearn: 15` / `origin: 'arcane'` sono campi già serviti. Conversione richiesta dal piano per togliere il letterale, non un comportamento nuovo.

## Spec convertite fuori elenco

Nessuna: `grep -rl 'minXpToLearn' src test` fuori dalle due prove negative stampa 0 già dopo i file del piano. `src/spells/spell-fields.int-spec.ts` prima del piano non nominava `minXpToLearn` (ora lo nomina solo nella prova negativa dello schema strict).

## Casi nuovi

- `spell-catalogue.reporter.spec.ts` (22 test): `it.each` delle tre origini a livello 1 e 20 (servibili); origine `undefined`, `null`, `''`, `'fire'`, `7` e chiave assente (non servibili); livello `undefined`, `null`, `0`, `2.5`, `'6'` (non servibili); conteggio di un catalogo misto; un solo WARN col testo esatto e il numero 2, senza id né nomi (le magie finte hanno `_id` e `name`); nessun WARN su catalogo sano; `find` che rifiuta → un `error` col testo esatto, nessuna eccezione; argomenti di `find` `toEqual` `[{}, { origin: 1, minLevelToLearn: 1 }]`.
- `test/app.int-spec.ts`: «mounts the spell catalogue reporter and warns about no spell on an empty catalogue (D-07)».

## Verifiche

- `npx jest src/quests/quests.resolver.int-spec.ts src/spells/spell-fields.int-spec.ts test/app.int-spec.ts --selectProjects integration --runInBand`: 3 suite, 165/165; dopo il Task 2 `test/app.int-spec.ts src/spells/spell-fields.int-spec.ts`: 2 suite, 112/112.
- `npx jest src/spells/spell-catalogue.reporter.spec.ts --selectProjects unit`: 22/22.
- `npx tsc --noEmit -p tsconfig.json` 0; prettier pulito ed eslint senza errori sui file toccati (un warning preesistente `no-base-to-string` in `test/app.int-spec.ts:1251`, fuori scope); `git diff --exit-code src/schema.gql` pulito dopo il commit; `grep -c minXpToLearn src/schema.gql` 0; `awk '/^type Spell \{/,/^\}/' src/schema.gql | wc -l` 12; `grep -c SpellCatalogueReporter src/spells/spells.module.ts` 2; `process.env` 0 nel reporter; `pgrep -fl 'bin/jest'` vuoto.

## Deviations from Plan

- **[Boy Scout / zero duplicazione]** `isServableSpell` riusa `isLearnLevel` esportato da `src/quests/outcomes/rewards/quest-rewards.ts` (piano 04) invece di riscrivere il predicato «intero ≥ 1». Import da `src/quests` verso `src/spells` (solo funzione pura; nessun ciclo di moduli Nest, boot reale verde).
- Caso in più nel reporter: «counts as unservable a spell whose origin key is missing (D-01)» (il `it.each` su `undefined` passa la chiave esplicita) e «counts the unservable spells of a catalogue (D-01, D-07)» per `unservableSpellCount`.

Nessun'altra deviazione.

## Note per i piani seguenti

- `minXpToLearn` resta nominato SOLO in `test/app.int-spec.ts` (`not.toMatch`) e `src/spells/spell-fields.int-spec.ts` (schema strict); il migratore del piano 10 (`src/migrations/spell-origins/`) lo legge dalla collection grezza.
- Il reporter usa `Object.values(SpellOrigin)`: se il piano 10 o altri aggiungono origini, il reporter le segue senza modifiche.

## Self-Check: PASSED
