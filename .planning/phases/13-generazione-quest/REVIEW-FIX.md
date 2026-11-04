---
phase: 13-generazione-quest
fixed: 2026-11-04
source: 13-REVIEW.md
review_path: .planning/phases/13-generazione-quest/13-REVIEW.md
rulings_path: .planning/phases/13-generazione-quest/13-REVIEW-RULINGS.md
iteration: 1
fix_scope: all
findings_total: 14
findings_in_scope: 14
fixed_count: 11
skipped_count: 0
not_needed_count: 3
deferred_count: 0
status: all_fixed
---

# Phase 13: report dei fix della code review

**Data dei fix:** 2026-11-04
**Review di partenza:** `.planning/phases/13-generazione-quest/13-REVIEW.md` (gruppi A/B/C, dettagli in `13-REVIEW-A/B/C.md`)
**Ruling applicati:** `.planning/phases/13-generazione-quest/13-REVIEW-RULINGS.md`
**Base:** `396608a` su `feat/13-generazione-quest`
**Iterazione:** 1

**Esito:** 14 finding (0 critical, 3 warning, 11 info) → 11 corretti (8 in TDD con coppia `test`/`fix`, A-IN-05 e B-IN-01 solo documentazione, B-IN-02 refactor senza RED), 3 `not_needed` per ruling senza modifiche al codice, 0 saltati, 0 rinviati. 20 commit di codice/handoff, più questo report.

## Tabella dei finding

| Finding | Esito | Commit | Note |
| --- | --- | --- | --- |
| A-WR-01 | fixed | `9b0b801` (RED), `f6e9bf1` (GREEN) | `whenIdle()` attende in ciclo finché `inFlight` è nullo; nuovo `close()` (`closed = true`, `rerun = false`, attesa dell'idle); `request()` e il riavvio del `finally` no-op dopo `close()`; `generate()` esplicito ammesso; lo sweeper chiama `close()` in `onModuleDestroy`. Spec unit nuova `quest-generator.service.spec.ts` (4 casi) e sweeper spec aggiornata. Nel RED `close()` era chiamato via cast per tenere `tsc` a 0; il cast è sparito nel GREEN. |
| A-IN-01 | not_needed | — | Gli hook `onApplicationBootstrap` girano in sequenza per modulo nell'ordine del grafo (`QuestMaintenanceModule` prima di `QuestGenerationModule`), il generatore è single-flight con rerun e il filtro `legendary: false` è fail-closed: al peggio una corsa a vuoto, mai una scrittura sbagliata su dati non migrati. |
| A-IN-02 | fixed | `47817fb` (RED), `73b5b60` (GREEN) | Il log `Generatore: N missioni create (target T)` è in un `finally` di `runOnce` (helper `logCreated`); l'errore si propaga come prima. RED in `quest-generator.int-spec.ts` con un model proxy la cui seconda `create` lancia un errore generico. |
| A-IN-03 | not_needed | — | `pick`/`shuffle` di `SeededChanceSource` restano per decisione (D-17, PRNG seminato ripristinato) e coperti dalla spec; `LEGEND_PARTY_AVERAGE_PE` documenta la regola dell'utente (i legend non hanno boss) citata nel CONTEXT. |
| A-IN-04 | fixed | `d34a68e` (spec), `85cef82` (fix) | `rankOf` usa `Object.hasOwn(RARITY_RANK, rarity)`. La spec (rarità `constructor`, `__proto__`, `toString` esclusa) era **verde al primo colpo**: i valori del prototipo non si confrontano mai come numero sotto la fascia, quindi l'esclusione reggeva per caso; ora la regola è fissata. Il grep del ruling (`RARITY_RANK`, `RANK_XP_BANDS`, `BOSS_PARTY_AVERAGE_PE`, `LOOT_POOLS`) non trova altri `in` su record indicizzati da stringhe esterne. |
| A-IN-05 | fixed (doc) | `39f9961` | Commento sopra `runOnce` con l'ordine dei tiri (`pickCity` → `pickPoi` → `composeQuest` per ogni rango provato → `prizesOf` → `announcementOf`); nota su `pickPoi` (lista mai vuota: peso 0 della città senza POI liberi), tipo `string` invariato; commento del harness corretto («un nemico e un leggendario per ogni voce di `enemyXps`», la riga citata dalla review è oggi la 165). |
| B-WR-01 | fixed | `bb7eb2e` (RED), `41ba7e8` (GREEN) | Posseduto di un EquipmentItem = `Math.max(somma di ownedEquipments, copie negli slot)`. Spec: x1 posseduta e indossata → 1; x2 posseduta (due voci, una popolata) e una indossata → 2; solo nello slot → 1; x1 posseduta in due mani → 2. Il caso «worn included» ora ha la voce in `ownedEquipments`; «sums…» sostituito da «does not double count the worn copy (D-11)». Lo slot del ruling (`weapon`) non esiste in `SlotType`: usato `rightHand`. |
| B-IN-01 | fixed (doc) | `2df2f88` | Commento in `fight` (successo automatico con stages null, C6/D-01, dungeon compresa), ramo 0/0 di `PlaceholderDungeonResolver` marcato difensivo, riga 6 della §14 del `BACKEND-NOTES.md`. |
| B-IN-02 | fixed (refactor) | `42b867d` | `dungeon-context.ts` importa `isPositiveInteger` da `outcome-numbers.ts`; nessuna RED: comportamento identico sulle quantità che il gioco salva (diverge solo oltre `2^53`), spec del modulo verdi senza modifiche. |
| B-IN-03 | fixed | `a93072e` (RED), `343bb7b` (GREEN) | `readEnemies` passa la proiezione `COMBAT_ENEMY_PROJECTION` (`name`, `lifePoints`, `xp`, `damages`, `baseWeaknesses`, `energyWeaknesses`; `_id` di default). Spec unit nuova `resolution-loader.service.spec.ts` con `enemyModel.find` spiato (`toHaveBeenCalledWith` sull'oggetto intero); `quest-combat.int-spec.ts` verde. |
| C-WR-01 | fixed | `b1f3dfe` (RED), `5e16420` (GREEN) | `DungeonStagesMigrator` scrive solo se le tappe finali sono almeno 2 (`MIN_ENRICHED_STAGES`), altrimenti `skipped`. RED: grotta dove vive solo il Bandito (xp fuori da ogni forma rookie) → dungeon rookie a 0 nemici con una sola tappa possibile non scritta; doppia corsa su mondo misto → `{ enriched: 1, skipped: 1 }` poi `{ enriched: 0, skipped: 1 }`. |
| C-IN-01 | not_needed | — | `SweepIndexVerifier` (Phase 10) è fuori dalla fase; il generatore gira in un solo processo single-flight e rilegge i POI occupati a ogni corsa, l'indice unico è la seconda difesa; un fallimento della creazione è loggato al boot. Riga 7 della §14 del handoff (commit `37c1430`): verificare al primo boot che il log del verifier non segnali l'indice `quest_generated_open_marker`. |
| C-IN-02 | fixed | `02eabc4` (RED), `57cd305` (GREEN) | `JewelAccessoryMigrator` legge `equipType` degli id della tabella e li divide in `missing` (assenti) e `notJewels` (presenti ma né `ring` né `necklace`): nessuno dei due viene scritto, ciascuna lista ha la sua riga WARN di soli id, il report porta entrambe. |
| C-IN-03 | fixed | `31992b9` (RED), `dd3ee29` (GREEN) | Filtro di lettura e di scrittura del `DungeonStagesMigrator` con `startedAt: null`; una dungeon avviata con ≤ 1 nemico non viene letta né arricchita. |

Commit di handoff: `37c1430 docs(phase-13): note the review fixes in the handoff` (righe del runbook §11 per gioielli e dungeon, righe 7–9 della §14).

## Gate finale

| Controllo | Esito |
| --- | --- |
| `npx tsc --noEmit -p tsconfig.json` | exit 0 |
| `npx jest src/quests src/models --selectProjects unit` | 67 suite / 876 test verdi |
| `npx jest src/quests/generation/quest-generator.int-spec.ts --selectProjects integration --runInBand` | 16/16 |
| `npx jest src/quests/maintenance/dungeon-stages.migrator.int-spec.ts --selectProjects integration --runInBand` | 7/7 |
| `npx jest src/quests/maintenance/jewel-accessory.migrator.int-spec.ts --selectProjects integration --runInBand` | 6/6 |
| `npx jest src/quests/outcomes/quest-combat.int-spec.ts --selectProjects integration --runInBand` | 12/12 |
| `npx jest test/app.int-spec.ts --selectProjects integration --runInBand` (real boot, arresto con `close()`) | 73/73 |
| `git diff --exit-code src/schema.gql` | exit 0 |
| `git diff origin/develop -- src/schema.gql`, righe tolte | solo le due `  enemy: Enemy` |
| `Math.random` / `process.env.` nuovi sotto `src/` | 0 |
| trailer vietati in `396608a..HEAD` | 0 |
| `git status --short` / `pgrep -fl jest` a fine lavoro | vuoti |
| processo BE dell'utente (pid 53164) | vivo, `dist/` non toccato (nessuna build) |

Nessun test instabile osservato.

## Note per il handoff FE e per il runbook

- **Contratto FE:** nessun cambio. Lo SDL è identico; le sole differenze osservabili lato client sono nei valori: le quantità dei consigliati posseduti passati alla porta `DungeonResolver` (oggi non esposti in GraphQL né letti dal segnaposto) non contano più due volte gli indossati (B-WR-01).
- **Runbook del primo boot reale (§11 del `BACKEND-NOTES.md`, già aggiornato):**
  - passo 3 (gioielli): oltre alla WARN degli id assenti può comparire `Gioielli: <k> della tabella non sono anelli né collane a DB: <id>…`; al primo boot reale non deve comparire nessuna delle due (C-IN-02);
  - passo 4 (dungeon): le dungeon già avviate da un party non vengono lette; una dungeon con zero nemici validi a cui si aggiungerebbe una sola tappa resta com'è e conta fra le saltate; la seconda corsa del migratore è sempre 0 (C-WR-01, C-IN-03);
  - passo 5 (generatore): la riga `Generatore: <n> missioni create (target <t>)` compare anche se una `create` fallisce a metà corsa, prima di `Generatore: corsa fallita (…)` (A-IN-02);
  - dopo il boot: controllare che il log di `SweepIndexVerifier` non riporti `Indici di quests non costruiti (…)` (C-IN-01).
- **Arresto del BE:** lo sweeper chiama `QuestGenerator.close()`: dopo lo stop nessuna nuova corsa da sweep o da conclusioni di generate, e lo stop attende anche la corsa riavviata da un rerun (A-WR-01). `generateQuests` resta servita.
- **Migratori una tantum:** `DungeonStagesMigrator` e `JewelAccessoryMigrator` cambiano comportamento (sopra) ma non file né provider; la lista di rimozione della §11 (d) resta invariata. `JewelAccessoryReport` ha il campo nuovo `notJewels` (letto solo dalla int-spec; il boot non usa il report). Le spec nuove fuori dai migratori (`quest-generator.service.spec.ts`, `resolution-loader.service.spec.ts`) restano nel repo.

---

_Fixed: 2026-11-04_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
