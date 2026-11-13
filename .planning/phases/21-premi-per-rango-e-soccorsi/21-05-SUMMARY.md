---
phase: 21-premi-per-rango-e-soccorsi
plan: 05
subsystem: quests
tags: [quests, aid, outcomes, tdd]
requires:
  - 21-04
provides:
  - AID_OPENING_TYPES e opensAid(type) in src/quests/outcomes/aid/aid-opening.ts (enemy, boss, hunt, dungeon, aid)
  - planDefeatWithoutAid(input) in src/quests/outcomes/defeat-without-aid.ts (vita 1, corsia standard libera, nessun premio né aid, outcome failure, guardEncounter false)
  - ONE_LIFE_POINT_CONCLUSION esportata da guard-outcome.ts, condivisa con planGuardDefeat
  - planCombatant restituisce aid null e il piano senza soccorso per le sconfitte dei tipi che non aprono aid
  - clonedPrizesOf copia prizes.rankPrizes campo per campo con cure null
affects: [21-06, 21-08, 21-09, 21-10, 21-12]
tech-stack:
  added: []
  patterns:
    - conclusione condivisa (Omit<UnrewardedConclusion, 'result'>) fra scontro di guardia perso e sconfitta senza soccorso
key-files:
  created:
    - src/quests/outcomes/aid/aid-opening.ts
    - src/quests/outcomes/aid/aid-opening.spec.ts
    - src/quests/outcomes/defeat-without-aid.ts
    - src/quests/outcomes/defeat-without-aid.spec.ts
  modified:
    - src/quests/outcomes/guard/guard-outcome.ts
    - src/quests/outcomes/combatant-plan.ts
    - src/quests/outcomes/combatant-plan.spec.ts
    - src/quests/outcomes/conclusion/conclusion-plan.ts
    - src/quests/outcomes/aid/aid-quest.ts
    - src/quests/outcomes/aid/aid-quest.spec.ts
    - src/quests/outcomes/quest-combat.int-spec.ts
    - src/quests/outcomes/crime-guard-conclusion.int-spec.ts
    - src/quests/outcomes/boss-resolution.int-spec.ts
decisions:
  - "La conclusione «vita a 1, nessuna moneta, nessun campo in più» è una costante esportata da guard-outcome.ts (ONE_LIFE_POINT_CONCLUSION): planGuardDefeat e planDefeatWithoutAid differiscono solo per guardEncounter"
  - "Il ramo senza soccorso di planCombatant non tira nulla (nessun premio sulla sconfitta): l'ordine dei tiri a seme fisso resta invariato"
  - "clonedPrizesOf scarta le voci non oggetto di rankPrizes e mette la chiave solo se resta almeno un blocco; pet del blocco normalizzato con refIdOf come il pet di oggi"
metrics:
  duration: ~12 min
  completed: 2026-11-13
---

# Phase 21 Plan 05: aid per tipo, sconfitta senza aid e clone dei blocchi Summary

Solo le sconfitte di `enemy`, `boss`, `hunt`, `dungeon` e `aid` aprono un soccorso (`opensAid`); una `heal`, `job`, `study`, `magic`, `crime` o `guard` persa in combattimento chiude come lo scontro di guardia perso (vita 1, corsia libera, ferite e consumi tenuti, nessun premio né aid, `outcome` failure) tramite `planDefeatWithoutAid`; l'aid di una quest di gruppo clona i blocchi per titolo senza cura.

## Commit

| Task | Commit | Messaggio |
|------|--------|-----------|
| 1 RED | 7fca3dd6 | test(quests): pin which defeats open an aid |
| 1 GREEN | 87041e8e | feat(quests): open an aid only for the rescue quest types |
| 2 RED | 1cfd586e | test(aid): pin the rank blocks on the aid and the defeats without aid |
| 2 GREEN | 17669288 | feat(aid): clone the rank blocks onto the aid |
| 3 | (questo commit) | docs(phase-21): record plan 05 progress |

## Fallimenti RED attesi

- Task 1: `aid-opening.spec.ts` e `defeat-without-aid.spec.ts` con `Cannot find module`; `combatant-plan.spec.ts` 6 rossi (`concludes a lost job without aid at one life point (D-19)` per heal, job, study, magic, crime, guard: `aid` non nullo). Verdi al primo colpo, perché pinnano il comportamento di oggi: `opens an aid for a lost hunt (D-09)` e `keeps the aid of a lost boss and of a lost aid (D-09, D-10)`.
- Task 2: `aid-quest.spec.ts` 1 rosso (`clones the rank blocks of a group quest without their cure (D-11)`); `boss-resolution.int-spec.ts` 1 rosso (`opens an aid with the seats and the rank blocks of a lost boss (D-09, D-11)`, `rankPrizes` assente sull'aid). Verdi al primo colpo: `keeps the single prize on the aid of a solo quest (D-11)` (comportamento di oggi) e i due casi D-19 in integrazione (`creates no aid for a lost job and leaves one life point (D-19)`, `leaves a lost crime fight at one life point without aid and never arrests (D-19, D-09b)`), perché il GREEN del Task 1 era già committato: il piano li voleva rossi nel RED del Task 2, ma l'ordine dei task li rende prove di integrazione del Task 1.

## Spec di comportamento cambiate per D-19

- `crime-guard-conclusion.int-spec.ts`: «opens the usual aid after a lost crime fight and never arrests» → `leaves a lost crime fight at one life point without aid and never arrests (D-19, D-09b)`; ora pinna vita 1, `awaitingAid` assente, corsia libera, 0 aid a DB, `arrested` false, `guardEncounter` false. Cambio voluto da D-19 (la crime persa in combattimento vale come lo scontro di guardia perso), non una regressione.
- Stesso file: il caso dell'arresto rinominato `keeps the crime arrest as it is: ten hours of prison, a quarter of the coins lost, no prize (D-09b)`, asserzioni invariate.
- `quest-combat.int-spec.ts`: «creates an aid for a lost hunt too» → `… (D-09)`, asserzioni invariate.

## Verifica

- Unit `src/quests/outcomes`: 37 suite / 704 test.
- Integration del piano: quest-combat, crime-guard-conclusion, boss-resolution, aid-rescue, aid-timeout → 5 suite / 79 test (aid-rescue e aid-timeout verdi senza modifiche: D-10 invariata).
- Non regressione extra: quest-dungeon, processor, service, sweeper della risoluzione, quest-generation-trigger, ambush-resolution, study-spell-draw, study-lore-draw, gm-completion, quest-pet-prize, party-timeout → 11 suite / 142 test, nessuna modifica.
- `npx tsc --noEmit -p tsconfig.json` 0; `src/schema.gql` invariato; prettier e eslint puliti sui file toccati; `pgrep -fl 'bin/jest'` vuoto a fine di ogni task.
- Grep di accettazione: `export function opensAid` 1; `planDefeatWithoutAid(` in combatant-plan 1; `rankPrizes` in aid-quest.ts 4; `D-11)` in aid-quest.spec 2; `D-19` in crime-guard 1; `D-19)` in quest-combat 1; `D-11)` in boss-resolution 1; «opens the usual aid after a lost crime fight» 0; righe 21-05 della VALIDATION 3.

## Deviations from Plan

- **[Boy Scout] Commento di `planConclusion` aggiornato** (`src/quests/outcomes/conclusion/conclusion-plan.ts`, fuori da `files_modified`): diceva che una sconfitta resta «con la aid»; ora dice che passa da `planCombatant`, senza aid per crime e guard (D-19). Solo commento, commit 87041e8e.
- Casi in più rispetto al `<behavior>`: `opens no aid without a quest type (D-09)` (null/undefined, separato dall'`it.each` sui tipi); nel caso D-19 di combatant-plan anche `guardEncounter` false.
- Il ramo legge `quest.infos?.type` (con `?.`) perché `ResolutionQuest.infos` è opzionale nel tipo.

## Threat Flags

Nessuna superficie nuova oltre al threat model (T-21-14: piano dedicato al posto dell'eccezione di `planParticipant`, vita clampata a 1; T-21-15: ogni blocco clonato con `cure: null`, casi `D-11)`; T-21-16: `rankPrizes` sull'aid solo se l'originale ne ha, caso della hunt con `Object.keys`).

## Known Stubs

Nessuno.

## Self-Check: PASSED
