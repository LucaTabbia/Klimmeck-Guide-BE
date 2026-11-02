---
phase: 11
slug: popolamento-del-mondo
status: planned
nyquist_compliant: true
wave_0_complete: false
created: 2026-11-01
updated: 2026-11-02
---

# Phase 11 — Validation Strategy

> Contratto di campionamento della fase: ogni task ha un comando automatico (o è il checkpoint unico del piano 11-24). Le regole comuni degli esecutori sono in `11-REPO-RULES.md`.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 30 + ts-jest 29.2.5, progetti `unit` e `integration` (`package.json` → `jest.projects`; integration con `MongoMemoryReplSet` condiviso, `test/setup/global-setup.ts`) |
| **Config file** | `package.json` (nessuna config nuova; soglia `./src/content/` aggiunta nel piano 11-26) |
| **Quick run command** | `npx jest src/content --selectProjects unit` (+ `node dist/content/run-content.js --check` per i piani di stesura) |
| **Full suite command** | `npm run build && npx tsc --noEmit -p tsconfig.json && npm run test:cov` (solo nel piano 11-26) |
| **Estimated runtime** | spec mirate ≤ 60 s; `--check` sul vero albero ≤ 10 s; suite completa ≈ 4–6 min |

---

## Sampling Rate

- **Dopo ogni task:** il comando `<automated>` del task (spec mirata, `--check`, o controllo del report).
- **Dopo ogni wave:** `npx jest src/content src/lore src/quests/outcomes --selectProjects unit` e, dalle wave con codice DB, `npx jest src/content --selectProjects integration --runInBand`; dalla wave 7 anche `npm run build && node dist/content/run-content.js --check`.
- **Prima di `/gsd-verify-work`:** suite completa verde (piano 11-26).
- **Max feedback latency:** 60 s per task (eccetto il piano 11-26).

---

## Per-Task Verification Map

Requisiti abbreviati: `C-0N` = `BE-CONTENT-0N`.

| Task ID | Plan | Wave | Requirement | Threat Ref | Test Type | Automated Command | Status |
|---------|------|------|-------------|------------|-----------|-------------------|--------|
| 11-01-01 | 01 | 1 | C-03 | T-11-01…T-11-03 | integration | `npx jest test/app.int-spec.ts --selectProjects integration --runInBand && git diff --exit-code src/schema.gql && test "$(git diff origin/…` | ✅ green |
| 11-01-02 | 01 | 1 | C-03 | T-11-01…T-11-03 | integration | `npx jest src/lore test/app.int-spec.ts --selectProjects integration --runInBand && npx jest test/fixtures --selectProjects unit && git di…` | ✅ green |
| 11-02-01 | 02 | 1 | C-06 | T-11-04…T-11-07 | unit | `npx jest src/quests/outcomes/rewards src/models/quest --selectProjects unit && npx tsc --noEmit -p tsconfig.json` | ✅ green |
| 11-02-02 | 02 | 1 | C-06 | T-11-04…T-11-07 | unit | `npx jest src/quests/outcomes --selectProjects unit && npx jest src/quests/outcomes/study-spell-draw.int-spec.ts src/quests/outcomes/quest…` | ✅ green |
| 11-03-01 | 03 | 2 | C-01, C-02, C-04, C-05, C-06 | T-11-08…T-11-11 | unit | `npx jest src/content/loading --selectProjects unit && npx tsc --noEmit -p tsconfig.json && node -e "process.exit(require('./package.json'…` | ✅ green |
| 11-03-02 | 03 | 2 | C-01, C-02, C-04, C-05, C-06 | T-11-08…T-11-11 | unit | `npx jest src/content/rules/content-config.spec.ts src/content/loading --selectProjects unit && cmp content/config.yaml test/content-fixtu…` | ✅ green |
| 11-03-03 | 03 | 2 | C-01, C-02, C-04, C-05, C-06 | T-11-08…T-11-11 | unit | `npx jest src/content --selectProjects unit && npx tsc --noEmit -p tsconfig.json` | ✅ green |
| 11-04-01 | 04 | 3 | C-01, C-02 | T-11-12…T-11-15 | unit | `npx jest src/content/schema --selectProjects unit && npx tsc --noEmit -p tsconfig.json` | ✅ green |
| 11-04-02 | 04 | 3 | C-01, C-02 | T-11-12…T-11-15 | unit | `npx jest src/content/schema --selectProjects unit && npx tsc --noEmit -p tsconfig.json` | ✅ green |
| 11-04-03 | 04 | 3 | C-01, C-02 | T-11-12…T-11-15 | unit | `npx jest src/content --selectProjects unit && npx tsc --noEmit -p tsconfig.json` | ✅ green |
| 11-05-01 | 05 | 4 | C-01, C-02, C-06 | T-11-16…T-11-18 | unit | `npx jest src/content/rules src/content/checking --selectProjects unit && npx tsc --noEmit -p tsconfig.json` | ✅ green |
| 11-05-02 | 05 | 4 | C-01, C-02, C-06 | T-11-16…T-11-18 | unit | `npx jest src/content --selectProjects unit && npx tsc --noEmit -p tsconfig.json` | ✅ green |
| 11-05-03 | 05 | 4 | C-01, C-02, C-06 | T-11-16…T-11-18 | script | `grep -q -- "--new-id" content/README.md && grep -q "spellDraw" content/README.md && grep -q "category:" content/README.md && grep -q "ana…` | ✅ green |
| 11-06-01 | 06 | 4 | C-02, C-04, C-06 | T-11-19…T-11-22 | unit | `npx jest src/content/mapping --selectProjects unit && npx tsc --noEmit -p tsconfig.json` | ✅ green |
| 11-06-02 | 06 | 4 | C-02, C-04, C-06 | T-11-19…T-11-22 | unit | `npx jest src/content/mapping --selectProjects unit && npx tsc --noEmit -p tsconfig.json` | ✅ green |
| 11-06-03 | 06 | 4 | C-02, C-04, C-06 | T-11-19…T-11-22 | unit | `npx jest src/content --selectProjects unit && npx tsc --noEmit -p tsconfig.json` | ✅ green |
| 11-07-01 | 07 | 4 | C-02 | T-11-23…T-11-27 | integration | `npx jest src/content/fixes --selectProjects unit && npx jest src/content/fixes/fixes.int-spec.ts --selectProjects integration --runInBand…` | ⬜ pending |
| 11-07-02 | 07 | 4 | C-02 | T-11-23…T-11-27 | integration | `npx jest src/content/fixes --selectProjects integration --runInBand && npx jest src/content/fixes --selectProjects unit && npx tsc --noEm…` | ⬜ pending |
| 11-08-01 | 08 | 5 | C-06 | T-11-28…T-11-31 | unit | `npx jest src/content/generation/seeded-chance.spec.ts src/content/generation/city-profile.spec.ts src/content/generation/service-quests.s…` | ⬜ pending |
| 11-08-02 | 08 | 5 | C-06 | T-11-28…T-11-31 | unit | `npx jest src/content/generation/hunt-quests.spec.ts src/content/generation/service-quests.spec.ts --selectProjects unit && npx tsc --noEm…` | ⬜ pending |
| 11-08-03 | 08 | 5 | C-06 | T-11-28…T-11-31 | unit | `npx jest src/content --selectProjects unit && npx tsc --noEmit -p tsconfig.json` | ⬜ pending |
| 11-09-01 | 09 | 5 | C-02 | T-11-32…T-11-37 | unit | `npx jest src/content/sync src/content/fixes --selectProjects unit && npx tsc --noEmit -p tsconfig.json` | ⬜ pending |
| 11-09-02 | 09 | 5 | C-02 | T-11-32…T-11-37 | integration | `npx jest src/content/sync/content-sync.int-spec.ts --selectProjects integration --runInBand && npx tsc --noEmit -p tsconfig.json` | ⬜ pending |
| 11-09-03 | 09 | 5 | C-02 | T-11-32…T-11-37 | integration | `npx jest src/content/sync --selectProjects integration --runInBand && npx jest src/content --selectProjects unit && npx tsc --noEmit -p t…` | ⬜ pending |
| 11-10-01 | 10 | 6 | C-01, C-02 | T-11-38…T-11-41 | unit | `npx jest src/content/export --selectProjects unit && npx tsc --noEmit -p tsconfig.json` | ⬜ pending |
| 11-10-02 | 10 | 6 | C-01, C-02 | T-11-38…T-11-41 | integration | `npx jest src/content/export --selectProjects integration --runInBand && npx jest src/content/export --selectProjects unit && npx tsc --no…` | ⬜ pending |
| 11-11-01 | 11 | 7 | C-02 | T-11-42…T-11-45 | unit | `npx jest src/content/cli-args.spec.ts src/config --selectProjects unit && npm run build && test -f dist/content/run-content.js && node di…` | ⬜ pending |
| 11-11-02 | 11 | 7 | C-02 | T-11-42…T-11-45 | integration | `npm run build && npx jest src/content/run-content.cli.int-spec.ts --selectProjects integration --runInBand && npx jest src/content/conten…` | ⬜ pending |
| 11-12-01 | 12 | 8 | C-01, C-02, C-05, C-07 | T-11-46…T-11-49 | unit | `npx jest src/content/analysis src/content/cli-args.spec.ts --selectProjects unit && npm run build && node dist/content/run-content.js --s…` | ⬜ pending |
| 11-12-02 | 12 | 8 | C-01, C-02, C-05, C-07 | T-11-46…T-11-49 | unit | `node dist/content/run-content.js --check && npx jest src/content/content-tree.spec.ts --selectProjects unit && test "$(grep -ciE 'mongodb…` | ⬜ pending |
| 11-12-03 | 12 | 8 | C-01, C-02, C-05, C-07 | T-11-46…T-11-49 | script | `test "$(grep -ciE 'mongodb(\+srv)?://\|@[a-z0-9.-]+\.(net\|com)' .planning/phases/11-popolamento-del-mondo/reports/11-12-verify-baseline.js…` | ⬜ pending |
| 11-13-01 | 13 | 9 | C-01, C-03 | T-11-50…T-11-52 | unit | `node dist/content/run-content.js --check && npx jest src/content/content-tree.spec.ts --selectProjects unit` | ⬜ pending |
| 11-13-02 | 13 | 9 | C-01, C-03 | T-11-50…T-11-52 | unit | `node dist/content/run-content.js --check && npx jest src/content/content-tree.spec.ts --selectProjects unit` | ⬜ pending |
| 11-14-01 | 14 | 9 | C-01, C-05 | T-11-53…T-11-55 | unit | `node dist/content/run-content.js --check && npx jest src/content/content-tree.spec.ts --selectProjects unit` | ⬜ pending |
| 11-14-02 | 14 | 9 | C-01, C-05 | T-11-53…T-11-55 | unit | `node dist/content/run-content.js --check && npx jest src/content/content-tree.spec.ts --selectProjects unit` | ⬜ pending |
| 11-14-03 | 14 | 9 | C-01, C-05 | T-11-53…T-11-55 | content check | `node dist/content/run-content.js --check && node dist/content/run-content.js --stats \| node -e "let s='';process.stdin.on('data',c=>s+=c)…` | ⬜ pending |
| 11-15-01 | 15 | 10 | C-01, C-03 | T-11-56…T-11-57 | unit | `node dist/content/run-content.js --check && npx jest src/content/content-tree.spec.ts --selectProjects unit` | ⬜ pending |
| 11-15-02 | 15 | 10 | C-01, C-03 | T-11-56…T-11-57 | unit | `node dist/content/run-content.js --check && npx jest src/content/content-tree.spec.ts --selectProjects unit` | ⬜ pending |
| 11-15-03 | 15 | 10 | C-01, C-03 | T-11-56…T-11-57 | unit | `node dist/content/run-content.js --check && npx jest src/content/content-tree.spec.ts --selectProjects unit` | ⬜ pending |
| 11-16-01 | 16 | 10 | C-01, C-03, C-04 | T-11-58…T-11-60 | unit | `node dist/content/run-content.js --check && npx jest src/content/content-tree.spec.ts --selectProjects unit` | ⬜ pending |
| 11-16-02 | 16 | 10 | C-01, C-03, C-04 | T-11-58…T-11-60 | unit | `node dist/content/run-content.js --check && npx jest src/content/content-tree.spec.ts --selectProjects unit` | ⬜ pending |
| 11-17-01 | 17 | 10 | C-01, C-03, C-04 | T-11-61…T-11-63 | unit | `node dist/content/run-content.js --check && npx jest src/content/content-tree.spec.ts --selectProjects unit` | ⬜ pending |
| 11-17-02 | 17 | 10 | C-01, C-03, C-04 | T-11-61…T-11-63 | unit | `node dist/content/run-content.js --check && npx jest src/content/content-tree.spec.ts --selectProjects unit` | ⬜ pending |
| 11-18-01 | 18 | 10 | C-01, C-03, C-04 | T-11-64…T-11-66 | unit | `node dist/content/run-content.js --check && npx jest src/content/content-tree.spec.ts --selectProjects unit` | ⬜ pending |
| 11-18-02 | 18 | 10 | C-01, C-03, C-04 | T-11-64…T-11-66 | unit | `node dist/content/run-content.js --check && npx jest src/content/content-tree.spec.ts --selectProjects unit` | ⬜ pending |
| 11-19-01 | 19 | 10 | C-01, C-03, C-04, C-05 | T-11-67…T-11-69 | unit | `node dist/content/run-content.js --check && npx jest src/content/content-tree.spec.ts --selectProjects unit` | ⬜ pending |
| 11-19-02 | 19 | 10 | C-01, C-03, C-04, C-05 | T-11-67…T-11-69 | unit | `node dist/content/run-content.js --check && npx jest src/content/content-tree.spec.ts --selectProjects unit` | ⬜ pending |
| 11-19-03 | 19 | 10 | C-01, C-03, C-04, C-05 | T-11-67…T-11-69 | unit | `node dist/content/run-content.js --check && npx jest src/content/content-tree.spec.ts --selectProjects unit` | ⬜ pending |
| 11-20-01 | 20 | 10 | C-01, C-03 | T-11-70…T-11-71 | content check | `node dist/content/run-content.js --check > /tmp/klimmeck-check-20.json && node -e "const r=require('/tmp/klimmeck-check-20.json'); const …` | ⬜ pending |
| 11-20-02 | 20 | 10 | C-01, C-03 | T-11-70…T-11-71 | content check | `node dist/content/run-content.js --check > /tmp/klimmeck-check-20.json && node -e "const r=require('/tmp/klimmeck-check-20.json'); const …` | ⬜ pending |
| 11-21-01 | 21 | 10 | C-01, C-03 | T-11-72…T-11-73 | content check | `node dist/content/run-content.js --check > /tmp/klimmeck-check-21.json && node -e "const r=require('/tmp/klimmeck-check-21.json'); const …` | ⬜ pending |
| 11-21-02 | 21 | 10 | C-01, C-03 | T-11-72…T-11-73 | content check | `node dist/content/run-content.js --check > /tmp/klimmeck-check-21.json && node -e "const r=require('/tmp/klimmeck-check-21.json'); const …` | ⬜ pending |
| 11-22-01 | 22 | 11 | C-01, C-03, C-04 | T-11-74…T-11-76 | unit | `node dist/content/run-content.js --check && npx jest src/content/content-tree.spec.ts --selectProjects unit` | ⬜ pending |
| 11-22-02 | 22 | 11 | C-01, C-03, C-04 | T-11-74…T-11-76 | unit | `node dist/content/run-content.js --check && npx jest src/content/content-tree.spec.ts --selectProjects unit` | ⬜ pending |
| 11-22-03 | 22 | 11 | C-01, C-03, C-04 | T-11-74…T-11-76 | unit | `node dist/content/run-content.js --check && npx jest src/content/content-tree.spec.ts --selectProjects unit` | ⬜ pending |
| 11-23-01 | 23 | 12 | C-01, C-06 | T-11-77…T-11-79 | unit | `npx jest src/content/run-generate-quests.spec.ts src/content/generation --selectProjects unit && npm run build && test -f dist/content/ru…` | ⬜ pending |
| 11-23-02 | 23 | 12 | C-01, C-06 | T-11-77…T-11-79 | content check | `node dist/content/run-content.js --check && node -e "const r=require('./.planning/phases/11-popolamento-del-mondo/reports/11-23-generate.…` | ⬜ pending |
| 11-24-01 | 24 | 13 | C-02, C-03, C-04, C-05, C-06 | T-11-80…T-11-84 | integration | `npx jest src/content/content-wire.int-spec.ts --selectProjects integration --runInBand && npx tsc --noEmit -p tsconfig.json` | ⬜ pending |
| 11-24-02 | 24 | 13 | C-02, C-03, C-04, C-05, C-06 | T-11-80…T-11-84 | script | `test "$(grep -ciE 'mongodb(\+srv)?://\|@[a-z0-9.-]+\.(net\|com)' .planning/phases/11-popolamento-del-mondo/reports/11-24-verify-before.json…` | ⬜ pending |
| 11-24-03 | 24 | 13 | C-02, C-03, C-04, C-05, C-06 | T-11-80…T-11-84 | manual (checkpoint) | `test -f .planning/phases/11-popolamento-del-mondo/reports/11-24-verify-before.json` | ⬜ pending |
| 11-24-04 | 24 | 13 | C-02, C-03, C-04, C-05, C-06 | T-11-80…T-11-84 | script | `for f in dry-run apply-1 verify-after apply-2; do test "$(grep -ciE 'mongodb(\+srv)?://\|@[a-z0-9.-]+\.(net\|com)' .planning/phases/11-popo…` | ⬜ pending |
| 11-25-01 | 25 | 14 | C-07, C-02, C-05, C-06 | T-11-85…T-11-87 | script | `grep -q "mongodump" docs/runbooks/content-seeding.md && grep -q "mongorestore" docs/runbooks/content-seeding.md && grep -q "probableIdDiv…` | ⬜ pending |
| 11-25-02 | 25 | 14 | C-07, C-02, C-05, C-06 | T-11-85…T-11-87 | script | `grep -q "lore_queries.dart:9" .planning/phases/11-popolamento-del-mondo/BACKEND-NOTES.md && grep -q "spellDraw" .planning/phases/11-popol…` | ⬜ pending |
| 11-25-03 | 25 | 14 | C-07, C-02, C-05, C-06 | T-11-85…T-11-87 | script | `grep -q "D-15" .planning/REQUIREMENTS.md && grep -q "D-21" .planning/REQUIREMENTS.md && grep -q "D-21" .planning/ROADMAP.md` | ⬜ pending |
| 11-26-01 | 26 | 15 | C-01, C-02, C-03, C-04, C-05, C-06, C-07 | T-11-88…T-11-91 | unit | `npm run build && npx tsc --noEmit -p tsconfig.json && npm run test:cov && node -e "process.exit(require('./package.json').jest.coverageTh…` | ⬜ pending |
| 11-26-02 | 26 | 15 | C-01, C-02, C-03, C-04, C-05, C-06, C-07 | T-11-88…T-11-91 | script | `test "$(git diff origin/develop -- src/schema.gql \| grep -E '^[-+][^-+]')" = "-  unlocked: Boolean!" && node dist/content/run-content.js …` | ⬜ pending |
| 11-26-03 | 26 | 15 | C-01, C-02, C-03, C-04, C-05, C-06, C-07 | T-11-88…T-11-91 | script | `grep -q "nyquist_compliant: true" .planning/phases/11-popolamento-del-mondo/11-VALIDATION.md && grep -q "wave_0_complete: true" .planning…` | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Le infrastrutture mancanti nascono nei primi piani del codice e precedono ogni task che le usa:

- [x] `npm install yaml@2.9.1` in `dependencies` — piano 11-03 Task 1
- [x] `content/config.yaml` + `test/content-fixtures/config.yaml` — piano 11-03 Task 2
- [x] `test/content-fixtures/` (mini-albero: 3 lore, 1 magia, 1 equipaggiamento, 1 loot, 2 nemici, 1 pet, 2 quest, 4 fix, 2 città) — piano 11-04 Task 3, riusato dalle int-spec di 11-07/11-09/11-10/11-11
- [x] `test/fixtures/lore.fixture.ts` (`buildLore`/`persistLore`) — piano 11-01 Task 2
- [ ] `test/content/seed-world.ts` (`seedWorld`) — piano 11-09 Task 2, riusato da 11-10, 11-11, 11-24
- [ ] `test/content/generator-world.fixture.ts` — piano 11-08 Task 1
- [ ] `src/content/run-content.cli.int-spec.ts` (sul compilato, `npm run build` prima) — piano 11-11 Task 2
- [ ] `src/content/content-tree.spec.ts` (gate unit del vero `content/`, usato da ogni piano di stesura 11-12…11-23) — piano 11-11 Task 2
- [ ] soglia `coverageThreshold["./src/content/"]` = baseline − 2 — piano 11-26 Task 1

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Backup `mongodump` del database unico e corsie libere prima della prima `--apply` | BE-CONTENT-02 | richiede l'URI del database, che nessun esecutore deve vedere; liberare una corsia è un'azione di gioco | checkpoint del piano 11-24 Task 3: l'utente risponde «backup fatto» |
| Revisione dei contenuti (testi, numeri dei nemici, premi) | BE-CONTENT-01, 04, 05, 06 | il requisito chiede file «rivisti dall'utente»; giudizio narrativo e di bilanciamento | tabelle nei SUMMARY dei piani 11-16…11-23 e inventario in `BACKEND-NOTES.md`; modifiche nei file + `--apply` (runbook) |
| Handoff e runbook leggibili | BE-CONTENT-07 | documenti per persone | i comandi automatici del piano 11-25 controllano sezioni, assenza di URI e riferimenti FE; lettura dell'utente |
| UAT sul device delle liste lore/nemici/quest | BE-CONTENT-03, 06 | serve l'app FE senza `unlocked` e una sessione reale | FE Phase 13+; la prova automatica equivalente è `src/content/content-wire.int-spec.ts` + `--verify` a zero sul DB reale (piano 11-24) |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (unica eccezione: il checkpoint 11-24-03, che verifica la presenza del report di sola lettura)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (si spunta a fine piano 11-11)
- [x] No watch-mode flags
- [x] Feedback latency < 60s per task
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending (firmata nel piano 11-26)
