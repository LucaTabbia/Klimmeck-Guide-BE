---
phase: 08-travel-lifecycle-travel-01
plan: 13
subsystem: travel
tags: [travel, teleport, graphql, authz, innkeeper, audit, bull, schema]
requires:
  - "08-05: teleportFilter / teleportUpdate / TELEPORT_PROJECTION / classifyUnteleported / UnteleportedSnapshot"
  - "08-08: TravelScheduler.cancel (best-effort), FakeTravelQueue, persistTravelWorld"
  - "08-09: TravelCompletionService.complete (filtro d'identità: job sopravvissuto ⇒ 'stale')"
  - "08-12: TravelService, TravelModule, input TravelRequest { id, poiId }"
provides:
  - "src/travel/travel.service.ts: TravelService.teleport(characterId, poiId) — esistenza del POI, un solo findOneAndUpdate condizionale con returnDocument 'before', rilettura solo per il codice, scheduler.cancel best-effort"
  - "src/travel/travel-admin.resolver.ts: teleportCharacter(request: TravelRequest!): CommonResponse! @Roles(innkeeper), audit automatico"
  - "src/schema.gql: +1 riga (teleportCharacter), nessun input nuovo"
affects: [08-14]
tech-stack:
  added: []
  patterns:
    - "teleport = exists(POI) → findOneAndUpdate(teleportFilter, teleportUpdate, { returnDocument: 'before', projection: TELEPORT_PROJECTION }) → classifyUnteleported sulla rilettura → cancel del job dallo startTime 'before'"
    - "resolver admin separato (TravelAdminResolver) per tenere @Roles fuori dal resolver owner-only"
key-files:
  created:
    - src/travel/travel-admin.resolver.ts
    - src/travel/teleport.resolver.int-spec.ts
  modified:
    - src/travel/travel.service.ts
    - src/travel/travel.module.ts
    - test/app.int-spec.ts
    - src/schema.gql
decisions:
  - "08-13: teleportCharacter(request: TravelRequest!) @Roles(innkeeper) in TravelAdminResolver; TravelService.teleport = un solo findOneAndUpdate condizionale (attivo, pendingQuest null) con returnDocument 'before' + scheduler.cancel best-effort; POI qualsiasi esistente (TravelModule registra PointOfInterest); audit target { type: 'CommonResponse', id: null } con args.request; nessuna push, nessuna scrittura quest; SDL +1 riga"
metrics:
  duration: 9 min
  completed: 2026-10-21
  tasks: 2
  files: 6
---

# Phase 8 Plan 13: Teleport admin atomico Summary

`teleportCharacter(request: TravelRequest!)` riservato all'innkeeper e auditato automaticamente: un solo `findOneAndUpdate` condizionale sovrascrive `status.location` con qualsiasi POI esistente e azzera `activeTravel`, restituendo il documento *before* da cui si ricostruisce il jobId del viaggio cancellato per la rimozione best-effort (il job sopravvissuto resta neutralizzato dal filtro d'identità del completamento).

## Tasks

| # | Task | Commit RED | Commit GREEN |
|---|------|------------|--------------|
| 1 | TravelService.teleport — update condizionale e rimozione best-effort del job | 2f61cab | ac80ad0 |
| 2 | TravelAdminResolver @Roles(innkeeper), audit, whitelist e SDL | 75a78da | 0892f68 |

## TDD evidence

- **Task 1 RED:** `npx jest src/travel/teleport.resolver.int-spec.ts --selectProjects integration --runInBand` → `Tests: 8 failed, 8 total` (tutti `not implemented` dallo stub `teleport`).
- **Task 1 GREEN:** 8/8 verdi; `npm run build` ok; `git diff --exit-code src/schema.gql` pulito; `src/travel` 6 suite / 72 test verdi.
- **Task 2 RED:** int-spec `Tests: 5 failed, 8 passed, 13 total` (i 5 casi sul filo); real boot `Tests: 3 failed, 32 passed, 35 total` (schema, bearer mancante, whitelist innkeeper); `src/schema.gql` non toccato.
- **Task 2 GREEN:** int-spec 13/13, real boot 35/35; schema rigenerato con la sola riga `teleportCharacter(request: TravelRequest!): CommonResponse!`; `git diff a1775a3 -- src/schema.gql | grep -E '^-[^-]'` vuoto; `src/travel` 6 suite / 77 test verdi; build e eslint ok.

## Acceptance checks

- `teleportFilter(`, `scheduler.cancel(`, `returnDocument: 'before'` presenti una volta ciascuno in `travel.service.ts`; nessun `sendToUser|pendingQuestModel|questModel`.
- `@Roles(RoleType.innkeeper)` una riga nel resolver; `^input TravelRequest {` = 1; `TeleportCharacterRequest` = 0; nessun `teleport-character-request.model.ts`.
- `'TravelAdminResolver.teleportCharacter'` in `EXPECTED_INNKEEPER_HANDLERS`; `target: { type: 'CommonResponse', id: null }` asserito due volte (ok e rifiuto).

## Deviations from Plan

None - plan executed exactly as written. (Nota minore: `teleportFilter(` è su una riga propria dopo prettier, quindi il grep di accettazione trova comunque 1 riga.)

## Threat model coverage

T-08-62 ('forbids a non-innkeeper' + whitelist del real boot), T-08-63 (audit ok e `QUEST_IN_PROGRESS`), T-08-64 ('refuses during a pending quest and writes nothing'), T-08-65 ('neutralises the old job even when its removal fails' ⇒ `complete` restituisce `'stale'`), T-08-66 (location e activeTravel nello stesso `$set`).

## Known Stubs

None.

## Self-Check: PASSED

- FOUND: src/travel/travel-admin.resolver.ts, src/travel/teleport.resolver.int-spec.ts
- FOUND commits: 2f61cab, ac80ad0, 75a78da, 0892f68
