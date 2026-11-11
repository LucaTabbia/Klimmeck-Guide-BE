---
phase: 19-revisione-dei-modelli
plan: 01
subsystem: migrations
tags: [migrazione, una-tantum, boot, D-12]
requires: []
provides:
  - contratto dei passi (`ModelReviewStep`, `ModelReviewStepReport`, `MODEL_REVIEW_STEPS`, `stepReportLine`)
  - boot a passi mai bloccante (`ModelReviewBoot`)
  - modulo una tantum `ModelReviewMigrationModule` importato solo da `AppModule`
  - helper delle fixture nella forma vecchia (`insertLegacy`, `rawById`)
affects: [19-02, 19-03, 19-04, 19-12, 19-13, 19-14, 19-15, 19-20]
tech-stack:
  added: []
  patterns: [lista di passi iniettata con un token, una riga di soli conteggi per passo]
key-files:
  created:
    - src/migrations/model-review/model-review.step.ts
    - src/migrations/model-review/model-review.boot.ts
    - src/migrations/model-review/model-review.boot.spec.ts
    - src/migrations/model-review/legacy-fixtures.ts
    - src/migrations/model-review/model-review.module.ts
  modified:
    - src/app.module.ts
    - test/app.int-spec.ts
decisions:
  - Le due righe di log (successo e fallimento) nascono in `model-review.step.ts` da un solo prefisso condiviso
metrics:
  completed: 2026-11-11
  tasks: 3
  files: 7
---

# Phase 19 Plan 01: Scheletro del migratore una tantum — Summary

Modulo una tantum `src/migrations/model-review/` con contratto dei passi, boot in serie mai bloccante con una riga di soli conteggi per passo, helper delle fixture nella forma vecchia e cablaggio provato nel boot reale di test. Nessun passo ancora, nessuna scrittura, SDL invariato.

## Commit

| Task | Commit | Subject |
|------|--------|---------|
| 1 RED | `79b6a57e` | `test(migrations): pin the model review boot steps and log lines` |
| 1 GREEN | `afe925a1` | `feat(migrations): add the model review step contract and boot` |
| 2 RED | `0dbe58a3` | `test(migrations): pin the model review module at the real boot` |
| 2 GREEN | `9bc0eed4` | `feat(migrations): mount the one-off model review module` |
| 3 | (questo e il successivo) | `docs(phase-19): summarize plan 01`, `docs(phase-19): record plan 01 progress` |

Nessun trailer in nessun commit (controllo a `0` dopo ognuno).

## Evidenza RED

- **Task 1** — `npx jest src/migrations/model-review --selectProjects unit`: suite fallita con `Cannot find module './model-review.boot' from 'src/migrations/model-review/model-review.boot.spec.ts'` (0 test eseguiti: moduli assenti, come atteso dal piano).
- **Task 2** — `npx jest test/app.int-spec.ts --selectProjects integration --runInBand -t "model review migration"`: 1 fallito, `Expected value: "ModelReviewMigrationModule"` non presente fra i nomi dei moduli montati. L'import di `ModelReviewBoot` nella spec compila già (classe creata nel task 1), quindi il rosso è sull'asserzione e non sull'import.

## Esito delle prove

- `npx jest src/migrations/model-review --selectProjects unit` → 4/4 verdi.
- `npx jest test/app.int-spec.ts --selectProjects integration --runInBand` → 85/85 verdi (84 + il caso nuovo), ≈ 5 s.
- `git diff --exit-code src/schema.gql` → 0 (SDL invariato).
- `npx tsc --noEmit -p tsconfig.json` → 0 dopo ogni task di codice.
- `npx prettier --write` e `npx eslint` sui sette file, uno per uno: puliti (su `test/app.int-spec.ts` resta un warning preesistente `no-base-to-string` alla riga 975, fuori dallo scope).
- `pgrep -fl 'bin/jest'` vuoto a fine di ogni task.

## Criteri di accettazione

| Criterio | Esito |
|----------|-------|
| `grep -c "D-12)" …/model-review.boot.spec.ts` = 4 | **5** — vedi deviazione 1 |
| `grep -c "describeError(" …/model-review.boot.ts` = 1 | 1 |
| `grep -cF "Revisione dei modelli, " …/model-review.step.ts` ≥ 1 | 1 |
| `grep -L "UNA TANTUM (Phase 19 D-12)" src/migrations/model-review/*.ts` vuoto | vuoto (5 file) |
| nessun `process.env`, `Math.random`, `Date.now`, nessun import del modulo dell'app nella cartella | vuoto |
| `ModelReviewMigrationModule` fuori dalla cartella solo in `src/app.module.ts` | sì |
| `grep -c "model review migration at boot (D-12)" test/app.int-spec.ts` = 1 | 1 |
| `grep -c "MODEL_REVIEW_STEPS" …/model-review.module.ts` ≥ 1 | 2 |
| righe `19-01-01..03` della VALIDATION `✅ green` | 3 |

## Deviazioni dal piano

**1. [Contraddizione fra due criteri del piano] `grep -c "D-12)"` sulla spec stampa 5, non 4**
- **Trovato in:** Task 1.
- **Causa:** il piano chiede la riga d'intestazione `// UNA TANTUM (Phase 19 D-12): …` su ogni file della cartella, spec comprese; quella riga contiene `D-12)` e si somma ai quattro titoli dei test.
- **Scelta:** tenuta l'intestazione (è il grep di isolamento del gate); i titoli che nominano la decisione sono esattamente quattro. Nessun codice cambiato per far tornare il numero.
- **Per i piani successivi:** ogni grep `D-NN)` su un file di questa cartella conta una riga in più quando NN = 12.

**2. [Nota dell'orchestratore contro il verify del piano] `Plan: 1 of 23` invece di `Plan: 01 of 23`**
- **Trovato in:** Task 3.
- **Causa:** il verify del piano cerca `Plan: 01 of 23`; la nota dell'orchestratore dà `Plan: 1 of 23`, che è anche la forma già in uso in STATE.md (`Plan: 0 of 23`).
- **Scelta:** `Plan: 1 of 23` (la nota dell'orchestratore vince). Il `grep -q "Plan: 01 of 23"` del piano quindi non trova la riga: è atteso.

**3. [Ordine dei commit di chiusura] SUMMARY in un commit suo**
- Il piano mette il SUMMARY nel commit di bookkeeping; la nota dell'orchestratore chiede `docs(phase-19): summarize plan 01` e poi `docs(phase-19): record plan 01 progress`. Seguita la nota.

**4. [Aggiunta minima, Clean Code] `stepFailureLine` e `MODEL_REVIEW_LOG_PREFIX` esportati da `model-review.step.ts`**
- Il contratto del piano nomina solo `stepReportLine`; la riga d'errore usa lo stesso prefisso, quindi le due righe nascono nello stesso file da una sola costante invece di ripetere il letterale nel boot. I formati sul log sono quelli fissati dal piano, alla lettera (provati dai casi 1–3).

Nessuna correzione automatica di bug (Regole 1–3) e nessuna decisione architetturale (Regola 4).

## Note per i piani successivi

### Come si aggiunge un passo

1. Un file `src/migrations/model-review/<nome>.step.ts` (prima riga `// UNA TANTUM (Phase 19 D-12): <cosa fa> — esce dal repo dopo il boot reale`) con una classe `@Injectable()` che `implements ModelReviewStep`: `readonly label = '…'` (in italiano, è il testo che finisce nel log) e `run(): Promise<ModelReviewStepReport>`.
2. In `model-review.module.ts`: accodare la classe a `STEPS` (l'ordine dell'array è l'ordine di esecuzione, D-13) e aggiungere a `imports` il `MongooseModule.forFeature([...])` dei modelli che il passo legge (senza schema registrato `connection.model(name)` lancia `MissingSchemaError`). **Nient'altro da toccare**: i provider si costruiscono da `STEPS` (`...STEPS` + `inject: STEPS`), il boot non cambia.
3. Il passo NON cattura i propri errori e NON logga i conteggi: ritorna il report e lascia fare al boot (`try/catch` per passo, `describeError`). Log aggiuntivi solo dove REPO-RULES li prevede (D-02: nome della magia e `_id` del nemico delle copie non abbinate).
4. `alreadyDone` = `found - migrated`; `unmatched` = anomalie contate e mai corrette.

### Formato dei log (fisso, provato)

- successo: `Revisione dei modelli, <label>: trovati <found>, migrati <migrated>, già a posto <alreadyDone>, senza corrispondenza <unmatched>`
- errore: `Revisione dei modelli, <label>: fallito (<describeError>), il boot prosegue`
- lista vuota: nessuna riga (oggi il boot reale non logga nulla per questo modulo).

### Helper delle fixture (`legacy-fixtures.ts`)

- `insertLegacy(connection, modelName, doc)` → `Types.ObjectId` inserito col driver nativo (`connection.model(modelName).collection.insertOne`): il documento arriva a DB tale e quale, campi vecchi compresi.
- `rawById(connection, modelName, id)` → documento grezzo o `null` (`collection.findOne`): le verifiche dei passi si fanno su questo, mai sul documento idratato.
- `modelName` è `X.name` della classe del modello (il nome della collection lo risolve Mongoose); il modello deve essere registrato sulla connessione dell'harness (`forFeature`).
- Nessun builder di dominio dentro: ogni piano aggiunge nello stesso file i builder della propria forma vecchia.
- Gli helper non hanno ancora una spec propria (servono un database): li esercita la prima int-spec di un passo (19-02).

### Altro

- Il caso del boot reale prova sia il nome del modulo fra quelli di `ModulesContainer` sia `app.get(ModelReviewBoot)`: al momento della rimozione (M-5) l'import di `ModelReviewBoot` in `test/app.int-spec.ts` va tolto insieme al caso.
- `test/app.int-spec.ts` conta ora 85 test (era 84).
- BE-MODEL-09 resta aperto (parte strutturale fatta; si chiude dopo il boot reale e la rimozione del modulo).

## Stub noti

`STEPS` è vuota di proposito: i passi arrivano coi piani delle singole decisioni.

## Self-Check: PASSED

- I cinque file di `src/migrations/model-review/` esistono; `src/app.module.ts` e `test/app.int-spec.ts` modificati.
- I commit `79b6a57e`, `afe925a1`, `0dbe58a3`, `9bc0eed4` sono in `git log`.
