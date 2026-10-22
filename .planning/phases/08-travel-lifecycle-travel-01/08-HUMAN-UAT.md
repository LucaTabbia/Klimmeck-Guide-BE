---
status: partial
phase: 08-travel-lifecycle-travel-01
source: [08-VERIFICATION.md]
started: 2026-10-21T21:32:21Z
updated: 2026-10-21T21:32:21Z
---

## Current Test

[awaiting human testing — deferred to the FE Phase 7 (Travel) device UAT, as the Phase 7 BE UAT was deferred to the FE Phase 6 UAT]

`status: partial` per il template GSD: il test resta visibile nei controlli di avanzamento (`/gsd-progress`, `/gsd-audit-uat`) finché non viene eseguito su device.

## Tests

### 1. UAT su device con la FE Phase 7: viaggio libero da una città, interpolazione con serverTime, arrivo, push travelEnd
prerequisiti: BE Phase 8 merged su develop e in esecuzione (Mongo replica set + Redis, `TRAVEL_SWEEP_INTERVAL_MS` vuota = 60 s); dati a DB preparati a mano come in BACKEND-NOTES §11 (le 4 quest dev aggiornate al nuovo formato a slot, un documento Pet completo con `speedModifier`, `assets.pet` sul personaggio, città e marker sulla rete stradale); FE Phase 7 (Travel) installata sul device Android con le notifiche push registrate.
passi:
- a. da una città chiamare `travelPreview` verso un'altra città e confrontare `duration`/`distance` con la tabella delle durate misurate (BACKEND-NOTES §8)
- b. confermare con `startTravel`: `characterUpdated` porta `activeTravel { road startTime endTime duration to }`; il marker si muove interpolando `(now + offset − startTime) / duration` sulla polilinea con l'offset di `serverTime`
- c. riprovare `startTravel` durante il viaggio → `TRAVEL_IN_PROGRESS`; verso un POI non città → `TRAVEL_DESTINATION_NOT_ALLOWED`
- d. all'arrivo (`endTime`): `characterUpdated` con `activeTravel: null` e `status.location` = meta; una sola push `travelEnd` al proprietario
- e. accettare una quest standard con marker diverso dalla città → `activeTravel` e `PendingQuest.startDate: null`; all'arrivo `startDate` = `endTime` pianificato e NESSUNA push
- f. con il pet `speedModifier: 2` equipaggiato la durata della preview si dimezza
- g. innkeeper: `teleportCharacter` su un personaggio in viaggio libero → `activeTravel: null`, `location` = POI, audit scritto; con una `pendingQuest` attiva → `QUEST_IN_PROGRESS`
- h. spegnere il BE con un viaggio in corso e riavviarlo dopo `endTime` → il reconciler al boot completa il viaggio
expected: il marker si sposta solo all'evento `characterUpdated` con `activeTravel: null`; push solo per i viaggi liberi; nessun calcolo di ETA lato client.
result: [pending]
why_human: richiede la FE Phase 7, notifiche push reali e dati a DB preparati dall'utente (BACKEND-NOTES §11); dichiarato manual-only nel gate 08-14.

## Summary

total: 1
passed: 0
issues: 0
pending: 1
skipped: 0
blocked: 0

## Gaps
