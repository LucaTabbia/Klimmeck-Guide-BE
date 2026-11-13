---
phase: 21-premi-per-rango-e-soccorsi
plan: 11
subsystem: aid
tags: [aid, dungeon, rewards, rescue-share, tdd]
requires:
  - 21-10
provides:
  - rescueShareOf(turn), proportionalPrizesOf(prizes, share), interface AidPrizes in src/quests/outcomes/aid/rescue-share.ts
  - buildAidQuest che scrive la quota sull'aid alla nascita (rapporto delle quote per una sorgente già scalata)
  - rollLoot(candidates, chance, share = 1) e drawRewards(prizes, catalog, chance, share = 1)
  - isNonNegativeInteger esportata da src/quests/outcomes/rewards/quest-rewards.ts
affects: [21-12, 21-13, 21-14]
tech-stack:
  added: []
  patterns:
    - quota come numero passato per ultimo (default 1), mai un flag; la quota moltiplica le soglie, i tiri restano gli stessi
key-files:
  created:
    - src/quests/outcomes/aid/rescue-share.ts
    - src/quests/outcomes/aid/rescue-share.spec.ts
  modified:
    - src/quests/outcomes/aid/aid-quest.ts
    - src/quests/outcomes/aid/aid-quest.spec.ts
    - src/quests/outcomes/rewards/cascading-loot.ts
    - src/quests/outcomes/rewards/cascading-loot.spec.ts
    - src/quests/outcomes/rewards/quest-rewards.ts
    - src/quests/outcomes/rewards/quest-rewards.spec.ts
    - src/quests/outcomes/combatant-plan.ts
    - src/quests/outcomes/combatant-plan.spec.ts
    - src/quests/outcomes/dungeon-aid.int-spec.ts
decisions:
  - "Quota = (index + 1) / total del turno salvato; senza turno 1 (D-14, D-20)"
  - "Monete, xp e quantità del prizeItem scritte per difetto sull'aid alla nascita; prizeItem a 0 → null; randomLoot, pet e magia invariati; i blocchi per titolo scalati con la stessa regola"
  - "Arrotondamento per difetto con un epsilon di 1e-9 contro l'errore di rappresentazione delle quote non binarie (5/6 × 6)"
  - "Quota ≥ 1 → premi restituiti invariati (nessuna normalizzazione delle monete, tetto contro un turno gonfiato)"
  - "Catena (I3): quota della nuova aid = rescueShareOf(turno nuovo) / rescueShareOf(turno della sorgente); sorgente originale → denominatore 1"
  - "Alla risoluzione la soglia di ogni rarità e quella del pet sono moltiplicate per rescueShareOf(rescueTurnOf(quest.rescue?.turn)): stessi tiri"
metrics:
  duration: ~35 min
  completed: 2026-11-13
---

# Phase 21 Plan 11: premio proporzionale del soccorritore dell'aid di dungeon Summary

Il soccorritore di un'aid di dungeon riceve la quota dei turni completati: monete, xp e quantità dell'oggetto fisso sono già scritte in proporzione sul foglio dell'aid alla nascita, mentre le soglie di loot e pet sono scalate alla risoluzione con gli stessi tiri (D-14, D-20, D-30).

## Cosa è stato fatto

- **Task 1:** modulo puro `src/quests/outcomes/aid/rescue-share.ts`:
  - `rescueShareOf(turn: RescueTurn | null): number`, `null` → 1;
  - `proportionalPrizesOf(prizes: AidPrizes, share: number): AidPrizes`, costruito campo per campo, mai lo spread di un documento idratato. Monete in rame `floor(toCopper × share)` riconvertite con `fromCopper`, xp e quantità con `Math.floor`. Le voci assenti o malformate restano com'erano; con `share >= 1` i premi tornano invariati.
  - `buildAidQuest` applica la quota solo con un turno: `rescueShareOf(turn) / rescueShareOf(rescueTurnOf(original.rescue?.turn))`. `AidSourceQuest.rescue` guadagna `turn?: unknown`; `AidQuestDraft.prizes` è ora `AidPrizes`, stessa forma di prima.
  - `rollLoot` e `drawRewards` prendono `share = 1` come ultimo parametro: le soglie `DROP_RATES[r] × share` e `QUEST_PET_WIN_CHANCE × share` cambiano, ma nessun tiro si sposta.
- **Task 2:** `planCombatant` passa `rescueShareOf(rescueTurnOf(quest.rescue?.turn))` a `drawRewards`. Fuori dall'aid di dungeon la quota vale 1 e il risultato è identico a oggi.

## Quote provate

- Unit: `{4, exploration, 8}` → 0.625; `{3, fight, 8}` → 0.5; `{7, fight, 8}` → 1; `null` → 1.
- Premio `1 oro 3 argento 7 rame` (10307 rame), xp 101, 3 oggetti, con quota 0.5 → 5153 rame (`0/51/53`), xp 50, 1 oggetto. Un oggetto con quantità 1 e quota 0.625 → `null`.
- Catena dallo stesso originale (`1 oro 1 rame`, xp 101): turno 3 → xp 50 e `0/50/0`; turno 1 → xp 25 e `0/25/0` (2/8 dell'originale). Sorgente già scalata (xp 50 con turno 3) e turno nuovo 1 → xp 25, non 12.
- Integrazione (dungeon da 4 gruppi, premio `1 oro 1 rame` = 10001 rame, xp 80, 3 pozioni):
  - persa al 5° turno (indice 4, esplorazione) → aid a DB con `0/62/50` (6250 rame), xp 50, 1 pozione; il soccorritore percorre 5 turni (`lastTurnIndex` 4), vince, salva il ferito e riceve quelle monete e quella pozione, con xp 50 + 20 + 2×5 = 80;
  - persa al 4° turno (indice 3, scontro) → `0/50/0`, xp 40, 1 pozione; xp del soccorritore 40 + 30 = 70.
- Loot: una fiala rara (soglia 0.15) con tiri tutti a 0.1 esce sull'aid con quota 8/8 (persa al turno 7) e non esce su quella con quota 4/8 (soglia 0.075). Le sequenze dei tiri consumati sono identiche.
- Pet (unit su `planCombatant`): con tiro 0.15, nessun pet sull'aid col turno `{3, fight, 8}` (soglia 0.1), pet sulla stessa aid senza turno; stessi tiri.

## Fallimenti RED attesi

- Task 1: 5 rossi e una suite che non compilava. `rescue-share.ts` non esisteva; `rollLoot` e il pet ignoravano la quota; `buildAidQuest` non scalava (tre casi). Due casi erano verdi al RED perché pinnano il comportamento di oggi: `draws as today without a share (D-14)` e `keeps the full prize on an aid without a turn (D-14)`.
- Task 2: 2 rossi, il pet in `combatant-plan.spec.ts` e la fiala rara nella int-spec. **Verdi al primo colpo:** i due casi del criterio 4 (`fifth turn` e `fourth turn`). Monete, xp e oggetto fisso arrivano già scalati dal Task 1, che scrive la quota sull'aid alla nascita; senza loot né pet a catalogo la risoluzione non tira nulla che dipenda dalla quota.

## Verifica

- `npx jest src/quests/outcomes --selectProjects unit`: 39 suite e 742 test verdi.
- `npx jest src/quests/outcomes/dungeon-aid.int-spec.ts src/quests/outcomes/aid-rescue.int-spec.ts src/quests/outcomes/boss-resolution.int-spec.ts src/quests/outcomes/quest-pet-prize.int-spec.ts --selectProjects integration --runInBand`: 4 suite e 58 test verdi.
- Non regressione sulle int-spec aid-timeout, crime-guard-conclusion, gm-completion.service, quest-combat, quest-dungeon, quest-resolution.service, study-lore-draw e study-spell-draw: 8 suite e 117 test verdi.
- `npx tsc --noEmit -p tsconfig.json` esce 0. `src/schema.gql` è invariato. Prettier ed eslint sono puliti sui file toccati.
- Criterio 4 della ROADMAP verificato: il testo era già corretto secondo D-30 (5° turno esplorazione, 4° scontro).

## Deviations from Plan

- `proportionalPrizesOf` non è generica (`<P extends AidPrizes>` del contratto): prende e restituisce `AidPrizes`, l'unica forma che la chiama. Costruire un `P` generico campo per campo avrebbe richiesto un cast.
- `isNonNegativeInteger` di `quest-rewards.ts` è ora esportata e riusata dalla quota, senza duplicarla (Boy Scout).
- `dungeonAidWorld` della int-spec accetta opzioni `{ failingTurn, prizes, enemies }`, con default identici al piano 10.
- Nessuna spec fuori dal piano corretta.

## Note per l'handoff

- Calcolando il rapporto sull'aid già scalata invece che sull'originale, l'arrotondamento per difetto può togliere al massimo 1 rame o 1 xp in più rispetto al calcolo diretto (I3).

## Commits

- c1bf6b20 test(aid): pin the proportional prize of a dungeon aid
- e366203e feat(aid): share the dungeon aid prize by the completed turns
- ca882bb5 test(dungeon): pin the shared prize of the dungeon aid rescuer
- d2ddbb71 feat(dungeon): apply the rescue share to the dungeon aid draws

## Self-Check: PASSED
