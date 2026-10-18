---
phase: 04
slug: integrita-economica-atomics
status: validated
nyquist_compliant: true
wave_0_complete: true
created: 2026-10-18
validated: 2026-10-18
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

> Una riga per task dei PLAN.md (mappa requisito → test in `04-RESEARCH.md` §Validation Architecture). Ogni comando inizia con il `cd` assoluto nel repo BE.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 04-01-01 | 04-01 | 1 | BE-ATOM-01 (D-15) | T-04-01-01 | codici stabili, messaggi italiani senza id, formatter invariato | unit | `cd /Users/lucatabbia/Personale/Code/Klimmeck-Guide-BE/Klimmeck-Guide-BE && npx jest src/gameRules src/authz/resource-not-found src/graphql/format-domain-error --selectProjects unit` | ✅ | ✅ green |
| 04-01-02 | 04-01 | 1 | BE-ATOM-01 (D-01/D-02) | T-04-01-03 | rame totale unico, $toInt su ogni denominazione, RangeError su delta non interi | unit | `cd /Users/lucatabbia/Personale/Code/Klimmeck-Guide-BE/Klimmeck-Guide-BE && npx jest src/economy --selectProjects unit` | ✅ | ✅ green |
| 04-01-03 | 04-01 | 1 | BE-ATOM-04 (D-11) | T-04-01-02, T-04-01-04 | una sola tabella soglie (virtual + $switch); solo hex canonico diventa ObjectId | unit | `cd /Users/lucatabbia/Personale/Code/Klimmeck-Guide-BE/Klimmeck-Guide-BE && npx jest src/models src/mongo --selectProjects unit` | ✅ | ✅ green |
| 04-02-01 | 04-02 | 2 | BE-ATOM-01 (SC1, D-02, D-04) | T-04-02-01, T-04-02-04, T-04-02-05 | debito coins condizionale: mai negativo con 10 concorrenti, NOT_FOUND su archiviato, rollback in sessione | integration | `cd /Users/lucatabbia/Personale/Code/Klimmeck-Guide-BE/Klimmeck-Guide-BE && npx jest src/economy/wallet.service.int-spec.ts --selectProjects integration --runInBand` | ✅ | ✅ green |
| 04-02-02 | 04-02 | 2 | BE-ATOM-01 (SC1, D-03) | T-04-02-02, T-04-02-03 | twitchPoints $gte: INSUFFICIENT_POINTS, campo mancante = 0, importi interi positivi | integration | `cd /Users/lucatabbia/Personale/Code/Klimmeck-Guide-BE/Klimmeck-Guide-BE && npx jest src/economy/wallet.service.int-spec.ts --selectProjects integration --runInBand` | ✅ | ✅ green |
| 04-03-01 | 04-03 | 2 | BE-ATOM-04 (D-10..D-12) | T-04-03-04 | builder ObjectId-typed, $ifNull attorno a $size, classificatori fail-closed | unit | `cd /Users/lucatabbia/Personale/Code/Klimmeck-Guide-BE/Klimmeck-Guide-BE && npx jest src/characters/spells src/characters/equipment src/characters/character-id --selectProjects unit` | ✅ | ✅ green |
| 04-03-02 | 04-03 | 2 | BE-ATOM-04 (SC4, D-11) | T-04-03-01, T-04-03-02 | 4 equip concorrenti a capacità 1 → 1 successo; usages = maxUsages del catalogo; SPELL_NOT_ACTIVE su unequip | integration | `cd /Users/lucatabbia/Personale/Code/Klimmeck-Guide-BE/Klimmeck-Guide-BE && npx jest src/characters src/authz --selectProjects integration --runInBand` | ✅ | ✅ green |
| 04-03-03 | 04-03 | 2 | BE-ATOM-04 (D-12) | T-04-03-03, T-04-03-07 | equipItem solo su oggetti posseduti, ObjectId salvato, null sveste | integration | `cd /Users/lucatabbia/Personale/Code/Klimmeck-Guide-BE/Klimmeck-Guide-BE && npx jest src/characters src/authz --selectProjects integration --runInBand` | ✅ | ✅ green |
| 04-04-01 | 04-04 | 2 | BE-ATOM-02 (D-06) | T-04-04-01, T-04-04-02, T-04-04-03, T-04-04-05, T-04-04-06 | prezzo dal catalogo, totale client solo cross-check, codici ITEM_*/INVALID_QUANTITY | unit | `cd /Users/lucatabbia/Personale/Code/Klimmeck-Guide-BE/Klimmeck-Guide-BE && npx jest src/economy/trade --selectProjects unit` | ✅ | ✅ green |
| 04-04-02 | 04-04 | 2 | BE-ATOM-02 (D-07, D-08) | T-04-04-04 | fattibilità inventario prima della scrittura, guard $elemMatch quantity $gte | unit | `cd /Users/lucatabbia/Personale/Code/Klimmeck-Guide-BE/Klimmeck-Guide-BE && npx jest src/economy --selectProjects unit` | ✅ | ✅ green |
| 04-05-01 | 04-05 | 3 | BE-ATOM-05 (SC5, D-13) | T-04-05-01, T-04-05-03 | 4 use concorrenti con 1 usage → 1 successo, usages 0; jobId randomUUID distinti; compensazione + SPELL_RECOVERY_UNAVAILABLE | integration | `cd /Users/lucatabbia/Personale/Code/Klimmeck-Guide-BE/Klimmeck-Guide-BE && npx jest src/characters src/authz --selectProjects integration --runInBand` | ✅ | ✅ green |
| 04-05-02 | 04-05 | 3 | BE-ATOM-05 (SC5, D-14) | T-04-05-02, T-04-05-04, T-04-05-05 | recovery idempotente: mai oltre maxUsages del catalogo, skip loggati | integration | `cd /Users/lucatabbia/Personale/Code/Klimmeck-Guide-BE/Klimmeck-Guide-BE && npx jest src/characters --selectProjects integration --runInBand` | ✅ | ✅ green |
| 04-06-01 | 04-06 | 3 | BE-ATOM-02 (D-06) | T-04-06-04, T-04-06-06 | prezzi lean dal catalogo per tipo, id malformati mai in query | integration | `cd /Users/lucatabbia/Personale/Code/Klimmeck-Guide-BE/Klimmeck-Guide-BE && npx jest src/economy --selectProjects integration --runInBand` | ✅ | ✅ green |
| 04-06-02 | 04-06 | 3 | BE-ATOM-02 (SC2), BE-ATOM-01 | T-04-06-01, T-04-06-02, T-04-06-03, T-04-06-05 | unica transazione: fallimento indotto → documento identico; 4 acquisti concorrenti → 1; vendita unica → 1 | integration | `cd /Users/lucatabbia/Personale/Code/Klimmeck-Guide-BE/Klimmeck-Guide-BE && npx jest src/economy --selectProjects integration --runInBand` | ✅ | ✅ green |
| 04-07-01 | 04-07 | 3 | BE-ATOM-03 (SC3, D-09) | T-04-07-01, T-04-07-02, T-04-07-03, T-04-07-04 | 3 accept concorrenti → 1 PendingQuest, 1 debito; INSUFFICIENT_FUNDS libera lo slot | integration | `cd /Users/lucatabbia/Personale/Code/Klimmeck-Guide-BE/Klimmeck-Guide-BE && npx jest src/quests --selectProjects integration --runInBand` | ✅ | ✅ green |
| 04-07-02 | 04-07 | 3 | BE-ATOM-03 (D-09, D-15) | T-04-07-05 | primitiva montata in AppModule senza superficie GraphQL, schema byte-identico | integration (real boot) | `cd /Users/lucatabbia/Personale/Code/Klimmeck-Guide-BE/Klimmeck-Guide-BE && npx jest test/app.int-spec.ts --selectProjects integration --runInBand && git diff --exit-code src/schema.gql` | ✅ | ✅ green |
| 04-08-01 | 04-08 | 4 | BE-ATOM-02 (SC2, D-05) | T-04-08-01, T-04-08-02, T-04-08-03, T-04-08-04 | doTransaction sul wire: codici stabili, 5 concorrenti → 1, ownership invariata, fixture a totale zero | integration | `cd /Users/lucatabbia/Personale/Code/Klimmeck-Guide-BE/Klimmeck-Guide-BE && npx jest src/economy src/characters src/authz test/app.int-spec.ts --selectProjects integration --runInBand && git diff --exit-code src/schema.gql` | ✅ | ✅ green |
| 04-08-02 | 04-08 | 4 | BE-ATOM-02 (D-01, D-17) | T-04-08-06 | nessun save()/normalizeCoins residuo, src/utils.ts cancellato, build ok | unit + integration + build | `cd /Users/lucatabbia/Personale/Code/Klimmeck-Guide-BE/Klimmeck-Guide-BE && npx jest src test --selectProjects unit && npm run build && git diff --exit-code src/schema.gql` | ✅ | ✅ green |
| 04-09-01 | 04-09 | 5 | BE-ATOM-01..05 | T-04-09-01, T-04-09-02 | suite completa, build, lint file toccati, invarianti grep, schema senza drift | full suite | `cd /Users/lucatabbia/Personale/Code/Klimmeck-Guide-BE/Klimmeck-Guide-BE && npm run test:unit && npm run test:int && npm run build && git diff --exit-code src/schema.gql` | ✅ | ✅ green |
| 04-09-02 | 04-09 | 5 | BE-ATOM-01..05 (D-16) | T-04-09-03, T-04-09-04 | handoff BACKEND-NOTES + traceability Complete | doc check (grep) | `cd /Users/lucatabbia/Personale/Code/Klimmeck-Guide-BE/Klimmeck-Guide-BE && grep -q TRANSACTION_TOTAL_MISMATCH .planning/phases/04-integrita-economica-atomics/BACKEND-NOTES.md && test "$(grep -cE 'BE-ATOM-0[1-5] . Phase 4 . Complete' .planning/REQUIREMENTS.md)" = 5` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `src/gameRules/game-rule-error-code.enum.ts` + `game-rule.exception.ts` + spec (tutti i codici D-15)
- [x] `src/economy/coins.ts` + `coins.expressions.ts` + spec (assorbe `src/utils.ts`)
- [x] `src/models/character/active-spell-slots.ts` + spec; virtual `maxActiveSpells` ricablata sulla tabella condivisa
- [x] `ResourceNotFoundException.quest()` (+ caso di spec)
- [x] Fixture catalogo in `test/fixtures/` (`persistEquipmentItem` / `persistLootItem` con prezzi), helper `rawCharacter`, `Model.init()`
- [x] `test/authz/characters-test-app.ts` aggiornato con i nuovi provider (Pitfall 8)
- [x] Fixture `doTransaction` delle suite ownership/archived portate a totale zero (Pitfall 2)
- Nessuna installazione di framework necessaria.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Topologia MongoDB di produzione = replica set (transazioni D-07/D-09) | BE-ATOM-02, BE-ATOM-03 | dipende dal deploy, non dal codice | verificare `rs.status()` sull'istanza prod prima del rilascio (blocker in STATE.md) |
| `BACKEND-NOTES.md` completo per il FE (codici, `usages` ignorato, mismatch → ricaricare catalogo) | D-16 | documento | review del file nell'ultimo plan |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-10-18

**Evidenza (04-09, 2026-10-18):** `npm run test:unit` 54 suite / 625 test; `npm run test:int` 41 suite / 472 test (66 s, Redis reale incluso); `npm run build` ok; eslint 0 errori + `prettier --check` ok sui 58 file `.ts` toccati; `git diff --exit-code develop -- src/schema.gql` = 0; invarianti grep verdi. Verifica manuale ancora aperta: topologia MongoDB di produzione (`rs.status()`, blocker in STATE.md); `BACKEND-NOTES.md` consegnato.
