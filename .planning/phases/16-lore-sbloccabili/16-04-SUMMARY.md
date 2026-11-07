---
phase: 16-lore-sbloccabili
plan: 04
subsystem: travel + quests/acceptance (geografia della città all'arrivo)
tags: [travel, quests, lore, geography, BE-LORE-02, D-05, D-14, D-15]
requires: ["16-01", "16-03"]
provides:
  - "`COMPLETION_PROJECTION` con `'status.activeTravel.to': 1`; `CompletedSnapshot.status.activeTravel.to?: unknown`"
  - "`teleportUpdate(poiId, geography: readonly Types.ObjectId[] = [])` = `{ $set, ...knowledgeAdditionOf(geography) }`"
  - "`TravelCompletionService` inietta `LoreGeographyReader` (ultimo parametro); metodo privato `unlockArrivalGeography(before, characterId, session)` chiamato subito dopo `outcome.completed = before`, prima di `deliverHeldReports`"
  - "`TravelService` inietta `LoreGeographyReader` (ultimo parametro); `teleport` legge `ofMarker(poiId)` fuori dalla transazione; `teleportInSession(characterId, poiId, geography, session)`"
  - "`LaneMovement` jump = `{ kind: 'jump'; marker; geography?: readonly Types.ObjectId[] }`; `laneClaimUpdate` = `{ $set, ...(jump ? knowledgeAdditionOf(geography ?? []) : {}) }`"
  - "`QuestAcceptanceService` inietta `LoreGeographyReader` (ultimo parametro); `movementTo` ramo del salto con `geography: await this.geography.ofMarker(request.to)`"
  - "`TravelModule` e `QuestAcceptanceModule`: `forFeature` + `Lore`, `imports` + `LoreGeographyModule`"
affects: [16-06, 16-07, 16-11]
tech-stack:
  added: []
  patterns:
    - "Secondo update add-to-set nello stesso callback della transazione del completamento (C-4): pipeline e filtro invariati"
    - "Geografia letta fuori dalla transazione per teleport e salto (marker noto prima)"
key-files:
  created: []
  modified:
    - src/travel/travel.updates.ts
    - src/travel/travel.updates.spec.ts
    - src/travel/travel-completion.service.ts
    - src/travel/travel.service.ts
    - src/travel/travel.module.ts
    - src/travel/travel-completion.int-spec.ts
    - src/travel/teleport.resolver.int-spec.ts
    - src/quests/acceptance/quest-acceptance.updates.ts
    - src/quests/acceptance/quest-acceptance.updates.spec.ts
    - src/quests/acceptance/quest-acceptance.service.ts
    - src/quests/acceptance/quest-acceptance.module.ts
    - src/quests/acceptance/quest-acceptance.service.int-spec.ts
decisions:
  - "Il secondo update del completamento parte dopo `outcome.completed = before` e prima della consegna dei report: con `before` assente (identità scaduta) non parte nulla"
  - "Nei casi del salto la quest sta nella città del personaggio (QUEST_NOT_IN_CITY altrimenti): la geografia si collega alla città A del travel world con `persistGeographyLore` + `relatedLore` della città, non a una città di `persistGeography` (il suo marker è un POI a [0, 0] fuori dalla città del personaggio)"
metrics:
  duration: "~10 min"
  completed: 2026-11-07
  tasks: 3
  files: 12
---

# Phase 16 Plan 04: geografia della città all'arrivo, al teleport e al salto Summary

Il completamento di un viaggio (libero, da quest, deviazione) sul marker di una città legge la meta dal `before` e aggiunge la geografia con un secondo update add-to-set nello stesso callback della transazione, lasciando `COMPLETION_UPDATE` e `completionFilter` intatti; il teleport e il salto istantaneo dell'accettazione portano la geografia (letta fuori dalla transazione) nello stesso update che muove il personaggio. Un POI del territorio non sblocca nulla e il movimento resta quello di prima.

## Commit

| Task | Commit | Subject |
|------|--------|---------|
| 1 RED | 941ba95 | test(travel): expect the city geography on arrival (D-05) |
| 1 GREEN | e783f3f | feat(travel): unlock the city geography on arrival and teleport |
| 2 RED | 66b973a | test(quests): expect the city geography on an instant jump (D-05) |
| 2 GREEN | 096ce0e | feat(quests): unlock the city geography on an instant jump |
| 3 | (questo) | docs(phase-16): record plan 04 progress |

## Fallimenti RED osservati

- Task 1 unit (`travel.updates.spec.ts`): 2 falliti su 24 — il `toEqual` di `COMPLETION_PROJECTION` (manca `status.activeTravel.to`) e `adds the city geography to the teleport (D-05)` (manca la chiave add-to-set; ts-jest non controlla l'arità del secondo argomento).
- Task 1 integration: 5 falliti su 62 — arrivo libero, arrivo da quest, deviazione, secondo arrivo (completamento) e teleport sul marker. Verdi già in RED, per costruzione: `unlocks nothing on a territory point of interest and still moves (D-05, D-15)`, `writes nothing on a stale completion (D-05)` e `unlocks nothing on a teleport to a territory point of interest (D-05, D-15)` (il default `[]` di `@Prop` del 16-02); restano come guardie del ramo «geografia vuota» e del «before assente».
- Task 2 unit: 1 fallito su 30 — `adds the city geography to an instant jump (D-05)`.
- Task 2 integration: 1 fallito — `unlocks the city geography on an instant jump to its marker (D-05)`. Verdi in RED per costruzione: salto sul territorio e quest avviata col viaggio. Al primo giro anche «starts by travel» era rosso per un errore della spec (QUEST_NOT_IN_CITY: marker della quest in un'altra città) → fixture corretta prima del commit RED.

## Rami nuovi in `src/travel/` e casi che li coprono (D-15)

- `unlockArrivalGeography` con geografia non vuota → arrivo libero, da quest, deviazione, secondo arrivo (`travel-completion.int-spec.ts`).
- `unlockArrivalGeography` con geografia vuota (early return) → `unlocks nothing on a territory point of interest and still moves (D-05, D-15)`.
- `before` assente (il metodo non parte) → `writes nothing on a stale completion (D-05)`.
- `teleportUpdate` con e senza geografia → unit `adds the city geography to the teleport (D-05)` + int-spec teleport città/territorio (`teleport.resolver.int-spec.ts`).

## Deviazioni dal piano

- **Fixture dei casi del salto.** Il piano chiedeva un marker di `persistGeography`; l'accettazione rifiuta una quest fuori dalla città del personaggio (QUEST_NOT_IN_CITY) e il marker di `persistGeography` è un POI a [0, 0] di un'altra città. I tre casi collegano la geografia (`persistGeographyLore`) alla `relatedLore` della città A del travel world: salto da `farQuestPoi` (isolato) su `markerA`, viaggio da `questPoi` su `markerA`, salto da `markerA` su `farQuestPoi` (territorio). `afterEach` del `describe` svuota la collezione `lores`.
- **Grep di accettazione:** `grep -c "D-05)" quest-acceptance.service.int-spec.ts` stampa `4` (non `3`): il caso preesistente `draws the ambush of the automatic travel before the claim (D-05)` (Phase 15) combacia; il titolo del `describe` nuovo non nomina la decisione per non salire a 5. `grep -c "LoreGeographyModule"` stampa `2` nei due moduli (import + `imports`, criterio ≥ 1). `grep -c "D-05" travel-completion.int-spec.ts` = 7 (≥ 6).
- **Bookkeeping:** `Plan: 4 of 12` in STATE.md (formato del brief dell'orchestratore) invece di `Plan: 04 of 12` del piano; il grep di verifica del Task 3 del piano quindi non passa per scelta.

## Gate

- `npx jest src/travel --selectProjects unit`: 185/185. `npx jest src/travel --selectProjects integration --runInBand`: 11 suite, 198/198 (~57 s).
- `npx jest src/quests/acceptance --selectProjects unit`: 186/186. `--selectProjects integration --runInBand`: 2 suite, 138/138.
- `npx jest test/app.int-spec.ts --selectProjects integration --runInBand`: 76/76 (real boot, DI di AppModule); `src/quests/pending-requests/standard-lane-liveness.int-spec.ts` (unico altro harness che usa i moduli toccati): 5/5.
- `npx tsc --noEmit -p tsconfig.json` 0; prettier e eslint puliti sui 12 file `.ts` toccati (nessun file sporco in partenza, nessun commit style).
- `COMPLETION_UPDATE` e `completionFilter` invariati (grep del diff = 0); `git diff --exit-code src/schema.gql` 0; schema vs origin/develop: 2 righe aggiunte (`unlockedLore: [ID!]!`, `loreUnlocked: [Lore!]!`, dal 16-02), 0 tolte.

## Known Stubs

Nessuno.

## Self-Check: PASSED

Commit 941ba95, e783f3f, 66b973a, 096ce0e nel log; i 12 file modificati presenti.
