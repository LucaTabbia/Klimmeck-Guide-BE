---
phase: 13
slug: generazione-quest
status: approved
nyquist_compliant: true
wave_0_complete: false
created: 2026-11-04
---

# Phase 13 — Validation Strategy

> Contratto di validazione della fase: ogni task dei 20 piani ha un comando automatico; le spec nuove nascono nel commit RED del proprio task (nessun piano Wave 0 separato).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 30 + ts-jest (progetto `unit` = `*.spec.ts`, progetto `integration` = `*.int-spec.ts` su `MongoMemoryReplSet` condiviso) |
| **Config file** | `package.json` → `jest.projects`, `jest.coverageThreshold` |
| **Quick run command** | `npx jest <percorsi> --selectProjects unit` · `npx jest <percorsi> --selectProjects integration --runInBand` (percorsi PRIMA di `--selectProjects`) |
| **Full suite command** | `npm run test:cov` (solo nel piano di gate 13-19) |
| **Schema gate** | real boot `npx jest test/app.int-spec.ts --selectProjects integration --runInBand`, poi `git diff --exit-code src/schema.gql` |
| **Type gate** | `npx tsc --noEmit -p tsconfig.json` (mai `npm run build`: il BE dell'utente gira da `dist/`) |
| **Estimated runtime** | ~3 s per spec unit mirata, ~6–15 s per int-spec mirata; suite completa alcuni minuti |

---

## Sampling Rate

- **Dopo ogni commit di task:** le spec mirate del task + `npx tsc --noEmit -p tsconfig.json`.
- **Dopo ogni piano che tocca lo SDL (13-01, 13-02, 13-14):** real boot + `git diff --exit-code src/schema.gql` + `git diff origin/develop -- src/schema.gql | grep -E '^-[^-]'` (al più le due righe `  enemy: Enemy`).
- **Fra 13-02 e 13-05:** le spec NON toccate che scrivono ancora `infos.enemy` possono essere rosse (contratto sostituito in 13-02, spazzate in 13-04/13-05): atteso e annotato nei SUMMARY; dal piano 13-05 in poi `npx jest src/quests --selectProjects integration --runInBand` è verde.
- **Prima di `/gsd-verify-work`:** `npm run test:cov` verde con la soglia nuova `./src/quests/generation/` (piano 13-19).
- **Max feedback latency:** 30 s per spec mirata (real boot e suite completa esclusi).

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 13-01-01 | 01 | 1 | BE-QGEN-02, BE-QGEN-03, BE-QGEN-10, BE-QGEN-11 | T-13-01 | `generated` interno, mai sul filo; indice unico parziale sul POI | unit | `npx jest src/models/quest-generation-fields.schema.spec.ts src/models/sweep-indexes.schema.spec.ts --selectProjects unit` | ✅ | ✅ green |
| 13-01-02 | 01 | 1 | BE-QGEN-03, BE-QGEN-10, BE-QGEN-11 | T-13-02 | SDL additivo, nessuna riga tolta | unit + integration | `npx jest src/models/quest-generation-fields.schema.spec.ts --selectProjects unit` · `npx jest test/app.int-spec.ts --selectProjects integration --runInBand` | ✅ | ✅ green |
| 13-02-01 | 02 | 2 | BE-QGEN-01 | T-13-03 | ref `enemies.enemy` ObjectId, mai Mixed; SDL: tolte solo le due righe `enemy: Enemy` | unit + integration | `npx jest src/models/quest/quest-enemies.schema.spec.ts src/models/quest-result/quest-result.schema.spec.ts src/migrations/mixed-refs/mixed-ref-paths.spec.ts src/quests/outcomes/outcome-plan.spec.ts src/quests/outcomes/rescue-plan.spec.ts --selectProjects unit` · `npx jest test/app.int-spec.ts --selectProjects integration --runInBand` | ❌ W0 | ⬜ pending |
| 13-02-02 | 02 | 2 | BE-QGEN-01 | T-13-04 | nemico orfano filtrato: la lista `quests` non si annulla | unit | `npx jest src/quests/quest-catalog.populate.spec.ts src/quests/results/quest-result.populate.spec.ts --selectProjects unit` | ❌ W0 | ⬜ pending |
| 13-02-03 | 02 | 2 | BE-QGEN-01 | T-13-02 / T-13-04 | SDL: tolte solo le due righe `enemy: Enemy`; `relatedLore` dei nemici mai popolato | integration | `npx jest test/app.int-spec.ts src/quests/quests.resolver.int-spec.ts src/quests/results/quest-result.resolver.int-spec.ts --selectProjects integration --runInBand` | ✅ | ⬜ pending |
| 13-03-01 | 03 | 3 | BE-QGEN-01 | — | lettore tollerante puro, nessuna eccezione | unit | `npx jest src/quests/outcomes/quest-enemies.spec.ts --selectProjects unit` | ❌ W0 | ⬜ pending |
| 13-03-02 | 03 | 3 | BE-QGEN-01 | T-13-05 | migrazione idempotente, seconda corsa 0 | integration | `npx jest src/quests/maintenance/quest-enemies.migrator.int-spec.ts --selectProjects integration --runInBand` | ❌ W0 | ⬜ pending |
| 13-03-03 | 03 | 3 | BE-QGEN-01 | T-13-05 | boot mai bloccato da un passo fallito | unit + integration | `npx jest src/quests/maintenance/quest-maintenance.boot.spec.ts --selectProjects unit` · `npx jest test/app.int-spec.ts --selectProjects integration --runInBand` | ❌ W0 | ⬜ pending |
| 13-04-01 | 04 | 4 | BE-QGEN-01 | T-13-06 | segnaposto aggrega HP e danni per quantità | unit | `npx jest src/quests/outcomes/combat --selectProjects unit` | ✅ | ⬜ pending |
| 13-04-02 | 04 | 4 | BE-QGEN-01 | T-13-06 | XP = premio + Σ xp × quantità, clamp invariato | unit | `npx jest src/quests/outcomes/outcome-plan.spec.ts src/quests/outcomes/combatant-plan.spec.ts --selectProjects unit` | ❌ W0 | ⬜ pending |
| 13-04-03 | 04 | 4 | BE-QGEN-01 | T-13-06 | orfani e quantità non valide scartati con WARN di soli id | integration | `npx jest src/quests/outcomes/quest-combat.int-spec.ts --selectProjects integration --runInBand` | ✅ | ⬜ pending |
| 13-05-01 | 05 | 5 | BE-QGEN-01 | — | N/A | unit + integration | `npx jest test/fixtures/fixtures.spec.ts --selectProjects unit` · `npx jest test/fixtures/fixtures.int-spec.ts --selectProjects integration --runInBand` | ✅ | ⬜ pending |
| 13-05-02 | 05 | 5 | BE-QGEN-01 | — | N/A | integration | `npx jest src/quests/outcomes --selectProjects integration --runInBand` | ✅ | ⬜ pending |
| 13-05-03 | 05 | 5 | BE-QGEN-01 | — | N/A | unit + integration | `npx jest src/models src/quests src/lore src/characters/deletion src/validation src/authz test/fixtures --selectProjects unit` · `npx jest src/lore src/quests/acceptance src/quests/party src/quests/results src/characters/deletion src/validation --selectProjects integration --runInBand` | ✅ | ⬜ pending |
| 13-06-01 | 06 | 6 | BE-QGEN-01, BE-QGEN-10 | T-13-07 | la aid non eredita `generated` | unit | `npx jest src/quests/outcomes/aid/aid-quest.spec.ts --selectProjects unit` | ✅ | ⬜ pending |
| 13-06-02 | 06 | 6 | BE-QGEN-01 | T-13-07 | soccorso e GM sul combattimento aggregato | integration | `npx jest src/quests/outcomes/aid-rescue.int-spec.ts src/quests/outcomes/gm-completion.service.int-spec.ts --selectProjects integration --runInBand` | ✅ | ⬜ pending |
| 13-07-01 | 07 | 7 | BE-QGEN-09 | T-13-08 | contesto puro, nessun I/O | unit | `npx jest src/quests/outcomes/dungeon/dungeon-context.spec.ts --selectProjects unit` | ❌ W0 | ⬜ pending |
| 13-07-02 | 07 | 7 | BE-QGEN-09 | T-13-08 | prima sconfitta ferma l'esplorazione | unit | `npx jest src/quests/outcomes/dungeon/placeholder-dungeon-resolver.spec.ts --selectProjects unit` | ❌ W0 | ⬜ pending |
| 13-08-01 | 08 | 8 | BE-QGEN-09 | T-13-09 | premi solo a percorso completo | unit | `npx jest src/quests/outcomes/outcome-plan.spec.ts src/quests/outcomes/combatant-plan.spec.ts --selectProjects unit` | ✅ | ⬜ pending |
| 13-08-02 | 08 | 8 | BE-QGEN-09 | T-13-09 | fallimento = aid con gli stessi `enemies` | integration | `npx jest src/quests/outcomes/quest-dungeon.int-spec.ts --selectProjects integration --runInBand` | ❌ W0 | ⬜ pending |
| 13-09-01 | 09 | 9 | BE-QGEN-02 | — | stesso seme = stessa sequenza | unit | `npx jest src/quests/generation/seeded-chance.spec.ts --selectProjects unit` | ❌ W0 | ⬜ pending |
| 13-09-02 | 09 | 9 | BE-QGEN-03, BE-QGEN-05 | T-13-10 | fasce e posti dei boss da costanti testate | unit | `npx jest src/quests/generation/generation-rules.spec.ts --selectProjects unit` | ❌ W0 | ⬜ pending |
| 13-10-01 | 10 | 10 | BE-QGEN-03, BE-QGEN-05 | T-13-10 | leggendari mai nel pool (fail-closed) | unit | `npx jest src/quests/generation/enemy-pool.spec.ts --selectProjects unit` | ❌ W0 | ⬜ pending |
| 13-10-02 | 10 | 10 | BE-QGEN-03, BE-QGEN-05 | T-13-10 | branco sempre dallo stesso pool del POI | unit | `npx jest src/quests/generation/quest-composition.spec.ts --selectProjects unit` | ❌ W0 | ⬜ pending |
| 13-11-01 | 11 | 11 | BE-QGEN-06, BE-QGEN-10 | T-13-11 | legendary mai sotto hero; pet 1% solo boss | unit | `npx jest src/quests/generation/generated-prizes.spec.ts --selectProjects unit` | ❌ W0 | ⬜ pending |
| 13-11-02 | 11 | 11 | BE-QGEN-06 | — | N/A | unit | `npx jest src/quests/generation/recommended-loot.spec.ts --selectProjects unit` | ❌ W0 | ⬜ pending |
| 13-11-03 | 11 | 11 | BE-QGEN-07 | — | N/A | unit | `npx jest src/quests/generation/quest-templates.spec.ts --selectProjects unit` | ❌ W0 | ⬜ pending |
| 13-12-01 | 12 | 12 | BE-QGEN-04 | T-13-12 | marker escluso, tetto 3 | unit | `npx jest src/quests/generation/city-picker.spec.ts --selectProjects unit` | ❌ W0 | ⬜ pending |
| 13-12-02 | 12 | 12 | BE-QGEN-04 | T-13-12 | distribuzione non concentrata | unit | `npx jest src/quests/generation/city-distribution.spec.ts --selectProjects unit` | ❌ W0 | ⬜ pending |
| 13-13-01 | 13 | 13 | BE-QGEN-02 | T-13-13 | env fail-closed senza eco del valore | unit | `npx jest src/config/quest-generation-config.spec.ts src/config/env.validation.spec.ts src/config/env-example.drift.spec.ts --selectProjects unit` | ❌ W0 | ⬜ pending |
| 13-13-02 | 13 | 13 | BE-QGEN-03, BE-QGEN-07 | T-13-01 | `generated: true`, `requiredPoints` nullo, un posto del rango | unit | `npx jest src/quests/generation/generated-quest-draft.spec.ts --selectProjects unit` | ❌ W0 | ⬜ pending |
| 13-13-03 | 13 | 13 | BE-QGEN-02, BE-QGEN-03, BE-QGEN-04, BE-QGEN-05 | T-13-12 / T-13-14 | target, tetto, POI unico (E11000 catturato) | integration | `npx jest src/quests/generation/quest-generator.int-spec.ts --selectProjects integration --runInBand` | ❌ W0 | ⬜ pending |
| 13-14-01 | 14 | 14 | BE-QGEN-02 | T-13-14 | single-flight, timer `unref`, stop pulito | unit | `npx jest src/quests/generation/quest-generation.sweeper.spec.ts --selectProjects unit` | ❌ W0 | ⬜ pending |
| 13-14-02 | 14 | 14 | BE-QGEN-02 | T-13-15 | trigger best-effort dopo il commit | unit + integration | `npx jest src/quests/outcomes/outcome-writer.spec.ts src/quests/outcomes/quest-outcome-plan.spec.ts --selectProjects unit` · `npx jest src/quests/generation/quest-generation-trigger.int-spec.ts --selectProjects integration --runInBand` | ❌ W0 | ⬜ pending |
| 13-14-03 | 14 | 14 | BE-QGEN-02, BE-QGEN-08 | T-13-16 | `@Roles(innkeeper)` + audit; FORBIDDEN agli altri | integration | `npx jest src/quests/generation/quest-generation.resolver.int-spec.ts test/app.int-spec.ts --selectProjects integration --runInBand` | ❌ W0 | ⬜ pending |
| 13-15-01 | 15 | 15 | BE-QGEN-10 | T-13-17 | pet idempotente in `ownedPets` | unit | `npx jest src/quests/outcomes/rewards/quest-rewards.spec.ts src/quests/outcomes/outcome-plan.spec.ts --selectProjects unit` | ✅ | ⬜ pending |
| 13-15-02 | 15 | 15 | BE-QGEN-10 | T-13-17 | nessun doppione sotto transazione | integration | `npx jest src/quests/outcomes/quest-pet-prize.int-spec.ts src/quests/results/quest-result.resolver.int-spec.ts --selectProjects integration --runInBand` | ❌ W0 | ⬜ pending |
| 13-16-01 | 16 | 16 | BE-QGEN-11 | — | solo valori dell'enum nel contesto | unit | `npx jest src/quests/outcomes/combat/combat-context.spec.ts --selectProjects unit` | ✅ | ⬜ pending |
| 13-16-02 | 16 | 16 | BE-QGEN-11 | T-13-18 | scrive solo dove manca, solo ring/necklace | unit + integration | `npx jest src/quests/maintenance/quest-maintenance.boot.spec.ts --selectProjects unit` · `npx jest src/quests/maintenance/jewel-accessory.migrator.int-spec.ts --selectProjects integration --runInBand` | ❌ W0 | ⬜ pending |
| 13-17-01 | 17 | 17 | BE-QGEN-03 | T-13-18 | 22 `true`, gli altri `false`, solo dove manca | integration | `npx jest src/quests/maintenance/enemy-legendary.migrator.int-spec.ts --selectProjects integration --runInBand` | ❌ W0 | ⬜ pending |
| 13-17-02 | 17 | 17 | BE-QGEN-09 | T-13-18 | arricchimento deterministico e condizionale | unit + integration | `npx jest src/quests/maintenance/dungeon-stages.spec.ts src/quests/maintenance/quest-maintenance.boot.spec.ts --selectProjects unit` · `npx jest src/quests/maintenance/dungeon-stages.migrator.int-spec.ts --selectProjects integration --runInBand` | ❌ W0 | ⬜ pending |
| 13-18-01 | 18 | 18 | BE-QGEN-08, BE-QGEN-03, BE-QGEN-04 | T-13-12 | tetto, distribuzione, hunt/dungeon mai generate, idempotenza | integration | `npx jest test/quests/quest-generation.e2e.int-spec.ts --selectProjects integration --runInBand` | ❌ W0 | ⬜ pending |
| 13-18-02 | 18 | 18 | BE-QGEN-08 | T-13-14 / T-13-16 | concorrenza sul POI, FORBIDDEN, audit | integration | `npx jest test/quests/quest-generation-access.e2e.int-spec.ts --selectProjects integration --runInBand` | ❌ W0 | ⬜ pending |
| 13-19-01 | 19 | 19 | BE-QGEN-08 | T-13-02 | contratto FE fissato nel real boot | integration | `npx jest test/app.int-spec.ts --selectProjects integration --runInBand` | ✅ | ⬜ pending |
| 13-19-02 | 19 | 19 | BE-QGEN-01..11 | T-13-19 / T-13-20 | suite verde, soglie, SDL gate, segreti, trailer | full suite | `npm run test:cov` | ✅ | ⬜ pending |
| 13-20-01 | 20 | 20 | BE-QGEN-08 | T-13-21 | handoff e runbook senza segreti | docs | `grep -c "generateQuests: GenerateQuestsResult!" .planning/phases/13-generazione-quest/BACKEND-NOTES.md` | ❌ W0 | ⬜ pending |
| 13-20-02 | 20 | 20 | BE-QGEN-08 | — | N/A | docs | `grep -c "| 13. Generazione quest | 20/20 | Complete |" .planning/ROADMAP.md` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- Ogni spec nuova (`❌ W0` nella mappa) nasce nel commit RED del proprio task: nessun piano Wave 0 separato.
- Helper di test nuovi: `test/quests/generation-world.ts` (mondo di prova del generatore: città con marker e POI con `location`, nemici per fascia con `legendary`, catalogo per rarità, pet `sellable`, override quieti dello sweeper del generatore) nasce nel piano 13-13; `src/quests/generation/seeded-chance.ts` ripristinato da git `e857802^` nel piano 13-09.
- Fixture esistenti aggiornati: `test/fixtures/quest.fixture.ts` e `test/quests/quest-result.fixture.ts` (`enemy: null` → `enemies: []`) nel piano 13-05.
- Framework e harness: `Existing infrastructure covers all phase requirements` (Jest 30, `MongoMemoryReplSet`, `createAuthTestApp`, `createPlayer`, `graphqlRequest`, `SequenceChance`).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Primo boot del BE dal branch sul database reale: migrazione `enemy` → `enemies`, `Enemy.legendary` sui 22, `accessoryUseTypes` dei 42 gioielli, arricchimento delle 40 dungeon, prima corsa del generatore | BE-QGEN-01, 03, 09, 11 | la fase vieta di toccare il DB reale; lo esegue l'utente (o l'orchestratore su richiesta) col runbook di `BACKEND-NOTES.md` | build, riavvio da `dist/`, lettura dei log dei migratori e del generatore, poi rimozione dei migratori una tantum prima della merge (Phase 12 D-25) |
| UAT su device della FE Phase 14 (foglio quest multi-nemico, esito con tappe, «Genera missioni», premio pet, «Uso» dei gioielli) | BE-QGEN-08 | richiede il device e la FE mergiata | piani gated della FE Phase 14 dopo la merge di questa PR |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30 s per spec mirata (real boot e suite completa esclusi)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-11-04 (planner; il piano 13-19 porta lo `status` a `complete` e `wave_0_complete: true`)
