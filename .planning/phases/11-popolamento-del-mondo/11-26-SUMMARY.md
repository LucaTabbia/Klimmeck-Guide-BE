---
phase: 11-popolamento-del-mondo
plan: 26
subsystem: gate
tags: [gate, coverage, validation, traceability, be-content-01, be-content-02, be-content-03, be-content-04, be-content-05, be-content-06, be-content-07]
requires:
  - phase: 11-01..11-25, 11-27
    provides: codice del seeder, contenuto, caricamento sul DB reale, runbook e handoff
provides:
  - gate finale della Phase 11 verde (build, tsc, test:cov, SDL, lint mirato, --check, segreti, trailer)
  - soglia di coverage `./src/content/` S 92 / B 81 / L 93
  - VALIDATION approvata, BE-CONTENT-01..07 Complete, ROADMAP 27/27 Complete, STATE fase completa
affects: [code review, verifica e security audit della Phase 11, PR draft verso develop, quick task FE su `unlocked`]
tech-stack:
  added: []
  patterns: []
key-files:
  created:
    - .planning/phases/11-popolamento-del-mondo/11-26-SUMMARY.md
  modified:
    - package.json
    - .planning/phases/11-popolamento-del-mondo/11-VALIDATION.md
    - .planning/REQUIREMENTS.md
    - .planning/ROADMAP.md
    - .planning/STATE.md
key-decisions:
  - "Soglia `./src/content/` = floor(baseline − 2) su statements/branches/lines: 92 / 81 / 93 (baseline 94.7 / 83.4 / 95.6 su 45 file)"
  - "Fase chiusa come Complete a 27/27 (nota dell'orchestratore), frontmatter STATE `status: phase-complete`; la PR resta in draft fino al quick task FE su `unlocked`"
requirements-completed: [BE-CONTENT-01, BE-CONTENT-02, BE-CONTENT-03, BE-CONTENT-04, BE-CONTENT-05, BE-CONTENT-06, BE-CONTENT-07]
duration: ~25 min
completed: 2026-11-02
---

# Phase 11 Plan 26: Gate finale, coverage del contenuto e chiusura Summary

Gate finale della Phase 11 verde: `test:cov` 326 suite / 4184 test con la nuova soglia `./src/content/` (S 92 / B 81 / L 93 da baseline 94.7 / 83.4 / 95.6), SDL contro `origin/develop` limitato alle due righe dichiarate, prettier/eslint puliti sui 110 `.ts` della fase, `--check` exit 0; VALIDATION firmata, BE-CONTENT-01..07 Complete, ROADMAP 27/27 Complete e STATE con la fase chiusa e la PR in draft fino al quick task FE.

## Performance

- **Inizio:** 2026-11-02T13:12:15Z
- **Fine:** 2026-11-02T13:40Z circa
- **Task:** 3
- **File modificati:** 5 (+ questo SUMMARY)

## Task 1 — suite completa, baseline e soglia

| Gate | Esito |
|------|-------|
| `npm run build` | exit 0 |
| `npx tsc --noEmit -p tsconfig.json` | exit 0 |
| `npm run test:cov` (prima della soglia) | exit 0, `Test Suites: 326 passed, 326 total`, `Tests: 4184 passed, 4184 total`, 374 s; totali S 96.36 / B 84.95 / F 93.3 / L 96.98 |
| `npm run test:cov` (con la soglia) | exit 0, 326 / 4184, 377 s; stessi totali |
| `node -e "…coverageThreshold['./src/content/']…"` | exit 0 |
| `pgrep -fl jest` | vuoto |

Baseline di `src/content/` (somma dei 45 file con `/src/content/` in `coverage/coverage-summary.json`):

| Metrica | Coperti / totali | Baseline | Soglia (floor(baseline − 2)) |
|---------|------------------|----------|------------------------------|
| statements | 2095 / 2213 | 94.7 | 92 |
| branches | 937 / 1124 | 83.4 | 81 |
| lines | 1936 / 2025 | 95.6 | 93 |
| (functions, non in soglia) | 693 / 713 | 97.2 | — |

Commit `d5c5b39` `test(content): enforce the content coverage threshold` (solo `package.json`, modificato con Edit, senza prettier).

## Task 2 — invarianti (nessuna correzione necessaria, nessun commit)

| Controllo | Esito |
|-----------|-------|
| 1. `git diff origin/develop -- src/schema.gql \| grep -E '^[-+][^-+]'` | esattamente `-  unlocked: Boolean!` poi `+  description: String` |
| 2. prettier `--check` sui 110 `.ts` di `git diff --name-only origin/develop -- '*.ts'` | «All matched files use Prettier code style!» |
| 2. eslint sugli stessi file | exit 0, 0 errori, 1 warning preesistente (`no-base-to-string` in `test/app.int-spec.ts:825`) |
| 3. `node dist/content/run-content.js --check` | exit 0; conteggi lore 405, spells 88, equipmentitems 172, lootitems 101, enemies 150, pets 13, quests 581; 1 warning (titolo doppio di Necrorian, `quests/dungeon.yaml:745`) |
| 3. `process.env.` nel codice di produzione di `src/content` | vuoto |
| 3. `npx jest src/config --selectProjects unit` (drift) | 14 suite / 223 test verdi |
| 4. `.env` in `git diff origin/develop --stat` | 0 |
| 4. URI Mongo non placeholder | 3 file con match, tutti innocui: l'URI di loopback irraggiungibile `127.0.0.1:1` del test di fallimento del CLI (`11-11-PLAN.md:130`) e il prefisso citato in prosa («stdout senza …») in `11-11-SUMMARY.md:65` e `11-RESEARCH.md:629`; nessun host reale, nessuna credenziale |
| 5. trailer `Co-Authored-By` / `Generated with` su `origin/develop..HEAD` | 0 |

Subject oltre 72 caratteri nella storia del branch (166 commit, storia non riscritta, amend vietato): `e9119da` (74, eccezione nota), più `a021841` (74, `docs(phase-11): amend context, requirements and roadmap after the research`, commit di pianificazione) e `0f7eb93` (111, `docs(roadmap): add phases 11-16 …`, commit della ROADMAP del 2026-10-29 entrato col merge `b55d47b`). Nessuno di questo piano.

## Task 3 — VALIDATION, requisiti, ROADMAP, STATE

- `11-VALIDATION.md`: `status: complete`, `nyquist_compliant: true`, `wave_0_complete: true`; righe `11-26-01..03` `✅ green` (le altre erano già verdi); voce Wave 0 della soglia spuntata; riga «Execution sign-off (11-26, 2026-11-02)» con i numeri misurati; `**Approval:** approved 2026-11-02`.
- `requirements mark-complete BE-CONTENT-01..07`: `marked_complete` per i 7 id, 7 checkbox `[x]` (`grep -c` = 7); la riga di traceability aggregata `| BE-CONTENT-01..07 | Phase 11 | … |` non era toccata dal tool ed è stata portata a `Complete` a mano.
- ROADMAP: `| 11. Popolamento del mondo | 27/27 | Complete | 2026-11-02 |`, `- [x] 11-26-PLAN.md`, bullet di fase `[x]`, nota sulla PR in draft fino al quick task FE nella riga `**Plans**`, criterio 5 «circa 20» → «27».
- STATE: `Plan: 27 of 27`, `status: phase-complete`, `stopped_at: Phase 11 complete — PR in draft until the FE quick task`, `Status:`/`Last activity:`/`Progress:` aggiornati, voce in Blockers/Concerns con il prossimo passo (PR draft, quick task FE, revisioni dell'utente).
- Commit `a0dad7e` `docs(phase-11): complete phase execution`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug di documento] Criterio 5 della ROADMAP**
- **Trovato durante:** Task 3 (nota dell'orchestratore)
- **Problema:** il criterio 5 della Phase 11 diceva «circa 20 equipaggiamenti unici»; il reale (e BE-CONTENT-05) è 27 (`content/equipment/unici.yaml`)
- **Correzione:** «circa 20» → «27»
- **Commit:** `a0dad7e`

**2. [Rule 3 - Bloccante] Legenda della VALIDATION**
- **Trovato durante:** Task 3, criterio `grep -c "⬜ pending"` = 0
- **Problema:** la riga di legenda `*Status: ⬜ pending · …*` conteneva il letterale cercato
- **Correzione:** legenda riscritta in `⬜ = pending`, stesso significato
- **Commit:** `a0dad7e`

**3. [Rule 2 - Coerenza] Riga di traceability aggregata**
- **Problema:** `requirements mark-complete` spunta le checkbox ma non la riga `| BE-CONTENT-01..07 | Phase 11 | Pending … |`
- **Correzione:** portata a `Complete (aggiunti 2026-10-29, chiusi 2026-11-02)`
- **Commit:** `a0dad7e`

### Altre deviazioni

1. **`test:cov` in background per opera dell'harness:** entrambe le corse di `npm run test:cov` sono state lanciate in foreground con `timeout: 600000`; l'harness le ha spostate in background dopo 180 s (non è stato il limite dei 600 s). Ho atteso la notifica di completamento senza polling e senza altri jest in parallelo; nessuna è stata uccisa (374 s e 377 s, exit 0).
2. **Commit di Task 3 e di bookkeeping:** il piano raccoglie VALIDATION/REQUIREMENTS/ROADMAP/STATE nel commit `docs(phase-11): complete phase execution`; il commit finale `docs(phase-11): record plan 26 progress` contiene il solo SUMMARY.
3. **ROADMAP `Complete` invece di `In Progress`:** le regole generiche di bookkeeping dicono `In Progress`; la nota specifica dell'orchestratore per questo piano (e il piano stesso) chiede `27/27 | Complete | 2026-11-02`: applicata quest'ultima.

## Known Stubs

Nessuno.

## Manual-only pendenti (all'utente, non gap)

Quick task FE che toglie `unlocked` (prima della merge della PR); revisione dei contenuti (581 quest contro 475 stimate, titolo doppio di Necrorian `6ae80db9da5c5f8cc552680c`, numeri da calibrare elencati in `BACKEND-NOTES.md`); lettura di runbook e handoff; UAT sul device nelle FE Phase 13+.

## Self-Check: PASSED

- `package.json` (soglia `./src/content/`), `11-VALIDATION.md`, `REQUIREMENTS.md`, `ROADMAP.md`, `STATE.md` e questo SUMMARY presenti
- commit `d5c5b39` e `a0dad7e` presenti in `git log`
