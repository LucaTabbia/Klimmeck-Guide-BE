---
phase: 10-hardening-trasversale
verified: 2026-10-30T14:47:34Z
status: passed
score: "8/8 success criteria verificati nel codice e nei test; 8/8 requisiti BE-HARD-01..08 giustificati"
overrides_applied: 0
re_verification:
  previous_status: none
  note: "Verifica iniziale. Nessun VERIFICATION.md precedente."
gaps: []
deferred:
  - truth: "Rimozione dei lettori tolleranti dei ref (refIdOf, idForms, sameId, objectIdFromHex) dopo la migrazione dei ref Mixed"
    addressed_in: "Backlog v1.1 (C14)"
    evidence: "Dichiarata nel handoff e nel 10-VALIDATION: i lettori restano finché la migrazione non è eseguita in produzione."
  - truth: "Stabilità del test del boot reale (global auth guard in test/app.int-spec.ts: 1 fallimento su 3 al piano 10-24, poi 10 run verdi)"
    addressed_in: "Noto, non bloccante"
    evidence: "SUMMARY 10-24 e 10-31."
  - truth: "Due subject di commit da 73 caratteri (d9d7984, dbfc6e7), 27 warning ESLint preesistenti, Open Question 6 della Phase 9.2"
    addressed_in: "Storia non riscritta / preesistenti / dichiarata nel handoff §13"
    evidence: "Note cumulative dell'orchestratore e BACKEND-NOTES §13."
human_verification:
  - test: "Migrazione dei ref in produzione: seguire docs/runbooks/mixed-refs-migration.md (copia ripristinata, poi produzione col codice attuale, deploy, apply e verify subito dopo)"
    expected: "Report JSON di verify di copia e produzione senza ERROR del verificatore; solo allora la PR passa da draft a pronta"
    why_human: "Richiede un dump e un database reali; decisione dei piani 10-29/10-31 (manual-only), blocca il merge ma non è un gap di codice"
  - test: "Primo workflow_dispatch del workflow Secret scan (gitleaks) sulla storia completa dopo il push del branch"
    expected: "Run verde su GitHub Actions; la sintassi [allowlist] della 8.24.x è accettata"
    why_human: "Esecuzione solo su GitHub Actions"
  - test: "Chiamata Sightengine reale (A2) con chiavi vere nel proprio .env: caricare un'immagine accettabile e una da rifiutare"
    expected: "La prima ottiene l'URL Cloudinary; la seconda risponde 422 IMAGE_REJECTED e non raggiunge Cloudinary"
    why_human: "I test non usano mai la rete né chiavi reali"
  - test: "Conferma dei default (BACKEND-NOTES §11): policy Sightengine A2-A5, throttle 60 000 ms / 20 / webhook x50, THROTTLE_TRUST_PROXY vuota = spenta, error=rate_limited, sintassi [allowlist] A8"
    expected: "L'utente approva o corregge i valori"
    why_human: "Decisioni di prodotto/operative"
  - test: "Impostare THROTTLE_TRUST_PROXY quando la topologia di deploy sarà nota"
    expected: "Con hop o elenco corretti il limite per IP distingue i client dietro il proxy fidato"
    why_human: "Dipende dall'infrastruttura, non nota ora"
  - test: "UAT del pannello del GM nella FE Phase 10 dopo la merge di questa PR (campo pendingQuest, QUEST_IN_PROGRESS)"
    expected: "Il pannello nasconde chi è in corsia standard occupata e il completamento risponde QUEST_IN_PROGRESS"
    why_human: "Il consumo del campo è nel piano gated 10-11 della FE; il contratto lo verifica il gate FE"
---

# Phase 10: Hardening Trasversale Verification Report

**Phase Goal:** Hardening trasversale: validazione input, introspection off/CORS/error sanitization in prod, igiene dei secret, coverage di test sulle aree critiche (più moderazione immagini, throttling, debiti rinviati, segnaposto in combattimento, coda del GM).
**Verified:** 2026-10-30T14:47:34Z
**Status:** passed
**Re-verification:** No, verifica iniziale (HEAD `3a8ce4b`, branch `feat/10-hardening`)

Le voci manuali elencate in `human_verification` sono MANUAL-ONLY per decisione dei piani 10-29/10-31 (riga del 10-VALIDATION): non sono gap.

## Goal Achievement

### Observable Truths (success criteria del ROADMAP)

| # | Truth | Status | Evidenza |
|---|-------|--------|----------|
| 1 | Input GraphQL/REST validati da class-validator + pipe globale | VERIFIED | `src/validation/validation.module.ts` registra `APP_PIPE` con `createValidationPipe`; nessun `useGlobalPipes` nel codice; `@IsObjectIdHex`, `ObjectIdPipe`/`ObjectIdListPipe`, `BadUserInputException`; spec di copertura `input-decorators.spec.ts` contro i 17 input dello schema (verde), `validation-pipe.int-spec.ts`, `scalar-ids.int-spec.ts`, `catalog-ids.int-spec.ts`; `CloudinaryFolderRequest` per il REST |
| 2 | Introspection off in produzione, errori sanitizzati, CORS esplicito e documentato | VERIFIED | `src/graphql/graphql-options.factory.ts`: `introspection: !production`, `hideSchemaDetailsFromClientErrors`, stacktrace spenti, `NoSchemaIntrospectionCustomRule` per graphql-ws; `src/http/` con `RequestIdMiddleware` e `UnhandledExceptionFilter`; CORS chiuso per scelta (nessuna chiamata di abilitazione in `main.ts`), documentato in BACKEND-NOTES riga 156 (D-06); spec `graphql-options.factory.spec.ts` verde |
| 3 | `.env.example` completo, nessun secret, audit CI | VERIFIED | `.env.example` unico file env tracciato, segreti vuoti; `env-example.drift.spec.ts` e `env-example.secrets.spec.ts` verdi (chiavi codice e template coincidenti nei due sensi); `.github/workflows/gitleaks.yml` (gitleaks-action v3; push, PR, `workflow_dispatch`, schedule) e `.gitleaks.toml` con `[allowlist]` |
| 4 | Coverage su auth, atomics, EventSub, travel | VERIFIED | Gate 10-31 (da SUMMARY, non rieseguito): `test:cov` 278 suite / 3667 test, totale S 96.55 / B 85.14 / F 91.44 / L 97.1, 8 soglie per cartella rispettate; unit 179 / 2392, integration 99 / 1275 |
| 5 | Sightengine: 422 `IMAGE_REJECTED`, 503 fail-closed, chiavi obbligatorie in produzione | VERIFIED | `src/moderation/` (`image-policy.ts` con soglia 0.5, `sightengine-image.moderator.ts`, `image-moderation.exceptions.ts` con i due codici, `disabled-image.moderator.ts`, `moderation-config.ts` validato in `validateEnv`); `PortraitUploadService` nel controller `uploadImage`; `image-policy.spec.ts` verde; la chiamata reale è manual-only |
| 6 | 429 su login, refresh, OAuth, webhook, upload; prod spenta; solo `INTERNAL_SERVER_ERROR` + `requestId` | VERIFIED | `@Throttled()` su `auth.resolver.ts` (2), `twitch-auth.controller.ts` (2), `cloudinary.controller.ts` (3); `@ThrottledWebhook()` su `eventsub.controller.ts`; `throttle-config.ts`, `OAuthRateLimitRedirectFilter`, `TrustProxyConfigurer`; `UnhandledExceptionFilter` con `requestId`; `RUNTIME_CONFIG` a tre valori |
| 7 | Debiti BE-HARD-06 chiusi con test | VERIFIED | `src/mongo/change-stream-publisher.ts` esteso da 7 publisher (spec verde, int-spec di reopen); `removeOnFail: FAILED_JOBS_KEPT` in `src/queues/enqueue-trigger.ts`; `KeyedSingleFlight` su `user-updates.publisher.ts`; indice su `status.spellStates.recoveries` nel modello Character; nessun `Mixed` residuo nei ref (resta solo il payload dell'audit log); `src/migrations/run-mixed-refs.ts` + CLI int-spec; runbook con 6 sezioni; esecuzione in produzione manual-only |
| 8 | `pendingQuest` sulla coda del GM e `QUEST_IN_PROGRESS` senza scritture | VERIFIED | `src/schema.gql` +1 riga additiva (`pendingQuest: ID`), 0 rimosse rispetto a `origin/develop`; `pending-requests.builder.ts`/`service`/`publisher`; `STANDARD_LANE_FREE` in `quest-lanes.ts`; `QUEST_IN_PROGRESS` in `game-rule-error-code.enum.ts`; `pending-requests.builder.spec.ts` verde |

**Score:** 8/8 (BE-HARD-07, segnaposto in combattimento: `group-roster.ts`, `boss-resolution.service.ts`, `rescue-resolution.service.ts`, `lane-members.ts`, coperti dal gate 10-31 e da BACKEND-NOTES §8)

### Requirements Coverage

| Requisito | Stato | Evidenza |
|-----------|-------|----------|
| BE-HARD-01 | SATISFIED | SC1 |
| BE-HARD-02 | SATISFIED | SC2, SC6 |
| BE-HARD-03 | SATISFIED | SC3 |
| BE-HARD-04 | SATISFIED | SC4 (gate coverage 10-31) |
| BE-HARD-05 | SATISFIED | SC5 |
| BE-HARD-06 | SATISFIED | SC7 (migrazione in produzione pendente per decisione) |
| BE-HARD-07 | SATISFIED | segnaposto nei servizi di risoluzione |
| BE-HARD-08 | SATISFIED | SC8 |

Nessun requisito orfano: REQUIREMENTS.md li mappa tutti alla Phase 10 (Complete), giustificato dal codice sopra.

### Behavioral Spot-Checks

| Comportamento | Comando | Esito |
|---------------|---------|-------|
| Template env, introspection, policy immagini, publisher, input, coda GM | `npx jest <7 spec> --selectProjects unit` | 7 suite / 119 test verdi |

Suite complete, integration e boot reale non rieseguiti (numeri dal SUMMARY 10-31: build 0, tsc 0, boot reale 65/65).

### Anti-Patterns Found

Nessun blocker. Warning ESLint preesistenti (27) e subject di commit lunghi: vedi `deferred`.

### Gaps Summary

Nessun gap. Tutti i criteri automatici sono coperti dal codice a HEAD e dai test; le verifiche residue sono operative e manuali (frontmatter `human_verification`).

---

_Verified: 2026-10-30T14:47:34Z_
_Verifier: Claude (gsd-verifier)_
