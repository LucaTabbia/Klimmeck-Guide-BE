---
phase: 24-origini-delle-magie-quest-void-e-shamanic
plan: 11
subsystem: gate
tags: [gate, sdl, coverage, invariants]
requires: ["24-10"]
provides:
  - "fase verde e misurata: tsc 0, unit 310 / 4 419, integration 163 / 2 558, boot reale 107, SDL rigenerato uguale al committato"
  - "diff SDL dalla base a208ad3d: 1 riga tolta, 6 aggiunte (per il handoff del piano 12)"
affects: [24-12]
tech-stack:
  added: []
  patterns: []
key-files:
  created: []
  modified: []
decisions:
  - "Nessun difetto trovato: nessun commit di correzione nel gate"
  - "Due grep del piano annotati come falsi negativi/positivi (tabella con annotazione di tipo; sottostringa SpellOrigin in SpellOriginsMigrationModule) e un URI finto di prova accettato (T-24-31)"
metrics:
  completed: 2026-11-15
  tasks: 2
  commits: 1
---

# Phase 24 Plan 11: gate della fase — Summary

Gate verde al primo colpo: type check, suite unit completa, integration completa a cinque blocchi `--runInBand` senza coverage, boot reale con SDL rigenerato identico al committato, coverage per cartella sopra le tre soglie, lint mirato pulito su 72 file, invarianti e copertura delle decisioni rispettati. Nessun difetto, nessuna correzione: l'unico commit del piano è il bookkeeping.

## 1. Base e type check

- `PHASE_BASE=a208ad3d` («docs(phase-24): add the spell origins phase to the roadmap»); `git merge-base --is-ancestor a208ad3d HEAD` esce 0. HEAD del codice: `d78569cb` (61 commit dalla base).
- `npx tsc --noEmit -p tsconfig.json`: 0 (≈ 3 s).

## 2. Unit completo

`npx jest --selectProjects unit`: **310 suite / 4 419 test** verdi, 12,5 s. Baseline del handoff 23: 304 / 4 206 (+6 suite, +213 test della fase e del ramo base).

## 3. Integration completa (senza coverage, `--runInBand`, foreground)

| Blocco | Comando (percorsi prima di `--selectProjects integration --runInBand`) | Suite | Test | Tempo |
|--------|------------------------------------------------------------------------|-------|------|-------|
| 1 | `src/quests/outcomes` | 16 | 245 | 66 s |
| 2 | resto di `src/quests` (elenco da `--listTests` meno `src/quests/outcomes`) | 30 | 572 | 172 s |
| 3 | `src/characters` | 30 | 476 | 95 s |
| 4 | `src/travel` | 13 | 277 | 76 s |
| 5 | resto (elenco da `--listTests` meno `src/quests`, `src/characters`, `src/travel`: `test/app.int-spec.ts`, `test/quests`, `test/auth`, `test/authz`, `test/harness`, `src/shops`, `src/economy`, `src/mongo`, `src/auth`, `src/cities`, `src/spells`, `src/lore`, `src/migrations`, …) | 74 | 988 | 171 s |
| **Totale** | | **163** | **2 558** | |

`npx jest --selectProjects integration --listTests | grep -c int-spec` = 163 = somma dei blocchi (la prima riga dell'elenco è il banner «Running one project», non una spec). Nessuna spec appesa; `pgrep -fl 'bin/jest'` vuoto dopo ogni blocco.

## 4. Boot reale e SDL

- `npx jest test/app.int-spec.ts --selectProjects integration --runInBand`: 1 suite / 107 test verdi (≈ 7 s); subito dopo `git diff --exit-code src/schema.gql` esce 0.
- `git diff a208ad3d -- src/schema.gql`, righe tolte (una sola, in `type Spell`, non additiva dichiarata):
  - `-  minXpToLearn: Int!`
- Righe aggiunte (sei):
  - `+  aarakocraCapital` (`enum CityType`)
  - `+  dragonbornCapital` (`enum CityType`)
  - `+  dragonbornVillage` (`enum CityType`)
  - `+  minLevelToLearn: Int!` (`type Spell`)
  - `+  origin: String!` (`type Spell`)
  - `+  relatedLore: [Lore!]!` (`type Spell`)
- Tabella dei controlli: blocco `type Spell` 13 righe; `minLevelToLearn: Int!` 1, `origin: String!` 1, `relatedLore: [Lore!]!` 1; `minXpToLearn` nello schema 0; i tre valori nuovi di `CityType` 1 ciascuno; blocco `enum CityType` 38 righe; `enum SpellOrigin` 0; `enum QuestType` 0 (uguale alla base, 0); righe tolte 1, aggiunte 6. Tutti come attesi.
- Matrice di autorizzazione: `npx jest test/app.int-spec.ts test/authz/authorization-matrix.int-spec.ts --selectProjects integration --runInBand` 2 suite / 238 test verdi (verify del piano rieseguito per intero a fine gate: `VERIFY-OK`).

## 5. Coverage per cartella (statements / branches / lines)

Comando per cartella: `npx jest <cartella> --coverage --coverageThreshold='{}' --collectCoverageFrom='<cartella>/**/*.ts' --collectCoverageFrom='!src/**/*.spec.ts' --collectCoverageFrom='!src/**/*.int-spec.ts' --coverageReporters=json-summary --coverageReporters=text-summary --selectProjects unit integration --runInBand`, poi `node -e` su `coverage/coverage-summary.json` contro le soglie lette da `package.json` (uguali a quelle del piano).

| Cartella | Soglia | Misurato | Suite / test | Esito |
|----------|--------|----------|--------------|-------|
| `src/quests/acceptance` | 97 / 91 / 98 | 99,11 / 92,83 / 99,75 | 6 / 440 | OK |
| `src/quests/generation` | 96 / 82 / 97 | 98,95 / 88,59 / 99,70 | 18 / 212 | OK |
| `src/shops` | 97 / 82 / 98 | 100 / 83,87 / 100 | 9 / 92 | OK |
| `src/quests/outcomes` | — | 97,28 / 88,33 / 98,91 | 58 / 1 160 | — |
| `src/quests/guided` | — | 98,56 / 81,68 / 99,40 | 15 / 183 | — |
| `src/cities` | — | 98,21 / 75,00 / 98,00 | 2 / 53 | — |
| `src/spells` | — | 92,06 / 73,07 / 92,30 | 2 / 30 | — |
| `src/lore` | — | 93,82 / 80,48 / 94,36 | 8 / 87 | — |
| `src/characters/creation` | — | 100 / 85,85 / 100 | 11 / 178 | — |
| `src/migrations/spell-origins` | — | 88,52 / 100 / 88,99 | 4 / 43 | — |

Le cartelle senza soglia sono misurate con le sole spec della cartella (per `src/spells` e `src/lore` molte righe sono esercitate da spec di altre cartelle). `git diff a208ad3d --stat -- package.json | wc -l` = 0. **`npm run test:cov` completo resta all'orchestratore** (in background, ≈ 630 s).

## 6. Lint mirato

`for f in $(git diff --name-only --diff-filter=AM a208ad3d -- '*.ts'); do npx prettier --check "$f" && npx eslint "$f" || echo "FAIL $f"; done`: 72 file, nessun `FAIL`.

## 7. Invarianti

| Invariante | Esito |
|------------|-------|
| campo vecchio fuori dalle due prove negative e dal migratore | 0 |
| `QuestType.magic` in `src`/`test` | nessuna riga |
| file con `'magic'` | esattamente i cinque attesi (`quest-type.step.ts` e la sua int-spec, `spell-schools.spec.ts`, `spell-origin.enum.spec.ts`, `spell-fields.int-spec.ts`) |
| una sola tabella tipo → origine | il grep `SPELL_ORIGIN_BY_QUEST_TYPE = ` non trova nulla perché la dichiarazione ha un'annotazione di tipo (`SPELL_ORIGIN_BY_QUEST_TYPE: Readonly<…> =`, riga 5 di `src/quests/spell-schools.ts`); col nome soltanto: un solo file fuori dalle spec, `src/quests/spell-schools.ts`. Utenti: `spell-schools.ts` e `resolution-loader.service.ts` |
| D-04, combattimento e slot | `git diff --stat` su `src/quests/outcomes/combat` e `src/characters/spells` 0 righe; `SpellOrigin` fuori dai file ammessi: solo `src/app.module.ts:119` `SpellOriginsMigrationModule` (sottostringa del nome del modulo, falso positivo) |
| enum solo TypeScript, `SpellInput` | 0 / 0 |
| livello dalla tabella unica | `levelRowFor(` in `level-table.ts`, `status-facts.ts`, `mission-prize-options.service.ts`, `migrations/spell-origins/spell-fields.step.ts`; `status.level` nel servizio delle opzioni 0 |
| un solo sblocco delle lore | `knowledgeUpdateOf(` 1, `spellLore` 2 in `outcome-plan.ts` |
| nessun tiro nuovo | `chance.next(` aggiunti 0 |
| pavimento | `CITY_RANK_FLOORS` dichiarato solo in `generation-rules.ts` |
| taglia e fascia (D-16, D-22) | `citySizeOf(` solo nei quattro file ammessi; `aarakocraCapital: CitySize.capital` 1 |
| autorizzazioni | `expected-handlers.ts` senza diff; matrice verde |
| migratore | `SpellOriginsMigrationModule` in 3 file; `$unset` 0; file non di spec senza `UNA TANTUM` 0 |
| nessun contenuto | estensioni di contenuto 0; file aggiunti con `seed`/`content` 0 |
| ambiente | `.env.example`/`src/config` senza diff; `process.env.` aggiunti 0 |
| determinismo | `Math.random`/`Date.now` 0; `jest.mock(` 0; `setTimeout(` 0 |
| trailer e subject | trailer 0; subject oltre 72 caratteri 0 |
| segreti | `.env` nel diff 0. Grep degli URI: 1 file, `src/migrations/spell-origins/spell-origins.boot.spec.ts:121`, `new Error('mongodb://uri-segreta-da-non-loggare')`: URI finto della prova T-24-31 (il testo dell'errore originale non arriva mai a log e stack). Non è un segreto, la cartella esce dal repo con il migratore; accettato e annotato, nessuna correzione (stesso caso di `run-mixed-refs.cli.int-spec.ts` della fase precedente) |
| operatori Mongo nei SUMMARY | quattro righe di `24-10-SUMMARY.md` (40, 85, 103, 108), tutte con l'operatore dentro un code span; titoli dei test nuovi con `$` 0 |
| nessuna build | `dist/` nel diff 0 |
| albero e jest | `git status --short` vuoto; `pgrep -fl 'bin/jest'` vuoto |

## 8. Copertura delle decisioni

Conteggio di `D-NN[,)]` sulle righe aggiunte delle spec dalla base:

| Decisione | Conteggio | Spec d'esempio |
|-----------|-----------|----------------|
| D-01 | 18 | `src/spells/spell-catalogue.reporter.spec.ts`, `src/spells/spell-fields.int-spec.ts` |
| D-07 | 51 | `src/migrations/spell-origins/spell-fields.step.int-spec.ts`, `src/spells/spell-catalogue.reporter.spec.ts` |
| D-08 | 12 | `src/quests/guided/mission-prizes.spec.ts`, `src/quests/outcomes/outcome-plan.spec.ts` |
| D-09 | 9 | `src/quests/acceptance/quest-acceptance.service.int-spec.ts`, `src/quests/spell-schools.spec.ts` |
| D-10 | 12 | `src/quests/outcomes/study-spell-draw.int-spec.ts`, `src/quests/outcomes/resolution-loader.service.spec.ts` |
| D-11 | 3 | `src/quests/acceptance/quest-acceptance.service.int-spec.ts`, `quest-eligibility.spec.ts` |
| D-12 | 13 | `src/quests/generation/quest-generator.int-spec.ts`, `generation-rules.spec.ts` |
| D-15 | 5 | `src/cities/city-size.spec.ts`, `cities.resolver.int-spec.ts` |
| D-16 | 3 | `src/cities/city-size.spec.ts`, `cities.resolver.int-spec.ts` |
| D-18 | 3 | `src/characters/creation/starting-location.service.int-spec.ts`, `starting-cities.reporter.spec.ts` |
| D-20 | 15 | `src/migrations/spell-origins/quest-type.step.int-spec.ts`, `src/quests/spell-schools.spec.ts`, `test/app.int-spec.ts` |
| D-22 | 5 | `src/shops/shop-pool.rules.spec.ts`, `shop-pool.report.spec.ts` |
| D-24 | 21 | `src/lore/lore-related.int-spec.ts`, `src/quests/outcomes/outcome-plan.spec.ts` |

D-04 provata per assenza (invariante sopra). D-02, D-03, D-23 contenuto a DB; D-05, D-06, D-13, D-14, D-17, D-19, D-21 solo FE. Dopo la rimozione del migratore D-07 e D-20 restano coperte fuori dalla sua cartella (D-20: `spell-schools.spec.ts` 2, `study-spell-draw.int-spec.ts` 1, più i pin di `test/app.int-spec.ts`).

Requisiti → spec che li prova (dai SUMMARY 24-01..24-10):

| Requisito | Spec |
|-----------|------|
| BE-ORIGIN-01 | `src/cities/city-size.spec.ts`, `src/cities/cities.resolver.int-spec.ts`, `src/shops/shop-pool.rules.spec.ts`, `shop-pool.report.spec.ts`, `test/app.int-spec.ts` |
| BE-ORIGIN-02 | `src/characters/creation/race-traits.spec.ts`, `starting-cities.reporter.spec.ts`, `starting-location.service.int-spec.ts` |
| BE-ORIGIN-03 | `src/models/enums/spell-origin.enum.spec.ts`, `src/spells/spell-fields.int-spec.ts` |
| BE-ORIGIN-04 | `src/spells/spell-fields.int-spec.ts`, `src/spells/spell-catalogue.reporter.spec.ts`, `test/app.int-spec.ts` |
| BE-ORIGIN-05 | `src/quests/outcomes/rewards/quest-rewards.spec.ts`, `outcome-plan.spec.ts`, `resolution-loader.service.spec.ts`, `study-spell-draw.int-spec.ts`, `quest-resolution.service.int-spec.ts` |
| BE-ORIGIN-06 | `src/quests/guided/mission-prizes.spec.ts`, `guided-mission.resolver.int-spec.ts`, `mission-draft-save.service.int-spec.ts`, `guided-completion.service.int-spec.ts` |
| BE-ORIGIN-07 | `src/quests/spell-schools.spec.ts`, `quest-eligibility.spec.ts`, `quest-lanes.spec.ts`, `quest-start.service.spec.ts`, `quest-acceptance.service.int-spec.ts`, `study-lore-draw.int-spec.ts` |
| BE-ORIGIN-08 | `src/quests/outcomes/resolution-loader.service.spec.ts`, `study-spell-draw.int-spec.ts` |
| BE-ORIGIN-09 | `src/quests/generation/generation-rules.spec.ts`, `quest-generator.int-spec.ts` |
| BE-ORIGIN-10 | `src/migrations/spell-origins/spell-origins.boot.spec.ts`, `spell-fields.step.spec.ts`, `spell-fields.step.int-spec.ts`, `quest-type.step.int-spec.ts`, `test/app.int-spec.ts` |
| BE-ORIGIN-11 | questo gate (handoff nel piano 12) |
| BE-ORIGIN-12 | `src/lore/lore-related.int-spec.ts`, `outcome-plan.spec.ts`, `quest-rewards.spec.ts`, `chosen-rewards.spec.ts`, `guided-completion.service.int-spec.ts`, `quest-resolution.service.int-spec.ts`, `study-spell-draw.int-spec.ts` |

## Commit

| Task | Commit | Subject |
|------|--------|---------|
| 1 | — | nessun file cambiato (gate verde, nessuna correzione) |
| 2 | (questo) | docs(phase-24): record plan 11 progress |

## Deviations from Plan

- Nessuna correzione di codice: nessun invariante fallito.
- Tre esiti annotati invece che corretti: il grep della tabella tipo → origine (annotazione di tipo prima di `=`), la sottostringa `SpellOrigin` in `SpellOriginsMigrationModule`, l'URI finto della prova T-24-31 nella cartella una tantum.
- Il lint mirato è finito in background per il limite di tempo del tool (non è jest; 72 file, esito letto a fine corsa).

## Per l'orchestratore

`npm run test:cov` completo, verifica e audit, PR verso `develop`, boot reale dal ramo col migratore e sua rimozione, script di contenuto e UAT su device (runbook nel handoff del piano 12).

## Self-Check: PASSED
