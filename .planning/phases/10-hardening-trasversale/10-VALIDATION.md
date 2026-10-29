---
phase: 10
slug: hardening-trasversale
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-10-29
---

# Phase 10 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 30.1.3 + ts-jest 29.4.1, progetti unit (`*.spec.ts`) e integration (`*.int-spec.ts`, MongoMemoryReplSet condiviso, Redis effimero per il boot reale) |
| **Config file** | `package.json` → `jest.projects`; `test/setup/global-setup.ts` |
| **Quick run command** | `npx jest <percorsi del task> --selectProjects unit` / `npx jest <percorsi del task> --selectProjects integration --runInBand` |
| **Full suite command** | `npm run test:unit && npm run test:int && npm run build && git diff --exit-code src/schema.gql` (dal piano 10-24: `npm run test:cov`) |
| **Estimated runtime** | ~5 s unit per spec mirata, ≤ 60 s integration per spec mirata, ~4-5 min suite completa con coverage |

---

## Sampling Rate

- **Dopo ogni commit di task:** la spec mirata (`npx jest <file> …`, di norma ≤ 60 s) + `npx eslint <file>` + `npx prettier --check <file>` sui file toccati
- **Per piano:** le suite complete (`npm run test:int` / `npm run test:cov`) SOLO dove il piano lo prescrive, in foreground, con durata di minuti (≈ 4-5 min per `test:cov`)
- **Prima di `/gsd-verify-work`:** la suite completa deve essere verde
- **Max feedback latency:** ≤ 60 s per task (spec mirata); suite complete: minuti, non promesse a 60 s

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 10-01-01 | 01 | 1 | BE-HARD-08 | T-10-02 | il contratto additivo `pendingQuest: ID` è scritto nel boot reale, nel builder e nel service prima del codice (RED) | unit + integration | `npx jest src/quests/pending-requests/pending-requests.builder.spec.ts --selectProjects unit` / `npx jest src/quests/pending-requests/pending-requests.service.int-spec.ts test/app.int-spec.ts --selectProjects integration --runInBand` | ✅ | ✅ green |
| 10-01-02 | 01 | 1 | BE-HARD-08 | T-10-01 / T-10-02 / T-10-04 | la coda del GM (solo innkeeper) espone la corsia standard, la voce occupata resta in lista, filtro esplicito sui personaggi attivi; SDL con una sola riga additiva | unit + integration | `npx jest src/quests/pending-requests --selectProjects unit` / `npx jest src/quests/pending-requests --selectProjects integration --runInBand` + `git diff --exit-code src/schema.gql` | ✅ | ✅ green |
| 10-01-03 | 01 | 1 | BE-HARD-08 | T-10-03 / T-10-04 | accettazione, risoluzione, abbandono e scioglimento riemettono la corsia; un archivio riemette la coda senza la voce, la raffica si fonde nel ricalcolo unico | unit + integration | `npx jest src/quests/pending-requests/archived-character-queue.refresher.spec.ts --selectProjects unit` / `npx jest src/quests/pending-requests/standard-lane-liveness.int-spec.ts test/app.int-spec.ts --selectProjects integration --runInBand` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Per-Requirement Verification

| Requirement | Comportamento | Comando | Piani | Stato |
|-------------|---------------|---------|-------|-------|
| BE-HARD-01 | collettore dei campi, forma dell'eccezione, copertura dei decoratori dei 17 input, `@IsObjectIdHex`; campo non decorato scartato (`EquipSpellRequest.usages`), id malformato → `BAD_USER_INPUT`; upload: oltre misura 413, due file 400, non immagine 400, JPEG `application/octet-stream` accettato | `npx jest src/validation --selectProjects unit` / `npx jest src/validation/validation.int-spec.ts src/rest/cloudinary --selectProjects integration --runInBand` | 10-05, 10-06, 10-08, 10-09, 10-10, 10-12 | ⬜ pending |
| BE-HARD-02 | introspection spenta (HTTP + WS), niente suggerimenti, landing disattivata, `INTERNAL_SERVER_ERROR` sanitizzato con `requestId`; filtro REST 500, nessun header CORS; throttling GraphQL/REST/OAuth/webhook; allowlist di `NODE_ENV` | `npx jest src/graphql/production-surface.int-spec.ts src/http src/throttling src/eventsub/eventsub-throttle.int-spec.ts --selectProjects integration --runInBand` / `npx jest src/config/runtime-config.spec.ts --selectProjects unit` | 10-07, 10-10, 10-11, 10-12, 10-13, 10-14 | ⬜ pending |
| BE-HARD-03 | drift fra `.env.example` e chiavi del codice; job gitleaks verde su push/PR e su `workflow_dispatch` (storia) | `npx jest src/config/env-example.drift.spec.ts --selectProjects unit` + run di GitHub Actions (controllo manuale) | 10-03, 10-07, 10-15 | ⬜ pending |
| BE-HARD-04 | soglie di coverage per area applicate | `npm run test:cov` | 10-24, 10-25 | ⬜ pending |
| BE-HARD-05 | tabella della policy (un test per categoria, casi solo-log, chiavi mancanti), mappatura del client Sightengine con `fetch` stubbato, immagine rifiutata mai su Cloudinary (422 con soli motivi), servizio non disponibile 503, configurazione che rifiuta chiavi mancanti in produzione | `npx jest src/moderation/image-policy.spec.ts src/moderation/sightengine-image.moderator.spec.ts src/config/moderation-config.spec.ts --selectProjects unit` / `npx jest src/rest/cloudinary --selectProjects integration --runInBand` | 10-15, 10-16, 10-17 | ⬜ pending |
| BE-HARD-06 | riapertura dei change stream, single-flight di `UserUpdatesPublisher`, opzioni di fallimento delle code, indici presenti (`listIndexes`), backfill unico al boot, liste di `Enemy.locations`/`PointOfInterest.type`, record di `@AuditTarget`, refactor verdi sulle reti esistenti; migrazione dei ref `Mixed` (secondo giro a 0 modifiche, `--verify` a 0, stringhe non esadecimali intatte) | per file / `npx jest src/migrations --selectProjects integration --runInBand` | 10-04, 10-18, 10-19, 10-20, 10-23, 10-26, 10-27, 10-28, 10-29 | ⬜ pending |
| BE-HARD-07 | il segnaposto di posto conta in combattimento (resolver scriptato) senza risultato né ricompensa, log INFO; variante del soccorso; avvio da soli atomico all'arrivo e all'accettazione; avvio del party emette `characterUpdated` | `npx jest src/quests/outcomes/boss-resolution.int-spec.ts src/quests/outcomes/aid-rescue.int-spec.ts src/travel/travel-completion.int-spec.ts src/quests/party --selectProjects integration --runInBand` | 10-21, 10-22 | ⬜ pending |
| BE-HARD-08 | `PendingRequestCharacter.pendingQuest` proiettato (null se libera, id se occupata, null nel viaggio libero); riemissione a ogni transizione della corsia standard e dopo un archivio; `completePendingRequest` → `QUEST_IN_PROGRESS` senza scritture; SDL con una sola riga additiva | `npx jest src/quests/pending-requests --selectProjects unit` / `npx jest src/quests/pending-requests src/quests/outcomes/gm-completion.service.int-spec.ts --selectProjects integration --runInBand` | 10-01, 10-02 | ⬜ pending |

*Tutti i requisiti tornano nell'handoff e nel gate finale (10-30, 10-31).*

---

## Wave 0 Requirements

- [ ] dipendenze `class-validator`, `class-transformer`, `@nestjs/throttler` — piano 10-05
- [ ] RED di `test/app.int-spec.ts` (handler throttled, reporter montati, chiavi opzionali svuotate, test dell'introspection rinominato) — piani 10-01, 10-07, 10-08, 10-11, 10-12, 10-13, 10-14, 10-15, 10-17, 10-18, 10-19, 10-22, 10-26
- [ ] harness: `createAuthTestApp` con `APP_PIPE`, `APP_FILTER`, `ThrottlerModule`, override di `ImageModerator` (finto) e flag `production` per `createGraphQLOptions` — piani 10-07, 10-08, 10-11, 10-12, 10-13, 10-17
- [ ] `test/moderation/fake-image-moderator.ts` — piano 10-16
- [ ] `collectCoverageFrom` esclude gli spec (prima di ogni soglia) — piano 10-24

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| primo `workflow_dispatch` di gitleaks sulla storia completa | BE-HARD-03 | richiede il push del branch e l'esecuzione su GitHub Actions | l'utente, dopo il push, avvia il workflow a mano e controlla che il run sia verde |
| migrazione dei ref su una copia ripristinata e poi in produzione prima del deploy | BE-HARD-06 | richiede un dump reale del database | l'utente segue il runbook del piano 10-29 (`--verify` a 0 sulla copia, poi in produzione) |
| una chiamata Sightengine reale con chiavi vere (A2) | BE-HARD-05 | i test non usano mai la rete né chiavi reali | l'utente, con le chiavi nel proprio `.env`, carica un'immagine accettabile e una da rifiutare |
| UAT del pannello del GM | BE-HARD-08 | il consumo del campo è nel piano gated della FE Phase 10 | UAT della FE Phase 10 dopo la PR di questa fase |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency ≤ 60 s per task (spec mirata)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
