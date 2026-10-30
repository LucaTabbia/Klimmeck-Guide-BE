---
phase: 10-hardening-trasversale
plan: 31
subsystem: gate
tags: [gate, regression, coverage, traceability, validation, be-hard-01, be-hard-02, be-hard-03, be-hard-04, be-hard-05, be-hard-06, be-hard-07, be-hard-08]
requires:
  - phase: 10-01..10-30
    provides: codice, test, soglie, runbook e handoff della fase
provides:
  - gate finale della Phase 10 verde (build, tsc, unit, coverage, boot reale, SDL, invarianti)
  - VALIDATION approvato (`nyquist_compliant: true`, `wave_0_complete: true`, otto righe per requisito verdi)
  - BE-HARD-01..08 Complete in REQUIREMENTS
  - azioni dell'utente prima della PR pronta tracciate in STATE
affects: [code review, verifica e security audit della Phase 10, PR draft verso develop, FE Phase 10 (piano gated 10-11)]
tech-stack:
  added: []
  patterns: ["prova d'assenza nei log con `toEqual` sul messaggio intero"]
key-files:
  created:
    - .planning/phases/10-hardening-trasversale/10-31-SUMMARY.md
  modified:
    - src/characters/pending-quest-start.publisher.spec.ts
    - .planning/phases/10-hardening-trasversale/10-VALIDATION.md
    - .planning/REQUIREMENTS.md
    - .planning/ROADMAP.md
    - .planning/STATE.md
key-decisions:
  - "L'unico invariante rosso (una prova d'assenza per stringa nella spec del publisher degli avvii, 10-22) è corretto nella sola spec con `toEqual` sul messaggio di log intero; nessun file di produzione toccato"
  - "La riga Progress Table resta `In Progress` a 31/31: la chiusura `Complete` spetta all'orchestratore dopo review, verify e security"
requirements-completed: [BE-HARD-01, BE-HARD-02, BE-HARD-03, BE-HARD-04, BE-HARD-05, BE-HARD-06, BE-HARD-07, BE-HARD-08]
duration: ~15 min
completed: 2026-10-30
---

# Phase 10 Plan 31: Gate finale e traceability Summary

Gate finale della Phase 10 verde end-to-end sul ramo `feat/10-hardening`: build, type check, `test:unit` 179/2392, `test:cov` 278/3667 con le otto soglie per cartella, boot reale 65/65, SDL con la sola riga additiva `pendingQuest: ID`, invarianti di fase verdi dopo una correzione di sola spec; VALIDATION approvato, BE-HARD-01..08 Complete, azioni dell'utente prima della PR pronta tracciate in STATE.

## Performance

- **Inizio:** 2026-10-30T14:32:46Z
- **Fine:** 2026-10-30T14:47Z circa
- **Task:** 2
- **File modificati:** 5 (+ questo SUMMARY)

## Task 1 — gate di regressione, schema e invarianti

Eseguiti in foreground, nell'ordine (build prima di `test:cov`):

| Gate | Esito |
|------|-------|
| `npm run build` | exit 0 (6 s), emette `dist/migrations/run-mixed-refs.js` |
| `npx tsc --noEmit -p tsconfig.json` | exit 0 (7 s) |
| `npm run test:unit` | 179 suite / 2392 test, 10,5 s; rilanciato dopo la correzione della spec: 179 / 2392, 8,6 s |
| `npm run test:cov` | exit 0, 278 suite / 3667 test, 412 s (417 s a muro); totale S 96.55 / B 85.14 / F 91.44 / L 97.1 |
| soglie per cartella (S/B/L misurate contro soglia) | `./src/auth/` 99.83/86.71/100 ≥ 97/84/98; `./src/economy/` 100/93.88/100 ≥ 98/91/98; `./src/characters/spells/` 99.26/90.05/99.45 ≥ 97/88/97; `./src/characters/equipment/` 100/100/100 ≥ 98/98/98; `./src/characters/characters.service.ts` 98.26/90.38/100 ≥ 96/88/98; `./src/quests/acceptance/` 99.41/93.25/100 ≥ 97/91/98; `./src/eventsub/` 99.40/94.03/99.49 ≥ 97/92/97; `./src/travel/` 99.55/86.96/100 ≥ 97/84/98 |
| boot reale `npx jest test/app.int-spec.ts --selectProjects integration --runInBand` | 1 suite / 65 test, 7 s |
| `git diff --exit-code src/schema.gql` | exit 0 |
| SDL vs `origin/develop` | 0 righe rimosse; righe aggiunte: solo `+  pendingQuest: ID` |
| conteggi contro la baseline del RESEARCH (217 / 3089) | 278 suite / 3667 test: superata |
| `git diff --name-only origin/develop...HEAD \| wc -l` | 377 file (prima del commit di chiusura) |
| ESLint sui 284 `.ts` del ramo | exit 0 (0 errori, 27 warning preesistenti/annotati) |
| Prettier `--check` sugli stessi file | tutti formattati, nessuna eccezione |

Il test instabile del boot reale (global auth guard, deferred dal 10-24) NON si è ripresentato: `test:cov` verde al primo run, boot reale isolato verde.

### Invarianti del passo 4

| Invariante | Esito |
|------------|-------|
| operatori Mongo nei commenti nuovi | vuoto |
| operatori nei titoli dei test | vuoto |
| parole vietate nel codice di produzione | vuoto |
| identificatori nuovi con `Placeholder` (escluso `PlaceholderCombatResolver`) | vuoto |
| prove d'assenza per stringa (`not.toContain('…')`) | 1 riga in `src/characters/pending-quest-start.publisher.spec.ts` (10-22) → corretta con `toEqual` sul messaggio intero (commit `dbfc6e7`), poi vuoto |
| `@Public()` nel codice di produzione | 6 su HEAD = 6 su `origin/develop` (vedi deviazione 2 sul comando) |
| handler limitati `@Throttled()` / `@ThrottledWebhook()` | 8 |
| `process.env` nel codice di produzione | solo `src/migrations/run-mixed-refs.ts` |
| dipendenze nuove in `package.json` | solo `@nestjs/throttler`, `class-transformer`, `class-validator` più le chiavi di configurazione di Jest (`collectCoverageFrom`, `coverageDirectory`, `coverageReporters`, `coverageThreshold`) |
| trailer `Co-Authored-By` / `Generated with` sul ramo | 0 |
| subject > 72 caratteri sul ramo | 2: `d9d7984` (73, noto dal 10-26) e `dbfc6e7` (73, questo piano, vedi deviazione 1); storia non riscritta |
| `pgrep -fl jest` | vuoto |
| `Types.Mixed` in `src/models` | vuoto |
| lettori tolleranti (chiamate, `$NF`, develop → HEAD) | `refIdOf` 46 → 49, `idForms` 50 → 54, `sameId` 26 → 26, `objectIdFromHex` 37 → 38 |

## Task 2 — VALIDATION, traceability, ROADMAP, STATE

- `10-VALIDATION.md`: frontmatter `status: complete`, `nyquist_compliant: true`, `wave_0_complete: true`; righe `10-31-01` e `10-31-02` aggiunte (tutte le righe `10-NN-TT` sono `✅ green`); otto righe per requisito `✅ green` con `npm run test:cov` (gate 10-31) aggiunto al comando e 10-30, 10-31 ai piani; Wave 0 e Validation Sign-Off spuntati; riga «Execution sign-off (10-31, 2026-10-30)» con i numeri misurati e i manual-only pendenti; `**Approval:** approved 2026-10-30`. La riga manual-only del 10-29 e la nota «Gate wave 8» restano.
- `requirements mark-complete BE-HARD-01..08`: il tool ha risposto `marked_complete` per gli 8 id e ha cambiato esattamente 16 righe (8 checkbox `- [x] **BE-HARD-0N**` e 8 righe `| BE-HARD-0N | Phase 10 | Complete |`), nient'altro; nessuna correzione a mano.
- ROADMAP: `| 10. Hardening Trasversale | 31/31 | In Progress | - |`, `- [x] 10-31-PLAN.md`; `**Plans**: 31 plans` era già presente; il bullet di fase in testa resta `- [ ]`.
- STATE: `Plan: 31 of 31`, `Status:`/`Last activity:` del corpo, `stopped_at`/`last_activity`/`last_updated` del frontmatter, voce in `### Blockers/Concerns` con le azioni dell'utente; blocco `progress:` intatto.
- Gate dei letterali sui `.md` del ramo: vuoto prima e dopo il commit.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug di test] Prova d'assenza per stringa nella spec del publisher degli avvii**
- **Trovato durante:** Task 1, invariante «nessuna prova d'assenza per stringa»
- **Problema:** `src/characters/pending-quest-start.publisher.spec.ts` (10-22), caso «logs the code of a failed read without republishing», provava l'assenza del messaggio grezzo del driver con `not.toContain('…')`, vietato dalle regole di fase
- **Correzione:** le quattro asserzioni sul messaggio (lunghezza, id, codice, assenza) sostituite da un unico `toEqual` sull'elenco dei messaggi di ERROR con il testo intero (`Ripubblicazione dei personaggi della missione in attesa <id> fallita: Error, code 112`); verde al primo colpo (il codice di produzione era già corretto), più restrittivo di prima
- **File:** `src/characters/pending-quest-start.publisher.spec.ts`
- **Commit:** `dbfc6e7`
- **Verifica:** spec 6/6, prettier ed eslint puliti, `tsc` 0, `npm run test:unit` 179/2392; `test:cov` non rilanciato (modifica di sola asserzione in una spec unit, già coperta dal run di `test:unit`)

### Altre deviazioni

1. **Subject di 73 caratteri in `dbfc6e7`:** il conteggio è stato concatenato al commit nella stessa riga di comando invece di precederlo; il subject supera di un carattere il limite di 72. Storia non riscritta (vietati amend/rebase/reset); il controllo `awk 'length > 72'` del `<automated>` del Task 1 ora elenca `d9d7984` (noto dal 10-26) e `dbfc6e7`.
2. **Comando di confronto dei `@Public()`:** il comando del piano usa `\s` con `git grep -E`, che su macOS non lo riconosce e conta 0 su `origin/develop`; ripetuto con `[[:space:]]`: 6 su `origin/develop`, 6 su HEAD.
3. **Data della voce in STATE:** il piano scrive 2026-10-29 nel titolo della voce di Blockers/Concerns; usata la data reale di esecuzione, 2026-10-30 (istruzione dell'orchestratore).
4. **Commit di Task 1:** il piano prevede nessun commit se tutto è verde; un invariante era rosso, quindi c'è un commit `test(characters)` di sola spec prima del commit di chiusura.

## Deferred Issues (per la code review)

- Test instabile del boot reale (`test/app.int-spec.ts` › global auth guard: «rejects an existing mutation without a bearer», «keeps introspection available outside production (D-05)»): 1 fallimento su 3 run di `test:cov` al 10-24, poi verde in tutti i run successivi, incluso questo (`test:cov` al primo colpo, boot isolato 65/65); spec non toccata.
- Due subject di 73 caratteri sul ramo (`d9d7984`, `dbfc6e7`).
- 27 warning ESLint sui file del ramo (0 errori), preesistenti o annotati nei piani precedenti (es. `require-await` su `AppThrottlerGuard.throwThrottlingException`, `no-base-to-string` in `test/app.int-spec.ts`).

## Manual-only pendenti (all'utente, non gap)

Migrazione dei ref in produzione secondo `docs/runbooks/mixed-refs-migration.md` (PR draft fino al report di `--verify` della produzione); primo `workflow_dispatch` di `Secret scan` e gestione dei finding; conferma della policy Sightengine e dei default del throttler (`BACKEND-NOTES.md` §11); una chiamata Sightengine reale per A2; `THROTTLE_TRUST_PROXY` quando la topologia sarà nota; UAT del pannello del GM nella FE Phase 10 dopo la merge.

## Known Stubs

Nessuno.

## Self-Check: PASSED

- `src/characters/pending-quest-start.publisher.spec.ts`, `10-VALIDATION.md`, `REQUIREMENTS.md`, `ROADMAP.md`, `STATE.md` e questo SUMMARY presenti
- commit `dbfc6e7` presente in `git log`
