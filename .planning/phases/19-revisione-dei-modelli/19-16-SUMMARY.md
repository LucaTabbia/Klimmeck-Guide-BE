---
phase: 19-revisione-dei-modelli
plan: 16
subsystem: characters
tags: [maxActiveSpells, resolve-field, D-08, D-24]
requires: [19-15]
provides:
  - "`CharacterStatusResolver.maxActiveSpells` (resolve field puro sul genitore, `maxActiveSpellsFor(xp, title)`)"
  - "`CharacterStatus` senza proprietà né virtual di `maxActiveSpells`; `CharacterStatusSchema` da `SchemaFactory.createForClass` senza IIFE"
  - "resolver registrato in `CharactersModule` e in `test/authz/characters-test-app.ts`; casi sul filo su query `character` e subscription `characterUpdated`"
affects: [19-17, 19-20, 19-23]
tech-stack:
  added: []
  patterns: [resolve field puro sul genitore in un resolver dedicato al sotto-tipo]
key-files:
  created:
    - src/characters/character-status.resolver.ts
    - src/characters/character-status.resolver.spec.ts
  modified:
    - src/characters/characters.module.ts
    - src/models/character/character-status.model.ts
    - src/models/character/active-spell-slots.ts
    - src/models/character/active-spell-slots.spec.ts
    - src/characters/spells/spell-state.wire.int-spec.ts
    - src/characters/character-updated.subscription.int-spec.ts
    - test/authz/characters-test-app.ts
    - test/fixtures/fixtures.spec.ts
decisions:
  - "Tre righe rappresentative nella spec del resolver (rookie → 0, mage a 20000 → 1, legend a 40000 → 4): la tabella completa resta pinnata su `maxActiveSpellsFor` nella spec degli slot, nessun modulo di test condiviso"
metrics:
  completed: 2026-11-11
  tasks: 2
  files: 10
---

# Phase 19 Plan 16: `maxActiveSpells` da virtual a resolve field — Summary

`CharacterStatus.maxActiveSpells: Int!` è servito da un resolve field puro sul genitore (`CharacterStatusResolver`, xp e titolo dello status) e non esiste più sul modello: via la proprietà della classe e la virtual di Mongoose. Lo SDL è identico byte per byte, nessun dato da migrare, nessun cambio per la FE. Metà «slot» di BE-MODEL-06.

## Commit

| Task | Commit | Subject (caratteri) |
|------|--------|---------------------|
| 1 RED | `62fa2fbc` | `test(characters): pin the computed max active spells field` (58) |
| 1 GREEN | `68c38dff` | `refactor(characters): compute max active spells in a resolve field` (66) |
| 2 | (questo e il successivo) | `docs(phase-19): summarize plan 16`, `docs(phase-19): record plan 16 progress` |

Ogni subject contato PRIMA del commit; nessun trailer (controllo a `0` dopo ognuno).

## Evidenza RED (`62fa2fbc`)

- **Unit, rossi attesi:**
  - `character-status.resolver.spec.ts` non si carica (`Cannot find module './character-status.resolver'`): quattro casi non eseguiti (tre righe di `resolves the active spell slots of %i xp as %s to %i (D-08)` e `reads a status without xp as 0 xp (D-08)`).
  - `active-spell-slots.spec.ts` › `declares no persisted or virtual max active spells on the status schema (D-08)`: `virtualpath('maxActiveSpells')` ritorna l'oggetto della virtual (`{ getters: [...], path: 'maxActiveSpells', ... }`) invece di `null`.
- **Verdi al primo colpo, col motivo:**
  - `test/fixtures/fixtures.spec.ts` › `defaults to a rookie with 20000 xp: no spell slot until the mage rank (D-08)`: ora legge `maxActiveSpellsFor`, che esisteva già (il caso pinna la fixture, non il resolver).
  - `spell-state.wire.int-spec.ts` › `serves the computed max active spells of the character (D-08)` e `character-updated.subscription.int-spec.ts` › `serves the computed max active spells on the character stream (D-08)`: sul filo il campo rispondeva già dalla virtual (previsto dal piano). La prova che dopo il GREEN il valore viene dal resolver è il caso dello schema (virtual assente) insieme a questi due casi verdi nell'harness dove il resolver è registrato.
- Fra RED e GREEN `tsc` rosso per il solo modulo del resolver non ancora scritto.

## Cosa ritorna Mongoose per un path e una virtual assenti

- `Schema.path('<nome assente>')` → `undefined` (asserzione `toBeUndefined()`).
- `Schema.virtualpath('<nome assente>')` → `null` (asserzione `toBeNull()`).

## Cosa è cambiato (`68c38dff`)

- **`src/characters/character-status.resolver.ts`** (nuovo): `@Resolver(() => CharacterStatus)` con `@ResolveField('maxActiveSpells', () => Int)` che ritorna `maxActiveSpellsFor(status.xp ?? 0, status.title)`. Nessuna dipendenza iniettata, nessuna cache, nessun contesto.
- **`character-status.model.ts`:** via `@Field(() => Int) maxActiveSpells`, via la virtual e l'IIFE (`CharacterStatusSchema = SchemaFactory.createForClass(CharacterStatus)`), via l'import di `maxActiveSpellsFor` rimasto senza usi. `grep -c "maxActiveSpells"` sul file → 0.
- **Registrazione:** `CharacterStatusResolver` nei provider di `CharactersModule` e di `createCharactersTestApp` (Pitfall 9).
- **SDL:** `git diff --exit-code src/schema.gql` → 0 dopo il boot reale; il blocco esatto `type CharacterStatus` di `test/app.int-spec.ts` non è stato toccato.
- Il tetto di `equipSpell` (`maxActiveSpellsExpression`, `active-spell.updates.ts`) non ha diff.

## Esito delle prove (dopo il commit GREEN)

- `npx jest --selectProjects unit` → **271 suite, 3431 test** verdi, eseguita prima del commit GREEN (270 / 3437 dopo il piano 15: +1 suite; −11 casi della virtual, +1 caso dello schema, +4 del resolver).
- Progetto integration intero, a pezzi, in primo piano, un jest alla volta, nessun comando spostato in background — **146 suite, 2013 test, tutti verdi** (146 / 2011 dopo il piano 15; +2 casi sul filo):
  - `src/characters test/app.int-spec.ts` → 24 suite, 472 test (79 s); boot reale 90 test, SDL identico.
  - `src/travel src/shops src/economy src/cities src/lore src/models test/shops test/fixtures` → 29 suite, 419 test (103 s).
  - `src/quests` → 35 suite, 512 test (161 s).
  - resto (i 58 file di `jest --listTests` fuori dai tre pezzi, `src/migrations` compreso) → 58 suite, 610 test (114 s).
- `npx tsc --noEmit -p tsconfig.json` → 0 dopo il GREEN. Prettier ed eslint sui file toccati, uno per uno: puliti. `pgrep -fl 'bin/jest'` vuoto a fine task.

## Criteri di accettazione

| Criterio | Esito |
|----------|-------|
| `grep -c "maxActiveSpells" src/models/character/character-status.model.ts` | 0 |
| `grep -c "CharacterStatusResolver"` in `characters.module.ts` / `characters-test-app.ts` | 2 / 2 |
| `maxActiveSpells: Int!` nel blocco `type CharacterStatus` di `src/schema.gql` | 1 |
| `grep -c "D-08)"` in `character-status.resolver.spec.ts` / `spell-state.wire.int-spec.ts` | 2 / 1 |
| `git diff HEAD~2 --stat` su `expected-handlers.ts`, `handler-fixtures.ts`, `active-spell.updates.ts` | 0 righe |
| `git diff --exit-code src/schema.gql` | 0 |

## Deviazioni dal piano

**1. [Boy Scout] commento di `active-spell-slots.ts` aggiornato (file fuori da `files_modified`)**
- Il commento sopra `ACTIVE_SPELL_SLOT_THRESHOLDS` diceva «la virtual e il filtro di equipSpell non possono divergere»: ora «il resolve field e il filtro…». Una sola riga di commento, nessun codice; nello stesso commit GREEN.

**2. [Tipi] cast nel caso della fixture**
- `buildCharacter().status.title` è tipizzato `string`: il caso di `fixtures.spec.ts` passa `status.title as TitleType` a `maxActiveSpellsFor` e usa `TitleType.mage` per la seconda asserzione.

**3. [Ordine dei commit di chiusura e forma di STATE] come nei piani 01–15**
- SUMMARY in un commit suo prima del bookkeeping; `Plan: 16 of 23`.

Nessuna decisione architetturale (Regola 4).

## Problemi rimandati (fuori scope, non corretti)

- Restano dai piani precedenti: `CLAUDE.md` del repo BE con il nome vecchio dell'equipaggiamento nella sezione generata; `cities { pointsOfInterest { id } }` non popolato da `findAll`.
- Il commento di `test/fixtures/character.fixture.ts:32` cita `maxActiveSpells` come nome del concetto (resta corretto: è il nome del campo sul filo).

## Note per i piani successivi

- **Harness:** `createCharactersTestApp` è l'unico harness dove `status { maxActiveSpells }` è selezionabile oltre al boot reale; un harness nuovo che costruisce lo schema con `Character` senza `CharacterStatusResolver` NON ha il campo (una selezione lì fallisce in validazione). Chi aggiunge un harness che serve il personaggio alla FE registra anche questo resolver.
- **19-17 (passo D-07):** il campo non è mai stato persistibile via Mongoose; il passo conta comunque ed elimina un eventuale `status.maxActiveSpells` grezzo (atteso 0, inventario dell'11 novembre: «mai persistito»). Ora che la virtual non c'è più, un valore grezzo a DB non verrebbe servito (il resolver calcola sempre da xp e titolo).
- **19-20 (contrazione):** `CharacterStatusSchema` è di nuovo una semplice costante; il blocco `type CharacterStatus` del boot reale porta ancora `spells: [Spell!]!` e va aggiornato lì.
- **Handoff FE (19-23):** §1 riga D-08 — `CharacterStatus.maxActiveSpells: Int!` invariato sul filo, calcolato; prove: `src/characters/character-status.resolver.spec.ts`, `spell-state.wire.int-spec.ts` (query), `character-updated.subscription.int-spec.ts` (stream: titolo portato a mage → evento con 1). Nessun cambio FE.
- **Conteggi:** unit 271 suite / 3431 test; integration 146 suite / 2013 test (pezzi 24/472, 29/419, 35/512, 58/610); boot reale 90 test; `STEPS` e `forFeature` del migratore invariati; registro dei ref invariato (34).

## Stub noti

Nessuno.

## Threat flags

Nessuna superficie nuova fuori dal threat model: T-19-63 (resolver nel modulo e nell'harness, casi su query e subscription, boot reale verde) e T-19-66 (`git diff --exit-code src/schema.gql` a 0, blocco esatto invariato) mitigati; T-19-64 (campo puro sul genitore) e T-19-65 (tetto di `equipSpell` senza diff) accettati.

## Self-Check: PASSED

- `src/characters/character-status.resolver.ts` e `character-status.resolver.spec.ts` esistono; i commit `62fa2fbc` e `68c38dff` sono in `git log`; `git status --short` vuoto prima di questo documento.
