---
phase: 22-completamento-guidato-missioni
plan: 15
subsystem: quests
tags: [guided-mission, draft, graphql, authz]
requires: ["22-14"]
provides:
  - "MissionFightInput, MissionPrizeItemInput, MissionPrizeInput, SaveMissionDraftInput, MAX_PRIZE_ITEMS = 500 (mission-draft.inputs.ts)"
  - "MissionDraftSaveService.save(input): Promise<MissionDraftRecord> (mission-draft-save.service.ts)"
  - "enemiesWithinCaps(enemies) esportata da mission-simulation.service.ts"
  - "mutation saveMissionDraft(input: SaveMissionDraftInput!): MissionDraft!"
affects: [22-16, 22-17, 22-18]
tech-stack:
  added: []
  patterns: ["correzioni validate con validateOverrides sullo stato sovrapposto all'inizio dello scontro", "premi rivalidati con la stessa allowanceFor delle opzioni"]
key-files:
  created:
    - src/quests/guided/mission-draft-save.service.ts
    - src/quests/guided/mission-draft-save.service.int-spec.ts
  modified:
    - src/quests/guided/mission-draft.inputs.ts
    - src/quests/guided/mission-simulation.service.ts
    - src/quests/guided/guided-mission.module.ts
    - src/quests/guided/guided-mission.resolver.ts
    - src/quests/guided/guided-mission.resolver.int-spec.ts
    - test/app.int-spec.ts
    - test/authz/expected-handlers.ts
    - test/authz/handler-fixtures.ts
    - test/authz/authorization-matrix.int-spec.ts
    - src/schema.gql
decisions:
  - "Sezioni assenti o null = invariate (anche step e place); last-write-wins con un solo `$set` per salvataggio"
  - "Correzioni applicate per indice crescente sulla lista già riconciliata: correggere k (con effetto diverso) azzera i successivi, quindi correzioni di k+1 nello stesso salvataggio vengono rifiutate"
  - "Confronto delle correzioni per valore con la forma esadecimale di participantEffectsOf: la stessa correzione ripetuta non azzera nulla a valle"
  - "Premi: itemType ricavato dall'appartenenza a equipmentIds / lootIds dell'allowance; id assente da entrambe → OUTCOME_OVERRIDE_INVALID; voci doppie dello stesso oggetto rifiutate"
  - "Premi fusi per personaggio nell'ordine salvato; un personaggio della bozza senza premio salvato va in coda"
  - "Tetti degli scontri rivalidati nel dominio con enemiesWithinCaps (esportata dalla simulazione invece di duplicarla)"
metrics:
  duration: "~35 min"
  completed: 2026-11-14
  tasks: 4
  files: 12
---

# Phase 22 Plan 15: Salvataggio della bozza Summary

`saveMissionDraft` salva passo, luogo, scontri, correzioni e premi della bozza guidata; il BE riconcilia gli scontri (D-24), valida le correzioni con `validateOverrides` sullo stato all'inizio di ogni scontro più il vincolo delle ferite di prima (D-14) e rivalida ogni premio con la stessa regola delle opzioni (D-07, D-15, D-22).

## Semantica finale delle sezioni

- `step`: sostituito. `place`: POI esistente o `NOT_FOUND`.
- `fights`: lista sostituita; tetti in dominio (≤ 10 scontri, 1..10 voci, quantità 1..20 → `OUTCOME_OVERRIDE_INVALID`); nemici inesistenti → `NOT_FOUND`; `reconcileFights` tiene il prefisso identico, il resto torna da simulare; zero scontri ammessi.
- `corrections` di uno scontro: `null`/assente = invariate; scontro non simulato → `OUTCOME_OVERRIDE_INVALID`; elencati → effetto validato, non elencati → `corrected: null`; personaggio fuori dalla bozza → `OUTCOME_NOT_PARTICIPANT`; ferita già in `injuriesBefore` → `OUTCOME_OVERRIDE_INVALID`; effetto diverso dal precedente → `resetFrom(k + 1)`.
- `prizes`: ogni voce sostituisce il premio di quel personaggio; personaggio fuori dalla bozza → `OUTCOME_NOT_PARTICIPANT`, doppio → `OUTCOME_OVERRIDE_INVALID`; monete e xp interi ≥ 0 liberi; quantità 1..99, voci ≤ 500, un oggetto una volta sola; oggetti/pet/magie fuori dall'allowance → `OUTCOME_OVERRIDE_INVALID`; `cure: true` = cura del blocco del titolo (`cureOf`), assente → `OUTCOME_OVERRIDE_INVALID`.

## Commit

| Task | Commit | Messaggio |
|------|--------|-----------|
| 1 RED | 67945361 | test(gm): pin the guided draft save of fights and corrections |
| 1 GREEN | 38078e2f | feat(gm): save and validate guided fights and corrections |
| 2 RED | fc16102d | test(gm): pin the guided draft save of prizes |
| 2 GREEN | 8befef26 | feat(gm): save and revalidate the guided prizes |
| 3 RED | 80d28c09 | test(gm): pin the guided mission draft save on the wire |
| 3 GREEN | 2ac0cf6c | feat(gm): expose the guided mission draft save |

RED attesi: task 1 suite intera rossa per il modulo `./mission-draft-save.service` assente; task 2 cinque casi rossi (premi ignorati: promesse risolte invece che rifiutate, xp 700 invece di 10); task 3 `handler-fixtures.spec.ts` 2 rossi (documento non valido contro lo SDL) e i 3 casi del resolver rossi (mutation assente).

**Verdi al primo colpo:** nel task 2 `saves unchanged a prefilled block with more than 50 distinct items (D-22)` passava già in RED perché la sezione `prizes` veniva ignorata e il premio restava quello precompilato: resta come guardia contro un tetto di 50 sui premi.

## Esiti

- `mission-draft-save.service.int-spec.ts` 19/19; unit `src/quests/guided` + `handler-fixtures.spec.ts` 52/52; integration app.int-spec + matrice + resolver 245/245; bozza + simulazione + salvataggio 39/39; `tsc` 0.
- `src/schema.gql`: +29 righe (quattro input e la riga di `Mutation`), 0 tolte rispetto a `c6079ca3`.

## Deviazioni dal piano

1. **[Rule 2 - Correttezza] tetti degli scontri in dominio** — `withinCaps` della simulazione rinominata ed esportata come `enemiesWithinCaps` (file fuori da `files_modified`) e riusata dal salvataggio per la difesa in profondità di D-31. Commit 38078e2f.
2. **[Rule 1] matrice 16 → 17 righe HTTP** — `test/authz/authorization-matrix.int-spec.ts` aggiornata nel commit RED del task 3 (80d28c09) invece che in un commit dedicato `test(authz)`.
3. **Caso in più** `refuses coins and xp that are not whole numbers from zero up (D-15)` (aggiunto nel GREEN del task 2): il grep `D-15)` ≥ 2 non poteva passare coi titoli del piano (`(D-15, D-22)` non termina in `D-15)`); xp −1 spostato lì dal caso della cura.
4. Casi in più nel task 1: `refuses an unknown enemy (D-24)`; nel task 2 il caso della cura prova anche la cura ammessa del paladin e la voce doppia dello stesso oggetto.

Nessuna spec fuori piano diventata rossa.

## Known Stubs

Nessuno.

## Threat Flags

Nessuna superficie nuova oltre al registro del piano (T-22-36..38 mitigate e coperte dai casi).

## Self-Check: PASSED
