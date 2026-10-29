---
phase: 10-hardening-trasversale
plan: 15
subsystem: config
tags: [config, env, sightengine, moderation, fail-closed, drift, D-11, D-14, Pitfall-11, BE-HARD-03, BE-HARD-05]
requires:
  - "10-03: spec dei segreti vuoti del template (src/config/env-example.secrets.spec.ts)"
  - "10-07: RUNTIME_CONFIG, parseRuntimeConfig per primo in validateEnv"
  - "10-13/10-14: THROTTLE_ENV_KEYS e commenti THROTTLE_* già nel template"
provides:
  - "src/config/moderation-config.ts: MODERATION_CONFIG, MODERATION_ENV_KEYS, ModerationEnv, SightengineCredentials { userId, secret }, ModerationConfig { sightengine: SightengineCredentials | null }, parseModerationConfig, readModerationEnv, moderationConfigProvider (FactoryProvider, inject ConfigService; non ancora montato: lo monta il 10-17)"
  - "validateEnv: parseModerationConfig(readModerationEnv(env)) subito dopo parseEventSubConfig"
  - "src/config/env-example.drift.spec.ts: drift bidirezionale codice ↔ .env.example + nessun process.env nel codice di produzione"
  - "PORT (main.ts), MONGO_URI/DB_NAME (mongo.module.ts), CLOUDINARY_* (cloudinary.service.ts) letti da ConfigService"
affects: [10-16, 10-17, 10-26, 10-30, 10-31]
tech-stack:
  added: []
  patterns:
    - "parser di config fail-closed a due chiavi: entrambe = attivo, nessuna = disattivato fuori produzione, una sola = boot rifiutato ovunque"
    - "test di drift che enumera dinamicamente gli export *_ENV_KEYS dei moduli src/config/*-config.ts e scansiona staticamente src per config.get('X') e process.env.X"
key-files:
  created:
    - src/config/moderation-config.ts
    - src/config/moderation-config.spec.ts
    - src/config/env-example.drift.spec.ts
  modified:
    - src/config/env.validation.ts
    - src/config/env.validation.spec.ts
    - test/app.int-spec.ts
    - src/rest/cloudinary/cloudinary.service.ts
    - src/mongo/mongo.module.ts
    - src/main.ts
    - .env.example
decisions:
  - "parseModerationConfig gira dopo parseEventSubConfig in validateEnv: i test di produzione esistenti continuano a vedere per primo l'errore di Firebase/EventSub"
  - "I valori Sightengine sono trimmati; spazi soli = chiave vuota"
  - "Il test di drift scopre gli *_ENV_KEYS dinamicamente (ogni export che termina in _ENV_KEYS dei file *-config.ts): un modulo di config nuovo entra nel controllo senza toccare la spec"
  - "Sono codice di produzione i .ts di src che non terminano in .spec.ts né in -spec.ts (gli *.int-spec.ts sotto src leggono MONGO_TEST_URI e sono esclusi)"
  - "Commento di PORT: «assente = 3000 (se presente non lasciarla vuota)» invece di «vuota = 3000», perché main.ts usa ?? e una PORT vuota non ricade su 3000"
metrics:
  duration: "~55 min"
  completed: 2026-10-29
---

# Phase 10 Plan 15: config Sightengine fail-closed, letture d'ambiente via config e drift del template Summary

Le chiavi Sightengine sono validate al boot con un parser fail-closed (`parseModerationConfig`: entrambe = moderazione attiva, nessuna = disattivata fuori produzione, nessuna con `NODE_ENV=production` o una sola ovunque = boot rifiutato con messaggi costanti senza valori). `PORT`, `MONGO_URI`, `DB_NAME` e `CLOUDINARY_*` ora passano da `ConfigService`: in `src` nessun codice di produzione legge più direttamente l'ambiente. `.env.example` ha un commento per ogni chiave o gruppo, e un test di drift bidirezionale tiene allineati codice e template.

## Commit

| Task | Fase | Commit | Subject |
|------|------|--------|---------|
| 1 | RED | 62f3d42 | `test(config): expect a fail-closed Sightengine configuration` |
| 1 | GREEN | b19c850 | `feat(config): validate the Sightengine keys at boot` |
| 2 | RED | c29365f | `test(config): expect no drift between code and env template` |
| 2 | STYLE | 696263a | `style(mongo): format the mongo module` |
| 2 | GREEN | 1c3df4f | `refactor(config): read every env key through config` |
| 3 | — | 1261e0b | `docs(env): document every key of the env template` |

## TDD

- **Task 1 RED:** la suite `moderation-config.spec.ts` non partiva perché il modulo `src/config/moderation-config` non esisteva («Test suite failed to run»). In `validateEnv`, il caso `refuses to boot in production without the Sightengine keys (D-14)` falliva perché il boot non veniva rifiutato. Le due righe vuote `SIGHTENGINE_*` aggiunte al boot reale di `test/app.int-spec.ts` erano verdi al primo colpo, come previsto: mettono solo in sicurezza il boot (Pitfall 11). Al RED anche il caso di produzione «completo» di EventSub ha ricevuto le chiavi finte `fake-user`/`fake-secret`, così resta un boot di produzione valido.
- **Task 1 GREEN:** `npx jest src/config --selectProjects unit` 13 suite / 219 test; `npx jest test/app.int-spec.ts --selectProjects integration --runInBand` 60/60; `npm run build` 0.
- **Task 2 RED:** falliva `reads the environment only through config (D-11)` con `src/main.ts`, `src/mongo/mongo.module.ts` e `src/rest/cloudinary/cloudinary.service.ts`. `lists in the template every key the code reads (D-11)` e `reads in the code every key the template lists (D-11)` erano verdi al primo colpo, perché le chiavi esistevano già nel template e `MODERATION_ENV_KEYS` copre `SIGHTENGINE_*`.
- **Task 2 GREEN:** unit `src/config` 14 suite / 222 test; `npx jest test/app.int-spec.ts src/rest --selectProjects integration --runInBand` 2 suite / 68 test; `npm run build` 0.
- **Task 3:** `env-example.drift`, `env-example.secrets` e `env.validation` danno 3 suite / 32 test verdi. Alla verifica finale, unit `src/config` è a 14 suite / 222 test.
- `git diff --exit-code src/schema.gql` esce 0 dopo ogni commit; righe rimosse contro `origin/develop`: `0`.

## Gruppi di commenti in `.env.example`

Ogni chiave ha un commento nelle 4 righe sopra di sé. Alcuni gruppi condividono un commento solo: `REDIS_HOST`/`REDIS_PORT`, `CLOUDINARY_CLOUD_NAME`/`CLOUDINARY_API_KEY`/`CLOUDINARY_API_SECRET`, `SIGHTENGINE_USER_ID`/`SIGHTENGINE_API_SECRET`, `DEV_AUTH_*` (commento preesistente), `TWITCH_CLIENT_ID`/`TWITCH_CLIENT_SECRET`/`TWITCH_REDIRECT_URI` (preesistente). I commenti di `THROTTLE_*` erano già presenti dal 10-13/10-14, quelli di `SPELL_RECOVERY_SWEEP_INTERVAL_MS` dalla 9.1. Nessun valore è cambiato e l'ordine delle chiavi è lo stesso.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Filtro «codice di produzione» del test di drift**
- **Trovato durante:** Task 2 (prima del commit RED)
- **Problema:** il pattern iniziale escludeva solo `*.spec.ts`. Gli `*.int-spec.ts` sotto `src` (che leggono `process.env.MONGO_TEST_URI`) risultavano quindi codice di produzione, e `MONGO_TEST_URI` compariva come chiave mancante nel template.
- **Fix:** il pattern ora è `/(?<![.-]spec)\.ts$/`, allineato al grep di accettazione `grep -v 'spec.ts'`.
- **File:** `src/config/env-example.drift.spec.ts`
- **Commit:** c29365f

**2. [Rule 1 - Bug] Testo del commento di `PORT`**
- **Trovato durante:** Task 3
- **Problema:** il commento previsto dal piano («vuota = 3000») non era vero. `main.ts` usa `config.get<string>('PORT') ?? 3000`, e con `PORT=` vuota `ConfigService` restituisce `''`, che `??` non sostituisce.
- **Fix:** il commento ora dice «assente = 3000 (se presente non lasciarla vuota)». Il codice resta quello del piano.
- **File:** `.env.example`
- **Commit:** 1261e0b

### Altre note

- Il task 1 ha tre casi di test in più rispetto al `<behavior>`: `trims the Sightengine keys (D-14)`, `reads only the moderation keys (D-14)` e `declares the moderation keys (D-14)` in `moderation-config.spec.ts`. L'acceptance `grep -c "it('"` su `env-example.drift.spec.ts` stampa `3`, come richiesto.
- `npx eslint src/rest/cloudinary/cloudinary.service.ts` segnala 23 warning `no-unsafe-*` / `prefer-promise-reject-errors`, tutti preesistenti in `listResources`/`uploadImage` e fuori scope; gli errori sono 0.

## Known Stubs

Nessuno. `moderationConfigProvider` è esportato ma non è montato in nessun modulo, per scelta: lo monta il piano 10-17 insieme alla porta `ImageModerator`.

## Self-Check: PASSED

- File creati presenti: `src/config/moderation-config.ts`, `src/config/moderation-config.spec.ts`, `src/config/env-example.drift.spec.ts`
- Commit presenti: 62f3d42, b19c850, c29365f, 696263a, 1c3df4f, 1261e0b
