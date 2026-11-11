---
phase: 19-revisione-dei-modelli
plan: 23
subsystem: docs
tags: [gate, handoff, runbook, validazione, requisiti, D-12, D-13, D-25, D-26, D-27, D-28]
requires: [19-22]
provides:
  - "gate della fase misurato: `tsc`, unit e integration complete a blocchi, boot reale, SDL dichiarato, nomi vecchi, migratore isolato, coverage per cartella, invarianti"
  - "`BACKEND-NOTES.md`: tabella SDL vecchio → nuovo coi blocchi verbatim per la FE Phase 19, comportamenti provati, runbook del boot reale e del contenuto, domande"
  - "`19-VALIDATION.md` firmata; BE-MODEL-01, 02, 03, 05, 06, 07, 08 chiusi dal codice"
affects: [FE Phase 19, Phase 20]
tech-stack:
  added: []
  patterns: [coverage per cartella come ripiego di `test:cov`, blocchi SDL confrontati col file per differenza]
key-files:
  created:
    - .planning/phases/19-revisione-dei-modelli/BACKEND-NOTES.md
  modified:
    - .planning/phases/19-revisione-dei-modelli/19-VALIDATION.md
    - .planning/REQUIREMENTS.md
    - .planning/ROADMAP.md
    - .planning/STATE.md
decisions:
  - "Il gate non ha prodotto correzioni di codice: ogni invariante era già rispettato, salvo il subject di 74 caratteri di `00bd8556` (noto, non correggibile)"
  - "Il frontmatter di STATE.md non è stato toccato (nessun `gsd-tools state …`): solo i testi del corpo e `Plan: 23 of 23`, come nei piani precedenti"
metrics:
  duration: 25 min
  completed: 2026-11-11
  tasks: 3
  files: 6
---

# Phase 19 Plan 23: gate, handoff e runbook — Summary

La fase è verde e misurata dalla HEAD di codice `57604616`: lo SDL cambia solo come dichiarato, i nomi vecchi vivono solo nel migratore una tantum, che è ancora nel repo e isolato; il handoff `BACKEND-NOTES.md` dà alla FE Phase 19 la tabella dei cambi coi blocchi verbatim e all'orchestratore il runbook (backup, prova a secco, due boot, contenuto, rimozione del modulo in TDD). Sette requisiti chiusi dal codice, cinque lasciati aperti e dichiarati. Nessun codice toccato, nessun database reale toccato, nessuna build.

## Commit

| Task | Commit | Subject (caratteri) |
|------|--------|---------------------|
| 1 | — | nessun file: ogni invariante rispettato, nessuna correzione |
| 2 | `0113bd77` | `docs(phase-19): write the FE Phase 19 handoff and the boot runbook` (66) |
| 3 | `aa58d70f` | `docs(phase-19): sign the validation and close the code requirements` (67) |
| 3 | (questo e il successivo) | `docs(phase-19): summarize plan 23`, `docs(phase-19): record plan 23 progress` |

Subject contati PRIMA del commit; nessun trailer (controllo a `0` dopo ognuno). Nessun RED: piano di soli gate e documenti.

## Task 1 — esito del gate, punto per punto

### 1. Base della fase e type check

- `PHASE_BASE` = **`12a47d1f836fb865bb8fc0754a706072880f4918`** (`docs(phase-19): revise the plans after the plan check`), genitore del primo commit di codice `79b6a57e`; `abc5a5c4` è antenato di HEAD. 130 commit fra la base e la HEAD all'inizio del piano.
- `npx tsc --noEmit -p tsconfig.json` → 0.

### 2. Unit

`npx jest --selectProjects unit` → **275 suite, 3501 test** verdi (10 s).

### 3. Integration completa senza coverage, a blocchi

Ogni blocco in primo piano, un jest alla volta, `--runInBand`, `pgrep -fl 'bin/jest'` vuoto dopo ciascuno; nessuna spec appesa, nessun `--forceExit`.

| Blocco | Comando (`npx jest … --selectProjects integration --runInBand`) | Suite | Test | Tempo |
|--------|------------------------------------------------------------------|-------|------|-------|
| 1 | `src/characters src/migrations` | 35 | 453 | 101 s |
| 2 | `src/travel src/shops src/economy src/cities src/lore src/models test/shops test/fixtures` | 29 | 420 | 104 s |
| 3 | `src/quests` | 35 | 519 | 163 s |
| 4 | il resto: i 49 file di `--listTests` fuori dalle cartelle dei tre blocchi (`src/auth`, `src/authz`, `src/eventsub`, `src/graphql`, `src/http`, `src/mongo`, `src/pendingQuests`, `src/pets`, `src/pointsOfInterest`, `src/push`, `src/rest`, `src/roads`, `src/throttling`, `src/time`, `src/users`, `src/validation`, `test/app.int-spec.ts`, `test/auth`, `test/authz`, `test/harness`, `test/quests`), passati come percorsi posizionali | 49 | 641 | 91 s |
| **Totale** | | **148** | **2033** | |

`npx jest --selectProjects integration --listTests` elenca **148** file: 35 + 29 + 35 + 49 = 148. Stessi totali del piano 22 (il taglio dei blocchi è quello del piano 23: `src/migrations` nel primo, il boot reale nel quarto). `quest-resolution.processor.int-spec.ts` («real Redis», instabile nel 19-19) verde.

### 4. Boot reale e SDL

- `npx jest test/app.int-spec.ts --selectProjects integration --runInBand` → **91 test** verdi (4 s); `git diff --exit-code src/schema.gql` → 0.
- **Righe tolte rispetto alla base (17, lette a mano: tutte fra i «tolti» o i «cambiati di tipo» dichiarati):** il blocco `type ActiveSpell { spell: Spell, usages: Int! }` (4 righe); `activeSpells: [ActiveSpell!]!`, `ownedPets: [Pet!]!` (cambio di tipo) e `wearedEquipment: Equipment!` in `CharacterAssets`; `spells: [Spell!]!` in `CharacterStatus`; `baseWeaknesses` ed `energyWeaknesses` in `Enemy`; `foots: EquipmentItem` in `Equipment`; `image: String` in `Lore`; `currentLifePoints`, `damages`, `xp` in `Pet`; `quest: ID` in `PointOfInterest`; `foots` in `enum SlotType`.
- **Righe aggiunte (46):** `ownedPets: [OwnedPet!]!`, `wornEquipment`, `enum DamageType` (5), `weaknesses: Weaknesses!`, `enum EnergyType` (13), `feet: EquipmentItem`, `imagePath: String`, `type OwnedPet` (5), `attack`, `defense`, `rarity`, `relatedLore` in `Pet`, `petXpGained: Int!`, `enum RarityType` (7), `feet`, `active: Boolean!`, `type Weaknesses` (4, con la graffa di chiusura del blocco precedente spostata).
- **Presenza degli aggiunti, ognuno nel proprio blocco:** 1 (`weaknesses`), 2 (`attack`/`defense`), 1 (`relatedLore`), 1 (`rarity: RarityType`), 1 (`enum RarityType`), 0 (`enemy` in `type Pet`), 1 (`ownedPets: [OwnedPet!]!`), 1 (`wornEquipment`), 1 (`feet: EquipmentItem`), 1 (`feet` in `SlotType`), 1 (`active: Boolean!`), 1 (`petXpGained`), 1 (`imagePath`), 4 (i quattro blocchi nuovi) — tutti come attesi.
- **Assenza dei tolti:** 0, 0, 0, 0, 0.
- **Invariati:** `maxActiveSpells: Int!` 1; righe di `type City`, `type CityShop`, `type AmbushReport` nel diff 0; input dei modelli nello SDL 0; righe tolte dal blocco `type Mutation` 0.

### 5. Nomi vecchi

Per ognuno dei 14 nomi a parola intera (`energyWeaknesses`, `baseWeaknesses`, `wearedEquipment`, `foots`, `shopEquipment`, `shopLoot`, `shopPets`, `KGNotification`, `spellStatesRepairPipeline`, `inconsistentFilter`, `unmigratedFilter`, `spellStatesOrMigrated`, `mirrorFromStates`, `spellMaxUsages`), per `slot_type.enum` e `item_reference_type` senza `-w` e per il grep dei due path: **0 righe fuori da `src/migrations/model-review/`**.

Parola del motore (D-22): `grep -rnw "activeSpells" src test --include='*.ts'` fuori dal migratore stampa 33 righe in 10 file, tutti sotto `src/quests/outcomes/combat/`, `src/quests/outcomes/dungeon/` e `src/quests/outcomes/gm-overrides*` (stessi file della tabella del SUMMARY 19-20; là le righe erano 35 perché il grep non era a parola intera e contava l'helper `activeSpellsOf`). Con l'esclusione dell'orchestratore: nessuna riga.

### 6. Migratore al suo posto e isolato (D-12)

- `STEPS` ha nove classi nell'ordine di D-13 (`EnemyWeaknessesStep` … `SpellStatesStep`); intestazione `UNA TANTUM (Phase 19 D-12)` su tutti i 26 file della cartella.
- `ModelReviewMigrationModule` fuori dalla cartella solo in `src/app.module.ts`; nessun codice che resta importa dalla cartella (fuori da `src/app.module.ts` e `test/app.int-spec.ts`); `model review migration at boot (D-12)` in `test/app.int-spec.ts` = 1.
- **Due grep del piano non tornano alla lettera** (deviazione 1): `ls src/migrations/model-review/*.step.ts | wc -l` stampa **10**, e `grep -L "\.collection" …/*.step.ts` stampa `model-review.step.ts`.

### 7. Coverage per cartella (ripiego di `test:cov`)

Comando del piano per ogni percorso, progetti `unit integration`, `--runInBand`; confronto con `package.json` fatto da uno script `node` che esce 0. Soglie rilette da `package.json`: coincidono con la tabella del piano.

| Percorso | Statements | Branches | Lines | Soglia | Suite / test | Esito |
|----------|-----------|----------|-------|--------|--------------|-------|
| `./src/characters/spells/` | 99,11 | 89,1 | 99,33 | 97 / 88 / 97 | 16 / 276 | OK |
| `./src/characters/characters.service.ts` | 98,44 | 91,37 | 100 | 96 / 88 / 98 | 55 / 859 | OK |
| `./src/characters/equipment/` | 100 | 100 | 100 | 98 / 98 / 98 | 3 / 106 | OK |
| `./src/economy/` | 100 | 94,68 | 100 | 98 / 91 / 98 | 14 / 320 | OK |
| `./src/shops/` | 100 | 83,6 | 100 | 97 / 82 / 98 | 13 / 158 | OK |
| `./src/travel/` | 98,57 | 84,55 | 99,34 | 97 / 84 / 98 | 34 / 497 | OK |
| `./src/quests/generation/` | 99,11 | 88,92 | 99,66 | 96 / 82 / 97 | 19 / 258 | OK |

`git diff $PHASE_BASE --stat -- package.json | wc -l` → 0. Nessun caso aggiunto per le soglie. Il margine più stretto è sui rami di `./src/travel/` (84,55 contro 84).

### 8. Lint mirato

215 file `.ts` aggiunti o modificati dalla base: `prettier --check` pulito su tutti; `eslint` 0 errori e il solo warning preesistente `no-base-to-string` di `test/app.int-spec.ts` (riga 1062). Nessun commit `style` né `fix`.

### 9. Invarianti

| Invariante | Atteso | Esito |
|------------|--------|-------|
| file `.mjs` / `.json` / `.yaml` / `.csv` nel diff della fase | 0 | 0 |
| file con `seed` o `content` nel nome sotto `src test` | 0 | 0 |
| diff di `.env.example` e `src/config` | 0 | 0 |
| `process.env.` aggiunto in `src` non-spec | 0 | 0 |
| `Math.random` / `Date.now` aggiunti in `src` non-spec | 0 | 0 |
| `jest.mock(` aggiunti | 0 | 0 |
| `toHaveLength(33)` nel registro dei ref | 1 | 1 |
| definizioni di `BOSS_PET_PRIZE_CHANCE` | 1 | 1 |
| `QUEST_PET_WIN_CHANCE = 0.2` | 1 | 1 |
| diff di `expected-handlers.ts`, `handler-fixtures.ts`, `src/gameRules`, `placeholder-combat-resolver.ts` | 0 | 0 |
| diff dei sei file non puliti lasciati stare | 0 | 0 |
| trailer vietati nei commit della fase | 0 | 0 |
| subject oltre 72 caratteri | 0 | **1** — `00bd8556` (74), noto dal 19-14, vedi deviazione 2 |
| file `.env*` nel diff; URI di Mongo nei `.md` della fase e nel migratore | 0; 0 | 0; 0 |
| operatori Mongo nei SUMMARY fuori da code span | nessuno | nessuno (5 righe trovate in 19-03, 19-04, 19-05, 19-07, tutte dentro code span) |
| titoli di test nuovi con un operatore | 0 | 0 |
| `dist/` nel diff | 0 | 0 |
| `git status --short`; `pgrep -fl 'bin/jest'` | vuoti | vuoti (la cartella `coverage/` è ignorata) |

## Task 2 — handoff

`BACKEND-NOTES.md` (cinque sezioni `##`): §0 TL;DR; §1 tabella per area, blocchi verbatim (ognuno confrontato per differenza con `src/schema.gql`: identici; `type Weaknesses` differisce per la sola assenza dell'a-capo finale del file), cosa la FE seleziona e cosa no, semantica; §2 comportamenti con decisione e spec (ogni percorso citato esiste) e tabella dei nove passi; §3 runbook in otto passi con le regole in evidenza, la prova a secco, le nove righe del primo e del secondo boot, il contenuto (D-25..D-28) con le verifiche, la rimozione del modulo e le note UAT; §4 stato dei requisiti, sei domande, deviazioni della fase.

Criteri: `grep -c "^## "` = 5; `type SpellState` 2, `enum SlotType` 3, `relatedLore: [Lore!]!` 4, `active: Boolean!` 3, `imagePath: String` 4, `rarity: RarityType` 3; `Revisione dei modelli, ` 20; righe della tabella dei nove passi = 9; `defense` 11; BE-MODEL-04, 09, 10, 11, 12 presenti; `Molosso` 2; nessuna URI; nessun operatore Mongo nel file; «dopo la merge» compare due volte, entrambe riferite ai piani gated della FE (mai al contenuto dei pet); un solo file nel commit.

## Task 3 — validazione, requisiti, stato

- `19-VALIDATION.md`: `status: complete`, `nyquist_compliant: true`, `wave_0_complete: true`; le 19 celle «File Exists» ancora a W0 → `✅`; righe `19-23-01` e `19-23-02` → `✅ green` (la `19-23-03` nel commit di bookkeeping); 11 voci della Wave 0 e 6 del Sign-Off spuntate; `**Approval:** approved 2026-11-11`. «Manual-Only» invariata.
- `requirements mark-complete` per BE-MODEL-01, 02, 03, 05, 06, 07, 08: lo strumento ha aggiornato caselle e tabella di tracciabilità (`Complete`). **BE-MODEL-04, 09, 10, 11, 12 restano `[ ]`**; nella tabella la loro riga dice `Pending — …` con ciò che resta (per 10, 11 e 12: solo il contenuto a DB).
- ROADMAP: riga `**Stato (2026-11-11)**: 23/23 piani eseguiti; …` sotto la lista dei piani; la riga d'elenco della fase resta `[ ]`.
- STATE: Current focus, Phase, Status, Last activity, Next step e Session Continuity raccontano la fase eseguita e ciò che resta all'orchestratore.

## Requisiti

| Chiusi dal codice (qui) | Aperti, si chiudono DENTRO la fase dopo i passi dell'orchestratore |
|-------------------------|---------------------------------------------------------------------|
| BE-MODEL-01, 02, 03, 05, 06, 07, 08 | BE-MODEL-09 (boot reale e rimozione del modulo in TDD); BE-MODEL-04 (`maxXp` dei 44 pet); BE-MODEL-10 (collegamenti alle lore), BE-MODEL-11 (44 rarità), BE-MODEL-12 (31 legami) — per 10, 11 e 12 il codice è completo, resta solo il contenuto |

## Deviazioni dal piano

**1. [Trappola di glob] `*.step.ts` conta 10 file, non 9**
- **Trovato in:** Task 1, punto 6 (e nel verify automatico del Task 1, nel criterio del Task 3).
- **Causa:** il contratto `model-review.step.ts` ha lo stesso suffisso dei passi. I passi sono nove (`STEPS`, nove file di passo); lo stesso file è l'unico stampato da `grep -L "\.collection"` (non è un passo: non tocca il database).
- **Scelta:** nessun file rinominato per far tornare il numero (il modulo esce dal repo dopo il boot reale). Il verify `<automated>` del Task 1 quindi fallisce sul solo `= 9`; ogni altro suo pezzo è stato eseguito ed è verde. Annotato anche nel handoff §4 per il passo 7 del runbook.

**2. [Regola di REPO-RULES violata nel 19-14, non correggibile] subject di 74 caratteri**
- `00bd8556 refactor(models): drop the empty enum file and the dead notification model`: l'invariante «subject oltre 72 = 0» stampa 1. `--amend` e `rebase` sono vietati. Riportato nel handoff §4 per la decisione dell'orchestratore.

**3. [Forma del comando] lint in due invocazioni invece del ciclo per file**
- `prettier --check` ed `eslint` (senza `--fix`) hanno ricevuto l'elenco dei 215 file come argomenti espliciti (`xargs -0`), non un ciclo `for`: stesso insieme di file, stessa lettura dell'esito, 14 s invece di parecchi minuti. Nessun file riscritto.

**4. [Regola 3] percorsi in più nei comandi della coverage**
- Come nel 19-18: `test/app.int-spec.ts` fra i percorsi di ogni misura (i file di modulo sono coperti solo dal boot reale) e `test/shops` per `./src/shops/` e `./src/economy/` (le e2e dei negozi). L'ultima terna di misure (`economy`, `travel`, `characters.service.ts`) era concatenata in un solo comando che lo strumento ha spostato in background a 180 s: nessun altro jest è partito finché non è finito.

**5. [Nota dell'orchestratore e prassi della fase] nessun `gsd-tools state …`**
- Il flusso generico dell'executor prevede `state advance-plan`, `update-progress`, `record-metric`, `record-session`: non eseguiti. Il piano chiede «nessun altro campo del frontmatter» e i 22 piani precedenti hanno aggiornato STATE a mano (il frontmatter dice ancora `status: planned`, `completed_plans: 11`): lo riallinea l'orchestratore alla chiusura della fase.

**6. [Ordine dei commit di chiusura e forma di STATE] come nei piani 01–22**
- SUMMARY in un commit suo prima del bookkeeping; `Plan: 23 of 23`.

Nessuna correzione di codice (Regole 1–3) e nessuna decisione architetturale (Regola 4).

## Lette nel handoff con un'interpretazione mia (da confermare)

- **«Cavallo da viaggio `imagePath`»** nel passo di contenuto: scritto come «`imagePath` valorizzato sul pet e sulla sua lore nuova»; se l'orchestratore intendeva solo uno dei due, la riga della tabella del passo 6 va ristretta.
- **«Scheletro di cavallo da guerra» nella fascia**: la verifica dice `maxXp` ≤ 1250 (soglia `ultrarare` di D-27 per i pet solo da quest); i valori veri sono quelli della proposta approvata.
- **«Lupo invernale addestrato»**: nei documenti della fase non ci sono i suoi valori: la riga rimanda alla proposta approvata.

## Note per l'orchestratore

- **`npm run test:cov`** resta da lanciare in background; l'unica soglia col margine sotto il punto è `./src/travel/` sui rami.
- **Tre reviewer in parallelo:** nessun loro commit durante il piano; l'albero è pulito alla fine.
- **Dopo la rimozione del modulo** (runbook, passo 7) il conteggio delle suite scende di 13 (4 unit e 9 int-spec della cartella) e il boot reale tiene i suoi 91 test (un caso rinominato): i totali di questo SUMMARY valgono per la HEAD con il migratore.
- **`run-mixed-refs.cli.int-spec.ts`** gira contro `dist/`: dopo la build dalla HEAD il CLI compilato avrà 33 path; la semina della spec usa path che restano.
- Frontmatter di STATE.md e riga d'elenco della fase in ROADMAP da riallineare alla chiusura.

## Stub noti

Nessuno. `defense` vuota, `rarity` e `enemy` nulli sui pet sono lo stato voluto fino al contenuto (runbook, passo 6).

## Threat flags

Nessuna superficie nuova. T-19-87 (boot reale, diff a 0, righe tolte lette contro l'elenco, aggiunti nel proprio blocco, mutation senza righe tolte), T-19-88 (grep dei nomi vecchi a zero, integration completa), T-19-89 (regola nel runbook, processo fermo, ritorno col solo backup), T-19-90 (migratore presente e isolato, rimozione come passo del runbook, BE-MODEL-09 `[ ]`), T-19-91 (nessun `.env`, nessuna URI, segnaposto), T-19-92 (cinque requisiti `[ ]` verificati), T-19-94 (trailer a 0; un subject lungo dichiarato), T-19-95 (sette soglie misurate, `package.json` senza diff) mitigati; T-19-93 trasferita all'orchestratore (prova a secco e revisione dell'utente nel runbook).

## Self-Check: PASSED

- `BACKEND-NOTES.md` esiste; i commit `0113bd77` e `aa58d70f` sono in `git log`; `git status --short` vuoto prima di questo documento.
