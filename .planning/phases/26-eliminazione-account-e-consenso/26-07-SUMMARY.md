---
phase: 26-eliminazione-account-e-consenso
plan: 07
subsystem: users, account, quests
tags: [account-deletion, started-quest, cancellation, aid]
requires: ["26-05", "26-06"]
provides:
  - "src/account/deletion/account-eraser.ts: ErasureReport.cancelled (CancelledStartedQuest[], compagni rientrati per quest); annullamento delle quest cominciate dentro eraseWithin PRIMA di archiveCurrentOf"
  - "src/account/deletion/account-deletion.module.ts: AccountDeletionModule importa StartedQuestCancelModule"
affects: [26-08, 26-10, 26-12]
tech-stack:
  added: []
  patterns:
    - "candidati letti col driver nativo (forme stringa dell'id comprese) con tipo e feriti, eccezione dell'aid filtrata nell'eraser, canceller chiamato una quest alla volta nella stessa sessione"
key-files:
  created:
    - .planning/phases/26-eliminazione-account-e-consenso/26-07-SUMMARY.md
  modified:
    - src/account/deletion/account-eraser.ts
    - src/account/deletion/account-deletion.module.ts
    - src/account/deletion/account-eraser.int-spec.ts
decisions:
  - "Eccezione D-13 esplicita nell'eraser (`resolvesAsToday`): una aid avviata i cui feriti sono tutti personaggi dell'account non passa dal canceller, anche se un personaggio archiviato dell'account vi è soccorritore segnaposto; la conclude l'archivio come oggi"
  - "Quest candidate lette con `questModel.collection.find` e `{ session }` (driver nativo, come le pulizie del piano 06) proiettando `_id`, `infos.type`, `rescue.characters`"
  - "Ordine: utente → personaggi → quest cominciate → archivio del corrente → resto invariato; `cancelled` raccoglie i risultati non nulli del canceller"
metrics:
  duration: "30 min"
  completed: 2026-11-25
  tasks: 3
  files: 3
---

# Phase 26 Plan 07: quest cominciate annullate prima dell'archivio — Summary

Dentro `AccountEraser.eraseWithin`, subito dopo il calcolo dei personaggi dell'account (corrente e archiviati) e prima di `archiveWithinReporting`, ogni quest effettivamente cominciata con uno di loro registrato si annulla con `cancelStartedQuestWithin`: compagni in città e rimborsati, quest sul tabellone senza registrazioni, nessun segnaposto; il report porta `cancelled` per il push del piano 12. La aid avviata il cui unico ferito è il cancellato resta all'archivio come oggi (D-13, D-14, D-26).

## Commit

| Task | Commit | Subject |
|------|--------|---------|
| 1 RED | 6897498a | test(users): expect started quests cancelled by the account erasure |
| 1 GREEN | 6e72276d | feat(users): cancel started quests before erasing the account |
| 2 test | 77dff83c | test(users): cover the quests the account erasure leaves as today |
| 2 fix | d7b20f97 | fix(users): resolve as today the aid of a deleted only wounded |
| 3 | (questo commit) | docs(phase-26): record plan 07 progress |

## Fallimenti RED

- Task 1: 6 rossi su 20. Boss, enemy, aid col cancellato soccorritore e quest col personaggio archiviato: `status.location` dei compagni ancora sul marker della quest invece del `markerLocation` della città (nessun rientro); report: `cancelled` assente (atteso un elemento per quest); inventario: residui `quests:<id>` (il segnaposto marcato dall'archivio e la registrazione dell'archiviato restavano). Per non far fallire la compilazione di ts-jest sul campo nuovo, il RED leggeva `cancelled` con un cast; il GREEN lo ha sostituito con `report?.cancelled`.
- Task 2: rosso `resolves as today the aid of the deleted only wounded even with an archived rescuer of the account (D-13)` (`concludedAt` atteso NOW, ricevuto null): il predicato del piano 05 trovava la aid tramite il soccorritore archiviato e il Task 1 la annullava. Corretto nel commit `fix` (vedi deviazioni).

## Casi verdi al primo colpo (Task 2) e motivo

- `resolves as today a started aid whose only wounded is the deleted character (D-13)`: il ferito sta in `rescue.characters`, non nelle registrazioni, quindi `startedQuestsWithFilter` non trova la aid; l'archivio toglie il ferito, la conclude a NOW e non libera i soccorritori di una aid avviata (`concludedUnstartedBy`); `cancelled` vuoto, compagni (personaggio, `PendingQuest`, utente) identici.
- `keeps a started aid going when other wounded remain (D-13)`: stesso motivo; l'archivio toglie solo il cancellato e la aid resta aperta.
- `frees only the seat of a quest not started while companions travel (D-13)`: `startedAt` nullo esce dal predicato; l'archivio toglie il posto (`unstartedSeatReleaseOf`); A in viaggio e B sul marker intatti.
- `deletes the guided request and cleans the draft of a story without cancelling anything (D-14)`: la story non comincia mai; richiesta GM cancellata dall'archivio, bozza ripulita dal piano 06, posto non avviato liberato.

## Regressione dell'archivio

`src/characters/deletion/` e `src/quests/outcomes/` senza diff da `9a084248`; `character-deletion.resolver.int-spec.ts`, `character-archiver.int-spec.ts`, `boss-resolution.int-spec.ts`, `aid-rescue.int-spec.ts` verdi senza modifiche (il segnaposto che combatte resta per «Elimina personaggio» e la morte).

## Verifiche

- Integration (`--runInBand`): `account-eraser.int-spec.ts` 20/20 dopo il Task 1; set del Task 2 (eraser + quattro spec dell'archivio e delle risoluzioni) 121/121 in 5 suite dopo il fix.
- `npx tsc --noEmit -p tsconfig.json` 0; prettier ed eslint puliti sui tre file.
- Gate: `cancelStartedQuestWithin(` alla riga 203, `archiveWithinReporting(` alla 223 (dopo); `StartedQuestCancelModule` 2 nel modulo; 7 righe con `D-13`/`D-26` seguite da virgola o parentesi nella spec; i due titoli del Task 2 presenti una volta; `pgrep -fl 'bin/jest'` vuoto.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] eccezione dell'aid aggirata da un soccorritore archiviato dell'account**
- **Found during:** Task 2 (caso aggiunto oltre la lista del piano)
- **Issue:** il piano assumeva che il predicato del piano 05 bastasse a escludere la aid del solo ferito; se però un personaggio archiviato dello stesso account vi è soccorritore (segnaposto), la aid entra fra le candidate e veniva annullata, contro l'eccezione «Si risolve come oggi» di D-13.
- **Fix:** le candidate proiettano `infos.type` e `rescue.characters`; `resolvesAsToday` salta le aid avviate i cui feriti sono tutti personaggi dell'account. L'archivio poi la conclude e la pulizia delle concluse toglie la registrazione dell'archiviato.
- **Files modified:** src/account/deletion/account-eraser.ts
- **Commit:** d7b20f97

### Altre note

- Caso in più nel Task 2: `resolves as today the aid of the deleted only wounded even with an archived rescuer of the account (D-13)` (quello che ha scoperto il difetto).
- La spec registra `City` e `Lore` con `connection.models[name] ?? connection.model(name, schema)`: nel RED il modulo non li portava ancora; nel GREEN arrivano da `StartedQuestCancelModule` e il ramo di riserva non scatta.
- L'inventario del piano 06 è diventato l'helper `expectNothingLeftOf(world)`, usato dal caso originale e da quello nuovo con due quest avviate (una del corrente, una dell'archiviato).
- `World` espone ora anche `storyQuest` (per il caso D-14 della story).
- Prettier riformattava in modo instabile `find<{ _id }>(…)` con il tipo letterale inline: usato un'interfaccia nominata.

## Known Stubs

Nessuno. `AccountEraser` non è ancora chiamato da nessuno (piani 08 e 10, dichiarato dal piano 06).

## Note per i piani successivi

- Piano 12: `report.cancelled` = `{ questId, characterIds }[]` con i soli compagni realmente rientrati (push `startedQuestCancelled`, `characterUpdated` per ognuno, `questUpdated` per la quest); `report.released` resta quello dell'archivio.
- Limite del piano 05 (non toccato qui): la rilettura dentro `cancelStartedQuestWithin` usa `questModel.findOne` con `startedQuestsWithFilter`, che Mongoose casta su ObjectId: una registrazione legacy in forma stringa non viene trovata e il canceller risponde `null` (nessuna scrittura). Le candidate dell'eraser invece la vedono; in quel caso la quest resta all'archivio come prima. Da valutare nel gate se serve il driver nativo anche lì.
- I piani 08/10 che chiamano `eraseWithin` in `connection.transaction` ricevono il report con `cancelled`; azzerarlo in testa al callback per i ritentativi come gli altri campi.

## Self-Check: PASSED

File modificati presenti; commit 6897498a, 6e72276d, 77dff83c, d7b20f97 presenti nella storia.
