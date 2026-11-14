---
phase: 23
slug: sconfitta-riposo-recupero-compagni
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-11-14
---

# Phase 23 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 30 (progetti `unit` e `integration` in `package.json` §jest), `MongoMemoryReplSet` condiviso (`test/setup/global-setup.ts`) |
| **Config file** | `package.json` (`jest.projects`) — nessuna installazione |
| **Quick run command** | `npx jest <percorsi> --selectProjects unit` / `npx jest <percorsi> --selectProjects integration --runInBand` |
| **Full suite command** | piano 23-17: `npx jest --selectProjects unit`; integration a blocchi `--runInBand` (`src/quests/outcomes`, resto di `src/quests`, `src/characters`, `src/travel`, resto); `npx jest test/app.int-spec.ts --selectProjects integration --runInBand`; `npm run test:cov` solo dall'orchestratore in background |
| **Estimated runtime** | ~180 secondi per piano (spec mirate + boot reale); gate ≈ 12 s unit + ~10 min di integration a blocchi |

---

## Sampling Rate

- **After every task commit:** la sola spec mirata del task (`--selectProjects unit` o `integration --runInBand`) + `npx tsc --noEmit -p tsconfig.json`
- **After every plan wave:** le spec della cartella toccata + `test/app.int-spec.ts` se il piano cambia decoratori (un piano per wave: wave sequenziali)
- **Before `/gsd-verify-work`:** suite completa verde (piano 23-17)
- **Max feedback latency:** 180 secondi

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 23-01-01 | 01 | 1 | BE-PET-01, BE-PET-14 | — | N/A (documenti) | docs | `grep -cE "BE-PET-(0[1-9]|1[0-4]) .*Phase 23 .*Pending" .planning/REQUIREMENTS.md` (= 14) e `grep -cE "^- \[ \] 23-[0-9]{2}-PLAN.md" .planning/ROADMAP.md` (= 18) | — | ✅ green |
| 23-01-02 | 01 | 1 | BE-PET-01 | T-23-01 | vita a riposo da una sola funzione; dati legacy indulgenti | unit | `npx jest src/characters/pets/companion-life.spec.ts --selectProjects unit && npx tsc --noEmit -p tsconfig.json` | ❌ W0 | ✅ green |
| 23-01-03 | 01 | 1 | BE-PET-14, BE-PET-01 | T-23-01, T-23-02 | livelli da una sola funzione, voce legacy letta piena, nessun import circolare | unit | `npx jest src/characters/pets/companion-level.spec.ts src/characters/pets/companion-life.spec.ts --selectProjects unit && npx tsc --noEmit -p tsconfig.json` | ❌ W0 (companion-level) | ✅ green |
| 23-01-04 | 01 | 1 | BE-PET-01, BE-PET-14 | T-23-01, T-23-03 | campi nuovi validi o assenti, `level` conservato; nessun campo interno sul filo | unit + int | `npx jest src/characters/pets src/quests/outcomes/pets --selectProjects unit && npx jest src/characters/pets/owned-pet-fields.int-spec.ts --selectProjects integration --runInBand && npx tsc --noEmit -p tsconfig.json` | ❌ W0 (int-spec dei campi) | ✅ green |
| 23-01-05 | 01 | 1 | BE-PET-14 | T-23-01 | voce nata a livello 1, coerente e non legacy | unit + int | `npx jest src/characters/pets src/economy src/quests/outcomes --selectProjects unit && npx jest src/economy/trade/shop-transaction.service.int-spec.ts src/quests/outcomes/quest-pet-prize.int-spec.ts --selectProjects integration --runInBand && npx tsc --noEmit -p tsconfig.json` | ✅ | ✅ green |
| 23-01-06 | 01 | 1 | BE-PET-01, BE-PET-14 | — | N/A | docs | `grep -qF -- "- [x] 23-01-PLAN.md" .planning/ROADMAP.md && grep -q "Plan: 01 of 18" .planning/STATE.md` | — | ✅ green |
| 23-02-01 | 02 | 2 | BE-PET-02 | T-23-05, T-23-06 | reporter con soli conteggi, mai blocca il boot | unit | `npx jest src/models/pet.schema.spec.ts src/characters/pets/pet-recovery-catalog.reporter.spec.ts --selectProjects unit && npx tsc --noEmit -p tsconfig.json` | ❌ W0 | ⬜ pending |
| 23-02-02 | 02 | 2 | BE-PET-02, BE-PET-14 | T-23-04, T-23-05 | `defeatedUntil` mai sul filo; `defeated`, `level`, `maxLifePoints` sempre calcolati | unit + int | `npx jest src/characters/pets src/models/pet.schema.spec.ts --selectProjects unit && npx jest src/characters/pets/owned-pet-state.int-spec.ts test/app.int-spec.ts --selectProjects integration --runInBand && npx tsc --noEmit -p tsconfig.json` | ❌ W0 (owned-pet-state) | ⬜ pending |
| 23-02-03 | 02 | 2 | BE-PET-02, BE-PET-14 | — | N/A | docs | `grep -qF -- "- [x] 23-02-PLAN.md" .planning/ROADMAP.md && grep -q "Plan: 02 of 18" .planning/STATE.md` | — | ⬜ pending |
| 23-03-01 | 03 | 3 | BE-PET-03, BE-PET-14 | T-23-08 | `PET_DEFEATED` dal predicato unico, filtro di guardia sullo slot | unit | `npx jest src/gameRules src/characters/pets/equip-pet.plan.spec.ts --selectProjects unit && npx tsc --noEmit -p tsconfig.json` | ❌ W0 (equip-pet.plan) | ⬜ pending |
| 23-03-02 | 03 | 3 | BE-PET-03 | T-23-08, T-23-09 | equip/unequip in transazione, lucchetto prima del rifiuto | unit + int | `npx jest src/characters/pets src/gameRules src/characters/characters.service.spec.ts --selectProjects unit && npx jest src/characters/pets/equip-pet.int-spec.ts src/characters/mission-lock/character-mutations-lock.int-spec.ts --selectProjects integration --runInBand && npx tsc --noEmit -p tsconfig.json` | ✅ | ⬜ pending |
| 23-03-03 | 03 | 3 | BE-PET-03, BE-PET-14 | — | N/A | docs | `grep -qF -- "- [x] 23-03-PLAN.md" .planning/ROADMAP.md && grep -q "Plan: 03 of 18" .planning/STATE.md` | — | ⬜ pending |
| 23-04-01 | 04 | 4 | BE-PET-04, BE-PET-14 | T-23-11, T-23-12 | nessun tiro nuovo, vita del compagno nell'intervallo del suo massimo | unit | `npx jest src/quests/outcomes/combat src/characters/pets/companion-life.spec.ts --selectProjects unit && npx tsc --noEmit -p tsconfig.json` | ✅ | ⬜ pending |
| 23-04-02 | 04 | 4 | BE-PET-04 | T-23-12 | sconfitto fuori dagli scontri seguenti | unit | `npx jest src/quests/outcomes/dungeon src/quests/outcomes/guard src/quests/outcomes/combat src/quests/outcomes/conclusion --selectProjects unit && npx tsc --noEmit -p tsconfig.json` | ✅ | ⬜ pending |
| 23-04-03 | 04 | 4 | BE-PET-04, BE-PET-14 | — | N/A | docs | `grep -qF -- "- [x] 23-04-PLAN.md" .planning/ROADMAP.md && grep -q "Plan: 04 of 18" .planning/STATE.md` | — | ⬜ pending |
| 23-05-01 | 05 | 5 | BE-PET-05, BE-PET-14 | T-23-14 | clamp `[1, max del compagno]`, livello riscritto con l'xp | unit | `npx jest src/quests/outcomes/pets --selectProjects unit && npx tsc --noEmit -p tsconfig.json` | ❌ W0 (companion-after-fight) | ⬜ pending |
| 23-05-02 | 05 | 5 | BE-PET-05 | T-23-13 | slot svuotato con guardia sullo slot letto | unit + int | `npx jest src/quests/outcomes src/quests/guided --selectProjects unit && npx jest src/quests/outcomes/quest-resolution.service.int-spec.ts src/quests/outcomes/gm-completion.service.int-spec.ts src/quests/outcomes/boss-resolution.int-spec.ts src/quests/outcomes/quest-pet-prize.int-spec.ts src/quests/guided/guided-completion.service.int-spec.ts --selectProjects integration --runInBand && npx tsc --noEmit -p tsconfig.json` | ✅ | ⬜ pending |
| 23-05-03 | 05 | 5 | BE-PET-05 | T-23-15 | risultato letto solo dal proprietario | unit + int | `npx jest src/models/quest-result src/quests/outcomes/pets --selectProjects unit && npx jest test/app.int-spec.ts --selectProjects integration --runInBand && npx tsc --noEmit -p tsconfig.json` | ✅ | ⬜ pending |
| 23-05-04 | 05 | 5 | BE-PET-05, BE-PET-14 | — | N/A | docs | `grep -qF -- "- [x] 23-05-PLAN.md" .planning/ROADMAP.md && grep -q "Plan: 05 of 18" .planning/STATE.md` | — | ⬜ pending |
| 23-06-01 | 06 | 6 | BE-PET-04, BE-PET-05, BE-PET-14 | T-23-16 | ogni percorso applica la regola | int | `npx jest src/quests/outcomes/companion-defeat.int-spec.ts --selectProjects integration --runInBand && npx tsc --noEmit -p tsconfig.json` | ❌ W0 (companion-defeat) | ⬜ pending |
| 23-06-02 | 06 | 6 | BE-PET-04, BE-PET-05 | T-23-16 | ogni percorso applica la regola | int | `npx jest src/quests/outcomes/companion-defeat-rescue.int-spec.ts src/quests/outcomes/companion-defeat.int-spec.ts --selectProjects integration --runInBand && npx tsc --noEmit -p tsconfig.json` | ❌ W0 (companion-defeat-rescue) | ⬜ pending |
| 23-06-03 | 06 | 6 | BE-PET-04, BE-PET-05, BE-PET-14 | — | N/A | docs | `grep -qF -- "- [x] 23-06-PLAN.md" .planning/ROADMAP.md && grep -q "Plan: 06 of 18" .planning/STATE.md` | — | ⬜ pending |
| 23-07-01 | 07 | 7 | BE-PET-06, BE-PET-14 | T-23-18, T-23-19 | `recoveryUntil` solo per i due codici dell'insieme; tetto della cura = massimo del compagno | unit | `npx jest src/gameRules src/graphql/format-domain-error.spec.ts src/characters/items --selectProjects unit && npx tsc --noEmit -p tsconfig.json` | ✅ | ⬜ pending |
| 23-07-02 | 07 | 7 | BE-PET-06 | T-23-17, T-23-18, T-23-20 | bearer-only, `PET_NOT_OWNED` per il pet altrui, bevute concorrenti serializzate | unit + int | `npx jest src/characters/items src/graphql --selectProjects unit && npx jest src/characters/items test/app.int-spec.ts --selectProjects integration --runInBand && npx tsc --noEmit -p tsconfig.json` | ✅ | ⬜ pending |
| 23-07-03 | 07 | 7 | BE-PET-06, BE-PET-14 | — | N/A | docs | `grep -qF -- "- [x] 23-07-PLAN.md" .planning/ROADMAP.md && grep -q "Plan: 07 of 18" .planning/STATE.md` | — | ⬜ pending |
| 23-08-01 | 08 | 8 | BE-PET-07 | T-23-22 | regole di forma condivise col personaggio | unit | `npx jest src/gameRules src/characters/pets/pet-name.spec.ts --selectProjects unit && npx tsc --noEmit -p tsconfig.json` | ❌ W0 (pet-name) | ⬜ pending |
| 23-08-02 | 08 | 8 | BE-PET-07, BE-PET-14 | T-23-21, T-23-23 | owner-only, matrice con attaccante dotato di risorse proprie e controllo positivo | int | `npx jest src/characters/pets src/validation src/gameRules --selectProjects unit && npx jest src/characters/pets/rename-pet.int-spec.ts test/authz/authorization-matrix.int-spec.ts test/app.int-spec.ts --selectProjects integration --runInBand && npx tsc --noEmit -p tsconfig.json` | ❌ W0 (rename-pet) | ⬜ pending |
| 23-08-03 | 08 | 8 | BE-PET-07 | — | N/A | docs | `grep -qF -- "- [x] 23-08-PLAN.md" .planning/ROADMAP.md && grep -q "Plan: 08 of 18" .planning/STATE.md` | — | ⬜ pending |
| 23-09-01 | 09 | 9 | BE-PET-08 | T-23-26 | il claim tocca solo il marcatore (vita, xp, livello intatti) | unit | `npx jest src/push src/characters/pets/pet-recovery.spec.ts src/models/sweep-indexes.schema.spec.ts --selectProjects unit && npx tsc --noEmit -p tsconfig.json` | ❌ W0 (pet-recovery) | ⬜ pending |
| 23-09-02 | 09 | 9 | BE-PET-08 | T-23-25, T-23-27, T-23-28 | una push per claim riuscito, dopo la scrittura; log con soli id | unit + int | `npx jest src/characters/pets src/push src/models/sweep-indexes.schema.spec.ts --selectProjects unit && npx jest src/characters/pets/pet-recovery.int-spec.ts src/characters/imprisonment/prison-release.int-spec.ts test/app.int-spec.ts --selectProjects integration --runInBand && npx tsc --noEmit -p tsconfig.json` | ❌ W0 (pet-recovery.int-spec) | ⬜ pending |
| 23-09-03 | 09 | 9 | BE-PET-08 | — | N/A | docs | `grep -qF -- "- [x] 23-09-PLAN.md" .planning/ROADMAP.md && grep -q "Plan: 09 of 18" .planning/STATE.md` | — | ⬜ pending |
| 23-10-01 | 10 | 10 | BE-PET-09, BE-PET-14 | T-23-29 | nessun risultato da una risoluzione stantia | unit | `npx jest src/travel/ambush src/quests/outcomes/pets --selectProjects unit && npx tsc --noEmit -p tsconfig.json` | ✅ | ⬜ pending |
| 23-10-02 | 10 | 10 | BE-PET-09, BE-PET-14 | T-23-29, T-23-31 | report legacy consegnati, risultato nella stessa transazione | int | `npx jest src/travel/ambush src/quests/outcomes/pets --selectProjects unit && npx jest src/travel/ambush src/travel/travel-completion.int-spec.ts src/travel/teleport.resolver.int-spec.ts --selectProjects integration --runInBand && npx tsc --noEmit -p tsconfig.json` | ✅ | ⬜ pending |
| 23-10-03 | 10 | 10 | BE-PET-09 | — | N/A | docs | `grep -qF -- "- [x] 23-10-PLAN.md" .planning/ROADMAP.md && grep -q "Plan: 10 of 18" .planning/STATE.md` | — | ⬜ pending |
| 23-11-01 | 11 | 11 | BE-PET-09 | T-23-34 | testi composti dal BE | unit | `npx jest src/push src/travel/ambush/ambush-push.spec.ts --selectProjects unit && npx tsc --noEmit -p tsconfig.json` | ❌ W0 (ambush-push) | ⬜ pending |
| 23-11-02 | 11 | 11 | BE-PET-09 | T-23-32, T-23-33 | push al solo proprietario, solo dopo il commit | unit + int | `npx jest src/travel/ambush src/push --selectProjects unit && npx jest src/travel/ambush test/app.int-spec.ts --selectProjects integration --runInBand && npx tsc --noEmit -p tsconfig.json` | ✅ | ⬜ pending |
| 23-11-03 | 11 | 11 | BE-PET-09 | — | N/A | docs | `grep -qF -- "- [x] 23-11-PLAN.md" .planning/ROADMAP.md && grep -q "Plan: 11 of 18" .planning/STATE.md` | — | ⬜ pending |
| 23-12-01 | 12 | 12 | BE-PET-10 | T-23-35 | campo interno senza `@Field` | unit | `npx jest src/models/character/active-travel.schema.spec.ts src/travel/travel-timing.spec.ts --selectProjects unit && npx tsc --noEmit -p tsconfig.json` | ✅ | ⬜ pending |
| 23-12-02 | 12 | 12 | BE-PET-10 | T-23-35, T-23-36 | `mount` scritto solo alla partenza | int | `npx jest src/travel src/models/character --selectProjects unit && npx jest src/travel/travel-planning.int-spec.ts src/travel/travel.service.int-spec.ts test/app.int-spec.ts --selectProjects integration --runInBand && npx tsc --noEmit -p tsconfig.json` | ✅ | ⬜ pending |
| 23-12-03 | 12 | 12 | BE-PET-10 | — | N/A | docs | `grep -qF -- "- [x] 23-12-PLAN.md" .planning/ROADMAP.md && grep -q "Plan: 12 of 18" .planning/STATE.md` | — | ⬜ pending |
| 23-13-01 | 13 | 13 | BE-PET-10 | T-23-38, T-23-39 | nessun tiro, sonda del cibo | unit | `npx jest src/travel/ambush/ambush-on-foot.spec.ts src/travel/ambush/ambush-detour.spec.ts --selectProjects unit && npx tsc --noEmit -p tsconfig.json` | ❌ W0 (ambush-on-foot) | ⬜ pending |
| 23-13-02 | 13 | 13 | BE-PET-10 | T-23-38 | cibo chiuso come uno stop | unit | `npx jest src/travel/ambush src/models/quest-result --selectProjects unit && npx tsc --noEmit -p tsconfig.json` | ✅ | ⬜ pending |
| 23-13-03 | 13 | 13 | BE-PET-10 | T-23-37 | job stantii cancellati e riprogrammati | int | `npx jest src/travel --selectProjects unit && npx jest src/travel/ambush test/app.int-spec.ts --selectProjects integration --runInBand && npx tsc --noEmit -p tsconfig.json` | ❌ W0 (ambush-on-foot.int-spec) | ⬜ pending |
| 23-13-04 | 13 | 13 | BE-PET-10 | — | N/A | docs | `grep -qF -- "- [x] 23-13-PLAN.md" .planning/ROADMAP.md && grep -q "Plan: 13 of 18" .planning/STATE.md` | — | ⬜ pending |
| 23-14-01 | 14 | 14 | BE-PET-11 | T-23-41 | stesso controllo `arrivesAlive` della partenza | unit | `npx jest src/travel/ambush --selectProjects unit && npx tsc --noEmit -p tsconfig.json` | ✅ | ⬜ pending |
| 23-14-02 | 14 | 14 | BE-PET-11 | T-23-40 | corsia abbandonata nella stessa transazione | int | `npx jest src/travel/ambush --selectProjects unit && npx jest src/travel/ambush --selectProjects integration --runInBand && npx tsc --noEmit -p tsconfig.json` | ✅ | ⬜ pending |
| 23-14-03 | 14 | 14 | BE-PET-11 | — | N/A | docs | `grep -qF -- "- [x] 23-14-PLAN.md" .planning/ROADMAP.md && grep -q "Plan: 14 of 18" .planning/STATE.md` | — | ⬜ pending |
| 23-15-01 | 15 | 15 | BE-PET-12, BE-PET-14 | T-23-42, T-23-43 | record senza `@Field`, snapshot letto non mutato, massimo del compagno | unit | `npx jest src/quests/guided --selectProjects unit && npx tsc --noEmit -p tsconfig.json` | ✅ | ⬜ pending |
| 23-15-02 | 15 | 15 | BE-PET-12 | T-23-42, T-23-43 | simulazione senza scritture né tiri | unit + int | `npx jest src/quests/guided --selectProjects unit && npx jest src/quests/guided/mission-simulation.service.int-spec.ts src/quests/guided/mission-draft.service.int-spec.ts test/app.int-spec.ts --selectProjects integration --runInBand && npx tsc --noEmit -p tsconfig.json` | ✅ | ⬜ pending |
| 23-15-03 | 15 | 15 | BE-PET-12, BE-PET-14 | — | N/A | docs | `grep -qF -- "- [x] 23-15-PLAN.md" .planning/ROADMAP.md && grep -q "Plan: 15 of 18" .planning/STATE.md` | — | ⬜ pending |
| 23-16-01 | 16 | 16 | BE-PET-12, BE-PET-14 | T-23-44 | `OUTCOME_OVERRIDE_INVALID` fuori `1..max del compagno` | unit | `npx jest src/quests/outcomes src/quests/guided --selectProjects unit && npx tsc --noEmit -p tsconfig.json` | ✅ | ⬜ pending |
| 23-16-02 | 16 | 16 | BE-PET-12 | T-23-44, T-23-45 | handler innkeeper invariati | int | `npx jest src/quests --selectProjects unit && npx jest src/quests/guided src/quests/outcomes/gm-completion.service.int-spec.ts test/app.int-spec.ts --selectProjects integration --runInBand && npx tsc --noEmit -p tsconfig.json` | ✅ | ⬜ pending |
| 23-16-03 | 16 | 16 | BE-PET-12, BE-PET-14 | — | N/A | docs | `grep -qF -- "- [x] 23-16-PLAN.md" .planning/ROADMAP.md && grep -q "Plan: 16 of 18" .planning/STATE.md` | — | ⬜ pending |
| 23-17-01 | 17 | 17 | BE-PET-01..14 | T-23-46, T-23-47, T-23-48 | SDL additivo, liste e guardie contate, nessun segreto | gate | `npx tsc --noEmit -p tsconfig.json && npx jest --selectProjects unit && npx jest test/app.int-spec.ts test/authz/authorization-matrix.int-spec.ts --selectProjects integration --runInBand` | ✅ | ⬜ pending |
| 23-17-02 | 17 | 17 | BE-PET-01..14 | — | N/A | docs | `grep -qF -- "- [x] 23-17-PLAN.md" .planning/ROADMAP.md && grep -q "Plan: 17 of 18" .planning/STATE.md` | — | ⬜ pending |
| 23-18-01 | 18 | 18 | BE-PET-13, BE-PET-14 | T-23-49 | handoff senza segreti | docs | `F=.planning/phases/23-sconfitta-riposo-recupero-compagni/BACKEND-NOTES.md && test "$(grep -cE '^## [0-7]\.' $F)" = 8` | — | ⬜ pending |
| 23-18-02 | 18 | 18 | BE-PET-13, BE-PET-14 | T-23-50 | `mark-complete` solo dopo il gate | docs | `test "$(grep -cE '\- \[x\] \*\*BE-PET-(0[1-9]|1[0-4])\*\*' .planning/REQUIREMENTS.md)" = 14 && grep -q "nyquist_compliant: true" .planning/phases/23-sconfitta-riposo-recupero-compagni/23-VALIDATION.md` | — | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Nessun framework da installare; mancano solo le spec nuove, ognuna creata (RED) dal task che la usa:

- [ ] `src/characters/pets/companion-life.spec.ts` — funzione pura, predicato, nome mostrato (BE-PET-01, task 23-01-02)
- [ ] `src/characters/pets/companion-level.spec.ts` — dieci livelli, vita fino al doppio, livello salvato letto indulgente (BE-PET-14, task 23-01-03; casi della voce legacy in `companion-life.spec.ts`)
- [ ] `src/characters/pets/owned-pet-fields.int-spec.ts` — campi conservati dallo schema compreso `level`, sonda P3 (BE-PET-01, task 23-01-04)
- [ ] `test/fixtures/owned-pet.fixture.ts` esteso ai campi nuovi (condiviso, task 23-01-04)
- [ ] `src/characters/pets/pet-recovery-catalog.reporter.spec.ts` (BE-PET-02, task 23-02-01)
- [ ] `src/characters/pets/owned-pet-state.int-spec.ts` — filo del compagno a riposo, sconfitto, legacy (BE-PET-02, task 23-02-02)
- [ ] `src/characters/pets/equip-pet.plan.spec.ts` (BE-PET-03, task 23-03-01)
- [ ] `src/quests/outcomes/pets/companion-after-fight.spec.ts` (BE-PET-05, task 23-05-01)
- [ ] `src/quests/outcomes/companion-defeat.int-spec.ts` e `src/quests/outcomes/companion-defeat-rescue.int-spec.ts` (BE-PET-04/05, piano 23-06)
- [ ] `src/characters/pets/pet-name.spec.ts` e `src/characters/pets/rename-pet.int-spec.ts` (BE-PET-07, piano 23-08)
- [ ] `src/characters/pets/pet-recovery.spec.ts`, `pet-recovery.sweeper.spec.ts`, `pet-recovery.int-spec.ts` (BE-PET-08, piano 23-09)
- [ ] `src/travel/ambush/ambush-push.spec.ts` (BE-PET-09, task 23-11-01)
- [ ] `src/travel/ambush/ambush-on-foot.spec.ts` e `ambush-on-foot.int-spec.ts` (BE-PET-10/11, piani 23-13 e 23-14)

Spec esistenti che vanno RED per scelta e si riscrivono nel piano che cambia il comportamento (RESEARCH §Q14): `placeholder-combat-resolver.spec.ts:282` (23-04), `owned-pet-entry.spec.ts` e `owned-pets.mapper.spec.ts` (23-01, 23-02), attese sull'array dei posseduti con la chiave `level` (D-39): voci nate in `trade-pets.spec.ts`, `shop-transaction.service.int-spec.ts`, `outcome-plan.spec.ts`, `quest-pet-prize.int-spec.ts` (task 23-01-05); voci del compagno che ha combattuto in `outcome-plan.spec.ts`, `combatant-plan.spec.ts`, `quest-resolution.service.int-spec.ts`, `boss-resolution.int-spec.ts`, `gm-completion.service.int-spec.ts`, `quest-pet-prize.int-spec.ts`, `guided-completion.service.int-spec.ts` (piano 23-05) e `ambush-plan.spec.ts`, `ambush-lifecycle.int-spec.ts`, `ambush-resolution.int-spec.ts` (piano 23-10), `equip-pet.int-spec.ts` e `characters.service.spec.ts` (23-03), `ambush-plan.spec.ts`, `ambush-resolution.int-spec.ts:273/738`, `ambush-lifecycle.int-spec.ts:338/398/437/936` (23-10), `ambush-resolution.int-spec.ts:532/762`, `ambush-lifecycle.int-spec.ts:805`, `push-events.spec.ts` (23-09, 23-11), `game-rule.exception.spec.ts` (23-03, 23-07, 23-08), `format-domain-error.spec.ts` (23-07), `input-decorators.spec.ts` (23-08), `sweep-indexes.schema.spec.ts` (23-09), `pet.schema.spec.ts` (23-02), `active-travel.schema.spec.ts` (23-12), `fight-state.spec.ts`, `guided-outcome.spec.ts`, `mission-draft.mapper.spec.ts`, `gm-overrides.spec.ts` (23-15, 23-16), `test/app.int-spec.ts` (ogni piano col filo).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Tabella dei tempi di recupero dei 44 pet scritta a DB dopo la revisione dell'utente | BE-PET-02 | contenuto fuori dal repo (D-25, D-36): lo scrive l'orchestratore con uno script esterno sul DB reale | revisione dell'utente di `~/Downloads/klimmeck-tempi-recupero-compagni.md`, scrittura di `pets.recoveryTime` in ms, riavvio dal ramo: WARN `PetRecovery` a zero |
| Push `ambush` e `petRecovered` recapitate su device | BE-PET-08, BE-PET-09 | FCM reale e device fisico | passi di `BACKEND-NOTES.md` §6 (equip dopo la data, imboscata vinta con la cavalcatura caduta) |
| Flusso completo con la FE Phase 22 (Diario, pozione al compagno, rinomina, foglio dell'esito, pergamene in viaggio, «Prosegui a piedi», oste) | BE-PET-01..12 | integrazione FE + BE su device | UAT guidata dall'orchestratore, un passo per messaggio (`BACKEND-NOTES.md` §6) |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 180s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending (firma nel piano 23-18, dopo il gate verde del piano 23-17)
