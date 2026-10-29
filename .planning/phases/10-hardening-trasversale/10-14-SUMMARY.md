---
phase: 10-hardening-trasversale
plan: 14
subsystem: throttling
tags: [throttler, rate-limit, oauth, eventsub, webhook, trust-proxy, D-08, C6, C19, Pitfall-8, BE-HARD-02]
requires:
  - "10-13: THROTTLE_CONFIG, ThrottleConfig.trustProxy validata, AppThrottlerGuard, Throttled()/ThrottledWebhook(), TooManyRequestsException, ThrottlingModule, AuthTestAppOptions.throttle, EXPECTED_THROTTLED_HANDLERS"
provides:
  - "src/auth/twitch/twitch-login-error-code.enum.ts: TwitchLoginErrorCode.RATE_LIMITED = 'rate_limited' (additivo, in coda)"
  - "src/throttling/oauth-rate-limit-redirect.filter.ts: OAuthRateLimitRedirectFilter (@Catch(TooManyRequestsException), redirect 302 a buildAppErrorRedirect(appAuthRedirectUrl, RATE_LIMITED))"
  - "src/throttling/trust-proxy.configurer.ts: TrustProxyConfigurer (OnApplicationBootstrap, provider di ThrottlingModule)"
  - "test/eventsub/eventsub-test-app.ts: EventSubTestAppOptions { throttle?: Partial<ThrottleConfig> }, createEventSubTestApp(config, options = {})"
  - "test/app.int-spec.ts: EXPECTED_THROTTLED_HANDLERS a 8 voci + caso 'leaves the proxy trust off by default (C19)'"
affects: [10-15, 10-30, 10-31]
tech-stack:
  added: []
  patterns:
    - "exception filter a livello di handler per trasformare il 429 in redirect sulle navigazioni del browser"
    - "configurazione di Express (trust proxy) applicata in onApplicationBootstrap via HttpAdapterHost: vale sia per il boot reale sia per l'harness"
key-files:
  created:
    - src/throttling/oauth-rate-limit-redirect.filter.ts
    - src/throttling/oauth-rate-limit-redirect.filter.spec.ts
    - src/throttling/trust-proxy.configurer.ts
    - src/throttling/trust-proxy.configurer.spec.ts
    - src/eventsub/eventsub-throttle.int-spec.ts
  modified:
    - src/auth/twitch/twitch-login-error-code.enum.ts
    - src/auth/twitch/twitch-auth.controller.ts
    - src/auth/twitch/twitch-auth.controller.int-spec.ts
    - src/auth/twitch/twitch-urls.spec.ts
    - src/eventsub/eventsub.controller.ts
    - src/throttling/throttling.module.ts
    - src/throttling/throttling.int-spec.ts
    - test/eventsub/eventsub-test-app.ts
    - test/app.int-spec.ts
decisions:
  - "Il filtro di redirect è registrato con @UseFilters(OAuthRateLimitRedirectFilter) per classe: Nest lo istanzia col DI di AuthModule (AUTH_CONFIG disponibile), nessun provider aggiuntivo"
  - "trust proxy applicato da un provider OnApplicationBootstrap in ThrottlingModule invece che in main.ts: un solo punto, attivo anche nell'harness; spento quando trustProxy è null (default, decisione dell'utente)"
  - "Hop count (solo cifre) passato a Express come numero, elenchi di indirizzi come stringa; il log non riporta il valore"
metrics:
  duration: "~30 min"
  completed: 2026-10-29
---

# Phase 10 Plan 14: throttling di OAuth, webhook EventSub e trust proxy Summary

Le navigazioni OAuth `GET /auth/twitch/start|callback` sono limitate con `@Throttled()` e, oltre il limite, un filtro dedicato le riporta all'app con un redirect 302 a `APP_AUTH_REDIRECT_URL?error=rate_limited` (codice additivo); il webhook EventSub ha un bucket proprio (`@ThrottledWebhook()`, limite × 50) provato con una raffica di 10 redemption firmate tutte 204 e accreditate; `THROTTLE_TRUST_PROXY` ora imposta `trust proxy` di Express al bootstrap, spento di default.

## Commit

| Task | Fase | Commit | Subject |
|------|------|--------|---------|
| 1 | RED | db097bc | `test(auth): expect rate limited OAuth redirects` |
| 1 | GREEN | c177316 | `feat(auth): redirect throttled OAuth navigations to the app` |
| 2 | RED | 3c73f69 | `test(eventsub): expect a dedicated webhook throttle bucket` |
| 2 | GREEN | f2786f8 | `feat(eventsub): throttle the webhook on its own bucket` |
| 3 | RED | fdf8c4f | `test(throttling): expect an optional proxy trust` |
| 3 | GREEN | 4ff992a | `feat(throttling): trust a configured reverse proxy` |

## Fallimenti RED attesi

- **Task 1:** `oauth-rate-limit-redirect.filter.spec.ts` non risolve il modulo del filtro; in `twitch-auth.controller.int-spec.ts` la terza `start` risponde ancora con l'URL di authorize di Twitch e la terza `callback` con `invalid_state` al posto di `rate_limited` (2 rossi su 17).
- **Task 2:** `limits the webhook only beyond its own bucket (D-08)` riceve 403 al posto di 429 alla quarta consegna; `exposes exactly the enumerated throttled handlers (D-08)` manca di `EventSubController.receive` (2 rossi su 93). Verde al primo colpo: `answers 204 to every signed redemption of a burst above the base limit` (nessun throttler ancora sul webhook: è la guardia di regressione di T-10-53). Le voci `TwitchAuthController.start|callback` erano già soddisfatte dal GREEN del Task 1.
- **Task 3:** `trust-proxy.configurer.spec.ts` non risolve il modulo; `keeps separate buckets per forwarded client behind a trusted proxy (C19)` riceve 429 sul secondo client (bucket condiviso su `127.0.0.1`). Verde al primo colpo: `leaves the proxy trust off by default (C19)` (Express parte con `trust proxy` spento; il caso protegge il default).

## Verifiche finali

- `npx jest src/throttling src/auth --selectProjects unit` → 25 suite / 237 test verdi.
- `npx jest src/auth/twitch --selectProjects integration --runInBand` → 1 suite / 17 test verdi.
- `npx jest src/eventsub test/app.int-spec.ts --selectProjects integration --runInBand` → 5 suite / 93 test verdi.
- `npx jest src/throttling --selectProjects unit` → 4 suite / 8 test; `npx jest src/throttling test/app.int-spec.ts --selectProjects integration --runInBand` → 2 suite / 65 test.
- `npm run test:int` (foreground) → 92 suite / 1203 test verdi in 238 s.
- `git diff --exit-code src/schema.gql` → 0 dopo ogni commit; `git diff origin/develop -- src/schema.gql | grep -cE '^-[^-]'` → `0`; `npm run build` → 0; `pgrep -fl jest` vuoto.
- Grep di accettazione: `RATE_LIMITED = 'rate_limited'` 1 riga; `^\s*@Throttled\(\)` 2 nel controller OAuth; `OAuthRateLimitRedirectFilter` 3 occorrenze nel controller; `@Catch(TooManyRequestsException)` 1 riga; `^\s*@ThrottledWebhook\(\)` 1 nel controller EventSub; `EXPECTED_THROTTLED_HANDLERS` con 8 voci; `'trust proxy'` 1 riga nel configuratore; `TrustProxyConfigurer` nel modulo.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Spec del contratto dei codici di errore OAuth**
- **Found during:** Task 1 (GREEN)
- **Issue:** `src/auth/twitch/twitch-urls.spec.ts` › `exposes the redirect error codes consumed by the app` enumera con `toEqual` i codici esistenti e falliva con il nuovo `rate_limited`.
- **Fix:** aggiunto `'rate_limited'` all'elenco atteso (contratto additivo verso il FE), nel commit GREEN.
- **Files modified:** src/auth/twitch/twitch-urls.spec.ts
- **Commit:** c177316

### Scostamenti minori

- **trust proxy fuori da `main.ts`:** il piano chiede un provider `OnApplicationBootstrap` in `ThrottlingModule`; `main.ts` non è toccato perché il provider si applica sia al boot reale sia all'harness (che monta `ThrottlingModule`).
- **Raffica firmata:** le 10 notifiche hanno `eventId` distinti (`redemption-burst-N`) e `messageId` casuali; il secret è quello finto dell'harness (`TEST_EVENTSUB_SECRET`). La consegna oltre il bucket nel secondo caso è non firmata (403 prima, 429 dopo), come dice il behavior.

## Note per i piani successivi

- **10-15:** `.env.example` ha già `THROTTLE_TRUST_PROXY=` vuota: il commento da aggiungere deve dire «vuota = trust proxy spento; un numero = hop; altrimenti elenco di indirizzi/sottoreti come per Express».
- **10-30:** da confermare con l'utente i default (`DEFAULT_THROTTLE_TTL_MS`, `DEFAULT_THROTTLE_LIMIT`, `WEBHOOK_LIMIT_FACTOR`) e il valore di `THROTTLE_TRUST_PROXY` quando la topologia di deploy sarà nota. Handoff FE: nuovo codice di redirect OAuth `error=rate_limited` su `klimmeck://auth` (start e callback).
- **10-31:** il throttler copre 8 handler: 5 del 10-13 + `EventSubController.receive` (bucket `webhook`) + `TwitchAuthController.start|callback` (bucket `default`).

## Threat Flags

Nessuna superficie nuova oltre il threat model del piano (T-10-52..T-10-55).

## Known Stubs

Nessuno.

## Self-Check: PASSED

- File creati presenti: `src/throttling/{oauth-rate-limit-redirect.filter,trust-proxy.configurer}.ts` e i loro spec, `src/eventsub/eventsub-throttle.int-spec.ts`.
- Commit presenti: db097bc, c177316, 3c73f69, f2786f8, fdf8c4f, 4ff992a.
