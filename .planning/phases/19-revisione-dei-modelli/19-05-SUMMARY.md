---
phase: 19-revisione-dei-modelli
plan: 05
subsystem: models
tags: [pet, posseduti, OwnedPet, orfani, equipPet, SDL, D-03, D-23]
requires: [19-04]
provides:
  - tipo `OwnedPet` (`pet` ref al catalogo, `xp` default 0, `currentLifePoints` obbligatorio, senza `_id`) e `CharacterAssets.ownedPets: [OwnedPet!]!`
  - `ownedPetsOnTheWire(entries)`: voci orfane tolte dal filo dopo il populate di `findOne`
  - filtro di `equipPet` sul path `assets.ownedPets.pet`
  - fixture `buildOwnedPet(pet, overrides?)` e tipo `OwnedPetSeed` in `test/fixtures/owned-pet.fixture.ts`
  - costanti `OWNED_PET_BLOCK` e `CHARACTER_ASSETS_BLOCK` in `test/app.int-spec.ts`
affects: [19-06, 19-07, 19-15, 19-20, 19-23]
tech-stack:
  added: []
  patterns: [orfani tolti dal filo dopo il populate senza scritture, blocchi SDL esatti in costanti]
key-files:
  created:
    - src/models/character/owned-pet.model.ts
    - src/characters/pets/owned-pets.mapper.ts
    - src/characters/pets/owned-pets.mapper.spec.ts
    - test/fixtures/owned-pet.fixture.ts
  modified:
    - src/models/character/character-assets.model.ts
    - src/models/shop-fields.schema.spec.ts
    - src/characters/characters.service.ts
    - src/characters/characters.service.spec.ts
    - src/characters/pets/equip-pet.updates.ts
    - src/characters/pets/equip-pet.updates.spec.ts
    - src/characters/pets/equip-pet.int-spec.ts
    - src/characters/character-updated.subscription.int-spec.ts
    - src/characters/archived-character-visibility.int-spec.ts
    - src/characters/characters-ownership.int-spec.ts
    - test/app.int-spec.ts
    - src/schema.gql
decisions:
  - Una voce è servibile solo se il suo pet è un oggetto popolato con id stringa; pet nullo, assente o ref nudo = voce fuori dal filo, mai fuori dal DB
  - `buildOwnedPet` dà vita 10 di default (la `maxLifePoints` di `buildPet`) e `xp` 0
metrics:
  completed: 2026-11-11
  tasks: 3
  files: 16
---

# Phase 19 Plan 05: `OwnedPet` sul personaggio — Summary

I pet posseduti sono voci `{ pet, xp, currentLifePoints }` senza `_id` sul personaggio e sullo SDL (`[OwnedPet!]!`, non additivo); `findOne` popola il pet di ogni voce e toglie dal filo le voci orfane senza scrivere; `equipPet` accetta solo un pet presente in una voce e non ne tocca lo stato. Resta il rosso dichiarato sugli scrittori (negozio e pet in premio), che chiude il piano 19-06.

## Commit

| Task | Commit | Subject |
|------|--------|---------|
| 1 RED | `197dd91e` | `test(models): pin the owned pet entries on the character` |
| 1 GREEN | `c59f43c4` | `feat(models): keep the pet state on the owned pet entry` |
| 2 RED | `009f51ed` | `test(characters): pin equipPet on the owned pet entries` |
| 2 GREEN | `0edab70c` | `feat(characters): equip a pet from its owned entry` |
| 3 | (questo e il successivo) | `docs(phase-19): summarize plan 05`, `docs(phase-19): record plan 05 progress` |

Nessun trailer in nessun commit (controllo a `0` dopo ognuno).

## Evidenza RED

- **Task 1, unit (3 rossi, una suite non caricata)** — `shop-fields.schema.spec.ts`: i due casi nuovi (D-03) rossi (il path dei posseduti era una lista di ref, senza schema di voce); `characters.service.spec.ts`: atteso il populate di `assets.ownedPets.pet`, ricevuto quello della lista; `owned-pets.mapper.spec.ts`: `Cannot find module './owned-pets.mapper'` (0 test eseguiti).
- **Task 1, integration (6 rossi su 105)** — boot reale: il caso nuovo `writes the owned pets as entries with their own state (D-03)` e il caso esistente del contratto dei negozi (riga `ownedPets` aggiornata); subscription: i quattro casi dei pet (documento con `ownedPets { pet { … } xp currentLifePoints }` rifiutato dalla validazione GraphQL: `OwnedPet` non esisteva).
- **Task 2, unit (1 rosso)** — il filtro portava ancora la lista intera invece del path della voce.
- **Task 2, integration (7 rossi su 8)** — `equipPet` rispondeva `INTERNAL_SERVER_ERROR` («Parameter "obj" to Document() must be an object»): il filtro vecchio faceva castare l'id a voce. Verde al primo colpo il solo `unequips the companion idempotently`: l'`equip` di preparazione fallisce senza asserzione e lo `unequip` non dipende dal filtro (dopo il GREEN il caso prova davvero lo stato della voce).
- Fra il RED e il GREEN del task 1 `tsc` è rosso per il solo import mancante, come nei piani precedenti.

## Ordine reale dei blocchi SDL (Assumption A1 confermata)

```graphql
type OwnedPet {
  currentLifePoints: Int!
  pet: Pet!
  xp: Int!
}

type CharacterAssets {
  activeSpells: [ActiveSpell!]!
  ownedEquipments: [AssetQuantity!]!
  ownedItems: [AssetQuantity!]!
  ownedPets: [OwnedPet!]!
  pet: Pet
  wearedEquipment: Equipment!
}
```

`git diff src/schema.gql` del commit GREEN: il blocco nuovo `type OwnedPet` (dopo `type Mutation`) e la sola riga `ownedPets` di `CharacterAssets`. I due blocchi vivono in `test/app.int-spec.ts` come `OWNED_PET_BLOCK` e `CHARACTER_ASSETS_BLOCK`: i piani 19-15 e 19-20 aggiornano la seconda costante. Il boot reale conta 88 test.

## Rosso noto lasciato al piano 19-06 (esito osservato, spec NON modificate)

Causa unica: gli scrittori salvano ancora id nudi in `assets.ownedPets` e le semine delle spec usano la forma vecchia; Mongoose rifiuta il cast («Parameter "obj" to Document() must be an object, got "<id>"»). 18 casi rossi in 4 suite (72 verdi nelle stesse suite):

- `src/economy/trade/shop-transaction.service.int-spec.ts` — 11 casi, tutti nel blocco «pets in the shop transaction»: `buys a pet of the city pool into the owned pets without equipping it (D-14)`, `empties the equipped slot when selling the equipped pet (D-14)`, `keeps the equipped pet when selling another owned pet (D-14)`, `lets exactly one of concurrent buys of the same pet through (D-14)`, `refuses a duplicate pet before the funds (D-19)`, `refuses a pet already owned with PET_ALREADY_OWNED and writes nothing (D-14)`, `refuses a pet bought meanwhile at write time and pays nothing (D-14)`, `refuses a pet outside the pool before checking a duplicate (D-19)`, `refuses a pet sold meanwhile at write time and pays nothing (D-14)`, `refuses selling a pet not owned with ITEM_NOT_OWNED (D-14)`, `sells an owned pet in any city (D-12, D-14)`.
- `src/economy/trade/do-transaction.int-spec.ts` — 2 casi: `pets › answers PET_ALREADY_OWNED in extensions.code (D-14)`, `pets › buys and sells a pet with petAssets (D-17)`.
- `test/shops/city-shops.e2e.int-spec.ts` — 2 casi: `buys a companion, equips it and sells it elsewhere emptying the slot (D-13, D-15, D-14)`, `refuses a duplicate pet without writes (D-14)`.
- `src/quests/outcomes/quest-pet-prize.int-spec.ts` — 3 casi: `adds the pet prize to a winner on a lucky roll (D-21)`, `never duplicates a pet already owned (D-21)`, `rolls the pet for each winner of a boss (D-21)`.

**Nessun'altra int-spec è rossa:** l'intero progetto integration è stato eseguito a pezzi dopo l'ultimo commit GREEN (vedi sotto).

## Esito delle prove

- `npx jest --selectProjects unit` → 264 suite, 3340 test verdi (prima di ognuno dei due commit GREEN).
- `npx jest src/characters/character-updated.subscription.int-spec.ts test/app.int-spec.ts --selectProjects integration --runInBand` → 2 suite, 105 test verdi.
- `npx jest src/characters --selectProjects integration --runInBand` → 23 suite, 378 test verdi.
- `npx jest src/travel src/shops src/economy src/cities src/lore src/models test/shops test/fixtures --selectProjects integration --runInBand` → 26 suite verdi, rosse le sole 3 del rosso noto (15 casi).
- `npx jest src/quests --selectProjects integration --runInBand` → 34 suite verdi, rossa la sola `quest-pet-prize.int-spec.ts` (3 casi).
- Resto del progetto integration (`src/auth`, `src/authz`, `src/eventsub`, `src/graphql`, `src/http`, `src/migrations`, `src/mongo`, `src/pendingQuests`, `src/pointsOfInterest`, `src/push`, `src/rest`, `src/roads`, `src/throttling`, `src/time`, `src/users`, `src/validation`, `test/auth`, `test/authz`, `test/harness`, `test/quests`) → 53 suite, 584 test verdi.
- `npx tsc --noEmit -p tsconfig.json` → 0 dopo ogni commit GREEN. Prettier ed eslint sui file toccati, uno per uno: puliti (resta il solo warning preesistente di `test/app.int-spec.ts`).
- `pgrep -fl 'bin/jest'` vuoto a fine di ogni task. Nessun comando spostato in background.

## Criteri di accettazione

| Criterio | Esito |
|----------|-------|
| `type OwnedPet {` e `ownedPets: [OwnedPet!]!` in `src/schema.gql` | 1 e 1 |
| `assets.ownedPets.pet` e `ownedPetsOnTheWire(` in `characters.service.ts` | 1 e 1 |
| `D-23)` in `owned-pets.mapper.spec.ts` | 3 |
| `assets.ownedPets.pet` in `equip-pet.updates.ts` | 1 |
| `D-03)` in `equip-pet.int-spec.ts` e in `equip-pet.updates.spec.ts` | 2 e 1 |
| `mixed-ref-paths.spec.ts` verde (registro dei ref non toccato) | sì (suite unit completa) |
| le quattro int-spec del rosso noto elencate con l'esito, non modificate | sì (0 righe di diff) |

## Deviazioni dal piano

**1. [Scelta dentro il contratto] attesi del populate e fixture nel commit RED**
- `characters.service.spec.ts` (atteso del populate) e `test/fixtures/owned-pet.fixture.ts` sono entrati nel commit RED del task 1 invece che nel GREEN: l'atteso è un test che deve fallire prima, la fixture serve alle spec rosse.

**2. [Scelta dentro il contratto] costanti per i due blocchi SDL e riga del contratto dei negozi**
- `OWNED_PET_BLOCK` e `CHARACTER_ASSETS_BLOCK` come per `CATALOGUE_PET_BLOCK`; nel caso esistente del contratto dei negozi (Phase 12) la riga dei posseduti è passata a `ownedPets: [OwnedPet!]!` (stesso file, asserzione altrimenti falsa).

**3. [Titolo più largo] caso di rifiuto di `equipPet`**
- Il caso esistente `refuses a pet not owned…` è stato rinominato in `refuses a pet that is not in any entry with PET_NOT_OWNED and writes nothing (D-03)` invece di aggiungerne un doppione: stesso codice di rifiuto, stessa prova «nessuna scrittura».

**4. [Verifica oltre il piano, chiesta dall'orchestratore] intero progetto integration**
- Il piano chiede solo `src/characters`; per provare che nessun'altra int-spec è rossa sono stati eseguiti tutti i pezzi del progetto integration.

**5. [Ordine dei commit di chiusura e forma di STATE] come nei piani 01–04**
- SUMMARY in un commit suo prima del bookkeeping; `Plan: 5 of 23`: il `grep -q "Plan: 05 of 23"` del piano non trova la riga, è atteso.

Nessuna decisione architetturale (Regola 4). Nessuna correzione automatica (Regole 1–3) necessaria.

## Note per i piani successivi

- **19-06 (scrittori):** `trade-pets.ts` e `outcome-plan.ts` tipizzano ancora i posseduti come `unknown[]`, per questo `tsc` è verde: il tipo non vi aiuta, il rosso sono le 18 int-spec sopra. Restano con la forma vecchia anche le unit `trade-pets.spec.ts`, `trade-inventory.spec.ts:312` (guardia sulla lista intera) e `outcome-plan.spec.ts` (oggi verdi perché pure). Nelle semine delle quattro int-spec usare `buildOwnedPet(id, { xp, currentLifePoints })` da `test/fixtures/owned-pet.fixture.ts` (NON è riesportata da `test/fixtures/index.ts`); nelle letture grezze la voce attesa è `{ pet, xp, currentLifePoints }` senza `_id`.
- **Filtri sul path tipizzato:** `assets.ownedPets.pet` con le due forme di `idForms` funziona via modello (Mongoose casta la stringa a ObjectId). Un filtro o un `$set` via modello che passa un id nudo sul path `assets.ownedPets` invece lancia «Parameter "obj" to Document() must be an object»: è la firma del rosso noto.
- **`findOne`** riassegna `character.assets.ownedPets` sul documento servito (nessuna scrittura), come già per `spellStates`: chi serve i posseduti da un altro punto deve passare da `ownedPetsOnTheWire`.
- **19-07 (passo dei personaggi):** `OwnedPet.currentLifePoints` è `required`: la voce dell'orfano (D-23) porta 0 esplicito; il modulo del passo registra `Character` e `Pet` nel suo `forFeature`.
- **Harness:** `test/authz/characters-test-app.ts` registrava già `Pet` (populate di `assets.pet`): nessun `forFeature` nuovo è servito qui.
- **Finestra prima del boot:** a DB nessun personaggio possiede pet (inventario dell'11 novembre), quindi nessuna lista di id nudi viene letta col modello nuovo prima del passo 19-07.
- BE-MODEL-03 resta aperto (scrittori 19-06, passo 19-07); la spunta in REQUIREMENTS è del piano di chiusura.

## Stub noti

Nessuno.

## Threat flags

Nessuna superficie nuova fuori dal threat model: T-19-17 (mapper + caso dell'orfano su query), T-19-18 (filtro di possesso + caso di rifiuto), T-19-20 (blocchi esatti nel boot reale) mitigati; T-19-19 accettato (nessun input porta lo stato del pet).

## Self-Check: PASSED

- I quattro file creati esistono; i quattro commit `197dd91e`, `c59f43c4`, `009f51ed`, `0edab70c` sono in `git log`.
