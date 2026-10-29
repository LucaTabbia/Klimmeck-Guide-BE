---
phase: 10-hardening-trasversale
plan: 13
subsystem: throttling
tags: [throttler, rate-limit, graphql, rest, cloudinary, auth, D-08, C8, C19, A6, BE-HARD-02]
requires:
  - "10-05: @nestjs/throttler ^6.7.1 già installato"
  - "10-07: validateEnv con parseRuntimeConfig per primo; createAuthTestApp({ runtime })"
  - "10-08: blocco env del boot reale da svuotare per ogni chiave opzionale nuova"
  - "10-11: GraphQLRequestContext { req, res?, extra?, requestId }; formatDomainError preserva extensions.code"
  - "10-12: UnhandledExceptionFilter lascia passare le HttpException (il 429 arriva com'è); HttpHardeningModule in AppModule e nell'harness"
provides:
  - "src/config/throttle-config.ts: THROTTLE_CONFIG, THROTTLE_ENV_KEYS, DEFAULT_THROTTLE_TTL_MS = 60_000, DEFAULT_THROTTLE_LIMIT = 20, WEBHOOK_LIMIT_FACTOR = 50, TRUST_PROXY_PATTERN, ThrottleEnv, ThrottleConfig { ttlMs, limit, webhookLimit, trustProxy }, parseThrottleConfig, readThrottleEnv, throttleConfigProvider"
  - "src/throttling/too-many-requests.exception.ts: TooManyRequestsException (HttpException 429, extensions { code: 'TOO_MANY_REQUESTS' })"
  - "src/throttling/app-throttler.guard.ts: AppThrottlerGuard (getRequestResponse per GraphQL con res no-op su WS, throwThrottlingException codificata)"
  - "src/throttling/throttled.decorator.ts: DEFAULT_THROTTLER = 'default', WEBHOOK_THROTTLER = 'webhook', Throttled(), ThrottledWebhook()"
  - "src/throttling/throttling.module.ts: ThrottleConfigModule, ThrottlingModule (@Global, ThrottlerModule.forRootAsync su THROTTLE_CONFIG)"
  - "AuthTestAppOptions.throttle?: Partial<ThrottleConfig> (default dell'harness { ttlMs: 60_000, limit: 10_000, webhookLimit: 500_000, trustProxy: null })"
  - "test/app.int-spec.ts: EXPECTED_THROTTLED_HANDLERS + caso di enumerazione su GUARDS_METADATA"
affects: [10-14, 10-15, 10-30, 10-31]
tech-stack:
  added: []
  patterns:
    - "throttling opt-in per handler con un decoratore composto (UseGuards + SkipThrottle del bucket dell'altro), nessuna guard globale"
    - "eccezione HTTP codificata con extensions.code per attraversare @nestjs/apollo e il sanitizer di produzione"
    - "configurazione validata al boot da validateEnv e iniettata come provider sovrascrivibile nell'harness"
key-files:
  created:
    - src/config/throttle-config.ts
    - src/config/throttle-config.spec.ts
    - src/throttling/too-many-requests.exception.ts
    - src/throttling/too-many-requests.exception.spec.ts
    - src/throttling/app-throttler.guard.ts
    - src/throttling/app-throttler.guard.spec.ts
    - src/throttling/throttled.decorator.ts
    - src/throttling/throttling.module.ts
    - src/throttling/throttling.int-spec.ts
  modified:
    - src/config/env.validation.ts
    - src/config/env.validation.spec.ts
    - .env.example
    - src/auth/auth.resolver.ts
    - src/rest/cloudinary/cloudinary.controller.ts
    - src/app.module.ts
    - test/auth/auth-test-app.ts
    - test/app.int-spec.ts
decisions:
  - "Default della fase isolati in costanti con test nominati, da far confermare all'utente prima della PR (piano 10-30): 60 000 ms, 20 richieste per IP e per handler, bucket del webhook = limite × 50"
  - "Valori THROTTLE_TTL_MS/THROTTLE_LIMIT ammessi solo come interi positivi (0 rifiutato): il messaggio d'errore nomina la chiave, mai il valore"
  - "THROTTLE_TRUST_PROXY è solo parsata e validata qui (vuota = null); l'applicazione a Express \"trust proxy\" arriva nel piano 10-14"
  - "Storage in memoria del throttler (una istanza); nessuna mutation di gioco limitata, provato da un caso dedicato"
metrics:
  duration: "~25 min"
  completed: 2026-10-29
---

# Phase 10 Plan 13: throttling minimo su login, refresh e REST Cloudinary Summary

Configurazione `THROTTLE_*` validata al boot (default 60 000 ms / 20 richieste, webhook × 50, proxy spento), `AppThrottlerGuard` che legge il contesto GraphQL (anche senza `res` su graphql-ws) e lancia una `TooManyRequestsException` codificata, decoratori `@Throttled()`/`@ThrottledWebhook()` per i due bucket nominati, `ThrottlingModule` montato in `AppModule` e nell'harness, limiti su `exchangeLoginTicket`, `refreshSession` e le tre REST Cloudinary: oltre il limite GraphQL risponde `{ message: 'Troppe richieste', extensions: { code: 'TOO_MANY_REQUESTS' } }` e REST 429 `{ statusCode: 429, code: 'TOO_MANY_REQUESTS', message: 'Troppe richieste' }` con `Retry-After`.

## Commit

| Task | Fase | Commit | Subject |
|------|------|--------|---------|
| 1 | RED | a1cc7f3 | `test(throttling): expect coded throttling and validated limits` |
| 1 | GREEN | 2807f46 | `feat(throttling): add the throttle config, guard and coded 429` |
| 2 | RED | c62fc5f | `test(throttling): expect the throttled surface` |
| 3 | GREEN | aad2cf4 | `feat(throttling): throttle login, refresh and cloudinary` |

## Fallimenti RED attesi

- **Task 1:** `throttle-config.spec.ts`, `too-many-requests.exception.spec.ts` e `app-throttler.guard.spec.ts` non compilano (moduli assenti); `env.validation.spec.ts` › `refuses a malformed throttle limit at boot (D-08)` fallisce («Received function did not throw»).
- **Task 2:** 5 rossi su 63 (`test/app.int-spec.ts` + `src/throttling`):
  - `mounts the throttler with the phase defaults` — «Nest could not find THROTTLE_CONFIG element»;
  - `exposes exactly the enumerated throttled handlers (D-08)` — lista vuota contro i 5 handler attesi;
  - `answers TOO_MANY_REQUESTS on the third refreshSession from the same address (D-08, C8)` — la terza risponde ancora `SESSION_EXPIRED`;
  - `throttles exchangeLoginTicket on its own bucket (D-08)` — la terza risponde ancora `LOGIN_TICKET_INVALID`;
  - `answers 429 with Retry-After on the REST image list (D-08)` — 201 al posto di 429.
  - Verde al primo colpo: `never throttles a game mutation (D-08)` (nessun throttler ancora montato: è la guardia di regressione di T-10-49). L'opzione `throttle` dell'harness non esisteva ancora: la spec è stata comunque eseguita (ts-jest non ha bloccato l'opzione sconosciuta) e il limite veniva ignorato, come previsto dal piano.

## Verifiche finali

- `npx jest src/config src/throttling --selectProjects unit` → 14 suite / 212 test verdi (compreso `env-example.secrets.spec.ts`: le chiavi `THROTTLE_*` non sono catturate dal pattern dei segreti).
- `npx jest src/config src/throttling src/http src/graphql src/rest --selectProjects unit` → 24 suite / 286 test verdi.
- `npx jest src/throttling src/auth src/rest test/app.int-spec.ts --selectProjects integration --runInBand` → 12 suite / 185 test verdi.
- `npm run test:int` (foreground) → 91 suite / 1197 test verdi in 220 s: nessuna suite esistente supera il limite generoso dell'harness.
- `git diff --exit-code src/schema.gql` → 0 dopo ogni commit; `git diff origin/develop -- src/schema.gql | grep -cE '^-[^-]'` → `0`; `npm run build` → 0; `pgrep -fl jest` vuoto.
- Grep di accettazione: le tre costanti di default 1 riga ciascuna; `parseThrottleConfig(readThrottleEnv(env))` 1 riga; `protected async throwThrottlingException` 1 riga; `^\s*@Throttled\(\)` 2 in `auth.resolver.ts`, 3 in `cloudinary.controller.ts`, 5 in tutto `src` fuori dagli spec; `ThrottlingModule` 2 occorrenze in `src/app.module.ts`; `throttle?: Partial<ThrottleConfig>` 1 riga nell'harness; `EXPECTED_THROTTLED_HANDLERS` con 5 voci; 3 chiavi `THROTTLE_*` vuote nel blocco env del boot reale; le tre righe `THROTTLE_*=` vuote in `.env.example`.

## Deviations from Plan

### Scostamenti minori

- **Casi in più rispetto al behavior:** `treats empty throttle variables as the defaults (D-08)`, il rifiuto di `THROTTLE_TTL_MS` con gli stessi quattro valori (`it.each`), `readThrottleEnv` › `reads only the throttle keys`, e `reads the response of a GraphQL operation over HTTP (D-08)` nella spec della guard.
- **Mutation di gioco del caso «never throttles»:** l'int-spec usa `createCharactersTestApp({ throttle: { limit: 2 } })` (superset di `createAuthTestApp` con `CharactersResolver`) per avere `equipSpell` sul personaggio del giocatore; un solo harness copre i quattro casi.
- **Warning ESLint residuo:** `@typescript-eslint/require-await` su `protected async throwThrottlingException` (0 errori). La firma `async` è richiesta dal grep di accettazione e dalla firma della classe base (`Promise<void>`); nessun `await` artificiale aggiunto.
- **Tipizzazione della guard:** `req`/`res` del contesto GraphQL letti con un cast esplicito invece della destrutturazione del piano, per non introdurre due warning `no-unsafe-assignment` (`GraphQLRequestContext.req` è `any`).

## Note per i piani successivi

- **Tracker su graphql-ws:** il tracker di default è `req.ip`; su WS `req` è l'`IncomingMessage` dell'upgrade (senza `ip`), quindi tutte le chiamate limitate via WS condividerebbero lo stesso bucket. Oggi nessun handler limitato passa dal WS (login e refresh sono mutation HTTP); se servisse, si sovrascrive `getTracker` con `req.ip ?? req.socket?.remoteAddress`.
- **10-14:** `@ThrottledWebhook()` su `EventSubController.receive` (bucket `webhook`, header `Retry-After-webhook` per il suffisso del nome), `@Throttled()` su `TwitchAuthController.start|callback` con il filtro di redirect `rate_limited`; ogni nuovo handler va aggiunto a `EXPECTED_THROTTLED_HANDLERS` in `test/app.int-spec.ts` (il matcher conta `AppThrottlerGuard` dentro `GUARDS_METADATA`, quindi anche `@ThrottledWebhook()`); `THROTTLE_TRUST_PROXY` (`ThrottleConfig.trustProxy`, già validata) da applicare con `app.set('trust proxy', …)`.
- **10-30:** default da confermare all'utente (`DEFAULT_THROTTLE_TTL_MS`, `DEFAULT_THROTTLE_LIMIT`, `WEBHOOK_LIMIT_FACTOR`); handoff FE: `TOO_MANY_REQUESTS` su `exchangeLoginTicket`/`refreshSession`, 429 + `Retry-After` sulle tre REST Cloudinary.

## Threat Flags

Nessuna superficie nuova oltre il threat model del piano (T-10-47..T-10-51).

## Known Stubs

Nessuno.

## Self-Check: PASSED

- File creati presenti: `src/config/throttle-config.ts`, `src/throttling/{too-many-requests.exception,app-throttler.guard,throttled.decorator,throttling.module}.ts` e i loro spec, `src/throttling/throttling.int-spec.ts`.
- Commit presenti: a1cc7f3, 2807f46, c62fc5f, aad2cf4.
