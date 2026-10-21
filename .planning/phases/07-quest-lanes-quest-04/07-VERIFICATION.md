---
phase: 07-quest-lanes-quest-04
verified: 2026-10-21T00:00:00Z
status: passed
score: 4/4 criteri di successo ROADMAP verificati (must-haves dei piani 8/8 coerenti)
overrides_applied: 0
deferred:
  - truth: "UAT end-to-end su device: accettare story/worldMission dall'app, vedere la corsia su characterUpdated, countdown ancorato a serverTime"
    addressed_in: "UAT della FE Phase 6 (06-HUMAN-UAT lato FE)"
    evidence: "Richiede la FE Phase 6 (consumatore dello schema) e dati di catalogo oggi assenti a DB (RESEARCH Q4: nessuna story, nessun party). Deferred-by-environment, non gap: ogni verita e provata sul filo dagli int-spec."
human_verification_deferred:
  - test: "Board FE: story + hunt in parallelo, saldo punti, countdown ancorato a serverTime"
    expected: "Due corsie popolate, saldo scalato di requiredPoints, countdown invariato spostando l'orologio del device"
    why_human: "Serve la FE Phase 6 e un device reale"
  - test: "Eleggibilita sui dati reali (scala delle story, party per rango, citta del marker)"
    expected: "Rookie: story rookie ok, story adventurer QUEST_TITLE_MISMATCH; due hero su worldMission con 1 posto hero: QUEST_FULL al secondo; fuori citta: QUEST_NOT_IN_CITY"
    why_human: "I dati vanno preparati a mano dal GM (BACKEND-NOTES §8)"
  - test: "Innkeeper su personaggio altrui dal pannello admin FE"
    expected: "FORBIDDEN, nessun debito, nessun audit"
    why_human: "Il pannello admin e FE"
---

# Phase 7: Quest Lanes (QUEST-04) - Verification

**Goal:** corsie quest parallele: active story/worldMission quest sul Character esposte su schema + subscription, accettazione lane-aware, cost model server-side, countdown pending con timestamp server-side.
**Status:** passed. **Re-verification:** No (verifica iniziale).

## Observable Truths (ROADMAP SC)

| # | Truth | Status | Evidenza |
|---|-------|--------|----------|
| 1 | `Character` espone `activeStoryQuest` e `activeWorldMissionQuest` (PendingQuest opzionali, indipendenti da `pendingQuest`) su schema e payload della subscription | VERIFIED | `character-quests.model.ts`: due `@Prop` ObjectId ref `PendingQuest` default `null` + `@Field(() => PendingQuest, { nullable: true })`; `src/schema.gql` righe 65-66; `character-quests.populate.ts` popola le tre corsie da `QUEST_LANES` (solo `quest._id`) applicato in `characters.service.ts` a `findOne` e `findAll`; `character-quest-lanes.int-spec.ts` prova `character`, `characters` e `characterUpdated` (snapshot + eventi change stream); `accept-quest.resolver.int-spec.ts` prova la corsia popolata su `characterUpdated` dopo `acceptQuest` |
| 2 | Story con `pendingQuest` standard presente riesce; seconda story con una attiva rifiutata (solo la propria corsia blocca) | VERIFIED | `quest-lanes.ts` `laneOf` (story/worldMission/altro->pendingQuest, boss incluso); `laneClaimFilter` richiede `quests.<lane>: null` solo per la propria corsia; `classifyEligibility`/`classifyUnclaimed` -> `QUEST_SLOT_BUSY`; int-spec service: 3 story concorrenti = 1 PendingQuest, 1 debito, 2 `QUEST_SLOT_BUSY` (`describe('concurrency (SC2/SC3)')`) |
| 3 | story/worldMission debitano `User.twitchPoints` (`requiredPoints`), nessuna quest debita `Character.coins`; eleggibilita e debito server-side, non sovrascrivibili dal client | VERIFIED | `pointsCostOf` (standard = 0, invalido = `QUEST_NOT_ACCEPTABLE` con WARN col solo id) + `wallet.debitUserPoints(ownerId, cost, session)` nella stessa `connection.transaction` (`$inc` condizionato `twitchPoints >= amount`, `INSUFFICIENT_POINTS`); `grep coins\|$inc src/quests` (esclusi spec) = 0 occorrenze; `AcceptQuestRequest { id, questId }` non porta ne corsia ne costo; citta del marker (`locationInQuestCity`, fail-closed), titolo (`meetsTitle`, esatto per story), non ripetibilita (`isRepeatable`/`alreadyTaken`), capienza per rango con `$expr` atomico nel filtro di registrazione (`registrationFilter`); matrice D-19 e concorrenza (1 hero su 1 slot) nel service int-spec; owner-only: `@OwnsCharacter(..., { ownerOnly: true })` |
| 4 | `pendingQuest` emesso con `startDate` + `waitingTime` server-side | VERIFIED | Service: `startDate: new Date()` lato server, `waitingTime: waitingTimeOf(lane, timeToComplete)` (0 per story/worldMission, `timeToComplete ?? 0` standard), non accettati dal client; `serverTime: DateTime!` autenticata (`ServerTimeResolver` via `Clock`, `ServerTimeModule` in `AppModule`) per l'offset del countdown; `server-time.int-spec.ts` (ISO 8601 entro 5 s, UNAUTHENTICATED senza bearer) |

**Score:** 4/4

## Must-haves dei PLAN (controllo sul codice, non sui SUMMARY)

| Piano | Esito | Evidenza |
|-------|-------|----------|
| 07-01 contratto dati | OK | `pointsSpent` Int default 0; `QuestPartySlot` (`party` default `[]`); `QuestRegistration` interno con `@Prop` senza `@Field`; fixture `buildQuest` aggiornata; `quest-lanes.schema.spec.ts` verde |
| 07-02 regole pure | OK | `quest-lanes.ts`, `quest-eligibility.ts` (TITLE_RANK, MAX_QUEST_POINTS 2147483647, `capacityRuleOf` slot esatti, legacy totale/illimitata), `quest-acceptance.updates.ts` (partono da `activeCharacterById`, `idForms`), 5 nuovi `GameRuleErrorCode` con factory e messaggi italiani |
| 07-03 populate | OK | `CHARACTER_QUESTS_POPULATE` con `QUEST_LANES.map(lanePathOf)` + `completedQuests` select `_id`; `PendingQuest`/`Quest` registrati in `CharactersModule` e nell'harness; helper `primeCharactersChangeStream` condiviso |
| 07-04 autorizzazione | OK | `ownerOnly` in `OwnershipRule` e passato da `ownership.guard.ts` (`{ ownerOnly: rule.ownerOnly }`); ramo innkeeper in `character-access.policy.ts` condizionato a `!options.ownerOnly`; `readOwnPendingQuestIds` sulle tre corsie |
| 07-05 serverTime | OK | resolver, modulo con `Clock`/`SystemClock` locale, montato in `app.module.ts`; nessun `@Public` nuovo (8 = 8 di `origin/develop`, esclusi gli spec) |
| 07-06 service | OK | claim -> registrazione -> insert `PendingQuest` -> `debitUserPoints(ownerId, cost, session)` in una transazione; pre-letture lean; `City` in `forFeature`; rifiuti senza scritture |
| 07-07 superficie GraphQL | OK | `AcceptQuestRequest`, `QuestAcceptanceResolver.acceptQuest` (risposta `Missione accettata`), `AuthzModule` importato; `test/app.int-spec.ts` enumera `EXPECTED_OWNER_ONLY_HANDLERS = ['QuestAcceptanceResolver.acceptQuest']` e asserisce i divieti sullo schema |
| 07-08 gate e handoff | OK | `BACKEND-NOTES.md` (§0-§11) coerente con il codice: SDL, codici, populate, serverTime, emendamento QUEST-05, dati UAT §8; `07-VALIDATION.md` `nyquist_compliant: true`, `wave_0_complete: true`, 17/17 righe green |

## Schema (src/schema.gql vs origin/develop)

- `git diff origin/develop -- src/schema.gql`: solo righe `+` (nessuna `-`): `input AcceptQuestRequest`, `activeStoryQuest`, `activeWorldMissionQuest`, `acceptQuest`, `pointsSpent: Int!`, `serverTime: DateTime!`, `type QuestPartySlot`, `party: [QuestPartySlot!]!`. Diff additivo.
- Occorrenze di `registrations|QuestAcceptance|INSUFFICIENT_FUNDS|twitchPointsDebit` nel diff dello schema: 0.
- Working tree pulito (`git status --short` vuoto): lo schema committato coincide con quello rigenerato dal real boot.

## Spot-check comportamentali (eseguiti in questa verifica)

| Check | Risultato |
|-------|-----------|
| `npx jest src/quests src/gameRules src/authz src/time src/characters src/models test/fixtures --selectProjects unit` | 32 suite / 455 test passed |
| `npx jest src/quests/acceptance src/characters/character-quest-lanes.int-spec.ts src/pendingQuests src/time test/app.int-spec.ts --selectProjects integration --runInBand` | 6 suite / 101 test passed |
| `npm run build` | exit 0 |
| `grep coins\|$inc` in `src/quests` (non-spec) | nessuna occorrenza |
| Dipendenze (`git diff origin/develop -- package.json`) | vuoto |
| TODO/FIXME/stub in `src/quests`, `src/time`, `character-quests.populate.ts` | nessuno |
| Suite complete (unit 85 / 1259, integration 49 / 606) e lint filtrato | eseguite dal piano 07-08 (SUMMARY), non rilanciate qui; i sottoinsiemi di fase sono stati rieseguiti e sono verdi |

## Data-flow (livello 4)

La corsia fluisce da `accept()` (insert reale di `PendingQuest` + `$set` della corsia nel Character) al populate in `findOne`/`findAll` e al change stream di `characterUpdated`; il debito fluisce a `User.twitchPoints` tramite l'unico scrittore `WalletService`. Nessun valore statico o prop vuota: provato dagli int-spec sul filo.

## Tracciabilita requisiti

| Requisito | Piani | Stato | Evidenza |
|-----------|-------|-------|----------|
| BE-QUEST-01 (corsie su schema + subscription) | 01, 03, 07, 08 | SATISFIED | SC1; REQUIREMENTS.md `[x]` + `\| BE-QUEST-01 \| Phase 7 \| Complete \|` |
| BE-QUEST-02 (accettazione lane-aware) | 02, 04, 06, 07, 08 | SATISFIED | SC2; `[x]` + `Phase 7 \| Complete` |
| BE-QUEST-03 (cost model server-side, emendato: nessuna moneta) | 01, 02, 04, 06, 07, 08 | SATISFIED | SC3; `[x]`, nota di emendamento 2026-10-21 presente, `Phase 7 \| Complete` |
| BE-QUEST-04 (startDate + waitingTime server-side) | 02, 05, 06, 07, 08 | SATISFIED | SC4; `[x]` + `Phase 7 \| Complete` |

Nessun requisito orfano: i quattro ID mappati a Phase 7 compaiono tutti nei frontmatter dei PLAN. Nota: la riga principale di BE-QUEST-03 in REQUIREMENTS.md conserva il testo originale ("le altre debitano `Character.coins`"), ma e seguita dalla nota di emendamento che lo supera; il codice non debita mai monete.

## Anti-pattern

Nessuno bloccante. Il WARN di `costOrReject` registra solo id quest e corsia. Le modifiche di formattazione Prettier nei modelli toccati sono rumore dichiarato (Boy Scout), senza effetto sul contratto.

## Human verification (differita)

Non c'e nulla che richieda un umano per stabilire la correttezza oggi: ogni must-have e criterio di successo e provato dal codice e dai test automatici. La UAT end-to-end e rinviata alla UAT della FE Phase 6.

### 1. Board su device (story + hunt in parallelo)
**Test:** BE locale + device (`adb reverse tcp:3000`), login con utente con `twitchPoints` sufficienti, accettare una story e una hunt; poi spostare l'orologio del device di qualche minuto.
**Expected:** due corsie popolate su `characterUpdated`, saldo scalato di `requiredPoints` su `userUpdated`, countdown non alterato (ancorato a `serverTime`).
**Why human:** serve la FE Phase 6 e un device reale.

### 2. Eleggibilita su dati reali
**Test:** preparare a DB (BACKEND-NOTES §8) 5 story con `requiredPoints` > 0 e `minTitle` rookie..hero, una worldMission con `requiredPoints` e `party` (es. `[{ title: 'hero', count: 5 }, { title: 'paladin', count: 4 }]`), un boss con `party`; `markerLocation` di ogni quest fra i `pointsOfInterest` di una citta. Con un rookie: story rookie ok, story adventurer `QUEST_TITLE_MISMATCH`; con due hero su una worldMission a 1 posto hero: `QUEST_FULL` al secondo; fuori dalla citta del marker: `QUEST_NOT_IN_CITY`.
**Why human:** il catalogo di sviluppo ha 4 quest, nessuna story, nessun party; nessun admin CRUD in milestone.

### 3. Innkeeper su personaggio altrui dal pannello admin
**Test:** login come innkeeper, `acceptQuest` su un personaggio altrui.
**Expected:** `FORBIDDEN`, nessun debito, nessun audit.
**Why human:** il pannello admin che lo rende possibile e FE.

## Gaps Summary

Nessun gap. Promemoria per l'orchestratore (non gap di codice): la casella della Phase 7 nell'elenco fasi di ROADMAP.md (riga 23) e ancora `[ ]`; va marcata completa al commit di chiusura fase.

---

_Verified: 2026-10-21T00:00:00Z_
_Verifier: Claude (gsd-verifier)_
