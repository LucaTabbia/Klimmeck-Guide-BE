---
phase: 11-popolamento-del-mondo
plan: 11
subsystem: content
tags: [content, cli, seeder, BE-CONTENT-02]
requires: ["11-09", "11-10"]
provides:
  - "src/content/cli-args.ts: CliCommand, parseCliArgs(argv) → CliCommand | null, MAX_NEW_IDS = 500"
  - "src/content/run-content.ts: runCli(argv, env, out) → Promise<number>, CONTENT_EXIT = { ok: 0, drift: 1, usage: 2, failure: 3 }, CONTENT_USAGE"
  - "src/content/content-tree.spec.ts: gate unit del vero content/ (nessun errore di checkContent, id unici fra collezioni e snapshot)"
  - "script npm content:check, content:new-id, content:dry-run, content:verify, content:apply"
affects: [11-12, 11-13, 11-14, 11-15, 11-16, 11-17, 11-18, 11-19, 11-20, 11-21, 11-22, 11-23, 11-24]
tech-stack:
  added: []
  patterns:
    - "CLI clone di run-mixed-refs: `process.env` passato come oggetto a `runCli`, driver nativo `mongodb`, errori stampati solo con `describeError`, `client.close()` nel `finally`"
    - "modalità offline (`--check`, `--new-id`) risolte prima di leggere l'ambiente: nessuna connessione e nessun bisogno di `MONGO_URI`/`DB_NAME`"
    - "int-spec sul compilato con env del processo figlio esplicito e minimo (`PATH`, più `MONGO_URI`/`DB_NAME` di test solo dove serve)"
key-files:
  created:
    - src/content/cli-args.ts
    - src/content/cli-args.spec.ts
    - src/content/run-content.ts
    - src/content/run-content.cli.int-spec.ts
    - src/content/content-tree.spec.ts
  modified:
    - package.json
decisions:
  - "`CliCommand` separa `{ mode: 'check' }` da `{ mode: ContentMode }` (stessa forma dell'interfaccia del piano, ma il ramo DB passa a `runContent` un tipo già ristretto a `dry-run|apply|verify`)"
  - "`--content-dir` accettato al più una volta e in qualunque posizione, anche con `--new-id` (ignorato); un valore che inizia con `--` conta come valore mancante (`--export --check` → uso errato); qualunque token in più → uso errato"
  - "`--new-id` accetta solo cifre (`2.5`, `x` → uso errato), intervallo 1..500"
  - "`--export <dir>` risolve la cartella con `resolve`; `ExportDirNotEmptyError` → exit 2 con il suo messaggio (solo la cartella, mai l'URI); ogni altra eccezione → exit 3 con `describeError`"
  - "Report di `--check`: `{ mode: 'check', counts, errors, warnings }` con `counts` per le 7 collezioni di catalogo nell'ordine `CONTENT_COLLECTIONS`"
  - "Gate del vero albero: gli id controllati per unicità sono quelli delle voci di tutte le collezioni più città e POI dello snapshot"
metrics:
  duration: "~25 min"
  completed: 2026-11-02
  tasks: 2
  files: 6
---

# Phase 11 Plan 11: CLI `run-content` del seeder Summary

CLI `node dist/content/run-content.js` con una sola modalità per corsa (`--check|--dry-run|--apply|--verify|--export <dir>|--prune <collezione>|--new-id <N>`, `--content-dir <path>` facoltativo), codici d'uscita stabili `0/1/2/3`, modalità offline senza ambiente, script npm `content:*`, provato sul compilato contro il replica set di test e con un gate unit sul vero `content/`.

## Cosa è stato fatto

- **Task 1 — parser e `runCli`.** `parseCliArgs` divide i token in modalità e `--content-dir`, rifiuta argomenti sconosciuti, valori mancanti, modalità multiple, collezioni fuori da `PRUNABLE_COLLECTIONS` e conteggi fuori 1..500. `runCli` risolve `--check` (carica l'albero, `checkContent`, exit 1 solo con errori) e `--new-id` (righe `- '<hex>'`) prima di guardare l'ambiente; le altre modalità leggono `MONGO_URI`/`DB_NAME` dall'oggetto env (senza → `CONTENT_USAGE`, exit 2), si connettono col driver nativo e chiamano `runContent` / `exportContent` / `pruneCollection`. Uscite: `dry-run`/`apply` → 1 se `hasErrors`; `verify` → 1 se `hasDrift`; `prune` → 1 con errori o quest bloccate; `export` → 0, cartella non vuota → 2; eccezione → 3 con `{"error": describeError(error)}`. Script npm aggiunti dopo `test:debug` (a mano, `package.json` non passato a prettier).
- **Task 2 — prova sul compilato e gate.** `run-content.cli.int-spec.ts` lancia `dist/content/run-content.js` con `spawn` e un env esplicito (`{ PATH }` per le modalità offline, più `MONGO_URI: MONGO_TEST_URI` e `DB_NAME: content-cli-test` per quelle a DB; mai `...process.env`), semina il mondo del mini-albero con `seedWorld` prima di ogni caso e accumula ogni stdout per verificare alla fine che nessuno contenga l'URI di test. `content-tree.spec.ts` (unit) carica `DEFAULT_CONTENT_DIR`.

## TDD

| Fase | Commit | Esito atteso / osservato |
| --- | --- | --- |
| RED Task 1 | `d1c5bfa` | 1 suite fallita: `Cannot find module 'src/content/cli-args'` (errore di configurazione, 0 test) |
| GREEN Task 1 | `5a206b3` | 26/26 unit verdi in `cli-args.spec.ts`; drift `src/config` verde |
| Task 2 | `0bc0c28` | 7/7 int e 2/2 unit verdi al primo colpo |

**Verde al primo colpo (Task 2):** il codice del CLI era già completo dal Task 1, quindi l'int-spec sul compilato non poteva fallire per un modulo mancante e non ha rivelato difetti; per questo c'è un solo commit `test(content): prove the content CLI on the compiled script` invece della coppia RED/GREEN. Per dimostrare che la spec morde ho alterato a mano `dist/content/run-content.js` (messaggio dell'eccezione aggiunto al report d'errore): `never prints the connection string` è fallito con `Expected substring: not "127.0.0.1"` / `Received string: "{\"error\":\"MongoServerSelectionError connect ECONNREFUSED 127.0.0.1:1\"}"`; poi `npm run build` ha ripristinato il compilato (nessun file sorgente toccato). Anche il gate del vero albero è verde al primo colpo: `content/` oggi contiene solo `config.yaml`, `images.yaml` e i fix, senza voci.

## Verifiche

- `npx jest src/content/cli-args.spec.ts src/config --selectProjects unit` → `Test Suites: 15 passed`, `Tests: 249 passed, 249 total`
- `npm run build` → exit 0; `node dist/content/run-content.js --new-id 2 | grep -cE "^- '[0-9a-f]{24}'$"` → `2`
- `npx jest src/content/run-content.cli.int-spec.ts --selectProjects integration --runInBand` → `Tests: 7 passed, 7 total` (check offline, check di un albero rotto → 1, `--new-id 3`, uso errato → 2/2/2, dry-run/apply/verify/secondo apply → 0 con `inserted`/`modified` tutti a 0, export rifiutato → 2 e riuscito → 0 con `world/cities.yaml`, URI irraggiungibile → 3 senza `mongodb://` né `127.0.0.1`)
- `npx jest src/content/content-tree.spec.ts --selectProjects unit` → `Tests: 2 passed, 2 total`
- `npx jest src/content --selectProjects unit` → `Test Suites: 33 passed`, `Tests: 357 passed, 357 total`
- `node dist/content/run-content.js --check` sul vero `content/` → exit 0, `{"mode":"check","counts":{"lore":0,"spells":0,"equipmentitems":0,"lootitems":0,"enemies":0,"pets":0,"quests":0},"errors":[],"warnings":[]}`
- A mano (offline, nessuna connessione): `--help` → `CONTENT_USAGE`, exit 2; nessun argomento → exit 2; `--verify` senza `--env-file` → `CONTENT_USAGE`, ultima riga `2`
- Acceptance: nessun `process.env.` in `run-content.ts`/`cli-args.ts`; `"content:check"` e `"content:apply"` 1 riga ciascuno in `package.json`; `describeError(` presente in `run-content.ts`; `never prints the connection string` 1 riga nella int-spec
- `npx tsc --noEmit -p tsconfig.json` → exit 0; `npx eslint` e `npx prettier --check` puliti sui 5 file `.ts`; `git diff --exit-code src/schema.gql` → exit 0; `pgrep -fl jest` vuoto

Nessuna modalità che si connette è stata eseguita a mano contro il `.env` reale.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Tipi] `CliCommand` con `check` in una variante propria**
- **Trovato durante:** Task 1 (tsc: `'"check"' is not assignable to type 'FixMode'` passando il comando a `runContent`)
- **Fix:** `{ mode: 'check'; contentDir }` e `{ mode: ContentMode; contentDir }` al posto della variante unica `'check' | 'dry-run' | 'apply' | 'verify'`; stessa forma dei valori, il parser non cambia.
- **File:** `src/content/cli-args.ts` — **Commit:** `5a206b3`

**2. [Rule 2 - Robustezza] Parser più stretto del piano**
- **Fix:** oltre ai casi del piano, la spec copre `--prune` senza valore, `--new-id 2.5`, `--new-id` senza valore, `--check --check`, `--export --check`, `--content-dir` senza valore o ripetuto, token posizionale in più (tutti → uso errato) e i limiti 1 e 500 di `--new-id`.
- **Commit:** `d1c5bfa`, `5a206b3`

Il Task 2 è un solo commit `test(content)` (vedi §TDD) invece della coppia RED/GREEN del piano.

## Note per i piani successivi

- Ogni piano di stesura: `npm run build` (se il codice è cambiato), poi `node dist/content/run-content.js --check` (exit 0) e `npx jest src/content/content-tree.spec.ts --selectProjects unit`.
- Id nuovi: `node dist/content/run-content.js --new-id <N>` (1..500) stampa righe `- '<hex>'` pronte da incollare.
- 11-12 (export reale): `node --env-file=.env dist/content/run-content.js --export <cartella vuota>`; il report su stdout è una sola riga JSON (exit 2 se la cartella non è vuota).
- 11-24: `--apply`, `--verify`, `--prune <collezione>` dagli script `content:*` o dal compilato con `--env-file=.env`; `--verify` esce 1 se `hasDrift`.

## Known Stubs

Nessuno.

## Threat Flags

Nessuna superficie nuova oltre al registro del piano (T-11-42..T-11-45 mitigati: `describeError` e test sul compilato contro la stampa dell'URI, env passato come oggetto e non letto da `--check`/`--new-id`, una sola modalità con argomenti sconosciuti → exit 2, `--prune` solo con una collezione dell'elenco chiuso).

## Self-Check: PASSED
