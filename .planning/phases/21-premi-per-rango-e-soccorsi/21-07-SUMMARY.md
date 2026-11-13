---
phase: 21-premi-per-rango-e-soccorsi
plan: 07
subsystem: generation
tags: [generation, boss, rank-prizes, tdd]
requires:
  - 21-06
provides:
  - MIXED_BOSS_SHARE, lowerRankOf(rank), mixedSeatsOf(seats, chance), coverageRankOf(quest) e CoverageQuest in src/quests/generation/generation-rules.ts
  - GeneratedRankPrize, MixedBossInput e mixedBossDraftOf(draft, mix) in src/quests/generation/generated-quest-draft.ts; ogni boss generato scrive prizes.rankPrizes
  - generatore che crea boss misti (tiri in coda, solo boss) e conta la copertura dei boss sul titolo più alto dei posti
  - seatViolationsOf (test/quests/generation-world.ts) che ammette i boss misti [rango, inferiore]
affects: [21-08, 21-11, 21-12, 21-14]
tech-stack:
  added: []
  patterns:
    - tiri nuovi del generatore in un metodo privato (mixedOf) chiamato dopo il draft, così l'annuncio resta l'ultimo tiro di oggi
    - istantanea a seme fisso scritta nel commit RED dalla corsa sul codice di prima (identità, non solo determinismo)
key-files:
  created: []
  modified:
    - src/quests/generation/generation-rules.ts
    - src/quests/generation/generation-rules.spec.ts
    - src/quests/generation/generated-quest-draft.ts
    - src/quests/generation/generated-quest-draft.spec.ts
    - src/quests/generation/quest-generator.service.ts
    - src/quests/generation/quest-generator.int-spec.ts
    - test/quests/generation-world.ts
decisions:
  - "coverageRankOf legge i posti con slotsOf (non questSlotsOf: il tipo è già filtrato su boss); boss senza posti a titolo validi ripiega su minTitle; titolo non generato (legend) → null, quindi non contato"
  - "Il blocco del rango è costruito dagli stessi GeneratedPrizes dei campi di oggi (nessun tiro in più); il misto è applicato dopo il draft da mixedBossDraftOf, che legge il posto del rango dal draft"
  - "I tiri del misto vivono nel metodo privato mixedOf del generatore: cancello sempre per ogni boss, proporzione solo se metà dei posti > 1, prizesOf del titolo inferiore solo se misto"
  - "Seme del caso dei boss misti: SeededChanceSource(7) su 6 città × 5 POI, target 24"
metrics:
  duration: ~25 min
  completed: 2026-11-13
---

# Phase 21 Plan 07: boss generati misti col titolo inferiore Summary

Un boss generato su due ha da 1 a metà dei posti al titolo immediatamente inferiore (mai superiore), `minTitle` sul titolo più basso, un blocco premio per titolo in `prizes.rankPrizes` (il blocco inferiore da `prizesOf` di quel rango, pet compreso), coi tiri nuovi in coda alla quest e solo per i boss; il generatore conta la copertura dei boss sul titolo più alto dei posti.

## Commit

| Task | Commit | Messaggio |
|------|--------|-----------|
| 1 RED | 641cce6d | test(generation): pin the mixed bosses and their rank blocks |
| 1 GREEN | 9f7006d4 | feat(generation): add the mixed boss rules and rank blocks |
| 2 RED | d6023674 | test(generation): pin mixed bosses in the generator run |
| 2 GREEN | 49d843c5 | feat(generation): generate mixed bosses with rank blocks |
| 3 | (questo commit) | docs(phase-21): record plan 07 progress |

## Fallimenti RED attesi

- Task 1: in `generation-rules.spec.ts` gli 8 casi nuovi cadono con `lowerRankOf` / `mixedSeatsOf` / `coverageRankOf is not a function`; in `generated-quest-draft.spec.ts` cadono `writes one rank block on every generated boss (D-05, D-23)` (`rankPrizes` assente) e i tre casi di `mixedBossDraftOf` (`is not a function`). `writes no rank block on a generated enemy (D-01)` verde al RED: pinna l'assenza della chiave sulle enemy, già vera oggi.
- Task 2: cadono `generates mixed bosses with the lower title only (D-03, D-23)` (nessun boss con due voci di posti) e `counts a mixed boss on its highest seat title (D-23)` (il boss misto a DB conta come paladin, il primo rango servito è rookie invece di paladin). Verdi al RED, come voluto: `keeps the enemies identical draw by draw (D-23)` (l'istantanea è presa proprio dal codice di prima, HEAD 9f7006d4 col generatore non ancora cablato) e `never seeds blocks on hand written quests (D-06)` (il generatore non ha mai toccato le quest che non crea; il caso pinna l'assenza).
- Per scegliere il seme del caso dei boss misti il cablaggio è stato applicato in locale, provato (seme 7 dà almeno un boss misto su 6 città × 5 POI, target 24), poi tolto con `git checkout` del solo servizio prima del commit RED e riapplicato identico per il GREEN.

## Spec riscritte (motivo: tiro nuovo in coda e `minTitle` abbassato)

`src/quests/generation/quest-generator.int-spec.ts`:
- `serves the least covered rank across the world (D-15)` e `serves another rank when the least covered one cannot be composed on the poi (D-15)`: il rango della quest creata si legge con `coverageRankOf` invece che da `minTitle` (un boss misto abbassa `minTitle`).
- `rotates the five ranks and never generates a legend quest (D-02)`: conteggio per rango su `coverageRankOf`; il controllo dei posti `title === minTitle` sostituito da `seatViolationsOf` (invariante nuova).
- `keeps every generated enemy quest on one seat within the budget (D-03, D-09)`: rango del boss = `coverageRankOf` (titolo più alto dei posti).
- `offers on a generated quest the pet linked to one of its enemies (D-28)`, `offers a zone pet when the roll falls in the second band (D-28)`, `offers no pet while the pets have no rarity (D-28)`: col fallback 0.05 / 0.12 il cancello del misto è aperto; asseriscono in più l'invariante `seatViolationsOf` (le asserzioni sul pet restano sul campo di oggi, uguale al blocco del rango). Nessun valore pinnato spostato.

`test/quests/generation-world.ts` › `seatViolationsOf`: boss valido con una voce (`title === minTitle`, `count ≥ 2`) o con due voci `[rango, inferiore]` (inferiore = titolo immediatamente sotto, `minTitle` = inferiore, `count` del rango ≥ `count` dell'inferiore ≥ 1), totale 2–6, nessun titolo null; l'ordine dei titoli è scritto nell'helper, indipendente dal codice. Enemy invariata.

`quest-generation.resolver.int-spec.ts` e le due e2e (`quest-generation.e2e.int-spec.ts`, `quest-generation-access.e2e.int-spec.ts`): verdi senza modifiche, nessun valore pinnato spostato dal tiro nuovo. `quest-generator.service.spec.ts` non pinna la proiezione della lettura del mondo: invariato.

## Tiri spostati

Nessuno per le enemy (istantanea a seme 7 identica su un mondo senza candidati boss). Le corse con boss consumano da 1 a 1 + 1 + (tiri di `prizesOf` del rango inferiore) tiri in più dopo l'annuncio di ogni boss: le quest successive della stessa corsa cambiano, nessuna spec ne pinnava i valori.

## Deviations from Plan

None - plan executed exactly as written.

## Verifiche

- Unit `src/quests/generation`: 15 suite / 148; unit `src/quests`: 71 suite / 1206.
- Integration `src/quests/generation` + le due e2e della generazione: 5 suite / 50.
- `npx tsc --noEmit -p tsconfig.json` 0; `src/schema.gql` invariato; eslint e prettier puliti sui file toccati.
- Grep di accettazione: 4 export in `generation-rules.ts`; 1 `mixedBossDraftOf`; `D-23)` ×3 in `generation-rules.spec.ts`; `D-05a)` ×1 nella spec del draft; `mixedSeatsOf(` e `coverageRankOf(` ×1 nel servizio; i tre titoli dei casi nuovi ×1 nell'int-spec.

## Self-Check: PASSED

- FOUND: 641cce6d, 9f7006d4, d6023674, 49d843c5
