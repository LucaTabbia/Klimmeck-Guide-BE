---
phase: 24-origini-delle-magie-quest-void-e-shamanic
plan: 15
subsystem: quests
tags: [spells, learning, outcome-writer, sweep, tdd]
requires: ["24-14"]
provides:
  - "planLearningEnd e researchSheetOf (piano puro della fine dell'apprendimento e del secondo foglio)"
  - "ResolutionLoader.readLearnableSpell e snapshotOnStandardLaneInSession"
  - "SpellLearningService.completeDue, smistato in testa a QuestResolutionService.resolveStandard"
affects: ["24-16", "24-17", "24-18"]
tech-stack:
  added: []
  patterns: ["smistamento prima del caricamento standard: null = decide la risoluzione di oggi", "secondo foglio piccolo nella transazione che cancella la PendingQuest"]
key-files:
  created:
    - src/quests/outcomes/learning/learning-end-plan.ts
    - src/quests/outcomes/learning/learning-end-plan.spec.ts
    - src/quests/outcomes/learning/spell-learning.service.ts
    - src/quests/outcomes/spell-learning.int-spec.ts
  modified:
    - src/quests/outcomes/resolution-loader.service.ts
    - src/quests/outcomes/resolution-loader.service.spec.ts
    - src/quests/outcomes/quest-resolution.service.ts
    - src/quests/outcomes/quest-outcomes.module.ts
    - src/quests/outcomes/quest-resolution.sweeper.int-spec.ts
decisions:
  - "Alla fine dell'apprendimento, in una transazione: magia in status.spellStates (usi pieni, non attiva), relatedLore via knowledgeUpdateOf, corsia libera, PendingQuest cancellata e secondo QuestResult piccolo; questEnd col suo id dopo il commit (D-26, D-24, D-31)"
  - "Quest e proprietario del secondo foglio vengono dal foglio della ricerca (researchResult): la quest può essere sparita dalla board"
  - "Magia già nota o sparita dal catalogo: corsia liberata senza secondo foglio né push (WARN di soli id); foglio della ricerca illeggibile: magia imparata, nessun secondo foglio, WARN"
metrics:
  completed: 2026-11-16
  tasks: 3
  commits: 5
---

# Phase 24 Plan 15: fine della parte di apprendimento — Summary

Il trigger della `PendingQuest` riarmata dalla ricerca (job `resolve` o sweep, senza modifiche a processor, scheduler e sweeper) passa prima da `SpellLearningService.completeDue`: a scadenza, in una sola transazione, la magia entra in `status.spellStates`, la sua lore si sblocca, la corsia si libera, la `PendingQuest` è cancellata e si scrive un secondo `QuestResult` piccolo per la stessa quest e lo stesso personaggio (`spellLearned`, lore nuove, ogni guadagno a zero, «prima» = «dopo»), consegnato con `questEnd`. Il foglio della ricerca non si tocca. Nessun tiro.

## Commit

| Task | Commit | Subject |
|------|--------|---------|
| 1 (RED) | a5f15b54 | test(quests): expect the plan of the end of the learning part |
| 1 (GREEN) | 69e76c0e | feat(quests): plan the end of the learning part |
| 2 (RED) | bb89fe71 | test(quests): expect the learning part to end with the spell known |
| 2 (GREEN) | 6d52de8b | feat(quests): end the learning part with the spell known |
| 3 | (questo) | docs(phase-24): record plan 15 progress |

## RED

- Task 1: atteso e osservato «Cannot find module './learning-end-plan'» (suite intera) e `readLearnableSpell is not a function` (3 casi del loader).
- Task 2: 8 falliti su 11 in `spell-learning.int-spec.ts` e 1 su 2 nei casi nuovi dello sweeper. Atteso dal piano «la PendingQuest riarmata risolta di nuovo (xp due volte, foglio pieno)»; osservato invece `'stale'` senza scritture: la chiusura condizionata a `learningSpell` nullo del piano 14 abortisce già la seconda risoluzione. Lo sweep rispondeva `resolved: 0`.
- Verdi al primo colpo (motivo):
  - `waits before the end of the learning part (D-26)`: `loadStandardTrigger` risponde già `waiting` sulla `startDate + waitingTime` riarmata.
  - `ignores the research trigger once the learning part has started (D-26)`: `loadStandardTrigger` scarta già la `startDate` vecchia.
  - `still resolves a quest without a learning part as before (D-26)`: caso di non regressione.
  - `leaves a learning part that is not due to the next sweep (D-26)`: la pipeline dello sweep non seleziona una `PendingQuest` non scaduta.

## Righe di log nuove (soli id)

- `Missione in attesa <id>: trigger obsoleto, nessuna scrittura` / `Missione in attesa <id>: non ancora scaduta, nessuna scrittura` (stesse righe di `QuestResolutionService.load`, emesse da `SpellLearningService`)
- `Apprendimento della missione in attesa <id> già concluso o cambiato: nessuna scrittura`
- `Apprendimento della missione in attesa <id> concluso: magia imparata` (log)
- `Apprendimento della missione in attesa <id> concluso: magia già conosciuta` (WARN)
- `Apprendimento della missione in attesa <id> concluso: magia assente dal catalogo` (WARN)
- `Apprendimento della missione in attesa <id> concluso: magia imparata, foglio della ricerca illeggibile` (WARN)

## Gate

- `npx jest src/quests/outcomes/learning src/quests/outcomes/resolution-loader.service.spec.ts --selectProjects unit`: 2 suite, 58 / 58.
- `npx jest src/quests/outcomes --selectProjects unit`: 43 suite, 989 / 989.
- `npx jest src/quests/outcomes/spell-learning.int-spec.ts src/quests/outcomes/quest-resolution.sweeper.int-spec.ts src/quests/outcomes/study-spell-draw.int-spec.ts src/quests/outcomes/quest-resolution.service.int-spec.ts src/quests/outcomes/quest-resolution.processor.int-spec.ts --selectProjects integration --runInBand`: 5 suite, 89 / 89.
- Controllo più largo: `npx jest src/quests/outcomes --selectProjects integration --runInBand`: 17 suite, 272 / 272 (88 s).
- `npx tsc --noEmit -p tsconfig.json`: 0. `git diff --exit-code src/schema.gql`: pulito. Prettier ed ESLint puliti sui file toccati.
- Processor, scheduler e sweeper senza diff: `git diff a027f85e --stat -- src/quests/outcomes/quest-resolution.processor.ts src/quests/outcomes/quest-resolution.sweeper.ts src/quests/outcomes/scheduling | wc -l` stampa `0` (il comando del piano usa `HEAD~2`, che a fine piano punta dentro questo stesso piano: si è usato l'ultimo commit di codice del piano 14).
- Accettazione: `export function planLearningEnd` 1, `export function researchSheetOf` 1, `knowledgeUpdateOf(` 1, `@nestjs` nel piano puro 0, `async readLearnableSpell` 1, `D-31)` nella spec del piano 8, `D-26)` 3; `export class SpellLearningService` 1, `completeDue` in `quest-resolution.service.ts` 1, `SpellLearningService` nel modulo 2, `chance` nel servizio 0, `D-31)` nell'int-spec 7, `D-26)` nello sweeper 2; nessun jest rimasto.

## Deviations from Plan

1. **[Rule 3] Tipi della nuova int-spec corretti nel commit GREEN:** `tsc` ha rilevato due argomenti `unknown` (`drawSpellOn` e l'utente del filtro dei non confermati); corretti con `Types.ObjectId`, nessuna asserzione cambiata.
2. **Caso in più nella spec del piano:** `reads the user and the quest snapshot of a valid research sheet (D-31)` separato dall'`it.each` dei valori sporchi; `researchSheetOf` richiede anche `quest.type` stringa (oltre a id e titolo), perché il tipo è obbligatorio nello schema del foglio.
3. **Filtro della corsia** costruito con `lanePathOf(QuestLane.standard)` e `STANDARD_LANE_FREE` invece dei letterali (stesso risultato, nessuna stringa duplicata).
4. Il comando di accettazione «job e sweep senza diff» con `HEAD~2` è stato sostituito come detto sopra.

## Nota per i piani 16–18

- Il push della ricerca riuscita (piano 16) parte da `CommittedLearning` (`resultId` = foglio della ricerca, `spellName`, `userId`), già raccolto da `recordParticipant` e oggi usato solo per pianificare il job; `spellResearchFailed` è sul foglio della ricerca senza magia.
- Personaggio archiviato durante l'apprendimento: `snapshotOnStandardLaneInSession` non lo trova → `'stale'`, `PendingQuest` orfana come oggi (da annotare nel handoff, piano 18).
- Lo smistamento aggiunge una `findById` lean per trigger della corsia standard.

## Threat Flags

Nessuna superficie nuova sul filo (SDL senza diff). T-24-48 (startDate e scadenza confrontate con l'ora), T-24-49 (cancellazione della `PendingQuest` e filtro di corsia nella stessa transazione, caso del trigger ripetuto che conta due fogli), T-24-50 (`researchSheetOf` fail-closed, `readLearnableSpell` sanificante), T-24-51 (sweep, caso dedicato; ogni ramo libera la corsia) e T-24-52 (log di soli id) mitigati.

## Self-Check: PASSED
