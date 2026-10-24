---
phase: 9
slug: combat-result-admin-outcomes
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-10-24
---

# Phase 9 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 30 + ts-jest, projects `unit` (`*.spec.ts`) / `integration` (`*.int-spec.ts`, `MongoMemoryReplSet` condiviso via `test/setup/global-setup.ts`; Redis effimero da `test/setup/redis.ts`, `redis:7` in CI) |
| **Config file** | `package.json` → `jest.projects` |
| **Quick run command** | `npx jest src/quests src/travel src/economy src/characters src/authz src/gameRules src/config src/models src/push --selectProjects unit` |
| **Integration command** | `npx jest <int-spec del task> --selectProjects integration --runInBand` (mai in background) |
| **Full suite command** | `npm run test:unit && npm run test:int` (`test:int` include `--runInBand`; solo nel piano 09-16) |
| **Estimated runtime** | unit ~5 s; int-spec singolo ~3–20 s (processor con Redis reale ~10–20 s, WS ~5–15 s); `test/app.int-spec.ts` ~10–20 s; suite completa integrazione ~120–150 s stimati |

Baseline misurata (2026-10-24, RESEARCH §Q10): unit **96 suite / 1424 test** (~4 s); integration **57 suite** (~739 test, ~104 s alla misura 08-14).

Trappole di tooling (vincolanti, D-26 / RESEARCH Q10 e Pitfall 1–13): path jest PRIMA di `--selectProjects`; integration sempre `--runInBand`; MAI `npm run lint`: solo `npx prettier --write <file>` + `npx eslint <file>`; file legacy non Prettier-clean (`spell.model.ts`, `enemy.model.ts`, `active-spell.model.ts`, `quest-infos.model.ts`, `character-assets.model.ts`, `injury-type.enum.ts`, `injury-effect-type.enum.ts`, `rarity-type.enum.ts`, `city.model.ts`, `loot-item.model.ts`, `equipment-item.model.ts`) solo importati; `npm run build` come type check; `src/schema.gql` solo dal real boot e committato, diff vs `origin/develop` senza righe rimosse (D-28); letterali vietati nello schema (`kind`, `grade`, `TravelKind`, `concludedAt`, `rescue`, `CombatResolver`); `pubSub.publish` mai atteso; processor test con Redis reale, attesa via polling, `queue.empty()` nell'`afterAll`; `FixedClock` per sweep e scadenze (mai `$$NOW`); collection pre-create (`model.init()`, incluse `questresults` e `pushdevices`) prima delle transazioni; priming dei change stream (`primeQuestResultsChangeStream`, `primePendingRequestsChangeStream`); code `quest-resolution` e `spell-recovery` sovrascritte con `FakeTravelQueue` dove non c'è Redis; ogni harness che monta `QuestOutcomesModule` (o `PendingRequestsModule` da 09-15) usa `QUIET_OUTCOME_OVERRIDES` di `test/quests/outcome-world.ts` (`QUEST_CONFIG` a 0 e, da 09-14, sweeper inerte), salvo la suite dello sweeper.

---

## Sampling Rate

- **After every task commit:** gli spec unit toccati con `--selectProjects unit` + gli int-spec del task con `--selectProjects integration --runInBand` (comando `<automated>` del task)
- **Modello di esecuzione:** SEQUENZIALE sull'albero principale (`workflow.use_worktrees: false`), un piano alla volta in ordine di numero; il piano precedente è committato prima che il successivo inizi (nessuna scrittura concorrente a STATE/ROADMAP/`src/schema.gql`)
- **After every plan wave:** quick run unit + int-spec della wave + `npm run build`; real boot (`test/app.int-spec.ts`) quando la wave tocca schema o montaggi (W1 09-01, W2 09-06, W3 09-07/09-10, W6 09-14, W7 09-15)
- **Before `/gsd-verify-work`:** `npm run test:unit && npm run test:int` verdi (> 96 suite unit, > 57 integration), `npm run build`, lint filtrato a 0 righe, `npx eslint` + `npx prettier --check` sui `.ts` toccati, `git diff --exit-code src/schema.gql`, invarianti di 09-16 Task 1
- **Max feedback latency:** ≤ 60 s per spec singola; eccezioni dichiarate: task di real boot (09-01-T1, 09-06-T3, 09-07-T2, 09-10-T3, 09-14-T3, 09-15-T3), processor con Redis (09-14-T1) e gate 09-16

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 09-01-T1 | 09-01 | 1 | BE-COMBAT-01/03 (D-06, D-07, D-08, D-17, D-28) | T-09-01, T-09-02, T-09-03 | `awaitingAid` mai input; `concludedAt`/`rescue` mai sul filo; SDL additivo; `Spell` registrato in `QuestsModule` (nessun `MissingSchemaError` su `quests`) | unit + integration (real boot) | `npx jest src/models/character/awaiting-aid.schema.spec.ts src/models/quest/quest-outcome-fields.schema.spec.ts src/quests/quest-catalog.populate.spec.ts --selectProjects unit && npx jest src/quests/quests.resolver.int-spec.ts --selectProjects integration --runInBand && npx jest test/app.int-spec.ts --selectProjects integration --runInBand && git diff --exit-code src/schema.gql` | ❌ W0 → spec create nel task (RED) | ✅ green |
| 09-01-T2 | 09-01 | 1 | BE-COMBAT-01, BE-COMBAT-03, BE-ADMIN-02 (D-19, C2, D-03, D-04) | T-09-04, T-09-06 | ref castati, enum di esito stabile, nessun `kind` | unit | `npx jest src/models/quest-result/quest-result.schema.spec.ts --selectProjects unit && npm run build` | ❌ W0 → `quest-result.schema.spec.ts` (RED) | ✅ green |
| 09-01-T3 | 09-01 | 1 | BE-COMBAT-01 (D-13, C3) | T-09-05 | slot dal rango mage nel filtro `$expr` e nel virtual | unit + integration | `npx jest src/models/character src/characters/spells test/fixtures/fixtures.spec.ts --selectProjects unit && npx jest src/characters/spells/equip-spell.int-spec.ts --selectProjects integration --runInBand` | ✅ estende le spec esistenti | ✅ green |
| 09-02-T1 | 09-02 | 1 | BE-COMBAT-01 (D-11, D-12, D-14) | T-09-07, T-09-09 | XP clampata, HP in 1..max, titolo solo esatto | unit | `npx jest src/quests/outcomes/progression --selectProjects unit` | ❌ W0 (RED) | ✅ green |
| 09-02-T2 | 09-02 | 1 | BE-COMBAT-03, BE-ADMIN-02 (D-12, codici) | T-09-08, T-09-10 | una sola fonte degli HP iniziali; messaggi costanti | unit + integration | `npx jest src/characters/creation src/gameRules --selectProjects unit && npx jest src/characters/creation/character-creation.resolver.int-spec.ts --selectProjects integration --runInBand` | ✅ estende le spec | ✅ green |
| 09-03-T1 | 09-03 | 1 | BE-COMBAT-01 (D-16, D-17) | T-09-11..T-09-13 | premi validati, orfani scartati, max un oggetto | unit | `npx jest src/quests/outcomes/rewards --selectProjects unit` | ❌ W0 → crea `test/quests/sequence-chance.ts` e le spec (RED) | ✅ green |
| 09-03-T2 | 09-03 | 1 | BE-COMBAT-03 (D-08, D-10, C5) | T-09-14, T-09-15 | aid mai ripetibile né a pagamento; timeout sospeso con soccorritore | unit | `npx jest src/quests/outcomes/aid --selectProjects unit` | ❌ W0 (RED) | ✅ green |
| 09-03-T3 | 09-03 | 1 | BE-COMBAT-03 (D-02, D-15) | T-09-16 | fattori ≥ 0,1, formula confinata | unit | `npx jest src/quests/outcomes/injuries --selectProjects unit` | ❌ W0 (RED) | ✅ green |
| 09-04-T1 | 09-04 | 2 | BE-COMBAT-03 (D-02, Pitfall 10) | T-09-18 | danni malformati normalizzati, nessuna eccezione | unit | `npx jest src/quests/outcomes/combat --selectProjects unit` | ❌ W0 (RED) | ✅ green |
| 09-04-T2 | 09-04 | 2 | BE-COMBAT-03 (D-02, D-05, D-07) | T-09-17, T-09-19, T-09-20 | HP sempre in [1, max], RNG solo iniettato | unit + integration (fixture) | `npx jest src/quests/outcomes/combat test/fixtures/fixtures.spec.ts --selectProjects unit && npx jest test/fixtures/fixtures.int-spec.ts --selectProjects integration --runInBand` | ❌ W0 → crea `test/quests/scripted-combat-resolver.ts`, `test/fixtures/enemy.fixture.ts` | ✅ green |
| 09-05-T1 | 09-05 | 3 | BE-COMBAT-01/03, BE-ADMIN-02 (D-07, D-11..D-17, D-21) | T-09-21..T-09-25 | filtro con corsia e XP attesa; clamp; nessun premio al fallito | unit | `npx jest src/quests/outcomes/outcome-plan.spec.ts --selectProjects unit` | ❌ W0 (RED) | ✅ green |
| 09-05-T2 | 09-05 | 3 | BE-COMBAT-03 (D-05, D-06, D-08, D-09) | T-09-26 | quest conclusa con ≥ 1 vincitore, aid sempre conclusa | unit | `npx jest src/quests/outcomes --selectProjects unit` | ❌ W0 (RED) | ✅ green |
| 09-06-T1 | 09-06 | 2 | BE-COMBAT-02 (D-20, C10) | T-09-27 | owner-only per utente, nessun bypass innkeeper, 403/404 distinti (anche nel caso unit di `character-access.policy.spec.ts`) | unit + integration | `npx jest src/authz --selectProjects unit && npx jest src/authz/ownership/quest-result-access.int-spec.ts --selectProjects integration --runInBand` | ❌ W0 → crea `test/quests/quest-result.fixture.ts` e l'int-spec (RED) | ✅ green |
| 09-06-T2 | 09-06 | 2 | BE-COMBAT-01/02 (D-19, D-20) | T-09-27, T-09-29 | risultato popolato, orfani tollerati, leggibile dopo la morte | integration (wire) | `npx jest src/quests/results/quest-result.resolver.int-spec.ts --selectProjects integration --runInBand` | ❌ W0 (RED) | ✅ green |
| 09-06-T3 | 09-06 | 2 | BE-COMBAT-02 (D-20, D-23, Pitfall 3) | T-09-28, T-09-30, T-09-31, T-09-32 | subscription filtrata per utente e personaggio, whitelist enumerate | integration (WS + real boot) | `npx jest src/quests/results --selectProjects integration --runInBand && npx jest test/app.int-spec.ts --selectProjects integration --runInBand && git diff --exit-code src/schema.gql` | ❌ W0 → crea `test/quests/quest-results-change-stream.ts` (RED) | ✅ green |
| 09-07-T1 | 09-07 | 3 | BE-ADMIN-01 (D-22) | T-09-35, T-09-36 | voci incomplete saltate, log senza dati personali | unit + integration | `npx jest src/quests/pending-requests --selectProjects unit && npx jest src/quests/pending-requests/pending-requests.service.int-spec.ts --selectProjects integration --runInBand` | ❌ W0 (RED) | ✅ green |
| 09-07-T2 | 09-07 | 3 | BE-ADMIN-01 (D-22, D-23) | T-09-33, T-09-34 | innkeeper-only su HTTP e WS, ricalcolo single-flight | unit + integration (WS + real boot) | `npx jest src/quests/pending-requests --selectProjects integration --runInBand && npx jest test/app.int-spec.ts --selectProjects integration --runInBand && git diff --exit-code src/schema.gql` | ❌ W0 → crea `test/quests/pending-requests-change-stream.ts` (RED) | ✅ green |
| 09-08-T1 | 09-08 | 2 | BE-COMBAT-03 (D-07, D-15) | T-09-37, T-09-41 | guard nel filtro dell'update, teleport ammesso | unit + integration | `npx jest src/travel --selectProjects unit && npx jest src/travel --selectProjects integration --runInBand` | ✅ estende le spec del viaggio | ✅ green |
| 09-08-T2 | 09-08 | 2 | BE-COMBAT-03 (D-06, D-07, D-17, C9) | T-09-37..T-09-40 | quest concluse invisibili e non accettabili, nessuna scrittura sui rifiuti | unit + integration | `npx jest src/quests --selectProjects unit && npx jest src/quests --selectProjects integration --runInBand` | ✅ estende le spec | ✅ green |
| 09-09-T1 | 09-09 | 2 | BE-COMBAT-03 (D-18, C4) | — | test infra: personaggi in città nei casi di successo | integration | `npx jest src/economy src/characters/characters-ownership.int-spec.ts src/characters/archived-character-visibility.int-spec.ts --selectProjects integration --runInBand` | ❌ W0 → crea `test/economy/place-in-city.ts` | ✅ green |
| 09-09-T2 | 09-09 | 2 | BE-COMBAT-03 (D-18) | T-09-42..T-09-44 | negozio solo sul marker, guard riaffermata nel filtro | integration (wire + servizio) | `npx jest src/economy --selectProjects integration --runInBand` | ✅ estende le int-spec (RED) | ✅ green |
| 09-10-T1 | 09-10 | 3 | BE-COMBAT-03 (D-24, Pitfall 2) | T-09-46..T-09-48 | env fail-closed senza valore, dati dei job validati, sola corsia standard | unit | `npx jest src/config src/travel/travel-job.spec.ts src/quests/outcomes/scheduling --selectProjects unit` | ❌ W0 (RED) | ✅ green |
| 09-10-T2 | 09-10 | 3 | BE-COMBAT-03 (D-24) | T-09-45 | accodamento mai bloccante, timeout | unit + integration | `npx jest src/quests/outcomes/scheduling src/travel --selectProjects unit && npx jest src/travel/travel-planning.int-spec.ts src/travel/travel.service.int-spec.ts --selectProjects integration --runInBand` | ❌ W0 (RED) | ✅ green |
| 09-10-T3 | 09-10 | 3 | BE-COMBAT-03 (D-24, C8) | T-09-49 | job solo dopo il commit, mai per story/worldMission | integration + real boot | `npx jest src/quests/acceptance src/travel --selectProjects integration --runInBand && npx jest test/app.int-spec.ts --selectProjects integration --runInBand && git diff --exit-code src/schema.gql` | ✅ estende 8 int-spec | ✅ green |
| 09-11-T1 | 09-11 | 2 | BE-COMBAT-03 (D-09, C1) | T-09-50, T-09-51 | archivio nella sessione del chiamante, nessuna transazione annidata | integration (replSet) | `npx jest src/characters/deletion/character-archiver.int-spec.ts --selectProjects integration --runInBand` | ❌ W0 (RED) | ✅ green |
| 09-11-T2 | 09-11 | 2 | BE-COMBAT-03 (D-09) | T-09-52, T-09-53 | contratto di cancellazione 03.1 invariato | integration | `npx jest src/characters/deletion --selectProjects integration --runInBand` | ✅ estende l'int-spec | ✅ green |
| 09-12-T1 | 09-12 | 4 | BE-COMBAT-02 (D-20, D-21, C7) | T-09-56, T-09-59 | consegna dopo il commit, best-effort | unit | `npx jest src/push src/quests/outcomes --selectProjects unit` | ❌ W0 → crea `test/quests/outcome-world.ts` e `outcome-writer.spec.ts` (RED) | ✅ green |
| 09-12-T2 | 09-12 | 4 | BE-COMBAT-01/03 (D-01, D-11..D-17, D-21, C6) | T-09-54..T-09-58 | idempotenza, anticipo, concorrenza, una push; `deliver` solo dopo il commit e mai su abort (spy, casi 11–12) | integration (replSet) | `npx jest src/quests/outcomes/quest-resolution.service.int-spec.ts --selectProjects integration --runInBand` | ❌ W0 (RED) | ✅ green |
| 09-12-T3 | 09-12 | 4 | BE-COMBAT-03 (D-02, D-06..D-08) | T-09-60 | combattimento solo dalla porta, HP ≥ 1 | integration (replSet) | `npx jest src/quests/outcomes --selectProjects integration --runInBand` | ❌ W0 → `quest-combat.int-spec.ts` (RED) | ✅ green |
| 09-13-T1 | 09-13 | 5 | BE-COMBAT-03 (D-05, D-21, Pitfall 8) | T-09-61, T-09-62 | gruppo risolto una volta sola | unit + integration | `npx jest src/quests/outcomes --selectProjects unit && npx jest src/quests/outcomes --selectProjects integration --runInBand` | ❌ W0 (RED) | ✅ green |
| 09-13-T2 | 09-13 | 5 | BE-COMBAT-01/03 (D-08, D-09, C1) | T-09-63, T-09-64, T-09-66 | morte nella stessa transazione, no-op per l'utente scollegato; nessun side effect su abort (spy, casi 7–8) | integration (replSet) | `npx jest src/quests/outcomes/aid-rescue.int-spec.ts --selectProjects integration --runInBand` | ❌ W0 (RED) | ✅ green |
| 09-13-T3 | 09-13 | 5 | BE-COMBAT-03 (D-10, C5) | T-09-65 | timeout sospeso con soccorritore registrato | integration (replSet) | `npx jest src/quests/outcomes/aid-timeout.int-spec.ts --selectProjects integration --runInBand` | ❌ W0 (RED) | ✅ green |
| 09-14-T1 | 09-14 | 6 | BE-COMBAT-03 (D-24) | T-09-67 | job anticipato o malformato non scrive, mai ri-accodato | integration (Redis reale) | `npx jest src/quests/outcomes/quest-resolution.processor.int-spec.ts --selectProjects integration --runInBand` | ❌ W0 (RED) | ✅ green |
| 09-14-T2 | 09-14 | 6 | BE-COMBAT-03 (D-01, D-03, D-10, D-24) | T-09-68..T-09-71 | sweep solo sulla corsia standard, single-flight | unit + integration | `npx jest src/quests/outcomes --selectProjects unit && npx jest src/quests/outcomes/quest-resolution.sweeper.int-spec.ts --selectProjects integration --runInBand && npx jest src/quests/outcomes --selectProjects integration --runInBand` | ❌ W0 (RED) | ✅ green |
| 09-14-T3 | 09-14 | 6 | BE-COMBAT-03 | — | ciclo di vita montato, SDL invariato | integration (real boot) | `npx jest test/app.int-spec.ts --selectProjects integration --runInBand && git diff --exit-code src/schema.gql` | ✅ estende `test/app.int-spec.ts` | ✅ green |
| 09-15-T1 | 09-15 | 7 | BE-ADMIN-02 (D-04, Open Q 14) | T-09-73 | override limitati a HP/ferite/consumi/magie e al posseduto | unit | `npx jest src/quests/outcomes/gm-overrides.spec.ts --selectProjects unit` | ❌ W0 (RED) | ⬜ pending |
| 09-15-T2 | 09-15 | 7 | BE-COMBAT-01/03, BE-ADMIN-02 (D-03, D-04, D-06, D-14) | T-09-74, T-09-76, T-09-77 | nessuna scrittura con override non valido, completamento concorrente unico | integration (replSet) | `npx jest src/quests/outcomes/gm-completion.service.int-spec.ts --selectProjects integration --runInBand` | ❌ W0 (RED) | ⬜ pending |
| 09-15-T3 | 09-15 | 7 | BE-ADMIN-02 (D-23) | T-09-72, T-09-75 | innkeeper-only, audit con outcome, whitelist enumerata | integration (wire + real boot) | `npx jest src/quests/pending-requests --selectProjects integration --runInBand && npx jest test/app.int-spec.ts --selectProjects integration --runInBand && git diff --exit-code src/schema.gql` | ❌ W0 → `complete-pending-request.resolver.int-spec.ts` (RED) | ⬜ pending |
| 09-16-T1 | 09-16 | 8 | BE-COMBAT-01..03, BE-ADMIN-01..02 (D-26, D-28) | T-09-78..T-09-80 | suite complete, SDL additivo, invarianti | full suite + CI | `npm run test:unit && npm run test:int && npm run build && git diff --exit-code src/schema.gql` | ✅ | ⬜ pending |
| 09-16-T2 | 09-16 | 8 | BE-COMBAT-01..03, BE-ADMIN-01..02 (D-27, D-29) | T-09-81, T-09-82 | handoff senza segreti, comandi dati con placeholder | doc check | vedi `<verify>` del task (grep su BACKEND-NOTES, REQUIREMENTS, VALIDATION, Phase 5 notes) | ❌ → `BACKEND-NOTES.md` creato | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Nessuna wave dedicata: ogni spec nuova nasce RED nel task che la consuma (TDD per task). Helper e file di test creati durante la fase:

- [ ] `src/models/character/awaiting-aid.schema.spec.ts`, `src/models/quest/quest-outcome-fields.schema.spec.ts`, `src/models/quest-result/quest-result.schema.spec.ts` (09-01)
- [x] `src/quests/outcomes/progression/*.spec.ts` (09-02)
- [x] `test/quests/sequence-chance.ts` (fake di `ChanceSource`), `src/quests/outcomes/{rewards,aid,injuries}/*.spec.ts` (09-03)
- [x] `test/quests/scripted-combat-resolver.ts`, `test/fixtures/enemy.fixture.ts` (+ export e casi in `fixtures.spec.ts`/`fixtures.int-spec.ts`), `src/quests/outcomes/combat/*.spec.ts` (09-04)
- [x] `src/quests/outcomes/{outcome-plan,rescue-plan,quest-outcome-plan}.spec.ts` (09-05)
- [x] `test/quests/quest-result.fixture.ts`, `test/quests/quest-results-change-stream.ts`, `src/authz/ownership/quest-result-access.int-spec.ts`, `src/quests/results/*.int-spec.ts` (09-06)
- [x] `test/quests/pending-requests-change-stream.ts`, `src/quests/pending-requests/*.spec.ts` e `*.int-spec.ts` (09-07)
- [x] `test/economy/place-in-city.ts` (09-09)
- [x] `src/config/quest-config.spec.ts`, `src/quests/outcomes/scheduling/*.spec.ts` (09-10)
- [x] `src/characters/deletion/character-archiver.int-spec.ts` (09-11)
- [x] `test/quests/outcome-world.ts`, `src/quests/outcomes/outcome-writer.spec.ts`, `quest-resolution.service.int-spec.ts`, `quest-combat.int-spec.ts` (09-12)
- [x] `src/quests/outcomes/resolution-kind.spec.ts`, `boss-resolution.int-spec.ts`, `aid-rescue.int-spec.ts`, `aid-timeout.int-spec.ts` (09-13)
- [x] `src/quests/outcomes/quest-resolution.processor.int-spec.ts`, `quest-resolution.sweeper.spec.ts`, `quest-resolution.sweeper.int-spec.ts` (09-14)
- [ ] `src/quests/outcomes/gm-overrides.spec.ts`, `gm-completion.service.int-spec.ts`, `src/quests/pending-requests/complete-pending-request.resolver.int-spec.ts` (09-15)
- Framework install: nessuno (stack e harness esistenti, nessuna dipendenza nuova).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Foglio esiti in foreground (subscription) e da push in background, coda di più risultati, popup di morte → creazione personaggio, soccorso con ritorno in città | BE-COMBAT-01/02 (consumo FE) | richiede la FE Phase 9 su device (non ancora esistente) | BACKEND-NOTES §13: checklist UAT dopo il merge della FE Phase 9 |
| Coda del GM live, completamento story/worldMission con override, audit | BE-ADMIN-01/02 (consumo FE) | richiede la FE Phase 10 (pannello admin) | BACKEND-NOTES §9 e §13 |
| `SHOP_NOT_IN_CITY` e `AWAITING_AID` gestiti dalla UI | D-18, D-07 (consumo FE Phase 7) | richiede la FE Phase 7 su device | BACKEND-NOTES §10 |
| Dati di catalogo alla scala nuova (HP 1000, nemici riscalati, 2 ref `infos.enemy` orfani, `prizes.spell` sulle study di Valantar, una quest per tipo) | D-29 | decisione utente: nessuna migrazione né seed | BACKEND-NOTES §12: comandi `mongosh` dopo il deploy |
| Timeout di soccorso reale | D-10 | 7 giorni reali | `mongosh`: retrodatare `status.awaitingAid.since` di 7 giorni e attendere lo sweep (≤ 60 s) |
| Conferma del default C5 (timeout sospeso con un soccorritore registrato) | D-10 | scelta di game design dell'utente | prima della PR; per la lettura letterale togliere `AID_TIMEOUT_REQUIRES_NO_RESCUER` e il test nominato |
| Policy Redis di produzione (`maxmemory-policy`) | D-24 | configurazione dell'infrastruttura | BACKEND-NOTES §15 |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency ≤ 60 s per spec singola (eccezioni dichiarate: task di real boot, processor con Redis, gate 09-16)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
