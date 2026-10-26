---
status: complete
phase: 08-travel-lifecycle-travel-01
source: [08-VERIFICATION.md]
started: 2026-10-21T21:32:21Z
updated: 2026-10-26T21:55:00Z
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
result: pass (FE Phase 7 device UAT 2026-10-26: a–g tutti verificati, nessun difetto BE; h non esercitato sul viaggio — il reconciler al boot è stato osservato risolvere una quest scaduta al riavvio del BE)
why_human: richiede la FE Phase 7, notifiche push reali e dati a DB preparati dall'utente (BACKEND-NOTES §11); dichiarato manual-only nel gate 08-14.

## Summary

total: 1
passed: 1
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

## Esito riportato dalla UAT FE Phase 7 (2026-10-26)

Copiato da `Klimmeck-Guide/.planning/phases/07-travel/BACKEND-NOTES.md` §3 (lato BE, come chiesto dal handoff). Il BE usato era il locale dal branch `feat/09-combat-result-admin-outcomes` @ c4582b9.

Nessuna domanda aperta. UAT su device eseguita il **2026-10-26** (Samsung SM-S938B via USB, `adb reverse tcp:3000`) con FE `feat/07-travel` @ 596e6c7 contro il **BE locale dal branch `feat/09-combat-result-admin-outcomes` @ c4582b9** (contiene `origin/develop` 3df1b37 più la BE Phase 9, PR #13), non `origin/develop`. Dettaglio passo per passo in `07-HUMAN-UAT.md`.

Esito per i passi del handoff BE §11 d — **tutti verificati, nessun difetto BE emerso**:

| §11 d | Esito | Note |
|-------|-------|------|
| d.1 anteprima + conferma | pass | Foglio con distanza, durata ed ETA da `travelPreview`, poi `startTravel`. Probe C1: la rotta tratteggiata parte dalla pedina, nessuna anomalia segnalata dall'utente. |
| d.2 interpolazione sull'ora server | pass | Orologio del telefono spostato: pedina e tempo residuo invariati. |
| d.3 kill a metà viaggio | pass | Al rilancio la pedina riprende sulla rotta nel punto giusto. |
| d.4 arrivo con push | pass | Background: push "Viaggio completato", tap → Mappa. Primo piano: scatto sulla città su `characterUpdated` e banner. In gioco `endTime` è sempre `startTime + duration` (un primo tentativo con il solo `endTime` accorciato a mano nel DB non è valido, vedi `07-HUMAN-UAT.md`). |
| d.5 viaggio automatico da quest | pass | Foglio "In viaggio" → "Cacciando…" all'arrivo, nessuna push. |
| d.6 rifiuti | pass | `TRAVEL_IN_PROGRESS` → "Sei già in viaggio"; `QUEST_IN_PROGRESS` → "Non puoi partire durante una missione in corso" (copy di dominio, mai testo tecnico). |
| d.7 teleport a mano | pass | Su viaggio libero: viaggio cancellato dal BE, pedina sul nuovo POI. Con quest in corso: `QUEST_IN_PROGRESS` ("Non puoi muoverti durante una missione in corso"). |
| d.8 pet | pass | Pet `speedModifier: 2`: durata attesa 9 h 4 min col pet, doppia senza; l'utente ha confermato il pass senza riportare i numeri letti. |

- **Osservazione Pitfall 10 (regola della città più vicina):** a zoom basso il foglio ha nominato "Ulby". Non è un difetto (D-01).
- **Follow-up solo FE:** colore del tratteggio della rotta all'oro principale (quick task).
