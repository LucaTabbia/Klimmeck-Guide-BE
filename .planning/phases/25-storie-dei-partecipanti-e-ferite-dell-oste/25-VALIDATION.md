---
phase: 25
slug: storie-dei-partecipanti-e-ferite-dell-oste
status: executing
nyquist_compliant: false
wave_0_complete: false
created: 2026-11-21
---

# Phase 25 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 30 (progetti `unit` e `integration` in `package.json` §jest), `MongoMemoryReplSet` condiviso (`test/setup/global-setup.ts`) |
| **Config file** | `package.json` (`jest.projects`) — nessuna installazione |
| **Quick run command** | `npx jest <percorsi> --selectProjects unit` / `npx jest <percorsi> --selectProjects integration --runInBand` (percorsi PRIMA di `--selectProjects`) |
| **Full suite command** | piano 25-13: `npx jest --selectProjects unit`; integration a blocchi `--runInBand` (`src/quests/outcomes`, `src/quests/guided`, resto di `src/quests`, `src/characters`, `src/travel`, resto); `npx jest test/app.int-spec.ts --selectProjects integration --runInBand` (rigenera `src/schema.gql`); `npm run test:cov` solo dall'orchestratore in background |
| **Estimated runtime** | ~180 secondi per piano (spec mirate + boot reale); gate ≈ 12 s unit + ~10 min di integration a blocchi |

---

## Sampling Rate

- **After every task commit:** la sola spec mirata del task (`--selectProjects unit` o `integration --runInBand`) + `npx tsc --noEmit -p tsconfig.json`
- **After every plan wave:** le spec della cartella toccata + `test/app.int-spec.ts` se il piano cambia decoratori (un piano per wave: wave sequenziali)
- **Before `/gsd-verify-work`:** suite completa verde (piano 25-13)
- **Max feedback latency:** 180 secondi

---

## Per-Task Verification Map

Ogni comando gira dalla radice del repo BE; a ogni task si aggiunge il controllo dei trailer sull'ultimo commit (testo completo nel `<verify>` del piano).

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 25-01-01 | 01 | 1 | BE-WOUND-01 | T-25-02 | lettura tollerante dell'origine | unit | `npx jest src/quests/outcomes/injuries/innkeeper-injuries.spec.ts --selectProjects unit && npx tsc --noEmit -p tsconfig.json` | ✅ | ✅ green |
| 25-01-02 | 01 | 1 | BE-WOUND-01 | T-25-01, T-25-02, T-25-03 | origine servita, mai scrivibile da un input | int | `npx jest src/characters/characters-ownership.int-spec.ts src/characters/character-updated.subscription.int-spec.ts test/app.int-spec.ts --selectProjects integration --runInBand && npx tsc --noEmit -p tsconfig.json && git diff --exit-code src/schema.gql && test "$(awk '/^type CharacterStatus \{/,/^\}/' src/schema.gql | grep -c '^  innkeeperInjuries: \[InjuryType!\]!$')" = 1 && test "$(grep -c 'innkeeperInjuries' src/schema.gql)" = 1` | ✅ | ✅ green |
| 25-01-03 | 01 | 1 | BE-WOUND-01 | — | N/A | docs | `grep -qF -- "- [x] 25-01-PLAN.md" .planning/ROADMAP.md && grep -q "Plan: 01 of 14" .planning/STATE.md && test -z "$(git status --short)"` | ✅ | ✅ green |
| 25-02-01 | 02 | 2 | BE-WOUND-02 | T-25-04 | la primitiva delle cure salta le ferite dell'oste | unit | `npx jest src/quests/outcomes/injuries/cure-injuries.spec.ts --selectProjects unit && npx tsc --noEmit -p tsconfig.json` | ✅ | ✅ green |
| 25-02-02 | 02 | 2 | BE-WOUND-02 | T-25-04, T-25-05, T-25-06 | pozione che non cura la ferita dell'oste; guardia di scrittura sull'origine | unit + int | `npx jest src/characters/items/item-use.plan.spec.ts --selectProjects unit && npx jest src/characters/items/use-item.int-spec.ts src/characters/items/item-use.service.int-spec.ts --selectProjects integration --runInBand && npx tsc --noEmit -p tsconfig.json && git diff --exit-code src/schema.gql` | ✅ | ✅ green |
| 25-02-03 | 02 | 2 | BE-WOUND-02 | — | N/A | docs | `grep -qF -- "- [x] 25-02-PLAN.md" .planning/ROADMAP.md && grep -q "Plan: 02 of 14" .planning/STATE.md && test -z "$(git status --short)"` | ✅ | ✅ green |
| 25-03-01 | 03 | 3 | BE-WOUND-03 | T-25-07, T-25-08 | un solo predicato «senza effetto» con l'origine | unit + int | `npx jest src/quests/outcomes/injuries/heal-no-effect.spec.ts src/quests/no-effect/viewer-vitals.service.spec.ts --selectProjects unit && npx jest src/quests/acceptance/quest-acceptance.service.int-spec.ts src/quests/quests.resolver.int-spec.ts --selectProjects integration --runInBand && npx tsc --noEmit -p tsconfig.json && git diff --exit-code src/schema.gql` | ✅ | ✅ green |
| 25-03-02 | 03 | 3 | BE-WOUND-03 | — | N/A | docs | `grep -qF -- "- [x] 25-03-PLAN.md" .planning/ROADMAP.md && grep -q "Plan: 03 of 14" .planning/STATE.md && test -z "$(git status --short)"` | ✅ | ✅ green |
| 25-04-01 | 04 | 4 | BE-WOUND-04, BE-WOUND-05 | T-25-10 | correzione pura, origine dentro le ferite portate | unit | `npx jest src/quests/outcomes/injuries/innkeeper-injuries.spec.ts --selectProjects unit && npx tsc --noEmit -p tsconfig.json` | ✅ | ✅ green |
| 25-04-02 | 04 | 4 | BE-WOUND-02, BE-WOUND-04 | T-25-09, T-25-11 | la cura dello stesso esito non tocca le ferite dell'oste; quest vinta con `prizes.cure` a DB (`quest-resolution.service.int-spec.ts`) | unit + int | `npx jest src/quests/outcomes/outcome-plan.spec.ts src/quests/outcomes/unrewarded-plan.spec.ts src/quests/outcomes/injuries src/quests/guided --selectProjects unit && npx jest src/quests/outcomes/quest-resolution.service.int-spec.ts src/quests/outcomes/quest-combat.int-spec.ts --selectProjects integration --runInBand && npx tsc --noEmit -p tsconfig.json && git diff --exit-code src/schema.gql` | ✅ | ✅ green |
| 25-04-03 | 04 | 4 | BE-WOUND-02, BE-WOUND-04, BE-WOUND-05 | — | N/A | docs | `grep -qF -- "- [x] 25-04-PLAN.md" .planning/ROADMAP.md && grep -q "Plan: 04 of 14" .planning/STATE.md && test -z "$(git status --short)"` | ✅ | ✅ green |
| 25-05-01 | 05 | 5 | BE-WOUND-04 | T-25-12, T-25-13 | campo non nullo con default sui fogli di prima | unit + int | `npx jest src/quests/results/quest-result.populate.spec.ts --selectProjects unit && npx jest src/quests/results/quest-result.resolver.int-spec.ts test/app.int-spec.ts --selectProjects integration --runInBand && npx tsc --noEmit -p tsconfig.json && git diff --exit-code src/schema.gql && test "$(awk '/^type QuestResult \{/,/^\}/' src/schema.gql | grep -c '^  injuriesRemoved: \[InjuryType!\]!$')" = 1` | ✅ | ✅ green |
| 25-05-02 | 05 | 5 | BE-WOUND-04 | — | N/A | docs | `grep -qF -- "- [x] 25-05-PLAN.md" .planning/ROADMAP.md && grep -q "Plan: 05 of 14" .planning/STATE.md && test -z "$(git status --short)"` | ✅ | ✅ green |
| 25-06-01 | 06 | 6 | BE-WOUND-04 | T-25-15, T-25-16 | rimozioni validate sulle ferite portate, tetto dell'input | unit + int | `npx jest src/quests/outcomes/gm-overrides.spec.ts src/validation/input-decorators.spec.ts src/quests/guided --selectProjects unit && npx jest test/app.int-spec.ts --selectProjects integration --runInBand && npx tsc --noEmit -p tsconfig.json && git diff --exit-code src/schema.gql && test "$(awk '/^input ParticipantOverrideInput \{/,/^\}/' src/schema.gql | grep -c '^  injuriesRemoved: \[InjuryType!\]$')" = 1` | ✅ | ✅ green |
| 25-06-02 | 06 | 6 | BE-WOUND-04, BE-WOUND-05 | T-25-14, T-25-15, T-25-17 | completamento semplice: origine e rimozioni in transazione | unit + int | `npx jest src/quests/outcomes/injuries/innkeeper-injuries.spec.ts --selectProjects unit && npx jest src/quests/outcomes/gm-completion.service.int-spec.ts src/quests/pending-requests/complete-pending-request.resolver.int-spec.ts --selectProjects integration --runInBand && npx tsc --noEmit -p tsconfig.json && git diff --exit-code src/schema.gql` | ✅ | ✅ green |
| 25-06-03 | 06 | 6 | BE-WOUND-04, BE-WOUND-05 | — | N/A | docs | `grep -qF -- "- [x] 25-06-PLAN.md" .planning/ROADMAP.md && grep -q "Plan: 06 of 14" .planning/STATE.md && test -z "$(git status --short)"` | ✅ | ✅ green |
| 25-07-01 | 07 | 7 | BE-WOUND-06 | T-25-18, T-25-20, T-25-21 | rimozioni salvate, correzione di sole rimozioni mai scartata | unit + int | `npx jest src/quests/guided --selectProjects unit && npx jest src/quests/guided/mission-draft-save.service.int-spec.ts --selectProjects integration --runInBand && npx tsc --noEmit -p tsconfig.json && git diff --exit-code src/schema.gql && test "$(grep -rc 'assertAddsOnlyNewInjuries' src | grep -vc ':0$')" = 0` | ✅ | ✅ green |
| 25-07-02 | 07 | 7 | BE-WOUND-05, BE-WOUND-06 | T-25-19 | origine derivata, mai salvata nella bozza | unit + int | `npx jest src/quests/guided src/quests/outcomes/injuries --selectProjects unit && npx jest src/quests/guided/mission-simulation.service.int-spec.ts src/quests/guided/mission-draft-save.service.int-spec.ts src/quests/guided/guided-completion.service.int-spec.ts --selectProjects integration --runInBand && npx tsc --noEmit -p tsconfig.json && git diff --exit-code src/schema.gql` | ✅ | ✅ green |
| 25-07-03 | 07 | 7 | BE-WOUND-05, BE-WOUND-06 | — | N/A | docs | `grep -qF -- "- [x] 25-07-PLAN.md" .planning/ROADMAP.md && grep -q "Plan: 07 of 14" .planning/STATE.md && test -z "$(git status --short)"` | ✅ | ✅ green |
| 25-08-01 | 08 | 8 | BE-WOUND-06 | T-25-22, T-25-23, T-25-24 | bozza solo all'oste, liste vuote sulle bozze di prima | unit + int | `npx jest src/quests/guided/mission-draft.mapper.spec.ts --selectProjects unit && npx jest src/quests/guided/guided-mission.resolver.int-spec.ts test/app.int-spec.ts --selectProjects integration --runInBand && npx tsc --noEmit -p tsconfig.json && git diff --exit-code src/schema.gql && test "$(awk '/^type MissionFightEffects \{/,/^\}/' src/schema.gql | grep -cE '^  (injuriesRemoved|innkeeperInjuries): \[InjuryType!\]!$')" = 2 && test "$(awk '/^type MissionFightOutcome \{/,/^\}/' src/schema.gql | grep -c '^  innkeeperInjuriesBefore: \[InjuryType!\]!$')" = 1` | ⬜ | ⬜ pending |
| 25-08-02 | 08 | 8 | BE-WOUND-06 | — | N/A | docs | `grep -qF -- "- [x] 25-08-PLAN.md" .planning/ROADMAP.md && grep -q "Plan: 08 of 14" .planning/STATE.md && test -z "$(git status --short)"` | ⬜ | ⬜ pending |
| 25-09-01 | 09 | 9 | BE-WOUND-06 | T-25-25, T-25-28 | piega in ordine, rimozioni alla rivalidazione | unit | `npx jest src/quests/outcomes/injuries/innkeeper-injuries.spec.ts src/quests/guided --selectProjects unit && npx tsc --noEmit -p tsconfig.json && git diff --exit-code src/schema.gql && test "$(grep -c 'new Set<InjuryType>' src/quests/guided/guided-outcome.ts)" = 0` | ⬜ | ⬜ pending |
| 25-09-02 | 09 | 9 | BE-WOUND-05, BE-WOUND-06 | T-25-26, T-25-27 | rivalidazione in sessione; la cura scelta non tocca le ferite dell'oste | unit + int | `npx jest src/quests/guided --selectProjects unit && npx jest src/quests/guided/guided-completion.service.int-spec.ts src/quests/guided/mission-draft-save.service.int-spec.ts src/quests/guided/guided-mission.resolver.int-spec.ts src/quests/outcomes/gm-completion.service.int-spec.ts --selectProjects integration --runInBand && npx tsc --noEmit -p tsconfig.json && git diff --exit-code src/schema.gql` | ⬜ | ⬜ pending |
| 25-09-03 | 09 | 9 | BE-WOUND-05, BE-WOUND-06 | — | N/A | docs | `grep -qF -- "- [x] 25-09-PLAN.md" .planning/ROADMAP.md && grep -q "Plan: 09 of 14" .planning/STATE.md && test -z "$(git status --short)"` | ⬜ | ⬜ pending |
| 25-10-01 | 10 | 10 | BE-STORY-03 | T-25-30 | una sola regola di conteggio, creazione invariata | unit | `npx jest src/characters/creation --selectProjects unit && npx tsc --noEmit -p tsconfig.json && test "$(git diff e87339bb --stat -- src/characters/creation/create-character-input.validator.spec.ts | wc -l | tr -d ' ')" = 0` | ⬜ | ⬜ pending |
| 25-10-02 | 10 | 10 | BE-STORY-01, BE-STORY-03 | T-25-29, T-25-30, T-25-31 | background letto solo da proprietario e oste; codice proprio | unit + int | `npx jest src/gameRules/game-rule.exception.spec.ts src/quests/guided/background-additions.spec.ts --selectProjects unit && npx jest src/characters/characters-ownership.int-spec.ts --selectProjects integration --runInBand && npx tsc --noEmit -p tsconfig.json && git diff --exit-code src/schema.gql` | ⬜ | ⬜ pending |
| 25-10-03 | 10 | 10 | BE-STORY-01, BE-STORY-03 | — | N/A | docs | `grep -qF -- "- [x] 25-10-PLAN.md" .planning/ROADMAP.md && grep -q "Plan: 10 of 14" .planning/STATE.md && test -z "$(git status --short)"` | ⬜ | ⬜ pending |
| 25-11-01 | 11 | 11 | BE-STORY-02, BE-STORY-03 | T-25-32, T-25-33, T-25-36 | forma dell'input validata, nessun handler nuovo | unit + int | `npx jest src/quests/guided/mission-draft.inputs.spec.ts src/quests/guided/mission-draft.mapper.spec.ts src/validation/input-decorators.spec.ts --selectProjects unit && npx jest test/app.int-spec.ts test/authz/authorization-matrix.int-spec.ts --selectProjects integration --runInBand && npx tsc --noEmit -p tsconfig.json && git diff --exit-code src/schema.gql && test "$(awk '/^enum MissionDraftStep \{/,/^\}/' src/schema.gql | grep -c '^  stories$')" = 1 && test "$(grep -cE '^(type MissionBackgroundAddition|input MissionBackgroundAdditionInput) \{$' src/schema.gql)" = 2` | ⬜ | ⬜ pending |
| 25-11-02 | 11 | 11 | BE-STORY-02, BE-STORY-03 | T-25-32, T-25-34, T-25-35 | aggiunte solo per i partecipanti, tetto di dominio | unit + int | `npx jest src/quests/guided --selectProjects unit && npx jest src/quests/guided/mission-draft-save.service.int-spec.ts src/quests/guided/guided-mission.resolver.int-spec.ts src/quests/guided/mission-draft.service.int-spec.ts --selectProjects integration --runInBand && npx tsc --noEmit -p tsconfig.json && git diff --exit-code src/schema.gql` | ⬜ | ⬜ pending |
| 25-11-03 | 11 | 11 | BE-STORY-02, BE-STORY-03 | — | N/A | docs | `grep -qF -- "- [x] 25-11-PLAN.md" .planning/ROADMAP.md && grep -q "Plan: 11 of 14" .planning/STATE.md && test -z "$(git status --short)"` | ⬜ | ⬜ pending |
| 25-12-01 | 12 | 12 | BE-STORY-05 | T-25-39 | flag falso per costruzione, default sui fogli di prima | unit + int | `npx jest src/quests/outcomes/outcome-plan.spec.ts src/quests/results/quest-result.populate.spec.ts --selectProjects unit && npx jest src/quests/results/quest-result.resolver.int-spec.ts test/app.int-spec.ts --selectProjects integration --runInBand && npx tsc --noEmit -p tsconfig.json && git diff --exit-code src/schema.gql && test "$(awk '/^type QuestResult \{/,/^\}/' src/schema.gql | grep -c '^  backgroundEntryAdded: Boolean!$')" = 1 && test "$(git diff e87339bb -- src/schema.gql | grep -cE '^\+[^+]')" = 18 && test "$(git diff e87339bb -- src/schema.gql | grep -cE '^-[^-]')" = 0` | ⬜ | ⬜ pending |
| 25-12-02 | 12 | 12 | BE-STORY-04, BE-STORY-05 | T-25-37, T-25-38, T-25-40, T-25-41 | storie scritte nella transazione, sola aggiunta in coda | unit + int | `npx jest src/quests/guided src/quests/outcomes/outcome-plan.spec.ts --selectProjects unit && npx jest src/quests/guided/guided-completion.service.int-spec.ts src/quests/outcomes/gm-completion.service.int-spec.ts src/quests/guided/guided-mission.resolver.int-spec.ts --selectProjects integration --runInBand && npx tsc --noEmit -p tsconfig.json && git diff --exit-code src/schema.gql` | ⬜ | ⬜ pending |
| 25-12-03 | 12 | 12 | BE-STORY-04, BE-STORY-05 | — | N/A | docs | `grep -qF -- "- [x] 25-12-PLAN.md" .planning/ROADMAP.md && grep -q "Plan: 12 of 14" .planning/STATE.md && test -z "$(git status --short)"` | ⬜ | ⬜ pending |
| 25-13-01 | 13 | 13 | BE-WOUND-01..06, BE-STORY-01..05 | T-25-44 | flusso intero sul filo; `characterUpdated` quando cambia solo l'origine | int | `npx jest src/quests/guided/guided-mission.resolver.int-spec.ts src/characters/character-updated.subscription.int-spec.ts --selectProjects integration --runInBand && npx tsc --noEmit -p tsconfig.json && git diff --exit-code src/schema.gql` | ⬜ | ⬜ pending |
| 25-13-02 | 13 | 13 | BE-WOUND-01..06, BE-STORY-01..06 | T-25-42, T-25-43, T-25-44, T-25-45 | SDL rigenerato e confrontato, handler invariati, nessun segreto | unit + int (gate) | `npx tsc --noEmit -p tsconfig.json && npx jest --selectProjects unit && npx jest test/app.int-spec.ts test/authz/authorization-matrix.int-spec.ts --selectProjects integration --runInBand && git diff --exit-code src/schema.gql && test "$(git diff e87339bb -- src/schema.gql | grep -cE '^\+[^+]')" = 18 && test "$(git diff e87339bb -- src/schema.gql | grep -cE '^-[^-]')" = 0 && test "$(git diff e87339bb --stat -- test/authz/expected-handlers.ts | wc -l | tr -d ' ')" = 0 && test -z "$(git status --short)"` | ⬜ | ⬜ pending |
| 25-13-03 | 13 | 13 | BE-STORY-06 | — | N/A | docs | `grep -qF -- "- [x] 25-13-PLAN.md" .planning/ROADMAP.md && grep -q "Plan: 13 of 14" .planning/STATE.md && test -z "$(git status --short)"` | ⬜ | ⬜ pending |
| 25-14-01 | 14 | 14 | BE-STORY-06 | T-25-46, T-25-47, T-25-49 | handoff senza segreti né valori reali | docs | `F=.planning/phases/25-storie-dei-partecipanti-e-ferite-dell-oste/BACKEND-NOTES.md && test "$(grep -cE '^## [0-7]\.' $F)" = 8 && grep -q "type CharacterStatus {" $F && grep -q "innkeeperInjuries: \[InjuryType!\]!" $F && grep -q "innkeeperInjuriesBefore: \[InjuryType!\]!" $F && grep -q "injuriesRemoved: \[InjuryType!\]" $F && grep -q "type MissionBackgroundAddition {" $F && grep -q "input MissionBackgroundAdditionInput {" $F && grep -q "backgroundEntryAdded: Boolean!" $F && grep -q "BACKGROUND_ADDITION_TOO_LONG" $F && grep -q "stories" $F && grep -q "completePendingRequest" $F && grep -q "schema.gql" $F && test "$(grep -ciE 'mongo(db)?(\+srv)?:/{2}' $F)" = 0` | ⬜ | ⬜ pending |
| 25-14-02 | 14 | 14 | BE-WOUND-01..06, BE-STORY-01..06 | T-25-48 | requisiti chiusi solo dopo il gate verde | docs | `test "$(grep -cE '\- \[x\] \*\*BE-(WOUND|STORY)-0[1-6]\*\*' .planning/REQUIREMENTS.md)" = 12 && test "$(grep -cE '^\| BE-(WOUND|STORY)-0[1-6] \| Phase 25 \| Complete \|' .planning/REQUIREMENTS.md)" = 12 && grep -q "nyquist_compliant: true" .planning/phases/25-storie-dei-partecipanti-e-ferite-dell-oste/25-VALIDATION.md && grep -qF -- "- [x] 25-14-PLAN.md" .planning/ROADMAP.md && grep -q "Plan: 14 of 14" .planning/STATE.md && test -z "$(git status --short)"` | ⬜ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Nessun framework da installare; mancano solo le spec e gli appoggi nuovi, ognuno creato (RED) dal task che lo usa (RESEARCH «Validation Architecture»):

- [ ] `src/quests/outcomes/injuries/innkeeper-injuries.spec.ts` — lettura dell'origine, correzione pura, ferite di pugno dell'oste, netto di una sequenza (BE-WOUND-01, -04, -05, -06; task 25-01-01, 25-04-01, 25-06-02, 25-07-02, 25-09-01)
- [ ] `src/quests/guided/background-additions.spec.ts` — regole pure delle aggiunte (BE-STORY-02, -03; task 25-10-02)
- [ ] Pin SDL di `test/app.int-spec.ts` aggiornati PRIMA dei decoratori (RED) nei task 25-01-02, 25-05-01, 25-06-01, 25-08-01, 25-11-01, 25-12-01
- [ ] Semine «legacy» col driver nativo nei casi che le usano: personaggio senza `status.innkeeperInjuries` (25-01-02), foglio senza `injuriesRemoved` / `backgroundEntryAdded` (25-05-01, 25-12-01), personaggio senza `infos.background` (25-12-02), bozza senza le sezioni nuove (25-08-01, 25-11-01)

Spec esistenti che vanno RED per scelta e si riscrivono nel piano che cambia il comportamento: i due casi «refuses a correction that adds an injury the character already had (D-14)» della Phase 22 (`fight-state.spec.ts`, `mission-draft-save.service.int-spec.ts`: piano 25-07); i casi di `aggregateEffectsOf` e `guidedBattleOf` che ricevono lo stato (piano 25-09); i casi che confrontano l'intero filtro della pozione (piano 25-02), l'intero foglio (piani 25-04 e 25-12), `FightStart` o il record dell'esito (piano 25-07) e i letterali di `OverrideParticipant` e `HealSubject` (piani 25-06 e 25-03). Le vie automatiche non cambiano di una virgola: `unrewarded-plan.spec.ts`, `src/travel/ambush/*`, `quest-combat.int-spec.ts`, `crime-guard-conclusion.int-spec.ts` restano verdi senza modifiche.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `npm run test:cov` (≈ 630 s) e soglie di coverage per cartella | tutti | supera il limite del tool: solo in background dall'orchestratore | dopo il piano 25-14 |
| Build e riavvio del BE dal ramo (nessun migratore: ogni campo nuovo ha un valore neutro) | BE-STORY-06 | database reale e build vietati agli esecutori | runbook di `BACKEND-NOTES.md` §7, a cura dell'orchestratore |
| Flusso completo con la FE Phase 24 su device: pagina delle storie prima dell'avvio, correzioni che tolgono e infliggono, ultima pagina con le aggiunte, foglio, sigillo sul Profilo, ferita «Troppo grave per essere curata», heal e pozione senza effetto | BE-WOUND-01..06, BE-STORY-01..05 | integrazione FE + BE su device | UAT guidata dall'orchestratore, un passo per messaggio (`BACKEND-NOTES.md` §7) |

Stato delle verifiche manuali: **da eseguire** (a cura dell'orchestratore dopo l'ultimo piano).

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 180s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
