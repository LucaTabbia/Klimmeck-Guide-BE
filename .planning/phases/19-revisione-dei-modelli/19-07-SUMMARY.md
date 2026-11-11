---
phase: 19-revisione-dei-modelli
plan: 07
subsystem: migrations
tags: [pet, posseduti, migratore, archiviati, orfani, D-03, D-23, D-12]
requires: [19-06]
provides:
  - funzione pura `ownedPetEntriesOf(owned, lifePointsOf)` e passo `OwnedPetsStep` (quarto di `STEPS`)
  - builder `legacyCharacterWithPets(petRefs, overrides)` in `legacy-fixtures.ts`
  - `Character` nel `forFeature` di `ModelReviewMigrationModule`
affects: [19-15, 19-17, 19-23]
tech-stack:
  added: []
  patterns: [guardia sul tipo degli elementi dell'array, scrittura dell'array intero per documento col driver nativo]
key-files:
  created:
    - src/migrations/model-review/owned-pets.step.ts
    - src/migrations/model-review/owned-pets.step.spec.ts
    - src/migrations/model-review/owned-pets.step.int-spec.ts
  modified:
    - src/migrations/model-review/legacy-fixtures.ts
    - src/migrations/model-review/model-review.module.ts
decisions:
  - Il passo riusa `newOwnedPetEntry` (nota dell'orchestratore) invece di riscrivere la regola della vita
  - Un pet a catalogo con vita non valida dà una voce a vita 0 ma NON è un orfano (orfano = pet assente dal catalogo)
  - Un personaggio che la guardia trova ma senza nulla da convertire (stringa che non è un id) non viene scritto né contato
metrics:
  completed: 2026-11-11
  tasks: 2
  files: 5
---

# Phase 19 Plan 07: Passo del migratore dei pet posseduti — Summary

`OwnedPetsStep` porta ogni riferimento di `assets.ownedPets` (ObjectId o esadecimale legacy) a una voce `{ pet, xp: 0, currentLifePoints }` con la `maxLifePoints` del catalogo, su tutti i personaggi (archiviati compresi); un pet non più a catalogo diventa una voce a vita 0 contata in `unmatched`; le voci già nella forma nuova e `assets.pet` non si toccano; la seconda corsa non scrive nulla.

## Commit

| Task | Commit | Subject |
|------|--------|---------|
| 1 RED | `196b5bb1` | `test(migrations): pin the owned pets step` |
| 1 GREEN | `a8fee1a3` | `feat(migrations): add the owned pets step` |
| 2 | (questo e il successivo) | `docs(phase-19): summarize plan 07`, `docs(phase-19): record plan 07 progress` |

Nessun trailer in nessun commit (controllo a `0` dopo ognuno).

## Evidenza RED

- `owned-pets.step.spec.ts` e `owned-pets.step.int-spec.ts`: `Cannot find module './owned-pets.step'` (0 test eseguiti, modulo assente); le altre tre int-spec della cartella verdi (17 test). Fra il RED e il GREEN `tsc` è rosso per il solo import mancante, come nei piani precedenti.
- **Verdi al primo colpo:** nessuno.
- **Rosso inatteso al primo GREEN (difetto della fixture, non del passo):** i due casi con più personaggi (`skips…`, `changes nothing on a second run…`) fallivano all'inserimento con `E11000` sull'indice unico dei nomi dei personaggi attivi (`character_name_active_ci_unique`): il builder dava a tutti lo stesso nome. Corretto nel commit GREEN con un nome progressivo nel builder (vedi deviazione 3).

## Forma del passo

- **Guardia (filtro di lettura):** `{ 'assets.ownedPets': { $elemMatch: { $type: ['objectId', 'string'] } } }` — almeno un elemento non ancora voce. Nessun filtro sugli archiviati (`grep -c "ACTIVE_CHARACTER_FILTER"` = 0).
- **Catalogo letto una volta:** mappa esadecimale → `maxLifePoints` (proiezione del solo campo), non validata: la sanifica `newOwnedPetEntry` (non intero o negativo = 0).
- **Per documento:** `ownedPetEntriesOf` + una scrittura dell'array intero (`assets.ownedPets`), solo se `converted > 0`. Elemento già voce: tenuto per identità; elemento illeggibile (`null`, stringa che non è un id): tenuto com'è e non contato, senza scrittura — così anche un dato sporco non rompe «seconda corsa = zero scritture».
- **Report:** `found` = personaggi della collection, `migrated` = personaggi scritti, `alreadyDone` = differenza, `unmatched` = voci orfane create. Label `pet posseduti`, nessuna riga di dettaglio e nessun id nel log (T-19-28).

## Conteggi dei casi

- Pura (6): ref → voce; stringa legacy; voce già nuova intatta (`converted` 0); orfano a vita 0 (`orphans` 1); vita di catalogo non valida (12,5 / −1 / assente → 0, `orphans` 0); ordine conservato in una lista mista (ref, voce, stringa non id, `null`, stringa legacy orfana).
- Replica set (6): attivo con due ref (uno stringa) e `assets.pet` identico; archiviato + attivo → `migrated: 2`; orfano → `unmatched: 1` con possesso conservato; tre personaggi da saltare (lista vuota, campo assente, già voce) → documenti grezzi identici; seconda corsa a zero su tre personaggi (uno misto voce + stringa legacy); collection vuota.

## Esito delle prove

- `npx jest --selectProjects unit` → 266 suite, 3360 test verdi (prima del commit GREEN).
- `npx jest src/migrations/model-review test/app.int-spec.ts --selectProjects integration --runInBand` → 5 suite, 111 test verdi (passo dei pet posseduti 6/6; boot reale verde con il quarto passo montato).
- `npx tsc --noEmit -p tsconfig.json` → 0. `git diff --exit-code src/schema.gql` → 0. Prettier ed eslint sui file toccati, uno per uno: puliti. `pgrep -fl 'bin/jest'` vuoto. Nessun comando spostato in background.

## Criteri di accettazione

| Criterio | Esito |
|----------|-------|
| `D-03)` = 4 e `D-23)` = 2 in `owned-pets.step.spec.ts` | 4 e 2 |
| `D-23)` = 1 e `D-03)` = 4 in `owned-pets.step.int-spec.ts` | 1 e 4 |
| `ACTIVE_CHARACTER_FILTER` in `owned-pets.step.ts` | 0 |
| `OwnedPetsStep` ≥ 2 in `model-review.module.ts` | 2 |
| intestazione una tantum su ogni file della cartella | sì |
| nessun `process.env`, `Math.random`, `Date.now` nella cartella | vuoto |

## Deviazioni dal piano

**1. [Nota dell'orchestratore sopra il piano] il passo importa `newOwnedPetEntry`**
- L'`<interfaces>` del piano dice che il passo non importa l'helper e riscrive la regola della vita; la nota dell'orchestratore per questo piano chiede di riusarlo. Seguito l'orchestratore: una sola regola «vita non valida = 0». Alla rimozione del modulo l'helper resta (dipendenza in un solo verso, dal modulo una tantum verso il codice che resta).

**2. [Regola 3 - Blocco] `legacyCharacterWithPets` è un letterale, non parte da `buildCharacter`**
- `legacy-fixtures.ts` non è una spec e sta sotto `src/`: un import da `test/fixtures/` entrerebbe nella build (`tsconfig.build.json` esclude `test` e le sole `*spec.ts`) e la romperebbe. Il builder ripete i campi di `buildCharacter` nella forma vecchia (come `legacyEnemy` e `legacyPet`), con `deletedAt: null` e gli override di `assets` fusi con quelli di base (un `undefined` toglie il campo).

**3. [Regola 1 - Bug della fixture] nome progressivo nel builder**
- Indice unico dei nomi dei personaggi attivi: `Personaggio vecchio <n>` con un contatore di modulo. Entrato nel commit GREEN.

**4. [Regola 2 - Idempotenza] nessuna scrittura senza conversioni**
- Non scritto nel piano: un personaggio trovato dalla guardia per una stringa che non è un id non viene riscritto a ogni boot (T-19-25).

**5. [Lettura del caso D-23 sul valore non valido]**
- Il caso `reads a catalogue life amount that is not a valid integer as 0 (D-23)` attende `orphans: 0`: il pet esiste a catalogo, non è un orfano.

**6. [Ordine dei commit di chiusura e forma di STATE] come nei piani 01–06**
- SUMMARY in un commit suo prima del bookkeeping; `Plan: 7 of 23`: il `grep -q "Plan: 07 of 23"` del piano non trova la riga, è atteso.

Nessuna decisione architetturale (Regola 4).

## Note per i piani successivi

- **`STEPS`** oggi è `[EnemyWeaknessesStep, EnemySpellsStep, PetCatalogStep, OwnedPetsStep]`; il `forFeature` del modulo ha `Enemy`, `Spell`, `Pet`, `Character`.
- **Builder dei personaggi vecchi (19-15, 19-17):** `legacyCharacterWithPets(petRefs, overrides)` dà un personaggio intero nella forma vecchia (`status.spells`, `assets.wearedEquipment`, `assets.activeSpells`, `deletedAt: null`, nome unico per chiamata); `overrides.assets` si fonde con gli assets di base, gli altri override sostituiscono il ramo intero. Chi serve un altro ramo vecchio può partire da qui (o estrarne la base) invece di importare da `test/fixtures/` — mai import da `test/` in un file non-spec sotto `src/`.
- **Inserimento di più personaggi attivi col driver:** l'indice `character_name_active_ci_unique` vale anche nell'harness: nomi diversi.
- **Prova a secco dell'orchestratore (boot reale):** attesi `Revisione dei modelli, pet posseduti: trovati 7, migrati 0, già a posto 7, senza corrispondenza 0` al primo e al secondo boot (7 personaggi, nessuno possiede pet). Il `trovati` conta i personaggi della collection, non quelli con pet.
- **Boot reale di test:** quattro righe a zero, una per passo.
- BE-MODEL-03: chiusa anche la parte del migratore; la spunta in REQUIREMENTS resta al piano di chiusura. BE-MODEL-09 resta aperto fino al boot reale.

## Stub noti

Nessuno.

## Threat flags

Nessuna superficie nuova fuori dal threat model: T-19-25 (guardia, voci intatte, seconda corsa a zero col grezzo identico), T-19-26 (orfano a vita 0 contato), T-19-27 (nessun filtro sugli archiviati, caso dedicato), T-19-28 (soli conteggi) mitigati.

## Self-Check: PASSED

- I tre file creati esistono; i due commit `196b5bb1`, `a8fee1a3` sono in `git log`.
