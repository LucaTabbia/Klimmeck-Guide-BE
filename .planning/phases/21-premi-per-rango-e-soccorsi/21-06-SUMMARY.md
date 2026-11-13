---
phase: 21-premi-per-rango-e-soccorsi
plan: 06
subsystem: characters
tags: [characters, aid, party, push, tdd]
requires:
  - 21-05
provides:
  - releaseMembersWithin, releaseRegisteredWithin, notifyQuestCancelled e RegisteredReleaseModels in src/quests/party/registered-release.ts (routine di sessione unica per timeout del party e archiviatore)
  - CharacterArchiver.archiveWithinReporting(session, request) che restituisce ArchiveReport { outcome, released }; archiveWithin ne è il wrapper
  - ReleasedRescuers { questId, characterIds } esportato da character-archiver.ts
  - push questCancelled ai soccorritori liberati dopo il commit, dalla cancellazione e dalla morte nel soccorso
affects: [21-08, 21-09, 21-10, 21-14]
tech-stack:
  added: []
  patterns:
    - funzioni libere di sessione con i modelli passati come oggetto (RegisteredReleaseModels) e logger iniettato (Pick<Logger, 'warn'>)
    - raccoglitore dei liberati azzerato all'inizio del callback della transazione, push dopo connection.transaction
key-files:
  created:
    - src/quests/party/registered-release.ts
  modified:
    - src/quests/party/party-timeout.service.ts
    - src/characters/deletion/character-archiver.ts
    - src/characters/deletion/character-archiver.int-spec.ts
    - src/characters/deletion/character-archive.module.ts
    - src/characters/deletion/character-deletion.service.ts
    - src/characters/deletion/character-deletion.module.ts
    - src/characters/deletion/character-deletion.resolver.int-spec.ts
    - src/quests/outcomes/rescue-resolution.service.ts
    - src/quests/outcomes/aid-rescue.int-spec.ts
decisions:
  - "L'archiviatore libera i soccorritori solo delle aid NON avviate che il suo passo conclude (stessa condizione dell'update: nessun altro ferito); l'aid avviata svuotata dall'archivio resta fuori come da RESEARCH Q11"
  - "released contiene solo le aid che hanno liberato almeno un soccorritore: un soccorritore già avviato non produce voci (characterIds vuoti scartati)"
  - "PushModule è un modulo foglia (solo Mongoose, nessuna coda Bull, nessun import di moduli di feature): CharacterDeletionModule lo importa senza forwardRef né cicli"
  - "La morte nel soccorso raccoglie i liberati in un sink su DeathRequest/WoundedStep e li notifica dopo il commit con partyTimeout.notifyCancelled, accanto al push del timeout"
metrics:
  duration: ~15 min
  completed: 2026-11-13
---

# Phase 21 Plan 06: l'archiviatore libera i soccorritori iscritti Summary

Quando l'archivio di un ferito svuota `rescue.characters` e conclude un'aid non avviata, i soccorritori iscritti e non partiti perdono `PendingQuest` e corsia nella stessa transazione con la routine del timeout del party (`releaseRegisteredWithin`), e ricevono `questCancelled` dopo il commit dalla cancellazione e dalla morte nel soccorso.

## Commit

| Task | Commit | Messaggio |
|------|--------|-----------|
| 1 RED | ad062ab0 | test(characters): reproduce the rescuers left registered by the archive |
| 1 GREEN | 7e7866c3 | fix(characters): release the rescuers of an aid closed by the archive |
| 2 RED | 1ab3dc20 | test(characters): pin the quest cancelled push after a deletion |
| 2 GREEN | e3acd343 | feat(characters): notify the rescuers released by an archive |
| 2 deviazione | 9b71fc8d | test(aid): spy the reporting archive in the aborted death case |
| 3 | (questo commit) | docs(phase-21): record plan 06 progress |

## Fallimenti RED attesi

- Task 1, al commit RED: i tre casi nuovi cadono con `TypeError: archiver.archiveWithinReporting is not a function`. Per riprodurre la sonda 1 senza toccare il commit, uno stub temporaneo non committato di `archiveWithinReporting` (wrapper con `released: []`) ha fatto girare i casi sul comportamento di oggi: `releases the registered rescuers of an aid it concludes (D-16, D-27)` rosso su `registeredAdventurers` (aid con `concludedAt` valorizzato ma soccorritore ancora iscritto, come la sonda: `aidRegistered: 1`); `leaves a started rescuer untouched with a warning of ids only (D-27)` rosso sul WARN mai emesso; `keeps an aid with other wounded open and its rescuers registered (D-16)` verde (pinna il comportamento di oggi, nessuna aid conclusa). Stub rimosso con `git checkout` del file prima del GREEN.
- Task 2: `cancels the quest of the rescuers released by a deletion (D-27)` rosso con `push.sent` `[]` invece del `questCancelled(aid)` al token del soccorritore. `sends no push when the deletion releases nobody (D-27)` verde al RED (pinna l'assenza, oggi garantita perché nessuno manda push).

## Cosa è cambiato

- `src/quests/party/registered-release.ts`: `releaseMembersWithin` (ex `releaseMembers`, stessi filtri: solo `PendingQuest` della quest con `startDate` nullo, WARN di soli id sugli avviati), `releaseRegisteredWithin` (rilettura in sessione + svuotamento di `registeredAdventurers`), `notifyQuestCancelled` (ex `notifyCancelled`).
- `PartyTimeoutService`: `releaseRegistered` e `notifyCancelled` delegano (firme pubbliche invariate); `disband` chiama `releaseMembersWithin` coi membri del claim (W4). Nessuna copia della regola.
- `CharacterArchiver`: inietta `PendingQuest`; `releaseQuestsOf` legge `startedAt` e `rescue.characters` delle aid PRIMA dell'update che conclude e, dopo la chiusura, chiama `releaseRegisteredWithin` per le aid non avviate dove il ferito era l'unico (stessa condizione dell'update: ogni voce è l'ObjectId del ferito). Nessun push nell'archiviatore.
- `CharacterDeletionService.archiveCurrentCharacter`: stato `released` azzerato all'inizio del callback (rieseguito sui WriteConflict), `notifyQuestCancelled` per ogni voce DOPO `connection.transaction`; la mutation non cambia risposta.
- `RescueResolutionService.dieWithin` usa `archiveWithinReporting` e spinge i liberati nel sink della richiesta; `resolveRescue` e `timeoutAid` li notificano dopo il commit (`notifyReleased` → `partyTimeout.notifyCancelled`). Oggi questo percorso non libera nessuno (il claim dell'esito conclude o avvia l'aid prima della morte, quindi l'archivio non la ritrova aperta): nessun caso nuovo, int-spec del soccorso verdi.

## Scelta sul PushModule

Letto `src/push/push.module.ts`: modulo foglia, importa solo `MongooseModule.forFeature` (`PushDevice`, `User`), nessuna coda Bull, nessun modulo di feature. `CharacterDeletionModule` lo importa direttamente: nessun ciclo, nessun `forwardRef`. Il boot reale di test (`test/app.int-spec.ts`) resta verde (91).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Spia della morte abortita su `archiveWithinReporting`**
- **Found during:** Task 2
- **Issue:** `aid-rescue.int-spec.ts` › `leaves no side effect when the death aborts the transaction` iniettava l'abort con `jest.spyOn(archiver, 'archiveWithin')`; `dieWithin` ora chiama `archiveWithinReporting`, quindi la spia non scattava e la morte andava a buon fine.
- **Fix:** la spia punta a `archiveWithinReporting` (una riga, stessa asserzione).
- **Files modified:** src/quests/outcomes/aid-rescue.int-spec.ts (fuori da files_modified)
- **Commit:** 9b71fc8d

### Altre note

- Nell'int-spec della cancellazione il device del soccorritore è scritto a mano in `push_devices` (il modulo della cancellazione non esporta `PushService`); `PushTransport` e `PUSH_CONFIG` sostituiti via `overrides` dell'harness. L'ordine «dopo il commit» è provato da un trasporto finto che, nell'istante dell'invio, legge fuori dalla transazione `PendingQuest` e corsia del soccorritore (attese entrambe null).
- Il testo del push `questCancelled` è quello di sempre («Il gruppo non si è formato in tempo…»): il piano chiede lo stesso push del timeout, nessun messaggio nuovo. Da segnalare nell'handoff se l'utente vuole un testo diverso per l'archivio.

## Verifiche

- Unit `src/characters/deletion src/quests/party`: 5 suite / 37; unit `src/characters/deletion src/quests/party src/quests/outcomes`: 42 suite / 741.
- Integration Task 1 (archiver, party-timeout, aid-timeout): 3 suite / 46. Task 2 (deletion resolver, archiver, aid-rescue): 3 suite / 68 dopo la deviazione.
- Non regressione: aid-timeout, party-timeout, boss-resolution, death-acknowledgement, quest-updated.subscription, party-abandon, quest-start: 7 suite / 77. `test/app.int-spec.ts`: 91.
- `npx tsc --noEmit -p tsconfig.json` 0; `src/schema.gql` invariato; eslint e prettier puliti sui file toccati.

## Self-Check: PASSED

- FOUND: src/quests/party/registered-release.ts
- FOUND: ad062ab0, 7e7866c3, 1ab3dc20, e3acd343, 9b71fc8d
