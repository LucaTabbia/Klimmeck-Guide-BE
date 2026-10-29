---
phase: 10-hardening-trasversale
plan: 16
subsystem: moderation
tags: [moderation, sightengine, image-policy, fail-closed, fetch, D-12, D-13, D-14, D-15, C10, BE-HARD-05]
requires:
  - "10-15: SightengineCredentials { userId, secret } e MODERATION_CONFIG (src/config/moderation-config.ts)"
  - "10-12: detectImageMimetype (tipo reale dell'immagine da passare alla porta)"
provides:
  - "src/moderation/image-policy.ts: MODERATION_THRESHOLD = 0.5, PolicyRule, PolicyEvaluation, IMAGE_POLICY (21 regole), evaluateImagePolicy"
  - "src/moderation/sightengine-response.ts: tipi parziali della risposta (SightengineResponse, SightengineScores, SightengineFace, SightengineError)"
  - "src/moderation/image-moderator.ts: porta ImageModerator, ModerationImage, ModerationVerdict"
  - "src/moderation/image-moderation.exceptions.ts: ImageRejectedException (422), ImageModerationUnavailableException (503), costanti IMAGE_REJECTED, IMAGE_MODERATION_UNAVAILABLE"
  - "src/moderation/sightengine-image.moderator.ts: SightengineImageModerator, SIGHTENGINE_CHECK_URL, SIGHTENGINE_MODELS, SIGHTENGINE_TIMEOUT_MS"
  - "src/moderation/disabled-image.moderator.ts: DisabledImageModerator"
  - "test/moderation/fake-image-moderator.ts: FakeImageModerator"
affects: [10-17, 10-30]
tech-stack:
  added: []
  patterns:
    - "policy come tabella pura di regole { category, action, matches } valutata nell'ordine della tabella, totale sulle chiavi mancanti"
    - "adapter esterno su fetch/FormData/Blob nativi con AbortSignal.timeout e mappatura fail-closed di ogni errore in un'eccezione 503 codificata"
key-files:
  created:
    - src/moderation/sightengine-response.ts
    - src/moderation/image-policy.ts
    - src/moderation/image-policy.spec.ts
    - src/moderation/image-moderator.ts
    - src/moderation/image-moderation.exceptions.ts
    - src/moderation/image-moderation.exceptions.spec.ts
    - src/moderation/sightengine-image.moderator.ts
    - src/moderation/sightengine-image.moderator.spec.ts
    - src/moderation/disabled-image.moderator.ts
    - src/moderation/disabled-image.moderator.spec.ts
    - test/moderation/fake-image-moderator.ts
  modified: []
decisions:
  - "Le categorie di solo log di text-content sono una regola per array (text-link, text-social, ..., text-self-harm): 21 regole in tutto, ognuna con un test"
  - "Ordine della mappatura: HTTP ≥ 500 → 503 prima di leggere il corpo; poi JSON illeggibile → 503; status failure → media_error = 422 unreadable, ogni altro tipo (anche mancante) → 503; status diverso da success (anche corpo null) → 503; altrimenti policy"
  - "credentials_error e argument_error scrivono anche un logger.error «Sightengine rifiuta la configurazione: <tipo>, codice <n>»; ogni 503 scrive un WARN «Moderazione immagine non disponibile: <causa>» con il solo nome dell'errore (describeError) o lo status HTTP"
  - "Log INFO dell'esito: «Moderazione immagine: approvata», «Moderazione immagine: respinta (<categorie>)», con «; da segnalare (<categorie>)» in coda quando ci sono categorie di solo log"
  - "Il media è inviato come Blob di Uint8Array.from(buffer): il tipo Buffer<ArrayBufferLike> non è un BlobPart per tsc"
  - "Il FakeImageModerator ha una coda di esiti scriptati (approveNext/rejectNext/failNext) consumati in ordine; senza script approva"
metrics:
  duration: "~25 min"
  completed: 2026-10-29
  tasks: 3
  files: 11
---

# Phase 10 Plan 16: Moderazione delle immagini (policy, porta, adapter) Summary

Policy severa a 0.5 come tabella pura e totale con un test per regola, porta `ImageModerator`, adapter Sightengine fail-closed su `fetch` nativo (multipart, modelli verbatim, timeout 5 s, log senza punteggi né chiavi), adapter disattivato e fake scriptabile per l'harness; nessun modulo Nest (lo monta il 10-17).

## Commit

| Task | Fase | Commit | Messaggio |
|------|------|--------|-----------|
| 1 | RED | 1b96783 | test(moderation): name every rule of the image policy |
| 1 | GREEN | faaa1c0 | feat(moderation): add the pure image policy table |
| 2 | RED | 8f5f9e5 | test(moderation): expect a fail-closed Sightengine adapter |
| 2 | GREEN | f4dffd1 | feat(moderation): add the Sightengine image moderator |
| 3 | RED | 0562fd1 | test(moderation): expect a disabled moderator outside production |
| 3 | GREEN | 8c8fed9 | feat(moderation): add the disabled moderator and the test fake |

## Fallimenti RED attesi

- Task 1: `image-policy.spec.ts` non risolve il modulo `src/moderation/image-policy` (suite fallita, 0 test).
- Task 2: `image-moderation.exceptions.spec.ts` e `sightengine-image.moderator.spec.ts` non risolvono i moduli (2 suite fallite; la policy resta 41/41).
- Task 3: `disabled-image.moderator.spec.ts` «Could not locate module src/moderation/disabled-image.moderator».

## Tabella di policy (da mostrare all'utente prima della PR, A2-A5)

| Categoria | Regola (`> 0.5`) | Azione |
|---|---|---|
| `nudity` | max di `sexual_activity`, `sexual_display`, `erotica`, `very_suggestive` | rifiuto |
| `offensive` | una classe fra `nazi`, `asian_swastika`, `confederate`, `supremacist`, `terrorist`, `middle_finger` | rifiuto |
| `gore` | `gore.prob` | rifiuto |
| `self-harm` | `self-harm.prob` | rifiuto |
| `minor` | un volto reale con `attributes.age.minor` | rifiuto |
| `minor-artificial` | un volto artificiale con `attributes.age.minor` | solo log (A3) |
| `text-profanity` / `text-personal` | array non vuoto | rifiuto |
| `qr` | un array non vuoto sotto `qr` | rifiuto (A4) |
| `text-present` | `text.has_artificial` o `text.has_natural` | solo log |
| `text-<categoria>` | gli altri 11 array di `text` non vuoti | solo log (A5) |

## Verifica

- `npx jest src/moderation --selectProjects unit`: 4 suite / 61 test (policy 41, eccezioni 2, Sightengine 17, disattivato 1).
- `npx jest src/moderation src/config --selectProjects unit`: 18 suite / 283 (drift `.env.example` verde: nessun `.get('X')` né `process.env` nel codice di produzione di `src/moderation/`).
- `npm run build` esce 0; `npx tsc --noEmit -p tsconfig.json` non riporta errori propri dei file nuovi oltre al rumore preesistente dei tipi di jest (gate dal 10-20).
- `git diff --exit-code src/schema.gql` esce 0; nessuna dipendenza nuova; nessuna chiamata di rete (ogni spec stubba `global.fetch`).

## Casi verdi al primo colpo

Nessuno: ogni spec è fallita per l'assenza del modulo prima dell'implementazione.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Buffer non assegnabile a BlobPart**
- **Found during:** Task 2
- **Issue:** `new Blob([image.buffer])` non compila con `npm run build` (TS2322 su `Buffer<ArrayBufferLike>`).
- **Fix:** `new Blob([Uint8Array.from(image.buffer)], { type: image.mimetype })`; la spec verifica i byte inviati.
- **Commit:** f4dffd1

**2. [Rule 1 - Bug] Chiamata con argomento in eccesso nella spec del disattivato**
- **Found during:** Task 3
- **Issue:** `DisabledImageModerator.moderate()` non dichiara parametri; la spec RED lo chiamava con l'immagine sul tipo concreto (TS2554 sotto `tsc --noEmit`).
- **Fix:** la spec usa il tipo della porta (`const moderator: ImageModerator`), l'implementazione resta senza parametro inutilizzato (nessun warning ESLint).
- **Commit:** 8c8fed9

### Aggiunte rispetto al piano

- Casi in più nella spec Sightengine: `is enabled`, `fails closed on an unknown failure type or a success without a body (D-14)`, `arms the request with a 5 s timeout signal (D-14)` (spia su `AbortSignal.timeout`), `reports a misconfiguration with the error type and code only`, `never logs the keys or the image when the request fails (D-15)`.
- Casi parametrizzati in più nella policy: le altre tre classi di nudità esplicita, ognuna delle cinque classi di QR, ognuna delle altre categorie di testo, varianti di risposta malformata; `declares each category of the table exactly once`.

## Known Stubs

Nessuno: il montaggio nel flusso di upload è del piano 10-17 per progetto.

## Self-Check: PASSED
