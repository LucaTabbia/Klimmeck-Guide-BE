---
phase: 19-revisione-dei-modelli
plan: 14
subsystem: models
tags: [lore, imagePath, migratore, enum, pulizia, D-11, D-12, D-20]
requires: [19-13]
provides:
  - "`Lore.imagePath` su modello, `LoreInput` e SDL (non additivo: `Lore.image` tolto)"
  - "`LoreImagePathStep` (settimo in `STEPS`), builder `legacyLore` in `legacy-fixtures.ts`"
  - "`src/models/enums/slot-type.enum.ts` (rename al 100 % + commit `style`), dieci importatori aggiornati"
  - "`item_reference_type.enum.ts` e `notification.model.ts` (`KGNotification`) cancellati"
affects: [19-15, 19-23]
tech-stack:
  added: []
  patterns: [passo del migratore col driver nativo e sola rinomina del campo]
key-files:
  created:
    - src/models/lore.schema.spec.ts
    - src/migrations/model-review/lore-image-path.step.ts
    - src/migrations/model-review/lore-image-path.step.int-spec.ts
  modified:
    - src/models/lore.model.ts
    - test/fixtures/lore.fixture.ts
    - src/lore/lore-related.int-spec.ts
    - src/cities/cities.resolver.int-spec.ts
    - test/app.int-spec.ts
    - src/schema.gql
    - src/migrations/model-review/legacy-fixtures.ts
    - src/migrations/model-review/model-review.module.ts
    - src/models/enums/slot-type.enum.ts
decisions:
  - "«`image` presente» nella guardia del passo vuol dire campo esistente, anche nullo (come D-09 per `quest`): una lore con `image: null` diventa `imagePath: null` e il campo vecchio non resta a DB"
  - "`alreadyDone` = trovati − migrati − ambigui: un documento con entrambi i campi non è contato «già a posto»"
metrics:
  completed: 2026-11-11
  tasks: 3
  files: 25
---

# Phase 19 Plan 14: `Lore.imagePath`, file enum in kebab-case, file morti rimossi — Summary

La lore porta `imagePath` su modello, `LoreInput` e SDL (una sola riga di `type Lore` cambiata, non additiva); il passo `LoreImagePathStep` rinomina il campo dove quello vecchio è presente e quello nuovo assente, conta e lascia i documenti con entrambi, e alla seconda corsa non scrive nulla. `slot_type.enum.ts` è ora `slot-type.enum.ts` con la storia conservata; il file enum vuoto e il modello `KGNotification` non esistono più. Chiude la wave «mondo» (D-13).

## Commit

| Task | Commit | Subject |
|------|--------|---------|
| 1 RED (modello e filo) | `2b534d62` | `test(lore): pin the lore image path` |
| 1 GREEN | `506328e8` | `feat(lore): rename the lore image to imagePath` |
| 1 RED (passo) | `936a04b6` | `test(migrations): pin the lore image path step` |
| 1 GREEN | `aa5914a6` | `feat(migrations): add the lore image path step` |
| 2 | `96c35110` | `refactor(models): rename the slot type enum file to kebab-case` |
| 2 | `ff6d58d8` | `style(models): format slot-type.enum.ts` |
| 2 | `00bd8556` | `refactor(models): drop the empty enum file and the dead notification model` |
| 3 | (questo e il successivo) | `docs(phase-19): summarize plan 14`, `docs(phase-19): record plan 14 progress` |

Nessun trailer in nessun commit (controllo a `0` dopo ognuno).

## Evidenza RED

- **Modello e filo (`2b534d62`)**
  - unit `lore.schema.spec.ts` (1 rosso): `declares the image path of a lore and no other image field (D-11)` — la lista dei path porta `image` al posto di `imagePath`.
  - integration, 12 rossi su 121 in 3 suite: boot reale `writes the lore with its image path and without the global unlocked flag (11 D-25, D-11)` (blocco esatto `type Lore`); `cities.resolver.int-spec.ts` i 2 casi che usano la selezione FE delle città (`Cannot query field "imagePath"`); `lore-related.int-spec.ts` i 9 casi che usano le due query delle lore, compreso il nuovo `serves the image path of a lore (D-11)` (stesso rifiuto di validazione GraphQL).
- **Passo (`936a04b6`)** — la suite `lore-image-path.step.int-spec.ts` non si carica (`Cannot find module './lore-image-path.step'`): cinque casi non eseguiti. Fra RED e GREEN del passo `tsc` è rosso per il solo modulo non ancora scritto.
- Nessun caso verde al primo colpo.

## Cosa è cambiato

- **Modello:** `Lore.imagePath` (`String`, nullable, default `null`) e `LoreInput.imagePath`; `@Schema({ collection: 'lore' })` invariato. Fixture `buildLore` con `imagePath: null`.
- **SDL:** `git diff src/schema.gql` del commit GREEN = la sola riga `image: String` → `imagePath: String` dentro `type Lore`. Blocco esatto nel boot reale: `type Lore {\n  description: String!\n  id: ID!\n  imagePath: String\n  name: String!\n  relatedLore: [Lore!]!\n  type: String!\n}`.
- **Spec sul filo:** le due selezioni «FE verbatim» (`lores { id imagePath type … }`, `cities { … relatedLore { id description imagePath } }`) portano il nome nuovo: la FE Phase 19 deve cambiare `lore_queries.dart` e `city_queries.dart` allo stesso modo.
- **Passo:** `LoreImagePathStep`, label `immagini delle lore`, driver nativo, collection presa da `connection.model(Lore.name).collection` (nessun nome scritto a mano); guardia «`image` esistente (anche nullo) e `imagePath` non esistente»; una sola scrittura di rinomina; `unmatched` = documenti con entrambi i campi, contati con una lettura dopo la scrittura e lasciati identici; `found` = lore della collection, `migrated` = documenti modificati, `alreadyDone` = `found − migrated − unmatched`. Settimo in `STEPS`; `forFeature` del modulo con `Lore`.
- **Pulizia:** `slot_type.enum.ts` → `slot-type.enum.ts`; cancellati `src/models/enums/item_reference_type.enum.ts` (0 byte) e `src/models/notification.model.ts`.

## Elenco reale degli importatori di `SlotType` (10, coincide con il piano; cambiano solo i numeri di riga)

Non-spec (7): `src/quests/outcomes/combat/combat-resolver.ts:8`, `src/quests/outcomes/combat/combat-context.ts:9`, `src/quests/outcomes/dungeon/dungeon-context.ts:2`, `src/economy/trade/trade-inventory.ts:2`, `src/models/request/equip-item-request.model.ts:4` (import relativo `../enums/…`), `src/characters/characters.service.ts:22`, `src/characters/equipment/equip-item.updates.ts:5`.
Spec (3): `placeholder-combat-resolver.spec.ts:5`, `characters.service.spec.ts:8`, `equip-item.updates.spec.ts:2`.

`KGNotification`: 4 occorrenze, tutte dentro il file cancellato. `item_reference_type`: nessun importatore.

**Rename visto da git:** `git show -M --summary 96c35110` → `rename src/models/enums/{slot_type.enum.ts => slot-type.enum.ts} (100%)`; 11 file nel commit, 10 inserzioni e 10 cancellazioni (una riga d'import per importatore, file spostato a 0 righe cambiate). `git log --follow --oneline -- src/models/enums/slot-type.enum.ts | wc -l` → 3.

**Eccezione TDD del Task 2:** nessun test nuovo. Sono soli spostamenti, percorsi d'import e cancellazioni di file senza importatori («glue code»): nessun comportamento nuovo da pinnare; la rete è `tsc` (0 dopo ognuno dei tre commit), la suite unit intera e il boot reale con SDL identico.

## Righe attese al boot reale (runbook, orchestratore)

Inventario dell'11 novembre: collection `lore` con 522 documenti, 438 con `image`, 0 con `imagePath`.

- Primo boot: `Revisione dei modelli, immagini delle lore: trovati 522, migrati 438, già a posto 84, senza corrispondenza 0`
- Secondo boot: `Revisione dei modelli, immagini delle lore: trovati 522, migrati 0, già a posto 522, senza corrispondenza 0`
- **Attenzione al significato di «438 con `image`»:** il passo conta il campo *esistente*, anche nullo. Se i 438 dell'inventario sono le lore con un valore non nullo e le altre 84 portano `image: null` (il default del modello vecchio), la prima riga dirà `migrati 522, già a posto 0`. Il numero esatto si legge prima del boot con la prova a secco: conteggio dei documenti con `image` esistente e `imagePath` non esistente = `migrati`; conteggio dei documenti con entrambi = `senza corrispondenza` (atteso 0).
- Prova a secco equivalente dopo il boot: documenti con `image` esistente = 0; per ogni lore del backup `imagePath` dopo = `image` prima (stesso valore, nullo compreso); lore con `imagePath` non nullo = 438. Backup di `lore` prima del boot (T-19-54).

## Esito delle prove (dopo l'ultimo commit di codice)

- `npx jest --selectProjects unit` → **270 suite, 3435 test** verdi (prima di ogni commit GREEN e dopo il Task 2; +1 suite, +1 caso rispetto al piano 13).
- Progetto integration intero, a pezzi, in primo piano, un jest alla volta, nessun comando spostato in background — **145 suite, 2002 test, tutti verdi** (144 / 1996 dopo il piano 13; +1 suite, +6 casi: uno sul filo, cinque del passo):
  - `src/characters test/app.int-spec.ts` → 24 suite, 467 test (77 s); `git diff --exit-code src/schema.gql` → 0.
  - `src/travel src/shops src/economy src/cities src/lore src/models test/shops test/fixtures` → 29 suite, 418 test (103 s) — è anche il controllo di wave del piano.
  - `src/quests` → 35 suite, 512 test (161 s).
  - resto (stessa lista di cartelle del piano 13) → 57 suite, 605 test (113 s).
  - `jest --listTests` del progetto integration elenca 145 file, tutti dentro i quattro pezzi.
- `npx tsc --noEmit -p tsconfig.json` → 0 dopo ogni commit GREEN e dopo ognuno dei tre commit del Task 2. Prettier ed eslint sui file toccati, uno per uno: puliti (unico avviso, quello preesistente di `test/app.int-spec.ts`). `pgrep -fl 'bin/jest'` vuoto a fine di ogni task.

## Criteri di accettazione

| Criterio | Esito |
|----------|-------|
| `grep -cE "^ +image\??:" src/models/lore.model.ts` | 0 |
| `grep -cE "\bimage:" test/fixtures/lore.fixture.ts` | 0 |
| `grep -c "id image type" src/lore/lore-related.int-spec.ts` | 0 |
| `type Lore` nello SDL con `imagePath: String` | 1 |
| `grep -c "D-11)" …/lore-image-path.step.int-spec.ts` | 4 |
| `grep -c "LoreImagePathStep" …/model-review.module.ts` | 2 |
| `grep -L "UNA TANTUM (Phase 19 D-12)" src/migrations/model-review/*.ts` | nessuna riga |
| `grep -rn "slot_type.enum" src test --include='*.ts'` | nessuna riga |
| `grep -rln "slot-type.enum" src test --include='*.ts' \| wc -l` | 10 |
| `grep -rn "KGNotification\|item_reference_type" src test --include='*.ts'` | nessuna riga |
| `git log --follow --oneline -- src/models/enums/slot-type.enum.ts \| wc -l` | 3 (> 2) |
| `npx prettier --check src/models/enums/slot-type.enum.ts` | pulito |
| `git diff --exit-code src/schema.gql` dopo il Task 2 | 0 |
| Gate del nome ritirato: lettori di `image` della lore fuori da `src/migrations/model-review/` | nessuno (restano solo `lore-image-path.step.ts`, la sua int-spec e `legacyLore`) |

## Deviazioni dal piano

**1. [Regola di REPO-RULES violata, non correggibile] subject di 74 caratteri in `00bd8556`**
- Il subject scritto nel piano (`refactor(models): drop the empty enum file and the dead notification model`) conta 74 caratteri, oltre il limite di 72; andava accorciato prima del commit e il conteggio è stato fatto dopo. `--amend` e `rebase` sono vietati: il commit resta com'è. Contenuto e trailer in regola. L'orchestratore decide se correggerlo.

**2. [Ruling dell'orchestratore] ordine dei commit della rinomina**
- `git mv` + i dieci percorsi d'import nello stesso commit (file byte-identico, rename al 100 %), poi il commit `style`: come scritto nel piano e nel prompt, al posto dell'ordine più vecchio di REPO-RULES.

**3. [Regola 2 - rete più stretta] casi del passo più larghi del minimo**
- `renames the image of a lore to its image path (D-11)` prova anche una lore con `image: null` (diventa `imagePath: null`, campo vecchio tolto); `leaves a lore without an image untouched (D-11)` prova sia la lore senza alcun campo sia quella già rinominata; il caso della seconda corsa mescola i quattro tipi di documento e pinna `alreadyDone: 3, unmatched: 1`.

**4. [Forma delle spec] caso del boot reale rinominato invece di uno nuovo**
- Il caso esistente con il blocco esatto di `type Lore` si chiama ora `writes the lore with its image path and without the global unlocked flag (11 D-25, D-11)` (una delle due forme ammesse dal piano).

**5. [Ordine dei commit di chiusura e forma di STATE] come nei piani 01–13**
- SUMMARY in un commit suo prima del bookkeeping; `Plan: 14 of 23`.

Nessuna decisione architetturale (Regola 4). Nessun file fuori da `files_modified`.

## Problemi rimandati (fuori scope, non corretti)

- Restano quelli dei piani 12 e 13: `cities { pointsOfInterest { id } }` non popolato da `findAll`; `TRADE_SNAPSHOT_PROJECTION` nomina ancora `assets.wearedEquipment` (piano 19-15).

## Note per i piani successivi

- **`STEPS`** oggi: `EnemyWeaknessesStep, EnemySpellsStep, PetCatalogStep, OwnedPetsStep, PoiQuestStep, CityShopStep, LoreImagePathStep`; `forFeature`: `Enemy`, `Spell`, `Pet`, `Character`, `PointOfInterest`, `City`, `Lore`. Il boot reale di `test/app.int-spec.ts` logga ora sette righe a zero.
- **`legacyLore(overrides)`** in `legacy-fixtures.ts`: lore grezza con `image: null`; un override `undefined` toglie il campo.
- **Piano 19-15 (D-06):** `SlotType` si importa da `src/models/enums/slot-type.enum` (file ora pulito per Prettier: nessun commit `style` prima di toccarlo); il membro dei piedi è ancora quello vecchio.
- **Handoff FE (19-23):** §1 riga D-11 — `Lore.image` tolto, `Lore.imagePath: String` aggiunto; la FE cambia le selezioni delle lore e delle città. Nessun altro cambio sul filo in questo piano (`KGNotification` non era nello SDL, `enum SlotType` identico).
- **Contenuto dopo il boot (D-25/D-26):** la lore nuova «Cavallo da viaggio» e ogni script di contenuto scrivono `imagePath`, non più `image`.
- **Conteggi:** unit 270 suite / 3435 test; integration 145 suite / 2002 test.

## Stub noti

Nessuno.

## Threat flags

Nessuna superficie nuova fuori dal threat model: T-19-54 (guardia sui due campi, caso dei documenti con entrambi, seconda corsa a zero; backup nel runbook), T-19-55 (blocco esatto `type Lore` nel boot reale, SDL identico dopo il Task 2), T-19-56 (rename al 100 %, `style` separato, `git log --follow` a 3) mitigati; T-19-57 accettato (file cancellato, grep a zero).

## Self-Check: PASSED

- `src/models/lore.schema.spec.ts`, `src/migrations/model-review/lore-image-path.step.ts`, `src/migrations/model-review/lore-image-path.step.int-spec.ts`, `src/models/enums/slot-type.enum.ts` esistono; `slot_type.enum.ts`, `item_reference_type.enum.ts`, `notification.model.ts` non esistono; i sette commit `2b534d62`, `506328e8`, `936a04b6`, `aa5914a6`, `96c35110`, `ff6d58d8`, `00bd8556` sono in `git log`; `git status --short` vuoto prima di questo documento.
