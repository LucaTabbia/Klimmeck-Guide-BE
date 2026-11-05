---
phase: 13-generazione-quest
verified: 2026-11-04T22:15:00Z
status: passed
score: 9/9 success criteria verified (11/11 requisiti BE-QGEN, nessun gap)
overrides_applied: 0
re_verification: false
gaps: []
human_verification:
  - test: "Primo boot reale dal branch (differito, runbook di BACKEND-NOTES.md §11)"
    expected: "Da `feat/13-generazione-quest`: `npm ci`, `npm run build`, riavvio da `dist/`. Log nell'ordine di `QuestMaintenanceBoot`: `Nemici delle missioni: <q> missioni e <r> risultati migrati alla lista` (q circa 581, r circa 24); `Nemici: 22 leggendari e <n> ordinari marcati` (n circa 128); `Gioielli: 42 valorizzati` senza WARN di id mancanti; `Dungeon: <n> arricchite a tappe` (fino a 40); `Generatore: <n> missioni create (target <t>)` (circa 167, t = numero delle città). Poi i conteggi del §11 c (generated aperte circa target; `infos.enemy` e `enemy` dei risultati a 0; `legendary: true` 22; `accessoryUseTypes` array 42). Registrare le righe nel §11 e rimuovere i migratori una tantum (§11 d, commit `refactor(migrations): drop the one-off migrators after their run`) prima della merge"
    why_human: "Tocca il database reale e il processo BE dell'utente (da `dist/`); nessun esecutore della fase può farlo (REPO-RULES). Differita, non bloccante per la verifica"
    outcome: "Eseguito il 2026-11-05 dall'orchestratore: log 581/24, 22/128, 42 senza WARN, 40 dungeon, 167 generate (target 167); conteggi a DB conformi (BACKEND-NOTES.md §11 b–c); migratori una tantum rimossi con f5d8134"
  - test: "UAT su device, differita alla FE Phase 14 (piano 14-11)"
    expected: "Tabellone con quest generate (titolo con nemici e città, annuncio nella voce del committente), `enemies` con quantità nel dettaglio quest e nel risultato, dungeon con `stagesCleared`/`stagesTotal`, eventuale pet ottenuto in `rewards.pet`, gioielli con `accessoryUseTypes`, pannello `generateQuests` per l'oste e `FORBIDDEN` per gli altri"
    why_human: "Esperienza di gioco sul device e sul DB reale dopo il primo boot; fuori dal perimetro della fase BE (nessun checkpoint umano)"
---

# Phase 13: Generazione quest — Verification Report

**Phase Goal:** il tabellone si rifornisce da solo: il server genera e posiziona le quest consumabili `enemy` e `boss` su un POI libero di una città, tetto 3 per città, distribuzione non concentrata, rango meno coperto, nemici dalla zona del POI, premi per fascia e oggetti consigliati; le quest portano più nemici (`infos.enemies`); le dungeon si risolvono a tappe; pet come premio; `accessoryUseTypes` sui gioielli.
**Verified:** 2026-11-04 (branch `feat/13-generazione-quest`, HEAD `c63ec7f`, base `develop` `0585b2e`, 120 commit, 119 file in `src`/`test`)
**Status:** passed (nessun gap; primo boot reale eseguito il 2026-11-05 con esito conforme — `BACKEND-NOTES.md` §11 b–c, migratori una tantum rimossi con `f5d8134`; UAT su device differita alla FE 14-11)
**Re-verification:** No

## Metodo

Sola lettura di codice, spec e `src/schema.gql` contro ROADMAP §Phase 13, REQUIREMENTS BE-QGEN-01..11, REPO-RULES e CONTEXT. Eseguiti: `npx tsc --noEmit -p tsconfig.json` (exit 0); unit mirate su `src/quests/generation`, `src/quests/outcomes/dungeon`, `src/quests/outcomes/rewards`, `src/quests/maintenance`, `src/config`, `src/models` (46 suite / 502 test verdi); integration una alla volta con `--runInBand`: `test/quests/quest-generation.e2e.int-spec.ts` (7/7), `test/quests/quest-generation-access.e2e.int-spec.ts` (4/4), `src/quests/outcomes/quest-dungeon.int-spec.ts` (4/4), `src/quests/outcomes/quest-pet-prize.int-spec.ts` (4/4), `src/quests/maintenance/jewel-accessory.migrator.int-spec.ts` (5/5), `test/app.int-spec.ts` (real boot, 73/73); `git status --short` pulito dopo il real boot (SDL invariato); `pgrep -fl jest` vuoto. Suite completa e coverage non rilanciate: sono il gate 13-19 (334 suite / 4208 test, soglia nuova `./src/quests/generation/`). Nessun accesso a `.env` né al DB reale.

## Success Criteria

| # | Criterio | Stato | Evidenza |
|---|----------|-------|----------|
| 1 | `QuestInfos.enemies` sostituisce `enemy` (populate, `CombatResolver` multi-nemico, `QuestResult`, clone aid, fixture), migrazione idempotente | VERIFIED | SDL: `QuestEnemy { enemy: Enemy!  quantity: Int! }`, `QuestInfos.enemies`, `QuestResult.enemies`; `quest-enemy.model.ts`, `quest-catalog.populate.ts`, `quest-result.populate.ts`, `combat-context.ts`, `aid-quest.ts`, `mixed-ref-paths.ts` (`infos.enemies.enemy`); `quest-enemies.migrator.ts` permanente con lettore tollerante `validQuestEnemiesOf`; fixture aggiornate |
| 2 | Trigger reattivo + sweep periodico e al boot + mutation innkeeper auditata; corsa idempotente, single-flight, RNG iniettato | VERIFIED | `quest-generation-trigger.ts`, `quest-generation.sweeper.ts`, `quest-generator.service.ts`, `seeded-chance.ts`; `generateQuests` con `@Roles(RoleType.innkeeper)` e `@AuditTarget('QuestGeneration', …)`; int-spec «shares one run between concurrent callers (D-17)» e «audits the innkeeper run without auditing the refused calls (D-16)» verdi; env nuove solo `QUEST_GENERATION_TARGET` e `QUEST_GENERATION_SWEEP_INTERVAL_MS` (`quest-generation-config.ts`, spec verde) |
| 3 | Tetto 3 per città (fisse e GM escluse), distribuzione non concentrata, non ogni città ne riceve | VERIFIED | `MAX_GENERATED_PER_CITY = 3` in `city-picker.ts` (peso 0 oltre il tetto, peso decrescente con la densità vicina); e2e: «respects the cap of three generated quests per city (D-15)», «spreads the quests over a 30 city map without concentrating them», «generates only enemy and boss quests and leaves the fixed ones untouched» |
| 4 | `minTitle` = rango meno coperto del mondo; POI libero (marker escluso); nemici dalla zona; boss con posti | VERIFIED | `leastCoveredRank` (parità → rango più basso) su sei ranghi; `RANK_XP_BANDS`; `enemy-pool.ts` (zona del POI + habitat `city`, `all` di riserva); boss: `bossSeatsOf`/`isBossCandidate` con posti in `[MIN_BOSS_SEATS=2, MAX_BOSS_SEATS=6]`, medie 400/1500/4000/6000, `BOSS_SHARE = 0.1`; e2e «never places a generated quest on a city marker or on an occupied poi (D-15)» e «brings the legend rank into the rotation (D-07)» |
| 5 | Premi dalla tabella per fascia, `recommendedLoot` da debolezze e danni, titolo da template | VERIFIED | `generated-prizes.ts`, `recommended-loot.ts`, `quest-templates.ts` (titolo con nemici e città, annuncio da 3 varianti per tipo); spec unit verdi |
| 6 | Integration: tetto, concorrenza, `hunt`/`dungeon` mai generate, distribuzione, `FORBIDDEN`; handoff | VERIFIED | `quest-generation.e2e` 7/7; `quest-generation-access.e2e` 4/4 incl. «never creates two quests on the same poi under two concurrent generators (D-28)» (indice unico parziale sul flag interno) e «refuses an adventurer and a guard with FORBIDDEN»; `BACKEND-NOTES.md` §0-§14 (contratto, mutation, runbook §11) |
| 7 | Dungeon a tappe con `DungeonResolver`, premi solo a fine percorso, `stagesCleared`/`stagesTotal`; 40 fisse arricchite una tantum | VERIFIED | `dungeon-resolver.ts` (porta) e `placeholder-dungeon-resolver.ts`; `quest-dungeon.int-spec.ts` 4/4; SDL `QuestResult.stagesCleared`/`stagesTotal` nullable; `dungeon-stages.migrator.ts` una tantum |
| 8 | `QuestPrizes.pet` / `QuestRewards.pet`: 20% per vincitore, 1% solo boss generati, pool `sellable: false` | VERIFIED | `QUEST_PET_WIN_CHANCE = 0.2` in `quest-rewards.ts`; `BOSS_PET_PRIZE_CHANCE = 0.01` in `generated-prizes.ts` (ordine stabile dei candidati); `quest-pet-prize.int-spec.ts` 4/4 |
| 9 | `EquipmentItem.accessoryUseTypes` su ring/necklace, tabella approvata, nel contesto del `CombatResolver` | VERIFIED | SDL `accessoryUseTypes: [AccessoryUseType!]` e `enum AccessoryUseType { attack defense }`; `combat-context.ts` normalizza fail-closed (solo valori dell'enum, lista malformata → null), projection nel `ResolutionLoader`; `jewel-accessory.migrator.ts`: i 42 `_id` coincidono 1:1 con `13-JEWELS-REVIEW.md` (stato APPROVATA), int-spec 5/5 |

**Score:** 9/9.

## Gate SDL

`git diff origin/develop -- src/schema.gql | grep -E '^-[^-]'` stampa esattamente le due righe `  enemy: Enemy` (`QuestInfos`, `QuestResult`); tutto il resto è additivo.

## Contratto FE (REPO-RULES §Schema GraphQL)

Tutti i nomi sono a schema: `type QuestEnemy { enemy: Enemy!  quantity: Int! }`, `QuestInfos.enemies`, `QuestResult.enemies`, `QuestResult.stagesCleared/stagesTotal`, `QuestPrizes.pet`, `QuestRewards.pet`, `Enemy.legendary: Boolean!`, `enum AccessoryUseType { attack defense }`, `EquipmentItem.accessoryUseTypes`, mutation `generateQuests: GenerateQuestsResult!` con `type GenerateQuestsResult { created: Int! }`; porta `DungeonResolver` in `src/quests/outcomes/dungeon/dungeon-resolver.ts`. Il real boot (`test/app.int-spec.ts`) li asserisce e non riscrive lo SDL.

## Regole di gioco

- Leggendari mai generati: `enemy-pool.ts` ammette solo `legendary === false` (fail-closed: valore assente o non booleano escluso); `Enemy.legendary` seminato da `enemy-legendary.migrator.ts`.
- Nessuna scadenza: `generated-quest-draft.ts` non imposta `startedAt` né `concludedAt` (e2e «keeps generated quests on the board with no expiry (D-14)»).
- Migratori una tantum isolati: `enemy-legendary`, `jewel-accessory`, `dungeon-stages` (+ `dungeon-stages.ts`) sono referenziati solo da `quest-maintenance.boot.ts`, `quest-maintenance.module.ts` e dalle loro stesse spec; `QuestMaintenanceModule` è importato solo da `app.module.ts`. Il runbook (§11 d) elenca file, passi del boot e spec da togliere prima della merge e cosa resta (`QuestEnemiesMigrator`, lettore tollerante).

## Requirements Coverage

| Requisito | Stato | Evidenza |
|-----------|-------|----------|
| BE-QGEN-01 | SATISFIED | SC1 |
| BE-QGEN-02 | SATISFIED | SC2 |
| BE-QGEN-03 | SATISFIED | SC3, leggendari, boss 1 ogni 10 |
| BE-QGEN-04 | SATISFIED | SC3, SC4 |
| BE-QGEN-05 | SATISFIED | SC4 |
| BE-QGEN-06 | SATISFIED | SC5 |
| BE-QGEN-07 | SATISFIED | SC5 (template) |
| BE-QGEN-08 | SATISFIED | SC6 |
| BE-QGEN-09 | SATISFIED | SC7 |
| BE-QGEN-10 | SATISFIED | SC8 |
| BE-QGEN-11 | SATISFIED | SC9 |

Nessun requisito orfano: REQUIREMENTS.md mappa sulla Phase 13 solo BE-QGEN-01..11.

## Anti-pattern

Nessun blocker. Il segnaposto del combattimento e dell'esplorazione delle dungeon è dichiarato PROVVISORIO dell'utente (CONTEXT D-10/D-11), dietro le porte `CombatResolver` e `DungeonResolver`: non è un gap.

## Gaps Summary

Nessun gap. Dei due passi differiti in `human_verification`, il primo boot reale è stato eseguito il 2026-11-05 con esito conforme alle attese (log e conteggi nel §11 b–c del handoff; migratori una tantum rimossi con `f5d8134`); resta la UAT FE 14-11.

---

_Verified: 2026-11-04T22:15:00Z_
_Verifier: Claude (gsd-verifier)_
