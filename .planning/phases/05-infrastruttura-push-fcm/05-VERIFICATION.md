---
phase: 05-infrastruttura-push-fcm
verified: 2026-10-18T00:00:00Z
status: human_needed
score: 4/4 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Consegna reale FCM su device fisico (Android + iOS) nei tre app state, via sendTestPush con FIREBASE_SERVICE_ACCOUNT reale"
    expected: "Il data message arriva con type/id/title/body/sentAt; token stale potato dopo reinstallazione"
    why_human: "Richiede progetto Firebase reale e device; firebase-admin non e mai contattato nei test. UAT manuale FE Phase 5 (documentato)."
---

# Phase 5: Infrastruttura Push FCM - Verification Report

**Phase Goal:** infrastruttura push FCM domain-agnostic: registro token per-device, servizio di invio condiviso, pruning dei token stale; push come side-channel non autoritativo.
**Status:** human_needed (nessun gap automatico; resta solo la consegna reale su device)
**Re-verification:** No

## Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Registrazione con upsert per userId+deviceId, ri-registrare aggiorna | VERIFIED | `src/push/push-device.registry.ts` claimOnce: `findOneAndUpdate({userId,deviceId}, $set, upsert)`; indici unici `{userId,deviceId}` e `{token}` in `push-device.model.ts`; `registerPushDevice` in `push.resolver.ts` (identita dal bearer, nessun userId in input); `push-device.registry.int-spec.ts` e `push.resolver.int-spec.ts` passano (incl. concorrenza e token passato ad altro utente) |
| 2 | `sendToUser(userId, payload)` condiviso, firebase-admin HTTP v1, data message con al piu un ID, mai stato di gioco | VERIFIED | `push.service.ts` sendToUser (batch da 500, best-effort, mai throw); `transport/fcm-message.ts` toFcmBase: solo `type,title,body,sentAt` + `id` opzionale, nessun blocco `notification`; `push-message.ts` (id singolo); `fcm-push-transport.ts` usa `sendEachForMulticast`/`send`; PushModule esporta PushService; firebase-admin ^14.5.0, engines node>=22 |
| 3 | Token `registration-token-not-registered` rimosso dal registro | VERIFIED | `push-delivery.ts` STALE_TOKEN_CODES + `prunableTokens` (invalid-argument solo con testimone consegnato, Pitfall 4); `push.service.ts` chiama `registry.removeTokens`; `push.service.spec.ts` e int-spec verdi |
| 4 | Push travel-end / quest-end / streamer-live come data message (catalogo + contratto + trigger di prova) | VERIFIED (scope fase) | `push-events.ts` builder `travelEnd/questEnd/streamerLive` + `testPushMessage`; broadcast su topic `streamer-live` con subscribe/unsubscribe best-effort; `sendTestPush` `@Roles(innkeeper)` auditata. Trigger di dominio reali sono Phase 6/8/9 per CONTEXT (non gap) |

**Score:** 4/4

## Decisioni CONTEXT onorate
D-01 (collection `push_devices`, indici unici, TTL 270 gg, token mai su User/schema), D-05 (firebase-admin ^14.5.0, engines >=22), D-06/D-17 (`FIREBASE_SERVICE_ACCOUNT` in `.env.example` vuoto, pattern `.gitignore`, nessun file segreto tracciato), D-07 (porta PushTransport, Fcm/Noop, provider), D-08 (pruning sicuro), D-10/D-11 (data-only, apns background priority 5, TTL), D-13 (sendTestPush innkeeper), D-14 (schema additivo: 0 righe rimosse nel diff di `src/schema.gql`; unico `token: String!` e nell'input di registrazione).

## Spot-check eseguiti
- `npx jest src/push src/config --selectProjects unit`: 14 suite, 218 test PASS.
- `npx jest src/push test/app.int-spec.ts --selectProjects integration --runInBand`: 3 suite, 53 test PASS.
- Gate completi dichiarati in 05-08-SUMMARY (66 unit / 807, 43 integration / 515, build ok) non rieseguiti per intero; coerenti con i parziali.

## Requirements Coverage

| Requirement | Status | Evidence |
|-------------|--------|----------|
| BE-NOTIF-01 | SATISFIED | Truth 1 e 3; REQUIREMENTS.md `[x]`, traceability `Phase 5 | Complete` |
| BE-NOTIF-02 | SATISFIED | Truth 2 (sendToUser + broadcast topic, side-channel non autoritativo); `[x]`, Complete |
| BE-NOTIF-03 | SATISFIED (scope fase) | Truth 4: catalogo + contratto + sendTestPush; trigger reali differiti a Phase 6/8/9; `[x]`, Complete |

Nessun requisito orfano.

## Anti-Patterns
Nessun TODO/stub bloccante nei file `src/push/*`; nessun token loggato per intero (solo suffisso di 6 caratteri). Nessun blocker.

## Human Verification Required

### 1. Consegna reale FCM su device fisici
**Test:** con `FIREBASE_SERVICE_ACCOUNT` reale (stesso progetto Firebase del FE) registrare un device e lanciare `sendTestPush` per travelEnd/questEnd/streamerLive con app in foreground, background e killed (Android e iOS).
**Expected:** data message ricevuto con type/id/title/body/sentAt; su iOS killed best-effort (caveat D-11); dopo disinstallazione il token viene potato al push successivo.
**Why human:** servizio esterno e device reali; non verificabile in test automatici. Gia previsto come UAT manuale del FE Phase 5.

## Gaps Summary
Nessun gap. L'infrastruttura e implementata, cablata (AppModule -> PushModule) e coperta da test; resta solo la verifica manuale di consegna reale.

_Verified: 2026-10-18_
_Verifier: Claude (gsd-verifier)_
