---
phase: 04
slug: integrita-economica-atomics
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-10-18
---

# Phase 04 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 30 + ts-jest 29, projects `unit` (`*.spec.ts`) / `integration` (`*.int-spec.ts`, MongoMemoryReplSet condiviso via `test/setup/{global-setup,global-teardown,after-env,mongo-replset,redis}.ts`, Redis effimero reale per i processor) |
| **Config file** | `package.json` → `jest.projects` |
| **Quick run command** | `npx jest src/economy src/gameRules src/characters src/quests src/models/character --selectProjects unit` |
| **Full suite command** | `npm test` (= `test:unit` + `test:int --runInBand`) |
| **Estimated runtime** | unit ~5 s; int-spec singolo ~3–10 s; `npm test` ~2 min |

Trappole di tooling (vincolanti, 02.1 D-14 / 04-RESEARCH Pitfall 10): path jest PRIMA di `--selectProjects`; integration sempre `--runInBand`; MAI `npm run lint` (solo `npx prettier --write <file>` + `npx eslint <file>` sui file toccati); `src/schema.gql` si rigenera con `npx jest test/app.int-spec.ts --selectProjects integration --runInBand` e deve restare SENZA diff (D-15); `publish()` di `@graphql-yoga/subscription` restituisce `void`; i path ref `@Prop({ type: Types.ObjectId })` sono Mixed → i builder ricevono `Types.ObjectId` già validati (Pitfall 1); `$toInt` in ogni pipeline di coins (Pitfall 4); jobId Bull con `randomUUID()` (Pitfall 5).

---

## Sampling Rate

- **After every task commit:** Run the unit command on the touched paths + the single integration file touched (`npx jest <file> --selectProjects integration --runInBand`)
- **After every plan wave:** Run `npx jest src/economy src/characters src/quests --selectProjects integration --runInBand` + `npm run test:unit`
- **Before `/gsd-verify-work`:** Full suite must be green (`npm test`), `npm run build`, `npx eslint <touched files>`, `git diff --exit-code src/schema.gql`
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

> Da compilare dal planner con gli ID dei task dei PLAN.md (mappa requisito → test in `04-RESEARCH.md` §Validation Architecture).

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 04-TBD | TBD | TBD | BE-ATOM-01..05 | TBD | see RESEARCH §Validation Architecture | unit / integration | `npx jest <path> --selectProjects unit\|integration [--runInBand]` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/gameRules/game-rule-error-code.enum.ts` + `game-rule.exception.ts` + spec (tutti i codici D-15)
- [ ] `src/economy/coins.ts` + `coins.expressions.ts` + spec (assorbe `src/utils.ts`)
- [ ] `src/models/character/active-spell-slots.ts` + spec; virtual `maxActiveSpells` ricablata sulla tabella condivisa
- [ ] `ResourceNotFoundException.quest()` (+ caso di spec)
- [ ] Fixture catalogo in `test/fixtures/` (`persistEquipmentItem` / `persistLootItem` con prezzi), helper `rawCharacter`, `Model.init()`
- [ ] `test/authz/characters-test-app.ts` aggiornato con i nuovi provider (Pitfall 8)
- [ ] Fixture `doTransaction` delle suite ownership/archived portate a totale zero (Pitfall 2)
- Nessuna installazione di framework necessaria.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Topologia MongoDB di produzione = replica set (transazioni D-07/D-09) | BE-ATOM-02, BE-ATOM-03 | dipende dal deploy, non dal codice | verificare `rs.status()` sull'istanza prod prima del rilascio (blocker in STATE.md) |
| `BACKEND-NOTES.md` completo per il FE (codici, `usages` ignorato, mismatch → ricaricare catalogo) | D-16 | documento | review del file nell'ultimo plan |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
