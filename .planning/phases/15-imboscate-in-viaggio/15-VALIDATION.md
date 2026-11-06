---
phase: 15
slug: imboscate-in-viaggio
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-11-06
---

# Phase 15 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 30 + ts-jest, progetti `unit` (`*.spec.ts`) e `integration` (`*.int-spec.ts`, `MongoMemoryReplSet` condiviso da `test/setup/global-setup.ts`; Redis effimero solo per `ambush.processor.int-spec.ts`) |
| **Config file** | `package.json` §`jest` (progetti, `coverageThreshold` per cartella: `./src/travel/` 97/84/98, che copre anche `src/travel/ambush/`) |
| **Quick run command** | `npx jest src/travel/ambush --selectProjects unit` (≈ 2–4 s) |
| **Integration mirata** | `npx jest <percorsi> --selectProjects integration --runInBand` (es. `src/travel/ambush/ambush-resolution.int-spec.ts`) |
| **Boot reale / SDL** | `npx jest test/app.int-spec.ts --selectProjects integration --runInBand && git diff --exit-code src/schema.gql` |
| **Full suite command** | `npx tsc --noEmit -p tsconfig.json && npm run test:cov` (solo nel piano 11; ripiego senza coverage + coverage per cartella se supera i 600 s del tool) |
| **Estimated runtime** | unit ≈ 5 s; integration mirata 6–60 s; `npm run test:cov` ≈ 9–10 min |

---

## Sampling Rate

- **After every task commit:** la spec mirata del task (unit o integration `--runInBand`) + `npx tsc --noEmit -p tsconfig.json` + grep dei trailer = 0
- **After every plan wave:** le spec della cartella toccata (`src/travel/ambush`, `src/travel`, `src/quests/generation`, `src/quests/outcomes`, `src/roads`, `src/push`), boot reale nei piani che toccano lo SDL o i moduli (03, 07, 08, 09)
- **Before `/gsd-verify-work`:** `npm run test:cov` (o ripiego) verde con le soglie, boot reale verde, SDL con la sola riga tolta dichiarata (piano 11)
- **Max feedback latency:** 60 s per task (le int-spec della risoluzione e del ciclo completo)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 15-01-01 | 01 | 1 | BE-AMBUSH-01 | T-15-01, T-15-02 | fuso opzionale validato al boot, messaggio senza il valore, nessun `process.env.` fuori da `src/config/` | unit | `npx jest src/config --selectProjects unit` | ✅ | ✅ green |
| 15-01-02 | 01 | 1 | BE-AMBUSH-01, BE-AMBUSH-03, BE-AMBUSH-04 | T-15-03 | costanti pinnate, livelli fuori tabella clampati, nessun caso né orologio nel modulo | unit | `npx jest src/travel/ambush --selectProjects unit` | ✅ | ✅ green |
| 15-01-03 | 01 | 1 | BE-AMBUSH-01 | — | N/A (bookkeeping) | doc | `grep -qF -- "- [x] 15-01-PLAN.md" .planning/ROADMAP.md` | ✅ | ✅ green |
| 15-02-01 | 02 | 2 | BE-AMBUSH-03 | — | refactor senza cambi: spec di `RoadsService` verdi | unit + integration | `npx jest src/roads/game-distance.spec.ts --selectProjects unit && npx jest src/roads --selectProjects integration --runInBand` | ✅ | ✅ green |
| 15-02-02 | 02 | 2 | BE-AMBUSH-01, BE-AMBUSH-05 | T-15-04, T-15-05 | sorteggio limitato, nessun tiro sotto soglia, mai `at ≥ endTime`, punto identico al FE | unit | `npx jest src/travel/ambush --selectProjects unit` | ✅ | ✅ green |
| 15-02-03 | 02 | 2 | BE-AMBUSH-01 | — | N/A (bookkeeping) | doc | `grep -qF -- "- [x] 15-02-PLAN.md" .planning/ROADMAP.md` | ✅ | ✅ green |
| 15-03-01 | 03 | 3 | BE-AMBUSH-01 | T-15-06 | campi interni senza `@Field`, `type ActiveTravel` invariato al boot | unit + boot | `npx jest src/migrations src/models --selectProjects unit && npx jest test/app.int-spec.ts --selectProjects integration --runInBand && git diff --exit-code src/schema.gql` | ✅ (casi nuovi) | ✅ green |
| 15-03-02 | 03 | 3 | BE-AMBUSH-02 | T-15-08 | dati del job validati, jobId deterministico senza `:` | unit | `npx jest src/travel/ambush src/travel/travel-scheduler.service.spec.ts --selectProjects unit` | ✅ | ✅ green |
| 15-03-03 | 03 | 3 | BE-AMBUSH-01, BE-AMBUSH-07 | T-15-06, T-15-07, T-15-09 | sorteggio fuori dal callback, anteprime senza tiri, filo identico | integration | `npx jest src/travel src/quests/acceptance --selectProjects integration --runInBand` | ✅ (casi nuovi) | ✅ green |
| 15-03-04 | 03 | 3 | BE-AMBUSH-01 | — | N/A (bookkeeping) | doc | `grep -qF -- "- [x] 15-03-PLAN.md" .planning/ROADMAP.md` | ✅ | ✅ green |
| 15-04-01 | 04 | 4 | BE-AMBUSH-03 | T-15-11 | ordine dei tiri invariato, animali esclusi per default dalle quest | unit + integration | `npx jest src/quests/generation --selectProjects unit && npx jest test/quests --selectProjects integration --runInBand` | ✅ (casi nuovi) | ✅ green |
| 15-04-02 | 04 | 4 | BE-AMBUSH-03 | T-15-10 | mai leggendari, fascia del livello come tetto | unit | `npx jest src/travel/ambush --selectProjects unit` | ✅ | ✅ green |
| 15-04-03 | 04 | 4 | BE-AMBUSH-03, BE-AMBUSH-04 | T-15-12 | catalogo estratto senza cambi, WARN coi soli id | unit + integration | `npx jest src/quests/outcomes --selectProjects unit && npx jest src/quests/outcomes --selectProjects integration --runInBand` | ✅ (casi nuovi) | ✅ green |
| 15-04-04 | 04 | 4 | BE-AMBUSH-03 | — | N/A (bookkeeping) | doc | `grep -qF -- "- [x] 15-04-PLAN.md" .planning/ROADMAP.md` | ✅ | ✅ green |
| 15-05-01 | 05 | 5 | BE-AMBUSH-05 | T-15-13, T-15-14 | un solo Dijkstra, null invece di eccezioni, parità per id | integration | `npx jest src/roads --selectProjects integration --runInBand` | ✅ (casi nuovi) | ✅ green |
| 15-05-02 | 05 | 5 | BE-AMBUSH-05 | — | velocità pubblica invariata nel comportamento | integration | `npx jest src/travel/travel-planning.int-spec.ts --selectProjects integration --runInBand` | ✅ (casi nuovi) | ✅ green |
| 15-05-03 | 05 | 5 | BE-AMBUSH-05 | — | N/A (bookkeeping) | doc | `grep -qF -- "- [x] 15-05-PLAN.md" .planning/ROADMAP.md` | ✅ | ✅ green |
| 15-06-01 | 06 | 6 | BE-AMBUSH-02, BE-AMBUSH-04 | T-15-15, T-15-16 | identità riaffermata, HP clampati, titolo mai scritto | unit | `npx jest src/travel/ambush --selectProjects unit` | ❌ W0 | ⬜ pending |
| 15-06-02 | 06 | 6 | BE-AMBUSH-02, BE-AMBUSH-03, BE-AMBUSH-04 | T-15-15, T-15-17, T-15-18, T-15-19 | un solo effetto per imboscata, monete solo via wallet in sessione, caso fuori dal callback, nessun push in vittoria | integration | `npx jest src/travel/ambush src/quests/outcomes --selectProjects integration --runInBand` | ❌ W0 | ⬜ pending |
| 15-06-03 | 06 | 6 | BE-AMBUSH-04 | — | N/A (bookkeeping) | doc | `grep -qF -- "- [x] 15-06-PLAN.md" .planning/ROADMAP.md` | ✅ | ⬜ pending |
| 15-07-01 | 07 | 7 | BE-AMBUSH-05 | T-15-24 | categoria push additiva nello SDL, enum pinnato in `push.exception.spec.ts` | unit + boot | `npx jest src/push --selectProjects unit && npx jest test/app.int-spec.ts src/push --selectProjects integration --runInBand && git diff --exit-code src/schema.gql` | ✅ (RED naturale) | ⬜ pending |
| 15-07-02 | 07 | 7 | BE-AMBUSH-05 | T-15-22, T-15-23 | HP ≥ 1, nessun `awaitingAid`, nessun costo né sorteggio sulla deviazione, ripieghi C7 | unit | `npx jest src/travel/ambush --selectProjects unit` | ❌ W0 | ⬜ pending |
| 15-07-03 | 07 | 7 | BE-AMBUSH-05 | T-15-20, T-15-21 | push solo al proprietario dopo il commit, posto liberato in sessione | integration | `npx jest src/travel/ambush --selectProjects integration --runInBand` | ✅ (casi nuovi) | ⬜ pending |
| 15-07-04 | 07 | 7 | BE-AMBUSH-05 | — | N/A (bookkeeping) | doc | `grep -qF -- "- [x] 15-07-PLAN.md" .planning/ROADMAP.md` | ✅ | ⬜ pending |
| 15-08-01 | 08 | 8 | BE-AMBUSH-02 | T-15-27 | indice dello sweep verificato al boot | integration + unit | `npx jest src/mongo/sweep-index.verifier.int-spec.ts --selectProjects integration --runInBand && npx jest src/travel/ambush src/models --selectProjects unit` | ✅ (RED prima) | ⬜ pending |
| 15-08-02 | 08 | 8 | BE-AMBUSH-02 | T-15-25, T-15-26, T-15-28 | job malformato/anticipato ignorato, fail-open al terzo errore, log col solo codice, `TravelModule` senza `AmbushModule` | unit + integration + boot | `npx jest src/travel/ambush --selectProjects unit && npx jest src/travel/ambush test/app.int-spec.ts --selectProjects integration --runInBand && git diff --exit-code src/schema.gql` | ❌ W0 | ⬜ pending |
| 15-08-03 | 08 | 8 | BE-AMBUSH-02 | T-15-25 | job idempotente per jobId su Redis reale accanto a `complete` | integration (Redis) | `npx jest src/travel/ambush/ambush.processor.int-spec.ts src/travel/travel-completion.processor.int-spec.ts --selectProjects integration --runInBand` | ❌ W0 | ⬜ pending |
| 15-08-04 | 08 | 8 | BE-AMBUSH-02 | — | N/A (bookkeeping) | doc | `grep -qF -- "- [x] 15-08-PLAN.md" .planning/ROADMAP.md` | ✅ | ⬜ pending |
| 15-09-01 | 09 | 9 | BE-AMBUSH-06 | T-15-32, T-15-33 | SDL con la sola riga tolta dichiarata, legacy letto `quest` | unit + boot | `npx jest src/migrations src/models --selectProjects unit && npx jest test/app.int-spec.ts src/quests/results src/quests/outcomes/aid-timeout.int-spec.ts src/quests/generation --selectProjects integration --runInBand && git diff --exit-code src/schema.gql` | ✅ (RED prima) | ⬜ pending |
| 15-09-02 | 09 | 9 | BE-AMBUSH-06 | T-15-29, T-15-30, T-15-31 | completamento che aspetta l'imboscata, report nella stessa transazione, `_id` pre-generato | unit + integration | `npx jest src/travel --selectProjects unit && npx jest src/travel --selectProjects integration --runInBand` | ✅ (casi nuovi) | ⬜ pending |
| 15-09-03 | 09 | 9 | BE-AMBUSH-02, BE-AMBUSH-06 | T-15-30 | teleport transazionale, imboscata pendente rimossa, rifiuto invariato a corsia occupata | integration | `npx jest src/travel --selectProjects integration --runInBand` | ✅ (casi nuovi) | ⬜ pending |
| 15-09-04 | 09 | 9 | BE-AMBUSH-06 | — | N/A (bookkeeping) | doc | `grep -qF -- "- [x] 15-09-PLAN.md" .planning/ROADMAP.md` | ✅ | ⬜ pending |
| 15-10-01 | 10 | 10 | BE-AMBUSH-04, BE-AMBUSH-06, BE-AMBUSH-07 | T-15-34, T-15-35, T-15-36 | subscription owner-only, un solo effetto sotto concorrenza, filo identico in ogni passo | integration | `npx jest src/travel/ambush/ambush-lifecycle.int-spec.ts --selectProjects integration --runInBand` | ❌ W0 | ⬜ pending |
| 15-10-02 | 10 | 10 | BE-AMBUSH-01, BE-AMBUSH-02, BE-AMBUSH-03, BE-AMBUSH-05, BE-AMBUSH-07 | T-15-35 | trigger duplicati/obsoleti no-op, teleport che consegna, push solo in sconfitta | integration | `npx jest src/travel/ambush --selectProjects integration --runInBand` | ❌ W0 | ⬜ pending |
| 15-10-03 | 10 | 10 | BE-AMBUSH-07 | — | N/A (bookkeeping) | doc | `grep -qF -- "- [x] 15-10-PLAN.md" .planning/ROADMAP.md` | ✅ | ⬜ pending |
| 15-11-01 | 11 | 11 | BE-AMBUSH-01..07 | T-15-37, T-15-38, T-15-39, T-15-40 | suite e soglie verdi, SDL con l'eccezione dichiarata, nessun segreto né trailer, moduli separati | full + boot | `npx tsc --noEmit -p tsconfig.json && npm run test:cov && npx jest test/app.int-spec.ts --selectProjects integration --runInBand && git diff --exit-code src/schema.gql` (più i grep di produzione del piano 11: determinismo e `process.env.` con le spec escluse) | ✅ | ⬜ pending |
| 15-11-02 | 11 | 11 | BE-AMBUSH-01..07 | — | N/A (firma) | doc | `grep -q "nyquist_compliant: true" .planning/phases/15-imboscate-in-viaggio/15-VALIDATION.md` | ✅ | ⬜ pending |
| 15-11-03 | 11 | 11 | BE-AMBUSH-07 | — | N/A (bookkeeping) | doc | `grep -qF -- "- [x] 15-11-PLAN.md" .planning/ROADMAP.md` | ✅ | ⬜ pending |
| 15-12-01 | 12 | 12 | BE-AMBUSH-07 | T-15-41, T-15-42 | handoff senza URI né valori reali, SDL verbatim | doc | `grep -qF "enum QuestResultKind" .planning/phases/15-imboscate-in-viaggio/BACKEND-NOTES.md` | ❌ (nuovo) | ⬜ pending |
| 15-12-02 | 12 | 12 | BE-AMBUSH-01..07 | T-15-42 | emendamenti solo in coda, requisiti completi | doc | `grep -cE '\- \[x\] \*\*BE-AMBUSH-0[1-7]\*\*' .planning/REQUIREMENTS.md` | ✅ | ⬜ pending |
| 15-12-03 | 12 | 12 | BE-AMBUSH-07 | — | N/A (bookkeeping) | doc | `grep -qF -- "- [x] 15-12-PLAN.md" .planning/ROADMAP.md` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Nessun framework da installare: l'harness esistente (Jest, replica set, Redis effimero, `createAuthTestApp`, `createOutcomeHarness`, fixture `persist*`) copre la fase. I file di test nuovi nascono nel passo RED del task che li usa (TDD del repo), non in una wave separata:

- [ ] `src/config/ambush-config.spec.ts` — BE-AMBUSH-01 (piano 01, Task 1)
- [ ] `src/travel/ambush/ambush-rules.spec.ts`, `level-bands.spec.ts`, `ambush-clock.spec.ts` — BE-AMBUSH-01/03/04 (piano 01, Task 2)
- [ ] `src/roads/game-distance.spec.ts`, `src/travel/ambush/ambush-draw.spec.ts`, `ambush-point.spec.ts` — BE-AMBUSH-01/05 (piano 02)
- [ ] `test/travel/ambush-world.ts` (strade ≥ 10 km, quattro città marker, POI di zona e di quest) — piano 03, Task 3; esteso con `persistAmbushEnemies` e `persistTraveller` nel piano 06
- [ ] `src/travel/ambush/ambush-job.spec.ts`, `ambush-planner.service.spec.ts` — BE-AMBUSH-02 (piano 03, Task 2)
- [ ] `src/travel/ambush/ambush-enemies.spec.ts` — BE-AMBUSH-03 (piano 04)
- [ ] `src/travel/ambush/ambush.updates.spec.ts`, `ambush-plan.spec.ts`, `ambush-resolution.int-spec.ts` + opzione `overrides` di `createOutcomeHarness` — BE-AMBUSH-02/04 (piano 06)
- [ ] `src/travel/ambush/ambush-detour.spec.ts` — BE-AMBUSH-05 (piano 07)
- [ ] `src/travel/ambush/ambush.processor.spec.ts`, `ambush-sweeper.int-spec.ts`, `ambush.processor.int-spec.ts` — BE-AMBUSH-02 (piano 08)
- [ ] `src/travel/ambush/ambush-results.spec.ts` — BE-AMBUSH-06 (piano 09)
- [ ] `src/travel/ambush/ambush-lifecycle.int-spec.ts` — BE-AMBUSH-07 (piano 10)
- [ ] RED a stringa esatta: `test/app.int-spec.ts` (`'  ambushDefeat\n'` nel piano 07; `type QuestResult`, `type AmbushCity`, `type AmbushReport`, `enum QuestResultKind` nel piano 09), `src/push/push-events.spec.ts` (`BUILDERS: Record<PushEventType, …>`) e `src/push/push.exception.spec.ts` (`Object.values(PushEventType)`, piano 07), `src/mongo/sweep-index.verifier.int-spec.ts` e `src/models/sweep-indexes.schema.spec.ts` (indice D-19, piano 08), `test/quests/quest-result.fixture.ts` con `kind: 'quest'` (piano 09) — D-23

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Imboscata vinta, sconfitta con deviazione e carosello di due report sul device con il DB di sviluppo | BE-AMBUSH-07 | UAT su device della FE Phase 16 dopo la merge: dati reali (strade, nemici, personaggi) fuori dal repo | l'orchestratore semina `status.activeTravel.ambush { at, km, attempts: 0 }` con `at` nel passato (script fuori dal repo, `BACKEND-NOTES.md` §6), toglie armi e magie per forzare la sconfitta e segue dal FE banner di sconfitta, pedina che riparte dal punto e carosello all'arrivo |
| Push `ambushDefeat` reale via FCM | BE-AMBUSH-05 | richiede il progetto Firebase e un device registrato | sconfitta forzata come sopra con l'app in background: notifica «Imboscata!» con il nome della città, tap → Mappa |

Tutto il resto ha verifica automatica.

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
