---
phase: 6
slug: eventsub-punti-canale-streamer-live
status: approved
nyquist_compliant: true
wave_0_complete: false
created: 2026-10-19
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 30 + ts-jest 29, projects `unit` (`src/**/*.spec.ts`, `test/**/*.spec.ts`) / `integration` (`*.int-spec.ts`, MongoMemoryReplSet condiviso via `test/setup/{global-setup,global-teardown,after-env,mongo-replset,redis}.ts`) |
| **Config file** | `package.json` → `jest.projects` |
| **Quick run command** | `npx jest src/eventsub src/config src/auth/twitch --selectProjects unit` |
| **Integration command** | `npx jest src/eventsub test/app.int-spec.ts --selectProjects integration --runInBand` |
| **Full suite command** | `npm run test:unit && npm run test:int` (`test:int` include `--runInBand`) |
| **Estimated runtime** | unit ~5 s; int-spec singolo ~3–15 s; real-boot ~20 s; suite completa ~2 min |

Baseline misurata (2026-10-19, RESEARCH §Validation Architecture): unit **66 suite / 810 test**, integration **43 suite / 515 test**, `npm run build` exit 0, lint filtrato **0 righe**.

Trappole di tooling (vincolanti, D-18 / RESEARCH Pitfall 17): path jest PRIMA di `--selectProjects`; integration sempre `--runInBand`; MAI `npm run lint` (è `eslint --fix` sull'intero repo): solo `npx prettier --write <file>` + `npx eslint <file>` sui file toccati; il gate lint è `npx eslint "{src,apps,libs,test}/**/*.ts" --quiet | grep -E "^\s+[0-9]+:[0-9]+" | grep -vE "prettier/prettier|prefer-const"` → 0 righe; NON usare `npx tsc --noEmit -p tsconfig.json` (errori di baseline sui tipi jest in `test/`), usare `npm run build`; `src/schema.gql` si rigenera col real-boot e deve restare senza diff (D-16); nessuna chiamata reale a Twitch (`FakeTwitchHelixClient`, `jest.spyOn(global, 'fetch')`) né a Firebase (`FakePushTransport`); il real-boot azzera `TWITCH_LOGIN_SCOPES`, `TWITCH_EVENTSUB_SECRET`, `TWITCH_EVENTSUB_CALLBACK_URL`, `TWITCH_BROADCASTER_ID` (C2).

---

## Sampling Rate

- **After every task commit:** gli spec unit toccati con `--selectProjects unit` + il singolo int-spec toccato con `--selectProjects integration --runInBand`
- **After every plan wave:** `npx jest src/eventsub src/config src/auth/twitch --selectProjects unit` + `npx jest src/eventsub --selectProjects integration --runInBand` (dal piano 06-03 in poi) + `npm run build`
- **Before `/gsd-verify-work`:** `npm run test:unit && npm run test:int` verdi, `npm run build`, lint filtrato a 0 righe, `npx eslint <file toccati>`, `git diff --exit-code src/schema.gql`, `.env.example` senza valori, invarianti di 06-09 Task 1
- **Max feedback latency:** 60 seconds (singoli spec; suite completa solo in 06-08/06-09)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 06-01-T1 | 06-01 | 1 | BE-POINTS-01/03 (D-12, C3, C6) | T-06-01, T-06-02, T-06-03 | parser fail-closed disabled/local/managed; nessun valore nei messaggi; http solo fuori prod | unit | `npx jest src/config --selectProjects unit` | ❌ W0 → `eventsub-config.spec.ts` creato nel task (RED) | ✅ green |
| 06-01-T2 | 06-01 | 1 | BE-POINTS-03 (D-11) | T-06-04 | scope validati; vuoto = solo identità | unit | `npx jest src/config src/auth/twitch --selectProjects unit && npm run build` | ✅ estende auth-config.spec / twitch-urls.spec | ✅ green |
| 06-01-T3 | 06-01 | 1 | BE-POINTS-01/03 (D-12, D-18, C2) | T-06-02, T-06-05 | prod senza EventSub → boot rifiutato; `.env.example` vuoto; real-boot immune al `.env` | unit + integration | `npx jest src/config --selectProjects unit && npx jest test/app.int-spec.ts --selectProjects integration --runInBand && git diff --exit-code src/schema.gql` | ✅ estende env.validation.spec / app.int-spec | ✅ green |
| 06-02-T1 | 06-02 | 2 | BE-POINTS-01 (D-03) | T-06-10, T-06-11 | header mancanti/array/lunghi → null; routing dal body firmato | unit | `npx jest src/eventsub/eventsub-headers.spec.ts --selectProjects unit` | ❌ W0 → spec + `test/eventsub/eventsub-fixtures.ts` creati nel task | ✅ green |
| 06-02-T2 | 06-02 | 2 | BE-POINTS-01 (D-02) | T-06-06, T-06-07, T-06-08 | HMAC sui byte grezzi, timingSafeEqual con lunghezza, replay 10 min / +60 s | unit | `npx jest src/eventsub/eventsub-signature.spec.ts --selectProjects unit` | ❌ W0 → creato nel task | ✅ green |
| 06-02-T3 | 06-02 | 2 | BE-POINTS-01/02 (D-04, D-06, D-15) | T-06-09 | solo stringhe validate e interi positivi sicuri verso Mongo | unit | `npx jest src/eventsub --selectProjects unit` | ❌ W0 → creato nel task | ✅ green |
| 06-03-T1 | 06-03 | 3 | BE-POINTS-02 (D-08, D-09, C7) | T-06-13, T-06-14, T-06-15 | indici unico messageId, unico parziale {type,eventId}, TTL 604800; verifier non bloccante senza valori | unit | `npx jest src/eventsub --selectProjects unit && npm run build` | ❌ W0 → creato nel task | ✅ green |
| 06-03-T2 | 06-03 | 3 | BE-POINTS-02 SC2 (D-06, D-07, D-08) | T-06-12, T-06-13, T-06-16, T-06-17 | un solo credito per messaggio e per evento anche con 5 concorrenti; viewer sconosciuto senza traccia | integration | `npx jest src/eventsub/eventsub-ledger.int-spec.ts --selectProjects integration --runInBand` | ❌ W0 → creato nel task | ✅ green |
| 06-04-T1 | 06-04 | 3 | BE-POINTS-03 (D-13) | T-06-18, T-06-22 | errori Helix con sola operazione e status; fake per i test | unit | `npx jest src/eventsub/helix --selectProjects unit && npm run build` | ✅ spec + `test/eventsub/fake-twitch-helix.client.ts` + `test/eventsub/test-eventsub-config.ts` creati nel task | ✅ green |
| 06-04-T2 | 06-04 | 3 | BE-POINTS-03 (D-13, C6) | T-06-18, T-06-19 | token in memoria, single-flight, margine 5 min, nessun secret negli errori | unit | `npx jest src/eventsub/helix --selectProjects unit` | ✅ creato nel task | ✅ green |
| 06-04-T3 | 06-04 | 3 | BE-POINTS-03 SC3 (D-13) | T-06-18, T-06-20, T-06-21 | Client-Id + Bearer, 401 → un retry, 404 delete ok, tetto 20 pagine, timeout 5 s | unit | `npx jest src/eventsub --selectProjects unit && npm run build` | ✅ creato nel task | ✅ green |
| 06-05-T1 | 06-05 | 4 | BE-POINTS-03 (D-14, C5, C7) | T-06-23, T-06-24, T-06-25 | righe 1–8: pending keep, più vecchia fra enabled, varianti rimosse, non posseduti ignorati | unit | `npx jest src/eventsub/subscriptions/plan-reconciliation.spec.ts --selectProjects unit` | ❌ W0 → creato nel task | ✅ green |
| 06-05-T2 | 06-05 | 4 | BE-POINTS-03 SC3 (D-12, D-14) | T-06-23, T-06-25, T-06-26, T-06-27 | mai Helix in local/disabled; boot non atteso; timer unref; single-flight; secret mai nei log | unit (fake timers) | `npx jest src/eventsub --selectProjects unit && npm run build` | ❌ W0 → creato nel task | ✅ green |
| 06-06-T1 | 06-06 | 5 | BE-POINTS-01/02/03 SC1/SC2/SC4 (D-02..D-07, D-15, C1) | T-06-28..T-06-33 | firma prima del challenge; broadcaster check; push non atteso; 500 solo su errore DB; log senza firma/body | unit | `npx jest src/eventsub/eventsub-webhook.service.spec.ts --selectProjects unit && npm run build` | ❌ W0 → creato nel task | ⬜ pending |
| 06-06-T2 | 06-06 | 5 | BE-POINTS-03 (D-12, D-19) | T-06-32 | WARN disabled/local, LOG managed, nessun secret | unit | `npx jest src/eventsub --selectProjects unit` | ❌ W0 → creato nel task | ⬜ pending |
| 06-07-T1 | 06-07 | 6 | BE-POINTS-01 SC1 (D-01, D-02, D-03) | T-06-34..T-06-37 | 200 text/plain col solo challenge, 403 vuoti, 413, decoratore pubblico solo sulla riga dell'handler (`grep -rnE '^\s*@Public\(\)' src/eventsub` = 1), harness rawBody | integration | `npx jest src/eventsub/eventsub.controller.int-spec.ts test/auth --selectProjects integration --runInBand` | ❌ W0 → `test/eventsub/eventsub-test-app.ts` + int-spec creati nel task; estende `test/auth/auth-test-app.ts` | ⬜ pending |
| 06-07-T2 | 06-07 | 6 | BE-POINTS-02/03 SC2/SC3/SC4 (D-07, D-15, C7) | T-06-38 | credito una volta (riconsegna, 5 concorrenti, stesso event.id), push una volta, revocation → delete+create | integration | `npx jest src/eventsub --selectProjects integration --runInBand && npm run test:unit` | ❌ → creato nel task (prova di integrazione su unit già RED) | ⬜ pending |
| 06-08-T1 | 06-08 | 7 | BE-POINTS-01..03 (D-01, D-12, D-16, D-17) | T-06-39..T-06-42 | whitelist @Public a 6 voci, disabled con WARN `EventSub disabled` e senza fetch Twitch, 403, schema invariato | integration (real boot) | `npx jest test/app.int-spec.ts --selectProjects integration --runInBand && git diff --exit-code src/schema.gql` (RED atteso) | ✅ estende test/app.int-spec.ts | ⬜ pending |
| 06-08-T2 | 06-08 | 7 | BE-POINTS-01..03 | T-06-42 | suite completa verde col modulo montato | full suite | `npm run test:unit && npm run test:int && npm run build && git diff --exit-code src/schema.gql` | ✅ | ⬜ pending |
| 06-09-T1 | 06-09 | 8 | BE-POINTS-01..03 (D-17, D-18) | T-06-43, T-06-44 | gate completo + invarianti (un solo @Public, nessun push atteso, nessun $inc, nessuna dipendenza nuova) | full suite + grep | `npm run test:unit && npm run test:int && npm run build && git diff --exit-code src/schema.gql` + lint filtrato = 0 righe | ✅ | ⬜ pending |
| 06-09-T2 | 06-09 | 8 | BE-POINTS-01..03 (D-19) | T-06-45, T-06-46, T-06-48 | handoff verificato contro il codice; nessun secret nei documenti; traceability Complete | doc grep | `grep -q "POST /webhooks/twitch/eventsub" .planning/phases/06-eventsub-punti-canale-streamer-live/BACKEND-NOTES.md && grep -c '\| BE-POINTS-0[1-3] \| Phase 6 \| Complete \|' .planning/REQUIREMENTS.md` | ❌ → creati nel task | ⬜ pending |
| 06-09-T3 | 06-09 | 8 | BE-POINTS-01..03 (Twitch reale, C4) | T-06-47 | CLI locale, E2E reale, revoke dello streamer non scioglie l'autorizzazione | manual (checkpoint human-verify) | — (vedi Manual-Only) | n/a | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Le infrastrutture di test mancanti sono create dentro i task che le usano, sempre nel passo RED prima dell'implementazione:

- [ ] `src/config/eventsub-config.spec.ts` (+ `src/config/url-rules.ts` estratto) → 06-01 Task 1
- [ ] `test/app.int-spec.ts`: le quattro variabili nuove azzerate → 06-01 Task 3; whitelist RED con `'EventSubController.receive'`, spy su `fetch`, `createNestApplication({ rawBody: true })` → 06-08 Task 1
- [x] `test/eventsub/eventsub-fixtures.ts` (secret/id di test, `signEventSub`, `signedEventSubRequest`, body catturati dalla CLI) → 06-02 Task 1
- [x] `test/eventsub/fake-twitch-helix.client.ts` + `test/eventsub/test-eventsub-config.ts` (`buildTestEventSubConfig`, `buildLocalEventSubConfig`, `TEST_CALLBACK_URL`) → 06-04 Task 1
- [ ] `test/auth/auth-test-app.ts`: `createNestApplication({ rawBody: true })` retrocompatibile + `test/eventsub/eventsub-test-app.ts` (`createEventSubTestApp`, `postEventSub`) → 06-07 Task 1
- Framework install: none (Jest, supertest, harness replica set già presenti; nessuna dipendenza nuova)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| La Twitch CLI 1.1.24 accetta challenge, redemption (una sola volta con `-I` ripetuto), rifiuti per replay/secret errato, `stream.online` e revocation contro il BE in mode local | BE-POINTS-01, BE-POINTS-02, BE-POINTS-03 | Richiede la CLI e un `.env` locale configurato | `06-HUMAN-UAT.md` test 1 (comandi di BACKEND-NOTES §6) |
| Redemption reale accreditata e push su live reale con subscription `enabled` gestite da Helix | BE-POINTS-02, BE-POINTS-03 | Servono chiavi Twitch, tunnel HTTPS porta 443 e login dello streamer con lo scope | `06-HUMAN-UAT.md` test 2 (`cloudflared tunnel --url http://localhost:3000`, `TWITCH_LOGIN_SCOPES=channel:read:redemptions`) |
| C4: la revoke del token dello streamer dopo la validate non scioglie l'autorizzazione EventSub (create della redemption → 202, non 403) | BE-POINTS-03 | Comportamento esterno di Twitch non documentato in modo univoco (confidenza MEDIUM) | `06-HUMAN-UAT.md` test 3; se 403 → gap-closure TDD su `TwitchLoginService` (nessun `revokeQuietly` con `channel:read:redemptions`) |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (eccetto il checkpoint manuale 06-09-T3)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 60s (singoli spec; real-boot e suite completa solo in 06-01-T3, 06-08, 06-09)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved by planner 2026-10-19 (9 plan, 22 task, 8 wave)
