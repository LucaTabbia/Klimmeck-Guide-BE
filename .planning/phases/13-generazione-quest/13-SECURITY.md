---
phase: 13
slug: generazione-quest
audited: 2026-11-04
status: secured
asvs_level: 1
block_on: high
branch: feat/13-generazione-quest
head: 080752b
base: origin/develop (0585b2e)
threats_total: 37
threats_mitigated: 33
threats_accepted: 4
threats_transferred: 0
threats_open: 0
threats_open_blocking: 0
threats_deferred: 0
open_ids: []
deferred_ids: []
updated: 2026-11-05
---

# Audit di sicurezza — Phase 13 «Generazione quest» (BE)

Audit in sola lettura dei blocchi threat model dei piani `13-01`…`13-20` (37 ID `T-13-NN`, varianti `b`/`c` comprese, deduplicati: alcuni ID compaiono in più piani) sul codice FINALE di `feat/13-generazione-quest` a `080752b`, cioè dopo i fix di `REVIEW-FIX.md` (11 fixed, 3 `not_needed`). Nessun file modificato, nessun commit, nessuna suite integration, nessuna lettura di `.env` o dell'ambiente, nessun comando sul database. Le mitigazioni lato FE sarebbero `transferred` (14-CONTEXT): nessuna minaccia della fase ne dipende.

Disposizioni: `mitigated` 33, `accepted` 4, `transferred` 0, `deferred` 0, `open` 0 (aggiornate il 2026-11-05: T-13-05 e T-13-18 chiuse dal primo boot reale, T-13-21b dalla rimozione dei migratori; al momento dell'audit erano 30 / 4 / 1 / 2 / 0).

## Registro delle minacce

| ID | STRIDE | Componente | Disposizione | Evidenza | Nota |
| --- | --- | --- | --- | --- | --- |
| T-13-01 | I/T | `Quest.generated` | mitigated | `src/models/quest/quest.model.ts:61-62` (`@Prop` senza `@Field`), indice unico parziale `:82-91` (`partialFilterExpression: { generated: true, concludedAt: null }`) | Il flag non è sul filo; due generate aperte sullo stesso POI sono impossibili anche fra processi |
| T-13-02 | T | `src/schema.gql` | mitigated | `git diff origin/develop -- src/schema.gql \| grep -E '^-[^-]'` → esattamente due righe `  enemy: Enemy`; `test/app.int-spec.ts:675-707` (stringhe esatte del real boot) | Ripetuta nei piani 02/19: stesso gate |
| T-13-02b | T | `accessoryUseTypes` | mitigated | `src/models/equipment-item.model.ts:20-25` (`enum: Object.values(AccessoryUseType)`, `default: undefined`) | Valori fuori da `attack`/`defense` rifiutati dalla validazione |
| T-13-03 | T | `QuestEnemy` a DB | mitigated | `src/models/quest/quest-enemy.model.ts:11-21` (ObjectId con `ref`, `required`, `quantity` `min: 1`) | |
| T-13-04 | D | `quests`/`questResult` | mitigated | `src/quests/quests.service.ts:24,37` (`dropOrphanCatalogRefs`), `src/quests/results/quest-results.service.ts:40` (`dropOrphanResultRefs`) | Orfani scartati prima della serializzazione |
| T-13-04b | I | populate profondo | mitigated | `13-VERIFICATION.md` e `BACKEND-NOTES.md` §3 (profondità 1, nessun populate di `relatedLore`) | |
| T-13-05 | T/D | `QuestEnemiesMigrator` | mitigated | `src/quests/maintenance/quest-enemies.migrator.ts:52-60` (log solo conteggi), `quest-enemies.migrator.int-spec.ts`, `quest-maintenance.boot.ts` (errore non blocca il boot); primo boot reale del 2026-11-05: `Nemici delle missioni: 581 missioni e 24 risultati migrati alla lista`, poi 0 documenti col vecchio campo a DB e secondo boot silenzioso (`BACKEND-NOTES.md` §11 b–c) | Chiusa il 2026-11-05 (era deferred) |
| T-13-05b | I | log delle migrazioni | mitigated | log di soli conteggi/id/`describeError`: `enemy-legendary.migrator.ts:72`, `dungeon-stages.migrator.ts:108,120`, `jewel-accessory.migrator.ts:124-131`, `quest-maintenance.boot.ts:49` | Nessun URI né documento intero |
| T-13-05c | T | fixture | mitigated | regola di processo dei piani; `13-VERIFICATION.md` (suite verdi senza asserzioni riscritte) | |
| T-13-06 | T | `readEnemies`/`enemyFactsOf` | mitigated | `src/quests/outcomes/quest-enemies.ts:30-41` (`validQuestEnemiesOf`: ref valido e quantità intera ≥ 1), `level-table.ts:2` (`MAX_XP`), proiezione B-IN-03 con `resolution-loader.service.spec.ts` | |
| T-13-06b | R | esito riproducibile | accepted | piano 13-04 (nessun tiro aggiunto al `ChanceSource`) | Rischio accettato nel piano |
| T-13-07 | T/E | `buildAidQuest` | mitigated | `src/quests/outcomes/aid/aid-quest.ts:94` (la aid non porta `generated`), `quest-enemies.ts:30` | |
| T-13-08 | T | `PlaceholderDungeonResolver` | mitigated | `src/quests/outcomes/dungeon/placeholder-dungeon-resolver.ts:71-78` (`Math.max(0, …)` su consumi e usi), `placeholder-dungeon-resolver.spec.ts` | |
| T-13-08b | I | SDL | accepted | piano 13-07: `DungeonResolver` è classe DI, nessun tipo GraphQL nuovo | Il real boot vieta già `CombatResolver` nello SDL |
| T-13-09 | E | premi della dungeon | mitigated | `src/quests/outcomes/combatant-plan.ts:147` (`NO_REWARDS` se non vittoria), `rewards/quest-rewards.ts:196` | |
| T-13-09b | T | contatori delle tappe | mitigated | `src/quests/outcomes/outcome-plan.ts:126,470` (`input.stages?.cleared ?? null`, calcolato dal server), `combatant-plan.ts:115` | Nessun input client |
| T-13-10 | E | pool nemici, boss, tappe | mitigated | `src/quests/generation/enemy-pool.ts:18` (`enemy.legendary === false`, fail-closed), `generation-rules.ts:33-62` (fasce boss), `dungeon-stages.migrator.ts:186` (`find({ legendary: false })`); `enemy-pool.spec.ts:52` | Un nemico senza flag non entra |
| T-13-10b | D | `composeQuest` | mitigated | `generation-rules.ts:49,51` (`MAX_PACK_UNITS = 8`, `PACK_ATTEMPTS = 20`) | Costo costante per quest |
| T-13-11 | E | `LOOT_POOLS`/`prizesOf` | mitigated | `generated-prizes.ts:63-70` (`TIER_MULTIPLIER` max 25), `:84-118` (legendary solo hero+), `:118,179` (`BOSS_PET_PRIZE_CHANCE = 0.01`), `quest-generator.service.ts:481` (`sellable: false`); `generated-prizes.spec.ts` | Massimi 15 000 rame / 3000 XP |
| T-13-11b | T | testi dei template | accepted | piano 13-11 (testi statici, nessun input client) | `quest-templates.spec.ts` |
| T-13-12 | E/T | tetto 3 per città, scelta città/rango | mitigated | `city-picker.spec.ts`, `city-distribution.spec.ts`, `quest-generator.int-spec.ts:181,197` (mai oltre 3 per città, mai su marker/POI occupati) | |
| T-13-12b | D | `neighboursOf` | accepted | piano 13-12 (O(n²) una volta per corsa su ~167 città) | |
| T-13-13 | T/I | `parseQuestGenerationConfig` | mitigated | `src/config/quest-generation-config.ts:8,44-46` (fail-closed, messaggio senza valore), `quest-generation-config.spec.ts`, `env.validation.spec.ts:191-206`; `grep process\.env\. src` fuori dalle spec: 0 | |
| T-13-14 | T/D | single-flight, POI unico, spam | mitigated | `quest-generator.service.ts:178-185` (`inFlight`), `:321` (E11000 → skip), `quest.model.ts:84-91`; `quest-generator.int-spec.ts:289,369` | |
| T-13-14b | D | POI non componibili | mitigated | `quest-generator.int-spec.ts:411,437` (ciclo terminante, 0 senza nemici) | |
| T-13-15 | T/D | `OutcomeWriter.deliver` | mitigated | `src/quests/outcomes/outcome-writer.service.ts:176-190` (`requestGeneration` in try/catch dopo il commit), `quest-generation-trigger.int-spec.ts` | |
| T-13-16 | E | `generateQuests` | mitigated | `quest-generation.resolver.ts:13-16` (`@Roles(RoleType.innkeeper)`), `test/app.int-spec.ts:114-121`, `quest-generation.resolver.int-spec.ts:118` (FORBIDDEN adventurer e guard) | |
| T-13-16b | R | `generateQuests` | mitigated | `quest-generation.resolver.ts:14` (`@AuditTarget('QuestGeneration', () => null)`), `quest-generation.resolver.int-spec.ts:137` | |
| T-13-17 | T | `ownedPets` | mitigated | `outcome-plan.ts:295-302,420` (`sameId` sullo snapshot, `$set` solo se cambia) | |
| T-13-17b | E | tiro del pet | mitigated | `rewards/quest-rewards.ts:77,184-187` (solo pet a catalogo, `QUEST_PET_WIN_CHANCE = 0.2`, tiro server) | |
| T-13-18 | T | `EnemyLegendary`/`DungeonStages`/`JewelAccessory` Migrator | mitigated | primo boot reale del 2026-11-05: `Nemici: 22 leggendari e 128 ordinari marcati`, `Gioielli: 42 valorizzati` senza WARN, `Dungeon: 40 arricchite a tappe`; conteggi a DB conformi (`BACKEND-NOTES.md` §11 b–c); codice rimosso con `f5d8134` | Chiusa il 2026-11-05 (era deferred) |
| T-13-18b | T | contesto del combattimento | mitigated | `equipment-item.model.ts:20-25` (enum), `quest-combat.int-spec.ts` | Lista malformata ⇒ null |
| T-13-18c | D | boot | mitigated | `quest-maintenance.boot.ts:23-52` (ogni passo in `step()` con try/catch e `describeError`) | |
| T-13-19 | I | segreti nel branch | mitigated | `grep -rnE "mongodb(\+srv)?://[^<\" ]*"` sui `.md` della fase: nessun URI reale; diff `.env.example` solo variabili vuote | `.env` non nel diff |
| T-13-20 | R/T | attribuzione, regressioni | mitigated | `git log origin/develop..HEAD --format=%B \| grep -ciE "co-authored-by\|generated with"` → 0; codice una tantum isolato in `src/quests/maintenance/` | |
| T-13-21 | I | runbook e handoff | mitigated | `BACKEND-NOTES.md` §11: solo placeholder, nessun URI | |
| T-13-21b | T | codice una tantum nella PR | mitigated | rimozione eseguita il 2026-11-05 con `bdbf6bc` (RED) + `f5d8134` (10 file, −1352 righe): resta solo `QuestEnemiesMigrator`; `BACKEND-NOTES.md` §11 d | Chiusa il 2026-11-05 (era transferred) |

## Controlli trasversali

| Comando | Esito |
| --- | --- |
| `grep -rn "process\.env\." src \| grep -v spec` | vuoto: nessun accesso diretto, la config passa dai provider (`src/config/`) |
| `grep -rn "Math\.random" src/quests/generation src/quests/outcomes` | 0 in `generation`; una sola occorrenza in `src/quests/outcomes/chance-source.ts:12`, il `ChanceSource` di produzione (file invariato rispetto a develop) |
| `grep -rn "legendary" src/quests/generation/enemy-pool.ts` | `:18 enemy.legendary === false` (fail-closed) |
| `grep -rn "generateQuests" src --include='*.ts' \| grep -v spec` | solo `quest-generation.resolver.ts:16`, innkeeper con audit; `EXPECTED_INNKEEPER_HANDLERS` (`test/app.int-spec.ts:114-121`) include `QuestGenerationResolver.generateQuests` |
| `git diff origin/develop -- src/schema.gql \| grep -E '^-[^-]'` | due righe `-  enemy: Enemy`, nient'altro |
| migratori una tantum | referenziati solo da `src/quests/maintenance/` (migratori, int-spec, `quest-maintenance.boot.ts`, `quest-maintenance.module.ts`); `OnApplicationBootstrap` in `src/quests/maintenance` solo in `quest-maintenance.boot.ts:11` |
| log in `generation`/`maintenance` | solo id, conteggi, nomi e `describeError`; nessun URI né documento intero |
| trailer vietati nei commit | 0 |
| `QUEST_GENERATION_TARGET`/`QUEST_GENERATION_SWEEP_INTERVAL_MS` | uniche env nuove: `.env.example:87,90` (vuote), `src/config/quest-generation-config.ts`, rifiuto del boot su valori non numerici/fuori range (`env.validation.spec.ts:191-206`) |

## Open

Nessuna.

## Deferred (chiuse il 2026-11-05)

- ~~`T-13-05`~~: chiusa il 2026-11-05 — primo boot reale con 581 missioni e 24 risultati migrati, 0 residui a DB, secondo boot silenzioso (`BACKEND-NOTES.md` §11 b–c).
- ~~`T-13-18`~~: chiusa il 2026-11-05 — 22 leggendari e 128 ordinari, 42 gioielli senza WARN, 40/40 dungeon a tappe; codice rimosso con `f5d8134` (`T-13-21b` chiusa).
