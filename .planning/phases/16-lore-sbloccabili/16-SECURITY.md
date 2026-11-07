---
phase: 16
slug: lore-sbloccabili
audited: 2026-11-07T00:00:00Z
status: secured
asvs_level: 1
block_on: high
branch: feat/16-lore-sbloccabili
head: 4322d82
base: origin/develop (9103440)
threats_total: 48
threats_mitigated: 44
threats_accepted: 2
threats_transferred: 0
threats_open: 0
threats_open_blocking: 0
threats_deferred: 2
open_ids: []
deferred_ids: [T-16-41, T-16-48]
transferred_ids: []
updated: 2026-11-07T00:00:00Z
---

# Audit di sicurezza — Phase 16 «Lore sbloccabili» (BE)

Audit in sola lettura dei blocchi threat model dei piani `16-01`…`16-12` (48 ID `T-16-01`…`T-16-48`, tutti distinti) sul codice FINALE di `feat/16-lore-sbloccabili` a `4322d82`, dopo i fix di `REVIEW-FIX.md` (4 corretti, 5 `not_needed`). Nessun file modificato oltre a questo, nessun commit, nessuna suite lanciata, nessuna lettura di `.env` o dell'ambiente. L'esito verde delle spec è quello registrato in `REVIEW-FIX.md` e `16-VERIFICATION.md`; qui le spec sono verificate per nome e posizione tramite i blocchi dei piani e i controlli trasversali.

Disposizioni: `mitigated` 44, `accepted` 2 (T-16-06, T-16-31), `transferred` 0 (nessuna minaccia BE è di proprietà della FE), `deferred` 2 (T-16-41, T-16-48: passi del boot reale dell'orchestratore), `open` 0.

## Registro delle minacce

| ID | STRIDE | Componente | Disposizione | Evidenza | Nota |
| --- | --- | --- | --- | --- | --- |
| T-16-01 | Information disclosure | `parseLoreConfig` | mitigated | messaggio d'errore fisso senza il valore ricevuto (caso «rejects a study chance outside zero and one without echoing the value»); `process.env.` assente fuori da `src/config/` (drift test) | piano 16-01 |
| T-16-02 | Denial of service | boot | mitigated | valore non valido = boot rifiutato subito da `validateEnv`; vuota = default 0.5; provider con `ConfigService` opzionale (trappola 15-03) | piano 16-01 |
| T-16-03 | Information disclosure | `isVisible`/`visibleRelated` | mitigated | confronto per esadecimale su ogni forma; nessun personaggio = `SEES_NOTHING`; ref non popolati scartati (Pitfall 9); casi pinnati con `toEqual` | piano 16-01 |
| T-16-04 | Tampering (gioco) | `knowledgeAdditionOf` | mitigated | solo add-to-set, mai il set dell'insieme (D-01); liste vuote = nessun operatore (D-14) | piano 16-01 |
| T-16-05 | Information disclosure | `status.knownEnemies` | mitigated | nessun `@Field`: `type CharacterStatus` pinnato per intero in `test/app.int-spec.ts`; la query che lo seleziona è rifiutata (caso D-01) | piano 16-02 |
| T-16-06 | Information disclosure | `characterUpdated` | accepted | la conoscenza viaggia solo sul personaggio già protetto da ownership/ruolo (`EXPECTED_OWNERSHIP_HANDLERS` invariato) | decisione registrata nel piano 16-02 / CONTEXT |
| T-16-07 | Denial of service | `loreUnlocked: [Lore!]!` | mitigated | `dropOrphanResultRefs` scarta le lore orfane prima del filo (caso D-09); default `[]` per i risultati vecchi | piano 16-02 |
| T-16-08 | Tampering | `src/schema.gql` | mitigated | modifica solo dal boot reale, due righe aggiunte e nessuna tolta rispetto a `origin/develop` | piano 16-02 |
| T-16-09 | Tampering (gioco) | `createCharacter` | mitigated | `unlockedLore` calcolato dal server dalla città scelta da `StartingLocationService`; nessun campo d'input nuovo (`CreateCharacterInput` invariato) | piano 16-03 |
| T-16-10 | Elevation (conoscenza) | `ofMarker` | mitigated | solo `markerLocation`, mai `pointsOfInterest` (caso D-05); nessuna cascata oltre region/state (caso D-03) | piano 16-03 |
| T-16-11 | Denial of service | creazione | mitigated | città senza lore o lore orfana → `[]` senza eccezione (casi D-05); lettura fuori dalla transazione come `resolveFor` | piano 16-03 |
| T-16-12 | Tampering | `TravelCompletionService.complete` | mitigated | secondo update solo dopo un `before` (identità valida), nello stesso callback della transazione; caso «writes nothing on a stale completion» | piano 16-04 |
| T-16-13 | Tampering (gioco) | arrivi | mitigated | add-to-set idempotente (caso del secondo arrivo); solo `City.markerLocation` (casi del territorio) | piano 16-04 |
| T-16-14 | Denial of service | completamento/teleport/claim | mitigated | marker senza città → `[]`, movimento intatto (casi D-15); update senza geografia byte-identici (spec invariate) | piano 16-04 |
| T-16-15 | Denial of service (qualità) | coverage di `./src/travel/` | mitigated | un caso int-spec per ogni ramo nuovo (città, territorio, before assente), misurato al gate (D-15) | piano 16-04 |
| T-16-16 | Tampering (gioco) | `planParticipant` | mitigated | conoscenza solo con `won` e nemici (casi D-06: sconfitta nulla); predicato unico per success e gmCompleted | piano 16-05 |
| T-16-17 | Tampering | scrittura dell'esito | mitigated | add-to-set nello stesso update del piano con il filtro di staleness invariato (`status.xp`): un esito concorrente ricalcola tutto al WriteConflict | piano 16-05 |
| T-16-18 | Information disclosure | `knownEnemies` | mitigated | solo l'id esatto del nemico sconfitto (caso del Goblin boss), mai la specie | piano 16-05 |
| T-16-19 | Denial of service | catalogo | mitigated | ref malformati scartati da `victoryKnowledgeOf` (caso D-06), nessuna eccezione | piano 16-05 |
| T-16-20 | Tampering (gioco) | `GmCompletionService` | mitigated | conoscenza dai soli nemici del catalogo della quest, mai dagli override del GM (`victoryKnowledgeOf(catalog)`); senza nemici nulla (caso D-06) | piano 16-06 |
| T-16-21 | Tampering | imboscata | mitigated | add-to-set nello stesso update della vittoria con il filtro d'identità invariato (`ambushFilter` + `status.xp`); sconfitta senza conoscenza | piano 16-06 |
| T-16-22 | Repudiation / integrità | report trattenuto | mitigated | `@Prop` nello snapshot (caso letto a DB); `?? []` per i report vecchi (caso Pitfall 3) | piano 16-06 |
| T-16-23 | Denial of service (qualità) | coverage di `./src/travel/` | mitigated | casi unit e int-spec per vittoria, sconfitta e report senza campo (D-15) | piano 16-06 |
| T-16-24 | Tampering (gioco) | tiro dello studio | mitigated | caso solo dalla porta `ChanceSource` (grep di `Math.random`), clamp dell'indice, gate confrontato con la probabilità validata al boot | piano 16-07 |
| T-16-25 | Tampering | pool dello studio | mitigated | pool filtrato nel piano contro lo snapshot in sessione e le lore dello stesso esito (C-3, Pitfall 6); un WriteConflict riesegue tutto | piano 16-07 |
| T-16-26 | Elevation (conoscenza) | pool | mitigated | solo i `STUDY_LORE_TYPES`: casi int-spec che escludono `city` ed `enemy`; nessuna cascata | piano 16-07 |
| T-16-27 | Denial of service | sequenze di tiri | mitigated | due tiri solo con pool non vuoto e dopo il pet (Pitfall 5): spec esistenti delle sequenze invariate | piano 16-07 |
| T-16-28 | Tampering (gioco) | soccorso | mitigated | geografia solo del marker della città del ritorno (caso «freed where they stand»); add-to-set idempotente | piano 16-07 |
| T-16-29 | Information disclosure | `lore(id)` | mitigated | lore chiusa → stesso `ResourceNotFoundException.lore()` di una inesistente, lanciato prima della query (caso «exactly like a missing one») | piano 16-08 |
| T-16-30 | Information disclosure | percorsi alternativi (`cityShop.city`, `PointOfInterest.city`, lore annidate, `Enemy.relatedLore`) | mitigated | field resolver sul tipo in `LoreVisibilityModule` importato dai moduli che servono `City`, `Enemy`, `Lore`; casi int-spec per ognuno | piano 16-08 |
| T-16-31 | Information disclosure | `Quest.infos.relatedLore` | accepted | decisione D-10: voce del committente, resta intera | decisione registrata nel piano 16-08 / CONTEXT |
| T-16-32 | Spoofing / Elevation | ruolo | mitigated | ruolo dall'identità verificata (`@CurrentUser`), innkeeper solo da `RoleType.innkeeper`; personaggio con `activeCharacterById` (morto in attesa = nessuna vista, D-13) | piano 16-08 |
| T-16-33 | Denial of service | letture per richiesta | mitigated | una lettura del viewer per richiesta (cache `WeakMap`, caso dello spy); `$in` sugli id del solo personaggio | piano 16-08 |
| T-16-34 | Information disclosure | `QuestEnemy.known` | mitigated | risolto dal server per il personaggio attivo del bearer (`activeCharacterById`); id esatto, non specie (caso goblin/goblinBoss) | piano 16-09 |
| T-16-35 | Information disclosure / integrità | cache del viewer sotto WS | mitigated | chiave `rootValue` per evento (caso dei due eventi sullo stesso socket, Pitfall 1) | piano 16-09 |
| T-16-36 | Elevation | superficie GraphQL | mitigated | nessuna operazione nuova: liste `EXPECTED_*_HANDLERS` invariate (grep del diff); SDL con la sola riga `known` | piano 16-09 |
| T-16-37 | Denial of service | letture per voce | mitigated | una lettura per richiesta (caso dello spy) | piano 16-09 |
| T-16-38 | Tampering | `LoreBackfillMigrator` | mitigated | solo add-to-set (grep di assenza del set), solo personaggi attivi (`ACTIVE_CHARACTER_FILTER`), idempotente (caso del secondo giro); nessun esecutore lo lancia contro il DB reale | piano 16-10 |
| T-16-39 | Information disclosure | log del boot | mitigated | soli conteggi (caso del formato fisso); errore con `describeError` senza messaggio (caso `uri-segreta-da-non-loggare`) | piano 16-10 |
| T-16-40 | Denial of service | boot | mitigated | `try/catch` intorno al passo: il boot prosegue (caso dell'errore) | piano 16-10 |
| T-16-41 | Tampering (processo) | ciclo di vita del codice one-off | deferred | modulo importato solo da `AppModule` (caso dei metadati), rimozione in TDD in un piano successivo prima della merge, PR in draft fino ad allora | rimozione in TDD del modulo one-off prima della merge, a carico dell'orchestratore dopo il primo boot reale |
| T-16-42 | Tampering | `src/schema.gql` | mitigated | boot reale e diff contro `origin/develop`: zero righe tolte, tre aggiunte attese | piano 16-11 |
| T-16-43 | Information disclosure | repo e documenti | mitigated | nessun `.env` nel diff, grep di URI Mongo nei `.md` della fase, `.env.example` con la sola `LORE_STUDY_CHANCE=`, nessun `process.env.` fuori da `src/config/` | piano 16-11 |
| T-16-44 | Repudiation | commit | mitigated | grep dei trailer vietati su `origin/develop..HEAD` = 0 | piano 16-11 |
| T-16-45 | Denial of service (qualità) | coverage e harness | mitigated | soglie lette e confrontate senza diff su `coverageThreshold`; ripiego per cartella scritto (Pitfall 12); `LoreBackfillModule` solo in `AppModule` | piano 16-11 |
| T-16-46 | Information disclosure | handoff e dati della UAT | mitigated | soli segnaposto (`<characterId>`, `<twitchId del giocatore>`); variabili del bypass coi soli nomi; grep di URI Mongo = 0; operatori solo in code span | piano 16-12 |
| T-16-47 | Tampering | storico delle decisioni e contratto | mitigated | emendamenti solo in coda (diff senza righe tolte); SDL copiato verbatim da `src/schema.gql` e verificato col grep del verify | piano 16-12 |
| T-16-48 | Elevation (processo) | runbook del backfill | deferred | build prima dello stop (il BE gira da `dist/`), secondo boot a zero come verifica, rimozione in TDD e PR in draft fino ad allora | runbook del backfill: build prima dello stop, secondo boot a zero e rimozione in TDD sono passi del boot reale dell'orchestratore |

## Controlli trasversali

Tutti lanciati dalla radice del repo a `4322d82`.

| Controllo | Comando | Esito |
| --- | --- | --- |
| A, env | `grep -rn "process\.env\." src \| grep -v spec \| grep -v "^src/config/"` | nessuna riga: `process.env.` solo in `src/config/` |
| B, casualità e orologio | `grep -rnE "Math\.random\|Date\.now" src/lore src/quests/outcomes src/migrations \| grep -v spec` | solo `src/quests/outcomes/chance-source.ts:12` (preesistente) |
| C, filtri per viewer | `grep -rn "visibilityOf\|SEES_EVERYTHING\|isVisible\|visibleRelated\|knowsEnemy" src \| grep -v spec` | `src/lore/related-lore.resolvers.ts:27,45,61` (lore, city, enemy); `src/lore/lore.service.ts:32` (`lore(id)` chiusa lancia `ResourceNotFoundException.lore()`, come `:37` per l'inesistente); `src/lore/lore-visibility.ts:41` (senza status = `SEES_NOTHING`); `src/lore/viewer-knowledge.service.ts:84` (innkeeper = `SEES_EVERYTHING`); `src/lore/known-enemies.resolver.ts:21` (`QuestEnemy.known`). `Quest.infos.relatedLore` non filtrata (D-06/D-10, T-16-31). Cache `WeakMap` con chiave `rootValue`-o-context (`viewer-knowledge.service.ts:29-35,47`) |
| D, scritture | `grep -rn "status.unlockedLore\|status.knownEnemies" src \| grep -v spec` | solo `knowledge-addition.ts:14,16` (`$addToSet` con `$each`, mai un set dell'insieme; `:20` lista vuota = `{}`), proiezioni di lettura (`lore-visibility.ts:44-45`, `viewer-knowledge.service.ts:21-22`, `lore-backfill.migrator.ts:58-59`) e letture dello snapshot in `outcome-plan.ts:415-421`, `ambush-plan.ts:333` |
| E, transazioni | lettura di `travel-completion.service.ts:141-155`, `travel.service.ts:174-183`, `character-creation.service.ts:43-46` | arrivo: secondo update con `{ session }` nello stesso callback della transazione, solo dopo un `before` valido; teleport: transazione con geografia letta prima; nascita: reader prima, scrittura con il personaggio; `quest-acceptance.updates.ts:100` e `travel.updates.ts:150` via `knowledgeAdditionOf` |
| F, SDL | `git diff origin/develop -- src/schema.gql \| grep -E '^[-+][^-+]'` | solo tre righe aggiunte: `unlockedLore: [ID!]!`, `known: Boolean!`, `loreUnlocked: [Lore!]!`; nessuna riga tolta, nessun `knownEnemies` (conteggio 0) |
| G, log | `grep -rn "logger\.\(log\|warn\|error\)" src/lore src/quests/outcomes src/migrations src/characters/creation` | `src/lore` senza log; il resto preesistente con id/conteggi/nomi; nuovo: `lore-backfill.boot.ts:15-19` (soli conteggi e `describeError`) |
| H, backfill | `grep -rn "LoreBackfillModule\|lore-backfill" src --include='*.ts' \| grep -v spec \| grep -v "src/migrations/lore-backfill/"` | solo `src/app.module.ts:29,118`; `lore-backfill.boot.ts`: `OnApplicationBootstrap` con `try/catch`, il boot prosegue; idempotente per unione (`$addToSet`) |
| I, trailer | `git log origin/develop..HEAD --format=%B \| grep -ciE "co-authored-by\|generated with\|claude-session"` | 0 |
| J, `.env.example` | `git diff origin/develop --name-only -- .env.example` + diff | solo le righe commento e `LORE_STUDY_CHANCE=` (vuota, nessun segreto) |

## Open

Nessuna.

## Deferred

- T-16-41 — il modulo one-off `LoreBackfillModule` va rimosso in TDD dopo il primo boot reale e prima della merge; la PR resta in draft fino ad allora. Verifica: orchestratore. Oggi il modulo è importato solo da `src/app.module.ts` (controllo H).
- T-16-48 — runbook del backfill (build prima dello stop del BE da `dist/`, secondo boot a zero conteggi, rimozione in TDD). Verifica: boot reale dell'orchestratore.

## Accepted

- T-16-06 — `characterUpdated` trasporta la conoscenza solo sul personaggio già protetto da ownership/ruolo (handler di ownership invariati).
- T-16-31 — `Quest.infos.relatedLore` non filtrata per viewer: decisione D-10 (voce del committente).

## Unregistered flags

Nessuno rilevato.
