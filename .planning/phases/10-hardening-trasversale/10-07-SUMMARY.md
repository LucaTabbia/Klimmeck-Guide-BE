---
phase: 10-hardening-trasversale
plan: 07
subsystem: config
tags: [config, NODE_ENV, runtime-mode, dev-auth, D-05, D-11, C20, Pitfall 12, BE-HARD-02, BE-HARD-03]
requires:
  - "10-01: schema con la sola riga nuova `pendingQuest: ID`; harness e boot reale verdi"
provides:
  - "src/config/runtime-config.ts: RUNTIME_CONFIG ('RUNTIME_CONFIG'), RUNTIME_ENV_KEYS (['NODE_ENV']), RUNTIME_MODES, RuntimeMode, RuntimeEnv, RuntimeConfig { mode, production, modeDefaulted }, parseRuntimeConfig, readRuntimeEnv, runtimeConfigProvider"
  - "src/config/runtime-config.module.ts: RuntimeConfigModule @Global (provider runtimeConfigProvider + RuntimeModeReporter, export RUNTIME_CONFIG)"
  - "src/config/runtime-mode.reporter.ts: RuntimeModeReporter (Logger 'Runtime')"
  - "validateEnv chiama parseRuntimeConfig(readRuntimeEnv(env)) per primo"
  - "DevAuthStrategy: @Inject(RUNTIME_CONFIG) runtime; bypass spento con runtime.production"
  - "createAuthTestApp: opzione runtime?: Partial<RuntimeConfig> (default test)"
affects: [10-08, 10-11, 10-12, 10-13, 10-15, 10-17]
tech-stack:
  added: []
  patterns:
    - "la modalità di esecuzione è configurazione validata letta una volta (RUNTIME_CONFIG), mai process.env a caricamento modulo"
    - "messaggi di errore costanti: il valore rifiutato non compare mai"
key-files:
  created:
    - src/config/runtime-config.ts
    - src/config/runtime-config.spec.ts
    - src/config/runtime-config.module.ts
    - src/config/runtime-mode.reporter.ts
    - src/config/runtime-mode.reporter.spec.ts
  modified:
    - src/config/env.validation.ts
    - src/config/env.validation.spec.ts
    - src/auth/dev/dev-auth.strategy.ts
    - src/auth/dev/dev-auth.strategy.spec.ts
    - src/auth/dev/dev-auth.strategy.int-spec.ts
    - src/app.module.ts
    - test/auth/auth-test-app.ts
    - test/app.int-spec.ts
key-decisions:
  - "NODE_ENV ammesso solo in development/test/production (trim; vuoto = development con modeDefaulted=true); staging usa production (C20, decisione utente)"
  - "RuntimeConfigModule globale montato subito dopo ConfigModule.forRoot in AppModule e nell'harness"
  - "il reporter scrive sempre una riga log di modalità e, se NODE_ENV è vuoto, un WARN prima della riga"
requirements-completed: []
duration: ~25 min
completed: 2026-10-29
---

# Phase 10 Plan 07: modalità di esecuzione validata Summary

`NODE_ENV` diventa configurazione validata a tre valori (`RUNTIME_CONFIG`, modulo globale), dichiarata al boot da `RuntimeModeReporter`; il bypass dev la legge dalla config iniettata e l'harness può forzare la produzione.

## Commit

| Task | Fase | Commit | Messaggio |
|------|------|--------|-----------|
| 1 | RED | 4dbe8ea | `test(config): expect a validated runtime mode` |
| 1 | GREEN | ee4b364 | `feat(config): validate the runtime mode at boot` |
| 2 | RED | 7dd1787 | `test(config): expect the runtime config to be mounted` |
| 2 | GREEN | 87a657b | `feat(config): read the runtime mode through config` |

## Fallimenti RED attesi

- Task 1: `runtime-config.spec.ts` e `runtime-mode.reporter.spec.ts` non compilano (moduli assenti); `validateEnv › refuses to boot with an unknown NODE_ENV (D-05)` fallisce con «Received function did not throw».
- Task 2: `DevAuthStrategy` 4 casi rossi (il costruttore riceve il `RuntimeConfig` al posto di `UsersService`), fra cui `never resolves the dev bypass in production mode (D-05)`; `test/app.int-spec.ts › mounts the runtime mode reporter` rosso (provider assente), 51 verdi.

## Verifiche finali

- `npx jest src/config --selectProjects unit`: 11 suite, 194 test verdi.
- `npx jest src/auth src/config --selectProjects unit`: 33 suite, 418 test verdi.
- `npx jest src/auth test/auth test/app.int-spec.ts --selectProjects integration --runInBand`: 14 suite, 206 test verdi (boot reale 52/52).
- `npm run build` 0; `git diff --exit-code src/schema.gql` 0; nessuna riga rimossa contro `origin/develop`; `pgrep -fl jest` vuoto.

## Note sui test

- Caso aggiunto oltre al behavior: `trims the surrounding whitespace of NODE_ENV (D-05)` e `readRuntimeEnv › reads only NODE_ENV from the source` (verdi insieme al GREEN).
- Il vecchio caso `returns null when NODE_ENV is production at runtime (defense in depth)` che mutava l'ambiente è sostituito da `never resolves the dev bypass in production mode (D-05)` con il config iniettato; i casi esistenti girano con un `RuntimeConfig` di test (`production: false`) e risolvono come prima.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `src/auth/dev/dev-auth.strategy.int-spec.ts` fornisce `RUNTIME_CONFIG`**
- **Found during:** Task 2
- **Issue:** la spec di integrazione compila un modulo con `DevAuthStrategy` senza `RuntimeConfigModule`: la nuova dipendenza non si risolveva.
- **Fix:** provider `{ provide: RUNTIME_CONFIG, useValue: { mode: 'test', production: false, modeDefaulted: false } }`; file fuori da `files_modified`.
- **Commit:** 87a657b

Nessun'altra deviazione: subject tutti ≤ 72 caratteri, nessun file da formattare prima.

## Known Stubs

Nessuno.

## Self-Check: PASSED
