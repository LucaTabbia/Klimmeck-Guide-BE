---
phase: 24
slug: origini-delle-magie-quest-void-e-shamanic
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-11-15
---

# Phase 24 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 30 (progetti `unit` e `integration` in `package.json` §jest), `MongoMemoryReplSet` condiviso (`test/setup/global-setup.ts`) |
| **Config file** | `package.json` (`jest.projects`) — nessuna installazione |
| **Quick run command** | `npx jest <percorsi> --selectProjects unit` / `npx jest <percorsi> --selectProjects integration --runInBand` |
| **Full suite command** | piano 24-11: `npx jest --selectProjects unit`; integration a blocchi `--runInBand` (`src/quests/outcomes`, resto di `src/quests`, `src/characters`, `src/travel`, resto); `npx jest test/app.int-spec.ts --selectProjects integration --runInBand` (rigenera `src/schema.gql`); `npm run test:cov` solo dall'orchestratore in background |
| **Estimated runtime** | ~180 secondi per piano (spec mirate + boot reale); gate ≈ 12 s unit + ~10 min di integration a blocchi |

---

## Sampling Rate

- **After every task commit:** la sola spec mirata del task (`--selectProjects unit` o `integration --runInBand`) + `npx tsc --noEmit -p tsconfig.json`
- **After every plan wave:** le spec della cartella toccata + `test/app.int-spec.ts` se il piano cambia decoratori (un piano per wave: wave sequenziali)
- **Before `/gsd-verify-work`:** suite completa verde (piano 24-11)
- **Max feedback latency:** 180 secondi

---

## Per-Task Verification Map

Ogni comando gira dalla radice del repo BE; a ogni task si aggiunge il controllo dei trailer sull'ultimo commit (testo completo nel `<verify>` del piano).

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 24-01-01 | 01 | 1 | BE-ORIGIN-01..12 | — | N/A (documenti) | docs | `test "$(grep -cE '^- \[ \] \*\*BE-ORIGIN-(0[1-9]|1[0-2])\*\*' .planning/REQUIREMENTS.md)" = 12 && test "$(grep -cE '^\| BE-ORIGIN-(0[1-9]|1[0-2]) \| Phase 24 \| Pending \|' .planning/REQUIREMENTS.md)" = 12 && test "$(grep -cE '^- \[ \] 24-[0-9]{2}-PLAN\.md' .planning/ROADMAP.md)" = 12 && grep -q "BE-ORIGIN-12" .planning/ROADMAP.md` | ✅ | ✅ green |
| 24-01-02 | 01 | 1 | BE-ORIGIN-01 | T-24-01 | un tipo di città scritto a DB non rompe più `cities`: enum e tabella esaustiva | unit + int | `npx jest src/cities/city-size.spec.ts --selectProjects unit && npx jest src/cities/cities.resolver.int-spec.ts test/app.int-spec.ts --selectProjects integration --runInBand && npx tsc --noEmit -p tsconfig.json && git diff --exit-code src/schema.gql` | ✅ | ✅ green |
| 24-01-03 | 01 | 1 | BE-ORIGIN-02 | T-24-02 | città di nascita dalla tabella del server | unit + int | `npx jest src/characters/creation/race-traits.spec.ts src/characters/creation/starting-cities.reporter.spec.ts --selectProjects unit && npx jest src/characters/creation/starting-location.service.int-spec.ts src/characters/creation/character-creation.resolver.int-spec.ts --selectProjects integration --runInBand && npx tsc --noEmit -p tsconfig.json && git diff --exit-code src/schema.gql` | ✅ | ✅ green |
| 24-01-04 | 01 | 1 | BE-ORIGIN-01 | T-24-04 | fascia `city` da una costante del server, report di sola lettura | unit + int | `npx jest src/shops/shop-pool.rules.spec.ts src/shops/shop-pool.report.spec.ts src/shops/shop-pool.constants.spec.ts --selectProjects unit && npx jest src/shops/shop-pool-report.service.int-spec.ts --selectProjects integration --runInBand && npx tsc --noEmit -p tsconfig.json && git diff --exit-code src/schema.gql` | ✅ | ✅ green |
| 24-01-05 | 01 | 1 | BE-ORIGIN-01, BE-ORIGIN-02 | — | N/A | docs | `grep -qF -- "- [x] 24-01-PLAN.md" .planning/ROADMAP.md && grep -q "Plan: 01 of 12" .planning/STATE.md` | ✅ | ✅ green |
| 24-02-01 | 02 | 2 | BE-ORIGIN-03 | T-24-05 | enum solo TypeScript, nessun enum GraphQL che annulli la magia | unit | `npx jest src/models/enums/spell-origin.enum.spec.ts --selectProjects unit && npx tsc --noEmit -p tsconfig.json` | ✅ | ✅ green |
| 24-02-02 | 02 | 2 | BE-ORIGIN-03, BE-ORIGIN-04 | T-24-05, T-24-06, T-24-07 | origine e livello obbligatori e validati; nessun handler nuovo | int | `npx jest src/spells/spell-fields.int-spec.ts test/app.int-spec.ts --selectProjects integration --runInBand && npx tsc --noEmit -p tsconfig.json && git diff --exit-code src/schema.gql && test "$(grep -rc 'SpellInput' src test | grep -vc ':0$')" = 0` | ✅ | ✅ green |
| 24-02-03 | 02 | 2 | BE-ORIGIN-03, BE-ORIGIN-04 | — | N/A | docs | `grep -qF -- "- [x] 24-02-PLAN.md" .planning/ROADMAP.md && grep -q "Plan: 02 of 12" .planning/STATE.md` | ✅ | ✅ green |
| 24-03-01 | 03 | 3 | BE-ORIGIN-05 | T-24-08, T-24-09, T-24-10 | livello letto fail-closed, da `progression.level`; tiri invariati | unit + int | `npx jest src/quests/outcomes/rewards/quest-rewards.spec.ts src/quests/outcomes/outcome-plan.spec.ts src/quests/outcomes/resolution-loader.service.spec.ts src/quests/guided/chosen-rewards.spec.ts src/quests/guided/mission-draft-prefill.spec.ts --selectProjects unit && npx jest src/quests/outcomes/study-spell-draw.int-spec.ts src/quests/outcomes/quest-resolution.service.int-spec.ts --selectProjects integration --runInBand && npx tsc --noEmit -p tsconfig.json && git diff --exit-code src/schema.gql` | ✅ | ✅ green |
| 24-03-02 | 03 | 3 | BE-ORIGIN-05 | — | N/A | docs | `grep -qF -- "- [x] 24-03-PLAN.md" .planning/ROADMAP.md && grep -q "Plan: 03 of 12" .planning/STATE.md` | ✅ | ✅ green |
| 24-04-01 | 04 | 4 | BE-ORIGIN-06 | T-24-11, T-24-12, T-24-13 | una regola per opzioni e rivalidazione; livello da `levelRowFor` | unit + int | `npx jest src/quests/guided --selectProjects unit && npx jest src/quests/guided/guided-mission.resolver.int-spec.ts src/quests/guided/mission-draft-save.service.int-spec.ts src/quests/guided/guided-completion.service.int-spec.ts --selectProjects integration --runInBand && npx tsc --noEmit -p tsconfig.json && git diff --exit-code src/schema.gql && test "$(grep -rc 'minXpToLearn' src/quests | grep -vc ':0$')" = 1` | ⬜ | ⬜ pending |
| 24-04-02 | 04 | 4 | BE-ORIGIN-06 | — | N/A | docs | `grep -qF -- "- [x] 24-04-PLAN.md" .planning/ROADMAP.md && grep -q "Plan: 04 of 12" .planning/STATE.md` | ⬜ | ⬜ pending |
| 24-05-01 | 05 | 5 | BE-ORIGIN-04 | T-24-14 | riga tolta dallo SDL dichiarata; campo vecchio solo nelle prove negative | int | `npx jest src/quests/quests.resolver.int-spec.ts src/spells/spell-fields.int-spec.ts test/app.int-spec.ts --selectProjects integration --runInBand && npx tsc --noEmit -p tsconfig.json && git diff --exit-code src/schema.gql && test "$(grep -rl 'minXpToLearn' src test | grep -vcE '^(test/app\.int-spec\.ts|src/spells/spell-fields\.int-spec\.ts|src/migrations/spell-origins/)')" = 0` | ⬜ | ⬜ pending |
| 24-05-02 | 05 | 5 | BE-ORIGIN-04 | T-24-15, T-24-16 | reporter con soli conteggi, mai blocca il boot | unit + int | `npx jest src/spells/spell-catalogue.reporter.spec.ts --selectProjects unit && npx jest test/app.int-spec.ts --selectProjects integration --runInBand && npx tsc --noEmit -p tsconfig.json && git diff --exit-code src/schema.gql` | ⬜ | ⬜ pending |
| 24-05-03 | 05 | 5 | BE-ORIGIN-04 | — | N/A | docs | `grep -qF -- "- [x] 24-05-PLAN.md" .planning/ROADMAP.md && grep -q "Plan: 05 of 12" .planning/STATE.md` | ⬜ | ⬜ pending |
| 24-06-01 | 06 | 6 | BE-ORIGIN-07 | T-24-17, T-24-18 | tabella delle scuole fail-closed; accettazione da mage in su | unit + int | `npx jest src/quests/spell-schools.spec.ts src/quests/acceptance/quest-eligibility.spec.ts src/quests/acceptance/quest-lanes.spec.ts src/quests/outcomes/combatant-plan.spec.ts src/quests/outcomes/outcome-plan.spec.ts src/quests/outcomes/aid --selectProjects unit && npx jest src/quests/outcomes/study-lore-draw.int-spec.ts src/quests/outcomes/study-spell-draw.int-spec.ts src/quests/acceptance/quest-acceptance.service.int-spec.ts --selectProjects integration --runInBand && npx tsc --noEmit -p tsconfig.json && test "$(grep -rc 'QuestType.magic' src test | grep -vc ':0$')" = 0` | ⬜ | ⬜ pending |
| 24-06-02 | 06 | 6 | BE-ORIGIN-07 | T-24-19 | SDL invariato al boot reale | unit + int | `npx jest test/app.int-spec.ts --selectProjects integration --runInBand && npx jest src/quests/party src/quests/acceptance --selectProjects unit && npx tsc --noEmit -p tsconfig.json && git diff --exit-code src/schema.gql` | ⬜ | ⬜ pending |
| 24-06-03 | 06 | 6 | BE-ORIGIN-07 | — | N/A | docs | `grep -qF -- "- [x] 24-06-PLAN.md" .planning/ROADMAP.md && grep -q "Plan: 06 of 12" .planning/STATE.md` | ⬜ | ⬜ pending |
| 24-07-01 | 07 | 7 | BE-ORIGIN-08 | T-24-20, T-24-21, T-24-22 | filtro con una costante dell'enum, mai un input; tiri invariati | unit + int | `npx jest src/quests/outcomes/resolution-loader.service.spec.ts src/quests/outcomes/rewards --selectProjects unit && npx jest src/quests/outcomes/study-spell-draw.int-spec.ts src/quests/outcomes/quest-resolution.service.int-spec.ts src/quests/guided/guided-completion.service.int-spec.ts --selectProjects integration --runInBand && npx tsc --noEmit -p tsconfig.json && git diff --exit-code src/schema.gql` | ⬜ | ⬜ pending |
| 24-07-02 | 07 | 7 | BE-ORIGIN-08 | — | N/A | docs | `grep -qF -- "- [x] 24-07-PLAN.md" .planning/ROADMAP.md && grep -q "Plan: 07 of 12" .planning/STATE.md` | ⬜ | ⬜ pending |
| 24-08-01 | 08 | 8 | BE-ORIGIN-12 | T-24-23, T-24-24 | lore di una magia servita solo al viewer che l'ha sbloccata | int | `npx jest src/lore/lore-related.int-spec.ts src/spells/spell-fields.int-spec.ts test/app.int-spec.ts --selectProjects integration --runInBand && npx tsc --noEmit -p tsconfig.json && git diff --exit-code src/schema.gql` | ⬜ | ⬜ pending |
| 24-08-02 | 08 | 8 | BE-ORIGIN-12 | T-24-24, T-24-25 | sblocco solo con la magia imparata, ref sanificati | unit + int | `npx jest src/quests/outcomes/rewards src/quests/outcomes/outcome-plan.spec.ts src/quests/outcomes/resolution-loader.service.spec.ts src/quests/guided --selectProjects unit && npx jest src/quests/outcomes/study-spell-draw.int-spec.ts src/quests/outcomes/quest-resolution.service.int-spec.ts src/quests/guided/guided-completion.service.int-spec.ts --selectProjects integration --runInBand && npx tsc --noEmit -p tsconfig.json && git diff --exit-code src/schema.gql` | ⬜ | ⬜ pending |
| 24-08-03 | 08 | 8 | BE-ORIGIN-12 | — | N/A | docs | `grep -qF -- "- [x] 24-08-PLAN.md" .planning/ROADMAP.md && grep -q "Plan: 08 of 12" .planning/STATE.md` | ⬜ | ⬜ pending |
| 24-09-01 | 09 | 9 | BE-ORIGIN-09 | T-24-26, T-24-27 | pavimento da una tabella pura, fail-closed sul tipo | unit | `npx jest src/quests/generation/generation-rules.spec.ts --selectProjects unit && npx tsc --noEmit -p tsconfig.json` | ⬜ | ⬜ pending |
| 24-09-02 | 09 | 9 | BE-ORIGIN-09 | T-24-26, T-24-28 | nessuna quest sotto mage a Necrorian, nessun tiro nuovo | unit + int | `npx jest src/quests/generation --selectProjects unit && npx jest src/quests/generation/quest-generator.int-spec.ts src/quests/generation/quest-generation.resolver.int-spec.ts --selectProjects integration --runInBand && npx tsc --noEmit -p tsconfig.json && git diff --exit-code src/schema.gql` | ⬜ | ⬜ pending |
| 24-09-03 | 09 | 9 | BE-ORIGIN-09 | — | N/A | docs | `grep -qF -- "- [x] 24-09-PLAN.md" .planning/ROADMAP.md && grep -q "Plan: 09 of 12" .planning/STATE.md` | ⬜ | ⬜ pending |
| 24-10-01 | 10 | 10 | BE-ORIGIN-10 | T-24-31 | errore nuovo senza causa, log di soli conteggi | unit | `npx jest src/migrations/spell-origins --selectProjects unit && npx tsc --noEmit -p tsconfig.json` | ⬜ | ⬜ pending |
| 24-10-02 | 10 | 10 | BE-ORIGIN-10 | T-24-29, T-24-30 | scrittura condizionata sui valori letti, nessun campo cancellato | unit + int | `npx jest src/migrations/spell-origins --selectProjects unit && npx jest src/migrations/spell-origins/spell-fields.step.int-spec.ts --selectProjects integration --runInBand && npx tsc --noEmit -p tsconfig.json` | ⬜ | ⬜ pending |
| 24-10-03 | 10 | 10 | BE-ORIGIN-10 | T-24-29, T-24-30 | rinomina filtrata sul valore vecchio, idempotente | int | `npx jest src/migrations/spell-origins/quest-type.step.int-spec.ts --selectProjects integration --runInBand && npx tsc --noEmit -p tsconfig.json` | ⬜ | ⬜ pending |
| 24-10-04 | 10 | 10 | BE-ORIGIN-10 | T-24-32, T-24-33 | modulo montato solo da `AppModule`, marcato una tantum | unit + int | `npx jest src/migrations/spell-origins --selectProjects unit && npx jest src/migrations/spell-origins test/app.int-spec.ts --selectProjects integration --runInBand && npx tsc --noEmit -p tsconfig.json && git diff --exit-code src/schema.gql && test "$(grep -rl 'SpellOriginsMigrationModule' src test | wc -l | tr -d ' ')" = 3` | ⬜ | ⬜ pending |
| 24-10-05 | 10 | 10 | BE-ORIGIN-10 | — | N/A | docs | `grep -qF -- "- [x] 24-10-PLAN.md" .planning/ROADMAP.md && grep -q "Plan: 10 of 12" .planning/STATE.md` | ⬜ | ⬜ pending |
| 24-11-01 | 11 | 11 | BE-ORIGIN-01..12 | T-24-34, T-24-35, T-24-36, T-24-37 | SDL rigenerato e confrontato, handler invariati, nessun segreto | unit + int (gate) | `npx tsc --noEmit -p tsconfig.json && npx jest --selectProjects unit && npx jest test/app.int-spec.ts test/authz/authorization-matrix.int-spec.ts --selectProjects integration --runInBand && git diff --exit-code src/schema.gql && test "$(git diff a208ad3d -- src/schema.gql | grep -E '^-[^-]' | grep -vcF -- '-  minXpToLearn: Int!')" = 0 && test "$(git diff a208ad3d -- src/schema.gql | grep -cE '^\+[^+]')" = 6 && test "$(grep -c 'minXpToLearn' src/schema.gql)" = 0` | ⬜ | ⬜ pending |
| 24-11-02 | 11 | 11 | BE-ORIGIN-11 | — | N/A | docs | `grep -qF -- "- [x] 24-11-PLAN.md" .planning/ROADMAP.md && grep -q "Plan: 11 of 12" .planning/STATE.md` | ⬜ | ⬜ pending |
| 24-12-01 | 12 | 12 | BE-ORIGIN-11 | T-24-38, T-24-40 | handoff senza segreti né valori reali | docs | `F=.planning/phases/24-origini-delle-magie-quest-void-e-shamanic/BACKEND-NOTES.md && test "$(grep -cE '^## [0-7]\.' $F)" = 8 && grep -q "type Spell {" $F && grep -q "minLevelToLearn: Int!" $F && grep -q "dragonbornCapital" $F && grep -q "DA COMPILARE DALL'ORCHESTRATORE" $F && grep -q "schema.gql" $F && test "$(grep -ciE 'mongo(db)?(\+srv)?:/{2}' $F)" = 0` | ⬜ | ⬜ pending |
| 24-12-02 | 12 | 12 | BE-ORIGIN-01..12 | T-24-39 | requisiti chiusi solo dopo il gate verde | docs | `test "$(grep -cE '\- \[x\] \*\*BE-ORIGIN-(0[1-9]|1[0-2])\*\*' .planning/REQUIREMENTS.md)" = 12 && grep -q "nyquist_compliant: true" .planning/phases/24-origini-delle-magie-quest-void-e-shamanic/24-VALIDATION.md && grep -qF -- "- [x] 24-12-PLAN.md" .planning/ROADMAP.md && grep -q "Plan: 12 of 12" .planning/STATE.md` | ⬜ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Nessun framework da installare; mancano solo le spec e gli appoggi nuovi, ognuno creato (RED) dal task che lo usa (RESEARCH «Validation Architecture», più gli emendamenti del 2026-11-15):

- [ ] `src/models/enums/spell-origin.enum.spec.ts` — valori sul filo delle tre origini (BE-ORIGIN-03, task 24-02-01)
- [ ] `src/spells/spell-fields.int-spec.ts` — lo schema conserva e valida origine, livello minimo e lore; il filo li serve (BE-ORIGIN-03/04/12, task 24-02-02, 24-05-01, 24-08-01)
- [ ] `test/fixtures/spell.fixture.ts` — `origin`, `minLevelToLearn` (condiviso, task 24-02-02; via `minXpToLearn` nel task 24-05-01)
- [ ] `src/spells/spell-catalogue.reporter.spec.ts` — reporter d'avvio delle magie non servibili (BE-ORIGIN-04, task 24-05-02)
- [ ] `src/quests/spell-schools.spec.ts` — tabella tipo → origine (BE-ORIGIN-07, task 24-06-01)
- [ ] `test/quests/generation-world.ts` — opzione `cityTypes` per una città `necrorianCity` (BE-ORIGIN-09, task 24-09-02)
- [ ] `src/migrations/spell-origins/spell-origins.boot.spec.ts` e `spell-fields.step.spec.ts` — boot e regola pura del migratore (BE-ORIGIN-10, task 24-10-01)
- [ ] `src/migrations/spell-origins/spell-fields.step.int-spec.ts` e `quest-type.step.int-spec.ts` — passi del migratore sul `MongoMemoryReplSet` (BE-ORIGIN-10, task 24-10-02, 24-10-03)

Spec esistenti che vanno RED per scelta e si riscrivono nel piano che cambia il comportamento (RESEARCH §Q2, §Q3, §Q5): `cities/city-size.spec.ts` (conteggi 14 / 9 / 13), `characters/creation/race-traits.spec.ts`, `starting-cities.reporter.spec.ts`, `starting-location.service.int-spec.ts`, `character-creation.resolver.int-spec.ts` (24-01); le spec che citano `minXpToLearn` (24-03, 24-04, 24-05); le tabelle esaustive `quest-lanes.spec.ts` e `quest-eligibility.spec.ts` e ogni spec col tipo `magic` (24-06).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Boot reale dal ramo col migratore: righe «Origini delle magie, …», seconda corsa a zero, rimozione del migratore | BE-ORIGIN-10 | database reale e build vietati agli esecutori | runbook di `BACKEND-NOTES.md` §4, a cura dell'orchestratore (backup prima del boot) |
| Contenuto a DB: origini delle 96 magie, magie nuove, lore d'origine e collegamenti, tre quest nuove, heal e negozi da città delle due capitali, lore delle tre città | BE-ORIGIN-03, BE-ORIGIN-08, BE-ORIGIN-12 | contenuto fuori dal repo, dopo la revisione dell'utente | script dell'orchestratore fuori dal repo (`BACKEND-NOTES.md` §5); WARN `Magie: …` atteso assente al riavvio |
| Flusso completo con la FE Phase 23 (mappa con le tre città, origine e livello nel Diario, quest di scuola, lore dell'origine, Necrorian, opzioni dell'oste, nascita nelle capitali) | BE-ORIGIN-01..12 | integrazione FE + BE su device | UAT guidata dall'orchestratore, un passo per messaggio (`BACKEND-NOTES.md` §7) |

Stato delle tre verifiche manuali: **da eseguire** (a cura dell'orchestratore dopo l'ultimo piano).

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 180s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
