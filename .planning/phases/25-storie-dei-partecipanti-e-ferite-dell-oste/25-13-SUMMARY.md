---
phase: 25-storie-dei-partecipanti-e-ferite-dell-oste
plan: 13
subsystem: gm
tags: [gate, sdl, coverage, invariants, subscription, guided-completion]
requires:
  - "piani 25-01..25-12 committati (HEAD 760015e8)"
provides:
  - "gate della fase verde e misurato (tsc, unit, integration a blocchi, boot reale, matrice, SDL, lint, invarianti, decisioni)"
  - "flusso guidato intero sul filo con ferite dell'oste e storie"
  - "characterUpdated provato dopo un completamento che cambia solo l'origine e dopo l'aggiunta di una pagina al background"
affects: [25-14]
tech-stack:
  added: []
  patterns:
    - "harness d'esito con createCharactersTestApp per rileggere sul filo il personaggio servito al giocatore"
key-files:
  created: []
  modified:
    - src/quests/guided/guided-mission.resolver.int-spec.ts
    - src/characters/character-updated.subscription.int-spec.ts
    - .planning/phases/25-storie-dei-partecipanti-e-ferite-dell-oste/25-04-SUMMARY.md
decisions:
  - "Nessuna correzione di codice al gate: i tre casi nuovi sono verdi al primo colpo"
  - "Il foglio non racconta una ferita tolta e rimessa nello stesso completamento: cambia solo l'origine sul personaggio (già pinnato in outcome-plan.spec.ts, D-16)"
metrics:
  completed: 2026-11-21
  tasks: 3
  commits: 3
---

# Phase 25 Plan 13: gate della fase — Summary

Gate verde: un flusso guidato intero sul filo (ferita tolta, ferita inflitta a mano, passo `stories`, completamento, personaggio riletto col token del proprietario), `characterUpdated` provato dopo i due completamenti dell'oste, poi type check, suite unit e integration complete, boot reale, SDL a diciotto righe aggiunte e nessuna tolta, lint mirato, invarianti e copertura delle decisioni. Nessun difetto di codice trovato.

## Commit

| Task | Commit | Subject |
|------|--------|---------|
| 1 | 13e4765f | test(gm): cover the guided flow with wound origins and stories |
| 2 | 6e526c41 | docs(phase-25): drop a bare mongo operator from the plan 04 summary |
| 3 | (questo) | docs(phase-25): record plan 13 progress |

## Task 1: casi nuovi (tutti verdi al primo colpo)

Verdi senza toccare codice di produzione perché i piani 01–12 hanno già costruito ogni pezzo; qui si prova solo l'incollaggio sul filo.

- `guided-mission.resolver.int-spec.ts` › `completes a guided mission with wound corrections and a story page over the wire (D-05, D-09, D-12, D-13)`: personaggio con `deepCut` a DB; avvio, simulazione, correzione con `injuriesRemoved: [deepCut]` e `injuries: [...simulate, fracturedRib]`, premio con `cure: false`, salvataggio `step: stories` con un'aggiunta circondata da spazi (e una voce vuota per il secondo iscritto), `completeGuidedMission`. Foglio: `injuriesRemoved` contiene `deepCut`, `injuriesAdded` contiene `fracturedRib`, `injuriesHealed` senza `deepCut`, `backgroundEntryAdded` vero (falso sul foglio del secondo). `character(id)` col token del PROPRIETARIO: `status.injuries` senza `deepCut` e con `fracturedRib`, `status.innkeeperInjuries` uguale a `[fracturedRib]`, `infos.background` uguale alle voci di prima più il testo ripulito in coda. Bozza: `NOT_FOUND`.
  - Scelta di `X`: `fracturedRib`; il caso verifica che la simulazione non l'abbia prodotta prima di usarla.
  - Harness della spec: `createApp: createCharactersTestApp` (serve la query `character`) e `MissionSimulationChance` sostituita da una `SequenceChance` (la simulazione della spec usava la sorgente casuale vera: ora le ferite simulate non cambiano da un giro all'altro). I 31 casi di prima restano verdi.
- `character-updated.subscription.int-spec.ts`, describe nuovo `characterUpdated subscription after an innkeeper completion (wire)` (harness d'esito con `PendingRequestsModule` e `GuidedMissionModule` sopra `createCharactersTestApp`, change stream innescato con `primeChangeStream`):
  - `publishes the character after a completion that only flips the origin of a wound (D-15, D-16)`: scelta `completePendingRequest` sul filo (una sola mutation) con `injuriesRemoved: [deepCut]` e `injuries: [deepCut]`; il proprietario sottoscritto riceve `status.injuries: [deepCut]`, `status.innkeeperInjuries: [deepCut]`.
  - **Aggiunta dell'orchestratore** — `publishes the character with the new page at the end of its background after a guided completion (D-08, D-09)`: avvio, salvataggio `stories`, `completeGuidedMission` sul filo; il partecipante sottoscritto riceve `characterUpdated` con `infos.background` uguale alle voci di prima più la pagina nuova in coda. **È pubblicato: verde al primo colpo, nessuna correzione nel completamento** (il publisher ascolta il change stream del personaggio e rilegge il documento; l'aggiunta in coda sta nella stessa transazione).
- I due file sono stati eseguiti tre volte di fila: 2 suite / 55 test verdi ogni volta.

## Task 2: gate

### 1. Base e type check

`PHASE_BASE=e87339bb`; `git merge-base --is-ancestor e87339bb HEAD` esce 0; 60 commit dalla base al gate. `npx tsc --noEmit -p tsconfig.json`: 0.

### 2. Unit completo

`npx jest --selectProjects unit`: **313 suite / 4 701 test** verdi, 13 s.

### 3. Integration completa (senza coverage, `--runInBand --forceExit`)

| Blocco | Percorsi | Suite | Test | Tempo |
|--------|----------|-------|------|-------|
| 1 | `src/quests/outcomes` | 17 | 290 | 79 s |
| 2 | `src/quests/guided` | 5 | 155 | 46 s |
| 3 | resto di `src/quests` (elenco da `--listTests`) | 25 | 484 | 154 s |
| 4 | `src/characters` | 30 | 492 | 107 s |
| 5 | `src/travel` | 13 | 277 | 81 s |
| 6 | resto (`test/`, `src/push`, `src/models`, …; elenco da `--listTests`) | 73 | 994 | 178 s |
| **Totale** | | **163** | **2 692** | |

`npx jest --selectProjects integration --listTests | grep -c int-spec.ts` = 163 = somma dei blocchi. Nessun test rosso, nessuna spec appesa; `pgrep -fl 'bin/jest'` vuoto dopo ogni blocco.

### 4. Boot reale, matrice e SDL

- `npx jest test/app.int-spec.ts test/authz/authorization-matrix.int-spec.ts --selectProjects integration --runInBand --forceExit`: 2 suite / 238 test; subito dopo `git diff --exit-code src/schema.gql` esce 0.
- `git diff e87339bb -- src/schema.gql`: **18 righe aggiunte, 0 tolte**; ogni riga presente una volta nel suo blocco:

| # | Blocco | Riga |
|---|--------|------|
| 1 | `type CharacterStatus` | `innkeeperInjuries: [InjuryType!]!` |
| 2 | `type MissionBackgroundAddition` (nuovo) | `type MissionBackgroundAddition {` |
| 3 | | `character: ID!` |
| 4 | | `text: String!` |
| 5 | | `}` |
| 6 | `input MissionBackgroundAdditionInput` (nuovo) | `input MissionBackgroundAdditionInput {` |
| 7 | | `characterId: ID!` |
| 8 | | `text: String!` |
| 9 | | `}` |
| 10 | `type MissionDraft` | `backgroundAdditions: [MissionBackgroundAddition!]!` |
| 11 | `enum MissionDraftStep` | `stories` |
| 12 | `type MissionFightEffects` | `injuriesRemoved: [InjuryType!]!` |
| 13 | `type MissionFightEffects` | `innkeeperInjuries: [InjuryType!]!` |
| 14 | `type MissionFightOutcome` | `innkeeperInjuriesBefore: [InjuryType!]!` |
| 15 | `input ParticipantOverrideInput` | `injuriesRemoved: [InjuryType!]` |
| 16 | `type QuestResult` | `backgroundEntryAdded: Boolean!` |
| 17 | `type QuestResult` | `injuriesRemoved: [InjuryType!]!` |
| 18 | `input SaveMissionDraftInput` | `backgroundAdditions: [MissionBackgroundAdditionInput!]` |

### 5. Coverage

- `git diff --name-only e87339bb -- src/quests/acceptance | grep -v spec.ts`: il solo `quest-acceptance.service.ts`. `git diff e87339bb --stat -- package.json | wc -l` = 0.
- Comando per cartella del gate 24-11 (statements / branches / lines):
  - `src/quests/acceptance`: **99,11 / 92,83 / 99,75** contro la soglia 97 / 91 / 98 (6 suite, 442 test): sopra.
  - senza soglia: `src/quests/outcomes/injuries` 100 / 100 / 100 (5 suite, 173 test); `src/quests/guided` 98,53 / 82,47 / 99,36 (16 suite, 298 test).
- `npm run test:cov` completo resta all'orchestratore.

### 6. Lint mirato

60 file `.ts` aggiunti o modificati dalla base: `prettier --check` e `eslint` file per file, nessun `FAIL` (in `test/app.int-spec.ts` resta il warning preesistente `no-base-to-string`).

### 7. Invarianti

| Invariante | Esito |
|------------|-------|
| una sola regola delle cure | `cureInjuries(` in `item-use.plan.ts`, `cure-injuries.ts`, `heal-no-effect.ts`, `outcome-plan.ts`; letti a mano: i tre chiamanti passano il terzo argomento (`innkeeperInjuriesOf(snapshot.status)`, `innkeeperInjuriesOf(character)`, `fought.innkeeperInjuries`) |
| un solo modulo dell'origine | 5 funzioni esportate (`innkeeperInjuriesOf`, `applyWoundCorrection`, `asInnkeeperHand`, `handInflictedOf`, `netWoundCorrectionOf`); `'status.innkeeperInjuries'` in `item-use.plan.ts`, `quest-acceptance.service.ts`, `viewer-vitals.service.ts`, `outcome-plan.ts` |
| vie automatiche senza diff | stat 0; `export function woundsAfter` 1 |
| trappole chiuse | `new Set<InjuryType>` in `guided-outcome.ts` 0; `assertAddsOnlyNewInjuries` 0 file; `injuriesRemoved` in `guided-outcome.ts` 7 |
| nessun tiro nuovo | 0 |
| origine non scrivibile dal filo | `CharacterStatusInput` 0; `innkeeperInjuries: ` nello SDL 2 |
| storie | `BACKGROUND_MAX_GRAPHEMES = 500` 1; `characters.resolver.ts` e `src/authz` stat 0; `infos.background` in `outcome-plan.ts` e `gm-completion.service.ts` 0 |
| autorizzazioni | `expected-handlers.ts` senza diff; matrice verde |
| nessun contenuto né migratore | 0 / 0 |
| ambiente | 0 / 0 |
| determinismo | `Math.random`/`Date.now` 0; `jest.mock(` 0; `setTimeout(` 0 |
| trailer e subject | trailer 0; subject oltre 72 caratteri 0 |
| segreti | `.env` nel diff 0; `dist/` 0 |
| operatori Mongo nei SUMMARY | 8 occorrenze, 7 in code span; **1 nuda** nel frontmatter di `25-04-SUMMARY.md` (riga 19), corretta col commit `6e526c41`; titoli dei test nuovi con l'operatore 0 |
| albero e jest | `git status --short` vuoto; `pgrep -fl 'bin/jest'` vuoto |

### 8. Copertura delle decisioni

Righe aggiunte nelle spec dalla base con `D-NN` seguito da virgola o parentesi:

| Decisione | Righe | Spec d'esempio |
|-----------|-------|----------------|
| D-02 | 2 | `src/characters/characters-ownership.int-spec.ts` |
| D-05 | 16 | `src/quests/guided/mission-draft-save.service.int-spec.ts` |
| D-06 | 22 | `src/quests/guided/mission-draft-save.service.int-spec.ts` |
| D-07 | 21 | `src/quests/guided/background-additions.spec.ts` |
| D-08 | 4 | `src/quests/guided/guided-completion.service.int-spec.ts` |
| D-09 | 9 | `src/quests/results/quest-result.resolver.int-spec.ts` |
| D-10 | 2 | `src/quests/outcomes/outcome-plan.spec.ts` |
| D-11 | 4 | `src/quests/outcomes/injuries/cure-injuries.spec.ts` |
| D-12 | 26 | `src/quests/outcomes/injuries/innkeeper-injuries.spec.ts` |
| D-13 | 61 | `src/quests/outcomes/injuries/innkeeper-injuries.spec.ts` |
| D-14 | 24 | `src/quests/outcomes/outcome-plan.spec.ts` |
| D-15 | 3 | `src/characters/character-updated.subscription.int-spec.ts` |
| D-16 | 29 | `src/quests/outcomes/injuries/innkeeper-injuries.spec.ts` |

D-01 vive con D-02; D-03 e D-04 sono della FE; D-17 è superata. **D-18** (foglio, `QuestResult.injuriesRemoved`) è coperta dai casi titolati `(D-13)`:

| Spec | Caso |
|------|------|
| `quest-result.resolver.int-spec.ts` | `serves the wounds removed by the innkeeper (D-13)` |
| `quest-result.populate.spec.ts` | `carries the wounds removed by the innkeeper on the unpopulated result (D-13)` |
| `outcome-plan.spec.ts` | `removes a wound taken off by the innkeeper (D-13)` |
| `gm-completion.service.int-spec.ts` | `removes an ordinary wound listed among the removals (D-13)` |
| `guided-completion.service.int-spec.ts` | `removes a wound carried before the mission (D-13)` |

Trappole della ricerca:

| Trappola | Caso | File |
|----------|------|------|
| 1. `sameCorrections` scarta una correzione di sole rimozioni | `writes a correction that changes only the removals and resets the later fights (D-13)` | `src/quests/guided/mission-draft-save.service.int-spec.ts` |
| 2. `overrideInputOf` perde le rimozioni alla rivalidazione | `carries the removals into the override input (D-13)`; `refuses at completion a removal stored on an uncorrected fight the character no longer carries (D-13)` | `src/quests/guided/guided-outcome.spec.ts`; `src/quests/guided/guided-completion.service.int-spec.ts` |
| 3. unione delle ferite fra scontri | `folds the wounds of the fights in order instead of joining them (D-13)` | `src/quests/guided/guided-outcome.spec.ts` |

Requisiti:

| Requisito | Spec |
|-----------|------|
| BE-WOUND-01 | `character-updated.subscription.int-spec.ts`, `test/app.int-spec.ts` |
| BE-WOUND-02 | `cure-injuries.spec.ts`, `outcome-plan.spec.ts`, `item-use.plan.spec.ts` |
| BE-WOUND-03 | `heal-no-effect.spec.ts`, `accept-quest.resolver.int-spec.ts` |
| BE-WOUND-04 | `complete-pending-request.resolver.int-spec.ts`, `gm-completion.service.int-spec.ts`, `guided-completion.service.int-spec.ts` |
| BE-WOUND-05 | `innkeeper-injuries.spec.ts`, `gm-completion.service.int-spec.ts` |
| BE-WOUND-06 | `guided-outcome.spec.ts`, `guided-completion.service.int-spec.ts`, `guided-mission.resolver.int-spec.ts` |
| BE-STORY-01 | `characters-ownership.int-spec.ts` |
| BE-STORY-02 | `mission-draft-save.service.int-spec.ts`, `guided-mission.resolver.int-spec.ts` |
| BE-STORY-03 | `background-additions.spec.ts`, `grapheme-count.spec.ts` |
| BE-STORY-04 | `guided-completion.service.int-spec.ts`, `character-updated.subscription.int-spec.ts` |
| BE-STORY-05 | `quest-result.resolver.int-spec.ts`, `quest-result.populate.spec.ts` |

## Deviations from Plan

1. **`--forceExit` nei comandi d'integrazione** (istruzione dell'orchestratore e nota cumulativa del piano 01): il piano lo vietava nel comando registrato; ogni blocco ha finito i suoi test e stampato l'esito prima dell'uscita forzata, nessuna spec appesa.
2. **Caso in più sul filo della subscription** (aggiunta dell'orchestratore): `characterUpdated` dopo l'aggiunta di una pagina al background. Pubblicato, nessuna correzione.
3. **Attesa del foglio corretta nel caso del cambio d'origine:** scritta in un primo momento con `injuriesAdded`/`injuriesRemoved` pieni; il foglio riporta due liste vuote per una ferita tolta e rimessa (regola già pinnata da `reports nothing for a wound removed and added again (D-16)`). Corretta l'attesa del test, non il codice.
4. **Harness della spec del resolver guidato cambiato** (app con la query `character`, simulazione deterministica): necessario per rileggere il personaggio col token del proprietario; i casi di prima restano verdi.
5. **[Rule 1] Operatore Mongo nudo in `25-04-SUMMARY.md`** corretto (`6e526c41`).
6. **Due blocchi spostati in background dallo strumento** dopo 180 s (timeout del comando, non una scelta): esito letto a fine corsa, verde. Il lint mirato è girato in parallelo al blocco 5.

## Per il piano 14 (handoff)

- Lo SDL della fase è definitivo: le diciotto righe della tabella al punto 4.
- Da dichiarare alla FE: dopo `completeGuidedMission` il partecipante riceve `characterUpdated` con la pagina nuova come ULTIMA voce di `infos.background` (provato); un completamento che toglie e rimette la stessa ferita pubblica `characterUpdated` con `innkeeperInjuries` aggiornata ma il foglio ha `injuriesAdded` e `injuriesRemoved` vuoti per quella ferita.
- `requirements mark-complete` è del piano 14.

## Self-Check: PASSED

- `13e4765f` e `6e526c41` presenti in `git log`; i due file di spec contengono ciascuno il titolo atteso una volta.
