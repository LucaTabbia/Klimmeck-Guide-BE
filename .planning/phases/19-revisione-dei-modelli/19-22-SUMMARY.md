---
phase: 19-revisione-dei-modelli
plan: 22
subsystem: quests
tags: [pet, premio, quest generate, Pet.enemy, fasce, tetto di rarità, D-28]
requires: [19-21]
provides:
  - "`Pet.enemy` (ref `Enemy`, default `null`, solo Mongoose: fuori dallo SDL) nel registro dei ref: 33 riferimenti in 11 collection"
  - "`src/quests/generation/pet-prize.ts` — `petPrizeOf`, `petRarityCapOf`, `PetCandidate`, `PetPrizeInput`, le tre costanti di fascia (unico punto di verità)"
  - "`src/quests/generation/pet-candidate.ts` — `readPetCandidates(petModel, enemyModel)` e `petCandidateOf` (lettore sanificante)"
  - "`PrizesInput.enemyIds` e `PrizesInput.poiTypes`; contratto dei tiri di `prizesOf` con un tiro di fascia per ogni quest generata"
  - "helper di test `persistLinkedPets` e tipo `LinkedPet` in `test/quests/generation-world.ts`"
affects: [19-23]
tech-stack:
  added: []
  patterns: [un solo tiro su fasce che si sommano con confini calcolati dalle costanti, lettore lean sanificante separato dal servizio]
key-files:
  created:
    - src/quests/generation/pet-prize.ts
    - src/quests/generation/pet-prize.spec.ts
    - src/quests/generation/pet-candidate.ts
    - src/quests/generation/pet-candidate.spec.ts
  modified:
    - src/models/pet.model.ts
    - src/models/pet.schema.spec.ts
    - src/models/quest/quest-prizes.model.ts
    - src/migrations/mixed-refs/mixed-ref-paths.ts
    - src/migrations/mixed-refs/mixed-ref-paths.spec.ts
    - src/quests/generation/generated-prizes.ts
    - src/quests/generation/generated-prizes.spec.ts
    - src/quests/generation/quest-generator.service.ts
    - src/quests/generation/quest-generator.int-spec.ts
    - test/quests/generation-world.ts
    - test/quests/quest-generation.e2e.int-spec.ts
    - test/fixtures/pet.fixture.ts
decisions:
  - "La lettura dei candidati vive in `pet-candidate.ts` (come `enemy-candidate.ts` e `prize-catalog.ts`), non dentro il servizio: il lettore sanificante ha la sua unit"
  - "I confini delle fasce sono somme delle costanti arrotondate al milionesimo: in virgola mobile 0.1 + 0.05 supera 0.15 e il tiro 0.15 finirebbe nella fascia sbagliata"
  - "`PetCandidate` e `BOSS_PET_PRIZE_CHANCE` vivono solo in `pet-prize.ts`; gli import di servizio e spec puntano lì (nessun re-export)"
  - "Il caso e2e del tabellone sceglie la città di casa dalla prima quest generata invece che dalla prima città del mondo: non dipende più dal seme"
metrics:
  duration: 45 min
  completed: 2026-11-11
  tasks: 3
  files: 16
---

# Phase 19 Plan 22: pet in premio delle quest generate per legame — Summary

Le quest generate `enemy` e `boss` offrono un pet con UN solo tiro su tre fasce che si sommano — 10 % stesso nemico, 5 % zona, 5 % solo boss fra i mai in vendita — col tetto di rarità del pool di loot del rango; il legame è il ref `Pet.enemy`, solo Mongoose. Finché la cura a DB non scrive rarità e legami nessun pet è candidato (fail-safe voluto). BE-MODEL-12 lato codice; supera la Phase 13 D-21.

## Commit

| Task | Commit | Subject (caratteri) |
|------|--------|---------------------|
| 1 RED | `e200d2e3` | `test(quests): pin the generated pet prize by enemy, zone and boss` (65) |
| 1 GREEN | `4db9732b` | `feat(quests): choose a generated pet prize by enemy, zone and boss` (66) |
| 2 RED | `7a24d0a0` | `test(quests): pin the draw contract of the generated pet prize` (62) |
| 2 GREEN | `57604616` | `feat(quests): offer generated pet prizes linked by enemy and zone` (65) |
| 3 | (questo e il successivo) | `docs(phase-19): summarize plan 22`, `docs(phase-19): record plan 22 progress` |

Subject contati PRIMA del commit; nessun trailer (controllo a `0` dopo ognuno).

## Evidenza RED

- **Task 1, unit (3 rossi + 1 suite che non parte, 39 suite):** `pet.schema.spec.ts` › `links a pet to its enemy with a typed reference that stays off the wire (D-28)` (path assente) e `declares no state on the catalogue pet (D-03)` (la lista esatta dei path attende `enemy`); `mixed-ref-paths.spec.ts` › `counts 33 references in 11 collections (D-17d)` (32); `pet-prize.spec.ts` non parte (modulo assente). Nessun caso verde al primo colpo.
- **Task 2, unit (3 rossi + 1 suite che non parte):** `generated-prizes.spec.ts` › `offers the pet linked to a quest enemy on an enemy quest too (D-28)` (zero tiri sulle `enemy`: `null`), `offers a boss-only pet in the third band (D-28)` (soglia a 0,01), `draws the pet roll after the loot on every generated quest (D-28)` (`drawn` vuoto); `pet-candidate.spec.ts` non parte (modulo assente).
- **Task 2, integration (2 rossi su 46):** `quest-generator.int-spec.ts` › `offers on a generated quest the pet linked to one of its enemies (D-28)` e `offers a zone pet when the roll falls in the second band (D-28)` (nessun pet offerto).
- **Verdi al primo colpo (attesi):** `offers no pet when the roll misses every band (D-28)` (0,2 mancava già la vecchia soglia con un solo tiro) e `offers no pet while the pets have no rarity (D-28)` (pinnano l'assenza di un effetto; il secondo diventa la guardia del fail-safe: dopo il GREEN i pet legati ma senza rarità restano fuori).
- Fra RED e GREEN del task 2 `tsc` è rosso per i soli nomi non ancora dichiarati (`enemyIds`, `poiTypes`, `pet-candidate`).

## Cosa è cambiato

- **Modello:** `enemy?: Types.ObjectId | null` con `@Prop({ type: ObjectId, ref: 'Enemy', default: null })`, NESSUN `@Field`; ref dichiarato per nome (nessun import di `enemy.model.ts`); `PetInput` invariato. `src/schema.gql` senza diff. Registro: `scalar('pets', 'enemy')` → 33 in 11 collection. Fixture `buildPet` con `enemy: null`.
- **`pet-prize.ts` (puro):** regola nell'ordine dell'`<interfaces>` — un tiro sempre; fascia dal tiro (`bandOf`); candidati = rarità dell'enum entro il tetto, poi filtro di fascia, ordinati per id; fascia assente o vuota → `null` senza altri tiri; altrimenti un tiro d'indice. La terza fascia vuole `sellable === false` stretto; la seconda esclude i pet della prima. Una rarità fuori enum (compreso un nome ereditato come `toString`) non è mai candidata.
- **`generated-prizes.ts`:** `PrizesInput` con `enemyIds` e `poiTypes`; `prizesOf` chiama `petPrizeOf` dopo il loot; via `petOf`, il vecchio `PetCandidate` e la vecchia costante; `indexOf` esportato (stesso corpo).
- **Lettura dei candidati (`pet-candidate.ts`):** TUTTI i pet, proiezione `_id rarity sellable enemy`, ordinati per `_id`, lean; poi UNA lettura lean dedicata dei nemici collegati per id (sole `locations`, saltata senza legami) — dedicata perché i leggendari non sono fra i candidati del generatore ma danno la zona al loro pet. `petCandidateOf` sanifica: rarità non stringa e `sellable` non booleano → `null`; legame letto come ObjectId o esadecimale a 24 scritto da uno script, ogni altro valore → nessun legame; nemico sparito → nessuna location. `QuestGenerator.readPets()` delega; `createOn` passa `enemyIds` (nemici della composizione) e `poiTypes`. Il modulo del generatore registrava già `Enemy` e `Pet` nel suo `forFeature`: nessun modello da aggiungere.
- **`quest-prizes.model.ts`:** solo il commento di `prizes.pet`, che citava ancora «solo sui boss all'1%».

## Contratto dei tiri osservato

| | Prima (Phase 13 D-21) | Dopo (D-28) |
|---|---|---|
| quest `enemy` | 0 tiri per il pet | 1 tiro di fascia, +1 d'indice se la fascia colpita ha candidati |
| quest `boss` | 1 tiro (soglia 0,01), +1 d'indice se passa e ci sono pet | 1 tiro di fascia, +1 d'indice se la fascia colpita ha candidati |
| posizione | dopo il loot, prima dell'annuncio | invariata |

Pinnato in `pet-prize.spec.ts` (`draws exactly one roll, plus one index only when the band has a candidate (D-28)`) e in `generated-prizes.spec.ts` (`draws the pet roll after the loot on every generated quest (D-28)`: sequenza intera `[0.9, 0.9, 0.9, 0.05, 0]` = tre oggetti, tiro di fascia, indice).

## Attesi a seme fisso: cosa si è mosso

Motivo unico: **+1 tiro per le quest `enemy` (D-28)**.

| Spec | Vecchio | Nuovo |
|------|---------|-------|
| `generated-prizes.spec.ts`, caso D-21 | costante 0,01; boss vinto a 0,009; `enemyChance.drawn` = `[]` | caso SOSTITUITO dai quattro casi D-28: costante 0,05 (in `pet-prize.spec.ts`), una `enemy` senza pet consuma esattamente un tiro |
| `test/quests/quest-generation.e2e.int-spec.ts`, `keeps generated quests on the board with no expiry (D-14)` | viewer sul marker della prima città del mondo, con `board.length > 0` vero solo perché il seme condiviso metteva almeno una quest in «Città 0» | viewer sul marker della città che ospita la prima quest generata; distribuzione osservata col seme 7 dopo il cambio: Città 0 = 0, Città 1 = 2, Città 2 = 1 (tipi `enemy`, `boss`, `enemy`); le tre quest sono create come prima |

La distribuzione di prima non è stata rimisurata (servirebbe il codice vecchio, e `stash`/`reset` sono vietati): si sa solo che «Città 0» ne aveva almeno una. Il caso non perde asserzioni e non dipende più dal seme.

**Rimasti verdi senza toccare un atteso:** tutti gli altri letterali di `quest-generation.e2e.int-spec.ts` (16, 11, 9, 30, 12 e le distribuzioni per città: dipendono dai tetti per taglia e dal target, non dalla sequenza), `quest-generation-access.e2e.int-spec.ts` (nessuna modifica), `quest-generation-trigger.int-spec.ts` (ripiego 0,99: nessuna fascia; nessuna modifica), i casi a seme fisso di `quest-generator.int-spec.ts` compreso `repeats the same quests for the same seed (D-17)`.

## Esito delle prove (dalla HEAD di codice `57604616`)

- `npx jest --selectProjects unit` → **275 suite, 3501 test** verdi prima di ognuno dei due commit GREEN (274 / 3493 dopo il task 1).
- Progetto integration intero, a pezzi, un jest alla volta — **148 suite, 2033 test, tutti verdi** (+3 test):
  - `src/characters test/app.int-spec.ts` → 24 suite, 472 test (79 s); boot reale 91 test; `git diff --exit-code src/schema.gql` a 0.
  - `src/travel src/shops src/economy src/cities src/lore src/models test/shops test/fixtures` → 29 suite, 420 test (104 s).
  - `src/quests` → 35 suite, 519 test (163 s).
  - resto → 60 suite, 622 test (121 s).
  - **Nota:** i primi due pezzi erano concatenati in un solo comando, che lo strumento ha spostato in background a 180 s; nessun altro jest è partito finché non è finito (attesa su `pgrep`), i pezzi successivi sono andati in primo piano uno per comando. `quest-resolution.processor.int-spec.ts` verde al primo giro.
- **Coverage di `src/quests/generation`** (unit + integration, 18 suite / 167 test): statements **99,11 %**, branches **88,92 %**, lines **99,66 %** (soglie 96 / 82 / 97); `pet-prize.ts` e `pet-candidate.ts` al 100 %. `package.json` non toccato.
- `npx tsc --noEmit -p tsconfig.json` → 0 dopo ogni commit GREEN. Prettier ed eslint sui file toccati, uno per uno: puliti. `pgrep -fl 'bin/jest'` vuoto a fine di ogni task.

## Criteri di accettazione

| Criterio | Esito |
|----------|-------|
| righe `  enemy` nel blocco `type Pet` dello SDL | 0 |
| `'pets', 'enemy'` nel registro; `toHaveLength(33)` nella spec | 1; 1 |
| `export function petPrizeOf`; le due costanti a 0.1 e 0.05 | 1; 1 e 1 |
| `D-28)` in `pet-prize.spec.ts` | 11 |
| `process.env` / `Math.random` / `Date.now` in `pet-prize.ts` | nessuna riga |
| `function petOf` / `petPrizeOf(` in `generated-prizes.ts` | 0 / 1 |
| definizioni di `BOSS_PET_PRIZE_CHANCE` sotto `src` | 1 |
| `sellable: false` nel servizio; `enemyIds` nel servizio; `poiTypes` in `generated-prizes.ts` | 0; 1; 3 |
| `D-28)` in `generated-prizes.spec.ts`; `D-21)` nella stessa | 4; 0 |
| `D-28)` in `quest-generator.int-spec.ts` | **4, non 3** (vedi deviazione 4) |
| `QUEST_PET_WIN_CHANCE = 0.2`; diff di `src/quests/outcomes` e di `package.json` nel piano | 1; 0 righe; 0 righe |

## Deviazioni dal piano

**1. [SoC, CLAUDE.md] lettore dei candidati in `pet-candidate.ts` (+ spec), fuori da `files_modified`**
- Il piano metteva la lettura in `readPets()` del servizio. È stata estratta come `readPetCandidates` accanto a `readEnemyCandidates` e `readPrizeCatalog` (stesso schema della cartella), con una unit di cinque casi `(D-28)` sul lettore sanificante (T-19-101): forma intera, legame scritto come stringa, pet senza campi, valori del tipo sbagliato, nemico sparito. `readPets()` resta e delega.

**2. [Regola 1 - Bug] confini delle fasce arrotondati**
- «I confini usano le somme delle costanti»: in virgola mobile 0.1 + 0.05 vale 0.15000000000000002 e il tiro 0.15 cadrebbe nella fascia di zona (il caso dei confini lo vuole nella terza). `boundaryAfter` somma le costanti e arrotonda al milionesimo; nessun letterale di confine nel codice.

**3. [Regola 1 - Spec a seme fisso] `quest-generation.e2e.int-spec.ts`, caso D-14**
- Non era un letterale ma un'ipotesi legata al seme (almeno una quest nella prima città). Corretta scegliendo la città dalla prima quest generata; dettagli nella tabella sopra.

**4. [Trappola di grep] `D-28)` in `quest-generator.int-spec.ts` stampa 4**
- Tre casi nuovi più il caso pre-esistente `skips a poi taken by a concurrent insert and keeps going (D-28)`, che è la D-28 della Phase 13. Nessun titolo ritoccato per far tornare il conteggio.

**5. [Regola 2 - Copertura] casi in più nella tabella di `petPrizeOf`**
- Rarità `toString` fra le sconosciute (nome ereditato dal prototipo, T-19-101); la seconda fascia provata anche su una quest `enemy`; il conteggio dei tiri provato anche per il tiro che manca ogni fascia.

**6. [Boy Scout] commento di `prizes.pet` in `src/models/quest/quest-prizes.model.ts`**
- Citava la regola superata; solo il commento, nello stesso commit GREEN del task 2.

**7. [Nota di struttura, come da piano] import circolare fra `generated-prizes.ts` e `pet-prize.ts`**
- Il piano vuole `pet-prize.ts` che importa `LOOT_POOLS`/`RARITY_RANK`/`indexOf` e `prizesOf` che chiama `petPrizeOf`: i due moduli si importano a vicenda. Funziona perché ogni uso incrociato è dentro una funzione (nessuno a livello di modulo) ed è coperto dalle due unit in entrambi gli ordini di caricamento. Scioglierlo (tabelle del loot in un file loro) è un refactor fuori scope: candidato per la review.

Nessuna decisione architetturale (Regola 4).

## Nota sul premio alla vittoria (`readPrizePets`, 19-11)

`ResolutionLoaderService.readPrizePets` legge il pet della quest per id, senza filtro sulla vendibilità, e riempie già `pets` (vita massima) e `petLore` per quel pet: allargare i candidati del generatore ai pet in vendita non lascia nessun pet vinto senza le sue lore. Nessuna modifica sotto `src/quests/outcomes` (diff a zero righe).

## Note per i piani successivi

- **19-23 (handoff FE):** nessun cambio sul filo in questo piano (`Pet.enemy` non è sullo SDL). Per la UAT: una quest generata `enemy` può ora portare un pet in premio (`prizes.pet`), prima solo le `boss`; la vittoria resta al 20 %.
- **19-23 (runbook del contenuto, D-25):** finché i pet non hanno `rarity` nessuna quest generata offre un pet, qualunque sia il legame. Lo script scrive `enemy` come ObjectId (una stringa esadecimale a 24 viene comunque letta); la zona di un pet è quella del NEMICO collegato (`Enemy.locations`), leggendari compresi; un pet senza legame può uscire solo nella terza fascia, e solo se `sellable` è `false` (assente o `null` non basta). I `legendary` escono solo dai boss hero. Controllo dopo lo script: nessun pet con `enemy` che non esiste fra i nemici.
- **Le quest già a tabellone non cambiano**: il premio nasce alla generazione.
- **Conteggi:** unit 275 suite / 3501 test; integration 148 suite / 2033 test (pezzi 24/472, 29/420, 35/519, 60/622); boot reale 91 test; registro dei ref 33 in 11 collection.
- BE-MODEL-12 lato codice è completo: nessuna spunta in REQUIREMENTS (piano di chiusura).

## Stub noti

Nessuno (`enemy: null` e `rarity: null` sono lo stato voluto fino alla cura a DB, D-25).

## Threat flags

Nessuna superficie nuova fuori dal threat model. T-19-99 (tabella del tetto, casi sopra/sotto, pet senza rarità mai candidato, caso sul replica set), T-19-100 (sei confini, fascia vuota che non passa alle altre, confini dalle costanti), T-19-101 (lettore sanificante con la sua unit), T-19-102 (contratto dichiarato nel codice, casi che contano i tiri, attesi mossi elencati qui), T-19-103 (nessun `@Field`, SDL senza diff, grep nel blocco `type Pet`) mitigati; T-19-104 accettato (file degli esiti senza diff).

## Self-Check: PASSED

- `pet-prize.ts`, `pet-prize.spec.ts`, `pet-candidate.ts`, `pet-candidate.spec.ts` esistono; i commit `e200d2e3`, `4db9732b`, `7a24d0a0`, `57604616` sono in `git log`; `git status --short` vuoto prima di questo documento.
