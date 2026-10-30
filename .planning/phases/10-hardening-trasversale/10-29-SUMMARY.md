---
phase: 10-hardening-trasversale
plan: 29
subsystem: migrations
tags: [migration, cli, runbook, gate, d-17d, c14, be-hard-06]
requires:
  - phase: 10-26
    provides: script e CLI della migrazione, MixedRefsVerifier
  - phase: 10-27
    provides: ref condivisi e di catalogo tipizzati ObjectId
  - phase: 10-28
    provides: ref dei personaggi tipizzati ObjectId, nessun Mixed negli schemi
provides:
  - prova end-to-end del CLI compilato sul replica set di test
  - runbook di migrazione, deploy e rollback per l'utente
  - verifica manuale bloccante registrata in VALIDATION (PR draft fino al --verify di produzione)
affects: [10-30, 10-31]
tech-stack:
  added: []
  patterns: ["CLI compilato lanciato come processo figlio con env esplicito e minimo, mai lo spread dell'ambiente di jest"]
key-files:
  created:
    - src/migrations/run-mixed-refs.cli.int-spec.ts
    - docs/runbooks/mixed-refs-migration.md
  modified:
    - .planning/phases/10-hardening-trasversale/10-VALIDATION.md
key-decisions:
  - "La migrazione dei ref in produzione è dell'utente (runbook) ed è una verifica manuale bloccante: la PR della fase resta draft fino al report di --verify della produzione (D-17d, C14)"
  - "Il CLI compilato si prova in una int-spec con env esplicito (PATH, MONGO_URI del replset di test, DB dedicato mixed-refs-cli-test droppato a fine spec)"
requirements-completed: []
duration: ~25 min
completed: 2026-10-30
---

# Phase 10 Plan 29: Gate della wave 8 (ritipizzazione dei ref) Summary

Gate proprio della wave 8: regressione completa verde sopra il codice ritipizzato (unit 179/2392, unit + integration con coverage 278/3667, boot reale 65/65, build e type check a 0, SDL invariato), CLI compilato `dist/migrations/run-mixed-refs.js` provato end-to-end sul replica set di test, lettori tolleranti presenti, runbook `docs/runbooks/mixed-refs-migration.md` consegnato all'utente e verifica in produzione registrata come manual-only bloccante.

## Commit

| Task | Commit | Descrizione |
| ---- | ------ | ----------- |
| 1 RED | c0f4a8d | `test(migrations): prove the compiled migration CLI` |
| 2 | 6698cc3 | `docs(phase-10): add the Mixed reference migration runbook` (runbook + VALIDATION) |

## Int-spec del CLI compilato

`src/migrations/run-mixed-refs.cli.int-spec.ts` (6 casi, tutti con `(D-17d)` nel titolo): lancia `node dist/migrations/run-mixed-refs.js <modalità>` con `spawn(process.execPath, …)` e `env` = `{ PATH, MONGO_URI: MONGO_TEST_URI del globalSetup, DB_NAME: 'mixed-refs-cli-test' }`; seme legacy con il driver nativo (3 ref esadecimali in stringa: `users.currentCharacter`, `characters.status.spells`, `characters.assets.ownedItems.item`); DB droppato prima di ogni caso e a fine spec.

- **RED visto:** con `dist/migrations/run-mixed-refs.js` rimosso, 5 rossi su 6 (node esce 1: modulo non trovato); verde solo «never prints the connection string». È il fallimento atteso documentato nella testata (la spec richiede `dist/`).
- **GREEN:** dopo `npm run build`, 6/6 (2.7 s). Nessuna modifica al CLI: esiste dal 10-26 (verde al primo colpo con `dist/` presente).
- Exit code osservati: `--dry-run` 0 (report `mode: 'dry-run'`, residui 3, nessuna scrittura: un `--verify` successivo vede ancora 3); `--verify` con residui 1; `--apply` 0 (modificati 3) poi `--verify` 0 (residui 0); seconda `--apply` 0 con modificati 0; senza modalità 2 (nessuna scrittura). Nessuna uscita contiene la stringa di connessione (`toEqual([false, false, false, false])`).

## Gate della wave

| Comando | Esito | Durata |
| ------- | ----- | ------ |
| `npm run build` | 0, emette `dist/migrations/run-mixed-refs.js` | 5 s |
| `npx tsc --noEmit -p tsconfig.json` | 0 | 6 s |
| `npm run test:unit` | 179 suite / 2392 test verdi | 8 s |
| `npm run test:cov` (unit + integration `--runInBand`, soglie) | exit 0, 278 suite / 3667 test (277/3661 al 10-28 + la spec del CLI), soglie per cartella rispettate; totale S 96.55 / B 85.14 / F 91.44 / L 97.1 | 337 s |
| boot reale `npx jest test/app.int-spec.ts --selectProjects integration --runInBand` | 65/65, incluso «mounts the Mixed references verifier» | 6 s |
| `git diff --exit-code src/schema.gql` | 0 | — |
| `git diff origin/develop -- src/schema.gql` righe rimosse / aggiunte | 0 / solo `+  pendingQuest: ID` | — |
| `grep -rnE 'type: (\[)?Types\.ObjectId' src/models` (esclusi spec) | vuoto | — |
| `grep -rlE 'Types\.Mixed' src/models` | vuoto | — |
| `git diff origin/develop --stat -- src/mongo/document-id.ts` | vuoto | — |
| `pgrep -fl jest` (repo) | vuoto | — |

## Lettori tolleranti (C14)

Chiamate `nome(` in `src` (somma con `$NF`):

| Lettore | origin/develop | HEAD |
| ------- | -------------- | ---- |
| `refIdOf` | 46 | 49 |
| `idForms` | 50 | 54 |
| `sameId` | 26 | 26 |
| `objectIdFromHex` | 37 | 38 |

Occorrenze di `refIdOf`/`idForms` senza parentesi: 138 → 148 (come al 10-28). Tutti presenti; la rimozione è nel backlog v1.1.

## Runbook

`docs/runbooks/mixed-refs-migration.md`, sei sezioni: `## Perché`, `## Prerequisiti` (MongoDB ≥ 4.2 con `db.version()`, scrittura, Node 22, `npm ci && npm run build`, file env fuori dal repo con `MONGO_URI` e `DB_NAME`), `## Ordine` (1 `mongodump`, 2 `mongorestore` su copia, 3 copia `--dry-run`/`--apply`/`--verify`/seconda `--apply`, 4 produzione col codice ATTUALE `--dry-run`/`--apply`/`--verify`, 5 deploy, 6 OBBLIGATORIO subito dopo il deploy `--apply` + `--verify`, 7 log del verificatore al boot, rimedio rieseguire `--apply` + `--verify`), `## Rollback`, `## Dopo la verifica`, `## Codici d'uscita e report`. Comandi nella forma `node --env-file=<file env della copia> dist/migrations/run-mixed-refs.js --verify`; solo placeholder. Legame con la PR in testa: draft finché i passi 1-4 non sono fatti e il report di `--verify` della produzione non è allegato.

## Deviations from Plan

1. **[Rule 3 - Blocking] Nessun commit GREEN separato.** Il CLI esiste dal 10-26 e non serviva alcuna modifica di produzione: il RED (spec senza `dist/` compilato) e il verde (dopo `npm run build`) sono sullo stesso commit `test(migrations): …` del piano; un commit vuoto non avrebbe senso.
2. **`spawn` asincrono al posto di `spawnSync`.** Con `--runInBand` il replica set di test vive nello stesso processo di jest: `spawnSync` bloccherebbe il suo event loop mentre il figlio parla con mongod. Stessa forma dell'env indicata dal piano.
3. **Codici d'uscita reali documentati:** il piano cita «2 uso/versione»; il sorgente ha anche `3` (errore di esecuzione, riga JSON con solo nome e codice). Il runbook li documenta tutti e quattro, e precisa che `--verify` esce 1 anche con `poiTypeScalars` > 0 (`hasResidualRefs`).
4. **Caso aggiuntivo** «never prints the connection string (D-17d)» come `it` a sé (il piano lo elencava come asserzione): 6 casi invece di 5.
5. Prettier eseguito sul solo runbook (riformattazione di tabelle/elenchi, nessun cambio di contenuto).

## Deferred Issues

- **Test instabile del boot reale** (`test/app.int-spec.ts` › global auth guard, «rejects an existing mutation without a bearer» e «keeps introspection available outside production (D-05)»): NON si è ripresentato in questo piano (1 `test:cov` completo verde + 1 boot reale isolato verde). Conteggio: 1 fallimento su 3 run di `test:cov` al 10-24, poi 5 run verdi (10-25, 10-28) e 2 verdi qui. Lasciato alla code review di fase; nessuna modifica alla spec.
- **Esecuzione in produzione** della migrazione: PENDENTE (utente), riga manual-only in VALIDATION.

## Verifiche

- Verify automatica del Task 1 (build, tsc, unit, cov, schema, grep ObjectId, pgrep) e del Task 2 (sezioni, comando `--verify`, nessuna URI reale, «Gate wave 8» in VALIDATION): verdi.
- Accettazione: `grep -c "^## "` sul runbook = 6; «subito dopo il deploy» 2 righe; «rieseguire» 1 riga; nessuna `mongodb://` seguita da caratteri; `PENDENTE` 1 riga in VALIDATION; `grep -c "it('"` sulla spec = 6.
- Nessun file di produzione in `src/` toccato; `src/schema.gql` invariato.

## Note per l'handoff (10-30) e il gate finale (10-31)

- L'handoff riporta dal runbook: ordine di deploy (migrazione `--apply` + `--verify` in produzione PRIMA del deploy, poi di nuovo subito dopo, controllo del log «Ref stringa ancora da migrare»), rollback (ridistribuire il codice precedente; dump solo se lo script ha sbagliato), PR draft finché il `--verify` di produzione non è allegato.
- Il 10-31 compila (`npm run build`) prima di `test:cov`/`test:int`: la spec del CLI richiede `dist/`.

## Self-Check: PASSED

File creati presenti (`src/migrations/run-mixed-refs.cli.int-spec.ts`, `docs/runbooks/mixed-refs-migration.md`); commit `c0f4a8d` e `6698cc3` presenti nella storia.
