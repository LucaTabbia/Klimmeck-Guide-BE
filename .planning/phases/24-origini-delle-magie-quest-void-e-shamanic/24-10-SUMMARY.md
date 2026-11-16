---
phase: 24-origini-delle-magie-quest-void-e-shamanic
plan: 10
subsystem: migrations
tags: [one-off-migration, spell-origin, min-level, quest-type-rename]
requires: ["24-09"]
provides:
  - "src/migrations/spell-origins/: contratto dei passi, boot nella factory di un provider, SpellFieldsStep, QuestTypeStep, QuestResultTypeStep, SpellOriginsMigrationModule"
  - "AppModule monta il modulo una tantum accanto a QuestMaintenanceModule"
affects: [24-11, 24-12]
tech-stack:
  added: []
  patterns: ["migratore una tantum ricalcato su src/migrations/model-review della Phase 19 (git show 0822feee^)"]
key-files:
  created:
    - src/migrations/spell-origins/spell-origins.step.ts
    - src/migrations/spell-origins/spell-origins.boot.ts
    - src/migrations/spell-origins/spell-origins.boot.spec.ts
    - src/migrations/spell-origins/spell-fields.step.ts
    - src/migrations/spell-origins/spell-fields.step.spec.ts
    - src/migrations/spell-origins/spell-fields.step.int-spec.ts
    - src/migrations/spell-origins/quest-type.step.ts
    - src/migrations/spell-origins/quest-type.step.int-spec.ts
    - src/migrations/spell-origins/spell-origins.module.ts
  modified:
    - src/app.module.ts
    - test/app.int-spec.ts
decisions:
  - "Scritture delle magie una per documento, filtrate sui valori letti con asRead; una scrittura non applicata conta fra «senza corrispondenza» e logga il solo id della magia"
  - "Rinomina del tipo con una updateMany per collection filtrata sul valore vecchio; found = documenti con `magic` o `arcane` prima della scrittura"
  - "Copie persistite del tipo: solo quests.infos.type e questresults.quest.type (ricerca rifatta, nessuna copia in più)"
metrics:
  completed: 2026-11-15
  tasks: 5
  commits: 9
---

# Phase 24 Plan 10: migratore una tantum delle origini delle magie — Summary

Al boot dell'app vera, dentro la factory di un provider (quindi prima di ogni `onModuleInit`/`onApplicationBootstrap`, processor Bull, sweep, HTTP e WS), tre passi idempotenti: `magie` scrive `minLevelToLearn` (da `minXpToLearn` con `levelRowFor`) e `origin: 'arcane'` solo dove mancano (assenti o nulli), mai `$unset`, `minXpToLearn` resta a DB; `tipo delle quest` e `tipo nei risultati` riscrivono `magic` → `arcane` in `quests.infos.type` e in `questresults.quest.type`. Un passo fallito ferma il boot con un errore nuovo senza causa; i log portano solo conteggi e, per una scrittura non applicata, l'id della magia. Nessun contenuto, nessun `process.env`, SDL invariato. Il modulo è importato solo da `AppModule`.

## Commit

| Task | Commit | Subject |
|------|--------|---------|
| 1 RED | 049e5a2f | test(migrations): pin the spell origins steps and their boot |
| 1 GREEN | e1e55c32 | feat(migrations): add the spell origins steps contract and boot |
| 2 RED | eae67783 | test(migrations): expect the spell fields step to fill level and origin |
| 2 GREEN | fe412861 | feat(migrations): fill the level and the origin of the spells |
| 3 RED | 35532743 | test(migrations): expect the magic quest type renamed to arcane |
| 3 GREEN | 87ec18de | feat(migrations): rename the magic quest type to arcane |
| 4 RED | 4dcb76b0 | test(migrations): expect the spell origins migration mounted at boot |
| 4 GREEN | d8343d48 | feat(migrations): mount the one-off spell origins migration |
| 5 | (questo) | docs(phase-24): record plan 10 progress |

## Fallimenti RED attesi e osservati

- **Task 1** (unit): `Cannot find module './spell-fields.step'` e `'./spell-origins.boot'` (2 suite rosse, 0 test eseguiti).
- **Task 2** (integration, 8/8 rossi): `TypeError: SpellFieldsStep is not a constructor` (la classe non era ancora esportata, il file conteneva la sola regola pura).
- **Task 3** (integration): `Cannot find module './quest-type.step'`.
- **Task 4** (integration, 2 rossi su 107): il modulo non è fra quelli montati e nessuna riga col prefisso `Origini delle magie, ` è stata loggata.

## Copie persistite del tipo di quest

Ricerca rifatta (`grep -rnE "infos\.type|quest\.type|questType"` più gli schemi di `src/models/` e `src/quests/guided/`): `quests.infos.type` e `questresults.quest.type` (fotografia scritta da `outcome-plan.ts`, `boss-resolution`, `rescue-resolution`, `quest-resolution`, `gm-completion`). Non sono copie: `MissionDraft.questType` (`story`/`worldMission`), le richieste pendenti (leggono il tipo dalla quest), `AwaitingAid`, `AmbushReportSnapshot`. Nessun terzo passo.

## Casi verdi al primo colpo

Nessuno fra quelli nuovi (ogni suite era rossa per modulo o simbolo assente). Il caso esistente «does not mount the one-off model review migration (D-12)» resta com'è e verde.

## Deviations from Plan

- **Riga di scrittura non applicata** riformulata senza genere («magia `<id>`, scrittura non applicata perché il documento è cambiato durante il passo»): il testo dell'attesa nell'int-spec è stato corretto nel commit GREEN del Task 2.
- **Guardia della corsa provata con una scrittura concorrente vera**, senza timer: `jest.spyOn(collection, 'updateOne').mockImplementationOnce` scrive `origin: 'void'` sulla magia fra la lettura e la scrittura del passo, poi delega alla scrittura del passo → `modifiedCount` 0, documento con l'origine concorrente, riga WARN col solo id.
- **Casi in più:** riga dei conteggi formattata, contenitore Nest vero che fallisce senza raggiungere i lifecycle hook (dal modello della Phase 19), etichette dei due passi del tipo, `it.each` sui cinque tipi che controlla anche i risultati.
- La fixture della magia toglie le chiavi con override indefinito (il driver scriverebbe `null`).
- `found` dei passi del tipo conta `magic` + `arcane` prima della scrittura, `alreadyDone` = `found − migrated`.

## Verifiche

- `npx jest src/migrations/spell-origins --selectProjects unit`: 2 suite, 24/24.
- `npx jest src/migrations/spell-origins test/app.int-spec.ts --selectProjects integration --runInBand`: 3 suite, 126/126 (spell-fields 8, quest-type 11, app 107).
- In più, perché bootano l'`AppModule` vero col migratore montato: `test/harness/real-app-boot-close.int-spec.ts` e `test/authz/authorization-matrix.int-spec.ts`, 2 suite, 132/132.
- `npx tsc --noEmit -p tsconfig.json` 0; prettier pulito ed eslint senza errori sui file toccati (warning preesistente `no-base-to-string` in `test/app.int-spec.ts`); `git diff --exit-code src/schema.gql` pulito.
- Accettazione: `spellMigrationOf` 1, `levelRowFor(` 1, `spellOriginsBootProvider` 1, `SpellFieldsStep` 1, `asRead(` 2, `QuestTypeStep` 1, `QuestResultTypeStep` 1, `QuestType.arcane` 2; `D-07)` 9 nell'int-spec delle magie, `D-20)` 8 in quella del tipo; `SpellOriginsMigrationModule` 2 in `app.module.ts` e in 3 file in tutto; nessun `$unset` né `process.env` nella cartella; ogni file non di spec apre con `// UNA TANTUM (Phase 24`; nessun file di contenuto; `pgrep -fl 'bin/jest'` vuoto.

## Per l'orchestratore

**Righe di log attese al boot reale** (contesto Nest `SpellOriginsBoot`, livello LOG, nell'ordine, prima di ogni hook):

```
Origini delle magie, magie: trovati N, migrati N, già a posto N, senza corrispondenza N
Origini delle magie, tipo delle quest: trovati N, migrati N, già a posto N, senza corrispondenza 0
Origini delle magie, tipo nei risultati: trovati N, migrati N, già a posto N, senza corrispondenza 0
```

Eventuali WARN (contesto `SpellFieldsStep`): `Origini delle magie, magie: magia <id>, scrittura non applicata perché il documento è cambiato durante il passo` (solo a client non fermi). Al fallimento, ERROR `Origini delle magie, <passo>: fallito (<NomeErrore>[, code <codice>]), il boot si ferma` e `Origini delle magie, boot interrotto: passi conclusi K su 3, fallito «<passo>», non eseguiti M`, poi l'errore `Origini delle magie: boot interrotto dal passo «<passo>»`. Mai URI, host, nome del database o token.

Attese sul catalogo di oggi: «magie» con `migrati` = magie senza livello né origine; «senza corrispondenza» > 0 solo per magie senza `minXpToLearn` numerico (da guardare a mano). Seconda corsa: `migrati 0` su tutte e tre le righe.

**Dopo il boot reale (a carico dell'orchestratore):**
1. Rimozione del migratore in TDD come `c3492ced` / `0822feee`: RED in `test/app.int-spec.ts` («does not mount the one-off spell origins migration (D-07, D-20)» al posto di «mounts…», via le costanti `SPELL_ORIGINS_PREFIX`/`SPELL_ORIGINS_STEP_LINES`, la spia `logSpy` e il caso delle tre righe), poi GREEN che toglie da `src/app.module.ts` import e voce (con il commento) e cancella l'intera cartella `src/migrations/spell-origins/` (nove file: `spell-origins.step.ts`, `spell-origins.boot.ts`, `spell-origins.boot.spec.ts`, `spell-fields.step.ts`, `spell-fields.step.spec.ts`, `spell-fields.step.int-spec.ts`, `quest-type.step.ts`, `quest-type.step.int-spec.ts`, `spell-origins.module.ts`).
2. `$unset` di `minXpToLearn` sulle magie a DB dopo la merge (il migratore non lo tocca mai).
3. Le origini vere, le magie nuove, le lore delle origini e le tre quest nuove arrivano dopo, dallo script di contenuto.

## Threat model

T-24-29 (filtro sui valori letti, provato con una scrittura concorrente; rinomina filtrata sul valore vecchio), T-24-30 (mai `$unset`, `toEqual` sul documento intero e sulla seconda corsa), T-24-31 (errore nuovo senza causa, testo dell'errore originale assente da log e stack, provato in unit), T-24-32 (modulo solo in `AppModule`, nessuna spec unitaria importa `AppModule`), T-24-33 (marcatori «UNA TANTUM» e rimozione dichiarata qui per il handoff) come da piano.

## Self-Check: PASSED
