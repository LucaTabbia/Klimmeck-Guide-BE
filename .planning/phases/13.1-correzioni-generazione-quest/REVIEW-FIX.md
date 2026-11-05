---
phase: 13.1-correzioni-generazione-quest
fixed: 2026-11-05
source: 13.1-REVIEW.md
review_path: .planning/phases/13.1-correzioni-generazione-quest/13.1-REVIEW.md
rulings_path: .planning/phases/13.1-correzioni-generazione-quest/13.1-REVIEW-RULINGS.md
iteration: 1
fix_scope: all
findings_total: 11
findings_in_scope: 11
fixed_count: 10
skipped_count: 0
not_needed_count: 1
deferred_count: 0
status: all_fixed
---

# Phase 13.1: report dei fix della code review

**Data dei fix:** 2026-11-05
**Review di partenza:** `.planning/phases/13.1-correzioni-generazione-quest/13.1-REVIEW.md` (gruppi A/B, dettagli in `13.1-REVIEW-A.md` e `13.1-REVIEW-B.md`) più le due note del verificatore promosse a FIX (`13.1-VERIFICATION.md`)
**Ruling applicati:** `.planning/phases/13.1-correzioni-generazione-quest/13.1-REVIEW-RULINGS.md`
**Base:** `cca45b9` su `feat/13.1-correzioni-generazione-quest`
**Iterazione:** 1

**Esito:** 11 finding (0 critical, 3 warning, 6 info della review + 2 info del verificatore) → 10 corretti, 1 `not_needed` per ruling (A-IN-02), 0 saltati, 0 rinviati. 21 commit di codice e handoff, più questo report.

## Tabella dei finding

| Finding | Esito | Commit | Note |
| --- | --- | --- | --- |
| A-WR-01 | fixed (solo spec) | `efcd7c8` | Spec `falls back to one seat before changing rank when two seats cannot be composed (D-03)`: hero, pool `[orsogufo]`, `SequenceChance([0.5, 0.9])` → Orsogufo ×6, `seats: 1`. Verde al primo colpo (il ripiego c'era già); verificata **rossa** mutando la lista dei posti a `[MAX_ENEMY_SEATS]` e ripristinata. Nessun cambio di codice. |
| A-IN-01 | fixed (doc) | `85cb415` | Intestazione di `quest-composition.ts` riscritta con l'ordine reale dei tiri (boss: quota poi 1 scelta nel primo pool con candidati; posti; forma; giro pool → posti `[S, poi 1 se S = 2]` → forme senza ritirare posti e forma). Scritta dopo A-IN-03, quindi descrive l'ordine nuovo. |
| A-IN-02 | not_needed | — | Un singolo di 63 xp per due adventurer rispetta il budget `[2×21, 2×69]` di D-03: è la regola dell'utente così com'è scritta. Domanda da girare all'utente nel handoff §3 (un «nemico singolo» con due posti è voluto?); nessun cambio ora. |
| A-IN-03 | fixed | `9a62d9d` (RED), `37d3380` (GREEN) | `composeEnemyQuest` gira **per pool**: per la zona, poi per `all` solo se più ampio, prova i posti `[2, 1]` o `[1]` e le forme. RED `composes one seat from the zone before two seats from the all fallback (D-03, D-08)`: zona con il solo Orsogufo (serve solo S = 1) + Errante 700 `all` (servirebbe S = 2), `SequenceChance([0.5, 0.9])` → prima `seats: 2` col branco `all`, ora Orsogufo ×6 `seats: 1`. |
| A-IN-04 | fixed | `fa36bb5` (RED), `c779f84` (GREEN) | `readWorld` raccoglie le città saltate per `type` ignoto e `warnUnknownTypes` emette un solo WARN per corsa `Generatore: N città con tipo sconosciuto saltate (<hex>, …)` (soli id e conteggio). Spec int estesa (`skips a city with an unknown type, warns once with its id and keeps it in the target (D-04)`) con `Logger.prototype.warn` spiato. Una città senza marker o senza posizione resta saltata in silenzio come prima (non è un caso di `type`). |
| A-IN-05 | fixed (refactor) | `0503aa9` (spec), `c2ee48c` (refactor) | `stringsOf` in `src/mongo/lean-values.ts` con la sua spec (3 casi); `enemy-candidate.ts`, `quest-generator.service.ts`, `combat-context.ts` e i due migratori hunt/dungeon lo importano da lì; copia di `combat-context.ts` rimossa. Unica differenza: la copia del combattimento leggeva una stringa nuda in `baseWeaknesses`/`energyWeaknesses` come `[]`, ora come `[stringa]` (come già facevano i candidati del generatore); a DB i campi sono liste, nessuna spec cambiata. |
| B-WR-01 | fixed | `e08c61f` (RED), `9dd7d01` (GREEN) | `DungeonStagesMigrator` registra `PendingQuest`, legge le quest in corsia (`distinct('quest')` + `refIdOf`, come `HuntPreyMigrator`) e salta quelle dungeon **prima** di ogni altro controllo: WARN `Dungeon <id> in corsia: lasciata`, contatore `inLane` nel report, riga di log `Dungeon: N ricomposte, M già coerenti, L in corsia` emessa se N + L > 0. Il filtro `startedAt: null` resta come difesa in più, col commento corretto. RED `leaves a dungeon held in a lane and warns with its id (D-07)`; tutti i report della int-spec e il mock della spec del boot hanno `inLane: 0`. |
| B-WR-02 | fixed | `ba0ed00` (RED), `e19f92a` (GREEN) | `dungeonStagesOf`: pool `[zona, all se più ampio]` (vuoti esclusi); per pool prima col primo nemico tenuto, poi senza; per ciascuno i conteggi `[tirato, poi gli altri da 2 a 4 in ordine]`; `null` solo se nessun pool compone con nessun conteggio. RED `uses more stages when the drawn count cannot reach the budget (D-07)` (mage, due mostri da 63, conteggio tirato 2 → 4 tappe, 252) e `falls back to the all habitat when the zone cannot fill the budget (D-07)` (paladin, zona con un 7, `all` con un 99). |
| B-IN-01 | fixed | `06af2ab` (refactor), `72da950` (RED), `16e9dc6` (GREEN) | Refactor preparatorio: `readPrizeCatalog` estratto dal generatore in `src/quests/generation/prize-catalog.ts` (nessun cambio di comportamento, `quest-generator.int-spec.ts` 21/21). Poi `HuntPreyMigrator` (con `EquipmentItem` e `LootItem` registrati nel `forFeature` del modulo e nel costruttore): se il `minTitle` riscritto è diverso dall'attuale scrive anche `prizes.prizeCoins`/`prizes.xpPrize` (`huntPrizesOf`: base `enemy` 150 rame e 40 xp × `TIER_MULTIPLIER` del rango nuovo, un posto) e `requirements.recommendedLoot` (`recommendedLootOf` sulla preda nuova e il catalogo); `randomLoot`, `pet`, magia e `timeToComplete` invariati; stesso rango ⇒ premi e consigliati invariati. RED: promossa a adventurer → 3 argento, 80 xp, consigliati Lancia (arma contro `piercing`) + Tonico (cura uncommon, l'Elisir rare escluso); ri-estratta in rookie → premi e consigliati invariati. |
| V-IN-01 | fixed | `018ab21` (RED), `8aba433` (correzione della spec), `d98be99` (GREEN) | `GeneratedQuestsResetMigrator` legge dopo la cancellazione le generate aperte rimaste (`keptIds`, per `_id`), che sono esattamente le protette: ne usa il numero per `kept` e le elenca a DEBUG solo con `kept > 0`. La RED elencava per errore la quest fissa in corsia fra le cancellate: corretta con un commit a parte (`8aba433`), verificata ancora rossa contro il codice vecchio. |
| V-IN-02 | fixed | `f6a3f9c` (RED), `169c615` (GREEN) | `HuntPreyMigrator` valuta la coerenza (pool di zona + `minTitle`) prima della città; la città serve solo a riscrivere titolo e voce. RED `counts a coherent hunt whose poi has no city as coherent (D-07)`: POI senza città, hunt coerente → `coherent`, hunt incoerente → `withoutPrey` con la sua WARN. I tiri non cambiano (`keyedChance` per id, creato a ogni hunt). |

Commit di handoff: `d47d8f5 docs(phase-13.1): update the boot runbook and handoff for the fixes` (handoff 13.1 §4, runbook Phase 13 §11 (f)).

Tre commit RED (`e08c61f`, `0503aa9`, `72da950`) hanno lasciato `tsc` rosso fino al GREEN successivo per il solo errore atteso (argomento di costruttore in più, modulo `lean-values` assente), come nel piano 13.1-02; ogni commit GREEN/refactor è a `tsc` 0.

## Numeri a seme fisso

Nessun numero a seme fisso è cambiato, quindi nessuna ri-derivazione:

- `quest-composition.spec.ts`: le spec a 200 semi asseriscono invarianti e quote (budget, membri ≤ hi, 2 posti fra 0,2 e 0,5 delle `enemy` mage, nessun legend/leggendario/animale) e restano verdi con l'ordine per pool di A-IN-03; le spec a `SequenceChance` esistenti non passano dal ramo cambiato.
- `quest-generator.int-spec.ts` (21), `quest-generation.e2e.int-spec.ts` (8), `quest-generation.resolver.int-spec.ts` (4), `quest-generation-access.e2e.int-spec.ts` (4), `city-distribution.spec.ts`: conteggi `created` e distribuzioni invariati dopo A-IN-03 (lanciati subito dopo il GREEN).
- `dungeon-stages.spec.ts` (50 chiavi × 5 ranghi) e `dungeon-stages.migrator.int-spec.ts`: solo invarianti (2–4 tappe, budget, nessun animale, primo nemico tenuto se entra); verdi dopo B-WR-02 senza modifiche ai valori (le tappe esatte estratte possono cambiare dove prima serviva il ripiego senza primo nemico, ma nessuna spec le fissa).

## Gate finale

| Controllo | Esito |
| --- | --- |
| `npx tsc --noEmit -p tsconfig.json` | exit 0 |
| `npx jest src/quests src/models src/cities src/mongo --selectProjects unit` | 76 suite / 1037 test verdi |
| `npx jest src/quests/maintenance/dungeon-stages.migrator.int-spec.ts --selectProjects integration --runInBand` | 9/9 |
| `npx jest src/quests/maintenance/hunt-prey.migrator.int-spec.ts --selectProjects integration --runInBand` | 8/8 |
| `npx jest src/quests/maintenance/generated-quests-reset.migrator.int-spec.ts --selectProjects integration --runInBand` | 4/4 |
| `npx jest src/quests/generation/quest-generator.int-spec.ts --selectProjects integration --runInBand` | 21/21 |
| `npx jest test/quests/quest-generation.e2e.int-spec.ts --selectProjects integration --runInBand` | 8/8 |
| `npx jest test/app.int-spec.ts --selectProjects integration --runInBand` (real boot, modulo di manutenzione toccato) | 73/73 |
| `git diff --exit-code src/schema.gql` | exit 0 |
| `git diff origin/develop -- src/schema.gql` | vuoto (0 righe) |
| `Math.random` / `process.env.` nei file toccati sotto `src/` | 0 |
| trailer vietati in `cca45b9..HEAD` | 0 (controllato dopo ogni commit) |
| `git status --short` / `pgrep -fl jest` a fine lavoro | vuoti |
| processo BE dell'utente (pid 68075) | vivo, `dist/` non toccato (nessuna build) |

Nessun test instabile osservato.

## Note per il handoff FE e per il runbook

- **Contratto FE:** nessun cambio di SDL. Differenze osservabili solo nei valori:
  - le generate `enemy` in zone povere escono più spesso con nemici di zona a un posto invece che con nemici `all` a due posti (A-IN-03);
  - le hunt promosse oltre rookie dal one-off hanno premi e consigliati della fascia nuova (B-IN-01, handoff 13.1 §4);
  - le dungeon in corsia non cambiano più sotto chi le ha accettate (B-WR-01).
- **Runbook del primo boot reale (Phase 13 §11 (f), già aggiornato):**
  - passo 2 (reset): la DEBUG `Generate protette: …` elenca solo le generate aperte lasciate e compare solo con m > 0 (V-IN-01);
  - passo 3 (hunt): una hunt coerente con un POI senza città conta in `già coerenti`, non in `senza prede` (V-IN-02); le hunt promosse riscrivono anche `prizes.prizeCoins`, `prizes.xpPrize` e `requirements.recommendedLoot` (B-IN-01). **Decisione dell'orchestratore come default, da segnalare all'utente: può ritirarla prima del boot**;
  - passo 4 (dungeon): riga nuova `Dungeon: <n> ricomposte, <m> già coerenti, <l> in corsia`, emessa se n + l > 0; WARN nuova `Dungeon <id> in corsia: lasciata`; la WARN `senza tappe componibili` ora compare solo se nessun conteggio da 2 a 4 compone, né in zona né col ripiego `all` (B-WR-01, B-WR-02). Al secondo boot il passo 4 ripete solo le WARN e la riga con `<l>` se restano dungeon in corsia;
  - generatore: una WARN per corsa `Generatore: N città con tipo sconosciuto saltate (<id>, …)` se una città ha un `type` ignoto; al boot reale non deve comparire (A-IN-04). Ripete a ogni corsa finché il `type` non è corretto a DB.
- **Migratori una tantum (lista di rimozione della §11 (f), aggiornata):** il `forFeature` di `QuestMaintenanceModule` ha due voci nuove da togliere con i one-off, `EquipmentItem` e `LootItem` (servono solo a `HuntPreyMigrator`). `DungeonStagesMigrator` ha il parametro `PendingQuest` in più e `DungeonStagesReport` il campo `inLane`; `HuntPreyMigrator` ha i parametri `EquipmentItem` e `LootItem`. Nessun file una tantum nuovo. **Restano** nel repo, fuori dalla rimozione: `src/quests/generation/prize-catalog.ts` (usato dal generatore) e `src/mongo/lean-values.ts` + spec (usati da generatore, candidati e combattimento).
- **CONTEXT non emendato:** B-WR-02 allarga il ripiego `all` delle tappe delle dungeon da «solo a zona vuota» a «quando la zona non compone con nessun conteggio» (la review suggeriva di emendare D-07 se accettato). Il fixer non tocca altri documenti oltre al handoff e al runbook: l'emendamento di `13.1-CONTEXT.md` D-07 resta all'orchestratore.


## D-09 (2026-11-05): un solo posto sulle `enemy`

Decisione dell'utente dopo la review (verbatim in `13.1-CONTEXT.md` D-09): *«Solo le missioni boss o worldMission hanno più di uno slot avventuriero.»* Le `enemy` generate hanno sempre `requiredAdventurers = [{ title: R, count: 1 }]` e il budget di D-03 vale con S = 1; i boss tengono i posti della formula. **A-IN-02 è superata:** con un solo posto la domanda «un nemico singolo per due posti» non si pone più (tolta dal handoff 13.1 §3).

**Commit** (base `87186eb`, TDD, nessun trailer, `tsc` 0 su ogni commit GREEN):

| Commit | Passo |
| --- | --- |
| `7f9913c` | RED `generation-rules.spec.ts`: `pins one seat on generated enemy quests, boss and worldMission excepted (D-09)` (`ENEMY_SEATS` indefinito); tolti i casi su `ONE_SEAT_SHARE`, `MAX_ENEMY_SEATS`, `enemySeatsOf` |
| `824b3da` | GREEN `ENEMY_SEATS = 1` in `generation-rules.ts` |
| `76ff699` | RED `quest-composition.spec.ts` (3 rossi su 17: con il tiro dei posti ancora presente uscivano due posti) |
| `76584b6` | GREEN `composeEnemyQuest` senza tiro dei posti, `budgetOf(rank, ENEMY_SEATS)` nel giro pool × forme; via `ONE_SEAT_SHARE`, `MAX_ENEMY_SEATS`, `enemySeatsOf` (tolti qui e non nel passo 1 per tenere `tsc` a 0); intestazione con l'ordine dei tiri: boss → forma → pool × forme |
| `730bb3c` | RED `generated-quest-draft.spec.ts`: `never writes more than one seat on an enemy quest, boss excepted (13.1 D-09)` (una composizione `enemy` a 2 posti scriveva `count: 2`) |
| `9bb7a0e` | GREEN `seatsOf` nel draft: `enemy` → `ENEMY_SEATS`, boss → posti della composizione |
| `46d3b37` | integration: helper `seatViolationsOf` in `test/quests/generation-world.ts` (enemy un posto esatto del rango, boss da due in su); casi D-09 in coda alle suite a seme condiviso; verdi al primo colpo (codice già cambiato), **rossi** con `ENEMY_SEATS` mutato a 2 (mutazione annullata) |
| `14031c3`, `0e10f7e`, `13ca612` | documenti: REPO-RULES, handoff 13.1 §3, ROADMAP (criterio 3, assunzioni, riga 13.1-01), REQUIREMENTS BE-QGEN-13, Phase 13 `13-CONTEXT.md` D-09 e `BACKEND-NOTES.md` §7 |

**Spec cambiate (casi prima → dopo):**

- `generation-rules.spec.ts` 11 → 12: aggiunto il caso D-09; il caso del budget (D-03) perde le asserzioni sul tiro dei posti.
- `quest-composition.spec.ts` 18 → 17: tolti `composes two seats in about one enemy quest in three (D-03)` e il ripiego A-WR-01 `falls back to one seat before changing rank when two seats cannot be composed (D-03)`; aggiunto `never composes more than one seat for an enemy quest (D-09)` (200 semi × 5 ranghi, `seats === 1`, Σ xp ∈ `budgetOf(rank, 1)`); `stays within the seat budget of every rank (D-03)` → `stays within the one-seat budget of every rank (D-03, D-09)`; il caso A-IN-03 → `composes from the zone before the all fallback with one seat (D-08, D-09)` (hero, zona col solo Orsogufo, Errante 700 `all`, `SequenceChance([0.5, 0.0])` con il singolo preferito → Orsogufo ×6 dalla zona, un posto); le sequenze fisse perdono il tiro dei posti: `[0.5, 0, 0.2, 0.0]` → `[0.5, 0.2, 0.0]`, `[0.5, 0, 0.6]` → `[0.5, 0.6]` (due casi), `[0.1, 0]` → `[0.1]`, `[0.0, 0]` → `[0.0]`.
- `generated-quest-draft.spec.ts` 6 → 6: `builds an enemy quest with two seats of the rank (D-03)` → il caso D-09 sopra.
- `quest-generator.int-spec.ts` 21 → 21: `keeps every generated enemy quest within the seat budget (D-03)` → `keeps every generated enemy quest on one seat within the budget (D-03, D-09)` (`count: 1`, `budgetOf(rank, 1)`, `seatViolationsOf` vuoto).
- `quest-generation.e2e.int-spec.ts` 8 → 9, `quest-generation.resolver.int-spec.ts` 4 → 5, `quest-generation-access.e2e.int-spec.ts` 4 → 5: un caso D-09 ciascuna, **in coda** perché il seme è condiviso fra i casi (i tiri dei casi precedenti restano gli stessi).

**Numeri a seme fisso ri-derivati (vecchi → nuovi):**

- Nessun numero asserito è cambiato: i conteggi `created` delle e2e (16, 11, 9, 30, 12, 12), del generatore (2, 6, 4, 8, 7, 2, 5, 1, 3, 5) e la distribuzione di `city-distribution.spec.ts` dipendono da tetti, target e scelta della città, non dai tiri della composizione.
- `rotates the five ranks …` (seme 7, 4 città × 3 POI, target 12; il caso asserisce chiavi e conteggi ≥ 2, non i numeri), ri-derivato una volta con una sonda temporanea non committata: ranghi `{ rookie: 3, adventurer: 3, paladin: 2, mage: 2, hero: 2 }` → invariati; posti `enemy/rookie/2, enemy/adventurer/1, enemy/paladin/1, enemy/mage/2, enemy/hero/1, enemy/rookie/1, enemy/adventurer/1, enemy/paladin/2, boss/mage/2, enemy/hero/2, enemy/rookie/1, enemy/adventurer/1` → tutte `enemy` a 1 posto (`enemy/rookie/1, enemy/adventurer/1, enemy/paladin/1, enemy/mage/1, enemy/hero/1, …` ×12). Il boss mage della nona quest sparisce: senza il tiro dei posti la sequenza del seme si sposta e il tiro del boss di quella quest cade sopra `BOSS_SHARE`.

**Gate:** `npx tsc --noEmit -p tsconfig.json` 0; `npx jest src/quests/generation --selectProjects unit` 13 suite / 93 test; `npx jest src/quests src/cities src/mongo test/quests --selectProjects unit` 62 / 923; `npx jest src/quests/generation test/quests --selectProjects integration --runInBand` 5 suite / 43 test; `git diff --exit-code src/schema.gql` 0 e `git diff origin/develop -- src/schema.gql` vuoto; nessun `Math.random` né `process.env.` aggiunto; trailer vietati 0 su ogni commit; `pgrep -fl jest` vuoto; processo BE pid 68075 vivo, nessuna build.

**Runbook del primo boot reale:** nessuna riga di log cambia (formato e testo del generatore e dei tre one-off invariati); cambiano solo i valori: tutte le generate `enemy` ricreate dal reset hanno un posto, i boss restano a 2–6 posti. Nessun cambio SDL né contratto FE (la Phase 13 scriveva già `count: 1` sulle `enemy`).

---

_Fixed: 2026-11-05_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
