---
phase: 06-eventsub-punti-canale-streamer-live
verified: 2026-10-21T00:00:00Z
status: passed
score: 4/4 roadmap success criteria verified (plan must-haves 9/9 plans coerenti)
overrides_applied: 0
deferred:
  - truth: "E2E con tunnel HTTPS in modalita managed (UAT test 2) e verifica C4 (UAT test 3)"
    addressed_in: "pre-produzione (06-HUMAN-UAT.md)"
    evidence: "skipped per mancanza di tunnel; codice manager/reconcile coperto da unit e da eventsub-points.int-spec.ts con fake Helix. Deferred-by-environment, non gap."
---

# Phase 6: EventSub Punti Canale & Streamer Live - Verification

**Goal:** webhook Twitch EventSub accredita i punti 1:1, HMAC-verificato, challenge-gestito, idempotente e atomico; `stream.online` alimenta il push streamer-live.
**Status:** passed. **Re-verification:** No.

## Observable Truths (ROADMAP SC)

| # | Truth | Status | Evidenza |
|---|-------|--------|----------|
| 1 | Webhook `@Public()`, rawBody, HMAC su id+timestamp+raw body, challenge, rifiuto fuori finestra / firma errata | VERIFIED | `eventsub-signature.ts` (createHmac sha256 + timingSafeEqual), `eventsub.controller.ts` `@Public()` solo su `receive`, `main.ts:7` `rawBody: true`, firma verificata prima del challenge (webhook.service); spec signature/headers/service + controller.int-spec; UAT: challenge 200 text/plain, replay 403, secret errato 403 |
| 2 | Redemption accredita 1:1 con `$inc` atomico; redelivery = un solo credito | VERIFIED | `points-credit.service.ts`: insert dedup in `eventsub_messages` + `wallet.creditUserPoints(..., session)` nella stessa `connection.transaction`; indici unique `eventsub_message_id_unique` e `eventsub_event_unique` (dedup anche per event.id con message_id diverso); E11000 -> `duplicate`; int-spec (5 concorrenti); UAT: twitchPoints 0->250, riconsegna senza nuovo credito |
| 3 | Subscription redemption.add e stream.online create/verificate/rinnovate con app access token | VERIFIED | `twitch-app-token.cache.ts` (client_credentials, margine di refresh, single-flight), `http-twitch-helix.client.ts` (list paginata/create/delete, retry 401), `eventsub-subscription.manager.ts` + `plan-reconciliation.ts` (boot, setInterval unref, onModuleDestroy, single-flight); spec dedicate + eventsub-points.int-spec con FakeTwitchHelixClient. Test E2E reale con tunnel differito (UAT test 2) |
| 4 | `stream.online` scatena push streamer-live | VERIFIED | `eventsub-webhook.service.ts:302` `void this.push.broadcast(streamerLive())` dopo insert `broadcast` in `stream-online.recorder.ts`; riconsegna senza secondo push; UAT: push ricevuto su device Android reale |

**Score:** 4/4

## Must-haves dei PLAN (spot check sul codice)

- 06-03/config: `src/config/eventsub-config.ts` (+ spec) con modi disabled/local/managed; `TWITCH_LOGIN_SCOPES` in `auth-config.ts` e `twitch-authorize-url.ts`.
- 06-04 wiring: `EventSubModule` in `app.module.ts:84`; `src/schema.gql` invariato rispetto a develop (diff vuoto, D-16).
- Rename `describeMongoError`: nessuna occorrenza residua in `src` (sanzionato, ora `describeError`).
- 06-VALIDATION `status: approved`, `wave_0_complete: true`; BACKEND-NOTES.md e 06-HUMAN-UAT.md presenti; D-xx sanzionati dal REVIEW-FIX (rerun reconcile, `removeFailed`, `LogThrottle`, troncamento campi) presenti (`log-throttle.ts`).

## Spot-check comportamentali

| Check | Risultato |
|-------|-----------|
| `npx jest --selectProjects unit` | 80 suite / 1114 test passed |
| `npm run build` | OK |
| Integration | eseguita dall'orchestratore (gate 46 suite / 550 test), non rilanciata |
| Regressione `git diff origin/develop...HEAD -- src/push src/auth src/economy` | solo rename `describeError` (push-device-index.verifier.ts) e `twitch-authorize-url.ts` + spec per `TWITCH_LOGIN_SCOPES`: nessuna regressione |

## Tracciabilita requisiti

| Requisito | Plan | Stato | Evidenza |
|-----------|------|-------|----------|
| BE-POINTS-01 (webhook, HMAC, challenge, replay window) | piani 03, 05, 06, 07, 08 | SATISFIED | SC1; REQUIREMENTS.md [x] Complete |
| BE-POINTS-02 (credito idempotente + $inc atomico) | piani 01, 03, 05, 06, 07, 08 | SATISFIED | SC2 |
| BE-POINTS-03 (lifecycle subscription, stream.online -> push) | piani 02, 04, 05, 06, 07, 08 | SATISFIED | SC3, SC4 |

Nessun requisito orfano: i tre ID mappati a Phase 6 compaiono tutti nei frontmatter dei PLAN.

## Anti-pattern

Nessun TODO/stub bloccante rilevato nei file di `src/eventsub`; i data-flow (DB insert + wallet credit, push broadcast) sono reali.

## Human verification

Gia eseguita: `06-HUMAN-UAT.md` test 1 passed (2026-10-20, Twitch CLI locale, HTTP + DB + push su device reale); test 2 e 3 skipped, deferred-by-environment a prima della produzione. Non sono gap della fase.

## Gaps

Nessuno.

_Verifier: Claude (gsd-verifier)_
