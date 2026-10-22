---
phase: 08-travel-lifecycle-travel-01
verified: 2026-10-21T00:00:00Z
status: human_needed
score: 4/4 success criteria verified (D-26..D-32 verificati)
overrides_applied: 0
human_verification:
  - test: "UAT su device con la FE Phase 7: startTravel da una città, interpolazione con serverTime, arrivo, push travelEnd"
    expected: "Il marker si sposta solo all'evento characterUpdated con activeTravel null; push solo per i viaggi liberi"
    why_human: "Richiede la FE Phase 7, notifiche push reali e dati a DB preparati dall'utente (BACKEND-NOTES §11); dichiarato manual-only nel gate 08-14"
---

# Phase 8: Travel Lifecycle — Verification Report

**Obiettivo:** viaggio server-autoritativo (`activeTravel` su schema e subscription, start validato, completamento con DB come fonte di verità, teleport atomico).
**Stato:** human_needed (nessun gap automatico; resta solo la UAT su device, manual-only).
**Re-verification:** No, verifica iniziale.

## Success criteria (ROADMAP)

| # | Criterio | Stato | Evidenza |
|---|----------|-------|----------|
| 1 | `status.activeTravel { road, startTime, endTime, duration }` su schema e subscription | VERIFIED | `src/models/character/active-travel.model.ts` (`ActiveTravel` con road, startTime, endTime, duration, più `to`; `kind` interno non esposto); `character-status.model.ts:30`; SDL `type ActiveTravel` + `CharacterStatus.activeTravel`; `characterUpdated` è alimentato dal change stream con `fullDocument: updateLookup` (`characters.service.ts:84`), quindi il campo viaggia nel payload |
| 2 | `startTravel` rifiuta se c'è un viaggio attivo, calcola path/ETA server-side e persiste; esiste la preview | VERIFIED | `TravelService.startTravel`: `TravelPlanner.planFree` (server-side) poi un solo `findOneAndUpdate` con filtro `status.activeTravel: null`, `quests.pendingQuest: null` e location attesa; il fallimento è classificato `TRAVEL_IN_PROGRESS`/`QUEST_IN_PROGRESS`. `travelPreview` senza scritture. Resolver owner-only (`@OwnsCharacter ownerOnly`) |
| 3 | A `endTime` il BE cancella `activeTravel`, aggiorna `location`, emette subscription + push; reconciler al boot | VERIFIED | `TravelCompletionService.complete`: transazione con `completionFilter` (identità startTime/endTime e `endTime <= now`) e update a pipeline (`location = activeTravel.to`, `activeTravel = null`); countdown quest all'arrivo (D-13); push `travelEnd` solo per `kind: free`, dopo il commit (D-14). Trigger Bull in `TravelCompletionProcessor` (mai prima di endTime, mai ri-accodato). `TravelSweeper.onApplicationBootstrap` esegue sempre lo sweep al boot, più sweep periodico (0 lo spegne), single-flight |
| 4 | Teleport admin: `location` sovrascritta e `activeTravel` cancellato atomicamente, incluso il job Bull | VERIFIED | `TravelService.teleport`: un solo `findOneAndUpdate` (`teleportUpdate` imposta location e activeTravel null insieme, filtro bloccato dalla quest standard), poi `scheduler.cancel` del job best-effort; il job superstite non trova più l'identità e non scrive (D-12/D-16). `teleportCharacter` è `@Roles(innkeeper)` |

Nota di design: la rimozione del job è best-effort. L'atomicità è del DB, e il job residuo è neutralizzato dal filtro d'identità. È coerente con "DB fonte di verità" e con D-16.

## Emendamenti D-26..D-32

| Decisione | Stato | Evidenza |
|-----------|-------|----------|
| D-26 (emendata 2026-10-22) solo story da qualunque città; worldMission legata alla città | VERIFIED | `quest-acceptance.service.ts` / `quest-acceptance.updates.ts` (spec `rejects a world mission from another city with QUEST_NOT_IN_CITY and writes nothing`, `accepts a world mission from a point of interest of the quest city`, `rejects a world mission from another city on the wire`, `accepts a story from another city` verdi) |
| D-27 registrazione enemy/aid con capienza | VERIFIED | `quest-capacity.ts`, `quest-acceptance.service.ts`; `QUEST_FULL` / `QUEST_NOT_ACCEPTABLE` |
| D-28 nuovi tipi senza campi extra | VERIFIED | SDL: `registeredAdventurers: [QuestRegistration!]!`, `requiredAdventurers: [QuestPartySlot!]!` (title nullable), `party` rimosso, `registrations` assente |
| D-29/D-32 regola e algoritmo di capienza | VERIFIED | `quest-capacity.spec` verde (esempio canonico), espressione `$expr` nel claim |
| D-30 posti liberati alla cancellazione | VERIFIED | `characters/deletion/character-deletion.service.ts:82-87` (pull da `registeredAdventurers`) |
| D-31 populate del catalogo | VERIFIED | `quests/quest-catalog.populate.ts` (`infos.enemy`, `infos.relatedLore`, item di loot/prize) |

## Contratto SDL

`git diff origin/develop -- src/schema.gql`: 38 inserzioni, 5 rimozioni. Le 5 righe rimosse sono esattamente quelle dichiarate (D-20): `PendingQuest.startDate: DateTime!` (diventa nullable), `Quest.registeredAdventurers: [String!]!` (cambio tipo), `QuestPartySlot.title: String!` (diventa nullable), `QuestRequirements.party`, `QuestRequirements.requiredAdventurers: Int!`. Il resto è additivo: `ActiveTravel`, `TravelPath`, `TravelPreview`, `TravelRequest`, `QuestRegistration`, `Pet.speedModifier`, `startTravel`, `teleportCharacter`, `travelPreview`. BACKEND-NOTES §1 riporta blocchi coerenti con lo SDL.

## Artefatti e wiring

| Artefatto | Stato |
|-----------|-------|
| `src/travel/*` (service, planner, scheduler, completion, sweeper, processor, resolver, admin resolver, updates, timing, rules, job) | Sostantivi, nessun TODO/FIXME |
| `TravelModule` montato in `AppModule` (riga 85); coda Bull registrata in `TravelPlanningModule`; `Clock` e `travelConfigProvider` forniti | WIRED |
| Chain dati: planner -> `startTravelUpdate` -> change stream -> `characterUpdated` | FLOWING (dati reali da Mongo, nessun valore statico) |

I pattern `key_links` double-escaped non sono stati usati letteralmente: il wiring è stato verificato leggendo il codice, come indicato.

## Spot-check eseguiti

| Comando | Esito |
|---------|-------|
| `jest src/travel src/models/character/active-travel.schema.spec.ts src/quests/acceptance --selectProjects unit` | 10 suite, 230 test, PASS |
| `jest src/travel/travel-completion src/travel/teleport --selectProjects integration --runInBand` | 3 suite, 32 test, PASS (completamento, processor, sweep/boot reconciler, teleport) |
| Suite complete (da 08-14): unit 95/1415, integration 57/739 | Non rieseguite, assunte verdi come da incarico |

## Requirements traceability

| ID | Piani | Stato | Evidenza |
|----|-------|-------|----------|
| BE-TRAVEL-01 | 4 piani | SATISFIED | Criterio 1 |
| BE-TRAVEL-02 | 8 piani | SATISFIED | Criterio 2 |
| BE-TRAVEL-03 | 7 piani | SATISFIED | Criterio 3 |
| BE-TRAVEL-04 | 4 piani | SATISFIED | Criterio 4 |

Tutti e 4 gli ID compaiono in REQUIREMENTS.md (righe 92-95, `[x]`; tabella righe 184-187 `Complete`). Nessun requisito orfano per la Phase 8.

## Anti-pattern

Nessun blocker. Nessun TODO/FIXME nei sorgenti di fase. Il warning ESLint preesistente in `RoadsService.getShortestPath` è fuori ambito (D-11). `package.json` senza modifiche rispetto a `develop`.

## Human verification richiesta

1. **UAT su device con la FE Phase 7.** Test: avviare un viaggio libero, osservare l'interpolazione con `serverTime`, l'arrivo e la push `travelEnd`; verificare che quella push non arrivi per i viaggi automatici da quest né per il teleport. Atteso: il marker si sposta solo all'evento `activeTravel: null` con la nuova `location`. Motivo: richiede la FE, push reali e dati a DB preparati dall'utente.

## Gap

Nessuno.

_Verifier: Claude (gsd-verifier)_
