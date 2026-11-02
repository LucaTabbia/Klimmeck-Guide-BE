---
phase: 11-popolamento-del-mondo
audited_at: 2026-11-02
branch: feat/11-popolamento-del-mondo
head: 9b95ba8
base: origin/develop
asvs_level: 1
threats_total: 96
threats_mitigated: 91
threats_partially_mitigated: 3
threats_not_mitigated: 0
threats_accepted: 2
threats_open: 3
unregistered_flags: 0
---

# Audit di sicurezza — Phase 11 «Popolamento del mondo» (BE)

Audit in sola lettura del registro STRIDE dei piani `11-01`…`11-27` (righe `T-11-01`…`T-11-96`) sul branch `feat/11-popolamento-del-mondo` a `9b95ba8`, cioè dopo le correzioni della code review (`REVIEW-FIX.md`: guardie del prune HI-01, controlli dello snapshot ME-03, `PRUNABLE_COLLECTIONS` ristretto ME-04, ricontrollo delle corsie prima della cancellazione LO-07, `assertNoUndefined` nel mapper LO-02). Nessun file sorgente modificato, nessun commit, nessun comando sul database, nessun jest, nessuna lettura di `.env` o dell'ambiente. Le evidenze sono `file:riga` del codice, nomi dei test, report committati in `reports/` e documenti della fase.

## Riepilogo

| Esito | Conteggio |
| --- | --- |
| mitigated | 91 |
| partially mitigated | 3 (`T-11-01`, `T-11-74`, `T-11-86`) |
| not mitigated | 0 |
| accepted by decision | 2 (`T-11-03`, `T-11-52`) |
| **Totale** | **96** |

Disposizioni dichiarate: 94 `mitigate`, 2 `accept`, 0 `transfer`. Le tre righe parziali non sono difetti del codice nel perimetro dei controlli: due dipendono da un'azione esterna al repo BE non ancora fatta (quick task FE e PR in draft), una è un limite Int32 non applicato ai valori derivati dei nemici.

## Invarianti trasversali

| Invariante | Esito | Evidenza |
| --- | --- | --- |
| nessun `process.env.` in `src/` fuori dagli spec | OK | `grep -rn 'process\.env\.' src` senza spec → 0 righe; l'unico accesso in `src/content` è `process.env` passato come oggetto all'entry point (`src/content/run-content.ts:193`), letto per destrutturazione in `connectionOf` (`:59-62`); drift test `src/config/env-example.drift.spec.ts:68` «reads the environment only through config» |
| nessun `.env` nel diff del branch | OK | `git diff --name-only origin/develop \| grep -E '(^\|/)\.env'` → vuoto |
| nessun URI o host Mongo nei documenti della fase, in `content/` e nel runbook | OK (3 falsi positivi) | il grep conta 1 riga in `11-11-PLAN.md:130`, `11-11-SUMMARY.md:65`, `11-RESEARCH.md:629`: tutte citano l'URI di test irraggiungibile `127.0.0.1:1` del test «never prints the connection string» (`src/content/run-content.cli.int-spec.ts:23`), non un URI reale; 0 in `content/`, 0 in `docs/runbooks/content-seeding.md`, 0 nei 10 report JSON di `reports/` |
| il CLI non stampa mai l'URI su errore | OK | `errorReportOf` (`src/content/run-content.ts:149-156`) stampa solo `describeError` = nome e codice (`src/mongo/mongo-errors.ts:21-25`) o il messaggio di `ExportDirNotEmptyError` (cartella locale); `runConnected` (`:158-173`), `runOffline` (`:112-119`) e il `.catch` dell'entry point (`:194-197`) passano tutti da lì; test `run-content.cli.int-spec.ts:216` controlla stdout e stderr (LO-13) |
| `--dry-run`/`--verify` non scrivono mai | OK | `runContent` scrive solo con `canWrite = mode === 'apply' && report.errors.length === 0` (`src/content/sync/content-sync.ts:299-301`); i fix ricevono `fixModeOf` (`:275-278`) e scrivono solo in `apply` (`delete-quests.fix.ts:180-181`, `poi-and-city-fixes.ts:65`, `:92`, `:115`); `checkDatabase`, `findOrphans` e `exportContent` usano solo `find`/`countDocuments` |
| `deleteQuests` e `--prune quests` proteggono le corsie (Pitfall 2) | OK | `planQuest` blocca per `quests.pendingQuest`/`activeStoryQuest`/`activeWorldMissionQuest` (`QUEST_LANES`, `src/quests/acceptance/quest-lanes.ts:11-15`) e per `status.awaitingAid.quest`/`aidQuest` (`delete-quests.fix.ts:24-98`), su entrambe le forme dell'id (`anyIdForm`, `:16-18`); in `apply` ogni quest libera si ripianifica subito prima di scrivere (`applyFreshPlan`, `:122-126`, LO-07); `questresults` solo contati (`:142-149`); il prune quest passa da `deleteQuests` (`content-prune.ts:93-113`) e dal perimetro `ORPHAN_SCOPE` (fisse aperte, `orphans.ts:11-22`); test `delete-quests.fix.int-spec.ts:203` «blocks a quest accepted between planning and writing», `:266` «matches legacy string references when guarding the lanes», `content-prune.int-spec.ts:121` |
| parsing YAML sicuro | OK | `parseDocument` con schema core di default, nessun `customTags`, `uniqueKeys: true` (`src/content/loading/yaml-file.ts:86-90`); `toJS` con `maxAliasCount` di default; `id` valido solo se `typeof id === 'string'` e `/^[0-9a-f]{24}$/` (`yaml-file.ts:35-55`, `src/mongo/document-id.ts:3`); ref con `IdField`/`IdList` (`src/content/schema/common.content.ts:134-160`) |
| argomenti del CLI come insieme chiuso | OK | `PLAIN_MODES`/`VALUE_MODES` chiusi, un token sconosciuto → `null` (`src/content/cli-args.ts:17-18`, `:51-70`); esattamente una modalità e al più un `--content-dir` (`:95-101`); `--prune` solo su `PRUNABLE_COLLECTIONS` (`:72-74`); `--new-id` 1…500 (`:76-80`); `null` → `CONTENT_USAGE` ed exit 2 (`run-content.ts:184-187`) |

## Registro delle minacce

| Threat ID | Categoria | Disposizione | Esito | Evidenza |
| --- | --- | --- | --- | --- |
| T-11-01 | Tampering (contratto) | mitigate | partially mitigated | lato BE chiuso: blocco verbatim `type Lore` nel boot reale (`test/app.int-spec.ts:433`), diff SDL contro `origin/develop` = `-  unlocked: Boolean!` / `+  description: String`; handoff §0/§1 di `BACKEND-NOTES.md` chiede il quick task FE prima della merge. **Aperto:** il FE seleziona ancora `unlocked` (`lib/graphql/queries/lore_queries.dart:9`, `lib/models/lore.dart:12,21,31,41,52,61,73` nel repo FE su `develop`) e la PR BE non esiste ancora (`gh pr list --head feat/11-popolamento-del-mondo` → `[]`), quindi lo stato «draft» non è ancora applicato |
| T-11-02 | Denial of service | mitigate | mitigated | `withoutOrphanRelatedLore` (`src/lore/related-lore.ts:10`) in `lore.service.ts:22,31` e `enemies.service.ts:22,31`; test `src/lore/lore-related.int-spec.ts:116` «drops a related lore that no longer exists instead of failing the list» |
| T-11-03 | Information disclosure | accept | accepted by decision | catalogo di sola lettura senza dati personali; guardia globale invariata (nessun resolver nuovo pubblico) |
| T-11-04 | Elevation of privilege | mitigate | mitigated | `drawLearnableSpell` filtra `minXpToLearn <= xpAfter` e magie non note (`src/quests/outcomes/rewards/quest-rewards.ts:204-223`); pool letto dal server (`resolution-loader.service.ts:544-560`), nessun input client; test `quest-rewards.spec.ts:262` «returns no spell when nothing is learnable (D-31)» |
| T-11-05 | Tampering | mitigate | mitigated | `learnableSpellOf` + `isSpellCandidate` con `isFiniteNumber(minXpToLearn) && isUsageCount(maxUsages)` (`resolution-loader.service.ts:117,138,552-554`) |
| T-11-06 | Repudiation | mitigate | mitigated | la magia sorteggiata confluisce in `spellCandidate` e quindi in `spellLearned` come la fissa (`src/quests/outcomes/outcome-plan.ts:337-342`) |
| T-11-07 | Tampering (contratto) | mitigate | mitigated | `spellDraw` è `@Prop` senza `@Field` (`src/models/quest/quest-prizes.model.ts:41-43`); `grep -c spellDraw src/schema.gql` = 0 |
| T-11-08 | Tampering | mitigate | mitigated | `parseDocument` schema core, nessun tag custom, `uniqueKeys: true` (`yaml-file.ts:86-90`) |
| T-11-09 | Spoofing (id injection) | mitigate | mitigated | `idIssueOf` (`yaml-file.ts:35-55`): id non stringa o non esadecimale a 24 minuscolo → errore con file e riga |
| T-11-10 | Denial of service | mitigate | mitigated | `toJS` senza override di `maxAliasCount` (default della libreria `yaml` ^2.9.1); solo file del repo |
| T-11-11 | Information disclosure | mitigate | mitigated | nessun `process.env` in `src/content` salvo l'entry point che passa l'oggetto (`run-content.ts:193`); drift test `env-example.drift.spec.ts:68` |
| T-11-12 | Tampering | mitigate | mitigated | `validateEntry` con `whitelist` + `forbidNonWhitelisted` (`src/content/schema/validate-entry.ts:47-51`); `IntBetween` con minimi espliciti (`common.content.ts:113-123`) |
| T-11-13 | Spoofing (id injection) | mitigate | mitigated | `IdField`/`IdList`/`NonEmptyIdList` con `IsObjectIdHex` (`common.content.ts:134-160`) |
| T-11-14 | Elevation of privilege | mitigate | mitigated | `FIX_KINDS` chiuso a 4 classi, `kind` sconosciuto → errore (`src/content/schema/fix.content.ts:61-86`) |
| T-11-15 | Tampering | mitigate | mitigated | `CLOUDINARY_URL = /^https:\/\/res\.cloudinary\.com\//` (`common.content.ts:34-43`); `imagePath` di nemici/pet ammette in più solo asset impacchettati `assets/images|pets/<nome>.png` (`:36-57`, LO-05) |
| T-11-16 | Tampering | mitigate | mitigated | `refIssues`/`questRefIssues` (`src/content/checking/check-content.ts:398-442`) su file e snapshot |
| T-11-17 | Elevation of privilege | mitigate | mitigated | `questRuleIssues` (`check-content.ts:805`) con `cityTypeIssues`, `huntPeIssues`, `spellDrawIssues`, `fixedSpellIssues` (`:534-780`); test in `check-quest-rules.spec.ts` |
| T-11-18 | Information disclosure | mitigate | mitigated | grep URI su `content/` (README compreso) = 0 |
| T-11-19 | Tampering | mitigate | mitigated | `runtimeFieldsOnInsert` solo in `setOnInsert` (`src/content/mapping/quest.mapper.ts:25-28,95`); test `quest.mapper.spec.ts:128` «writes runtime fields only on insert (Pitfall 2)» |
| T-11-20 | Tampering | mitigate | mitigated | `cityLoreOp` = `$set` della sola `relatedLore`, senza upsert (`src/content/sync/upsert-ops.ts:16-25`); `cities` fuori da `CONTENT_COLLECTIONS` (`content-tree.ts:16-24`) |
| T-11-21 | Tampering | mitigate | mitigated | `toObjectId` con validazione esadecimale (`src/content/mapping/canonical.ts:19`); test `toBeInstanceOf(ObjectId)` (11-06) |
| T-11-22 | Denial of service | mitigate | mitigated | `assertNoUndefined` su ogni documento mappato (`src/content/mapping/map-content.ts:97`, LO-02) |
| T-11-23 | Tampering (distruttivo) | mitigate | mitigated | guardie sulle tre corsie + `awaitingAid` (`delete-quests.fix.ts:24-98`); `touchedBy` = 0 per un id bloccato (`:100-105`); `questresults` mai toccati (`:141-149`); scritture solo in `apply`, con ripianificazione (`:122-126,180-181`) |
| T-11-24 | Tampering | mitigate | mitigated | `renameCity` scrive solo con filtro `{ _id, name: fix.from }`, altrimenti `blocked` con `foundName` (`poi-and-city-fixes.ts:76-104`) |
| T-11-25 | Elevation of privilege | mitigate | mitigated | `assertValidFix` ripete `fixEntryIssues` prima di eseguire (`src/content/fixes/fix-runner.ts:36-52`); target `IdField` |
| T-11-26 | Denial of service | mitigate | mitigated | `normalizePoiTypes` blocca se resta un tipo fuori `PoiType` (`poi-and-city-fixes.ts:52-74`) |
| T-11-27 | Repudiation | mitigate | mitigated | `FixReport` con `status`, `touched`, `deleted`, `blocked`, conteggi (`src/content/fixes/fix-report.ts:19-32`) |
| T-11-28 | Elevation of privilege | mitigate | mitigated | premi dal config (`src/content/rules/quest-prizes.ts`); rarità del loot entro `dungeonLootRarity` (test `dungeon-quests.spec.ts` «rewards a random item of the band rarity (D-19)»); controllo offline `lootRarityIssues` (`check-content.ts:702`, ME-02) |
| T-11-29 | Denial of service (soft-lock) | mitigate | mitigated | `serviceCoverageIssues` (`check-content.ts:831-855`, LO-08); test `service-quests.spec.ts` «gives every city a heal and a job on its marker (D-17)» e `hunt-quests.spec.ts` «sets hunts to rookie (D-18)» |
| T-11-30 | Tampering | mitigate | mitigated | test `determinism.spec.ts` «reuses the id of an existing quest with the same type and marker (D-01)» e «assigns new ids only to new keys» |
| T-11-31 | Repudiation | mitigate | mitigated | RNG con seme dal config (`seeded-chance.ts`), ordine dei tiri documentato (`fixed-quests.generator.ts:45`, `:238`); test «produces identical output for the same seed» |
| T-11-32 | Tampering (distruttivo) | mitigate | mitigated | nessun `delete*`/`replaceOne`/`$unset` in `content-sync.ts` (solo i nomi del fix) né in `upsert-ops.ts`; `upsertOp` = `$set` + `$setOnInsert` (`upsert-ops.ts:4-14`) |
| T-11-33 | Tampering | mitigate | mitigated | come T-11-19; `upsertOp` mette i campi runtime solo in `$setOnInsert` |
| T-11-34 | Tampering | mitigate | mitigated | `PRUNABLE_COLLECTIONS = ['quests','lore']` (`content-prune.ts:16-19`, ME-04); `pruneCollection` rifiuta con file invalidi, `checkDatabase` in errore, perimetro vuoto, più orfani che voci, divergenze (`:116-147`, HI-01); 11 casi in `content-prune.int-spec.ts` |
| T-11-35 | Tampering | mitigate | mitigated | errori dei file → ritorno prima di ogni lettura/scrittura (`content-sync.ts:287-292`); errori DB → `canWrite` falso (`:299`); test `content-sync.int-spec.ts:243` «writes nothing when a file is invalid (D-28)» |
| T-11-36 | Information disclosure | mitigate | mitigated | `runContent(db, …)` riceve un `Db`, nessun URI nel modulo; report con id, nomi, conteggi |
| T-11-37 | Tampering | mitigate | mitigated | `probableIdDivergence` (`content-sync.ts:252-272`); snapshot di città/POI, `markerLocation` e appartenenza dei POI come errori (`src/content/sync/db-checks.ts:91,177-186`, ME-03) |
| T-11-38 | Information disclosure | mitigate | mitigated | `exportContent` legge solo `CATALOG_COLLECTIONS` + `cities` + `pointsofinterest` (`src/content/export/export-content.ts:19-31,81-93`); le quest non si leggono più (ME-01) |
| T-11-39 | Tampering | mitigate | mitigated | `prepareEmptyDir` lancia `ExportDirNotEmptyError` prima di ogni lettura (`export-content.ts:66-72,281`); test CLI `:201` |
| T-11-40 | Tampering | mitigate | mitigated | l'unica operazione DB del modulo è `find` (`export-content.ts:78`) |
| T-11-41 | Spoofing (id) | mitigate | mitigated | id esadecimali scritti `QUOTE_SINGLE` (`src/content/export/yaml-writer.ts:14,49`); test di ri-parse in `yaml-writer.spec.ts` |
| T-11-42 | Information disclosure | mitigate | mitigated | vedi invariante «il CLI non stampa mai l'URI» |
| T-11-43 | Information disclosure | mitigate | mitigated | `runCli(argv, env, out)`; le modalità offline ritornano prima di leggere `env` (`run-content.ts:181-182`); test `:120` «checks the test tree offline without any environment», `:161` |
| T-11-44 | Tampering | mitigate | mitigated | vedi invariante «argomenti del CLI»; test `:173` |
| T-11-45 | Tampering (distruttivo) | mitigate | mitigated | `--prune` richiede una collezione di `PRUNABLE_COLLECTIONS`; nessun prune in `runContent` |
| T-11-46 | Information disclosure | mitigate | mitigated | grep URI sui report di `reports/` = 0; runbook con solo `node --env-file=<file env>` |
| T-11-47 | Tampering | mitigate | mitigated | report 11-12 solo `export`, `stats`, `verify` (`reports/11-12-*.json`) |
| T-11-48 | Tampering (distruttivo) | mitigate | mitigated | revisione manuale in 11-12; in più `deletedFileQuestIssues` rifiuta un id di `deleteQuests` presente nei file quest (`check-content.ts:857-880`, ME-02) |
| T-11-49 | Information disclosure | mitigate | mitigated | come T-11-38 |
| T-11-50 | Tampering | mitigate | mitigated | `entryIdIssues`/`duplicateIssues` (`check-content.ts:177-282`, LO-10); `--new-id` |
| T-11-51 | Denial of service | mitigate | mitigated | schema `LoreEntry` + ref esistenti in `--check`; populate con scarto orfani (T-11-02) |
| T-11-52 | Information disclosure | accept | accepted by decision | testo di world building dell'utente destinato al gioco |
| T-11-53 | Elevation of privilege | mitigate | mitigated | `IntBetween(0)` sui prezzi e `IntBetween(1)` su `maxUsages` (`src/content/schema/catalog.content.ts:98-108`); `--stats` (`reports/11-12-stats.json`) |
| T-11-54 | Tampering | mitigate | mitigated | 11-14-SUMMARY: solo `content/loot/hunger.yaml` ritoccato fra i file esportati, con commento per voce |
| T-11-55 | Tampering | mitigate | mitigated | `--check` sui ref (`refIssues`) |
| T-11-56 | Tampering | mitigate | mitigated | `--check` a exit 0 per ogni task (11-15-SUMMARY); `--check` finale 0 errori (REVIEW-FIX) |
| T-11-57 | Tampering | mitigate | mitigated | 11-15-SUMMARY: `regni.yaml` +26 righe solo in `relatedLore` |
| T-11-58 | Tampering | mitigate | mitigated | `xpOf`/`lifePointsOf`/danni dal config (`src/content/rules/enemy-stats.ts:45-61`); tabelle nei SUMMARY 11-16 |
| T-11-59 | Denial of service | mitigate | mitigated | `EnemyEntry` con `imagePath`, `locations`, enum e ref verificati da `--check` (`src/content/schema/enemy.content.ts`) |
| T-11-60 | Tampering | mitigate | mitigated | nessun client HTTP in `src/content` (grep `fetch`/`axios`/`http` = 0); fonte `bestiary-stats.md` offline |
| T-11-61 | Tampering | mitigate | mitigated | come T-11-58 (11-17) |
| T-11-62 | Denial of service | mitigate | mitigated | come T-11-59 |
| T-11-63 | Tampering | mitigate | mitigated | come T-11-60 |
| T-11-64 | Tampering | mitigate | mitigated | come T-11-58 (11-18) |
| T-11-65 | Denial of service | mitigate | mitigated | come T-11-59 |
| T-11-66 | Tampering | mitigate | mitigated | come T-11-60 |
| T-11-67 | Elevation of privilege | mitigate | mitigated | `speedModifier` massimo 4 su 13 pet (grep su `content/pets`) |
| T-11-68 | Denial of service | mitigate | mitigated | schema pet con campi non-null, `NotAbove('maxXp')` (LO-11) |
| T-11-69 | Tampering | mitigate | mitigated | Cavallo da viaggio invariato in `content/pets/cavalcature.yaml:4`; voci nuove in `cavalcature-nuove.yaml` |
| T-11-70 | Tampering | mitigate | mitigated | `cityLoreErrors` (`check-content.ts:474`) + id dello snapshot (`snapshotIdIssues`, `:254`) |
| T-11-71 | Tampering | mitigate | mitigated | come T-11-20 |
| T-11-72 | Tampering | mitigate | mitigated | come T-11-70 |
| T-11-73 | Tampering | mitigate | mitigated | come T-11-20 |
| T-11-74 | Tampering | mitigate | partially mitigated | `IntBetween` ≤ `MAX_GRAPHQL_INT` sugli interi di input e sugli override `xp`/`lifePoints` (`common.content.ts:31,113-123`); test `enemy-stats.spec.ts:33` (Tarrasque 155000 PE → xp 21831). **Residuo:** i valori derivati non sono ricontrollati: `pf` è solo `PositiveNumber` senza tetto (`enemy.content.ts:86-87`) e `lifePoints = round(pf × hpScale)` / `power = round(damagePerRound × damageScale)` (`enemy-stats.ts:49,61`) possono superare Int32 con un refuso nei file; i valori reali sono ordini di grandezza sotto il limite |
| T-11-75 | Tampering | mitigate | mitigated | nessuna voce Ettin: l'unica occorrenza è `analog: { name: Ettin … }` del Fomorian (`content/enemies/mostri-b.yaml:111`), un riferimento di scala, non un nemico |
| T-11-76 | Denial of service | mitigate | mitigated | come T-11-59 |
| T-11-77 | Tampering | mitigate | mitigated | `run-generate-quests` riesegue `checkContent` sull'albero scritto e riporta gli errori (ME-02 app, test «reports the errors of the tree it has just written») |
| T-11-78 | Tampering | mitigate | mitigated | test «writes byte-identical files on a second run (D-01)»; LO-01 app rigenerato con id identici |
| T-11-79 | Information disclosure | mitigate | mitigated | `run-generate-quests.ts` importa da `mongodb` solo `ObjectId`, nessun `MongoClient` né `process.env` (solo `process.argv`/`process.exit`) |
| T-11-80 | Tampering (distruttivo) | mitigate | mitigated | 11-24-SUMMARY Task 3: backup `mongodump` dell'utente al checkpoint; `reports/11-24-verify-before.json` prima dell'apply; rollback in `docs/runbooks/content-seeding.md` §Rollback |
| T-11-81 | Tampering | mitigate | mitigated | `verify-before` con `delete-talmvere-test-quests` `blocked`, corsia liberata al checkpoint, `dry-run` e `apply-1` senza `blocked`. Nota: il codice non impedisce le scritture di catalogo quando un fix è `blocked` (solo exit 1); la regola è procedurale |
| T-11-82 | Information disclosure | mitigate | mitigated | grep URI sui report = 0 |
| T-11-83 | Tampering | mitigate | mitigated | `probableIdDivergence: []` in `dry-run`, `apply-1`, `apply-2`, `verify-after`. Nota: `--apply` non rifiuta da sé una divergenza non vuota (il prune sì, `content-prune.ts:66-77`); il cancello è procedurale |
| T-11-84 | Repudiation | mitigate | mitigated | report `11-24-{verify-before,dry-run,apply-1,apply-2,verify-after}.json` committati. Nota: dopo `31cd1ee` (18 titoli e 5 descrizioni) i file non coincidono più col database; serve un nuovo ciclo con report (azioni) |
| T-11-85 | Information disclosure | mitigate | mitigated | grep URI su runbook e `BACKEND-NOTES.md` = 0; solo `<uri>`/`<file env>` |
| T-11-86 | Tampering (contratto FE) | mitigate | partially mitigated | azione FE in testa all'handoff (`BACKEND-NOTES.md` §0 punto 1 e §1, con file e righe); **aperto:** quick task FE non rilasciato e PR BE non ancora aperta in draft (vedi T-11-01) |
| T-11-87 | Tampering (distruttivo) | mitigate | mitigated | runbook: backup e `--verify` come primi passi, `--apply`/`--prune` a backend fermo, rollback con `mongorestore --drop` |
| T-11-88 | Tampering (contratto) | mitigate | mitigated | diff SDL esattamente due righe; blocchi verbatim `type Lore`/`type QuestInfos` (`test/app.int-spec.ts:433,441`) |
| T-11-89 | Information disclosure | mitigate | mitigated | vedi invarianti `.env`, URI e `process.env.` |
| T-11-90 | Repudiation | mitigate | mitigated | 210 commit, nessun trailer `Co-Authored-By`/`Generated with`; l'unica occorrenza del grep è il corpo di `31cd1ee` («Quests regenerated with content:generate-quests…»), un falso positivo già annotato in REVIEW-FIX |
| T-11-91 | Tampering | mitigate | mitigated | soglia `./src/content/` in `package.json:200-204` (statements 92, branches 81, lines 93) |
| T-11-92 | Tampering (contratto) | mitigate | mitigated | blocco `type QuestInfos` con `description: String` + `not.toContain('input QuestInfosInput')` (`test/app.int-spec.ts:441-443`) |
| T-11-93 | Tampering | mitigate | mitigated | confronto con `29de261` (11-27-SUMMARY: `bad: 0`); LO-01 app: stessi id |
| T-11-94 | Tampering | mitigate | mitigated | descrizioni ed esplorazione da `keyedChance` (`fixed-quests.generator.ts:188,583`, `seeded-chance.ts:50`); test `determinism.spec.ts:93` «keeps every main draw when the flavour items change (D-33)» |
| T-11-95 | Tampering | mitigate | mitigated | test `content-wire.int-spec.ts:146` «applies the real content a second time without changes (D-01)» |
| T-11-96 | Information disclosure | mitigate | mitigated | nessun `--env-file` né accesso al DB nel piano; grep URI su `reports/11-27-generate.json` = 0; nessun `process.env.` in `src/` |

## Flag non registrati

Nessuno: le sezioni `## Threat Flags` dei SUMMARY (05–11, 16–19, 24, 25) rimandano tutte a righe del registro. Superficie cambiata dalla review e verificata sotto righe esistenti: `--prune lore` (ME-04, sotto `T-11-34`/`T-11-45`; nessun personaggio riferisce le lore dopo D-25, i `relatedLore` orfani sono scartati da `withoutOrphanRelatedLore`).

## Azioni per l'orchestratore

1. **Prima della merge (T-11-01, T-11-86):** rilasciare il quick task FE che toglie `unlocked` da `lib/graphql/queries/lore_queries.dart:9` e da `lib/models/lore.dart`; aprire la PR BE verso `develop` **in draft** e toglierla dal draft solo dopo il rilascio FE. Fino alla merge il backend che serve il database caricato deve girare dal branch di fase (un BE su `develop` risponde `data: null` su `lores`/`enemys`, handoff §0 punto 4).
2. **Ricarica con report (T-11-84, T-11-80/87):** `31cd1ee` cambia `infos.title` di 18 quest e `infos.description` di 5 (stessi id); il database è allineato ai file di prima. Ciclo del runbook eseguito dall'utente o con `node --env-file` senza stampare nulla dell'env: backup, `--verify` (atteso exit 1 con 23 `modified` in `quests`), `--dry-run`, `--apply` a backend fermo, `--verify` a exit 0; committare i report in `reports/` dopo il grep URI.
3. **Fix già `done` (LO-05):** decidere se ritirare le voci di `content/fixes/` dopo la prossima `--verify` con tutte `done`, per evitare che un cambio legittimo futuro le renda `blocked`.
4. **Irrobustimento facoltativo (T-11-74, residuo basso):** in `checkContent` o nel mapper, un errore se `lifePoints`, `xp` o un `power` derivati superano `MAX_GRAPHQL_INT` (oppure un tetto su `pf` e `damagePerRound`). Da valutare insieme a un rifiuto di `--apply` con `probableIdDivergence` non vuoto (oggi cancello procedurale, T-11-83) e con un fix `blocked` (T-11-81). Nessuno dei tre blocca la fase: il contenuto attuale li rispetta.
