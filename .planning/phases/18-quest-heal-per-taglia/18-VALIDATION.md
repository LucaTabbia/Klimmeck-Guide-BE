---
phase: 18
slug: quest-heal-per-taglia
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-11-10
---

# Phase 18 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 30 + ts-jest (progetti `unit` e `integration`, `package.json`), `MongoMemoryReplSet` condiviso (`test/setup/`), harness `createCharactersTestApp` / `createOutcomeHarness` / `createAuthTestApp`, `FixedClock`, `test/harness/prime-change-stream.ts`, boot reale `test/app.int-spec.ts` |
| **Config file** | `package.json` (sezione `jest`, `coverageThreshold` per cartella; la fase tocca sotto soglia solo `./src/quests/acceptance/` 97/91/98) |
| **Quick run command** | `npx jest <spec toccate> --selectProjects unit` / `npx jest <spec toccate> --selectProjects integration --runInBand` (il comando `<automated>` del task) |
| **Full suite command** | nel piano di gate: `npx jest --selectProjects unit` + integration a blocchi per cartella senza coverage (`src/quests`, blocco personaggi/negozi/lore/economia/modelli/harness, `src/travel`, resto); `npm run test:cov` solo dall'orchestratore in background |
| **Estimated runtime** | unit ≈ 10 s; boot reale ≈ 6 s; integration `src/quests` ≈ 150 s; blocco personaggi/negozi/lore/economia/modelli/harness ≈ 130 s; `src/travel` non misurata; `test:cov` ≈ 630 s (fuori dai 600 s dello strumento) |

---

## Sampling Rate

- **After every task commit:** il comando `<automated>` del task + `npx tsc --noEmit -p tsconfig.json` + `pgrep -fl 'bin/jest'` vuoto + controllo trailer `git log -1 --format=%B | grep -ciE "co-authored-by|generated with|claude-session"` = 0
- **After every plan wave:** `npx jest --selectProjects unit` (≈ 10 s) + `npx jest test/app.int-spec.ts --selectProjects integration --runInBand` (≈ 6 s) + il blocco integration dell'area toccata (un piano = una wave, catena lineare)
- **Before `/gsd-verify-work`:** gate del piano 18-11 verde (unit completo, integration completa a blocchi con `src/travel`, boot reale, `git diff --exit-code src/schema.gql`, SDL solo additivo)
- **Max feedback latency:** 150 s (blocco integration di `src/quests`); 10–30 s per le spec mirate

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 18-01-01 | 01 | 1 | BE-HEAL-02 | T-18-02 | `cureInjuries`: insieme, ordine del personaggio, voci ignote ignorate, input intatti | unit | `npx jest src/quests/outcomes/injuries/cure-injuries.spec.ts --selectProjects unit` | ✅ | ✅ green |
| 18-01-02 | 01 | 1 | BE-HEAL-02 | T-18-01, T-18-03 | `cureOf` sanificante (quota fuori scala = 0, mai 1) e tetto con clamp | unit | `npx jest src/quests/outcomes/injuries --selectProjects unit` | ✅ | ✅ green |
| 18-01-03 | 01 | 1 | BE-HEAL-02 | — | bookkeeping | doc | `grep -qF -- "- [x] 18-01-PLAN.md" .planning/ROADMAP.md` | ✅ | ✅ green |
| 18-02-01 | 02 | 2 | BE-HEAL-01 | T-18-04, T-18-05, T-18-06, T-18-07 | schema della cura validato su `create`, SDL solo additivo, input fuori dallo SDL, aid senza cura | unit + integration | `npx jest src/models/quest src/quests/outcomes/aid --selectProjects unit` + `npx jest test/app.int-spec.ts --selectProjects integration --runInBand` | ✅ | ✅ green |
| 18-02-02 | 02 | 2 | BE-HEAL-04 | T-18-05, T-18-08 | `injuriesHealed` su modello, draft, soccorso, morte, fixture e SDL nello stesso commit | unit + integration | `npx jest src/models/quest-result src/quests/outcomes src/quests/results --selectProjects unit` + boot reale | ✅ | ✅ green |
| 18-02-03 | 02 | 2 | BE-HEAL-01 | — | bookkeeping | doc | `grep -qF -- "- [x] 18-02-PLAN.md" .planning/ROADMAP.md` | ✅ | ✅ green |
| 18-03-01 | 03 | 3 | BE-HEAL-02 | T-18-09, T-18-10, T-18-11, T-18-12, T-18-13 | cura da `prizes.cure` dopo combattimento e progressione (D-20), nulla su sconfitta, filtro invariato, ricarica mai scritta dall'esito | unit + integration | `npx jest src/quests/outcomes --selectProjects unit` + `npx jest src/quests/outcomes/quest-resolution.service.int-spec.ts --selectProjects integration --runInBand` | ✅ | ✅ green |
| 18-03-02 | 03 | 3 | BE-HEAL-04, BE-HEAL-05 | T-18-09 | cura sopra l'override del GM; `injuriesHealed` sul filo, legacy → lista vuota | integration | `npx jest src/quests/outcomes/gm-completion.service.int-spec.ts src/quests/results/quest-result.resolver.int-spec.ts --selectProjects integration --runInBand` | ✅ | ✅ green |
| 18-03-03 | 03 | 3 | BE-HEAL-02 | — | bookkeeping | doc | `grep -qF -- "- [x] 18-03-PLAN.md" .planning/ROADMAP.md` | ✅ | ✅ green |
| 18-04-01 | 04 | 4 | BE-HEAL-06 | T-18-14, T-18-15, T-18-16, T-18-17 | `recovery` interi non negativi su `create`, `relatedLore` ref non Mixed, input fuori dallo SDL | unit + integration | `npx jest src/models/loot-item.model.spec.ts src/migrations/mixed-refs/mixed-ref-paths.spec.ts test/fixtures/fixtures.spec.ts --selectProjects unit` + boot reale | ✅ | ✅ green |
| 18-04-02 | 04 | 4 | BE-HEAL-06 | T-18-17, T-18-18 | `potionRecoveryUntil` data nullable, fuori da ogni input | unit + integration | `npx jest src/models/character --selectProjects unit` + boot reale | ✅ | ✅ green |
| 18-04-03 | 04 | 4 | BE-HEAL-06 | — | bookkeeping | doc | `grep -qF -- "- [x] 18-04-PLAN.md" .planning/ROADMAP.md` | ✅ | ✅ green |
| 18-05-01 | 05 | 5 | BE-HEAL-06 | T-18-22 | id visibili da ref non popolati: stringhe lette, illeggibili e duplicati scartati | unit | `npx jest src/lore/lore-visibility.spec.ts --selectProjects unit` | ✅ | ✅ green |
| 18-05-02 | 05 | 5 | BE-HEAL-06, BE-HEAL-08 | T-18-19, T-18-20, T-18-21 | `LootItem.relatedLore` per viewer: giocatore le sole sbloccate, oste tutte, nessun personaggio nulla, orfani scartati, nessuna query senza lore visibili | integration | `npx jest src/lore/lore-related.int-spec.ts src/lore/viewer-knowledge.service.int-spec.ts test/app.int-spec.ts --selectProjects integration --runInBand` | ✅ | ✅ green |
| 18-05-03 | 05 | 5 | BE-HEAL-06 | — | bookkeeping | doc | `grep -qF -- "- [x] 18-05-PLAN.md" .planning/ROADMAP.md` | ✅ | ✅ green |
| 18-06-01 | 06 | 6 | BE-HEAL-07 | T-18-24 | tre codici con factory; la data solo nelle `extensions`, mai nel body | unit | `npx jest src/gameRules --selectProjects unit` | ✅ | ✅ green |
| 18-06-02 | 06 | 6 | BE-HEAL-07 | T-18-23, T-18-25, T-18-26 | allowlist della sola chiave `recoveryUntil` col suo codice e in forma ISO, anche in produzione; `reason` della Phase 17 intatta | unit + integration | `npx jest src/graphql src/gameRules --selectProjects unit` + `npx jest src/graphql/production-surface.int-spec.ts --selectProjects integration --runInBand` | ✅ | ✅ green |
| 18-06-03 | 06 | 6 | BE-HEAL-07 | — | bookkeeping | doc | `grep -qF -- "- [x] 18-06-PLAN.md" .planning/ROADMAP.md` | ✅ | ✅ green |
| 18-07-01 | 07 | 7 | BE-HEAL-07 | T-18-27, T-18-28, T-18-30 | piano puro della bevuta: lettori sanificanti, cinque path, filtro con lo snapshot | unit | `npx jest src/characters/items/item-use.plan.spec.ts --selectProjects unit` | ✅ | ✅ green |
| 18-07-02 | 07 | 7 | BE-HEAL-07 | T-18-28, T-18-29, T-18-31 | cinque rifiuti in ordine, confine al millisecondo, nessun effetto sull'esito pianificato | unit | `npx jest src/characters/items/item-use.plan.spec.ts --selectProjects unit` | ✅ | ✅ green |
| 18-07-03 | 07 | 7 | BE-HEAL-07 | — | bookkeeping | doc | `grep -qF -- "- [x] 18-07-PLAN.md" .planning/ROADMAP.md` | ✅ | ✅ green |
| 18-08-01 | 08 | 8 | BE-HEAL-06, BE-HEAL-07, BE-HEAL-08 | T-18-32, T-18-36, T-18-38 | `useItem` sul filo: solo il personaggio del bearer, rifiuti senza scrittura, ricarica, lore alla prima bevuta, viaggio consentito | integration | `npx jest src/characters/items/use-item.int-spec.ts --selectProjects integration --runInBand` | ✅ | ✅ green |
| 18-08-02 | 08 | 8 | BE-HEAL-07 | T-18-33, T-18-34, T-18-35, T-18-37, T-18-39 | una scrittura in transazione, due bevute parallele, scrittura concorrente non persa; SDL e «senza bearer» nel boot reale; matrice invariata | integration | `npx jest src/characters/items test/app.int-spec.ts --selectProjects integration --runInBand` + `npx jest test/authz --selectProjects unit integration --runInBand` | ✅ | ✅ green |
| 18-08-03 | 08 | 8 | BE-HEAL-07 | — | bookkeeping | doc | `grep -qF -- "- [x] 18-08-PLAN.md" .planning/ROADMAP.md` | ✅ | ✅ green |
| 18-09-01 | 09 | 9 | BE-HEAL-09 | T-18-42 | predicato puro `healHasNoEffect` (vita sotto/sul/sopra il tetto × ferite dentro/fuori lista, cura assente, quota 0) e codice `QUEST_NO_EFFECT` | unit | `npx jest src/quests/outcomes/injuries src/gameRules --selectProjects unit` | ❌ W0 | ⬜ pending |
| 18-09-02 | 09 | 9 | BE-HEAL-09 | T-18-40, T-18-41, T-18-43, T-18-44 | `acceptQuest` rifiuta la heal senza effetto prima di ogni scrittura; altri tipi accettati; eleggibilità prima | integration | `npx jest src/quests/acceptance --selectProjects unit integration --runInBand` | ✅ | ⬜ pending |
| 18-09-03 | 09 | 9 | BE-HEAL-09 | — | bookkeeping | doc | `grep -qF -- "- [x] 18-09-PLAN.md" .planning/ROADMAP.md` | ✅ | ⬜ pending |
| 18-10-01 | 10 | 10 | BE-HEAL-09 | T-18-45, T-18-46, T-18-47, T-18-48 | `Quest.noEffect` per viewer sulle query: due personaggi valori diversi, non heal → falso, oste con un proprio personaggio → stesso valore di chiunque, senza personaggio → falso, una lettura per richiesta | integration | `npx jest src/quests/quests.resolver.int-spec.ts --selectProjects integration --runInBand` | ✅ | ⬜ pending |
| 18-10-02 | 10 | 10 | BE-HEAL-09 | T-18-45, T-18-49 | campo risolto per subscriber e a ogni evento su `questUpdated`; SDL con la sola riga nuova | integration | `npx jest src/quests/quest-updated.subscription.int-spec.ts test/app.int-spec.ts --selectProjects integration --runInBand` | ✅ | ⬜ pending |
| 18-10-03 | 10 | 10 | BE-HEAL-09 | — | bookkeeping | doc | `grep -qF -- "- [x] 18-10-PLAN.md" .planning/ROADMAP.md` | ✅ | ⬜ pending |
| 18-11-01 | 11 | 11 | BE-HEAL-05 | T-18-50, T-18-51, T-18-52, T-18-53, T-18-54 | `tsc`, unit e integration complete a blocchi (con `src/travel`), boot reale, SDL solo additivo, coverage per cartella, invarianti | gate | `npx tsc --noEmit -p tsconfig.json` + `npx jest --selectProjects unit` + blocchi integration + `git diff --exit-code src/schema.gql` | ✅ | ⬜ pending |
| 18-11-02 | 11 | 11 | BE-HEAL-03, BE-HEAL-05, BE-HEAL-08 | T-18-52, T-18-56 | handoff col contratto verbatim, prove, UAT e runbook del contenuto, senza segreti | doc | `grep -q recoveryUntil .planning/phases/18-quest-heal-per-taglia/BACKEND-NOTES.md` | ❌ W0 | ⬜ pending |
| 18-11-03 | 11 | 11 | BE-HEAL-01, BE-HEAL-02, BE-HEAL-04, BE-HEAL-05, BE-HEAL-06, BE-HEAL-07, BE-HEAL-09 | T-18-55 | sette requisiti chiusi dal codice, BE-HEAL-03 e BE-HEAL-08 lasciati aperti; VALIDATION firmata; bookkeeping | doc | `grep -cE "\- \[x\] \*\*BE-HEAL-0[1245679]\*\*" .planning/REQUIREMENTS.md` = 7 | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Le spec nuove nascono nel commit RED del task indicato (TDD, REPO-RULES): nessun piano di soli scaffold.

- [x] `src/quests/outcomes/injuries/cure-injuries.spec.ts` — primitiva delle ferite (BE-HEAL-02, task 18-01-01)
- [x] `src/quests/outcomes/injuries/quest-cure.spec.ts` — lettore sanificante e tetto (BE-HEAL-02, task 18-01-02)
- [x] `src/models/quest/quest-prizes.schema.spec.ts` — schema della cura (BE-HEAL-01, task 18-02-01)
- [x] `src/models/character/character-status.schema.spec.ts` — data di ricarica (BE-HEAL-06, task 18-04-02)
- [x] `src/characters/items/item-use.plan.spec.ts` — piano puro della bevuta (BE-HEAL-07, task 18-07-01)
- [x] `src/characters/items/use-item.int-spec.ts` — `useItem` sul filo (BE-HEAL-07, BE-HEAL-08, task 18-08-01)
- [x] `src/characters/items/item-use.service.int-spec.ts` — transazione e bevute parallele (BE-HEAL-07, task 18-08-02)
- [ ] `src/quests/outcomes/injuries/heal-no-effect.spec.ts` — predicato della heal senza effetto (BE-HEAL-09, task 18-09-01)
- [x] Helper delle spec: `questOf` con la cura come terzo parametro (task 18-03-01); fixture `buildQuestResult` con `injuriesHealed: []` (task 18-02-02)

Harness: nessuno nuovo (`createOutcomeHarness`, `createCharactersTestApp`, harness di `lore-related.int-spec.ts` e di `quest-updated.subscription.int-spec.ts`, boot reale).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Contenuto delle 166 heal a DB per taglia (liste, quota, ore, descrizioni) | BE-HEAL-03 | Il contenuto non passa dal repo (D-14, D-36): lo applica l'orchestratore con script fuori repo dopo la revisione dell'utente e dopo la merge | Runbook nel handoff §3 (piano 18-11): file di revisione, backup, prova a secco coi conteggi 98 / 59 / 9, applicazione, verifica |
| `recovery` delle 28 pozioni, lore «Il limite del corpo» e collegamento dalle pozioni | BE-HEAL-08 | Come sopra | Runbook nel handoff §3: conteggi 28 pozioni e 1 lore, id come ObjectId veri, `time` e `turns` interi |
| `npm run test:cov` con le soglie per cartella | BE-HEAL-05 | ≈ 630 s, oltre i 600 s dello strumento: mai da un esecutore | Lanciato dall'orchestratore in background dopo il gate; il piano 18-11 misura la coverage per cartella come ripiego |
| UAT su device: foglio della heal con le ferite curabili, foglio strappato, «Guarite: …», pozione dal Diario col conto alla rovescia | BE-HEAL-05, BE-HEAL-09 | Appartiene alla FE Phase 18 (device reale) dopo la merge e dopo il contenuto a DB | Note nel handoff §3: tre heal d'esempio per taglia, identità di test, finestra operativa |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 150 s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
