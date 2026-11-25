---
phase: 26
slug: eliminazione-account-e-consenso
status: executing
nyquist_compliant: false
wave_0_complete: false
created: 2026-11-24
---

# Phase 26 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 30 + ts-jest, progetti `unit` e `integration` (`package.json` → `jest.projects`), `mongodb-memory-server` 11 (replica set condiviso) |
| **Config file** | `package.json` (`jest`), `test/setup/global-setup.ts`, `test/setup/after-env.ts` |
| **Quick run command** | `npx jest <spec> --selectProjects unit` (per la int-spec del task: `npx jest <spec> --selectProjects integration --runInBand`) |
| **Full suite command** | `npx jest --selectProjects unit` + integration a blocchi `--runInBand` in foreground (piano 13); `npm run test:cov` lo lancia l'orchestratore in background |
| **Estimated runtime** | spec mirata ~5–60 s; unit completa ~15 s; integration completa ~11 minuti a blocchi |

---

## Sampling Rate

- **After every task commit:** la spec mirata del task + `npx tsc --noEmit -p tsconfig.json`
- **After every plan wave:** le spec delle cartelle toccate dal piano (`src/account`, `src/auth`, `src/quests/party`, `src/travel`, `src/characters/deletion`)
- **Before `/gsd-verify-work`:** gate del piano 13 verde (suite unit e integration complete, boot reale, matrice, SDL, inventario, coverage di `src/auth/`, `src/eventsub/`, `src/travel/`)
- **Max feedback latency:** 60 s per la spec mirata (le int-spec più grandi, come `account-eraser.int-spec.ts`, stanno sotto il minuto)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 26-01-01 | 01 | 1 | BE-DEL-01 | T-26-01, T-26-02 | proprietario solo `@Prop`, indice `character_user` | unit | `npx jest src/models/character/character.model.spec.ts --selectProjects unit` | ✅ | ✅ green |
| 26-01-02 | 01 | 1 | BE-DEL-01 | T-26-01 | creazione scrive `user`; SDL invariato | integration | `npx jest src/characters/creation/character-creation.resolver.int-spec.ts test/app.int-spec.ts --selectProjects integration --runInBand` | ✅ | ✅ green |
| 26-01-03 | 01 | 1 | BE-DEL-01 | — | N/A | bookkeeping | grep + `git status --short` (bookkeeping) | — | ✅ green |
| 26-02-01 | 02 | 2 | BE-CONSENT-01 | T-26-05, T-26-06 | versione firmata nello state, forma chiusa | unit | `npx jest src/auth/twitch/terms-version.spec.ts src/auth/twitch/oauth-state.service.spec.ts --selectProjects unit` ; `npx jest test/auth/http-guard.int-spec.ts test/auth/ws-auth.int-spec.ts --selectProjects integration --runInBand` | ✅ | ✅ green |
| 26-02-02 | 02 | 2 | BE-CONSENT-01, BE-CONSENT-02 | T-26-04, T-26-07, T-26-08 | rifiuto `terms_not_accepted`, consenso nell'upsert, bypass esente | integration | `npx jest src/auth/twitch/twitch-auth.controller.int-spec.ts test/auth/login-flow.int-spec.ts src/users/users.service.int-spec.ts src/users/user-updates.publisher.int-spec.ts src/auth/dev/dev-auth.strategy.int-spec.ts test/app.int-spec.ts --selectProjects integration --runInBand` | ✅ | ✅ green |
| 26-02-03 | 02 | 2 | BE-CONSENT-01 | — | N/A | bookkeeping | grep + `git status --short` (bookkeeping) | — | ✅ green |
| 26-03-01 | 03 | 3 | BE-DEL-06 | T-26-10, T-26-11, T-26-12 | revoca `accountDeleted` in transazione, registro col `Clock` | unit + integration | `npx jest src/auth/session/deleted-account.registry.spec.ts src/graphql/format-domain-error.spec.ts --selectProjects unit` ; `npx jest src/auth/session/session.service.int-spec.ts --selectProjects integration --runInBand` | ✅ | ✅ green |
| 26-03-02 | 03 | 3 | BE-DEL-06 | T-26-09 | 4409 `accountDeleted`, HTTP `UNAUTHENTICATED` per 15 minuti | unit + integration | `npx jest src/auth/guards/auth.guard.spec.ts --selectProjects unit` ; `npx jest src/auth/session/session-revocation.service.int-spec.ts test/auth/session-revocation.int-spec.ts test/auth/http-guard.int-spec.ts test/auth/ws-auth.int-spec.ts --selectProjects integration --runInBand` | ✅ | ✅ green |
| 26-03-03 | 03 | 3 | BE-DEL-06 | — | N/A | bookkeeping | grep + `git status --short` (bookkeeping) | — | ✅ green |
| 26-04-01 | 04 | 4 | BE-DEL-02 | T-26-15 | spese interne, mai sul filo | unit | `npx jest src/models/pending-quest.schema.spec.ts src/travel/food/quest-travel-spending.spec.ts --selectProjects unit` | ✅ | ✅ green |
| 26-04-02 | 04 | 4 | BE-DEL-02 | T-26-14, T-26-16 | spese nella transazione del pasto, una volta | integration | `npx jest src/travel/food/travel-food.sweep.int-spec.ts src/travel/travel-completion.int-spec.ts src/travel/ambush/ambush-resolution.int-spec.ts test/app.int-spec.ts --selectProjects integration --runInBand` | ✅ | ✅ green |
| 26-04-03 | 04 | 4 | BE-DEL-02 | — | N/A | bookkeeping | grep + `git status --short` (bookkeeping) | — | ✅ green |
| 26-05-01 | 05 | 5 | BE-DEL-03 | T-26-17 | rimborsi puri con tetti | unit | `npx jest src/quests/party/started-quest-cancel.spec.ts src/push/push-events.spec.ts --selectProjects unit` | ✅ | ✅ green |
| 26-05-02 | 05 | 5 | BE-DEL-03 | T-26-17, T-26-18, T-26-19, T-26-20 | solo quest cominciate, rimborso una volta | integration | `npx jest src/quests/party/started-quest-canceller.int-spec.ts --selectProjects integration --runInBand` | ✅ | ✅ green |
| 26-05-03 | 05 | 5 | BE-DEL-03 | — | N/A | bookkeeping | grep + `git status --short` (bookkeeping) | — | ✅ green |
| 26-06-01 | 06 | 6 | BE-DEL-04 | T-26-21 | codici e regole pure | unit | `npx jest src/account/deletion/account-deletion.exception.spec.ts src/account/deletion/account-erasure.plan.spec.ts --selectProjects unit` | ✅ | ✅ green |
| 26-06-02 | 06 | 6 | BE-DEL-04 | T-26-21..T-26-25 | una transazione, quest concluse ripulite, inventario per collection | integration | `npx jest src/account/deletion/account-eraser.int-spec.ts src/characters/deletion/character-archiver.int-spec.ts src/characters/deletion/character-deletion.resolver.int-spec.ts --selectProjects integration --runInBand` | ✅ | ✅ green |
| 26-06-03 | 06 | 6 | BE-DEL-04 | — | N/A | bookkeeping | grep + `git status --short` (bookkeeping) | — | ✅ green |
| 26-07-01 | 07 | 7 | BE-DEL-03, BE-DEL-04 | T-26-26 | annullamento prima dell'archivio | integration | `npx jest src/account/deletion/account-eraser.int-spec.ts --selectProjects integration --runInBand` | ✅ | ✅ green |
| 26-07-02 | 07 | 7 | BE-DEL-03, BE-DEL-04 | T-26-27, T-26-28 | aid del solo ferito come oggi, archivio invariato | integration | `npx jest src/account/deletion/account-eraser.int-spec.ts src/characters/deletion/character-deletion.resolver.int-spec.ts src/characters/deletion/character-archiver.int-spec.ts src/quests/outcomes/boss-resolution.int-spec.ts src/quests/outcomes/aid-rescue.int-spec.ts --selectProjects integration --runInBand` | ✅ | ✅ green |
| 26-07-03 | 07 | 7 | BE-DEL-03 | — | N/A | bookkeeping | grep + `git status --short` (bookkeeping) | — | ✅ green |
| 26-08-01 | 08 | 8 | BE-DEL-05 | T-26-29, T-26-30, T-26-32 | nessun argomento, oste rifiutato, SDL +1 | integration | `npx jest src/account/deletion/account-deletion.resolver.int-spec.ts test/app.int-spec.ts test/authz/authorization-matrix.int-spec.ts --selectProjects integration --runInBand` | ✅ | ✅ green |
| 26-08-02 | 08 | 8 | BE-DEL-06 | T-26-31 | revoca vista su socket, refresh e HTTP | integration | `npx jest src/account/deletion/account-deletion.resolver.int-spec.ts --selectProjects integration --runInBand` | ✅ | ✅ green |
| 26-08-03 | 08 | 8 | BE-DEL-05 | — | N/A | bookkeeping | grep + `git status --short` (bookkeeping) | — | ✅ green |
| 26-09-01 | 09 | 9 | BE-DEL-07 | T-26-37 | EventSub invariato | unit + integration | `npx jest src/eventsub --selectProjects unit` ; `npx jest src/eventsub test/eventsub --selectProjects integration --runInBand` | ✅ | ✅ green |
| 26-09-02 | 09 | 9 | BE-DEL-07 | T-26-33..T-26-36 | nome mai nei messaggi, forma prima della rete | unit | `npx jest src/auth/twitch/twitch-login-name.spec.ts src/auth/twitch/http-twitch-user-directory.spec.ts --selectProjects unit` | ✅ | ✅ green |
| 26-09-03 | 09 | 9 | BE-DEL-07 | — | N/A | bookkeeping | grep + `git status --short` (bookkeeping) | — | ✅ green |
| 26-10-01 | 10 | 10 | BE-DEL-07 | T-26-40 | argomenti oscurati, bersaglio dal risultato | unit + integration | `npx jest src/authz/audit --selectProjects unit` ; `npx jest src/authz/audit/admin-audit.int-spec.ts --selectProjects integration --runInBand` | ✅ | ✅ green |
| 26-10-02 | 10 | 10 | BE-DEL-07 | T-26-38..T-26-42 | solo oste, quattro codici, nome in nessuna collection, SDL +5 | integration | `npx jest test/authz/handler-fixtures.spec.ts --selectProjects unit` ; `npx jest src/account/deletion/account-deletion.resolver.int-spec.ts test/app.int-spec.ts test/authz/authorization-matrix.int-spec.ts --selectProjects integration --runInBand` | ✅ | ✅ green |
| 26-10-03 | 10 | 10 | BE-DEL-07 | — | N/A | bookkeeping | grep + `git status --short` (bookkeeping) | — | ✅ green |
| 26-11-01 | 11 | 11 | BE-DEL-08 | T-26-43, T-26-44 | solo la cartella dei ritratti caricati | unit | `npx jest src/account/deletion/portrait/portrait-public-id.spec.ts src/rest/cloudinary/cloudinary.service.spec.ts --selectProjects unit` | ✅ | ✅ green |
| 26-11-02 | 11 | 11 | BE-DEL-08 | T-26-45, T-26-46 | outbox senza legame all'utente, ritentativo | unit + integration | `npx jest src/account/deletion/portrait/portrait-deletion.sweeper.spec.ts --selectProjects unit` ; `npx jest src/account/deletion/portrait/portrait-deletion.service.int-spec.ts --selectProjects integration --runInBand` | ✅ | ✅ green |
| 26-11-03 | 11 | 11 | BE-DEL-08 | — | N/A | bookkeeping | grep + `git status --short` (bookkeeping) | — | ✅ green |
| 26-12-01 | 12 | 12 | BE-DEL-08 | T-26-47, T-26-49 | outbox in transazione, guardia dei sopravvissuti, topic | unit + integration | `npx jest src/push/push.service.spec.ts --selectProjects unit` ; `npx jest src/account/deletion/account-eraser.int-spec.ts src/account/deletion/account-deletion.resolver.int-spec.ts src/characters/deletion/character-deletion.resolver.int-spec.ts src/quests/party/party-timeout.int-spec.ts --selectProjects integration --runInBand` | ✅ | ✅ green |
| 26-12-02 | 12 | 12 | BE-DEL-08, BE-DEL-03 | T-26-48, T-26-50, T-26-51 | effetti dopo il commit, isolati dagli errori | integration | `npx jest src/account/deletion/account-deletion.resolver.int-spec.ts --selectProjects integration --runInBand` | ✅ | ✅ green |
| 26-12-03 | 12 | 12 | BE-DEL-08 | — | N/A | bookkeeping | grep + `git status --short` (bookkeeping) | — | ✅ green |
| 26-13-01 | 13 | 13 | tutti | T-26-54 | flusso completo sul filo | integration | `npx jest test/account/account-deletion-flow.int-spec.ts --selectProjects integration --runInBand` | ✅ | ✅ green |
| 26-13-02 | 13 | 13 | tutti | T-26-52..T-26-55 | gate: tsc, suite, SDL +5, inventario, coverage, invarianti | gate | `npx tsc --noEmit -p tsconfig.json && npx jest --selectProjects unit` + blocchi integration + `npx jest test/app.int-spec.ts test/authz/authorization-matrix.int-spec.ts --selectProjects integration --runInBand` | ✅ | ✅ green |
| 26-13-03 | 13 | 13 | tutti | — | N/A | bookkeeping | grep + `git status --short` (bookkeeping) | — | ✅ green |
| 26-14-01 | 14 | 14 | BE-DEL-09 | T-26-56, T-26-57 | handoff senza segreti né id reali | doc | grep di struttura e segreti su `BACKEND-NOTES.md` | ❌ W0 | ⬜ pending |
| 26-14-02 | 14 | 14 | tutti | T-26-58 | requisiti chiusi solo dopo il gate | bookkeeping | grep + `git status --short` (bookkeeping) | — | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky* — «File Exists» = `✅` se la spec esiste già e riceve casi nuovi, `❌ W0` se il task la crea nel suo RED.

---

## Wave 0 Requirements

Nessun piano separato di Wave 0: ogni spec nuova nasce nel RED del suo task (TDD del repo), prima dell'implementazione.

- [ ] `src/auth/twitch/terms-version.spec.ts` — forma di `termsVersion` (BE-CONSENT-01, piano 02)
- [ ] `src/auth/session/deleted-account.registry.spec.ts` — registro di 15 minuti (BE-DEL-06, piano 03)
- [ ] `src/models/pending-quest.schema.spec.ts`, `src/travel/food/quest-travel-spending.spec.ts` — spese del tragitto (BE-DEL-02, piano 04)
- [ ] `src/quests/party/started-quest-cancel.spec.ts`, `src/quests/party/started-quest-canceller.int-spec.ts` — annullamento (BE-DEL-03, piano 05)
- [ ] `src/account/deletion/account-deletion.exception.spec.ts`, `account-erasure.plan.spec.ts`, `account-eraser.int-spec.ts` — cancellazione e inventario (BE-DEL-04, piano 06)
- [ ] `src/account/deletion/account-deletion.resolver.int-spec.ts` — mutation e revoca sul filo (BE-DEL-05..08, piani 08, 10, 12)
- [ ] `src/auth/twitch/twitch-login-name.spec.ts`, `src/auth/twitch/http-twitch-user-directory.spec.ts`, `test/auth/fake-twitch-user-directory.ts` — directory Twitch (BE-DEL-07, piano 09)
- [ ] `src/account/deletion/portrait/portrait-public-id.spec.ts`, `portrait-deletion.service.int-spec.ts`, `portrait-deletion.sweeper.spec.ts`, `test/account/fake-portrait-store.ts` — ritratti (BE-DEL-08, piano 11)
- [ ] `test/account/account-deletion-flow.int-spec.ts` — flusso completo (piano 13)
- Framework: nessuna installazione (Jest, replica set in memoria e fake di Twitch OAuth e push già presenti).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Ritratto davvero cancellato su Cloudinary | BE-DEL-08 | nei test la porta è un fake; la rete esterna c'è solo al boot reale | dopo una cancellazione in UAT, l'URL del ritratto risponde 404 e la collection `portrait_deletions` è vuota |
| Disiscrizione reale dal topic FCM `streamer-live` | BE-DEL-08 | trasporto finto nei test; il permesso IAM dei topic è della console Firebase | dopo la cancellazione, un push «streamer in diretta» non arriva al telefono dell'account cancellato |
| Risoluzione Helix di un nome utente vero | BE-DEL-07 | nei test la directory è un fake; Helix risponde solo con credenziali reali | dal pannello dell'oste, un nome esistente senza account → `ACCOUNT_NOT_FOUND`; un nome inesistente → `TWITCH_USER_NOT_FOUND` |
| Finestra di 15 minuti con il monitor TTL di Mongo | BE-DEL-06 | il TTL di Mongo non gira dentro la suite (simulato cancellando le sessioni) | refresh dopo ~16 minuti da una cancellazione dell'oste → `SESSION_EXPIRED` |
| Avviso «account eliminato» sull'app di chi è online | BE-DEL-06 | serve la FE Phase 25 su device | UAT del handoff §7, passo 3 |
| Dati di sviluppo orfani (D-24) e utenti senza consenso (D-11) | BE-DEL-01, BE-CONSENT-02 | sono dati del database reale, che gli esecutori non toccano | l'orchestratore decide al boot reale (BACKEND-NOTES.md §7) |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
