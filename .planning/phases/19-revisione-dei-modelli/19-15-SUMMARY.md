---
phase: 19-revisione-dei-modelli
plan: 15
subsystem: characters
tags: [wornEquipment, feet, SlotType, migratore, D-06, D-12, D-24]
requires: [19-14]
provides:
  - "`CharacterAssets.wornEquipment`, `Equipment.feet`, valore `feet` di `enum SlotType` su modello, input e SDL (non additivo)"
  - "`WornEquipmentStep` (ottavo in `STEPS`), builder `legacyCharacterWithEquipment` in `legacy-fixtures.ts`"
  - "registro dei ref con i nove slot sotto `assets.wornEquipment` (34 riferimenti, numero invariato)"
affects: [19-16, 19-20, 19-23]
tech-stack:
  added: []
  patterns: [passo del migratore a due scritture in ordine col driver nativo]
key-files:
  created:
    - src/migrations/model-review/worn-equipment.step.ts
    - src/migrations/model-review/worn-equipment.step.int-spec.ts
  modified:
    - src/models/enums/slot-type.enum.ts
    - src/models/common/equipment.model.ts
    - src/models/character/character-assets.model.ts
    - src/characters/characters.service.ts
    - src/characters/equipment/equip-item.updates.ts
    - src/characters/creation/starting-character.ts
    - src/economy/trade/trade-inventory.ts
    - src/economy/trade/shop-transaction.service.ts
    - src/quests/outcomes/combat/combat-context.ts
    - src/quests/outcomes/dungeon/dungeon-context.ts
    - src/migrations/mixed-refs/mixed-ref-paths.ts
    - src/migrations/model-review/legacy-fixtures.ts
    - src/migrations/model-review/model-review.module.ts
    - test/fixtures/character.fixture.ts
    - test/app.int-spec.ts
    - src/schema.gql
decisions:
  - "`migrated` del passo = documenti modificati dalla seconda scrittura (rinomina del campo); `alreadyDone` = trovati − migrati; la prima scrittura (slot) non entra nel report"
  - "Un valore di slot fuori enum è rifiutato dalla validazione GraphQL con `BAD_USER_INPUT` e `data` assente: lo stesso vale per il vecchio valore dello slot dei piedi"
metrics:
  completed: 2026-11-11
  tasks: 3
  files: 29
---

# Phase 19 Plan 15: `wornEquipment` e slot `feet` — Summary

L'equipaggiamento indossato si chiama `wornEquipment` e lo slot dei piedi `feet` su enum, modello, input, otto lettori e scrittori, registro dei ref, SDL e dati, in un solo commit di produzione; il passo `WornEquipmentStep` rinomina prima lo slot dentro il campo vecchio e poi il campo, su tutti i personaggi, e alla seconda corsa non scrive nulla. Apre la wave «personaggio» (D-13) e chiude la parte di codice di BE-MODEL-05.

## Commit

| Task | Commit | Subject (caratteri) |
|------|--------|---------------------|
| 1 RED | `bceded22` | `test(characters): pin the worn equipment and the feet slot` (58) |
| 1 GREEN | `70e6d565` | `refactor(characters): rename the worn equipment and its feet slot` (65) |
| 2 | `04d40a90` | `test(characters): pin the feet slot on the wire and in the shop` (63) |
| 3 | (questo e il successivo) | `docs(phase-19): summarize plan 15`, `docs(phase-19): record plan 15 progress` |

Ogni subject contato PRIMA del commit; nessun trailer (controllo a `0` dopo ognuno).

## Evidenza RED (`bceded22`)

- **Unit, 14 rossi su 3437 in 6 suite** (attesi con i nomi nuovi contro il codice vecchio):
  - `equip-item.updates.spec.ts` (2): `equipItemUpdate sets the slot to the item or to null` (path sotto il campo vecchio) e il nuovo `writes the feet slot under the worn equipment (D-06)` (membro `feet` assente dall'enum).
  - `trade-inventory.spec.ts` (1): `vacates every worn slot of an equipment sold down to zero, in either id form` (lo snapshot nuovo non è letto: nessuno slot liberato).
  - `combat-context.spec.ts` (5): equipaggiamento vuoto in combattimento e nei riferimenti del catalogo, i tre casi dei gioielli (D-24).
  - `dungeon-context.spec.ts` (1): `does not double count the worn copy (D-11)`.
  - `starting-character.spec.ts` (2): stato iniziale e riferimenti non condivisi.
  - `characters.service.spec.ts` (3): i due casi di `findOne` (il servizio legge il campo vecchio, assente dal documento) e il nuovo `populates every slot of the worn equipment and serves it (D-06)`.
- **Integration, 2 rossi su 90 e una suite non caricata:** boot reale `writes the worn equipment and the feet slot into the generated schema (D-06)` e `writes the owned pets as entries with their own state (D-03)` (stessa costante `CHARACTER_ASSETS_BLOCK`, SDL ancora vecchio); `worn-equipment.step.int-spec.ts` non si carica (`Cannot find module './worn-equipment.step'`): cinque casi non eseguiti.
- Nessun caso del Task 1 verde al primo colpo. `mixed-ref-paths.spec.ts` non è stato toccato ed è rimasto verde prima e dopo (34 riferimenti, ogni path verificato contro lo schema).

## Cosa è cambiato (`70e6d565`, un solo commit: 20 file)

- **Enum, modello, input:** `SlotType.feet = 'feet'`; `Equipment.feet` ed `EquipmentInput.feet`; `CharacterAssets.wornEquipment` e `CharacterAssetsInput.wornEquipment`.
- **Lettori e scrittori:** `CharactersService.findOne` (slot popolati dall'inventario) e `getEquipment` (populate per slot); `equipItemUpdate`; `InventorySnapshot.wornEquipment` e gli slot liberati dalla vendita; `TRADE_SNAPSHOT_PROJECTION` e `inventoryChanges` del negozio (il rimandato dei piani 12–14 è chiuso); `combat-context.ts` (tipo dello snapshot e `wornOf`); `dungeon-context.ts` (`wornCopiesOf`); `starting-character.ts`.
- **Registro dei ref:** `WORN_EQUIPMENT_SLOTS` con `feet`, nove path sotto `assets.wornEquipment`.
- **SDL** (`git diff src/schema.gql` del commit: tre righe, più lo spostamento alfabetico): `wornEquipment: Equipment!` in `CharacterAssets`, `feet: EquipmentItem` in `Equipment`, `feet` in `enum SlotType`. Tre blocchi esatti nel boot reale (`CHARACTER_ASSETS_BLOCK` aggiornata, `EQUIPMENT_BLOCK` e `SLOT_TYPE_BLOCK` nuove).
- **Passo:** `WornEquipmentStep`, label `equipaggiamento indossato`, driver nativo, collection da `connection.model(Character.name).collection`, nessun filtro sugli archiviati. Due scritture in ordine: (1) rinomina dello slot dentro il campo vecchio dove lo slot esiste (anche nullo); (2) rinomina del campo dove il campo vecchio esiste. Report: `found` = personaggi della collection, `migrated` = modificati dalla seconda scrittura, `alreadyDone` = `found − migrated`, `unmatched` = 0. Ottavo in `STEPS`; `forFeature` invariato (`Character` c'era già).
- **Fixture:** `test/fixtures/character.fixture.ts` nella forma nuova; `legacyCharacterWithEquipment(slots, overrides)` costruito sopra `legacyCharacterWithPets`.

## Spec toccate dal grep di gate

Nel RED: `equip-item.updates.spec.ts`, `trade-inventory.spec.ts`, `combat-context.spec.ts`, `dungeon-context.spec.ts`, `starting-character.spec.ts`, `characters.service.spec.ts`, `test/app.int-spec.ts`.
Nel GREEN (semine e attesi nella forma nuova): `equip-item.int-spec.ts`, `character-creation.resolver.int-spec.ts` (costante rinominata `EMPTY_WORN_EQUIPMENT`, Boy Scout), `shop-transaction.service.int-spec.ts`, `do-transaction.int-spec.ts`, `quest-combat.int-spec.ts`, `test/fixtures/character.fixture.ts`.

## Task 2 — pin sul filo (`04d40a90`), tutti verdi al primo colpo

Pin d'integrazione scritti dopo il GREEN del Task 1: verdi subito perché il comportamento era già in produzione; nessun lettore dimenticato è emerso (nessun commit `fix`).

- `equips an owned item in the feet slot (D-06)`: `equipItem` con `slotType: feet` → a DB `assets.wornEquipment.feet` è l'id; `character { assets { wornEquipment { feet { id } } } }` lo serve.
- `rejects a slot value outside the enum as invalid input (D-06)`: `slotType: shoes` → **codice osservato `BAD_USER_INPUT`**, `data` assente, documento identico. Il vecchio valore dello slot non è più nell'enum e cade nella stessa via (il test non lo scrive come letterale).
- `empties the worn slot of a sold equipment (D-06)`: ultimo esemplare indossato ai piedi venduto → `assets.wornEquipment.feet` nullo.
- Combattimento: `quest-combat.int-spec.ts` › `wins a registered enemy quest and concludes it` semina `assets.wornEquipment.rightHand` e pinna l'equipaggiamento arrivato al motore (già nella forma nuova dal Task 1).

## Righe attese al boot reale (runbook, orchestratore)

Inventario dell'11 novembre: 7 personaggi (archiviati compresi), tutti con il campo vecchio, slot dei piedi valorizzato su 2.

- Primo boot: `Revisione dei modelli, equipaggiamento indossato: trovati 7, migrati 7, già a posto 0, senza corrispondenza 0`
- Secondo boot: `Revisione dei modelli, equipaggiamento indossato: trovati 7, migrati 0, già a posto 7, senza corrispondenza 0`
- La riga non conta la prima scrittura (slot): i 2 slot valorizzati si verificano con la prova a secco. Prima del boot: personaggi con `assets.wearedEquipment` esistente = 7 (= `migrati`); con `assets.wearedEquipment.foots` non nullo = 2 (annotare id del personaggio e id dell'oggetto). Dopo il boot: personaggi con `assets.wearedEquipment` esistente = 0; con `assets.wornEquipment` esistente = 7; con `assets.wornEquipment.feet` non nullo = 2, stessi id di prima; nessun documento con la chiave `foots` dentro `assets.wornEquipment`; gli altri otto slot identici al backup.
- **Attenzione (T-19-60):** la rinomina del campo sovrascrive un eventuale `assets.wornEquipment` già presente sullo stesso documento. Può esistere solo se il codice nuovo scrive su un personaggio vecchio PRIMA del passo (un `equipItem` creerebbe il campo nuovo con un solo slot): il boot esegue il passo prima di servire richieste, quindi atteso 0 — controllo a secco: personaggi con entrambi i campi = 0. Backup di `characters` prima del boot.

## Esito delle prove (dopo l'ultimo commit di codice)

- `npx jest --selectProjects unit` → **270 suite, 3437 test** verdi (+2 casi rispetto al piano 14), eseguita prima del commit GREEN.
- Progetto integration intero, a pezzi, in primo piano, un jest alla volta, nessun comando spostato in background — **146 suite, 2011 test, tutti verdi** (145 / 2002 dopo il piano 14; +1 suite, +9 casi: cinque del passo, uno del boot reale, due di `equipItem`, uno del negozio):
  - `src/characters test/app.int-spec.ts` → 24 suite, 470 test (81 s); `git diff --exit-code src/schema.gql` → 0; boot reale 90 test.
  - `src/travel src/shops src/economy src/cities src/lore src/models test/shops test/fixtures` → 29 suite, 419 test (103 s).
  - `src/quests` → 35 suite, 512 test (159 s).
  - resto (stessa lista di cartelle del piano 13, `src/migrations` compreso) → 58 suite, 610 test (112 s).
  - `jest --listTests` del progetto integration elenca 146 file, tutti dentro i quattro pezzi.
- `npx tsc --noEmit -p tsconfig.json` → 0 dopo il GREEN e dopo il Task 2 (fra RED e GREEN rosso per il solo modulo del passo non ancora scritto e per i nomi nuovi nelle spec). Prettier ed eslint sui file toccati, uno per uno: puliti (unico avviso, quello preesistente di `test/app.int-spec.ts`). `pgrep -fl 'bin/jest'` vuoto a fine di ogni task.

## Criteri di accettazione

| Criterio | Esito |
|----------|-------|
| `grep -rnw "wearedEquipment" src test --include='*.ts'` fuori da `src/migrations/model-review/` | 0 righe |
| `grep -rnw "foots" src test --include='*.ts'` fuori da `src/migrations/model-review/` | 0 righe |
| `grep -cF "wornEquipment: Equipment!" src/schema.gql` | 1 |
| `feet` in `enum SlotType` / `feet: EquipmentItem` in `type Equipment` | 1 / 1 |
| `grep -c "toHaveLength(34)" …/mixed-ref-paths.spec.ts` | 1 |
| `grep -cE "\.updateMany\(" …/worn-equipment.step.ts` | 2 |
| `grep -c "D-06)" …/worn-equipment.step.int-spec.ts` | 4 |
| `git show --stat --format= 70e6d565 \| grep -c "worn-equipment.step.ts"` | 1 |
| `grep -c "D-06)"` in `equip-item.int-spec.ts` / `shop-transaction.service.int-spec.ts` | 2 / 1 |

## Deviazioni dal piano

**1. [Regola 2 - rete più stretta] caso unit in più su `getEquipment`**
- `characters.service.spec.ts` non aveva un caso sul populate degli slot: aggiunto `populates every slot of the worn equipment and serves it (D-06)` (una chiamata di populate per membro dell'enum sotto `assets.wornEquipment`, slot dei piedi compreso). RED nel commit `bceded22`.

**2. [Regola 2 - rete più stretta] casi del passo più larghi del minimo**
- Il caso «senza slot dei piedi» prova tre forme (slot assente, slot nullo, campo vuoto); la seconda corsa mescola un personaggio già nella forma nuova (contato «già a posto» alla prima corsa) e pinna i due report.

**3. [Boy Scout] costante della int-spec di creazione rinominata**
- `EMPTY_WEARED_EQUIPMENT` → `EMPTY_WORN_EQUIPMENT` in `character-creation.resolver.int-spec.ts` (il grep di gate a parola intera non la vedeva).

**4. [Ordine dei commit di chiusura e forma di STATE] come nei piani 01–14**
- SUMMARY in un commit suo prima del bookkeeping; `Plan: 15 of 23`.

Nessuna decisione architetturale (Regola 4). Nessun file fuori da `files_modified`.

## Problemi rimandati (fuori scope, non corretti)

- `CLAUDE.md` del repo BE (sezione generata «Conventions») cita ancora il nome vecchio del campo come esempio di naming: file fuori dal piano, da rigenerare o correggere dall'orchestratore.
- Resta dai piani 12–13: `cities { pointsOfInterest { id } }` non popolato da `findAll`.

## Note per i piani successivi

- **`STEPS`** oggi: `EnemyWeaknessesStep, EnemySpellsStep, PetCatalogStep, OwnedPetsStep, PoiQuestStep, CityShopStep, LoreImagePathStep, WornEquipmentStep`; `forFeature` invariato. Il boot reale di `test/app.int-spec.ts` esegue ora otto passi (90 test).
- **Fixture vecchie dei personaggi:** `legacyCharacterWithPets` e `legacyCharacterWithEquipment` scrivono ancora il campo vecchio dell'equipaggiamento (forma pre-19): un passo successivo sui personaggi (D-07) che confronta l'intero documento lo troverà sotto `assets.wearedEquipment`; in `legacyCharacterWithEquipment` un override `assets: { wearedEquipment: undefined }` toglie il campo.
- **Costanti SDL del boot reale:** `CHARACTER_ASSETS_BLOCK` porta ancora la riga `activeSpells: [ActiveSpell!]!` (la toglie il piano 19-20); `EQUIPMENT_BLOCK` e `SLOT_TYPE_BLOCK` sono nuove.
- **Registro dei ref:** 34 riferimenti, nove sotto `assets.wornEquipment`; il prossimo cambio di conteggio è del piano 19-20 (32).
- **Handoff FE (19-23):** §1 riga D-06 — `CharacterAssets.wearedEquipment` → `wornEquipment`, `Equipment.foots` → `feet`, valore `foots` → `feet` di `enum SlotType` (argomento `EquipItemRequest.slotType` di `equipItem`: il valore vecchio inviato dal client è `BAD_USER_INPUT`); la FE cambia selezioni e l'argomento nello stesso rilascio.
- **Conteggi:** unit 270 suite / 3437 test; integration 146 suite / 2011 test.

## Stub noti

Nessuno.

## Threat flags

Nessuna superficie nuova fuori dal threat model: T-19-58 (caso del valore fuori enum, `BAD_USER_INPUT`, nessuna scrittura), T-19-59 (grep di gate a zero, casi di vendita e combattimento sul replica set), T-19-60 (due scritture in ordine, seconda corsa a zero, archiviati compresi; backup e controllo «entrambi i campi» nel runbook), T-19-62 (tre blocchi esatti nel boot reale) mitigati; T-19-61 accettato (possesso invariato).

## Self-Check: PASSED

- `src/migrations/model-review/worn-equipment.step.ts` e `worn-equipment.step.int-spec.ts` esistono; i tre commit `bceded22`, `70e6d565`, `04d40a90` sono in `git log`; `git status --short` vuoto prima di questo documento.
