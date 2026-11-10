---
phase: 18-quest-heal-per-taglia
plan: 09
subsystem: quests
tags: [quests, acceptance, heal, game-rules, tdd]
requires: ["18-08", "18-06", "18-01"]
provides:
  - "predicato puro unico healHasNoEffect(character, cure) in src/quests/outcomes/injuries/heal-no-effect.ts (D-25)"
  - "codice GameRuleErrorCode.QUEST_NO_EFFECT e factory GameRuleException.questNoEffect()"
  - "acceptQuest di una heal senza effetto rifiutata con QUEST_NO_EFFECT prima di ogni scrittura"
affects: [18-10, 18-11]
tech-stack:
  added: []
  patterns: ["pre-letture lean → regole pure → una transazione: il rifiuto nuovo sta fra eleggibilità e città, quindi non scrive nulla"]
key-files:
  created:
    - src/quests/outcomes/injuries/heal-no-effect.ts
    - src/quests/outcomes/injuries/heal-no-effect.spec.ts
  modified:
    - src/gameRules/game-rule-error-code.enum.ts
    - src/gameRules/game-rule.exception.ts
    - src/gameRules/game-rule.exception.spec.ts
    - src/quests/acceptance/quest-acceptance.service.ts
    - src/quests/acceptance/quest-acceptance.service.int-spec.ts
    - src/quests/acceptance/accept-quest.resolver.int-spec.ts
decisions:
  - "Il predicato non conosce il tipo della quest: il filtro sul tipo heal sta nel chiamante (effectiveOrReject), come farà il campo Quest.noEffect del 18-10"
  - "Vita e massimo letti con statusFactsOf (legacy senza maxLifePoints → tabella per xp), ferite grezze passate al predicato che le filtra con isInjuryType"
  - "Nessun controllo nel callback della transazione: la corsa con una pozione bevuta dopo la pre-lettura resta accettata (T-18-43 accept)"
  - "STATE.md registra `Plan: 9 of 11` (formato del brief), non `Plan: 09 of 11` del verify del piano"
metrics:
  duration: "~30 min"
  completed: 2026-11-10
  tasks: 3
  files: 8
---

# Phase 18 Plan 09: heal senza effetto, la regola — Summary

Il backend giudica la heal inutile: `healHasNoEffect` è una funzione pura (tetto `Math.round(max × share)` come D-02, sanificazione con `cureOf` come D-23, ferite curabili con `cureInjuries`), `QUEST_NO_EFFECT` è un codice stabile sul filo e `acceptQuest` di una quest di tipo `heal` senza effetto per il personaggio la rifiuta dopo l'eleggibilità e prima di città, movimento, fame e transazione, senza scrivere nulla.

## Cosa è stato costruito

- `src/quests/outcomes/injuries/heal-no-effect.ts`: `export interface HealSubject { currentLifePoints: number; maxLifePoints: number; injuries: readonly unknown[] }` e `export function healHasNoEffect(character: HealSubject, cure: unknown): boolean` (firma spezzata da Prettier su più righe). `cureOf(cure) === null` → `true`; altrimenti vita ≥ tetto E nessuna ferita guarita da `cureInjuries(injuries.filter(isInjuryType), canHeal)`.
- `src/gameRules/game-rule-error-code.enum.ts`: `QUEST_NO_EFFECT = 'QUEST_NO_EFFECT'` in coda.
- `src/gameRules/game-rule.exception.ts`: `static questNoEffect(): GameRuleException` in coda → messaggio 'Queste cure non ti servirebbero adesso', extensions `{ code: 'QUEST_NO_EFFECT' }`.
- `src/quests/acceptance/quest-acceptance.service.ts`: `QUEST_PROJECTION` con `'prizes.cure': 1`; `CHARACTER_PROJECTION` con `'status.currentLifePoints': 1`, `'status.maxLifePoints': 1`, `'status.xp': 1`; `QuestAcceptanceSnapshot.prizes?: { cure?: unknown } | null`; `CharacterAcceptanceSnapshot.status` con `xp?`, `currentLifePoints?`, `maxLifePoints?`; privato `effectiveOrReject(quest, character): void` chiamato subito dopo `if (rejection) throw rejection;`. `classifyEligibility`, `previewTravel`, la transazione e la risoluzione invariati.

## TDD

- Task 1 RED (`28cf4bec`): suite `heal-no-effect.spec.ts` non eseguibile (modulo assente, tsc rosso per la sola spec); in `game-rule.exception.spec.ts` falliti 3 casi (riga della tabella `questNoEffect`, `covers every GameRuleErrorCode exactly once`, il caso D-25). GREEN (`b6df83a1`): 5 suite / 156 test verdi.
- Task 2 RED (`c225fb71`): falliti i due rifiuti del servizio e il caso sul filo (heal accettata, `successful: true`); verdi al primo colpo i tre casi di accettazione e la precedenza di `QUEST_SLOT_BUSY` (pin del comportamento esistente). GREEN (`8dfdcdd0`): `src/quests/acceptance` unit + integration 6 suite / 331 test verdi.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug nella spec RED] Heal «senza cura» costruita con la cura di default**
- **Found during:** Task 2 GREEN
- **Issue:** l'helper `curingQuestOf(type, cure = VILLAGE_CURE)` chiamato con `undefined` riceveva il default: la quest aveva la cura e il personaggio a 1 HP con ferite veniva (correttamente) accettato. Al RED il caso falliva per il motivo sbagliato.
- **Fix:** l'helper riceve un oggetto `prizes` (default `{ cure: VILLAGE_CURE }`); il caso senza cura passa `{}`, quindi `prizes.cure` resta al default `null` dello schema.
- **Files modified:** src/quests/acceptance/quest-acceptance.service.int-spec.ts
- **Commit:** 8dfdcdd0 (insieme al GREEN, annotato nel corpo)

### Altro

- Fixture esistenti che accettavano una heal senza cura: nessuna (grep su `'heal'` / `QuestType.heal` in `src/quests` e `test`: solo tabelle unitarie di corsie ed eleggibilità, nessuna accettazione); controllo di wave `npx jest src/quests --selectProjects integration --runInBand` verde (34 suite / 460 test, 174 s).
- Il verify del Task 3 cerca `Plan: 09 of 11`: STATE usa `Plan: 9 of 11` come da brief (innocuo).
- Durante il controllo `pgrep -fl 'bin/jest'` ha mostrato un jest di un altro progetto dell'utente (fuori da questo repo): non toccato.

## Gate

- `npx tsc --noEmit -p tsconfig.json` 0 dopo ogni task di codice.
- `npx jest src/quests/outcomes/injuries src/gameRules src/quests/acceptance --selectProjects unit`: 9 suite / 342 test.
- prettier `--write` + eslint puliti sugli otto file `.ts` toccati.
- `src/schema.gql` invariato (GameRuleErrorCode non è un enum GraphQL).
- Conteggi titoli: heal-no-effect.spec `D-25)` 6; game-rule.exception.spec `D-25)` 1; quest-acceptance.service.int-spec `D-25)` 7; accept-quest.resolver.int-spec `D-25)` 1.
- `quest-eligibility.ts` e `src/quests/outcomes` (fuori dal modulo nuovo, che sta nel commit del Task 1) senza diff nei commit del Task 2; `package.json` invariato.

## Finestra operativa (per il handoff del 18-11)

Fra la merge e lo script di contenuto le 166 heal a DB non hanno `cure`: sono senza effetto per tutti e `acceptQuest` le rifiuta con `QUEST_NO_EFFECT` (T-18-44, fail-safe voluto).

## Self-Check: PASSED

- File creati presenti: heal-no-effect.ts, heal-no-effect.spec.ts.
- Commit presenti: 28cf4bec, b6df83a1, c225fb71, 8dfdcdd0.
