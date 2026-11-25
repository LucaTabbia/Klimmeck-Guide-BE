---
phase: 26-eliminazione-account-e-consenso
plan: 13
subsystem: account, quests, auth, test
tags: [gate, account-deletion, legacy-ids, sdl, coverage, invariants]
requires: ["26-12"]
provides:
  - "test/account/account-deletion-flow.int-spec.ts: flusso intero sul filo (consenso → creazione → quest boss cominciata → deleteMyAccount → rientro da zero)"
  - "StartedQuestCanceller: ogni filtro su un riferimento (registrazioni, PendingQuest.quest, corsia, currentCharacter) passa dal driver nativo con la sessione: le forme stringa legacy dell'id sono trovate e gestite"
  - "gate della fase verde e misurato"
affects: [26-14]
tech-stack:
  added: []
  patterns:
    - "filtri su path ObjectId che possono contenere id legacy in forma stringa: driver nativo (`Model.collection`) con `{ session }`, mai il modello (il cast di Mongoose collassa la forma stringa)"
key-files:
  created:
    - test/account/account-deletion-flow.int-spec.ts
  modified:
    - src/quests/party/started-quest-canceller.ts
    - src/quests/party/started-quest-canceller.int-spec.ts
    - src/account/deletion/account-eraser.int-spec.ts
    - src/auth/twitch/twitch-urls.spec.ts
    - src/auth/session/session.model.spec.ts
    - .planning/phases/26-eliminazione-account-e-consenso/26-03-SUMMARY.md
decisions:
  - "Correzione delle forme legacy nel solo canceller (driver nativo per quest, PendingQuest, utente proprietario e aggiornamenti della corsia); la lettura dei compagni per `_id` resta sul modello (gli `_id` dei personaggi sono sempre ObjectId)"
  - "L'update del compagno rientrato passa anch'esso dal driver nativo: lo schema `AssetQuantity` è `_id: false` e nessun modello coinvolto ha timestamp, quindi il documento scritto è lo stesso di prima (le spec esistenti col confronto `toEqual` della borsa restano verdi)"
  - "I due pin di contratto rossi al gate (`TwitchLoginErrorCode`, `SessionRevokeReason`) sono difetti della fase (piani 02 e 03 non li avevano aggiornati): aggiornati con i valori fissati dalle REPO-RULES"
metrics:
  duration: "~75 min"
  completed: 2026-11-25
  tasks: 4
  files: 7
---

# Phase 26 Plan 13: gate della fase — Summary

Prima del gate, correzione ordinata dall'orchestratore (problema aperto del 26-07): `cancelStartedQuestWithin` ora trova e gestisce registrazioni, corsie, `PendingQuest` e proprietari salvati con l'id in forma stringa, così una quest cominciata con una registrazione legacy si annulla per intero invece di finire all'archivio (D-13, D-26). Poi il flusso intero sul filo e il gate: `tsc` 0, unit 326/4867, integration 170 suite in sette blocchi tutti verdi, boot reale e matrice verdi, SDL con le cinque righe attese e nessuna tolta, coverage delle cartelle con soglia sopra soglia, invarianti 1–9 verificati.

## Commit

| Task | Commit | Subject |
|------|--------|---------|
| 0 RED | 1bfffbdf | test(quests): expect started quests with string ids to be cancelled |
| 0 GREEN | 3cc49d29 | fix(quests): cancel a started quest whatever form its ids are stored in |
| 1 | 8afd2396 | test(users): cover the account deletion flow end to end |
| 2 fix | 4166c200 | test(auth): pin the terms refusal and accountDeleted contract values |
| 2 docs | c7859532 | docs(phase-26): keep the Mongo operator of plan 03 in a code span |
| 3 | (questo commit) | docs(phase-26): record plan 13 progress |

## Task 0 (dall'orchestratore): id legacy in forma stringa nel canceller

### Il difetto

`cancelStartedQuestWithin` rileggeva la quest con `questModel.findOne` e `startedQuestsWithFilter`: `registeredAdventurers.character` è un path `MongooseSchema.Types.ObjectId`, quindi Mongoose casta la forma stringa di `idForms` a ObjectId e una registrazione legacy salvata come stringa non viene trovata. Il canceller rispondeva `null` senza scrivere nulla; le candidate dell'eraser (driver nativo) la vedevano, ma la quest cominciata restava all'archivio, contro D-13. Lo stesso cast colpiva, dentro il canceller, `PendingQuest.quest`, `Character.quests.pendingQuest` e `User.currentCharacter` (tre path che in passato erano `Mixed`: `git log -S 'type: Types.ObjectId'` li trova, quindi forme stringa legacy plausibili a DB).

### RED (1bfffbdf)

- `started-quest-canceller.int-spec.ts`, `legacy ids stored as strings`:
  - `cancels a started boss whose registrations are stored as strings (D-13, D-26)`: registrazioni del cancellato C e del compagno A in forma stringa. Rosso: `characterIds` atteso `[A, B]`, ricevuto `[]` (il canceller rispondeva `null`).
  - `cancels a started boss whose lanes, requests and owners point by strings (D-13, D-26)`: corsia, `PendingQuest.quest` e `currentCharacter` di A e di C in forma stringa. Rosso: `characterIds` atteso `[A, B]`, ricevuto `[B]` (A lasciato intatto: la sua `PendingQuest` non trovata dal filtro su `quest`).
  - Entrambi pretendono l'annullamento completo: A e B nella città del marker con corsia libera, rimborsi (borsa 3 razioni e vita 46 per A, punti +30 e +10), le tre `PendingQuest` cancellate, corsia di C azzerata, quest non avviata senza registrazioni.
- `account-eraser.int-spec.ts`: `leaves nothing behind a started quest whose registrations are stored as strings (D-13, D-26)` (registrazioni del corrente cancellato e del compagno A in stringa). Rosso: compagno A ancora sul marker della quest. Pretende rientro, quest sul tabellone, `report.cancelled` con la quest e l'inventario per collection vuoto.

### GREEN (3cc49d29)

In `src/quests/party/started-quest-canceller.ts` ogni filtro su un riferimento passa dal driver nativo con `{ session }`:
- rilettura della quest (`questModel.collection.findOne`);
- spese del tragitto (`pendingQuestModel.collection.findOne` su `quest`);
- rientro del compagno (`characterModel.collection.updateOne` con la guardia della corsia; `sendBackUpdateOf` tipizzato `UpdateFilter` del driver);
- proprietario per il rimborso dei punti (`userModel.collection.findOne` su `currentCharacter`);
- `dropPendingQuestsOf`: ricerca delle `PendingQuest` della quest e azzeramento della corsia col driver nativo.
Boy Scout: i filtri sull'`_id` dei personaggi usano gli ObjectId (prima `idForms`, inutile su un `_id` sempre ObjectId); `activeCharacterById` sostituito da `_id` più `ACTIVE_CHARACTER_FILTER` (il driver non accetta un `_id` stringa).

Verifica: canceller, eraser, resolver della cancellazione e `src/characters/deletion` (integration, `--runInBand`) 5 suite / 128 test verdi; `tsc` 0; prettier ed eslint puliti. `src/characters/deletion/` senza diff da `9a084248` (regola dura 3).

### Dove ho cercato lo stesso punto cieco (codice nuovo della fase)

| Punto | Path filtrato | Esito |
|-------|---------------|-------|
| `AccountEraser.cancelStartedQuestsOf` | `registeredAdventurers.character` | già driver nativo (piano 07) |
| `resolvesAsToday` | `rescue.characters` | confronto in memoria con `sameId`, tollerante |
| `cleanConcludedQuestsOf` | `registeredAdventurers.character`, `rescue.characters` | già driver nativo (piano 06) |
| `deleteResultsOf` / conteggi | `questresults.character`, `user`, `rescuedCharacters` | `deleteMany` sul modello con ObjectId; i conteggi col driver nativo. `QuestResult.character`/`user` non sono mai stati `Mixed` e sono `required` (un `user` ObjectId basta a trovare l'esito): non affetto, segnalato |
| `cleanMissionDraftsOf` | `participants/prizes/backgroundAdditions/fights.outcomes.character` | bozze nate dalla Phase 22, mai `Mixed`, scritte dal modello: non affetto, segnalato |
| `characterIdsOf` | `Character.user` | campo nato in questa fase, scritto solo come ObjectId: non affetto |
| `deleteLaneRequestsOf`, `queuePortraitsOf`, personaggi | `_id` dei personaggi e delle `PendingQuest` | `_id` sempre ObjectId; i riferimenti letti con `refIdOf` (tollerante) |
| sessioni, ticket, device | `userId` | mai `Mixed`, scritti dal modello: non affetto |
| `recordQuestTravelSpendingWithin` (piano 04) | `_id` della `PendingQuest` | `refIdOf` sul riferimento letto: tollerante |
| `StartedQuestCanceller` (tutti i filtri) | quest, `PendingQuest.quest`, corsia, `currentCharacter` | **affetto, corretto** (sopra) |

Fuori dalla fase e non toccato (regola dura 3): `src/characters/deletion/` (archivio) usa a sua volta filtri del modello su `registeredAdventurers.character`; per la cancellazione dell'account non conta più, perché il canceller ora azzera la quest prima dell'archivio, ma «Elimina personaggio» e la morte su una registrazione legacy in stringa restano come prima della fase.

## Task 1: flusso completo sul filo (8afd2396)

`test/account/account-deletion-flow.int-spec.ts`, `describe('account deletion flow (wire)')`, un caso `deletes an account end to end and lets the same Twitch account start again (D-04, D-09, D-13, D-18, D-24)`: start con `termsVersion` → callback → ticket → exchange col client Twitch finto (utente con versione e data del `FixedClock`); `createCharacter` sul filo (documento con `user` = utente); quest boss cominciata col personaggio creato e due compagni (A con cibo e fame annotati); socket aperto; `deleteMyAccount` → `true`; socket chiuso `{ 4409, accountDeleted, acknowledged: true }`; refresh → `SESSION_REVOKED` + `accountDeleted`; utente e personaggio spariti; compagni nella città, corsia libera, `PendingQuest` cancellate, borsa 3 razioni e vita 46 per A, punti +30 e +10; push `startedQuestCancelled` ai due token; quest non avviata senza registrazioni; nuovo login dello stesso Twitch → `me` con id nuovo, 0 punti, nessun personaggio, consenso registrato.

**Verde al primo colpo**, come previsto dal piano: i piani 01–12 hanno costruito ogni pezzo e la correzione del Task 0 non cambia il caso con id ObjectId. Harness: `createCharactersTestApp` con `AccountDeletionModule`, `QuestsModule`, `CharacterCreationModule`, `FixedClock(NOW)` all'ora reale al secondo, fake di directory, push, ritratti, `QUEST_CONFIG` e `RandomSource`.

## Task 2: gate

### 1. Base e tipi

`PHASE_BASE=9a084248`, `git merge-base --is-ancestor 9a084248 HEAD` esce 0. `npx tsc --noEmit -p tsconfig.json` esce 0.

### 2. Unit

`npx jest --selectProjects unit`: primo giro **rosso**, 2 suite / 2 test (`src/auth/twitch/twitch-urls.spec.ts` «exposes the redirect error codes consumed by the app», senza `terms_not_accepted`; `src/auth/session/session.model.spec.ts` «pins the revoke reasons of the contract (D-05)», senza `accountDeleted`). Difetti della fase: i piani 02 e 03 hanno aggiunto i valori del contratto senza aggiornare questi due pin (le loro verifiche giravano solo le spec mirate). RED osservato al gate su `8afd2396`, GREEN `4166c200` (solo i due pin, coi valori fissati dalle REPO-RULES). Rieseguito per intero: **326 suite, 4867 test verdi** (9 s).

### 3. Integration, a blocchi, senza coverage, `--runInBand`, in foreground

| # | Comando | Suite | Test | Tempo |
|---|---------|-------|------|-------|
| 1 | `npx jest src/account test/account --selectProjects integration --runInBand` | 4 | 64 | 27 s |
| 2 | `npx jest src/auth test/auth src/users --selectProjects integration --runInBand` | 24 | 463 | 50 s |
| 3 | `npx jest src/quests/outcomes --selectProjects integration --runInBand` | 17 | 291 | 82 s |
| 4 | `npx jest src/quests --selectProjects integration --runInBand --testPathIgnorePatterns '/src/quests/outcomes/'` | 31 | 670 | 211 s |
| 5 | `npx jest src/characters --selectProjects integration --runInBand` | 30 | 494 | 109 s |
| 6 | `npx jest src/travel --selectProjects integration --runInBand` | 13 | 285 | 79 s |
| 7 | `npx jest --selectProjects integration --runInBand --testPathIgnorePatterns '/src/(account\|auth\|users\|quests\|characters\|travel)/' '/test/(account\|auth)/'` | 55 | 766 | 160 s |

Tutti verdi, `pgrep -fl 'bin/jest'` vuoto dopo ciascuno. Somma delle suite 174 contro `--listTests` = 170 (171 righe, la prima è l'intestazione «Running one project»): i pattern del blocco 2 (`src/auth`, `test/auth`) catturano anche `src/authz/audit/admin-audit.int-spec.ts`, `src/authz/ownership/quest-result-access.int-spec.ts`, `test/authz/authorization-matrix.int-spec.ts`, `test/authz/creature-catalogue.int-spec.ts`, che il blocco 7 non esclude: 4 suite contate due volte. L'unione dei sette elenchi coincide con `--listTests` (`comm -3` vuoto): nessuna suite scoperta. Nessuna spec appesa (trappola 15-03 non scattata).

Nota d'esecuzione: il blocco 4 (211 s) ha superato i 180 s dopo i quali lo strumento sposta da sé il comando in background: è stato lanciato in foreground, ho atteso la notifica di fine senza avviare altri jest nel frattempo; esito letto dall'output.

### 4. Boot reale, matrice e SDL

`npx jest test/app.int-spec.ts test/authz/authorization-matrix.int-spec.ts --selectProjects integration --runInBand`: 2 suite, 255 test verdi. Subito dopo `git diff --exit-code src/schema.gql` esce 0.

`git diff 9a084248 -- src/schema.gql`: 5 righe aggiunte, 0 tolte.

```
+type DeletedAccount {
+  twitchId: String!
+}
+  deleteAccountByTwitchLogin(twitchLogin: String!): DeletedAccount!
+  deleteMyAccount: Boolean!
```

Le due mutation sono nel blocco `type Mutation`, `twitchId: String!` nel blocco `type DeletedAccount`. Campi interni nello SDL (`termsVersion|acceptedTermsVersion|termsAcceptedAt|travelFoodSpent|travelHungerLifeLost|portrait_deletions|vacant`): 0. `user:` nel blocco `type Character`: 0.

### 5. Coverage delle cartelle con soglia

File di produzione toccati dalla fase nelle tre cartelle (`git diff --name-only 9a084248 -- src/auth src/eventsub src/travel | grep -v spec.ts`): `src/auth/auth.module.ts`, `src/auth/guards/auth.guard.ts`, `src/auth/session/deleted-account.registry.ts`, `src/auth/session/session-revocation.service.ts`, `src/auth/session/session-revoke-reason.enum.ts`, `src/auth/session/session.service.ts`, `src/auth/twitch/http-twitch-user-directory.ts`, `src/auth/twitch/oauth-state.service.ts`, `src/auth/twitch/terms-version.ts`, `src/auth/twitch/twitch-auth.controller.ts`, `src/auth/twitch/twitch-login-error-code.enum.ts`, `src/auth/twitch/twitch-login-name.ts`, `src/auth/twitch/twitch-login.service.ts`, `src/auth/twitch/twitch-user-directory.ts`, `src/eventsub/eventsub.module.ts`, `src/eventsub/helix/twitch-app-token.cache.ts`, `src/travel/ambush/ambush-resolution.service.ts`, `src/travel/food/quest-travel-spending.ts`, `src/travel/food/travel-food.sweep.ts`, `src/travel/travel-completion.service.ts`, `src/travel/travel-planning.module.ts`.

Comando per cartella (gate 24-11): `npx jest <cartella> --coverage --coverageThreshold='{}' --collectCoverageFrom='<cartella>/**/*.ts' --collectCoverageFrom='!src/**/*.spec.ts' --collectCoverageFrom='!src/**/*.int-spec.ts' --coverageReporters=json-summary --coverageReporters=text-summary --selectProjects unit integration --runInBand`, poi lettura di `coverage/coverage-summary.json` (cartella ignorata da git).

| Cartella | Soglia (st / br / li) | Misurato | Suite / test | Esito |
|----------|-----------------------|----------|--------------|-------|
| `src/auth` | 97 / 84 / 98 | 99,24 / 87,06 / 99,46 | 43 / 565 | OK |
| `src/eventsub` | 97 / 92 / 97 | 99,40 / 94,31 / 99,49 | 18 / 292 | OK |
| `src/travel` | 97 / 84 / 98 | 98,80 / 87,99 / 99,43 | 40 / 588 | OK |
| `src/account` (senza soglia) | — | 96,73 / 82,38 / 97,15 | 7 / 80 | riportato |
| `src/quests/party` (senza soglia) | — | 93,20 / 81,64 / 95,81 | 8 / 87 | riportato |

`git diff 9a084248 --stat -- package.json | wc -l` = 0. `npm run test:cov` resta all'orchestratore.

### 6. Lint mirato

`git diff --name-only --diff-filter=AM 9a084248 -- '*.ts'` (98 file) passato uno a uno a `npx prettier --check` e `npx eslint` in un ciclo `while read` dentro `bash -c`: **nessun `FAIL`** (0 errori, tutti formattati). Solo warning, tutti preesistenti e già annotati dai piani che hanno toccato quei file: `src/rest/cloudinary/cloudinary.service.ts` 22 (`no-unsafe-*` in `listResources` / `listSubfoldersResources`, righe 59–99; `destroyPortrait` del piano 11 pulito), `src/eventsub/helix/http-twitch-helix.client.spec.ts` 1 e `src/eventsub/helix/twitch-app-token.cache.spec.ts` 1 (`no-base-to-string` su `String(url)`, piano 09), `test/app.int-spec.ts` 1 (`no-base-to-string`, piano 08). Anche questo ciclo (circa 6 minuti) è stato spostato in background dallo strumento dopo 180 s e atteso fino alla fine.

### 7. Invarianti

| Invariante | Controllo | Esito |
|------------|-----------|-------|
| Regola 1, una sola cancellazione | `eraseWithin(` fuori dalle spec: definizione in `account-eraser.ts:137` e una chiamata in `account-deletion.service.ts:84` | OK |
| Regola 2, ordine | `cancelStartedQuestWithin(` riga 235 prima di `archiveWithinReporting(` riga 255 in `account-eraser.ts`; `connection.transaction` in eraser e canceller: 0 file con occorrenze | OK |
| Regola 3, archivio invariato | `git diff 9a084248 --stat -- src/characters/deletion src/quests/outcomes \| wc -l` = 0; blocco 5 (archivio) e blocco 3 verdi senza modifiche | OK |
| Regola 4, inventario | «leaves nothing tied to the deleted account in any collection (D-04, D-14)» verde nel blocco 1, più il nuovo caso con le registrazioni in stringa | OK |
| Regola 5, dopo il commit | `sendToUser\|unsubscribe\|destroy\|flush(` in `account-eraser.ts` = 0 | OK |
| Regola 6, registro dell'oste | `argsOf` nelle 4 righe dopo `@Roles(RoleType.innkeeper)` del resolver = 1 | OK |
| Regola 7, nessuna traccia | `twitchId` in `deleted-account.registry.ts` = 0 | OK |
| Regola 8, consenso | `acceptedTermsVersion` in `users.service.ts` = 3; `git diff 9a084248 -- src/auth/dev/dev-auth.strategy.ts` = 0 righe | OK |
| Regola 9, nessun tiro nuovo | `chance.next(` aggiunti fuori dalle spec = 0 | OK |
| Segnaposto superato | `vacatedAt` in `src` = 0 | OK |
| Autorizzazioni | righe aggiunte in `test/authz/expected-handlers.ts` = 1 | OK |
| Contenuto e migratori | file `.mjs/.json/.yml/.csv/.md` sotto `src test` = 0; file aggiunti con `seed\|content\|migrat` = 0 | OK |
| Ambiente | diff di `.env.example` e `src/config` = 0; `process.env.` aggiunti = 0 | OK |
| Determinismo | `Math.random\|Date.now` aggiunti = 0; `jest.mock(` aggiunti = 0; `setTimeout(` aggiunti fuori dalle spec = 0 | OK |
| Nome utente fuori dai log | `logger.(log\|warn\|error)(` con `twitchLogin\|rawLogin` aggiunti = 0 | OK |
| Trailer e subject | trailer nei commit `9a084248..HEAD` = 0; subject oltre 72 caratteri = 0 | OK |
| Segreti | file `.env*` nel diff = 0; `dist/` = 0 | OK |
| Operatori Mongo nei `.md` | `26-03-SUMMARY.md` riga 18 aveva l'operatore del minimo fuori da un code span: corretto in `c7859532`; le altre righe (26-02 righe 17 e 117, 26-06 riga 76) sono già in code span | OK dopo la correzione |
| Titoli dei test | titoli nuovi con il dollaro = 0 | OK |
| Albero | `git status --short` vuoto; `pgrep -fl 'bin/jest'` vuoto | OK |

### 8. Decisioni e requisiti

| Decisione | Righe aggiunte con `D-NN` nelle spec | Spec d'esempio |
|-----------|--------------------------------------|----------------|
| D-03 | 3 | `src/account/deletion/account-deletion.resolver.int-spec.ts` |
| D-04 | 7 | `src/account/deletion/account-deletion.resolver.int-spec.ts` |
| D-09 | 10 | `src/auth/twitch/twitch-auth.controller.int-spec.ts` |
| D-11 | 6 | `src/models/character/character.model.spec.ts` |
| D-13 | 33 | `src/account/deletion/account-deletion.resolver.int-spec.ts` |
| D-14 | 14 | `src/account/deletion/account-deletion.resolver.int-spec.ts` |
| D-15 | 23 | `src/account/deletion/account-deletion.exception.spec.ts` |
| D-16 | 6 | `src/account/deletion/account-deletion.exception.spec.ts` |
| D-17 | 1 | `src/account/deletion/account-deletion.resolver.int-spec.ts` |
| D-18 | 30 | `src/account/deletion/account-deletion.resolver.int-spec.ts` |
| D-19 | 11 | `src/auth/dev/dev-auth.strategy.int-spec.ts` |
| D-20 | 15 | `src/account/deletion/account-deletion.resolver.int-spec.ts` |
| D-24 | 8 | `src/account/deletion/account-eraser.int-spec.ts` |
| D-25 | 15 | `src/account/deletion/account-deletion.resolver.int-spec.ts` |
| D-26 | 38 | `src/account/deletion/account-deletion.resolver.int-spec.ts` |

Default del ritratto `(portrait default)`: 19 righe. D-06 vive con D-03 e D-18, D-12 con D-19; D-01/D-02/D-05/D-07/D-08/D-10/D-21/D-22/D-23 sono della FE. Nessuna decisione senza caso.

| Requisito | Spec che lo prova |
|-----------|-------------------|
| BE-DEL-01 | `src/models/character/character.model.spec.ts`, `src/characters/creation/character-creation.resolver.int-spec.ts`, `test/account/account-deletion-flow.int-spec.ts` |
| BE-DEL-02 | `src/travel/food/quest-travel-spending.spec.ts`, `src/models/pending-quest.schema.spec.ts`, `src/travel/food/travel-food.sweep.int-spec.ts`, `src/travel/travel-completion.int-spec.ts`, `src/travel/ambush/ambush-resolution.int-spec.ts` |
| BE-DEL-03 | `src/quests/party/started-quest-cancel.spec.ts`, `src/quests/party/started-quest-canceller.int-spec.ts` (compresi gli id legacy), `src/account/deletion/account-eraser.int-spec.ts` |
| BE-DEL-04 | `src/account/deletion/account-eraser.int-spec.ts` (inventario per collection), `src/account/deletion/account-erasure.plan.spec.ts` |
| BE-DEL-05 | `src/account/deletion/account-deletion.resolver.int-spec.ts`, `test/app.int-spec.ts`, `test/account/account-deletion-flow.int-spec.ts` |
| BE-DEL-06 | `src/auth/session/session.service.int-spec.ts`, `src/auth/session/deleted-account.registry.spec.ts`, `src/auth/guards/auth.guard.spec.ts`, `test/auth/session-revocation.int-spec.ts`, `test/auth/http-guard.int-spec.ts`, `src/auth/session/session.model.spec.ts` |
| BE-DEL-07 | `src/auth/twitch/http-twitch-user-directory.spec.ts`, `src/auth/twitch/twitch-login-name.spec.ts`, `src/authz/audit/admin-audit.interceptor.spec.ts`, `src/account/deletion/account-deletion.resolver.int-spec.ts`, `test/authz/authorization-matrix.int-spec.ts` |
| BE-DEL-08 | `src/account/deletion/portrait/portrait-public-id.spec.ts`, `src/account/deletion/portrait/portrait-deletion.service.int-spec.ts`, `src/account/deletion/portrait/portrait-deletion.sweeper.spec.ts`, `src/push/push.service.spec.ts`, `src/account/deletion/account-deletion.resolver.int-spec.ts` |
| BE-DEL-09 (metà gate) | `test/app.int-spec.ts` (boot reale, SDL rigenerato uguale al committato), questo gate; handoff del piano 14 |
| BE-CONSENT-01 | `src/auth/twitch/terms-version.spec.ts`, `src/auth/twitch/oauth-state.service.spec.ts`, `src/auth/twitch/twitch-auth.controller.int-spec.ts`, `src/auth/twitch/twitch-urls.spec.ts` |
| BE-CONSENT-02 | `src/users/users.service.int-spec.ts`, `src/auth/twitch/twitch-auth.controller.int-spec.ts`, `test/auth/login-flow.int-spec.ts`, `src/auth/dev/dev-auth.strategy.int-spec.ts`, `test/account/account-deletion-flow.int-spec.ts` |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug, dall'orchestratore] forme stringa legacy dell'id nel canceller**
- **Found during:** problema aperto del 26-07, ordinato come task in testa al piano
- **Issue / Fix:** sopra (Task 0)
- **Files modified:** `src/quests/party/started-quest-canceller.ts` (+ due spec)
- **Commit:** 1bfffbdf (RED), 3cc49d29 (GREEN)

**2. [Rule 1 - Bug, test] pin di contratto non aggiornati dai piani 02 e 03**
- **Found during:** Task 2, suite unit completa
- **Issue:** `TwitchLoginErrorCode` e `SessionRevokeReason` pinnati con l'elenco di prima della fase
- **Fix:** aggiunti `terms_not_accepted` e `accountDeleted` ai due pin; nessun cambio di codice di produzione
- **Files modified:** `src/auth/twitch/twitch-urls.spec.ts`, `src/auth/session/session.model.spec.ts`
- **Commit:** 4166c200 (il RED è lo stato del ramo a `8afd2396`, osservato al gate)

**3. [Gate, documenti] operatore Mongo fuori da un code span in `26-03-SUMMARY.md`**
- **Commit:** c7859532

### Altre note

- Somma delle suite dei blocchi 174 contro 170 di `--listTests`: 4 suite di `authz` contate due volte (spiegato al punto 3), unione identica all'elenco completo.
- Il blocco 4 è stato spostato in background dallo strumento dopo 180 s (non per scelta): atteso fino alla fine senza altri jest in parallelo.

## Known Stubs

Nessuno.

## Threat Flags

Nessuna superficie nuova: il Task 0 cambia solo come il canceller legge e scrive dentro la transazione esistente.

## Note per il piano 14 e per l'orchestratore

- Il handoff può dichiarare che una quest cominciata con registrazioni, corsie o proprietari legacy in forma stringa si annulla come le altre (provato dalle spec del Task 0).
- Resta fuori dalla fase: l'archivio (`src/characters/deletion/`) usa filtri del modello su `registeredAdventurers.character`, quindi «Elimina personaggio» e la morte non vedono una registrazione legacy in stringa (comportamento di prima della fase, regola dura 3). Da valutare in una fase futura o al boot reale controllando se a DB esistono registrazioni in stringa.
- Al boot reale: i dati di sviluppo senza `Character.user` e gli utenti senza consenso restano dell'orchestratore (D-11, D-24).
## Self-Check: PASSED

Commit 1bfffbdf, 3cc49d29, 8afd2396, 4166c200, c7859532 presenti nella storia del ramo; `test/account/account-deletion-flow.int-spec.ts` presente; `src/characters/deletion/` senza diff da `9a084248`.
