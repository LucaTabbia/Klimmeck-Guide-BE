---
phase: 21-premi-per-rango-e-soccorsi
plan: 10
subsystem: dungeon
tags: [dungeon, aid, rescue, turns, tdd]
requires:
  - 21-09
provides:
  - facedEnemyCountOf(turn), fallenCountersOf(turn), nextRescueTurnOf(resolution, saved) in src/quests/outcomes/dungeon/dungeon-turns.ts
  - DeathResultInput.turn?: RescueTurn | null (esito death coi contatori della caduta)
  - RescueResolutionService con DungeonResolver iniettato e percorso del soccorritore fino al turno salvato
  - src/quests/outcomes/dungeon-aid.int-spec.ts (harness dell'aid di dungeon, base per il piano 11)
affects: [21-11, 21-12]
tech-stack:
  added: []
  patterns:
    - battaglia del soccorso astratta in RescueBattle { battleOf(id), nextTurn }: un ramo per l'aid di dungeon (porta della dungeon) e uno per le altre (combattimento unico)
key-files:
  created:
    - src/quests/outcomes/dungeon-aid.int-spec.ts
  modified:
    - src/quests/outcomes/dungeon/dungeon-turns.ts
    - src/quests/outcomes/dungeon/dungeon-turns.spec.ts
    - src/quests/outcomes/rescue-plan.ts
    - src/quests/outcomes/rescue-plan.spec.ts
    - src/quests/outcomes/rescue-resolution.service.ts
decisions:
  - "L'aid di dungeon si riconosce solo da rescueTurnOf(aid.rescue?.turn) !== null (Pitfall 6), mai dal tipo"
  - "Xp dei nemici e conoscenze del soccorritore dalle sole voci enemies di indice < facedEnemyCountOf(turn) = floor((index + 1) / 2): default tecnico della ricerca"
  - "La nuova aid di un soccorso perso clona sempre l'originale e salva failedTurn col total del turno salvato (nextRescueTurnOf)"
  - "L'esito death del ferito porta i contatori del turno salvato (fallenCountersOf) sia nel soccorso perso sia nel timeout: stesso deathResultOf"
  - "unchangedResult riceve i contatori come parametro (non un flag): planRescued passa NO_TURN_COUNTERS"
metrics:
  duration: ~30 min
  completed: 2026-11-13
---

# Phase 21 Plan 10: il soccorritore percorre i turni dell'aid di dungeon Summary

Un'aid con `rescue.turn` passa ora dalla stessa porta della dungeon (`DungeonResolver.explore` con `lastTurnIndex = rescue.turn.index`): il soccorritore percorre i turni fino a quello salvato e lo deve completare; se cade, la regola dell'aid persa resta invariata e la nuova aid salva il turno della caduta (D-10, D-12, D-13, D-15, D-21, D-26).

## Cosa è stato fatto

- **Task 1 (D-12, D-21, D-26):** tre helper puri in `dungeon-turns.ts` — `facedEnemyCountOf` (0→0, 1→1, 3→2, 4→2, 7→4), `fallenCountersOf` (`{ total, index, index + 1, kind }`), `nextRescueTurnOf` (`failedTurn` col `total` del salvato, `null` senza caduta). `DeathResultInput.turn?`: con turno i quattro campi da `fallenCountersOf`, altrimenti `NO_TURN_COUNTERS`; `planRescued` passa esplicitamente `NO_TURN_COUNTERS`.
- **Task 2:** `RescueResolutionService` inietta `DungeonResolver` (provider già nel modulo). `fightRescuers` legge `rescueTurnOf(aid.rescue?.turn)` e delega a `rescueBattleOf`: senza contesto di combattimento nessuna battaglia; senza turno `combat.resolve` come oggi (stessi tiri); col turno `dungeon.explore({ ...buildDungeonContext(...), lastTurnIndex })` e `dungeonBattleOf` per posto. Il catalogo passato a `planCombatant` ha `enemies` tagliate a `facedEnemyCountOf(turn)`. `settleWounded` passa `nextTurn` come quarto argomento di `buildAidQuest(context.original ?? context.loaded.quest, …)`. `dieWithin` passa `turn: rescueTurnOf(aid.rescue?.turn)` (vale per il soccorso perso e per `timeoutAid`). Nessun tiro nuovo.

Matrice verificata in integrazione (dungeon da 4 gruppi, turno salvato `{ 4, exploration, 8 }`):
- soccorritore che vince → 8 / 5 / 5 / exploration, `stagesCleared 2`, `stagesTotal 4`;
- soccorritore che cade al turno 1 (scontro) → 8 / 1 / 2 / fight, nuova aid con `rescue.turn { 1, fight, 8 }`, clonata dall'originale;
- ferito `rescued` → quattro `null`; ferito `death` (soccorso perso e timeout) → 8 / 4 / 5 / exploration.

## Come è nata l'aid di dungeon nella spec

Da una vera dungeon da 4 gruppi risolta da `QuestResolutionService` con la porta di test `TurnFailingDungeonResolver(placeholder, [4])` (caduta in esplorazione al turno 4): l'aid a DB ha `rescue.turn { 4, exploration, 8 }`. Poi porta e combattimento scriptato si azzerano e il soccorritore si registra sull'aid con `persistQuester({ quest: { _id } })`. La porta `DungeonResolver` è un `SwappableDungeonResolver` locale (come nel piano 09) che in più registra i contesti ricevuti, per provare `lastTurnIndex = 4`. Il soccorso perso usa il segnaposto reale con `scripted.willEnd('failure')`: cade al primo scontro (turno 1), un solo contesto di combattimento.

## Prove di D-12 e D-15 scelte

- **D-12 (salvato libero, può rifare la dungeon):** dopo il soccorso il ferito non ha `awaitingAid`, la corsia standard è libera, la dungeon non ha `concludedAt` e `classifyEligibility` (con `registrationRuleOf`) sui documenti a DB non restituisce rifiuti.
- **D-15 (dungeon aperta agli altri):** con l'aid aperta, aid e dungeon senza `concludedAt` e `classifyEligibility` della dungeon per un secondo personaggio nuovo non restituisce rifiuti.
- Il timeout dell'aid si prova spostando a DB `status.awaitingAid.since` di sette giorni invece di avanzare il `FixedClock` (l'orologio è condiviso dai casi dello stesso file e non si può riportare indietro).

## Fallimenti RED attesi

- Task 1: 4 rossi — i tre helper non esistevano (`is not a function`), `deathResultOf` col turno scriveva quattro `null`. Verdi al RED (comportamento di oggi, pinnato): `leaves the turns null on a death outside a dungeon aid (D-21)` e `leaves the turns null on a rescued wounded (D-21)`.
- Task 2: 5 rossi — nessuna chiamata alla porta della dungeon (`[]` invece di `[4]`), contatori del soccorritore e del ferito morto `null`, `enemies` del soccorritore con tutte e quattro le voci. Verdi al RED (comportamento esistente pinnato): D-12 salvato libero, D-15 dungeon aperta, D-13 aid senza turno sul combattimento unico.

## Verifica

- `npx jest src/quests/outcomes --selectProjects unit`: 38 suite / 725 test verdi.
- `npx jest src/quests/outcomes/dungeon-aid.int-spec.ts src/quests/outcomes/aid-rescue.int-spec.ts src/quests/outcomes/aid-timeout.int-spec.ts src/quests/outcomes/quest-dungeon.int-spec.ts --selectProjects integration --runInBand`: 4 suite / 50 test verdi.
- Non regressione: boss-resolution, quest-combat, quest-resolution.processor, quest-resolution.sweeper int-spec: 4 suite / 54 test verdi.
- `npx tsc --noEmit -p tsconfig.json` 0; `src/schema.gql` invariato; prettier ed eslint puliti sui file toccati.

## Deviations from Plan

Nessuna sul codice di produzione. Nella spec: i fogli del ferito si leggono filtrando per `quest.id` dell'aid (il ferito ha anche il foglio della dungeon persa) e il timeout sposta `since` a DB invece del `FixedClock` (motivo sopra). Nessuna spec fuori piano corretta.

## Commits

- 366388bd test(dungeon): pin the rescue turn helpers and the death counters
- 4f414832 feat(dungeon): add the rescue turn helpers and the death counters
- 41615abb test(dungeon): pin the rescuer path through a dungeon aid
- 6254fe17 feat(dungeon): walk the rescuers through the saved dungeon turns

## Self-Check: PASSED
