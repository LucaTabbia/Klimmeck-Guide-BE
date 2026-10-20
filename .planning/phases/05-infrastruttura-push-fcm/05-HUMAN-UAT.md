---
status: partial
phase: 05-infrastruttura-push-fcm
source: [05-VERIFICATION.md]
started: 2026-10-18T20:01:52Z
updated: 2026-10-20T18:10:00Z
---

## Current Test

[awaiting human testing — Android chiuso con la UAT FE Phase 5 del 2026-10-20; resta iOS (test 2), da eseguire su device fisico iOS con `FIREBASE_SERVICE_ACCOUNT` reale]

## Tests

### 1. Consegna reale FCM su device fisico Android nei tre app state
expected: con `FIREBASE_SERVICE_ACCOUNT` reale (stesso progetto Firebase del FE) un device registrato via `registerPushDevice` riceve il data message di `sendTestPush` (bearer innkeeper, `DEV_AUTH_ROLE=innkeeper`) per `travelEnd`, `questEnd` e `streamerLive` con `type`/`id`/`title`/`body`/`sentAt`; Android in foreground, background e killed; dopo la disinstallazione dell'app il token viene potato al push successivo (`pruned: 1` nel report).
result: passed
evidenza: UAT FE Phase 5 del 2026-10-20 (10/10, `Klimmeck-Guide/.planning/phases/05-notifications-infrastructure/05-HUMAN-UAT.md`) su device Android reale: consegna in foreground/background/killed per i tre tipi, toggle, unregister prima del logout e pruning (`sendTestPush` dopo la disinstallazione → `pruned 1`). Durante la stessa UAT è emerso ed è stato risolto il permesso IAM per i topic (ruolo `roles/firebasecloudmessaging.admin` sul service account, vedi BACKEND-NOTES Phase 6 §3); il broadcast `streamerLive` sul topic `streamer-live` è stato inoltre ricevuto dal device nella UAT BE Phase 6 dello stesso giorno.

### 2. Consegna reale FCM/APNs su device fisico iOS
expected: come il test 1 con un device iOS registrato: iOS in foreground e background (killed best-effort, caveat D-11).
result: [pending]

## Summary

total: 2
passed: 1
issues: 0
pending: 1
skipped: 0
blocked: 0

## Gaps
