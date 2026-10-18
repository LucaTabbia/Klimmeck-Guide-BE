---
status: partial
phase: 05-infrastruttura-push-fcm
source: [05-VERIFICATION.md]
started: 2026-10-18T20:01:52Z
updated: 2026-10-18T20:01:52Z
---

## Current Test

[awaiting human testing — eseguita come UAT manuale della FE Phase 5 (Notifications Infrastructure), con `FIREBASE_SERVICE_ACCOUNT` reale e device fisico]

## Tests

### 1. Consegna reale FCM su device fisici (Android + iOS) nei tre app state
expected: con `FIREBASE_SERVICE_ACCOUNT` reale (stesso progetto Firebase del FE) un device registrato via `registerPushDevice` riceve il data message di `sendTestPush` (bearer innkeeper, `DEV_AUTH_ROLE=innkeeper`) per `travelEnd`, `questEnd` e `streamerLive` con `type`/`id`/`title`/`body`/`sentAt`; Android in foreground, background e killed; iOS in foreground e background (killed best-effort, caveat D-11); dopo la disinstallazione dell'app il token viene potato al push successivo (`pruned: 1` nel report).
result: [pending]

## Summary

total: 1
passed: 0
issues: 0
pending: 1
skipped: 0
blocked: 0

## Gaps
