---
phase: 21-premi-per-rango-e-soccorsi
plan: 04
subsystem: quests
tags: [quests, acceptance, maintenance, boot, tdd]
requires:
  - 21-03
provides:
  - registrationRuleOf → 'invalid' per boss e worldMission con un posto a titolo null (QUEST_NOT_ACCEPTABLE fail-closed)
  - hasUntitledGroupSeat(type, slots) esportata da quest-eligibility (unica regola, condivisa dal report)
  - groupPrizeViolationsOf, describeGroupPrizeViolations, GROUP_PRIZE_REPORT_WARNINGS_LIMIT (puri)
  - GroupPrizeReportService.report() di sola lettura, passo non bloccante del boot dopo la migrazione dei nemici
affects: [21-05, 21-06, 21-07, 21-12]
tech-stack:
  added: []
  patterns:
    - report di boot di sola lettura sul modello dei negozi (WARN fino a un tetto, poi riga riassuntiva)
key-files:
  created:
    - src/quests/maintenance/group-prize.report.ts
    - src/quests/maintenance/group-prize.report.spec.ts
    - src/quests/maintenance/group-prize-report.service.ts
    - src/quests/maintenance/group-prize-report.service.int-spec.ts
  modified:
    - src/quests/acceptance/quest-eligibility.ts
    - src/quests/acceptance/quest-eligibility.spec.ts
    - src/quests/acceptance/quest-acceptance.service.int-spec.ts
    - src/quests/acceptance/accept-quest.resolver.int-spec.ts
    - src/quests/party/quest-start.int-spec.ts
    - src/quests/party/party-timeout.int-spec.ts
    - src/quests/pending-requests/standard-lane-liveness.int-spec.ts
    - src/characters/pending-quest-start.publisher.int-spec.ts
    - src/travel/travel-completion.int-spec.ts
    - src/quests/outcomes/quest-resolution.sweeper.int-spec.ts
    - src/quests/outcomes/quest-resolution.processor.int-spec.ts
    - src/quests/maintenance/quest-maintenance.boot.ts
    - src/quests/maintenance/quest-maintenance.boot.spec.ts
    - src/quests/maintenance/quest-maintenance.module.ts
decisions:
  - "La regola del posto a titolo vive in una sola funzione esportata, hasUntitledGroupSeat (quest-eligibility.ts, set TITLED_SEAT_TYPES = boss, worldMission): il report la riusa invece di ricopiare il set"
  - "I casi canonici dei jolly (D-32) restano dove i jolly hanno ancora senso: la unit di quest-eligibility passa ad aid, la int-spec di accettazione tiene il caso canonico su worldMission con posti hero+paladin+mage; la gara «exact prima dei jolly» passa ad aid"
  - "Messaggio di WARN per quest: `Premi per titolo: missione <hex> da correggere (<violazioni>)`; riassunto `Premi per titolo: N quest di gruppo da correggere su M`"
metrics:
  duration: ~45 min
  completed: 2026-11-13
---

# Phase 21 Plan 04: posto null nelle quest di gruppo, rifiuto e report al boot Summary

Un boss o una worldMission con un posto a titolo null non si accetta più (`registrationRuleOf` → `'invalid'` → `QUEST_NOT_ACCEPTABLE`, nessuna scrittura); al boot un report di sola lettura elenca per id le quest di gruppo aperte con posti null, titoli dei posti senza blocco o magie in blocchi sotto mage.

## Commit

| Task | Commit | Messaggio |
|------|--------|-----------|
| 1 RED | f99c0915 | test(quests): pin group quests without untitled seats |
| 1 GREEN | 724cfc81 | feat(quests): refuse group quests with untitled seats |
| 2 RED | af3c6d59 | test(quests): pin the read-only group prize report |
| 2 GREEN | 09fdd6b5 | feat(quests): report invalid group prizes at boot |
| 3 | (questo commit) | docs(phase-21): record plan 04 progress |

## Fallimenti RED attesi

- Task 1: `quest-eligibility.spec.ts` 2 rossi (`rejects a boss or a world mission with a seat without a title (D-02, D-24): boss` / `: worldMission`, la regola restituiva una `SlotRule`); `quest-acceptance.service.int-spec.ts` 1 rosso (`rejects a group quest with a seat without a title with QUEST_NOT_ACCEPTABLE and writes nothing (D-24)`, l'accettazione riusciva). `keeps the solo seat of an aid and of an enemy (D-24)` verde al primo colpo: pinna il comportamento invariato.
- Task 2: `group-prize.report.spec.ts` e `group-prize-report.service.int-spec.ts` con `Cannot find module './group-prize.report'`; `quest-maintenance.boot.spec.ts` 2 rossi (il report non era chiamato). Il caso della migrazione senza errori restava verde.

## Spec con posti null portate a posti a titolo (stesso commit RED)

Trovate applicando il GREEN in locale prima del RED (32 + 17 rossi, poi verdi):

- `src/quests/acceptance/quest-acceptance.service.int-spec.ts`: nuova costante `THREE_ROOKIES` per tutte le worldMission che usavano `ANY_THREE` (13 punti; `ANY_THREE` resta per le tre aid); `TWO_SEATS` del describe «party start» → rookie×2; boss di «opens the 24 hour window at the first registration only» → rookie×3; «applies the canonical case shared with the FE» → worldMission con posti hero+paladin+mage (stessi esiti: paladin `QUEST_FULL`, hero accettato, 3000 punti); «fills exact seats before wildcards under concurrency» → aid (unico tipo che tiene i jolly).
- `src/quests/acceptance/quest-eligibility.spec.ts`: «rejects a full %s» → posto hero per boss/enemy/aid; «applies the canonical case shared with the FE (D-32)» → aid.
- `accept-quest.resolver.int-spec.ts` (worldMission da un'altra città), `quest-start.int-spec.ts` e `party-timeout.int-spec.ts` (`questOf`), `standard-lane-liveness.int-spec.ts`, `pending-quest-start.publisher.int-spec.ts`, `travel-completion.int-spec.ts` (~1027), `quest-resolution.sweeper.int-spec.ts` (~274, ~310), `quest-resolution.processor.int-spec.ts` (~299): `title: null` → `'rookie'` (titolo dei personaggi seminati).
- Le sei di non regressione (boss-resolution, aid-rescue, quest-pet-prize, quest-generation-trigger, quest-updated.subscription, party-abandon) verdi senza modifiche, come previsto dal planner.

## Verifica

- Task 1: unit `src/quests` 68 suite / 1158 test; integration del `<verify>` 15 suite / 326 test (un solo comando, ~75 s); tsc 0.
- Task 2: unit `src/quests/maintenance` + `src/quests/acceptance` 6 suite / 239 test; integration `src/quests/maintenance` 2 suite / 8 test; `test/app.int-spec.ts` 91 test (cablaggio DI del modulo di manutenzione); tsc 0; `src/schema.gql` invariato.
- Grep di accettazione: `TITLED_SEAT_TYPES` 2; titoli dei casi 1 e 1; `export function groupPrizeViolationsOf` 1; scritture nel servizio 0; `groupPrizes.report(` 1; `D-28)` nell'int-spec 1; `pgrep -fl 'bin/jest'` vuoto a fine di ogni task.

## Deviations from Plan

- **[Rule 2 - Clean Code] `hasUntitledGroupSeat` esportata e riusata dal report** invece di un secondo `TITLED_SEAT_TYPES` nel modulo del report (zero duplicazione della regola). Commit 09fdd6b5.
- **Casi dei jolly su aid invece che a posti a titolo** (vedi decisioni): portarli a soli posti a titolo avrebbe tolto l'unica copertura in integrazione dei jolly, che restano validi per l'aid. Il caso canonico della int-spec di accettazione è invece a posti a titolo: su un'aid il terzo iscritto completa il party e l'avvio scarta i due iscritti finti.
- Casi aggiunti oltre al `<behavior>`: `ignores the solo quests and the seats that are not valid (D-24)` (report), `caps the warnings and closes with the counts (D-24)` e `stays silent when every open group quest is valid (D-24)` (servizio).

## Threat Flags

Nessuna superficie nuova oltre al threat model (T-21-11..14 mitigati: rifiuto in integrazione, stringa del log pinnata con `toEqual`, collection identica prima/dopo, passo nello `step` del boot).

## Known Stubs

Nessuno.

## Self-Check: PASSED
