---
phase: 8
slug: travel-lifecycle-travel-01
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-10-21
---

# Phase 8 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 30 + ts-jest 29, projects `unit` (`*.spec.ts`) / `integration` (`*.int-spec.ts`, `MongoMemoryReplSet` condiviso via `test/setup/global-setup.ts`; Redis effimero da `test/setup/redis.ts`, `redis:7` in CI) |
| **Config file** | `package.json` → `jest.projects` |
| **Quick run command** | `npx jest src/travel src/roads src/quests src/gameRules src/authz src/mongo src/config src/models --selectProjects unit` |
| **Integration command** | `npx jest src/travel src/roads src/quests src/characters/deletion test/app.int-spec.ts --selectProjects integration --runInBand` |
| **Full suite command** | `npm run test:unit && npm run test:int` (`test:int` include `--runInBand`; solo nel piano 08-14) |
| **Estimated runtime** | unit ~4 s; int-spec singolo ~3–20 s (processor con Redis reale ~10–20 s); `test/app.int-spec.ts` ~10–20 s; suite completa integrazione ~90–110 s |

Baseline misurata (2026-10-21, RESEARCH §Validation Architecture, branch pulito su `7f98d0f`): unit **85 suite / 1264 test** verdi (3,4 s); integration **49 suite / 610 test** (ultima misura Phase 7).

Trappole di tooling (vincolanti, D-23 / RESEARCH Pitfall 1–13): path jest PRIMA di `--selectProjects`; integration sempre `--runInBand`, mai in background; MAI `npm run lint`: solo `npx prettier --write <file>` + `npx eslint <file>`; file legacy non Prettier-clean (`src/roads/*`, `pet.model.ts`, `asset-quantity.model.ts`, `quest-prizes.model.ts`, `quests.service.ts`, `quests.module.ts`) formattati in un commit `style(...)` separato prima di toccarli; `npm run build` come type check; `src/schema.gql` solo dal real boot e committato; il diff vs `origin/develop` rimuove esattamente le 5 righe delle tre eccezioni dichiarate (D-20); `roadsService.buildGraph()` DOPO le fixture `Road` (Pitfall 1); `getQueueToken('travel')` sovrascritto con `FakeTravelQueue` dove non c'è Redis (C6); attesa dei job via polling, mai `job.finished()`; `queue.empty()` negli `afterAll` con Redis reale; `FixedClock` per sweep e completamento (mai `$$NOW`); collection pre-create prima delle transazioni (Pitfall 5).

---

## Sampling Rate

- **After every task commit:** gli spec unit toccati con `--selectProjects unit` + il singolo int-spec toccato con `--selectProjects integration --runInBand` (comando `<automated>` del task)
- **Modello di esecuzione:** SEQUENZIALE sull'albero principale (`workflow.use_worktrees: false`), un piano alla volta in ordine di wave; il piano precedente è committato prima che il successivo inizi (nessuna scrittura concorrente a STATE/ROADMAP/`src/schema.gql`); i `git diff --exit-code src/schema.gql` dopo 08-01 confrontano lo schema già committato
- **After every plan wave:** quick run unit + integration command di fase (solo i file già esistenti a quella wave) + `npm run build`
- **Eccezione nota:** fra 08-01 (Task 2) e 08-06 le int-spec di `src/quests/acceptance/` scrivono ancora `party`/`registrations` e non sono eseguite (le riscrive 08-06)
- **Before `/gsd-verify-work`:** `npm run test:unit && npm run test:int` verdi (> 85 suite unit, > 49 integration), `npm run build`, lint filtrato a 0 righe, `npx eslint` + `npx prettier --check` sui `.ts` toccati, `git diff --exit-code src/schema.gql`, invarianti di 08-14 Task 1
- **Max feedback latency:** ≤ 60 s per spec singola; i task di boot reale (08-01, 08-10-T2, 08-12-T2, 08-13-T2: più int-spec + real boot + build + eslint) e il gate finale 08-14 fanno eccezione dichiarata (suite completa solo in 08-14)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 08-01-T1 | 08-01 | 1 | BE-TRAVEL-01 (D-08, D-10, D-14, D-15, D-25) | T-08-01, T-08-03, T-08-05 | `activeTravel` solo server-side, `kind` mai sul filo, `to` castato | unit + integration (real boot) | `npx jest src/models/character/active-travel.schema.spec.ts src/models/quest-lanes.schema.spec.ts --selectProjects unit && npx jest test/app.int-spec.ts --selectProjects integration --runInBand && npm run build` | ❌ W0 → `active-travel.schema.spec.ts` creato nel task (RED) | ⬜ pending |
| 08-01-T2 | 08-01 | 1 | BE-QUEST-03 (D-28, D-20) | T-08-02, T-08-04, T-08-06 | diff SDL = 5 righe dichiarate; slot con `count ≥ 1` e rango dell'enum | unit + integration (real boot) | `npx jest src/models/quest-lanes.schema.spec.ts test/fixtures/fixtures.spec.ts --selectProjects unit && npx jest test/app.int-spec.ts --selectProjects integration --runInBand` | ✅ riscrive `quest-lanes.schema.spec.ts` | ⬜ pending |
| 08-02-T1 | 08-02 | 1 | BE-TRAVEL-02/04 (D-19) | T-08-07, T-08-10 | codici stabili con messaggi fissi; `refIdOf` solo esadecimale canonico | unit | `npx jest src/gameRules src/authz/resource-not-found.exception.spec.ts src/mongo/document-id.spec.ts --selectProjects unit` | ✅ estende le spec | ⬜ pending |
| 08-02-T2 | 08-02 | 1 | BE-QUEST-03 (D-27, D-29, D-32) | T-08-08, T-08-09 | slot invalidi ⇒ `invalid`; `$expr` specchio di `hasSeatFor`; caso canonico nominato | unit | `npx jest src/quests/acceptance/quest-capacity.spec.ts --selectProjects unit` | ❌ W0 → `quest-capacity.spec.ts` creato nel task (RED) | ⬜ pending |
| 08-03-T1 | 08-03 | 2 | BE-QUEST-03 (D-31) | T-08-14 | refPath assoluto solo sui clone del catalogo; originale invariato | unit | `npx jest src/quests/quest-catalog.populate.spec.ts src/models --selectProjects unit` | ❌ W0 → `quest-catalog.populate.spec.ts` (RED) | ⬜ pending |
| 08-03-T2 | 08-03 | 2 | BE-QUEST-03 (D-31) | T-08-11, T-08-12, T-08-13 | orfani non annullano `quests`; NOT_FOUND tipizzato; selezioni FE verbatim (`enemy { id name imagePath }`, `relatedLore { id name description }`, frammenti item di 06-12) con fixture che valorizzano i campi non-null | integration (wire) | `npx jest src/quests/quests.resolver.int-spec.ts --selectProjects integration --runInBand` | ❌ W0 → `quests.resolver.int-spec.ts` (RED) | ⬜ pending |
| 08-04-T1 | 08-04 | 1 | BE-TRAVEL-02 (D-10) | — | polilinea orientata, estremi POI, somme solo sugli archi | unit | `npx jest src/roads/road-route.spec.ts --selectProjects unit` | ❌ W0 → `road-route.spec.ts` (RED) | ⬜ pending |
| 08-04-T2 | 08-04 | 1 | BE-TRAVEL-02 (D-03, D-11, C3, C4) | T-08-15, T-08-16, T-08-18 | `routeBetween` mai lancia; arco più leggero; `getPath` invariato | integration (grafo da fixture) | `npx jest src/roads/roads.service.int-spec.ts --selectProjects integration --runInBand` | ❌ W0 → `roads.service.int-spec.ts` (RED) | ⬜ pending |
| 08-05-T1 | 08-05 | 2 | BE-TRAVEL-02 (D-01, D-04, D-08, D-09) | T-08-19 | durata solo dal server; ordine dei rifiuti | unit | `npx jest src/travel/travel-timing.spec.ts src/travel/travel-rules.spec.ts --selectProjects unit` | ❌ W0 (RED) | ⬜ pending |
| 08-05-T2 | 08-05 | 2 | BE-TRAVEL-02/03/04 (D-12, D-13, D-16, D-21, C10) | T-08-20..T-08-23 | guard riaffermate nei filtri; identità del job validata | unit | `npx jest src/travel/travel.updates.spec.ts src/travel/travel-job.spec.ts --selectProjects unit` | ❌ W0 (RED) | ⬜ pending |
| 08-05-T3 | 08-05 | 2 | BE-TRAVEL-03 (D-12) | T-08-24, T-08-25 | env fail-closed senza valore nei messaggi | unit | `npx jest src/config --selectProjects unit` | ❌ W0 → `travel-config.spec.ts` (RED) | ⬜ pending |
| 08-06-T1 | 08-06 | 2 | BE-QUEST-03, BE-TRAVEL-02 (D-06, D-26..D-28, D-32) | T-08-27 | guard viaggio prima regola; posizione solo per lo standard | unit | `npx jest src/quests/acceptance --selectProjects unit && npm run build` | ✅ riscrive le spec | ⬜ pending |
| 08-06-T2 | 08-06 | 2 | BE-QUEST-03 (D-26..D-29, D-32, C2, C8) | T-08-26, T-08-28..T-08-31 | nessun overbooking concorrente; catalogo invalido fail-closed | integration (replSet) | `npx jest src/quests/acceptance/quest-acceptance.service.int-spec.ts --selectProjects integration --runInBand` | ✅ riscrive l'int-spec | ⬜ pending |
| 08-06-T3 | 08-06 | 2 | BE-QUEST-03 (D-28) | T-08-26 | `{ code }` esatto; forme a oggetti sul filo | integration (wire) | `npx jest src/quests/acceptance/accept-quest.resolver.int-spec.ts --selectProjects integration --runInBand` | ✅ estende l'int-spec | ⬜ pending |
| 08-07-T1 | 08-07 | 2 | BE-QUEST-03 (D-30) | T-08-32..T-08-34 | posti liberati nella stessa transazione dell'archivio | integration (wire) | `npx jest src/characters/deletion/character-deletion.resolver.int-spec.ts --selectProjects integration --runInBand` | ✅ estende l'int-spec | ⬜ pending |
| 08-08-T1 | 08-08 | 3 | BE-TRAVEL-02 (helper di test) | — | fixture e fake senza comportamento di produzione | unit (fixture) | `npx jest test/fixtures/fixtures.spec.ts --selectProjects unit && npm run build` | ❌ W0 → `test/travel/*`, `pet.fixture.ts` creati | ⬜ pending |
| 08-08-T2 | 08-08 | 3 | BE-TRAVEL-02/03 (D-01..D-04, D-08, D-21, C6) | T-08-35..T-08-40 | meta e ETA dal server; archiviati invisibili; coda mai bloccante | integration (replSet, coda finta) | `npx jest src/travel/travel-planning.int-spec.ts --selectProjects integration --runInBand` | ❌ W0 (RED) | ⬜ pending |
| 08-09-T1 | 08-09 | 3 | BE-TRAVEL-03 (D-12..D-14) | T-08-41, T-08-42, T-08-44, T-08-45 | completamento idempotente; push solo dal vincitore, solo viaggio libero | integration (replSet) | `npx jest src/travel/travel-completion.int-spec.ts --selectProjects integration --runInBand` | ❌ W0 (RED) | ⬜ pending |
| 08-09-T2 | 08-09 | 3 | BE-TRAVEL-03 (D-12) | T-08-43, T-08-46 | reconciler al boot, sweep single-flight, timer unref | unit + integration | `npx jest src/travel/travel-sweeper.spec.ts --selectProjects unit && npx jest src/travel/travel-completion.int-spec.ts --selectProjects integration --runInBand` | ❌ W0 → `travel-sweeper.spec.ts` (RED) | ⬜ pending |
| 08-10-T1 | 08-10 | 4 | BE-TRAVEL-03 (D-12, C10) | T-08-47..T-08-50 | job anticipato o sporco non scrive; mai ri-accodato | integration (Redis reale) | `npx jest src/travel/travel-completion.processor.int-spec.ts --selectProjects integration --runInBand` | ❌ W0 (RED) | ⬜ pending |
| 08-10-T2 | 08-10 | 4 | BE-TRAVEL-03 | — | ciclo di vita montato nel boot reale, SDL invariato | integration (real boot) | `npx jest test/app.int-spec.ts --selectProjects integration --runInBand && git diff --exit-code src/schema.gql` | ✅ estende `test/app.int-spec.ts` | ⬜ pending |
| 08-11-T1 | 08-11 | 4 | BE-TRAVEL-02/03, BE-QUEST-04 (D-02, D-03, D-15, D-21) | T-08-51..T-08-55 | viaggio nello stesso claim; rifiuto ⇒ nessun viaggio né job | unit + integration (replSet) | `npx jest src/quests/acceptance --selectProjects unit && npx jest src/quests/acceptance/quest-acceptance.service.int-spec.ts --selectProjects integration --runInBand` | ✅ estende spec e int-spec | ⬜ pending |
| 08-11-T2 | 08-11 | 4 | BE-TRAVEL-01 (D-15) | — | `activeTravel` e `startDate: null` sul filo | integration (wire WS) | `npx jest src/quests/acceptance/accept-quest.resolver.int-spec.ts --selectProjects integration --runInBand` | ✅ estende l'int-spec | ⬜ pending |
| 08-12-T1 | 08-12 | 5 | BE-TRAVEL-02 (D-11, D-21) | T-08-57, T-08-58 | un solo viaggio sotto concorrenza; preview senza scritture | integration (replSet) | `npx jest src/travel/travel.service.int-spec.ts --selectProjects integration --runInBand` | ❌ W0 (RED) | ⬜ pending |
| 08-12-T2 | 08-12 | 5 | BE-TRAVEL-01/02/03 (D-18, SC1–SC3) | T-08-56, T-08-59, T-08-60 | owner-only (innkeeper FORBIDDEN, nessun audit); UNAUTHENTICATED; whitelist enumerate | integration (wire + real boot) | `npx jest src/travel/travel.resolver.int-spec.ts --selectProjects integration --runInBand && npx jest test/app.int-spec.ts --selectProjects integration --runInBand && git diff --exit-code src/schema.gql` | ❌ W0 → `travel.resolver.int-spec.ts` (RED) | ⬜ pending |
| 08-13-T1 | 08-13 | 6 | BE-TRAVEL-04 (D-16, D-17) | T-08-64..T-08-66 | un solo update; job neutralizzato anche se la rimozione fallisce | integration (replSet) | `npx jest src/travel/teleport.resolver.int-spec.ts --selectProjects integration --runInBand` | ❌ W0 (RED) | ⬜ pending |
| 08-13-T2 | 08-13 | 6 | BE-TRAVEL-04 (D-16, C7) | T-08-62, T-08-63 | innkeeper soltanto, audit con outcome, whitelist enumerata; `teleportCharacter(request: TravelRequest!)` riusa l'input di 08-12 (nessun `TeleportCharacterRequest`) | integration (wire + real boot) | `npx jest src/travel/teleport.resolver.int-spec.ts --selectProjects integration --runInBand && npx jest test/app.int-spec.ts --selectProjects integration --runInBand && git diff --exit-code src/schema.gql` | ✅ estende l'int-spec del T1 | ⬜ pending |
| 08-14-T1 | 08-14 | 7 | BE-TRAVEL-01..04 (D-20, D-23) | T-08-67, T-08-68 | suite complete, schema con le sole eccezioni dichiarate, invarianti | full suite + CI | `npm run test:unit && npm run test:int && npm run build && git diff --exit-code src/schema.gql` | ✅ | ⬜ pending |
| 08-14-T2 | 08-14 | 7 | BE-TRAVEL-01..04 (D-24, C1, C2, C5) | T-08-69..T-08-71 | handoff senza segreti, comandi dati esatti | doc check | vedi `<verify>` del task (grep su BACKEND-NOTES, REQUIREMENTS, VALIDATION) | ❌ → `BACKEND-NOTES.md` creato | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Nessuna wave dedicata: ogni spec nuova nasce RED nel task che la consuma (TDD per task). File di test creati durante la fase:

- [ ] `src/models/character/active-travel.schema.spec.ts` (08-01)
- [ ] `src/quests/acceptance/quest-capacity.spec.ts` (08-02)
- [ ] `src/quests/quest-catalog.populate.spec.ts`, `src/quests/quests.resolver.int-spec.ts` (08-03)
- [ ] `src/roads/road-route.spec.ts`, `src/roads/roads.service.int-spec.ts` (08-04)
- [ ] `src/travel/travel-timing.spec.ts`, `travel-rules.spec.ts`, `travel.updates.spec.ts`, `travel-job.spec.ts`, `src/config/travel-config.spec.ts` (08-05)
- [ ] `test/travel/travel-world.ts`, `test/travel/fake-travel-queue.ts`, `test/fixtures/pet.fixture.ts`, `src/travel/travel-planning.int-spec.ts` (08-08)
- [ ] `test/travel/active-travel.fixture.ts` (helper `buildActiveTravelDoc`), `src/travel/travel-completion.int-spec.ts`, `src/travel/travel-sweeper.spec.ts` (08-09)
- [ ] `src/travel/travel-completion.processor.int-spec.ts` (08-10)
- [ ] `src/travel/travel.service.int-spec.ts`, `src/travel/travel.resolver.int-spec.ts` (08-12)
- [ ] `src/travel/teleport.resolver.int-spec.ts` (08-13)
- Framework install: nessuno (stack e harness esistenti).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Conferma del viaggio con ETA, interpolazione sulla polilinea con `serverTime`, ricostruzione dopo kill dell'app, push di fine viaggio, teleport dal pannello admin | BE-TRAVEL-01..04 (consumo FE) | richiede la FE Phase 7 su device e i dati a DB preparati dall'utente | BACKEND-NOTES §11 (d): checklist UAT dopo il merge della FE Phase 7 |
| Aggiornamento delle 4 quest di sviluppo al modello a slot e creazione del pet con `speedModifier` | D-28, C2, C5 | decisione utente: nessuna migrazione né seed | BACKEND-NOTES §11 (a)/(b): comandi `mongosh` subito dopo il deploy |
| Scala delle durate (fino a 82 h fra città lontane, 2,6 h verso i marker delle quest) | D-07, C1 | decisione di game design dell'utente | BACKEND-NOTES §8: ritoccare `Road.speedFactor` a DB se serve |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency ≤ 60 s per spec singola (eccezioni dichiarate: task di real boot e gate 08-14)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
