---
phase: 17
slug: autorizzazione-e-sessioni
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-11-09
---

# Phase 17 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest (progetti `unit` e `integration`, `package.json`), `MongoMemoryReplSet` condiviso (`test/setup/`), Redis effimero, harness `createAuthTestApp`/`createCharactersTestApp`, token per ruolo `signTestAccessToken`, client WS `test/auth/ws-test-client.ts` |
| **Config file** | `package.json` (sezione `jest`, `coverageThreshold` per cartella: `./src/auth/` 97/84/98) |
| **Quick run command** | `npx jest <spec toccate> --selectProjects unit` / `npx jest <spec toccate> --selectProjects integration --runInBand` (il comando `<automated>` del task) |
| **Full suite command** | `npm run test:cov` (nel piano di gate; ripiego per cartella se supera i 600 s dello strumento) |
| **Estimated runtime** | ~32 s per `src/auth` + `test/auth` (misurati, RESEARCH F-8); ~1 min per il controllo di wave `src/auth test/auth test/authz src/users src/graphql`; `test:cov` ≈ 576 s → ripiego per cartella con `--coverageThreshold='{}'` e lettura del `json-summary` (D-15) |

---

## Sampling Rate

- **After every task commit:** il comando `<automated>` del task + `npx tsc --noEmit -p tsconfig.json` + `pgrep -fl 'bin/jest'` vuoto + controllo trailer `git log -1 --format=%B | grep -ciE "co-authored-by|generated with|claude-session"` = 0
- **After every plan wave:** `npx jest src/auth test/auth test/authz --selectProjects unit` e `npx jest src/auth test/auth test/authz --selectProjects integration --runInBand` (un piano = una wave, catena lineare)
- **Before `/gsd-verify-work`:** suite completa verde con coverage (gate), boot reale (`test/app.int-spec.ts`) con whitelist invariata e `git diff --exit-code src/schema.gql` vuoto
- **Max feedback latency:** 60 s

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 17-01-01 | 01 | 1 | BE-SESSION-03 | T-17-02, T-17-03, T-17-04 | enum chiuso a quattro valori, campo nullable, `extensions.reason` solo nell'eccezione, body Nest invariato | unit | `npx jest src/auth/session/session.model.spec.ts src/auth/auth.exception.spec.ts test/fixtures/fixtures.spec.ts --selectProjects unit` | ✅ | ✅ green |
| 17-01-02 | 01 | 1 | BE-SESSION-03 | T-17-01 | allowlist della sola chiave `reason` (stringa) nei due formatter, HTTP e WS, sviluppo e produzione | unit | `npx jest src/graphql --selectProjects unit` | ✅ | ✅ green |
| 17-01-03 | 01 | 1 | BE-SESSION-03 | — | bookkeeping | doc | `grep -qF -- "- [x] 17-01-PLAN.md" .planning/ROADMAP.md` | ✅ | ✅ green |
| 17-02-01 | 02 | 2 | BE-SESSION-02, BE-SESSION-03, BE-SESSION-04 | T-17-06, T-17-07 | motivo scritto su ogni revoca, `reuseDetected`, motivo memorizzato o assente nel rifiuto, logout `userLogout` | integration | `npx jest src/auth/session/session.service.int-spec.ts src/auth/auth-session.service.int-spec.ts --selectProjects integration --runInBand` | ✅ | ✅ green |
| 17-02-02 | 02 | 2 | BE-SESSION-02, BE-SESSION-03 | T-17-05, T-17-08 | revoca per utente con `_id` minore della sessione da tenere, idempotente; lettura per la `connection_init`; reason sul filo HTTP in produzione | integration | `npx jest src/auth/session/session.service.int-spec.ts src/graphql/production-surface.int-spec.ts --selectProjects integration --runInBand` | ✅ | ✅ green |
| 17-02-03 | 02 | 2 | BE-SESSION-02 | — | bookkeeping | doc | `grep -qF -- "- [x] 17-02-PLAN.md" .planning/ROADMAP.md` | ✅ | ✅ green |
| 17-03-01 | 03 | 3 | BE-SESSION-02 | T-17-09, T-17-11 | `closeSessions` chiude con `4409` + motivo solo i socket delle sessioni date e le dimentica | unit | `npx jest src/auth/ws --selectProjects unit` | ✅ | ✅ green |
| 17-03-02 | 03 | 3 | BE-SESSION-02, BE-SESSION-04 | T-17-10, T-17-12 | revoca a DB prima della chiusura dei socket; nessuna chiusura se la revoca fallisce | integration | `npx jest src/auth/session/session-revocation.service.int-spec.ts test/auth/auth-test-app.int-spec.ts --selectProjects integration --runInBand` | ✅ | ✅ green |
| 17-03-03 | 03 | 3 | BE-SESSION-02 | — | bookkeeping | doc | `grep -qF -- "- [x] 17-03-PLAN.md" .planning/ROADMAP.md` | ✅ | ✅ green |
| 17-04-01 | 04 | 4 | BE-SESSION-02 | T-17-13, T-17-14, T-17-15, T-17-16, T-17-17 | registrazione prima della lettura, `4409` + `false` per una sessione revocata, nessuna registrazione né timer su socket chiuso (anche durante la lettura), pulizia in `onClose` | unit | `npx jest src/auth/ws --selectProjects unit` | ✅ | ✅ green |
| 17-04-02 | 04 | 4 | BE-SESSION-02 | T-17-13, T-17-15 | `4409` sul filo reale alla `connection_init` e dal registro; socket chiuso dal client tolto dal registro | integration | `npx jest test/auth/ws-auth.int-spec.ts --selectProjects integration --runInBand` | ✅ | ✅ green |
| 17-04-03 | 04 | 4 | BE-SESSION-02 | — | bookkeeping | doc | `grep -qF -- "- [x] 17-04-PLAN.md" .planning/ROADMAP.md` | ✅ | ✅ green |
| 17-05-01 | 05 | 5 | BE-SESSION-02 | T-17-20, T-17-21 | il login revoca le altre sessioni dopo aver creato la nuova; login fallito se la revoca fallisce | integration | `npx jest src/auth/auth-session.service.int-spec.ts --selectProjects integration --runInBand` | ✅ | ✅ green |
| 17-05-02 | 05 | 5 | BE-SESSION-02, BE-SESSION-03 | T-17-18, T-17-19, T-17-22 | secondo login → socket `4409 newLogin`, `connection_init` rifiutata, refresh `newLogin`, JWT residuo su HTTP, nuova sessione intatta, logout senza chiusura | integration | `npx jest test/auth/session-revocation.int-spec.ts --selectProjects integration --runInBand` | ✅ | ✅ green |
| 17-05-03 | 05 | 5 | BE-SESSION-02 | — | bookkeeping | doc | `grep -qF -- "- [x] 17-05-PLAN.md" .planning/ROADMAP.md` | ✅ | ✅ green |
| 17-06-01 | 06 | 6 | BE-SESSION-04 | T-17-24, T-17-25, T-17-26 | watcher sul solo `updatedFields.role`, delega la revoca, log senza messaggio d'errore | unit | `npx jest src/auth/session/user-role-changes.publisher.spec.ts --selectProjects unit` | ✅ | ✅ green |
| 17-06-02 | 06 | 6 | BE-SESSION-04 | T-17-23, T-17-24, T-17-27, T-17-28 | cambio di ruolo a mano o via `upsertWithRole` → `roleChanged` + `4409`; stesso valore o altro campo → nulla; spec D-14 stabili; watcher montato | integration | `npx jest src/auth/session/user-role-changes.publisher.int-spec.ts src/auth/auth-session.service.int-spec.ts src/users/user-updated.subscription.int-spec.ts --selectProjects integration --runInBand` | ✅ | ✅ green |
| 17-06-03 | 06 | 6 | BE-SESSION-04 | — | bookkeeping | doc | `grep -qF -- "- [x] 17-06-PLAN.md" .planning/ROADMAP.md` | ✅ | ✅ green |
| 17-07-01 | 07 | 7 | BE-SESSION-01 | T-17-29, T-17-31 | liste condivise identiche a quelle di `develop`, boot reale estratto e verde con gli stessi test | integration | `npx jest test/app.int-spec.ts --selectProjects integration --runInBand` | ✅ | ✅ green |
| 17-07-02 | 07 | 7 | BE-SESSION-01 | T-17-30 | una fixture per handler, documento valido per lo SDL, variabili coercibili, vittima vera | unit | `npx jest test/authz/handler-fixtures.spec.ts --selectProjects unit` | ✅ | ✅ green |
| 17-07-03 | 07 | 7 | BE-SESSION-01 | — | bookkeeping | doc | `grep -qF -- "- [x] 17-07-PLAN.md" .planning/ROADMAP.md` | ✅ | ✅ green |
| 17-08-01 | 08 | 8 | BE-SESSION-01 | T-17-32, T-17-33, T-17-34, T-17-35 | righe HTTP: `FORBIDDEN` per ruolo e proprietà, `UNAUTHENTICATED` senza bearer valido, completezza e controlli positivi | integration | `npx jest test/authz/authorization-matrix.int-spec.ts --selectProjects integration --runInBand` | ✅ | ✅ green |
| 17-08-02 | 08 | 8 | BE-SESSION-01 | T-17-32, T-17-33 | righe WS: `FORBIDDEN` alla subscribe, `4403 Forbidden` alla `connection_init` senza bearer valido | integration | `npx jest test/authz/authorization-matrix.int-spec.ts --selectProjects integration --runInBand` | ✅ | ✅ green |
| 17-08-03 | 08 | 8 | BE-SESSION-01 | — | bookkeeping | doc | `grep -qF -- "- [x] 17-08-PLAN.md" .planning/ROADMAP.md` | ✅ | ✅ green |
| 17-09-01 | 09 | 9 | BE-SESSION-05 | T-17-36, T-17-37, T-17-38, T-17-39, T-17-40 | `tsc`, suite e coverage `./src/auth/` ≥ 97/84/98, boot reale, SDL e whitelist invariati, invarianti | gate | `npx tsc --noEmit -p tsconfig.json` + `npm run test:cov` (ripiego per cartella con `--coverageThreshold='{}'`) + `git diff --exit-code src/schema.gql` | ✅ | ✅ green |
| 17-09-02 | 09 | 9 | BE-SESSION-05 | — | VALIDATION firmata | doc | `grep -q "nyquist_compliant: true" .planning/phases/17-autorizzazione-e-sessioni/17-VALIDATION.md` | ✅ | ✅ green |
| 17-09-03 | 09 | 9 | BE-SESSION-05 | — | bookkeeping | doc | `grep -qF -- "- [x] 17-09-PLAN.md" .planning/ROADMAP.md` | ✅ | ⬜ pending |
| 17-10-01 | 10 | 10 | BE-SESSION-05 | T-17-41, T-17-42, T-17-43, T-17-44 | handoff col contratto verbatim, evidenza HARDEN-02, note UAT senza segreti | doc | `grep -q 4409 .planning/phases/17-autorizzazione-e-sessioni/BACKEND-NOTES.md` | ❌ W0 | ⬜ pending |
| 17-10-02 | 10 | 10 | BE-SESSION-01, BE-SESSION-02, BE-SESSION-03, BE-SESSION-04, BE-SESSION-05 | — | requisiti completi solo nel piano di chiusura | doc | `grep -cE "\- \[x\] \*\*BE-SESSION-0[1-5]\*\*" .planning/REQUIREMENTS.md` = 5 | ✅ | ⬜ pending |
| 17-10-03 | 10 | 10 | BE-SESSION-05 | — | bookkeeping | doc | `grep -qF -- "- [x] 17-10-PLAN.md" .planning/ROADMAP.md` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `test/authz/expected-handlers.ts` — le tre liste condivise (refactor di `test/app.int-spec.ts`, verde prima e dopo)
- [x] `test/harness/real-app-boot.ts` — env e boot reale di `AppModule` condivisi (C-2), usato da `test/app.int-spec.ts` e dalla matrice
- [x] `test/authz/handler-fixtures.ts` e `test/authz/authorization-matrix.int-spec.ts` — BE-SESSION-01
- [x] `src/auth/ws/ws-session-registry.spec.ts` — BE-SESSION-02
- [x] `test/auth/session-revocation.int-spec.ts` — filo WS + HTTP di D-02/D-03/D-05 (BE-SESSION-02/03)
- [x] `src/auth/session/user-role-changes.publisher.int-spec.ts` — BE-SESSION-04, con l'helper di priming (Pitfall 3)
- [x] `src/auth/session/session-revocation.service.int-spec.ts` — ordine DB → socket (BE-SESSION-02)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Boot reale della build finale: whitelist degli handler invariata, SDL invariato, nessun log con token o hash | BE-SESSION-05 | Il boot contro il database reale lo lancia solo l'orchestratore | Runbook nel handoff §4 (piano 17-10): build, boot, lettura dei log di avvio (solo conteggi), `git diff --exit-code src/schema.gql` |
| UAT dual-device: il secondo login reale (telefono + emulatore, stesso account Twitch) chiude il WS del primo con `4409 newLogin` e la FE mostra il notice; cambio di `role` a mano → `4409 roleChanged` su entrambi | BE-SESSION-02, BE-SESSION-04 | Appartiene alla FE Phase 12 (device reali, login Twitch reale) dopo la merge | Note nel handoff §3 (piano 17-10): un solo processo BE, `DEV_AUTH_TWITCH_ID` distinto dal twitchId reale |
| UAT della release FE via tunnel TLS: login, refresh e WS `wss://` attraverso il tunnel senza modifiche BE | BE-SESSION-05 | Configurazione del tunnel e della console Twitch a carico dell'utente | Note nel handoff §3 (piano 17-10): `TWITCH_REDIRECT_URI` del tunnel registrata su Twitch, `APP_AUTH_REDIRECT_URL` invariata, throttler per IP |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 60 s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-11-09
