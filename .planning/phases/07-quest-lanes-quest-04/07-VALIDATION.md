---
phase: 7
slug: quest-lanes-quest-04
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-10-21
---

# Phase 7 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 30.1.3 + ts-jest 29.4.1, projects `unit` (`src/**/*.spec.ts`, `test/**/*.spec.ts`) / `integration` (`*.int-spec.ts`, `MongoMemoryReplSet` condiviso via `test/setup/global-setup.ts`; mongod 8.2.6 in locale, 8.0.4 pinnato in CI) |
| **Config file** | `package.json` → `jest.projects` |
| **Quick run command** | `npx jest src/quests src/gameRules src/authz src/time src/characters src/models --selectProjects unit` |
| **Integration command** | `npx jest src/quests/acceptance src/characters/character-quest-lanes.int-spec.ts src/pendingQuests src/time test/app.int-spec.ts --selectProjects integration --runInBand` |
| **Full suite command** | `npm run test:unit && npm run test:int` (`test:int` include `--runInBand`; solo nel piano 07-08) |
| **Estimated runtime** | unit ~4 s; int-spec singolo ~3–15 s; `test/app.int-spec.ts` ~10–20 s; suite completa integrazione ~80–90 s |

Baseline misurata (2026-10-21, RESEARCH §Validation Architecture, branch pulito su `e18771f`): unit **80 suite / 1114 test** verdi (3,4 s); integration **46 suite / 550 test** (ultima misura Phase 6, ~77 s, non rilanciata per regola); `npm run build` exit 0; lint filtrato **0 righe**.

Trappole di tooling (vincolanti, D-20 / RESEARCH Pitfall 10–13): path jest PRIMA di `--selectProjects`; integration sempre `--runInBand` e mai in background; MAI `npm run lint` (è `eslint --fix` sull'intero repo): solo `npx prettier --write <file>` + `npx eslint <file>` sui file toccati; il gate lint è `npx eslint "{src,apps,libs,test}/**/*.ts" --quiet | grep -E "^\s+[0-9]+:[0-9]+" | grep -vE "prettier/prettier|prefer-const"` → 0 righe; NON usare `npx tsc --noEmit -p tsconfig.json`, usare `npm run build`; `src/schema.gql` si rigenera col real-boot (`test/app.int-spec.ts`, env già pronto: `JWT_SECRET` ≥ 32, `FIREBASE_SERVICE_ACCOUNT: ''`, EventSub vuote), va committato e deve avere diff **solo additivo** (`git diff origin/develop -- src/schema.gql | grep -E '^-[^-]'` vuoto), poi `git diff --exit-code src/schema.gql`; i letterali `QuestAcceptance|twitchPointsDebit|INSUFFICIENT_FUNDS|registrations` non compaiono mai nello schema; collection pre-create (`init()`) prima delle transazioni multi-documento (Pitfall 5); change stream innescato con `primeCharactersChangeStream` prima di asserire eventi.

---

## Sampling Rate

- **After every task commit:** gli spec unit toccati con `--selectProjects unit` + il singolo int-spec toccato con `--selectProjects integration --runInBand` (comando `<automated>` del task)
- **After every plan wave:** quick run unit + integration command di fase (solo i file già esistenti a quella wave) + `npm run build`
- **Before `/gsd-verify-work`:** `npm run test:unit && npm run test:int` verdi (> 80 suite unit, > 46 integration), `npm run build`, lint filtrato a 0 righe, `npx eslint` + `npx prettier --check` sui `.ts` toccati, `git diff --exit-code src/schema.gql` con diff solo additivo vs `origin/develop`, invarianti di 07-08 Task 1
- **Max feedback latency:** 60 seconds (singoli spec e real boot; suite completa solo in 07-08)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 07-01-T1 | 07-01 | 1 | BE-QUEST-01 (D-01, D-07) | T-07-02, T-07-04 | corsie nuove come ref castati default null; `pointsSpent` default 0; SDL esatto e additivo | unit + integration (real boot) | `npx jest src/models/quest-lanes.schema.spec.ts --selectProjects unit && npx jest test/app.int-spec.ts --selectProjects integration --runInBand && npm run build` | ❌ W0 → `src/models/quest-lanes.schema.spec.ts` creato nel task (RED); ✅ estende `test/app.int-spec.ts` | ✅ green |
| 07-01-T2 | 07-01 | 1 | BE-QUEST-01, BE-QUEST-03 (D-04, C1) | T-07-01, T-07-02, T-07-03 | `registrations` interno mai nello schema; party con `count ≥ 1` e titolo dell'enum | unit + integration (real boot) | `npx jest src/models/quest-lanes.schema.spec.ts test/fixtures/fixtures.spec.ts --selectProjects unit && npx jest test/app.int-spec.ts --selectProjects integration --runInBand` | ✅ estende spec del T1, `test/fixtures/quest.fixture.ts` | ✅ green |
| 07-02-T1 | 07-02 | 1 | BE-QUEST-02, BE-QUEST-03 (D-14) | T-07-09 | cinque codici stabili con messaggio italiano, ognuno prodotto da una sola factory | unit | `npx jest src/gameRules --selectProjects unit` | ✅ estende `game-rule.exception.spec.ts` | ⬜ pending |
| 07-02-T2 | 07-02 | 1 | BE-QUEST-02, BE-QUEST-03, BE-QUEST-04 (D-01, D-03..D-06, D-09, D-16) | T-07-05, T-07-06, T-07-07, T-07-09 | corsia solo dal tipo del catalogo; costo invalido ⇒ `invalid`; titolo esatto per story; slot esatti per rango | unit | `npx jest src/quests/acceptance/quest-lanes.spec.ts src/quests/acceptance/quest-eligibility.spec.ts --selectProjects unit && npm run build` | ❌ W0 → `quest-lanes.spec.ts`, `quest-eligibility.spec.ts` creati nel task (RED) | ⬜ pending |
| 07-02-T3 | 07-02 | 1 | BE-QUEST-02, BE-QUEST-03 (D-18) | T-07-07, T-07-08 | guard riaffermate nel filtro del claim (attivo, corsia, titolo, posizione, non ripetibilità); `$expr` di capienza nello stesso update | unit | `npx jest src/quests/acceptance src/gameRules --selectProjects unit && npm run build` | ❌ W0 → `quest-acceptance.updates.spec.ts` creato nel task (RED) | ⬜ pending |
| 07-03-T1 | 07-03 | 2 | BE-QUEST-01 (Boy Scout) | — | refactor senza cambio di comportamento del priming del change stream | integration | `npx jest src/characters/character-updated.subscription.int-spec.ts src/characters/archived-character.realtime.int-spec.ts --selectProjects integration --runInBand` | ✅ (le due suite esistenti sono la rete; `test/characters/characters-change-stream.ts` creato nel task) | ⬜ pending |
| 07-03-T2 | 07-03 | 2 | BE-QUEST-01 SC1 (D-13, C2, C3, C6) | T-07-10, T-07-11, T-07-12 | solo `_id` della quest nel payload; ref orfano ⇒ `null` senza errori; filtro per evento invariato | unit + integration (wire HTTP + WS) | `npx jest src/characters/characters.service.spec.ts --selectProjects unit && npx jest src/characters/character-quest-lanes.int-spec.ts src/characters/characters-ownership.int-spec.ts src/characters/character-updated.subscription.int-spec.ts --selectProjects integration --runInBand && git diff --exit-code src/schema.gql` | ❌ W0 → `src/characters/character-quest-lanes.int-spec.ts` creato nel task (RED); ✅ estende `characters.service.spec.ts` | ⬜ pending |
| 07-04-T1 | 07-04 | 2 | BE-QUEST-02, BE-QUEST-03 (D-11) | T-07-13, T-07-14, T-07-15 | innkeeper su personaggio altrui con `ownerOnly` ⇒ FORBIDDEN/NOT_FOUND, nessun on-behalf; default invariato | unit | `npx jest src/authz --selectProjects unit && npm run build` | ✅ estende `ownership.guard.spec.ts`, `character-access.policy.spec.ts` | ⬜ pending |
| 07-04-T2 | 07-04 | 2 | BE-QUEST-01 (D-11 rivisto, C4) | T-07-16 | proprietario legge il PendingQuest di ogni corsia; l'altrui resta FORBIDDEN | unit + integration | `npx jest src/authz --selectProjects unit && npx jest src/pendingQuests/pending-quests-authz.int-spec.ts --selectProjects integration --runInBand` | ✅ estende `character-access.policy.spec.ts`, `pending-quests-authz.int-spec.ts` | ⬜ pending |
| 07-05-T1 | 07-05 | 2 | BE-QUEST-04 (D-15) | T-07-17 | `serverTime` autenticato (UNAUTHENTICATED senza bearer), ISO entro 5 s | unit + integration | `npx jest src/time --selectProjects unit && npx jest src/time/server-time.int-spec.ts --selectProjects integration --runInBand` | ❌ W0 → `server-time.resolver.spec.ts`, `server-time.int-spec.ts` creati nel task (RED) | ⬜ pending |
| 07-05-T2 | 07-05 | 2 | BE-QUEST-04 (D-15, D-20) | T-07-17 | modulo montato nel boot reale; whitelist `@Public` invariata; SDL `serverTime: DateTime!` additivo | integration (real boot) | `npx jest test/app.int-spec.ts --selectProjects integration --runInBand && grep -q "^  serverTime: DateTime!$" src/schema.gql && npm run build` | ✅ estende `test/app.int-spec.ts` | ⬜ pending |
| 07-06-T1 | 07-06 | 2 | BE-QUEST-02, BE-QUEST-03, BE-QUEST-04 SC2/SC3/SC4 (D-01, D-07..D-09, D-16, D-18, D-19) | T-07-20, T-07-22, T-07-24, T-07-25 | 3 concorrenti ⇒ 1 PendingQuest e 1 debito; nessuna moneta; catalogo invalido ⇒ `QUEST_NOT_ACCEPTABLE` con WARN col solo id; rifiuto = zero scritture | integration (replSet) | `npx jest src/quests/acceptance/quest-acceptance.service.int-spec.ts --selectProjects integration --runInBand && npx jest src/quests/acceptance --selectProjects unit && npm run build` | ✅ riscrive `quest-acceptance.service.int-spec.ts` (Pitfall 7) | ⬜ pending |
| 07-06-T2 | 07-06 | 2 | BE-QUEST-03 SC3 (D-03..D-06, D-10, D-18, D-19) | T-07-21, T-07-23, T-07-24 | città del marker, non ripetibilità, titolo, slot per rango atomici sotto concorrenza; nessuna registrazione al rifiuto | integration (replSet) | `npx jest src/quests/acceptance/quest-acceptance.service.int-spec.ts --selectProjects integration --runInBand && npm run build` | ✅ estende lo spec del T1 | ⬜ pending |
| 07-07-T1 | 07-07 | 3 | BE-QUEST-01..04 SC1–SC4 (D-11, D-12, D-14) | T-07-27, T-07-28, T-07-29, T-07-30, T-07-32, T-07-33 | owner-only sul filo (innkeeper altrui ⇒ FORBIDDEN, nessun audit); id malformati ⇒ NOT_FOUND; `{ code }` esatto; `characterUpdated` con la corsia popolata | integration (wire HTTP + WS) | `npx jest src/quests/acceptance/accept-quest.resolver.int-spec.ts src/quests/acceptance/quest-acceptance.service.int-spec.ts --selectProjects integration --runInBand && npm run build` | ❌ W0 → `accept-quest.resolver.int-spec.ts` creato nel task (RED) | ⬜ pending |
| 07-07-T2 | 07-07 | 3 | BE-QUEST-01..04 (D-11, D-19, D-20, C5) | T-07-27, T-07-30, T-07-31 | whitelist ownership + owner-only enumerate; divieti `QuestAcceptance`, `twitchPointsDebit`, `INSUFFICIENT_FUNDS`, `registrations`; `UNAUTHENTICATED` senza bearer; SDL additivo | integration (real boot) + CI | `npx jest test/app.int-spec.ts --selectProjects integration --runInBand && git diff --exit-code src/schema.gql && npm run build` | ✅ estende `test/app.int-spec.ts` (test negativo riscritto in positivo) | ⬜ pending |
| 07-08-T1 | 07-08 | 4 | BE-QUEST-01..04 (D-19, D-20) | T-07-34, T-07-35, T-07-36, T-07-37 | gate completo + invarianti (schema additivo, un solo owner-only, nessuna moneta né `$inc` in `src/quests`, `@Public` invariato, nessuna dipendenza nuova) | full suite + grep | `npm run test:unit && npm run test:int && npm run build && git diff --exit-code src/schema.gql` + lint filtrato = 0 righe | ✅ | ⬜ pending |
| 07-08-T2 | 07-08 | 4 | BE-QUEST-01..04 (D-21) | T-07-38, T-07-39 | handoff verificato contro il codice; nessun segreto nel documento; traceability Complete | doc grep | `grep -q "acceptQuest(request: AcceptQuestRequest!): CommonResponse!" .planning/phases/07-quest-lanes-quest-04/BACKEND-NOTES.md` + conteggio delle 4 righe Complete di BE-QUEST in `.planning/REQUIREMENTS.md` (comando completo nel `<verify>` di 07-08 Task 2) | ❌ → `BACKEND-NOTES.md` creato nel task | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Le infrastrutture di test mancanti sono create dentro i task che le usano, sempre nel passo RED prima dell'implementazione:

- [ ] `src/models/quest-lanes.schema.spec.ts` (schemi di corsie, `pointsSpent`, party, registrazioni) → 07-01 Task 1/2
- [ ] `test/fixtures/quest.fixture.ts`: `requirements.party: []` e `registrations: []` in `buildQuest` → 07-01 Task 2
- [ ] `test/app.int-spec.ts`: blocchi SDL esatti (07-01), `serverTime` + `UNAUTHENTICATED` (07-05), whitelist ownership + `EXPECTED_OWNER_ONLY_HANDLERS` e test negativo riscritto in positivo (07-07, C5)
- [ ] spec unit RED: `quest-lanes.spec.ts`, `quest-eligibility.spec.ts` (07-02 Task 2), `quest-acceptance.updates.spec.ts` (07-02 Task 3), `server-time.resolver.spec.ts` (07-05 Task 1)
- [ ] `test/characters/characters-change-stream.ts` (`primeCharactersChangeStream` condiviso) → 07-03 Task 1
- [ ] `test/authz/characters-test-app.ts` e `CharactersModule`: `PendingQuest` e `Quest` nel `forFeature` (C6) → 07-03 Task 2
- [ ] int-spec nuovi: `src/characters/character-quest-lanes.int-spec.ts` (07-03), `src/time/server-time.int-spec.ts` (07-05), `src/quests/acceptance/accept-quest.resolver.int-spec.ts` (07-07); `quest-acceptance.service.int-spec.ts` riscritto (07-06, Pitfall 7)
- Framework install: none (Jest, supertest, harness replica set, ws client già presenti; nessuna dipendenza nuova)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| La board FE accetta story/worldMission/standard su device e mostra la corsia popolata, il saldo punti aggiornato e il countdown ancorato a `serverTime` | BE-QUEST-01, BE-QUEST-02, BE-QUEST-04 | Richiede la FE Phase 6 (consumatore dello schema) e un device reale | Dopo la FE Phase 6: BE locale + device (`adb reverse tcp:3000`), login con un utente con `twitchPoints` sufficienti, accettare una story e una hunt in parallelo, verificare le due corsie e il saldo; spostare l'orologio del device di qualche minuto e verificare che il countdown non cambi |
| Eleggibilità sui dati reali preparati a DB: scala delle 5 story (`minTitle` rookie → hero), worldMission con `party` per rango, città che contiene il marker | BE-QUEST-03 | Il catalogo di sviluppo oggi ha 4 quest, nessuna story e nessun party (RESEARCH Q4): i dati vanno preparati a mano dal GM (nessun admin CRUD in milestone) | Preparare i dati di BACKEND-NOTES §8; con un rookie accettare la story rookie (ok) e quella adventurer (`QUEST_TITLE_MISMATCH`); con due hero sulla worldMission a 1 posto hero (`QUEST_FULL` al secondo); fuori dalla città del marker (`QUEST_NOT_IN_CITY`) |
| L'innkeeper non può accettare per conto di un altro dal pannello admin FE | BE-QUEST-02 (D-11) | Il pannello admin che lo renderebbe possibile è FE | Login come innkeeper e tentativo su un personaggio altrui → errore `FORBIDDEN` mostrato, nessun debito |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 60s (singoli spec e real boot; suite completa solo in 07-08)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved by planner 2026-10-21 (8 plan, 17 task, 4 wave)
