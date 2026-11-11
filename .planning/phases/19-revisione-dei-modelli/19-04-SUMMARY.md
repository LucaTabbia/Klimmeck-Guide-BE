---
phase: 19-revisione-dei-modelli
plan: 04
subsystem: models
tags: [pet, catalogo, attacco, difesa, migrazione, D-03, D-15, D-12]
requires: [19-03]
provides:
  - `Pet.attack` e `Pet.defense` (`Damages!`, default a funzione con liste vuote) al posto dei danni, anche in `PetInput`
  - catalogo dei pet senza stato (`xp` e vita corrente tolti dal modello, dall'input e dallo SDL)
  - passo `PetCatalogStep` (terzo di `STEPS`) e builder `legacyPet(overrides)`
  - costante `CATALOGUE_PET_BLOCK` in `test/app.int-spec.ts`
affects: [19-05, 19-06, 19-07, 19-11, 19-22, 19-23]
tech-stack:
  added: []
  patterns: [una scrittura a pipeline per collection col driver nativo, la mano vince sui rami già scritti]
key-files:
  created:
    - src/models/pet.schema.spec.ts
    - src/migrations/model-review/pet-catalog.step.ts
    - src/migrations/model-review/pet-catalog.step.int-spec.ts
  modified:
    - src/models/pet.model.ts
    - test/fixtures/pet.fixture.ts
    - test/app.int-spec.ts
    - src/schema.gql
    - src/migrations/model-review/legacy-fixtures.ts
    - src/migrations/model-review/model-review.module.ts
decisions:
  - Un ramo `attack` o `defense` salvato a `null` vale come assente (il passo lo riempie): sul filo il campo non è annullabile
  - Un pet senza campi vecchi e senza `defense` non entra nel passo: lo copre il default del modello alla lettura
metrics:
  completed: 2026-11-11
  tasks: 3
  files: 9
---

# Phase 19 Plan 04: Catalogo dei pet con attacco e difesa — Summary

Il catalogo `Pet` porta due rami `attack` e `defense` dello stesso tipo `Damages` e nessuno stato; lo SDL lo dichiara col blocco esatto, e il passo `PetCatalogStep` sposta i danni attuali in `attack`, crea `defense` vuota solo dove manca e toglie i tre campi vecchi senza mai toccare un ramo già scritto a mano.

## Commit

| Task | Commit | Subject |
|------|--------|---------|
| 1 RED | `7e434d7d` | `test(models): pin the catalogue pet with attack and defense` |
| 1 GREEN | `8a487586` | `feat(models): split the pet damages into attack and defense` |
| 2 RED | `fdcf69d2` | `test(migrations): pin the pet catalogue step` |
| 2 GREEN | `4d58061a` | `feat(migrations): add the pet catalogue step` |
| 3 | (questo e il successivo) | `docs(phase-19): summarize plan 04`, `docs(phase-19): record plan 04 progress` |

Nessun trailer in nessun commit (controllo a `0` dopo ognuno).

## Evidenza RED

- **Task 1, schema (`src/models/pet.schema.spec.ts`, 3 casi rossi su 3)** — idratazione e creazione: `attack` ricevuto `undefined`; lista dei path: mancano `attack` e `defense`, in più `currentLifePoints`, `damages`, `xp`.
- **Task 1, boot reale** — 2 rossi su 87: il caso nuovo `writes the catalogue pet with attack and defense and without state (D-03, D-15)` e il caso esistente `writes the travel contract into the generated schema` (stessa asserzione aggiornata): il blocco `type Pet` era ancora quello vecchio.
- **Task 2** — `Cannot find module './pet-catalog.step'` (0 test eseguiti, modulo assente). Fra il commit RED e il GREEN `tsc` è rosso per il solo import mancante, come nei piani precedenti.
- **Verdi al primo colpo:** nessuno.

## Ordine reale del blocco `Pet` (Assumption A1 confermata)

```graphql
type Pet {
  attack: Damages!
  buyPrice: Coins!
  defense: Damages!
  id: ID!
  imagePath: String!
  maxLifePoints: Int!
  maxXp: Int!
  name: String!
  sellPrice: Coins!
  sellable: Boolean
  speedModifier: Float
}
```

`git diff src/schema.gql` del commit GREEN tocca SOLO questo blocco (due righe aggiunte, tre tolte). Il blocco vive in `test/app.int-spec.ts` come costante `CATALOGUE_PET_BLOCK`, usata dal caso nuovo e dal caso «travel contract» della fase precedente: chi aggiunge un campo a `Pet` (19-11 `relatedLore`, D-27 `rarity`) aggiorna la costante.

## Usi di `buildPet` / `persistPet` corretti

Nessuno: nessun chiamante passava i tre campi tolti, `tsc` è uscito a 0 subito dopo il cambio del modello e della fixture. Nessun lettore nel BE dei campi tolti (confermata la ricerca); nessuna query di test seleziona `damages`, `xp` o la vita corrente di un pet.

## Forma del passo

- **Guardia:** almeno uno dei tre campi vecchi presente (un `$or` di tre `$exists`).
- **Una sola scrittura a pipeline per la collection** (`updateMany` col driver nativo): `attack` = `attack` se presente, altrimenti i danni attuali, altrimenti vuoto; `defense` = `defense` se presente, altrimenti vuota; poi via i tre campi vecchi. I letterali vuoti passano da `$literal`; i due «altrimenti» sono `$ifNull` annidati (nessuna dipendenza dalla forma a più argomenti).
- **Report:** `found` = pet della collection, `migrated` = `modifiedCount`, `alreadyDone` = differenza, `unmatched` = 0 sempre. Label `catalogo dei pet`, nessuna riga di dettaglio.

## Esito delle prove

- `npx jest --selectProjects unit` → 263 suite, 3336 test verdi (prima di ognuno dei due commit GREEN).
- `npx jest test/app.int-spec.ts src/shops test/shops --selectProjects integration --runInBand` → 9 suite, 124 test verdi.
- `npx jest src/economy src/characters/pets src/characters/character-updated.subscription.int-spec.ts src/quests/outcomes/quest-pet-prize.int-spec.ts src/quests/results/quest-result.resolver.int-spec.ts src/travel/travel-planning.int-spec.ts --selectProjects integration --runInBand` → 9 suite, 188 test verdi (le spec che persistono pet; copre `src/economy` del controllo di wave).
- `npx jest src/migrations/model-review test/app.int-spec.ts --selectProjects integration --runInBand` → 4 suite, 104 test verdi (boot reale 87/87, passo dei pet 6/6, magie 5/5, debolezze 6/6).
- `npx tsc --noEmit -p tsconfig.json` → 0 dopo ogni commit GREEN. Prettier ed eslint sui file toccati, uno per uno: puliti (resta il solo warning preesistente di `test/app.int-spec.ts`).
- `pgrep -fl 'bin/jest'` vuoto a fine di ogni task. Nessun comando spostato in background.

## Criteri di accettazione

| Criterio | Esito |
|----------|-------|
| proprietà dei danni, vita corrente e `xp` in `pet.model.ts` e in `pet.fixture.ts` | 0, 0, 0 e 0, 0, 0 |
| blocco `type Pet`: `attack: Damages!` = 1, `defense: Damages!` = 1, `xp: Int!` = 0 | 1, 1, 0 |
| `D-15)` ≥ 2 e `D-03)` ≥ 1 in `pet.schema.spec.ts` | 2 e 1 |
| `damages.model.ts` e `pets.module.ts` non toccati | 0 righe di diff |
| `D-15)` = 4 e `D-03)` = 1 in `pet-catalog.step.int-spec.ts` | 4 e 1 |
| `PetCatalogStep` ≥ 2 in `model-review.module.ts` | 2 |
| intestazione una tantum su ogni file della cartella | sì |
| nessun file `.mjs`/`.json`/`.yaml`/`.csv` negli ultimi commit | 0 |
| nessun `process.env`, `Math.random`, `Date.now` nella cartella del migratore | vuoto |

## Deviazioni dal piano

**1. [Scelta dentro il contratto] Costante `CATALOGUE_PET_BLOCK` per il blocco ripetuto**
- Il piano chiede l'asserzione aggiornata nel caso della fase precedente E un caso dedicato che la ripete: il letterale sta in una costante sola invece che due volte.

**2. [Boy Scout, in scope] `withoutUndefined` in `legacy-fixtures.ts`**
- Il filtro «un override `undefined` toglie il campo» era dentro `legacyEnemy`; estratto in una funzione privata usata anche da `legacyPet`. Nessun cambio di comportamento (le int-spec dei due passi precedenti restano verdi).

**3. [Casi più larghi del titolo] dentro i sei casi del piano**
- «never overwrites…» prova anche un `attack` già scritto con i danni vecchi ancora presenti (vince `attack`); «drops the state fields…» prova anche un pet con i due rami già scritti e il solo `xp` residuo; «changes nothing on a second run» include un pet già a posto senza `defense`, che il passo non tocca. Il numero dei titoli resta quello dei grep (4 + 1 + 1).

**4. [Gate «nome ritirato» non applicabile alla lettera]**
- `damages`, `xp` e la vita corrente sono nomi vivi su nemici, personaggi ed equipaggiamento: il grep per nome non isola i pet. Sostituito da: grep mirato sui lettori (`pet.<campo>` e righe con «pet» più il campo) → nessuna riga fuori dal migratore, `tsc` a 0, suite unit completa.

**5. [Ordine dei commit di chiusura e forma di STATE] come nei piani 01–03**
- SUMMARY in un commit suo prima del bookkeeping; `Plan: 4 of 23`: il `grep -q "Plan: 04 of 23"` del piano non trova la riga, è atteso.

Nessuna decisione architetturale (Regola 4). Nessun valore di difesa né di `maxXp` «di contenuto» nel repo: le fixture usano valori di prova (T-19-15).

## Note per i piani successivi

- **Builder:** `legacyPet(overrides)` in `legacy-fixtures.ts` (danni, `xp` 0, vita corrente uguale alla massima; `undefined` toglie il campo). Per un pet nella forma NUOVA nelle int-spec dei passi sui personaggi (19-07) basta `buildPet()` / `persistPet()`.
- **`STEPS`** oggi è `[EnemyWeaknessesStep, EnemySpellsStep, PetCatalogStep]`; il `forFeature` del modulo ha `Enemy`, `Spell`, `Pet`.
- **Boot reale di test:** `test/app.int-spec.ts` conta 87 test (uno in più) e logga tre righe a zero.
- **La vita del pet posseduto** (19-05/19-06/19-07) non ha più una base «corrente» a catalogo: si parte da `maxLifePoints`. Dopo il passo, a DB il catalogo non ha più `xp` né la vita corrente: il passo dei pet posseduti non può leggerli dal catalogo (a DB oggi nessun personaggio possiede pet, quindi non c'è stato da preservare).
- **`buildPet()`** ora dà `attack` e `defense` vuoti; chi serve un attacco o una difesa li passa come override nella forma `{ base: [{ type, power }], energy: [{ type, power }] }`.
- **Prova a secco dell'orchestratore:** attesi `trovati 44, migrati 44, già a posto 0, senza corrispondenza 0`; al secondo boot `migrati 0, già a posto 44`. Dopo il passo ogni pet ha `attack` uguale ai danni di prima e `defense` `{ base: [], energy: [] }`: lo script di contenuto (D-25) scrive `defense` e `maxXp` DOPO il boot; se li scrivesse prima, il passo li rispetterebbe comunque (caso «la mano vince»).
- **Finestra prima del boot:** un pet non migrato letto col codice nuovo risponde con `attack` e `defense` vuoti (default del modello, caso dell'idratazione), senza errori sul filo.
- BE-MODEL-03 è a metà (lato catalogo); la spunta in REQUIREMENTS resta al piano di chiusura.

## Stub noti

Nessuno. `defense` vuota dopo il passo è voluta (D-15, D-25): la valorizza lo script di contenuto dell'orchestratore dentro la fase.

## Self-Check: PASSED

- I tre file creati esistono; i quattro commit `7e434d7d`, `8a487586`, `fdcf69d2`, `4d58061a` sono in `git log`.
