---
phase: 11-popolamento-del-mondo
plan: 07
subsystem: content
tags: [content, fixes, migration, idempotency, replica-set, BE-CONTENT-02]
requires: ["11-04"]
provides:
  - "src/content/fixes/fix-report.ts: FixMode, FixStatus, QuestLane, BlockedQuest, FixReport, changeStatus(touched, mode)"
  - "src/content/fixes/fix-runner.ts: runFixes(db, fixes, mode) — valida ogni voce con fixEntryIssues e smista per kind"
  - "src/content/fixes/poi-and-city-fixes.ts: normalizedPoiTypes, unknownPoiTypes, normalizePoiTypes, renameCity, unsetLoreUnlocked (+ sameBson locale)"
  - "src/content/fixes/delete-quests.fix.ts: deleteQuests(db, fix, mode) con le guardie di Pitfall 2"
  - "content/fixes/{poi-types,kliever,lore-unlocked}.yaml"
affects: [11-09, 11-11, 11-12, 11-24]
tech-stack:
  added: []
  patterns:
    - "fix = funzione `(db, fix, mode) => Promise<FixReport>`, tabella `FIX_HANDLERS: Record<FixKind, …>` chiusa sui 4 kind"
    - "scritture solo in `apply`; `dry-run` e `verify` contano soltanto (stato `pending`)"
    - "ref legacy: ogni filtro sui ref usa entrambe le forme (`idForms` di `src/mongo/document-id.ts`)"
key-files:
  created:
    - src/content/fixes/fix-report.ts
    - src/content/fixes/fix-runner.ts
    - src/content/fixes/poi-and-city-fixes.ts
    - src/content/fixes/delete-quests.fix.ts
    - src/content/fixes/fix-runner.spec.ts
    - src/content/fixes/fixes.int-spec.ts
    - src/content/fixes/delete-quests.fix.int-spec.ts
    - content/fixes/poi-types.yaml
    - content/fixes/kliever.yaml
    - content/fixes/lore-unlocked.yaml
  modified: []
decisions:
  - "`runFixes` rivalida ogni voce con `fixEntryIssues` e lancia `Correzione non valida: <key>: <messaggi>` prima di qualsiasi lettura o scrittura (T-11-25, difesa in profondità oltre a `--check`)"
  - "`normalizePoiTypes`: tipo scalare legacy → lista di un elemento; un risultato fuori `PoiType` blocca il fix con `unknownTypes` e nessuna scrittura (T-11-26); POI assente → `blocked`"
  - "`renameCity`: nome già uguale a `to` → `done`; uguale a `from` → scrive (filtro anche su `name: from`); altro nome → `blocked` con `foundName`; città assente → `blocked` senza `foundName`"
  - "`deleteQuests`: piano per id (pending che la citano, corsie occupate, `awaitingAid`, quest presente, back-link POI); un id bloccato non scrive nulla ma gli altri id liberi della stessa voce vengono applicati; stato complessivo `blocked` se almeno un id è bloccato"
  - "`deleteQuests` scrive nell'ordine back-link POI → pending → quest: una corsa interrotta ritrova la quest e completa il lavoro"
  - "Un id è «da fare» se esiste la quest O restano pending libere O back-link POI: una quest già cancellata a mano ma con back-link residui viene comunque ripulita"
  - "`deleted` elenca le quest cancellate (`apply`) o che verrebbero cancellate (`dry-run`/`verify`, stato `pending`); `touched` = quest + pending + POI"
  - "`sameBson` resta locale in `poi-and-city-fixes.ts`: il piano 11-09 lo sposterà in `src/content/sync/bson-diff.ts`"
metrics:
  duration: "~10 min"
  completed: 2026-11-02
  tasks: 2
  files: 10
---

# Phase 11 Plan 07: correzioni dichiarate Summary

Motore idempotente delle correzioni di `content/fixes/` col driver nativo `mongodb`: 4 `kind` chiusi (`normalizePoiTypes`, `renameCity`, `deleteQuests`, `unsetLoreUnlocked`), stato per fix `pending`/`applied`/`done`/`blocked`, scritture solo in `apply`, guardie delle corsie occupate e di `awaitingAid` per la cancellazione delle quest di prova; tre file di fix reali (6 POI, Kliever, `unlocked`) validi per lo schema di 11-04.

## Commit

| Task | Fase TDD | Commit | Subject |
|------|----------|--------|---------|
| 1 | RED | `1cc7895` | `test(content): expect the declared data fixes` |
| 1 | GREEN | `d33bedb` | `feat(content): apply the declared point of interest, city and lore fixes` |
| 2 | RED | `6e15262` | `test(content): expect test quests deleted only from free lanes` |
| 2 | GREEN | `d613ff3` | `feat(content): delete test quests guarded by occupied lanes` |

Fallimenti attesi del RED:
- Task 1: `Cannot find module './fix-runner'` (suite unit e int-spec non caricabili).
- Task 2: 14/14 test rossi: lo stub di `deleteQuests` del Task 1 restituiva sempre `status: 'blocked'`, `touched: 0`, senza `deleted`/`blocked`/conteggi.

## Verifiche

- `npx jest src/content/fixes --selectProjects unit` → `Tests: 5 passed, 5 total`
- `npx jest src/content/fixes --selectProjects integration --runInBand` → `Tests: 24 passed, 24 total` (10 di `fixes.int-spec.ts` su db `content-fixes-test`, 14 di `delete-quests.fix.int-spec.ts` su db `content-delete-quests-test`; solo `MongoMemoryReplSet`, nessun database reale)
- `npx jest src/content --selectProjects unit` → `Test Suites: 21 passed`, `Tests: 229 passed` (224 + 5)
- `npx jest src/content src/config --selectProjects unit` → 35 suite, 452 test verdi (drift `process.env.` incluso)
- `npx tsc --noEmit -p tsconfig.json` → exit 0; `pgrep -fl jest` vuoto
- `grep -c "kind: normalizePoiTypes" content/fixes/poi-types.yaml` → `6`; i 6 id presenti; `grep -n "to: Kliever" content/fixes/kliever.yaml` → 1 riga
- `grep -c "activeStoryQuest\|activeWorldMissionQuest\|awaitingAid" src/content/fixes/delete-quests.fix.ts` → `7`; `grep -c "Pitfall 2" …int-spec.ts` → `3`; righe `questresults` con delete/update → `0`
- SDL: `git diff --exit-code src/schema.gql` → 0; contro `origin/develop` una riga `-`, zero `+`

## Test (titoli)

Unit (`fix-runner.spec.ts`): normalizza e deduplica (D-06), mantiene un tipo non citato, segnala un tipo fuori enum, rifiuta una voce non valida (T-11-25), accetta i file di fix del repository (ordine kliever → lore-unlocked → 6 poi-types, alias YAML `*poiTypeRepairs` risolto in ogni voce).

Integrazione `fixes.int-spec.ts`: dry-run `pending` senza scritture (D-06); apply e seconda corsa `done`; tipo scalare legacy avvolto in lista; risultato fuori enum `blocked` (T-11-26); POI assente `blocked`; Flinas → Kliever una volta (D-06); rename `blocked` con `foundName`; città assente `blocked`; `unlocked` rimosso da 2 lore su 3 e poi `done`; `verify` non scrive mai.

Integrazione `delete-quests.fix.int-spec.ts`: quest libera cancellata con pending e back-link (D-05); `it.each` sulle tre corsie (Pitfall 2); `it.each` su `awaitingAid.quest`/`aidQuest` (Pitfall 2); ref legacy stringa riconosciuti (Pitfall 2); lista con un id bloccato e uno libero; `questresults` intatti e contati; aid fuori lista riportate; aid in lista non riportata; seconda corsa `done`; `dry-run`/`verify` `pending` senza scritture.

Casi in più rispetto al piano (stesso perimetro): scalare legacy, enum (T-11-26), città assente, ref legacy, lista mista, aid in lista, voce non valida (T-11-25).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Correttezza] Campo `unknownTypes` nel `FixReport`**
- **Trovato durante:** Task 1
- **Problema:** l'interfaccia del piano non aveva dove riportare i tipi fuori enum che bloccano `normalizePoiTypes` (mitigazione T-11-26)
- **Fix:** campo facoltativo `unknownTypes?: string[]`; `QuestLane` estratto come tipo con nome; `changeStatus(touched, mode)` condiviso da tutti i fix
- **File:** `src/content/fixes/fix-report.ts` — **Commit:** `d33bedb`

**2. [Rule 2 - Sicurezza] Rivalidazione delle voci in `runFixes`**
- **Trovato durante:** Task 1
- **Problema:** T-11-25 chiede kind chiuso e target validato; il runner riceve `LoadedEntry` grezze
- **Fix:** `fixEntryIssues` su ogni voce prima di qualunque accesso al db; voce invalida → `Error('Correzione non valida: …')`
- **File:** `src/content/fixes/fix-runner.ts` — **Commit:** `d33bedb`

**3. [Rule 3 - Tooling] Prettier non idempotente su una catena `.collection(...).insertOne({...})`**
- **Trovato durante:** Task 2 (RED)
- **Problema:** dopo il primo `prettier --write` `eslint` segnalava ancora `prettier/prettier`
- **Fix:** secondo `npx prettier --write` sullo stesso file, poi `prettier --check` ed `eslint` puliti prima del commit

Nient'altro: i tre file di fix seguono il testo del piano alla lettera.

## Known Stubs

Nessuno. Lo stub temporaneo di `deleteQuests` (sempre `blocked`, nessuna scrittura) esisteva solo fra `d33bedb` e `d613ff3` ed è stato sostituito dal motore vero.

## Threat Flags

Nessuna superficie nuova oltre al registro del piano: i fix girano solo via `runFixes(db, …)`, nessun endpoint, nessuna variabile d'ambiente, nessun `process.env.` in `src/content/fixes/*.ts` di produzione.

## Note per i piani successivi

- Il CLI (11-11) chiama `runFixes(db, tree.fixes, mode)` dopo `checkContent` senza errori; `--verify` deve uscire 1 se un report ha `status` `pending` o `blocked`.
- `content/fixes/delete-test-quests.yaml` (piano 11-12) ha la forma `{ key, kind: deleteQuests, ids: ['…'] }`; il loader legge i file in ordine alfabetico, quindi verrà dopo `kliever.yaml` e prima di `lore-unlocked.yaml`: lo spec `accepts the repository fix files` controlla l'elenco ordinato dei kind e va aggiornato in 11-12.
- `sameBson` è locale e non esportato in `poi-and-city-fixes.ts`: 11-09 lo sposta in `src/content/sync/bson-diff.ts` e lo importa da lì.

## Self-Check: PASSED

- File creati presenti: `src/content/fixes/{fix-report,fix-runner,poi-and-city-fixes,delete-quests.fix}.ts`, le tre spec, `content/fixes/{poi-types,kliever,lore-unlocked}.yaml`
- Commit presenti: `1cc7895`, `d33bedb`, `6e15262`, `d613ff3`
