---
phase: 19-revisione-dei-modelli
plan: 02
subsystem: models
tags: [nemici, debolezze, SDL non additivo, migrazione, D-01, D-22]
requires: [19-01]
provides:
  - tipo `Weaknesses` / `WeaknessesSchema` / `WeaknessesInput` (`src/models/common/weaknesses.model.ts`)
  - `Enemy.weaknesses { base, energy }` su modello, input, SDL e sei lettori
  - `CombatEnemy.weaknesses { base: DamageType[]; energy: EnergyType[] }` (contratto del motore)
  - passo `EnemyWeaknessesStep` (primo di `STEPS`) e builder `legacyEnemy`
affects: [19-03, 19-04, 19-23]
tech-stack:
  added: []
  patterns: [sotto-documento con default a funzione, passo a pipeline con guardia di assenza]
key-files:
  created:
    - src/models/common/weaknesses.model.ts
    - src/models/enemy.schema.spec.ts
    - src/migrations/model-review/enemy-weaknesses.step.ts
    - src/migrations/model-review/enemy-weaknesses.step.int-spec.ts
  modified:
    - src/models/enemy.model.ts
    - src/quests/outcomes/resolution-loader.service.ts
    - src/quests/outcomes/combat/combat-context.ts
    - src/quests/outcomes/combat/combat-resolver.ts
    - src/quests/generation/enemy-candidate.ts
    - src/quests/generation/enemy-pool.ts
    - src/quests/generation/recommended-loot.ts
    - test/fixtures/enemy.fixture.ts
    - test/quests/generation-world.ts
    - test/travel/ambush-world.ts
    - test/app.int-spec.ts
    - src/schema.gql
    - src/migrations/model-review/legacy-fixtures.ts
    - src/migrations/model-review/model-review.module.ts
decisions:
  - Il contesto del combattimento passa al motore solo debolezze dei due enum (le altre sono scartate in lettura), come già fa per effetti, tipi d'equipaggiamento e usi dei gioielli
  - Il candidato del generatore tiene le liste come stringhe (nessun filtro), come prima
metrics:
  completed: 2026-11-11
  tasks: 3
  files: 32
---

# Phase 19 Plan 02: Debolezze dei nemici in un sotto-documento — Summary

`Enemy.weaknesses { base, energy }` sostituisce le due liste su modello, input, SDL (cambio non additivo dichiarato nel boot reale), generatore e combattimento; il passo `EnemyWeaknessesStep` sposta le liste con una scrittura a pipeline, idempotente, e conta i valori fuori enum.

## Commit

| Task | Commit | Subject |
|------|--------|---------|
| 1 RED | `e640f996` | `test(models): pin the enemy weaknesses sub-document` |
| 1 GREEN | `0d58ebf8` | `feat(models): group the enemy weaknesses into one sub-document` |
| 2 RED | `98d03440` | `test(migrations): pin the enemy weaknesses step` |
| 2 GREEN | `7c8a4d74` | `feat(migrations): add the enemy weaknesses step` |
| 3 | (questo e il successivo) | `docs(phase-19): summarize plan 02`, `docs(phase-19): record plan 02 progress` |

Nessun trailer in nessun commit (controllo a `0` dopo ognuno).

## Evidenza RED

- **Task 1, unit** — 15 falliti su 35 nelle cinque spec: `enemy.schema.spec.ts` 3/3 (`weaknesses` `undefined`: path dello schema assente), `combat-context.spec.ts` 5 (attesi nella forma nuova, il contesto porta ancora le due liste), `enemy-candidate.spec.ts` 1 (`reads a lean enemy without optional fields`), `recommended-loot.spec.ts` 5 (il lettore legge i due nomi vecchi, `undefined` sui candidati nuovi), `resolution-loader.service.spec.ts` 1 (proiezione vecchia).
- **Task 1, boot reale** — `writes the enemy weaknesses in place of the two lists (D-01)` fallito sul blocco esatto `type Enemy` (ancora con le due liste).
- **Task 2** — `Cannot find module './enemy-weaknesses.step'` (0 test eseguiti, passo assente).
- **Verdi al primo colpo (annotati):** `recommends nothing from an enemy without the weaknesses sub-document (D-01)` (il candidato di un nemico senza il campo dava già due liste vuote: il caso pinna il percorso `enemyCandidateOf` → `recommendedLootOf`, non un comportamento nuovo); le otto spec dove cambia solo la forma della fixture (`enemy-pool`, `generated-quest-draft`, `quest-composition`, `placeholder-combat-resolver`, `dungeon-context`, `placeholder-dungeon-resolver`, `guard-encounter`, `ambush-enemies`) e le due int-spec (`quest-generator`, `quest-result.resolver`) non leggono le debolezze: jest non controlla i tipi (`tsc` sì, verde al GREEN).

## Esito delle prove

- `npx jest src/models src/quests/generation src/quests/outcomes src/travel/ambush --selectProjects unit` → 78 suite, 897 test verdi.
- `npx jest --selectProjects unit` (controllo di wave) → 261 suite, 3325 test verdi.
- `npx jest test/app.int-spec.ts --selectProjects integration --runInBand` → 86/86 (85 + il caso nuovo); col passo registrato il boot reale resta verde sul replica set vuoto.
- `npx jest src/quests --selectProjects integration --runInBand` (controllo di wave) → 35 suite, 499 test verdi, 176 s. **Nota:** lo strumento ha spostato da solo il comando in background allo scadere dei 180 s; nessun altro jest è partito finché non è finito.
- `npx jest src/travel/ambush src/travel/travel.service.int-spec.ts --selectProjects integration --runInBand` (le int-spec che usano `ambush-world`/`enemy.fixture` fuori da `src/quests`) → 5 suite, 73 test verdi.
- `npx jest src/migrations/model-review test/app.int-spec.ts --selectProjects integration --runInBand` → 92/92 (6 del passo + 86); unit della cartella 4/4.
- `npx tsc --noEmit -p tsconfig.json` → 0 dopo ogni task di codice. Prettier ed eslint sui file toccati, uno per uno: puliti (resta il warning preesistente di `test/app.int-spec.ts`, ora alla riga 990).
- `pgrep -fl 'bin/jest'` vuoto a fine di ogni task.

## SDL rigenerato (ordine reale)

`git diff src/schema.gql` mostra solo quattro punti, in ordine alfabetico come atteso (Assumption A1 confermata, nessuna stringa corretta):

- `enum DamageType {\n  blunt\n  cut\n  pierce\n}` fra `input CreateCharacterInput` e `type Damages`;
- `type Enemy`: via le due liste, `weaknesses: Weaknesses!` fra `spells` e `xp`;
- `enum EnergyType { acid cold enhancing fire force lightning necrotic poison psychic radiant thunder }` (valori in ordine alfabetico, non quello dell'enum TypeScript) fra `type EnergyDamage` e `input EquipItemRequest`;
- `type Weaknesses {\n  base: [DamageType!]!\n  energy: [EnergyType!]!\n}` ultimo blocco del file, dopo `type User`.

`WeaknessesInput` ed `EnemyInput` non sono nello SDL (asserito).

## Path dell'errore di validazione

`validateSync()` di un nemico con `weaknesses.base: ['laser']` riporta l'errore sul path **`weaknesses.base.0`** (unica chiave di `errors`).

## Spec e fixture toccate

Schema nuova: `src/models/enemy.schema.spec.ts`. Boot reale: `test/app.int-spec.ts`. Lettori (14 spec, quelle del grep di gate): `recommended-loot`, `enemy-candidate`, `enemy-pool`, `generated-quest-draft`, `quest-composition`, `quest-generator.int-spec`, `combat-context`, `placeholder-combat-resolver`, `dungeon-context`, `placeholder-dungeon-resolver`, `guard-encounter`, `resolution-loader.service`, `quest-result.resolver.int-spec`, `ambush-enemies`. Fixture: `test/fixtures/enemy.fixture.ts`, `test/quests/generation-world.ts`, `test/travel/ambush-world.ts`.

## Criteri di accettazione

| Criterio | Esito |
|----------|-------|
| i due nomi vecchi in `src` e `test` solo sotto `src/migrations/model-review/` | sì (fuori dalla cartella: 0 righe) |
| `type Weaknesses {`, `weaknesses: Weaknesses!`, `enum DamageType {`, `enum EnergyType {` nello SDL | 1, 1, 1, 1 |
| `grep -c "WeaknessesInput" src/schema.gql` | 0 |
| `grep -c "D-01)" src/models/enemy.schema.spec.ts` = 3 | 3 |
| `damages.model.ts` non toccato | 0 righe di diff |
| `grep -c "D-01)" …/enemy-weaknesses.step.int-spec.ts` = 5 | 5 |
| `grep -c "D-12)" …/enemy-weaknesses.step.int-spec.ts` = 1 | **2** — l'intestazione obbligatoria della cartella conta una riga in più (nota del piano 01); un solo titolo nomina D-12 |
| `EnemyWeaknessesStep` in `model-review.module.ts` ≥ 2 | 2 |
| `.collection` ≥ 1 e `updateMany(` ≥ 1 nel passo | 1, 1 |
| intestazione una tantum su ogni file della cartella | sì |
| righe `19-02-01..03` della VALIDATION `✅ green` | 3 |

## Deviazioni dal piano

**1. [Regola 2 — tipo del contratto del motore] Il contesto del combattimento filtra le debolezze sui due enum**
- **Trovato in:** Task 1.
- **Causa:** il piano fissa `CombatEnemy.weaknesses: { base: DamageType[]; energy: EnergyType[] }`, ma lo snapshot lean è non tipizzato: senza filtro il tipo sarebbe un cast falso.
- **Scelta:** `knownOf(...)` in `combat-context.ts` (stesso schema dei `KNOWN_*` già presenti nel file per effetti, tipi d'equipaggiamento e usi dei gioielli): al motore arrivano solo valori dei due enum, lista assente o nulla = vuota. Due casi nuovi in `combat-context.spec.ts`: `reads an enemy without the weaknesses sub-document as two empty lists (D-01)` e `keeps only the weaknesses of the two enums in the combat context (D-22)`.
- **Confine:** vale solo per il motore. Sul filo e a DB nulla viene sanificato (Pitfall 6 resta com'era deciso: il passo conta i valori fuori enum, la prova a secco deve dare 0). Il candidato del generatore tiene le stringhe com'erano.

**2. [Ordine dei commit di chiusura e forma di STATE] come nel piano 01**
- SUMMARY in un commit suo prima del bookkeeping; `Plan: 2 of 23` (forma non riempita): il `grep -q "Plan: 02 of 23"` del piano non trova la riga, è atteso.

**3. [Conteggio del piano] `files_modified` non elenca le 14 spec dei lettori**
- Il piano le rimanda al grep di gate («più le spec elencate dal grep di gate»): toccate tutte e sole quelle, elenco sopra.

Nessuna correzione agli helper `insertLegacy`/`rawById`: la prima int-spec che li esercita è verde senza toccarli. Nessuna decisione architetturale (Regola 4).

## Note per i piani successivi

- **Builder della forma vecchia:** `legacyEnemy(overrides)` in `legacy-fixtures.ts`; un override a `undefined` **toglie** il campo dal documento (il driver altrimenti lo salverebbe come `null`). Per un nemico «già migrato» nella int-spec: i due campi vecchi a `undefined` più `weaknesses`. Il piano 19-03 può riusarlo per le magie incorporate (`spells: [...]` come override).
- **Forma di un passo a una sola scrittura:** `found` = `countDocuments({})`, `migrated` = `modifiedCount` di un `updateMany` con filtro di guardia, `alreadyDone` = `found - migrated`, `unmatched` contato dopo la corsa su tutta la collection (anche sui documenti già migrati).
- **`STEPS`** oggi è `[EnemyWeaknessesStep]`; `imports` del modulo ha un solo `forFeature` con `Enemy`: il 19-03 accoda la sua classe e, se legge il catalogo delle magie, aggiunge `Spell` allo stesso `forFeature`.
- **Boot reale di test:** col passo registrato logga una riga `Revisione dei modelli, debolezze dei nemici: trovati 0, …` (collection vuota); `test/app.int-spec.ts` conta 86 test.
- **`harness.clearDatabase()`** in `afterEach` basta a isolare i casi del passo.
- **Limite noto del conteggio fuori enum:** `unmatched` conta gli elementi di lista fuori enum; una lista vecchia salvata come valore non-lista (es. una stringa) verrebbe copiata tale e quale e non contata. L'inventario dell'11 novembre non ne ha; la prova a secco dell'orchestratore può aggiungere il controllo del tipo se lo vuole.
- **jest non controlla i tipi** (le spec con la forma vecchia passano finché non leggono il campo): per i prossimi cambi di forma la rete vera è `tsc` più il grep di gate.
- BE-MODEL-01 è chiuso lato codice; la spunta in REQUIREMENTS resta al piano di chiusura.

## Stub noti

Nessuno.

## Self-Check: PASSED

- I quattro file creati esistono; i quattro commit `e640f996`, `0d58ebf8`, `98d03440`, `7c8a4d74` sono in `git log`.
