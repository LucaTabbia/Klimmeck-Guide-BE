---
phase: 19-revisione-dei-modelli
plan: 03
subsystem: models
tags: [nemici, magie, riferimenti, populate, migrazione, D-02, D-12]
requires: [19-02]
provides:
  - `Enemy.spells` a Mongoose come lista di `ObjectId` ref `Spell` (SDL identico)
  - populate di `spells` nei tre punti che servono un `Enemy` sul filo
  - funzione pura `matchEmbeddedSpells(copies, catalog)` e passo `EnemySpellsStep` (secondo di `STEPS`)
  - builder `legacyEnemyWithSpells(copies, overrides)`
affects: [19-04, 19-22, 19-23]
tech-stack:
  added: []
  patterns: [populate annidato sotto il path del nemico, funzione pura + applicazione col driver nativo]
key-files:
  created:
    - src/migrations/model-review/enemy-spells.step.ts
    - src/migrations/model-review/enemy-spells.step.spec.ts
    - src/migrations/model-review/enemy-spells.step.int-spec.ts
  modified:
    - src/models/enemy.model.ts
    - src/models/enemy.schema.spec.ts
    - src/enemies/enemies.service.ts
    - src/enemies/enemies.module.ts
    - src/quests/quest-catalog.populate.ts
    - src/quests/quest-catalog.populate.spec.ts
    - src/quests/results/quest-result.populate.ts
    - src/quests/results/quest-result.populate.spec.ts
    - src/quests/quests.resolver.int-spec.ts
    - src/quests/results/quest-result.resolver.int-spec.ts
    - src/lore/lore-related.int-spec.ts
    - src/migrations/model-review/legacy-fixtures.ts
    - src/migrations/model-review/model-review.module.ts
decisions:
  - Un ref già presente ma non a catalogo viene tolto dalla lista E contato fra i «senza corrispondenza» con l'etichetta `<riferimento <id>>` (nessuna rimozione silenziosa)
  - `EnemiesModule` registra il modello `Spell` nel proprio `forFeature` (il populate lo risolve sulla connessione)
metrics:
  completed: 2026-11-11
  tasks: 3
  files: 16
---

# Phase 19 Plan 03: Magie dei nemici per riferimento — Summary

`Enemy.spells` è una lista di riferimenti al catalogo popolata nel catalogo dei nemici, nel catalogo delle quest e nel foglio del risultato, con lo SDL identico; il passo `EnemySpellsStep` sostituisce le copie incorporate con gli id del catalogo (per `_id`, poi per nome univoco) senza inventare nulla, e nomina nel log ogni copia lasciata fuori.

## Commit

| Task | Commit | Subject |
|------|--------|---------|
| 1 RED | `9ef0c797` | `test(models): pin the enemy spells as catalogue references` |
| 1 GREEN | `ba8ad371` | `feat(models): reference the enemy spells from the catalogue` |
| 2 RED | `b2c1e077` | `test(migrations): pin the enemy spells matching and step` |
| 2 GREEN | `292af163` | `feat(migrations): add the enemy spells step` |
| 1 (coda) | `dbd0f77a` | `test(quests): pin the nested spells populate of the quest enemies` |
| 3 | (questo e il successivo) | `docs(phase-19): summarize plan 03`, `docs(phase-19): record plan 03 progress` |

Nessun trailer in nessun commit (controllo a `0` dopo ognuno).

## Evidenza RED

- **Task 1, schema** — `stores the enemy spells as typed references to the catalogue (D-02)`: atteso `{ instance: 'Array', caster: 'ObjectId', ref: 'Spell' }`, ricevuto `caster` e `ref` `undefined` (path ancora di sotto-documenti).
- **Task 1, filo (catalogo delle quest e foglio del risultato)** — entrambi i casi falliti su `errors`: `Cannot return null for non-nullable field Spell.name.` sul path `…enemy.spells.0.name` (con lo schema vecchio i due id diventano due copie vuote).
- **Task 1, filo (catalogo dei nemici, caso aggiunto, vedi deviazione 1)** — provato rosso togliendo a mano il populate dal servizio già scritto: `ID cannot represent value: { type: "Buffer", … }` sul path `enemys.0.spells.0.id` (id nudo sul filo); poi populate ripristinato. Il caso è nel commit GREEN, non in quello RED.
- **Task 2** — `Cannot find module './enemy-spells.step'` in entrambe le spec (0 test eseguiti, modulo assente).
- **Verdi al primo colpo:** nessuno dei casi nuovi.

## Forma del filtro di guardia

`{ spells: { $elemMatch: { $type: 'object' } } }` sulla collection `enemies` col driver nativo: per il server un `ObjectId` non è di tipo oggetto, quindi una lista di soli ref (o vuota) non entra nel passo. Il passo legge il catalogo delle magie una volta (`_id`, `name`), poi per ogni nemico trovato una scrittura `updateOne` che imposta la lista di id. Report: `found` = nemici della collection, `migrated` = nemici scritti, `alreadyDone` = differenza, `unmatched` = elementi lasciati fuori (somma su tutti i nemici scritti; alla seconda corsa è 0 perché nessun nemico entra più nel filtro).

Riga di dettaglio (una per elemento lasciato fuori, `Logger.warn`): `Revisione dei modelli, magie dei nemici: copia senza corrispondenza «<nome>» sul nemico <_id>`.

## Regole di `matchEmbeddedSpells`

- elemento già `ObjectId` o stringa esadecimale: tenuto se a catalogo, altrimenti tolto e riportato come `<riferimento <id>>`;
- copia oggetto: per `_id` (anche salvato come stringa) se a catalogo, altrimenti per `name` uguale esatto con UNA sola magia a catalogo; l'id vince su un nome diverso;
- nome con due magie a catalogo, nome sconosciuto, copia senza nome (`<senza nome>`), elemento nullo: fuori dalla lista e in `unmatched`;
- ordine delle copie conservato, nessun id ripetuto (il doppione non è «senza corrispondenza»).

## Esito dei casi sul filo

- `quests { infos { enemies { enemy { spells { id name } } } } }` con un nemico `spells: [<magia>, <id inesistente>]` → la sola magia esistente, nessun errore.
- `questResult(id) { enemies { enemy { spells { id name } } } }` → idem.
- `enemys` ed `enemy(id)` → idem (caso aggiunto).
- `git diff --exit-code src/schema.gql` → 0 dopo ogni task: SDL identico.

## Esito delle prove

- `npx jest --selectProjects unit` (controllo di wave) → 262 suite, 3333 test verdi.
- `npx jest src/quests --selectProjects integration --runInBand` (controllo di wave) → 35 suite, 501 test verdi, 168 s. Rimasto in primo piano (nessuno spostamento in background), nessun altro jest in corsa.
- `npx jest src/lore src/validation src/travel/ambush src/travel/travel.service.int-spec.ts src/migrations/model-review test/app.int-spec.ts --selectProjects integration --runInBand` → 15 suite, 237 test verdi (boot reale 86/86, passo delle magie 5/5, debolezze 6/6).
- `npx jest src/migrations/model-review --selectProjects unit` → 11/11 (7 della tabella + 4 del boot).
- `npx tsc --noEmit -p tsconfig.json` → 0 dopo ogni task di codice. Prettier ed eslint sui file toccati, uno per uno: puliti.
- `pgrep -fl 'bin/jest'` vuoto a fine di ogni task.

## Criteri di accettazione

| Criterio | Esito |
|----------|-------|
| `grep -c "SpellSchema" src/models/enemy.model.ts` = 0 | 0 |
| `path: 'spells'` in `enemies.service.ts` ≥ 1, `quest-catalog.populate.ts` = 1, `quest-result.populate.ts` = 1 | 1, 1, 1 |
| `D-02)` in `enemy.schema.spec.ts` = 1; nelle due int-spec ≥ 1 | 1; 2 e 1 |
| `D-02)` in `enemy-spells.step.spec.ts` = 7; in `enemy-spells.step.int-spec.ts` = 4 | 7; 4 |
| `export function matchEmbeddedSpells` = 1 | 1 |
| `EnemySpellsStep` in `model-review.module.ts` ≥ 2 | 2 |
| intestazione una tantum su ogni file della cartella | sì |
| nessun `process.env`, `Math.random`, `Date.now` nella cartella | vuoto |
| righe `19-03-01..03` della VALIDATION `✅ green` | 3 |

## Deviazioni dal piano

**1. [Regola 2 — minaccia T-19-09] Terzo caso sul filo e modello `Spell` registrato in `EnemiesModule`**
- **Trovato in:** Task 1.
- **Causa:** il piano chiede il populate in tre punti ma prova sul filo solo i due delle quest; il servizio del catalogo dei nemici restava senza prova. Il caso aggiunto in `src/lore/lore-related.int-spec.ts` (l'unica int-spec che monta `EnemiesModule` con la query `enemys`) ha fatto emergere un difetto vero: nell'harness il populate falliva con `MissingSchemaError: Schema hasn't been registered for model "Spell"` e rompeva anche i due casi esistenti sui nemici (D-10). Nell'app reale lo nasconde il `MongoModule` globale.
- **Scelta:** `{ name: Spell.name, schema: SpellSchema }` nel `forFeature` di `EnemiesModule`; caso `serves the spells of every enemy from the catalogue (D-02)` (lista e singolo, con un ref orfano).
- **File fuori da `files_modified`:** `src/enemies/enemies.module.ts`, `src/lore/lore-related.int-spec.ts`.

**2. [Regola 1 — pin dimenticati dal commit del modello] Le due tabelle unitarie dei populate**
- **Trovato in:** controllo di wave (suite unit completa), dopo il Task 2.
- **Causa:** `quest-catalog.populate.spec.ts` e `quest-result.populate.spec.ts` pinnano le due liste con `toEqual` («enemies one level deep»): col populate annidato erano rosse. Il verify del Task 1 non le esegue e non le avevo lanciate.
- **Scelta:** aggiornate le due attese e i due titoli (ora nominano D-02) in un commit `test(quests)` a parte (`dbd0f77a`), niente amend. Fra `ba8ad371` e `dbd0f77a` la suite unit ha quindi due casi rossi: da sapere per un eventuale bisect.

**3. [Scelta dentro il contratto] Un ref pendente tolto dalla lista è contato**
- Il piano dice «elemento già ObjectId: tenuto se esiste a catalogo» e, nel titolo del caso, «drops one that is not in the catalogue», senza dire se va riportato. Scelto di contarlo in `unmatched` con l'etichetta `<riferimento <id>>`: il passo non toglie mai nulla in silenzio (T-19-10). Vale solo per i nemici che hanno anche almeno una copia incorporata: una lista di soli ref non entra nel filtro di guardia e non viene toccata.

**4. [Nessun cambio] `test/fixtures/enemy.fixture.ts`**
- Già `spells: []`: nessuna modifica (il piano la elencava «se oggi costruisce copie»).

**5. [Ordine dei commit di chiusura e forma di STATE] come nei piani 01 e 02**
- SUMMARY in un commit suo prima del bookkeeping; `Plan: 3 of 23`: il `grep -q "Plan: 03 of 23"` del piano non trova la riga, è atteso.

Il letterale del populate è ripetuto nei tre file (come chiede il piano e come cercano i `key_links`), non estratto in una costante condivisa. Nessuna decisione architetturale (Regola 4).

## Note per i piani successivi

- **Builder:** `legacyEnemyWithSpells(copies, overrides)` in `legacy-fixtures.ts` (le copie sono oggetti qualunque, anche già id); le magie a catalogo delle int-spec si inseriscono con `insertLegacy(connection, Spell.name, buildSpell({ name }))`.
- **`STEPS`** oggi è `[EnemyWeaknessesStep, EnemySpellsStep]`; il `forFeature` del modulo ha `Enemy` e `Spell`: il 19-04 accoda la sua classe e aggiunge `Pet`.
- **Boot reale di test:** ora logga due righe (`debolezze dei nemici`, `magie dei nemici`, entrambe a zero); `test/app.int-spec.ts` conta sempre 86 test (nessun caso nuovo in questo piano).
- **Spia sul log:** `jest.spyOn(Logger.prototype, 'warn')` con `mockRestore` in `afterEach` basta per i passi che hanno righe di dettaglio.
- **Un modulo che popola un ref nuovo deve registrarne il modello nel proprio `forFeature`:** nell'app lo copre il `MongoModule` globale, negli harness no (deviazione 1). Vale per `Pet.relatedLore` (19-11), `Pet.enemy` (19-22) e `assets.ownedPets.pet`.
- **Le liste dei populate hanno una spec unitaria con `toEqual` sull'intera lista** (`quest-catalog.populate.spec.ts`, `quest-result.populate.spec.ts`): chi tocca i populate lancia anche quelle (o la suite unit completa, 10 s) prima del commit GREEN.
- **Registro dei ref (`mixed-ref-paths`)**: resta a 34; `enemies:spells` non è stato aggiunto (la sequenza di REPO-RULES non lo prevede e il path nasce già tipizzato `ObjectId`).
- **Prova a secco dell'orchestratore:** attesi `trovati 206, migrati 45, già a posto 161, senza corrispondenza 0` e nessuna riga WARN; al secondo boot `migrati 0`. Un nemico non migrato letto col codice nuovo risponde `spells: []` senza errore (probe della ricerca), quindi la finestra prima del boot non rompe il filo.
- BE-MODEL-02 è chiuso lato codice; la spunta in REQUIREMENTS resta al piano di chiusura.

## Stub noti

Nessuno.

## Self-Check: PASSED

- I tre file creati esistono; i cinque commit `9ef0c797`, `ba8ad371`, `b2c1e077`, `292af163`, `dbd0f77a` sono in `git log`.
