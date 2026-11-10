---
phase: 18-quest-heal-per-taglia
plan: 11
subsystem: gate
tags: [gate, handoff, validation, requirements]
requires: ["18-10"]
provides:
  - "gate della fase verde: tsc, unit completo, integration completa in quattro blocchi, boot reale, SDL solo additivo, coverage per cartella, invarianti"
  - "handoff BACKEND-NOTES.md per la FE Phase 18 (contratto verbatim, codici, extensions.recoveryUntil, prove, UAT, runbook del contenuto, finestra operativa)"
  - "VALIDATION firmata; BE-HEAL-01, 02, 04, 05, 06, 07, 09 chiusi; BE-HEAL-03 e BE-HEAL-08 aperti"
affects: []
tech-stack:
  added: []
  patterns: ["spec unitaria con modelli finti passati al costruttore (nessun jest.mock di moduli) per i rami nulli di un servizio di lettura"]
key-files:
  created:
    - src/quests/no-effect/viewer-vitals.service.spec.ts
    - .planning/phases/18-quest-heal-per-taglia/BACKEND-NOTES.md
  modified:
    - .planning/phases/18-quest-heal-per-taglia/18-VALIDATION.md
    - .planning/REQUIREMENTS.md
    - .planning/ROADMAP.md
    - .planning/STATE.md
decisions:
  - "La coverage di src/quests/no-effect si misura includendo le sue int-spec, che vivono fuori dalla cartella (src/quests/quests.resolver.int-spec.ts, src/quests/quest-updated.subscription.int-spec.ts)"
  - "Rami delle cartelle nuove sotto l'85 % → spec unitaria di ViewerVitalsService con modelli finti (87,34 % dopo)"
  - "Documenti: «gate passato, review in corso», Progress Table a 11/11 In Progress (chiusura all'orchestratore dopo fix e security)"
metrics:
  duration: "~20 min (più i tempi delle suite)"
  completed: 2026-11-10
  tasks: 3
  files: 6
---

# Phase 18 Plan 11: gate e chiusura — Summary

Gate della fase verde (tsc 0, unit 253 suite / 3219 test, integration 136 suite uniche in quattro blocchi, boot reale 84 test, SDL con 21 righe aggiunte e 0 tolte rispetto a `3b8b838c` e a `origin/develop`); handoff `BACKEND-NOTES.md` per la FE Phase 18 con la finestra operativa fra merge e contenuto in evidenza; VALIDATION firmata; sette requisiti chiusi dal codice, BE-HEAL-03 e BE-HEAL-08 lasciati aperti. Review del codice in corso: la fase non è chiusa.

## Commit

| Task | Commit | Messaggio |
|------|--------|-----------|
| 1 | 6f9b292f | test(quests): cover the null paths of the viewer vitals |
| 2 | e6bb84a8 | docs(phase-18): write the FE Phase 18 handoff |
| 3 | 5c0a20ba | docs(phase-18): sign the validation and close the code requirements |
| 3 | (questo commit) | docs(phase-18): record plan 11 progress |

## Task 1 — gate

1. **tsc:** `npx tsc --noEmit -p tsconfig.json` esce 0 (prima e dopo la spec aggiunta).
2. **Unit completo:** `npx jest --selectProjects unit` → 253 suite / 3219 test verdi in 24 s (prima della spec aggiunta; dopo: 254 suite / 3225 test, la spec nuova da sola 6/6).
3. **Integration completa senza coverage** (`--listTests` = 136 int-spec):

| Blocco | Comando (percorsi) | Suite | Test | Tempo |
|--------|--------------------|-------|------|-------|
| A | `src/quests` | 34 | 469 | 204 s (spostato in background dallo strumento dopo 180 s: attesa la notifica) |
| B | `src/characters src/shops src/lore src/economy src/models src/lootItems src/graphql test/shops test/quests test/authz test/fixtures test/harness` | 47 | 676 | 173 s |
| C | `src/travel` | 11 | 200 | 62 s |
| D | `src/auth src/authz src/cities src/eventsub src/http src/migrations src/mongo src/pendingQuests src/pointsOfInterest src/push src/rest src/roads src/throttling src/time src/users src/validation test/app.int-spec.ts test/auth` | 45 | 617 | 95 s |

   Somma 137 = 136 uniche + 1 doppione: il percorso posizionale `test/auth` è una regex e prende anche `test/authz/authorization-matrix.int-spec.ts`, già nel blocco B (verificato con `--listTests` del blocco D). Tutte verdi, nessun test instabile, `pgrep -fl 'bin/jest'` vuoto dopo ogni blocco.
4. **Boot reale e SDL:** `test/app.int-spec.ts` 84/84 in 5 s; `git diff --exit-code src/schema.gql` 0; righe tolte rispetto a `3b8b838c` 0 e rispetto a `origin/develop` 0; `grep -cF` = 1 per `type QuestCure`, `cure: QuestCure`, `type LootRecovery`, `recovery: LootRecovery`, `potionRecoveryUntil: DateTime`, `useItem(itemId: ID!): UseItemResult!`, `type UseItemResult`, `noEffect: Boolean!`; dentro i blocchi: `relatedLore` in `LootItem` 1, `injuriesHealed` in `QuestResult` 1 e in `UseItemResult` 1, `noEffect` in `Quest` 1; `QuestCureInput|LootRecoveryInput|QUEST_NO_EFFECT|POTION_RECOVERING` 0. Righe aggiunte: `potionRecoveryUntil: DateTime`, `recovery: LootRecovery`, `relatedLore: [Lore!]!`, `type LootRecovery { time: Int!, turns: Int! }`, `useItem(itemId: ID!): UseItemResult!`, `noEffect: Boolean!`, `type QuestCure { canHeal: [InjuryType!]!, lifePointsShare: Float! }`, `cure: QuestCure`, `injuriesHealed: [InjuryType!]!`, `type UseItemResult { hpAfter, hpBefore, injuriesHealed, loreUnlocked, quantityLeft, recoveryUntil }`.
5. **Coverage per cartella:**
   - `./src/quests/acceptance/`: 99,04 / 92,64 / 98,55 / 99,72 (statements / branches / functions / lines; soglie 97 / 91 / – / 98), controllo `node -e` esce 0; 6 suite / 331 test.
   - cartelle nuove `src/characters/items`, `src/quests/no-effect`, `src/quests/outcomes/injuries`: col comando del piano `src/quests/no-effect` risultava 0 % perché le sue spec sono fuori dalla cartella; con `src/quests/quests.resolver.int-spec.ts` e `src/quests/quest-updated.subscription.int-spec.ts` aggiunte: 98,5 / 83,54 / 100 / 100 (rami 132/158, sotto l'obiettivo 85). Aggiunta `src/quests/no-effect/viewer-vitals.service.spec.ts` (6 casi D-25): totale **99,62 / 87,34 / 100 / 100** (rami 138/158), 10 suite / 220 test. Per cartella: items 99,35 / 84,53 / 100 / 100; no-effect 100 / 88,09 / 100 / 100; injuries 100 / 100 / 100 / 100. I rami residui sono i metadati dei decoratori Nest (`@InjectModel`, `@Field(() => …)`) e il fallimento quasi irraggiungibile della scrittura condizionale.
   - `package.json` senza diff rispetto a `3b8b838c` (soglie invariate; controllo `node -e` sulla soglia di acceptance 97/91/98 esce 0).
6. **Lint mirato:** 59 file `.ts` aggiunti o modificati dalla fase, `npx prettier --check` + `npx eslint` uno per uno: nessun `FAIL` (resta il warning preesistente `no-base-to-string` in `test/app.int-spec.ts`).
7. **Invarianti** (tutti rispettati):

| Invariante | Esito |
|------------|-------|
| contenuto fuori dal repo (nomi migrat/seed/backfill/content; file .mjs/.json/.yaml/.csv) | 0 / 0 |
| ambiente (`.env.example`, `src/config`; `process.env.` aggiunti in produzione) | 0 / 0 |
| determinismo (`Math.random`, `Date.now` aggiunti in produzione) | 0 |
| nessun `jest.mock(` aggiunto | 0 |
| perimetro (expected-handlers, handler-fixtures, combat, characters.service, quest-eligibility, travel) | 0 righe di diff |
| ricarica fuori dal combattimento (D-16) | 0 file |
| nessun processor né coda (D-15) | 0 |
| un solo predicato (D-25): file non spec con `healHasNoEffect(` | 3 (definizione, accettazione, resolver) |
| trailer vietati su `3b8b838c..HEAD` | 0 |
| segreti (`.env` nel diff; URI nei `.md` della fase) | 0 / 0 |
| operatori Mongo nei SUMMARY | 4 righe (18-05:41, 18-07:41, 18-08:75, 18-08:80), tutte dentro code span |
| titoli dei test con operatori | 0 |
| nessuna build (`dist/`) | 0 |
| albero pulito, nessun jest residuo | sì |

## Task 2 — handoff

`BACKEND-NOTES.md` con §0 TL;DR, §1 contratto (blocchi SDL verbatim, tabelle dei codici con messaggio e quando, esempio json di `extensions.recoveryUntil`, semantica, N+1 dell'oste T-18-21), §2 comportamenti provati col percorso delle spec, §3 note per la UAT (tre heal per taglia con segnaposto, identità di test, runbook dei tre script, regole di forma, tabella D-18, **finestra operativa** con heal rifiutate da `QUEST_NO_EFFECT`, `noEffect` vero per tutti e nessuna pozione bevibile finché il contenuto non è a DB), §4 domande e deviazioni con BE-HEAL-03 e BE-HEAL-08 aperti. Grep d'accettazione: 5 sezioni `## `, tutti i nomi presenti, nessuna URI, nessun operatore Mongo; il commit tocca un solo file.

## Task 3 — validazione e requisiti

- `18-VALIDATION.md`: frontmatter `status: complete`, `nyquist_compliant: true`, `wave_0_complete: true`; righe 18-11-01..03 `✅ green` (colonna file di 18-11-02 da `❌ W0` a `✅`); Wave 0 e Sign-Off spuntati; Approval firmata con la nota «review in corso».
- `requirements mark-complete` di BE-HEAL-01, 02, 04, 05, 06, 07, 09: checkbox e tabella di tracciabilità aggiornate dallo strumento; BE-HEAL-03 e BE-HEAL-08 `[ ]` / `Pending`.
- ROADMAP: riga «Stato (2026-11-10)» sotto la lista dei piani (con «gate passato, review in corso»), `- [x] 18-11-PLAN.md`, Progress Table `11/11 | In Progress`; la riga della fase resta `[ ]`.
- STATE: Current focus, Status, Last activity, Stopped at; `Plan: 11 of 11`.

## Deviations from Plan

1. **[Rule 3 - Blocco] Comando di coverage delle cartelle nuove.** `src/quests/no-effect` non contiene spec (sono in `src/quests/`): aggiunte al comando le due int-spec che la esercitano. Nessun cambio di codice.
2. **[Rule 2 - Copertura] Rami sotto l'obiettivo dell'85 %.** Aggiunta `src/quests/no-effect/viewer-vitals.service.spec.ts` (unit, modelli finti nel costruttore, nessun `jest.mock`): richiesta senza identità, id malformato, utente senza personaggio corrente, personaggio non attivo, ferite legacy assenti → lista vuota, memo per richiesta. Verde al primo colpo per costruzione (prova codice già scritto nel piano 18-10): nessun RED osservabile.
3. **Blocco D con un doppione:** la regex posizionale `test/auth` prende anche `test/authz/authorization-matrix.int-spec.ts`; annotato, non rieseguito.
4. **Ordine dei commit del Task 3:** la riga 18-11-03 della VALIDATION è passata a `✅ green` già nel commit di firma (insieme alle altre due), non nel commit di bookkeeping.
5. **Sign-Off «Feedback latency < 150 s» spuntato:** vale per le spec mirate dei task; il blocco integration `src/quests` intero ha richiesto 204 s in questo gate.

## Known Stubs

Nessuno.

## Threat Flags

Nessuna superficie nuova: una spec di test e documenti.

## Self-Check: PASSED

File creati presenti (`src/quests/no-effect/viewer-vitals.service.spec.ts`, `BACKEND-NOTES.md`); commit 6f9b292f, e6bb84a8, 5c0a20ba presenti in `git log`.
