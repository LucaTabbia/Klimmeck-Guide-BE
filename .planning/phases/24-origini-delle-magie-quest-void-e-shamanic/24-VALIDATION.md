---
phase: 24
slug: origini-delle-magie-quest-void-e-shamanic
status: complete
nyquist_compliant: true
wave_0_complete: true
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
| 24-04-01 | 04 | 4 | BE-ORIGIN-06 | T-24-11, T-24-12, T-24-13 | una regola per opzioni e rivalidazione; livello da `levelRowFor` | unit + int | `npx jest src/quests/guided --selectProjects unit && npx jest src/quests/guided/guided-mission.resolver.int-spec.ts src/quests/guided/mission-draft-save.service.int-spec.ts src/quests/guided/guided-completion.service.int-spec.ts --selectProjects integration --runInBand && npx tsc --noEmit -p tsconfig.json && git diff --exit-code src/schema.gql && test "$(grep -rc 'minXpToLearn' src/quests | grep -vc ':0$')" = 1` | ✅ | ✅ green |
| 24-04-02 | 04 | 4 | BE-ORIGIN-06 | — | N/A | docs | `grep -qF -- "- [x] 24-04-PLAN.md" .planning/ROADMAP.md && grep -q "Plan: 04 of 12" .planning/STATE.md` | ✅ | ✅ green |
| 24-05-01 | 05 | 5 | BE-ORIGIN-04 | T-24-14 | riga tolta dallo SDL dichiarata; campo vecchio solo nelle prove negative | int | `npx jest src/quests/quests.resolver.int-spec.ts src/spells/spell-fields.int-spec.ts test/app.int-spec.ts --selectProjects integration --runInBand && npx tsc --noEmit -p tsconfig.json && git diff --exit-code src/schema.gql && test "$(grep -rl 'minXpToLearn' src test | grep -vcE '^(test/app\.int-spec\.ts|src/spells/spell-fields\.int-spec\.ts|src/migrations/spell-origins/)')" = 0` | ✅ | ✅ green |
| 24-05-02 | 05 | 5 | BE-ORIGIN-04 | T-24-15, T-24-16 | reporter con soli conteggi, mai blocca il boot | unit + int | `npx jest src/spells/spell-catalogue.reporter.spec.ts --selectProjects unit && npx jest test/app.int-spec.ts --selectProjects integration --runInBand && npx tsc --noEmit -p tsconfig.json && git diff --exit-code src/schema.gql` | ✅ | ✅ green |
| 24-05-03 | 05 | 5 | BE-ORIGIN-04 | — | N/A | docs | `grep -qF -- "- [x] 24-05-PLAN.md" .planning/ROADMAP.md && grep -q "Plan: 05 of 12" .planning/STATE.md` | ✅ | ✅ green |
| 24-06-01 | 06 | 6 | BE-ORIGIN-07 | T-24-17, T-24-18 | tabella delle scuole fail-closed; accettazione da mage in su | unit + int | `npx jest src/quests/spell-schools.spec.ts src/quests/acceptance/quest-eligibility.spec.ts src/quests/acceptance/quest-lanes.spec.ts src/quests/outcomes/combatant-plan.spec.ts src/quests/outcomes/outcome-plan.spec.ts src/quests/outcomes/aid --selectProjects unit && npx jest src/quests/outcomes/study-lore-draw.int-spec.ts src/quests/outcomes/study-spell-draw.int-spec.ts src/quests/acceptance/quest-acceptance.service.int-spec.ts --selectProjects integration --runInBand && npx tsc --noEmit -p tsconfig.json && test "$(grep -rc 'QuestType.magic' src test | grep -vc ':0$')" = 0` | ✅ | ✅ green |
| 24-06-02 | 06 | 6 | BE-ORIGIN-07 | T-24-19 | SDL invariato al boot reale | unit + int | `npx jest test/app.int-spec.ts --selectProjects integration --runInBand && npx jest src/quests/party src/quests/acceptance --selectProjects unit && npx tsc --noEmit -p tsconfig.json && git diff --exit-code src/schema.gql` | ✅ | ✅ green |
| 24-06-03 | 06 | 6 | BE-ORIGIN-07 | — | N/A | docs | `grep -qF -- "- [x] 24-06-PLAN.md" .planning/ROADMAP.md && grep -q "Plan: 06 of 12" .planning/STATE.md` | ✅ | ✅ green |
| 24-07-01 | 07 | 7 | BE-ORIGIN-08 | T-24-20, T-24-21, T-24-22 | filtro con una costante dell'enum, mai un input; tiri invariati | unit + int | `npx jest src/quests/outcomes/resolution-loader.service.spec.ts src/quests/outcomes/rewards --selectProjects unit && npx jest src/quests/outcomes/study-spell-draw.int-spec.ts src/quests/outcomes/quest-resolution.service.int-spec.ts src/quests/guided/guided-completion.service.int-spec.ts --selectProjects integration --runInBand && npx tsc --noEmit -p tsconfig.json && git diff --exit-code src/schema.gql` | ✅ | ✅ green |
| 24-07-02 | 07 | 7 | BE-ORIGIN-08 | — | N/A | docs | `grep -qF -- "- [x] 24-07-PLAN.md" .planning/ROADMAP.md && grep -q "Plan: 07 of 12" .planning/STATE.md` | ✅ | ✅ green |
| 24-08-01 | 08 | 8 | BE-ORIGIN-12 | T-24-23, T-24-24 | lore di una magia servita solo al viewer che l'ha sbloccata | int | `npx jest src/lore/lore-related.int-spec.ts src/spells/spell-fields.int-spec.ts test/app.int-spec.ts --selectProjects integration --runInBand && npx tsc --noEmit -p tsconfig.json && git diff --exit-code src/schema.gql` | ✅ | ✅ green |
| 24-08-02 | 08 | 8 | BE-ORIGIN-12 | T-24-24, T-24-25 | sblocco solo con la magia imparata, ref sanificati | unit + int | `npx jest src/quests/outcomes/rewards src/quests/outcomes/outcome-plan.spec.ts src/quests/outcomes/resolution-loader.service.spec.ts src/quests/guided --selectProjects unit && npx jest src/quests/outcomes/study-spell-draw.int-spec.ts src/quests/outcomes/quest-resolution.service.int-spec.ts src/quests/guided/guided-completion.service.int-spec.ts --selectProjects integration --runInBand && npx tsc --noEmit -p tsconfig.json && git diff --exit-code src/schema.gql` | ✅ | ✅ green |
| 24-08-03 | 08 | 8 | BE-ORIGIN-12 | — | N/A | docs | `grep -qF -- "- [x] 24-08-PLAN.md" .planning/ROADMAP.md && grep -q "Plan: 08 of 12" .planning/STATE.md` | ✅ | ✅ green |
| 24-09-01 | 09 | 9 | BE-ORIGIN-09 | T-24-26, T-24-27 | pavimento da una tabella pura, fail-closed sul tipo | unit | `npx jest src/quests/generation/generation-rules.spec.ts --selectProjects unit && npx tsc --noEmit -p tsconfig.json` | ✅ | ✅ green |
| 24-09-02 | 09 | 9 | BE-ORIGIN-09 | T-24-26, T-24-28 | nessuna quest sotto mage a Necrorian, nessun tiro nuovo | unit + int | `npx jest src/quests/generation --selectProjects unit && npx jest src/quests/generation/quest-generator.int-spec.ts src/quests/generation/quest-generation.resolver.int-spec.ts --selectProjects integration --runInBand && npx tsc --noEmit -p tsconfig.json && git diff --exit-code src/schema.gql` | ✅ | ✅ green |
| 24-09-03 | 09 | 9 | BE-ORIGIN-09 | — | N/A | docs | `grep -qF -- "- [x] 24-09-PLAN.md" .planning/ROADMAP.md && grep -q "Plan: 09 of 12" .planning/STATE.md` | ✅ | ✅ green |
| 24-10-01 | 10 | 10 | BE-ORIGIN-10 | T-24-31 | errore nuovo senza causa, log di soli conteggi | unit | `npx jest src/migrations/spell-origins --selectProjects unit && npx tsc --noEmit -p tsconfig.json` | ✅ | ✅ green |
| 24-10-02 | 10 | 10 | BE-ORIGIN-10 | T-24-29, T-24-30 | scrittura condizionata sui valori letti, nessun campo cancellato | unit + int | `npx jest src/migrations/spell-origins --selectProjects unit && npx jest src/migrations/spell-origins/spell-fields.step.int-spec.ts --selectProjects integration --runInBand && npx tsc --noEmit -p tsconfig.json` | ✅ | ✅ green |
| 24-10-03 | 10 | 10 | BE-ORIGIN-10 | T-24-29, T-24-30 | rinomina filtrata sul valore vecchio, idempotente | int | `npx jest src/migrations/spell-origins/quest-type.step.int-spec.ts --selectProjects integration --runInBand && npx tsc --noEmit -p tsconfig.json` | ✅ | ✅ green |
| 24-10-04 | 10 | 10 | BE-ORIGIN-10 | T-24-32, T-24-33 | modulo montato solo da `AppModule`, marcato una tantum | unit + int | `npx jest src/migrations/spell-origins --selectProjects unit && npx jest src/migrations/spell-origins test/app.int-spec.ts --selectProjects integration --runInBand && npx tsc --noEmit -p tsconfig.json && git diff --exit-code src/schema.gql && test "$(grep -rl 'SpellOriginsMigrationModule' src test | wc -l | tr -d ' ')" = 3` | ✅ | ✅ green |
| 24-10-05 | 10 | 10 | BE-ORIGIN-10 | — | N/A | docs | `grep -qF -- "- [x] 24-10-PLAN.md" .planning/ROADMAP.md && grep -q "Plan: 10 of 12" .planning/STATE.md` | ✅ | ✅ green |
| 24-11-01 | 11 | 11 | BE-ORIGIN-01..12 | T-24-34, T-24-35, T-24-36, T-24-37 | SDL rigenerato e confrontato, handler invariati, nessun segreto | unit + int (gate) | `npx tsc --noEmit -p tsconfig.json && npx jest --selectProjects unit && npx jest test/app.int-spec.ts test/authz/authorization-matrix.int-spec.ts --selectProjects integration --runInBand && git diff --exit-code src/schema.gql && test "$(git diff a208ad3d -- src/schema.gql | grep -E '^-[^-]' | grep -vcF -- '-  minXpToLearn: Int!')" = 0 && test "$(git diff a208ad3d -- src/schema.gql | grep -cE '^\+[^+]')" = 6 && test "$(grep -c 'minXpToLearn' src/schema.gql)" = 0` | ✅ | ✅ green |
| 24-11-02 | 11 | 11 | BE-ORIGIN-11 | — | N/A | docs | `grep -qF -- "- [x] 24-11-PLAN.md" .planning/ROADMAP.md && grep -q "Plan: 11 of 12" .planning/STATE.md` | ✅ | ✅ green |
| 24-12-01 | 12 | 12 | BE-ORIGIN-11 | T-24-38, T-24-40 | handoff senza segreti né valori reali | docs | `F=.planning/phases/24-origini-delle-magie-quest-void-e-shamanic/BACKEND-NOTES.md && test "$(grep -cE '^## [0-7]\.' $F)" = 8 && grep -q "type Spell {" $F && grep -q "minLevelToLearn: Int!" $F && grep -q "dragonbornCapital" $F && grep -q "DA COMPILARE DALL'ORCHESTRATORE" $F && grep -q "schema.gql" $F && test "$(grep -ciE 'mongo(db)?(\+srv)?:/{2}' $F)" = 0` | ✅ | ✅ green |
| 24-12-02 | 12 | 12 | BE-ORIGIN-01..12 | T-24-39 | requisiti chiusi solo dopo il gate verde | docs | `test "$(grep -cE '\- \[x\] \*\*BE-ORIGIN-(0[1-9]|1[0-2])\*\*' .planning/REQUIREMENTS.md)" = 12 && grep -q "nyquist_compliant: true" .planning/phases/24-origini-delle-magie-quest-void-e-shamanic/24-VALIDATION.md && grep -qF -- "- [x] 24-12-PLAN.md" .planning/ROADMAP.md && grep -q "Plan: 12 of 12" .planning/STATE.md` | ✅ | ✅ green |
| 24-13-01 | 13 | 13 | BE-ORIGIN-13..18 | — | N/A (documenti) | docs | `test "$(grep -cE '^- \[ \] \*\*BE-ORIGIN-1[3-8]\*\*' .planning/REQUIREMENTS.md)" = 6 && test "$(grep -cE '^\| BE-ORIGIN-1[3-8] \| Phase 24 \| Pending \|' .planning/REQUIREMENTS.md)" = 6 && test "$(grep -cE '^\| 24-1[3-8]-0[1-3] ' .planning/phases/24-origini-delle-magie-quest-void-e-shamanic/24-VALIDATION.md)" = 17` | ✅ | ✅ green |
| 24-13-02 | 13 | 13 | BE-ORIGIN-13 | T-24-41, T-24-42, T-24-43 | tempo sporco fail-closed, magia e lore solo a fine apprendimento, nessun tiro spostato | unit + int | `npx jest src/quests/outcomes/rewards src/quests/outcomes/outcome-plan.spec.ts src/quests/outcomes/resolution-loader.service.spec.ts src/quests/guided --selectProjects unit && npx jest src/quests/outcomes/study-spell-draw.int-spec.ts src/quests/outcomes/quest-resolution.service.int-spec.ts --selectProjects integration --runInBand && npx tsc --noEmit -p tsconfig.json && git diff --exit-code src/schema.gql` | ✅ | ✅ green |
| 24-13-03 | 13 | 13 | BE-ORIGIN-13 | — | N/A | docs | `grep -qF -- "- [x] 24-13-PLAN.md" .planning/ROADMAP.md && grep -q "Plan: 13 of 18" .planning/STATE.md && test -z "$(git status --short)"` | ✅ | ✅ green |
| 24-14-01 | 14 | 14 | BE-ORIGIN-14 | T-24-44, T-24-45, T-24-46 | riarmo condizionato a `learningSpell` nullo, `spellFound` e campi della `PendingQuest` fuori dal filo, job best-effort | unit + int | `npx jest src/models/quest-lanes.schema.spec.ts src/quests/outcomes/outcome-writer.spec.ts src/quests/outcomes/outcome-plan.spec.ts --selectProjects unit && npx jest src/quests/outcomes/study-spell-draw.int-spec.ts src/quests/outcomes/quest-resolution.service.int-spec.ts src/quests/outcomes/quest-combat.int-spec.ts --selectProjects integration --runInBand && npx tsc --noEmit -p tsconfig.json && git diff --exit-code src/schema.gql` | ✅ | ✅ green |
| 24-14-02 | 14 | 14 | BE-ORIGIN-14 | T-24-47 | riarmo e cancellazioni nella stessa transazione del gruppo | int | `npx jest src/quests/outcomes/boss-resolution.int-spec.ts src/quests/outcomes/aid-rescue.int-spec.ts src/quests/outcomes/aid-timeout.int-spec.ts src/quests/outcomes/dungeon-aid.int-spec.ts src/quests/outcomes/companion-defeat-rescue.int-spec.ts --selectProjects integration --runInBand && npx tsc --noEmit -p tsconfig.json && git diff --exit-code src/schema.gql` | ✅ | ✅ green |
| 24-14-03 | 14 | 14 | BE-ORIGIN-14 | — | N/A | docs | `grep -qF -- "- [x] 24-14-PLAN.md" .planning/ROADMAP.md && grep -q "Plan: 14 of 18" .planning/STATE.md && test -z "$(git status --short)"` | ✅ | ✅ green |
| 24-15-01 | 15 | 15 | BE-ORIGIN-15 | T-24-50 | foglio e magia letti fail-closed | unit | `npx jest src/quests/outcomes/learning src/quests/outcomes/resolution-loader.service.spec.ts --selectProjects unit && npx tsc --noEmit -p tsconfig.json && git diff --exit-code src/schema.gql` | ✅ | ✅ green |
| 24-15-02 | 15 | 15 | BE-ORIGIN-15 | T-24-48, T-24-49, T-24-51, T-24-52 | mai prima del tempo, una sola volta, recupero dallo sweep, log con soli id | unit + int | `npx jest src/quests/outcomes --selectProjects unit && npx jest src/quests/outcomes/spell-learning.int-spec.ts src/quests/outcomes/quest-resolution.sweeper.int-spec.ts src/quests/outcomes/study-spell-draw.int-spec.ts src/quests/outcomes/quest-resolution.service.int-spec.ts src/quests/outcomes/quest-resolution.processor.int-spec.ts --selectProjects integration --runInBand && npx tsc --noEmit -p tsconfig.json && git diff --exit-code src/schema.gql` | ✅ | ✅ green |
| 24-15-03 | 15 | 15 | BE-ORIGIN-15 | — | N/A | docs | `grep -qF -- "- [x] 24-15-PLAN.md" .planning/ROADMAP.md && grep -q "Plan: 15 of 18" .planning/STATE.md && test -z "$(git status --short)"` | ✅ | ✅ green |
| 24-16-01 | 16 | 16 | BE-ORIGIN-16 | T-24-53, T-24-54, T-24-56 | push data-only, tipi additivi, guardia di `sendTestPush` invariata | unit + int | `npx jest src/push --selectProjects unit && npx jest src/push/push.resolver.int-spec.ts test/app.int-spec.ts --selectProjects integration --runInBand && npx tsc --noEmit -p tsconfig.json && git diff --exit-code src/schema.gql && test "$(awk '/^enum PushEventType \{/,/^\}/' src/schema.gql | grep -cE '^  spellResearch(Failed|Succeeded)$')" = 2` | ✅ | ✅ green |
| 24-16-02 | 16 | 16 | BE-ORIGIN-16 | T-24-55 | consegna best-effort dopo il commit | unit + int | `npx jest src/quests/outcomes/outcome-writer.spec.ts src/push --selectProjects unit && npx jest src/quests/outcomes/study-spell-draw.int-spec.ts src/quests/outcomes/spell-learning.int-spec.ts src/quests/outcomes/quest-resolution.service.int-spec.ts src/quests/outcomes/boss-resolution.int-spec.ts src/quests/outcomes/gm-completion.service.int-spec.ts --selectProjects integration --runInBand && npx tsc --noEmit -p tsconfig.json && git diff --exit-code src/schema.gql` | ✅ | ✅ green |
| 24-16-03 | 16 | 16 | BE-ORIGIN-16 | — | N/A | docs | `grep -qF -- "- [x] 24-16-PLAN.md" .planning/ROADMAP.md && grep -q "Plan: 16 of 18" .planning/STATE.md && test -z "$(git status --short)"` | ✅ | ✅ green |
| 24-17-01 | 17 | 17 | BE-ORIGIN-17 | T-24-57, T-24-58 | guardie dei percorsi di oggi, `researchResult` fuori dal filo | int | `npx jest src/characters/character-quest-lanes.int-spec.ts src/characters/pending-quest-start.publisher.int-spec.ts test/app.int-spec.ts test/authz/authorization-matrix.int-spec.ts --selectProjects integration --runInBand && npx tsc --noEmit -p tsconfig.json && git diff --exit-code src/schema.gql && test "$(awk '/^type PendingQuest \{/,/^\}/' src/schema.gql | grep -c '^  learningSpell: Spell$')" = 1 && test "$(grep -c 'researchResult' src/schema.gql)" = 0` | ✅ | ✅ green |
| 24-17-02 | 17 | 17 | BE-ORIGIN-17 | T-24-59, T-24-60, T-24-61 | SDL solo aggiunte, `Boolean!` mai nullo | unit + int | `npx jest src/quests/results src/quests/prizes --selectProjects unit && npx jest src/quests/results/quest-result.resolver.int-spec.ts src/quests/outcomes/study-spell-draw.int-spec.ts src/quests/outcomes/spell-learning.int-spec.ts src/quests/quests.resolver.int-spec.ts src/quests/guided/guided-mission.resolver.int-spec.ts test/app.int-spec.ts --selectProjects integration --runInBand && npx tsc --noEmit -p tsconfig.json && git diff --exit-code src/schema.gql && test "$(awk '/^type QuestResult \{/,/^\}/' src/schema.gql | grep -c '^  spellResearchFailed: Boolean!$')" = 1 && test "$(awk '/^type QuestResult \{/,/^\}/' src/schema.gql | grep -c '^  spellFound: Spell$')" = 1 && test "$(awk '/^type QuestPrizes \{/,/^\}/' src/schema.gql | grep -c '^  spellDraw: Boolean!$')" = 1` | ✅ | ✅ green |
| 24-17-03 | 17 | 17 | BE-ORIGIN-17 | — | N/A | docs | `grep -qF -- "- [x] 24-17-PLAN.md" .planning/ROADMAP.md && grep -q "Plan: 17 of 18" .planning/STATE.md && test -z "$(git status --short)"` | ✅ | ✅ green |
| 24-18-01 | 18 | 18 | BE-ORIGIN-13..17 | T-24-62, T-24-63, T-24-64 | SDL rigenerato e confrontato, handler invariati, nessun segreto | unit + int (gate) | `npx tsc --noEmit -p tsconfig.json && npx jest --selectProjects unit && npx jest test/app.int-spec.ts test/authz/authorization-matrix.int-spec.ts --selectProjects integration --runInBand && git diff --exit-code src/schema.gql && test "$(git diff 40916ccd -- src/schema.gql | grep -cE '^\+[^+]')" = 6 && test "$(git diff 40916ccd -- src/schema.gql | grep -cE '^-[^-]')" = 0 && test "$(grep -c 'researchResult' src/schema.gql)" = 0 && test -z "$(git status --short)"` | ⬜ | ⬜ pending |
| 24-18-02 | 18 | 18 | BE-ORIGIN-18 | T-24-65 | requisiti chiusi solo dopo il gate verde | docs | `F=.planning/phases/24-origini-delle-magie-quest-void-e-shamanic/BACKEND-NOTES.md && test "$(grep -cE '^## [0-8]\.' $F)" = 9 && test "$(grep -cE '^### 8\.(10|[1-9]) ' $F)" = 10 && grep -q "learningSpell: Spell" $F && grep -q "spellResearchSucceeded" $F && grep -q "spellDraw: Boolean!" $F && grep -q "spellFound: Spell" $F && grep -q "1 800 000" $F && test "$(grep -ciE 'mongo(db)?(\+srv)?:/{2}' $F)" = 0 && test "$(grep -cE '\- \[x\] \*\*BE-ORIGIN-(0[1-9]|1[0-8])\*\*' .planning/REQUIREMENTS.md)" = 18 && grep -q "nyquist_compliant: true" .planning/phases/24-origini-delle-magie-quest-void-e-shamanic/24-VALIDATION.md && grep -qF -- "- [x] 24-18-PLAN.md" .planning/ROADMAP.md && grep -q "Plan: 18 of 18" .planning/STATE.md && test -z "$(git status --short)"` | ⬜ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Nessun framework da installare; mancano solo le spec e gli appoggi nuovi, ognuno creato (RED) dal task che lo usa (RESEARCH «Validation Architecture», più gli emendamenti del 2026-11-15):

- [x] `src/models/enums/spell-origin.enum.spec.ts` — valori sul filo delle tre origini (BE-ORIGIN-03, task 24-02-01)
- [x] `src/spells/spell-fields.int-spec.ts` — lo schema conserva e valida origine, livello minimo e lore; il filo li serve (BE-ORIGIN-03/04/12, task 24-02-02, 24-05-01, 24-08-01)
- [x] `test/fixtures/spell.fixture.ts` — `origin`, `minLevelToLearn` (condiviso, task 24-02-02; via `minXpToLearn` nel task 24-05-01)
- [x] `src/spells/spell-catalogue.reporter.spec.ts` — reporter d'avvio delle magie non servibili (BE-ORIGIN-04, task 24-05-02)
- [x] `src/quests/spell-schools.spec.ts` — tabella tipo → origine (BE-ORIGIN-07, task 24-06-01)
- [x] `test/quests/generation-world.ts` — opzione `cityTypes` per una città `necrorianCity` (BE-ORIGIN-09, task 24-09-02)
- [x] `src/migrations/spell-origins/spell-origins.boot.spec.ts` e `spell-fields.step.spec.ts` — boot e regola pura del migratore (BE-ORIGIN-10, task 24-10-01)
- [x] `src/migrations/spell-origins/spell-fields.step.int-spec.ts` e `quest-type.step.int-spec.ts` — passi del migratore sul `MongoMemoryReplSet` (BE-ORIGIN-10, task 24-10-02, 24-10-03)

Spec esistenti che vanno RED per scelta e si riscrivono nel piano che cambia il comportamento (RESEARCH §Q2, §Q3, §Q5): `cities/city-size.spec.ts` (conteggi 14 / 9 / 13), `characters/creation/race-traits.spec.ts`, `starting-cities.reporter.spec.ts`, `starting-location.service.int-spec.ts`, `character-creation.resolver.int-spec.ts` (24-01); le spec che citano `minXpToLearn` (24-03, 24-04, 24-05); le tabelle esaustive `quest-lanes.spec.ts` e `quest-eligibility.spec.ts` e ogni spec col tipo `magic` (24-06).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Boot reale dal ramo col migratore: righe «Origini delle magie, …», seconda corsa a zero, rimozione del migratore | BE-ORIGIN-10 | database reale e build vietati agli esecutori | runbook di `BACKEND-NOTES.md` §4, a cura dell'orchestratore (backup prima del boot) |
| Contenuto a DB: origini delle 96 magie, magie nuove, lore d'origine e collegamenti, tre quest nuove, heal e negozi da città delle due capitali, lore delle tre città | BE-ORIGIN-03, BE-ORIGIN-08, BE-ORIGIN-12 | contenuto fuori dal repo, dopo la revisione dell'utente | script dell'orchestratore fuori dal repo (`BACKEND-NOTES.md` §5); WARN `Magie: …` atteso assente al riavvio |
| Flusso completo con la FE Phase 23 (mappa con le tre città, origine e livello nel Diario, quest di scuola, lore dell'origine, Necrorian, opzioni dell'oste, nascita nelle capitali) | BE-ORIGIN-01..12 | integrazione FE + BE su device | UAT guidata dall'orchestratore, un passo per messaggio (`BACKEND-NOTES.md` §7) |
| Tempi di apprendimento a DB (D-27), riavvio dal ramo, UAT della ricerca e dell'apprendimento con la FE | BE-ORIGIN-13..17 | database reale, build e device vietati agli esecutori | BACKEND-NOTES.md §8, a cura dell'orchestratore |

Stato delle tre verifiche manuali: **da eseguire** (a cura dell'orchestratore dopo l'ultimo piano).

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 180s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-11-16
